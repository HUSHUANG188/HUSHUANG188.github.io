const { normalizeDietSettings } = require('./meal')

const blockedTermGroups = {
  egg: ['鸡蛋', '鸭蛋', '鹅蛋', '蛋黄', '蛋白', '蛋液'],
  milk: ['牛奶', '奶油', '奶酪', '芝士', '酸奶', '炼乳', '乳制品'],
  lactose: ['牛奶', '奶油', '奶酪', '芝士', '酸奶', '炼乳', '乳制品'],
  peanut: ['花生', '坚果', '核桃', '腰果', '杏仁', '榛子'],
  gluten: ['小麦', '面粉', '面包', '面条', '馒头', '燕麦'],
  soy: ['大豆', '黄豆', '豆腐', '豆干', '豆浆', '酱油'],
  seafood: ['鱼', '虾', '蟹', '贝', '海鲜'],
  pork: ['猪肉', '猪油', '排骨', '里脊'],
  beef: ['牛肉', '牛腩'],
  lamb: ['羊肉', '羊排'],
  spicy: ['辣椒', '辣酱', '辣味'],
  cilantro: ['香菜'],
  allium: ['葱', '姜', '蒜']
}

function cleanText(value, limit) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, limit) : ''
}

function uniqueStrings(values, limit = 8, textLimit = 40) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => cleanText(value, textLimit)).filter(Boolean))].slice(0, limit)
}

function getBlockedTerms(rawSettings = {}) {
  const settings = normalizeDietSettings(rawSettings)
  const groups = [...settings.allergens, ...settings.avoids]
  if (settings.preferences.includes('vegetarian')) groups.push('pork', 'beef', 'lamb', 'seafood')
  if (settings.preferences.includes('halal')) groups.push('pork')
  return [...new Set(groups.flatMap((group) => blockedTermGroups[group] || []))]
}

function containsBlockedTerm(value, settings) {
  const text = typeof value === 'string' ? value : JSON.stringify(value || '')
  return getBlockedTerms(settings).some((term) => text.includes(term))
}

function buildMealAiPayload({ foods = [], dietSettings = {}, excludedTitles = [] } = {}) {
  return {
    action: 'recipes',
    foods: (Array.isArray(foods) ? foods : []).slice(0, 40).map((food) => ({
      name: cleanText(food && food.name, 20),
      category: cleanText(food && food.category, 12),
      quantity: Number.isFinite(Number(food && food.quantity)) ? Number(food.quantity) : 1,
      unit: cleanText(food && food.unit, 6),
      expireDate: /^\d{4}-\d{2}-\d{2}$/.test(food && food.expireDate) ? food.expireDate : ''
    })).filter((food) => food.name),
    dietSettings: normalizeDietSettings(dietSettings),
    excludedTitles: uniqueStrings(excludedTitles, 12, 30)
  }
}

function matchStockName(value, foods) {
  const text = cleanText(value, 30)
  if (!text) return ''
  const names = foods.map((food) => cleanText(food && food.name, 20)).filter(Boolean)
  return names.find((name) => name === text) || names.find((name) => text.includes(name) || (text.length >= 2 && name.includes(text))) || ''
}

function normalizeStockNames(values, foods, limit = 12) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => matchStockName(value, foods)).filter(Boolean))].slice(0, limit)
}

function normalizeAiOverview(raw, foods = [], settings = {}) {
  const data = raw && typeof raw === 'object' ? raw : {}
  const recipes = (Array.isArray(data.recipes) ? data.recipes : []).map((recipe, index) => {
    const usedNames = normalizeStockNames(recipe && recipe.used, foods)
    const title = cleanText(recipe && recipe.title, 30) || `库存菜谱 ${index + 1}`
    const titleIngredientCount = [...new Set(foods
      .map((food) => cleanText(food && food.name, 20))
      .filter((name) => name && title.includes(name)))].length
    if (!usedNames.length || usedNames.length > 2 || titleIngredientCount > 2) return null
    const normalized = {
      title,
      reason: cleanText(recipe && recipe.reason, 80) || `可使用库存中的${usedNames.join('、')}`,
      usedNames,
      missingNames: uniqueStrings(recipe && recipe.missing, 8, 24),
      steps: uniqueStrings(recipe && recipe.steps, 6, 100),
      durationText: cleanText(recipe && recipe.duration, 20),
      servingsText: cleanText(recipe && recipe.servings, 16),
      source: 'ai'
    }
    return containsBlockedTerm(normalized, settings) ? null : normalized
  }).filter(Boolean).slice(0, 6)

  return { recipes }
}

module.exports = {
  buildMealAiPayload,
  containsBlockedTerm,
  getBlockedTerms,
  normalizeAiOverview
}
