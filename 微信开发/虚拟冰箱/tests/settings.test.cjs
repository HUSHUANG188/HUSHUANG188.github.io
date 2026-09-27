const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'pages/index/index.js'), 'utf8')
const markup = fs.readFileSync(path.join(root, 'pages/index/index.wxml'), 'utf8')
const styles = fs.readFileSync(path.join(root, 'pages/index/index.wxss'), 'utf8')
const settingsIcon = fs.readFileSync(path.join(root, 'settings.svg'), 'utf8')

assert.match(markup, /slot="left" class="settings-nav" bindtap="openSettingsPage"/)
assert.match(markup, /class="settings-gear-image" src="\/settings\.svg"/)
assert.match(settingsIcon, /<path fill="#1f6046"/)
assert.match(markup, /长辈模式/)
assert.match(markup, /减少动画/)
assert.match(markup, /个人备份与恢复/)
assert.match(markup, /导出我的数据/)
assert.match(markup, /隐私保护指引/)
assert.match(markup, /删除我的数据/)
assert.match(markup, /open-type="feedback"/)
assert.ok(markup.indexOf('个人备份与恢复') < markup.indexOf('删除我的数据'))
assert.match(markup, /wx:if="\{\{elderMode\}\}" class="elder-home"/)
assert.match(markup, /class="elder-inventory-entry" bindtap="openElderStock"/)
assert.match(markup, /class="elder-task-card add" bindtap="openElderAdd"/)
assert.match(markup, /class="elder-task-card receipt" bindtap="openElderReceipt"/)
assert.match(markup, /class="elder-task-card meal" bindtap="openElderMeal"/)
assert.match(markup, /class="elder-quick-row" bindtap="openDietSettings"/)
assert.match(markup, /class="view-tabs elder-view-tabs"/)
assert.match(markup, /data-view="receipt"[\s\S]*>小票<\/button>/)
assert.match(markup, /data-view="meal"[\s\S]*>家常菜<\/button>/)
assert.match(markup, /wx:if="\{\{!elderMode\}\}" class="freshness-block"/)

assert.match(source, /defaultDisplaySettings = \{ elderMode: false, reduceMotion: false \}/)
assert.match(source, /renderDisplaySettings\(state\.displaySettings\)/)
assert.match(source, /displaySettings: \{ \.\.\.defaultDisplaySettings/)
assert.match(source, /openPrivacyContract/)
assert.match(source, /appVersion: '1\.2\.0'/)
assert.match(source, /const viewOrder = VIEW_ORDER/)

assert.match(styles, /\.settings-page/)
assert.match(styles, /\.elder-mode/)
assert.match(styles, /\.motion-reduced/)
assert.match(styles, /\.settings-row[\s\S]*min-height:\s*112rpx/)
assert.match(styles, /\.elder-home/)
assert.match(styles, /\.elder-task-grid/)
assert.match(styles, /\.elder-quick-list/)
assert.match(styles, /\.elder-mode \.food-actions/)
assert.match(styles, /\.elder-mode \.settings-row-title \{ font-size: 38rpx/)
assert.match(styles, /\.settings-row-copy \{[\s\S]*align-items: flex-start;[\s\S]*text-align: left;/)
assert.match(markup, /class="settings-link-row-layout"/)
assert.match(styles, /\.settings-link-row-layout \{[\s\S]*justify-content: space-between;[\s\S]*text-align: left;/)
assert.match(markup, /family-sheet family-sheet-\{\{familyPanelMode\}\}/)
assert.match(styles, /\.family-sheet-start \{ height: 780rpx; \}/)
assert.match(styles, /\.elder-mode \.family-sheet-start \.sheet-title \{ font-size: 42rpx/)
assert.match(styles, /\.elder-home-title \{[^}]*font-size: 52rpx/)
assert.match(styles, /\.elder-task-title \{ font-size: 42rpx/)
assert.match(styles, /\.elder-quick-title \{ font-size: 42rpx/)
assert.match(styles, /\.settings-gear-image \{ width: 56rpx; height: 56rpx/)
assert.match(styles, /left: -16rpx/)

let pageDefinition
const storage = {
  'virtual-fridge-state': {
    foods: [], history: [], purchases: [], settings: {}, dietSettings: {}, displaySettings: {}
  }
}
global.Page = definition => { pageDefinition = definition }
global.wx = {
  getStorageSync(key) { return storage[key] },
  setStorageSync(key, value) { storage[key] = value },
  showToast() {}
}
require(path.join(root, 'pages/index/index.js'))
const page = {
  ...pageDefinition,
  data: { ...pageDefinition.data },
  setData(values, callback) { this.data = { ...this.data, ...values }; if (callback) callback() }
}

page.openSettingsPage()
assert.equal(page.data.showSettingsPage, true)
page.onElderModeChange({ detail: { value: true } })
assert.equal(page.data.elderMode, true)
assert.equal(storage['virtual-fridge-state'].displaySettings.elderMode, true)
page.onReduceMotionChange({ detail: { value: true } })
assert.equal(page.data.reduceMotion, true)
assert.equal(storage['virtual-fridge-state'].displaySettings.reduceMotion, true)
page.closeSettingsPage()
assert.equal(page.data.showSettingsPage, false)
page.data.surface = 'door'
page.openElderHistory()
assert.equal(page.data.surface, 'inventory')
assert.equal(page.data.activeView, 'history')
page.showDoor()
assert.equal(page.data.surface, 'door')
page.openElderReceipt()
assert.equal(page.data.surface, 'inventory')
assert.equal(page.data.activeView, 'receipt')
page.showDoor()
page.openElderMeal()
assert.equal(page.data.surface, 'inventory')
assert.equal(page.data.activeView, 'meal')

console.log('V1.2 settings and elder mode contract: ok')
