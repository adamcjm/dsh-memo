// dsh-memo — 浏览器半侧（client bundle）
//
// 格式是 DSH 客户端模块系统的入口协议：执行本文件只注册 factory，
// 模块副作用（样式注入等）都在 factory 物化时才发生。
// 对外导出的是 cordis 插件形态：{ inject: ['slots'], apply(ctx) }。
window.__ModuleLoader__.load({
  id: 'dsh-memo',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    // React 从平台模块表取；动态半边另有全局 React 兜底。
    var React = null
    try { React = require('react') } catch (e) { /* 回退到全局 */ }
    if (!React) React = globalThis.React
    if (!React) throw new Error('dsh-memo: React runtime unavailable')
    var h = React.createElement
    var useState = React.useState
    var useEffect = React.useEffect
    var useRef = React.useRef
    var useCallback = React.useCallback
    var useMemo = React.useMemo

    var PANEL_ID = 'memo'
    var API = '/memo/api/'

    /* ---------------- 与 host 半侧通信 ---------------- */

    async function call(method, payload) {
      var res = await fetch(API + method, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload || {}),
      })
      var data = await res.json().catch(() => ({ ok: false, error: 'invalid response' }))
      if (!data.ok) throw new Error(data.error || t('err.request'))
      return data.value
    }

    /* ---------------- 样式（跟随 DSH 主题 token） ---------------- */

    var CSS = [
      // 面板根容器：DSH 的 main 面板是 flex/grid 容器，子元素必须自己声明撑满，
      // 否则只会按内容宽度排（真机上表现为所有内容挤在左上角）
      '.dm-wrap{display:flex;flex-direction:column;flex:1 1 auto;width:100%;height:100%;min-width:0;min-height:0;box-sizing:border-box;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px}',
      '.dm-head{display:flex;align-items:center;gap:10px;padding:12px 18px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:none}',
      '.dm-head h2{font-size:14.5px;font-weight:650;margin:0;letter-spacing:-.2px}',
      '.dm-count{color:var(--dsw-alias-label-secondary);font-size:12px;opacity:.85}',
      '.dm-spacer{flex:1}',
      '.dm-chip{padding:4px 10px;border-radius:14px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:11.5px;cursor:pointer;white-space:nowrap}',
      '.dm-chip:hover{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}',
      '.dm-chip.on{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary);font-weight:600}',
      '.dm-sync{display:inline-flex;align-items:center;gap:6px;padding:4px 9px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);font-size:11.5px;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.dm-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-success-primary)}',
      '.dm-dot.off{background:var(--dsw-alias-state-idle-primary)}',
      '.dm-dot.err{background:var(--dsw-alias-state-error-primary)}',
      '.dm-compose{margin:14px 18px 0;border:1px solid var(--dsw-alias-border-l1);border-radius:11px;background:var(--dsw-alias-bg-layer-1);overflow:hidden;flex:none}',
      '.dm-compose:focus-within{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent)}',
      '.dm-ta{width:100%;box-sizing:border-box;padding:11px 13px 8px;border:none;outline:none;background:transparent;color:inherit;font:inherit;line-height:1.6;resize:vertical;min-height:80px;max-height:340px;display:block}',
      '.dm-ta::placeholder{color:var(--dsw-alias-label-secondary);opacity:.7}',
      '.dm-thumbs{display:flex;gap:7px;padding:0 13px 6px;flex-wrap:wrap}',
      '.dm-thumb{position:relative;width:56px;height:56px;border-radius:7px;overflow:hidden;border:1px solid var(--dsw-alias-border-l2)}',
      '.dm-thumb img{width:100%;height:100%;object-fit:cover;display:block}',
      '.dm-thumb button{position:absolute;top:2px;right:2px;width:16px;height:16px;border-radius:5px;border:none;background:rgba(0,0,0,.6);color:#fff;font-size:11px;line-height:1;cursor:pointer}',
      '.dm-row{display:flex;align-items:center;gap:6px;padding:6px 9px 8px;border-top:1px solid var(--dsw-alias-border-l1);flex-wrap:wrap}',
      '.dm-btn{display:inline-flex;align-items:center;gap:5px;padding:5px 9px;border-radius:7px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;cursor:pointer}',
      '.dm-btn:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}',
      '.dm-btn.pri{background:var(--dsw-alias-brand-primary);color:#fff;font-weight:560;padding:5px 14px}',
      '.dm-btn.pri:disabled{opacity:.5;cursor:default}',
      '.dm-hint{color:var(--dsw-alias-label-secondary);font-size:11px;opacity:.7;margin-left:2px}',
      '.dm-syncbtn{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer}',
      '.dm-syncbtn:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
      '.dm-syncbtn:disabled{opacity:.55;cursor:default}',
      '@keyframes dm-spin{to{transform:rotate(360deg)}}',
      '.dm-spin{animation:dm-spin .9s linear infinite}',
      '.dm-toast{position:fixed;left:50%;top:20px;transform:translateX(-50%);z-index:950;display:flex;align-items:center;gap:9px;padding:10px 15px;border-radius:10px;font-size:12.5px;font-weight:520;background:var(--dsw-alias-bg-overlay);box-shadow:0 12px 34px rgba(0,0,0,.38);border:1px solid;max-width:min(440px,86vw);animation:dm-toast-in .2s ease-out}',
      '.dm-toast.ok{border-color:var(--dsw-alias-state-success-primary);color:var(--dsw-alias-state-success-primary)}',
      '.dm-toast.err{border-color:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary)}',
      '@keyframes dm-toast-in{from{opacity:0;transform:translate(-50%,-10px)}to{opacity:1;transform:translate(-50%,0)}}',
      '.dm-tagbox{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:2px 18px 6px;flex:none}',
      '.dm-tagnew{padding:1px 8px;border-radius:5px;font-size:10.5px;background:transparent;border:1px dashed var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);opacity:.9;white-space:nowrap}',
      '.dm-filters{display:flex;gap:6px;padding:11px 18px 4px;flex-wrap:wrap;flex:none}',
      '.dm-list{flex:1;overflow-y:auto;padding:6px 18px 24px;min-height:0}',
      '.dm-day{display:flex;align-items:center;gap:9px;padding:13px 2px 7px;color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:600;opacity:.75}',
      '.dm-day:after{content:"";flex:1;height:1px;background:var(--dsw-alias-border-l1)}',
      '.dm-card{display:flex;gap:10px;padding:10px 12px;border-radius:10px;border:1px solid transparent;margin-bottom:3px;position:relative}',
      '.dm-card:hover{background:var(--dsw-alias-bg-layer-1);border-color:var(--dsw-alias-border-l1)}',
      '.dm-cb{width:16px;height:16px;border-radius:50%;border:1.6px solid var(--dsw-alias-border-l2);flex:none;margin-top:2px;cursor:pointer;display:grid;place-items:center;color:transparent;background:transparent;padding:0}',
      '.dm-cb:hover{border-color:var(--dsw-alias-brand-primary)}',
      '.dm-card.done .dm-cb{background:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary);color:#fff}',
      '.dm-card.done .dm-body{opacity:.45}',
      '.dm-card.done .dm-txt{text-decoration:line-through}',
      '.dm-body{flex:1;min-width:0}',
      '.dm-txt{font-size:13px;line-height:1.62;white-space:pre-wrap;word-break:break-word}',
      '.dm-meta{display:flex;align-items:center;gap:8px;margin-top:4px;flex-wrap:wrap;font-size:11.5px;color:var(--dsw-alias-label-secondary);opacity:.85}',
      '.dm-tag{padding:1px 7px;border-radius:5px;font-size:11px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);cursor:pointer}',
      '.dm-tag:hover{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}',
      '.dm-imgs{display:flex;gap:6px;margin-top:7px;flex-wrap:wrap}',
      '.dm-imgs img{width:76px;height:76px;object-fit:cover;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);cursor:zoom-in;display:block}',
      '.dm-act{position:absolute;right:10px;top:9px;display:none;gap:3px}',
      '.dm-card:hover .dm-act{display:flex}',
      '.dm-ib{width:25px;height:25px;border-radius:6px;display:grid;place-items:center;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);cursor:pointer;padding:0}',
      '.dm-ib:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}',
      '.dm-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:60px 20px;color:var(--dsw-alias-label-secondary);text-align:center;opacity:.8}',
      '.dm-err{margin:12px 18px 0;padding:9px 12px;border-radius:9px;font-size:12px;border:1px solid var(--dsw-alias-state-error-primary);color:var(--dsw-alias-state-error-primary);background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 8%, transparent)}',
      '.dm-view{position:fixed;inset:0;z-index:900;background:rgba(0,0,0,.72);display:grid;place-items:center;cursor:zoom-out}',
      '.dm-view img{max-width:92vw;max-height:92vh;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.6)}',
      '.dm-modal{position:fixed;inset:0;z-index:901;background:rgba(0,0,0,.55);display:grid;place-items:center}',
      '.dm-dlg{width:520px;max-width:92vw;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;padding:18px 20px;box-shadow:0 24px 60px rgba(0,0,0,.5)}',
      '.dm-dlg h3{margin:0 0 4px;font-size:14px;font-weight:650}',
      '.dm-dlg .sub{color:var(--dsw-alias-label-secondary);font-size:11.5px;margin-bottom:14px;line-height:1.6}',
      '.dm-field{margin-bottom:12px}',
      '.dm-field label{display:block;font-size:10.5px;font-weight:650;letter-spacing:.4px;text-transform:uppercase;color:var(--dsw-alias-label-secondary);margin-bottom:5px}',
      '.dm-field input{width:100%;box-sizing:border-box;padding:7px 10px;border-radius:8px;font:inherit;font-size:12.5px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:inherit;outline:none}',
      '.dm-field input:focus{border-color:var(--dsw-alias-brand-primary)}',
      '.dm-field .help{font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:4px;line-height:1.5;opacity:.85}',
      '.dm-dlgfoot{display:flex;align-items:center;gap:8px;margin-top:16px}',
    ].join('\n')

    /* ---------------- 国际化（跟随 DSH 的 locale） ---------------- */

    var NS = 'dsh-memo'

    var DICT = {
      zh: {
        'panel': '备忘录',
        'count': '{total} 条 · {todo} 条待处理',
        'sync.synced': '已同步',
        'sync.pending': '待同步',
        'sync.local': '仅本地',
        'sync.error': '同步异常',
        'sync.now': '立即同步',
        'sync.doing': '同步中…',
        'sync.tip': '立即同步到 GitHub',
        'sync.tipLocal': '未配置远程仓库，将只做本地提交',
        'sync.tipRepo': '仓库 {repo}',
        'sync.tipPushed': '仓库 {repo} · 上次推送 {time}',
        'sync.noRepo': '未配置 GitHub 仓库',
        'sync.ok': '已同步到 GitHub',
        'sync.commitOnly': '已提交到本地（未配置远程仓库）',
        'sync.nochange': '没有需要同步的改动',
        'sync.fail': '同步失败：{msg}',
        'sync.autoFail': '自动同步失败：{msg}',
        'sync.autoOk': '已自动同步到 GitHub',
        'search.ph': '搜索…',
        'compose.ph': '记点什么…  例：张总要登录页加微信扫码，下周三前给原型 #需求变更',
        'compose.hint': 'Enter 保存 · ⇧Enter 换行 · 图片可多选 · 打 #标签 自动创建',
        'btn.image': '图片',
        'btn.imageTip': '选择图片（可多选；也可直接拖进来或 ⌘V 粘贴）',
        'btn.save': '保存',
        'btn.saving': '保存中…',
        'filter.all': '全部',
        'filter.todo': '待处理',
        'filter.done': '已完成',
        'filter.today': '今天',
        'filter.pinned': '置顶',
        'tag.lead': '标签',
        'tag.new': '打 #名字 新建',
        'tag.newTip': '标签不是固定的：在正文里打 #任意名字 保存，就会自动创建',
        'tag.none': '还没有标签',
        'tag.usedBy': '{n} 条备忘在用',
        'empty.loading': '加载中…',
        'empty.none': '还没有备忘，上面输入框写一条试试',
        'empty.filtered': '没有匹配的备忘',
        'day.yesterday': '昨天',
        'day.earlier': '更早',
        'time.yesterday': '昨天 {time}',
        'card.source': '来源：{source}',
        'card.due': '截止 {date}',
        'card.markDone': '标记完成',
        'card.markUndone': '标记未完成',
        'card.pin': '置顶',
        'card.del': '删除',
        'img.name': '截图.png',
        'cfg.title': 'GitHub 同步设置',
        'cfg.desc': '同步的是文本层（notes/ 每条一个 .md、attachments/ 图片、log/ 事件日志）；SQLite 只作本地索引，不进仓库。令牌保存在数据目录的 .token（权限 0600），已被 .gitignore 忽略，永远不会提交。',
        'cfg.repo': '仓库',
        'cfg.repoPh': '用户名/仓库名',
        'cfg.repoHelp': '私有仓库即可，例：yourname/dsh-memo-data；留空 = 只在本地保存',
        'cfg.token': '访问令牌（Fine-grained PAT）',
        'cfg.tokenHelp': '权限只需 Contents: Read and write。留空表示不改动已保存的令牌。',
        'cfg.save': '保存并同步',
        'cfg.close': '关闭',
        'cfg.savedLocal': '已保存（未配置仓库，仅本地保存）',
        'cfg.savedPushed': '已保存，并已推送一次',
        'cfg.pushFail': '保存了，但推送失败：{msg}',
        'cfg.fail': '失败：{msg}',
        'err.request': '请求失败',
      },
      en: {
        'panel': 'Memo',
        'count': '{total} notes · {todo} open',
        'sync.synced': 'Synced',
        'sync.pending': 'Pending',
        'sync.local': 'Local only',
        'sync.error': 'Sync error',
        'sync.now': 'Sync now',
        'sync.doing': 'Syncing…',
        'sync.tip': 'Sync to GitHub now',
        'sync.tipLocal': 'No remote configured — commits locally only',
        'sync.tipRepo': 'Repository {repo}',
        'sync.tipPushed': 'Repository {repo} · last push {time}',
        'sync.noRepo': 'No GitHub repository configured',
        'sync.ok': 'Synced to GitHub',
        'sync.commitOnly': 'Committed locally (no remote configured)',
        'sync.nochange': 'Nothing to sync',
        'sync.fail': 'Sync failed: {msg}',
        'sync.autoFail': 'Auto-sync failed: {msg}',
        'sync.autoOk': 'Auto-synced to GitHub',
        'search.ph': 'Search…',
        'compose.ph': 'Note something…  e.g. WeChat QR login on the login page, prototype due Wednesday #requirement',
        'compose.hint': 'Enter to save · ⇧Enter for newline · images multi-select · type #tag to create',
        'btn.image': 'Image',
        'btn.imageTip': 'Pick images (multi-select; or drag them in, or paste with ⌘V)',
        'btn.save': 'Save',
        'btn.saving': 'Saving…',
        'filter.all': 'All',
        'filter.todo': 'Open',
        'filter.done': 'Done',
        'filter.today': 'Today',
        'filter.pinned': 'Pinned',
        'tag.lead': 'Tags',
        'tag.new': 'type #name to create',
        'tag.newTip': 'Tags are not fixed: type #anything in the body and save — it is created automatically',
        'tag.none': 'No tags yet',
        'tag.usedBy': 'used by {n} note(s)',
        'empty.loading': 'Loading…',
        'empty.none': 'No notes yet — write one in the box above',
        'empty.filtered': 'No matching notes',
        'day.yesterday': 'Yesterday',
        'day.earlier': 'Earlier',
        'time.yesterday': 'Yesterday {time}',
        'card.source': 'Source: {source}',
        'card.due': 'Due {date}',
        'card.markDone': 'Mark as done',
        'card.markUndone': 'Mark as open',
        'card.pin': 'Pin',
        'card.del': 'Delete',
        'img.name': 'screenshot.png',
        'cfg.title': 'GitHub sync',
        'cfg.desc': 'What syncs is the text layer (one .md per note under notes/, images under attachments/, the event log under log/); SQLite is only a local index and never enters the repository. The token lives in .token inside the data directory (mode 0600), is git-ignored, and is never committed.',
        'cfg.repo': 'Repository',
        'cfg.repoPh': 'owner/repo',
        'cfg.repoHelp': 'A private repo is fine, e.g. yourname/dsh-memo-data; leave empty to keep everything local',
        'cfg.token': 'Access token (fine-grained PAT)',
        'cfg.tokenHelp': 'Only Contents: Read and write is needed. Leave empty to keep the stored token unchanged.',
        'cfg.save': 'Save and sync',
        'cfg.close': 'Close',
        'cfg.savedLocal': 'Saved (no repository configured — local only)',
        'cfg.savedPushed': 'Saved and pushed once',
        'cfg.pushFail': 'Saved, but the push failed: {msg}',
        'cfg.fail': 'Failed: {msg}',
        'err.request': 'request failed',
      },
    }

    /** 取当前语言的文案；第二参做 {name} 插值。 */
    function makeT(bind) {
      return function (key, vars) {
        var s = bind(key)
        if (!vars) return s
        return String(s).replace(/\{(\w+)\}/g, function (_, k) {
          return vars[k] === undefined ? '' : vars[k]
        })
      }
    }

    /* ---------------- 图标 ---------------- */

    function Svg(props) {
      var size = props.size || 15
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
        className: props.className,
        style: props.style || { flex: 'none' },
      }, props.children)
    }

    function MemoIcon(props) {
      var size = (props && props.size) || 16
      return h('svg', {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
      }, [
        h('path', { key: 'a', d: 'M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9l-5 5H6a2 2 0 0 1-2-2z' }),
        h('path', { key: 'b', d: 'M15 19v-4a1 1 0 0 1 1-1h4' }),
        h('path', { key: 'c', d: 'M8 8h8M8 12h5' }),
      ])
    }

    /* ---------------- 小组件 ---------------- */

    function Check() {
      return h('svg', { width: 11, height: 11, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 3.2, strokeLinecap: 'round', strokeLinejoin: 'round' }, h('path', { d: 'M20 6L9 17l-5-5' }))
    }

    function fmtTime(iso, t) {
      if (!iso) return ''
      var d = new Date(iso)
      if (isNaN(d.getTime())) return ''
      var now = new Date()
      var pad = function (n) { return String(n).padStart(2, '0') }
      var hm = pad(d.getHours()) + ':' + pad(d.getMinutes())
      var sameDay = d.toDateString() === now.toDateString()
      if (sameDay) return hm
      var yesterday = new Date(now.getTime() - 86400000)
      if (d.toDateString() === yesterday.toDateString()) return t('time.yesterday', { time: hm })
      return (d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + hm
    }

    function dayKey(iso) {
      if (!iso) return ''
      var d = new Date(iso)
      if (isNaN(d.getTime())) return ''
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
    }

    function dayLabel(iso, t) {
      var k = dayKey(iso)
      if (!k) return t('day.earlier')
      var now = new Date()
      var today = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0')
      var y = new Date(now.getTime() - 86400000)
      var yest = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0')
      if (k === today) return t('filter.today')
      if (k === yest) return t('day.yesterday')
      return k
    }

    /* ---------------- 主面板 ---------------- */

    function MemoPanel(props) {
      // 注册时声明了 locale: NS，框架会把绑定好的 t 作为 standard seat 注入 props
      var t = (props && props.t) || makeT(function (k) { return DICT.zh[k] !== undefined ? DICT.zh[k] : k })
      var [loading, setLoading] = useState(true)
      var [items, setItems] = useState([])
      var [tags, setTags] = useState([])
      var [stats, setStats] = useState({ total: 0, todo: 0, done: 0 })
      var [sync, setSync] = useState({})
      var [error, setError] = useState('')
      var [draft, setDraft] = useState('')
      var [pending, setPending] = useState([])
      var [tag, setTag] = useState('')
      var [filter, setFilter] = useState('all')
      var [q, setQ] = useState('')
      var [busy, setBusy] = useState(false)
      var [zoom, setZoom] = useState('')
      var [showCfg, setShowCfg] = useState(false)
      var [cfgRepo, setCfgRepo] = useState('')
      var [cfgToken, setCfgToken] = useState('')
      var [cfgMsg, setCfgMsg] = useState('')
      var [cfgBusy, setCfgBusy] = useState(false)
      var [syncing, setSyncing] = useState(false)
      var [toast, setToast] = useState(null)
      var toastTimer = useRef(null)
      var syncCheckRef = useRef(null)
      var lastErrRef = useRef('')
      var taRef = useRef(null)
      var fileRef = useRef(null)

      var refresh = useCallback(function (opts) {
        var o = opts || {}
        return call('list', {
          q: o.q !== undefined ? o.q : q,
          tag: o.tag !== undefined ? o.tag : tag,
          filter: o.filter !== undefined ? o.filter : filter,
          limit: 300,
        }).then(function (v) {
          setItems(v.items || [])
          setLoading(false)
        }).catch(function (e) {
          setError(String(e.message || e))
          setLoading(false)
        })
      }, [q, tag, filter])

      useEffect(function () {
        call('bootstrap').then(function (v) {
          setItems(v.items || [])
          setTags(v.tags || [])
          setStats(v.stats || {})
          setSync(v.sync || {})
          setCfgRepo((v.config && v.config.repo) || '')
          setLoading(false)
        }).catch(function (e) {
          setError(String(e.message || e))
          setLoading(false)
        })
      }, [])

      useEffect(function () { if (!loading) refresh() }, [filter, tag])

      // 卸载时清掉挂起的提示/检查定时器，避免面板切走后还在 setState
      useEffect(function () {
        return function () {
          if (toastTimer.current) clearTimeout(toastTimer.current)
          if (syncCheckRef.current) clearTimeout(syncCheckRef.current)
        }
      }, [])

      function addFiles(files) {
        Array.prototype.slice.call(files || []).forEach(function (f) {
          if (!f || !/^image\//.test(f.type)) return
          var reader = new FileReader()
          reader.onload = function () {
            setPending(function (p) { return p.concat([{ dataUrl: String(reader.result), name: f.name || t('img.name') }]) })
          }
          reader.readAsDataURL(f)
        })
      }

      function onPaste(e) {
        var items = (e.clipboardData && e.clipboardData.items) || []
        var files = []
        for (var i = 0; i < items.length; i++) {
          if (items[i].type && items[i].type.indexOf('image/') === 0) {
            var f = items[i].getAsFile()
            if (f) files.push(f)
          }
        }
        if (files.length > 0) { e.preventDefault(); addFiles(files) }
      }

      function save() {
        var text = draft.trim()
        if (!text && pending.length === 0) return
        setBusy(true)
        setError('')
        call('create', { body: text, attachments: pending })
          .then(function (v) {
            setDraft('')
            setPending([])
            setStats(v.stats || {})
            setLoading(false)
            return refresh()
          })
          .then(function () { return call('tags').then(function (v) { setTags(v.tags || []) }) })
          .then(function () { scheduleSyncCheck() })
          .catch(function (e) { setError(String(e.message || e)) })
          .finally(function () { setBusy(false) })
      }

      function toggleDone(item) {
        call('update', { id: item.id, patch: { done: !item.done } })
          .then(function (v) { setStats(v.stats || {}); return refresh() })
          .then(function () { scheduleSyncCheck() })
          .catch(function (e) { setError(String(e.message || e)) })
      }

      function removeItem(item) {
        call('remove', { id: item.id })
          .then(function (v) { setStats(v.stats || {}); return refresh() })
          .then(function () { scheduleSyncCheck() })
          .catch(function (e) { setError(String(e.message || e)) })
      }

      function toggleTag(name) { setTag(function (t) { return t === name ? '' : name }) }

      /** 同步结果提示：成功用成功色，失败用失败色。 */
      function notify(kind, text) {
        setToast({ kind: kind, text: text })
        if (toastTimer.current) clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(function () { setToast(null) }, kind === 'err' ? 7000 : 3200)
      }

      /** 手动同步：无论成功失败都给明确反馈。 */
      function doSync() {
        if (syncing) return
        setSyncing(true)
        call('sync', { action: 'now' })
          .then(function (v) {
            var s = v.sync || {}
            setSync(s)
            var r = v.result || {}
            if (s.lastError) notify('err', t('sync.fail', { msg: s.lastError }))
            else if (r.pushed) notify('ok', t('sync.ok'))
            else if (r.committed) notify('ok', t('sync.commitOnly'))
            else notify('ok', t('sync.nochange'))
            return refresh()
          })
          .catch(function (e) { notify('err', t('sync.fail', { msg: String(e.message || e) })) })
          .finally(function () { setSyncing(false) })
      }

      /** 写操作后顺带看一次同步健康度，好让自动推送的失败也能被看见。 */
      function checkSyncHealth() {
        return call('sync', { action: 'status' }).then(function (v) {
          var s = v.sync || {}
          setSync(s)
          if (s.lastError) {
            if (s.lastError !== lastErrRef.current) {
              lastErrRef.current = s.lastError
              notify('err', t('sync.autoFail', { msg: s.lastError }))
            }
          } else {
            lastErrRef.current = ''
          }
        }).catch(function () { /* 状态查询失败不打扰 */ })
      }

      /** 写操作后 33 秒（防抖窗口之后）再看一眼，捕获自动推送的成功/失败。 */
      function scheduleSyncCheck() {
        if (syncCheckRef.current) clearTimeout(syncCheckRef.current)
        syncCheckRef.current = setTimeout(function () {
          call('sync', { action: 'status' }).then(function (v) {
            var s = v.sync || {}
            setSync(s)
            if (s.lastError) {
              if (s.lastError !== lastErrRef.current) {
                lastErrRef.current = s.lastError
                notify('err', t('sync.autoFail', { msg: s.lastError }))
              }
            } else if (s.lastPushAt && s.lastPushAt !== lastErrRef.current) {
              // 自动推送成功：只在面板开着时给一次轻提示，不重复
              lastErrRef.current = s.lastPushAt
              notify('ok', t('sync.autoOk'))
            }
          }).catch(function () { /* 忽略 */ })
        }, 33000)
      }

      function saveCfg() {
        setCfgBusy(true)
        setCfgMsg('')
        var payload = { action: 'config', repo: cfgRepo }
        if (cfgToken) payload.token = cfgToken
        call('sync', payload)
          .then(function (v) {
            setSync(v.sync || {})
            setCfgToken('')
            if (!cfgRepo) { setCfgMsg(t('cfg.savedLocal')); return null }
            return call('sync', { action: 'now' })
          })
          .then(function (v) {
            if (!v) return
            var s = v.sync || {}
            setSync(s)
            if (s.lastError) { setCfgMsg(t('cfg.pushFail', { msg: s.lastError })); notify('err', t('sync.fail', { msg: s.lastError })) }
            else { setCfgMsg(t('cfg.savedPushed')); notify('ok', t('sync.ok')) }
          })
          .catch(function (e) {
            setCfgMsg(t('cfg.fail', { msg: String(e.message || e) }))
            notify('err', t('sync.fail', { msg: String(e.message || e) }))
          })
          .finally(function () { setCfgBusy(false) })
      }

      function onKeyDown(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save() }
      }

      var grouped = useMemo(function () {
        var out = []
        var last = null
        items.forEach(function (it) {
          var k = dayKey(it.createdAt)
          if (k !== last) { out.push({ kind: 'day', key: 'd' + k, label: dayLabel(it.createdAt, t) }); last = k }
          out.push({ kind: 'item', key: it.id, item: it })
        })
        return out
      }, [items])

      var filterChips = [
        { k: 'all', label: t('filter.all'), n: stats.total },
        { k: 'todo', label: t('filter.todo'), n: stats.todo },
        { k: 'done', label: t('filter.done'), n: stats.done },
        { k: 'today', label: t('filter.today') },
        { k: 'pinned', label: t('filter.pinned') },
      ]

      var syncOk = sync && sync.hasToken !== undefined ? (sync.lastError ? 'err' : (sync.repo ? '' : 'off')) : 'off'
      var syncText = sync.lastError ? t('sync.error') : (sync.repo ? (sync.lastPushAt ? t('sync.synced') : t('sync.pending')) : t('sync.local'))

      return h('div', { className: 'dm-wrap' }, [
        h('div', { className: 'dm-head', key: 'head' }, [
          h('h2', { key: 't' }, t('panel')),
          h('span', { className: 'dm-count', key: 'c' }, t('count', { total: stats.total, todo: stats.todo })),
          h('span', { className: 'dm-spacer', key: 's' }),
          h('span', {
            className: 'dm-sync', key: 'sync',
            title: sync.lastError || (sync.repo ? (sync.lastPushAt ? t('sync.tipPushed', { repo: sync.repo, time: sync.lastPushAt }) : t('sync.tipRepo', { repo: sync.repo })) : t('sync.noRepo')),
            onClick: doSync,
          }, [h('span', { className: 'dm-dot ' + syncOk, key: 'd' }), syncText]),
          h('button', {
            key: 'dosync', className: 'dm-syncbtn', disabled: syncing, onClick: doSync,
            title: sync.repo ? t('sync.tip') : t('sync.tipLocal'),
          }, [
            h(Svg, { key: 'i', size: 13, className: syncing ? 'dm-spin' : '' }, [
              h('path', { key: 1, d: 'M21 12a9 9 0 1 1-2.6-6.4' }),
              h('path', { key: 2, d: 'M21 3v6h-6' }),
            ]),
            syncing ? t('sync.doing') : t('sync.now'),
          ]),
          h('input', {
            key: 'q', value: q, placeholder: t('search.ph'),
            onChange: function (e) { setQ(e.target.value) },
            onKeyDown: function (e) { if (e.key === 'Enter') refresh({ q: e.target.value }) },
            style: {
              width: 150, padding: '5px 9px', borderRadius: 8, font: 'inherit', fontSize: 12,
              border: '1px solid var(--dsw-alias-border-l1)', background: 'var(--dsw-alias-bg-layer-1)',
              color: 'inherit', outline: 'none',
            },
          }),
          h('button', {
            key: 'cfg', className: 'dm-ib', title: t('cfg.title'),
            onClick: function () { setShowCfg(true); setCfgMsg('') },
          }, h(Svg, { size: 14 }, [
            h('path', { key: 1, d: 'M3 6h18M3 12h18M3 18h18' }),
            h('circle', { key: 2, cx: 9, cy: 6, r: 2.2 }),
            h('circle', { key: 3, cx: 15, cy: 12, r: 2.2 }),
            h('circle', { key: 4, cx: 8, cy: 18, r: 2.2 }),
          ])),
        ]),

        error ? h('div', { className: 'dm-err', key: 'err' }, error) : null,

        h('div', { className: 'dm-compose', key: 'compose', onDrop: function (e) { e.preventDefault(); addFiles(e.dataTransfer.files) }, onDragOver: function (e) { e.preventDefault() } }, [
          h('textarea', {
            key: 'ta', ref: taRef, className: 'dm-ta', value: draft,
            placeholder: t('compose.ph'),
            onChange: function (e) { setDraft(e.target.value) },
            onKeyDown: onKeyDown, onPaste: onPaste,
          }),
          pending.length > 0 ? h('div', { className: 'dm-thumbs', key: 'th' }, pending.map(function (p, i) {
            return h('div', { className: 'dm-thumb', key: i }, [
              h('img', { src: p.dataUrl, key: 'i' }),
              h('button', { key: 'x', onClick: function () { setPending(function (arr) { return arr.filter(function (_, j) { return j !== i }) }) } }, '×'),
            ])
          })) : null,
          h('div', { className: 'dm-row', key: 'row' }, [
            h('button', { className: 'dm-btn', key: 'img', title: t('btn.imageTip'), onClick: function () { fileRef.current && fileRef.current.click() } },
              [h(Svg, { key: 'i', size: 13 }, [h('rect', { key: 1, x: 3, y: 3, width: 18, height: 18, rx: 2 }), h('circle', { key: 2, cx: 8.5, cy: 8.5, r: 1.5 }), h('path', { key: 3, d: 'M21 15l-5-5L5 21' })]), t('btn.image')]),
            h('input', {
              key: 'f', ref: fileRef, type: 'file', accept: 'image/*', multiple: true,
              style: { display: 'none' },
              onChange: function (e) { addFiles(e.target.files); e.target.value = '' },
            }),
            h('span', { className: 'dm-hint', key: 'h' }, t('compose.hint')),
            h('span', { className: 'dm-spacer', key: 's' }),
            h('button', { className: 'dm-btn pri', key: 'save', disabled: busy, onClick: save }, busy ? t('btn.saving') : t('btn.save')),
          ]),
        ]),

        h('div', { className: 'dm-filters', key: 'filters' }, filterChips.map(function (c) {
          return h('button', {
            key: c.k, className: 'dm-chip' + (filter === c.k ? ' on' : ''),
            onClick: function () { setFilter(c.k) },
          }, c.n !== undefined ? c.label + ' ' + c.n : c.label)
        })),

        // 标签区：全部标签可见，末尾常驻一句"怎么新建"，让自定义这件事是显式的
        h('div', { className: 'dm-tagbox', key: 'tagbox' }, [
          h('span', { key: 'lead', style: { opacity: .7 } }, t('tag.lead')),
        ].concat(tags.length === 0 ? [
          h('span', { className: 'dm-tagnew', key: 'none' }, t('tag.none')),
        ] : tags.map(function (tg) {
          return h('button', {
            key: 'tag-' + tg.name,
            className: 'dm-chip' + (tag === tg.name ? ' on' : ''),
            onClick: function () { toggleTag(tg.name) },
            title: t('tag.usedBy', { n: tg.count || 0 }),
          }, '#' + tg.name + (tg.count ? ' ' + tg.count : ''))
        })).concat([
          h('span', { className: 'dm-tagnew', key: 'howto', title: t('tag.newTip') }, t('tag.new')),
        ])),

        h('div', { className: 'dm-list', key: 'list' }, loading
          ? h('div', { className: 'dm-empty' }, t('empty.loading'))
          : (items.length === 0
            ? h('div', { className: 'dm-empty' }, [
              h(Svg, { key: 'i', size: 28 }, [h('path', { key: 1, d: 'M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9l-5 5H6a2 2 0 0 1-2-2z' })]),
              h('div', { key: 't' }, q || tag || filter !== 'all' ? t('empty.filtered') : t('empty.none')),
            ])
            : grouped.map(function (g) {
              if (g.kind === 'day') return h('div', { className: 'dm-day', key: g.key }, g.label)
              var it = g.item
              return h('div', { className: 'dm-card' + (it.done ? ' done' : ''), key: g.key }, [
                h('button', { className: 'dm-cb', key: 'cb', onClick: function () { toggleDone(it) }, title: it.done ? t('card.markUndone') : t('card.markDone') }, it.done ? h(Check, {}) : null),
                h('div', { className: 'dm-body', key: 'b' }, [
                  h('div', { className: 'dm-txt', key: 't' }, it.body),
                  h('div', { className: 'dm-meta', key: 'm' }, [
                    it.tags.map(function (tg) {
                      return h('span', { className: 'dm-tag', key: tg, onClick: function () { toggleTag(tg) } }, '#' + tg)
                    }),
                    it.source ? h('span', { key: 's' }, t('card.source', { source: it.source })) : null,
                    it.dueAt ? h('span', { key: 'dd' }, t('card.due', { date: it.dueAt })) : null,
                    h('span', { key: 'tm' }, fmtTime(it.createdAt, t)),
                  ]),
                  it.attachments && it.attachments.length > 0 ? h('div', { className: 'dm-imgs', key: 'im' }, it.attachments.map(function (a) {
                    return h('img', { key: a.id, src: a.url, onClick: function () { setZoom(a.url) }, alt: a.name || '' })
                  })) : null,
                ]),
                h('div', { className: 'dm-act', key: 'act' }, [
                  h('button', { className: 'dm-ib', key: 'p', title: t('filter.pinned'), onClick: function () { call('update', { id: it.id, patch: { pinned: !it.pinned } }).then(refresh) } },
                    h(Svg, { size: 13 }, [h('path', { key: 1, d: 'M12 17v5M9 3h6l-1 8 4 3H6l4-3z' })])),
                  h('button', { className: 'dm-ib', key: 'd', title: t('card.del'), onClick: function () { removeItem(it) } },
                    h(Svg, { size: 13 }, [h('path', { key: 1, d: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6' })])),
                ]),
              ])
            }))),

        zoom ? h('div', { className: 'dm-view', key: 'view', onClick: function () { setZoom('') } }, h('img', { src: zoom })) : null,

        // 同步结果通知：成功走成功色，失败走失败色
        toast ? h('div', { className: 'dm-toast ' + toast.kind, key: 'toast', role: 'status' }, [
          h(Svg, { key: 'i', size: 15 }, toast.kind === 'ok'
            ? [h('path', { key: 1, d: 'M20 6L9 17l-5-5' })]
            : [h('circle', { key: 1, cx: 12, cy: 12, r: 9 }), h('path', { key: 2, d: 'M12 8v5M12 16.6v.01' })]),
          h('span', { key: 't' }, toast.text),
        ]) : null,

        showCfg ? h('div', {
          className: 'dm-modal', key: 'cfg',
          onClick: function (e) { if (e.target === e.currentTarget) setShowCfg(false) },
        }, h('div', { className: 'dm-dlg' }, [
          h('h3', { key: 't' }, t('cfg.title')),
          h('div', { className: 'sub', key: 's' }, t('cfg.desc')),
          h('div', { className: 'dm-field', key: 'repo' }, [
            h('label', { key: 'l' }, t('cfg.repo')),
            h('input', {
              key: 'i', value: cfgRepo, placeholder: t('cfg.repoPh'),
              onChange: function (e) { setCfgRepo(e.target.value) },
            }),
            h('div', { className: 'help', key: 'h' }, t('cfg.repoHelp')),
          ]),
          h('div', { className: 'dm-field', key: 'token' }, [
            h('label', { key: 'l' }, t('cfg.token')),
            h('input', {
              key: 'i', type: 'password', value: cfgToken, placeholder: 'github_pat_… / ghp_…',
              onChange: function (e) { setCfgToken(e.target.value) },
            }),
            h('div', { className: 'help', key: 'h' }, t('cfg.tokenHelp')),
          ]),
          cfgMsg ? h('div', { className: 'help', key: 'm' }, cfgMsg) : null,
          h('div', { className: 'dm-dlgfoot', key: 'f' }, [
            h('button', { className: 'dm-btn pri', key: 'save', disabled: cfgBusy, onClick: saveCfg }, cfgBusy ? t('btn.saving') : t('cfg.save')),
            h('span', { className: 'dm-spacer', key: 'sp' }),
            h('button', { className: 'dm-btn', key: 'c', onClick: function () { setShowCfg(false) } }, t('cfg.close')),
          ]),
        ])) : null,
      ])
    }

    /* ---------------- 插件 ---------------- */

    function apply(ctx) {
      ctx.effect(function () { return ctx.locale.register(NS, DICT) }, 'dsh-memo: dictionaries')
      var tSlot = makeT(ctx.locale.bind(NS))

      var styleEl = document.createElement('style')
      styleEl.setAttribute('data-dsh-memo', '')
      styleEl.textContent = CSS
      document.head.appendChild(styleEl)
      ctx.effect(function () { return function () { styleEl.remove() } }, 'dsh-memo: styles')

      ctx.slots.inject('main', function () {
        return ctx.slots.register({ name: 'main', key: PANEL_ID, locale: NS }, MemoPanel)
      })
      ctx.slots.inject('sidebar.panellist', function () {
        return ctx.slots.register({
          name: 'sidebar.panellist',
          id: PANEL_ID,
          order: 20,
          locale: NS,
          label: function () { return tSlot('panel') },
        }, MemoIcon)
      })
    }

    exports.apply = apply
    exports.inject = ['slots', 'locale']
    return module.exports
  },
})
