const crypto = require('crypto')

function base64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function createGlmToken(apiKey, expiresInSeconds = 30, now = Date.now()) {
  const separator = typeof apiKey === 'string' ? apiKey.indexOf('.') : -1
  if (separator <= 0 || separator === apiKey.length - 1) throw new Error('invalid GLM API key')
  const keyId = apiKey.slice(0, separator)
  const secret = apiKey.slice(separator + 1)
  const expiresAt = now + expiresInSeconds * 1000
  const header = base64Url(JSON.stringify({ alg: 'HS256', sign_type: 'SIGN' }))
  const payload = base64Url(JSON.stringify({ api_key: keyId, exp: expiresAt, timestamp: now }))
  const signature = base64Url(crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest())
  return { token: `${header}.${payload}.${signature}`, expiresAt }
}

module.exports = { createGlmToken }
