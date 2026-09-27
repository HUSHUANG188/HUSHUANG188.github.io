const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const Module = require('node:module')
const path = require('node:path')

function createCloudFixture() {
  const documents = new Map()
  let openid = 'user-1'
  const database = {
    collection(name) {
      return {
        doc(id) {
          const key = `${name}/${id}`
          return {
            async get() { return { data: documents.get(key) || null } },
            async set({ data }) { documents.set(key, data) }
          }
        }
      }
    },
    async runTransaction(worker) { return { result: await worker(database) } }
  }
  return {
    DYNAMIC_CURRENT_ENV: 'test',
    init() {},
    database() { return database },
    getWXContext() { return { OPENID: openid } },
    setOpenid(value) { openid = value }
  }
}

function createHttpsFixture() {
  let calls = 0
  let nextStatus = 200
  return {
    get calls() { return calls },
    failNext(status = 503) { nextStatus = status },
    request(options, callback) {
      const request = new EventEmitter()
      request.destroy = error => { if (error) request.emit('error', error) }
      request.end = () => {
        calls += 1
        const status = nextStatus
        nextStatus = 200
        const response = new EventEmitter()
        response.statusCode = status
        response.setEncoding = () => {}
        callback(response)
        queueMicrotask(() => {
          response.emit('data', JSON.stringify(status >= 200 && status < 300 ? {
            model: 'deepseek-test',
            choices: [{ finish_reason: 'stop', message: { content: '{"recipes":[]}' } }],
            usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }
          } : { error: { message: 'provider unavailable' } }))
          response.emit('end')
          request.emit('close')
        })
      }
      return request
    }
  }
}

const cloudFixture = createCloudFixture()
const httpsFixture = createHttpsFixture()
const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return cloudFixture
  if (request === 'https') return httpsFixture
  return originalLoad.call(this, request, parent, isMain)
}
const entry = path.join(__dirname, '../cloudfunctions/mealAi/index.js')
delete require.cache[require.resolve(entry)]
const mealAi = require(entry)
Module._load = originalLoad

const originalNow = Date.now
const originalApiKey = process.env.DEEPSEEK_API_KEY
const originalInfo = console.info
const originalError = console.error
const operationalLogs = []
let now = Date.parse('2026-09-05T00:00:00+08:00')
Date.now = () => now
process.env.DEEPSEEK_API_KEY = 'test-key'
console.info = (label, details) => operationalLogs.push({ level: 'info', label, details })
console.error = (label, details) => operationalLogs.push({ level: 'error', label, details })

const event = {
  action: 'recipes',
  foods: [{ name: '白菜', category: '蔬菜水果', quantity: 1, unit: '份', expireDate: '2026-09-06' }],
  dietSettings: { preferences: [], allergens: [], avoids: [] }
}

;(async () => {
  const first = await mealAi.main(event)
  assert.equal(first.ok, true)
  assert.equal(httpsFixture.calls, 1)
  assert.deepEqual(operationalLogs[0], {
    level: 'info',
    label: '[meal-ai]',
    details: {
      outcome: 'success',
      durationMs: 0,
      model: 'deepseek-test',
      usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 }
    }
  })

  cloudFixture.setOpenid('provider-failure-user')
  httpsFixture.failNext()
  const providerFailure = await mealAi.main(event)
  assert.equal(providerFailure.error, 'deepseek-unavailable')
  assert.deepEqual(operationalLogs[1], {
    level: 'error',
    label: '[meal-ai]',
    details: { outcome: 'failure', durationMs: 0, error: 'deepseek-unavailable' }
  })
  assert.doesNotMatch(JSON.stringify(operationalLogs), /test-key|provider-failure-user|白菜/)
  cloudFixture.setOpenid('user-1')

  const cooldown = await mealAi.main(event)
  assert.deepEqual(cooldown, { ok: false, error: 'meal-ai-rate-limited', message: '请求太频繁，请稍后再试' })
  assert.equal(httpsFixture.calls, 2)

  for (let index = 1; index < 10; index += 1) {
    now += 10000
    assert.equal((await mealAi.main(event)).ok, true)
  }
  now += 10000
  assert.equal((await mealAi.main(event)).error, 'meal-ai-user-daily-limit')
  assert.equal(httpsFixture.calls, 11)

  for (let index = 2; index <= 90; index += 1) {
    cloudFixture.setOpenid(`user-${index}`)
    assert.equal((await mealAi.main(event)).ok, true)
  }
  cloudFixture.setOpenid('user-over-global-limit')
  assert.equal((await mealAi.main(event)).error, 'meal-ai-global-daily-limit')
  assert.equal(httpsFixture.calls, 100)

  console.log('AI reliability and cost-control public contract: ok')
})().catch(error => {
  originalError(error)
  process.exitCode = 1
}).finally(() => {
  Date.now = originalNow
  console.info = originalInfo
  console.error = originalError
  if (originalApiKey === undefined) delete process.env.DEEPSEEK_API_KEY
  else process.env.DEEPSEEK_API_KEY = originalApiKey
})
