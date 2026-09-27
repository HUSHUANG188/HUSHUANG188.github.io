const FAMILY_SESSION_KEY = 'virtual-fridge-family-session'
const FAMILY_BACKUP_PREFIX = 'virtual-fridge-v5-backup:'

function familyCacheKey(familyId) {
  return `virtual-fridge-family-cache:${familyId}`
}

function formatFamilyFridgeTitle(name) {
  const familyName = typeof name === 'string' ? name.trim() : ''
  if (!familyName) return '家庭冰箱'
  return `${familyName}${familyName.endsWith('家') ? '的冰箱' : '家的冰箱'}`
}

function splitIntoChunks(items, size = 15) {
  const chunks = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

function buildMigrationSelection({ state = {}, magnets = [], includeRecords, includeDoorNotes, includeDoorPhotos }) {
  return {
    foods: includeRecords && Array.isArray(state.foods) ? state.foods : [],
    history: includeRecords && Array.isArray(state.history) ? state.history : [],
    purchases: includeRecords && Array.isArray(state.purchases) ? state.purchases : [],
    magnets: (Array.isArray(magnets) ? magnets : []).filter(magnet => {
      const photo = magnet && ['photo', 'album'].includes(magnet.type)
      return photo ? includeDoorPhotos === true : includeDoorNotes === true
    })
  }
}

function callFamily(wxApi, action, data = {}, timeoutMs = 15000) {
  return new Promise(resolve => {
    if (!wxApi.cloud || typeof wxApi.cloud.callFunction !== 'function') {
      resolve({ ok: false, error: 'cloud-unavailable', message: '家庭冰箱暂时无法连接云端' })
      return
    }
    let settled = false
    const finish = result => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(result && typeof result === 'object' ? result : { ok: false, error: 'empty-result', message: '云端没有返回数据' })
    }
    const timer = setTimeout(() => finish({ ok: false, error: 'client-timeout', message: '同步超时，请稍后重试' }), timeoutMs)
    try {
      wxApi.cloud.callFunction({
        name: 'family',
        data: { action, ...data },
        success: ({ result }) => finish(result),
        fail: error => finish({ ok: false, error: 'cloud-failed', message: String(error && error.errMsg || '云端连接失败') })
      })
    } catch (error) {
      finish({ ok: false, error: 'cloud-failed', message: '云端连接失败' })
    }
  })
}

module.exports = {
  FAMILY_BACKUP_PREFIX,
  FAMILY_SESSION_KEY,
  buildMigrationSelection,
  callFamily,
  familyCacheKey,
  formatFamilyFridgeTitle,
  splitIntoChunks
}
