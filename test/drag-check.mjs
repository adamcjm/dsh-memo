// 真实浏览器拖拽回归：用 Chrome + CDP 真的去拖卡片，验证顺序变化 / 组间隔离 / 动画类。
// 没装 Chrome 时自动跳过（可用 CHROME_PATH 指定其它路径）。
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if (!existsSync(CHROME)) {
  console.log('跳过：未找到 Chrome，拖拽测试需要真实浏览器（可用 CHROME_PATH 指定）')
  process.exit(0)
}

let pass = 0, fail = 0
const check = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n) } else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + x : '')) } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* 内联在 lib/client.js 里的那份 SortableJS —— 测的就是线上真正用的代码 */
const src = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
const libMatch = src.match(/;\(function \(module, exports\) \{\s*\n\s*(\/\*! Sortable[\s\S]*?)\n\s*\}\)\(mod, mod\.exports\)/)
if (!libMatch) {
  console.log('  ✗ lib/client.js 里找不到内联的 SortableJS')
  process.exit(1)
}
const sortableSrc = libMatch[1]

const dir = await mkdtemp(join(tmpdir(), 'dsh-memo-drag-'))
const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><style>
body{margin:0;font:13px/1.6 system-ui;background:#14161a;color:#e9ebee}
.dm-list{padding:12px 18px;width:420px}
.dm-day{padding:13px 2px 7px;font-size:11px;color:#9ba1a8}
.dm-card{padding:10px 12px;border-radius:10px;border:1px solid transparent;margin-bottom:3px}
.dm-cards .dm-card{cursor:grab}
.dm-card.dm-drag-ghost{border:1px dashed #5a6070;background:transparent}
.dm-drag-ghost>*{visibility:hidden}
.dm-card.dm-drag-fallback{box-shadow:0 14px 34px rgba(0,0,0,.4);border:1px solid #4d6bfe}
</style></head><body>
<div class="dm-list">
  <div class="dm-group"><div class="dm-day">今天</div>
    <div class="dm-cards" id="g-today">
      <div class="dm-card" data-id="a"><div class="dm-body"><div class="dm-txt">A 今天第一条</div></div></div>
      <div class="dm-card" data-id="b"><div class="dm-body"><div class="dm-txt">B 今天第二条</div></div></div>
      <div class="dm-card" data-id="c"><div class="dm-body"><div class="dm-txt">C 今天第三条</div></div></div>
      <div class="dm-card" data-id="d"><div class="dm-body"><div class="dm-txt">D 今天第四条</div></div></div>
    </div>
  </div>
  <div class="dm-group"><div class="dm-day">昨天</div>
    <div class="dm-cards" id="g-yesterday">
      <div class="dm-card" data-id="x"><div class="dm-body"><div class="dm-txt">X 昨天第一条</div></div></div>
      <div class="dm-card" data-id="y"><div class="dm-body"><div class="dm-txt">Y 昨天第二条</div></div></div>
    </div>
  </div>
</div>
<script src="./sortable.js"></script>
<script>
  window.__events = []
  function readOrder(el) { return Array.prototype.slice.call(el.querySelectorAll('.dm-card')).map(function (c) { return c.getAttribute('data-id') }) }
  window.__order = function () { return { today: readOrder(document.getElementById('g-today')), yesterday: readOrder(document.getElementById('g-yesterday')) } }
  ;['g-today', 'g-yesterday'].forEach(function (id) {
    Sortable.create(document.getElementById(id), {
      animation: 190, easing: 'cubic-bezier(.2,.7,.3,1)',
      draggable: '.dm-card', filter: '.dm-cb, .dm-act, .dm-card.editing', preventOnFilter: true,
      forceFallback: true, fallbackOnBody: true, fallbackClass: 'dm-drag-fallback',
      ghostClass: 'dm-drag-ghost', chosenClass: 'dm-drag-chosen',
      group: { name: 'dm-day-' + id, pull: false, put: false },
      onStart: function () { window.__events.push('start') },
      onEnd: function (evt) { window.__events.push('end:' + id); window.__ended = readOrder(evt.to) }
    })
  })
  window.__ready = true
</script></body></html>`

await writeFile(join(dir, 'index.html'), html)
await writeFile(join(dir, 'sortable.js'), sortableSrc)

const port = 9400 + Math.floor(Math.random() * 400)
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run',
  `--remote-debugging-port=${port}`, `--user-data-dir=${join(dir, 'profile')}`,
  '--window-size=520,760', 'about:blank',
], { stdio: 'ignore' })

async function targets() {
  for (let i = 0; i < 50; i++) {
    try { return await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() } catch { await sleep(200) }
  }
  throw new Error('Chrome 调试端口没起来')
}

function cleanup(code) {
  try { chrome.kill('SIGKILL') } catch { /* ignore */ }
  rm(dir, { recursive: true, force: true }).catch(() => {})
  process.exit(code)
}

let ws
try {
  const list = await targets()
  const page = list.find((t) => t.type === 'page')
  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })

  let seq = 0
  const pending = new Map()
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id)
      pending.delete(msg.id)
      msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result)
    }
  }
  const send = (method, params = {}) => {
    const id = ++seq
    ws.send(JSON.stringify({ id, method, params }))
    return new Promise((res, rej) => pending.set(id, { res, rej }))
  }
  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 200))
    return r.result.value
  }
  const rect = (id) => evalJs(`(function(){ var b=document.querySelector('[data-id="${id}"]').getBoundingClientRect();
    return { x: b.left + b.width/2, y: b.top + b.height/2, top: b.top, bottom: b.bottom } })()`)

  async function drag(from, to, onHold, onStep) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 })
    await sleep(60)
    for (let i = 1; i <= 10; i++) {
      await send('Input.dispatchMouseEvent', {
        type: 'mouseMoved', button: 'left', buttons: 1,
        x: from.x + ((to.x - from.x) * i) / 10,
        y: from.y + ((to.y - from.y) * i) / 10,
      })
      await sleep(25)
      if (onStep) await onStep(i)
    }
    await sleep(70)
    if (onHold) await onHold()
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: to.x, y: to.y, button: 'left', buttons: 0, clickCount: 1 })
    await sleep(420)
  }

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.navigate', { url: `file://${join(dir, 'index.html')}` })
  for (let i = 0; i < 40; i++) {
    if (await evalJs('!!window.__ready')) break
    await sleep(100)
  }

  console.log('真实浏览器拖拽（Chrome + CDP）\n')
  const a0 = await rect('a'), d0 = await rect('d')
  let held = null
  const ghostPerStep = []
  await drag(a0, { x: d0.x, y: d0.bottom + 10 }, async () => {
    held = await evalJs(`(function(){
      var g = document.querySelector('.dm-drag-ghost')
      var f = document.querySelector('.dm-drag-fallback')
      return {
        ghost: !!g, ghostId: g ? g.getAttribute('data-id') : '', ghostTop: g ? Math.round(g.getBoundingClientRect().top) : -1,
        chosen: !!document.querySelector('.dm-drag-chosen'),
        ghostInList: g ? !!g.closest('.dm-cards') : false,
        clone: !!f, cloneTop: f ? Math.round(f.getBoundingClientRect().top) : -1,
        cloneInBody: f ? f.parentElement === document.body : false
      }
    })()`)
  }, async () => { ghostPerStep.push(await evalJs("!!document.querySelector('.dm-drag-ghost')")) })
  const after1 = await evalJs('window.__order()')
  check('同组下移：A 移到最后', JSON.stringify(after1.today) === JSON.stringify(['b', 'c', 'd', 'a']), JSON.stringify(after1.today))
  check('其它日期分组不受影响', JSON.stringify(after1.yesterday) === JSON.stringify(['x', 'y']), JSON.stringify(after1.yesterday))
  check('★ 虚线指示是列表内的占位元素（不是浮层）', held && held.ghost === true && held.ghostInList === true, JSON.stringify(held))
  check('★ 拖动全程虚线指示都在（逐步采样）', ghostPerStep.length >= 8 && ghostPerStep.every(Boolean), ghostPerStep.join(','))
  check('跟随指针的是独立克隆（fallback 模式）', held && held.clone === true, JSON.stringify(held))
  check('克隆挂在 body 上（不会被列表 overflow 裁掉）', held && held.cloneInBody === true, JSON.stringify(held))
  check('虚线指示与跟随克隆是两个不同位置', held && held.ghostTop !== held.cloneTop, JSON.stringify(held))
  check('被拖起元素带 chosen 样式', held && held.chosen === true, JSON.stringify(held))
  check('拖拽结束触发 onEnd', (await evalJs('window.__events.some(function(e){return e.indexOf("end:g-today")===0})')) === true, JSON.stringify(await evalJs('window.__events')))

  const b1 = await rect('b'), y1 = await rect('y')
  await drag(b1, { x: y1.x, y: y1.y + 6 })
  const after2 = await evalJs('window.__order()')
  check('跨组拖拽被拒绝：昨天组没被污染', JSON.stringify(after2.yesterday) === JSON.stringify(['x', 'y']), JSON.stringify(after2.yesterday))
  check('跨组拖拽被拒绝：今天的卡片没流失', JSON.stringify(after2.today.slice().sort()) === JSON.stringify(['a', 'b', 'c', 'd']), JSON.stringify(after2.today))

  const lastId = after2.today[after2.today.length - 1]
  const lastR = await rect(lastId), firstR = await rect(after2.today[0])
  await drag(lastR, { x: firstR.x, y: firstR.top + 2 })
  const after3 = await evalJs('window.__order()')
  check('同组上移：原本最后一条到最前', after3.today[0] === lastId, JSON.stringify(after3.today))
} catch (error) {
  console.log('  ✗ 拖拽测试执行失败 → ' + String(error && error.message || error).slice(0, 200))
  fail++
} finally {
  try { ws && ws.close() } catch { /* ignore */ }
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
cleanup(fail === 0 ? 0 : 1)
