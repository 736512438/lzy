// ========== 番茄钟核心逻辑 ==========

// --- DOM 元素 ---
const timerDisplay = document.getElementById('timerDisplay');
const phaseLabel = document.getElementById('phaseLabel');
const pomodoroCount = document.getElementById('pomodoroCount');
const progressRing = document.getElementById('progressRing');
const timerCircle = document.getElementById('timerCircle');
const btnStart = document.getElementById('btnStart');
const btnReset = document.getElementById('btnReset');
const btnSkip = document.getElementById('btnSkip');
const btnSettings = document.getElementById('btnSettings');
const settingsContent = document.getElementById('settingsContent');
const btnSaveSettings = document.getElementById('btnSaveSettings');
const btnAlwaysOnTop = document.getElementById('btnAlwaysOnTop');
const todayPomodoros = document.getElementById('todayPomodoros');
const todayFocusMinutes = document.getElementById('todayFocusMinutes');
const taskInput = document.getElementById('taskInput');
const btnAddTask = document.getElementById('btnAddTask');
const taskList = document.getElementById('taskList');
const taskCount = document.getElementById('taskCount');

// 设置输入
const focusDurationInput = document.getElementById('focusDuration');
const shortBreakDurationInput = document.getElementById('shortBreakDuration');
const longBreakDurationInput = document.getElementById('longBreakDuration');
const longBreakIntervalInput = document.getElementById('longBreakInterval');

// --- 状态 ---
const PHASES = { FOCUS: 'focus', SHORT_BREAK: 'short-break', LONG_BREAK: 'long-break' };

let settings = {
  focusDuration: 25,          // 分钟
  shortBreakDuration: 5,
  longBreakDuration: 15,
  longBreakInterval: 4,
};

let state = {
  currentPhase: PHASES.FOCUS,
  timeRemaining: settings.focusDuration * 60,  // 秒
  totalTime: settings.focusDuration * 60,
  isRunning: false,
  pomodorosCompleted: 0,       // 本次会话完成的番茄数
  todayPomodoros: 0,
  todayFocusMinutes: 0,
  alwaysOnTop: false,
};

let timerInterval = null;

// --- 本地存储 ---
const STORAGE_KEY = 'pomodoro-settings';
const STATS_KEY = 'pomodoro-stats';
const TASKS_KEY = 'pomodoro-tasks';

function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      settings = { ...settings, ...JSON.parse(saved) };
    }
  } catch (e) { /* ignore */ }
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function loadStats() {
  try {
    const today = new Date().toDateString();
    const saved = localStorage.getItem(STATS_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      if (data.date === today) {
        state.todayPomodoros = data.todayPomodoros || 0;
        state.todayFocusMinutes = data.todayFocusMinutes || 0;
      }
    }
  } catch (e) { /* ignore */ }
}

function saveStats() {
  const data = {
    date: new Date().toDateString(),
    todayPomodoros: state.todayPomodoros,
    todayFocusMinutes: state.todayFocusMinutes,
  };
  localStorage.setItem(STATS_KEY, JSON.stringify(data));
}

function loadTasks() {
  try {
    const saved = localStorage.getItem(TASKS_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) { /* ignore */ }
  return [];
}

function saveTasks(tasks) {
  localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
}

// --- 音频通知 ---
function playNotificationSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // 播放三声清脆的提示音
    const notes = [880, 1100, 1320]; // A5, C#6, E6
    notes.forEach((freq, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime + i * 0.2);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + i * 0.2 + 0.3);

      osc.start(audioCtx.currentTime + i * 0.2);
      osc.stop(audioCtx.currentTime + i * 0.2 + 0.3);
    });
  } catch (e) {
    // 降级：使用简单的 beep
    console.log('Audio notification unavailable:', e);
  }
}

// --- 系统通知 ---
async function sendNotification(title, body) {
  if (window.pomodoroAPI) {
    await window.pomodoroAPI.showNotification(title, body);
  }
}

// --- 托盘更新 ---
async function updateTray() {
  if (window.pomodoroAPI) {
    const mins = Math.floor(state.timeRemaining / 60);
    const secs = state.timeRemaining % 60;
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const phaseNames = {
      [PHASES.FOCUS]: '专注',
      [PHASES.SHORT_BREAK]: '短休息',
      [PHASES.LONG_BREAK]: '长休息',
    };

    const tooltip = `🍅 ${phaseNames[state.currentPhase]}: ${timeStr}`;
    await window.pomodoroAPI.updateTray(tooltip, tooltip);
  }
}

// --- UI 更新 ---
function updateTimerDisplay() {
  const mins = Math.floor(state.timeRemaining / 60);
  const secs = state.timeRemaining % 60;
  timerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function updateProgressRing() {
  const circumference = 2 * Math.PI * 90; // r=90
  const progress = 1 - (state.timeRemaining / state.totalTime);
  const offset = circumference * (1 - progress);

  progressRing.style.strokeDasharray = circumference;
  progressRing.style.strokeDashoffset = offset;

  // 根据阶段更新颜色
  progressRing.classList.remove('short-break', 'long-break');
  if (state.currentPhase === PHASES.SHORT_BREAK) {
    progressRing.classList.add('short-break');
  } else if (state.currentPhase === PHASES.LONG_BREAK) {
    progressRing.classList.add('long-break');
  }
}

function updatePhaseLabel() {
  const phaseInfo = {
    [PHASES.FOCUS]: { text: '🔴 专注', className: 'focus' },
    [PHASES.SHORT_BREAK]: { text: '🟢 短休息', className: 'short-break' },
    [PHASES.LONG_BREAK]: { text: '🔵 长休息', className: 'long-break' },
  };

  const info = phaseInfo[state.currentPhase];
  phaseLabel.textContent = info.text;
  phaseLabel.className = `phase-label ${info.className}`;

  // 更新番茄计数
  const cyclePos = state.pomodorosCompleted % settings.longBreakInterval;
  pomodoroCount.textContent = `🍅`.repeat(cyclePos) + `⚪`.repeat(Math.max(0, settings.longBreakInterval - cyclePos - 1));
  if (state.currentPhase === PHASES.LONG_BREAK) {
    pomodoroCount.textContent = `🍅`.repeat(settings.longBreakInterval) + ' ✓';
  }
}

function updateStartButton() {
  if (state.isRunning) {
    btnStart.textContent = '⏸';
    btnStart.classList.add('running');
  } else {
    btnStart.textContent = '▶';
    btnStart.classList.remove('running');
  }
}

function updateStats() {
  todayPomodoros.textContent = state.todayPomodoros;
  todayFocusMinutes.textContent = state.todayFocusMinutes;
}

function updateAllUI() {
  updateTimerDisplay();
  updateProgressRing();
  updatePhaseLabel();
  updateStartButton();
  updateStats();
}

// --- 计时器逻辑 ---
function startTimer() {
  if (state.isRunning) return;

  state.isRunning = true;
  updateStartButton();
  updateTray();

  timerInterval = setInterval(() => {
    state.timeRemaining--;

    updateTimerDisplay();
    updateProgressRing();

    // 每秒更新托盘（不要太频繁）
    if (state.timeRemaining % 5 === 0) {
      updateTray();
    }

    if (state.timeRemaining <= 0) {
      timerComplete();
    }
  }, 1000);
}

function pauseTimer() {
  state.isRunning = false;
  clearInterval(timerInterval);
  timerInterval = null;
  updateStartButton();
  updateTray();
}

function resetTimer() {
  const wasRunning = state.isRunning;
  pauseTimer();
  state.timeRemaining = state.totalTime;
  updateAllUI();
  if (wasRunning) {
    startTimer();
  }
  updateTray();
}

function skipTimer() {
  pauseTimer();
  state.timeRemaining = 0;
  timerComplete();
}

function timerComplete() {
  pauseTimer();

  // 播放提示音
  playNotificationSound();

  // 发送通知
  const notificationMessages = {
    [PHASES.FOCUS]: { title: '🍅 番茄钟完成！', body: '太棒了！休息一下吧~' },
    [PHASES.SHORT_BREAK]: { title: '☕ 休息结束', body: '准备开始下一个番茄钟！' },
    [PHASES.LONG_BREAK]: { title: '🌟 长休息结束', body: '精力充沛，开始新的番茄循环！' },
  };

  const msg = notificationMessages[state.currentPhase];
  sendNotification(msg.title, msg.body);

  // 统计
  if (state.currentPhase === PHASES.FOCUS) {
    state.pomodorosCompleted++;
    state.todayPomodoros++;
    state.todayFocusMinutes += settings.focusDuration;
    saveStats();
  }

  // 切换到下一个阶段
  if (state.currentPhase === PHASES.FOCUS) {
    // 专注完成 → 判断是短休息还是长休息
    if (state.pomodorosCompleted % settings.longBreakInterval === 0) {
      switchPhase(PHASES.LONG_BREAK);
    } else {
      switchPhase(PHASES.SHORT_BREAK);
    }
  } else {
    // 休息完成 → 专注
    switchPhase(PHASES.FOCUS);
  }

  updateAllUI();
  updateTray();

  // 自动开始下一个阶段
  startTimer();
}

function switchPhase(newPhase) {
  state.currentPhase = newPhase;

  const durationMap = {
    [PHASES.FOCUS]: settings.focusDuration,
    [PHASES.SHORT_BREAK]: settings.shortBreakDuration,
    [PHASES.LONG_BREAK]: settings.longBreakDuration,
  };

  const duration = durationMap[newPhase];
  state.timeRemaining = duration * 60;
  state.totalTime = duration * 60;
}

// --- 设置 ---
function applySettings() {
  settings.focusDuration = Math.max(1, Math.min(120, parseInt(focusDurationInput.value) || 25));
  settings.shortBreakDuration = Math.max(1, Math.min(30, parseInt(shortBreakDurationInput.value) || 5));
  settings.longBreakDuration = Math.max(1, Math.min(60, parseInt(longBreakDurationInput.value) || 15));
  settings.longBreakInterval = Math.max(1, Math.min(10, parseInt(longBreakIntervalInput.value) || 4));

  saveSettings();
  updateSettingsInputs();

  // 如果当前未运行，更新计时器
  if (!state.isRunning) {
    state.timeRemaining = settings.focusDuration * 60;
    state.totalTime = settings.focusDuration * 60;
    state.currentPhase = PHASES.FOCUS;
    state.pomodorosCompleted = 0;
    updateAllUI();
    updateTray();
  }
}

function updateSettingsInputs() {
  focusDurationInput.value = settings.focusDuration;
  shortBreakDurationInput.value = settings.shortBreakDuration;
  longBreakDurationInput.value = settings.longBreakDuration;
  longBreakIntervalInput.value = settings.longBreakInterval;
}

// --- 始终置顶 ---
async function toggleAlwaysOnTop() {
  state.alwaysOnTop = !state.alwaysOnTop;
  if (state.alwaysOnTop) {
    btnAlwaysOnTop.classList.add('active');
  } else {
    btnAlwaysOnTop.classList.remove('active');
  }
  if (window.pomodoroAPI) {
    await window.pomodoroAPI.setAlwaysOnTop(state.alwaysOnTop);
  }
}

// --- 任务管理 ---
let tasks = [];

function renderTasks() {
  taskList.innerHTML = '';

  tasks.forEach((task, index) => {
    const li = document.createElement('li');
    li.className = `task-item${task.completed ? ' completed' : ''}`;

    const checkbox = document.createElement('span');
    checkbox.className = `task-checkbox${task.completed ? ' checked' : ''}`;
    checkbox.textContent = task.completed ? '✓' : '';
    checkbox.addEventListener('click', () => toggleTask(index));

    const text = document.createElement('span');
    text.className = 'task-text';
    text.textContent = task.text;

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'task-delete';
    deleteBtn.textContent = '×';
    deleteBtn.addEventListener('click', () => deleteTask(index));

    li.appendChild(checkbox);
    li.appendChild(text);
    li.appendChild(deleteBtn);
    taskList.appendChild(li);
  });

  // 更新计数
  const completed = tasks.filter(t => t.completed).length;
  taskCount.textContent = `${completed}/${tasks.length}`;
}

function addTask(text) {
  if (!text.trim()) return;
  tasks.push({ text: text.trim(), completed: false });
  saveTasks(tasks);
  renderTasks();
  taskInput.value = '';
}

function toggleTask(index) {
  tasks[index].completed = !tasks[index].completed;
  saveTasks(tasks);
  renderTasks();
}

function deleteTask(index) {
  tasks.splice(index, 1);
  saveTasks(tasks);
  renderTasks();
}

// --- 事件绑定 ---
btnStart.addEventListener('click', () => {
  if (state.isRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
});

btnReset.addEventListener('click', resetTimer);
btnSkip.addEventListener('click', skipTimer);

btnSettings.addEventListener('click', () => {
  settingsContent.classList.toggle('show');
});

btnSaveSettings.addEventListener('click', applySettings);

btnAlwaysOnTop.addEventListener('click', toggleAlwaysOnTop);

btnAddTask.addEventListener('click', () => {
  addTask(taskInput.value);
});

taskInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    addTask(taskInput.value);
  }
});

// 计时器表盘点击也可以切换 开始/暂停
timerCircle.addEventListener('click', (e) => {
  // 排除按钮区域的点击
  if (e.target.closest('.ctrl-btn')) return;
  if (state.isRunning) {
    pauseTimer();
  } else {
    startTimer();
  }
});

// --- 初始化 ---
function init() {
  loadSettings();
  loadStats();
  tasks = loadTasks();

  updateSettingsInputs();
  state.timeRemaining = settings.focusDuration * 60;
  state.totalTime = settings.focusDuration * 60;
  state.currentPhase = PHASES.FOCUS;

  updateAllUI();
  renderTasks();
  updateTray();
}

init();
