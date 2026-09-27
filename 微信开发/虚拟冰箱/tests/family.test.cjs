const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  INVITE_TTL_MS,
  authorize,
  createInviteCode,
  hashInviteCode,
  isInviteUsable,
  migrationDocumentId,
  publicMember,
  validateExpectedVersion
} = require('../cloudfunctions/family/domain')
const {
  buildMigrationSelection,
  familyCacheKey,
  formatFamilyFridgeTitle,
  splitIntoChunks
} = require('../utils/family')

const fixedBytes = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7])
const code = createInviteCode(fixedBytes)
assert.equal(code.length, 8)
assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/)
assert.equal(hashInviteCode(` ${code.toLowerCase()} `), hashInviteCode(code))
assert.equal(isInviteUsable({ active: true, expiresAt: 1000 }, 999), true)
assert.equal(isInviteUsable({ active: true, expiresAt: 1000 }, 1000), false)
assert.equal(isInviteUsable({ active: false, expiresAt: 2000 }, 1000), false)
assert.equal(INVITE_TTL_MS, 24 * 60 * 60 * 1000)

assert.doesNotThrow(() => authorize({ role: 'member' }, 'member'))
assert.doesNotThrow(() => authorize({ role: 'admin' }, 'admin'))
assert.throws(() => authorize(null, 'member'), error => error.code === 'not-family-member')
assert.throws(() => authorize({ role: 'member' }, 'admin'), error => error.code === 'admin-required')
assert.doesNotThrow(() => validateExpectedVersion({ version: 3 }, 3))
assert.throws(() => validateExpectedVersion({ version: 3 }, 2), error => error.code === 'conflict' && error.latest.version === 3)

const member = publicMember({ _id: 'raw-openid', openid: 'raw-openid', memberId: 'member-1', nickname: '妈妈', role: 'admin', joinedAt: 10 })
assert.deepEqual(member, { memberId: 'member-1', nickname: '妈妈', role: 'admin', joinedAt: 10 })
assert.equal(migrationDocumentId('family-1', 'foods', 'legacy-1'), migrationDocumentId('family-1', 'foods', 'legacy-1'))
assert.notEqual(migrationDocumentId('family-1', 'foods', 'legacy-1'), migrationDocumentId('family-1', 'foods', 'legacy-2'))

const migration = buildMigrationSelection({
  state: {
    foods: [{ id: 'food-1' }],
    history: [{ id: 'history-1' }],
    purchases: [{ id: 'purchase-1' }]
  },
  magnets: [
    { id: 'note-1', type: 'note', content: '买牛奶' },
    { id: 'sticker-1', type: 'sticker', content: 'heart' },
    { id: 'photo-1', type: 'photo', content: 'local-photo.jpg' },
    { id: 'album-1', type: 'album', content: 'a.jpg', photos: ['a.jpg', 'b.jpg'] }
  ],
  includeRecords: true,
  includeDoorNotes: true,
  includeDoorPhotos: false
})
assert.deepEqual(migration.foods.map(item => item.id), ['food-1'])
assert.deepEqual(migration.magnets.map(item => item.id), ['note-1', 'sticker-1'])
assert.deepEqual(splitIntoChunks([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
assert.equal(familyCacheKey('family-1'), 'virtual-fridge-family-cache:family-1')
assert.equal(formatFamilyFridgeTitle('小南'), '小南家的冰箱')
assert.equal(formatFamilyFridgeTitle('小南家'), '小南家的冰箱')

const root = path.join(__dirname, '..')
const pageSource = fs.readFileSync(path.join(root, 'pages/index/index.js'), 'utf8')
const pageMarkup = fs.readFileSync(path.join(root, 'pages/index/index.wxml'), 'utf8')
const pageStyles = fs.readFileSync(path.join(root, 'pages/index/index.wxss'), 'utf8')
const reminderSource = fs.readFileSync(path.join(root, 'cloudfunctions/reminders/index.js'), 'utf8')
const familyFunctionSource = fs.readFileSync(path.join(root, 'cloudfunctions/family/index.js'), 'utf8')
const projectConfig = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'))

assert.match(pageMarkup, /slot="center"/)
assert.match(pageMarkup, /bindtap="openFamilySheet"/)
assert.match(pageMarkup, /familyMode \? familyFridgeTitle : '我的冰箱'/)
assert.match(pageMarkup, /创建家庭/)
assert.match(pageMarkup, /邀请码/)
assert.match(pageMarkup, /复制到家庭冰箱/)
assert.match(pageSource, /callFamily\(wx,/)
assert.match(pageSource, /expectedVersion/)
assert.match(pageSource, /expectedRevision/)
assert.match(pageStyles, /\.family-nav/)
assert.match(pageMarkup, /<scroll-view[^>]*class="family-sheet-scroll"[^>]*scroll-y/)
assert.match(pageMarkup, /<view class="family-activity-card">/)
assert.doesNotMatch(pageMarkup, /family-activity-entry/)
assert.match(pageStyles, /\.family-sheet\s*\{[^}]*overflow:\s*hidden/s)
assert.match(pageStyles, /\.family-manage-section\s*\{[^}]*background:\s*#f2f2eb/s)
assert.match(pageStyles, /\.family-boundary-section\s*\{[^}]*background:\s*#f2f2eb/s)
assert.match(reminderSource, /family_members/)
assert.match(reminderSource, /family_foods/)
assert.doesNotMatch(familyFunctionSource, /\.delete\(\)/)
assert.match(familyFunctionSource, /\.remove\(\)/)

const ignoredPackageEntries = new Set((projectConfig.packOptions && projectConfig.packOptions.ignore || []).map(item => `${item.type}:${item.value}`))
assert.ok(ignoredPackageEntries.has('folder:artifacts'))
assert.ok(ignoredPackageEntries.has('file:virtual-fridge-v5-preview.png'))
assert.ok(ignoredPackageEntries.has('file:virtual-fridge-avatar.png'))

console.log('V5 family sharing domain and page contract: ok')
