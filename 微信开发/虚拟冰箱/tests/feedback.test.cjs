const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { normalizeFood, pruneHistory } = require('../utils/food')
const { inferCategory } = require('../utils/receipt')
const { getNutritionRows } = require('../utils/meal')

const now = new Date(2026, 8, 2, 12, 0).getTime()
assert.equal(typeof pruneHistory, 'function')
assert.deepEqual(pruneHistory([
  { id: 'recent', handledAt: now - 86400000 },
  { id: 'boundary', handledAt: now - 3 * 86400000 },
  { id: 'old', handledAt: now - 3 * 86400000 - 1 }
], new Date(now)).map((entry) => entry.id), ['recent', 'boundary'])
assert.deepEqual(pruneHistory([
  { id: 'before-clear', handledAt: now - 1000 },
  { id: 'after-clear', handledAt: now + 1000 }
], new Date(now + 2000), now).map((entry) => entry.id), ['after-clear'])
assert.equal(normalizeFood({
  name: '白菜',
  category: '蔬菜水果',
  zone: 'fridge',
  unit: '份',
  storedAt: '2026-09-02',
  expireDate: '2026-09-05',
  note: '来自小票批量入库'
}).note, '')

assert.equal(inferCategory('莲藕'), '蔬菜')
assert.equal(inferCategory('黄瓜'), '蔬菜')

const nutritionRows = getNutritionRows([
  { id: 'cabbage', name: '白菜', category: '蔬菜水果' },
  { id: 'tofu', name: '豆干', category: '其他' },
  { id: 'chicken', name: '鸡肉', category: '肉蛋水产' },
  { id: 'lotus', name: '莲藕', category: '蔬菜水果' },
  { id: 'cucumber', name: '黄瓜', category: '蔬菜水果' },
  { id: 'unknown', name: '自制凉菜', category: '其他' }
])
assert.deepEqual(nutritionRows.map((row) => row.name), ['白菜', '豆干', '鸡肉', '莲藕', '黄瓜', '自制凉菜'])
assert.equal(nutritionRows.every((row) => row.summary.length > 0), true)

const pageMarkup = fs.readFileSync(path.join(__dirname, '..', 'pages', 'index', 'index.wxml'), 'utf8')
const pageStyles = fs.readFileSync(path.join(__dirname, '..', 'pages', 'index', 'index.wxss'), 'utf8')
const pageScript = fs.readFileSync(path.join(__dirname, '..', 'pages', 'index', 'index.js'), 'utf8')
const stockMarkup = pageMarkup.split('wx:elif="{{activeView === \'history\'}}"')[0]
assert.doesNotMatch(stockMarkup, /来自|来源|food-source/)
assert.doesNotMatch(pageScript, /note:\s*'来自小票批量入库'/)
assert.match(pageMarkup, /bindtap="clearHistoryNow"/)
assert.match(pageMarkup, /class="category-ledger-values"/)
assert.match(pageStyles, /\.category-ledger-values\s*\{[^}]*display:\s*flex/s)
assert.match(pageScript, /pruneHistory\(history/)

console.log('V7 feedback fixes: ok')
