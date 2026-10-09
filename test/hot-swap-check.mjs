// 热插拔验证：同一个插件被重复 apply（运行时启停、patch 热重载）时，
// 路由注册必须是幂等的，不能触发 webserver: duplicate prefix route。
//
// 覆盖两种真实时序：
//   A. 旧实例先卸载，再挂新实例（cordis 正常顺序）
//   B. 新实例先 apply，旧 fiber 之后才卸载（热重载时可能出现的顺序）
import { rm } from 'node:fs/promises'
import { apply } from '../lib/index.js'

const ROOT = '/tmp/dsh-memo-hotswap-test'
let pass = 0
let fail = 0
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' → ' + extra : ''}`) }
}

/** 与真实 host-webserver 一致：同一 (kind, path) 重复注册就抛错。 */
function makeWebServer() {
  const table = new Map()
  return {
    table,
    register(route) {
      if (table.has(route.path)) throw new Error(`webserver: duplicate ${route.kind} route "${route.path}"`)
      table.set(route.path, route)
      return () => table.delete(route.path)
    },
  }
}

/**
 * cordis ctx 最小 mock。
 * effect 立即执行并记住清理函数；unmount 时先跑 effect 清理（后注册先跑）、
 * 再跑 apply 返回的清理——这正是真实 fiber 卸载的顺序。
 */
function makeCtx(webServer) {
  const cleanups = []
  return {
    webServer,
    logger: { info: () => {}, warn: () => {} },
    effect(fn) {
      const d = fn()
      cleanups.push(typeof d === 'function' ? d : () => {})
      return () => {}
    },
    unmount() {
      for (const cleanup of [...cleanups].reverse()) cleanup()
      cleanups.length = 0
    },
  }
}

const CONFIG = { dataDir: ROOT, repo: '', pushDebounceMs: 0 }

/** 挂载一个实例，返回卸载函数。 */
function mount(ws) {
  const ctx = makeCtx(ws)
  const disposeApply = apply(ctx, CONFIG)
  return () => {
    ctx.unmount()
    if (typeof disposeApply === 'function') disposeApply()
  }
}

console.log('dsh-memo hot-swap test\n')
await rm(ROOT, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })

// ---- 场景 A：旧实例先卸载，再挂新实例 ----
{
  console.log('[A] 旧实例先卸载，再挂新实例')
  const ws = makeWebServer()

  const unmount1 = mount(ws)
  check('首次挂载注册了两条路由', ws.table.size === 2, `size=${ws.table.size}`)

  unmount1()
  check('卸载后路由被清空', ws.table.size === 0, `size=${ws.table.size}`)

  const unmount2 = mount(ws)
  check('再次挂载不抛 duplicate route', ws.table.size === 2, `size=${ws.table.size}`)

  unmount2()
  check('二次卸载后路由清空', ws.table.size === 0, `size=${ws.table.size}`)
}

// ---- 场景 B：新实例先 apply，旧实例随后才卸载 —— 正是触发过报错的时序 ----
{
  console.log('\n[B] 新实例先 apply（旧 fiber 尚未卸载）')
  const ws = makeWebServer()

  const unmount1 = mount(ws)
  let error = null
  let unmount2 = () => {}
  try {
    unmount2 = mount(ws)
  } catch (e) {
    error = e
  }
  check('新实例先 apply 时不抛 duplicate route', error === null, error && error.message)
  check('路由表仍是两条（未叠加）', ws.table.size === 2, `size=${ws.table.size}`)

  unmount1()
  check('旧实例的卸载没有误删新实例的路由', ws.table.size === 2, `size=${ws.table.size}`)

  unmount2()
  check('新实例卸载后路由清空', ws.table.size === 0, `size=${ws.table.size}`)
}

// ---- 场景 C：反复插拔多轮 ----
{
  console.log('\n[C] 连续插拔 3 轮')
  const ws = makeWebServer()
  let ok = true
  for (let i = 0; i < 3; i++) {
    try {
      const unmount = mount(ws)
      if (ws.table.size !== 2) ok = false
      unmount()
      if (ws.table.size !== 0) ok = false
    } catch {
      ok = false
    }
  }
  check('三轮插拔均无报错且路由表归零', ok && ws.table.size === 0, `size=${ws.table.size}`)
}

await rm(ROOT, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
if (fail > 0) process.exitCode = 1
