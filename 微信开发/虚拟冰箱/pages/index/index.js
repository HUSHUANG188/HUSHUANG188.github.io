const STORAGE_KEY = 'virtual-fridge-foods'
const HISTORY_KEY = 'virtual-fridge-history'
const STATE_KEY = 'virtual-fridge-state'
const DOOR_KEY = 'virtual-fridge-door'
const AI_FEEDBACK_KEY = 'virtual-fridge-ai-feedback'
const MAX_LOCAL_HISTORY = 1000
const defaultDisplaySettings = { elderMode: false, reduceMotion: false }
const { RECEIPT_CATEGORIES, buildGlmReceiptPayload, calculateReceiptStats, classifyReceiptItem, normalizeClassificationKey, normalizePurchases, parseGlmReceiptContent, roundMoney } = require('../../utils/receipt')
const categories = RECEIPT_CATEGORIES
const receiptTypeOptions = [
  { value: 'food', label: '食物库存' },
  { value: 'nonfood', label: '不入库存' },
  { value: 'pending', label: '待确认' }
]
const zones = [
  { value: 'fridge', label: '冷藏' },
  { value: 'freezer', label: '冷冻' },
  { value: 'room', label: '常温' }
]
const units = ['份', '个', '盒', '袋', '瓶', '克', '千克']
const categoryFilters = ['全部分类', ...categories]
const VIEW_ORDER = ['stock', 'history', 'receipt', 'meal']
const stickerOptions = [
  { value: 'heart', label: '心意' },
  { value: 'leaf', label: '新叶' },
  { value: 'sun', label: '晴日' },
  { value: 'spark', label: '微光' },
  { value: 'flower', label: '小花' },
  { value: 'cloud', label: '晴云' },
  { value: 'berry', label: '浆果' },
  { value: 'home', label: '归家' }
]
const diyShapeOptions = [
  { value: 'round', label: '圆章' },
  { value: 'ticket', label: '票根' },
  { value: 'label', label: '标签' }
]
const diyColorOptions = [
  { value: 'fern', label: '蕨绿' },
  { value: 'amber', label: '蜜橙' },
  { value: 'berry', label: '莓红' },
  { value: 'ink', label: '墨蓝' }
]
const defaultReminderSettings = { enabled: false, time: '09:00', permission: 'unknown' }
const { decorateFood, normalizeFood, pruneHistory, processFoodBatch, filterFoods, addDays, suggestShelfLife } = require('../../utils/food')
const { getMagnetSize, normalizeMagnets, findAvailablePosition, isPositionAvailable, repairMagnetLayout, toViewPosition, toStoredPosition } = require('../../utils/door')
const { defaultDietSettings, dietPreferenceOptions, allergenOptions, avoidOptions, normalizeDietSettings, getNutritionRows } = require('../../utils/meal')
const { buildMealAiPayload, normalizeAiOverview } = require('../../utils/meal-ai')
const { FAMILY_BACKUP_PREFIX, FAMILY_SESSION_KEY, buildMigrationSelection, callFamily, familyCacheKey, formatFamilyFridgeTitle, splitIntoChunks } = require('../../utils/family')
let idSequence = 0

function pad(value) {
  return String(value).padStart(2, '0')
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function createId() {
  idSequence += 1
  return `${Date.now()}-${idSequence}`
}

function getRpxScale() {
  const info = typeof wx.getWindowInfo === 'function' ? wx.getWindowInfo() : wx.getSystemInfoSync()
  return info.windowWidth / 750
}

function nextMagnetPosition(index) {
  const positions = [
    [0.08, 0.08],
    [0.62, 0.12],
    [0.18, 0.46],
    [0.67, 0.54],
    [0.38, 0.27],
    [0.06, 0.68],
    [0.55, 0.72],
    [0.36, 0.58]
  ]
  const [xRatio, yRatio] = positions[index % positions.length]
  return { xRatio, yRatio }
}

function emptyMagnetForm() {
  return { text: '', diyText: '生活', diyShape: 'round', diyColor: 'fern', albumTitle: '旅行回忆' }
}

function emptyForm() {
  const storedAt = formatDate(new Date())
  return {
    name: '',
    quantity: 1,
    storedAt,
    expireDate: addDays(storedAt, 7),
    note: ''
  }
}

function moneyText(value) {
  return roundMoney(value).toFixed(2)
}

function localMealView(foods) {
  return { nutritionRows: getNutritionRows(foods) }
}

function activityTime(timestamp) {
  const date = new Date(timestamp)
  if (!Number.isFinite(date.getTime())) return ''
  const today = formatDate(new Date())
  return formatDate(date) === today
    ? `${pad(date.getHours())}:${pad(date.getMinutes())}`
    : `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function createReceiptDraftItem(item = {}) {
  const name = typeof item.name === 'string' ? item.name.trim().slice(0, 20) : ''
  const classification = classifyReceiptItem(name, item)
  const inventoryType = !name && !item.inventoryType ? 'food' : classification.inventoryType
  const category = categories.includes(classification.category) ? classification.category : '其他食品'
  const zone = zones.some((option) => option.value === item.zone) ? item.zone : 'fridge'
  const unit = units.includes(item.unit) ? item.unit : '份'
  const purchasedDate = /^\d{4}-\d{2}-\d{2}$/.test(item.purchasedDate) ? item.purchasedDate : formatDate(new Date())
  const reference = suggestShelfLife({ name, category, zone })
  return {
    id: typeof item.id === 'string' && item.id ? item.id : createId(),
    selected: item.selected === undefined ? inventoryType === 'food' : item.selected !== false && inventoryType === 'food',
    name,
    originalName: typeof item.originalName === 'string' ? item.originalName : name,
    inventoryType,
    inventoryTypeIndex: Math.max(0, receiptTypeOptions.findIndex((option) => option.value === inventoryType)),
    inventoryTypeLabel: receiptTypeOptions.find((option) => option.value === inventoryType).label,
    excludedCategory: classification.excludedCategory || '',
    classificationEdited: item.classificationEdited === true,
    quantity: Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0 ? Number(item.quantity) : 1,
    unit,
    unitIndex: Math.max(0, units.indexOf(unit)),
    unitPrice: moneyText(item.unitPrice),
    amount: moneyText(item.amount),
    category,
    categoryIndex: Math.max(0, categories.indexOf(category)),
    zone,
    zoneIndex: Math.max(0, zones.findIndex((option) => option.value === zone)),
    expireDate: /^\d{4}-\d{2}-\d{2}$/.test(item.expireDate)
      ? item.expireDate
      : addDays(purchasedDate, Math.max(0, reference.days))
  }
}

function emptyReceiptDraft(source = 'manual') {
  return {
    id: createId(),
    source,
    purchasedDate: formatDate(new Date()),
    receiptTotal: '0.00',
    selectedTotal: '0.00',
    rawLines: [],
    items: [createReceiptDraftItem()]
  }
}

function repairIds(items) {
  const usedIds = new Set()
  let changed = false
  const repaired = items.map((item) => {
    const validId = item && typeof item.id === 'string' && item.id && !usedIds.has(item.id)
    const id = validId ? item.id : createId()
    if (!validId) changed = true
    usedIds.add(id)
    return { ...item, id }
  })
  return { items: repaired, changed }
}

Page({
  data: {
    showSettingsPage: false,
    elderMode: false,
    reduceMotion: false,
    appVersion: '1.2.0',
    surface: 'door',
    doorOpening: false,
    doorClosing: false,
    magnets: [],
    hasDoorMemories: false,
    showMagnetSheet: false,
    magnetSheetMode: 'note',
    editingMagnetId: '',
    editingMagnet: null,
    magnetForm: emptyMagnetForm(),
    stickerOptions,
    diyShapeOptions,
    diyColorOptions,
    albumDraftPhotos: [],
    showAlbumViewer: false,
    activeAlbum: null,
    albumPhotoIndex: 0,
    mediaSaving: false,
    foods: [],
    allFoods: [],
    history: [],
    historyClearedAt: 0,
    purchases: [],
    soonCount: 0,
    showAdd: false,
    showReminderSettings: false,
    showDietSettings: false,
    showReceiptSheet: false,
    receiptBusy: false,
    receiptSaving: false,
    receiptError: '',
    receiptScrollTarget: '',
    receiptMonth: formatDate(new Date()).slice(0, 7),
    receiptStats: calculateReceiptStats([], [], formatDate(new Date()).slice(0, 7)),
    receiptDraft: emptyReceiptDraft(),
    editingId: '',
    activeView: 'stock',
    viewTransitionClass: '',
    batchMode: false,
    selectedFoodIds: [],
    categories,
    receiptTypeOptions,
    zones,
    units,
    categoryFilters,
    categoryIndex: 0,
    zoneIndex: 0,
    unitIndex: 0,
    query: '',
    zoneFilter: 'all',
    statusFilter: 'all',
    categoryFilter: 'all',
    categoryFilterIndex: 0,
    dateManuallyEdited: false,
    shelfLifeSuggestion: { days: 7, label: '蔬菜水果参考' },
    reminderSettings: { ...defaultReminderSettings },
    dietSettings: { ...defaultDietSettings },
    dietDraft: { ...defaultDietSettings },
    dietPreferenceChoices: dietPreferenceOptions,
    dietAllergenChoices: allergenOptions,
    dietAvoidChoices: avoidOptions,
    dietSummary: '未设置饮食限制',
    nutritionRows: [],
    visibleNutritionRows: [],
    nutritionExpanded: false,
    mealRecommendations: [],
    aiInsightsBusy: false,
    aiInsightsState: 'idle',
    aiInsightsMessage: '点击智能推荐生成库存菜谱',
    aiRecentMealTitles: [],
    aiInsightId: '',
    aiInsightFeedback: '',
    familyMode: false,
    family: null,
    familyFridgeTitle: '家庭冰箱',
    familyMember: null,
    familyMembers: [],
    familyActivity: [],
    familyDoorRevision: 0,
    familySyncState: 'local',
    familySyncMessage: '仅保存在本机',
    familyBusy: false,
    showFamilySheet: false,
    showBackupSheet: false,
    backupScope: 'personal',
    backupEntryMode: 'manage',
    backupBusy: false,
    backupError: '',
    backups: [],
    familyPanelMode: 'start',
    familyForm: { name: '', nickname: '', code: '' },
    familyRename: '',
    familyInvite: null,
    invitePreview: null,
    showMigrationSheet: false,
    migrationBusy: false,
    migrationDraft: {
      includeRecords: true,
      includeDoorNotes: false,
      includeDoorPhotos: false,
      recordCount: 0,
      doorNoteCount: 0,
      doorPhotoCount: 0
    },
    form: emptyForm()
  },

  onLoad(options = {}) {
    const code = typeof options.invite === 'string' ? options.invite.trim().toUpperCase() : ''
    if (code) {
      this.pendingInviteCode = code
      this.setData({ 'familyForm.code': code })
    }
    if (typeof wx.showShareMenu === 'function') wx.showShareMenu({ menus: ['shareAppMessage'] })
  },

  onShow() {
    this.pageUnloaded = false
    this.loadDoor()
    const state = this.getStoredState()
    if (!state) return
    this.renderFoods(state.foods)
    this.renderHistory(state.history, state.historyClearedAt)
    this.renderPurchases(state.purchases, state.history)
    this.renderReminderSettings(state.settings)
    this.renderDisplaySettings(state.displaySettings)
    this.renderDiet(state.foods, state.dietSettings)
    this.refreshReminderStatus(state)
    this.restoreFamilyCache()
    this.refreshFamilyIfChanged()
  },

  onShareAppMessage() {
    const invite = this.data.familyInvite
    if (this.data.familyMode && invite && invite.code) {
      return {
        title: `${this.data.family.name} 邀请你一起维护冰箱`,
        path: `/pages/index/index?invite=${invite.code}`
      }
    }
    return { title: '一起把冰箱里的生活照顾好', path: '/pages/index/index' }
  },

  onReady() {
    this.measureDoor()
  },

  onResize() {
    if (this.data.surface === 'door') this.measureDoor()
  },

  onUnload() {
    this.pageUnloaded = true
    if (this.openDoorTimer) clearTimeout(this.openDoorTimer)
    if (this.closeDoorTimer) clearTimeout(this.closeDoorTimer)
  },

  restoreFamilyCache() {
    try {
      const session = wx.getStorageSync(FAMILY_SESSION_KEY)
      if (!session || typeof session.familyId !== 'string') return
      const snapshot = wx.getStorageSync(familyCacheKey(session.familyId))
      if (snapshot && snapshot.family && snapshot.family.familyId === session.familyId) {
        this.applyFamilySnapshot(snapshot, true)
      }
    } catch (error) {
      console.warn('家庭缓存读取失败', error)
    }
  },

  cacheFamilySnapshot(snapshot) {
    try {
      wx.setStorageSync(FAMILY_SESSION_KEY, { familyId: snapshot.family.familyId, name: snapshot.family.name })
      wx.setStorageSync(familyCacheKey(snapshot.family.familyId), snapshot)
    } catch (error) {
      console.warn('家庭缓存保存失败', error)
    }
  },

  clearFamilyCache() {
    try {
      const session = wx.getStorageSync(FAMILY_SESSION_KEY)
      if (session && session.familyId && typeof wx.removeStorageSync === 'function') wx.removeStorageSync(familyCacheKey(session.familyId))
      if (typeof wx.removeStorageSync === 'function') wx.removeStorageSync(FAMILY_SESSION_KEY)
    } catch (error) {
      console.warn('家庭缓存清理失败', error)
    }
  },

  applyFamilySnapshot(snapshot, fromCache = false) {
    if (!snapshot || !snapshot.family || !snapshot.member) return
    const personal = this.getStoredState()
    if (!personal) return
    this.familySnapshot = snapshot
    this.familyDoorRevision = Number(snapshot.door && snapshot.door.revision) || 0
    this.storedMagnets = normalizeMagnets(snapshot.door && snapshot.door.magnets)
    this.magnetZ = this.storedMagnets.reduce((max, magnet) => Math.max(max, magnet.z), 0)
    const restoring = Boolean(snapshot.family.maintenance && snapshot.family.maintenance.type === 'restore')
    this.setData({
      familyMode: true,
      family: snapshot.family,
      familyFridgeTitle: formatFamilyFridgeTitle(snapshot.family.name),
      familyMember: snapshot.member,
      familyMembers: snapshot.members || [],
      familyActivity: (snapshot.activity || []).map(item => ({ ...item, timeText: activityTime(item.createdAt) })),
      familyDoorRevision: this.familyDoorRevision,
      familyRename: snapshot.family.name,
      familySyncState: restoring ? 'syncing' : fromCache ? 'cached' : 'synced',
      familySyncMessage: restoring ? '家庭数据正在恢复，请稍后操作' : fromCache ? '当前为上次同步内容 · 点击重试' : '刚刚同步',
      familyBusy: false
    })
    this.hydrateDoorMagnets()
    this.renderFoods(snapshot.foods || [])
    this.renderHistory(snapshot.history || [], personal.historyClearedAt)
    this.renderPurchases(snapshot.purchases || [], snapshot.history || [])
    this.renderReminderSettings(personal.settings)
    this.renderDiet(snapshot.foods || [], personal.dietSettings)
    if (!fromCache) this.cacheFamilySnapshot(snapshot)
  },

  resetToPersonal(showMessage = false) {
    this.familySnapshot = null
    this.familyDoorRevision = 0
    this.setData({
      familyMode: false,
      family: null,
      familyMember: null,
      familyMembers: [],
      familyActivity: [],
      familyDoorRevision: 0,
      familySyncState: 'local',
      familySyncMessage: '仅保存在本机',
      familyBusy: false,
      familyInvite: null
    })
    this.loadDoor()
    const state = this.getStoredState()
    if (state) {
      this.renderFoods(state.foods)
      this.renderHistory(state.history, state.historyClearedAt)
      this.renderPurchases(state.purchases, state.history)
      this.renderReminderSettings(state.settings)
      this.renderDiet(state.foods, state.dietSettings)
    }
    if (showMessage) wx.showToast({ title: '已回到我的冰箱', icon: 'none' })
  },

  applyFamilyDoor(door) {
    if (!this.familySnapshot || !door) return
    this.familySnapshot = { ...this.familySnapshot, door }
    this.familyDoorRevision = Number(door.revision) || 0
    this.storedMagnets = normalizeMagnets(door.magnets)
    this.magnetZ = this.storedMagnets.reduce((max, magnet) => Math.max(max, magnet.z), 0)
    this.setData({ familyDoorRevision: this.familyDoorRevision })
    this.hydrateDoorMagnets()
    this.cacheFamilySnapshot(this.familySnapshot)
  },

  async refreshFamilyIfChanged() {
    const family = this.familySnapshot && this.familySnapshot.family
    if (!family) return this.refreshFamily()
    if (!Object.prototype.hasOwnProperty.call(family, 'syncRevision')) return this.refreshFamily()
    const status = await callFamily(wx, 'status', { familyId: family.familyId, syncRevision: Number(family.syncRevision) || 0 })
    if (this.pageUnloaded) return false
    if (!status.ok) {
      if (this.data.familyMode) this.setData({ familySyncState: 'cached', familySyncMessage: '当前为上次同步内容 · 点击重试' })
      return false
    }
    if (status.data && status.data.maintenance && status.data.maintenance.type === 'restore') {
      this.setData({ familySyncState: 'syncing', familySyncMessage: '家庭数据正在恢复，请稍后操作' })
      return false
    }
    if (!status.data || !status.data.unchanged) return this.refreshFamily(true)
    const door = this.familySnapshot.door || {}
    const hasMedia = (door.magnets || []).some(magnet => magnet.cloudFileID || (magnet.photoFileIDs && magnet.photoFileIDs.length))
    if (hasMedia && (!door.mediaExpiresAt || door.mediaExpiresAt <= Date.now())) {
      const media = await callFamily(wx, 'doorMedia')
      if (media.ok && media.data) this.applyFamilyDoor(media.data)
    }
    this.setData({ familySyncState: 'synced', familySyncMessage: '数据无变化' })
    return true
  },

  async refreshFamily(silent = false, retryOnChange = true) {
    if (!wx.cloud || typeof wx.cloud.callFunction !== 'function' || this.familyRefreshBusy) return false
    this.familyRefreshBusy = true
    if (!silent) this.setData({ familySyncState: 'syncing', familySyncMessage: '正在同步…' })
    let result = await callFamily(wx, 'bootstrap')
    if (result.ok && result.data && result.data.family && result.data.paging) {
      for (const type of ['foods', 'purchases', 'history']) {
        let paging = result.data.paging[type]
        while (paging && !paging.complete) {
          const offset = paging.nextOffset
          const page = await callFamily(wx, 'bootstrapPage', { type, offset, syncRevision: result.data.family.syncRevision })
          if (!page.ok || !page.data || !Array.isArray(page.data.records) || !page.data.paging || page.data.paging.nextOffset === offset) {
            result = page.ok ? { ok: false, error: 'invalid-page', message: '家庭数据同步不完整，请重试' } : page
            break
          }
          result.data[type].push(...page.data.records)
          paging = page.data.paging
          result.data.paging[type] = paging
        }
        if (!result.ok) break
      }
      if (result.ok) {
        for (const type of ['foods', 'purchases', 'history']) {
          result.data[type] = [...new Map(result.data[type].map(item => [item.id, item])).values()]
        }
        result.data.purchases.sort((a, b) => b.createdAt - a.createdAt)
        result.data.history.sort((a, b) => b.handledAt - a.handledAt)
      }
    }
    this.familyRefreshBusy = false
    if (this.pageUnloaded) return false
    if (!result.ok && result.error === 'family-changed' && retryOnChange) return this.refreshFamily(silent, false)
    if (!result.ok) {
      if (this.data.familyMode) this.setData({ familySyncState: 'cached', familySyncMessage: '当前为上次同步内容 · 点击重试', familyBusy: false })
      return false
    }
    if (!result.data || !result.data.family) {
      const wasFamily = this.data.familyMode
      this.clearFamilyCache()
      this.resetToPersonal(wasFamily)
      if (this.pendingInviteCode) this.previewPendingInvite()
      return true
    }
    this.applyFamilySnapshot(result.data)
    if (this.pendingInviteCode) {
      this.pendingInviteCode = ''
      wx.showToast({ title: '你已经加入一个家庭', icon: 'none' })
    }
    return true
  },

  async runFamilyAction(action, data = {}) {
    if (!this.data.familyMode && !['createFamily', 'joinFamily'].includes(action)) return { ok: false, error: 'not-family-member', message: '请先创建或加入家庭' }
    if (this.data.familyBusy) return { ok: false, error: 'busy', message: '当前操作尚未完成' }
    const operationKey = `${action}:${JSON.stringify(data)}`
    this.familyPendingRequestIds = this.familyPendingRequestIds || {}
    const requestId = this.familyPendingRequestIds[operationKey] || `request-${createId()}`
    this.familyPendingRequestIds[operationKey] = requestId
    this.setData({ familyBusy: true, familySyncState: 'syncing', familySyncMessage: '正在同步…' })
    const result = await callFamily(wx, action, { ...data, requestId })
    if (!result.ok) {
      const maintenance = result.error === 'family-maintenance'
      this.setData({
        familyBusy: false,
        familySyncState: maintenance ? 'syncing' : this.data.familyMode ? 'cached' : 'local',
        familySyncMessage: maintenance ? '家庭数据正在恢复，请稍后操作' : this.data.familyMode ? '同步失败 · 点击重试' : '仅保存在本机'
      })
      wx.showToast({ title: result.message || '操作失败，请重试', icon: 'none' })
      if (['not-family-member', 'family-unavailable', 'family-changed'].includes(result.error)) this.refreshFamily(true)
      else if (result.error === 'conflict') this.refreshFamily(true)
      return result
    }
    delete this.familyPendingRequestIds[operationKey]
    await this.refreshFamily(true)
    this.setData({ familyBusy: false })
    return result
  },

  openFamilySheet() {
    this.setData({
      showFamilySheet: true,
      familyPanelMode: this.data.familyMode ? 'manage' : 'start',
      familyRename: this.data.family ? this.data.family.name : ''
    })
  },

  closeFamilySheet() {
    if (this.data.familyBusy) return
    this.setData({ showFamilySheet: false, invitePreview: null })
  },

  openSettingsPage() {
    this.setData({ showSettingsPage: true })
  },

  closeSettingsPage() {
    this.setData({ showSettingsPage: false })
  },

  updateDisplaySettings(patch) {
    const state = this.getStoredState()
    if (!state) return
    const displaySettings = { ...defaultDisplaySettings, ...(state.displaySettings || {}), ...patch }
    try {
      wx.setStorageSync(STATE_KEY, { ...state, displaySettings })
      this.renderDisplaySettings(displaySettings)
    } catch (error) {
      wx.showToast({ title: '显示设置保存失败，请重试', icon: 'none' })
    }
  },

  onElderModeChange(event) {
    const elderMode = event.detail.value === true
    this.updateDisplaySettings({ elderMode })
    if (elderMode) this.setData({ surface: 'door', activeView: 'stock', batchMode: false, selectedFoodIds: [] })
  },

  onReduceMotionChange(event) {
    this.updateDisplaySettings({ reduceMotion: event.detail.value === true })
  },

  openPrivacyGuide() {
    if (typeof wx.openPrivacyContract !== 'function') {
      wx.showToast({ title: '请通过右上角菜单查看隐私保护指引', icon: 'none' })
      return
    }
    wx.openPrivacyContract({ fail: () => wx.showToast({ title: '隐私保护指引暂时无法打开', icon: 'none' }) })
  },

  showFeatureIntroduction() {
    wx.showModal({
      title: '一格鲜活',
      content: '管理冰箱库存与临期食物，记录小票和处理结果，也可以与家人共享同一个冰箱。',
      showCancel: false
    })
  },

  showServiceDescription() {
    wx.showModal({
      title: '服务说明',
      content: '备份与导出用于保存个人数据；营养信息和智能推荐仅供日常参考，不能替代专业医疗建议。',
      showCancel: false
    })
  },

  callBackupService(action, data = {}) {
    const name = this.data.backupScope === 'family' ? 'family' : 'dataLifecycle'
    return new Promise(resolve => {
      wx.cloud.callFunction({
        name,
        data: { action, ...data },
        success: ({ result }) => resolve(result && typeof result === 'object' ? result : { ok: false, message: '云端没有返回数据' }),
        fail: () => resolve({ ok: false, error: 'service-unavailable', message: '备份服务暂时不可用' })
      })
    })
  },

  async openPersonalBackups() {
    this.setData({ showFamilySheet: false, showBackupSheet: true, backupScope: 'personal', backupEntryMode: 'manage', backupError: '', backups: [] })
    await this.loadCurrentBackups()
  },

  async openPersonalExports() {
    this.setData({ showFamilySheet: false, showBackupSheet: true, backupScope: 'personal', backupEntryMode: 'export', backupError: '', backups: [] })
    await this.loadCurrentBackups()
  },

  async openFamilyBackups() {
    if (!this.data.familyMode || !this.data.familyMember || this.data.familyMember.role !== 'admin') return
    this.setData({ showFamilySheet: false, showBackupSheet: true, backupScope: 'family', backupError: '', backups: [] })
    await this.loadCurrentBackups()
  },

  closeBackupSheet() {
    if (this.data.backupBusy) return
    this.setData({ showBackupSheet: false })
  },

  async loadCurrentBackups() {
    this.setData({ backupBusy: true, backupError: '' })
    const result = await this.callBackupService('listBackups')
    if (!result.ok) {
      this.setData({ backupBusy: false, backupError: result.message || '读取备份失败，请重试' })
      return
    }
    const backups = (result.data && Array.isArray(result.data.backups) ? result.data.backups : []).map(item => ({
      ...item,
      kindText: item.kind === 'preRestore' ? '恢复前自动备份' : '手动备份',
      createdAtText: activityTime(item.createdAt),
      summaryText: `${Number(item.summary && item.summary.foods) || 0} 项库存 · ${Number(item.summary && item.summary.photos) || 0} 张照片`
    }))
    this.setData({ backupBusy: false, backups })
  },

  async stagePersonalBackupMedia(magnets, requestId) {
    const files = [...new Set((magnets || []).flatMap(magnet => {
      if (!magnet || magnet.type === 'photo') return magnet && magnet.content ? [magnet.content] : []
      return magnet.type === 'album' && Array.isArray(magnet.photos) ? magnet.photos : []
    }))]
    const replacements = new Map(files.filter(filePath => filePath.startsWith('cloud://')).map(filePath => [filePath, filePath]))
    const localFiles = files.filter(filePath => !filePath.startsWith('cloud://'))
    const staged = []
    try {
      for (let index = 0; index < localFiles.length; index += 1) {
        const filePath = localFiles[index]
        const extension = filePath.split('?')[0].match(/\.([a-zA-Z0-9]{1,5})$/)
        const fileID = await new Promise((resolve, reject) => wx.cloud.uploadFile({
          cloudPath: `backup-staging/${requestId}/${index}.${extension ? extension[1].toLowerCase() : 'jpg'}`,
          filePath,
          success: result => resolve(result.fileID),
          fail: reject
        }))
        staged.push(fileID)
        replacements.set(filePath, fileID)
      }
    } catch (error) {
      if (staged.length && typeof wx.cloud.deleteFile === 'function') {
        await new Promise(resolve => wx.cloud.deleteFile({ fileList: staged, success: resolve, fail: resolve }))
      }
      throw error
    }
    return (magnets || []).map(magnet => {
      if (!magnet || !['photo', 'album'].includes(magnet.type)) return magnet
      if (magnet.type === 'photo') return { ...magnet, content: replacements.get(magnet.content) }
      const photos = magnet.photos.map(filePath => replacements.get(filePath))
      return { ...magnet, content: photos[0], photos }
    })
  },

  async createCurrentBackup() {
    if (this.data.backupBusy) return
    const requestId = this.pendingBackupRequestId || `backup-${createId()}`
    this.pendingBackupRequestId = requestId
    const data = { requestId }
    if (this.data.backupScope === 'personal') {
      const state = this.getStoredState()
      if (!state) return
      try {
        data.snapshot = {
          state,
          magnets: await this.stagePersonalBackupMedia(this.storedMagnets || [], requestId),
          aiFeedback: wx.getStorageSync(AI_FEEDBACK_KEY) || []
        }
      } catch (error) {
        this.setData({ backupBusy: false, backupError: '照片准备失败，请重试' })
        return
      }
    }
    this.setData({ backupBusy: true, backupError: '' })
    const result = await this.callBackupService('createBackup', data)
    if (!result.ok) {
      this.setData({ backupBusy: false, backupError: result.message || '创建备份失败，请重试' })
      return
    }
    this.pendingBackupRequestId = ''
    await this.loadCurrentBackups()
    wx.showToast({ title: '备份已创建', icon: 'success' })
  },

  applyPersonalRestore(snapshot) {
    if (!snapshot || !snapshot.state || !Array.isArray(snapshot.magnets) || !Array.isArray(snapshot.aiFeedback)) return false
    const previous = {
      state: wx.getStorageSync(STATE_KEY),
      magnets: wx.getStorageSync(DOOR_KEY),
      aiFeedback: wx.getStorageSync(AI_FEEDBACK_KEY)
    }
    try {
      wx.setStorageSync(DOOR_KEY, snapshot.magnets)
      wx.setStorageSync(AI_FEEDBACK_KEY, snapshot.aiFeedback)
      if (!this.saveState(snapshot.state)) throw new Error('restore-state-failed')
      this.storedMagnets = normalizeMagnets(snapshot.magnets)
      this.magnetZ = this.storedMagnets.reduce((max, magnet) => Math.max(max, magnet.z), 0)
      this.hydrateDoorMagnets()
      return true
    } catch (error) {
      try {
        wx.setStorageSync(STATE_KEY, previous.state)
        wx.setStorageSync(DOOR_KEY, previous.magnets)
        wx.setStorageSync(AI_FEEDBACK_KEY, previous.aiFeedback)
      } catch (rollbackError) {}
      return false
    }
  },

  async restoreCurrentBackup(event) {
    if (this.data.backupBusy) return
    const backupId = event && event.currentTarget && event.currentTarget.dataset.id
    if (!backupId) return
    const target = this.data.backups.find(item => item.backupId === backupId)
    const scopeName = this.data.backupScope === 'family' ? '家庭冰箱' : '个人冰箱'
    const current = this.data.backupScope === 'family' ? this.familySnapshot || {} : this.getStoredState() || {}
    const currentCounts = `当前 ${Array.isArray(current.foods) ? current.foods.length : 0} 项库存、${Array.isArray(current.history) ? current.history.length : 0} 条处理记录、${Array.isArray(current.purchases) ? current.purchases.length : 0} 张小票`
    const targetSummary = target && target.summary || {}
    const targetCounts = target ? `备份 ${Number(targetSummary.foods) || 0} 项库存、${Number(targetSummary.history) || 0} 条处理记录、${Number(targetSummary.purchases) || 0} 张小票` : '所选备份'
    const firstConfirmed = await new Promise(resolve => wx.showModal({
      title: '恢复这个备份？',
      content: `${target ? `${target.createdAtText}。` : ''}${currentCounts}；${targetCounts}。恢复会覆盖当前${scopeName}，不会合并。`,
      confirmText: '继续',
      success: ({ confirm }) => resolve(confirm === true),
      fail: () => resolve(false)
    }))
    if (!firstConfirmed) return
    const finalConfirmed = await new Promise(resolve => wx.showModal({
      title: '最后确认恢复',
      content: '恢复前会自动保存当前状态；恢复期间请不要退出小程序。',
      confirmText: '确认恢复',
      confirmColor: '#9a4d42',
      success: ({ confirm }) => resolve(confirm === true),
      fail: () => resolve(false)
    }))
    if (!finalConfirmed) return

    this.pendingRestoreRequestIds = this.pendingRestoreRequestIds || {}
    const requestId = this.pendingRestoreRequestIds[backupId] || `restore-${createId()}`
    this.pendingRestoreRequestIds[backupId] = requestId
    this.setData({ backupBusy: true, backupError: '' })
    const data = { requestId, backupId }
    if (this.data.backupScope === 'personal') {
      const state = this.getStoredState()
      if (!state) {
        this.setData({ backupBusy: false, backupError: '当前数据读取失败，请重试' })
        return
      }
      try {
        data.currentSnapshot = {
          state,
          magnets: await this.stagePersonalBackupMedia(this.storedMagnets || [], requestId),
          aiFeedback: wx.getStorageSync(AI_FEEDBACK_KEY) || []
        }
      } catch (error) {
        this.setData({ backupBusy: false, backupError: '恢复前安全备份失败，请重试' })
        return
      }
    }

    const result = await this.callBackupService('restoreBackup', data)
    if (!result.ok) {
      this.setData({ backupBusy: false, backupError: result.error === 'service-unavailable' ? '恢复结果尚未确认，请再次点击恢复继续' : result.message || '恢复失败，请重试' })
      return
    }
    if (this.data.backupScope === 'personal') {
      if (!result.data || !this.applyPersonalRestore(result.data.snapshot)) {
        this.setData({ backupBusy: false, backupError: '恢复数据写入本机失败，当前数据已保留' })
        return
      }
      const committed = await this.callBackupService('commitRestore', { jobId: result.data.jobId })
      if (!committed.ok) {
        this.setData({ backupBusy: false, backupError: '数据已写入本机，云端仍在确认；请再次点击恢复完成确认' })
        return
      }
    } else {
      await this.refreshFamily(true)
    }
    delete this.pendingRestoreRequestIds[backupId]
    await this.loadCurrentBackups()
    wx.showToast({ title: '恢复完成', icon: 'success' })
  },

  copyExportLink(data) {
    wx.setClipboardData({
      data: data.downloadUrl,
      success: () => wx.showModal({
        title: '导出文件已生成',
        content: '下载地址已复制，请在 24 小时内用浏览器打开并保存 ZIP。当前版本不支持导入此文件。',
        showCancel: false
      }),
      fail: () => this.setData({ backupError: '复制下载地址失败，请重新导出' })
    })
  },

  async deliverExport(data) {
    if (!data || typeof wx.shareFileMessage !== 'function') {
      this.copyExportLink(data)
      return
    }
    let filePath = ''
    if (typeof wx.downloadFile === 'function') {
      filePath = await new Promise(resolve => wx.downloadFile({
        url: data.downloadUrl,
        success: result => resolve(result.statusCode === 200 ? result.tempFilePath || '' : ''),
        fail: () => resolve('')
      }))
    }
    if (!filePath) {
      this.copyExportLink(data)
      return
    }
    const shared = await new Promise(resolve => wx.shareFileMessage({
      filePath,
      fileName: data.fileName,
      success: () => resolve(true),
      fail: () => resolve(false)
    }))
    if (!shared) this.copyExportLink(data)
  },

  async exportCurrentBackup(event) {
    if (this.data.backupBusy) return
    const backupId = event && event.currentTarget && event.currentTarget.dataset.id
    if (!backupId) return
    this.pendingExportRequestIds = this.pendingExportRequestIds || {}
    const requestId = this.pendingExportRequestIds[backupId] || `export-${createId()}`
    this.pendingExportRequestIds[backupId] = requestId
    this.setData({ backupBusy: true, backupError: '' })
    const created = await this.callBackupService('createExport', { backupId, requestId })
    if (!created.ok) {
      this.setData({ backupBusy: false, backupError: created.message || '生成导出文件失败，请重试' })
      return
    }
    const status = await this.callBackupService('exportStatus', { exportId: created.data.exportId })
    if (!status.ok) {
      this.setData({ backupBusy: false, backupError: status.message || '读取导出文件失败，请重试' })
      return
    }
    delete this.pendingExportRequestIds[backupId]
    this.setData({ backupBusy: false })
    await this.deliverExport(status.data)
  },

  async deleteCurrentBackup(event) {
    if (this.data.backupBusy) return
    const backupId = event && event.currentTarget && event.currentTarget.dataset.id
    if (!backupId) return
    const confirmed = await new Promise(resolve => wx.showModal({
      title: '删除这个备份？',
      content: '删除后不能再用这个版本恢复。',
      confirmText: '删除',
      confirmColor: '#9a4d42',
      success: ({ confirm }) => resolve(confirm === true),
      fail: () => resolve(false)
    }))
    if (!confirmed) return
    this.setData({ backupBusy: true, backupError: '' })
    const result = await this.callBackupService('deleteBackup', { backupId })
    if (!result.ok) {
      this.setData({ backupBusy: false, backupError: result.message || '删除备份失败，请重试' })
      return
    }
    this.setData({ backupBusy: false, backups: this.data.backups.filter(item => item.backupId !== backupId) })
    wx.showToast({ title: '备份已删除', icon: 'success' })
  },

  showFamilyStart() {
    this.setData({ familyPanelMode: this.data.familyMode ? 'manage' : 'start', invitePreview: null })
  },

  showCreateFamily() {
    this.setData({ familyPanelMode: 'create', invitePreview: null })
  },

  showJoinFamily() {
    this.setData({ familyPanelMode: 'join' })
    if (this.data.familyForm.code.length === 8) this.previewInviteCode()
  },

  showFamilyActivity() {
    this.setData({ familyPanelMode: 'activity' })
  },

  onFamilyNameInput(event) {
    this.setData({ 'familyForm.name': event.detail.value })
  },

  onFamilyNicknameInput(event) {
    this.setData({ 'familyForm.nickname': event.detail.value })
  },

  onFamilyCodeInput(event) {
    this.setData({ 'familyForm.code': event.detail.value.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 8), invitePreview: null })
  },

  onFamilyRenameInput(event) {
    this.setData({ familyRename: event.detail.value })
  },

  async previewPendingInvite() {
    this.setData({ showFamilySheet: true, familyPanelMode: 'join', 'familyForm.code': this.pendingInviteCode })
    await this.previewInviteCode()
  },

  async previewInviteCode() {
    const code = this.data.familyForm.code.trim()
    if (code.length !== 8) return
    const result = await callFamily(wx, 'previewInvite', { code })
    if (result.ok) this.setData({ invitePreview: result.data })
    else {
      this.setData({ invitePreview: null })
      wx.showToast({ title: result.message || '邀请已经不可用', icon: 'none' })
    }
  },

  async submitCreateFamily() {
    const name = this.data.familyForm.name.trim()
    const nickname = this.data.familyForm.nickname.trim()
    if (!name || !nickname) {
      wx.showToast({ title: '请填写家庭名称和家庭称呼', icon: 'none' })
      return
    }
    const result = await this.runFamilyAction('createFamily', { name, nickname })
    if (!result.ok) return
    this.setData({ showFamilySheet: false })
    this.prepareMigration()
    wx.showToast({ title: '家庭已经创建', icon: 'success' })
  },

  async submitJoinFamily() {
    const code = this.data.familyForm.code.trim()
    const nickname = this.data.familyForm.nickname.trim()
    if (code.length !== 8 || !nickname) {
      wx.showToast({ title: '请填写家庭称呼和完整邀请码', icon: 'none' })
      return
    }
    const result = await this.runFamilyAction('joinFamily', { code, nickname })
    if (!result.ok) return
    this.pendingInviteCode = ''
    this.setData({ showFamilySheet: false, invitePreview: null })
    this.prepareMigration()
    wx.showToast({ title: '已经加入家庭', icon: 'success' })
  },

  prepareMigration() {
    const state = this.getStoredState()
    let magnets = []
    try {
      magnets = normalizeMagnets(wx.getStorageSync(DOOR_KEY))
    } catch (error) {}
    const recordCount = (state && state.foods.length || 0) + (state && state.history.length || 0) + (state && state.purchases.length || 0)
    const doorNoteCount = magnets.filter(item => !['photo', 'album'].includes(item.type)).length
    const doorPhotoCount = magnets.filter(item => ['photo', 'album'].includes(item.type)).length
    this.localMigrationSource = { state, magnets }
    this.migrationRequestId = ''
    this.uploadedMigrationMagnets = null
    this.setData({
      showMigrationSheet: recordCount + doorNoteCount + doorPhotoCount > 0,
      migrationDraft: {
        includeRecords: recordCount > 0,
        includeDoorNotes: false,
        includeDoorPhotos: false,
        recordCount,
        doorNoteCount,
        doorPhotoCount
      }
    })
  },

  toggleMigrationOption(event) {
    if (this.data.migrationBusy) return
    const key = event.currentTarget.dataset.key
    if (!['includeRecords', 'includeDoorNotes', 'includeDoorPhotos'].includes(key)) return
    if (this.uploadedMigrationMagnets) {
      this.removeSavedPhotos(this.uploadedMigrationMagnets.flatMap(item => item.type === 'album' ? item.photos || [] : item.type === 'photo' ? [item.content] : []))
      this.uploadedMigrationMagnets = null
      this.migrationRequestId = ''
    }
    this.setData({ [`migrationDraft.${key}`]: !this.data.migrationDraft[key] })
  },

  skipMigration() {
    if (this.data.migrationBusy) return
    if (this.uploadedMigrationMagnets) this.removeSavedPhotos(this.uploadedMigrationMagnets.flatMap(item => item.type === 'album' ? item.photos || [] : item.type === 'photo' ? [item.content] : []))
    this.localMigrationSource = null
    this.migrationRequestId = ''
    this.uploadedMigrationMagnets = null
    this.setData({ showMigrationSheet: false })
  },

  backupLocalData(source) {
    try {
      wx.setStorageSync(`${FAMILY_BACKUP_PREFIX}${Date.now()}`, { ...source, createdAt: Date.now() })
      return true
    } catch (error) {
      wx.showToast({ title: '本机备份失败，已停止复制', icon: 'none' })
      return false
    }
  },

  uploadFamilyFile(filePath) {
    if (typeof filePath === 'string' && filePath.startsWith('cloud://')) return Promise.resolve(filePath)
    return new Promise((resolve, reject) => {
      if (!this.data.family || !this.data.familyMember || !wx.cloud || typeof wx.cloud.uploadFile !== 'function') {
        reject(new Error('cloud-upload-unavailable'))
        return
      }
      const extensionMatch = String(filePath || '').match(/\.([a-zA-Z0-9]+)(?:\?|$)/)
      const extension = extensionMatch ? extensionMatch[1].toLowerCase().slice(0, 5) : 'jpg'
      const cloudPath = `families/${this.data.family.familyId}/${this.data.familyMember.memberId}/${createId().replace(/[^0-9-]/g, '')}.${extension}`
      wx.cloud.uploadFile({
        cloudPath,
        filePath,
        success: ({ fileID }) => fileID ? resolve(fileID) : reject(new Error('empty-file-id')),
        fail: reject
      })
    })
  },

  async uploadMigrationMagnets(magnets) {
    const uploaded = []
    for (const magnet of magnets) {
      if (magnet.type === 'photo') {
        const content = await this.uploadFamilyFile(magnet.content)
        uploaded.push({ ...magnet, content })
      } else if (magnet.type === 'album') {
        const photos = []
        for (const filePath of magnet.photos || []) photos.push(await this.uploadFamilyFile(filePath))
        uploaded.push({ ...magnet, content: photos[0], photos })
      } else uploaded.push(magnet)
    }
    return uploaded
  },

  async copyLocalDataToFamily() {
    if (this.data.migrationBusy || !this.localMigrationSource || !this.data.familyMode) return
    const selection = buildMigrationSelection({
      ...this.localMigrationSource,
      includeRecords: this.data.migrationDraft.includeRecords,
      includeDoorNotes: this.data.migrationDraft.includeDoorNotes,
      includeDoorPhotos: this.data.migrationDraft.includeDoorPhotos
    })
    if (!selection.foods.length && !selection.history.length && !selection.purchases.length && !selection.magnets.length) {
      this.skipMigration()
      return
    }
    if (!this.backupLocalData(this.localMigrationSource)) return
    this.setData({ migrationBusy: true })
    wx.showLoading({ title: '正在复制本机数据' })
    try {
      const magnets = this.uploadedMigrationMagnets || await this.uploadMigrationMagnets(selection.magnets)
      this.uploadedMigrationMagnets = magnets
      this.migrationRequestId = this.migrationRequestId || `migration-${createId()}`
      const begin = await callFamily(wx, 'beginMigration', {
        requestId: this.migrationRequestId,
        expected: { foods: selection.foods.length, history: selection.history.length, purchases: selection.purchases.length, door: magnets.length },
        expectedDoorRevision: this.familyDoorRevision
      })
      if (!begin.ok) throw new Error(begin.message || '无法开始复制')
      const migrationId = begin.data.migrationId
      for (const type of ['purchases', 'foods', 'history']) {
        for (const items of splitIntoChunks(selection[type], 15)) {
          const imported = await callFamily(wx, 'importMigrationBatch', { migrationId, type, items })
          if (!imported.ok) throw new Error(imported.message || '复制中断')
        }
      }
      if (magnets.length) {
        const importedDoor = await callFamily(wx, 'importMigrationBatch', { migrationId, type: 'door', items: magnets })
        if (!importedDoor.ok) throw new Error(importedDoor.message || '门板复制中断')
      }
      const finished = await callFamily(wx, 'finishMigration', { requestId: `finish-${this.migrationRequestId}`, migrationId })
      if (!finished.ok) throw new Error(finished.message || '复制未完成')
      this.localMigrationSource = null
      this.migrationRequestId = ''
      this.uploadedMigrationMagnets = null
      this.setData({ showMigrationSheet: false, migrationBusy: false })
      await this.refreshFamily(true)
      wx.showToast({ title: '本机数据已复制', icon: 'success' })
    } catch (error) {
      this.setData({ migrationBusy: false })
      wx.showToast({ title: String(error && error.message || '复制中断，请重试'), icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  async createFamilyInvite() {
    const result = await this.runFamilyAction('createInvite', { targetText: '生成了家庭邀请' })
    if (result.ok) this.setData({ familyInvite: result.data, familyPanelMode: 'invite' })
  },

  async revokeFamilyInvite() {
    const invite = this.data.familyInvite
    if (!invite) return
    const result = await this.runFamilyAction('revokeInvite', { code: invite.code, targetText: '作废了家庭邀请' })
    if (result.ok) {
      this.setData({ familyInvite: null, familyPanelMode: 'manage' })
      wx.showToast({ title: '邀请已作废', icon: 'none' })
    }
  },

  async saveFamilyName() {
    const name = this.data.familyRename.trim()
    if (!name || name === this.data.family.name) return
    const result = await this.runFamilyAction('renameFamily', { name, targetText: `将家庭改名为“${name}”` })
    if (result.ok) wx.showToast({ title: '家庭名称已修改', icon: 'success' })
  },

  removeFamilyMember(event) {
    const memberId = event.currentTarget.dataset.id
    const member = this.data.familyMembers.find(item => item.memberId === memberId)
    if (!member) return
    wx.showModal({
      title: `移除${member.nickname}？`,
      content: '移除后，对方会立即失去家庭冰箱访问权限。',
      confirmText: '移除',
      confirmColor: '#9a4d42',
      success: async ({ confirm }) => {
        if (!confirm) return
        const result = await this.runFamilyAction('removeMember', { memberId, targetText: `移除了${member.nickname}` })
        if (result.ok) wx.showToast({ title: '成员已移除', icon: 'none' })
      }
    })
  },

  transferFamilyAdmin(event) {
    const memberId = event.currentTarget.dataset.id
    const member = this.data.familyMembers.find(item => item.memberId === memberId)
    if (!member) return
    wx.showModal({
      title: `转让给${member.nickname}？`,
      content: '转让后，你会成为普通成员。',
      confirmText: '确认转让',
      success: async ({ confirm }) => {
        if (!confirm) return
        const result = await this.runFamilyAction('transferAdmin', { memberId, targetText: `将管理员转让给${member.nickname}` })
        if (result.ok) wx.showToast({ title: '管理员已转让', icon: 'none' })
      }
    })
  },

  leaveCurrentFamily() {
    wx.showModal({
      title: '退出这个家庭？',
      content: '退出后会回到本机个人冰箱，家庭数据不会被删除。',
      confirmText: '退出家庭',
      confirmColor: '#9a4d42',
      success: async ({ confirm }) => {
        if (!confirm) return
        const result = await this.runFamilyAction('leaveFamily', { targetText: `${this.data.familyMember.nickname}退出了家庭` })
        if (result.ok) {
          this.clearFamilyCache()
          this.setData({ showFamilySheet: false })
          this.resetToPersonal(true)
        }
      }
    })
  },

  dissolveCurrentFamily() {
    wx.showModal({
      title: '解散这个家庭？',
      content: '所有成员会立即失去访问权限，此操作无法撤销。',
      confirmText: '解散家庭',
      confirmColor: '#9a4d42',
      success: async ({ confirm }) => {
        if (!confirm) return
        const result = await this.runFamilyAction('dissolveFamily', { targetText: '解散了家庭' })
        if (result.ok) {
          this.clearFamilyCache()
          this.setData({ showFamilySheet: false })
          this.resetToPersonal(true)
        }
      }
    })
  },

  async deleteMyData() {
    if (this.data.familyMode) {
      const admin = this.data.familyMember && this.data.familyMember.role === 'admin'
      wx.showModal({
        title: '请先处理家庭关系',
        content: admin ? '请先转让管理员或解散家庭，再删除你的个人数据。' : '请先退出家庭，再删除你的个人数据。',
        showCancel: false
      })
      return
    }
    const confirmed = await new Promise(resolve => wx.showModal({
      title: '删除我的数据？',
      content: '将删除本机库存、记录、设置、备份和照片，以及云端提醒、分类纠错与 AI/OCR 限额标识。此操作无法恢复。',
      confirmText: '确认删除',
      confirmColor: '#9a4d42',
      success: ({ confirm }) => resolve(confirm === true),
      fail: () => resolve(false)
    }))
    if (!confirmed) return

    wx.showLoading({ title: '正在删除数据' })
    try {
      const removeCloudData = name => new Promise(resolve => {
        wx.cloud.callFunction({
          name,
          data: { action: 'deleteMyData' },
          success: ({ result }) => resolve(result),
          fail: () => resolve({ ok: false })
        })
      })
      const results = await Promise.all(['reminders', 'receiptOcr', 'mealAi', 'dataLifecycle'].map(removeCloudData))
      if (results.some(result => !result || result.ok !== true)) throw new Error('cloud-delete-failed')

      const keys = typeof wx.getStorageInfoSync === 'function' ? wx.getStorageInfoSync().keys || [] : []
      const exactKeys = new Set([STORAGE_KEY, HISTORY_KEY, STATE_KEY, DOOR_KEY, AI_FEEDBACK_KEY, FAMILY_SESSION_KEY])
      const removableKeys = keys.filter(key => exactKeys.has(key) || key.startsWith(FAMILY_BACKUP_PREFIX) || key.startsWith('virtual-fridge-family-cache:'))
      const magnets = [...(this.storedMagnets || [])]
      for (const key of removableKeys) {
        if (key.startsWith(FAMILY_BACKUP_PREFIX)) {
          const backup = wx.getStorageSync(key)
          if (backup && Array.isArray(backup.magnets)) magnets.push(...backup.magnets)
        }
      }
      const files = magnets.flatMap(item => item && item.type === 'album' ? item.photos || [] : item && item.type === 'photo' ? [item.content] : [])
        .filter(filePath => typeof filePath === 'string' && !filePath.startsWith('cloud://'))
      this.removeSavedPhotos([...new Set(files)])
      removableKeys.forEach(key => wx.removeStorageSync(key))

      this.storedMagnets = []
      this.familySnapshot = null
      this.familyDoorRevision = 0
      this.setData({
        showFamilySheet: false,
        magnets: [],
        hasDoorMemories: false,
        familyMode: false,
        family: null,
        familyMember: null,
        familyMembers: [],
        familyActivity: []
      })
      this.renderFoods([])
      this.renderHistory([], 0)
      this.renderPurchases([], [])
      this.renderReminderSettings(defaultReminderSettings)
      this.renderDisplaySettings(defaultDisplaySettings)
      this.renderDiet([], defaultDietSettings)
      wx.showToast({ title: '你的数据已删除', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: '删除未完成，请重试', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  loadDoor() {
    let stored
    try {
      stored = wx.getStorageSync(DOOR_KEY)
    } catch (error) {
      wx.showToast({ title: '冰箱门读取失败，请重试', icon: 'none' })
      return
    }
    this.storedMagnets = normalizeMagnets(stored)
    this.magnetZ = this.storedMagnets.reduce((max, magnet) => Math.max(max, magnet.z), 0)
    this.hydrateDoorMagnets()
  },

  measureDoor() {
    if (this.data.surface !== 'door') return
    this.createSelectorQuery().select('#magnet-area').boundingClientRect((bounds) => {
      if (!bounds || !bounds.width || !bounds.height) return
      this.doorBounds = bounds
      const repaired = repairMagnetLayout(this.storedMagnets || [], bounds, getRpxScale())
      if (!repaired) {
        if (!this.layoutOverflowNotified) {
          this.layoutOverflowNotified = true
          wx.showToast({ title: '门上已有内容过密，请先取下一枚冰箱贴', icon: 'none' })
        }
      } else {
        this.layoutOverflowNotified = false
        const changed = repaired.some((magnet, index) => {
          const original = this.storedMagnets[index]
          return !original || magnet.xRatio !== original.xRatio || magnet.yRatio !== original.yRatio
        })
        if (changed) {
          if (this.data.familyMode) {
            this.storedMagnets = repaired
            this.hydrateDoorMagnets()
            return
          }
          this.saveDoorMagnets(repaired)
          return
        }
      }
      this.hydrateDoorMagnets()
    }).exec()
  },

  hydrateDoorMagnets() {
    const storedMagnets = this.storedMagnets || []
    const readyToDrag = (magnet) => ({ ...magnet, isDragging: false, dragBlocked: false })
    if (!this.doorBounds) {
      this.setData({
        magnets: storedMagnets.map((magnet) => readyToDrag({ ...magnet, x: 0, y: 0 })),
        hasDoorMemories: storedMagnets.some((magnet) => ['note', 'photo', 'album'].includes(magnet.type))
      })
      return
    }
    const rpxScale = getRpxScale()
    this.setData({
      magnets: storedMagnets.map((magnet) => readyToDrag(toViewPosition(magnet, this.doorBounds, rpxScale))),
      hasDoorMemories: storedMagnets.some((magnet) => ['note', 'photo', 'album'].includes(magnet.type))
    })
  },

  saveDoorMagnets(magnets) {
    const storedMagnets = normalizeMagnets(magnets.map(({ x, y, isDragging, dragBlocked, ...magnet }) => magnet))
    try {
      wx.setStorageSync(DOOR_KEY, storedMagnets)
      this.storedMagnets = storedMagnets
      this.hydrateDoorMagnets()
      return true
    } catch (error) {
      wx.showToast({ title: '冰箱贴保存失败，请重试', icon: 'none' })
      return false
    }
  },

  persistDoorChange(magnets, targetText, onSuccess, onFailure) {
    const storedMagnets = normalizeMagnets(magnets.map(({ x, y, isDragging, dragBlocked, ...magnet }) => magnet))
    if (!this.data.familyMode) {
      if (!this.saveDoorMagnets(storedMagnets)) return false
      if (onSuccess) onSuccess()
      return true
    }
    const cloudMagnets = storedMagnets.map(magnet => {
      if (magnet.type === 'photo' && magnet.cloudFileID) return { ...magnet, content: magnet.cloudFileID, cloudFileID: undefined }
      if (magnet.type === 'album' && Array.isArray(magnet.photoFileIDs)) return { ...magnet, content: magnet.photoFileIDs[0], photos: magnet.photoFileIDs, photoFileIDs: undefined }
      return magnet
    })
    this.runFamilyAction('saveDoor', {
      magnets: cloudMagnets,
      expectedRevision: this.familyDoorRevision,
      targetText
    }).then(result => {
      if (result.ok && onSuccess) onSuccess()
      if (!result.ok && onFailure) onFailure()
    })
    return true
  },

  openInventory() {
    if (this.data.doorOpening) return
    if (this.data.elderMode || this.data.reduceMotion) {
      this.setData({ surface: 'inventory', doorOpening: false })
      return
    }
    this.setData({ doorOpening: true })
    this.openDoorTimer = setTimeout(() => {
      this.setData({ surface: 'inventory', doorOpening: false })
    }, 450)
  },

  showDoor() {
    if (this.data.doorClosing) return
    if (this.data.elderMode || this.data.reduceMotion) {
      this.setData({ surface: 'door', doorClosing: false })
      return
    }
    this.setData({ doorClosing: true })
    this.closeDoorTimer = setTimeout(() => {
      this.setData({ surface: 'door', doorClosing: false }, () => this.measureDoor())
    }, 450)
  },

  onDoorTouchStart(event) {
    const touch = event.touches && event.touches[0]
    this.doorTouchStartX = touch ? touch.clientX : null
  },

  onDoorTouchEnd(event) {
    const touch = event.changedTouches && event.changedTouches[0]
    if (touch && Number.isFinite(this.doorTouchStartX) && this.doorTouchStartX - touch.clientX > 24) this.openInventory()
    this.doorTouchStartX = null
  },

  onCloseDoorTouchStart(event) {
    const touch = event.touches && event.touches[0]
    this.closeDoorTouchStartX = touch ? touch.clientX : null
  },

  onCloseDoorTouchEnd(event) {
    const touch = event.changedTouches && event.changedTouches[0]
    if (touch && Number.isFinite(this.closeDoorTouchStartX) && touch.clientX - this.closeDoorTouchStartX > 24) this.showDoor()
    this.closeDoorTouchStartX = null
  },

  openNoteComposer() {
    this.setData({
      showMagnetSheet: true,
      magnetSheetMode: 'note',
      editingMagnetId: '',
      editingMagnet: null,
      magnetForm: emptyMagnetForm()
    })
  },

  openStickerPicker() {
    this.setData({
      showMagnetSheet: true,
      magnetSheetMode: 'sticker',
      editingMagnetId: '',
      editingMagnet: null,
      magnetForm: emptyMagnetForm()
    })
  },

  openDiySticker() {
    this.setData({
      showMagnetSheet: true,
      magnetSheetMode: 'diy',
      editingMagnetId: '',
      editingMagnet: null,
      magnetForm: emptyMagnetForm()
    })
  },

  openPhotoPicker() {
    this.setData({
      showMagnetSheet: true,
      magnetSheetMode: 'photo-choice',
      editingMagnetId: '',
      editingMagnet: null,
      albumDraftPhotos: [],
      magnetForm: emptyMagnetForm()
    })
  },

  closeMagnetSheet() {
    this.pendingAlbumTempPaths = []
    this.setData({
      showMagnetSheet: false,
      editingMagnetId: '',
      editingMagnet: null,
      albumDraftPhotos: [],
      magnetForm: emptyMagnetForm()
    })
  },

  onMagnetTextInput(event) {
    this.setData({ 'magnetForm.text': event.detail.value })
  },

  onDiyTextInput(event) {
    this.setData({ 'magnetForm.diyText': event.detail.value })
  },

  onAlbumTitleInput(event) {
    this.setData({ 'magnetForm.albumTitle': event.detail.value })
  },

  chooseDiyShape(event) {
    this.setData({ 'magnetForm.diyShape': event.currentTarget.dataset.value })
  },

  chooseDiyColor(event) {
    this.setData({ 'magnetForm.diyColor': event.currentTarget.dataset.value })
  },

  createMagnet(type, content, extras = {}) {
    this.magnetZ = (this.magnetZ || 0) + 1
    return {
      id: createId(),
      type,
      content,
      xRatio: 0,
      yRatio: 0,
      ...extras,
      z: this.magnetZ
    }
  },

  placeDoorMagnet(magnet, targetText, onSuccess, onFailure) {
    if (!this.doorBounds) {
      wx.showToast({ title: '冰箱门还没准备好，请稍后再试', icon: 'none' })
      this.measureDoor()
      return false
    }
    const rpxScale = getRpxScale()
    const anchor = nextMagnetPosition((this.storedMagnets || []).length)
    const preferred = toViewPosition({ ...magnet, ...anchor }, this.doorBounds, rpxScale)
    const position = findAvailablePosition(magnet, preferred, this.storedMagnets || [], this.doorBounds, rpxScale)
    if (!position) {
      wx.showModal({
        title: '冰箱门放不下了',
        content: '请先拖动整理，或取下一枚便签、照片或贴纸后再添加。',
        showCancel: false,
        confirmText: '知道了'
      })
      return false
    }
    const placed = toStoredPosition(magnet, position, this.doorBounds, rpxScale)
    return this.persistDoorChange([...(this.storedMagnets || []), placed], targetText, onSuccess, onFailure)
  },

  openElderStock() {
    this.setData({ activeView: 'stock' })
    this.openInventory()
  },

  openElderHistory() {
    this.setData({ activeView: 'history' })
    this.openInventory()
  },

  openElderAdd() {
    this.setData({ surface: 'inventory', activeView: 'stock' }, () => this.openAdd())
  },

  openElderReceipt() {
    this.setData({ activeView: 'receipt' })
    this.openInventory()
  },

  openElderMeal() {
    this.setData({ activeView: 'meal' })
    this.openInventory()
  },

  saveNoteMagnet() {
    const content = this.data.magnetForm.text.trim()
    if (!content) {
      wx.showToast({ title: '请写下便签内容', icon: 'none' })
      return
    }
    const isEditing = Boolean(this.data.editingMagnetId)
    const finished = () => {
      this.closeMagnetSheet()
      wx.showToast({ title: isEditing ? '便签已更新' : '便签已贴好', icon: 'success' })
    }
    if (isEditing) {
      const magnets = this.storedMagnets.map((magnet) => magnet.id === this.data.editingMagnetId ? { ...magnet, content } : magnet)
      if (!this.persistDoorChange(magnets, isEditing ? `修改了便签“${content.slice(0, 12)}”` : '', finished)) return
    } else if (!this.placeDoorMagnet(this.createMagnet('note', content), `添加了便签“${content.slice(0, 12)}”`, finished)) return
  },

  chooseSticker(event) {
    const content = event.currentTarget.dataset.value
    const finished = () => {
      this.closeMagnetSheet()
      wx.showToast({ title: '贴纸已放好', icon: 'success' })
    }
    if (this.data.editingMagnetId) {
      const magnets = this.storedMagnets.map((magnet) => magnet.id === this.data.editingMagnetId ? { ...magnet, content } : magnet)
      if (!this.persistDoorChange(magnets, '更换了装饰贴纸', finished)) return
    } else if (!this.placeDoorMagnet(this.createMagnet('sticker', content), '添加了装饰贴纸', finished)) return
  },

  saveDiySticker() {
    const diyText = this.data.magnetForm.diyText.trim()
    if (!diyText) {
      wx.showToast({ title: '请写下贴纸文字', icon: 'none' })
      return
    }
    const extras = {
      diyText,
      diyShape: this.data.magnetForm.diyShape,
      diyColor: this.data.magnetForm.diyColor
    }
    const isEditing = Boolean(this.data.editingMagnetId)
    const finished = () => {
      this.closeMagnetSheet()
      wx.showToast({ title: isEditing ? 'DIY贴纸已更新' : 'DIY贴纸已放好', icon: 'success' })
    }
    if (isEditing) {
      const magnets = this.storedMagnets.map((magnet) => magnet.id === this.data.editingMagnetId
        ? { ...magnet, content: 'diy', ...extras }
        : magnet)
      if (!this.persistDoorChange(magnets, `修改了文字贴纸“${diyText}”`, finished)) return
    } else if (!this.placeDoorMagnet(this.createMagnet('sticker', 'diy', extras), `添加了文字贴纸“${diyText}”`, finished)) return
  },

  replacePhotoMagnet() {
    this.choosePhoto(this.data.editingMagnetId)
  },

  choosePhoto(input = '') {
    const replacingId = typeof input === 'string' ? input : ''
    if (this.data.mediaSaving) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: ({ tempFiles }) => {
        const tempFilePath = tempFiles && tempFiles[0] && tempFiles[0].tempFilePath
        if (!tempFilePath) return
        this.saveMediaFiles([tempFilePath], (savedPaths) => this.commitPhotoMagnet(savedPaths[0], replacingId))
      }
    })
  },

  chooseAlbumPhotos() {
    if (this.data.mediaSaving) return
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: ({ tempFiles }) => {
        const tempPaths = (tempFiles || []).map(item => item.tempFilePath).filter(Boolean)
        if (tempPaths.length < 2) {
          wx.showToast({ title: '照片集至少需要两张照片', icon: 'none' })
          return
        }
        this.pendingAlbumTempPaths = tempPaths
        this.setData({
          magnetSheetMode: 'album-create',
          albumDraftPhotos: tempPaths,
          'magnetForm.albumTitle': '旅行回忆'
        })
      }
    })
  },

  saveMediaFiles(tempPaths, onSuccess) {
    if (this.data.mediaSaving) return
    const savedPaths = []
    this.setData({ mediaSaving: true })
    wx.showLoading({ title: '正在保存' })
    const finish = (error) => {
      wx.hideLoading()
      this.setData({ mediaSaving: false })
      if (error) {
        this.removeSavedPhotos(savedPaths)
        wx.showToast({ title: '照片保存失败，请重试', icon: 'none' })
        return
      }
      onSuccess(savedPaths)
    }
    const saveNext = (index) => {
      if (index >= tempPaths.length) {
        finish()
        return
      }
      if (this.data.familyMode) {
        this.uploadFamilyFile(tempPaths[index])
          .then(fileID => {
            savedPaths.push(fileID)
            saveNext(index + 1)
          })
          .catch(() => finish(true))
      } else {
        wx.saveFile({
          tempFilePath: tempPaths[index],
          success: ({ savedFilePath }) => {
            savedPaths.push(savedFilePath)
            saveNext(index + 1)
          },
          fail: () => finish(true)
        })
      }
    }
    saveNext(0)
  },

  saveAlbumMagnet() {
    const title = this.data.magnetForm.albumTitle.trim() || '照片集'
    if (this.data.editingMagnetId) {
      const magnets = this.storedMagnets.map((magnet) => magnet.id === this.data.editingMagnetId ? { ...magnet, title } : magnet)
      if (!this.persistDoorChange(magnets, `修改了照片集“${title}”`, () => {
        this.closeMagnetSheet()
        wx.showToast({ title: '照片集已更新', icon: 'success' })
      })) return
      return
    }
    const tempPaths = this.pendingAlbumTempPaths || []
    if (tempPaths.length < 2) {
      wx.showToast({ title: '请先选择至少两张照片', icon: 'none' })
      return
    }
    this.saveMediaFiles(tempPaths, (savedPaths) => this.commitAlbumMagnet(savedPaths, title))
  },

  commitAlbumMagnet(savedPaths, title) {
    const magnet = this.createMagnet('album', savedPaths[0], { photos: savedPaths, title })
    if (!this.placeDoorMagnet(magnet, `添加了照片集“${title}”`, () => {
      this.closeMagnetSheet()
      wx.showToast({ title: '照片集已贴好', icon: 'success' })
    }, () => this.removeSavedPhotos(savedPaths))) {
      this.removeSavedPhotos(savedPaths)
      return
    }
  },

  commitPhotoMagnet(savedFilePath, replacingId) {
    const replaced = replacingId ? this.storedMagnets.find((magnet) => magnet.id === replacingId) : null
    const finished = () => {
      if (replaced && replaced.content !== savedFilePath) this.removeSavedPhoto(replaced.content)
      this.closeMagnetSheet()
      wx.showToast({ title: replacingId ? '照片已更换' : '照片已贴好', icon: 'success' })
    }
    if (replacingId) {
      const magnets = this.storedMagnets.map((magnet) => magnet.id === replacingId ? { ...magnet, content: savedFilePath } : magnet)
      if (!this.persistDoorChange(magnets, '更换了一张门板照片', finished, () => this.removeSavedPhoto(savedFilePath))) {
        this.removeSavedPhoto(savedFilePath)
        return
      }
    } else if (!this.placeDoorMagnet(this.createMagnet('photo', savedFilePath), '添加了一张门板照片', finished, () => this.removeSavedPhoto(savedFilePath))) {
      this.removeSavedPhoto(savedFilePath)
      return
    }
  },

  removeSavedPhoto(filePath) {
    if (!filePath) return
    if (filePath.startsWith('cloud://') && wx.cloud && typeof wx.cloud.deleteFile === 'function') {
      wx.cloud.deleteFile({ fileList: [filePath], fail: () => {} })
      return
    }
    if (typeof wx.removeSavedFile !== 'function') return
    wx.removeSavedFile({ filePath, fail: () => {} })
  },

  removeSavedPhotos(filePaths) {
    (filePaths || []).forEach(filePath => this.removeSavedPhoto(filePath))
  },

  onMagnetTouchStart(event) {
    const { id } = event.currentTarget.dataset
    const touch = event.touches && event.touches[0]
    const index = this.data.magnets.findIndex((magnet) => magnet.id === id)
    const viewMagnet = this.data.magnets[index]
    if (!viewMagnet || !touch) return
    this.pendingMagnetPositions = this.pendingMagnetPositions || {}
    this.pendingMagnetAvailability = this.pendingMagnetAvailability || {}
    this.pendingMagnetPositions[id] = null
    this.pendingMagnetAvailability[id] = true
    this.activeMagnetDrag = {
      id,
      index,
      x: viewMagnet.x,
      y: viewMagnet.y,
      clientX: touch.clientX,
      clientY: touch.clientY
    }
    this.setData({
      [`magnets[${index}].isDragging`]: true,
      [`magnets[${index}].dragBlocked`]: false
    })
  },

  onMagnetTouchMove(event) {
    const { id } = event.currentTarget.dataset
    const touch = event.touches && event.touches[0]
    if (!touch) return
    this.renderMagnetDrag(id, touch)
  },

  renderMagnetDrag(id, touch) {
    const drag = this.activeMagnetDrag
    if (!drag || drag.id !== id || !this.doorBounds) return
    const magnet = this.storedMagnets.find(item => item.id === id)
    if (!magnet) return
    const deltaX = touch.clientX - drag.clientX
    const deltaY = touch.clientY - drag.clientY
    if (Math.abs(deltaX) < 4 && Math.abs(deltaY) < 4) return
    const size = getMagnetSize(magnet.type, getRpxScale())
    const position = {
      x: Math.max(0, Math.min(this.doorBounds.width - size.width, drag.x + deltaX)),
      y: Math.max(0, Math.min(this.doorBounds.height - size.height, drag.y + deltaY))
    }
    const available = isPositionAvailable(magnet, position, this.storedMagnets, this.doorBounds, getRpxScale())
    this.pendingMagnetPositions = this.pendingMagnetPositions || {}
    this.pendingMagnetPositions[id] = position
    this.pendingMagnetAvailability = this.pendingMagnetAvailability || {}
    this.pendingMagnetAvailability[id] = available
    this.setData({
      [`magnets[${drag.index}].x`]: position.x,
      [`magnets[${drag.index}].y`]: position.y,
      [`magnets[${drag.index}].dragBlocked`]: !available
    })
  },

  onMagnetTouchEnd(event) {
    const { id } = event.currentTarget.dataset
    const touch = event.changedTouches && event.changedTouches[0]
    const drag = this.activeMagnetDrag
    if (!drag || drag.id !== id) return
    if (touch) this.renderMagnetDrag(id, touch)
    const position = this.pendingMagnetPositions && this.pendingMagnetPositions[id]
    this.activeMagnetDrag = null
    if (!position || !this.doorBounds) {
      this.setData({
        [`magnets[${drag.index}].isDragging`]: false,
        [`magnets[${drag.index}].dragBlocked`]: false
      })
      return
    }
    const rpxScale = getRpxScale()
    const movingMagnet = this.storedMagnets.find(magnet => magnet.id === id)
    const isAvailable = movingMagnet && this.pendingMagnetAvailability && this.pendingMagnetAvailability[id]
    delete this.pendingMagnetPositions[id]
    delete this.pendingMagnetAvailability[id]
    if (!isAvailable) {
      this.skipMagnetTap = id
      setTimeout(() => {
        if (this.skipMagnetTap === id) this.skipMagnetTap = ''
      }, 120)
      if (this.data.familyMode) this.hydrateDoorMagnets()
      else this.saveDoorMagnets(this.storedMagnets)
      wx.showToast({ title: '不能放在这里，已回到原位', icon: 'none' })
      return
    }
    this.magnetZ = (this.magnetZ || 0) + 1
    const magnets = this.storedMagnets.map((magnet) => magnet.id === id
      ? toStoredPosition({ ...magnet, z: this.magnetZ }, position, this.doorBounds, rpxScale)
      : magnet)
    this.skipMagnetTap = id
    setTimeout(() => {
      if (this.skipMagnetTap === id) this.skipMagnetTap = ''
    }, 120)
    this.persistDoorChange(magnets, '调整了冰箱贴位置')
  },

  openMagnetEditor(event) {
    const { id } = event.currentTarget.dataset
    if (this.skipMagnetTap === id) return
    const magnet = this.storedMagnets.find((item) => item.id === id)
    if (!magnet) return
    if (magnet.type === 'album') {
      this.openAlbumViewer(magnet)
      return
    }
    this.setData({
      showMagnetSheet: true,
      magnetSheetMode: magnet.type === 'sticker' && magnet.content === 'diy' ? 'diy' : magnet.type,
      editingMagnetId: id,
      editingMagnet: magnet,
      magnetForm: {
        ...emptyMagnetForm(),
        text: magnet.type === 'note' ? magnet.content : '',
        diyText: magnet.diyText || '生活',
        diyShape: magnet.diyShape || 'round',
        diyColor: magnet.diyColor || 'fern'
      }
    })
  },

  openAlbumViewer(album) {
    this.setData({ showAlbumViewer: true, activeAlbum: album, albumPhotoIndex: 0 })
  },

  previewSinglePhoto() {
    const current = this.data.editingMagnet && this.data.editingMagnet.content
    if (current) wx.previewImage({ current, urls: [current] })
  },

  previewAlbumPhoto() {
    const photos = this.data.activeAlbum && this.data.activeAlbum.photos
    const current = photos && photos[this.data.albumPhotoIndex]
    if (current) wx.previewImage({ current, urls: photos })
  },

  closeAlbumViewer() {
    this.setData({ showAlbumViewer: false, activeAlbum: null, albumPhotoIndex: 0 })
  },

  onAlbumSlideChange(event) {
    this.setData({ albumPhotoIndex: event.detail.current })
  },

  manageActiveAlbum() {
    const album = this.data.activeAlbum
    if (!album) return
    this.setData({
      showAlbumViewer: false,
      activeAlbum: null,
      showMagnetSheet: true,
      magnetSheetMode: 'album',
      editingMagnetId: album.id,
      editingMagnet: album,
      magnetForm: { ...emptyMagnetForm(), albumTitle: album.title || '照片集' }
    })
  },

  deleteMagnet() {
    const magnet = this.storedMagnets.find((item) => item.id === this.data.editingMagnetId)
    if (!magnet) return
    wx.showModal({
      title: '取下这枚冰箱贴？',
      content: '删除后无法恢复。',
      confirmText: '取下',
      confirmColor: '#9a4d42',
      success: ({ confirm }) => {
        if (!confirm) return
        const magnets = this.storedMagnets.filter((item) => item.id !== magnet.id)
        if (!this.persistDoorChange(magnets, '取下了一枚冰箱贴', () => {
          if (magnet.type === 'photo') this.removeSavedPhoto(magnet.content)
          if (magnet.type === 'album') this.removeSavedPhotos(magnet.photos)
          this.closeMagnetSheet()
          wx.showToast({ title: '已经取下', icon: 'none' })
        })) return
      }
    })
  },

  loadFoods() {
    const state = this.getStoredState()
    if (state) this.renderFoods(state.foods)
  },

  loadHistory() {
    const state = this.getStoredState()
    if (state) this.renderHistory(state.history, state.historyClearedAt)
  },

  getStoredState() {
    let state
    let needsMigration = false
    try {
      const storedState = wx.getStorageSync(STATE_KEY)
      if (storedState && typeof storedState === 'object') {
        let foods = storedState.foods
        let history = storedState.history
        let purchases = storedState.purchases
        if (!Array.isArray(foods)) {
          const legacyFoods = wx.getStorageSync(STORAGE_KEY)
          foods = Array.isArray(legacyFoods) ? legacyFoods : []
          needsMigration = true
        }
        if (!Array.isArray(history)) {
          const legacyHistory = wx.getStorageSync(HISTORY_KEY)
          history = Array.isArray(legacyHistory) ? legacyHistory : []
          needsMigration = true
        }
        if (!Array.isArray(purchases)) {
          purchases = []
          needsMigration = true
        }
        state = { foods, history, purchases, settings: storedState.settings, dietSettings: storedState.dietSettings, displaySettings: storedState.displaySettings, historyClearedAt: storedState.historyClearedAt }
      } else {
        const foods = wx.getStorageSync(STORAGE_KEY)
        const history = wx.getStorageSync(HISTORY_KEY)
        state = {
          foods: Array.isArray(foods) ? foods : [],
          history: Array.isArray(history) ? history : [],
          purchases: [],
          settings: { ...defaultReminderSettings },
          dietSettings: { ...defaultDietSettings },
          displaySettings: { ...defaultDisplaySettings },
          historyClearedAt: 0
        }
        needsMigration = true
      }
    } catch (error) {
      wx.showToast({ title: '读取数据失败，请重试', icon: 'none' })
      return null
    }

    const repairedFoods = repairIds(state.foods)
    const repairedHistory = repairIds(state.history)
    const normalizedPurchases = normalizePurchases(state.purchases)
    const normalizedFoods = repairedFoods.items.map((food) => normalizeFood(food))
    const normalizedHistory = repairedHistory.items.map((entry) => entry.food
      ? { ...entry, food: normalizeFood(entry.food) }
      : entry).slice(0, MAX_LOCAL_HISTORY)
    const historyWasTrimmed = repairedHistory.items.length > normalizedHistory.length
    const foodFieldsChanged = normalizedFoods.some((food, index) => {
      const original = repairedFoods.items[index]
      return food.zone !== original.zone || food.unit !== original.unit || food.storedAt !== original.storedAt || food.note !== original.note
    })
    const historyFieldsChanged = normalizedHistory.some((entry, index) => entry.food && (
      entry.food.zone !== repairedHistory.items[index].food.zone ||
      entry.food.unit !== repairedHistory.items[index].food.unit ||
      entry.food.storedAt !== repairedHistory.items[index].food.storedAt ||
      entry.food.note !== repairedHistory.items[index].food.note
    ))
    const settings = { ...defaultReminderSettings, ...(state.settings || {}) }
    const dietSettings = normalizeDietSettings(state.dietSettings)
    const displaySettings = { ...defaultDisplaySettings, ...(state.displaySettings || {}) }
    const historyClearedAt = Number.isFinite(state.historyClearedAt) ? state.historyClearedAt : 0
    const settingsChanged = !state.settings || Object.keys(defaultReminderSettings).some((key) => state.settings[key] === undefined)
    const dietSettingsChanged = JSON.stringify(dietSettings) !== JSON.stringify(state.dietSettings)
    const displaySettingsChanged = JSON.stringify(displaySettings) !== JSON.stringify(state.displaySettings)
    const historyClearedAtChanged = historyClearedAt !== state.historyClearedAt
    const purchasesChanged = JSON.stringify(normalizedPurchases) !== JSON.stringify(state.purchases)
    const repairedState = { foods: normalizedFoods, history: normalizedHistory, purchases: normalizedPurchases, settings, dietSettings, displaySettings, historyClearedAt }
    if (!needsMigration && !repairedFoods.changed && !repairedHistory.changed && !historyWasTrimmed && !foodFieldsChanged && !historyFieldsChanged && !purchasesChanged && !settingsChanged && !dietSettingsChanged && !displaySettingsChanged && !historyClearedAtChanged) return state

    try {
      wx.setStorageSync(STATE_KEY, repairedState)
      return repairedState
    } catch (error) {
      wx.showToast({ title: '旧数据升级失败，请重试', icon: 'none' })
      return null
    }
  },

  renderFoods(foods) {
    const selectedFoodIds = new Set(this.data.selectedFoodIds)
    const allFoods = foods
      .filter((food) => food && typeof food.name === 'string' && typeof food.category === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(food.expireDate))
      .map((food) => decorateFood(normalizeFood(food)))
      .map((food) => ({ ...food, batchSelected: selectedFoodIds.has(food.id) }))
      .sort((a, b) => a.expireDate.localeCompare(b.expireDate))
    const visibleFoods = filterFoods(allFoods, {
      query: this.data.query,
      zone: this.data.zoneFilter,
      status: this.data.statusFilter,
      category: this.data.categoryFilter
    })

    this.setData({
      allFoods,
      foods: visibleFoods,
      soonCount: allFoods.filter((food) => food.days >= 0 && food.days <= 3).length
    })
  },

  renderHistory(history, clearedAt = 0) {
    this.setData({
      history: pruneHistory(history, new Date(), clearedAt)
        .filter((entry) => entry && entry.food && typeof entry.food.name === 'string' && typeof entry.food.category === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.food.expireDate) && ['eaten', 'discarded'].includes(entry.outcome) && Number.isFinite(entry.handledAt))
        .map((entry) => ({
          ...entry,
          food: decorateFood(normalizeFood(entry.food)),
          outcomeLabel: entry.outcome === 'discarded' ? '已浪费' : '已吃完',
          outcomeClass: entry.outcome === 'discarded' ? 'discarded' : 'eaten',
          handledDate: formatDate(new Date(entry.handledAt))
        }))
    })
  },

  renderPurchases(purchases, history) {
    const normalized = normalizePurchases(purchases)
      .sort((first, second) => second.createdAt - first.createdAt)
      .map((purchase) => ({
        ...purchase,
        sourceLabel: purchase.source === 'ocr' ? '小票识别' : '手动记录',
        receiptTotalText: moneyText(purchase.receiptTotal),
        selectedTotalText: moneyText(purchase.selectedTotal),
        itemSummary: purchase.items.map((item) => item.name).join('、')
      }))
    const stats = calculateReceiptStats(normalized, history, this.data.receiptMonth)
    this.setData({
      purchases: normalized,
      receiptStats: {
        ...stats,
        monthlyTotalText: moneyText(stats.monthlyTotal),
        wasteAmountText: moneyText(stats.wasteAmount),
        categoryRows: stats.categoryRows.map((row) => ({ ...row, amountText: moneyText(row.amount) }))
      }
    })
  },

  renderReminderSettings(settings) {
    this.setData({ reminderSettings: { ...defaultReminderSettings, ...(settings || {}) } })
  },

  renderDiet(foods, rawSettings) {
    const dietSettings = normalizeDietSettings(rawSettings)
    const selectedLabels = [...dietPreferenceOptions, ...allergenOptions, ...avoidOptions]
      .filter((option) => [...dietSettings.preferences, ...dietSettings.allergens, ...dietSettings.avoids].includes(option.value))
      .map((option) => option.label)
    const { nutritionRows } = localMealView(foods)
    this.setData({
      dietSettings,
      dietSummary: selectedLabels.length ? selectedLabels.join('、') : '未设置饮食限制',
      nutritionRows,
      visibleNutritionRows: this.data.nutritionExpanded ? nutritionRows : nutritionRows.slice(0, 3),
      mealRecommendations: [],
      aiInsightsState: 'idle',
      aiInsightsMessage: '点击智能推荐生成库存菜谱',
      aiRecentMealTitles: [],
      aiInsightId: '',
      aiInsightFeedback: ''
    })
  },

  toggleNutritionExpanded() {
    const nutritionExpanded = !this.data.nutritionExpanded
    this.setData({
      nutritionExpanded,
      visibleNutritionRows: nutritionExpanded ? this.data.nutritionRows : this.data.nutritionRows.slice(0, 3)
    })
  },

  requestMealAi(payload) {
    return new Promise((resolve) => {
      if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') {
        resolve({ ok: false, error: 'cloud-unavailable', message: 'AI 暂时不可用，请稍后重试' })
        return
      }
      let settled = false
      const finish = (result) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(result)
      }
      const timer = setTimeout(() => finish({ ok: false, error: 'client-timeout', message: 'AI 响应超时，请稍后重试' }), 22000)
      try {
        wx.cloud.callFunction({
          name: 'mealAi',
          data: payload,
          success: ({ result }) => finish(result || { ok: false, error: 'empty-result', message: 'AI 返回为空，请稍后重试' }),
          fail: () => finish({ ok: false, error: 'cloud-failed', message: 'AI 暂时不可用，请稍后重试' })
        })
      } catch (error) {
        finish({ ok: false, error: 'cloud-failed', message: 'AI 暂时不可用，请稍后重试' })
      }
    })
  },

  applyAiFailure(message) {
    this.setData({
      aiInsightsBusy: false,
      aiInsightsState: 'fallback',
      aiInsightsMessage: message || 'AI 暂时不可用，请稍后重试',
      aiInsightId: '',
      aiInsightFeedback: ''
    })
  },

  async generateAiInsights() {
    if (this.data.aiInsightsBusy) return
    if (!this.data.allFoods.length) {
      wx.showToast({ title: '请先添加库存食材', icon: 'none' })
      return
    }
    const excludedTitles = Array.isArray(this.data.aiRecentMealTitles) ? this.data.aiRecentMealTitles : []
    this.setData({
      aiInsightsBusy: true,
      aiInsightsState: 'loading',
      aiInsightsMessage: '正在结合当前库存生成菜谱…',
      aiInsightId: '',
      aiInsightFeedback: ''
    })
    const result = await this.requestMealAi(buildMealAiPayload({
      foods: this.data.allFoods,
      dietSettings: this.data.dietSettings,
      excludedTitles
    }))
    if (this.pageUnloaded) return
    if (!result.ok) {
      this.applyAiFailure(result.message)
      return
    }
    const overview = normalizeAiOverview(result.data, this.data.allFoods, this.data.dietSettings)
    const uniqueRecipes = overview.recipes.filter((meal, index, recipes) => !excludedTitles.includes(meal.title) && recipes.findIndex((item) => item.title === meal.title) === index)
    if (uniqueRecipes.length < 3) {
      this.applyAiFailure('AI 返回的不重复菜谱不足三道，请重试')
      return
    }
    const aiMealRecommendations = uniqueRecipes.map((meal) => ({
      ...meal,
      usedText: meal.usedNames.join('、'),
      missingText: meal.missingNames.length ? meal.missingNames.join('、') : '无需补充主要食材'
    }))
    const mealRecommendations = aiMealRecommendations.slice(0, 4)
    const insightId = `insight-${createId()}`
    this.setData({
      mealRecommendations,
      aiInsightsBusy: false,
      aiInsightsState: 'success',
      aiInsightsMessage: `已根据当前库存生成${mealRecommendations.length}道菜谱`,
      aiRecentMealTitles: [...excludedTitles, ...mealRecommendations.map((meal) => meal.title)].slice(-12),
      aiInsightId: insightId,
      aiInsightFeedback: ''
    })
  },

  recordAiFeedback(event) {
    const { id, kind, value } = event.currentTarget.dataset
    if (!id || kind !== 'insight' || !['helpful', 'unhelpful'].includes(value)) return
    try {
      const stored = wx.getStorageSync(AI_FEEDBACK_KEY)
      const records = Array.isArray(stored) ? stored : []
      wx.setStorageSync(AI_FEEDBACK_KEY, [{ id, kind, value, createdAt: Date.now() }, ...records.filter((record) => record.id !== id)].slice(0, 50))
    } catch (error) {
      wx.showToast({ title: '反馈保存失败，请重试', icon: 'none' })
      return
    }
    this.setData({ aiInsightFeedback: value })
    wx.showToast({ title: '已记录，谢谢反馈', icon: 'none' })
  },

  syncReminderSchedule(state, options = {}) {
    const app = typeof getApp === 'function' ? getApp() : null
    const templateId = app && app.globalData ? app.globalData.subscribeTemplateId : ''
    if (!templateId || !wx.cloud || typeof wx.cloud.callFunction !== 'function') return
    const settings = state.settings || defaultReminderSettings
    try {
      wx.cloud.callFunction({
        name: 'reminders',
        data: {
          action: 'sync',
          foods: settings.enabled ? state.foods.map(({ name, expireDate }) => ({ name, expireDate })) : [],
          settings: {
            enabled: settings.enabled === true,
            time: settings.time,
            permission: settings.permission
          },
          subscriptionGranted: options.subscriptionGranted === true
        },
        fail: (error) => console.warn('提醒计划同步失败', error)
      })
    } catch (error) {
      console.warn('提醒计划同步失败', error)
    }
  },

  refreshReminderStatus(state) {
    const app = typeof getApp === 'function' ? getApp() : null
    const templateId = app && app.globalData ? app.globalData.subscribeTemplateId : ''
    if (!templateId || !wx.cloud || typeof wx.cloud.callFunction !== 'function') return
    try {
      wx.cloud.callFunction({
        name: 'reminders',
        data: { action: 'status' },
        success: ({ result }) => {
          if (!result || !result.settings) return
          const settings = { ...defaultReminderSettings, ...result.settings }
          try {
            const currentState = this.getStoredState() || state
            wx.setStorageSync(STATE_KEY, { ...currentState, settings })
            this.renderReminderSettings(settings)
          } catch (error) {
            console.warn('提醒状态保存失败', error)
          }
        },
        fail: (error) => console.warn('提醒状态读取失败', error)
      })
    } catch (error) {
      console.warn('提醒状态读取失败', error)
    }
  },

  renderDisplaySettings(settings) {
    const displaySettings = { ...defaultDisplaySettings, ...(settings || {}) }
    this.setData({
      elderMode: displaySettings.elderMode === true,
      reduceMotion: displaySettings.reduceMotion === true
    })
  },

  saveState(state, syncOptions = {}) {
    try {
      const nextState = {
        ...state,
        history: (Array.isArray(state.history) ? state.history : []).slice(0, MAX_LOCAL_HISTORY),
        purchases: normalizePurchases(state.purchases),
        settings: { ...defaultReminderSettings, ...(state.settings || {}) },
        dietSettings: normalizeDietSettings(state.dietSettings),
        displaySettings: { ...defaultDisplaySettings, ...(state.displaySettings || {}) },
        historyClearedAt: Number.isFinite(state.historyClearedAt) ? state.historyClearedAt : 0
      }
      wx.setStorageSync(STATE_KEY, nextState)
      const shared = this.data.familyMode && this.familySnapshot
      const foods = shared ? (this.familySnapshot.foods || []) : nextState.foods
      const history = shared ? (this.familySnapshot.history || []) : nextState.history
      const purchases = shared ? (this.familySnapshot.purchases || []) : nextState.purchases
      this.renderFoods(foods)
      this.renderHistory(history, nextState.historyClearedAt)
      this.renderPurchases(purchases, history)
      this.renderReminderSettings(nextState.settings)
      this.renderDisplaySettings(nextState.displaySettings)
      this.renderDiet(foods, nextState.dietSettings)
      this.syncReminderSchedule(nextState, syncOptions)
      return true
    } catch (error) {
      wx.showToast({ title: '保存失败，请重试', icon: 'none' })
      return false
    }
  },

  openAdd() {
    this.setData({
      showAdd: true,
      editingId: '',
      categoryIndex: 0,
      zoneIndex: 0,
      unitIndex: 0,
      dateManuallyEdited: false,
      shelfLifeSuggestion: { days: 7, label: '蔬菜参考' },
      form: emptyForm()
    })
  },

  openEdit(event) {
    const { id } = event.currentTarget.dataset
    const food = this.data.allFoods.find((item) => item.id === id)
    if (!food) return
    this.setData({
      showAdd: true,
      editingId: id,
      categoryIndex: Math.max(0, categories.indexOf(food.category)),
      zoneIndex: Math.max(0, zones.findIndex((zone) => zone.value === food.zone)),
      unitIndex: Math.max(0, units.indexOf(food.unit)),
      dateManuallyEdited: food.expiryWasSuggested !== true,
      shelfLifeSuggestion: suggestShelfLife({ name: food.name, category: food.category, zone: food.zone }),
      form: {
        name: food.name,
        quantity: food.quantity,
        storedAt: food.storedAt,
        expireDate: food.expireDate,
        note: food.note || ''
      }
    })
  },

  closeAdd() {
    this.setData({ showAdd: false, editingId: '' })
  },

  openReminderSettings() {
    this.setData({ showReminderSettings: true })
  },

  closeReminderSettings() {
    this.setData({ showReminderSettings: false })
  },

  openDietSettings() {
    const dietDraft = normalizeDietSettings(this.data.dietSettings)
    const withChecked = (options, selected) => options.map((option) => ({ ...option, checked: selected.includes(option.value) }))
    this.setData({
      showDietSettings: true,
      dietDraft,
      dietPreferenceChoices: withChecked(dietPreferenceOptions, dietDraft.preferences),
      dietAllergenChoices: withChecked(allergenOptions, dietDraft.allergens),
      dietAvoidChoices: withChecked(avoidOptions, dietDraft.avoids)
    })
  },

  closeDietSettings() {
    this.setData({ showDietSettings: false })
  },

  onDietPreferencesChange(event) {
    this.setData({ 'dietDraft.preferences': event.detail.value })
  },

  onDietAllergensChange(event) {
    this.setData({ 'dietDraft.allergens': event.detail.value })
  },

  onDietAvoidsChange(event) {
    this.setData({ 'dietDraft.avoids': event.detail.value })
  },

  saveDietSettings() {
    const state = this.getStoredState()
    if (!state) return
    if (!this.saveState({ ...state, dietSettings: normalizeDietSettings(this.data.dietDraft) })) return
    this.closeDietSettings()
    wx.showToast({ title: '饮食设置已保存', icon: 'success' })
  },

  stopTap() {},

  onNameInput(event) {
    const name = event.detail.value
    this.setData({ 'form.name': name })
    this.updateDateSuggestion({ name })
  },

  onNoteInput(event) {
    this.setData({ 'form.note': event.detail.value })
  },

  onCategoryChange(event) {
    const categoryIndex = Number(event.detail.value)
    this.setData({ categoryIndex })
    this.updateDateSuggestion({ category: categories[categoryIndex] })
  },

  onZoneChange(event) {
    const zoneIndex = Number(event.detail.value)
    this.setData({ zoneIndex })
    this.updateDateSuggestion({ zone: zones[zoneIndex].value })
  },

  onUnitChange(event) {
    this.setData({ unitIndex: Number(event.detail.value) })
  },

  onDateChange(event) {
    this.setData({ 'form.expireDate': event.detail.value, dateManuallyEdited: true })
  },

  onStoredAtChange(event) {
    const storedAt = event.detail.value
    this.setData({ 'form.storedAt': storedAt })
    this.updateDateSuggestion({ storedAt })
  },

  resetDateSuggestion() {
    this.setData({ dateManuallyEdited: false })
    this.updateDateSuggestion({}, true)
  },

  updateDateSuggestion(overrides = {}, force = false) {
    const name = overrides.name === undefined ? this.data.form.name : overrides.name
    const category = overrides.category || categories[this.data.categoryIndex]
    const zone = overrides.zone || zones[this.data.zoneIndex].value
    const storedAt = overrides.storedAt || this.data.form.storedAt
    const shelfLifeSuggestion = suggestShelfLife({ name, category, zone })
    const updates = { shelfLifeSuggestion }
    if (!this.data.dateManuallyEdited || force) updates['form.expireDate'] = addDays(storedAt, shelfLifeSuggestion.days)
    this.setData(updates)
  },

  onReminderTimeChange(event) {
    this.saveReminderSettings({ time: event.detail.value })
  },

  onReminderToggle(event) {
    if (!event.detail.value) {
      this.saveReminderSettings({ enabled: false })
      return
    }
    this.requestReminderPermission()
  },

  saveReminderSettings(updates, syncOptions = {}) {
    const state = this.getStoredState()
    if (!state) return false
    return this.saveState({
      ...state,
      settings: { ...defaultReminderSettings, ...(state.settings || {}), ...updates }
    }, syncOptions)
  },

  requestReminderPermission() {
    const app = typeof getApp === 'function' ? getApp() : null
    const templateId = app && app.globalData ? app.globalData.subscribeTemplateId : ''
    if (!templateId) {
      this.saveReminderSettings({ enabled: false, permission: 'unconfigured' })
      wx.showToast({ title: '需先配置订阅消息模板', icon: 'none' })
      return
    }
    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success: (result) => {
        const accepted = result[templateId] === 'accept'
        const saved = this.saveReminderSettings(
          { enabled: accepted, permission: accepted ? 'accepted' : 'denied' },
          { subscriptionGranted: accepted }
        )
        if (saved) wx.showToast({ title: accepted ? '提醒授权成功' : '未开启提醒', icon: 'none' })
      },
      fail: () => {
        this.saveReminderSettings({ enabled: false, permission: 'error' })
        wx.showToast({ title: '提醒授权失败，库存仍可使用', icon: 'none' })
      }
    })
  },

  switchView(event) {
    this.setData({ activeView: event.currentTarget.dataset.view })
  },

  onViewSwipeStart(event) {
    if (this.viewTransitioning) return
    const touch = event.touches && event.touches[0]
    if (!touch) return
    this.viewSwipeStart = { x: touch.clientX, y: touch.clientY }
  },

  cancelViewSwipe() {
    this.viewSwipeStart = null
  },

  onViewSwipeEnd(event) {
    const start = this.viewSwipeStart
    const touch = event.changedTouches && event.changedTouches[0]
    this.viewSwipeStart = null
    if (!start || !touch) return
    const deltaX = touch.clientX - start.x
    const deltaY = touch.clientY - start.y
    if (Math.abs(deltaX) < 44 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return
    const viewOrder = VIEW_ORDER
    const currentIndex = viewOrder.indexOf(this.data.activeView)
    const nextIndex = currentIndex + (deltaX < 0 ? 1 : -1)
    if (nextIndex < 0 || nextIndex >= viewOrder.length) return
    this.startViewTransition(viewOrder[nextIndex], deltaX < 0 ? 'left' : 'right')
  },

  startViewTransition(nextView, direction) {
    if (this.viewTransitioning || !VIEW_ORDER.includes(nextView) || nextView === this.data.activeView) return
    this.viewTransitioning = true
    this.setData({ viewTransitionClass: `view-transition-out ${direction}` })
    setTimeout(() => {
      this.setData({ activeView: nextView, viewTransitionClass: `view-transition-in ${direction}` })
      setTimeout(() => {
        this.viewTransitioning = false
        this.setData({ viewTransitionClass: '' })
      }, 180)
    }, 160)
  },

  startReceiptScan() {
    if (this.data.receiptBusy || this.data.receiptSaving) return
    if (typeof wx.chooseMedia !== 'function') {
      this.openManualReceipt('当前版本无法选择图片，请手动录入')
      return
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: ({ tempFiles }) => {
        const file = tempFiles && tempFiles[0]
        if (!file || !file.tempFilePath) return
        const recognize = (filePath) => this.recognizeReceiptImage(filePath)
        if (typeof wx.compressImage !== 'function') {
          recognize(file.tempFilePath)
          return
        }
        wx.compressImage({
          src: file.tempFilePath,
          quality: 62,
          success: ({ tempFilePath }) => recognize(tempFilePath || file.tempFilePath),
          fail: () => recognize(file.tempFilePath)
        })
      }
    })
  },

  recognizeReceiptImage(filePath) {
    const ready = wx.cloud && typeof wx.cloud.callFunction === 'function' && typeof wx.request === 'function' && typeof wx.getFileSystemManager === 'function'
    if (!ready) {
      this.openManualReceipt('智能识别暂不可用，已切换为手动录入')
      return
    }
    const draft = emptyReceiptDraft('ocr')
    draft.items = []
    this.setData({
      showReceiptSheet: true,
      receiptBusy: true,
      receiptSaving: false,
      receiptError: '',
      receiptScrollTarget: '',
      receiptDraft: draft
    })
    const contentType = /\.png$/i.test(filePath) ? 'image/png' : 'image/jpeg'
    wx.getFileSystemManager().readFile({
      filePath,
      encoding: 'base64',
      success: ({ data: imageBase64 }) => {
        if (!imageBase64 || imageBase64.length > 2.8 * 1024 * 1024) {
          this.finishReceiptFallback('小票图片过大，请重新拍摄或手动录入')
          return
        }
        wx.cloud.callFunction({
          name: 'receiptOcr',
          data: { action: 'glm-token' },
          success: ({ result }) => {
            if (!result || result.ok !== true || !result.token || typeof result.model !== 'string' || !result.model) {
              this.finishReceiptFallback((result && result.message) || '智能识别凭证不可用，请手动录入')
              return
            }
            wx.request({
              url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
              method: 'POST',
              timeout: 25000,
              header: {
                Authorization: `Bearer ${result.token}`,
                'Content-Type': 'application/json'
              },
              data: buildGlmReceiptPayload(imageBase64, contentType, result.model),
              success: (response) => {
                if (response.statusCode < 200 || response.statusCode >= 300) {
                  console.warn('GLM receipt request failed', response.statusCode, response.data && response.data.error)
                  this.finishReceiptFallback('智能识别服务暂不可用，请手动录入')
                  return
                }
                try {
                  const content = response.data && response.data.choices && response.data.choices[0] && response.data.choices[0].message && response.data.choices[0].message.content
                  this.finishReceiptModel(parseGlmReceiptContent(content))
                } catch (error) {
                  this.finishReceiptFallback('没有识别成功，请手动录入')
                }
              },
              fail: (error) => {
                const reason = String((error && error.errMsg) || '未知网络错误').replace(/^request:fail\s*/, '')
                console.warn('[receipt-ocr] GLM request failed', reason)
                this.finishReceiptFallback(`智能识别请求失败：${reason}`)
              }
            })
          },
          fail: () => this.finishReceiptFallback('智能识别服务暂不可用，请手动录入')
        })
      },
      fail: () => this.finishReceiptFallback('小票读取失败，请手动录入')
    })
  },

  finishReceiptModel(result) {
    const resultItems = result && Array.isArray(result.items) ? result.items : []
    if (!resultItems.length) {
      this.finishReceiptFallback('没有识别出商品，请手动补充')
      return
    }
    const items = resultItems.map((item) => createReceiptDraftItem(item))
    const selectedTotal = roundMoney(items.filter((item) => item.selected).reduce((sum, item) => sum + roundMoney(item.amount), 0))
    const draftId = createId()
    this.setData({
      receiptBusy: false,
      receiptError: '',
      receiptDraft: {
        id: draftId,
        source: 'ocr',
        purchasedDate: formatDate(new Date()),
        receiptTotal: moneyText(result.total),
        selectedTotal: moneyText(selectedTotal),
        rawLines: [],
        items
      }
    })
    this.loadReceiptClassificationCorrections(draftId, items)
  },

  loadReceiptClassificationCorrections(draftId, items) {
    if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') return
    wx.cloud.callFunction({
      name: 'receiptOcr',
      data: { action: 'classifications', names: items.map((item) => item.name) },
      success: ({ result }) => {
        if (!result || result.ok !== true || !Array.isArray(result.entries) || this.data.receiptDraft.id !== draftId) return
        const remembered = new Map(result.entries.map((entry) => [entry.key, entry]))
        const nextItems = this.data.receiptDraft.items.map((item) => {
          const entry = remembered.get(normalizeClassificationKey(item.name))
          return entry && !item.classificationEdited ? createReceiptDraftItem({ ...item, ...entry, remembered: true, selected: undefined }) : item
        })
        this.setData({ 'receiptDraft.items': nextItems }, () => this.updateReceiptSelectedTotal())
      }
    })
  },

  finishReceiptFallback(message, rawLines = []) {
    const draft = emptyReceiptDraft('manual')
    draft.rawLines = rawLines
    this.setData({
      showReceiptSheet: true,
      receiptBusy: false,
      receiptSaving: false,
      receiptError: message,
      receiptScrollTarget: '',
      receiptDraft: draft
    })
    wx.showToast({ title: message, icon: 'none' })
  },

  openManualReceipt(message = '') {
    const receiptError = typeof message === 'string' ? message : ''
    this.setData({
      showReceiptSheet: true,
      receiptBusy: false,
      receiptSaving: false,
      receiptError,
      receiptScrollTarget: '',
      receiptDraft: emptyReceiptDraft('manual')
    })
  },

  closeReceiptSheet() {
    if (this.data.receiptBusy || this.data.receiptSaving) {
      wx.showToast({ title: '当前操作完成后再关闭', icon: 'none' })
      return
    }
    const draft = this.data.receiptDraft || emptyReceiptDraft()
    const hasDraftContent = (draft.rawLines || []).length > 0 || (draft.items || []).some((item) => {
      return String(item.name || '').trim() || roundMoney(item.amount) > 0
    })
    if (!hasDraftContent) {
      this.discardReceiptDraft()
      return
    }
    wx.showModal({
      title: '放弃这次小票？',
      content: '尚未确认的识别和修改内容会丢失。',
      confirmText: '放弃',
      confirmColor: '#9a4d42',
      success: (result) => {
        if (result.confirm) this.discardReceiptDraft()
      }
    })
  },

  discardReceiptDraft() {
    this.setData({ showReceiptSheet: false, receiptError: '', receiptScrollTarget: '', receiptDraft: emptyReceiptDraft() })
  },

  jumpReceiptToBottom() {
    if (this.data.receiptBusy) return
    this.setData({ receiptScrollTarget: '' }, () => {
      this.setData({ receiptScrollTarget: 'receipt-confirm-target' })
    })
  },

  updateReceiptSelectedTotal() {
    const total = this.data.receiptDraft.items
      .filter((item) => item.selected)
      .reduce((sum, item) => sum + roundMoney(item.amount), 0)
    this.setData({ 'receiptDraft.selectedTotal': moneyText(total) })
  },

  onReceiptItemInput(event) {
    const index = Number(event.currentTarget.dataset.index)
    const field = event.currentTarget.dataset.field
    if (!Number.isInteger(index) || !['name', 'quantity', 'unitPrice', 'amount'].includes(field)) return
    const value = field === 'name' ? event.detail.value.slice(0, 20) : event.detail.value
    this.setData({ [`receiptDraft.items[${index}].${field}`]: value }, () => {
      if (field === 'amount') this.updateReceiptSelectedTotal()
    })
  },

  onReceiptPickerChange(event) {
    const index = Number(event.currentTarget.dataset.index)
    const field = event.currentTarget.dataset.field
    const optionIndex = Number(event.detail.value)
    const item = this.data.receiptDraft.items[index]
    if (!item || !Number.isInteger(optionIndex)) return
    const updates = {}
    if (field === 'category' && categories[optionIndex]) {
      updates[`receiptDraft.items[${index}].category`] = categories[optionIndex]
      updates[`receiptDraft.items[${index}].categoryIndex`] = optionIndex
      updates[`receiptDraft.items[${index}].classificationEdited`] = true
    } else if (field === 'inventoryType' && receiptTypeOptions[optionIndex]) {
      const option = receiptTypeOptions[optionIndex]
      updates[`receiptDraft.items[${index}].inventoryType`] = option.value
      updates[`receiptDraft.items[${index}].inventoryTypeIndex`] = optionIndex
      updates[`receiptDraft.items[${index}].inventoryTypeLabel`] = option.label
      updates[`receiptDraft.items[${index}].selected`] = option.value === 'food'
      updates[`receiptDraft.items[${index}].classificationEdited`] = true
    } else if (field === 'zone' && zones[optionIndex]) {
      updates[`receiptDraft.items[${index}].zone`] = zones[optionIndex].value
      updates[`receiptDraft.items[${index}].zoneIndex`] = optionIndex
    } else if (field === 'unit' && units[optionIndex]) {
      updates[`receiptDraft.items[${index}].unit`] = units[optionIndex]
      updates[`receiptDraft.items[${index}].unitIndex`] = optionIndex
    }
    if (Object.keys(updates).length) this.setData(updates, () => this.updateReceiptSelectedTotal())
  },

  onReceiptItemDateChange(event) {
    const index = Number(event.currentTarget.dataset.index)
    if (!this.data.receiptDraft.items[index]) return
    this.setData({ [`receiptDraft.items[${index}].expireDate`]: event.detail.value })
  },

  onReceiptPurchasedDateChange(event) {
    this.setData({ 'receiptDraft.purchasedDate': event.detail.value })
  },

  onReceiptTotalInput(event) {
    this.setData({ 'receiptDraft.receiptTotal': event.detail.value })
  },

  toggleReceiptItem(event) {
    const index = Number(event.currentTarget.dataset.index)
    const item = this.data.receiptDraft.items[index]
    if (!item) return
    if (item.inventoryType !== 'food') {
      wx.showToast({ title: '请先将商品类型改为食品', icon: 'none' })
      return
    }
    this.setData({ [`receiptDraft.items[${index}].selected`]: !item.selected }, () => this.updateReceiptSelectedTotal())
  },

  rememberReceiptClassifications(items) {
    const corrections = items.filter((item) => item.classificationEdited && item.name).map((item) => ({
      name: item.name,
      inventoryType: item.inventoryType,
      category: item.category
    }))
    if (!corrections.length || !wx.cloud || typeof wx.cloud.callFunction !== 'function') return
    wx.cloud.callFunction({ name: 'receiptOcr', data: { action: 'remember-classifications', corrections } })
  },

  addReceiptDraftItem() {
    this.setData({
      'receiptDraft.items': [
        ...this.data.receiptDraft.items,
        createReceiptDraftItem({ purchasedDate: this.data.receiptDraft.purchasedDate })
      ]
    })
  },

  removeReceiptDraftItem(event) {
    const index = Number(event.currentTarget.dataset.index)
    const items = this.data.receiptDraft.items.filter((item, itemIndex) => itemIndex !== index)
    this.setData({ 'receiptDraft.items': items.length ? items : [createReceiptDraftItem()] }, () => this.updateReceiptSelectedTotal())
  },

  onReceiptMonthChange(event) {
    const state = this.getStoredState()
    if (!state) return
    const purchases = this.data.familyMode && this.familySnapshot ? this.familySnapshot.purchases || [] : state.purchases
    const history = this.data.familyMode && this.familySnapshot ? this.familySnapshot.history || [] : state.history
    this.setData({ receiptMonth: event.detail.value }, () => this.renderPurchases(purchases, history))
  },

  commitReceipt() {
    if (this.data.receiptSaving || this.data.receiptBusy) return
    const draft = this.data.receiptDraft
    const selected = draft.items.filter((item) => item.selected)
    if (!selected.length) {
      if (draft.items.some((item) => item.classificationEdited)) {
        this.rememberReceiptClassifications(draft.items)
        this.setData({ showReceiptSheet: false, receiptError: '', receiptScrollTarget: '', receiptDraft: emptyReceiptDraft() })
        wx.showToast({ title: '已确认，未加入库存', icon: 'none' })
        return
      }
      wx.showToast({ title: '请至少选择一项商品', icon: 'none' })
      return
    }
    for (const item of selected) {
      if (!item.name.trim()) {
        wx.showToast({ title: '请填写商品名称', icon: 'none' })
        return
      }
      if (!(Number(item.quantity) > 0)) {
        wx.showToast({ title: `${item.name}的数量无效`, icon: 'none' })
        return
      }
      if (!(roundMoney(item.amount) > 0)) {
        wx.showToast({ title: `请填写${item.name}的金额`, icon: 'none' })
        return
      }
      if (item.expireDate < draft.purchasedDate) {
        wx.showToast({ title: `${item.name}的到期日早于购买日`, icon: 'none' })
        return
      }
    }

    const state = this.getStoredState()
    if (!state) return
    const purchaseId = createId()
    const createdAt = Date.now()
    const purchaseItems = selected.map((item) => ({
      id: item.id,
      name: item.name.trim(),
      quantity: Number(item.quantity),
      unit: item.unit,
      unitPrice: roundMoney(item.unitPrice || roundMoney(item.amount) / Number(item.quantity)),
      amount: roundMoney(item.amount),
      category: item.category,
      zone: item.zone,
      expireDate: item.expireDate
    }))
    const purchase = normalizePurchases([{
      id: purchaseId,
      purchasedDate: draft.purchasedDate,
      createdAt,
      source: draft.source,
      receiptTotal: roundMoney(draft.receiptTotal) || roundMoney(draft.selectedTotal),
      rawLines: draft.rawLines,
      items: purchaseItems
    }])[0]
    if (!purchase) {
      wx.showToast({ title: '小票内容无效，请检查', icon: 'none' })
      return
    }
    const foods = purchase.items.map((item, index) => {
      const reference = suggestShelfLife({ name: item.name, category: item.category, zone: item.zone })
      return normalizeFood({
        id: createId(),
        name: item.name,
        category: item.category,
        zone: item.zone,
        quantity: item.quantity,
        unit: item.unit,
        storedAt: draft.purchasedDate,
        expireDate: item.expireDate,
        note: '',
        shelfLifeReference: reference.label,
        expiryWasSuggested: true,
        purchaseId,
        purchaseItemId: item.id,
        purchaseAmount: item.amount,
        purchaseUnitPrice: item.unitPrice,
        createdAt: createdAt + index
      })
    })
    this.setData({ receiptSaving: true })
    if (this.data.familyMode) {
      this.runFamilyAction('commitReceipt', { purchase, foods, targetText: `录入了 ${foods.length} 项小票商品` }).then(result => {
        if (!result.ok) {
          this.setData({ receiptSaving: false })
          return
        }
        this.setData({
          showReceiptSheet: false,
          receiptSaving: false,
          receiptError: '',
          receiptScrollTarget: '',
          receiptDraft: emptyReceiptDraft()
        })
        this.rememberReceiptClassifications(draft.items)
        wx.showToast({ title: `${foods.length} 项已加入库存`, icon: 'success' })
      })
      return
    }
    const saved = this.saveState({
      ...state,
      foods: [...foods, ...state.foods],
      purchases: [purchase, ...state.purchases]
    })
    if (!saved) {
      this.setData({ receiptSaving: false })
      return
    }
    this.setData({
      showReceiptSheet: false,
      receiptSaving: false,
      receiptError: '',
      receiptScrollTarget: '',
      receiptDraft: emptyReceiptDraft()
    })
    this.rememberReceiptClassifications(draft.items)
    wx.showToast({ title: `${foods.length} 项已加入库存`, icon: 'success' })
  },

  onSearchInput(event) {
    const query = event.detail.value
    this.setData({ query })
    this.applyFilters({ query })
  },

  setZoneFilter(event) {
    const zoneFilter = event.currentTarget.dataset.value
    this.setData({ zoneFilter })
    this.applyFilters({ zoneFilter })
  },

  setStatusFilter(event) {
    const statusFilter = event.currentTarget.dataset.value
    this.setData({ statusFilter })
    this.applyFilters({ statusFilter })
  },

  onCategoryFilterChange(event) {
    const categoryFilterIndex = Number(event.detail.value)
    const categoryFilter = categoryFilterIndex === 0 ? 'all' : categories[categoryFilterIndex - 1]
    this.setData({ categoryFilterIndex, categoryFilter })
    this.applyFilters({ categoryFilter })
  },

  clearFilters() {
    this.setData({
      query: '',
      zoneFilter: 'all',
      statusFilter: 'all',
      categoryFilter: 'all',
      categoryFilterIndex: 0,
      foods: this.data.allFoods
    })
  },

  applyFilters(overrides = {}) {
    const filters = {
      query: this.data.query,
      zone: this.data.zoneFilter,
      status: this.data.statusFilter,
      category: this.data.categoryFilter,
      ...overrides
    }
    this.setData({ foods: filterFoods(this.data.allFoods, filters) })
  },

  decreaseQuantity() {
    this.setData({ 'form.quantity': Math.max(1, this.data.form.quantity - 1) })
  },

  increaseQuantity() {
    this.setData({ 'form.quantity': this.data.form.quantity + 1 })
  },

  saveFood() {
    const name = this.data.form.name.trim()
    if (!name) {
      wx.showToast({ title: '请填写食物名称', icon: 'none' })
      return
    }
    if (this.data.form.expireDate < this.data.form.storedAt) {
      wx.showToast({ title: '到期日不能早于入库日', icon: 'none' })
      return
    }

    const state = this.getStoredState()
    if (!state) return
    const storedFoods = state.foods
    const food = {
      id: this.data.editingId || createId(),
      name,
      category: categories[this.data.categoryIndex],
      zone: zones[this.data.zoneIndex].value,
      quantity: this.data.form.quantity,
      unit: units[this.data.unitIndex],
      storedAt: this.data.form.storedAt,
      expireDate: this.data.form.expireDate,
      note: this.data.form.note.trim(),
      shelfLifeReference: this.data.shelfLifeSuggestion.label,
      expiryWasSuggested: !this.data.dateManuallyEdited
    }
    if (this.data.familyMode) {
      const current = this.data.allFoods.find(item => item.id === this.data.editingId)
      const action = current ? 'updateFood' : 'addFood'
      const payload = current
        ? { id: current.id, expectedVersion: current.version, food, targetText: `修改了${name}` }
        : { food, targetText: `添加了${name}` }
      this.runFamilyAction(action, payload).then(result => {
        if (!result.ok) return
        this.setData({ showAdd: false, editingId: '', dateManuallyEdited: false, form: emptyForm() })
        wx.showToast({ title: current ? '修改已保存' : '已经放进冰箱', icon: 'success' })
      })
      return
    }
    let foods
    if (this.data.editingId) {
      foods = storedFoods.map((item) => item.id === this.data.editingId
        ? { ...item, ...food, updatedAt: Date.now() }
        : item)
    } else {
      foods = [{ ...food, createdAt: Date.now() }, ...storedFoods]
    }

    if (!this.saveState({ ...state, foods })) return
    const message = this.data.editingId ? '修改已保存' : '已经放进冰箱'
    this.setData({ showAdd: false, editingId: '', dateManuallyEdited: false, form: emptyForm() })
    wx.showToast({ title: message, icon: 'success' })
  },

  addFood() {
    this.saveFood()
  },

  toggleBatchMode() {
    const batchMode = !this.data.batchMode
    this.setData({ batchMode, selectedFoodIds: [] }, () => this.renderFoods(this.data.allFoods))
  },

  toggleBatchFood(event) {
    if (!this.data.batchMode) return
    const id = event.currentTarget.dataset.id
    const selectedFoodIds = this.data.selectedFoodIds.includes(id)
      ? this.data.selectedFoodIds.filter((foodId) => foodId !== id)
      : [...this.data.selectedFoodIds, id]
    this.setData({
      selectedFoodIds,
      foods: this.data.foods.map((food) => ({ ...food, batchSelected: selectedFoodIds.includes(food.id) })),
      allFoods: this.data.allFoods.map((food) => ({ ...food, batchSelected: selectedFoodIds.includes(food.id) }))
    })
  },

  finishSelectedFoods() {
    this.confirmBatchProcess('eaten')
  },

  wasteSelectedFoods() {
    this.confirmBatchProcess('discarded')
  },

  confirmBatchProcess(outcome) {
    const count = this.data.selectedFoodIds.length
    if (!count) {
      wx.showToast({ title: '请先选择食物', icon: 'none' })
      return
    }
    const discarded = outcome === 'discarded'
    wx.showModal({
      title: discarded ? `丢弃选中的 ${count} 项？` : `吃完选中的 ${count} 项？`,
      content: discarded ? '这些食物会统一记录为浪费。' : '这些食物会统一记录为吃完。',
      confirmText: discarded ? '批量丢弃' : '批量吃完',
      confirmColor: discarded ? '#a34235' : '#1f6046',
      success: ({ confirm }) => {
        if (confirm) this.processSelectedFoods(outcome)
      }
    })
  },

  processSelectedFoods(outcome) {
    if (this.data.familyMode) {
      const selected = this.data.allFoods.filter(item => this.data.selectedFoodIds.includes(item.id))
      if (!selected.length) return
      if (selected.length > 25) {
        wx.showToast({ title: '一次最多处理 25 项', icon: 'none' })
        return
      }
      const expectedVersions = Object.fromEntries(selected.map(item => [item.id, item.version]))
      this.runFamilyAction('processFoods', {
        ids: selected.map(item => item.id),
        expectedVersions,
        outcome,
        targetText: `${outcome === 'discarded' ? '丢弃' : '吃完'}了 ${selected.length} 项食物`
      }).then(result => {
        if (!result.ok) return
        this.setData({ batchMode: false, selectedFoodIds: [] })
        wx.showToast({ title: `已处理 ${selected.length} 项`, icon: 'none' })
      })
      return
    }
    const state = this.getStoredState()
    if (!state) return
    const result = processFoodBatch({
      foods: state.foods,
      history: state.history,
      selectedIds: this.data.selectedFoodIds,
      outcome,
      handledAt: Date.now(),
      createId
    })
    if (!result.processedCount) return
    if (!this.saveState({ ...state, foods: result.foods, history: result.history })) return
    this.setData({ batchMode: false, selectedFoodIds: [] })
    wx.showToast({ title: `已处理 ${result.processedCount} 项`, icon: 'none' })
  },

  finishFood(event) {
    this.confirmProcess(event.currentTarget.dataset.id, 'eaten')
  },

  wasteFood(event) {
    this.confirmProcess(event.currentTarget.dataset.id, 'discarded')
  },

  confirmProcess(id, outcome) {
    const discarded = outcome === 'discarded'
    wx.showModal({
      title: discarded ? '确认已经丢弃？' : '确认已经吃完？',
      content: discarded ? '会记录为浪费，之后可以撤销。' : '会记录为吃完，之后可以撤销。',
      confirmText: discarded ? '确认丢弃' : '吃完了',
      confirmColor: discarded ? '#a34235' : '#1f6046',
      success: ({ confirm }) => {
        if (confirm) this.processFood(id, outcome)
      }
    })
  },

  processFood(id, outcome) {
    if (this.data.familyMode) {
      const food = this.data.allFoods.find(item => item.id === id)
      if (!food) return
      this.runFamilyAction('processFoods', {
        ids: [id],
        expectedVersions: { [id]: food.version },
        outcome,
        targetText: `${outcome === 'discarded' ? '丢弃' : '吃完'}了${food.name}`
      }).then(result => {
        if (result.ok) wx.showToast({ title: outcome === 'discarded' ? '已记录为浪费' : '已记录为吃完', icon: 'none' })
      })
      return
    }
    const state = this.getStoredState()
    if (!state) return
    const { foods: storedFoods, history } = state
    const food = storedFoods.find((item) => item.id === id)
    if (!food) return
    const nextHistory = [{ id: createId(), food: normalizeFood(food), outcome, handledAt: Date.now() }, ...history]
    const nextFoods = storedFoods.filter((item) => item.id !== id)
    if (!this.saveState({ ...state, foods: nextFoods, history: nextHistory })) return
    wx.showToast({ title: outcome === 'discarded' ? '已记录为浪费' : '已记录为吃完', icon: 'none' })
  },

  undoHistory(event) {
    const { id } = event.currentTarget.dataset
    if (this.data.familyMode) {
      this.runFamilyAction('undoHistory', { id, targetText: '撤销了一条处理记录' }).then(result => {
        if (result.ok) wx.showToast({ title: '已恢复到库存', icon: 'none' })
      })
      return
    }
    const state = this.getStoredState()
    if (!state) return
    const { foods: storedFoods, history } = state
    const entry = history.find((item) => item.id === id)
    if (!entry) return
    const nextFoods = [entry.food, ...storedFoods.filter((food) => food.id !== entry.food.id)]
    const nextHistory = history.filter((item) => item.id !== id)
    if (!this.saveState({ ...state, foods: nextFoods, history: nextHistory })) return
    wx.showToast({ title: '已恢复到库存', icon: 'none' })
  },

  clearHistoryNow() {
    const state = this.getStoredState()
    if (!state || !this.data.history.length) return
    wx.showModal({
      title: '立即清理处理记录？',
      content: '会清空处理记录页面，但保留小票账本所需的消费与浪费统计。',
      confirmText: '立即清理',
      confirmColor: '#9a4d42',
      success: ({ confirm }) => {
        if (!confirm) return
        const historyClearedAt = Date.now()
        if (this.saveState({ ...state, historyClearedAt })) {
          if (this.data.familyMode && this.familySnapshot) this.renderHistory(this.familySnapshot.history || [], historyClearedAt)
          wx.showToast({ title: '处理记录已清理', icon: 'none' })
        }
      }
    })
  },

  deleteFood(event) {
    const { id } = event.currentTarget.dataset
    wx.showModal({
      title: '删除这项食物？',
      content: '仅用于删除误添加的记录，删除后无法恢复。',
      confirmText: '删除',
      confirmColor: '#a34235',
      success: ({ confirm }) => {
        if (confirm) this.removeFood(id, '已删除')
      }
    })
  },

  removeFood(id, message) {
    if (this.data.familyMode) {
      const food = this.data.allFoods.find(item => item.id === id)
      if (!food) return
      this.runFamilyAction('deleteFood', { id, expectedVersion: food.version, targetText: `删除了${food.name}` }).then(result => {
        if (!result.ok) return
        if (this.data.editingId === id) this.setData({ showAdd: false, editingId: '' })
        wx.showToast({ title: message, icon: 'none' })
      })
      return
    }
    const state = this.getStoredState()
    if (!state) return
    const foods = state.foods.filter((food) => food.id !== id)
    if (this.saveState({ ...state, foods })) {
      if (this.data.editingId === id) this.setData({ showAdd: false, editingId: '' })
      wx.showToast({ title: message, icon: 'none' })
    }
  }
})
