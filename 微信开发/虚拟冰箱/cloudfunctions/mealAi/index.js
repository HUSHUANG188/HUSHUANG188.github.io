const cloud = require('wx-server-sdk')
const crypto = require('crypto')
const https = require('https')
const { buildOverviewMessages, sanitizeEvent } = require('./prompt')
const { openidKey, shanghaiDayKey, reserveQuota } = require('./quota')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database({ throwOnNotFound: false })

async function takeQuota(openid, now) {
  const docId = `meal-ai-${shanghaiDayKey(now)}`
  const transactionResult = await db.runTransaction(async transaction => {
    const doc = transaction.collection('receipt_ocr_limits').doc(docId)
    const snapshot = await doc.get()
    const result = reserveQuota(snapshot.data, openid, now)
    if (!result.ok) return result
    await doc.set({ data: result.data })
    return { ok: true }
  })
  return transactionResult && transactionResult.result ? transactionResult.result : transactionResult
}

async function deleteMyQuotaData(openid) {
  const key = openidKey(openid)
  const collection = db.collection('receipt_ocr_limits')
  let offset = 0
  while (true) {
    const result = await collection.skip(offset).limit(100).get()
    const records = result && Array.isArray(result.data) ? result.data : []
    for (const record of records) {
      if (!record._id.startsWith('meal-ai-') || !record.users || !record.users[key]) continue
      const users = { ...record.users }
      delete users[key]
      const { _id, ...data } = record
      await collection.doc(_id).set({ data: { ...data, users } })
    }
    if (records.length < 100) break
    offset += records.length
  }
}

function publicError(error) {
  const status = Number(error && error.statusCode)
  if (status === 401) return { error: 'deepseek-auth-failed', message: 'AI 服务认证失败，请稍后重试' }
  if (status === 402) return { error: 'deepseek-balance-empty', message: 'AI 服务额度不足，请稍后重试' }
  if (status === 429) return { error: 'deepseek-rate-limited', message: 'AI 请求较多，请稍后重试' }
  if (status >= 500) return { error: 'deepseek-unavailable', message: 'AI 服务暂时繁忙，请稍后重试' }
  if (error && error.code === 'ETIMEDOUT') return { error: 'deepseek-timeout', message: 'AI 响应超时，请稍后重试' }
  return { error: 'deepseek-request-failed', message: 'AI 暂时不可用，请稍后重试' }
}

function publicUsage(usage = {}) {
  return {
    promptTokens: Math.max(0, Number(usage.prompt_tokens) || 0),
    completionTokens: Math.max(0, Number(usage.completion_tokens) || 0),
    totalTokens: Math.max(0, Number(usage.total_tokens) || 0)
  }
}

function requestDeepSeek({ apiUrl, apiKey, model, messages, userId }) {
  return new Promise((resolve, reject) => {
    let target
    try {
      target = new URL(apiUrl)
    } catch (error) {
      reject(new Error('invalid-api-url'))
      return
    }
    if (target.protocol !== 'https:') {
      reject(new Error('invalid-api-protocol'))
      return
    }
    const body = JSON.stringify({
      model,
      messages,
      response_format: { type: 'json_object' },
      thinking: { type: 'disabled' },
      temperature: 0.4,
      max_tokens: 1000,
      user_id: userId
    })
    const request = https.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 443,
      path: `${target.pathname}${target.search}`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 18000
    }, (response) => {
      let raw = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        raw += chunk
        if (raw.length > 1024 * 1024) request.destroy(new Error('response-too-large'))
      })
      response.on('end', () => {
        let parsed
        try {
          parsed = JSON.parse(raw)
        } catch (error) {
          reject(new Error('invalid-provider-json'))
          return
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const providerError = new Error('provider-error')
          providerError.statusCode = response.statusCode
          reject(providerError)
          return
        }
        const choice = parsed && parsed.choices && parsed.choices[0]
        if (!choice || !choice.message || !choice.message.content || choice.finish_reason === 'length' || choice.finish_reason === 'content_filter') {
          reject(new Error('incomplete-provider-response'))
          return
        }
        try {
          resolve({ data: JSON.parse(choice.message.content), model: parsed.model || model, usage: publicUsage(parsed.usage) })
        } catch (error) {
          reject(new Error('invalid-content-json'))
        }
      })
    })
    const deadline = setTimeout(() => {
      const error = new Error('timeout')
      error.code = 'ETIMEDOUT'
      request.destroy(error)
    }, 18000)
    request.on('timeout', () => request.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })))
    request.on('error', (error) => {
      clearTimeout(deadline)
      reject(error)
    })
    request.on('close', () => clearTimeout(deadline))
    request.end(body)
  })
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { ok: false, error: 'unauthorized', message: '无法确认当前用户，请稍后重试' }
  if (event.action === 'deleteMyData') {
    await deleteMyQuotaData(OPENID)
    return { ok: true, data: { deleted: true } }
  }
  if (event.action !== 'recipes') return { ok: false, error: 'invalid-action', message: '不支持的 AI 请求' }
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return { ok: false, error: 'deepseek-not-configured', message: 'AI 服务尚未配置，请稍后重试' }

  const input = sanitizeEvent(event)
  if (!input.foods.length) return { ok: false, error: 'empty-inventory', message: '冰箱里还没有可用于建议的食材' }
  const startedAt = Date.now()
  try {
    const quota = await takeQuota(OPENID, Date.now())
    if (!quota || quota.ok !== true) return quota || { ok: false, error: 'quota-check-failed', message: 'AI 暂时不可用，请稍后重试' }
    const result = await requestDeepSeek({
      apiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions',
      apiKey,
      model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
      messages: buildOverviewMessages(input),
      userId: crypto.createHash('sha256').update(OPENID).digest('hex').slice(0, 32)
    })
    console.info('[meal-ai]', { outcome: 'success', durationMs: Date.now() - startedAt, model: result.model, usage: result.usage })
    return { ok: true, data: result.data, model: result.model }
  } catch (error) {
    const failure = publicError(error)
    console.error('[meal-ai]', { outcome: 'failure', durationMs: Math.max(0, Date.now() - startedAt), error: failure.error })
    return { ok: false, ...failure }
  }
}

module.exports._test = { publicError, requestDeepSeek }
