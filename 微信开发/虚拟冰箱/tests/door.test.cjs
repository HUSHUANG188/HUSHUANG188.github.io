const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { getMagnetSize, isPositionAvailable, toViewPosition } = require('../utils/door')

let storedMagnets = []
let chosenTempFiles = []
let savedIndex = 0
let removedFiles = []
let lastToast = ''
let lastModalTitle = ''
let lastChooseCount = 0
let previewedPhoto = null

global.getApp = () => ({ globalData: {} })
global.wx = {
  getStorageSync: (key) => key === 'virtual-fridge-door' ? storedMagnets : undefined,
  setStorageSync: (key, value) => {
    if (key === 'virtual-fridge-door') storedMagnets = value
  },
  getWindowInfo: () => ({ windowWidth: 375 }),
  showToast: ({ title }) => { lastToast = title },
  showModal: ({ title, success }) => {
    lastModalTitle = title
    if (success) success({ confirm: true })
  },
  showLoading: () => {},
  hideLoading: () => {},
  chooseMedia: (options) => {
    lastChooseCount = options.count
    options.success({ tempFiles: chosenTempFiles.map(tempFilePath => ({ tempFilePath })) })
  },
  saveFile: ({ success }) => {
    savedIndex += 1
    success({ savedFilePath: `saved-${savedIndex}.jpg` })
  },
  removeSavedFile: ({ filePath }) => { removedFiles.push(filePath) },
  previewImage: (options) => { previewedPhoto = options }
}

global.Page = (definition) => { global.page = definition }
require('../pages/index/index')

global.page.setData = function setData(updates, callback) {
  Object.entries(updates).forEach(([key, value]) => {
    const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.')
    let target = this.data
    while (parts.length > 1) target = target[parts.shift()]
    target[parts[0]] = value
  })
  if (callback) callback()
}

global.page.doorBounds = { width: 350, height: 500 }
global.page.loadDoor()

global.page.openNoteComposer()
global.page.onMagnetTextInput({ detail: { value: '第一张便签' } })
global.page.saveNoteMagnet()
assert.equal(storedMagnets.length, 1)

const noteId = storedMagnets[0].id
const noteStart = toViewPosition(storedMagnets[0], global.page.doorBounds, 0.5)
global.page.onMagnetTouchStart({ currentTarget: { dataset: { id: noteId } }, touches: [{ clientX: 40, clientY: 60 }] })
assert.equal(global.page.data.magnets.find(item => item.id === noteId).isDragging, true, 'touchstart must visibly lift the selected magnet')
global.page.onMagnetTouchEnd({ currentTarget: { dataset: { id: noteId } }, changedTouches: [{ clientX: 41, clientY: 61 }] })
assert.notEqual(global.page.skipMagnetTap, noteId, 'a light tap must still open the editor')
global.page.onMagnetTouchStart({ currentTarget: { dataset: { id: noteId } }, touches: [{ clientX: 40, clientY: 60 }] })
global.page.onMagnetTouchMove({ currentTarget: { dataset: { id: noteId } }, touches: [{ clientX: 40 + 180 - noteStart.x, clientY: 60 + 300 - noteStart.y }] })
const movingNote = global.page.data.magnets.find(item => item.id === noteId)
assert.deepEqual({ x: movingNote.x, y: movingNote.y }, { x: 180, y: 300 }, 'touchmove must visibly follow the finger before release')
global.page.onMagnetTouchEnd({ currentTarget: { dataset: { id: noteId } }, changedTouches: [{ clientX: 40 + 180 - noteStart.x, clientY: 60 + 300 - noteStart.y }] })
const movedNote = toViewPosition(storedMagnets[0], global.page.doorBounds, 0.5)
assert.deepEqual({ x: movedNote.x, y: movedNote.y }, { x: 180, y: 300 }, 'a valid free drag must persist the requested position')

global.page.openStickerPicker()
assert.equal(global.page.data.stickerOptions.length, 8)
global.page.chooseSticker({ currentTarget: { dataset: { value: 'flower' } } })
assert.equal(storedMagnets.some(item => item.type === 'sticker' && item.content === 'flower'), true)

global.page.openDiySticker()
global.page.onDiyTextInput({ detail: { value: '平安' } })
global.page.chooseDiyShape({ currentTarget: { dataset: { value: 'ticket' } } })
global.page.chooseDiyColor({ currentTarget: { dataset: { value: 'berry' } } })
global.page.saveDiySticker()
assert.equal(storedMagnets.some(item => item.content === 'diy' && item.diyText === '平安'), true)

chosenTempFiles = ['one-temp.jpg']
global.page.openPhotoPicker()
global.page.choosePhoto()
assert.equal(lastChooseCount, 1)
assert.equal(storedMagnets.some(item => item.type === 'photo'), true, 'single-photo picker must create one block magnet')

chosenTempFiles = ['album-a.jpg', 'album-b.jpg', 'album-c.jpg']
global.page.openPhotoPicker()
global.page.chooseAlbumPhotos()
assert.equal(lastChooseCount, 9)
assert.equal(global.page.data.magnetSheetMode, 'album-create')
global.page.onAlbumTitleInput({ detail: { value: '周末相册' } })
global.page.saveAlbumMagnet()
const album = storedMagnets.find(item => item.type === 'album')
assert.ok(album)
assert.equal(album.photos.length, 3)
global.page.openMagnetEditor({ currentTarget: { dataset: { id: album.id } } })
assert.equal(global.page.data.showAlbumViewer, true)
global.page.onAlbumSlideChange({ detail: { current: 2 } })
assert.equal(global.page.data.albumPhotoIndex, 2)
global.page.previewAlbumPhoto()
assert.deepEqual(previewedPhoto, { current: album.photos[2], urls: album.photos }, 'album photo must open the native zoomable viewer at the current image')

storedMagnets.forEach((magnet) => {
  const position = toViewPosition(magnet, global.page.doorBounds, 0.5)
  const size = getMagnetSize(magnet.type, 0.5)
  assert.ok(position.x >= 0 && position.y >= 0)
  assert.ok(position.x + size.width <= global.page.doorBounds.width)
  assert.ok(position.y + size.height <= global.page.doorBounds.height)
  assert.equal(isPositionAvailable(magnet, position, storedMagnets, global.page.doorBounds, 0.5), true)
})

const singlePhoto = storedMagnets.find(item => item.type === 'photo')
const firstPhotoPath = singlePhoto.content
chosenTempFiles = ['replacement-temp.jpg']
global.page.setData({ editingMagnetId: singlePhoto.id, editingMagnet: singlePhoto })
global.page.replacePhotoMagnet()
assert.equal(removedFiles.includes(firstPhotoPath), true, 'replacing a photo must clean up the previous saved file')

global.page.setData({ editingMagnetId: album.id, editingMagnet: album })
global.page.deleteMagnet()
album.photos.forEach(filePath => assert.equal(removedFiles.includes(filePath), true, 'deleting an album must clean up every saved photo'))
assert.equal(storedMagnets.some(item => item.id === album.id), false)

const beforeFullDoor = storedMagnets
global.page.doorBounds = { width: 75, height: 75 }
storedMagnets = [{ id: 'full', type: 'sticker', content: 'heart', xRatio: 0, yRatio: 0, z: 1 }]
global.page.loadDoor()
lastToast = ''
lastModalTitle = ''
global.page.openNoteComposer()
global.page.onMagnetTextInput({ detail: { value: '不应消失在门外' } })
global.page.saveNoteMagnet()
assert.equal(storedMagnets.length, 1)
assert.equal(lastModalTitle, '冰箱门放不下了')

const wxml = fs.readFileSync(path.join(__dirname, '../pages/index/index.wxml'), 'utf8')
const wxss = fs.readFileSync(path.join(__dirname, '../pages/index/index.wxss'), 'utf8')
assert.match(wxml, /bindtap="openPhotoPicker"/)
assert.match(wxml, /item\.type === 'photo'/)
assert.match(wxml, /item\.type === 'album'/)
assert.match(wxml, /<swiper class="album-swiper"/)
assert.match(wxml, /class="album-viewer-photo"[^>]*bindtap="previewAlbumPhoto"/, 'album viewer photo must open the native zoomable viewer')
assert.match(wxml, /class="magnet-item magnet-\{\{item\.type\}\} \{\{item\.isDragging \? 'dragging' : ''\}\}/)
assert.match(wxml, /catchtouchmove="onMagnetTouchMove"/)
assert.match(wxml, /class="door-photo"[\s\S]*?mode="aspectFit"/)
assert.match(wxml, /class="photo-editor-preview"[\s\S]*?mode="aspectFit"/)
assert.match(wxml, /class="photo-editor-preview"[^>]*bindtap="previewSinglePhoto"/, 'single-photo editor must open the native zoomable viewer')
assert.doesNotMatch(wxml, /class="door-open-control"[^>]*bindtap=/)
assert.doesNotMatch(wxml, /class="close-door-control"[^>]*bindtap=/)
assert.doesNotMatch(wxml, /轻触或向(?:左|右)滑动/)
assert.match(wxml, /class="door-open-note">向左滑动打开</)
assert.match(wxml, /class="close-door-note">向右滑动关门</)
assert.match(wxml, /class="inventory-surface \{\{doorClosing \? 'closing' : ''\}\}"/, 'the visible inventory surface must own the close animation')
assert.match(wxss, /\.magnet-item\s*\{[\s\S]*?position:\s*absolute;/)
assert.match(wxss, /\.magnet-item\.dragging\s*\{/)
assert.match(wxss, /\.magnet-area\s*\{[\s\S]*?bottom:\s*24rpx;/)
assert.match(wxss, /\.door-open-control\s*\{[\s\S]*?z-index:\s*1200;/)
assert.match(wxss, /\.close-door-row\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?z-index:\s*1200;/)
assert.match(wxss, /\.close-door-row\s*\{[\s\S]*?bottom:\s*calc\(188rpx \+ env\(safe-area-inset-bottom\)\);/, 'inventory return control must keep the current-stock height in every view')
assert.doesNotMatch(wxss, /rotateY\(/, 'door transition must avoid expensive full-surface 3D rotation')
assert.match(wxss, /\.door-scene\.opening\s*\{[\s\S]*?animation:\s*door-open 450ms/)
assert.match(wxss, /\.inventory-surface\.closing\s*\{[\s\S]*?animation:\s*inventory-close 450ms/)
assert.match(wxss, /\.magnet-photo\s*\{[\s\S]*?display:\s*block;[\s\S]*?width:\s*272rpx;[\s\S]*?height:\s*320rpx;/)
assert.match(wxss, /\.door-photo\s*\{[\s\S]*?width:\s*244rpx;[\s\S]*?height:\s*228rpx;/)
assert.match(wxss, /\.photo-editor-preview\s*\{[\s\S]*?height:\s*520rpx;/)
assert.match(wxss, /\.magnet-album\s*\{[\s\S]*?display:\s*block;[\s\S]*?width:\s*300rpx;[\s\S]*?height:\s*260rpx;/)
assert.match(wxss, /\.magnet-note\s*\{[\s\S]*?width:\s*272rpx;[\s\S]*?height:\s*220rpx;/)
assert.deepEqual(getMagnetSize('photo', 1), { width: 272, height: 320 })

global.page.setData({ editingMagnet: singlePhoto })
global.page.previewSinglePhoto()
assert.deepEqual(previewedPhoto, { current: singlePhoto.content, urls: [singlePhoto.content] }, 'single photo must use the native zoomable preview')

global.page.setData({ surface: 'inventory' })
global.page.measureDoor = () => {}
global.page.onCloseDoorTouchStart({ touches: [{ clientX: 20 }] })
global.page.onCloseDoorTouchEnd({ changedTouches: [{ clientX: 60 }] })
assert.equal(global.page.data.surface, 'inventory', 'inventory must remain mounted for the full close animation')
assert.equal(global.page.data.doorClosing, true, 'swiping close must start the inventory exit animation before switching surfaces')
global.page.onUnload()

storedMagnets = beforeFullDoor
console.log('door interaction flow: ok')
