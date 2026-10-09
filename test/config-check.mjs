// 远程仓库配置的持久化与三层兜底验证
// 核心场景：用户设置过仓库 → 重启 dsh → 设置还在吗？
import { rm, writeFile, mkdir } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { apply } from '../lib/index.js'

const BASE = '/tmp/dsh-memo-config-test'
let pass = 0, fail = 0
const check = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n) } else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + x : '')) } }

function mockReq(url, body) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  return { method: 'POST', url, [Symbol.asyncIterator]: async function* () { for (const c of chunks) yield c } }
}
function mockRes() {
  const res = { status: 0, body: '' }
  res._out = res
  res.writeHead = (s) => { res.status = s }
  res.end = (b) => { res.body = b ? b.toString() : '' }
  return res
}

/** 启动一次插件，返回它的 API 调用器（模拟一次 dsh 进程）。 */
async function boot(dataDir, patchRepo = '') {
  const routes = []
  const ctx = {
    logger: { info: () => {}, warn: () => {} },
    webServer: { register: (r) => { routes.push(r); return () => {} } },
    effect: (fn) => { fn(); return () => {} },
  }
  apply(ctx, { dataDir, repo: patchRepo, pushDebounceMs: 0 })
  await new Promise((r) => setTimeout(r, 250))
  const route = routes.find((x) => x.path === '/memo/api')
  return async (method, payload) => {
    const res = mockRes()
    await route.handler(mockReq('/memo/api/' + method, payload), res)
    const parsed = JSON.parse(res.body || '{}')
    if (!parsed.ok) throw new Error(`${method}: ${parsed.error}`)
    return parsed.value
  }
}

const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

console.log('远程仓库配置：持久化 + 三层兜底\n')

await rm(BASE, { recursive: true, force: true })

console.log('[1] ① 运行时设置：设置后重启仍然生效（本次修复的核心）')
{
  const dir = join(BASE, 'runtime')
  await mkdir(dir, { recursive: true })
  let api = await boot(dir, '')                       // 第一次启动，patch 里没有仓库
  check('初始为未配置', (await api('health', {})).sync.repo === '', '')

  await api('sync', { action: 'config', repo: 'adamcjm/dsh-memo-data' })
  check('.config.json 已落盘', existsSync(join(dir, '.config.json')))
  check('落盘内容正确', JSON.parse(readFileSync(join(dir, '.config.json'), 'utf8')).repo === 'adamcjm/dsh-memo-data')

  api = await boot(dir, '')                           // ← 模拟重启（patch 依然是空）
  const h = await api('health', {})
  check('重启后仓库仍在（不再丢失）', h.sync.repo === 'adamcjm/dsh-memo-data', h.sync.repo)
  check('来源标记为 runtime', h.repoSource === 'runtime', h.repoSource)
}

console.log('\n[2] ② 插件配置：没有运行时设置时用 cordis.patch.yml 的值')
{
  const dir = join(BASE, 'patchonly')
  await mkdir(dir, { recursive: true })
  const api = await boot(dir, 'someone/from-patch')
  const h = await api('health', {})
  check('采用 patch 里的仓库', h.sync.repo === 'someone/from-patch', h.sync.repo)
  check('来源标记为 config', h.repoSource === 'config', h.repoSource)
}

console.log('\n[3] ③ git remote 兜底：目录里配过 origin 也能认出来')
{
  const dir = join(BASE, 'gitremote')
  await mkdir(dir, { recursive: true })
  execFileSync('git', ['-C', dir, 'init', '-q'], { stdio: 'ignore' })
  git(dir, 'remote', 'add', 'origin', 'https://github.com/adamcjm/dsh-memo-data.git')
  const api = await boot(dir, '')
  const h = await api('health', {})
  check('从 origin 反推出仓库名', h.sync.repo === 'adamcjm/dsh-memo-data', h.sync.repo)
  check('来源标记为 git-remote', h.repoSource === 'git-remote', h.repoSource)
}

console.log('\n[4] 优先级：runtime > config > git-remote')
{
  const dir = join(BASE, 'priority')
  await mkdir(dir, { recursive: true })
  execFileSync('git', ['-C', dir, 'init', '-q'], { stdio: 'ignore' })
  git(dir, 'remote', 'add', 'origin', 'https://github.com/someone/from-git.git')
  await writeFile(join(dir, '.config.json'), JSON.stringify({ repo: 'someone/from-runtime', branch: 'main' }))

  const api = await boot(dir, 'someone/from-config')
  const h = await api('health', {})
  check('三层都存在时取 runtime', h.sync.repo === 'someone/from-runtime', h.sync.repo)

  // 清掉 runtime → 应该退到 config
  await writeFile(join(dir, '.config.json'), JSON.stringify({ repo: '', branch: 'main' }))
  const api2 = await boot(dir, 'someone/from-config')
  check('runtime 为空时退到 config', (await api2('health', {})).sync.repo === 'someone/from-config')
}

console.log('\n[5] ssh 形式的 remote 也能解析')
{
  for (const [url, want] of [
    ['git@github.com:adamcjm/dsh-memo-data.git', 'adamcjm/dsh-memo-data'],
    ['https://github.com/adamcjm/dsh-memo-data.git', 'adamcjm/dsh-memo-data'],
    ['https://github.com/adamcjm/dsh-memo-data', 'adamcjm/dsh-memo-data'],
  ]) {
    const dir = join(BASE, 'url-' + want + '-' + url.split(':')[0].length)
    await rm(dir, { recursive: true, force: true })
    await mkdir(dir, { recursive: true })
    execFileSync('git', ['-C', dir, 'init', '-q'], { stdio: 'ignore' })
    git(dir, 'remote', 'add', 'origin', url)
    const h = await (await boot(dir, ''))('health', {})
    check(`${url.slice(0, 34)}… → ${want}`, h.sync.repo === want, h.sync.repo)
  }
}

console.log('\n[6] 三层都没有 → 明确报告未配置')
{
  const dir = join(BASE, 'empty')
  await mkdir(dir, { recursive: true })
  const h = await (await boot(dir, ''))('health', {})
  check('repo 为空', h.sync.repo === '', h.sync.repo)
  check('来源标记为 none', h.repoSource === 'none', h.repoSource)
  check('令牌缺失也如实反映', h.sync.hasToken === false)
}

console.log('\n[7] 损坏的 .config.json 不影响启动')
{
  const dir = join(BASE, 'broken')
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, '.config.json'), '{ 这不是合法 JSON')
  const api = await boot(dir, 'someone/from-config')
  const h = await api('health', {})
  check('跳过坏文件，退到下一层', h.sync.repo === 'someone/from-config', h.sync.repo)
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
