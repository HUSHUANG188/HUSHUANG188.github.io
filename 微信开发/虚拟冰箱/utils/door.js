const MAGNET_TYPES = ['note', 'photo', 'album', 'sticker']
const DIY_SHAPES = ['round', 'ticket', 'label']
const DIY_COLORS = ['fern', 'amber', 'berry', 'ink']
const MAGNET_GAP_RPX = 10

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}

function normalizeMagnet(magnet) {
  if (!magnet || !MAGNET_TYPES.includes(magnet.type) || typeof magnet.id !== 'string' || !magnet.id) return null
  if (typeof magnet.content !== 'string' || !magnet.content) return null
  const normalized = {
    id: magnet.id,
    type: magnet.type,
    content: magnet.content,
    xRatio: clamp(magnet.xRatio, 0, 1),
    yRatio: clamp(magnet.yRatio, 0, 1),
    z: Math.max(1, Number.isFinite(magnet.z) ? Math.floor(magnet.z) : 1)
  }

  if (magnet.type === 'album') {
    const photos = Array.isArray(magnet.photos) ? magnet.photos.filter(item => typeof item === 'string' && item).slice(0, 9) : []
    if (photos.length < 2) return null
    normalized.photos = photos
    normalized.content = photos[0]
    normalized.title = typeof magnet.title === 'string' && magnet.title.trim() ? magnet.title.trim().slice(0, 20) : '照片集'
    if (Array.isArray(magnet.photoFileIDs) && magnet.photoFileIDs.length === photos.length) normalized.photoFileIDs = magnet.photoFileIDs.slice()
  } else if (magnet.type === 'photo' && typeof magnet.cloudFileID === 'string' && magnet.cloudFileID) {
    normalized.cloudFileID = magnet.cloudFileID
  }

  if (magnet.type === 'sticker' && magnet.content === 'diy') {
    normalized.diyText = typeof magnet.diyText === 'string' && magnet.diyText.trim() ? magnet.diyText.trim().slice(0, 6) : '生活'
    normalized.diyShape = DIY_SHAPES.includes(magnet.diyShape) ? magnet.diyShape : DIY_SHAPES[0]
    normalized.diyColor = DIY_COLORS.includes(magnet.diyColor) ? magnet.diyColor : DIY_COLORS[0]
  }

  return normalized
}

function normalizeMagnets(magnets) {
  if (!Array.isArray(magnets)) return []
  const ids = new Set()
  return magnets.reduce((result, magnet) => {
    const normalized = normalizeMagnet(magnet)
    if (!normalized || ids.has(normalized.id)) return result
    ids.add(normalized.id)
    result.push(normalized)
    return result
  }, [])
}

function getMagnetSize(type, rpxScale) {
  const sizes = {
    note: [272, 220],
    photo: [272, 320],
    album: [300, 260],
    sticker: [150, 150]
  }
  const [width, height] = sizes[type] || sizes.sticker
  return { width: width * rpxScale, height: height * rpxScale }
}

function getPositionLimits(type, bounds, rpxScale) {
  const size = getMagnetSize(type, rpxScale)
  return {
    size,
    maxX: Math.max(0, bounds.width - size.width),
    maxY: Math.max(0, bounds.height - size.height)
  }
}

function toViewPosition(magnet, bounds, rpxScale) {
  const { maxX, maxY } = getPositionLimits(magnet.type, bounds, rpxScale)
  return {
    ...magnet,
    x: Math.round(magnet.xRatio * maxX),
    y: Math.round(magnet.yRatio * maxY)
  }
}

function toStoredPosition(magnet, position, bounds, rpxScale) {
  const { maxX, maxY } = getPositionLimits(magnet.type, bounds, rpxScale)
  return {
    ...magnet,
    xRatio: maxX ? clamp(position.x / maxX, 0, 1) : 0,
    yRatio: maxY ? clamp(position.y / maxY, 0, 1) : 0
  }
}

function rectanglesOverlap(first, second, gap = 0) {
  return first.x < second.x + second.width + gap &&
    first.x + first.width + gap > second.x &&
    first.y < second.y + second.height + gap &&
    first.y + first.height + gap > second.y
}

function isPositionAvailable(magnet, position, magnets, bounds, rpxScale) {
  const { size, maxX, maxY } = getPositionLimits(magnet.type, bounds, rpxScale)
  if (size.width > bounds.width || size.height > bounds.height) return false
  if (position.x < 0 || position.y < 0 || position.x > maxX || position.y > maxY) return false

  const candidate = { x: position.x, y: position.y, ...size }
  const gap = MAGNET_GAP_RPX * rpxScale
  return magnets.every(item => {
    if (item.id === magnet.id) return true
    const placed = toViewPosition(item, bounds, rpxScale)
    const placedSize = getMagnetSize(item.type, rpxScale)
    return !rectanglesOverlap(candidate, { x: placed.x, y: placed.y, ...placedSize }, gap)
  })
}

function findAvailablePosition(magnet, preferred, magnets, bounds, rpxScale) {
  const { size, maxX, maxY } = getPositionLimits(magnet.type, bounds, rpxScale)
  const target = { x: clamp(preferred.x, 0, maxX), y: clamp(preferred.y, 0, maxY) }
  if (isPositionAvailable(magnet, target, magnets, bounds, rpxScale)) return target

  // Any free rectangle can slide until it touches an edge or another item, so only those exact seams need testing.
  const gap = MAGNET_GAP_RPX * rpxScale
  const xCandidates = new Set([0, maxX])
  const yCandidates = new Set([0, maxY])
  magnets.forEach(item => {
    if (item.id === magnet.id) return
    const placed = toViewPosition(item, bounds, rpxScale)
    const placedSize = getMagnetSize(item.type, rpxScale)
    xCandidates.add(clamp(placed.x - size.width - gap, 0, maxX))
    xCandidates.add(clamp(placed.x + placedSize.width + gap, 0, maxX))
    yCandidates.add(clamp(placed.y - size.height - gap, 0, maxY))
    yCandidates.add(clamp(placed.y + placedSize.height + gap, 0, maxY))
  })

  let best = null
  xCandidates.forEach(x => {
    yCandidates.forEach(y => {
      const position = { x, y }
      if (!isPositionAvailable(magnet, position, magnets, bounds, rpxScale)) return
      const distance = Math.pow(x - target.x, 2) + Math.pow(y - target.y, 2)
      if (!best || distance < best.distance) best = { x, y, distance }
    })
  })
  return best ? { x: best.x, y: best.y } : null
}

function repairMagnetLayout(magnets, bounds, rpxScale) {
  const repaired = []
  for (const magnet of magnets) {
    const preferred = toViewPosition(magnet, bounds, rpxScale)
    if (isPositionAvailable(magnet, preferred, repaired, bounds, rpxScale)) {
      repaired.push(magnet)
      continue
    }
    const position = findAvailablePosition(magnet, preferred, repaired, bounds, rpxScale)
    if (!position) return null
    repaired.push(toStoredPosition(magnet, position, bounds, rpxScale))
  }
  return repaired
}

module.exports = {
  clamp,
  getMagnetSize,
  normalizeMagnets,
  rectanglesOverlap,
  isPositionAvailable,
  findAvailablePosition,
  repairMagnetLayout,
  toViewPosition,
  toStoredPosition
}
