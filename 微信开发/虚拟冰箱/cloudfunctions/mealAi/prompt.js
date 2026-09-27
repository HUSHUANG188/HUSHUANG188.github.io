const preferenceLabels = {
  light: '偏清淡',
  highProtein: '偏高蛋白',
  vegetarian: '素食',
  lowSalt: '少盐偏好',
  lowSugar: '少糖偏好',
  halal: '清真基础筛选'
}
const allergenLabels = {
  egg: '蛋类',
  milk: '乳制品',
  lactose: '乳糖不耐（含奶）',
  peanut: '花生与坚果',
  gluten: '含麸质谷物',
  soy: '大豆',
  seafood: '鱼虾贝类'
}
const avoidLabels = {
  pork: '猪肉',
  beef: '牛肉',
  lamb: '羊肉',
  spicy: '辣味',
  cilantro: '香菜',
  allium: '葱姜蒜'
}

function cleanText(value, limit) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, limit) : ''
}

function allowedValues(values, labels) {
  return [...new Set((Array.isArray(values) ? values : []).filter((value) => labels[value]))]
}

function sanitizeEvent(event = {}) {
  const foods = (Array.isArray(event.foods) ? event.foods : []).slice(0, 40).map((food) => ({
    name: cleanText(food && food.name, 20),
    category: cleanText(food && food.category, 12),
    quantity: Number.isFinite(Number(food && food.quantity)) ? Number(food.quantity) : 1,
    unit: cleanText(food && food.unit, 6),
    expireDate: /^\d{4}-\d{2}-\d{2}$/.test(food && food.expireDate) ? food.expireDate : ''
  })).filter((food) => food.name)
  const rawSettings = event.dietSettings || {}
  const dietSettings = {
    preferences: allowedValues(rawSettings.preferences, preferenceLabels),
    allergens: allowedValues(rawSettings.allergens, allergenLabels),
    avoids: allowedValues(rawSettings.avoids, avoidLabels)
  }
  const excludedTitles = [...new Set((Array.isArray(event.excludedTitles) ? event.excludedTitles : [])
    .map((title) => cleanText(title, 30))
    .filter(Boolean))].slice(0, 12)
  return { foods, dietSettings, excludedTitles }
}

function settingsText(settings) {
  const preferences = settings.preferences.map((value) => preferenceLabels[value])
  const allergens = settings.allergens.map((value) => allergenLabels[value])
  const avoids = settings.avoids.map((value) => avoidLabels[value])
  return {
    preferences: preferences.length ? preferences : ['无'],
    allergens: allergens.length ? allergens : ['无'],
    avoids: avoids.length ? avoids : ['无']
  }
}

function commonRules() {
  return [
    '你是虚拟冰箱中的家常菜推荐助手，只根据库存生成菜谱。',
    'used 中的食材必须逐字来自库存；不在库存中的食材只能写入 missing。',
    '只推荐现实中常见、搭配自然的家常菜，不拼凑食材，不创造猎奇菜名。',
    '过敏原、乳糖不耐、忌口、素食和清真基础筛选优先于任何推荐。',
    '不要保证食物安全；提醒用户结合保质期、气味、外观和包装标签判断。',
    '输出必须是合法 JSON，不要使用 Markdown 代码块。'
  ].join('\n')
}

function buildOverviewMessages(input) {
  const shanghaiDate = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const recipesFormat = {
    recipes: [{
      title: '菜名',
      reason: '用20字内说明食材与做法',
      used: ['必须逐字来自库存名称'],
      missing: ['最多2种缺少的主要食材'],
      duration: '约20分钟',
      servings: '2人份',
      steps: ['每步不超过15字，恰好2步']
    }]
  }
  const instruction = `生成3至4道菜名不同、做法不相似的完整家常菜，不得与 avoidRecipes 中的菜名相同或高度相似；每道最多使用2种库存主食材，采用大众熟悉的固定搭配，不为了覆盖库存而强行组合；不要按 expireDate 排序，expireDate 早于今天的食材不得写入 used；每道恰好2步。返回：${JSON.stringify(recipesFormat)}`
  return [
    {
      role: 'system',
      content: `${commonRules()}\n限时场景，输出必须精简。${instruction}没有可靠把握时使用定性表述，不编造精确含量。`
    },
    {
      role: 'user',
      content: `今天是${shanghaiDate}。请根据以下 JSON 数据生成建议：${JSON.stringify({ inventory: input.foods, dietSettings: settingsText(input.dietSettings), avoidRecipes: input.excludedTitles })}`
    }
  ]
}

module.exports = {
  buildOverviewMessages,
  sanitizeEvent,
  settingsText
}
