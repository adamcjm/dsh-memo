// 标签规则 / 编辑往返回归：正文任意位置识别、正文保真、编辑不丢标签、host 与 client 规则一致
import { rm, readFile } from 'node:fs/promises'
import { apply } from '../lib/index.js'

const ROOT = '/tmp/dsh-memo-tag-rules'
let pass = 0, fail = 0
const check = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n) } else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + x : '')) } }

/* 从 client.js 里真实提取客户端函数，保证测的是线上那份逻辑 */
const src = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
function grab(name) {
  const m = src.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}'))
  if (!m) throw new Error('client.js 里找不到 ' + name)
  return m[0]
}
const client = new Function([
  grab('extractTagsFrom'),
  grab('withTagsInBody'),
  'return { extractTagsFrom: extractTagsFrom, withTagsInBody: withTagsInBody }',
].join('\n'))()

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
await rm(ROOT, { recursive: true, force: true })
const routes = []
apply({
  logger: { info: () => {}, warn: () => {} },
  webServer: { register: (r) => { routes.push(r); return () => {} } },
  effect: (fn) => { fn(); return () => {} },
}, { dataDir: ROOT, repo: '', pushDebounceMs: 0 })
await new Promise((r) => setTimeout(r, 300))
const route = routes.find((r) => r.path === '/memo/api')
async function api(method, payload) {
  const res = mockRes()
  await route.handler(mockReq('/memo/api/' + method, payload), res)
  const parsed = JSON.parse(res.body || '{}')
  if (!parsed.ok) throw new Error(`${method}: ${parsed.error}`)
  return parsed.value
}
const sorted = (a) => JSON.stringify(a.slice().sort())

console.log('标签规则与编辑往返\n')

console.log('[1] 标签在正文任意位置都能识别（不再只有末尾生效）')
{
  const cases = [
    ['末尾（空格分隔）', '买牛奶 记得开发票 #购物', ['购物'], '买牛奶 记得开发票'],
    ['末尾（独立一行）', '买牛奶\n记得开发票\n#购物', ['购物'], '买牛奶\n记得开发票'],
    ['中间（空格分隔）', '买牛奶 #购物 记得开发票', ['购物'], '买牛奶 记得开发票'],
    ['中间（逗号紧贴）', '买牛奶，#购物 记得开发票', ['购物'], '买牛奶， 记得开发票'],
    ['中间（中文无分隔）', '买牛奶#购物 记得开发票', ['购物'], '买牛奶 记得开发票'],
    ['开头（空格）', '#购物 买牛奶', ['购物'], '买牛奶'],
    ['多行中间行首', '买牛奶\n#购物\n记得开发票', ['购物'], '买牛奶\n\n记得开发票'],
    ['后跟中文标点', '买牛奶 #购物，记得开发票', ['购物'], '买牛奶 ，记得开发票'],
    ['后跟半角逗号', '买牛奶 #购物, 记得开发票', ['购物'], '买牛奶 , 记得开发票'],
    ['圆括号包裹', '买牛奶（#购物）记得开发票', ['购物'], '买牛奶（）记得开发票'],
    ['方括号包裹', '买牛奶[#购物]记得开发票', ['购物'], '买牛奶[]记得开发票'],
    ['正文末尾无分隔符', '买牛奶记得开发票#购物', ['购物'], '买牛奶记得开发票'],
    ['一条正文多个标签', 'a #甲 b #乙 c', ['甲', '乙'], 'a b c'],
  ]
  for (const [name, body, wantTags, wantBody] of cases) {
    const v = await api('create', { body })
    check(`识别：${name}`, sorted(v.item.tags) === sorted(wantTags), JSON.stringify(v.item.tags))
    check(`正文保真：${name}`, v.item.body === wantBody, JSON.stringify(v.item.body))
  }
}

console.log('\n[2] 正文不被标签吞掉（旧实现会把标签后的整段文字删掉）')
{
  const v = await api('create', { body: '买牛奶 #购物，记得开发票' })
  check('标点后的正文还在', v.item.body.includes('记得开发票'), JSON.stringify(v.item.body))
  const v2 = await api('create', { body: '开会 #工作 明天要交' })
  check('空格后的正文还在', v2.item.body === '开会 明天要交', JSON.stringify(v2.item.body))
}

console.log('\n[3] host 与 client 的标签规则逐例一致')
{
  const samples = [
    '买牛奶 记得开发票 #购物',
    '买牛奶，#购物 记得开发票',
    '买牛奶#购物 记得开发票',
    '买牛奶（#购物）记得开发票',
    'a #甲 b #乙 c',
    'C# 不算标签',
    'issue#12 也不算',
    '带标点 #购物，记得',
  ]
  for (const s of samples) {
    const v = await api('create', { body: s })
    check(`一致：${s}`, sorted(v.item.tags) === sorted(client.extractTagsFrom(s)),
      `host=${JSON.stringify(v.item.tags)} client=${JSON.stringify(client.extractTagsFrom(s))}`)
  }
}

console.log('\n[4] 编辑已有备忘：标签看得见、存得回（核心回归）')
{
  const v = await api('create', { body: '张总要原型 #需求变更 #登录' })
  const it = v.item
  check('创建后正文里没有 #标签（存储层剥离）', it.body === '张总要原型', JSON.stringify(it.body))

  // 模拟点击「编辑」：startEdit 用 withTagsInBody 把标签并回正文
  const editBody = client.withTagsInBody(it.body, it.tags)
  check('编辑框里能看到 #需求变更', editBody.includes('#需求变更'), JSON.stringify(editBody))
  check('编辑框里能看到 #登录', editBody.includes('#登录'), JSON.stringify(editBody))

  // 模拟用户直接点「保存」，不做任何修改
  const v2 = await api('update', {
    id: it.id,
    patch: { body: editBody, tags: client.extractTagsFrom(editBody) },
  })
  check('★ 直接保存后标签没有丢', sorted(v2.item.tags) === sorted(it.tags), JSON.stringify(v2.item.tags))
  check('正文也没被污染', v2.item.body === it.body, JSON.stringify(v2.item.body))

  // 连点三次编辑保存：标签不重复、正文不膨胀
  let cur = v2.item
  for (let i = 0; i < 3; i++) {
    const eb = client.withTagsInBody(cur.body, cur.tags)
    const r = await api('update', { id: it.id, patch: { body: eb, tags: client.extractTagsFrom(eb) } })
    cur = r.item
  }
  check('多次编辑标签仍为 2 个', cur.tags.length === 2, JSON.stringify(cur.tags))
  check('多次编辑正文不膨胀', cur.body === it.body, JSON.stringify(cur.body))
}

console.log('\n[5] 编辑时按设计删标签仍然生效')
{
  const v = await api('create', { body: '写方案 #甲 #乙' })
  const editBody = client.withTagsInBody(v.item.body, v.item.tags)
  const without = editBody.replace(/#乙/g, '').trim()
  const v2 = await api('update', { id: v.item.id, patch: { body: without, tags: client.extractTagsFrom(without) } })
  check('删掉 #乙 后只剩 #甲', sorted(v2.item.tags) === JSON.stringify(['甲']), JSON.stringify(v2.item.tags))
}

console.log('\n[6] 不误判：C# / issue#12 / 空标签')
{
  for (const body of ['用 C# 写了个工具', '见 issue#12 的讨论', '正文里只有一个 # 符号']) {
    const v = await api('create', { body })
    check(`不误判：${JSON.stringify(body)}`, v.item.tags.length === 0, JSON.stringify(v.item.tags))
    check(`不误删正文：${JSON.stringify(body)}`, v.item.body === body, JSON.stringify(v.item.body))
  }
}

console.log('\n[7] 编辑框里标签已存在的部分不重复追加')
{
  const body = '带有 #甲 的正文'
  const merged = client.withTagsInBody(body, ['甲', '乙'])
  check('已有的 #甲 不重复', (merged.match(/#甲/g) || []).length === 1, JSON.stringify(merged))
  check('缺的 #乙 被补上', merged.includes('#乙'), JSON.stringify(merged))
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
