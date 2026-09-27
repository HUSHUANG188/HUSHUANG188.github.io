const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { buildGlmReceiptPayload, parseGlmReceiptContent } = require('../utils/receipt')
const { createGlmToken } = require('../cloudfunctions/receiptOcr/glm-auth')
const {
  USER_DAILY_LIMIT,
  GLOBAL_DAILY_LIMIT,
  COOLDOWN_MS,
  shanghaiDayKey,
  reserveQuota
} = require('../cloudfunctions/receiptOcr/quota')

const now = 1788274800000
const { token, expiresAt } = createGlmToken('key-id.key-secret', undefined, now)
const [headerPart, payloadPart, signaturePart] = token.split('.')
const decode = (value) => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
assert.deepEqual(decode(headerPart), { alg: 'HS256', sign_type: 'SIGN' })
assert.deepEqual(decode(payloadPart), {
  api_key: 'key-id',
  exp: now + 30000,
  timestamp: now
})
assert.equal(expiresAt, now + 30000)
assert.equal(
  signaturePart,
  crypto.createHmac('sha256', 'key-secret').update(`${headerPart}.${payloadPart}`).digest('base64url')
)
assert.throws(() => createGlmToken('invalid-key'), /invalid GLM API key/)

assert.equal(USER_DAILY_LIMIT, 10)
assert.equal(GLOBAL_DAILY_LIMIT, 100)
assert.equal(COOLDOWN_MS, 10000)
assert.equal(shanghaiDayKey(Date.parse('2026-09-01T16:00:00Z')), '2026-09-02')

let quotaState = null
for (let index = 0; index < USER_DAILY_LIMIT; index += 1) {
  const reservation = reserveQuota(quotaState, 'user-a', now + index * COOLDOWN_MS)
  assert.equal(reservation.ok, true)
  quotaState = reservation.data
}
assert.equal(reserveQuota(quotaState, 'user-a', now + USER_DAILY_LIMIT * COOLDOWN_MS).error, 'receipt-user-daily-limit')
assert.equal(reserveQuota(null, 'user-a', now + COOLDOWN_MS - 1).ok, true)
const firstReservation = reserveQuota(null, 'user-a', now)
assert.equal(reserveQuota(firstReservation.data, 'user-a', now + COOLDOWN_MS - 1).error, 'receipt-rate-limited')

quotaState = null
for (let index = 0; index < GLOBAL_DAILY_LIMIT; index += 1) {
  const reservation = reserveQuota(quotaState, `user-${index}`, now)
  assert.equal(reservation.ok, true)
  quotaState = reservation.data
}
assert.equal(reserveQuota(quotaState, 'user-over-global-limit', now).error, 'receipt-global-daily-limit')
assert.equal(reserveQuota(quotaState, 'user-a', now + 24 * 60 * 60 * 1000).ok, true)

const payload = buildGlmReceiptPayload('ZmFrZQ==', 'image/png', 'glm-server-selected')
assert.equal(payload.model, 'glm-server-selected')
assert.equal(payload.messages[0].content[1].image_url.url, 'data:image/png;base64,ZmFrZQ==')
assert.deepEqual(payload.response_format, { type: 'json_object' })
assert.deepEqual(payload.thinking, { type: 'enabled' })
assert.equal(payload.reasoning_effort, 'low')

const receipt = parseGlmReceiptContent('```json\n{"total":25,"items":[{"name":"鲜牛奶","quantity":2,"unit":"盒","unitPrice":12.5,"amount":25},{"name":"微信支付","amount":25}]}\n```')
assert.deepEqual(receipt, {
  total: 25,
  items: [{ name: '鲜牛奶', quantity: 2, unit: '盒', unitPrice: 12.5, amount: 25, inventoryType: 'food', category: '乳制品', confidence: 'high' }]
})

console.log('GLM receipt token and parser: ok')
