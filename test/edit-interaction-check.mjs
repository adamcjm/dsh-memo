// 主题与编辑交互回归（jsdom + React 真实挂载）
//
// 守两条曾经真实发作的 bug：
//   1. 保存按钮的前景色写死白色 —— 深色主题下品牌色本身是近白，白底白字，文案看不见。
//   2. SortableJS 的 filter 命中编辑态卡片 + preventOnFilter:true —— Chrome 下 Sortable
//      监听 pointerdown，filter 命中就 preventDefault，连带抑制 mousedown，
//      而"点进文本域获得光标"正是 mousedown 的默认行为，于是编辑区点不动、没有光标。
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const req = createRequire(import.meta.url)

let JSDOM
try { ({ JSDOM } = req('jsdom')) } catch {
  console.log('跳过：未安装 jsdom（本测试需要它来真实挂载 React，可 `npm i jsdom` 后重跑）')
  process.exit(0)
}

let pass = 0, fail = 0
const check = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n) } else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + x : '')) } }

const code = await readFile(join(HERE, '..', 'lib', 'client.js'), 'utf8')

console.log('主题前景色与编辑交互\n')

console.log('[1] 保存按钮的前景色跟随主题')
{
  const lines = code.split('\n').map((l) => l.trim())
  const pri = lines.find((l) => l.indexOf("'.dm-btn.pri{") === 0)
  check('找到 .dm-btn.pri 规则', !!pri)
  check('前景色用主题 token 而不是写死的白',
    !!pri && /color:var\(--dsw-alias-[a-z-]+\)/.test(pri) && !/#fff|white/i.test(pri),
    pri)
  check('.dm-edit-ta 显式声明 cursor:text（不被 .dm-card 的 grab 覆盖）',
    lines.some((l) => l.indexOf("'.dm-edit-ta{") === 0 && /cursor:text/.test(l)))
}

// ---- 真实挂载 ----
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: 'http://localhost/' })
const define = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true })
define('window', dom.window)
define('document', dom.window.document)
define('navigator', dom.window.navigator)
define('HTMLElement', dom.window.HTMLElement)
define('Element', dom.window.Element)
define('Node', dom.window.Node)
define('getComputedStyle', dom.window.getComputedStyle.bind(dom.window))
// SortableJS 内部用裸的 CustomEvent 派发 filter/drag 事件；不给它 jsdom 的实现，
// jsdom 会因"不是本 realm 的 Event"抛错，异常会把 filter 分支整段打断，
// preventDefault 也就永远不会执行 —— 那样这个测试就失去区分度了。
for (const k of ['Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'PointerEvent']) {
  if (dom.window[k]) define(k, dom.window[k])
}
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

const React = req('react')
const ReactDOMClient = req('react-dom/client')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const today = new Date().toISOString()
const ITEMS = [1, 2].map((n) => ({
  id: 'i' + n, body: '第 ' + n + ' 条', done: false, pinned: false, source: '', dueAt: '',
  createdAt: today, updatedAt: today, rev: 1, tags: [], attachments: [],
}))
define('fetch', async (url) => {
  const method = String(url).split('/memo/api/')[1]
  let value = {}
  if (method === 'bootstrap') value = { items: ITEMS, tags: [], stats: { total: 2, todo: 2, done: 0, withImage: 0 }, sync: {}, config: { repo: '' }, defaultTags: [] }
  else if (method === 'list') value = { items: ITEMS }
  else if (method === 'tags') value = { tags: [] }
  return { ok: true, json: async () => ({ ok: true, value }) }
})

let registered = null
window.__ModuleLoader__ = { load: (mod) => { registered = mod } }
new Function('window', 'document', 'fetch', code)(window, document, globalThis.fetch)

const ex = registered.factory((name) => {
  if (name === 'react') return React
  throw new Error('unexpected module ' + name)
})
const regs = []
let dict = null
ex.apply({
  effect: (f) => { f(); return () => {} },
  locale: { register: (ns, d) => { dict = d; return () => {} }, bind: () => (k) => (dict && dict.zh && dict.zh[k]) || k },
  slots: { inject: (n, cb) => { cb(); return () => {} }, register: (o, C) => { regs.push({ o, C }); return () => {} } },
})
const Panel = (regs.find((r) => r.o.name === 'main') || {}).C
ReactDOMClient.createRoot(document.getElementById('root')).render(React.createElement(Panel))
await sleep(600)

const q = (s) => document.querySelector(s)
const qa = (s) => Array.from(document.querySelectorAll(s))
const press = (el) => {
  // Sortable 有 PointerEvent 就用 pointerdown，否则退回 mousedown；两条路径都会走 filter 分支
  const Ctor = window.PointerEvent || window.MouseEvent
  const type = window.PointerEvent ? 'pointerdown' : 'mousedown'
  const ev = new Ctor(type, { bubbles: true, cancelable: true, button: 0 })
  el.dispatchEvent(ev)
  return ev
}

console.log('\n[2] 拖拽实例的过滤配置')
{
  const container = q('.dm-cards')
  const key = container && Object.keys(container).find((k) => k.startsWith('Sortable'))
  const inst = key && container[key]
  check('分组容器挂上了 SortableJS', !!inst)
  check('编辑态卡片仍被挡在拖拽之外（filter 命中即不拖）',
    !!inst && String(inst.options.filter).indexOf('.dm-card.editing') >= 0, inst && inst.options.filter)
  check('★ preventOnFilter 关掉了（否则 pointerdown 被吞，编辑区点不动）',
    !!inst && inst.options.preventOnFilter === false, inst && String(inst.options.preventOnFilter))
}

console.log('\n[3] 编辑态：点正文能拿到光标')
{
  const editBtn = q('.dm-act .dm-ib')
  check('卡片上有编辑按钮', !!editBtn)
  editBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
  await sleep(120)

  const ta = q('.dm-edit-ta')
  check('编辑态渲染出正文文本域', !!ta)
  check('文本域可编辑（不是 readonly/disabled）', !!ta && !ta.readOnly && !ta.disabled)
  check('编辑态卡片带着 .dm-card.editing 类', !!q('.dm-card.editing'))

  const ev = press(ta)
  check('★ 文本域上的按下事件没有被 preventDefault（浏览器据此聚焦）',
    ev.defaultPrevented === false, 'defaultPrevented=' + ev.defaultPrevented)

  const rowEv = press(q('.dm-edit-row .dm-btn'))
  check('编辑行里的图片按钮同样不被吞', rowEv.defaultPrevented === false)

  const cancel = qa('.dm-edit-row .dm-btn').pop()
  cancel.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
  await sleep(80)
  check('取消后编辑态收起', !q('.dm-edit-ta'))
}

console.log('\n[4] 普通卡片的拖拽没有被误伤')
{
  const ev = press(q('.dm-card:not(.editing) .dm-txt'))
  check('普通卡片上按下不阻止默认行为（拖拽走 fallback，不需要抢默认行为）',
    ev.defaultPrevented === false, 'defaultPrevented=' + ev.defaultPrevented)
  const container = q('.dm-cards')
  const key = Object.keys(container).find((k) => k.startsWith('Sortable'))
  check('Sortable 实例仍在（没被编辑态来回切坏）', !!container[key])
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
