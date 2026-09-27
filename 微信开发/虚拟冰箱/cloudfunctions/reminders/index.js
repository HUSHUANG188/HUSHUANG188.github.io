const cloud = require('wx-server-sdk')
const config = require('./reminder.config')
const {
  collectDueFoods,
  isReminderTimeDue,
  buildTemplateData,
  shanghaiDateTime
} = require('./reminder')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const schedules = db.collection('reminder_schedules')
const familyMembers = db.collection('family_members')
const familyFoods = db.collection('family_foods')
const familyMigrations = db.collection('family_migrations')

function cleanSettings(settings = {}) {
  return {
    enabled: settings.enabled === true,
    time: /^\d{2}:\d{2}$/.test(settings.time) ? settings.time : '09:00',
    permission: ['accepted', 'denied', 'error', 'sent'].includes(settings.permission)
      ? settings.permission
      : 'unknown'
  }
}

function cleanFoods(foods) {
  if (!Array.isArray(foods)) return []
  return foods.slice(0, 100).filter((food) => (
    food &&
    typeof food.name === 'string' &&
    food.name.trim() &&
    /^\d{4}-\d{2}-\d{2}$/.test(food.expireDate)
  )).map((food) => ({
    name: food.name.trim().slice(0, 20),
    expireDate: food.expireDate
  }))
}

async function findSchedule(openid) {
  const result = await schedules.where({ openid }).limit(1).get()
  return result.data[0] || null
}

async function findFamilyMember(openid) {
  try {
    const result = await familyMembers.doc(openid).get()
    return result.data || null
  } catch (error) {
    if (error && (error.errCode === -502001 || String(error.errMsg || '').includes('not exist'))) return null
    throw error
  }
}

async function readFamilyFoods(familyId) {
  const foods = []
  let offset = 0
  while (foods.length < 500) {
    const result = await familyFoods.where({ familyId }).skip(offset).limit(100).get()
    foods.push(...result.data)
    if (result.data.length < 100) break
    offset += result.data.length
  }
  const migrationIds = [...new Set(foods.map(item => item.migrationId).filter(Boolean))]
  const committed = new Set()
  for (const migrationId of migrationIds) {
    try {
      const result = await familyMigrations.doc(migrationId).get()
      if (result.data && result.data.status === 'committed') committed.add(migrationId)
    } catch (error) {}
  }
  return cleanFoods(foods.filter(item => !item.migrationId || committed.has(item.migrationId)))
}

async function syncSchedule(event, openid, appid) {
  if (!openid) return { ok: false, error: 'missing-openid' }
  const existing = await findSchedule(openid)
  const settings = cleanSettings(event.settings)
  const newGrant = event.subscriptionGranted === true && settings.permission === 'accepted'
  const appidAdded = Boolean(existing && !existing.appid && appid)
  const familyMember = await findFamilyMember(openid)

  if (existing && existing.permission === 'sent' && !newGrant) {
    settings.enabled = false
    settings.permission = 'sent'
  }

  const record = {
    openid,
    ...(appid ? { appid } : {}),
    ...settings,
    familyId: familyMember && familyMember.familyId || '',
    foods: settings.enabled && !familyMember ? cleanFoods(event.foods) : [],
    updatedAt: db.serverDate()
  }
  if (newGrant || appidAdded) {
    record.sentForDate = ''
    record.attemptedForDate = ''
    record.lastError = ''
  }

  if (existing) {
    const { _id, ...storedRecord } = existing
    await schedules.doc(_id).set({ data: { ...storedRecord, ...record } })
  } else {
    await schedules.add({ data: { ...record, sentForDate: '', attemptedForDate: '', lastError: '' } })
  }
  return { ok: true }
}

async function getStatus(openid) {
  if (!openid) return {}
  const record = await findSchedule(openid)
  if (!record) return {}
  return {
    settings: {
      enabled: record.enabled === true,
      time: record.time,
      permission: record.permission
    }
  }
}

async function deleteMyData(openid) {
  if (!openid) return { ok: false, error: 'missing-openid' }
  const record = await findSchedule(openid)
  if (record) await schedules.doc(record._id).remove()
  return { ok: true, data: { deleted: true } }
}

async function listActiveSchedules() {
  const records = []
  let offset = 0
  while (true) {
    const result = await schedules
      .where({ enabled: true, permission: 'accepted' })
      .skip(offset)
      .limit(100)
      .get()
    records.push(...result.data)
    if (result.data.length < 100) return records
    offset += result.data.length
  }
}

async function sendScheduledReminders(now = new Date()) {
  if (!config.templateId || !config.foodNameKey || !config.expireDateKey || !config.statusKey) {
    return { ok: false, error: 'reminder-template-not-configured' }
  }

  const current = shanghaiDateTime(now)
  const records = await listActiveSchedules()
  let sent = 0
  let failed = 0

  for (const record of records) {
    const attemptedDate = record.sentForDate || record.attemptedForDate
    if (!isReminderTimeDue(record.time, now, attemptedDate)) continue
    let reminderFoods = record.foods || []
    if (record.familyId) {
      const currentMember = await findFamilyMember(record.openid)
      if (!currentMember || currentMember.familyId !== record.familyId) {
        await schedules.doc(record._id).update({ data: { enabled: false, lastError: 'family-membership-changed', updatedAt: db.serverDate() } })
        continue
      }
      reminderFoods = await readFamilyFoods(record.familyId)
    }
    const dueFoods = collectDueFoods(reminderFoods, current.date, 3)
    if (!dueFoods.length) continue

    try {
      const message = {
        touser: record.openid,
        templateId: config.templateId,
        page: config.page,
        miniprogramState: config.miniprogramState,
        lang: 'zh_CN',
        data: buildTemplateData(dueFoods, config)
      }
      try {
        await cloud.openapi.subscribeMessage.send(message)
      } catch (error) {
        const detail = String(error.errMsg || error.message || error)
        if (!record.appid || !detail.includes('INVALID_WX_ACCESS_TOKEN')) throw error
        await cloud.openapi({ appid: record.appid }).subscribeMessage.send(message)
      }
      await schedules.doc(record._id).update({
        data: {
          enabled: false,
          permission: 'sent',
          sentForDate: current.date,
          attemptedForDate: current.date,
          lastError: '',
          updatedAt: db.serverDate()
        }
      })
      sent += 1
    } catch (error) {
      await schedules.doc(record._id).update({
        data: {
          attemptedForDate: current.date,
          lastError: String(error.errMsg || error.message || error.errCode || error).slice(0, 300),
          updatedAt: db.serverDate()
        }
      })
      failed += 1
    }
  }

  return { ok: true, checked: records.length, sent, failed }
}

exports.main = async (event = {}) => {
  const { OPENID, APPID, FROM_APPID } = cloud.getWXContext()
  if (event.action === 'sync') return syncSchedule(event, OPENID, FROM_APPID || APPID)
  if (event.action === 'status') return getStatus(OPENID)
  if (event.action === 'deleteMyData') return deleteMyData(OPENID)
  if (OPENID) return { ok: false, error: 'invalid-action' }
  return sendScheduledReminders()
}
