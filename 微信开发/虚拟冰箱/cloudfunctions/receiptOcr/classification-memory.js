const CATEGORIES = new Set(['蔬菜', '水果', '菌菇', '肉禽', '水产', '蛋类', '乳制品', '豆制品', '熟食', '烘焙', '速冻食品', '主食粮油', '饮料', '调味品', '零食', '干货', '其他食品'])

function cleanName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 20) : ''
}

function normalizeKey(value) {
  return cleanName(value).toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]/g, '').slice(0, 40)
}

function mergeClassificationEntries(existing, incoming, now = Date.now(), limit = 500) {
  const entries = new Map((Array.isArray(existing) ? existing : [])
    .filter((item) => item && item.key && ['food', 'nonfood'].includes(item.inventoryType))
    .map((item) => [item.key, item]))

  ;(Array.isArray(incoming) ? incoming : []).forEach((item) => {
    const name = cleanName(item && item.name)
    const key = normalizeKey(name)
    const inventoryType = item && item.inventoryType
    if (!key || !['food', 'nonfood'].includes(inventoryType)) return
    const category = inventoryType === 'food' && CATEGORIES.has(item.category) ? item.category : ''
    if (inventoryType === 'food' && !category) return
    entries.set(key, { key, name, inventoryType, category, updatedAt: now })
  })

  return [...entries.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit)
}

function selectClassificationEntries(entries, names) {
  const wanted = new Set((Array.isArray(names) ? names : []).map(normalizeKey).filter(Boolean))
  return (Array.isArray(entries) ? entries : []).filter((entry) => wanted.has(entry.key))
}

module.exports = { mergeClassificationEntries, normalizeKey, selectClassificationEntries }
