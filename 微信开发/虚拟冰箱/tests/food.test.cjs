const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  daysUntil,
  decorateFood,
  normalizeFood,
  filterFoods,
  addDays,
  suggestShelfLife,
  calculateFreshness
} = require('../utils/food')
const {
  collectDueFoods,
  isReminderTimeDue,
  buildTemplateData
} = require('../cloudfunctions/reminders/reminder')
const {
  getMagnetSize,
  normalizeMagnets,
  rectanglesOverlap,
  isPositionAvailable,
  findAvailablePosition,
  repairMagnetLayout,
  toViewPosition,
  toStoredPosition
} = require('../utils/door')

const today = new Date(2026, 7, 28, 16, 30)

const dueFoods = collectDueFoods([
  { name: '鲜牛奶', expireDate: '2026-08-29' },
  { name: '鸡蛋', expireDate: '2026-08-31' },
  { name: '冻虾', expireDate: '2026-09-20' },
  { name: '过期豆腐', expireDate: '2026-08-27' }
], '2026-08-28', 3)
assert.deepEqual(dueFoods.map((food) => food.name), ['鲜牛奶', '鸡蛋'])
assert.equal(isReminderTimeDue('08:30', new Date('2026-08-28T08:29:00+08:00'), ''), false)
assert.equal(isReminderTimeDue('08:30', new Date('2026-08-28T08:30:00+08:00'), ''), true)
assert.equal(isReminderTimeDue('08:30', new Date('2026-08-28T09:00:00+08:00'), '2026-08-28'), false)
assert.deepEqual(buildTemplateData(dueFoods, {
  foodNameKey: 'thing1',
  expireDateKey: 'date2',
  statusKey: 'thing3'
}), {
  thing1: { value: '鲜牛奶、鸡蛋' },
  date2: { value: '2026-08-29' },
  thing3: { value: '2种食物即将到期' }
})

assert.equal(daysUntil('2026-08-28', today), 0)
assert.equal(daysUntil('2026-08-31', today), 3)
assert.equal(daysUntil('2026-08-27', today), -1)
assert.equal(decorateFood({ category: '乳制品', expireDate: '2026-08-28' }, today).expiryClass, 'today')
assert.equal(decorateFood({ category: '蔬菜水果', expireDate: '2026-08-30' }, today).expiryClass, 'soon')
assert.equal(decorateFood({ category: '主食', expireDate: '2026-09-10' }, today).expiryClass, 'normal')
assert.equal(decorateFood({ category: '饮料', expireDate: '2026-08-20' }, today).expiryClass, 'expired')

const chickenReference = suggestShelfLife({ name: '鸡胸肉', category: '肉蛋水产', zone: 'fridge' })
assert.equal(chickenReference.days, 2)
assert.equal(chickenReference.label, '生鲜禽肉')
assert.equal(suggestShelfLife({ name: '鸡蛋', category: '肉蛋水产', zone: 'fridge' }).days, 28)
assert.equal(suggestShelfLife({ name: '土鸡蛋', category: '肉蛋水产', zone: 'fridge' }).days, 28)
assert.equal(suggestShelfLife({ name: '鸡胸肉', category: '肉蛋水产', zone: 'freezer' }).days, 270)
assert.deepEqual(suggestShelfLife({ name: '鸡胸肉', category: '肉蛋水产', zone: 'room' }), { days: 0, label: '不建议常温存放' })
assert.deepEqual(suggestShelfLife({ name: '鸡蛋糕', category: '主食', zone: 'fridge' }), { days: 4, label: '主食参考' })
assert.deepEqual(suggestShelfLife({ name: '番茄炒鸡蛋', category: '肉蛋水产', zone: 'fridge' }), { days: 2, label: '肉蛋水产参考' })
assert.deepEqual(suggestShelfLife({ name: '鸡蛋', category: '肉蛋水产', zone: 'freezer' }), { days: 0, label: '不建议冷冻存放' })
assert.deepEqual(suggestShelfLife({ name: '米饭', category: '主食', zone: 'room' }), { days: 0, label: '不建议常温存放' })
assert.deepEqual(suggestShelfLife({ name: '豆浆', category: '饮料', zone: 'room' }), { days: 0, label: '不建议常温存放' })
assert.equal(addDays('2026-08-28', chickenReference.days), '2026-08-30')

const normalizedMagnets = normalizeMagnets([
  { id: 'note-1', type: 'note', content: '记得买牛奶', xRatio: -1, yRatio: 2, z: 2.8 },
  { id: 'note-1', type: 'sticker', content: 'heart', xRatio: 0.5, yRatio: 0.5, z: 3 },
  { id: 'bad', type: 'unknown', content: 'x' }
])
assert.deepEqual(normalizedMagnets, [
  { id: 'note-1', type: 'note', content: '记得买牛奶', xRatio: 0, yRatio: 1, z: 2 }
])
const viewMagnet = toViewPosition(normalizedMagnets[0], { width: 350, height: 500 }, 0.5)
assert.deepEqual({ x: viewMagnet.x, y: viewMagnet.y }, { x: 0, y: 390 })
const storedMagnet = toStoredPosition(viewMagnet, { x: 999, y: -30 }, { width: 350, height: 500 }, 0.5)
assert.deepEqual({ xRatio: storedMagnet.xRatio, yRatio: storedMagnet.yRatio }, { xRatio: 1, yRatio: 0 })

const albumAndDiy = normalizeMagnets([
  { id: 'album-1', type: 'album', content: 'old-cover', photos: ['a.jpg', 'b.jpg'], title: ' 周末散步 ', xRatio: 0.2, yRatio: 0.3, z: 2 },
  { id: 'album-bad', type: 'album', content: 'only.jpg', photos: ['only.jpg'], xRatio: 0, yRatio: 0, z: 1 },
  { id: 'diy-1', type: 'sticker', content: 'diy', diyText: ' 平安喜乐 ', diyShape: 'ticket', diyColor: 'berry', xRatio: 0, yRatio: 0, z: 1 }
])
assert.equal(albumAndDiy.length, 2)
assert.deepEqual(albumAndDiy[0].photos, ['a.jpg', 'b.jpg'])
assert.equal(albumAndDiy[0].content, 'a.jpg')
assert.equal(albumAndDiy[0].title, '周末散步')
assert.equal(albumAndDiy[1].diyText, '平安喜乐')
assert.deepEqual(getMagnetSize('album', 0.5), { width: 150, height: 130 })
assert.equal(rectanglesOverlap({ x: 0, y: 0, width: 50, height: 50 }, { x: 50, y: 0, width: 30, height: 30 }), false)

const placementBounds = { width: 500, height: 500 }
const placedNote = { id: 'placed-note', type: 'note', content: '已经在这里', xRatio: 0, yRatio: 0, z: 1 }
const movingPhoto = { id: 'moving-photo', type: 'photo', content: 'photo.jpg', xRatio: 0, yRatio: 0, z: 2 }
assert.equal(isPositionAvailable(movingPhoto, { x: -1, y: 0 }, [placedNote], placementBounds, 0.5), false)
assert.equal(isPositionAvailable(movingPhoto, { x: 30, y: 30 }, [placedNote], placementBounds, 0.5), false)
assert.equal(isPositionAvailable(movingPhoto, { x: 300, y: 300 }, [placedNote], placementBounds, 0.5), true)
const nearbyFree = findAvailablePosition(movingPhoto, { x: 0, y: 0 }, [placedNote], placementBounds, 0.5)
assert.ok(nearbyFree)
assert.equal(isPositionAvailable(movingPhoto, nearbyFree, [placedNote], placementBounds, 0.5), true)

const fullBounds = { width: 75, height: 75 }
const fullSticker = { id: 'full', type: 'sticker', content: 'heart', xRatio: 0, yRatio: 0, z: 1 }
const extraSticker = { id: 'extra', type: 'sticker', content: 'leaf', xRatio: 0, yRatio: 0, z: 2 }
assert.equal(findAvailablePosition(extraSticker, { x: 0, y: 0 }, [fullSticker], fullBounds, 0.5), null)
assert.equal(findAvailablePosition(movingPhoto, { x: 0, y: 0 }, [], { width: 100, height: 100 }, 0.5), null)

const legacyOverlap = [
  { id: 'legacy-a', type: 'note', content: '旧便签一', xRatio: 0, yRatio: 0, z: 1 },
  { id: 'legacy-b', type: 'note', content: '旧便签二', xRatio: 0, yRatio: 0, z: 2 }
]
const repairedLegacy = repairMagnetLayout(legacyOverlap, placementBounds, 0.5)
assert.ok(repairedLegacy, 'legacy overlaps should be repaired when the door has space')
const repairedSecondView = toViewPosition(repairedLegacy[1], placementBounds, 0.5)
assert.equal(isPositionAvailable(repairedLegacy[1], repairedSecondView, repairedLegacy, placementBounds, 0.5), true)
assert.equal(repairMagnetLayout([fullSticker, extraSticker], fullBounds, 0.5), null, 'impossible legacy layouts must be reported')

const freshAtHalf = calculateFreshness('2026-08-20', '2026-08-30', new Date(2026, 7, 25, 12))
assert.equal(freshAtHalf.percent, 50)
assert.equal(freshAtHalf.bestBeforeDate, '2026-08-27')
assert.equal(freshAtHalf.bestUseLabel, '建议在 2026-08-27 前食用')
assert.equal(calculateFreshness('2026-08-20', '2026-08-30', new Date(2026, 7, 31, 12)).percent, 0)
assert.deepEqual(calculateFreshness('2026-08-28', '2026-08-28', today), {
  percent: 0,
  bestBeforeDate: '2026-08-28',
  bestUseLabel: '参考期限为当天，请立即检查并处理'
})
assert.deepEqual(calculateFreshness('2026-08-29', '2026-08-28', today), {
  percent: 0,
  bestBeforeDate: '2026-08-28',
  bestUseLabel: '日期设置有误：到期日早于入库日'
})

const migratedFood = normalizeFood({
  id: 'legacy-1',
  name: '苹果',
  category: '蔬菜水果',
  quantity: 2,
  expireDate: '2026-08-30'
})
assert.equal(migratedFood.zone, 'fridge')
assert.equal(migratedFood.unit, '份')
const invalidLegacyFields = normalizeFood({ zone: 'cold-storage', unit: 'bucket' })
assert.equal(invalidLegacyFields.zone, 'fridge', 'unknown legacy zone must use the visible fridge default')
assert.equal(invalidLegacyFields.unit, '份', 'unknown legacy unit must use a supported default')

const filterSamples = [
  normalizeFood({ id: '1', name: '鲜牛奶', category: '乳制品', quantity: 1, expireDate: '2026-08-29', zone: 'fridge' }),
  normalizeFood({ id: '2', name: '冻虾', category: '肉蛋水产', quantity: 2, expireDate: '2026-09-20', zone: 'freezer' }),
  normalizeFood({ id: '3', name: '燕麦', category: '主食', quantity: 1, expireDate: '2026-08-20', zone: 'room' })
]
assert.deepEqual(filterFoods(filterSamples, { query: '牛奶' }, today).map((food) => food.id), ['1'])
assert.deepEqual(filterFoods(filterSamples, { zone: 'freezer' }, today).map((food) => food.id), ['2'])
assert.equal(filterSamples[1].category, '水产', '旧肉蛋水产分类应按商品名迁移到细分类')
assert.equal(filterSamples[2].category, '主食粮油', '旧主食分类应迁移到主食粮油')
assert.deepEqual(filterFoods(filterSamples, { category: '主食粮油' }, today).map((food) => food.id), ['3'])
assert.deepEqual(filterFoods(filterSamples, { status: 'soon' }, today).map((food) => food.id), ['1'])
assert.deepEqual(filterFoods(filterSamples, { status: 'expired' }, today).map((food) => food.id), ['3'])
assert.deepEqual(filterFoods(filterSamples, { query: '虾', zone: 'freezer', category: '水产', status: 'soon' }, today), [])

let storedFoods = []
let storedHistory = []
let storedState
let storedMagnets = []
let subscribeTemplateId = ''
let lastToastTitle = ''
let lastModalTitle = ''
global.getApp = () => ({ globalData: { subscribeTemplateId } })
global.wx = {
  getStorageSync: (key) => {
    if (key === 'virtual-fridge-state') return storedState
    if (key === 'virtual-fridge-door') return storedMagnets
    return key === 'virtual-fridge-history' ? storedHistory : storedFoods
  },
  setStorageSync: (key, value) => {
    if (key === 'virtual-fridge-state') {
      storedState = value
      storedFoods = value.foods
      storedHistory = value.history
    } else if (key === 'virtual-fridge-door') {
      storedMagnets = value
    } else if (key === 'virtual-fridge-history') storedHistory = value
    else storedFoods = value
  },
  getWindowInfo: () => ({ windowWidth: 375 }),
  showToast: ({ title }) => { lastToastTitle = title },
  showModal: ({ title }) => { lastModalTitle = title }
}
global.Page = (definition) => { global.page = definition }

require('../pages/index/index')

global.page.setData = function setData(updates, callback) {
  Object.entries(updates).forEach(([key, value]) => {
    const path = key.replace(/\[(\d+)\]/g, '.$1').split('.')
    let target = this.data
    while (path.length > 1) target = target[path.shift()]
    target[path[0]] = value
  })
  if (callback) callback()
}

global.page.doorBounds = { width: 350, height: 500 }
global.page.loadDoor()
global.page.openNoteComposer()
global.page.onMagnetTextInput({ detail: { value: '周五一起吃火锅' } })
global.page.saveNoteMagnet()
assert.equal(storedMagnets.length, 1, 'text notes must persist independently from inventory')
assert.equal(storedMagnets[0].content, '周五一起吃火锅')
assert.equal(storedFoods.length, 0, 'saving a magnet must not change inventory')
const draggedMagnetId = storedMagnets[0].id
global.page.onMagnetTouchStart({ currentTarget: { dataset: { id: draggedMagnetId } }, touches: [{ clientX: 100, clientY: 100 }] })
global.page.onMagnetTouchMove({ currentTarget: { dataset: { id: draggedMagnetId } }, touches: [{ clientX: -999, clientY: -999 }] })
global.page.onMagnetTouchEnd({ currentTarget: { dataset: { id: draggedMagnetId } }, changedTouches: [{ clientX: -999, clientY: -999 }] })
assert.deepEqual(
  toViewPosition(storedMagnets[0], global.page.doorBounds, 0.5),
  { ...storedMagnets[0], x: 0, y: 0 },
  'dragging past the boundary must clamp the magnet inside the door'
)

const firstDoorMagnet = storedMagnets[0]
global.page.openNoteComposer()
global.page.onMagnetTextInput({ detail: { value: '第二张便签' } })
global.page.saveNoteMagnet()
assert.equal(storedMagnets.length, 2)
const firstView = toViewPosition(firstDoorMagnet, global.page.doorBounds, 0.5)
const secondBeforeDrag = { ...storedMagnets[1] }
const secondMagnetId = storedMagnets[1].id
const secondView = toViewPosition(secondBeforeDrag, global.page.doorBounds, 0.5)
global.page.onMagnetTouchStart({ currentTarget: { dataset: { id: secondMagnetId } }, touches: [{ clientX: 100, clientY: 100 }] })
global.page.onMagnetTouchMove({ currentTarget: { dataset: { id: secondMagnetId } }, touches: [{ clientX: 100 + firstView.x - secondView.x, clientY: 100 + firstView.y - secondView.y }] })
assert.equal(global.page.pendingMagnetAvailability[secondMagnetId], false, 'collision must be detected while the card follows the finger')
global.page.onMagnetTouchEnd({ currentTarget: { dataset: { id: secondMagnetId } }, changedTouches: [{ clientX: 100 + firstView.x - secondView.x, clientY: 100 + firstView.y - secondView.y }] })
assert.deepEqual(
  { xRatio: storedMagnets[1].xRatio, yRatio: storedMagnets[1].yRatio },
  { xRatio: secondBeforeDrag.xRatio, yRatio: secondBeforeDrag.yRatio },
  'overlapping drops must revert to the previous position'
)

storedMagnets = []
global.page.loadDoor()
global.page.openDiySticker()
global.page.setData({ 'magnetForm.diyText': '平安', 'magnetForm.diyShape': 'ticket', 'magnetForm.diyColor': 'berry' })
global.page.saveDiySticker()
assert.equal(storedMagnets[0].content, 'diy')
assert.equal(storedMagnets[0].diyText, '平安')

storedMagnets = []
global.page.loadDoor()
global.page.commitPhotoMagnet('single-saved.jpg', '')
assert.equal(storedMagnets[0].type, 'photo', 'single photos must use the shared placement flow')
storedMagnets = []
global.page.loadDoor()
global.page.commitAlbumMagnet(['album-a.jpg', 'album-b.jpg', 'album-c.jpg'], '旅行回忆')
assert.equal(storedMagnets[0].type, 'album', 'photo collections must persist as one door item')
assert.equal(storedMagnets[0].photos.length, 3)
global.page.openAlbumViewer(storedMagnets[0])
assert.equal(global.page.data.showAlbumViewer, true)
assert.equal(global.page.data.activeAlbum.title, '旅行回忆')

const originalDoorBounds = global.page.doorBounds
global.page.doorBounds = { width: 75, height: 75 }
storedMagnets = [{ id: 'full-door', type: 'sticker', content: 'heart', xRatio: 0, yRatio: 0, z: 1 }]
global.page.loadDoor()
lastToastTitle = ''
lastModalTitle = ''
assert.equal(global.page.placeDoorMagnet(global.page.createMagnet('sticker', 'leaf')), false)
assert.equal(lastModalTitle, '冰箱门放不下了')
global.page.doorBounds = originalDoorBounds
storedMagnets = []
global.page.loadDoor()

global.page.openAdd()
global.page.setData({
  'form.name': '日期错误食物',
  'form.storedAt': '2026-08-29',
  'form.expireDate': '2026-08-28'
})
lastToastTitle = ''
global.page.saveFood()
assert.equal(lastToastTitle, '到期日不能早于入库日')
assert.equal(storedFoods.length, 0, 'invalid date order must not be saved')

global.page.openAdd()
global.page.onStoredAtChange({ detail: { value: '2026-08-28' } })
global.page.onNameInput({ detail: { value: '鸡胸肉' } })
assert.equal(global.page.data.form.expireDate, '2026-08-30')
assert.equal(global.page.data.shelfLifeSuggestion.label, '生鲜禽肉')
global.page.onDateChange({ detail: { value: '2026-09-10' } })
global.page.onZoneChange({ detail: { value: 1 } })
assert.equal(global.page.data.form.expireDate, '2026-09-10', 'manual expiry date must not be overwritten')
assert.equal(global.page.data.shelfLifeSuggestion.days, 270, 'manual date must not freeze the reference guidance')
global.page.onZoneChange({ detail: { value: 2 } })
assert.equal(global.page.data.form.expireDate, '2026-09-10')
assert.equal(global.page.data.shelfLifeSuggestion.label, '不建议常温存放')
global.page.onZoneChange({ detail: { value: 1 } })
global.page.resetDateSuggestion()
assert.equal(global.page.data.form.expireDate, '2027-05-25')
global.page.saveFood()
assert.equal(storedFoods[0].storedAt, '2026-08-28')
assert.equal(storedFoods[0].expireDate, '2027-05-25')
assert.equal(storedFoods[0].expiryWasSuggested, true)
assert.equal(
  global.page.data.allFoods[0].freshnessPercent,
  calculateFreshness('2026-08-28', '2027-05-25').percent,
  'rendered freshness must reflect the current date instead of the test fixture date'
)
global.page.openEdit({ currentTarget: { dataset: { id: storedFoods[0].id } } })
assert.equal(global.page.data.dateManuallyEdited, false, 'editing an automatic date must keep suggestions active')
global.page.onZoneChange({ detail: { value: 0 } })
assert.equal(global.page.data.form.expireDate, '2026-08-30', 'changing storage must recalculate an automatic date')
global.page.closeAdd()

storedFoods = []
storedHistory = []
storedState = undefined
global.page.onShow()
global.page.openAdd()
global.page.data.form.name = '鲜牛奶'
global.page.addFood()
assert.equal(storedFoods.length, 1)
assert.equal(global.page.data.foods[0].name, '鲜牛奶')
assert.equal(storedFoods[0].zone, 'fridge')
assert.equal(storedFoods[0].unit, '份')

global.page.data.foods = []
global.page.onShow()
assert.equal(global.page.data.foods[0].name, '鲜牛奶')

const foodCountBeforeReminder = storedFoods.length
global.page.onReminderTimeChange({ detail: { value: '08:30' } })
assert.equal(storedState.settings.time, '08:30')
global.page.onReminderToggle({ detail: { value: true } })
assert.equal(storedState.settings.enabled, false)
assert.equal(storedState.settings.permission, 'unconfigured')
assert.equal(storedFoods.length, foodCountBeforeReminder, 'reminder setup failure must not change inventory')
subscribeTemplateId = 'template-id'
const cloudCalls = []
global.wx.cloud = {
  callFunction: (options) => {
    cloudCalls.push(options)
    if (options.data.action === 'status') options.success({ result: {} })
    else if (options.success) options.success({ result: { ok: true } })
  }
}
global.wx.requestSubscribeMessage = ({ tmplIds, success }) => {
  assert.deepEqual(tmplIds, ['template-id'])
  success({ 'template-id': 'accept' })
}
global.page.onReminderToggle({ detail: { value: true } })
assert.equal(storedState.settings.enabled, true)
assert.equal(storedState.settings.permission, 'accepted')
assert.equal(storedFoods.length, foodCountBeforeReminder)
assert.equal(cloudCalls.at(-1).data.action, 'sync')
assert.equal(cloudCalls.at(-1).data.subscriptionGranted, true)
assert.deepEqual(Object.keys(cloudCalls.at(-1).data.foods[0]).sort(), ['expireDate', 'name'])
assert.deepEqual(Object.keys(cloudCalls.at(-1).data.settings).sort(), ['enabled', 'permission', 'time'])
global.wx.requestSubscribeMessage = ({ fail }) => fail(new Error('subscribe unavailable'))
global.page.onReminderToggle({ detail: { value: true } })
assert.equal(storedState.settings.enabled, false)
assert.equal(storedState.settings.permission, 'error')
assert.equal(storedFoods.length, foodCountBeforeReminder)
const workingSetStorage = global.wx.setStorageSync
global.wx.requestSubscribeMessage = ({ success }) => success({ 'template-id': 'accept' })
global.wx.setStorageSync = () => { throw new Error('storage full') }
lastToastTitle = ''
global.page.onReminderToggle({ detail: { value: true } })
assert.notEqual(lastToastTitle, '提醒授权成功', 'failed settings save must not report success')
global.wx.setStorageSync = workingSetStorage
subscribeTemplateId = ''

subscribeTemplateId = 'template-id'
global.wx.cloud.callFunction = (options) => {
  cloudCalls.push(options)
  if (options.data.action === 'status') {
    options.success({ result: { settings: { enabled: false, time: '08:30', permission: 'sent' } } })
  }
}
global.page.onShow()
assert.equal(storedState.settings.enabled, false)
assert.equal(storedState.settings.permission, 'sent', 'cloud delivery status must update the local switch')
const countBeforeCloudFailure = storedFoods.length
const originalWarn = console.warn
console.warn = () => {}
global.wx.cloud.callFunction = () => { throw new Error('cloud unavailable') }
global.page.openAdd()
global.page.data.form.name = '云端失败测试'
global.page.addFood()
assert.equal(storedFoods.length, countBeforeCloudFailure + 1)
assert.equal(global.page.data.showAdd, false, 'cloud sync failure must not make a successful local save look failed')
console.warn = originalWarn
const cloudFailureFoodId = storedFoods.find((food) => food.name === '云端失败测试').id
global.wx.cloud.callFunction = (options) => {
  cloudCalls.push(options)
  if (options.data.action === 'status') options.success({ result: {} })
  else if (options.success) options.success({ result: { ok: true } })
}
global.page.removeFood(cloudFailureFoodId, '已清理测试记录')
subscribeTemplateId = ''
delete global.wx.cloud

const settingsBeforeProcessing = { ...storedState.settings }
global.page.processFood(storedFoods[0].id, 'eaten')
assert.deepEqual(storedState.settings, settingsBeforeProcessing, 'processing food must preserve reminder settings')
global.page.undoHistory({ currentTarget: { dataset: { id: storedHistory[0].id } } })
assert.deepEqual(storedState.settings, settingsBeforeProcessing, 'undo must preserve reminder settings')

global.page.removeFood(storedFoods[0].id, '已删除')
assert.equal(storedFoods.length, 0)
assert.equal(global.page.data.foods.length, 0)

storedFoods = 'damaged-data'
storedState = undefined
global.page.onShow()
assert.deepEqual(global.page.data.foods, [])

storedFoods = [{}]
storedState = undefined
global.page.onShow()
assert.deepEqual(global.page.data.foods, [])

storedHistory = [{}]
storedState = undefined
assert.doesNotThrow(() => global.page.loadHistory(), 'damaged history must not crash the page')
assert.deepEqual(global.page.data.history, [])
storedHistory = []

storedFoods = []
storedHistory = []
storedState = {
  foods: [normalizeFood({ id: 'preserved-1', name: '保留的苹果', category: '蔬菜水果', quantity: 1, expireDate: '2026-09-01' })],
  history: 'damaged',
  settings: { enabled: false, time: '09:00', permission: 'unknown' }
}
global.page.onShow()
assert.equal(global.page.data.allFoods[0].name, '保留的苹果', 'valid foods must survive damaged history repair')
assert.deepEqual(storedState.history, [], 'damaged history must be repaired independently')

storedFoods = [
  { name: '无编号苹果', category: '蔬菜水果', quantity: 1, expireDate: '2026-08-30' },
  { id: 'duplicate', name: '鸡蛋', category: '肉蛋水产', quantity: 2, expireDate: '2026-08-31' },
  { id: 'duplicate', name: '牛奶', category: '乳制品', quantity: 1, expireDate: '2026-08-29' }
]
storedHistory = []
storedState = undefined
global.page.onShow()
const repairedIds = global.page.data.allFoods.map((food) => food.id)
assert.equal(repairedIds.every(Boolean), true, 'every visible food must have an actionable id')
assert.equal(new Set(repairedIds).size, repairedIds.length, 'visible food ids must be unique')
assert.equal(storedState.foods.every((food) => /^\d{4}-\d{2}-\d{2}$/.test(food.storedAt)), true, 'V2 food must persist a migrated entry date')
global.page.processFood(repairedIds[0], 'eaten')
assert.equal(storedFoods.length, 2, 'a repaired id must remain actionable after migration')

storedFoods = filterSamples
storedHistory = []
storedState = undefined
global.page.onShow()
global.page.setZoneFilter({ currentTarget: { dataset: { value: 'freezer' } } })
global.page.setStatusFilter({ currentTarget: { dataset: { value: 'soon' } } })
assert.deepEqual(global.page.data.foods, [], 'page filters must combine instead of replacing each other')
global.page.clearFilters()
assert.equal(global.page.data.foods.length, 3)

storedFoods = []
storedHistory = []
storedState = undefined
const originalNow = Date.now
Date.now = () => 1234567890
global.page.data.form.name = '鸡蛋'
global.page.addFood()
global.page.data.form.name = '牛奶'
global.page.addFood()
Date.now = originalNow
assert.equal(new Set(storedFoods.map((food) => food.id)).size, 2, 'rapid additions must have unique ids')

storedFoods = [normalizeFood({
  id: 'editable-1',
  name: '全脂牛奶',
  category: '乳制品',
  quantity: 1,
  expireDate: '2026-08-31'
})]
storedHistory = []
storedState = undefined
global.page.onShow()
global.page.openEdit({ currentTarget: { dataset: { id: 'editable-1' } } })
assert.equal(global.page.data.form.name, '全脂牛奶')
global.page.data.form.name = '低脂牛奶'
global.page.data.form.quantity = 2
global.page.saveFood()
assert.equal(storedFoods[0].name, '低脂牛奶')
assert.equal(storedFoods[0].quantity, 2)

global.page.processFood('editable-1', 'eaten')
assert.equal(storedFoods.length, 0)
assert.equal(storedHistory[0].outcome, 'eaten')
assert.equal(storedHistory[0].food.name, '低脂牛奶')

storedFoods = [normalizeFood({
  id: 'waste-1',
  name: '坏掉的生菜',
  category: '蔬菜水果',
  quantity: 1,
  expireDate: '2026-08-20'
})]
storedState = undefined
global.page.processFood('waste-1', 'discarded')
assert.equal(storedHistory[0].outcome, 'discarded')
assert.equal(storedHistory[0].food.name, '坏掉的生菜')
global.page.undoHistory({ currentTarget: { dataset: { id: storedHistory[0].id } } })
assert.equal(storedFoods[0].name, '坏掉的生菜')
assert.equal(storedHistory.some((entry) => entry.food.id === 'waste-1'), false)

storedFoods = Array.from({ length: 50 }, (_, index) => normalizeFood({
  id: `stress-${index}`,
  name: `测试食物${index}`,
  category: '其他',
  quantity: 1,
  expireDate: '2026-09-01'
}))
storedHistory = []
storedState = undefined
for (const food of [...storedFoods]) {
  global.page.processFood(food.id, Number(food.id.slice(7)) % 2 === 0 ? 'eaten' : 'discarded')
}
assert.equal(storedFoods.length, 0)
assert.equal(storedHistory.filter((entry) => entry.outcome === 'eaten').length, 25)
assert.equal(storedHistory.filter((entry) => entry.outcome === 'discarded').length, 25)
for (const historyId of storedHistory.map((entry) => entry.id)) {
  global.page.undoHistory({ currentTarget: { dataset: { id: historyId } } })
}
assert.equal(storedFoods.length, 50)
assert.equal(storedHistory.length, 0)

storedFoods = []
storedHistory = Array.from({ length: 1005 }, (_, index) => ({ id: `history-${index}`, handledAt: 2000 - index }))
storedState = { foods: storedFoods, history: storedHistory, purchases: [], settings: { enabled: false, time: '09:00', permission: 'unknown' } }
assert.equal(global.page.saveState(storedState), true)
assert.equal(storedHistory.length, 1000, 'personal history storage must stay within its long-term safety cap')

storedFoods = [normalizeFood({
  id: 'atomic-1',
  name: '豆腐',
  category: '其他',
  quantity: 1,
  expireDate: '2026-08-29'
})]
storedHistory = []
storedState = {
  foods: storedFoods,
  history: storedHistory,
  settings: { enabled: false, time: '09:00', permission: 'unknown' }
}
global.wx.setStorageSync = (key, value) => {
  if (key === 'virtual-fridge-state') throw new Error('state write failed')
  throw new Error('legacy write must not run')
}
global.page.processFood('atomic-1', 'eaten')
assert.equal(storedFoods.length, 1, 'failed processing must keep food in stock')
assert.equal(storedHistory.length, 0, 'failed processing must not leave a duplicate history record')

const visibleBeforeReadFailure = global.page.data.foods.length
global.wx.getStorageSync = () => { throw new Error('storage unavailable') }
assert.doesNotThrow(() => global.page.onShow(), 'storage read failure must not crash the page')
assert.equal(global.page.data.foods.length, visibleBeforeReadFailure, 'storage read failure must keep the last visible data')

global.wx.getStorageSync = () => storedFoods
global.wx.setStorageSync = () => { throw new Error('storage full') }
const beforeFailedSave = storedFoods.length
global.page.data.form.name = '酸奶'
global.page.data.showAdd = true
assert.doesNotThrow(() => global.page.addFood(), 'storage write failure must not crash the page')
assert.equal(global.page.data.showAdd, true, 'form must stay open when saving fails')
assert.equal(storedFoods.length, beforeFailedSave, 'failed save must not mutate existing in-memory food data')

const wxml = fs.readFileSync(path.join(__dirname, '../pages/index/index.wxml'), 'utf8')
assert.equal(wxml.includes('\\n'), false, 'WXML must use real line breaks instead of literal \\n text')
assert.match(wxml, /class="suggestion-title">\{\{shelfLifeSuggestion\.label\}\}/, 'safety reference label must remain visible after manual date edits')
assert.match(wxml, /reminderSettings\.enabled && reminderSettings\.permission === 'accepted'/, 'overview authorization label must verify accepted permission')
assert.match(wxml, /<view id="magnet-area" class="magnet-area">/, 'V4 door must use one shared bounded drag area')
assert.match(wxml, /catchtouchmove="onMagnetTouchMove"/, 'magnets must visibly follow touch movement')
assert.match(wxml, /style="left: \{\{item\.x\}\}px; top: \{\{item\.y\}\}px;/, 'drag feedback must update the selected card position')
assert.match(wxml, /bindtap="openDiySticker"/, 'the sticker picker must expose DIY creation')
assert.match(wxml, /magnetSheetMode === 'photo-choice'/, 'single-photo and album creation must share one entry point')
assert.match(wxml, /<swiper class="album-swiper"/, 'photo collections must open in a swipeable viewer')
assert.match(wxml, /class="door-open-control"[^>]*catchtouchstart="onDoorTouchStart"[^>]*catchtouchend="onDoorTouchEnd"/, 'inventory must remain one swipe away from the door')
assert.match(wxml, /class="close-door-control"[^>]*catchtouchstart="onCloseDoorTouchStart"[^>]*catchtouchend="onCloseDoorTouchEnd"/, 'inventory must have a dedicated swipe-only close-door control')

const handlers = [...wxml.matchAll(/(?:(?:bind|catch)(?:tap|input|change|touchstart|touchmove|touchend))="([A-Za-z0-9_]+)"/g)]
  .map((match) => match[1])
handlers.forEach((handler) => {
  assert.equal(typeof global.page[handler], 'function', `WXML handler ${handler} must exist on the page`)
})

console.log('food expiry and storage flow: ok')
