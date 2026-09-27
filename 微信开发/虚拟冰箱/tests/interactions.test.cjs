const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { processFoodBatch } = require('../utils/food')

const foods = [
  { id: 'food-1', name: '白菜', quantity: 1, unit: '份' },
  { id: 'food-2', name: '豆干', quantity: 2, unit: '袋' },
  { id: 'food-3', name: '鸡肉', quantity: 1, unit: '盒' }
]
const history = [{ id: 'old', foodId: 'old-food', outcome: 'finished', handledAt: 1 }]
let nextId = 0
const batchResult = processFoodBatch({
  foods,
  history,
  selectedIds: ['food-1', 'food-3', 'missing'],
  outcome: 'eaten',
  handledAt: 200,
  createId: () => `history-${++nextId}`
})

assert.deepEqual(batchResult.foods.map((food) => food.id), ['food-2'])
assert.equal(batchResult.processedCount, 2)
assert.deepEqual(batchResult.history.slice(0, 2).map((entry) => ({
  id: entry.id,
  foodId: entry.food.id,
  name: entry.food.name,
  outcome: entry.outcome,
  handledAt: entry.handledAt
})), [
  { id: 'history-1', foodId: 'food-1', name: '白菜', outcome: 'eaten', handledAt: 200 },
  { id: 'history-2', foodId: 'food-3', name: '鸡肉', outcome: 'eaten', handledAt: 200 }
])
assert.equal(batchResult.history[2], history[0], 'existing history must remain after the new batch')
assert.equal(foods.length, 3, 'batch processing must not mutate the original inventory array')
assert.equal(history.length, 1, 'batch processing must not mutate the original history array')

const discarded = processFoodBatch({
  foods,
  history: [],
  selectedIds: ['food-2'],
  outcome: 'discarded',
  handledAt: 300,
  createId: () => 'waste-1'
})
assert.equal(discarded.history[0].outcome, 'discarded')
assert.equal(discarded.history[0].food.quantity, 2)
assert.equal(discarded.history[0].food.unit, '袋')

const root = path.join(__dirname, '..')
const wxml = fs.readFileSync(path.join(root, 'pages/index/index.wxml'), 'utf8')
const wxss = fs.readFileSync(path.join(root, 'pages/index/index.wxss'), 'utf8')
const pageJs = fs.readFileSync(path.join(root, 'pages/index/index.js'), 'utf8')

assert.match(wxml, /class="content \{\{viewTransitionClass\}\}"/)
assert.match(wxml, /bindtouchstart="onViewSwipeStart"/)
assert.match(wxml, /bindtouchend="onViewSwipeEnd"/)
assert.doesNotMatch(wxml, /close-door-row \{\{activeView/)
assert.match(wxml, /scroll-into-view="\{\{receiptScrollTarget\}\}"/)
assert.match(wxml, /id="receipt-confirm-target"/)
assert.match(wxml, /(?:bind|catch)tap="jumpReceiptToBottom"/)
assert.match(wxml, /batchMode/)
assert.match(wxml, /toggleBatchFood/)
assert.match(wxml, /finishSelectedFoods/)
assert.match(wxml, /wasteSelectedFoods/)
assert.match(wxml, /visibleNutritionRows/)
assert.match(wxml, /toggleNutritionExpanded/)
assert.match(wxss, /\.category-ledger-row\s*\{[^}]*display:\s*flex/s)
assert.match(wxss, /\.close-door-row\s*\{[^}]*bottom:\s*calc\(188rpx/s)
assert.doesNotMatch(wxss, /\.close-door-row\.with-add-action/)
assert.match(wxss, /\.receipt-jump-bottom\s*\{[^}]*right:\s*44rpx/s)
assert.match(wxss, /\.receipt-jump-bottom\s*\{[^}]*bottom:\s*calc\(244rpx/s)
assert.match(wxss, /\.receipt-jump-bottom\s*\{[^}]*width:\s*104rpx/s)
assert.match(wxss, /\.receipt-jump-bottom\s*\{[^}]*height:\s*104rpx/s)
assert.match(wxss, /\.receipt-jump-bottom\s*\{[^}]*border-radius:\s*50%/s)
assert.match(wxss, /\.content\.view-transition-out/)
assert.match(wxss, /animation:\s*view-switch-out-left 160ms/)
assert.match(wxss, /animation:\s*view-switch-in-left 180ms/)
assert.match(pageJs, /const VIEW_ORDER = \['stock', 'history', 'receipt', 'meal'\]/)
assert.match(pageJs, /Math\.abs\(deltaX\) < 44/)
assert.match(pageJs, /const viewOrder = VIEW_ORDER/)
assert.match(pageJs, /startViewTransition\(viewOrder\[nextIndex\]/)

console.log('interaction regression tests passed')
