'use strict';

/* ============================================================
   最佳版番茄钟 —— 集合三版优点 + 修复已知问题

   计时原理：用「目标结束时间 - 当前时间」计算剩余秒数，
   而不是每秒减一。这样即使浏览器卡顿或切到后台，
   时间也不会越走越慢，回来时依然准确。

   特性：精确计时 / 自动开始下一段 / 跳过（不计番茄）/
        今日+累计统计 / 4 格本轮进度 / 深色模式跟随系统 /
        快捷键（空格/R/S）

   注意：所有需要读取 localStorage 并做数据净化的逻辑都放在
   文件末尾的 init() 里执行，避免在 const 声明前访问（TDZ）。
   ============================================================ */

const DEFAULTS = { work: 25, short: 5, long: 15 };

// ---------- 状态 ----------
const state = {
  mode: 'work',       // work | short | long
  total: 0,           // 当前模式总秒数
  remaining: 0,       // 剩余秒数
  running: false,
  endAt: 0,           // 目标结束时间（毫秒时间戳）
  timerId: null,
  autoStart: false,
  todayCount: 0,      // 今日完成的番茄数（按天自动归零）
  totalCount: 0,      // 累计完成的番茄数
  inCycle: 0,         // 当前这一轮里完成的专注数（4 个为一轮）
};

let settings = { ...DEFAULTS };
let lastShownSecond = null;  // 避免每 250ms 重复刷新 DOM
let audioCtx = null;         // Web Audio 上下文，用于播放提示音

// ---------- 工具函数 ----------
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

function norm(v, min, max, dflt) {
  v = parseInt(v, 10);
  return isNaN(v) ? dflt : clamp(v, min, max);
}

function secondsOf(mode) {
  const minutes = { work: settings.work, short: settings.short, long: settings.long }[mode];
  return clamp(minutes, 1, 180) * 60;
}

function format(secs) {
  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const el = {
  time: $('time'),
  status: $('status'),
  ring: $('ring'),
  startBtn: $('startBtn'),
  resetBtn: $('resetBtn'),
  skipBtn: $('skipBtn'),
  tabs: document.querySelectorAll('.tab'),
  dots: $('dots'),
  today: $('today'),
  total: $('total'),
  work: $('workMin'),
  short: $('shortMin'),
  long: $('longMin'),
  autoStart: $('autoStart'),
};

const RING_CIRCUMFERENCE = 2 * Math.PI * 120;
const MODE_NAME = { work: '专注', short: '短休息', long: '长休息' };

// ---------- 本地持久化 ----------
function saveCount() {
  localStorage.setItem('pb.count', JSON.stringify({
    date: todayStr(),
    today: state.todayCount,
    total: state.totalCount,
    inCycle: state.inCycle,
  }));
}

function saveSettings() {
  localStorage.setItem('pb.settings', JSON.stringify(settings));
}

// ---------- 渲染 ----------
function render() {
  el.time.textContent = format(state.remaining);
  const fraction = state.total ? state.remaining / state.total : 0;
  el.ring.style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - fraction);
  document.title = `${format(state.remaining)} · ${MODE_NAME[state.mode]}`;
}

function updateTabs() {
  el.tabs.forEach((t) => t.classList.toggle('active', t.dataset.mode === state.mode));
}

function renderDots() {
  const filled = state.inCycle % 4;
  let html = '';
  for (let i = 0; i < 4; i++) {
    html += `<span class="dot${i < filled ? ' on' : ''}">${i < filled ? '🍅' : ''}</span>`;
  }
  el.dots.innerHTML = html;
  el.today.textContent = state.todayCount;
  el.total.textContent = state.totalCount;
}

function updateStatus(text) {
  el.status.textContent = text;
}

// ---------- 计时控制（目标时间戳算法，后台也不漂移） ----------
function start() {
  if (state.running) return;
  if (state.remaining <= 0) state.remaining = state.total;
  state.endAt = Date.now() + state.remaining * 1000;
  state.running = true;
  el.startBtn.textContent = '暂停';
  ensureAudio();
  clearInterval(state.timerId);
  state.timerId = setInterval(tick, 250);
  tick();
}

function pause() {
  if (state.running) {
    state.running = false;
    clearInterval(state.timerId);
    state.timerId = null;
    // 用精确时间差更新剩余秒数
    state.remaining = Math.max(0, Math.round((state.endAt - Date.now()) / 1000));
  }
  el.startBtn.textContent = '开始';
}

function reset() {
  pause();
  state.remaining = state.total;
  lastShownSecond = null;
  updateStatus(state.mode === 'work' ? '准备开始' : '休息一下 ☕');
  render();
}

function tick() {
  if (!state.running) return;  // 防御：陈旧回调（理论上 pause 已 clearInterval）直接忽略
  const msLeft = Math.max(0, state.endAt - Date.now());
  const secs = Math.ceil(msLeft / 1000);
  if (secs !== lastShownSecond) {
    lastShownSecond = secs;
    state.remaining = secs;
    render();
    if (secs <= 0) complete();
  }
}

// 从后台切回时立即刷新一次，避免完成事件延迟
document.addEventListener('visibilitychange', () => {
  if (state.running && !document.hidden) tick();
});

// ---------- 完成一段 ----------
function complete() {
  pause();
  lastShownSecond = null;

  if (state.mode === 'work') {
    state.todayCount += 1;
    state.totalCount += 1;
    state.inCycle += 1;
    saveCount();
    renderDots();
    const isCycleDone = state.inCycle % 4 === 0;
    applyMode(isCycleDone ? 'long' : 'short');
    updateStatus(isCycleDone ? '已完成一整轮，好好休息！🎉' : '专注完成，休息一下吧 ☕');
  } else {
    applyMode('work');
    updateStatus('休息结束，继续加油 💪');
  }

  playChime();
  notify('时间到啦！');

  if (state.autoStart) start();
}

// ---------- 跳过：跳到下一阶段，但不计入番茄、不推进本轮进度、不响铃 ----------
function skip() {
  pause();
  lastShownSecond = null;
  if (state.mode === 'work') {
    applyMode('short');
    updateStatus('已跳过专注，休息一下吧 ☕');
  } else {
    applyMode('work');
    updateStatus('已跳过休息，继续专注 💪');
  }
}

function applyMode(mode) {
  if (mode === state.mode) return;
  pause();
  state.mode = mode;
  state.total = secondsOf(mode);
  state.remaining = state.total;
  lastShownSecond = null;
  updateTabs();
  document.body.dataset.mode = mode;
  updateStatus(mode === 'work' ? '准备开始' : '休息一下 ☕');
  render();
}

// ---------- 事件绑定 ----------
el.startBtn.addEventListener('click', () => (state.running ? pause() : start()));
el.resetBtn.addEventListener('click', reset);
el.skipBtn.addEventListener('click', skip);
el.tabs.forEach((t) => t.addEventListener('click', () => applyMode(t.dataset.mode)));

// 快捷键：空格 = 开始/暂停，R = 重置，S = 跳过
// 只排除输入框；按钮聚焦时空格由 preventDefault 接管，不会双重触发
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { e.preventDefault(); state.running ? pause() : start(); }
  else if (e.code === 'KeyR') reset();
  else if (e.code === 'KeyS') skip();
});

function bindSettings() {
  const fields = [
    [el.work, 'work', 1, 180],
    [el.short, 'short', 1, 60],
    [el.long, 'long', 1, 120],
  ];
  for (const [input, key, min, max] of fields) {
    input.value = settings[key];
    input.addEventListener('change', () => {
      settings[key] = clamp(parseInt(input.value, 10) || min, min, max);
      input.value = settings[key];
      saveSettings();
      // 只有空闲时才立即生效，计时中则下一轮生效
      if (state.mode === key && !state.running) {
        state.total = secondsOf(key);
        state.remaining = state.total;
        lastShownSecond = null;
        render();
      }
    });
  }

  el.autoStart.checked = state.autoStart;
  el.autoStart.addEventListener('change', () => {
    state.autoStart = el.autoStart.checked;
    localStorage.setItem('pb.autoStart', String(state.autoStart));
  });
}

// ---------- 声音 & 系统通知 ----------
function ensureAudio() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playChime() {
  if (!audioCtx) return;
  const notes = [523.25, 659.25, 783.99]; // C E G 三连音
  notes.forEach((freq, i) => {
    const t0 = audioCtx.currentTime + i * 0.18;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.001, t0);
    gain.gain.exponentialRampToValueAtTime(0.4, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.7);
  });
}

// 首次用户交互时再请求通知权限（比页面加载时请求更友好）
document.addEventListener('click', function once() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  document.removeEventListener('click', once);
});

function notify(text) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification('🍅 番茄钟', { body: text }); } catch (e) {}
  }
}

// ---------- 初始化（所有 const 已就绪后执行） ----------
function init() {
  // 读取设置并净化：损坏/超范围的数据一律钳制回合法范围
  try {
    settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('pb.settings') || '{}') };
  } catch (e) {}
  settings.work  = norm(settings.work,  1, 180, DEFAULTS.work);
  settings.short = norm(settings.short, 1, 60,  DEFAULTS.short);
  settings.long  = norm(settings.long,  1, 120, DEFAULTS.long);

  try { state.autoStart = localStorage.getItem('pb.autoStart') === 'true'; } catch (e) {}

  try {
    const s = JSON.parse(localStorage.getItem('pb.count') || '{}');
    state.totalCount = Math.max(0, parseInt(s.total, 10) || 0);
    if (s.date === todayStr()) {          // 跨天则今日数/本轮进度归零
      state.todayCount = Math.max(0, parseInt(s.today, 10) || 0);
      state.inCycle = Math.max(0, parseInt(s.inCycle, 10) || 0);
    }
  } catch (e) {}

  bindSettings();
  state.total = secondsOf('work');
  state.remaining = state.total;
  document.body.dataset.mode = 'work';
  updateTabs();
  render();
  renderDots();
}

init();
