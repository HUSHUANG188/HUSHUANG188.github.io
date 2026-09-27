const assert = require('node:assert/strict')
const Module = require('node:module')
const path = require('node:path')

const documents = new Map()
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
const cloud = {
  DYNAMIC_CURRENT_ENV: 'test',
  init() {},
  database() { return database },
  getWXContext() { return { OPENID: 'ocr-user' } }
}

const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return cloud
  return originalLoad.call(this, request, parent, isMain)
}
const entry = path.join(__dirname, '../cloudfunctions/receiptOcr/index.js')
delete require.cache[require.resolve(entry)]
const receiptOcr = require(entry)
Module._load = originalLoad

const originalKey = process.env.GLM_API_KEY
const originalModel = process.env.GLM_MODEL
process.env.GLM_API_KEY = 'key-id.key-secret'
process.env.GLM_MODEL = 'glm-server-selected'

;(async () => {
  const before = Date.now()
  const result = await receiptOcr.main({ action: 'glm-token' })
  assert.equal(result.ok, true)
  assert.equal(result.model, 'glm-server-selected')
  assert.ok(result.expiresAt >= before + 29000 && result.expiresAt <= Date.now() + 30000)

  let pageDefinition
  let requestOptions
  global.getApp = () => ({ globalData: {} })
  global.Page = definition => { pageDefinition = definition }
  global.wx = {
    cloud: { callFunction({ success }) { success({ result }) } },
    getFileSystemManager() { return { readFile({ success }) { success({ data: 'ZmFrZQ==' }) } } },
    request(options) { requestOptions = options }
  }
  const pageEntry = path.join(__dirname, '../pages/index/index.js')
  delete require.cache[require.resolve(pageEntry)]
  require(pageEntry)
  const page = {
    ...pageDefinition,
    data: { ...pageDefinition.data },
    setData(values) { this.data = { ...this.data, ...values } }
  }
  page.recognizeReceiptImage('receipt.png')
  assert.equal(requestOptions.timeout, 25000)
  assert.equal(requestOptions.data.model, 'glm-server-selected')
  assert.deepEqual(requestOptions.data.thinking, { type: 'enabled' })
  assert.equal(requestOptions.data.reasoning_effort, 'low')

  console.log('OCR reliability public contract: ok')
})().catch(error => {
  console.error(error)
  process.exitCode = 1
}).finally(() => {
  if (originalKey === undefined) delete process.env.GLM_API_KEY
  else process.env.GLM_API_KEY = originalKey
  if (originalModel === undefined) delete process.env.GLM_MODEL
  else process.env.GLM_MODEL = originalModel
})
