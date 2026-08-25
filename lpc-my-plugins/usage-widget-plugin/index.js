import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * dsh-usage-widget — Host plugin in the same style as dsh-whale-widget:
 * - reads DEEPSEEK_API_KEY via ctx.credentials
 * - proxies DeepSeek /user/balance
 * - accumulates local token usage from session events
 * - injects a floating Web UI via tapIndex + /widget.js
 */

export const name = 'dsh-usage-widget'
export const inject = ['webServer', 'credentials']

const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const USAGE_FILE = path.join(DSH_HOME, '.dsh-usage-widget.json')
const BALANCE_URL = 'https://api.deepseek.com/user/balance'
const BALANCE_TTL_MS = 25_000

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'no-store',
}

function todayKey() {
  return new Date().toISOString().slice(0, 10)
}

function emptyUsage() {
  return {
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    today: { date: todayKey(), totalTokens: 0, inputTokens: 0, outputTokens: 0 },
    updatedAt: null,
  }
}

function readUsage() {
  try {
    const parsed = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8'))
    if (!parsed || typeof parsed !== 'object') return emptyUsage()
    const today = parsed.today && parsed.today.date === todayKey()
      ? parsed.today
      : { date: todayKey(), totalTokens: 0, inputTokens: 0, outputTokens: 0 }
    return {
      totalTokens: Number(parsed.totalTokens) || 0,
      inputTokens: Number(parsed.inputTokens) || 0,
      outputTokens: Number(parsed.outputTokens) || 0,
      cacheReadTokens: Number(parsed.cacheReadTokens) || 0,
      cacheWriteTokens: Number(parsed.cacheWriteTokens) || 0,
      today,
      updatedAt: parsed.updatedAt || null,
    }
  } catch {
    return emptyUsage()
  }
}

function writeUsage(state) {
  try {
    fs.mkdirSync(DSH_HOME, { recursive: true })
    fs.writeFileSync(USAGE_FILE, JSON.stringify(state, null, 2), 'utf8')
  } catch (err) {
    console.error('[usage-widget] persist failed:', err?.message || err)
  }
}

function addUsage(usage) {
  if (!usage || typeof usage !== 'object') return readUsage()
  const state = readUsage()
  const input = Number(usage.inputTokens) || 0
  const output = Number(usage.outputTokens) || 0
  const cacheRead = Number(usage.cacheReadTokens) || 0
  const cacheWrite = Number(usage.cacheWriteTokens) || 0
  const total = input + output + cacheRead + cacheWrite
  if (total <= 0) return state

  state.inputTokens += input
  state.outputTokens += output
  state.cacheReadTokens += cacheRead
  state.cacheWriteTokens += cacheWrite
  state.totalTokens += total
  if (!state.today || state.today.date !== todayKey()) {
    state.today = { date: todayKey(), totalTokens: 0, inputTokens: 0, outputTokens: 0 }
  }
  state.today.inputTokens += input
  state.today.outputTokens += output
  state.today.totalTokens += total
  state.updatedAt = new Date().toISOString()
  writeUsage(state)
  return state
}

const WIDGET_JS = `(function () {
if (window.__dshUsageWidget) return
window.__dshUsageWidget = true

var REFRESH_MS = 60000
var USAGE_URL = '/dsh-usage/usage.json'
var BALANCE_URL = '/dsh-usage/balance.json'

var css = [
  '#dsh-usage-widget{position:fixed;right:16px;top:16px;z-index:9998;width:220px;padding:12px 14px;border-radius:12px;',
  'background:rgba(18,22,30,.88);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.12);',
  'color:#e8ecf4;font:12px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.35);',
  'cursor:pointer;user-select:none;transition:opacity .15s ease}',
  '#dsh-usage-widget:hover{opacity:.96}',
  '#dsh-usage-widget .u-title{font-size:11px;letter-spacing:.04em;color:#9aa6bd;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center}',
  '#dsh-usage-widget .u-row{display:flex;justify-content:space-between;gap:8px;margin:4px 0}',
  '#dsh-usage-widget .u-label{color:#9aa6bd}',
  '#dsh-usage-widget .u-value{font-weight:650;color:#f4f7ff;font-variant-numeric:tabular-nums}',
  '#dsh-usage-widget .u-balance{font-size:20px;font-weight:750;margin:2px 0 8px;color:#7dd3a7;font-variant-numeric:tabular-nums}',
  '#dsh-usage-widget .u-hint{margin-top:8px;color:#7f8aa3;font-size:11px}',
  '#dsh-usage-widget .u-err{color:#f0a0a0}'
].join('')

var style = document.createElement('style')
style.textContent = css
document.head.appendChild(style)

var root = document.createElement('div')
root.id = 'dsh-usage-widget'
root.title = '点击刷新'
root.innerHTML = [
  '<div class="u-title"><span>用量</span><span id="dsh-u-status">…</span></div>',
  '<div class="u-balance" id="dsh-u-balance">--</div>',
  '<div class="u-row"><span class="u-label">赠送额度</span><span class="u-value" id="dsh-u-granted">--</span></div>',
  '<div class="u-row"><span class="u-label">充值余额</span><span class="u-value" id="dsh-u-topup">--</span></div>',
  '<div class="u-row"><span class="u-label">今日 token</span><span class="u-value" id="dsh-u-today">--</span></div>',
  '<div class="u-row"><span class="u-label">累计 token</span><span class="u-value" id="dsh-u-total">--</span></div>',
  '<div class="u-hint" id="dsh-u-hint">点击刷新 · 余额来自 DeepSeek</div>'
].join('')
document.body.appendChild(root)

function $(id) { return document.getElementById(id) }
function fmtMoney(n, currency) {
  if (n === null || n === undefined || !isFinite(Number(n))) return '--'
  var v = Number(n).toFixed(2)
  return currency === 'USD' ? ('$ ' + v) : ('¥ ' + v)
}
function fmtTok(n) {
  n = Number(n) || 0
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return String(Math.round(n))
}

var busy = false
function setStatus(text, isErr) {
  var el = $('dsh-u-status')
  el.textContent = text
  el.className = isErr ? 'u-err' : ''
}

function applyBalance(data) {
  if (!data || !data.ok) {
    setStatus(data && data.code === 'NO_KEY' ? '无密钥' : '余额失败', true)
    $('dsh-u-hint').textContent = (data && data.error) ? String(data.error).slice(0, 48) : '余额获取失败'
    $('dsh-u-hint').className = 'u-hint u-err'
    return
  }
  setStatus(data.isAvailable === false ? '余额不足' : '可用', data.isAvailable === false)
  $('dsh-u-balance').textContent = fmtMoney(data.totalBalance, data.currency)
  $('dsh-u-granted').textContent = fmtMoney(data.grantedBalance, data.currency)
  $('dsh-u-topup').textContent = fmtMoney(data.toppedUpBalance, data.currency)
  $('dsh-u-hint').className = 'u-hint'
  $('dsh-u-hint').textContent = data.stale
    ? '余额可能过期 · 点击重试'
    : '点击刷新 · 余额来自 DeepSeek API'
}

function applyUsage(data) {
  if (!data || !data.ok) return
  var today = data.today && data.today.date ? data.today.totalTokens : 0
  $('dsh-u-today').textContent = fmtTok(today)
  $('dsh-u-total').textContent = fmtTok(data.totalTokens)
}

function refresh() {
  if (busy) return
  busy = true
  setStatus('刷新中')
  Promise.all([
    fetch(BALANCE_URL, { cache: 'no-store' }).then(function (r) { return r.json() }).catch(function (e) {
      return { ok: false, error: String(e && e.message || e) }
    }),
    fetch(USAGE_URL, { cache: 'no-store' }).then(function (r) { return r.json() }).catch(function () {
      return { ok: false }
    })
  ]).then(function (pair) {
    applyBalance(pair[0])
    applyUsage(pair[1])
  }).finally(function () { busy = false })
}

root.addEventListener('click', refresh)
refresh()
setInterval(refresh, REFRESH_MS)
})();`

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 */
export function apply(ctx) {
  let balanceCache = null
  let balanceInFlight = null

  async function fetchBalance() {
    let cred
    try {
      cred = await ctx.credentials.resolve('DEEPSEEK_API_KEY')
    } catch (err) {
      return { ok: false, code: 'NO_KEY', error: '凭据读取失败: ' + String(err?.message || err).slice(0, 160) }
    }
    if (!cred?.value) {
      return { ok: false, code: 'NO_KEY', error: '未配置 DEEPSEEK_API_KEY' }
    }

    let lastErr = null
    for (let attempt = 0; attempt < 2; attempt++) {
      let res
      try {
        res = await fetch(BALANCE_URL, {
          headers: { Authorization: 'Bearer ' + cred.value },
          signal: AbortSignal.timeout(20_000),
        })
      } catch (err) {
        lastErr = err
        if (attempt === 0) await new Promise((r) => setTimeout(r, 500))
        continue
      }
      if (!res.ok) {
        lastErr = new Error('HTTP ' + res.status)
        if (res.status < 500) break
        if (attempt === 0) await new Promise((r) => setTimeout(r, 500))
        continue
      }
      let data
      try {
        data = await res.json()
      } catch {
        return { ok: false, code: 'PARSE', error: '余额接口返回不是合法 JSON' }
      }
      const info = Array.isArray(data?.balance_infos) ? data.balance_infos[0] : null
      if (!info || info.total_balance === undefined) {
        return { ok: false, code: 'SHAPE', error: '余额接口返回结构异常' }
      }
      return {
        ok: true,
        isAvailable: data.is_available !== false,
        totalBalance: Number(info.total_balance),
        grantedBalance: Number(info.granted_balance ?? 0),
        toppedUpBalance: Number(info.topped_up_balance ?? 0),
        currency: String(info.currency || 'CNY'),
        updatedAt: new Date().toISOString(),
      }
    }
    const transient = !(lastErr && /^HTTP 4\d\d/.test(String(lastErr.message)))
    return {
      ok: false,
      code: 'HTTP',
      transient,
      error: '余额接口请求失败: ' + String(lastErr?.message || lastErr).slice(0, 200),
    }
  }

  function getBalance() {
    const now = Date.now()
    if (balanceCache && now - balanceCache.at < BALANCE_TTL_MS) {
      return Promise.resolve(balanceCache.payload)
    }
    if (balanceInFlight) return balanceInFlight
    balanceInFlight = fetchBalance()
      .then((payload) => {
        if (payload.ok) {
          balanceCache = { at: now, payload }
          return payload
        }
        if (payload.transient && balanceCache) {
          return { ...balanceCache.payload, stale: true, error: payload.error }
        }
        if (!payload.transient) console.error('[usage-widget]', payload.code, payload.error)
        return payload
      })
      .catch((err) => ({
        ok: false,
        code: 'ERROR',
        error: '余额服务异常: ' + String(err?.message || err).slice(0, 200),
      }))
      .finally(() => {
        balanceInFlight = null
      })
    return balanceInFlight
  }

  // Accumulate billed tokens from finished assistant messages.
  ctx.on('session/event', (_session, event) => {
    if (event?.type !== 'assistant/message') return
    const usage = event.data?.usage
    if (usage) addUsage(usage)
  })

  const disposers = []

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-usage/balance.json',
    async handler(_req, res) {
      try {
        const payload = await getBalance()
        res.writeHead(200, JSON_HEADERS)
        res.end(JSON.stringify(payload))
      } catch (err) {
        res.writeHead(200, JSON_HEADERS)
        res.end(JSON.stringify({ ok: false, code: 'ERROR', error: String(err?.message || err).slice(0, 200) }))
      }
    },
  }))

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-usage/usage.json',
    handler(_req, res) {
      const usage = readUsage()
      res.writeHead(200, JSON_HEADERS)
      res.end(JSON.stringify({ ok: true, ...usage }))
    },
  }))

  disposers.push(ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-usage/widget.js',
    handler(_req, res) {
      res.writeHead(200, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      res.end(WIDGET_JS)
    },
  }))

  disposers.push(ctx.webServer.tapIndex((html) => {
    if (html.includes('/dsh-usage/widget.js')) return html
    const tag = '<script defer src="/dsh-usage/widget.js"></script>'
    if (html.includes('</body>')) return html.replace('</body>', `${tag}</body>`)
    return html + tag
  }))

  ctx.effect(() => () => {
    for (const dispose of disposers) {
      try { dispose() } catch { /* ignore */ }
    }
  }, 'usage-widget: routes')
}
