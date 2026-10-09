// 顺序语义回归：新建在前、完成/编辑不跳动、拖拽 reorder 持久化到 .md、rebuild 保持、老库迁移
import { rm, readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { apply } from '../lib/index.js'

const ROOT = '/tmp/dsh-memo-reorder-test'
let pass = 0, fail = 0
const check = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n) } else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + x : '')) } }

function mockReq(url, body) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  return { method: 'POST', url, [Symbol.asyncIterator]: async function* () { for (const c of chunks) yield c } }
}
function mockRes() {
  const res = { status: 0, body: '' }
  res.writeHead = (s) => { res.status = s }
  res.end = (b) => { res.body = b ? b.toString() : '' }
  return res
}
async function boot(dir) {
  const routes = []
  apply({
    logger: { info: () => {}, warn: () => {} },
    webServer: { register: (r) => { routes.push(r); return () => {} } },
    effect: (fn) => { fn(); return () => {} },
  }, { dataDir: dir, repo: '', pushDebounceMs: 0 })
  await new Promise((r) => setTimeout(r, 300))
  const route = routes.find((r) => r.path === '/memo/api')
  return async function api(method, payload) {
    const res = mockRes()
    await route.handler(mockReq('/memo/api/' + method, payload), res)
    const parsed = JSON.parse(res.body || '{}')
    if (!parsed.ok) throw new Error(`${method}: ${parsed.error}`)
    return parsed.value
  }
}
const ids = (v) => v.items.map((i) => i.id)
const notePath = (id) => join(ROOT, 'notes', new Date().toISOString().slice(0, 7), id + '.md')

await rm(ROOT, { recursive: true, force: true })
const api = await boot(ROOT)

console.log('顺序语义\n')

console.log('[1] 新建的排在最前，且顺序稳定')
const a = (await api('create', { body: 'AAA' })).item
const b = (await api('create', { body: 'BBB' })).item
const c = (await api('create', { body: 'CCC' })).item
check('新建顺序 = 最新在最前', JSON.stringify(ids(await api('list', {}))) === JSON.stringify([c.id, b.id, a.id]), JSON.stringify(ids(await api('list', {}))))

console.log('\n[2] 点完成 / 取消完成不再把条目顶到最上面（本次需求核心）')
{
  await api('update', { id: b.id, patch: { done: true } })
  check('标记完成后位置不变', JSON.stringify(ids(await api('list', {}))) === JSON.stringify([c.id, b.id, a.id]), JSON.stringify(ids(await api('list', {}))))
  await api('update', { id: b.id, patch: { done: false } })
  check('取消完成后位置不变', JSON.stringify(ids(await api('list', {}))) === JSON.stringify([c.id, b.id, a.id]), JSON.stringify(ids(await api('list', {}))))
}

console.log('\n[3] 编辑正文 / 改来源也不再改变位置')
{
  await api('update', { id: a.id, patch: { body: 'AAA 改过了', source: '张总' } })
  check('编辑后仍在最后', JSON.stringify(ids(await api('list', {}))) === JSON.stringify([c.id, b.id, a.id]), JSON.stringify(ids(await api('list', {}))))
}

console.log('\n[4] 拖拽排序（reorder）落库并持久化')
{
  const r = await api('reorder', { ids: [a.id, c.id, b.id] })
  check('reorder 返回处理条数', r.reordered === 3, String(r.reordered))
  check('列表顺序变成提交的顺序', JSON.stringify(ids(await api('list', {}))) === JSON.stringify([a.id, c.id, b.id]), JSON.stringify(ids(await api('list', {}))))

  const mdA = await readFile(notePath(a.id), 'utf8')
  const mdC = await readFile(notePath(c.id), 'utf8')
  check('.md 里写入了 order 字段（事实源可恢复）', /^order: \d+$/m.test(mdC), mdC.split('\n').slice(0, 8).join('⏎'))
  check('序号 0 不写多余字段（默认值即 0）', !/^order:/m.test(mdA), mdA.split('\n').slice(0, 8).join('⏎'))

  await api('update', { id: c.id, patch: { done: true } })
  check('排序后再点完成，顺序依然不变', JSON.stringify(ids(await api('list', {}))) === JSON.stringify([a.id, c.id, b.id]), JSON.stringify(ids(await api('list', {}))))
}

console.log('\n[5] 置顶仍然排在本组最前')
{
  const d = (await api('create', { body: 'DDD' })).item
  check('新条目在最前', ids(await api('list', {}))[0] === d.id, JSON.stringify(ids(await api('list', {}))))
  await api('update', { id: b.id, patch: { pinned: true } })
  check('置顶后 b 到最前', ids(await api('list', {}))[0] === b.id, JSON.stringify(ids(await api('list', {}))))
  await api('update', { id: b.id, patch: { pinned: false } })
  check('取消置顶后回到它自己的顺序位置', JSON.stringify(ids(await api('list', {}))) === JSON.stringify([d.id, a.id, c.id, b.id]), JSON.stringify(ids(await api('list', {}))))
}

console.log('\n[6] rebuild 之后顺序不回退')
{
  const before = ids(await api('list', {}))
  await api('rebuild', {})
  check('rebuild 后顺序保持一致', JSON.stringify(ids(await api('list', {}))) === JSON.stringify(before), JSON.stringify(ids(await api('list', {}))))
}

console.log('\n[7] 老库迁移：没有 sort_order 列也能平滑升级')
{
  const OLD = '/tmp/dsh-memo-reorder-old'
  await rm(OLD, { recursive: true, force: true })
  await mkdir(OLD, { recursive: true })
  const db = new DatabaseSync(join(OLD, 'memo.db'))
  db.exec(`CREATE TABLE memo (
    id TEXT PRIMARY KEY, body TEXT NOT NULL DEFAULT '', done INTEGER NOT NULL DEFAULT 0,
    pinned INTEGER NOT NULL DEFAULT 0, source TEXT, due_at TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT, rev INTEGER NOT NULL DEFAULT 1);`)
  const ins = db.prepare('INSERT INTO memo (id, body, done, pinned, created_at, updated_at, rev) VALUES (?,?,0,0,?,?,1)')
  ins.run('old1', '最老的一条', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')
  ins.run('old2', '中间一条', '2026-10-02T00:00:00.000Z', '2026-10-02T00:00:00.000Z')
  ins.run('old3', '最新的一条', '2026-10-03T00:00:00.000Z', '2026-10-03T00:00:00.000Z')
  db.close()

  const apiOld = await boot(OLD)
  const cols = new DatabaseSync(join(OLD, 'memo.db')).prepare('PRAGMA table_info(memo)').all().map((r) => r.name)
  check('自动补上 sort_order 列', cols.includes('sort_order'), cols.join(','))
  check('迁移后顺序 = 原来的「按更新时间」顺序', JSON.stringify(ids(await apiOld('list', {}))) === JSON.stringify(['old3', 'old2', 'old1']), JSON.stringify(ids(await apiOld('list', {}))))
  await apiOld('update', { id: 'old1', patch: { done: true } })
  check('迁移后点完成也不会跳顶', ids(await apiOld('list', {}))[2] === 'old1', JSON.stringify(ids(await apiOld('list', {}))))
}

console.log('\n[8] 客户端重排算法（applyGroupOrder，直接从 client.js 提取）')
{
  const src = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
  const m = src.match(/function applyGroupOrder\(list, ids\) \{[\s\S]*?\n    \}/)
  check('client.js 里有 applyGroupOrder', !!m)
  const applyGroupOrder = new Function('return ' + m[0])()
  const L = ['a', 'b', 'c', 'd'].map((id) => ({ id }))
  check('把 d 提到最前，其它条目占位不变', JSON.stringify(applyGroupOrder(L, ['d', 'a', 'b', 'c']).map((x) => x.id)) === JSON.stringify(['d', 'a', 'b', 'c']))
  check('只提交部分 id 时，未提交的条目位置不动', JSON.stringify(applyGroupOrder(L, ['d', 'a']).map((x) => x.id)) === JSON.stringify(['d', 'b', 'c', 'a']))
  check('空 ids 不改变任何东西', JSON.stringify(applyGroupOrder(L, []).map((x) => x.id)) === JSON.stringify(['a', 'b', 'c', 'd']))
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
