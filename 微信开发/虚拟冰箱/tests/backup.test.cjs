const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

function createCloudFixture() {
  const records = []
  const restoreJobs = []
  const exportJobs = []
  const uploadedFiles = []
  const fileContents = new Map()
  const deletedFiles = []
  let currentOpenid = 'openid-1'

  function matches(record, filter) {
    return Object.entries(filter).every(([key, value]) => record[key] === value)
  }

  function collection(items) {
    return {
    doc(id) {
      return {
        async get() {
          const record = items.find(item => item._id === id)
          if (!record) throw new Error(`document.get:fail document with _id ${id} does not exist`)
          return { data: record }
        },
        async set({ data }) {
          const index = items.findIndex(item => item._id === id)
          const record = { _id: id, ...data }
          if (index < 0) items.push(record)
          else items[index] = record
        },
        async update({ data }) {
          const index = items.findIndex(item => item._id === id)
          if (index < 0) throw new Error(`missing document: ${id}`)
          items[index] = { ...items[index], ...data }
        },
        async remove() {
          const index = items.findIndex(item => item._id === id)
          if (index >= 0) items.splice(index, 1)
        }
      }
    },
    where(filter) {
      let limit = 20
      return {
        orderBy() { return this },
        limit(value) { limit = value; return this },
        async get() {
          return { data: items.filter(item => matches(item, filter)).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit) }
        }
      }
    }
  }
  }

  return {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    database() {
      return {
        collection(name) {
          if (name === 'backup_versions') return collection(records)
          if (name === 'restore_jobs') return collection(restoreJobs)
          if (name === 'export_jobs') return collection(exportJobs)
          assert.fail(`unexpected collection: ${name}`)
        }
      }
    },
    getWXContext() { return { OPENID: currentOpenid } },
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
    _uploadedFiles: uploadedFiles,
    _deletedFiles: deletedFiles,
    _records: records,
    _restoreJobs: restoreJobs,
    _exportJobs: exportJobs,
    _setOpenid(value) { currentOpenid = value }
  }
}

const entry = path.join(__dirname, '../cloudfunctions/dataLifecycle/index.js')
const originalLoad = Module._load
const cloudFixture = createCloudFixture()
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return cloudFixture
  return originalLoad.call(this, request, parent, isMain)
}
const lifecycle = require(entry)
Module._load = originalLoad

;(async () => {
  const first = await lifecycle.main({
    action: 'createBackup',
    requestId: 'personal-1',
    snapshot: {
      state: { foods: [{ id: 'food-1' }], history: [], purchases: [], settings: {}, dietSettings: {}, historyClearedAt: 0 },
      magnets: [{ id: 'photo-1', type: 'photo', content: 'cloud://env/backup-staging/personal-1/photo.jpg' }],
      aiFeedback: []
    }
  })
  assert.equal(first.ok, true)
  assert.deepEqual(first.data.summary, { foods: 1, history: 0, purchases: 0, magnets: 1, photos: 1 })
  assert.equal(cloudFixture._uploadedFiles.length, 2)
  assert.ok(cloudFixture._deletedFiles.includes('cloud://env/backup-staging/personal-1/photo.jpg'))

  const restore = await lifecycle.main({
    action: 'restoreBackup',
    requestId: 'restore-personal-1',
    backupId: first.data.backupId,
    currentSnapshot: {
      state: { foods: [{ id: 'current-food' }], history: [], purchases: [], settings: {}, dietSettings: {} },
      magnets: [],
      aiFeedback: [{ id: 'current-feedback' }]
    }
  })
  assert.equal(restore.ok, true)
  assert.equal(restore.data.status, 'prepared')
  assert.deepEqual(restore.data.snapshot.state.foods, [{ id: 'food-1' }])
  assert.match(restore.data.snapshot.magnets[0].content, /\/restores\/personal\//)
  assert.equal(cloudFixture._records.filter(item => item.kind === 'preRestore').length, 1)
  assert.equal(cloudFixture._restoreJobs.length, 1)

  const committed = await lifecycle.main({ action: 'commitRestore', jobId: restore.data.jobId })
  assert.deepEqual(committed, { ok: true, data: { jobId: restore.data.jobId, status: 'committed' } })
  assert.deepEqual(await lifecycle.main({ action: 'restoreStatus', jobId: restore.data.jobId }), committed)
  const retried = await lifecycle.main({
    action: 'restoreBackup',
    requestId: 'restore-personal-1',
    backupId: first.data.backupId,
    currentSnapshot: { state: {}, magnets: [], aiFeedback: [] }
  })
  assert.equal(retried.data.jobId, restore.data.jobId)
  assert.equal(cloudFixture._records.filter(item => item.kind === 'preRestore').length, 1)

  const retry = await lifecycle.main({ action: 'createBackup', requestId: 'personal-1', snapshot: { state: {}, magnets: [], aiFeedback: [] } })
  assert.equal(retry.data.backupId, first.data.backupId)

  const listed = await lifecycle.main({ action: 'listBackups' })
  assert.equal(listed.ok, true)
  assert.equal(listed.data.backups.length, 2)
  assert.deepEqual(listed.data.backups.find(item => item.kind === 'manual').summary, first.data.summary)
  assert.equal(listed.data.backups.find(item => item.kind === 'preRestore').backupId, restore.data.safetyBackupId)

  const safetyRestore = await lifecycle.main({
    action: 'restoreBackup',
    requestId: 'restore-personal-safety',
    backupId: restore.data.safetyBackupId,
    currentSnapshot: {
      state: { foods: [{ id: 'food-1' }], history: [], purchases: [], settings: {}, dietSettings: {} },
      magnets: [],
      aiFeedback: []
    }
  })
  assert.equal(safetyRestore.ok, true)
  assert.deepEqual(safetyRestore.data.snapshot.state.foods, [{ id: 'current-food' }])
  assert.equal(cloudFixture._records.filter(item => item.kind === 'preRestore').length, 1)

  for (let index = 2; index <= 4; index += 1) {
    const created = await lifecycle.main({
      action: 'createBackup',
      requestId: `personal-${index}`,
      snapshot: { state: { foods: [], history: [], purchases: [] }, magnets: [], aiFeedback: [] }
    })
    assert.equal(created.ok, true)
  }
  const retained = (await lifecycle.main({ action: 'listBackups' })).data.backups
  assert.equal(retained.filter(item => item.kind === 'manual').length, 3)
  assert.equal(retained.filter(item => item.kind === 'preRestore').length, 1)

  cloudFixture._setOpenid('openid-2')
  assert.equal((await lifecycle.main({ action: 'listBackups' })).data.backups.length, 0)
  assert.equal((await lifecycle.main({ action: 'deleteBackup', backupId: first.data.backupId })).error, 'backup-not-found')
  assert.equal((await lifecycle.main({ action: 'createBackup', requestId: 'other-user', snapshot: {} })).ok, true)

  cloudFixture._setOpenid('openid-1')
  const latest = (await lifecycle.main({ action: 'listBackups' })).data.backups.find(item => item.kind === 'manual')
  assert.deepEqual(await lifecycle.main({ action: 'deleteBackup', backupId: latest.backupId }), { ok: true, data: { deleted: true } })
  assert.equal((await lifecycle.main({ action: 'listBackups' })).data.backups.filter(item => item.kind === 'manual').length, 2)
  assert.deepEqual(await lifecycle.main({ action: 'deleteMyData' }), { ok: true, data: { deleted: true } })
  assert.equal((await lifecycle.main({ action: 'listBackups' })).data.backups.length, 0)
  assert.ok(cloudFixture._uploadedFiles.slice(0, 2).every(fileID => cloudFixture._deletedFiles.includes(fileID)))

  cloudFixture._setOpenid('openid-2')
  assert.equal((await lifecycle.main({ action: 'listBackups' })).data.backups.length, 1)

  console.log('personal backup public contract: ok')
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
