const RECEIPT_CATEGORIES = ['蔬菜', '水果', '菌菇', '肉禽', '水产', '蛋类', '乳制品', '豆制品', '熟食', '烘焙', '速冻食品', '主食粮油', '饮料', '调味品', '零食', '干货', '其他食品']
const units = ['份', '个', '盒', '袋', '瓶', '克', '千克']
const zones = ['fridge', 'freezer', 'room']

const excludedItemRules = [
  ['纸品耗材', /(?:抽纸|卷纸|纸巾|湿巾|卫生纸|垃圾袋|保鲜膜|保鲜袋|一次性手套|一次性餐具)/i],
  ['清洁用品', /(?:洗衣液|洗衣粉|洗洁精|清洁剂|消毒液|洁厕|柔顺剂|抹布|钢丝球|拖把|扫把)/i],
  ['个护美妆', /(?:牙膏|牙刷|漱口水|洗发水|护发素|沐浴露|香皂|肥皂|护肤|面膜|化妆|卫生巾|剃须|洗面奶)/i],
  ['母婴用品', /(?:纸尿裤|尿不湿|奶瓶|奶嘴|婴儿湿巾|隔尿垫)/i],
  ['药品保健', /(?:药品|感冒药|退烧药|止痛药|创可贴|医用口罩|酒精棉|体温计|保健品|维生素片|钙片)/i],
  ['宠物用品', /(?:猫粮|狗粮|宠物食品|宠物零食|猫砂|宠物尿垫|宠物玩具)/i],
  ['家居用品', /(?:雨伞|保鲜盒|收纳盒|衣架|拖鞋|水杯|餐具|锅具|菜刀|砧板|床品|枕头)/i],
  ['服饰纺织', /(?:袜子|棉袜|丝袜|内衣|裤子|衣服|毛巾|浴巾|鞋子|帽子|手套)/i],
  ['文具数码', /(?:文具|笔记本|铅笔|水笔|胶带|文件夹|数据线|充电线|耳机|手机壳|鼠标|键盘)/i],
  ['数码五金', /(?:电池|灯泡|插座|螺丝|螺丝刀|扳手|钳子|胶水|五金)/i],
  ['玩具文体', /(?:玩具|积木|球拍|跳绳|哑铃|扑克牌)/i],
  ['花卉园艺', /(?:鲜花|花束|盆栽|花盆|营养土|园艺)/i],
  ['烟草', /(?:香烟|卷烟|烟草|雪茄)/i],
  ['卡券服务', /(?:充值卡|礼品卡|购物卡|会员卡|服务费)/i]
]
const categoryRules = [
  ['速冻食品', /(?:速冻|水饺|饺子|汤圆|馄饨|云吞|手抓饼|冻鸡翅|冻虾仁|冻带鱼|冻玉米|冻豌豆|冻榴莲|冰淇淋|雪糕|冰棍)/],
  ['干货', /(?:干香菇|干木耳|枸杞|红枣|桂圆干|干货)/],
  ['菌菇', /(?:香菇|蘑菇|口蘑|松茸|杏鲍菇|金针菇|平菇|木耳|银耳|菌菇)/],
  ['水果', /(?:苹果|香蕉|梨|橙|柑|葡萄|西瓜|蓝莓|草莓|芒果|榴莲|桃|李子|樱桃|猕猴桃|火龙果|柚子|果切|水果)/],
  ['蔬菜', /(?:白菜|青菜|生菜|菠菜|油麦菜|黄瓜|萝卜|茄子|豆角|西兰花|芹菜|番茄|西红柿|土豆|马铃薯|莲藕|玉米|南瓜|冬瓜|蔬菜)/],
  ['水产', /(?:鱼|虾|蟹|贝|花蛤|蛤蜊|鱿鱼|章鱼|海鲜)/],
  ['烘焙', /(?:面包|吐司|蛋糕|糕点|曲奇|可颂|贝果|面团)/],
  ['蛋类', /(?:鸡蛋|鸭蛋|鹅蛋|鹌鹑蛋|皮蛋|咸蛋)/],
  ['乳制品', /(?:牛奶|鲜奶|酸奶|奶酪|芝士|乳酸|黄油|炼乳|奶油)/],
  ['豆制品', /(?:豆腐|豆干|香干|千张|豆皮|腐竹|豆浆|豆制品)/],
  ['肉禽', /(?:猪肉|牛肉|羊肉|鸡肉|鸭肉|鹅肉|五花肉|里脊|牛排|鸡腿|鸡翅|排骨|香肠|火腿)/],
  ['熟食', /(?:卤味|卤牛肉|烧鸡|烤鸭|凉菜|沙拉|即食餐|熟食|剩菜)/],
  ['主食粮油', /(?:大米|米饭|面粉|面条|挂面|馒头|米粉|粉丝|燕麦|麦片|食用油|花生油|菜籽油|橄榄油|粥)/],
  ['调味品', /(?:盐|白糖|酱油|醋|蚝油|料酒|番茄酱|沙拉酱|辣椒酱|调味|味精|鸡精|花椒|胡椒)/],
  ['饮料', /(?:矿泉水|纯净水|果汁|饮料|可乐|汽水|茶饮|咖啡|啤酒|红酒|白酒)/],
  ['零食', /(?:巧克力|薯片|饼干|糖果|果冻|坚果|瓜子|雪饼|零食)/]
]

const totalPattern = /(?:合计|总计|应付|实付|应收|总金额|total)/i
const ignoredPattern = /(?:欢迎|超市|商场|门店|收银|小票|地址|电话|订单|流水|日期|时间|支付|微信|支付宝|现金|找零|优惠|折扣|会员|票号|商户|发票|税率|条码|商品编码)/i
const quantityPattern = /(\d+(?:\.\d+)?)\s*(千克|公斤|kg|克|g|盒|袋|瓶|个|份)/i
const modelIgnoredPattern = /(?:合计|总计|小计|实付|应付|支付|优惠|折扣|找零|收款|订单|流水|商户|门店|欢迎|谢谢)/

function roundMoney(value) {
  const number = Number(String(value === undefined ? '' : value).replace(/[¥￥,\s]/g, ''))
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) / 100 : 0
}

function normalizeUnit(value) {
  const unit = String(value || '').toLowerCase()
  if (unit === 'kg' || unit === '公斤' || unit === '千克') return '千克'
  if (unit === 'g' || unit === '克') return '克'
  return units.includes(value) ? value : '份'
}

function normalizeClassificationKey(value) {
  return String(value || '').toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]/g, '').slice(0, 40)
}

function classifyReceiptItem(name, modelSuggestion = {}) {
  const text = String(name || '').trim()
  if (modelSuggestion.remembered === true && modelSuggestion.inventoryType === 'nonfood') {
    return { inventoryType: 'nonfood', category: '', confidence: 'high', excludedCategory: modelSuggestion.excludedCategory || '其他非食物商品' }
  }
  if (modelSuggestion.remembered === true && modelSuggestion.inventoryType === 'food' && RECEIPT_CATEGORIES.includes(modelSuggestion.category)) {
    return { inventoryType: 'food', category: modelSuggestion.category, confidence: 'high' }
  }
  const excluded = excludedItemRules.find(([, pattern]) => pattern.test(text))
  if (excluded) return { inventoryType: 'nonfood', category: '', confidence: 'high', excludedCategory: excluded[0] }
  const matched = categoryRules.find(([, pattern]) => pattern.test(text))
  if (matched) return { inventoryType: 'food', category: matched[0], confidence: 'high' }
  if (modelSuggestion.inventoryType === 'nonfood') return { inventoryType: 'nonfood', category: '', confidence: 'medium', excludedCategory: '其他非食物商品' }
  if (modelSuggestion.inventoryType === 'food' && RECEIPT_CATEGORIES.includes(modelSuggestion.category)) {
    return { inventoryType: 'food', category: modelSuggestion.category, confidence: 'medium' }
  }
  return { inventoryType: 'pending', category: '其他食品', confidence: 'low' }
}

function inferCategory(name) {
  return classifyReceiptItem(name).category
}

function normalizeFoodCategory(category, name) {
  if (RECEIPT_CATEGORIES.includes(category)) return category
  if (category === '主食') return '主食粮油'
  if (category === '其他') return inferCategory(name) || '其他食品'
  if (category === '蔬菜水果' || category === '肉蛋水产') return inferCategory(name) || '其他食品'
  return inferCategory(name) || '其他食品'
}

function cleanLines(source) {
  if (!Array.isArray(source)) return []
  return source
    .map((item) => typeof item === 'string' ? item : item && (item.text || item.itemstring || item.words))
    .filter((item) => typeof item === 'string')
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 100)
}

function cleanName(value) {
  return String(value || '')
    .replace(/^[#*×x\d.\-\s]+(?=[\u4e00-\u9fa5A-Za-z])/, '')
    .replace(/[¥￥*×x]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20)
}

function looksLikeName(value) {
  const name = cleanName(value)
  return name.length >= 2 && /[\u4e00-\u9fa5A-Za-z]/.test(name) && !ignoredPattern.test(name) && !totalPattern.test(name)
}

function numberMatches(value) {
  return [...String(value || '').matchAll(/[¥￥]?\s*(\d+(?:\.\d{1,2})?)/g)]
}

function parseReceiptLines(source) {
  const lines = cleanLines(source)
  const items = []
  let total = 0
  let pendingName = ''

  lines.forEach((line) => {
    const numbers = numberMatches(line)
    if (totalPattern.test(line)) {
      if (numbers.length) total = roundMoney(numbers[numbers.length - 1][1])
      pendingName = ''
      return
    }
    if (ignoredPattern.test(line)) {
      pendingName = ''
      return
    }
    if (!numbers.length) {
      if (looksLikeName(line)) pendingName = cleanName(line)
      return
    }

    const amountMatch = numbers[numbers.length - 1]
    const amount = roundMoney(amountMatch[1])
    if (!amount) return
    const prefix = line.slice(0, amountMatch.index).trim()
    const quantityMatch = prefix.match(quantityPattern)
    const quantity = quantityMatch ? Math.max(0.01, Number(quantityMatch[1])) : 1
    const unit = quantityMatch ? normalizeUnit(quantityMatch[2]) : '份'
    const namePart = quantityMatch
      ? prefix.slice(0, quantityMatch.index)
      : prefix.replace(/[¥￥]?\s*\d+(?:\.\d{1,2})?/g, ' ')
    const name = looksLikeName(namePart) ? cleanName(namePart) : pendingName
    if (!name) return

    const priceTail = quantityMatch
      ? prefix.slice(quantityMatch.index + quantityMatch[0].length)
      : prefix.slice(namePart.length)
    const priceMatches = numberMatches(priceTail)
    const unitPrice = priceMatches.length
      ? roundMoney(priceMatches[priceMatches.length - 1][1])
      : roundMoney(amount / quantity)
    const classification = classifyReceiptItem(name)
    items.push({ name, quantity, unit, unitPrice, amount, ...classification })
    pendingName = ''
  })

  if (!total) total = roundMoney(items.reduce((sum, item) => sum + item.amount, 0))
  return { lines, total, items }
}

function buildGlmReceiptPayload(imageBase64, contentType, model) {
  const mimeType = /^image\/(?:jpeg|png)$/.test(contentType) ? contentType : 'image/jpeg'
  return {
    model,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: [
            '识别这张购物小票中的实际商品。只输出 JSON，不要解释或 Markdown。',
            `格式：{"total":0,"items":[{"name":"商品名","quantity":1,"unit":"份","unitPrice":0,"amount":0,"inventoryType":"food|nonfood|pending","category":"${RECEIPT_CATEGORIES.join('|')}"}]}。`,
            '属于家庭食物库存的商品使用 food；清洁纸品、个护母婴、药品保健、宠物、家居数码、服饰文具等不应进入食物库存的商品使用 nonfood；无法判断使用 pending。',
            '排除店名、合计、支付、优惠、折扣、订单号等非商品行。',
            '看不清的内容不要猜；未知价格填 0，未知数量填 1，未知单位填“份”。',
            '单位只使用：份、个、盒、袋、瓶、克、千克。金额保留两位小数。'
          ].join('\n')
        },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } }
      ]
    }],
    response_format: { type: 'json_object' },
    thinking: { type: 'enabled' },
    reasoning_effort: 'low',
    temperature: 0.1,
    max_tokens: 2048,
    stream: false
  }
}

function parseGlmReceiptContent(content) {
  const text = String(content || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('invalid GLM receipt JSON')
  const parsed = JSON.parse(text.slice(start, end + 1))
  const items = (Array.isArray(parsed.items) ? parsed.items : [])
    .slice(0, 50)
    .map((item) => {
      const name = cleanName(item && item.name)
      const quantity = Number(item && item.quantity)
      const classification = classifyReceiptItem(name, item || {})
      return {
        name,
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
        unit: normalizeUnit(item && item.unit),
        unitPrice: roundMoney(item && item.unitPrice),
        amount: roundMoney(item && item.amount),
        ...classification
      }
    })
    .filter((item) => item.name && !modelIgnoredPattern.test(item.name))
  return { total: roundMoney(parsed.total), items }
}

function normalizePurchase(purchase) {
  if (!purchase || typeof purchase.id !== 'string' || !purchase.id || !/^\d{4}-\d{2}-\d{2}$/.test(purchase.purchasedDate)) return null
  const items = Array.isArray(purchase.items) ? purchase.items.reduce((result, item, index) => {
    const name = cleanName(item && item.name)
    if (!name) return result
    const quantity = Number(item.quantity)
    const amount = roundMoney(item.amount)
    const unitPrice = roundMoney(item.unitPrice || (quantity > 0 ? amount / quantity : amount))
    result.push({
      id: typeof item.id === 'string' && item.id ? item.id : `${purchase.id}-line-${index + 1}`,
      name,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      unit: units.includes(item.unit) ? item.unit : '份',
      unitPrice,
      amount,
      category: normalizeFoodCategory(item.category, name),
      zone: zones.includes(item.zone) ? item.zone : 'fridge',
      expireDate: /^\d{4}-\d{2}-\d{2}$/.test(item.expireDate) ? item.expireDate : purchase.purchasedDate
    })
    return result
  }, []) : []
  if (!items.length) return null
  const selectedTotal = roundMoney(items.reduce((sum, item) => sum + item.amount, 0))
  return {
    id: purchase.id,
    purchasedDate: purchase.purchasedDate,
    createdAt: Number.isFinite(purchase.createdAt) ? purchase.createdAt : Date.now(),
    source: purchase.source === 'ocr' ? 'ocr' : 'manual',
    receiptTotal: roundMoney(purchase.receiptTotal || selectedTotal),
    selectedTotal,
    rawLines: cleanLines(purchase.rawLines),
    items
  }
}

function normalizePurchases(purchases) {
  if (!Array.isArray(purchases)) return []
  const ids = new Set()
  return purchases.reduce((result, purchase) => {
    const normalized = normalizePurchase(purchase)
    if (!normalized || ids.has(normalized.id)) return result
    ids.add(normalized.id)
    result.push(normalized)
    return result
  }, [])
}

function monthFromTimestamp(timestamp) {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function calculateReceiptStats(purchases, history, month) {
  const selectedMonth = /^\d{4}-\d{2}$/.test(month) ? month : monthFromTimestamp(Date.now())
  const monthlyPurchases = normalizePurchases(purchases).filter((purchase) => purchase.purchasedDate.startsWith(selectedMonth))
  const categoryTotals = {}
  monthlyPurchases.forEach((purchase) => {
    purchase.items.forEach((item) => {
      categoryTotals[item.category] = roundMoney((categoryTotals[item.category] || 0) + item.amount)
    })
  })
  const monthlyTotal = roundMoney(Object.values(categoryTotals).reduce((sum, amount) => sum + amount, 0))
  const categoryRows = Object.entries(categoryTotals)
    .map(([category, amount]) => ({ category, amount, share: monthlyTotal ? Math.round((amount / monthlyTotal) * 100) : 0 }))
    .sort((first, second) => second.amount - first.amount)
  const handled = Array.isArray(history) ? history.filter((entry) => (
    entry && ['eaten', 'discarded'].includes(entry.outcome) && monthFromTimestamp(entry.handledAt) === selectedMonth
  )) : []
  const eatenCount = handled.filter((entry) => entry.outcome === 'eaten').length
  const discarded = handled.filter((entry) => entry.outcome === 'discarded')
  const wasteAmount = roundMoney(discarded.reduce((sum, entry) => sum + roundMoney(entry.food && entry.food.purchaseAmount), 0))
  return {
    month: selectedMonth,
    monthlyTotal,
    purchaseCount: monthlyPurchases.length,
    categoryRows,
    eatenCount,
    discardedCount: discarded.length,
    wasteAmount,
    wasteRate: handled.length ? Math.round((discarded.length / handled.length) * 100) : 0
  }
}

module.exports = {
  RECEIPT_CATEGORIES,
  buildGlmReceiptPayload,
  calculateReceiptStats,
  classifyReceiptItem,
  inferCategory,
  normalizeClassificationKey,
  normalizeFoodCategory,
  normalizePurchases,
  parseGlmReceiptContent,
  parseReceiptLines,
  roundMoney
}
