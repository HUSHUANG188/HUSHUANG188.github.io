const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')
const { hashInviteCode } = require('../cloudfunctions/family/domain')

function createCloudFixture() {
  const records = {
    families: [{ _id: 'family-1', name: '测试家庭', status: 'active', adminMemberId: 'member-1', createdAt: 1, updatedAt: 2, syncRevision: 7 }],
    family_members: [{ _id: 'openid-1', familyId: 'family-1', memberId: 'member-1', nickname: '妈妈', role: 'admin', joinedAt: 1 }],
    family_foods: Array.from({ length: 205 }, (_, index) => ({
      _id: `food-${index + 1}`,
      familyId: 'family-1',
      name: `食物${index + 1}`,
      createdAt: index + 1,
      updatedAt: index + 1,
      version: 1
    })),
    family_purchases: [],
    family_history: [],
    family_doors: [{ _id: 'family-1', familyId: 'family-1', magnets: [], revision: 0 }],
    family_activity: Array.from({ length: 125 }, (_, index) => ({
      _id: `activity-${index + 1}`,
      familyId: 'family-1',
      memberId: 'member-1',
      nickname: '妈妈',
      action: 'food-added',
      targetText: `添加了食物${index + 1}`,
      createdAt: index + 1
    })),
    family_migrations: [],
    family_invites: [{ _id: hashInviteCode('ABCDEFGH'), familyId: 'family-1', createdByMemberId: 'member-1', createdByNickname: '妈妈', active: true, expiresAt: 9999999999999 }]
  }
  let currentOpenid = 'openid-1'
  let foodQueryCount = 0

  function query(items, name) {
    let offset = 0
    let limit = 20
    const orders = []
    const reverseWithoutOrder = name === 'family_foods' && foodQueryCount++ % 2 === 1
    return {
      orderBy(field, direction) { orders.push({ field, direction }); return this },
      skip(value) { offset = value; return this },
      limit(value) { limit = value; return this },
      async get() {
        const sorted = (reverseWithoutOrder && !orders.length ? items.slice().reverse() : items.slice()).sort((left, right) => {
          for (const order of orders) {
            const compared = left[order.field] < right[order.field] ? -1 : left[order.field] > right[order.field] ? 1 : 0
            if (compared) return order.direction === 'desc' ? -compared : compared
          }
          return 0
        })
        return { data: sorted.slice(offset, offset + limit) }
      }
    }
  }

  const database = {
    collection(name) {
      const items = records[name] || []
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
          return query(items.filter(item => Object.entries(filter).every(([key, value]) => item[key] === value)), name)
        }
      }
    },
    async runTransaction(worker) { return { result: await worker(database) } }
  }

  return {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    database() { return database },
    getWXContext() { return { OPENID: currentOpenid } },
    _records: records,
    _setOpenid(openid) { currentOpenid = openid },
    async getTempFileURL() { return { fileList: [] } }
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

;(async () => {
  const first = await family.main({ action: 'bootstrap' })
  assert.equal(first.ok, true)
  assert.equal(first.data.foods.length, 100)
  assert.deepEqual(first.data.paging.foods, { complete: false, nextOffset: 100 })
  assert.deepEqual(first.data.activity.map(item => item.id), Array.from({ length: 20 }, (_, index) => `activity-${125 - index}`))

  const second = await family.main({ action: 'bootstrapPage', type: 'foods', offset: first.data.paging.foods.nextOffset, syncRevision: 7 })
  assert.equal(second.ok, true)
  assert.equal(second.data.records.length, 100)
  assert.deepEqual(second.data.paging, { complete: false, nextOffset: 200 })

  const third = await family.main({ action: 'bootstrapPage', type: 'foods', offset: second.data.paging.nextOffset, syncRevision: 7 })
  assert.equal(third.ok, true)
  assert.equal(third.data.records.length, 5)
  assert.deepEqual(third.data.paging, { complete: true, nextOffset: null })
  assert.equal(new Set([...first.data.foods, ...second.data.records, ...third.data.records].map(item => item.id)).size, 205)

  cloudFixture._records.family_foods.push({ _id: 'food-206', familyId: 'family-1', name: '并发新增', createdAt: 206, updatedAt: 206, version: 1 })
  cloudFixture._records.families[0].syncRevision = 8
  const stalePage = await family.main({ action: 'bootstrapPage', type: 'foods', offset: 100, syncRevision: 7 })
  assert.equal(stalePage.ok, false)
  assert.equal(stalePage.error, 'family-changed')
  cloudFixture._records.family_foods.pop()
  cloudFixture._records.families[0].syncRevision = 7

  let pageDefinition
  global.Page = definition => { pageDefinition = definition }
  global.wx = {
    cloud: {
      callFunction({ data, success }) {
        const responses = {
          bootstrap: first,
          'bootstrapPage:foods:100': second,
          'bootstrapPage:foods:200': third
        }
        success({ result: responses[data.action === 'bootstrapPage' ? `${data.action}:${data.type}:${data.offset}` : data.action] })
      }
    }
  }
  const pageEntry = path.join(__dirname, '../pages/index/index.js')
  delete require.cache[require.resolve(pageEntry)]
  require(pageEntry)
  const applied = []
  const page = {
    ...pageDefinition,
    data: { ...pageDefinition.data, familyMode: true },
    pageUnloaded: false,
    setData(values) { this.data = { ...this.data, ...values } },
    applyFamilySnapshot(snapshot) { applied.push(snapshot) }
  }
  assert.equal(await page.refreshFamily(), true)
  assert.equal(applied.length, 1)
  assert.equal(applied[0].foods.length, 205)

  const status = await family.main({ action: 'status', familyId: 'family-1', syncRevision: 7 })
  assert.deepEqual(status, {
    ok: true,
    data: { familyId: 'family-1', syncRevision: 7, unchanged: true }
  })

  const added = await family.main({
    action: 'addFood',
    requestId: 'request-add-1',
    food: { name: '牛奶', quantity: 1, unit: '盒', category: '乳制品', zone: 'fridge', storedAt: '2026-09-05', expireDate: '2026-09-08' }
  })
  assert.equal(added.ok, true)
  const changedStatus = await family.main({ action: 'status', familyId: 'family-1', syncRevision: 7 })
  assert.deepEqual(changedStatus.data, { familyId: 'family-1', syncRevision: 8, unchanged: false })

  const foregroundCalls = []
  global.wx.cloud.callFunction = ({ data, success }) => {
    foregroundCalls.push(data.action)
    success({ result: data.action === 'status' ? status : { ok: false, error: 'unexpected-bootstrap' } })
  }
  const foregroundPage = {
    ...pageDefinition,
    data: { ...pageDefinition.data, familyMode: true },
    familySnapshot: { family: { familyId: 'family-1', syncRevision: 7 } },
    pageUnloaded: false,
    setData(values) { this.data = { ...this.data, ...values } },
    loadDoor() {},
    getStoredState() { return { foods: [], history: [], purchases: [], settings: {}, dietSettings: {} } },
    renderFoods() {},
    renderHistory() {},
    renderPurchases() {},
    renderReminderSettings() {},
    renderDiet() {},
    refreshReminderStatus() {},
    restoreFamilyCache() {},
    applyFamilySnapshot() { throw new Error('unchanged foreground sync must not replace the snapshot') }
  }
  foregroundPage.onShow()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(foregroundCalls, ['status'])

  const mediaCalls = []
  global.wx.cloud.callFunction = ({ data, success }) => {
    mediaCalls.push(data.action)
    if (data.action === 'status') success({ result: status })
    else if (data.action === 'doorMedia') success({ result: {
      ok: true,
      data: { magnets: [{ id: 'photo-1', type: 'photo', content: 'https://temp/new', cloudFileID: 'cloud://env/families/family-1/photo.jpg', xRatio: 0, yRatio: 0, z: 1 }], revision: 1, mediaExpiresAt: Date.now() + 3000000 }
    } })
  }
  const mediaPage = {
    ...foregroundPage,
    data: { ...foregroundPage.data },
    familySnapshot: {
      family: { familyId: 'family-1', syncRevision: 7 },
      door: { magnets: [{ id: 'photo-1', type: 'photo', content: 'https://temp/old', cloudFileID: 'cloud://env/families/family-1/photo.jpg', xRatio: 0, yRatio: 0, z: 1 }], revision: 1, mediaExpiresAt: 1 }
    },
    hydrateDoorMagnets() {},
    cacheFamilySnapshot() {}
  }
  mediaPage.onShow()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(mediaCalls, ['status', 'doorMedia'])
  assert.equal(mediaPage.familySnapshot.door.magnets[0].content, 'https://temp/new')

  const actionCalls = []
  global.wx.showToast = () => {}
  global.wx.cloud.callFunction = ({ data, success }) => {
    actionCalls.push(data)
    success({ result: actionCalls.length === 1
      ? { ok: false, error: 'cloud-failed', message: '网络中断' }
      : { ok: true, data: { id: 'food-new', version: 1 } } })
  }
  const actionPage = {
    ...pageDefinition,
    data: { ...pageDefinition.data, familyMode: true, familyBusy: false },
    setData(values) { this.data = { ...this.data, ...values } },
    async refreshFamily() { return true }
  }
  const actionData = { food: { name: '牛奶', quantity: 1 } }
  assert.equal((await actionPage.runFamilyAction('addFood', actionData)).ok, false)
  assert.equal((await actionPage.runFamilyAction('addFood', actionData)).ok, true)
  actionPage.data.familyBusy = false
  assert.equal((await actionPage.runFamilyAction('addFood', actionData)).ok, true)
  assert.equal(actionCalls[0].requestId, actionCalls[1].requestId)
  assert.notEqual(actionCalls[1].requestId, actionCalls[2].requestId)

  cloudFixture._setOpenid('openid-2')
  const joinEvent = { action: 'joinFamily', requestId: 'request-join-1', code: 'ABCDEFGH', nickname: '爸爸' }
  const firstJoin = await family.main(joinEvent)
  const retriedJoin = await family.main(joinEvent)
  assert.equal(firstJoin.ok, true)
  assert.deepEqual(retriedJoin, firstJoin)

  cloudFixture._setOpenid('openid-1')
  const ids = Array.from({ length: 25 }, (_, index) => `food-${index + 1}`)
  const expectedVersions = Object.fromEntries(ids.map(id => [id, 1]))
  const tooLarge = await family.main({ action: 'processFoods', requestId: 'request-process-too-large', ids: [...ids, 'food-26'], expectedVersions, outcome: 'eaten' })
  assert.equal(tooLarge.ok, false)
  assert.equal(tooLarge.error, 'invalid-process')
  const processEvent = { action: 'processFoods', requestId: 'request-process-1', ids, expectedVersions, outcome: 'eaten' }
  const processed = await family.main(processEvent)
  const retriedProcess = await family.main(processEvent)
  assert.equal(processed.ok, true)
  assert.equal(processed.data.processedCount, 25)
  assert.deepEqual(retriedProcess, processed)

  const legacyCalls = []
  global.wx.cloud.callFunction = ({ data, success }) => {
    legacyCalls.push(data.action)
    success({ result: data.action === 'bootstrap' ? first : status })
  }
  const legacyPage = {
    ...foregroundPage,
    data: { ...foregroundPage.data },
    familySnapshot: { family: { familyId: 'family-1' } },
    applyFamilySnapshot() {}
  }
  legacyPage.onShow()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(legacyCalls, ['bootstrap'])

  console.log('family paginated sync public contract: ok')
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
