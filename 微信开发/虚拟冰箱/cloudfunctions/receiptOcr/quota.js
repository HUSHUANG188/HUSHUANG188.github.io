const crypto = require('crypto')

const USER_DAILY_LIMIT = 10
const GLOBAL_DAILY_LIMIT = 100
const COOLDOWN_MS = 10 * 1000

function shanghaiDayKey(now = Date.now()) {
  return new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function openidKey(openid) {
  return crypto.createHash('sha256').update(openid).digest('hex').slice(0, 24)
}

function reserveQuota(state, openid, now = Date.now()) {
  const day = shanghaiDayKey(now)
  const current = state && state.day === day ? state : { day, total: 0, users: {} }
  const users = current.users && typeof current.users === 'object' ? current.users : {}
  const key = openidKey(openid)
  const user = users[key] || { count: 0, lastIssuedAt: 0 }

  if (user.lastIssuedAt && now - user.lastIssuedAt < COOLDOWN_MS) {
    return { ok: false, error: 'receipt-rate-limited', message: '请求太频繁，请稍后再试' }
  }
  if (user.count >= USER_DAILY_LIMIT) {
    return { ok: false, error: 'receipt-user-daily-limit', message: '今日智能识别次数已用完，请手动录入' }
  }
  if (current.total >= GLOBAL_DAILY_LIMIT) {
    return { ok: false, error: 'receipt-global-daily-limit', message: '今日智能识别服务次数已用完，请手动录入' }
  }

  return {
    ok: true,
    data: {
      day,
      total: current.total + 1,
      users: {
        ...users,
        [key]: { count: user.count + 1, lastIssuedAt: now }
      }
    }
  }
}

module.exports = {
  USER_DAILY_LIMIT,
  GLOBAL_DAILY_LIMIT,
  COOLDOWN_MS,
  openidKey,
  shanghaiDayKey,
  reserveQuota
}
