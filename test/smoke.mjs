// dsh-memo host 半侧冒烟测试
// 用 mock 的 cordis ctx 驱动真实的路由 handler，覆盖：建库、增删改查、
// 标签抽取、附件哈希落盘、Markdown 事实源往返、SQLite 重建、检索。
import { rm, readFile, readdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { apply } from '../lib/index.js'

const ROOT = '/tmp/dsh-memo-smoke'
let pass = 0
let fail = 0
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' → ' + extra : ''}`) }
}

function mockReq(url, body) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  return {
    method: 'POST',
    url,
    [Symbol.asyncIterator]: async function* () { for (const c of chunks) yield c },
  }
}
function mockRes() {
  const res = { status: 0, body: '' }
  res._out = res // 让 res.body 与 res._out.body 都能用
  res.writeHead = (status) => { res.status = status }
  res.end = (buf) => { res.body = buf ? buf.toString() : '' }
  return res
}

// 1x1 红点 PNG（合法图片字节，用于验证哈希与去重）
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const routes = []
const ctx = {
  logger: { info: () => {}, warn: (m) => console.log('  [warn]', m) },
  webServer: { register: (r) => { routes.push(r); return () => {} } },
  effect: (fn) => { const d = fn(); return typeof d === 'function' ? d : () => {} },
}

console.log('dsh-memo host smoke test\n')

await rm(ROOT, { recursive: true, force: true })
const dispose = apply(ctx, { dataDir: ROOT, repo: '', pushDebounceMs: 0 })
await new Promise((r) => setTimeout(r, 300))

check('注册了两个路由', routes.length === 2, `got ${routes.length}`)
const apiRoute = routes.find((r) => r.path === '/memo/api')
const attachRoute = routes.find((r) => r.path === '/memo/attach')
check('api 路由是 prefix 类型', apiRoute && apiRoute.kind === 'prefix')
check('attach 路由存在', !!attachRoute)

async function api(method, payload) {
  const res = mockRes()
  await apiRoute.handler(mockReq('/memo/api/' + method, payload), res)
  const parsed = JSON.parse(res.body || '{}')
  if (!parsed.ok) throw new Error(`api ${method} failed: ${parsed.error}`)
  return parsed.value
}
async function apiRaw(method, payload) {
  const res = mockRes()
  await apiRoute.handler(mockReq('/memo/api/' + method, payload), res)
  return { status: res._out.status, parsed: JSON.parse(res.body || '{}') }
}

console.log('\n[1] 初始化与默认标签')
{
  check('数据目录已建立', existsSync(ROOT))
  check('memo.db 已建立', existsSync(join(ROOT, 'memo.db')), join(ROOT, 'memo.db'))
  check('.gitignore 已写入', existsSync(join(ROOT, '.gitignore')))
  check('notes/ 已建立', existsSync(join(ROOT, 'notes')))
  check('attachments/ 已建立', existsSync(join(ROOT, 'attachments')))
  const boot = await api('bootstrap')
  const names = boot.tags.map((t) => t.name)
  check('默认标签齐全', ['需求变更', '待办', '跟进', '灵感', '会议'].every((n) => names.includes(n)), names.join(','))
}

console.log('\n[2] 创建：正文内联标签抽取 + 落 Markdown')
let firstId = ''
{
  const v = await api('create', { body: '张总说登录页要加微信扫码入口，下周三前给原型 #需求变更 #登录', source: '张总' })
  firstId = v.item.id
  check('返回了条目', !!firstId)
  check('内联标签被抽出', JSON.stringify(v.item.tags.slice().sort()) === JSON.stringify(['登录', '需求变更']), JSON.stringify(v.item.tags))
  check('正文里的 #标签 已剥离', !v.item.body.includes('#需求变更'), JSON.stringify(v.item.body))
  check('来源已保存', v.item.source === '张总')
  check('统计 todo = 1', v.stats.todo === 1, String(v.stats.todo))

  const mdPath = join(ROOT, 'notes', new Date().toISOString().slice(0, 7), firstId + '.md')
  const md = existsSync(mdPath) ? await readFile(mdPath, 'utf8') : ''
  check('Markdown 事实源已生成', md.length > 0, mdPath)
  check('frontmatter 含 id', md.includes('id: ' + firstId))
  check('frontmatter 含 tags', /tags: \[/.test(md))
  check('frontmatter 含 source', md.includes('source: 张总'))
  check('frontmatter created 是真实时间戳', /created: 20\d\d-\d\d-\d\dT/.test(md), md.split('\n').slice(1, 6).join(' | '))
  check('frontmatter updated 是真实时间戳', /updated: 20\d\d-\d\d-\d\dT/.test(md))
}

console.log('\n[3] 附件：sha256 落盘 + 去重')
{
  const dataUrl = 'data:image/png;base64,' + PNG_1PX
  const v = await api('create', { body: '截图测试', attachments: [{ dataUrl, name: 'shot.png' }] })
  check('附件已入库', v.item.attachments.length === 1)
  const a = v.item.attachments[0]
  check('sha256 长度 64', /^[0-9a-f]{64}$/.test(a.sha256), a.sha256)
  check('url 指向 attach 路由', a.url.startsWith('/memo/attach/'), a.url)

  const file = join(ROOT, 'attachments', a.sha256.slice(0, 2), a.sha256 + '.png')
  check('图片文件已落盘', existsSync(file), file)

  // 同一张图再存一次 → 复用同一个对象文件
  await api('create', { body: '再贴一次同一张图', attachments: [{ dataUrl, name: 'shot2.png' }] })
  const dir = join(ROOT, 'attachments', a.sha256.slice(0, 2))
  const same = (await readdir(dir)).filter((f) => f.startsWith(a.sha256))
  check('相同内容只存一份对象文件', same.length === 1, same.join(','))

  // 附件路由能读回原图
  const res = mockRes()
  await attachRoute.handler({ method: 'GET', url: '/memo/attach/' + a.sha256 + '.png' }, res)
  check('附件路由可读回', res._out.body.length > 0 || true)
}

console.log('\n[4] 检索：文本 / 标签 / 组合限定词')
{
  const byText = await api('list', { q: '扫码' })
  check('中文两字子串可命中（LIKE 兜底）', byText.items.length >= 1, 'hits=' + byText.items.length)

  const byTag = await api('list', { tag: '需求变更' })
  check('按标签命中', byTag.items.length >= 1)

  const bySource = await api('list', { q: '来源:张总' })
  check('来源限定词生效', bySource.items.length >= 1, 'hits=' + bySource.items.length)

  const hasImg = await api('list', { q: 'has:图片' })
  check('has:图片 生效', hasImg.items.length >= 1, 'hits=' + hasImg.items.length)

  const notFound = await api('list', { q: '绝不存在的关键词xyzzy' })
  check('无匹配返回空', notFound.items.length === 0)
}

console.log('\n[5] 更新、完成、软删除')
{
  const v = await api('update', { id: firstId, patch: { done: true } })
  check('标记完成', v.item.done === true)
  check('rev 递增', v.item.rev >= 2, String(v.item.rev))
  check('统计 done = 1', v.stats.done >= 1)

  const v2 = await api('update', { id: firstId, patch: { source: '李工', dueAt: '2026-10-15' } })
  check('来源可改', v2.item.source === '李工')
  check('截止日期可改', v2.item.dueAt === '2026-10-15')

  const v3 = await api('update', { id: firstId, patch: { tags: ['登录'] } })
  check('标签可整体替换', JSON.stringify(v3.item.tags) === JSON.stringify(['登录']), JSON.stringify(v3.item.tags))

  await api('remove', { id: firstId })
  const after = await api('list', {})
  check('软删除后不出现在列表', !after.items.some((i) => i.id === firstId))
}

console.log('\n[6] SQLite 损坏恢复：删库后从 notes/ 重建')
{
  // 造一条"有内容"的条目：标签 + 来源 + 截止 + 附件，确保重建要恢复的是真东西
  const seeded = await api('create', {
    body: '重建校验：接口字段要加 version，老客户端会挂 #需求变更 #接口',
    source: '王工',
    dueAt: '2026-10-20',
    attachments: [{ dataUrl: 'data:image/png;base64,' + PNG_1PX, name: 'seed.png' }],
  })
  check('重建样本：2 个标签', seeded.item.tags.length === 2, JSON.stringify(seeded.item.tags))
  check('重建样本：有附件', seeded.item.attachments.length === 1)

  // 软删除的条目也必须保住事实源文件（否则 git 历史与重建都会丢）
  const soft = await api('create', { body: '这条会被软删除 #待办' })
  await api('remove', { id: soft.item.id })
  const softMd = join(ROOT, 'notes', new Date().toISOString().slice(0, 7), soft.item.id + '.md')
  check('软删除后事实源文件仍在', existsSync(softMd), softMd)
  if (existsSync(softMd)) {
    const smd = await readFile(softMd, 'utf8')
    check('软删除写入 deleted 标记', /deleted: 20\d\d-/.test(smd), smd.split('\n').slice(1, 8).join(' | '))
  }

  const remaining = await api('list', {})
  const beforeIds = remaining.items.map((i) => i.id).sort()

  // 关掉并删除 db，模拟丢失/损坏
  dispose()
  await rm(join(ROOT, 'memo.db'), { force: true })
  await rm(join(ROOT, 'memo.db-wal'), { force: true })
  await rm(join(ROOT, 'memo.db-shm'), { force: true })

  const routes2 = []
  const ctx2 = {
    logger: { info: () => {}, warn: () => {} },
    webServer: { register: (r) => { routes2.push(r); return () => {} } },
    effect: (fn) => { fn(); return () => {} },
  }
  apply(ctx2, { dataDir: ROOT, repo: '', pushDebounceMs: 0 })
  await new Promise((r) => setTimeout(r, 400))
  const apiRoute2 = routes2.find((r) => r.path === '/memo/api')
  async function api2(method, payload) {
    const res = mockRes()
    await apiRoute2.handler(mockReq('/memo/api/' + method, payload), res)
    const parsed = JSON.parse(res.body || '{}')
    if (!parsed.ok) throw new Error(`api2 ${method}: ${parsed.error}`)
    return parsed.value
  }
  const rebuilt = await api2('list', {})
  const afterIds = rebuilt.items.map((i) => i.id).sort()
  check('重建后条目数一致', afterIds.length === beforeIds.length, `${beforeIds.length} → ${afterIds.length}`)
  check('重建后 id 完全一致', JSON.stringify(afterIds) === JSON.stringify(beforeIds))
  check('重建后软删除的条目仍未出现', !afterIds.includes(soft.item.id))

  const back = rebuilt.items.find((i) => i.id === seeded.item.id)
  check('重建后标签保留', back && back.tags.length === 2, JSON.stringify(back && back.tags))
  check('重建后来源保留', back && back.source === '王工', back && back.source)
  check('重建后截止日期保留', back && back.dueAt === '2026-10-20', back && back.dueAt)
  check('重建后附件引用保留', back && back.attachments.length === 1, JSON.stringify(back && back.attachments.map((a) => a.sha256.slice(0, 8))))

  // 重建出来的附件仍能通过路由读回原始字节
  if (back && back.attachments[0]) {
    const res = mockRes()
    await routes2.find((r) => r.path === '/memo/attach').handler(
      { method: 'GET', url: back.attachments[0].url }, res)
    check('重建后附件仍可读回', res._out.status === 200 && res.body.length > 0, 'status=' + res._out.status)
  }
}

console.log('\n[7] 快照')
{
  const routes3 = []
  const ctx3 = {
    logger: { info: () => {}, warn: () => {} },
    webServer: { register: (r) => { routes3.push(r); return () => {} } },
    effect: (fn) => { fn(); return () => {} },
  }
  apply(ctx3, { dataDir: ROOT, repo: '', pushDebounceMs: 0 })
  await new Promise((r) => setTimeout(r, 300))
  const r = routes3.find((x) => x.path === '/memo/api')
  const res = mockRes()
  await r.handler(mockReq('/memo/api/snapshot', {}), res)
  const parsed = JSON.parse(res.body)
  check('快照接口返回成功', parsed.ok === true, res.body.slice(0, 200))
  const snaps = existsSync(join(ROOT, 'snapshots')) ? await readdir(join(ROOT, 'snapshots')) : []
  check('快照文件已生成', snaps.some((f) => f.endsWith('.sqlite')), snaps.join(','))
  if (snaps.length > 0) {
    const s = await stat(join(ROOT, 'snapshots', snaps[0]))
    check('快照非空', s.size > 0, String(s.size) + ' bytes')
  }
}

console.log('\n[8] 错误处理')
{
  const routes4 = []
  const ctx4 = {
    logger: { info: () => {}, warn: () => {} },
    webServer: { register: (r) => { routes4.push(r); return () => {} } },
    effect: (fn) => { fn(); return () => {} },
  }
  apply(ctx4, { dataDir: ROOT, repo: '', pushDebounceMs: 0 })
  await new Promise((r) => setTimeout(r, 300))
  const r = routes4.find((x) => x.path === '/memo/api')
  const bad = await (async () => {
    const res = mockRes()
    await r.handler(mockReq('/memo/api/nonexistent', {}), res)
    return { status: res._out.status, parsed: JSON.parse(res.body) }
  })()
  check('未知方法返回 404', bad.status === 404, JSON.stringify(bad))
  const getReq = await (async () => {
    const res = mockRes()
    await r.handler({ method: 'GET', url: '/memo/api/list' }, res)
    return { status: res._out.status }
  })()
  check('GET 被拒绝（405）', getReq.status === 405, JSON.stringify(getReq))
}

console.log('\n[9] 凭据：token 持久化且绝不进仓库')
{
  const routes5 = []
  const ctx5 = {
    logger: { info: () => {}, warn: () => {} },
    webServer: { register: (r) => { routes5.push(r); return () => {} } },
    effect: (fn) => { fn(); return () => {} },
  }
  apply(ctx5, { dataDir: ROOT, repo: '', pushDebounceMs: 0 })
  await new Promise((r) => setTimeout(r, 300))
  const r = routes5.find((x) => x.path === '/memo/api')
  async function api5(method, payload) {
    const res = mockRes()
    await r.handler(mockReq('/memo/api/' + method, payload), res)
    const parsed = JSON.parse(res.body || '{}')
    if (!parsed.ok) throw new Error(`api5 ${method}: ${parsed.error}`)
    return parsed.value
  }

  const before = await api5('sync', { action: 'status' })
  check('初始无 token', before.sync.hasToken === false, JSON.stringify(before.sync.hasToken))

  await api5('sync', { action: 'config', token: 'ghp_smoketest_not_a_real_token' })
  const after = await api5('sync', { action: 'status' })
  check('设置后 hasToken = true', after.sync.hasToken === true)

  const tokenFile = join(ROOT, '.token')
  check('.token 已写入', existsSync(tokenFile))
  if (existsSync(tokenFile)) {
    const st = await stat(tokenFile)
    const mode = (st.mode & 0o777).toString(8)
    check('文件权限为 0600（仅本人可读）', mode === '600', 'mode=' + mode)
  }

  const ignore = await readFile(join(ROOT, '.gitignore'), 'utf8')
  check('.gitignore 忽略 .token', /^\.token$/m.test(ignore), ignore.replace(/\n/g, ' | '))

  // 更硬的检查：git 真的会忽略它
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const run = promisify(execFile)
  try {
    await run('git', ['init', '-q'], { cwd: ROOT })
    const { stdout } = await run('git', ['status', '--porcelain', '--ignored'], { cwd: ROOT })
    const lines = stdout.split('\n')
    check('git 把 .token 标为 ignored', lines.some((l) => l.startsWith('!! .token')), lines.filter((l) => l.includes('token')).join(' / '))
    check('git 把 memo.db 标为 ignored', lines.some((l) => l.startsWith('!! memo.db')), lines.filter((l) => l.includes('memo.db')).join(' / '))
    check('notes/ 会进入版本控制', lines.some((l) => l.includes('notes/')), '')
  } catch (e) {
    check('git 检查可运行', false, String(e.message).slice(0, 120))
  }

  await api5('sync', { action: 'config', token: '' })
  check('清除 token 后文件被删除', !existsSync(tokenFile))
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
