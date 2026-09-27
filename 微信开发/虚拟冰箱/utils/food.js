const { normalizeFoodCategory } = require('./receipt')

function daysUntil(dateText, now = new Date()) {
  const [year, month, day] = dateText.split('-').map(Number)
  const target = new Date(year, month - 1, day)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function addDays(dateText, days) {
  const [year, month, day] = dateText.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + days)
  return formatDate(date)
}

const shelfLifeReferences = [
  { keywords: ['鸡蛋', '土鸡蛋'], label: '带壳鸡蛋', days: { fridge: 28, freezer: 0, room: 0 } },
  { keywords: ['鸡肉', '鸡胸', '鸡胸肉', '鸡腿', '鸡腿肉', '鸭肉'], label: '生鲜禽肉', days: { fridge: 2, freezer: 270, room: 0 } },
  { keywords: ['牛肉', '猪肉', '羊肉', '排骨'], label: '生鲜肉类', days: { fridge: 3, freezer: 120, room: 0 } },
  { keywords: ['鱼', '虾', '蟹', '贝'], label: '生鲜水产', days: { fridge: 2, freezer: 90, room: 0 } },
  { keywords: ['剩菜', '熟食', '饭菜'], label: '熟食与剩菜', days: { fridge: 4, freezer: 90, room: 0 } },
  { keywords: ['牛奶', '鲜奶', '鲜牛奶'], label: '鲜奶', days: { fridge: 7, freezer: 30, room: 0 } },
  { keywords: ['酸奶'], label: '酸奶', days: { fridge: 14, freezer: 30, room: 0 } },
  { keywords: ['豆腐'], label: '豆制品', days: { fridge: 3, freezer: 30, room: 0 } },
  { keywords: ['菠菜', '生菜', '青菜', '油麦菜'], label: '叶菜', days: { fridge: 5, freezer: 30, room: 2 } },
  { keywords: ['苹果', '梨', '橙', '柑'], label: '耐储水果', days: { fridge: 14, freezer: 30, room: 7 } }
]

const categoryShelfLife = {
  蔬菜水果: { fridge: 7, freezer: 30, room: 3 },
  肉蛋水产: { fridge: 2, freezer: 90, room: 0 },
  蔬菜: { fridge: 7, freezer: 30, room: 3 },
  水果: { fridge: 14, freezer: 30, room: 7 },
  菌菇: { fridge: 5, freezer: 30, room: 1 },
  肉禽: { fridge: 3, freezer: 120, room: 0 },
  水产: { fridge: 2, freezer: 90, room: 0 },
  蛋类: { fridge: 28, freezer: 0, room: 0 },
  乳制品: { fridge: 7, freezer: 30, room: 0 },
  豆制品: { fridge: 3, freezer: 30, room: 0 },
  熟食: { fridge: 4, freezer: 90, room: 0 },
  烘焙: { fridge: 5, freezer: 30, room: 3 },
  速冻食品: { fridge: 0, freezer: 90, room: 0 },
  主食: { fridge: 4, freezer: 90, room: 0 },
  主食粮油: { fridge: 4, freezer: 90, room: 30 },
  饮料: { fridge: 7, freezer: 30, room: 0 },
  调味品: { fridge: 30, freezer: 0, room: 180 },
  零食: { fridge: 30, freezer: 30, room: 90 },
  干货: { fridge: 30, freezer: 90, room: 180 },
  其他: { fridge: 7, freezer: 30, room: 0 },
  其他食品: { fridge: 7, freezer: 30, room: 0 }
}

function suggestShelfLife({ name = '', category = '其他食品', zone = 'fridge' }) {
  const reference = shelfLifeReferences.find((item) => item.keywords.includes(name.trim()))
  const daysByZone = reference ? reference.days : (categoryShelfLife[category] || categoryShelfLife.其他食品)
  const days = daysByZone[zone] === undefined ? daysByZone.fridge : daysByZone[zone]
  const zoneLabels = { fridge: '冷藏', freezer: '冷冻', room: '常温' }
  return {
    days,
    label: days === 0 ? `不建议${zoneLabels[zone] || '当前方式'}存放` : (reference ? reference.label : `${category}参考`)
  }
}

function calculateFreshness(storedAt, expireDate, now = new Date()) {
  const [year, month, day] = storedAt.split('-').map(Number)
  const storedDate = new Date(year, month - 1, day)
  const totalDays = daysUntil(expireDate, storedDate)
  const remainingDays = daysUntil(expireDate, now)
  if (totalDays < 0) {
    return {
      percent: 0,
      bestBeforeDate: expireDate,
      bestUseLabel: '日期设置有误：到期日早于入库日'
    }
  }
  if (totalDays === 0) {
    return {
      percent: 0,
      bestBeforeDate: expireDate,
      bestUseLabel: remainingDays < 0 ? '已超过参考日期' : '参考期限为当天，请立即检查并处理'
    }
  }
  const percent = Math.max(0, Math.min(100, Math.round((remainingDays / totalDays) * 100)))
  const bestBeforeDate = addDays(storedAt, Math.max(1, Math.floor(totalDays * 0.7)))
  let bestUseLabel = `建议在 ${bestBeforeDate} 前食用`
  if (remainingDays < 0) bestUseLabel = '已超过参考日期'
  else if (daysUntil(bestBeforeDate, now) < 0) bestUseLabel = '最佳食用期已过，建议尽快食用'
  return { percent, bestBeforeDate, bestUseLabel }
}

function normalizeFood(food, now = new Date()) {
  const zone = ['fridge', 'freezer', 'room'].includes(food.zone) ? food.zone : 'fridge'
  const unit = ['份', '个', '盒', '袋', '瓶', '克', '千克'].includes(food.unit) ? food.unit : '份'
  let storedAt = food.storedAt
  if (!/^\d{4}-\d{2}-\d{2}$/.test(storedAt)) {
    if (Number.isFinite(food.createdAt)) storedAt = formatDate(new Date(food.createdAt))
    else if (/^\d{4}-\d{2}-\d{2}$/.test(food.expireDate)) storedAt = addDays(food.expireDate, -7)
    else storedAt = formatDate(now)
  }
  return {
    ...food,
    category: normalizeFoodCategory(food.category, food.name),
    zone,
    unit,
    storedAt,
    note: food.note === '来自小票批量入库' ? '' : food.note
  }
}

function pruneHistory(history = [], now = new Date(), clearedAt = 0) {
  const currentTime = now instanceof Date ? now.getTime() : Number(now)
  const cutoff = currentTime - 3 * 86400000
  const visibleAfter = Number.isFinite(clearedAt) ? clearedAt : 0
  return history.filter((entry) => Number.isFinite(entry && entry.handledAt) && entry.handledAt >= cutoff && entry.handledAt > visibleAfter)
}

function processFoodBatch({ foods = [], history = [], selectedIds = [], outcome, handledAt = Date.now(), createId }) {
  if (!['eaten', 'discarded'].includes(outcome) || typeof createId !== 'function') {
    return { foods: [...foods], history: [...history], processedCount: 0 }
  }
  const selected = new Set(selectedIds)
  const processed = foods.filter((food) => selected.has(food.id))
  const nextHistory = processed.map((food) => ({
    id: createId(),
    food: normalizeFood(food),
    outcome,
    handledAt
  }))
  return {
    foods: foods.filter((food) => !selected.has(food.id)),
    history: [...nextHistory, ...history],
    processedCount: processed.length
  }
}

function filterFoods(foods, filters = {}, now = new Date()) {
  const query = (filters.query || '').trim().toLowerCase()

  return foods.filter((food) => {
    const days = daysUntil(food.expireDate, now)
    if (query && !food.name.toLowerCase().includes(query)) return false
    if (filters.zone && filters.zone !== 'all' && food.zone !== filters.zone) return false
    if (filters.category && filters.category !== 'all' && food.category !== filters.category) return false
    if (filters.status === 'soon' && (days < 0 || days > 3)) return false
    if (filters.status === 'expired' && days >= 0) return false
    return true
  })
}

function decorateFood(food, now) {
  const normalized = normalizeFood(food, now)
  const days = daysUntil(normalized.expireDate, now)
  const freshness = calculateFreshness(normalized.storedAt, normalized.expireDate, now)
  const zoneLabels = { fridge: '冷藏', freezer: '冷冻', room: '常温' }
  let expiryClass = 'normal'
  let expiryLabel = `${days}天后到期`

  if (days < 0) {
    expiryClass = 'expired'
    expiryLabel = `已过期${Math.abs(days)}天`
  } else if (days === 0) {
    expiryClass = 'today'
    expiryLabel = '今天到期'
  } else if (days <= 3) {
    expiryClass = 'soon'
    expiryLabel = `${days}天内到期`
  }

  return {
    ...normalized,
    zoneLabel: zoneLabels[normalized.zone] || '冷藏',
    categoryShort: normalized.category.slice(0, 1),
    expiryClass,
    expiryLabel,
    days,
    freshnessPercent: freshness.percent,
    freshnessClass: freshness.percent > 60 ? 'fresh' : freshness.percent > 30 ? 'steady' : 'low',
    bestUseLabel: freshness.bestUseLabel
  }
}

module.exports = {
  daysUntil,
  decorateFood,
  normalizeFood,
  pruneHistory,
  processFoodBatch,
  filterFoods,
  addDays,
  suggestShelfLife,
  calculateFreshness
}
