// 国际化验证：DSH 切到英文时，插件界面必须跟着变英文
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const req = createRequire(import.meta.url)
let React, RDS
try { React = req('react'); RDS = req('react-dom/server') } catch {
  const os = req('node:os'), path = req('node:path')
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  for (const rel of ['profiles/desktop', 'profiles/web']) {
    try { const alt = createRequire(path.join(dshHome, rel, 'node_modules') + '/'); React = alt('react'); RDS = alt('react-dom/server'); break } catch {}
  }
}
if (!React) { console.error('需要 react / react-dom'); process.exit(2) }

let pass = 0, fail = 0
const check = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n) } else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + x : '')) } }
const hasCJK = (s) => /[\u4e00-\u9fa5]/.test(s)

let reg = null, dict = null
globalThis.window = { __ModuleLoader__: { load: (s) => { reg = s } } }
globalThis.document = { head: { appendChild() {} }, createElement: () => ({ setAttribute() {}, remove() {}, textContent: '' }) }
new Function('window', 'document', 'fetch', await readFile(join(HERE, '..', 'lib', 'client.js'), 'utf8'))(
  globalThis.window, globalThis.document, async () => ({ json: async () => ({ ok: true, value: {} }) }))

const ex = reg.factory((n) => { if (n === 'react') return React; throw new Error('unexpected ' + n) })
const regs = []
ex.apply({
  effect: (f) => { f(); return () => {} },
  locale: { register: (ns, d) => { dict = d; return () => {} }, bind: (ns) => (k) => (dict && dict.zh && dict.zh[k]) || k },
  slots: { inject: (n, cb) => { cb(); return () => {} }, register: (o, C) => { regs.push({ o, C }); return () => {} } },
})

console.log('国际化验证（DSH 切换到英文时）\n')

const Panel = regs.find((r) => r.o.name === 'main').C
const makeT = (lang) => (key, vars) => {
  const s = (dict[lang] && dict[lang][key]) !== undefined ? dict[lang][key] : key
  if (!vars) return s
  return String(s).replace(/\{(\w+)\}/g, (_, k) => (vars[k] === undefined ? '' : vars[k]))
}

console.log('[1] 字典本身')
check('声明了 zh / en 两套', !!(dict && dict.zh && dict.en))
const zhKeys = Object.keys(dict.zh).sort(), enKeys = Object.keys(dict.en).sort()
check('键位完全对应（不漏译）', JSON.stringify(zhKeys) === JSON.stringify(enKeys),
  zhKeys.filter((k) => !enKeys.includes(k)).join(',') || '')
check('英文值里没有中文残留', !enKeys.some((k) => hasCJK(dict.en[k])),
  enKeys.filter((k) => hasCJK(dict.en[k])).map((k) => k + '=' + dict.en[k]).join(' | ').slice(0, 120))

console.log('\n[2] 中文渲染（DSH 为中文时）')
const zhHtml = RDS.renderToStaticMarkup(React.createElement(Panel, { t: makeT('zh') }))
check('标题是「备忘录」', zhHtml.includes('备忘录'))
check('同步按钮是「立即同步」', zhHtml.includes('立即同步'))
check('筛选是「待处理」', zhHtml.includes('待处理'))
check('提示是中文', zhHtml.includes('打 #标签 自动创建'))

console.log('\n[3] 英文渲染（DSH 切换到英文时）')
const enHtml = RDS.renderToStaticMarkup(React.createElement(Panel, { t: makeT('en') }))
check('标题变成 Memo', enHtml.includes('>Memo<'))
check('同步按钮变成 Sync now', enHtml.includes('Sync now'))
check('筛选变成 Open', enHtml.includes('>Open'))
check('占位符是英文', enHtml.includes('Note something'))
check('加载态是英文', enHtml.includes('Loading'))
check('提示是英文', enHtml.includes('type #tag to create'))
const cjkInEn = enHtml.replace(/<[^>]*>/g, ' ').match(/[\u4e00-\u9fa5]+/g)
check('英文界面里没有中文残留', !cjkInEn, cjkInEn ? cjkInEn.join(',') : '')
check('中文渲染 ≠ 英文渲染（确实切换了）', zhHtml !== enHtml)

console.log('\n[4] 插值')
check('计数插值 zh', makeT('zh')('count', { total: 128, todo: 7 }) === '128 条 · 7 条待处理', makeT('zh')('count', { total: 128, todo: 7 }))
check('计数插值 en', makeT('en')('count', { total: 128, todo: 7 }) === '128 notes · 7 open', makeT('en')('count', { total: 128, todo: 7 }))
check('来源插值 en', makeT('en')('card.source', { source: 'Zhang' }) === 'Source: Zhang')
check('缺变量不炸', typeof makeT('en')('count', {}) === 'string')

console.log('\n[5] 兜底：locale 服务不可用时')
const fbHtml = RDS.renderToStaticMarkup(React.createElement(Panel))  // 不传 t
check('仍能渲染，退回内置中文', fbHtml.includes('备忘录') && fbHtml.length > 1000)

console.log('\n[6] 侧边栏 label 跟随语言')
check('label 声明了 locale 命名空间', regs.some((r) => r.o.name === 'sidebar.panellist' && r.o.locale))
check('主面板声明了 locale 命名空间', regs.some((r) => r.o.name === 'main' && r.o.locale))

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
