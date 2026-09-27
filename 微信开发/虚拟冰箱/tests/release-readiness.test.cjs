const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const familyConfig = JSON.parse(fs.readFileSync(path.join(root, 'cloudfunctions/family/config.json'), 'utf8'))
const mealAiConfig = JSON.parse(fs.readFileSync(path.join(root, 'cloudfunctions/mealAi/config.json'), 'utf8'))
const reminderConfig = fs.readFileSync(path.join(root, 'cloudfunctions/reminders/reminder.config.js'), 'utf8')
const mealAiSource = fs.readFileSync(path.join(root, 'cloudfunctions/mealAi/index.js'), 'utf8')
const pageMarkup = fs.readFileSync(path.join(root, 'pages/index/index.wxml'), 'utf8')
const projectConfig = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'))
const eslintConfig = require(path.join(root, '.eslintrc.js'))
const pageSource = fs.readFileSync(path.join(root, 'pages/index/index.js'), 'utf8')

assert.ok(familyConfig.timeout > 3 && familyConfig.timeout < 15)
assert.ok(mealAiConfig.timeout >= 20 && mealAiConfig.timeout < 22)
assert.match(reminderConfig, /miniprogramState:\s*'formal'/)
assert.match(mealAiSource, /}, 18000\)/)
assert.doesNotMatch(pageMarkup, /第三方智谱 AI/)
assert.doesNotMatch(pageMarkup, /第三方 DeepSeek/)
assert.doesNotMatch(pageMarkup, /完成后会从临时云存储清理/)
assert.match(pageMarkup, /删除我的数据/)
assert.equal(eslintConfig.extends, 'eslint:recommended')
assert.doesNotMatch(pageSource, /finishReceiptOcr/)
assert.doesNotMatch(pageMarkup, /expiresText/)

const ignoredPackageEntries = new Set((projectConfig.packOptions && projectConfig.packOptions.ignore || []).map(item => `${item.type}:${item.value}`))
assert.ok(ignoredPackageEntries.has('folder:cloudbase'))
for (const file of fs.readdirSync(root).filter(file => file.endsWith('.md'))) {
  assert.ok(ignoredPackageEntries.has(`file:${file}`), `${file} must not enter the Mini Program package`)
}

console.log('release readiness contract: ok')
