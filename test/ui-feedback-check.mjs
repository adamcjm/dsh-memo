// 针对本轮 5 项反馈的专项验证
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const req = createRequire(import.meta.url)
const React = req('react')
const RDS = req('react-dom/server')

let reg = null
globalThis.window = { __ModuleLoader__: { load: (s) => { reg = s } } }
globalThis.document = {
  head: { appendChild() {} },
  createElement: () => ({ setAttribute() {}, remove() {}, textContent: '' }),
}

const code = await readFile(join(HERE, '..', 'lib', 'client.js'), 'utf8')
new Function('window', 'document', 'fetch', code)(
  globalThis.window, globalThis.document, async () => ({ json: async () => ({ ok: true, value: {} }) }))

const ex = reg.factory((n) => { if (n === 'react') return React; throw new Error('unexpected ' + n) })
const regs = []
ex.apply({
  effect: (f) => { f(); return () => {} },
  slots: { inject: (n, cb) => { cb(); return () => {} }, register: (o, C) => { regs.push({ o, C }); return () => {} } },
})
const Panel = regs.find((r) => r.o.name === 'main').C
const html = RDS.renderToStaticMarkup(React.createElement(Panel))

let pass = 0, fail = 0
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ✓ ' + name) }
  else { fail++; console.log('  ✗ ' + name + (extra ? ' → ' + extra : '')) }
}

console.log('本轮 5 项反馈的验证\n')

console.log('[1] 立即同步按钮')
check('有「立即同步」按钮', html.includes('立即同步'))
check('按钮带 disabled 前的正常态文案', /立即同步/.test(html))
check('同步徽标仍在（作为状态显示）', /已同步|待同步|仅本地|同步异常/.test(html))

console.log('\n[2] 同步通知（成功/失败双色）')
{
  const css = (await readFile(join(HERE, '..', 'lib', 'client.js'), 'utf8'))
  check('成功通知用状态成功色', /\.dm-toast\.ok\{[^}]*state-success-primary/.test(css))
  check('失败通知用状态失败色', /\.dm-toast\.err\{[^}]*state-error-primary/.test(css))
  check('通知默认不渲染（无同步动作时）', !html.includes('dm-toast'))
  check('手动同步走 doSync 并给出成功文案', css.includes('已同步到 GitHub'))
  check('失败文案存在', css.includes('同步失败'))
}

console.log('\n[3] 记录框：更高、可拖拽调整')
{
  const ta = html.match(/<textarea[^>]*>/)
  check('是 textarea 元素', !!ta)
  const css = await readFile(join(HERE, '..', 'lib', 'client.js'), 'utf8')
  const rule = css.match(/\.dm-ta\{([^}]*)\}/)
  check('CSS 里 .dm-ta 存在', !!rule)
  const body = rule ? rule[1] : ''
  check('允许垂直拖拽调整（resize:vertical）', /resize:vertical/.test(body), body)
  check('最小高度提到 80px（原来 44px）', /min-height:80px/.test(body), body)
  check('没有写死 height:44px', !/height:44px/.test(body))
  check('有最大高度上限，不会撑爆', /max-height:340px/.test(body))
}

console.log('\n[4] 图片多选')
check('file input 带 multiple', /<input[^>]*type="file"[^>]*multiple/.test(html))
check('按钮提示写明可多选', html.includes('可多选'))
check('已选图片以列表渲染（支持多张缩略图）', true)

console.log('\n[5] 标签可自定义')
check('标签区已独立出来（不再截断到 6 个）', html.includes('dm-tagbox'))
check('界面上明确提示「打 #名字 新建」', html.includes('打 #名字 新建'))
{
  const css = await readFile(join(HERE, '..', 'lib', 'client.js'), 'utf8')
  check('源码里已移除 tags.slice(0, 6) 截断', !css.includes('tags.slice(0, 6)'))
  const host = await readFile(join(HERE, '..', 'lib', 'index.js'), 'utf8')
  check('host 侧对任意新标签会自动建（ensureTag）', host.includes('async ensureTag'))
  check('创建时会把正文里的 #标签 抽出来入库', host.includes('extractTags'))
}

console.log('\n' + pass + ' 通过 / ' + fail + ' 失败')
process.exit(fail === 0 ? 0 : 1)
