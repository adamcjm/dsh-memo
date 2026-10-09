// dsh-memo — host 半侧
//
// 职责：
//   1. 本地 SQLite（node:sqlite，零依赖）作为读写引擎与索引
//   2. 文本事实源：每条备忘一个 notes/YYYY-MM/<id>.md（带 YAML frontmatter）
//   3. 附件：内容哈希（sha256）落盘到 attachments/<前2位>/<sha>.<ext>，天然去重
//   4. Git 同步：文本层推送到 GitHub 私有仓库；每日 SQLite 紧凑快照
//   5. 给浏览器半侧提供 /memo/api/* 与 /memo/attach/* 路由
//
// 设计取舍：v1 的正文检索用 LIKE 子串匹配而不是 FTS5。原因是 SQLite 的
// trigram 分词器要求查询词 >= 3 字符，而中文最常用的检索词恰恰是两字
// （"扫码"、"登录"），会静默返回空结果。备忘录量级（数千条）下 LIKE
// 全表扫描在毫秒级，正确性优先。memo_fts 表结构预留，量级上来可切换。
import { DatabaseSync } from 'node:sqlite'
import { mkdir, readFile, writeFile, readdir, unlink, stat, chmod } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join, extname, dirname } from 'node:path'
import { homedir } from 'node:os'
import { createHash, randomUUID } from 'node:crypto'
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const name = 'dsh-memo'
export const inject = ['webServer']

/**
 * 热插拔时跨实例共享的路由 disposer。
 *
 * 运行时启停 / patch 热重载会再次执行 apply(true)，而 webserver 对同一 (kind, path)
 * 只允许一条路由，晚到者会抛 "webserver: duplicate prefix route"。这里把最新一份
 * disposer 挂在 globalThis 上（模块本身可能在 HMR 中被重新加载成新的模块实例，
 * 所以用 Symbol.for 取回同一个 holder 对象），新实例注册前先让出旧实例残留的路由。
 */
const ROUTES_HOLDER = (() => {
  const key = Symbol.for('@adamcjm/dsh-memo/route-disposers')
  if (globalThis[key] === undefined) globalThis[key] = { value: undefined }
  return globalThis[key]
})()

/** 释放上一实例残留的路由（幂等；旧实例清理失败不应阻断新实例）。 */
function disposeRoutes() {
  const dispose = ROUTES_HOLDER.value
  if (typeof dispose !== 'function') return
  ROUTES_HOLDER.value = undefined
  try { dispose() } catch { /* 旧实例已被拆掉，忽略 */ }
}

const API_PREFIX = '/memo/api'
const ATTACH_PREFIX = '/memo/attach'
const MAX_ATTACH_BYTES = 12 * 1024 * 1024
const DEFAULT_TAGS = ['需求变更', '待办', '跟进', '灵感', '会议']

/* ------------------------------------------------------------------ *
 * 工具
 * ------------------------------------------------------------------ */

/** 时间有序 ID：毫秒时间戳(16进制,11位) + 12位随机，字典序 = 创建序。 */
function makeId() {
  const ts = Date.now().toString(16).padStart(11, '0')
  const rand = randomUUID().replace(/-/g, '').slice(0, 12)
  return (ts + rand).toUpperCase()
}

function nowIso() {
  const d = new Date()
  const pad = (n, w = 2) => String(n).padStart(w, '0')
  const off = -d.getTimezoneOffset()
  const sign = off >= 0 ? '+' : '-'
  const abs = Math.abs(off)
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  )
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

/**
 * #标签 识别规则（必须与 lib/client.js 的 extractTagsFrom 保持一致）。
 * - 前缀：行首，或任意非 `A-Za-z0-9_#` 的字符。所以 `买牛奶#购物`、`（#购物）`、`，#购物`
 *   都能识别（中文里不习惯打空格）；而 `C#`、`issue#12` 这类不会误判成标签。
 * - 名字：最长 24 个字符，在空白、`#` 或中英文标点处结束。
 */
const TAG_INLINE = /(^|[^A-Za-z0-9_#])#([^\s#]{1,24})/g
const TAG_CUT = /[，。！？、；：""''（）()【】\[\]{}《》〈〉「」『』,.!?;:'"·|/\\]/

/** 去掉标签名后面的标点，得到真正的标签名（`购物，记得` → `购物`）。 */
function cleanTagName(raw) {
  return String(raw).split(TAG_CUT)[0].trim()
}

/** 把正文里出现的 #标签 抽出来（去重、保序）。 */
function extractTags(body) {
  const out = []
  const text = String(body == null ? '' : body)
  const re = new RegExp(TAG_INLINE.source, 'g')
  let m
  while ((m = re.exec(text)) !== null) {
    const t = cleanTagName(m[2])
    if (t.length > 0 && !out.includes(t)) out.push(t)
  }
  return out
}

/** 去掉正文里的 #标签 记号，得到"干净正文"（标签单独存在 memo_tag 里）。 */
function stripTags(body) {
  const text = String(body == null ? '' : body)
  const re = new RegExp(TAG_INLINE.source, 'g')
  return text
    .replace(re, (_full, pre, raw) => {
      const name = cleanTagName(raw)
      // 只删标签名本身，标签后面的标点与正文照旧保留（不吞掉后文）
      return pre + raw.slice(name.length)
    })
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

const EXT_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
  'image/svg+xml': '.svg',
}

function json(res, status, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

async function readJsonBody(req, limit = MAX_ATTACH_BYTES * 2) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw new Error('request body too large')
    chunks.push(chunk)
  }
  if (size === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/* ------------------------------------------------------------------ *
 * YAML frontmatter（只覆盖我们自己的固定字段，不引入 yaml 依赖）
 * ------------------------------------------------------------------ */

function yamlScalar(v) {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'boolean' || typeof v === 'number') return String(v)
  const s = String(v)
  if (s === '' || /[:#\-?*&!|>'"%@`\[\]{}]/.test(s) || /^\s|\s$/.test(s)) {
    return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'
  }
  return s
}

function yamlParseScalar(raw) {
  const s = raw.trim()
  if (s === 'null' || s === '~' || s === '') return null
  if (s === 'true') return true
  if (s === 'false') return false
  if (/^-?\d+$/.test(s)) return Number(s)
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1, -1).trim()
    if (inner === '') return []
    return inner.split(',').map((x) => yamlParseScalar(x))
  }
  return s
}

/** 序列化一条备忘为 Markdown 文本（事实源格式）。入参是 item（camelCase）。 */
function memoToMarkdown(memo, tags, attachments) {
  const lines = ['---']
  lines.push(`id: ${memo.id}`)
  lines.push(`created: ${memo.createdAt || nowIso()}`)
  lines.push(`updated: ${memo.updatedAt || nowIso()}`)
  lines.push(`done: ${memo.done ? 'true' : 'false'}`)
  if (memo.pinned) lines.push('pinned: true')
  if (tags.length > 0) lines.push(`tags: [${tags.map(yamlScalar).join(', ')}]`)
  if (memo.source) lines.push(`source: ${yamlScalar(memo.source)}`)
  if (memo.dueAt) lines.push(`due: ${memo.dueAt}`)
  if (attachments.length > 0) {
    lines.push('attachments:')
    for (const a of attachments) {
      lines.push(`  - sha256: ${a.sha256}`)
      lines.push(`    name: ${yamlScalar(a.name || '')}`)
      lines.push(`    mime: ${a.mime}`)
    }
  }
  if (memo.deletedAt) lines.push(`deleted: ${memo.deletedAt}`)
  lines.push('---', '')
  lines.push(memo.body)
  lines.push('')
  for (const a of attachments) {
    if (!a.rel) continue
    lines.push(`![${a.name || 'image'}](${a.rel})`)
    lines.push('')
  }
  return lines.join('\n')
}

/** 解析 Markdown 事实源回结构化数据。 */
function markdownToMemo(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text)
  if (!m) return null
  const fmRaw = m[1]
  let body = m[2] || ''
  const out = { attachments: [] }
  let inAttach = false
  let cur = null
  for (const line of fmRaw.split(/\r?\n/)) {
    if (/^\s+-\s+sha256:/.test(line)) {
      inAttach = true
      cur = { sha256: line.split('sha256:')[1].trim() }
      out.attachments.push(cur)
      continue
    }
    if (inAttach && /^\s+name:/.test(line)) { if (cur) cur.name = yamlParseScalar(line.split('name:')[1]); continue }
    if (inAttach && /^\s+mime:/.test(line)) { if (cur) cur.mime = yamlParseScalar(line.split('mime:')[1]); continue }
    if (/^\s/.test(line)) continue
    inAttach = false
    const idx = line.indexOf(':')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1)
    if (key === 'tags') out.tags = /** @type {string[]} */ (yamlParseScalar(val)) || []
    else if (key === 'id') out.id = yamlParseScalar(val)
    else if (key === 'created') out.created_at = yamlParseScalar(val)
    else if (key === 'updated') out.updated_at = yamlParseScalar(val)
    else if (key === 'done') out.done = yamlParseScalar(val)
    else if (key === 'pinned') out.pinned = yamlParseScalar(val)
    else if (key === 'source') out.source = yamlParseScalar(val)
    else if (key === 'due') out.due_at = yamlParseScalar(val)
    else if (key === 'deleted') out.deleted_at = yamlParseScalar(val)
  }
  // 去掉末尾的图片引用行，它们是展示用的，不是正文
  body = body.replace(/!\[[^\]]*\]\([^)]*\)\s*$/g, '').trim()
  out.body = body
  return out
}

/* ------------------------------------------------------------------ *
 * 存储层
 * ------------------------------------------------------------------ */

class MemoStore {
  constructor(root, log) {
    this.root = root
    this.log = log
    this.db = null
    this.notesDir = join(root, 'notes')
    this.attachDir = join(root, 'attachments')
    this.snapDir = join(root, 'snapshots')
  }

  async init() {
    for (const d of [this.root, this.notesDir, this.attachDir, this.snapDir, join(this.root, 'log')]) {
      await mkdir(d, { recursive: true })
    }
    const dbPath = join(this.root, 'memo.db')
    this.db = new DatabaseSync(dbPath)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA foreign_keys = ON')
    this.migrate()
    await this.seedTags()
    await this.writeGitignore()
    return dbPath
  }

  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memo (
        id         TEXT PRIMARY KEY,
        body       TEXT NOT NULL DEFAULT '',
        done       INTEGER NOT NULL DEFAULT 0,
        pinned     INTEGER NOT NULL DEFAULT 0,
        source     TEXT,
        due_at     TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT,
        rev        INTEGER NOT NULL DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_memo_updated ON memo(updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_memo_due ON memo(due_at) WHERE due_at IS NOT NULL;

      CREATE TABLE IF NOT EXISTS tag (
        id    TEXT PRIMARY KEY,
        name  TEXT NOT NULL UNIQUE,
        color TEXT
      );

      CREATE TABLE IF NOT EXISTS memo_tag (
        memo_id TEXT NOT NULL REFERENCES memo(id) ON DELETE CASCADE,
        tag_id  TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
        PRIMARY KEY (memo_id, tag_id)
      );

      CREATE TABLE IF NOT EXISTS attachment (
        id         TEXT PRIMARY KEY,
        memo_id    TEXT NOT NULL REFERENCES memo(id) ON DELETE CASCADE,
        sha256     TEXT NOT NULL,
        mime       TEXT NOT NULL,
        bytes      INTEGER NOT NULL,
        name       TEXT,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_attach_memo ON attachment(memo_id);

      CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
    `)
  }

  getMeta(k, dflt = null) {
    const row = this.db.prepare('SELECT v FROM meta WHERE k = ?').get(k)
    return row ? row.v : dflt
  }

  setMeta(k, v) {
    this.db.prepare('INSERT INTO meta (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, String(v))
  }

  async seedTags() {
    for (const t of DEFAULT_TAGS) await this.ensureTag(t)
  }

  async writeGitignore() {
    const gi = join(this.root, '.gitignore')
    const want = [
      '# 本地工作库：可从 notes/ 完全重建，不参与同步',
      'memo.db',
      'memo.db-wal',
      'memo.db-shm',
      '# 凭据绝不进仓库',
      '.token',
      '.DS_Store',
      '*.tmp',
      '',
    ].join('\n')
    const ga = join(this.root, '.gitattributes')
    try {
      if (!existsSync(gi)) await writeFile(gi, want, 'utf8')
      if (!existsSync(ga)) await writeFile(ga, 'log/*.jsonl merge=union\n', 'utf8')
    } catch { /* 非致命 */ }
  }

  /* ---- 标签 ---- */

  async ensureTag(name) {
    const existing = this.db.prepare('SELECT id, name FROM tag WHERE name = ?').get(name)
    if (existing) return existing.id
    const id = makeId()
    this.db.prepare('INSERT INTO tag (id, name) VALUES (?, ?)').run(id, name)
    return id
  }

  /**
   * 标签列表。
   * count 只统计未删除的备忘；空标签（没有任何备忘在用）仅在内置建议标签时保留，
   * 否则删掉某条备忘后会留下一个永远为 0 的孤儿标签挂在界面上。
   */
  listTags() {
    const defaults = new Set(DEFAULT_TAGS)
    return this.db
      .prepare(
        `SELECT t.id, t.name,
                (SELECT COUNT(*) FROM memo_tag mt JOIN memo m ON m.id = mt.memo_id
                  WHERE mt.tag_id = t.id AND m.deleted_at IS NULL) AS count
           FROM tag t
          ORDER BY count DESC, t.name ASC`,
      )
      .all()
      .map((r) => ({ id: r.id, name: r.name, count: Number(r.count) }))
      .filter((t) => t.count > 0 || defaults.has(t.name))
  }

  setMemoTags(memoId, names) {
    this.db.prepare('DELETE FROM memo_tag WHERE memo_id = ?').run(memoId)
    for (const n of names) {
      const tagId = this.db.prepare('SELECT id FROM tag WHERE name = ?').get(n)?.id
      if (!tagId) continue
      this.db.prepare('INSERT OR IGNORE INTO memo_tag (memo_id, tag_id) VALUES (?, ?)').run(memoId, tagId)
    }
  }

  tagsOf(memoId) {
    return this.db
      .prepare('SELECT t.name FROM memo_tag mt JOIN tag t ON t.id = mt.tag_id WHERE mt.memo_id = ? ORDER BY t.name')
      .all(memoId)
      .map((r) => r.name)
  }

  /* ---- 备忘 ---- */

  rowToItem(row) {
    const tags = this.tagsOf(row.id)
    const attachments = this.db
      .prepare('SELECT id, sha256, mime, bytes, name FROM attachment WHERE memo_id = ? ORDER BY created_at')
      .all(row.id)
      .map((a) => ({ ...a, bytes: Number(a.bytes), url: `${ATTACH_PREFIX}/${a.sha256}${EXT_BY_MIME[a.mime] || ''}`, ext: (EXT_BY_MIME[a.mime] || '').slice(1) }))
    return {
      id: row.id,
      body: row.body,
      done: !!row.done,
      pinned: !!row.pinned,
      source: row.source || '',
      dueAt: row.due_at || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at || '',
      rev: Number(row.rev),
      tags,
      attachments,
    }
  }

  get(id) {
    const row = this.db.prepare('SELECT * FROM memo WHERE id = ?').get(id)
    return row ? this.rowToItem(row) : null
  }

  /**
   * 列表 / 检索。
   * @param {{q?:string, tag?:string, filter?:string, limit?:number, offset?:number}} opts
   */
  list(opts = {}) {
    const where = []
    const params = []
    if (!opts.includeDeleted) where.push('m.deleted_at IS NULL')

    const q = (opts.q || '').trim()
    // 支持 "来源:xxx" / "after:YYYY-MM-DD" / "before:..." / "is:未完成" / "has:图片"
    let text = q
    const facets = q.match(/(来源|source|after|before|is|has):[^\s]+/g) || []
    for (const f of facets) {
      text = text.replace(f, ' ')
      const [k, v] = f.split(':')
      if (k === '来源' || k === 'source') { where.push('m.source LIKE ?'); params.push(`%${v}%`) }
      else if (k === 'after') { where.push('m.created_at >= ?'); params.push(v) }
      else if (k === 'before') { where.push('m.created_at <= ?'); params.push(`${v}T23:59:59+23:59`) }
      else if (k === 'is' && (v === '未完成' || v === 'todo')) where.push('m.done = 0')
      else if (k === 'is' && (v === '已完成' || v === 'done')) where.push('m.done = 1')
      else if (k === 'has' && (v === '图片' || v === 'image')) where.push('EXISTS (SELECT 1 FROM attachment a WHERE a.memo_id = m.id)')
    }
    // 标签词
    const tagWords = (text.match(/#[^\s#]+/g) || []).map((t) => t.slice(1))
    for (const t of tagWords) {
      text = text.replace(`#${t}`, ' ')
      if (opts.tag) continue
      where.push('EXISTS (SELECT 1 FROM memo_tag mt JOIN tag tg ON tg.id = mt.tag_id WHERE mt.memo_id = m.id AND tg.name = ?)')
      params.push(t)
    }
    if (opts.tag) {
      where.push('EXISTS (SELECT 1 FROM memo_tag mt JOIN tag tg ON tg.id = mt.tag_id WHERE mt.memo_id = m.id AND tg.name = ?)')
      params.push(opts.tag)
    }
    const rest = text.trim()
    if (rest) {
      where.push("(m.body LIKE ? OR IFNULL(m.source,'') LIKE ?)")
      params.push(`%${rest}%`, `%${rest}%`)
    }
    switch (opts.filter) {
      case 'todo': where.push('m.done = 0'); break
      case 'done': where.push('m.done = 1'); break
      case 'today': where.push("date(m.created_at) = date('now','localtime')"); break
      case 'week': where.push("m.created_at >= datetime('now','localtime','-7 days')"); break
      case 'pinned': where.push('m.pinned = 1'); break
      default: break
    }
    const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500)
    const offset = Math.max(Number(opts.offset) || 0, 0)
    const sql = `SELECT m.* FROM memo m ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY m.pinned DESC, m.updated_at DESC LIMIT ? OFFSET ?`
    const rows = this.db.prepare(sql).all(...params, limit, offset)
    return rows.map((r) => this.rowToItem(r))
  }

  stats() {
    const total = this.db.prepare('SELECT COUNT(*) c FROM memo WHERE deleted_at IS NULL').get().c
    const todo = this.db.prepare('SELECT COUNT(*) c FROM memo WHERE deleted_at IS NULL AND done = 0').get().c
    const done = this.db.prepare('SELECT COUNT(*) c FROM memo WHERE deleted_at IS NULL AND done = 1').get().c
    const withImg = this.db.prepare('SELECT COUNT(DISTINCT memo_id) c FROM attachment').get().c
    return { total: Number(total), todo: Number(todo), done: Number(done), withImage: Number(withImg) }
  }

  async create(input) {
    const at = nowIso()
    const id = makeId()
    const rawBody = String(input.body || '').trim()
    const tags = Array.from(new Set([...(input.tags || []), ...extractTags(rawBody)]))
    const body = stripTags(rawBody)
    this.db
      .prepare('INSERT INTO memo (id, body, done, pinned, source, due_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, body, 0, input.pinned ? 1 : 0, input.source || null, input.dueAt || null, at, at)
    for (const t of tags) await this.ensureTag(t)
    this.setMemoTags(id, tags)
    const attachments = await this.saveAttachments(id, input.attachments || [])
    const item = this.get(id)
    await this.persist(item)
    return item
  }

  async update(id, patch) {
    const cur = this.get(id)
    if (!cur) throw new Error(`memo not found: ${id}`)
    const at = nowIso()
    const fields = []
    const params = []
    // 显式传了 tags 就以它为准（编辑态里"标签跟随正文"），否则才从正文自动合并
    const tagsAreExplicit = patch.tags !== undefined
    if (patch.body !== undefined) {
      const raw = String(patch.body)
      fields.push('body = ?'); params.push(stripTags(raw))
      if (!tagsAreExplicit) {
        const inline = extractTags(raw)
        if (inline.length > 0) {
          const merged = Array.from(new Set([...cur.tags, ...inline]))
          for (const t of merged) await this.ensureTag(t)
          this.setMemoTags(id, merged)
        }
      }
    }
    if (patch.done !== undefined) { fields.push('done = ?'); params.push(patch.done ? 1 : 0) }
    if (patch.pinned !== undefined) { fields.push('pinned = ?'); params.push(patch.pinned ? 1 : 0) }
    if (patch.source !== undefined) { fields.push('source = ?'); params.push(patch.source || null) }
    if (patch.dueAt !== undefined) { fields.push('due_at = ?'); params.push(patch.dueAt || null) }
    if (tagsAreExplicit) {
      for (const t of patch.tags) await this.ensureTag(t)
      this.setMemoTags(id, patch.tags)
    }
    if (patch.deleted !== undefined) {
      fields.push('deleted_at = ?'); params.push(patch.deleted ? at : null)
    }
    fields.push('updated_at = ?'); params.push(at)
    fields.push('rev = rev + 1')
    this.db.prepare(`UPDATE memo SET ${fields.join(', ')} WHERE id = ?`).run(...params, id)
    if (Array.isArray(patch.attachments) && patch.attachments.length > 0) {
      await this.saveAttachments(id, patch.attachments)
    }
    // 编辑态里被移除的图片：解除引用（无引用才删文件）
    if (Array.isArray(patch.removeAttachments) && patch.removeAttachments.length > 0) {
      await this.dropAttachments(id, patch.removeAttachments)
    }
    const item = this.get(id)
    await this.persist(item)
    return item
  }

  async remove(id, hard = false) {
    const cur = this.get(id)
    if (!cur) return null
    if (hard) {
      this.db.prepare('DELETE FROM memo WHERE id = ?').run(id)
      await this.removeNoteFile(id)
      await this.appendLog('memo.purge', { id })
      return { id, hard: true }
    }
    // 软删除：事实源文件必须保留（否则 git 历史和"重建"都会丢这条），
    // 只在 frontmatter 里写 deleted 时间戳。
    const at = nowIso()
    this.db.prepare('UPDATE memo SET deleted_at = ?, updated_at = ?, rev = rev + 1 WHERE id = ?').run(at, at, id)
    await this.persist(this.get(id))
    return { id, hard: false }
  }

  /* ---- 附件 ---- */

  async saveAttachments(memoId, list) {
    const saved = []
    for (const raw of list) {
      const dataUrl = String(raw.dataUrl || '')
      const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl)
      if (!m) continue
      const mime = m[1]
      const buf = Buffer.from(m[2], 'base64')
      if (buf.length === 0 || buf.length > MAX_ATTACH_BYTES) continue
      const hash = sha256(buf)
      const ext = EXT_BY_MIME[mime] || '.bin'
      const dir = join(this.attachDir, hash.slice(0, 2))
      await mkdir(dir, { recursive: true })
      const file = join(dir, hash + ext)
      if (!existsSync(file)) await writeFile(file, buf)
      const id = makeId()
      this.db
        .prepare('INSERT INTO attachment (id, memo_id, sha256, mime, bytes, name, created_at) VALUES (?,?,?,?,?,?,?)')
        .run(id, memoId, hash, mime, buf.length, raw.name || '', nowIso())
      saved.push({ id, sha256: hash, mime, bytes: buf.length })
    }
    return saved
  }

  /**
   * 解除某条备忘对若干附件的引用。
   * 图片按内容哈希去重，同一个对象文件可能被多条备忘引用 ——
   * 所以只有在没有任何引用之后才真正删除对象文件。
   * @returns {Promise<number>} 实际删除的对象文件数
   */
  async dropAttachments(memoId, ids) {
    let removedFiles = 0
    for (const id of ids) {
      const row = this.db.prepare('SELECT * FROM attachment WHERE id = ? AND memo_id = ?').get(id, memoId)
      if (!row) continue
      this.db.prepare('DELETE FROM attachment WHERE id = ?').run(id)
      const still = this.db.prepare('SELECT COUNT(*) c FROM attachment WHERE sha256 = ?').get(row.sha256).c
      if (Number(still) === 0) {
        const ext = EXT_BY_MIME[row.mime] || ''
        const f = join(this.attachDir, row.sha256.slice(0, 2), row.sha256 + ext)
        try { await unlink(f); removedFiles += 1 } catch { /* 文件已不在就算了 */ }
      }
    }
    return removedFiles
  }

  findAttachment(sha, ext) {
    return this.db.prepare('SELECT * FROM attachment WHERE sha256 = ? LIMIT 1').get(sha) || null
  }

  /* ---- 文本事实源 ---- */

  notePath(memo) {
    const created = memo.createdAt || nowIso()
    const ym = created.slice(0, 7) // YYYY-MM
    return join(this.notesDir, ym, `${memo.id}.md`)
  }

  async persist(memo) {
    if (!memo) return
    const file = this.notePath(memo)
    await mkdir(dirname(file), { recursive: true })
    // notes/YYYY-MM/<id>.md → attachments/ 相隔两层
    const atts = memo.attachments.map((a) => ({
      sha256: a.sha256,
      name: a.name,
      mime: a.mime,
      rel: `../../attachments/${a.sha256.slice(0, 2)}/${a.sha256}${EXT_BY_MIME[a.mime] || ''}`,
    }))
    await writeFile(file, memoToMarkdown(memo, memo.tags, atts), 'utf8')
    await this.appendLog('memo.upsert', { id: memo.id })
  }

  async removeNoteFile(id) {
    // 按目录扫描（id 前缀即创建月份，但我们不保证一定存在）
    for (const ym of await safeReaddir(this.notesDir)) {
      const f = join(this.notesDir, ym, `${id}.md`)
      if (existsSync(f)) { await unlink(f); return }
    }
  }

  async appendLog(kind, payload) {
    const ym = nowIso().slice(0, 7)
    const line = JSON.stringify({ at: nowIso(), kind, ...payload }) + '\n'
    try {
      const f = join(this.root, 'log', `${ym}.jsonl`)
      const prev = existsSync(f) ? await readFile(f, 'utf8') : ''
      await writeFile(f, prev + line, 'utf8')
    } catch { /* 非致命 */ }
  }

  /** 从 notes/ 全量重建 SQLite（SQLite 丢失/损坏时的恢复路径）。 */
  async rebuildFromNotes() {
    const files = []
    for (const ym of await safeReaddir(this.notesDir)) {
      for (const f of await safeReaddir(join(this.notesDir, ym))) {
        if (f.endsWith('.md')) files.push(join(this.notesDir, ym, f))
      }
    }
    let n = 0
    for (const f of files) {
      try {
        const parsed = markdownToMemo(await readFile(f, 'utf8'))
        if (!parsed?.id) continue
        const exists = this.db.prepare('SELECT id FROM memo WHERE id = ?').get(parsed.id)
        const at = parsed.created_at || nowIso()
        if (!exists) {
          this.db
            .prepare('INSERT INTO memo (id, body, done, pinned, source, due_at, created_at, updated_at, deleted_at, rev) VALUES (?,?,?,?,?,?,?,?,?,?)')
            .run(parsed.id, parsed.body || '', parsed.done ? 1 : 0, parsed.pinned ? 1 : 0, parsed.source || null, parsed.due_at || null, at, parsed.updated_at || at, parsed.deleted_at || null, 1)
        } else {
          this.db
            .prepare('UPDATE memo SET body=?, done=?, pinned=?, source=?, due_at=?, updated_at=?, deleted_at=? WHERE id=?')
            .run(parsed.body || '', parsed.done ? 1 : 0, parsed.pinned ? 1 : 0, parsed.source || null, parsed.due_at || null, parsed.updated_at || at, parsed.deleted_at || null, parsed.id)
        }
        for (const t of parsed.tags || []) await this.ensureTag(t)
        this.setMemoTags(parsed.id, parsed.tags || [])
        for (const a of parsed.attachments || []) {
          if (!a.sha256) continue
          const dup = this.db.prepare('SELECT id FROM attachment WHERE memo_id = ? AND sha256 = ?').get(parsed.id, a.sha256)
          if (dup) continue
          this.db
            .prepare('INSERT INTO attachment (id, memo_id, sha256, mime, bytes, name, created_at) VALUES (?,?,?,?,?,?,?)')
            .run(makeId(), parsed.id, a.sha256, a.mime || 'image/png', 0, a.name || '', at)
        }
        n++
      } catch (e) {
        this.log?.warn?.(`dsh-memo: rebuild skip ${f}: ${e.message}`)
      }
    }
    await this.appendLog('rebuild', { count: n })
    return n
  }
}

async function safeReaddir(dir) {
  try { return await readdir(dir) } catch { return [] }
}

/* ------------------------------------------------------------------ *
 * Git 同步
 * ------------------------------------------------------------------ */

/**
 * 解析远程仓库：三层兜底，从最"新"的意图到最"旧"的痕迹。
 *   ① 数据目录的 .config.json —— 用户在设置界面里保存的（最高优先级）
 *   ② 插件配置 rawConfig.repo —— cordis.patch.yml 里的部署默认值
 *   ③ git remote origin —— 目录里已经配过的痕迹（例如手动 git remote add 过）
 * 三层都查不到才返回空，此时界面显示"未配置"。
 */
function resolveRemote(root, patchRepo, patchBranch) {
  const branch = patchBranch || 'main'
  const tries = []

  // ① 运行时设置
  try {
    const f = join(root, '.config.json')
    if (existsSync(f)) {
      const j = JSON.parse(readFileSync(f, 'utf8'))
      if (j && typeof j.repo === 'string' && j.repo) {
        tries.push({ repo: j.repo, branch: j.branch || branch, from: 'runtime' })
      }
    }
  } catch { /* 配置损坏不应阻断启动 */ }

  // ② 插件配置
  if (patchRepo) tries.push({ repo: patchRepo, branch, from: 'config' })

  // ③ git remote 兜底
  try {
    const url = execFileSync('git', ['-C', root, 'remote', 'get-url', 'origin'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    const repo = url.replace(/^.*github\.com[:/]/, '').replace(/\.git$/, '').replace(/\/$/, '')
    if (/^[^/\s]+\/[^/\s]+$/.test(repo)) tries.push({ repo, branch, from: 'git-remote' })
  } catch { /* 没有 origin 或不支持 git */ }

  return tries[0] || { repo: '', branch, from: 'none' }
}

/** 把运行时设置写进数据目录，重启后仍然生效。 */
async function saveRuntimeConfig(root, data) {
  try {
    await writeFile(join(root, '.config.json'), JSON.stringify(data, null, 2) + '\n', 'utf8')
  } catch { /* 非致命：写不进去时仅内存生效，与旧行为一致 */ }
}

class GitSync {
  constructor(root, cfg, log) {
    this.root = root
    this.cfg = cfg
    this.log = log
    this.state = { lastPushAt: '', lastPullAt: '', lastError: '', running: false, dirty: false }
    this.timer = null
  }

  async run(args, opts = {}) {
    const { stdout } = await execFileAsync('git', args, {
      cwd: this.root,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', ...(opts.env || {}) },
      maxBuffer: 8 * 1024 * 1024,
    })
    return stdout.trim()
  }

  /**
   * Token 三级查找：显式配置 → 环境变量 → 数据目录下的 .token 文件（0600）。
   * 无论哪种来源都绝不写进仓库：.token 已在 .gitignore 里，且 git 提交时
   * remote URL 与 http.extraheader 都只存在于进程参数中，不落在 .git/config。
   */
  token() {
    if (this.cfg.token) return this.cfg.token
    if (process.env.DSH_MEMO_GITHUB_TOKEN) return process.env.DSH_MEMO_GITHUB_TOKEN
    if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN
    try {
      const f = join(this.root, '.token')
      if (existsSync(f)) return readFileSync(f, 'utf8').trim()
    } catch { /* 读不到就当作未配置 */ }
    return ''
  }

  async setToken(token) {
    const f = join(this.root, '.token')
    const v = String(token || '').trim()
    if (!v) {
      try { await unlink(f) } catch { /* 本来就没有 */ }
      return false
    }
    await writeFile(f, v + '\n', { mode: 0o600 })
    try { await chmod(f, 0o600) } catch { /* 非 POSIX 文件系统忽略 */ }
    return true
  }

  /** 带认证 header 的 git 参数（token 不写入 .git/config）。 */
  authArgs() {
    const t = this.token()
    if (!t) return []
    const basic = Buffer.from(`x-access-token:${t}`).toString('base64')
    return ['-c', `http.extraheader=Authorization: Basic ${basic}`]
  }

  async isRepo() {
    try { await this.run(['rev-parse', '--git-dir']); return true } catch { return false }
  }

  async ensureRepo() {
    if (!(await this.isRepo())) {
      await this.run(['init', '-q', '-b', this.cfg.branch || 'main'])
      await this.run(['config', 'user.name', 'dsh-memo'])
      await this.run(['config', 'user.email', 'memo@dsh.local'])
      return true
    }
    return false
  }

  async setRemote(repo) {
    const url = repo.startsWith('http') ? repo : `https://github.com/${repo.replace(/^\/+|\/+$/g, '')}.git`
    try { await this.run(['remote', 'remove', 'origin']) } catch { /* 本来就没有 */ }
    await this.run(['remote', 'add', 'origin', url])
    return url
  }

  async commit(message) {
    await this.run(['add', '-A'])
    try {
      await this.run(['commit', '-q', '-m', message])
      return true
    } catch (e) {
      // 没有改动时 git commit 退出码非 0，这不是错误
      if (String(e.stdout || e.stderr || '').includes('nothing to commit')) return false
      if (/nothing to commit|no changes added/.test(String(e.message))) return false
      throw e
    }
  }

  async push() {
    if (!this.cfg.repo) throw new Error('no GitHub repository configured')
    await this.ensureRepo()
    await this.setRemote(this.cfg.repo)
    await this.run([...this.authArgs(), 'push', '-u', 'origin', this.cfg.branch || 'main'])
    this.state.lastPushAt = nowIso()
    this.state.lastError = ''
  }

  async pull() {
    if (!this.cfg.repo) throw new Error('no GitHub repository configured')
    if (!(await this.isRepo())) return false
    try {
      await this.run([...this.authArgs(), 'pull', '--rebase', '--autostash', 'origin', this.cfg.branch || 'main'])
      this.state.lastPullAt = nowIso()
      this.state.lastError = ''
      return true
    } catch (e) {
      this.state.lastError = String(e.stderr || e.message || e).slice(0, 400)
      throw e
    }
  }

  schedule(autoMessage) {
    this.state.dirty = true
    if (!this.cfg.pushDebounceMs || this.cfg.pushDebounceMs <= 0) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      this.syncNow(autoMessage).catch((e) => {
        this.state.lastError = String(e.message || e).slice(0, 400)
      })
    }, this.cfg.pushDebounceMs)
    this.timer.unref?.()
  }

  async syncNow(message = 'sync: 更新') {
    if (this.state.running) return { ok: false, reason: 'busy' }
    this.state.running = true
    try {
      await this.ensureRepo()
      const committed = await this.commit(message)
      if (this.cfg.repo) {
        await this.setRemote(this.cfg.repo)
        await this.push()
      }
      this.state.dirty = false
      return { ok: true, committed, pushed: !!this.cfg.repo }
    } finally {
      this.state.running = false
    }
  }

  status() {
    return { ...this.state, repo: this.cfg.repo || '', branch: this.cfg.branch || 'main', hasToken: !!this.token() }
  }
}

/* ------------------------------------------------------------------ *
 * 插件
 * ------------------------------------------------------------------ */

export function apply(ctx, rawConfig = {}) {
  const home = process.env.DSH_HOME || join(homedir(), '.dsh')
  const dataDir = rawConfig.dataDir || join(home, 'memo')
  const resolved = resolveRemote(dataDir, rawConfig.repo, rawConfig.branch)
  const cfg = {
    dataDir,
    repo: resolved.repo,
    repoSource: resolved.from,
    branch: resolved.branch,
    remote: rawConfig.remote || 'origin',
    pushDebounceMs: rawConfig.pushDebounceMs ?? 30000,
    snapshotKeep: rawConfig.snapshotKeep ?? 7,
  }

  const store = new MemoStore(cfg.dataDir, ctx.logger)
  const git = new GitSync(cfg.dataDir, cfg, ctx.logger)
  let ready = null

  const ensureReady = () => {
    if (!ready) {
      ready = store.init().then(async (dbPath) => {
        ctx.logger?.info?.(`dsh-memo: 数据目录 ${cfg.dataDir}`)
        ctx.logger?.info?.(`dsh-memo: 远程仓库 ${cfg.repo || '(未配置)'} ← ${cfg.repoSource}`)
        // 首次启动：SQLite 是空的但 notes/ 有内容 → 重建
        const n = store.db.prepare('SELECT COUNT(*) c FROM memo').get().c
        if (Number(n) === 0) {
          const rebuilt = await store.rebuildFromNotes().catch(() => 0)
          if (rebuilt > 0) ctx.logger?.info?.(`dsh-memo: 从 notes/ 重建了 ${rebuilt} 条`)
        }
        return dbPath
      })
    }
    return ready
  }

  const api = {
    async bootstrap() {
      await ensureReady()
      return {
        items: store.list({ limit: 200 }),
        tags: store.listTags(),
        stats: store.stats(),
        sync: git.status(),
        config: { dataDir: cfg.dataDir, repo: cfg.repo, branch: cfg.branch, repoSource: cfg.repoSource, pushDebounceMs: cfg.pushDebounceMs },
        defaultTags: DEFAULT_TAGS,
      }
    },
    async list(payload) { await ensureReady(); return { items: store.list(payload || {}) } },
    async stats() { await ensureReady(); return store.stats() },
    async tags() { await ensureReady(); return { tags: store.listTags() } },
    async create(payload) {
      await ensureReady()
      const item = await store.create(payload || {})
      git.schedule(`add: ${(item.body || '').slice(0, 60)}`)
      return { item, stats: store.stats() }
    },
    async update(payload) {
      await ensureReady()
      const { id, patch } = payload || {}
      const item = await store.update(id, patch || {})
      const action = patch?.done !== undefined ? (patch.done ? 'done' : 'reopen') : patch?.deleted ? 'trash' : 'update'
      git.schedule(`${action}: ${(item.body || '').slice(0, 60)}`)
      return { item, stats: store.stats() }
    },
    async remove(payload) {
      await ensureReady()
      const { id, hard } = payload || {}
      const r = await store.remove(id, !!hard)
      git.schedule(`remove: ${id}`)
      return { removed: r, stats: store.stats() }
    },
    async rebuild() {
      await ensureReady()
      const n = await store.rebuildFromNotes()
      return { rebuilt: n, stats: store.stats() }
    },
    async sync(payload) {
      await ensureReady()
      const action = payload?.action || 'now'
      if (action === 'status') return { sync: git.status() }
      if (action === 'pull') {
        await git.pull()
        const n = await store.rebuildFromNotes()
        return { sync: git.status(), rebuilt: n }
      }
      if (action === 'config') {
        if (payload.repo !== undefined) {
          cfg.repo = String(payload.repo || '').trim()
          cfg.repoSource = cfg.repo ? 'runtime' : 'none'
          if (cfg.repo) {
            // 目录可能还没 git init（首次设置时），先补上再写 remote；
            // 这一步失败也不阻断保存——配置落盘才是"保存"的主要目的，
            // git 侧的问题会在真正推送时以同步错误的形式暴露。
            try {
              await git.ensureRepo()
              await git.setRemote(cfg.repo)
            } catch (e) {
              ctx.logger?.warn?.(`dsh-memo: 写入 git remote 失败（配置已保存）: ${e.message}`)
            }
          }
        }
        if (payload.token !== undefined) await git.setToken(payload.token)
        // 关键：落盘，否则重启后仓库设置就丢了
        await saveRuntimeConfig(store.root, { repo: cfg.repo, branch: cfg.branch })
        return { sync: git.status(), config: { repo: cfg.repo, branch: cfg.branch, repoSource: cfg.repoSource } }
      }
      const r = await git.syncNow(payload?.message || 'sync: 手动同步')
      return { sync: git.status(), result: r }
    },
    async snapshot() {
      await ensureReady()
      const day = nowIso().slice(0, 10)
      const target = join(store.snapDir, `memo-${day}.sqlite`)
      try { await unlink(target) } catch { /* 覆盖旧快照 */ }
      store.db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`)
      const dirs = (await safeReaddir(store.snapDir)).filter((f) => f.endsWith('.sqlite')).sort()
      const excess = dirs.slice(0, Math.max(0, dirs.length - cfg.snapshotKeep))
      for (const f of excess) { try { await unlink(join(store.snapDir, f)) } catch { /* ignore */ } }
      return { target, kept: dirs.length - excess.length }
    },
    async health() {
      await ensureReady()
      const dbPath = join(cfg.dataDir, 'memo.db')
      const s = await stat(dbPath).catch(() => null)
      return {
        ok: true,
        dataDir: cfg.dataDir,
        repoSource: cfg.repoSource,
        dbBytes: s ? s.size : 0,
        stats: store.stats(),
        sync: git.status(),
      }
    },
  }

  // 路由的生命周期交给 ctx.effect：热插拔时 cordis 会先跑上一次的清理、再应用新实例；
  // 若顺序相反（新实例先 apply），disposeRoutes() 会主动让出上一实例占用的同路径路由。
  ctx.effect(() => {
    disposeRoutes()
    const disposeRoute = ctx.webServer.register({
    kind: 'prefix',
    path: API_PREFIX,
    handler: async (req, res) => {
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method not allowed' })
      const url = new URL(req.url ?? '/', 'http://dsh.internal')
      const method = url.pathname.startsWith(API_PREFIX + '/') ? url.pathname.slice(API_PREFIX.length + 1) : ''
      if (!method || method.includes('/')) return json(res, 404, { ok: false, error: `unknown method "${method}"` })
      const fn = api[method]
      if (!fn) return json(res, 404, { ok: false, error: `unknown method "${method}"` })
      try {
        const payload = await readJsonBody(req)
        const value = await fn(payload)
        return json(res, 200, { ok: true, value })
      } catch (error) {
        ctx.logger?.warn?.(`dsh-memo: ${method} 失败: ${error?.message}`)
        return json(res, 500, { ok: false, error: String(error?.message || error) })
      }
    },
  })

  const disposeAttach = ctx.webServer.register({
    kind: 'prefix',
    path: ATTACH_PREFIX,
    handler: async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', 'http://dsh.internal')
        const name = url.pathname.slice(ATTACH_PREFIX.length + 1)
        const m = /^([0-9a-f]{64})(\.[a-z0-9]+)?$/i.exec(name)
        if (!m) { res.writeHead(404); res.end('not found'); return }
        const sha = m[1].toLowerCase()
        const row = store.findAttachment(sha)
        if (!row) { res.writeHead(404); res.end('not found'); return }
        const ext = m[2] || EXT_BY_MIME[row.mime] || ''
        const file = join(store.attachDir, sha.slice(0, 2), sha + ext)
        const buf = await readFile(file)
        res.writeHead(200, {
          'content-type': row.mime || 'application/octet-stream',
          'content-length': buf.length,
          'cache-control': 'public, max-age=31536000, immutable',
        })
        res.end(buf)
      } catch {
        res.writeHead(404)
        res.end('not found')
      }
    },
  })

    const mine = () => {
      try { disposeRoute() } catch { /* ignore */ }
      try { disposeAttach() } catch { /* ignore */ }
    }
    ROUTES_HOLDER.value = mine
    return () => {
      // holder 已被新实例接管时，旧路由早已由它释放，这里不能再动
      if (ROUTES_HOLDER.value !== mine) return
      ROUTES_HOLDER.value = undefined
      mine()
    }
  }, 'dsh-memo: 路由（支持热插拔）')

  ctx.effect(() => {
    ensureReady().then(() => {
      if (cfg.repo) git.pull().then(() => store.rebuildFromNotes()).catch(() => {})
      api.snapshot().catch(() => {})
    })
    return () => { if (git.timer) clearTimeout(git.timer) }
  }, 'dsh-memo: 启动初始化')

  return () => {
    // 两个路由由上面的 ctx.effect 托管（热插拔时自动释放），这里只收尾数据层
    try { store.db?.close() } catch { /* ignore */ }
  }
}
