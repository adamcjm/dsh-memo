// 真实挂载回归：用 jsdom + React 把面板真正渲染出来，确认数据加载后
// 每个日期分组容器都挂上了 SortableJS 实例。
// 背景：0.2.7 里拖拽 useEffect 写在 `var grouped = useMemo(...)` 之前，var 提升
// 让依赖恒为 undefined，effect 只在首屏（列表还是空的）跑过一次 —— 界面上有
// cursor:grab 的手掌图标，但拖拽永远不会被接管。这个测试就是守这条。
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

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', { url: 'http://localhost/' })
const define = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true })
define('window', dom.window)
define('document', dom.window.document)
define('navigator', dom.window.navigator)
define('HTMLElement', dom.window.HTMLElement)
define('Element', dom.window.Element)
define('Node', dom.window.Node)
define('getComputedStyle', dom.window.getComputedStyle.bind(dom.window))
globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)

let React, ReactDOMClient
try {
  React = req('react')
  ReactDOMClient = req('react-dom/client')
} catch (e) {
  console.log('跳过：测试环境解析不到 react / react-dom（' + String(e.message).slice(0, 60) + '）')
  process.exit(0)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const today = new Date().toISOString()
const ITEMS = [1, 2, 3].map((n) => ({
  id: 'i' + n, body: '第 ' + n + ' 条', done: false, pinned: false, source: '', dueAt: '',
  createdAt: today, updatedAt: today, rev: 1, tags: [], attachments: [],
}))
define('fetch', async (url) => {
  const method = String(url).split('/memo/api/')[1]
  let value = {}
  if (method === 'bootstrap') value = { items: ITEMS, tags: [], stats: { total: 3, todo: 3, done: 0, withImage: 0 }, sync: {}, config: { repo: '' }, defaultTags: [] }
  else if (method === 'list') value = { items: ITEMS }
  else if (method === 'tags') value = { tags: [] }
  return { ok: true, json: async () => ({ ok: true, value }) }
})

console.log('面板真实挂载（jsdom + React）\n')

const code = await readFile(join(HERE, '..', 'lib', 'client.js'), 'utf8')
let registered = null
window.__ModuleLoader__ = { load: (mod) => { registered = mod } }
new Function('window', 'document', 'fetch', code)(window, document, globalThis.fetch)
check('bundle 注册了 factory', !!registered)
if (!registered) { console.log(`\n结果：${pass} 通过 / ${fail} 失败`); process.exit(1) }

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
check('注册了 main 面板组件', typeof Panel === 'function')
if (!Panel) { console.log(`\n结果：${pass} 通过 / ${fail} 失败`); process.exit(1) }

ReactDOMClient.createRoot(document.getElementById('root')).render(React.createElement(Panel))
await sleep(1200)

const cards = Array.from(document.querySelectorAll('.dm-card'))
const containers = Array.from(document.querySelectorAll('.dm-cards'))
check('列表真的渲染出了卡片', cards.length === 3, String(cards.length))
check('卡片被放进日期分组容器', containers.length === 1, String(containers.length))
const expandoKeys = (el) => Object.keys(el).filter((k) => k.startsWith('Sortable'))
const mounted = containers.filter((el) => expandoKeys(el).length > 0)
check('★ 每个分组容器都挂上了 SortableJS 实例（拖拽会被接管）',
  containers.length > 0 && mounted.length === containers.length,
  `挂载 ${mounted.length}/${containers.length}`)
check('实例的 expando 形如 Sortable<ts>', mounted.length > 0 && /^Sortable\d+$/.test(expandoKeys(mounted[0])[0]), mounted.length ? expandoKeys(mounted[0]).join(',') : '')
check('卡片带 data-id（拖完能算出新顺序）', cards.length === 3 && cards.every((c) => !!c.getAttribute('data-id')))

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
