// dsh-memo client 半侧预检
//
// 在安装并重启 DSH 之前，模拟 DSH 客户端模块系统的加载协议，验证：
//   1. bundle 只做 factory 注册，不产生模块级副作用
//   2. factory 能被物化，导出 cordis 插件形态 { inject, apply }
//   3. apply() 真的向 slots 注册了 sidebar.panellist 与 main，且 id/key 一致
//   4. 两个组件都能真实渲染出 DOM（用 react-dom/server）
// 这样"装上去是坏的"这类问题在重启之前就能发现。
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const BUNDLE = join(HERE, '..', 'lib', 'client.js')
const req = createRequire(import.meta.url)

let pass = 0
let fail = 0
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' → ' + extra : ''}`) }
}

console.log('dsh-memo client precheck\n')

// ---- 解析 React（模拟平台模块表） ----
let React, ReactDOMServer
try {
  React = req('react')
  ReactDOMServer = req('react-dom/server')
} catch (e) {
  // 回退：从 DSH profile 的 node_modules 里借 React（跑测试的机器通常已经有）
  const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
  const tried = []
  for (const rel of ['profiles/desktop', 'profiles/web', 'profiles/dsh-tui']) {
    try {
      const alt = createRequire(join(dshHome, rel, 'node_modules') + '/')
      React = alt('react')
      ReactDOMServer = alt('react-dom/server')
      break
    } catch (err) { tried.push(rel) }
  }
  if (!React) {
    console.error('无法解析 react / react-dom/server。')
    console.error('请在已安装 DSH 的机器上运行，或先执行：npm i react react-dom')
    console.error('（已尝试的 profile：' + tried.join(', ') + '）')
    process.exit(2)
  }
  console.log('  ! 从 DSH profile 借用了 React:', process.env.DSH_HOME || '~/.dsh')
}
check('React 可解析', !!React && typeof React.createElement === 'function')
check('react-dom/server 可解析', !!ReactDOMServer)

// ---- 模拟浏览器环境 ----
const styleNodes = []
globalThis.window = globalThis.window || {}
let registered = null
globalThis.window.__ModuleLoader__ = {
  load(spec) {
    if (registered) throw new Error('bundle 重复注册 factory')
    registered = spec
  },
}
globalThis.document = {
  head: { appendChild: (el) => styleNodes.push(el) },
  createElement: (tag) => ({ tag, attrs: {}, textContent: '', setAttribute(k, v) { this.attrs[k] = v }, remove() { this.removed = true } }),
}

// ---- 执行 bundle：只应注册 factory ----
{
  const code = await readFile(BUNDLE, 'utf8')
  const run = new Function('window', 'document', 'fetch', code)
  run(globalThis.window, globalThis.document, () => { throw new Error('unexpected fetch during load') })
  check('bundle 执行后注册了 factory', !!registered)
  check('注册 id 等于包名', registered?.id === 'dsh-memo', String(registered?.id))
  check('注册时未产生副作用（无样式注入）', styleNodes.length === 0, `styles=${styleNodes.length}`)
}

// ---- 物化 factory ----
const moduleExports = registered.factory((name) => {
  if (name === 'react') return React
  if (name === 'react-dom') return req('react-dom')
  throw new Error(`unexpected require("${name}") — 应只依赖平台模块表`)
})
check('导出 apply', typeof moduleExports.apply === 'function')
check('导出 inject 且含 slots', Array.isArray(moduleExports.inject) && moduleExports.inject.includes('slots'), JSON.stringify(moduleExports.inject))

// ---- 调用 apply，捕获 slot 注册 ----
const registrations = []
const injections = []
const ctx = {
  effect(fn, label) { const d = fn(); return typeof d === 'function' ? d : () => {} },
  slots: {
    inject(name, cb) { injections.push(name); const d = cb(); return typeof d === 'function' ? d : () => {} },
    register(options, Component) { registrations.push({ options, Component }); return () => {} },
  },
}
moduleExports.apply(ctx)

check('调用了 slots.inject', injections.length >= 2, injections.join(','))
check('样式已注入 <head>', styleNodes.length === 1, `styles=${styleNodes.length}`)

const panel = registrations.find((r) => r.options.name === 'main')
const icon = registrations.find((r) => r.options.name === 'sidebar.panellist')
check('注册了 main 面板', !!panel)
check('注册了 sidebar.panellist 图标', !!icon)
check('两者的 key/id 一致（这是侧边栏点击切面板的机制）',
  panel && icon && panel.options.key === icon.options.id,
  `key=${panel?.options.key} id=${icon?.options.id}`)
check('图标注册带 order', typeof icon?.options.order === 'number', String(icon?.options.order))
check('label 解析为「备忘录」', typeof icon?.options.label === 'function' && icon.options.label() === '备忘录', String(icon?.options.label?.()))
check('面板组件是函数组件', typeof panel?.Component === 'function')
check('图标组件是函数组件', typeof icon?.Component === 'function')

// ---- 真实渲染 ----
{
  const ok = (() => {
    try {
      const html = ReactDOMServer.renderToStaticMarkup(React.createElement(panel.Component))
      return html
    } catch (e) { return 'ERR:' + e.message }
  })()
  check('主面板能渲染出 DOM', ok.startsWith('<') && !ok.startsWith('ERR:'), ok.slice(0, 160))
  check('主面板含标题「备忘录」', ok.includes('备忘录'), ok.slice(0, 120))
  check('主面板含快速记录框', ok.includes('记点什么'), '')
  check('主面板含筛选 chips', ok.includes('待处理') && ok.includes('已完成'))

  const iconHtml = (() => {
    try { return ReactDOMServer.renderToStaticMarkup(React.createElement(icon.Component, { size: 18, active: true })) }
    catch (e) { return 'ERR:' + e.message }
  })()
  check('图标能渲染', iconHtml.startsWith('<svg'), iconHtml.slice(0, 120))
  check('图标尺寸跟随传入的 size', iconHtml.includes('width="18"'), iconHtml.slice(0, 80))
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
