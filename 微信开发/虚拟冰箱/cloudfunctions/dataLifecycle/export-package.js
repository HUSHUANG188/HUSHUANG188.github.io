const crypto = require('crypto')

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}

function csvValue(value) {
  if (value === null || value === undefined) return ''
  const text = Array.isArray(value) ? value.join('\n') : String(value)
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

function csv(headers, rows) {
  const lines = [headers.map(item => csvValue(item.label)).join(',')]
  for (const row of rows) lines.push(headers.map(item => csvValue(item.value(row))).join(','))
  return Buffer.from(`\ufeff${lines.join('\r\n')}\r\n`, 'utf8')
}

function recordId(record) {
  return record && (record.id || record._id) || ''
}

function extension(fileID) {
  const matched = String(fileID).split('?')[0].match(/\.([a-zA-Z0-9]{1,5})$/)
  return matched ? matched[1].toLowerCase() : 'jpg'
}

function mediaFileIDs(magnets) {
  return [...new Set((magnets || []).flatMap(magnet => {
    if (!magnet || magnet.type === 'photo') return magnet && magnet.content ? [magnet.content] : []
    return magnet.type === 'album' && Array.isArray(magnet.photos) ? magnet.photos : []
  }))]
}

function exportedDoor(magnets, replacements) {
  return {
    magnets: (magnets || []).map(magnet => {
      if (!magnet || magnet.type === 'text') return magnet
      const { cloudFileID, photoFileIDs, ...safe } = magnet
      if (magnet.type === 'photo') return { ...safe, content: replacements.get(magnet.content) || '' }
      if (magnet.type === 'album') {
        const photos = (magnet.photos || []).map(fileID => replacements.get(fileID) || '')
        return { ...safe, content: photos[0] || '', photos }
      }
      return safe
    })
  }
}

function dateFolder(createdAt) {
  const text = new Date(createdAt + 8 * 60 * 60 * 1000).toISOString()
  return `virtual-fridge-export-${text.slice(0, 10).replace(/-/g, '')}-${text.slice(11, 16).replace(':', '')}`
}

async function buildExportPackage({ snapshot, scopeType, createdAt, downloadFile }) {
  const JSZip = require('jszip')
  const zip = new JSZip()
  const rootName = dateFolder(createdAt)
  const root = zip.folder(rootName)
  root.folder('media')
  const checksums = {}
  const add = (name, content) => {
    const buffer = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8')
    root.file(name, buffer)
    checksums[name] = sha256(buffer)
  }

  const personal = scopeType === 'personal'
  const foods = personal ? snapshot.state.foods : snapshot.foods
  const purchases = personal ? snapshot.state.purchases : snapshot.purchases
  const history = personal ? snapshot.state.history : snapshot.history
  const magnets = personal ? snapshot.magnets : snapshot.door.magnets
  const purchaseItems = purchases.flatMap(purchase => (purchase.items || []).map(item => ({ purchaseId: recordId(purchase), ...item })))

  const foodHeaders = [
    ['id', recordId], ['name', row => row.name], ['category', row => row.category], ['quantity', row => row.quantity],
    ['unit', row => row.unit], ['zone', row => row.zone], ['storedAt', row => row.storedAt], ['expireDate', row => row.expireDate],
    ['note', row => row.note], ['purchaseId', row => row.purchaseId], ['purchaseAmount', row => row.purchaseAmount],
    ['createdAt', row => row.createdAt], ['updatedAt', row => row.updatedAt]
  ].map(([label, value]) => ({ label, value }))
  const purchaseHeaders = [
    ['id', recordId], ['purchasedDate', row => row.purchasedDate], ['source', row => row.source],
    ['receiptTotal', row => row.receiptTotal], ['selectedTotal', row => row.selectedTotal], ['createdAt', row => row.createdAt],
    ['itemCount', row => (row.items || []).length], ['rawLines', row => row.rawLines || []]
  ].map(([label, value]) => ({ label, value }))
  const itemHeaders = [
    ['purchaseId', row => row.purchaseId], ['id', recordId], ['name', row => row.name], ['category', row => row.category],
    ['quantity', row => row.quantity], ['unit', row => row.unit], ['unitPrice', row => row.unitPrice], ['amount', row => row.amount],
    ['zone', row => row.zone], ['expireDate', row => row.expireDate], ['inventoryType', row => row.inventoryType]
  ].map(([label, value]) => ({ label, value }))
  const historyHeaders = [
    ['id', recordId], ['foodId', row => row.foodId || row.food && recordId(row.food)], ['outcome', row => row.outcome],
    ['handledAt', row => row.handledAt], ['foodName', row => row.food && row.food.name],
    ['foodCategory', row => row.food && row.food.category], ['foodQuantity', row => row.food && row.food.quantity],
    ['foodUnit', row => row.food && row.food.unit], ['purchaseId', row => row.purchaseId || row.food && row.food.purchaseId],
    ['purchaseAmount', row => row.purchaseAmount || row.food && row.food.purchaseAmount]
  ].map(([label, value]) => ({ label, value }))

  add('README.txt', [
    '虚拟冰箱数据导出',
    '',
    '本压缩包由已保存的备份版本生成，可用于个人保存和查看。',
    'CSV 文件使用 UTF-8 BOM 编码，可直接用常见表格软件打开。',
    '当前版本不支持把此 ZIP 重新导入小程序。'
  ].join('\r\n'))
  add('foods.csv', csv(foodHeaders, foods))
  add('purchases.csv', csv(purchaseHeaders, purchases))
  add('purchase-items.csv', csv(itemHeaders, purchaseItems))
  add('history.csv', csv(historyHeaders, history))
  add('settings.json', JSON.stringify(personal ? {
    settings: snapshot.state.settings,
    dietSettings: snapshot.state.dietSettings,
    historyClearedAt: snapshot.state.historyClearedAt,
    aiFeedback: snapshot.aiFeedback
  } : {}, null, 2))

  const replacements = new Map()
  const files = mediaFileIDs(magnets)
  for (let start = 0; start < files.length; start += 5) {
    await Promise.all(files.slice(start, start + 5).map(async (fileID, offset) => {
      if (typeof fileID !== 'string' || !fileID.startsWith('cloud://')) throw new Error('invalid-export-media')
      const name = `media/${String(start + offset + 1).padStart(3, '0')}.${extension(fileID)}`
      const downloaded = await downloadFile(fileID)
      root.file(name, downloaded)
      checksums[name] = sha256(downloaded)
      replacements.set(fileID, name)
    }))
  }
  add('door.json', JSON.stringify(exportedDoor(magnets, replacements), null, 2))
  if (!personal) add('family.json', JSON.stringify({ name: snapshot.family.name }, null, 2))

  const manifest = {
    exportedAt: new Date(createdAt).toISOString(),
    scopeType,
    schemaVersion: 1,
    counts: {
      foods: foods.length,
      purchases: purchases.length,
      purchaseItems: purchaseItems.length,
      history: history.length,
      magnets: magnets.length,
      photos: files.length
    },
    checksums
  }
  root.file('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'))
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  return { buffer, fileName: `${rootName}.zip`, checksum: sha256(buffer) }
}

module.exports = { buildExportPackage }
