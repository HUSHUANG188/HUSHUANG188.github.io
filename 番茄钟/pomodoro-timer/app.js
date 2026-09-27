'use strict';

/* ============================================================
   网页版番茄钟
   使用方式：直接用浏览器打开 index.html 即可。

   计时原理：用「目标结束时间 - 当前时间」计算剩余秒数，
   而不是每秒减一。这样即使浏览器卡顿或切到后台，
   时间也不会越走越慢，回来时依然准确。
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
  completedToday: 0,  // 今日完成的番茄数
  inCycle: 0,         // 当前这一轮里完成的专注数（4 个为一轮）
  autoStart: false,
};

let settings = { ...DEFAULTS };
let lastShownSecond = null;  // 避免每 250ms 重复刷新 DOM
let audioCtx = null;         // Web Audio 上下文，用于播放提示音

// ---------- 读取本地保存的设置 ----------
try {
  settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('pomodoro.settings') || '{}') };
} catch (e) {}
try { state.autoStart = localStorage.getItem('pomodoro.autoStart') === 'true'; } catch (e) {}

// ---------- DOM ----------
const $ = (id) => document.getElementById(id);
const el = {
  time: $('time'),
  status: $('status'),
  ring: $('ring'),
  startBtn: $('startBtn'),
  resetBtn: $('resetBtn'),
  tabs: document.querySelectorAll('.tab'),
  dots: $('dots'),
  cycleInfo: $('cycleInfo'),
  work: $('workMin'),
  short: $('shortMin'),
  long: $('longMin'),
  autoStart: $('autoStart'),
};

const RING_CIRCUMFERENCE = 2 * Math.PI * 120;
const MODE_NAME = { work: '专注', short: '短休息', long: '长休息' };

// ---------- 工具函数 ----------
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

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

// 今日完成数按天记录，跨天自动归零
function loadCount() {
  try {
    const data = JSON.parse(localStorage.getItem('pomodoro.count') || 'null');
    if (data && data.date === todayStr()) return data.count;
  } catch (e) {}
  return 0;
}

function saveCount() {
  localStorage.setItem('pomodoro.count', JSON.stringify({ date: todayStr(), count: state.completedToday }));
}

function saveSettings() {
  localStorage.setItem('pomodoro.settings', JSON.stringify(settings));
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
  el.cycleInfo.textContent = `今日已完成 ${state.completedToday} 个番茄`;
}

function updateStatus(text) {
  el.status.textContent = text;
}

// ---------- 计时控制 ----------
function start() {
  if (state.remaining <= 0) state.remaining = state.total;
  state.endAt = Date.now() + state.remaining * 1000;
  state.running = true;
  el.startBtn.textContent = '暂停';
  ensureAudio();
  requestNotifyPermission();
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
  const msLeft = Math.max(0, state.endAt - Date.now());
  const secs = Math.ceil(msLeft / 1000);
  if (secs !== lastShownSecond) {
    lastShownSecond = secs;
    state.remaining = secs;
    render();
    if (secs <= 0) complete();
  }
}

function complete() {
  pause();
  lastShownSecond = null;

  if (state.mode === 'work') {
    state.completedToday += 1;
    state.inCycle += 1;
    saveCount();
    renderDots();
    // 每 4 个番茄进入长休息
    const next = state.inCycle % 4 === 0 ? 'long' : 'short';
    applyMode(next);
    updateStatus(state.inCycle % 4 === 0 ? '已完成一整轮，好好休息！🎉' : '专注完成，休息一下吧 ☕');
  } else {
    applyMode('work');
    updateStatus('休息结束，继续加油 💪');
  }

  playChime();
  notify('时间到啦！');

  if (state.autoStart) start();
}

function applyMode(mode) {
  state.mode = mode;
  state.total = secondsOf(mode);
  state.remaining = state.total;
  lastShownSecond = null;
  pause(); // 若正在计时，先停下来
  updateTabs();
  document.body.dataset.mode = mode;
  updateStatus(mode === 'work' ? '准备开始' : '休息一下 ☕');
  render();
}

// ---------- 事件绑定 ----------
el.startBtn.addEventListener('click', () => (state.running ? pause() : start()));
el.resetBtn.addEventListener('click', reset);
el.tabs.forEach((t) => t.addEventListener('click', () => applyMode(t.dataset.mode)));

// 空格键快速开始 / 暂停（避免干扰输入框和按钮）
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement && document.activeElement.tagName;
  if (e.code === 'Space' && tag !== 'INPUT' && tag !== 'BUTTON') {
    e.preventDefault();
    if (state.running) pause();
    else start();
  }
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
    localStorage.setItem('pomodoro.autoStart', String(state.autoStart));
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

function requestNotifyPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function notify(text) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification('🍅 番茄钟', { body: text }); } catch (e) {}
  }
}

// ---------- 初始化 ----------
function init() {
  state.completedToday = loadCount();
  bindSettings();
  applyMode('work');
  renderDots();
}

init();
