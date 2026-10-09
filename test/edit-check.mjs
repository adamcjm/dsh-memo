// 编辑功能验证：正文修改、图片增删、标签跟随正文、附件引用计数
import { rm, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { apply } from '../lib/index.js'

const ROOT = '/tmp/dsh-memo-edit-test'
let pass = 0, fail = 0
const check = (n, c, x) => { if (c) { pass++; console.log('  ✓ ' + n) } else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + x : '')) } }

const PNG_A = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const PNG_B = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADklEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const PNG_C = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYPj/HwADAgH/5ncLrgAAAABJRU5ErkJggg=='   // [4] 专用：确保没有任何其他备忘引用它

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

await rm(ROOT, { recursive: true, force: true })
const routes = []
apply({
  logger: { info: () => {}, warn: () => {} },
  webServer: { register: (r) => { routes.push(r); return () => {} } },
  effect: (fn) => { fn(); return () => {} },
}, { dataDir: ROOT, repo: '', pushDebounceMs: 0 })
await new Promise((r) => setTimeout(r, 300))
const route = routes.find((r) => r.path === '/memo/api')
async function api(method, payload) {
  const res = mockRes()
  await route.handler(mockReq('/memo/api/' + method, payload), res)
  const parsed = JSON.parse(res.body || '{}')
  if (!parsed.ok) throw new Error(`${method}: ${parsed.error}`)
  return parsed.value
}
const objFile = (sha, ext = '.png') => join(ROOT, 'attachments', sha.slice(0, 2), sha + ext)

console.log('编辑功能与图片引用计数\n')

console.log('[1] 编辑正文')
{
  const v = await api('create', { body: '原始内容 #待办' })
  const id = v.item.id
  check('创建后 rev = 1', v.item.rev === 1)

  const v2 = await api('update', { id, patch: { body: '改过的内容 #待办 #重要' } })
  check('正文已更新', v2.item.body === '改过的内容', v2.item.body)
  check('rev 递增', v2.item.rev === 2, String(v2.item.rev))
  check('显式 tags 生效', JSON.stringify(v2.item.tags.slice().sort()) === JSON.stringify(['待办', '重要']), JSON.stringify(v2.item.tags))

  const md = await readFile(join(ROOT, 'notes', new Date().toISOString().slice(0, 7), id + '.md'), 'utf8')
  check('事实源 .md 同步更新', md.includes('改过的内容'), md.slice(0, 80).replace(/\n/g, '⏎'))
  check('.md 里标签也更新了', md.includes('重要'))
}

console.log('\n[2] 标签跟随正文（显式 tags 不再与正文合并）')
{
  const v = await api('create', { body: '带两个标签 #甲 #乙' })
  check('初始两个标签', v.item.tags.length === 2, JSON.stringify(v.item.tags))
  const v2 = await api('update', { id: v.item.id, patch: { body: '只剩一个 #甲', tags: ['甲'] } })
  check('删掉正文里的标签 → 标签真的没了', JSON.stringify(v2.item.tags) === JSON.stringify(['甲']), JSON.stringify(v2.item.tags))
}

console.log('\n[3] 编辑时新增图片')
{
  const v = await api('create', { body: '先不带图' })
  check('初始无图', v.item.attachments.length === 0)
  const v2 = await api('update', {
    id: v.item.id,
    patch: { body: '先不带图', tags: [], attachments: [{ dataUrl: 'data:image/png;base64,' + PNG_A, name: 'later.png' }] },
  })
  check('追加成功', v2.item.attachments.length === 1)
  check('对象文件已落盘', existsSync(objFile(v2.item.attachments[0].sha256)))
}

console.log('\n[4] 图片引用计数（同一个对象被两条备忘共用）')
{
  const a = await api('create', { body: '备忘 A', attachments: [{ dataUrl: 'data:image/png;base64,' + PNG_C, name: 'shared.png' }] })
  const b = await api('create', { body: '备忘 B', attachments: [{ dataUrl: 'data:image/png;base64,' + PNG_C, name: 'shared.png' }] })
  const sha = a.item.attachments[0].sha256
  check('两条引用同一个对象文件', a.item.attachments[0].sha256 === b.item.attachments[0].sha256, sha.slice(0, 12))
  check('对象文件在盘上', existsSync(objFile(sha)))

  // A 删图：B 还在用，文件必须留下
  const a2 = await api('update', { id: a.item.id, patch: { body: '备忘 A', tags: [], removeAttachments: [a.item.attachments[0].id] } })
  check('A 的图已解除引用', a2.item.attachments.length === 0)
  check('★ 对象文件仍保留（B 还在用）', existsSync(objFile(sha)))

  // B 删图：无人引用，文件才删
  const b2 = await api('update', { id: b.item.id, patch: { body: '备忘 B', tags: [], removeAttachments: [b.item.attachments[0].id] } })
  check('B 的图已解除引用', b2.item.attachments.length === 0)
  check('★ 对象文件此时才删除', !existsSync(objFile(sha)))
}

console.log('\n[5] 编辑时保留部分图片')
{
  const v = await api('create', {
    body: '两张图',
    attachments: [
      { dataUrl: 'data:image/png;base64,' + PNG_A, name: 'keep.png' },
      { dataUrl: 'data:image/png;base64,' + PNG_B, name: 'drop.png' },
    ],
  })
  check('初始两张', v.item.attachments.length === 2)
  const keep = v.item.attachments[0]
  const drop = v.item.attachments[1]
  const v2 = await api('update', {
    id: v.item.id,
    patch: { body: '两张图', tags: [], removeAttachments: [drop.id] },
  })
  check('只剩一张', v2.item.attachments.length === 1, String(v2.item.attachments.length))
  check('留下的是指定那张', v2.item.attachments[0].id === keep.id)
  check('保留的图片文件仍在', existsSync(objFile(keep.sha256)))
  check('移除的图片文件已删', !existsSync(objFile(drop.sha256)))
}

console.log('\n[6] 编辑接口的健壮性')
{
  const v = await api('create', { body: '存在' })
  // 删一个不属于该备忘的附件 id：应当被忽略而不是报错
  const r = await api('update', { id: v.item.id, patch: { body: '存在', tags: [], removeAttachments: ['NOT_AN_ID'] } })
  check('未知附件 id 被安全忽略', r.item.body === '存在')
  // 空图片数组 + 空删除数组
  const r2 = await api('update', { id: v.item.id, patch: { body: '存在', tags: [], attachments: [], removeAttachments: [] } })
  check('空数组不报错', r2.item.rev > v.item.rev)
  // 不存在的备忘
  try {
    await api('update', { id: 'NO_SUCH_ID', patch: { body: 'x' } })
    check('不存在的备忘应当报错', false)
  } catch (e) {
    check('不存在的备忘如实报错', /memo not found/.test(String(e.message)), String(e.message).slice(0, 60))
  }
}

console.log('\n[7] 编辑不破坏其他字段')
{
  const v = await api('create', { body: '带来源和截止 #甲', source: '张总', dueAt: '2026-10-20' })
  const v2 = await api('update', { id: v.item.id, patch: { body: '改了正文 #乙', tags: ['乙'] } })
  check('来源未被动过', v2.item.source === '张总', v2.item.source)
  check('截止日期未被动过', v2.item.dueAt === '2026-10-20', v2.item.dueAt)
  check('完成状态未被动过', v2.item.done === false)
  check('创建时间未变', v2.item.createdAt === v.item.createdAt)
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
