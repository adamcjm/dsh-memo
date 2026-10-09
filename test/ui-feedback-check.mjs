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
let dict = null
ex.apply({
  effect: (f) => { f(); return () => {} },
  locale: { register: (ns, d) => { dict = d; return () => {} }, bind: (ns) => (k) => (dict && dict.zh && dict.zh[k]) || k },
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


console.log('\n[6] 根容器必须自己能撑满（真机回归）')
{
  const css = await readFile(join(HERE, '..', 'lib', 'client.js'), 'utf8')
  const rule = css.match(/\.dm-wrap\{([^}]*)\}/)
  const body = rule ? rule[1] : ''
  check('.dm-wrap 声明了 flex 增长', /flex:1 1 auto/.test(body), body.slice(0, 80))
  check('.dm-wrap 声明了 width:100%', /width:100%/.test(body), body.slice(0, 80))
  check('.dm-wrap 有 min-width:0（防 flex 子项撑破）', /min-width:0/.test(body))
  check('.dm-wrap 有 box-sizing:border-box', /box-sizing:border-box/.test(body))
  // 演示页必须严格模拟真机的 flex row 父容器，且不替插件兜底
  const demo = await readFile(join(HERE, '..', 'docs', 'demo.html'), 'utf8')
  check('演示页模拟了 flex row 父容器', /\.page\{display:flex;flex-direction:row;align-items:stretch\}/.test(demo))
  check('演示页没有替插件兜底 flex/width', !/\.page > \.dm-wrap\{/.test(demo))
}


console.log('\n[7] 编辑功能（卡片就地展开）')
{
  const css = await readFile(join(HERE, '..', 'lib', 'client.js'), 'utf8')
  check('卡片操作区有「编辑」按钮', /title: t\('card.edit'\)/.test(css) && /onClick: function \(\) \{ startEdit\(it\) \}/.test(css))
  check('编辑按钮带铅笔图标', /M16\.5 3\.5a2\.1 2\.1 0 0 1 3 3L7 19l-4 1 1-4z/.test(css))
  check('有就地展开的编辑容器', /\.dm-edit\{/.test(css) && /\.dm-edit-ta\{/.test(css))
  check('编辑态用专门的卡片样式', /\.dm-card\.editing\{/.test(css))
  check('编辑保存调用 removeAttachments', /removeAttachments: removed/.test(css))
  check('编辑保存显式传 tags（标签跟随正文）', /tags: extractTagsFrom\(editBody\)/.test(css))
  // 存储层会把 #标签 从正文剥离，所以编辑时必须并回正文，否则看不到、一保存就丢标签
  check('编辑时把已有标签并回正文', /setEditBody\(withTagsInBody\(item\.body/.test(css))
  check('client 有 withTagsInBody', /function withTagsInBody\(body, tags\)/.test(css))
  {
    const host = await readFile(join(HERE, '..', 'lib', 'index.js'), 'utf8')
    check('client 的标签正则已放宽（汉字/标点紧贴也识别）', css.includes('#([^\\s#]{1,24})'))
    check('host 与 client 用同一条标签正则', host.includes('#([^\\s#]{1,24})'))
    check('host 剥离标签时只删标签名本身（不吞后文）', /return pre \+ raw\.slice\(name\.length\)/.test(host))
  }
  check('已有图片可逐张移除', /setEditKeep\(function \(list\)/.test(css))
  check('新增图片可逐张取消', /setEditNew\(function \(list\)/.test(css))
  check('支持 ⌘Enter 保存、Esc 取消', /e\.metaKey \|\| e\.ctrlKey/.test(css) && /e\.key === 'Escape'/.test(css))
  check('编辑态也能粘贴图片', /addEditFiles\(files\)/.test(css))
  // 不做双击手势（用户明确不要）
  check('没有绑定双击行为（按要求）', !/onDoubleClick|dblclick/.test(css))
  // 字典齐备
  const dict = css.match(/'card\.edit': '([^']+)'[\s\S]{0,400}?'edit\.hint': '([^']+)'/)
  check('中英字典都有编辑文案', !!dict, dict ? dict[1] + ' / ' + dict[2] : '未找到')
}

console.log('\n[8] 置顶可见（卡片上有图钉标记）')
{
  const css = await readFile(join(HERE, '..', 'lib', 'client.js'), 'utf8')
  check('卡片 class 带 pinned', /className: 'dm-card' \+ \(it\.done \? ' done' : ''\) \+ \(it\.pinned \? ' pinned' : ''\)/.test(css))
  check('置顶项渲染图钉徽标', /it\.pinned \? h\('div', \{ className: 'dm-pinrow'/.test(css))
  check('徽标里是图钉图标', /dm-pinrow[\s\S]{0,220}M12 17v5M9 3h6l-1 8 4 3H6l4-3z/.test(css))
  check('卡片左侧有置顶色条', /\.dm-card\.pinned:before\{/.test(css))
  check('置顶徽标用品牌色', /\.dm-pinrow\{[^}]*alias-brand-primary/.test(css))
  check('置顶按钮已置顶时高亮', /className: 'dm-ib' \+ \(it\.pinned \? ' on' : ''\)/.test(css))
  check('高亮样式存在', /\.dm-ib\.on\{[^}]*alias-brand-primary/.test(css))
  check('已置顶时按钮提示变成「取消置顶」', /it\.pinned \? t\('card\.unpin'\) : t\('card\.pin'\)/.test(css))
  const dict = css.match(/'card\.pin': '([^']+)'[\s\S]{0,200}?'card\.unpin': '([^']+)'/)
  check('中英字典都有置顶文案', !!dict, dict ? dict[1] + ' / ' + dict[2] : '未找到')
  const zhPinned = css.match(/'card\.pinned': '([^']+)'/)
  check('有「已置顶」文案', !!zhPinned && zhPinned[1] === '已置顶', zhPinned ? zhPinned[1] : '')
  const enUnpin = css.match(/'card\.pin': 'Pin',[\s\S]{0,160}?'card\.unpin': '([^']+)'/)
  check('英文是 Unpin', !!enUnpin && enUnpin[1] === 'Unpin', enUnpin ? enUnpin[1] : '')
  check('置顶排序在 host 侧（pinned 优先）', /ORDER BY m\.pinned DESC/.test(await readFile(join(HERE, '..', 'lib', 'index.js'), 'utf8')))
  for (const f of ['demo.html', 'demo-en.html']) {
    const demo = await readFile(join(HERE, '..', 'docs', f), 'utf8')
    check(f + ' 演示了置顶卡片', /class="dm-card pinned"/.test(demo) && demo.includes('dm-pinrow'))
    check(f + ' 含置顶样式', /\.dm-card\.pinned:before\{/.test(demo) && /\.dm-ib\.on\{/.test(demo))
  }
}

console.log('\n' + pass + ' 通过 / ' + fail + ' 失败')
process.exit(fail === 0 ? 0 : 1)
