const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  buildMealAiPayload,
  normalizeAiOverview
} = require('../utils/meal-ai')
const { buildOverviewMessages, sanitizeEvent } = require('../cloudfunctions/mealAi/prompt')

const foods = [
  { id: 'cabbage', name: '白菜', category: '蔬菜水果', quantity: 1, unit: '份', expireDate: '2026-09-04' },
  { id: 'pork', name: '里脊肉', category: '肉蛋水产', quantity: 300, unit: '克', expireDate: '2026-09-05' },
  { id: 'tofu', name: '豆腐', category: '其他', quantity: 1, unit: '盒', expireDate: '2026-09-06' }
]
const payload = buildMealAiPayload({
  foods: [...foods, { name: '' }],
  dietSettings: { avoids: ['pork', 'unknown'] },
  excludedTitles: ['白菜豆腐', '白菜豆腐', '清炒白菜']
})
assert.equal(payload.action, 'recipes')
assert.equal(payload.foods.length, 3)
assert.deepEqual(payload.dietSettings.avoids, ['pork'])
assert.deepEqual(payload.excludedTitles, ['白菜豆腐', '清炒白菜'])
assert.equal('messages' in payload, false)

const normalized = normalizeAiOverview({
  recipes: [
    { title: '白菜豆腐', used: ['白菜', '豆腐'], priority: ['白菜'], missing: [], duration: '15分钟', servings: '2人份', steps: ['洗净白菜', '与豆腐同煮'] },
    { title: '里脊肉炒白菜', used: ['里脊肉', '白菜'], priority: [], missing: [], steps: ['炒熟'] },
    { title: '虚构库存菜', used: ['不存在的鱼'], priority: [], missing: [], steps: ['完成'] }
  ]
}, foods, { avoids: ['pork'] })
assert.deepEqual(normalized.recipes.map((recipe) => recipe.title), ['白菜豆腐'])
assert.deepEqual(normalized.recipes[0].usedNames, ['白菜', '豆腐'])
assert.equal('priorityNames' in normalized.recipes[0], false)
assert.deepEqual(Object.keys(normalized), ['recipes'])

const restrained = normalizeAiOverview({
  recipes: [
    { title: '莲藕松茸菇炖小白菜', used: ['莲藕', '松茸菇', '小白菜'], missing: [], steps: ['洗净食材', '一起炖熟'] },
    { title: '清炒小白菜', used: ['小白菜'], missing: [], steps: ['洗净切段', '炒熟调味'] }
  ]
}, [
  { name: '莲藕' },
  { name: '松茸菇' },
  { name: '小白菜' }
])
assert.deepEqual(restrained.recipes.map((recipe) => recipe.title), ['清炒小白菜'])

const sanitized = sanitizeEvent({
  foods,
  dietSettings: { preferences: ['vegetarian', 'bad'], allergens: ['egg'], avoids: ['pork'] },
  excludedTitles: ['白菜豆腐', '白菜豆腐', '清炒白菜']
})
assert.deepEqual(sanitized.dietSettings.preferences, ['vegetarian'])
assert.deepEqual(sanitized.excludedTitles, ['白菜豆腐', '清炒白菜'])
assert.equal('messages' in sanitized, false)
const overviewMessages = buildOverviewMessages(sanitized)
assert.equal(overviewMessages[0].content.includes('生成3至4道菜名不同'), true)
assert.equal(overviewMessages[1].content.includes('白菜豆腐'), true)
assert.doesNotMatch(overviewMessages[0].content, /临期.*优先|优先.*临期|priority/)
assert.match(overviewMessages[0].content, /每道最多使用2种库存主食材/)

const cloudSource = fs.readFileSync(path.join(__dirname, '..', 'cloudfunctions', 'mealAi', 'index.js'), 'utf8')
const pageSource = fs.readFileSync(path.join(__dirname, '..', 'pages', 'index', 'index.js'), 'utf8')
const pageMarkup = fs.readFileSync(path.join(__dirname, '..', 'pages', 'index', 'index.wxml'), 'utf8')
const pageStyles = fs.readFileSync(path.join(__dirname, '..', 'pages', 'index', 'index.wxss'), 'utf8')
assert.match(cloudSource, /process\.env\.DEEPSEEK_API_KEY/)
assert.match(cloudSource, /https:\/\/api\.deepseek\.com\/chat\/completions/)
assert.match(cloudSource, /response_format: \{ type: 'json_object' \}/)
assert.match(cloudSource, /temperature: 0\.4/)
assert.match(cloudSource, /max_tokens: 1000/)
assert.match(cloudSource, /}, 18000\)/)
assert.doesNotMatch(cloudSource, /sk-[A-Za-z0-9]{16,}/)
assert.match(pageSource, /name: 'mealAi'/)
assert.doesNotMatch(pageSource, /recommendMeals/)
assert.match(pageMarkup, /智能推荐/)
assert.match(pageMarkup, /生成 3–4 道不重复的家常菜/)
assert.doesNotMatch(pageMarkup, /临期食材优先|优先使用/)
assert.doesNotMatch(pageMarkup, /第三方智谱 AI|第三方 DeepSeek|receipt-loading-copy/)
assert.match(pageMarkup, /meal-section meal-settings-section/)
assert.match(pageMarkup, /meal-section-title">饮食设置/)
assert.doesNotMatch(pageMarkup, /meal-settings-button/)
assert.match(pageStyles, /\.batch-check \{[\s\S]*?left: 16rpx;[\s\S]*?right: auto;/)
assert.match(pageStyles, /\.food-item\.batch-mode \.food-topline \{\s*padding-left: 52rpx;/)
assert.doesNotMatch(pageMarkup, /问问冰箱 AI|生成智能建议|日常饮食建议|本地参考|AI 解读/)
assert.match(pageMarkup, /这次建议有用吗/)
assert.match(pageMarkup, /库存食材营养/)

console.log('DeepSeek meal AI flow: ok')
