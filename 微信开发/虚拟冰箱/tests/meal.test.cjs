const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  defaultDietSettings,
  normalizeDietSettings,
  getNutritionRows,
  recommendMeals
} = require('../utils/meal')

const today = new Date(2026, 8, 2, 12, 0)
const foods = [
  { id: 'tomato', name: '番茄', expireDate: '2026-09-03' },
  { id: 'egg', name: '鸡蛋', expireDate: '2026-09-08' },
  { id: 'tofu', name: '嫩豆腐', expireDate: '2026-09-04' },
  { id: 'pork', name: '猪肉', expireDate: '2026-09-05' },
  { id: 'expired', name: '菠菜', expireDate: '2026-09-01' }
]

assert.deepEqual(normalizeDietSettings({
  preferences: ['light', 'lowSalt', 'halal', 'light', 'unknown'],
  allergens: ['egg', 'lactose', 'bad'],
  avoids: ['pork', 'allium', 'pork']
}), {
  preferences: ['light', 'lowSalt', 'halal'],
  allergens: ['egg', 'lactose'],
  avoids: ['pork', 'allium']
})
assert.deepEqual(normalizeDietSettings(null), defaultDietSettings)

const nutritionRows = getNutritionRows(foods)
assert.equal(nutritionRows.some((row) => row.name === '番茄'), true)
assert.equal(nutritionRows.some((row) => row.name === '鸡蛋'), true)
assert.equal(nutritionRows.some((row) => row.name === '菠菜'), true)
assert.equal(nutritionRows.every((row) => typeof row.summary === 'string' && row.summary.length > 0), true)

const recommendations = recommendMeals(foods, defaultDietSettings, today)
assert.equal(recommendations[0].title, '番茄炒蛋')
assert.deepEqual(recommendations[0].usedNames, ['番茄', '鸡蛋'])
assert.deepEqual(recommendations[0].priorityNames, ['番茄'])
assert.equal(recommendations[0].missingNames.length, 0)
assert.equal(recommendations.every((meal) => !meal.usedNames.includes('菠菜')), true)

const allergySafe = recommendMeals(foods, { allergens: ['egg'] }, today)
assert.equal(allergySafe.some((meal) => meal.allergens.includes('egg')), false)
assert.equal(allergySafe.some((meal) => meal.title === '番茄炒蛋'), false)

const porkFree = recommendMeals(foods, { avoids: ['pork'] }, today)
assert.equal(porkFree.some((meal) => meal.avoidTags.includes('pork')), false)

const dairyFoods = [
  { id: 'milk', name: '牛奶', expireDate: '2026-09-04' },
  { id: 'oats', name: '燕麦', expireDate: '2026-09-10' },
  { id: 'apple', name: '苹果', expireDate: '2026-09-06' },
  { id: 'yogurt', name: '酸奶', expireDate: '2026-09-05' }
]
assert.equal(recommendMeals(dairyFoods, defaultDietSettings, today).some((meal) => meal.allergens.includes('milk')), true)
assert.equal(recommendMeals(dairyFoods, { allergens: ['lactose'] }, today).some((meal) => meal.allergens.includes('milk')), false)

assert.equal(recommendMeals(foods, defaultDietSettings, today).some((meal) => meal.ingredients.includes('pork')), true)
assert.equal(recommendMeals(foods, { preferences: ['halal'] }, today).some((meal) => meal.ingredients.includes('pork')), false)

assert.equal(recommendMeals(foods, defaultDietSettings, today).some((meal) => meal.avoidTags.includes('allium')), true)
assert.equal(recommendMeals(foods, { avoids: ['allium'] }, today).some((meal) => meal.avoidTags.includes('allium')), false)

const vegetarian = recommendMeals(foods, { preferences: ['vegetarian'] }, today)
assert.equal(vegetarian.length > 0, true)
assert.equal(vegetarian.every((meal) => meal.preferenceTags.includes('vegetarian')), true)

const missing = recommendMeals([
  { id: 'tomato', name: '番茄', expireDate: '2026-09-03' }
], defaultDietSettings, today)
assert.equal(missing[0].title, '番茄炒蛋')
assert.deepEqual(missing[0].usedNames, ['番茄'])
assert.deepEqual(missing[0].missingNames, ['鸡蛋'])

const pageScript = fs.readFileSync(path.join(__dirname, '..', 'pages', 'index', 'index.js'), 'utf8')
const pageMarkup = fs.readFileSync(path.join(__dirname, '..', 'pages', 'index', 'index.wxml'), 'utf8')
assert.match(pageScript, /dietSettings: normalizeDietSettings\(state\.dietSettings\)/)
assert.match(pageScript, /mealRecommendations: \[\]/)
assert.match(pageMarkup, /data-view="meal"/)
assert.match(pageMarkup, /bindchange="onDietAllergensChange"/)
assert.match(pageMarkup, /库存可用/)
assert.match(pageMarkup, /还缺/)
assert.match(pageMarkup, /饮食信息仅供日常参考/)
assert.match(pageMarkup, /安全限制优先过滤/)
assert.match(pageMarkup, /包装食品隐藏配料、交叉污染或清真认证/)

console.log('nutrition and meal recommendation flow: ok')
