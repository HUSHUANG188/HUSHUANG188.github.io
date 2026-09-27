const crypto = require('crypto')

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const INVITE_TTL_MS = 24 * 60 * 60 * 1000
const categories = ['蔬菜', '水果', '菌菇', '肉禽', '水产', '蛋类', '乳制品', '豆制品', '熟食', '烘焙', '速冻食品', '主食粮油', '饮料', '调味品', '零食', '干货', '其他食品']
const legacyCategories = { 蔬菜水果: '蔬菜', 肉蛋水产: '肉禽', 主食: '主食粮油', 其他: '其他食品' }
const zones = ['fridge', 'freezer', 'room']
const units = ['份', '个', '盒', '袋', '瓶', '克', '千克']

class FamilyError extends Error {
  constructor(code, message, extra = {}) {
    super(message)
    this.code = code
    Object.assign(this, extra)
  }
}

function cleanText(value, max, fallback = '') {
  const text = typeof value === 'string' ? value.trim() : ''
  return (text || fallback).slice(0, max)
}

function normalizeInviteCode(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z2-9]/g, '')
}

function createInviteCode(bytes = crypto.randomBytes(8)) {
  return Array.from(bytes).slice(0, 8).map(value => INVITE_ALPHABET[value % INVITE_ALPHABET.length]).join('')
}

function deterministicInviteCode(familyId, openid, requestId) {
  return createInviteCode(crypto.createHash('sha256').update(`${familyId}|${openid}|${requestId}`).digest().subarray(0, 8))
}

function hashInviteCode(value) {
  return crypto.createHash('sha256').update(normalizeInviteCode(value)).digest('hex')
}

function stableId(prefix, ...parts) {
  const digest = crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24)
  return `${prefix}-${digest}`
}

function migrationDocumentId(familyId, type, sourceId) {
  return stableId(type.replace(/s$/, '') || 'item', familyId, type, sourceId)
}

function isInviteUsable(invite, now = Date.now()) {
  return Boolean(invite && invite.active === true && Number(invite.expiresAt) > now)
}

function authorize(member, requiredRole = 'member') {
  if (!member || !['admin', 'member'].includes(member.role)) {
    throw new FamilyError('not-family-member', '你还没有加入这个家庭')
  }
  if (requiredRole === 'admin' && member.role !== 'admin') {
    throw new FamilyError('admin-required', '只有家庭管理员可以执行此操作')
  }
  return member
}

function validateExpectedVersion(record, expectedVersion) {
  if (!record) throw new FamilyError('not-found', '记录已经不存在')
  if (!Number.isInteger(expectedVersion) || record.version !== expectedVersion) {
    throw new FamilyError('conflict', '记录刚被其他成员更新，请重新确认', { latest: record })
  }
  return record
}

function publicMember(member) {
  return {
    memberId: member.memberId,
    nickname: member.nickname,
    role: member.role,
    joinedAt: member.joinedAt
  }
}

function cleanFood(food = {}) {
  const name = cleanText(food.name, 20)
  const quantity = Number(food.quantity)
  if (!name || !(quantity > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(food.expireDate || '')) {
    throw new FamilyError('invalid-food', '食物信息不完整')
  }
  const storedAt = /^\d{4}-\d{2}-\d{2}$/.test(food.storedAt || '') ? food.storedAt : food.expireDate
  if (food.expireDate < storedAt) throw new FamilyError('invalid-food-date', '到期日不能早于入库日')
  return {
    name,
    category: categories.includes(food.category) ? food.category : (legacyCategories[food.category] || '其他食品'),
    zone: zones.includes(food.zone) ? food.zone : 'fridge',
    quantity,
    unit: units.includes(food.unit) ? food.unit : '份',
    storedAt,
    expireDate: food.expireDate,
    note: cleanText(food.note, 80),
    shelfLifeReference: cleanText(food.shelfLifeReference, 30),
    expiryWasSuggested: food.expiryWasSuggested === true,
    ...(cleanText(food.purchaseId, 80) ? { purchaseId: cleanText(food.purchaseId, 80) } : {}),
    ...(cleanText(food.purchaseItemId, 80) ? { purchaseItemId: cleanText(food.purchaseItemId, 80) } : {}),
    ...(Number(food.purchaseAmount) >= 0 ? { purchaseAmount: Number(food.purchaseAmount) } : {}),
    ...(Number(food.purchaseUnitPrice) >= 0 ? { purchaseUnitPrice: Number(food.purchaseUnitPrice) } : {})
  }
}

function cleanPurchase(purchase = {}) {
  const purchasedDate = /^\d{4}-\d{2}-\d{2}$/.test(purchase.purchasedDate || '') ? purchase.purchasedDate : ''
  const items = Array.isArray(purchase.items) ? purchase.items.slice(0, 50).map((item, index) => ({
    id: cleanText(item.id, 80, `line-${index + 1}`),
    name: cleanText(item.name, 30),
    quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
    unit: units.includes(item.unit) ? item.unit : '份',
    unitPrice: Math.max(0, Number(item.unitPrice) || 0),
    amount: Math.max(0, Number(item.amount) || 0),
    category: categories.includes(item.category) ? item.category : (legacyCategories[item.category] || '其他食品'),
    zone: zones.includes(item.zone) ? item.zone : 'fridge',
    expireDate: /^\d{4}-\d{2}-\d{2}$/.test(item.expireDate || '') ? item.expireDate : purchasedDate
  })).filter(item => item.name) : []
  if (!purchasedDate || !items.length) throw new FamilyError('invalid-purchase', '小票内容无效')
  const selectedTotal = items.reduce((sum, item) => sum + item.amount, 0)
  return {
    purchasedDate,
    source: purchase.source === 'ocr' ? 'ocr' : 'manual',
    receiptTotal: Math.max(0, Number(purchase.receiptTotal) || selectedTotal),
    selectedTotal,
    rawLines: Array.isArray(purchase.rawLines) ? purchase.rawLines.filter(line => typeof line === 'string').slice(0, 80) : [],
    items
  }
}

function cleanHistory(entry = {}) {
  if (!['eaten', 'discarded'].includes(entry.outcome)) throw new FamilyError('invalid-history', '处理记录无效')
  return {
    food: cleanFood(entry.food),
    outcome: entry.outcome,
    handledAt: Number.isFinite(entry.handledAt) ? entry.handledAt : Date.now()
  }
}

function cleanMagnet(magnet = {}) {
  if (!['note', 'photo', 'album', 'sticker'].includes(magnet.type)) throw new FamilyError('invalid-door', '冰箱贴类型无效')
  const content = cleanText(magnet.content, 500)
  if (!content) throw new FamilyError('invalid-door', '冰箱贴内容为空')
  const result = {
    id: cleanText(magnet.id, 80),
    type: magnet.type,
    content,
    xRatio: Math.max(0, Math.min(1, Number(magnet.xRatio) || 0)),
    yRatio: Math.max(0, Math.min(1, Number(magnet.yRatio) || 0)),
    z: Math.max(1, Math.floor(Number(magnet.z) || 1))
  }
  if (!result.id) throw new FamilyError('invalid-door', '冰箱贴缺少标识')
  if (magnet.type === 'photo' && !content.startsWith('cloud://')) throw new FamilyError('invalid-door-media', '家庭照片尚未上传')
  if (magnet.type === 'album') {
    const photos = Array.isArray(magnet.photos) ? magnet.photos.filter(item => typeof item === 'string' && item.startsWith('cloud://')).slice(0, 9) : []
    if (photos.length < 2) throw new FamilyError('invalid-door-media', '家庭照片集尚未上传完整')
    result.photos = photos
    result.content = photos[0]
    result.title = cleanText(magnet.title, 20, '照片集')
  }
  if (magnet.type === 'sticker' && content === 'diy') {
    result.diyText = cleanText(magnet.diyText, 6, '生活')
    result.diyShape = ['round', 'ticket', 'label'].includes(magnet.diyShape) ? magnet.diyShape : 'round'
    result.diyColor = ['fern', 'amber', 'berry', 'ink'].includes(magnet.diyColor) ? magnet.diyColor : 'fern'
  }
  return result
}

function cleanMagnets(magnets) {
  if (!Array.isArray(magnets) || magnets.length > 60) throw new FamilyError('invalid-door', '冰箱门内容无效')
  const ids = new Set()
  return magnets.map(cleanMagnet).filter(item => {
    if (ids.has(item.id)) return false
    ids.add(item.id)
    return true
  })
}

module.exports = {
  INVITE_TTL_MS,
  FamilyError,
  authorize,
  cleanFood,
  cleanHistory,
  cleanMagnets,
  cleanPurchase,
  cleanText,
  createInviteCode,
  deterministicInviteCode,
  hashInviteCode,
  isInviteUsable,
  migrationDocumentId,
  normalizeInviteCode,
  publicMember,
  stableId,
  validateExpectedVersion
}
