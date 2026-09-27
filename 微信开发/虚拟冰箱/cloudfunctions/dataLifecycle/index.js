const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const backups = db.collection('backup_versions')
const restoreJobs = db.collection('restore_jobs')
const exportJobs = db.collection('export_jobs')
const MAX_MANUAL_BACKUPS = 3
const EXPORT_TTL_MS = 24 * 60 * 60 * 1000

function key(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

function backupId(openid, requestId) {
  return `personal-${key(`${openid}|${requestId}`).slice(0, 32)}`
}

function normalizeSnapshot(snapshot = {}) {
  const state = snapshot.state && typeof snapshot.state === 'object' ? snapshot.state : {}
  return {
    state: {
      foods: Array.isArray(state.foods) ? state.foods : [],
      history: Array.isArray(state.history) ? state.history : [],
      purchases: Array.isArray(state.purchases) ? state.purchases : [],
      settings: state.settings && typeof state.settings === 'object' ? state.settings : {},
      dietSettings: state.dietSettings && typeof state.dietSettings === 'object' ? state.dietSettings : {},
      historyClearedAt: Number(state.historyClearedAt) || 0
    },
    magnets: Array.isArray(snapshot.magnets) ? snapshot.magnets : [],
    aiFeedback: Array.isArray(snapshot.aiFeedback) ? snapshot.aiFeedback : []
  }
}

function summary(snapshot) {
  const photos = snapshot.magnets.reduce((count, magnet) => {
    if (!magnet || magnet.type === 'photo') return count + (magnet && magnet.content ? 1 : 0)
    return count + (magnet.type === 'album' && Array.isArray(magnet.photos) ? magnet.photos.length : 0)
  }, 0)
  return {
    foods: snapshot.state.foods.length,
    history: snapshot.state.history.length,
    purchases: snapshot.state.purchases.length,
    magnets: snapshot.magnets.length,
    photos
  }
}

function snapshotFiles(snapshot) {
  return [...new Set(snapshot.magnets.flatMap(magnet => {
    if (!magnet || magnet.type === 'photo') return magnet && magnet.content ? [magnet.content] : []
    return magnet.type === 'album' && Array.isArray(magnet.photos) ? magnet.photos : []
  }))]
}

function replaceSnapshotFiles(snapshot, replacements) {
  return {
    ...snapshot,
    magnets: snapshot.magnets.map(magnet => {
      if (!magnet || !['photo', 'album'].includes(magnet.type)) return magnet
      if (magnet.type === 'photo') return { ...magnet, content: replacements.get(magnet.content) }
      const photos = magnet.photos.map(fileID => replacements.get(fileID))
      return { ...magnet, content: photos[0], photos }
    })
  }
}

async function copySnapshotFiles(snapshot, destinationPrefix) {
  const sources = snapshotFiles(snapshot)
  if (sources.some(fileID => typeof fileID !== 'string' || !fileID.startsWith('cloud://'))) {
    throw new Error('invalid-backup-media')
  }
  const replacements = new Map()
  const copied = []
  try {
    for (let start = 0; start < sources.length; start += 5) {
      await Promise.all(sources.slice(start, start + 5).map(async (fileID, offset) => {
        const extension = fileID.split('?')[0].match(/\.([a-zA-Z0-9]{1,5})$/)
        const downloaded = await cloud.downloadFile({ fileID })
        const uploaded = await cloud.uploadFile({
          cloudPath: `${destinationPrefix}/${start + offset}.${extension ? extension[1].toLowerCase() : 'jpg'}`,
          fileContent: downloaded.fileContent
        })
        copied.push(uploaded.fileID)
        replacements.set(fileID, uploaded.fileID)
      }))
    }
  } catch (error) {
    if (copied.length) await deleteBackupFiles({ mediaFileIDs: copied })
    throw error
  }
  return { snapshot: replaceSnapshotFiles(snapshot, replacements), sources, mediaFileIDs: copied }
}

async function deleteBackupFiles(record) {
  const files = [
    ...(record && Array.isArray(record.mediaFileIDs) ? record.mediaFileIDs : []),
    ...(record && record.snapshotPath ? [record.snapshotPath] : [])
  ]
  for (let index = 0; index < files.length; index += 50) {
    await cloud.deleteFile({ fileList: files.slice(index, index + 50) })
  }
}

function publicBackup(record) {
  return {
    backupId: record._id,
    kind: record.kind,
    status: record.status,
    schemaVersion: record.schemaVersion,
    createdAt: record.createdAt,
    summary: record.summary
  }
}

async function listRecords(ownerKey, kind = 'manual', limit = MAX_MANUAL_BACKUPS) {
  const result = await backups.where({ ownerKey, kind }).orderBy('createdAt', 'desc').limit(limit).get()
  return Array.isArray(result.data) ? result.data : []
}

async function findBackup(id) {
  const result = await backups.where({ _id: id }).limit(1).get()
  return Array.isArray(result.data) ? result.data[0] : null
}

async function createBackupRecord(openid, event, kind = 'manual', preserveBackupId = '') {
  const requestId = typeof event.requestId === 'string' ? event.requestId.trim().slice(0, 80) : ''
  if (!requestId) return { ok: false, error: 'invalid-request', message: '缺少备份请求标识' }

  const id = kind === 'preRestore' ? `personal-safety-${key(`${openid}|${requestId}`).slice(0, 32)}` : backupId(openid, requestId)
  const existing = await findBackup(id)
  if (existing) return { ok: true, data: publicBackup(existing) }

  const ownerKey = key(openid)
  const limit = kind === 'preRestore' ? 1 : MAX_MANUAL_BACKUPS
  const previous = await listRecords(ownerKey, kind, limit)
  const copied = await copySnapshotFiles(normalizeSnapshot(event.snapshot), `backups/personal/${ownerKey}/${id}/media`)
  const snapshot = copied.snapshot
  let snapshotPath
  try {
    const uploaded = await cloud.uploadFile({
      cloudPath: `backups/personal/${ownerKey}/${id}/snapshot.json`,
      fileContent: Buffer.from(JSON.stringify(snapshot))
    })
    snapshotPath = uploaded.fileID
  } catch (error) {
    if (copied.mediaFileIDs.length) await deleteBackupFiles({ mediaFileIDs: copied.mediaFileIDs })
    throw error
  }
  const record = {
    ownerKey,
    scopeType: 'personal',
    kind,
    status: 'available',
    schemaVersion: 1,
    requestId,
    createdAt: Date.now(),
    summary: summary(snapshot),
    snapshotPath,
    mediaFileIDs: copied.mediaFileIDs
  }
  try {
    await backups.doc(id).set({ data: record })
    if (previous.length >= limit) {
      const expired = previous[previous.length - 1]
      if (expired._id !== preserveBackupId) {
        await deleteBackupFiles(expired)
        await backups.doc(expired._id).remove()
      }
    }
  } catch (error) {
    try { await backups.doc(id).remove() } catch (cleanupError) {}
    await deleteBackupFiles(record)
    throw error
  }
  const stagingFiles = copied.sources.filter(fileID => fileID.includes('/backup-staging/'))
  if (stagingFiles.length) await deleteBackupFiles({ mediaFileIDs: stagingFiles })
  return { ok: true, data: publicBackup({ _id: id, ...record }) }
}

async function createBackup(openid, event) {
  return createBackupRecord(openid, event)
}

async function listBackups(openid) {
  const ownerKey = key(openid)
  const [manual, safety] = await Promise.all([
    listRecords(ownerKey),
    listRecords(ownerKey, 'preRestore', 1)
  ])
  return { ok: true, data: { backups: [...safety, ...manual].sort((a, b) => b.createdAt - a.createdAt).map(publicBackup) } }
}

async function findRestoreJob(id) {
  const result = await restoreJobs.where({ _id: id }).limit(1).get()
  return Array.isArray(result.data) ? result.data[0] : null
}

async function readSnapshot(snapshotPath) {
  const downloaded = await cloud.downloadFile({ fileID: snapshotPath })
  const snapshot = JSON.parse(downloaded.fileContent.toString('utf8'))
  if (!snapshot || typeof snapshot !== 'object' || !snapshot.state || !Array.isArray(snapshot.magnets) || !Array.isArray(snapshot.aiFeedback)) {
    throw new Error('invalid-backup-snapshot')
  }
  return snapshot
}

async function findExportJob(id) {
  const result = await exportJobs.where({ _id: id }).limit(1).get()
  return Array.isArray(result.data) ? result.data[0] : null
}

async function deleteExportJob(record) {
  if (record && record.fileID) await cloud.deleteFile({ fileList: [record.fileID] })
  if (record && record._id) await exportJobs.doc(record._id).remove()
}

async function cleanupExpiredExports() {
  const result = await exportJobs.where({ expiresAt: db.command.lt(Date.now()) }).limit(100).get()
  let deleted = 0
  for (const record of result.data || []) {
    try {
      await deleteExportJob(record)
      deleted += 1
    } catch (error) {
      console.error('[data-lifecycle] cleanup export', record._id, String(error && (error.errMsg || error.message) || error))
    }
  }
  return { ok: true, data: { deleted } }
}

function publicExport(record) {
  return {
    exportId: record._id,
    backupId: record.backupId,
    status: record.status,
    fileName: record.fileName,
    size: record.size,
    checksum: record.checksum,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt
  }
}

async function createExport(openid, event) {
  const requestId = typeof event.requestId === 'string' ? event.requestId.trim().slice(0, 80) : ''
  const requestedBackupId = typeof event.backupId === 'string' ? event.backupId : ''
  if (!requestId || !requestedBackupId) return { ok: false, error: 'invalid-request', message: '缺少导出请求信息' }
  const ownerKey = key(openid)
  const id = `personal-export-${key(`${openid}|${requestId}`).slice(0, 32)}`
  const existing = await findExportJob(id)
  if (existing && existing.backupId !== requestedBackupId) return { ok: false, error: 'request-conflict', message: '这次导出请求与原任务不一致' }
  if (existing && existing.expiresAt > Date.now()) return { ok: true, data: publicExport(existing) }
  if (existing) await deleteExportJob(existing)

  const backup = await findBackup(requestedBackupId)
  if (!backup || backup.ownerKey !== ownerKey || backup.status !== 'available') return { ok: false, error: 'backup-not-found', message: '备份不存在或已删除' }
  if (backup.schemaVersion !== 1) return { ok: false, error: 'backup-incompatible', message: '这个备份版本暂不支持导出' }
  const snapshot = await readSnapshot(backup.snapshotPath)
  const createdAt = Date.now()
  const { buildExportPackage } = require('./export-package')
  const built = await buildExportPackage({
    snapshot,
    scopeType: 'personal',
    createdAt,
    downloadFile: async fileID => (await cloud.downloadFile({ fileID })).fileContent
  })
  const uploaded = await cloud.uploadFile({
    cloudPath: `exports/personal/${ownerKey}/${id}.zip`,
    fileContent: built.buffer
  })
  const record = {
    ownerKey,
    scopeType: 'personal',
    backupId: requestedBackupId,
    requestId,
    status: 'available',
    fileID: uploaded.fileID,
    fileName: built.fileName,
    size: built.buffer.length,
    checksum: built.checksum,
    createdAt,
    expiresAt: createdAt + EXPORT_TTL_MS
  }
  try {
    await exportJobs.doc(id).set({ data: record })
  } catch (error) {
    await cloud.deleteFile({ fileList: [uploaded.fileID] })
    throw error
  }
  return { ok: true, data: publicExport({ _id: id, ...record }) }
}

async function exportStatus(openid, event) {
  const job = await findExportJob(typeof event.exportId === 'string' ? event.exportId : '')
  if (!job || job.ownerKey !== key(openid)) return { ok: false, error: 'export-not-found', message: '导出文件不存在' }
  if (job.expiresAt <= Date.now()) {
    await deleteExportJob(job)
    return { ok: false, error: 'export-expired', message: '导出文件已过期，请重新导出' }
  }
  const maxAge = Math.max(1, Math.min(86400, Math.floor((job.expiresAt - Date.now()) / 1000)))
  const result = await cloud.getTempFileURL({ fileList: [{ fileID: job.fileID, maxAge }] })
  const file = result.fileList && result.fileList[0]
  if (!file || !file.tempFileURL) throw new Error('export-url-unavailable')
  return { ok: true, data: { ...publicExport(job), downloadUrl: file.tempFileURL } }
}

async function restoreResult(job) {
  return {
    ok: true,
    data: {
      jobId: job._id,
      status: job.status,
      safetyBackupId: job.safetyBackupId,
      snapshot: await readSnapshot(job.snapshotPath)
    }
  }
}

async function restoreBackup(openid, event) {
  const requestId = typeof event.requestId === 'string' ? event.requestId.trim().slice(0, 80) : ''
  const requestedBackupId = typeof event.backupId === 'string' ? event.backupId : ''
  if (!requestId || !requestedBackupId) return { ok: false, error: 'invalid-request', message: '缺少恢复请求信息' }

  const ownerKey = key(openid)
  const jobId = `personal-restore-${key(`${openid}|${requestId}`).slice(0, 32)}`
  const existingJob = await findRestoreJob(jobId)
  if (existingJob) {
    if (existingJob.backupId !== requestedBackupId) return { ok: false, error: 'request-conflict', message: '这次恢复请求与原任务不一致' }
    return restoreResult(existingJob)
  }

  const target = await findBackup(requestedBackupId)
  if (!target || target.ownerKey !== ownerKey || target.status !== 'available') {
    return { ok: false, error: 'backup-not-found', message: '备份不存在或已删除' }
  }
  if (target.schemaVersion !== 1) return { ok: false, error: 'backup-incompatible', message: '这个备份版本暂不支持恢复' }

  const safety = await createBackupRecord(openid, {
    requestId: `restore-safety-${requestId}`,
    snapshot: event.currentSnapshot
  }, 'preRestore', target.kind === 'preRestore' ? target._id : '')
  if (!safety.ok) return safety

  const sourceSnapshot = await readSnapshot(target.snapshotPath)
  const copied = await copySnapshotFiles(sourceSnapshot, `restores/personal/${ownerKey}/${jobId}/media`)
  let snapshotPath
  try {
    const uploaded = await cloud.uploadFile({
      cloudPath: `restores/personal/${ownerKey}/${jobId}/snapshot.json`,
      fileContent: Buffer.from(JSON.stringify(copied.snapshot))
    })
    snapshotPath = uploaded.fileID
    await restoreJobs.doc(jobId).set({ data: {
      ownerKey,
      scopeType: 'personal',
      backupId: requestedBackupId,
      requestId,
      status: 'prepared',
      safetyBackupId: safety.data.backupId,
      snapshotPath,
      mediaFileIDs: copied.mediaFileIDs,
      createdAt: Date.now(),
      updatedAt: Date.now()
    } })
    if (target.kind === 'preRestore' && target._id !== safety.data.backupId) {
      try {
        await deleteBackupFiles(target)
        await backups.doc(target._id).remove()
      } catch (cleanupError) {}
    }
  } catch (error) {
    const files = [...copied.mediaFileIDs, ...(snapshotPath ? [snapshotPath] : [])]
    if (files.length) await deleteBackupFiles({ mediaFileIDs: files })
    throw error
  }
  return restoreResult({
    _id: jobId,
    status: 'prepared',
    safetyBackupId: safety.data.backupId,
    snapshotPath
  })
}

async function restoreStatus(openid, event) {
  const job = await findRestoreJob(typeof event.jobId === 'string' ? event.jobId : '')
  if (!job || job.ownerKey !== key(openid)) return { ok: false, error: 'restore-not-found', message: '恢复任务不存在' }
  return { ok: true, data: { jobId: job._id, status: job.status } }
}

async function commitRestore(openid, event) {
  const job = await findRestoreJob(typeof event.jobId === 'string' ? event.jobId : '')
  if (!job || job.ownerKey !== key(openid)) return { ok: false, error: 'restore-not-found', message: '恢复任务不存在' }
  if (job.status !== 'committed') {
    await restoreJobs.doc(job._id).update({ data: { status: 'committed', updatedAt: Date.now(), committedAt: Date.now() } })
  }
  return { ok: true, data: { jobId: job._id, status: 'committed' } }
}

async function deleteBackup(openid, event) {
  const id = typeof event.backupId === 'string' ? event.backupId : ''
  const record = id ? await findBackup(id) : null
  if (!record || record.ownerKey !== key(openid)) return { ok: false, error: 'backup-not-found', message: '备份不存在或已删除' }
  await deleteBackupFiles(record)
  await backups.doc(id).remove()
  return { ok: true, data: { deleted: true } }
}

async function deleteMyData(openid) {
  const ownerKey = key(openid)
  const result = await backups.where({ ownerKey }).limit(100).get()
  for (const record of result.data || []) {
    await deleteBackupFiles(record)
    await backups.doc(record._id).remove()
  }
  const jobs = await restoreJobs.where({ ownerKey }).limit(100).get()
  for (const job of jobs.data || []) {
    await deleteBackupFiles(job)
    await restoreJobs.doc(job._id).remove()
  }
  const exports = await exportJobs.where({ ownerKey }).limit(100).get()
  for (const job of exports.data || []) await deleteExportJob(job)
  return { ok: true, data: { deleted: true } }
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  try {
    if (!OPENID && event.Type === 'Timer') return await cleanupExpiredExports()
    if (!OPENID) return { ok: false, error: 'unauthorized', message: '请先登录微信' }
    if (event.action === 'createBackup') return await createBackup(OPENID, event)
    if (event.action === 'listBackups') return await listBackups(OPENID)
    if (event.action === 'deleteBackup') return await deleteBackup(OPENID, event)
    if (event.action === 'restoreBackup') return await restoreBackup(OPENID, event)
    if (event.action === 'restoreStatus') return await restoreStatus(OPENID, event)
    if (event.action === 'commitRestore') return await commitRestore(OPENID, event)
    if (event.action === 'createExport') return await createExport(OPENID, event)
    if (event.action === 'exportStatus') return await exportStatus(OPENID, event)
    if (event.action === 'deleteMyData') return await deleteMyData(OPENID)
    return { ok: false, error: 'invalid-action', message: '不支持的数据管理操作' }
  } catch (error) {
    console.error('[data-lifecycle]', event.action, String(error && (error.errMsg || error.message) || error))
    return { ok: false, error: 'backup-server-error', message: '备份服务暂时不可用，请稍后重试' }
  }
}
