const cloud = require('wx-server-sdk')
const {
  INVITE_TTL_MS,
  FamilyError,
  authorize,
  cleanFood,
  cleanHistory,
  cleanMagnets,
  cleanPurchase,
  cleanText,
  deterministicInviteCode,
  hashInviteCode,
  isInviteUsable,
  migrationDocumentId,
  normalizeInviteCode,
  publicMember,
  stableId,
  validateExpectedVersion
} = require('./domain')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database({ throwOnNotFound: false })

const COLLECTIONS = {
  families: 'families',
  members: 'family_members',
  invites: 'family_invites',
  foods: 'family_foods',
  purchases: 'family_purchases',
  history: 'family_history',
  doors: 'family_doors',
  activity: 'family_activity',
  migrations: 'family_migrations',
  backups: 'backup_versions',
  restoreJobs: 'restore_jobs',
  exportJobs: 'export_jobs'
}

const MAX_MANUAL_BACKUPS = 3
const EXPORT_TTL_MS = 24 * 60 * 60 * 1000

function unwrapTransaction(result) {
  return result && Object.prototype.hasOwnProperty.call(result, 'result') ? result.result : result
}

function requestId(event) {
  const value = cleanText(event.requestId, 100)
  if (!value) throw new FamilyError('missing-request-id', '请重试这次操作')
  return value
}

async function readDoc(ref) {
  try {
    const snapshot = await ref.get()
    return snapshot && snapshot.data || null
  } catch (error) {
    if (error && (error.errCode === -502001 || String(error.errMsg || '').includes('not exist'))) return null
    throw error
  }
}

async function readAll(query, max = Infinity) {
  const records = []
  let offset = 0
  while (records.length < max) {
    const result = await query.skip(offset).limit(Math.min(100, max - records.length)).get()
    const page = result && Array.isArray(result.data) ? result.data : []
    records.push(...page)
    if (page.length < 100) break
    offset += page.length
  }
  return records
}

async function readPage(query, offset = 0) {
  const page = await query.skip(offset).limit(100).get()
  const records = page && Array.isArray(page.data) ? page.data : []
  return {
    records,
    paging: records.length < 100
      ? { complete: true, nextOffset: null }
      : { complete: false, nextOffset: offset + records.length }
  }
}

function familyPageQuery(source, type, familyId) {
  const sortField = type === 'history' ? 'handledAt' : 'createdAt'
  return source.collection(COLLECTIONS[type]).where({ familyId }).orderBy(sortField, 'asc')
}

async function getMember(openid) {
  return readDoc(db.collection(COLLECTIONS.members).doc(openid))
}

async function getActiveFamily(member) {
  authorize(member)
  const family = await readDoc(db.collection(COLLECTIONS.families).doc(member.familyId))
  if (!family || family.status !== 'active') throw new FamilyError('family-unavailable', '这个家庭已经不可用')
  assertFamilyWritable(family)
  return family
}

function publicFamily(family) {
  return {
    familyId: family._id,
    name: family.name,
    adminMemberId: family.adminMemberId,
    createdAt: family.createdAt,
    updatedAt: family.updatedAt,
    syncRevision: Number(family.syncRevision) || 0,
    maintenance: family.restoreJobId ? { type: 'restore' } : null
  }
}

function assertFamilyWritable(family) {
  if (family && family.restoreJobId) throw new FamilyError('family-maintenance', '家庭数据正在恢复，请稍后再试')
}

function publicRecord(record) {
  if (!record) return null
  const {
    _id,
    familyId,
    migrationId,
    createdByMemberId,
    updatedByMemberId,
    actorOpenid,
    result,
    ...data
  } = record
  return { id: _id, ...data }
}

function backupSummary(snapshot) {
  const magnets = snapshot.door && Array.isArray(snapshot.door.magnets) ? snapshot.door.magnets : []
  const photos = magnets.reduce((count, magnet) => {
    if (!magnet || magnet.type === 'photo') return count + (magnet && magnet.content ? 1 : 0)
    return count + (magnet.type === 'album' && Array.isArray(magnet.photos) ? magnet.photos.length : 0)
  }, 0)
  return {
    foods: snapshot.foods.length,
    history: snapshot.history.length,
    purchases: snapshot.purchases.length,
    magnets: magnets.length,
    photos
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

function replaceDoorFiles(magnets, replacements) {
  return magnets.map(magnet => {
    if (!magnet || !['photo', 'album'].includes(magnet.type)) return magnet
    if (magnet.type === 'photo') return { ...magnet, content: replacements.get(magnet.content) }
    const photos = magnet.photos.map(fileID => replacements.get(fileID))
    return { ...magnet, content: photos[0], photos }
  })
}

async function copyDoorFiles(magnets, destinationPrefix) {
  const files = [...new Set(doorFileIds(magnets))]
  const replacements = new Map()
  try {
    for (let start = 0; start < files.length; start += 5) {
      await Promise.all(files.slice(start, start + 5).map(async (fileID, offset) => {
        const extension = String(fileID).split('?')[0].match(/\.([a-zA-Z0-9]{1,5})$/)
        const downloaded = await cloud.downloadFile({ fileID })
        const uploaded = await cloud.uploadFile({
          cloudPath: `${destinationPrefix}/${start + offset}.${extension ? extension[1].toLowerCase() : 'jpg'}`,
          fileContent: downloaded.fileContent
        })
        replacements.set(fileID, uploaded.fileID)
      }))
    }
  } catch (error) {
    const copied = [...replacements.values()]
    if (copied.length) await deleteBackupFiles({ mediaFileIDs: copied })
    throw error
  }
  return { magnets: replaceDoorFiles(magnets, replacements), mediaFileIDs: [...replacements.values()] }
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

async function familyBackupRecords(familyId, kind = 'manual') {
  const records = await readAll(db.collection(COLLECTIONS.backups).where({ familyId, kind }))
  return records.sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
}

async function createFamilyBackupRecord(openid, event, kind = 'manual', preserveBackupId = '') {
  const member = await getMember(openid)
  authorize(member, 'admin')
  const family = await getActiveFamily(member)
  const rid = requestId(event)
  const id = stableId(kind === 'preRestore' ? 'family-safety' : 'family-backup', family._id, rid)
  const existing = await readDoc(db.collection(COLLECTIONS.backups).doc(id))
  if (existing) return { ok: true, data: publicBackup(existing) }

  const [foods, purchases, history, door] = await Promise.all([
    readAll(db.collection(COLLECTIONS.foods).where({ familyId: family._id })),
    readAll(db.collection(COLLECTIONS.purchases).where({ familyId: family._id })),
    readAll(db.collection(COLLECTIONS.history).where({ familyId: family._id })),
    readDoc(db.collection(COLLECTIONS.doors).doc(family._id))
  ])
  const latestFamily = await getActiveFamily(member)
  if ((Number(latestFamily.syncRevision) || 0) !== (Number(family.syncRevision) || 0)) {
    throw new FamilyError('family-changed', '家庭数据刚刚发生变化，请重试')
  }

  const cleanRecord = record => {
    const { familyId, migrationId, actorOpenid, ...data } = record || {}
    return data
  }
  const copied = await copyDoorFiles(Array.isArray(door && door.magnets) ? door.magnets : [], `backups/family/${family._id}/${id}/media`)
  const snapshot = {
    family: { name: family.name },
    foods: foods.map(cleanRecord),
    purchases: purchases.map(cleanRecord),
    history: history.map(cleanRecord),
    door: { magnets: copied.magnets }
  }
  let snapshotPath
  try {
    const uploaded = await cloud.uploadFile({
      cloudPath: `backups/family/${family._id}/${id}/snapshot.json`,
      fileContent: Buffer.from(JSON.stringify(snapshot))
    })
    snapshotPath = uploaded.fileID
  } catch (error) {
    if (copied.mediaFileIDs.length) await deleteBackupFiles({ mediaFileIDs: copied.mediaFileIDs })
    throw error
  }
  const record = {
    familyId: family._id,
    scopeType: 'family',
    scopeKey: family._id,
    kind,
    status: 'available',
    schemaVersion: 1,
    requestId: rid,
    createdByMemberId: member.memberId,
    sourceRevision: Number(family.syncRevision) || 0,
    createdAt: Date.now(),
    summary: backupSummary(snapshot),
    snapshotPath,
    mediaFileIDs: copied.mediaFileIDs
  }
  const limit = kind === 'preRestore' ? 1 : MAX_MANUAL_BACKUPS
  const previous = await familyBackupRecords(family._id, kind)
  try {
    await db.collection(COLLECTIONS.backups).doc(id).set({ data: record })
    if (previous.length >= limit) {
      const expired = previous[previous.length - 1]
      if (expired._id !== preserveBackupId) {
        await deleteBackupFiles(expired)
        await db.collection(COLLECTIONS.backups).doc(expired._id).remove()
      }
    }
  } catch (error) {
    try { await db.collection(COLLECTIONS.backups).doc(id).remove() } catch (cleanupError) {}
    await deleteBackupFiles(record)
    throw error
  }
  return { ok: true, data: publicBackup({ _id: id, ...record }) }
}

async function createFamilyBackup(openid, event) {
  return createFamilyBackupRecord(openid, event)
}

async function listFamilyBackups(openid) {
  const member = await getMember(openid)
  authorize(member, 'admin')
  await getActiveFamily(member)
  const [manual, safety] = await Promise.all([
    familyBackupRecords(member.familyId),
    familyBackupRecords(member.familyId, 'preRestore')
  ])
  return { ok: true, data: { backups: [...safety.slice(0, 1), ...manual.slice(0, MAX_MANUAL_BACKUPS)].sort((a, b) => b.createdAt - a.createdAt).map(publicBackup) } }
}

async function deleteFamilyBackup(openid, event) {
  const member = await getMember(openid)
  authorize(member, 'admin')
  await getActiveFamily(member)
  const backup = await readDoc(db.collection(COLLECTIONS.backups).doc(cleanText(event.backupId, 100)))
  if (!backup || backup.familyId !== member.familyId) throw new FamilyError('backup-not-found', '备份不存在或已删除')
  await deleteBackupFiles(backup)
  await db.collection(COLLECTIONS.backups).doc(backup._id).remove()
  return { ok: true, data: { deleted: true } }
}

async function readBackupSnapshot(snapshotPath) {
  const downloaded = await cloud.downloadFile({ fileID: snapshotPath })
  const snapshot = JSON.parse(downloaded.fileContent.toString('utf8'))
  if (!snapshot || !snapshot.family || typeof snapshot.family.name !== 'string' || !Array.isArray(snapshot.foods) || !Array.isArray(snapshot.purchases) || !Array.isArray(snapshot.history) || !snapshot.door || !Array.isArray(snapshot.door.magnets)) {
    throw new FamilyError('backup-incompatible', '这个备份版本暂不支持恢复')
  }
  return snapshot
}

async function deleteExportJob(record) {
  if (record && record.fileID) await cloud.deleteFile({ fileList: [record.fileID] })
  if (record && record._id) await db.collection(COLLECTIONS.exportJobs).doc(record._id).remove()
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

async function createFamilyExport(openid, event) {
  const member = await getMember(openid)
  authorize(member, 'admin')
  await getActiveFamily(member)
  const rid = requestId(event)
  const backupId = cleanText(event.backupId, 100)
  const id = stableId('family-export', member.familyId, rid)
  const existing = await readDoc(db.collection(COLLECTIONS.exportJobs).doc(id))
  if (existing && existing.backupId !== backupId) throw new FamilyError('request-conflict', '这次导出请求与原任务不一致')
  if (existing && existing.expiresAt > Date.now()) return { ok: true, data: publicExport(existing) }
  if (existing) await deleteExportJob(existing)

  const backup = await readDoc(db.collection(COLLECTIONS.backups).doc(backupId))
  if (!backup || backup.familyId !== member.familyId || backup.status !== 'available') throw new FamilyError('backup-not-found', '备份不存在或已删除')
  if (backup.schemaVersion !== 1) throw new FamilyError('backup-incompatible', '这个备份版本暂不支持导出')
  const snapshot = await readBackupSnapshot(backup.snapshotPath)
  const createdAt = Date.now()
  const { buildExportPackage } = require('./export-package')
  const built = await buildExportPackage({
    snapshot,
    scopeType: 'family',
    createdAt,
    downloadFile: async fileID => (await cloud.downloadFile({ fileID })).fileContent
  })
  const uploaded = await cloud.uploadFile({
    cloudPath: `exports/family/${member.familyId}/${id}.zip`,
    fileContent: built.buffer
  })
  const record = {
    familyId: member.familyId,
    scopeType: 'family',
    backupId,
    requestId: rid,
    status: 'available',
    fileID: uploaded.fileID,
    fileName: built.fileName,
    size: built.buffer.length,
    checksum: built.checksum,
    createdAt,
    expiresAt: createdAt + EXPORT_TTL_MS
  }
  try {
    await db.collection(COLLECTIONS.exportJobs).doc(id).set({ data: record })
  } catch (error) {
    await cloud.deleteFile({ fileList: [uploaded.fileID] })
    throw error
  }
  return { ok: true, data: publicExport({ _id: id, ...record }) }
}

async function familyExportStatus(openid, event) {
  const member = await getMember(openid)
  authorize(member, 'admin')
  await getActiveFamily(member)
  const job = await readDoc(db.collection(COLLECTIONS.exportJobs).doc(cleanText(event.exportId, 100)))
  if (!job || job.familyId !== member.familyId) throw new FamilyError('export-not-found', '导出文件不存在')
  if (job.expiresAt <= Date.now()) {
    await deleteExportJob(job)
    throw new FamilyError('export-expired', '导出文件已过期，请重新导出')
  }
  const maxAge = Math.max(1, Math.min(86400, Math.floor((job.expiresAt - Date.now()) / 1000)))
  const result = await cloud.getTempFileURL({ fileList: [{ fileID: job.fileID, maxAge }] })
  const file = result.fileList && result.fileList[0]
  if (!file || !file.tempFileURL) throw new Error('export-url-unavailable')
  return { ok: true, data: { ...publicExport(job), downloadUrl: file.tempFileURL } }
}

function restoredRecord(record, familyId, memberId, version) {
  const { _id, id, familyId: oldFamilyId, migrationId, actorOpenid, createdByMemberId, updatedByMemberId, ...data } = record || {}
  return {
    id: cleanText(_id || id, 100),
    data: {
      ...data,
      familyId,
      ...(Object.prototype.hasOwnProperty.call(data, 'version') ? { version } : {}),
      updatedByMemberId: memberId,
      updatedAt: Date.now()
    }
  }
}

async function restoreFamilyBackup(openid, event) {
  const member = await getMember(openid)
  authorize(member, 'admin')
  const rid = requestId(event)
  const backupId = cleanText(event.backupId, 100)
  const jobId = stableId('family-restore', member.familyId, rid)
  const jobRef = db.collection(COLLECTIONS.restoreJobs).doc(jobId)
  const existingJob = await readDoc(jobRef)
  if (existingJob && existingJob.backupId !== backupId) throw new FamilyError('request-conflict', '这次恢复请求与原任务不一致')
  if (existingJob && existingJob.status === 'committed') {
    return { ok: true, data: { jobId, status: 'committed', safetyBackupId: existingJob.safetyBackupId } }
  }

  const family = await readDoc(db.collection(COLLECTIONS.families).doc(member.familyId))
  if (!family || family.status !== 'active') throw new FamilyError('family-unavailable', '这个家庭已经不可用')
  if (family.restoreJobId && family.restoreJobId !== jobId) throw new FamilyError('family-maintenance', '家庭数据正在恢复，请稍后再试')

  const target = await readDoc(db.collection(COLLECTIONS.backups).doc(backupId))
  if (!target || target.familyId !== member.familyId || target.status !== 'available') throw new FamilyError('backup-not-found', '备份不存在或已删除')
  if (target.schemaVersion !== 1) throw new FamilyError('backup-incompatible', '这个备份版本暂不支持恢复')

  let job = existingJob
  if (!job) {
    const safety = await createFamilyBackupRecord(openid, { requestId: `restore-safety-${rid}` }, 'preRestore', target.kind === 'preRestore' ? target._id : '')
    job = {
      familyId: member.familyId,
      scopeType: 'family',
      backupId,
      requestId: rid,
      status: 'prepared',
      safetyBackupId: safety.data.backupId,
      expectedRevision: Number(family.syncRevision) || 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    await jobRef.set({ data: job })
  }

  let copied = { magnets: [], mediaFileIDs: [] }
  let oldDoorFiles = []
  try {
    await db.runTransaction(async transaction => {
      const latestMember = await readDoc(transaction.collection(COLLECTIONS.members).doc(openid))
      authorize(latestMember, 'admin')
      const familyRef = transaction.collection(COLLECTIONS.families).doc(member.familyId)
      const latestFamily = await readDoc(familyRef)
      if (!latestFamily || latestFamily.status !== 'active') throw new FamilyError('family-unavailable', '这个家庭已经不可用')
      if (latestFamily.restoreJobId && latestFamily.restoreJobId !== jobId) throw new FamilyError('family-maintenance', '家庭数据正在恢复，请稍后再试')
      if (!latestFamily.restoreJobId && (Number(latestFamily.syncRevision) || 0) !== Number(job.expectedRevision)) throw new FamilyError('family-changed', '家庭数据刚刚发生变化，请重试')
      await familyRef.update({ data: { restoreJobId: jobId, updatedAt: Date.now() } })
      await transaction.collection(COLLECTIONS.restoreJobs).doc(jobId).update({ data: { status: 'writing', updatedAt: Date.now() } })
    })
    const snapshot = await readBackupSnapshot(target.snapshotPath)
    copied = await copyDoorFiles(snapshot.door.magnets, `families/${member.familyId}/restore-${jobId}`)
    const nextRevision = Number(job.expectedRevision) + 1
    await db.runTransaction(async transaction => {
      const familyRef = transaction.collection(COLLECTIONS.families).doc(member.familyId)
      const latestFamily = await readDoc(familyRef)
      if (!latestFamily || latestFamily.restoreJobId !== jobId) throw new FamilyError('restore-interrupted', '恢复任务状态已经变化，请重试')
      const currentDoor = await readDoc(transaction.collection(COLLECTIONS.doors).doc(member.familyId))
      oldDoorFiles = doorFileIds(currentDoor && currentDoor.magnets)

      for (const type of ['foods', 'purchases', 'history']) {
        const current = await readAll(transaction.collection(COLLECTIONS[type]).where({ familyId: member.familyId }))
        for (const record of current) await transaction.collection(COLLECTIONS[type]).doc(record._id).remove()
        for (const record of snapshot[type]) {
          const restored = restoredRecord(record, member.familyId, member.memberId, nextRevision)
          if (!restored.id) throw new FamilyError('backup-incompatible', '备份中存在无效记录')
          await transaction.collection(COLLECTIONS[type]).doc(restored.id).set({ data: restored.data })
        }
      }

      const now = Date.now()
      await transaction.collection(COLLECTIONS.doors).doc(member.familyId).set({ data: {
        familyId: member.familyId,
        magnets: copied.magnets,
        revision: Number(currentDoor && currentDoor.revision) + 1,
        updatedByMemberId: member.memberId,
        updatedAt: now
      } })
      await familyRef.update({ data: { name: cleanText(snapshot.family.name, 20), syncRevision: nextRevision, restoreJobId: '', updatedAt: now } })
      await transaction.collection(COLLECTIONS.activity).doc(stableId('activity', member.familyId, jobId)).set({ data: {
        familyId: member.familyId,
        memberId: member.memberId,
        nickname: member.nickname,
        action: 'family-restored',
        targetText: '恢复了家庭备份',
        createdAt: now,
        result: { jobId, backupId }
      } })
      await transaction.collection(COLLECTIONS.restoreJobs).doc(jobId).update({ data: { status: 'committed', mediaFileIDs: copied.mediaFileIDs, updatedAt: now, committedAt: now } })
    })
  } catch (error) {
    if (copied.mediaFileIDs.length) await deleteBackupFiles({ mediaFileIDs: copied.mediaFileIDs })
    try {
      const latestFamily = await readDoc(db.collection(COLLECTIONS.families).doc(member.familyId))
      if (latestFamily && latestFamily.restoreJobId === jobId) await db.collection(COLLECTIONS.families).doc(member.familyId).update({ data: { restoreJobId: '', updatedAt: Date.now() } })
      await jobRef.update({ data: { status: 'failed', retryable: true, updatedAt: Date.now() } })
    } catch (cleanupError) {}
    throw error
  }
  try {
    if (oldDoorFiles.length) await deleteBackupFiles({ mediaFileIDs: oldDoorFiles })
    if (target.kind === 'preRestore' && target._id !== job.safetyBackupId) {
      await deleteBackupFiles(target)
      await db.collection(COLLECTIONS.backups).doc(target._id).remove()
    }
  } catch (cleanupError) {}
  return { ok: true, data: { jobId, status: 'committed', safetyBackupId: job.safetyBackupId } }
}

async function familyRestoreStatus(openid, event) {
  const member = await getMember(openid)
  authorize(member, 'admin')
  const job = await readDoc(db.collection(COLLECTIONS.restoreJobs).doc(cleanText(event.jobId, 100)))
  if (!job || job.familyId !== member.familyId) throw new FamilyError('restore-not-found', '恢复任务不存在')
  return { ok: true, data: { jobId: job._id, status: job.status, safetyBackupId: job.safetyBackupId } }
}

async function publicDoor(magnets) {
  const fileIDs = doorFileIds(magnets)
  if (!fileIDs.length) return { magnets: magnets || [], mediaExpiresAt: 0 }
  try {
    const result = await cloud.getTempFileURL({ fileList: fileIDs.map(fileID => ({ fileID, maxAge: 3600 })) })
    const urls = new Map((result.fileList || []).filter(item => item.tempFileURL).map(item => [item.fileID, item.tempFileURL]))
    const publicMagnets = (magnets || []).map(magnet => {
      if (magnet.type === 'photo') return { ...magnet, cloudFileID: magnet.content, content: urls.get(magnet.content) || magnet.content }
      if (magnet.type === 'album') return {
        ...magnet,
        photoFileIDs: (magnet.photos || []).slice(),
        photos: (magnet.photos || []).map(fileID => urls.get(fileID) || fileID),
        content: urls.get(magnet.content) || magnet.content
      }
      return magnet
    })
    return { magnets: publicMagnets, mediaExpiresAt: Date.now() + 50 * 60 * 1000 }
  } catch (error) {
    return { magnets: magnets || [], mediaExpiresAt: 0 }
  }
}

function activityText(action, event, fallback = '') {
  const labels = {
    'family-created': '创建了家庭',
    'family-renamed': '修改了家庭名称',
    'member-joined': '加入了家庭',
    'member-left': '退出了家庭',
    'member-removed': '移除了一名成员',
    'admin-transferred': '转让了管理员',
    'family-dissolved': '解散了家庭',
    'food-added': '添加了食物',
    'food-updated': '修改了食物',
    'food-deleted': '删除了食物',
    'food-eaten': '记录了吃完',
    'food-discarded': '记录了丢弃',
    'history-undone': '撤销了处理记录',
    'receipt-committed': '批量录入了小票',
    'door-saved': '更新了冰箱门',
    'migration-finished': '复制了本机数据'
  }
  return cleanText(event.targetText, 60, fallback || labels[action] || '更新了家庭冰箱')
}

function doorFileIds(magnets) {
  const ids = []
  for (const magnet of magnets || []) {
    if (magnet.type === 'photo' && magnet.content) ids.push(magnet.content)
    if (magnet.type === 'album') ids.push(...(magnet.photos || []))
  }
  return [...new Set(ids)]
}

function validateDoorFiles(magnets, familyId) {
  const marker = `/families/${familyId}/`
  if (doorFileIds(magnets).some(fileID => !String(fileID).includes(marker))) {
    throw new FamilyError('invalid-door-media', '家庭照片路径无效')
  }
}

async function mutateAsMember(openid, event, role, action, worker) {
  const rid = requestId(event)
  const knownMember = await getMember(openid)
  authorize(knownMember, role)
  const familyId = knownMember.familyId
  const activityId = stableId('activity', familyId, rid)
  return unwrapTransaction(await db.runTransaction(async transaction => {
    const member = await readDoc(transaction.collection(COLLECTIONS.members).doc(openid))
    authorize(member, role)
    if (member.familyId !== familyId) throw new FamilyError('family-changed', '家庭状态已经变化，请刷新')
    const familyRef = transaction.collection(COLLECTIONS.families).doc(familyId)
    const family = await readDoc(familyRef)
    if (!family || family.status !== 'active') throw new FamilyError('family-unavailable', '这个家庭已经不可用')
    assertFamilyWritable(family)
    const activityRef = transaction.collection(COLLECTIONS.activity).doc(activityId)
    const previous = await readDoc(activityRef)
    if (previous && previous.result) return previous.result
    const result = await worker(transaction, member, family)
    const now = Date.now()
    await familyRef.update({ data: { updatedAt: now, syncRevision: (Number(family.syncRevision) || 0) + 1 } })
    await activityRef.set({ data: {
      familyId,
      memberId: member.memberId,
      nickname: member.nickname,
      action,
      targetText: activityText(action, event),
      createdAt: now,
      result
    } })
    return result
  }))
}

async function bootstrap(openid) {
  const member = await getMember(openid)
  if (!member) return { ok: true, data: { family: null, member: null } }
  const family = await readDoc(db.collection(COLLECTIONS.families).doc(member.familyId))
  if (!family || family.status !== 'active') return { ok: true, data: { family: null, member: null } }
  const familyId = member.familyId
  const syncRevision = Number(family.syncRevision) || 0
  const [members, foodsPage, purchasesPage, historyPage, door, activities, migrations] = await Promise.all([
    readAll(db.collection(COLLECTIONS.members).where({ familyId }), 100),
    readPage(familyPageQuery(db, 'foods', familyId)),
    readPage(familyPageQuery(db, 'purchases', familyId)),
    readPage(familyPageQuery(db, 'history', familyId)),
    readDoc(db.collection(COLLECTIONS.doors).doc(familyId)),
    db.collection(COLLECTIONS.activity).where({ familyId }).orderBy('createdAt', 'desc').limit(20).get(),
    readAll(db.collection(COLLECTIONS.migrations).where({ familyId }))
  ])
  const latestFamily = await readDoc(db.collection(COLLECTIONS.families).doc(familyId))
  if (!latestFamily || latestFamily.status !== 'active' || (Number(latestFamily.syncRevision) || 0) !== syncRevision) {
    throw new FamilyError('family-changed', '家庭数据刚刚发生变化，请重试')
  }
  const activityRecords = activities && Array.isArray(activities.data) ? activities.data : []
  const committed = new Set(migrations.filter(item => item.status === 'committed').map(item => item._id))
  const visible = record => !record.migrationId || committed.has(record.migrationId)
  const publicDoorData = await publicDoor(door && door.magnets || [])
  return {
    ok: true,
    data: {
      family: publicFamily(family),
      member: publicMember(member),
      members: members.map(publicMember).sort((a, b) => (a.role === 'admin' ? -1 : b.role === 'admin' ? 1 : a.joinedAt - b.joinedAt)),
      foods: foodsPage.records.filter(visible).map(publicRecord),
      purchases: purchasesPage.records.filter(visible).map(publicRecord).sort((a, b) => b.createdAt - a.createdAt),
      history: historyPage.records.filter(visible).map(publicRecord).sort((a, b) => b.handledAt - a.handledAt),
      door: door ? { ...publicDoorData, revision: door.revision || 0 } : { magnets: [], revision: 0, mediaExpiresAt: 0 },
      activity: activityRecords
        .map(item => ({ id: item._id, memberId: item.memberId, nickname: item.nickname, action: item.action, targetText: item.targetText, createdAt: item.createdAt })),
      paging: {
        foods: foodsPage.paging,
        purchases: purchasesPage.paging,
        history: historyPage.paging
      },
      syncedAt: Date.now()
    }
  }
}

async function bootstrapPage(openid, event) {
  const type = event.type
  if (!['foods', 'purchases', 'history'].includes(type)) throw new FamilyError('invalid-page', '同步分页无效')
  const member = await getMember(openid)
  const family = await getActiveFamily(member)
  const syncRevision = Number(family.syncRevision) || 0
  const expectedRevision = Object.prototype.hasOwnProperty.call(event, 'syncRevision') ? Number(event.syncRevision) : syncRevision
  if (expectedRevision !== syncRevision) throw new FamilyError('family-changed', '家庭数据刚刚发生变化，请重试')
  const offset = Math.max(0, Math.floor(Number(event.offset) || 0))
  const [page, migrations] = await Promise.all([
    readPage(familyPageQuery(db, type, family._id), offset),
    readAll(db.collection(COLLECTIONS.migrations).where({ familyId: family._id }))
  ])
  const latestFamily = await readDoc(db.collection(COLLECTIONS.families).doc(family._id))
  if (!latestFamily || latestFamily.status !== 'active' || (Number(latestFamily.syncRevision) || 0) !== syncRevision) {
    throw new FamilyError('family-changed', '家庭数据刚刚发生变化，请重试')
  }
  const committed = new Set(migrations.filter(item => item.status === 'committed').map(item => item._id))
  const visible = record => !record.migrationId || committed.has(record.migrationId)
  return { ok: true, data: { records: page.records.filter(visible).map(publicRecord), paging: page.paging } }
}

async function familyStatus(openid, event) {
  const member = await getMember(openid)
  if (!member) return { ok: true, data: { familyId: null, syncRevision: 0, unchanged: false } }
  const family = await readDoc(db.collection(COLLECTIONS.families).doc(member.familyId))
  if (!family || family.status !== 'active') return { ok: true, data: { familyId: null, syncRevision: 0, unchanged: false } }
  const syncRevision = Number(family.syncRevision) || 0
  return {
    ok: true,
    data: {
      familyId: family._id,
      syncRevision,
      unchanged: event.familyId === family._id && Number(event.syncRevision) === syncRevision,
      ...(family.restoreJobId ? { maintenance: { type: 'restore' } } : {})
    }
  }
}

async function doorMedia(openid) {
  const member = await getMember(openid)
  await getActiveFamily(member)
  const door = await readDoc(db.collection(COLLECTIONS.doors).doc(member.familyId))
  const result = await publicDoor(door && door.magnets || [])
  return { ok: true, data: { ...result, revision: door && door.revision || 0 } }
}

async function previewInvite(event) {
  const code = normalizeInviteCode(event.code)
  if (code.length !== 8) throw new FamilyError('invalid-invite', '请输入完整的 8 位邀请码')
  const invite = await readDoc(db.collection(COLLECTIONS.invites).doc(hashInviteCode(code)))
  if (!isInviteUsable(invite)) throw new FamilyError('invite-unavailable', '邀请已过期或被作废')
  const family = await readDoc(db.collection(COLLECTIONS.families).doc(invite.familyId))
  if (!family || family.status !== 'active') throw new FamilyError('family-unavailable', '这个家庭已经不可用')
  const members = await readAll(db.collection(COLLECTIONS.members).where({ familyId: invite.familyId }), 100)
  return { ok: true, data: { familyName: family.name, inviter: invite.createdByNickname, memberCount: members.length, code } }
}

async function createFamily(openid, event) {
  const rid = requestId(event)
  const name = cleanText(event.name, 20)
  const nickname = cleanText(event.nickname, 12)
  if (!name || !nickname) throw new FamilyError('invalid-family', '请填写家庭名称和家庭称呼')
  const familyId = stableId('family', openid, rid)
  const memberId = stableId('member', openid)
  const activityId = stableId('activity', familyId, rid)
  const result = unwrapTransaction(await db.runTransaction(async transaction => {
    const memberRef = transaction.collection(COLLECTIONS.members).doc(openid)
    const existing = await readDoc(memberRef)
    if (existing) {
      if (existing.familyId === familyId) return { familyId }
      throw new FamilyError('already-in-family', '每个用户只能加入一个家庭')
    }
    const now = Date.now()
    await transaction.collection(COLLECTIONS.families).doc(familyId).set({ data: {
      name,
      status: 'active',
      adminMemberId: memberId,
      createdAt: now,
      updatedAt: now,
      syncRevision: 1
    } })
    await memberRef.set({ data: { familyId, memberId, nickname, role: 'admin', joinedAt: now, updatedAt: now } })
    await transaction.collection(COLLECTIONS.doors).doc(familyId).set({ data: { familyId, magnets: [], revision: 0, updatedAt: now } })
    await transaction.collection(COLLECTIONS.activity).doc(activityId).set({ data: {
      familyId,
      memberId,
      nickname,
      action: 'family-created',
      targetText: `创建了“${name}”`,
      createdAt: now,
      result: { familyId }
    } })
    return { familyId }
  }))
  return { ok: true, data: result }
}

async function createInvite(openid, event) {
  const known = await getMember(openid)
  authorize(known, 'admin')
  const rid = requestId(event)
  const code = deterministicInviteCode(known.familyId, openid, rid)
  const expiresAt = Date.now() + INVITE_TTL_MS
  const result = await mutateAsMember(openid, event, 'admin', 'invite-created', async (transaction, member) => {
    await transaction.collection(COLLECTIONS.invites).doc(hashInviteCode(code)).set({ data: {
      familyId: member.familyId,
      createdByMemberId: member.memberId,
      createdByNickname: member.nickname,
      active: true,
      createdAt: Date.now(),
      expiresAt
    } })
    return { code, expiresAt }
  })
  return { ok: true, data: result }
}

async function revokeInvite(openid, event) {
  const code = normalizeInviteCode(event.code)
  if (code.length !== 8) throw new FamilyError('invalid-invite', '邀请码无效')
  const result = await mutateAsMember(openid, event, 'admin', 'invite-revoked', async (transaction, member) => {
    const ref = transaction.collection(COLLECTIONS.invites).doc(hashInviteCode(code))
    const invite = await readDoc(ref)
    if (!invite || invite.familyId !== member.familyId) throw new FamilyError('invite-unavailable', '邀请已经不可用')
    await ref.update({ data: { active: false, revokedAt: Date.now() } })
    return { revoked: true }
  })
  return { ok: true, data: result }
}

async function joinFamily(openid, event) {
  const rid = requestId(event)
  const code = normalizeInviteCode(event.code)
  const nickname = cleanText(event.nickname, 12)
  if (code.length !== 8 || !nickname) throw new FamilyError('invalid-join', '请填写家庭称呼和完整邀请码')
  const inviteId = hashInviteCode(code)
  const memberId = stableId('member', openid)
  const result = unwrapTransaction(await db.runTransaction(async transaction => {
    const memberRef = transaction.collection(COLLECTIONS.members).doc(openid)
    const invite = await readDoc(transaction.collection(COLLECTIONS.invites).doc(inviteId))
    if (invite) {
      const previous = await readDoc(transaction.collection(COLLECTIONS.activity).doc(stableId('activity', invite.familyId, rid)))
      if (previous && previous.result) return previous.result
    }
    if (!isInviteUsable(invite)) throw new FamilyError('invite-unavailable', '邀请已过期或被作废')
    const existing = await readDoc(memberRef)
    if (existing) throw new FamilyError('already-in-family', '每个用户只能加入一个家庭')
    const family = await readDoc(transaction.collection(COLLECTIONS.families).doc(invite.familyId))
    if (!family || family.status !== 'active') throw new FamilyError('family-unavailable', '这个家庭已经不可用')
    const activityId = stableId('activity', invite.familyId, rid)
    const now = Date.now()
    await memberRef.set({ data: { familyId: invite.familyId, memberId, nickname, role: 'member', joinedAt: now, updatedAt: now } })
    await transaction.collection(COLLECTIONS.families).doc(invite.familyId).update({ data: {
      updatedAt: now,
      syncRevision: (Number(family.syncRevision) || 0) + 1
    } })
    const joined = { familyId: invite.familyId, memberId }
    await transaction.collection(COLLECTIONS.activity).doc(activityId).set({ data: {
      familyId: invite.familyId,
      memberId,
      nickname,
      action: 'member-joined',
      targetText: `${nickname}加入了家庭`,
      createdAt: now,
      result: joined
    } })
    return joined
  }))
  return { ok: true, data: result }
}

async function renameFamily(openid, event) {
  const name = cleanText(event.name, 20)
  if (!name) throw new FamilyError('invalid-family-name', '请填写家庭名称')
  const result = await mutateAsMember(openid, event, 'admin', 'family-renamed', async (transaction, member) => {
    await transaction.collection(COLLECTIONS.families).doc(member.familyId).update({ data: { name, updatedAt: Date.now() } })
    return { name }
  })
  return { ok: true, data: result }
}

async function leaveFamily(openid, event) {
  const result = await mutateAsMember(openid, event, 'member', 'member-left', async (transaction, member) => {
    if (member.role === 'admin') throw new FamilyError('admin-transfer-required', '请先转让管理员或解散家庭')
    await transaction.collection(COLLECTIONS.members).doc(openid).remove()
    return { left: true }
  })
  return { ok: true, data: result }
}

async function findMemberByPublicId(familyId, memberId) {
  const result = await db.collection(COLLECTIONS.members).where({ familyId, memberId }).limit(1).get()
  return result.data && result.data[0] || null
}

async function removeMember(openid, event) {
  const actor = await getMember(openid)
  authorize(actor, 'admin')
  const target = await findMemberByPublicId(actor.familyId, cleanText(event.memberId, 80))
  if (!target || target.role === 'admin') throw new FamilyError('invalid-member', '无法移除这名成员')
  const targetOpenid = target._id
  const result = await mutateAsMember(openid, event, 'admin', 'member-removed', async (transaction, member) => {
    const latest = await readDoc(transaction.collection(COLLECTIONS.members).doc(targetOpenid))
    if (!latest || latest.familyId !== member.familyId || latest.role === 'admin') throw new FamilyError('invalid-member', '成员状态已经变化')
    await transaction.collection(COLLECTIONS.members).doc(targetOpenid).remove()
    return { memberId: latest.memberId }
  })
  return { ok: true, data: result }
}

async function transferAdmin(openid, event) {
  const actor = await getMember(openid)
  authorize(actor, 'admin')
  const target = await findMemberByPublicId(actor.familyId, cleanText(event.memberId, 80))
  if (!target || target.role !== 'member') throw new FamilyError('invalid-member', '请选择一名普通成员')
  const targetOpenid = target._id
  const result = await mutateAsMember(openid, event, 'admin', 'admin-transferred', async (transaction, member) => {
    const latest = await readDoc(transaction.collection(COLLECTIONS.members).doc(targetOpenid))
    if (!latest || latest.familyId !== member.familyId || latest.role !== 'member') throw new FamilyError('invalid-member', '成员状态已经变化')
    const now = Date.now()
    await transaction.collection(COLLECTIONS.members).doc(openid).update({ data: { role: 'member', updatedAt: now } })
    await transaction.collection(COLLECTIONS.members).doc(targetOpenid).update({ data: { role: 'admin', updatedAt: now } })
    await transaction.collection(COLLECTIONS.families).doc(member.familyId).update({ data: { adminMemberId: latest.memberId, updatedAt: now } })
    return { adminMemberId: latest.memberId }
  })
  return { ok: true, data: result }
}

async function dissolveFamily(openid, event) {
  const actor = await getMember(openid)
  authorize(actor, 'admin')
  requestId(event)
  const familyId = actor.familyId
  await db.runTransaction(async transaction => {
    const member = await readDoc(transaction.collection(COLLECTIONS.members).doc(openid))
    authorize(member, 'admin')
    const familyRef = transaction.collection(COLLECTIONS.families).doc(familyId)
    const family = await readDoc(familyRef)
    if (!family || !['active', 'deleting'].includes(family.status)) throw new FamilyError('family-unavailable', '这个家庭已经不可用')
    if (family.status === 'active') await familyRef.update({ data: { status: 'deleting', updatedAt: Date.now() } })
  })

  const door = await readDoc(db.collection(COLLECTIONS.doors).doc(familyId))
  const files = doorFileIds(door && door.magnets)
  for (let index = 0; index < files.length; index += 50) {
    await cloud.deleteFile({ fileList: files.slice(index, index + 50) })
  }
  const backupRecords = [
    ...(await familyBackupRecords(familyId)),
    ...(await familyBackupRecords(familyId, 'preRestore'))
  ]
  for (const backup of backupRecords) await deleteBackupFiles(backup)
  const exportRecords = await readAll(db.collection(COLLECTIONS.exportJobs).where({ familyId }))
  for (const exportRecord of exportRecords) await deleteExportJob(exportRecord)
  for (const collectionName of [COLLECTIONS.invites, COLLECTIONS.foods, COLLECTIONS.purchases, COLLECTIONS.history, COLLECTIONS.doors, COLLECTIONS.activity, COLLECTIONS.migrations, COLLECTIONS.backups, COLLECTIONS.restoreJobs]) {
    await db.collection(collectionName).where({ familyId }).remove()
  }

  await db.runTransaction(async transaction => {
    const member = await readDoc(transaction.collection(COLLECTIONS.members).doc(openid))
    authorize(member, 'admin')
    const familyRef = transaction.collection(COLLECTIONS.families).doc(familyId)
    const family = await readDoc(familyRef)
    if (!family || family.status !== 'deleting') throw new FamilyError('family-unavailable', '这个家庭已经不可用')
    const members = await readAll(transaction.collection(COLLECTIONS.members).where({ familyId }))
    for (const item of members) await transaction.collection(COLLECTIONS.members).doc(item._id).remove()
    await familyRef.remove()
  })
  return { ok: true, data: { dissolved: true } }
}

async function addFood(openid, event) {
  const food = cleanFood(event.food)
  const rid = requestId(event)
  const result = await mutateAsMember(openid, event, 'member', 'food-added', async (transaction, member) => {
    const id = stableId('food', member.familyId, rid)
    const now = Date.now()
    await transaction.collection(COLLECTIONS.foods).doc(id).set({ data: {
      ...food,
      familyId: member.familyId,
      version: 1,
      createdByMemberId: member.memberId,
      updatedByMemberId: member.memberId,
      createdAt: now,
      updatedAt: now
    } })
    return { id, version: 1 }
  })
  return { ok: true, data: result }
}

async function updateFood(openid, event) {
  const food = cleanFood(event.food)
  const id = cleanText(event.id, 80)
  const result = await mutateAsMember(openid, event, 'member', 'food-updated', async (transaction, member) => {
    const ref = transaction.collection(COLLECTIONS.foods).doc(id)
    const current = validateExpectedVersion(await readDoc(ref), Number(event.expectedVersion))
    if (current.familyId !== member.familyId) throw new FamilyError('not-found', '记录已经不存在')
    const version = current.version + 1
    await ref.update({ data: { ...food, version, updatedByMemberId: member.memberId, updatedAt: Date.now() } })
    return { id, version }
  })
  return { ok: true, data: result }
}

async function deleteFood(openid, event) {
  const id = cleanText(event.id, 80)
  const result = await mutateAsMember(openid, event, 'member', 'food-deleted', async (transaction, member) => {
    const ref = transaction.collection(COLLECTIONS.foods).doc(id)
    const current = validateExpectedVersion(await readDoc(ref), Number(event.expectedVersion))
    if (current.familyId !== member.familyId) throw new FamilyError('not-found', '记录已经不存在')
    await ref.remove()
    return { id }
  })
  return { ok: true, data: result }
}

async function processFoods(openid, event) {
  const ids = Array.isArray(event.ids) ? [...new Set(event.ids.filter(item => typeof item === 'string'))].slice(0, 26) : []
  const outcome = event.outcome
  if (!ids.length || ids.length > 25 || !['eaten', 'discarded'].includes(outcome)) throw new FamilyError('invalid-process', '一次最多处理 25 项食物')
  const versions = event.expectedVersions && typeof event.expectedVersions === 'object' ? event.expectedVersions : {}
  const action = outcome === 'discarded' ? 'food-discarded' : 'food-eaten'
  const rid = requestId(event)
  const result = await mutateAsMember(openid, event, 'member', action, async (transaction, member) => {
    const handledAt = Date.now()
    const history = []
    for (const id of ids) {
      const foodRef = transaction.collection(COLLECTIONS.foods).doc(id)
      const food = validateExpectedVersion(await readDoc(foodRef), Number(versions[id]))
      if (food.familyId !== member.familyId) throw new FamilyError('not-found', '食物已经不存在')
      const historyId = stableId('history', member.familyId, rid, id)
      const { _id, familyId, migrationId, ...snapshot } = food
      await transaction.collection(COLLECTIONS.history).doc(historyId).set({ data: {
        familyId: member.familyId,
        foodId: id,
        food: snapshot,
        outcome,
        handledAt,
        handledByMemberId: member.memberId
      } })
      await foodRef.remove()
      history.push(historyId)
    }
    return { processedCount: history.length, history }
  })
  return { ok: true, data: result }
}

async function undoHistory(openid, event) {
  const id = cleanText(event.id, 80)
  const result = await mutateAsMember(openid, event, 'member', 'history-undone', async (transaction, member) => {
    const historyRef = transaction.collection(COLLECTIONS.history).doc(id)
    const history = await readDoc(historyRef)
    if (!history || history.familyId !== member.familyId) throw new FamilyError('not-found', '处理记录已经不存在')
    const foodRef = transaction.collection(COLLECTIONS.foods).doc(history.foodId)
    if (await readDoc(foodRef)) throw new FamilyError('conflict', '这项食物已被恢复，请刷新')
    const now = Date.now()
    await foodRef.set({ data: {
      ...cleanFood(history.food),
      familyId: member.familyId,
      version: Math.max(1, Number(history.food.version) || 1) + 1,
      createdByMemberId: history.food.createdByMemberId || member.memberId,
      updatedByMemberId: member.memberId,
      createdAt: history.food.createdAt || now,
      updatedAt: now
    } })
    await historyRef.remove()
    return { id, foodId: history.foodId }
  })
  return { ok: true, data: result }
}

async function commitReceipt(openid, event) {
  const purchase = cleanPurchase(event.purchase)
  const foods = Array.isArray(event.foods) ? event.foods.slice(0, 50).map(cleanFood) : []
  if (!foods.length || foods.length !== purchase.items.length) throw new FamilyError('invalid-purchase', '小票商品与库存不一致')
  const rid = requestId(event)
  const result = await mutateAsMember(openid, event, 'member', 'receipt-committed', async (transaction, member) => {
    const purchaseId = stableId('purchase', member.familyId, rid)
    const now = Date.now()
    await transaction.collection(COLLECTIONS.purchases).doc(purchaseId).set({ data: {
      ...purchase,
      familyId: member.familyId,
      version: 1,
      createdByMemberId: member.memberId,
      createdAt: now,
      updatedAt: now
    } })
    const foodIds = []
    for (let index = 0; index < foods.length; index += 1) {
      const id = stableId('food', member.familyId, rid, String(index))
      const item = { ...foods[index], purchaseId, purchaseItemId: purchase.items[index].id }
      await transaction.collection(COLLECTIONS.foods).doc(id).set({ data: {
        ...item,
        familyId: member.familyId,
        version: 1,
        createdByMemberId: member.memberId,
        updatedByMemberId: member.memberId,
        createdAt: now + index,
        updatedAt: now
      } })
      foodIds.push(id)
    }
    return { purchaseId, foodIds, count: foodIds.length }
  })
  return { ok: true, data: result }
}

async function saveDoor(openid, event) {
  const magnets = cleanMagnets(event.magnets)
  let filesToDelete = []
  const result = await mutateAsMember(openid, event, 'member', 'door-saved', async (transaction, member) => {
    validateDoorFiles(magnets, member.familyId)
    const ref = transaction.collection(COLLECTIONS.doors).doc(member.familyId)
    const current = await readDoc(ref) || { familyId: member.familyId, magnets: [], revision: 0 }
    if (current.revision !== Number(event.expectedRevision)) {
      throw new FamilyError('conflict', '冰箱门刚被其他成员更新，请重新确认', { latest: { magnets: current.magnets || [], revision: current.revision || 0 } })
    }
    const incomingFiles = new Set(doorFileIds(magnets))
    filesToDelete = doorFileIds(current.magnets).filter(fileID => !incomingFiles.has(fileID))
    const revision = current.revision + 1
    await ref.set({ data: { familyId: member.familyId, magnets, revision, updatedByMemberId: member.memberId, updatedAt: Date.now() } })
    return { revision }
  })
  if (filesToDelete.length) {
    try { await deleteBackupFiles({ mediaFileIDs: filesToDelete }) } catch (error) {}
  }
  return { ok: true, data: result }
}

async function beginMigration(openid, event) {
  const member = await getMember(openid)
  authorize(member)
  await getActiveFamily(member)
  const rid = requestId(event)
  const migrationId = stableId('migration', member.familyId, openid, rid)
  const expectedInput = event.expected && typeof event.expected === 'object' ? event.expected : {}
  const expected = {
    foods: Math.max(0, Math.min(500, Number(expectedInput.foods) || 0)),
    purchases: Math.max(0, Math.min(500, Number(expectedInput.purchases) || 0)),
    history: Math.max(0, Math.min(500, Number(expectedInput.history) || 0)),
    door: Math.max(0, Math.min(60, Number(expectedInput.door) || 0))
  }
  const ref = db.collection(COLLECTIONS.migrations).doc(migrationId)
  const existing = await readDoc(ref)
  if (!existing) await ref.set({ data: {
    familyId: member.familyId,
    ownerMemberId: member.memberId,
    status: 'pending',
    expected,
    imported: { foods: 0, purchases: 0, history: 0, door: 0 },
    expectedDoorRevision: Number(event.expectedDoorRevision) || 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  } })
  return { ok: true, data: { migrationId } }
}

async function importMigrationBatch(openid, event) {
  const member = await getMember(openid)
  authorize(member)
  const migrationId = cleanText(event.migrationId, 80)
  const type = event.type
  const maxItems = type === 'door' ? 60 : 15
  const sourceItems = Array.isArray(event.items) ? event.items : []
  const items = sourceItems.slice(0, maxItems + 1)
  if (!['foods', 'purchases', 'history', 'door'].includes(type) || !items.length || items.length > maxItems) {
    throw new FamilyError('invalid-migration-batch', '迁移批次无效')
  }
  const result = unwrapTransaction(await db.runTransaction(async transaction => {
    const family = await readDoc(transaction.collection(COLLECTIONS.families).doc(member.familyId))
    if (!family || family.status !== 'active') throw new FamilyError('family-unavailable', '这个家庭已经不可用')
    assertFamilyWritable(family)
    const migrationRef = transaction.collection(COLLECTIONS.migrations).doc(migrationId)
    const migration = await readDoc(migrationRef)
    if (!migration || migration.familyId !== member.familyId || migration.ownerMemberId !== member.memberId || migration.status !== 'pending') {
      throw new FamilyError('migration-unavailable', '迁移任务已经不可用')
    }
    if (type === 'door') {
      const magnets = cleanMagnets(items).map(item => ({ ...item, id: migrationDocumentId(member.familyId, 'magnets', item.id) }))
      validateDoorFiles(magnets, member.familyId)
      await migrationRef.update({ data: {
        pendingDoor: magnets,
        imported: { ...migration.imported, door: magnets.length },
        updatedAt: Date.now()
      } })
      return { imported: magnets.length }
    }
    const collectionName = COLLECTIONS[type]
    let added = 0
    for (const source of items) {
      const sourceId = cleanText(source && source.id, 100)
      if (!sourceId) continue
      const id = migrationDocumentId(member.familyId, type, sourceId)
      const ref = transaction.collection(collectionName).doc(id)
      if (await readDoc(ref)) continue
      let data
      if (type === 'foods') {
        data = cleanFood(source)
        if (source.purchaseId) data.purchaseId = migrationDocumentId(member.familyId, 'purchases', source.purchaseId)
        data = { ...data, version: 1, createdAt: Number(source.createdAt) || Date.now(), updatedAt: Date.now() }
      } else if (type === 'purchases') {
        data = { ...cleanPurchase(source), version: 1, createdAt: Number(source.createdAt) || Date.now(), updatedAt: Date.now() }
      } else {
        const history = cleanHistory(source)
        if (history.food.purchaseId) history.food.purchaseId = migrationDocumentId(member.familyId, 'purchases', history.food.purchaseId)
        data = {
          ...history,
          foodId: migrationDocumentId(member.familyId, 'foods', source.food && source.food.id || sourceId),
          handledAt: Number(source.handledAt) || Date.now()
        }
      }
      await ref.set({ data: { ...data, familyId: member.familyId, migrationId, createdByMemberId: member.memberId } })
      added += 1
    }
    await migrationRef.update({ data: {
      imported: { ...migration.imported, [type]: Number(migration.imported[type] || 0) + added },
      updatedAt: Date.now()
    } })
    return { imported: added }
  }))
  return { ok: true, data: result }
}

async function finishMigration(openid, event) {
  const member = await getMember(openid)
  authorize(member)
  const migrationId = cleanText(event.migrationId, 80)
  const rid = requestId(event)
  const result = unwrapTransaction(await db.runTransaction(async transaction => {
    const familyRef = transaction.collection(COLLECTIONS.families).doc(member.familyId)
    const family = await readDoc(familyRef)
    if (!family || family.status !== 'active') throw new FamilyError('family-unavailable', '这个家庭已经不可用')
    assertFamilyWritable(family)
    const migrationRef = transaction.collection(COLLECTIONS.migrations).doc(migrationId)
    const migration = await readDoc(migrationRef)
    if (!migration || migration.familyId !== member.familyId || migration.ownerMemberId !== member.memberId) {
      throw new FamilyError('migration-unavailable', '迁移任务已经不可用')
    }
    if (migration.status === 'committed') return { migrationId, committed: true }
    for (const type of ['foods', 'purchases', 'history', 'door']) {
      if (Number(migration.imported[type] || 0) < Number(migration.expected[type] || 0)) {
        throw new FamilyError('migration-incomplete', '仍有本机数据没有复制完成')
      }
    }
    if (migration.expected.door > 0) {
      const doorRef = transaction.collection(COLLECTIONS.doors).doc(member.familyId)
      const door = await readDoc(doorRef) || { familyId: member.familyId, magnets: [], revision: 0 }
      if (door.revision !== migration.expectedDoorRevision) throw new FamilyError('conflict', '家庭门板已经变化，请重新开始复制', { latest: { magnets: door.magnets || [], revision: door.revision || 0 } })
      const incoming = migration.pendingDoor || []
      const incomingIds = new Set(incoming.map(item => item.id))
      const magnets = [...(door.magnets || []).filter(item => !incomingIds.has(item.id)), ...incoming]
      if (magnets.length > 60) throw new FamilyError('door-full', '家庭门板最多保留 60 枚冰箱贴')
      await doorRef.set({ data: {
        familyId: member.familyId,
        magnets,
        revision: door.revision + 1,
        updatedByMemberId: member.memberId,
        updatedAt: Date.now()
      } })
    }
    await migrationRef.update({ data: { status: 'committed', committedAt: Date.now(), updatedAt: Date.now() } })
    await familyRef.update({ data: { updatedAt: Date.now(), syncRevision: (Number(family.syncRevision) || 0) + 1 } })
    await transaction.collection(COLLECTIONS.activity).doc(stableId('activity', member.familyId, rid)).set({ data: {
      familyId: member.familyId,
      memberId: member.memberId,
      nickname: member.nickname,
      action: 'migration-finished',
      targetText: '复制了本机数据',
      createdAt: Date.now(),
      result: { migrationId, committed: true }
    } })
    return { migrationId, committed: true }
  }))
  return { ok: true, data: result }
}

exports.main = async (event = {}) => {
  const { OPENID } = cloud.getWXContext()
  if (!OPENID) return { ok: false, error: 'unauthorized', message: '请先登录微信' }
  try {
    switch (event.action) {
      case 'bootstrap': return await bootstrap(OPENID)
      case 'bootstrapPage': return await bootstrapPage(OPENID, event)
      case 'status': return await familyStatus(OPENID, event)
      case 'doorMedia': return await doorMedia(OPENID)
      case 'previewInvite': return await previewInvite(event)
      case 'createFamily': return await createFamily(OPENID, event)
      case 'createInvite': return await createInvite(OPENID, event)
      case 'revokeInvite': return await revokeInvite(OPENID, event)
      case 'joinFamily': return await joinFamily(OPENID, event)
      case 'renameFamily': return await renameFamily(OPENID, event)
      case 'leaveFamily': return await leaveFamily(OPENID, event)
      case 'removeMember': return await removeMember(OPENID, event)
      case 'transferAdmin': return await transferAdmin(OPENID, event)
      case 'dissolveFamily': return await dissolveFamily(OPENID, event)
      case 'createBackup': return await createFamilyBackup(OPENID, event)
      case 'listBackups': return await listFamilyBackups(OPENID)
      case 'deleteBackup': return await deleteFamilyBackup(OPENID, event)
      case 'restoreBackup': return await restoreFamilyBackup(OPENID, event)
      case 'restoreStatus': return await familyRestoreStatus(OPENID, event)
      case 'createExport': return await createFamilyExport(OPENID, event)
      case 'exportStatus': return await familyExportStatus(OPENID, event)
      case 'addFood': return await addFood(OPENID, event)
      case 'updateFood': return await updateFood(OPENID, event)
      case 'deleteFood': return await deleteFood(OPENID, event)
      case 'processFoods': return await processFoods(OPENID, event)
      case 'undoHistory': return await undoHistory(OPENID, event)
      case 'commitReceipt': return await commitReceipt(OPENID, event)
      case 'saveDoor': return await saveDoor(OPENID, event)
      case 'beginMigration': return await beginMigration(OPENID, event)
      case 'importMigrationBatch': return await importMigrationBatch(OPENID, event)
      case 'finishMigration': return await finishMigration(OPENID, event)
      default: return { ok: false, error: 'invalid-action', message: '不支持的家庭操作' }
    }
  } catch (error) {
    if (error instanceof FamilyError) {
      return {
        ok: false,
        error: error.code,
        message: error.message,
        ...(error.latest ? { latest: publicRecord(error.latest) } : {})
      }
    }
    console.error('[family]', event.action, String(error && (error.errMsg || error.message) || error))
    return { ok: false, error: 'family-server-error', message: '家庭冰箱暂时无法同步，请稍后重试' }
  }
}
