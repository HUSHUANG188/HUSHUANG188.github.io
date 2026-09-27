const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

let pageDefinition
const calls = []
const modals = []
const uploads = []
const deletedUploads = []
let uploadFailureAt = 0
let failedCall = ''
const storage = {
  'virtual-fridge-state': { foods: [{ id: 'food-1' }], history: [], purchases: [], settings: {}, dietSettings: {} },
  'virtual-fridge-door': [],
  'virtual-fridge-ai-feedback': []
}
const responses = {
  'dataLifecycle:listBackups': { ok: true, data: { backups: [{ backupId: 'backup-1', kind: 'manual', createdAt: 1, summary: { foods: 1, history: 0, purchases: 0, magnets: 0, photos: 0 } }] } },
  'family:listBackups': { ok: true, data: { backups: [{ backupId: 'family-backup-1', kind: 'manual', createdAt: 1, summary: { foods: 1, history: 0, purchases: 0, magnets: 0, photos: 0 } }] } },
  'dataLifecycle:createBackup': { ok: true, data: { backupId: 'backup-1', kind: 'manual', summary: { foods: 1, history: 0, purchases: 0, magnets: 0, photos: 0 } } },
  'family:createBackup': { ok: true, data: { backupId: 'family-backup-1', kind: 'manual', summary: { foods: 1, history: 0, purchases: 0, magnets: 0, photos: 0 } } },
  'dataLifecycle:restoreBackup': { ok: true, data: { jobId: 'restore-1', status: 'prepared', snapshot: { state: { foods: [{ id: 'restored-food' }], history: [], purchases: [], settings: {}, dietSettings: {} }, magnets: [{ id: 'restored-note', type: 'note', content: '回来啦' }], aiFeedback: [{ id: 'restored-feedback' }] } } },
  'dataLifecycle:commitRestore': { ok: true, data: { jobId: 'restore-1', status: 'committed' } },
  'family:restoreBackup': { ok: true, data: { jobId: 'family-restore-1', status: 'committed' } },
  'dataLifecycle:deleteBackup': { ok: true, data: { deleted: true } },
  'family:deleteBackup': { ok: true, data: { deleted: true } }
}

global.Page = definition => { pageDefinition = definition }
global.wx = {
  cloud: {
    uploadFile({ cloudPath, filePath, success }) {
      uploads.push({ cloudPath, filePath })
      if (uploadFailureAt === uploads.length) throw new Error('upload-failed')
      success({ fileID: `cloud://env/${cloudPath}` })
    },
    deleteFile({ fileList, success }) { deletedUploads.push(...fileList); if (success) success() },
    callFunction({ name, data, success, fail }) {
      calls.push({ name, data })
      if (failedCall === `${name}:${data.action}`) return fail({ errMsg: 'timeout' })
      success({ result: responses[`${name}:${data.action}`] })
    }
  },
  getStorageSync(key) { return storage[key] },
  setStorageSync(key, value) { storage[key] = value },
  showModal(options) { modals.push(options); options.success({ confirm: true }) },
  showLoading() {},
  hideLoading() {},
  showToast() {}
}

const root = path.join(__dirname, '..')
require(path.join(root, 'pages/index/index.js'))

function page(data = {}) {
  return {
    ...pageDefinition,
    data: { ...pageDefinition.data, ...data },
    storedMagnets: [],
    setData(values) { this.data = { ...this.data, ...values } }
  }
}

;(async () => {
  const personal = page({ familyMode: false })
  personal.storedMagnets = [{ id: 'photo-1', type: 'photo', content: 'saved-photo.jpg' }]
  await personal.openPersonalBackups()
  assert.equal(personal.data.showBackupSheet, true)
  assert.equal(personal.data.backupScope, 'personal')
  assert.deepEqual(calls.shift(), { name: 'dataLifecycle', data: { action: 'listBackups' } })

  await personal.createCurrentBackup()
  const personalCreate = calls.shift()
  assert.equal(personalCreate.name, 'dataLifecycle')
  assert.equal(personalCreate.data.action, 'createBackup')
  assert.equal(personalCreate.data.snapshot.state.foods.length, 1)
  assert.equal(uploads.length, 1)
  assert.match(personalCreate.data.snapshot.magnets[0].content, /^cloud:\/\/env\/backup-staging\//)
  assert.ok(personalCreate.data.requestId)
  assert.deepEqual(calls.shift(), { name: 'dataLifecycle', data: { action: 'listBackups' } })

  await personal.restoreCurrentBackup({ currentTarget: { dataset: { id: 'backup-1' } } })
  assert.match(modals[0].content, /当前 1 项库存/)
  assert.match(modals[0].content, /备份 1 项库存/)
  const personalRestore = calls.shift()
  assert.equal(personalRestore.name, 'dataLifecycle')
  assert.equal(personalRestore.data.action, 'restoreBackup')
  assert.equal(personalRestore.data.backupId, 'backup-1')
  assert.equal(personalRestore.data.currentSnapshot.state.foods[0].id, 'food-1')
  assert.deepEqual(calls.shift(), { name: 'dataLifecycle', data: { action: 'commitRestore', jobId: 'restore-1' } })
  assert.deepEqual(calls.shift(), { name: 'dataLifecycle', data: { action: 'listBackups' } })
  assert.equal(storage['virtual-fridge-state'].foods[0].id, 'restored-food')
  assert.equal(storage['virtual-fridge-door'][0].id, 'restored-note')
  assert.equal(storage['virtual-fridge-ai-feedback'][0].id, 'restored-feedback')

  failedCall = 'dataLifecycle:restoreBackup'
  await personal.restoreCurrentBackup({ currentTarget: { dataset: { id: 'backup-1' } } })
  assert.equal(personal.data.backupError, '恢复结果尚未确认，请再次点击恢复继续')
  assert.equal(calls.shift().data.action, 'restoreBackup')
  failedCall = ''

  const family = page({ familyMode: true, familyMember: { role: 'admin' } })
  family.getStoredState = () => storage['virtual-fridge-state']
  family.hydrateDoorMagnets = () => {}
  family.renderFoods = () => {}
  family.renderHistory = () => {}
  family.renderPurchases = () => {}
  family.renderReminderSettings = () => {}
  family.renderDiet = () => {}
  family.cacheFamilySnapshot = () => {}
  family.applyFamilySnapshot({
    family: { familyId: 'family-1', name: '测试家庭', maintenance: { type: 'restore' } },
    member: { role: 'admin' }, members: [], activity: [], foods: [], purchases: [], history: [], door: { magnets: [] }
  })
  assert.equal(family.data.familySyncMessage, '家庭数据正在恢复，请稍后操作')
  responses['family:renameFamily'] = { ok: false, error: 'family-maintenance', message: '家庭数据正在恢复，请稍后再试' }
  await family.runFamilyAction('renameFamily', { name: '不应生效' })
  assert.equal(family.data.familySyncMessage, '家庭数据正在恢复，请稍后操作')
  assert.equal(calls.shift().data.action, 'renameFamily')
  await family.openFamilyBackups()
  assert.equal(family.data.backupScope, 'family')
  assert.deepEqual(calls.shift(), { name: 'family', data: { action: 'listBackups' } })
  await family.createCurrentBackup()
  const familyCreate = calls.shift()
  assert.equal(familyCreate.name, 'family')
  assert.equal(familyCreate.data.action, 'createBackup')
  assert.equal(Object.hasOwn(familyCreate.data, 'snapshot'), false)
  assert.deepEqual(calls.shift(), { name: 'family', data: { action: 'listBackups' } })

  family.refreshFamily = async () => true
  await family.restoreCurrentBackup({ currentTarget: { dataset: { id: 'family-backup-1' } } })
  assert.equal(calls.shift().data.action, 'restoreBackup')
  assert.deepEqual(calls.shift(), { name: 'family', data: { action: 'listBackups' } })

  uploadFailureAt = uploads.length + 2
  await assert.rejects(() => personal.stagePersonalBackupMedia([
    { id: 'album-1', type: 'album', content: 'a.jpg', photos: ['a.jpg', 'b.jpg'] }
  ], 'failed-request'))
  assert.ok(deletedUploads.some(fileID => fileID.includes('/backup-staging/failed-request/0.jpg')))

  await family.deleteCurrentBackup({ currentTarget: { dataset: { id: 'backup-1' } } })
  assert.deepEqual(calls.shift(), { name: 'family', data: { action: 'deleteBackup', backupId: 'backup-1' } })

  const markup = fs.readFileSync(path.join(root, 'pages/index/index.wxml'), 'utf8')
  assert.match(markup, /个人备份与恢复/)
  assert.ok(markup.indexOf('个人备份与恢复') < markup.indexOf('删除我的数据'))
  assert.match(markup, /隐私保护指引/)
  assert.match(markup, /家庭备份与恢复/)
  assert.match(markup, /最多保留 3 个普通备份/)
  assert.match(markup, /恢复前自动备份/)
  assert.match(markup, /恢复会覆盖当前/)
  console.log('backup page public contract: ok')
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
