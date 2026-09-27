const { daysUntil } = require('./food')

const dietPreferenceOptions = [
  { value: 'light', label: '偏清淡' },
  { value: 'highProtein', label: '偏高蛋白' },
  { value: 'vegetarian', label: '素食' },
  { value: 'lowSalt', label: '少盐偏好' },
  { value: 'lowSugar', label: '少糖偏好' },
  { value: 'halal', label: '清真基础筛选' }
]
const allergenOptions = [
  { value: 'egg', label: '蛋类' },
  { value: 'milk', label: '乳制品' },
  { value: 'lactose', label: '乳糖不耐（含奶）' },
  { value: 'peanut', label: '花生与坚果' },
  { value: 'gluten', label: '含麸质谷物' },
  { value: 'soy', label: '大豆' },
  { value: 'seafood', label: '鱼虾贝类' }
]
const avoidOptions = [
  { value: 'pork', label: '猪肉' },
  { value: 'beef', label: '牛肉' },
  { value: 'lamb', label: '羊肉' },
  { value: 'spicy', label: '辣味' },
  { value: 'cilantro', label: '香菜' },
  { value: 'allium', label: '葱姜蒜' }
]
const defaultDietSettings = { preferences: [], allergens: [], avoids: [] }
const categoryNutrition = {
  蔬菜水果: '通常提供膳食纤维、维生素和矿物质，具体含量因品种而异。',
  肉蛋水产: '通常提供蛋白质、铁或维生素 B 族，脂肪含量因食材和部位而异。',
  蔬菜: '通常提供膳食纤维、维生素和矿物质，具体含量因品种而异。',
  水果: '通常提供膳食纤维、维生素和天然糖，具体含量因品种而异。',
  菌菇: '通常提供膳食纤维和多种微量营养素，具体含量因品种而异。',
  肉禽: '通常提供蛋白质、铁或维生素 B 族，脂肪含量因部位而异。',
  水产: '通常提供蛋白质，脂肪酸和矿物质含量因品种而异。',
  蛋类: '通常提供蛋白质、胆碱和多种维生素。',
  乳制品: '通常提供蛋白质和钙，糖与脂肪含量请结合包装标签查看。',
  豆制品: '通常提供植物蛋白，钙和钠含量因加工方式而异。',
  熟食: '营养和钠含量差异较大，请结合配料和包装标签查看。',
  烘焙: '通常提供碳水化合物，糖与脂肪含量请结合包装标签查看。',
  速冻食品: '营养差异较大，请结合包装配料和营养标签查看。',
  主食: '主要提供碳水化合物，也是日常能量的重要来源。',
  主食粮油: '主食主要提供碳水化合物；食用油主要提供脂肪。',
  饮料: '营养与含糖量差异较大，请优先查看包装配料和营养标签。',
  调味品: '用量通常较少，钠、糖和脂肪请结合包装标签查看。',
  零食: '营养差异较大，糖、盐和脂肪请结合包装标签查看。',
  干货: '营养因原料和加工方式而异，请结合包装标签查看。',
  其他: '暂无对应的固定营养资料，请以包装标签或可靠食物成分资料为准。',
  其他食品: '暂无对应的固定营养资料，请以包装标签或可靠食物成分资料为准。'
}

const ingredients = [
  { key: 'tomato', label: '番茄', keywords: ['番茄', '西红柿'], summary: '含维生素 C、钾和番茄红素。' },
  { key: 'egg', label: '鸡蛋', keywords: ['鸡蛋', '土鸡蛋'], summary: '提供优质蛋白、胆碱和多种 B 族维生素。' },
  { key: 'tofu', label: '豆腐', keywords: ['豆腐'], summary: '提供植物蛋白；钙含量会随加工方式不同而变化。' },
  { key: 'leafy', label: '叶菜', keywords: ['菠菜', '生菜', '青菜', '油麦菜', '小白菜'], summary: '通常含叶酸、维生素 K、膳食纤维和类胡萝卜素。' },
  { key: 'cabbage', label: '白菜', keywords: ['大白菜', '白菜'], summary: '含膳食纤维、维生素 C 和叶酸。' },
  { key: 'driedTofu', label: '豆干', keywords: ['豆腐干', '豆干', '香干'], summary: '提供植物蛋白；钠和钙含量会随加工方式不同而变化。' },
  { key: 'lotusRoot', label: '莲藕', keywords: ['莲藕', '藕'], summary: '以碳水化合物为主，也含膳食纤维、钾和维生素 C。' },
  { key: 'cucumber', label: '黄瓜', keywords: ['黄瓜'], summary: '含水量较高，也提供少量维生素 K 和钾。' },
  { key: 'potato', label: '土豆', keywords: ['土豆', '马铃薯'], summary: '以碳水化合物为主，也含钾和维生素 C。' },
  { key: 'chicken', label: '鸡肉', keywords: ['鸡胸肉', '鸡腿肉', '鸡肉', '鸡胸', '鸡腿'], summary: '提供优质蛋白和多种 B 族维生素。' },
  { key: 'pork', label: '猪肉', keywords: ['猪肉', '里脊', '排骨'], summary: '提供蛋白质、铁和维生素 B1；肥瘦部位差异较大。' },
  { key: 'beef', label: '牛肉', keywords: ['牛肉', '牛腩'], summary: '提供蛋白质、铁、锌和维生素 B12。' },
  { key: 'shrimp', label: '虾', keywords: ['虾仁', '鲜虾', '冻虾', '虾'], summary: '提供蛋白质、硒和维生素 B12。' },
  { key: 'milk', label: '牛奶', keywords: ['鲜牛奶', '牛奶'], summary: '提供蛋白质、钙和维生素 B2。' },
  { key: 'yogurt', label: '酸奶', keywords: ['酸奶'], summary: '提供蛋白质和钙，含糖量需结合包装查看。' },
  { key: 'oats', label: '燕麦', keywords: ['燕麦片', '燕麦'], summary: '含碳水化合物、膳食纤维和 β-葡聚糖。' },
  { key: 'carrot', label: '胡萝卜', keywords: ['胡萝卜'], summary: '富含 β-胡萝卜素，也提供膳食纤维。' },
  { key: 'apple', label: '苹果', keywords: ['苹果'], summary: '含碳水化合物、膳食纤维和少量维生素 C。' },
  { key: 'rice', label: '米饭', keywords: ['米饭', '大米'], summary: '主要提供碳水化合物，是常见主食能量来源。' }
]

const recipes = [
  { title: '番茄炒蛋', ingredients: ['tomato', 'egg'], allergens: ['egg'], avoidTags: ['allium'], preferenceTags: ['light', 'highProtein', 'vegetarian', 'lowSalt', 'lowSugar'] },
  { title: '青菜豆腐汤', ingredients: ['leafy', 'tofu'], allergens: ['soy'], avoidTags: ['allium'], preferenceTags: ['light', 'highProtein', 'vegetarian', 'lowSalt', 'lowSugar'] },
  { title: '土豆鸡丁', ingredients: ['potato', 'chicken'], allergens: [], avoidTags: ['allium'], preferenceTags: ['highProtein', 'lowSalt', 'lowSugar'] },
  { title: '胡萝卜炒肉', ingredients: ['carrot', 'pork'], allergens: [], avoidTags: ['pork', 'allium'], preferenceTags: ['highProtein', 'lowSalt', 'lowSugar'] },
  { title: '虾仁炒蛋', ingredients: ['shrimp', 'egg'], allergens: ['seafood', 'egg'], avoidTags: ['allium'], preferenceTags: ['light', 'highProtein', 'lowSalt', 'lowSugar'] },
  { title: '牛奶燕麦粥', ingredients: ['milk', 'oats'], allergens: ['milk', 'gluten'], avoidTags: [], preferenceTags: ['light', 'vegetarian', 'lowSalt', 'lowSugar'] },
  { title: '苹果酸奶杯', ingredients: ['apple', 'yogurt'], allergens: ['milk'], avoidTags: [], preferenceTags: ['light', 'vegetarian', 'lowSalt'] },
  { title: '番茄牛肉饭', ingredients: ['tomato', 'beef', 'rice'], allergens: [], avoidTags: ['beef', 'allium'], preferenceTags: ['highProtein', 'lowSalt', 'lowSugar'] }
]

function uniqueAllowed(values, options) {
  const allowed = new Set(options.map((item) => item.value))
  return [...new Set(Array.isArray(values) ? values.filter((value) => allowed.has(value)) : [])]
}

function normalizeDietSettings(settings = {}) {
  return {
    preferences: uniqueAllowed(settings && settings.preferences, dietPreferenceOptions),
    allergens: uniqueAllowed(settings && settings.allergens, allergenOptions),
    avoids: uniqueAllowed(settings && settings.avoids, avoidOptions)
  }
}

function findIngredient(name = '') {
  const text = String(name).trim()
  return ingredients.find((item) => item.keywords.some((keyword) => text.includes(keyword)))
}

function getNutritionRows(foods = []) {
  const seen = new Set()
  return foods.reduce((rows, food) => {
    const name = typeof (food && food.name) === 'string' ? food.name.trim() : ''
    if (!name || seen.has(name)) return rows
    const ingredient = findIngredient(food && food.name)
    seen.add(name)
    rows.push({
      key: food.id || `${name}-${rows.length}`,
      name,
      summary: ingredient ? ingredient.summary : (categoryNutrition[food.category] || categoryNutrition.其他)
    })
    return rows
  }, [])
}

function hasAny(values, blocked) {
  return values.some((value) => blocked.includes(value))
}

function recommendMeals(foods = [], rawSettings = {}, now = new Date()) {
  const settings = normalizeDietSettings(rawSettings)
  const blockedAllergens = settings.allergens.includes('lactose') ? [...settings.allergens, 'milk'] : settings.allergens
  const available = foods.reduce((rows, food) => {
    const ingredient = findIngredient(food && food.name)
    if (!ingredient || !/^\d{4}-\d{2}-\d{2}$/.test(food.expireDate)) return rows
    const days = daysUntil(food.expireDate, now)
    if (days >= 0) rows.push({ food, ingredient, days })
    return rows
  }, [])

  return recipes.map((recipe) => {
    if (hasAny(recipe.allergens, blockedAllergens) || hasAny(recipe.avoidTags, settings.avoids)) return null
    if (settings.preferences.includes('halal') && recipe.ingredients.includes('pork')) return null
    if (settings.preferences.includes('vegetarian') && !recipe.preferenceTags.includes('vegetarian')) return null

    const used = []
    const missingNames = []
    recipe.ingredients.forEach((key) => {
      const match = available.find((entry) => entry.ingredient.key === key)
      if (match) used.push(match)
      else missingNames.push(ingredients.find((item) => item.key === key).label)
    })
    if (!used.length) return null

    const priority = used.filter((entry) => entry.days <= 3)
    const preferenceMatches = recipe.preferenceTags.filter((tag) => settings.preferences.includes(tag)).length
    const score = used.length * 10 + priority.reduce((total, entry) => total + (4 - entry.days) * 4, 0) + preferenceMatches * 3 - missingNames.length * 2
    const usedNames = used.map((entry) => entry.food.name)
    const priorityNames = priority.map((entry) => entry.food.name)
    return {
      ...recipe,
      usedNames,
      priorityNames,
      missingNames,
      score,
      reason: priorityNames.length
        ? `优先使用临期的${priorityNames.join('、')}`
        : `可使用库存中的${usedNames.join('、')}`
    }
  }).filter(Boolean).sort((first, second) => second.score - first.score || first.title.localeCompare(second.title, 'zh-CN'))
}

module.exports = {
  defaultDietSettings,
  dietPreferenceOptions,
  allergenOptions,
  avoidOptions,
  normalizeDietSettings,
  getNutritionRows,
  recommendMeals
}
