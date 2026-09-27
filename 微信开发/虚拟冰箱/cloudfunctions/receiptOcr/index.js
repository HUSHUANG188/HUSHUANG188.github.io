const cloud = require('wx-server-sdk')
const { createGlmToken } = require('./glm-auth')
const { openidKey, shanghaiDayKey, reserveQuota } = require('./quota')
const { mergeClassificationEntries, selectClassificationEntries } = require('./classification-memory')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database({ throwOnNotFound: false })
const CLASSIFICATION_COLLECTION = 'receipt_classification_profiles'

async function readClassificationProfile(openid) {
  try {
    const result = await db.collection(CLASSIFICATION_COLLECTION).doc(`profile-${openidKey(openid)}`).get()
    return result && result.data || null
  } catch (error) {
    if (error && (error.errCode === -502001 || String(error.errMsg || '').includes('not exist'))) return null
    throw error
  }
}

async function getClassifications(openid, names) {
  const profile = await readClassificationProfile(openid)
  return { ok: true, entries: selectClassificationEntries(profile && profile.entries, names).map(({ key, inventoryType, category }) => ({ key, inventoryType, category })) }
}

async function rememberClassifications(openid, corrections) {
  const profile = await readClassificationProfile(openid)
  const entries = mergeClassificationEntries(profile && profile.entries, corrections, Date.now(), 500)
  await db.collection(CLASSIFICATION_COLLECTION).doc(`profile-${openidKey(openid)}`).set({ data: { entries, updatedAt: db.serverDate() } })
  return { ok: true }
}

async function takeQuota(openid, now) {
  const docId = `receipt-ocr-${shanghaiDayKey(now)}`
  const transactionResult = await db.runTransaction(async transaction => {
    const doc = transaction.collection('receipt_ocr_limits').doc(docId)
    const snapshot = await doc.get()
    const result = reserveQuota(snapshot.data, openid, now)
    if (!result.ok) return result
    await doc.set({ data: result.data })
    return { ok: true }
  })
  return transactionResult && transactionResult.result
    ? transactionResult.result
    : transactionResult
}

async function deleteMyQuotaData(openid) {
  const key = openidKey(openid)
  const collection = db.collection('receipt_ocr_limits')
  let offset = 0
  while (true) {
    const result = await collection.skip(offset).limit(100).get()
    const records = result && Array.isArray(result.data) ? result.data : []
    for (const record of records) {
      if (!record._id.startsWith('receipt-ocr-') || !record.users || !record.users[key]) continue
      const users = { ...record.users }
      delete users[key]
      const { _id, ...data } = record
      await collection.doc(_id).set({ data: { ...data, users } })
    }
    if (records.length < 100) break
    offset += records.length
  }
  try { await db.collection(CLASSIFICATION_COLLECTION).doc(`profile-${key}`).remove() } catch (error) {}
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { ok: false, error: 'unauthorized' }
  if (event.action === 'deleteMyData') {
    await deleteMyQuotaData(OPENID)
    return { ok: true, data: { deleted: true } }
  }
  if (event.action === 'classifications') return getClassifications(OPENID, event.names)
  if (event.action === 'remember-classifications') return rememberClassifications(OPENID, event.corrections)
  if (event.action !== 'glm-token') return { ok: false, error: 'invalid-action' }
  const apiKey = process.env.GLM_API_KEY
  if (!apiKey) return { ok: false, error: 'glm-not-configured', message: '智能识别服务未配置，请手动录入' }
  try {
    const now = Date.now()
    const token = createGlmToken(apiKey, 30, now)
    const quota = await takeQuota(OPENID, now)
    if (!quota || quota.ok !== true) return quota || { ok: false, error: 'quota-check-failed', message: '智能识别服务暂不可用，请手动录入' }
    return { ok: true, ...token, model: process.env.GLM_MODEL || 'glm-5.3-flash' }
  } catch (error) {
    console.error('[receipt-ocr] token quota failed', String(error && (error.errMsg || error.message) || error))
    return { ok: false, error: 'glm-token-failed', message: '智能识别凭证生成失败，请手动录入' }
  }
}
