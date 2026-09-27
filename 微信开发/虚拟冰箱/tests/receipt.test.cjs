const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  calculateReceiptStats,
  normalizePurchases,
  parseReceiptLines
} = require('../utils/receipt')

const parsed = parseReceiptLines([
  '好邻居生活超市',
  '鲜牛奶 2盒 12.50 25.00',
  '苹果 1.25千克 8.00 10.00',
  '鸡蛋 1盒 9.90',
  '合计 ￥44.90',
  '微信支付 44.90'
])

assert.equal(parsed.total, 44.9)
assert.deepEqual(parsed.items.map(({ name, quantity, unit, unitPrice, amount, category }) => ({
  name,
  quantity,
  unit,
  unitPrice,
  amount,
  category
})), [
  { name: '鲜牛奶', quantity: 2, unit: '盒', unitPrice: 12.5, amount: 25, category: '乳制品' },
  { name: '苹果', quantity: 1.25, unit: '千克', unitPrice: 8, amount: 10, category: '水果' },
  { name: '鸡蛋', quantity: 1, unit: '盒', unitPrice: 9.9, amount: 9.9, category: '蛋类' }
])

const pendingName = parseReceiptLines(['香蕉', '2袋 6.00 12.00', '总计 12.00'])
assert.equal(pendingName.items[0].name, '香蕉', 'OCR 将名称和价格拆行时也应形成可编辑草稿')

const purchases = normalizePurchases([{
  id: 'purchase-1',
  purchasedDate: '2026-09-01',
  createdAt: new Date('2026-09-01T10:00:00+08:00').getTime(),
  source: 'ocr',
  receiptTotal: 44.9,
  rawLines: parsed.lines,
  items: parsed.items.map((item, index) => ({ ...item, id: `line-${index}`, zone: 'fridge', expireDate: '2026-09-08' }))
}])
assert.equal(purchases.length, 1)
assert.equal(purchases[0].selectedTotal, 44.9)

const stats = calculateReceiptStats(purchases, [
  {
    handledAt: new Date('2026-09-05T12:00:00+08:00').getTime(),
    outcome: 'eaten',
    food: { purchaseAmount: 25 }
  },
  {
    handledAt: new Date('2026-09-06T12:00:00+08:00').getTime(),
    outcome: 'discarded',
    food: { purchaseAmount: 10 }
  }
], '2026-09')
assert.equal(stats.monthlyTotal, 44.9)
assert.equal(stats.purchaseCount, 1)
assert.equal(stats.eatenCount, 1)
assert.equal(stats.discardedCount, 1)
assert.equal(stats.wasteAmount, 10)
assert.deepEqual(stats.categoryRows.map(({ category, amount }) => ({ category, amount })), [
  { category: '乳制品', amount: 25 },
  { category: '水果', amount: 10 },
  { category: '蛋类', amount: 9.9 }
])

let storedState = { foods: [], history: [], purchases: [], settings: { enabled: false, time: '09:00', permission: 'unknown' } }
let lastToast = ''

global.getApp = () => ({ globalData: {} })
global.wx = {
  getStorageSync: (key) => key === 'virtual-fridge-state' ? storedState : [],
  setStorageSync: (key, value) => {
    if (key === 'virtual-fridge-state') storedState = value
  },
  showToast: ({ title }) => { lastToast = title }
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

global.page.finishReceiptModel({
  total: 45,
  items: [
    { name: '鲜牛奶', quantity: 2, unit: '盒', unitPrice: 12.5, amount: 25 },
    { name: '维达抽纸', quantity: 1, unit: '提', unitPrice: 10, amount: 10 },
    { name: '神秘牌A1', quantity: 1, unit: '份', unitPrice: 10, amount: 10 }
  ]
})
assert.equal(global.page.data.receiptDraft.items[0].name, '鲜牛奶', 'GLM 结构化商品应直接进入可编辑草稿')
assert.equal(global.page.data.receiptDraft.receiptTotal, '45.00')
assert.deepEqual(global.page.data.receiptDraft.items.map(({ inventoryType, selected }) => ({ inventoryType, selected })), [
  { inventoryType: 'food', selected: true },
  { inventoryType: 'nonfood', selected: false },
  { inventoryType: 'pending', selected: false }
])
assert.equal(global.page.data.receiptDraft.selectedTotal, '25.00')
assert.equal(storedState.foods.length, 0, 'MiniMax 识别结束时不得提前写入库存')

global.page.openManualReceipt()
assert.equal(storedState.foods.length, 0, '打开或编辑小票草稿时不得提前写入库存')
assert.equal(storedState.purchases.length, 0, '用户确认前不得写入买菜记录')
global.page.onReceiptItemInput({ currentTarget: { dataset: { index: 0, field: 'name' } }, detail: { value: '全麦面包' } })
global.page.onReceiptItemInput({ currentTarget: { dataset: { index: 0, field: 'amount' } }, detail: { value: '15.80' } })
global.page.commitReceipt()
assert.equal(storedState.foods.length, 1)
assert.equal(storedState.purchases.length, 1)
assert.equal(storedState.foods[0].purchaseId, storedState.purchases[0].id)
assert.equal(storedState.purchases[0].items[0].name, '全麦面包')
assert.equal(lastToast, '1 项已加入库存')

const wxml = fs.readFileSync(path.join(__dirname, '../pages/index/index.wxml'), 'utf8')
const wxss = fs.readFileSync(path.join(__dirname, '../pages/index/index.wxss'), 'utf8')
const cloudConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '../cloudfunctions/receiptOcr/config.json'), 'utf8'))
const cloudFunctionSource = fs.readFileSync(path.join(__dirname, '../cloudfunctions/receiptOcr/index.js'), 'utf8')
const pageSource = fs.readFileSync(path.join(__dirname, '../pages/index/index.js'), 'utf8')
assert.match(wxml, /data-view="receipt"/, '库存页必须提供小票与统计入口')
assert.match(wxml, /bindtap="startReceiptScan"/, '小票页必须提供拍摄或上传入口')
assert.match(wxml, /bindtap="openManualReceipt"/, 'OCR 不可用时必须有手动录入入口')
assert.match(wxml, /bindtap="commitReceipt"/, '识别草稿必须由用户明确确认后才能入库')
assert.match(wxml, /<scroll-view[^>]*class="sheet receipt-sheet"[^>]*scroll-y/, '小票编辑器必须使用原生纵向滚动容器')
assert.match(wxml, /aria-label="第\{\{index \+ 1\}\}项商品单价"/, '小票金额输入必须有明确的无障碍名称')
assert.match(wxml, /aria-label="第\{\{index \+ 1\}\}项商品金额"/, '小票金额输入必须有明确的无障碍名称')
assert.match(wxml, /data-field="inventoryType"/, '小票草稿必须允许用户确认食品、非食品或待确认')
assert.match(wxml, /不属于食物库存，默认不加入/, '小票草稿必须解释非食物库存商品的默认处理')
assert.match(wxml, /receiptStats\.categoryRows/, 'V6 必须展示可追溯的分类消费统计')
assert.match(wxss, /\.receipt-workspace\s*\{/, 'V6 界面必须继承现有页面而不是裸控件堆叠')
assert.equal(cloudConfig.permissions, undefined, 'GLM 识图不应继续申请微信 OCR 权限')
assert.equal(cloudConfig.timeout, 10, '小票识别云函数需要 10 秒执行时间')
assert.doesNotMatch(cloudFunctionSource, /cloud\.openapi\.ocr\.printedText/, '云函数不应继续调用微信 OCR')
assert.match(cloudFunctionSource, /process\.env\.GLM_API_KEY/, 'GLM 密钥必须从云函数环境变量读取')
assert.match(cloudFunctionSource, /createGlmToken/, '云函数只应签发短期 GLM 凭证')
assert.match(cloudFunctionSource, /runTransaction/, 'GLM 凭证签发必须在事务中扣减调用额度')
assert.match(cloudFunctionSource, /receipt_ocr_limits/, 'GLM 凭证签发必须记录每日调用额度')
assert.match(cloudFunctionSource, /receipt_classification_profiles/, '用户分类纠错必须只保存在后台')
assert.match(cloudFunctionSource, /remember-classifications/, '用户确认的分类修改必须可以写入后台记忆')
assert.match(pageSource, /https:\/\/open\.bigmodel\.cn\/api\/paas\/v4\/chat\/completions/, '小程序必须直接请求智谱接口')
assert.match(pageSource, /action: 'glm-token'/, '小程序请求 GLM 前必须获取短期凭证')
assert.match(pageSource, /error\.errMsg/, 'GLM 网络失败时必须保留微信返回的具体原因')

console.log('receipt OCR and statistics flow: ok')
