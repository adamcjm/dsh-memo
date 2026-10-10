// 日期维度「正序 / 倒序」切换回归：用 jsdom + React 真实挂载面板，真的点那个按钮。
// 守三条：
//   1. 一个按钮只显示一个方向文案（正序 / 倒序 二选一），位置在「置顶」筛选右侧；
//   2. 切换只改日期分组的先后 —— 倒序=今天在上，正序=最早在上；
//   3. 同一天内的条目顺序原样不动（那是用户自己拖出来的，不属于日期维度）。
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
const at = (daysAgo, hour) => {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}
const mk = (id, daysAgo, hour, body) => ({
  id, body, done: false, pinned: false, source: '', dueAt: '',
  createdAt: at(daysAgo, hour), updatedAt: at(daysAgo, hour), rev: 1, tags: [], attachments: [],
})

// 今天两条刻意「逆时间」排列（A2 比 A1 早，却排在前面），模拟用户自己拖过的组内顺序；
// 宿主返回的默认顺序是 今天 → 昨天 → 前天（即倒序）。
const ITEMS = [
  mk('A2', 0, 9, '今天第二条'),
  mk('A1', 0, 10, '今天第一条'),
  mk('B1', 1, 15, '昨天'),
  mk('C1', 3, 11, '前天'),
]

define('fetch', async (url) => {
  const method = String(url).split('/memo/api/')[1]
  let value = {}
  if (method === 'bootstrap') value = { items: ITEMS, tags: [], stats: { total: 4, todo: 4, done: 0, withImage: 0 }, sync: {}, config: { repo: '' }, defaultTags: [] }
  else if (method === 'list') value = { items: ITEMS }
  else if (method === 'tags') value = { tags: [] }
  return { ok: true, json: async () => ({ ok: true, value }) }
})

console.log('日期维度正序/倒序切换（jsdom + React，真点按钮）\n')

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

const readGroups = () => Array.from(document.querySelectorAll('.dm-group')).map((g) => ({
  day: (g.querySelector('.dm-day') || {}).textContent || '',
  ids: Array.from(g.querySelectorAll('.dm-card')).map((c) => c.getAttribute('data-id')),
}))
const sortBtn = () => document.querySelector('.dm-sortdir')
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))

/* ---------- 首屏：默认倒序（今天在最上） ---------- */
let root = ReactDOMClient.createRoot(document.getElementById('root'))
root.render(React.createElement(Panel))
await sleep(1200)

const btn0 = sortBtn()
check('渲染出了排序按钮', !!btn0)
if (!btn0) { console.log(`\n结果：${pass} 通过 / ${fail} 失败`); process.exit(1) }

{
  const kids = Array.from(document.querySelector('.dm-filters').children)
  check('排序按钮是筛选行最后一个（在「置顶」右侧）',
    kids[kids.length - 1].classList.contains('dm-sortdir') && kids[kids.length - 1] === btn0)
  check('它左边紧邻的正是「置顶」', String(kids[kids.length - 2].textContent).indexOf('置顶') === 0,
    String(kids[kids.length - 2].textContent))
}

{
  const txt = btn0.textContent.trim()
  check('按钮文案是当前方向之一（不是两个一起显示）', txt === '倒序' || txt === '正序', JSON.stringify(txt))
  check('★ 正序/倒序不会同时出现', !(btn0.textContent.includes('正序') && btn0.textContent.includes('倒序')), JSON.stringify(btn0.textContent))
  check('默认显示「倒序」', txt === '倒序', JSON.stringify(txt))
  check('title 说明当前方向与下一步', /倒序/.test(btn0.getAttribute('title') || '') && /正序/.test(btn0.getAttribute('title') || ''), btn0.getAttribute('title'))
  check('按钮带方向箭头图标', !!btn0.querySelector('svg'))
}

const descGroups = readGroups()
check('分成 3 个日期组', descGroups.length === 3, String(descGroups.length))
check('★ 默认倒序：今天在最上', descGroups[0].day === '今天' && descGroups[0].ids.join(',') === 'A2,A1', JSON.stringify(descGroups[0]))
check('倒序：越往下越久远', descGroups[1].day === '昨天' && descGroups[2].ids.join(',') === 'C1', JSON.stringify(descGroups.map((g) => g.day)))

/* ---------- 点一下：切到正序（最早在最上） ---------- */
click(btn0)
await sleep(300)

const btn1 = sortBtn()
{
  const txt = btn1.textContent.trim()
  check('★ 切换后仍只显示一个方向', txt === '正序' && !(btn1.textContent.includes('倒序')), JSON.stringify(txt))
  check('切换后文案变为「正序」', txt === '正序', JSON.stringify(txt))
}

const ascGroups = readGroups()
check('★ 正序：最早的日期在最上', ascGroups[0].ids.join(',') === 'C1', JSON.stringify(ascGroups.map((g) => g.ids.join(','))))
check('正序：今天落在最下', ascGroups[ascGroups.length - 1].day === '今天' && ascGroups[ascGroups.length - 1].ids.join(',') === 'A2,A1', JSON.stringify(ascGroups[ascGroups.length - 1]))
check('★ 组内顺序没被动过（正序）', ascGroups[2].ids.join(',') === 'A2,A1', ascGroups[2].ids.join(','))
check('正序与倒序是同一批分组、只是顺序颠倒',
  ascGroups.map((g) => g.ids.join(',')).join('|') === descGroups.map((g) => g.ids.join(',')).reverse().join('|'),
  ascGroups.map((g) => g.ids.join(',')).join('|'))

/* ---------- 再点一下：转回倒序 ---------- */
click(sortBtn())
await sleep(300)
const backGroups = readGroups()
check('可以来回切换（再点回到倒序）', backGroups[0].day === '今天' && sortBtn().textContent.trim() === '倒序',
  JSON.stringify(backGroups.map((g) => g.day)) + ' / ' + sortBtn().textContent.trim())
check('★ 来回切换后组内顺序仍未被改动', backGroups[0].ids.join(',') === 'A2,A1', backGroups[0].ids.join(','))

/* ---------- 偏好持久化：重开面板仍生效 ---------- */
click(sortBtn())                       // → 正序
await sleep(300)
check('偏好写入 localStorage', window.localStorage.getItem('dsh-memo.sortDir') === 'asc', String(window.localStorage.getItem('dsh-memo.sortDir')))

root.unmount()
await sleep(50)
const box = document.createElement('div')
document.body.appendChild(box)
root = ReactDOMClient.createRoot(box)
root.render(React.createElement(Panel))
await sleep(1200)
check('★ 重开面板沿用上次选择（正序）', sortBtn() && sortBtn().textContent.trim() === '正序' && readGroups()[0].ids.join(',') === 'C1',
  (sortBtn() ? sortBtn().textContent.trim() : 'no-btn') + ' / ' + readGroups().map((g) => g.ids.join(',')).join('|'))

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
