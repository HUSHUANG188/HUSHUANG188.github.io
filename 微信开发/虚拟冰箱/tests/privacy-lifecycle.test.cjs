const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

function createCloudFixture() {
  const records = {
    families: [{ _id: 'family-1', name: '测试家庭', status: 'active', adminMemberId: 'member-1', syncRevision: 1 }],
    family_members: [
      { _id: 'openid-1', familyId: 'family-1', memberId: 'member-1', nickname: '妈妈', role: 'admin' },
      { _id: 'openid-2', familyId: 'family-1', memberId: 'member-2', nickname: '爸爸', role: 'member' }
    ],
    family_invites: [{ _id: 'invite-1', familyId: 'family-1' }],
    family_foods: [{ _id: 'food-1', familyId: 'family-1' }],
    family_purchases: [{ _id: 'purchase-1', familyId: 'family-1' }],
    family_history: [{ _id: 'history-1', familyId: 'family-1' }],
    family_doors: [{
      _id: 'family-1',
      familyId: 'family-1',
      magnets: [
        { type: 'photo', content: 'cloud://env/families/family-1/photo.jpg' },
        { type: 'album', content: 'cloud://env/families/family-1/a.jpg', photos: ['cloud://env/families/family-1/a.jpg', 'cloud://env/families/family-1/b.jpg'] }
      ]
    }],
    family_activity: [{ _id: 'activity-1', familyId: 'family-1' }],
    family_migrations: [{ _id: 'migration-1', familyId: 'family-1' }],
    backup_versions: [],
    restore_jobs: [],
    export_jobs: []
  }
  const deletedFiles = []
  const uploadedFiles = []
  const fileContents = new Map()
  let currentOpenid = 'openid-1'
  let injectedLateMember = false

  function matches(item, filter) {
    return Object.entries(filter).every(([key, value]) => item[key] === value)
  }

  function collection(name, transactional = false) {
    const items = records[name] || (records[name] = [])
    return {
      doc(id) {
        return {
          async get() { return { data: items.find(item => item._id === id) || null } },
          async set({ data }) {
            const index = items.findIndex(item => item._id === id)
            const record = { _id: id, ...data }
            if (index < 0) items.push(record)
            else items[index] = record
          },
          async update({ data }) {
            const index = items.findIndex(item => item._id === id)
            if (index < 0) throw new Error(`missing document: ${name}/${id}`)
            items[index] = { ...items[index], ...data }
          },
          async remove() {
            const index = items.findIndex(item => item._id === id)
            if (index >= 0) items.splice(index, 1)
          }
        }
      },
      where(filter) {
        let offset = 0
        let limit = 20
        return {
          orderBy() { return this },
          skip(value) { offset = value; return this },
          limit(value) { limit = value; return this },
          async get() {
            const data = items.filter(item => matches(item, filter)).slice(offset, offset + limit)
            if (name === 'family_members' && !transactional && !injectedLateMember && records.families.some(item => item._id === 'family-1' && item.status === 'deleting')) {
              injectedLateMember = true
              items.push({ _id: 'openid-late', familyId: 'family-1', memberId: 'member-late', nickname: '晚到成员', role: 'member' })
            }
            return { data }
          },
          async remove() {
            let deleted = 0
            for (let index = items.length - 1; index >= 0; index -= 1) {
              if (matches(items[index], filter)) {
                items.splice(index, 1)
                deleted += 1
              }
            }
            return { deleted }
          }
        }
      }
    }
  }

  const database = {
    collection(name) { return collection(name) },
    async runTransaction(worker) { return { result: await worker({ collection: name => collection(name, true) }) } }
  }

  return {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    database() { return database },
    getWXContext() { return { OPENID: currentOpenid } },
    async getTempFileURL() { return { fileList: [] } },
    async downloadFile({ fileID }) { return { fileContent: fileContents.get(fileID) || Buffer.from(fileID) } },
    async uploadFile({ cloudPath, fileContent }) {
      const fileID = `cloud://env/${cloudPath}`
      uploadedFiles.push(fileID)
      fileContents.set(fileID, Buffer.from(fileContent))
      return { fileID }
    },
    async deleteFile({ fileList }) {
      deletedFiles.push(...fileList)
      fileList.forEach(fileID => fileContents.delete(fileID))
      return { fileList }
    },
    _records: records,
    _deletedFiles: deletedFiles,
    _uploadedFiles: uploadedFiles,
    _setOpenid(value) { currentOpenid = value }
  }
}

const familyEntry = path.join(__dirname, '../cloudfunctions/family/index.js')
const originalLoad = Module._load
const cloudFixture = createCloudFixture()
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return cloudFixture
  return originalLoad.call(this, request, parent, isMain)
}
delete require.cache[require.resolve(familyEntry)]
const family = require(familyEntry)
Module._load = originalLoad

function createReminderFixture() {
  const schedules = [
    { _id: 'schedule-1', openid: 'openid-1', enabled: true },
    { _id: 'schedule-2', openid: 'openid-2', enabled: true }
  ]
  return {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    database() {
      return {
        serverDate() { return 1 },
        collection(name) {
          const items = name === 'reminder_schedules' ? schedules : []
          return {
            doc(id) {
              return {
                async get() { return { data: items.find(item => item._id === id) || null } },
                async remove() {
                  const index = items.findIndex(item => item._id === id)
                  if (index >= 0) items.splice(index, 1)
                }
              }
            },
            where(filter) {
              return {
                limit() { return this },
                async get() { return { data: items.filter(item => matchesReminder(item, filter)) } }
              }
            }
          }
        }
      }
    },
    getWXContext() { return { OPENID: 'openid-1', APPID: 'appid-1' } },
    _schedules: schedules
  }
}

function matchesReminder(item, filter) {
  return Object.entries(filter).every(([key, value]) => item[key] === value)
}

const reminderEntry = path.join(__dirname, '../cloudfunctions/reminders/index.js')
const reminderFixture = createReminderFixture()
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return reminderFixture
  return originalLoad.call(this, request, parent, isMain)
}
delete require.cache[require.resolve(reminderEntry)]
const reminders = require(reminderEntry)
Module._load = originalLoad

function createQuotaFixture(initialRecords) {
  const records = initialRecords.map(record => ({ ...record, users: { ...record.users } }))
  return {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    database() {
      return {
        collection() {
          let offset = 0
          let limit = 20
          return {
            skip(value) { offset = value; return this },
            limit(value) { limit = value; return this },
            async get() { return { data: records.slice(offset, offset + limit) } },
            doc(id) {
              return {
                async set({ data }) {
                  const index = records.findIndex(item => item._id === id)
                  const record = { _id: id, ...data }
                  if (index < 0) records.push(record)
                  else records[index] = record
                }
              }
            }
          }
        }
      }
    },
    getWXContext() { return { OPENID: 'openid-1' } },
    _records: records
  }
}

function loadCloudFunction(entry, fixture) {
  Module._load = function (request, parent, isMain) {
    if (request === 'wx-server-sdk') return fixture
    return originalLoad.call(this, request, parent, isMain)
  }
  delete require.cache[require.resolve(entry)]
  const loaded = require(entry)
  Module._load = originalLoad
  return loaded
}

const { reserveQuota: reserveReceiptQuota } = require('../cloudfunctions/receiptOcr/quota')
const { reserveQuota: reserveMealQuota } = require('../cloudfunctions/mealAi/quota')
const receiptUsers = reserveReceiptQuota(reserveReceiptQuota({}, 'openid-1', 1000).data, 'openid-2', 1000).data.users
const mealUsers = reserveMealQuota(reserveMealQuota({}, 'openid-1', 1000).data, 'openid-2', 1000).data.users
const quotaFixture = createQuotaFixture([
  { _id: 'receipt-ocr-2026-09-04', day: '2026-09-04', total: 8, users: receiptUsers },
  { _id: 'meal-ai-2026-09-04', day: '2026-09-04', total: 6, users: mealUsers }
])
const receiptOcr = loadCloudFunction(path.join(__dirname, '../cloudfunctions/receiptOcr/index.js'), quotaFixture)
const mealAi = loadCloudFunction(path.join(__dirname, '../cloudfunctions/mealAi/index.js'), quotaFixture)

function loadPageFixture() {
  const storage = {
    'virtual-fridge-state': { foods: [{ id: 'food-1' }], history: [], purchases: [] },
    'virtual-fridge-door': [{ id: 'photo-1', type: 'photo', content: 'saved-photo.jpg' }],
    'virtual-fridge-ai-feedback': [{ id: 'feedback-1' }],
    'virtual-fridge-v5-backup:1': { magnets: [{ id: 'album-1', type: 'album', photos: ['saved-a.jpg', 'saved-b.jpg'] }] },
    'virtual-fridge-family-session': { familyId: 'family-old' },
    'virtual-fridge-family-cache:family-old': { family: { familyId: 'family-old' } }
  }
  const cloudCalls = []
  const removedFiles = []
  let pageDefinition
  global.Page = definition => { pageDefinition = definition }
  global.wx = {
    cloud: {
      callFunction({ name, data, success }) {
        cloudCalls.push({ name, data })
        success({ result: { ok: true, data: { deleted: true } } })
      }
    },
    getStorageInfoSync() { return { keys: Object.keys(storage) } },
    getStorageSync(key) { return storage[key] },
    removeStorageSync(key) { delete storage[key] },
    removeSavedFile({ filePath, success }) { removedFiles.push(filePath); if (success) success() },
    showModal({ success }) { success({ confirm: true }) },
    showLoading() {},
    hideLoading() {},
    showToast() {}
  }
  const entry = path.join(__dirname, '../pages/index/index.js')
  delete require.cache[require.resolve(entry)]
  require(entry)
  return { pageDefinition, storage, cloudCalls, removedFiles }
}

;(async () => {
  const familyBackup = await family.main({ action: 'createBackup', requestId: 'family-backup-1' })
  assert.equal(familyBackup.ok, true)
  assert.deepEqual(familyBackup.data.summary, { foods: 1, history: 1, purchases: 1, magnets: 2, photos: 3 })
  assert.equal(cloudFixture._uploadedFiles.length, 4)
  assert.equal((await family.main({ action: 'listBackups' })).data.backups.length, 1)

  cloudFixture._records.families[0].name = '恢复前的改名'
  cloudFixture._records.families[0].syncRevision = 2
  cloudFixture._records.family_foods.splice(0, 1, { _id: 'changed-food', familyId: 'family-1' })
  cloudFixture._records.family_members.push({ _id: 'openid-3', familyId: 'family-1', memberId: 'member-3', nickname: '孩子', role: 'member' })
  cloudFixture._records.family_invites.push({ _id: 'invite-2', familyId: 'family-1' })
  const familyRestore = await family.main({ action: 'restoreBackup', requestId: 'restore-family-1', backupId: familyBackup.data.backupId })
  assert.equal(familyRestore.ok, true)
  assert.equal(familyRestore.data.status, 'committed')
  assert.equal(cloudFixture._records.families[0].name, '测试家庭')
  assert.deepEqual(cloudFixture._records.family_foods.map(item => item._id), ['food-1'])
  assert.equal(cloudFixture._records.family_members.length, 3)
  assert.equal(cloudFixture._records.family_invites.length, 2)
  assert.equal(cloudFixture._records.backup_versions.filter(item => item.kind === 'preRestore').length, 1)
  assert.equal(cloudFixture._records.family_activity.filter(item => item.action === 'family-restored').length, 1)
  const restoredRevision = cloudFixture._records.families[0].syncRevision
  const repeatedRestore = await family.main({ action: 'restoreBackup', requestId: 'restore-family-1', backupId: familyBackup.data.backupId })
  assert.equal(repeatedRestore.data.jobId, familyRestore.data.jobId)
  assert.equal(cloudFixture._records.families[0].syncRevision, restoredRevision)
  assert.equal(cloudFixture._records.family_activity.filter(item => item.action === 'family-restored').length, 1)

  const safetyBackupId = cloudFixture._records.backup_versions.find(item => item.kind === 'preRestore')._id
  const safetyRestore = await family.main({ action: 'restoreBackup', requestId: 'restore-family-safety', backupId: safetyBackupId })
  assert.equal(safetyRestore.ok, true)
  assert.equal(cloudFixture._records.families[0].name, '恢复前的改名')
  assert.deepEqual(cloudFixture._records.family_foods.map(item => item._id), ['changed-food'])
  assert.equal((await family.main({ action: 'restoreBackup', requestId: 'restore-family-return', backupId: familyBackup.data.backupId })).ok, true)
  assert.equal(cloudFixture._records.families[0].name, '测试家庭')
  assert.equal(cloudFixture._records.backup_versions.filter(item => item.kind === 'preRestore').length, 1)

  cloudFixture._setOpenid('openid-2')
  assert.equal((await family.main({ action: 'createBackup', requestId: 'family-backup-2' })).error, 'admin-required')
  assert.equal((await family.main({ action: 'listBackups' })).error, 'admin-required')
  assert.equal((await family.main({ action: 'restoreBackup', requestId: 'restore-family-2', backupId: familyBackup.data.backupId })).error, 'admin-required')
  cloudFixture._setOpenid('openid-1')

  cloudFixture._records.families[0].restoreJobId = 'another-restore'
  assert.equal((await family.main({ action: 'renameFamily', requestId: 'rename-during-restore', name: '不应生效' })).error, 'family-maintenance')
  assert.equal((await family.main({ action: 'createBackup', requestId: 'backup-during-restore' })).error, 'family-maintenance')
  assert.equal((await family.main({ action: 'beginMigration', requestId: 'migration-during-restore', expected: {} })).error, 'family-maintenance')
  cloudFixture._records.family_migrations[0] = {
    _id: 'migration-1',
    familyId: 'family-1',
    ownerMemberId: 'member-1',
    status: 'pending',
    expected: { foods: 0, purchases: 0, history: 0, door: 0 },
    imported: { foods: 0, purchases: 0, history: 0, door: 0 }
  }
  assert.equal((await family.main({ action: 'importMigrationBatch', migrationId: 'migration-1', type: 'foods', items: [{ id: 'blocked-food' }] })).error, 'family-maintenance')
  assert.equal((await family.main({ action: 'finishMigration', requestId: 'finish-during-restore', migrationId: 'migration-1' })).error, 'family-maintenance')
  assert.equal(cloudFixture._records.families[0].name, '测试家庭')
  cloudFixture._records.families[0].restoreJobId = ''

  for (let index = 2; index <= 4; index += 1) {
    assert.equal((await family.main({ action: 'createBackup', requestId: `family-backup-${index}` })).ok, true)
  }
  const familyBackups = await family.main({ action: 'listBackups' })
  assert.equal(familyBackups.data.backups.filter(item => item.kind === 'manual').length, 3)
  assert.equal(familyBackups.data.backups.filter(item => item.kind === 'preRestore').length, 1)
  const latestManual = familyBackups.data.backups.find(item => item.kind === 'manual')
  assert.deepEqual(await family.main({ action: 'deleteBackup', backupId: latestManual.backupId }), { ok: true, data: { deleted: true } })
  assert.equal((await family.main({ action: 'listBackups' })).data.backups.filter(item => item.kind === 'manual').length, 2)

  const result = await family.main({ action: 'dissolveFamily', requestId: 'delete-family-1' })
  assert.deepEqual(result, { ok: true, data: { dissolved: true } })
  for (const collectionName of Object.keys(cloudFixture._records)) {
    assert.equal(cloudFixture._records[collectionName].some(item => item._id === 'family-1' || item.familyId === 'family-1'), false, `${collectionName} still contains family data`)
  }
  assert.deepEqual(new Set(cloudFixture._deletedFiles), new Set([
    'cloud://env/families/family-1/photo.jpg',
    'cloud://env/families/family-1/a.jpg',
    'cloud://env/families/family-1/b.jpg',
    ...cloudFixture._uploadedFiles
  ]))
  const deletedReminder = await reminders.main({ action: 'deleteMyData' })
  assert.deepEqual(deletedReminder, { ok: true, data: { deleted: true } })
  assert.deepEqual(reminderFixture._schedules, [{ _id: 'schedule-2', openid: 'openid-2', enabled: true }])
  assert.deepEqual(await reminders.main({}), { ok: false, error: 'invalid-action' })
  assert.deepEqual(reminderFixture._schedules, [{ _id: 'schedule-2', openid: 'openid-2', enabled: true }])
  assert.deepEqual(await receiptOcr.main({ action: 'deleteMyData' }), { ok: true, data: { deleted: true } })
  assert.deepEqual(await mealAi.main({ action: 'deleteMyData' }), { ok: true, data: { deleted: true } })
  for (const record of quotaFixture._records) {
    assert.equal(record.total, record._id.startsWith('receipt-ocr-') ? 8 : 6)
    assert.equal(Object.keys(record.users).length, 1)
  }

  const pageFixture = loadPageFixture()
  const page = {
    ...pageFixture.pageDefinition,
    data: { ...pageFixture.pageDefinition.data, familyMode: false },
    storedMagnets: [{ id: 'photo-1', type: 'photo', content: 'saved-photo.jpg' }],
    setData(values) { this.data = { ...this.data, ...values } }
  }
  await page.deleteMyData()
  assert.deepEqual(pageFixture.cloudCalls, [
    { name: 'reminders', data: { action: 'deleteMyData' } },
    { name: 'receiptOcr', data: { action: 'deleteMyData' } },
    { name: 'mealAi', data: { action: 'deleteMyData' } },
    { name: 'dataLifecycle', data: { action: 'deleteMyData' } }
  ])
  assert.deepEqual(pageFixture.storage, {})
  assert.deepEqual(new Set(pageFixture.removedFiles), new Set(['saved-photo.jpg', 'saved-a.jpg', 'saved-b.jpg']))
  assert.deepEqual(page.data.allFoods, [])
  assert.deepEqual(page.data.history, [])
  assert.deepEqual(page.data.purchases, [])
  console.log('privacy lifecycle public contract: ok')
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
