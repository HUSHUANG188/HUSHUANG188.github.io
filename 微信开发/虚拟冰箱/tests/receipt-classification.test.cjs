const assert = require('node:assert/strict')
const {
  RECEIPT_CATEGORIES,
  classifyReceiptItem,
  normalizeClassificationKey
} = require('../utils/receipt')
const {
  mergeClassificationEntries,
  selectClassificationEntries
} = require('../cloudfunctions/receiptOcr/classification-memory')

assert.deepEqual(classifyReceiptItem('松茸菇'), {
  inventoryType: 'food',
  category: '菌菇',
  confidence: 'high'
})
assert.equal(classifyReceiptItem('维达抽纸').inventoryType, 'nonfood')
assert.equal(classifyReceiptItem('蓝月亮洗衣液').inventoryType, 'nonfood')
assert.equal(classifyReceiptItem('折叠雨伞').excludedCategory, '家居用品')
assert.equal(classifyReceiptItem('南孚电池').excludedCategory, '数码五金')
assert.equal(classifyReceiptItem('云南白药创可贴').excludedCategory, '药品保健')
assert.equal(classifyReceiptItem('全价猫粮').excludedCategory, '宠物用品')
assert.equal(classifyReceiptItem('Type-C数据线').excludedCategory, '文具数码')
assert.equal(classifyReceiptItem('男士棉袜').excludedCategory, '服饰纺织')
assert.deepEqual(classifyReceiptItem('神秘牌A1'), {
  inventoryType: 'pending',
  category: '其他食品',
  confidence: 'low'
})
assert.equal(classifyReceiptItem('神秘牌A1', { inventoryType: 'food', category: '零食' }).category, '零食')
assert.equal(classifyReceiptItem('松茸菇', { inventoryType: 'food', category: '蔬菜', remembered: true }).category, '蔬菜')
assert.equal(classifyReceiptItem('苹果数据线', { inventoryType: 'nonfood', remembered: true }).inventoryType, 'nonfood')
assert.equal(RECEIPT_CATEGORIES.includes('豆制品'), true)
assert.equal(RECEIPT_CATEGORIES.includes('速冻食品'), true)
assert.equal(normalizeClassificationKey(' 维达-抽纸 3层 '), '维达抽纸3层')

const remembered = mergeClassificationEntries([
  { key: '松茸菇', inventoryType: 'food', category: '蔬菜', updatedAt: 1 }
], [
  { name: '松茸菇', inventoryType: 'food', category: '菌菇' },
  { name: '维达抽纸', inventoryType: 'nonfood', category: '其他食品' },
  { name: '待定商品', inventoryType: 'pending', category: '其他食品' }
], 100, 2)
assert.deepEqual(remembered, [
  { key: '松茸菇', name: '松茸菇', inventoryType: 'food', category: '菌菇', updatedAt: 100 },
  { key: '维达抽纸', name: '维达抽纸', inventoryType: 'nonfood', category: '', updatedAt: 100 }
])
assert.deepEqual(selectClassificationEntries(remembered, ['维达抽纸', '不存在']), [remembered[1]])

console.log('receipt food and non-food classification: ok')
