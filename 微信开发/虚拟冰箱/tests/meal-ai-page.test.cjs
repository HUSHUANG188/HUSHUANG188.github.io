const assert = require('node:assert/strict')

const storage = {}
let lastToast = ''
let cloudResult
const cloudPayloads = []
global.getApp = () => ({ globalData: {} })
global.wx = {
  getStorageSync: (key) => storage[key],
  setStorageSync: (key, value) => { storage[key] = value },
  showToast: ({ title }) => { lastToast = title },
  cloud: {
    callFunction: ({ name, data, success }) => {
      assert.equal(name, 'mealAi')
      assert.equal(data.action, 'recipes')
      cloudPayloads.push(data)
      success({ result: cloudResult })
    }
  }
}
global.Page = (definition) => { global.page = definition }
require('../pages/index/index')

global.page.setData = function setData(updates, callback) {
  Object.entries(updates).forEach(([key, value]) => {
    const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.')
    let target = this.data
    while (parts.length > 1) target = target[parts.shift()]
    target[parts[0]] = value
  })
  if (callback) callback()
}
global.page.pageUnloaded = false

const foods = [
  { id: 'cabbage', name: '白菜', category: '蔬菜水果', quantity: 1, unit: '份', storedAt: '2026-09-01', expireDate: '2026-09-05' },
  { id: 'tofu', name: '豆腐', category: '其他', quantity: 1, unit: '盒', storedAt: '2026-09-01', expireDate: '2026-09-06' },
  { id: 'pork', name: '里脊肉', category: '肉蛋水产', quantity: 300, unit: '克', storedAt: '2026-09-01', expireDate: '2026-09-05' }
]
global.page.setData({ allFoods: foods, dietSettings: { preferences: [], allergens: [], avoids: ['pork'] } })
global.page.renderDiet(foods, global.page.data.dietSettings)
assert.equal(global.page.data.mealRecommendations.length, 0)

cloudResult = { ok: true, data: {
    recipes: [
      { title: '白菜豆腐汤', reason: '使用临期白菜', used: ['白菜', '豆腐'], priority: ['白菜'], missing: [], duration: '20分钟', servings: '2人份', steps: ['洗净', '煮熟'] },
      { title: '清炒白菜', reason: '优先使用白菜', used: ['白菜'], priority: ['白菜'], missing: [], duration: '10分钟', servings: '2人份', steps: ['洗净白菜', '炒熟调味'] },
      { title: '香煎豆腐', reason: '使用库存豆腐', used: ['豆腐'], priority: [], missing: [], duration: '15分钟', servings: '2人份', steps: ['切块', '煎至金黄'] },
      { title: '里脊肉炒白菜', reason: '使用里脊肉', used: ['里脊肉', '白菜'], priority: [], missing: [], steps: ['炒熟'] }
    ]
  } }

;(async () => {
  await global.page.generateAiInsights()
  assert.equal(global.page.data.aiInsightsState, 'success')
  assert.equal(global.page.data.mealRecommendations.length, 3)
  assert.equal(global.page.data.mealRecommendations[0].title, '白菜豆腐汤')
  assert.equal('priorityText' in global.page.data.mealRecommendations[0], false)
  assert.equal(global.page.data.mealRecommendations.some((meal) => meal.title.includes('里脊肉')), false)
  assert.equal(global.page.data.mealRecommendations.every((meal) => meal.source === 'ai'), true)
  assert.deepEqual(cloudPayloads[0].excludedTitles, [])
  assert.equal('sourceLabel' in global.page.data.visibleNutritionRows[0], false)
  assert.equal('dietAdvice' in global.page.data, false)

  global.page.recordAiFeedback({ currentTarget: { dataset: { id: global.page.data.aiInsightId, kind: 'insight', value: 'helpful' } } })
  assert.equal(global.page.data.aiInsightFeedback, 'helpful')
  assert.equal(storage['virtual-fridge-ai-feedback'][0].value, 'helpful')
  assert.equal(lastToast, '已记录，谢谢反馈')

  cloudResult = { ok: true, data: {
      recipes: [
        { title: '白菜豆腐汤', reason: '重复上一轮', used: ['白菜', '豆腐'], priority: ['白菜'], missing: [], steps: ['切好食材', '煮熟'] },
        { title: '豆腐白菜煲', reason: '搭配现有食材', used: ['豆腐', '白菜'], priority: ['白菜'], missing: [], steps: ['切好食材', '焖煮入味'] },
        { title: '白菜炖豆腐', reason: '优先使用白菜', used: ['白菜', '豆腐'], priority: ['白菜'], missing: [], steps: ['食材入锅', '小火炖熟'] },
        { title: '凉拌白菜', reason: '使用库存白菜', used: ['白菜'], priority: ['白菜'], missing: [], steps: ['洗净切丝', '拌匀调味'] }
      ]
    } }
  await global.page.generateAiInsights()
  assert.deepEqual(global.page.data.mealRecommendations.map((meal) => meal.title), ['豆腐白菜煲', '白菜炖豆腐', '凉拌白菜'])
  assert.deepEqual(cloudPayloads[1].excludedTitles, ['白菜豆腐汤', '清炒白菜', '香煎豆腐'])
  assert.equal(global.page.data.aiInsightsMessage, '已根据当前库存生成3道菜谱')

  const previousTitles = global.page.data.mealRecommendations.map((meal) => meal.title)
  cloudResult = { ok: false, error: 'deepseek-timeout', message: 'AI 响应超时，请稍后重试' }
  await global.page.generateAiInsights()
  assert.equal(global.page.data.aiInsightsState, 'fallback')
  assert.match(global.page.data.aiInsightsMessage, /超时/)
  assert.deepEqual(global.page.data.mealRecommendations.map((meal) => meal.title), previousTitles)
  assert.equal(global.page.data.mealRecommendations.every((meal) => meal.source === 'ai'), true)

  console.log('DeepSeek meal AI page integration: ok')
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
