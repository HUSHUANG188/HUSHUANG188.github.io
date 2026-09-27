function addDays(dateText, days) {
  const [year, month, day] = dateText.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return date.toISOString().slice(0, 10)
}

function collectDueFoods(foods, today, warningDays = 3) {
  const lastDay = addDays(today, warningDays)
  return foods
    .filter((food) => food && typeof food.name === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(food.expireDate))
    .filter((food) => food.expireDate >= today && food.expireDate <= lastDay)
    .sort((a, b) => a.expireDate.localeCompare(b.expireDate))
}

function shanghaiDateTime(now) {
  const values = {}
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now).forEach((part) => {
    if (part.type !== 'literal') values[part.type] = part.value
  })
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`
  }
}

function isReminderTimeDue(reminderTime, now, sentForDate) {
  if (!/^\d{2}:\d{2}$/.test(reminderTime)) return false
  const current = shanghaiDateTime(now)
  return sentForDate !== current.date && current.time >= reminderTime
}

function buildTemplateData(dueFoods, config) {
  const names = dueFoods.slice(0, 2).map((food) => food.name).join('、').slice(0, 20)
  return {
    [config.foodNameKey]: { value: names },
    [config.expireDateKey]: { value: dueFoods[0].expireDate },
    [config.statusKey]: { value: `${dueFoods.length}种食物即将到期`.slice(0, 20) }
  }
}

module.exports = {
  collectDueFoods,
  isReminderTimeDue,
  buildTemplateData,
  shanghaiDateTime
}
