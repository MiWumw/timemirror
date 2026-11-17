// TimeMirror App Logic

// Default Categories
const DEFAULT_CATEGORIES = [
  { id: 'phone', name: '醒后刷手机/摸鱼', icon: '📱', color: '#EF4444', isWaster: true },
  { id: 'work', name: '深度工作/学习', icon: '💻', color: '#3B82F6', isProductive: true },
  { id: 'routine', name: '餐饮起居/洗漱', icon: '🍳', color: '#F59E0B' },
  { id: 'fitness', name: '运动锻炼/健康', icon: '🏃', color: '#10B981', isProductive: true },
  { id: 'leisure', name: '休闲放松/游戏', icon: '🎮', color: '#06B6D4' },
  { id: 'sleep', name: '睡眠休息', icon: '🌙', color: '#6366F1' },
  { id: 'commute', name: '通勤路上', icon: '🚌', color: '#8B5CF6' },
  { id: 'other', name: '其他日常琐事', icon: '📌', color: '#94A3B8' }
];

// Storage Adapter Architecture (Local-First + Future Cloud Sync Adapter)
const StorageAdapter = {
  mode: 'local', // 'local' | 'cloud' (ready for future multi-device sync)
  load(key, fallback) {
    try {
      const val = localStorage.getItem('tm_' + key);
      return val ? JSON.parse(val) : fallback;
    } catch (e) {
      console.warn('Storage read error:', e);
      return fallback;
    }
  },
  save(key, data) {
    try {
      localStorage.setItem('tm_' + key, JSON.stringify(data));
      // Cloud sync hook hook point:
      // if (this.mode === 'cloud') CloudService.sync(key, data);
    } catch (e) {
      console.warn('Storage save error:', e);
    }
  }
};

function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ==========================================
// 习惯管理与连赢6次试验场数据管理器 (Habit & Winner Trials)
// ==========================================
const DEFAULT_HABITS_CONFIG = {
  version: 1,
  updatedAt: "2026-11-16T09:00:00Z",
  baseline: [
    { id: "base_1", legacyKey: "meditation", name: "晨起调息/冥想", desc: "呼吸吐纳 3 分钟，安抚心神", order: 1 },
    { id: "base_2", legacyKey: "baduanjin", name: "八段锦 1 遍", desc: "固表强身，温和疏通气血", order: 2 },
    { id: "base_3", legacyKey: "posture3", name: "体态调整 3 动作", desc: "正骨收腹沉肩，脊柱胸廓伸展", order: 3 }
  ],
  advanced: [
    { id: "adv_1", legacyKey: "yijinjing", name: "易筋经 / 五脏逼毒", desc: "舒筋活络，倪师吐纳法", order: 1 },
    { id: "adv_2", legacyKey: "mabu", name: "站桩 / 四平马步", desc: "下盘下沉 3~5 分钟，筑基固本", order: 2 },
    { id: "adv_3", legacyKey: "sleepMeditation", name: "睡前冥想", desc: "内观静心，引火归元", order: 3 },
    { id: "adv_4", legacyKey: "calisthenics", name: "囚徒健身", desc: "推/拉/核心选练，慢速控制", order: 4 }
  ]
};

const DEFAULT_WINNER_TRIALS = {
  version: 1,
  activeTrials: [
    {
      id: "trial_default_01",
      name: "早晚温水洗漱",
      target: 6,
      currentWins: 0,
      status: "active",
      createdAt: "2026-11-16",
      history: [],
      cycleCount: 1
    }
  ],
  graduatedTrials: []
};

const HabitManager = {
  getConfig() {
    let cfg = StorageAdapter.load('habits_config', null);
    if (!cfg || !cfg.baseline || !cfg.advanced) {
      cfg = JSON.parse(JSON.stringify(DEFAULT_HABITS_CONFIG));
      this.saveConfig(cfg);
    }
    return cfg;
  },
  saveConfig(cfg) {
    cfg.updatedAt = new Date().toISOString();
    StorageAdapter.save('habits_config', cfg);
  },
  getHabits() {
    return this.getConfig();
  },
  addHabit(type, name, desc) {
    const cfg = this.getConfig();
    const list = type === 'advanced' ? cfg.advanced : cfg.baseline;
    const prefix = type === 'advanced' ? 'adv_' : 'base_';
    const newId = prefix + Date.now();
    const order = list.length + 1;
    const newItem = { id: newId, name: name.trim(), desc: (desc || '').trim(), order };
    list.push(newItem);
    this.saveConfig(cfg);
    return newItem;
  },
  updateHabit(id, data) {
    const cfg = this.getConfig();
    let found = cfg.baseline.find(h => h.id === id);
    if (!found) found = cfg.advanced.find(h => h.id === id);
    if (found) {
      if (data.name !== undefined) found.name = data.name.trim();
      if (data.desc !== undefined) found.desc = data.desc.trim();
      if (data.order !== undefined) found.order = Number(data.order);
      this.saveConfig(cfg);
    }
    return found;
  },
  deleteHabit(id) {
    const cfg = this.getConfig();
    cfg.baseline = cfg.baseline.filter(h => h.id !== id);
    cfg.advanced = cfg.advanced.filter(h => h.id !== id);
    this.saveConfig(cfg);
  }
};

const WinnerTrialManager = {
  getData() {
    let data = StorageAdapter.load('winner_trials', null);
    if (!data || !Array.isArray(data.activeTrials)) {
      data = JSON.parse(JSON.stringify(DEFAULT_WINNER_TRIALS));
      this.saveData(data);
    }
    return data;
  },
  saveData(data) {
    StorageAdapter.save('winner_trials', data);
  },
  getActiveTrials() {
    return this.getData().activeTrials || [];
  },
  getGraduatedTrials() {
    return this.getData().graduatedTrials || [];
  },
  addTrial(name, target = 6) {
    const data = this.getData();
    const newTrial = {
      id: 'trial_' + Date.now(),
      name: name.trim(),
      target: target || 6,
      currentWins: 0,
      status: 'active',
      createdAt: getTodayString(),
      history: [],
      cycleCount: 1
    };
    data.activeTrials.push(newTrial);
    this.saveData(data);
    return newTrial;
  },
  // 随时赢下一局 (+1胜，彻底解除单日只能打卡一次的限制，支持极小步高频连胜)
  addWin(trialId) {
    const data = this.getData();
    const trial = data.activeTrials.find(t => t.id === trialId);
    if (!trial) return;
    if (trial.currentWins < (trial.target || 6)) {
      trial.currentWins = (trial.currentWins || 0) + 1;
      trial.history = trial.history || [];
      trial.history.push({ timestamp: Date.now(), date: getTodayString() });
      this.saveData(data);
      if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
      renderWinnerTrials();
    }
  },
  // 撤销一局 (-1胜，防止误触)
  undoWin(trialId) {
    const data = this.getData();
    const trial = data.activeTrials.find(t => t.id === trialId);
    if (!trial || trial.currentWins <= 0) return;
    trial.currentWins -= 1;
    if (Array.isArray(trial.history)) trial.history.pop();
    this.saveData(data);
    renderWinnerTrials();
  },
  // 直接点击步进圆点自由设值
  setWins(trialId, targetWins) {
    const data = this.getData();
    const trial = data.activeTrials.find(t => t.id === trialId);
    if (!trial) return;
    trial.currentWins = Math.max(0, Math.min(trial.target || 6, targetWins));
    this.saveData(data);
    if (navigator.vibrate) navigator.vibrate(30);
    renderWinnerTrials();
  },
  // 满级毕业归档至【胜者丰碑】
  graduateTrial(trialId) {
    const data = this.getData();
    const idx = data.activeTrials.findIndex(t => t.id === trialId);
    if (idx >= 0) {
      const trial = data.activeTrials.splice(idx, 1)[0];
      trial.status = 'graduated';
      trial.graduatedAt = getTodayString();
      data.graduatedTrials = data.graduatedTrials || [];
      data.graduatedTrials.unshift(trial);
      this.saveData(data);
      renderWinnerTrials();
    }
  },
  // 开启下一轮 6 次循环 (清零重置，继续连赢)
  resetTrial(trialId, newName) {
    const data = this.getData();
    const trial = data.activeTrials.find(t => t.id === trialId);
    if (trial) {
      if (newName && newName.trim()) trial.name = newName.trim();
      trial.cycleCount = (trial.cycleCount || 1) + 1;
      trial.currentWins = 0;
      trial.history = [];
      trial.status = 'active';
      this.saveData(data);
      renderWinnerTrials();
    }
  },
  deleteTrial(trialId) {
    const data = this.getData();
    data.activeTrials = data.activeTrials.filter(t => t.id !== trialId);
    data.graduatedTrials = (data.graduatedTrials || []).filter(t => t.id !== trialId);
    this.saveData(data);
    renderWinnerTrials();
  }
};

function loadCategories() {
  return StorageAdapter.load('categories', DEFAULT_CATEGORIES);
}

function loadRecords() {
  return StorageAdapter.load('records', {});
}

function saveRecords() {
  StorageAdapter.save('records', state.records);
}

function loadPlans() {
  return StorageAdapter.load('plans', {});
}

function savePlans() {
  StorageAdapter.save('plans', state.plans);
}

function loadWeights() {
  return StorageAdapter.load('weights', {});
}

function saveWeights() {
  StorageAdapter.save('weights', state.weights);
}

function loadReflections() {
  return StorageAdapter.load('reflections', {});
}

function saveReflections() {
  StorageAdapter.save('reflections', state.reflections);
}

function loadHabits() {
  return StorageAdapter.load('habits', {});
}

function saveHabits() {
  StorageAdapter.save('habits', state.habits);
}

function loadBodyState() {
  return StorageAdapter.load('body_state', {});
}

function saveBodyState() {
  StorageAdapter.save('body_state', state.bodyState);
}

// App State
let state = {
  currentDate: getTodayString(),
  activeTab: 'timeline',
  categories: loadCategories(),
  records: loadRecords(),
  plans: loadPlans(),
  weights: loadWeights(),
  reflections: loadReflections(),
  habits: loadHabits(),
  bodyState: loadBodyState(),
  selectedCategory: 'phone',
  editingRecordId: null,
  charts: {
    review: null,
    trend: null,
    weightInline: null,
    weightTrend: null
  }
};

// Convert "HH:MM" to total minutes from 00:00
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// Convert minutes to "HH:MM"
function minutesToTime(mins) {
  mins = Math.max(0, Math.min(1440, mins));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Format duration in readable Chinese
function formatDuration(startStr, endStr) {
  const m1 = timeToMinutes(startStr);
  const m2 = timeToMinutes(endStr);
  let diff = m2 - m1;
  if (diff < 0) diff += 1440;
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  if (hours > 0 && mins > 0) return `${hours}小时${mins}分`;
  if (hours > 0) return `${hours}小时`;
  return `${mins}分钟`;
}

function getDurationMinutes(startStr, endStr) {
  const m1 = timeToMinutes(startStr);
  const m2 = timeToMinutes(endStr);
  let diff = m2 - m1;
  if (diff < 0) diff += 1440;
  return diff;
}

// Dom Elements
const elDateDisplay = document.getElementById('dateDisplay');
const elPrevDateBtn = document.getElementById('prevDateBtn');
const elNextDateBtn = document.getElementById('nextDateBtn');
const elTodayBtn = document.getElementById('todayBtn');
const elSpectrumBar = document.getElementById('spectrumBar');
const elLoggedHours = document.getElementById('loggedHours');
const elWasterHours = document.getElementById('wasterHours');
const elProductiveHours = document.getElementById('productiveHours');
const elTimelineStream = document.getElementById('timelineStream');
const elEmptyNotice = document.getElementById('emptyNotice');

// Modal Elements
const recordModal = document.getElementById('recordModal');
const modalTitle = document.getElementById('modalTitle');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const categoryChipsContainer = document.getElementById('categoryChips');
const inputStartTime = document.getElementById('inputStartTime');
const inputEndTime = document.getElementById('inputEndTime');
const inputNote = document.getElementById('inputNote');
const recordForm = document.getElementById('recordForm');
const fabAddBtn = document.getElementById('fabAddBtn');

// Navigation Tabs
const navItems = document.querySelectorAll('.nav-item');
const tabPanes = document.querySelectorAll('.tab-pane');

// Review / Zhixing Tab Elements (v1.2.0)
const inputDailyWeight = document.getElementById('inputDailyWeight');
const weightDiffTag = document.getElementById('weightDiffTag');
const btnToggleWeightTrend = document.getElementById('btnToggleWeightTrend');
const weightTrendDrawer = document.getElementById('weightTrendDrawer');
const btnSaveWeightOnly = document.getElementById('btnSaveWeightOnly');
const inputBodySymptomNotes = document.getElementById('inputBodySymptomNotes');
const inputStressDetailNotes = document.getElementById('inputStressDetailNotes');

const inputDailyPlan = document.getElementById('inputDailyPlan');
const btnInsertPlanTemplate = document.getElementById('btnInsertPlanTemplate');

const execStreamSummary = document.getElementById('execStreamSummary');
const btnGoTimelineAdd = document.getElementById('btnGoTimelineAdd');
const btnToggleChartDetails = document.getElementById('btnToggleChartDetails');
const chartDetailsDrawer = document.getElementById('chartDetailsDrawer');
const toggleChartLabel = document.getElementById('toggleChartLabel');
const blackHoleAlert = document.getElementById('blackHoleAlert');
const blackHoleSummary = document.getElementById('blackHoleSummary');

const inputDailyReflection = document.getElementById('inputDailyReflection');
const btnOpenHistorySnapshots = document.getElementById('btnOpenHistorySnapshots');
const snapshotsModal = document.getElementById('snapshotsModal');
const snapshotsCloseBtn = document.getElementById('snapshotsCloseBtn');
const snapshotsListContainer = document.getElementById('snapshotsListContainer');
const reviewNotTodayBanner = document.getElementById('reviewNotTodayBanner');
const reviewViewingDateText = document.getElementById('reviewViewingDateText');
const btnBackToTodayInReview = document.getElementById('btnBackToTodayInReview');

const btnSaveDailyZhixing = document.getElementById('btnSaveDailyZhixing');
const btnSyncObsidianInReview = document.getElementById('btnSyncObsidianInReview');
const btnCopyDailyZhixing = document.getElementById('btnCopyDailyZhixing');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  renderCategoryChips();
  // Check if first time, if no records, offer sample load
  if (Object.keys(state.records).length === 0) {
    loadSampleData();
  }
  // 首次载入即时同步填入草稿与打卡，防止 DOM 滞后与意外空值冲刷
  renderDailyPlanSection();
  renderDailyReflectionSection();
  renderDailyWeightSection();
  renderHabitsSection();
  renderWinnerTrials();
  renderBodyStateSection();
  updateUI();
  registerServiceWorker();

  // ☁️ 首次载入若配置了云桥，尝试自动静默从谷歌云盘拉取同步最新状态
  if (CloudSyncAdapter.getUrl()) {
    CloudSyncAdapter.pullFromCloud().then(cloudState => {
      if (cloudState) {
        renderDailyPlanSection();
        renderDailyReflectionSection();
        renderDailyWeightSection();
        renderHabitsSection();
        renderWinnerTrials();
        renderBodyStateSection();
        updateUI();
        console.log('☁️ 谷歌云端状态已自动合并同步');
      }
    });
  }
});

function initEventListeners() {
  // Date navigation
  elPrevDateBtn.addEventListener('click', () => changeDate(-1));
  elNextDateBtn.addEventListener('click', () => changeDate(1));
  elTodayBtn.addEventListener('click', () => {
    state.currentDate = getTodayString();
    updateUI();
  });

  // Modal open/close
  fabAddBtn.addEventListener('click', () => openRecordModal());
  modalCloseBtn.addEventListener('click', () => closeRecordModal());
  recordModal.addEventListener('click', (e) => {
    if (e.target === recordModal) closeRecordModal();
  });

  // Changelog Modal
  const versionBadge = document.getElementById('versionBadge');
  const btnOpenChangelog = document.getElementById('btnOpenChangelog');
  const changelogModal = document.getElementById('changelogModal');
  const changelogCloseBtn = document.getElementById('changelogCloseBtn');

  function openChangelog() {
    if (changelogModal) changelogModal.classList.add('open');
  }

  function closeChangelog() {
    if (changelogModal) changelogModal.classList.remove('open');
  }

  if (versionBadge) versionBadge.addEventListener('click', openChangelog);
  if (btnOpenChangelog) btnOpenChangelog.addEventListener('click', openChangelog);
  if (changelogCloseBtn) changelogCloseBtn.addEventListener('click', closeChangelog);
  if (changelogModal) {
    changelogModal.addEventListener('click', (e) => {
      if (e.target === changelogModal) closeChangelog();
    });
  }

  // Quick duration adders
  document.querySelectorAll('.quick-dur-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const addMinutes = parseInt(btn.dataset.mins, 10);
      const startMins = timeToMinutes(inputStartTime.value);
      inputEndTime.value = minutesToTime(startMins + addMinutes);
    });
  });

  // Record Form Submit
  recordForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSaveRecord();
  });

  // Tabs switching
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetTab = item.dataset.tab;
      switchTab(targetTab);
    });
  });

  // --- v1.2.0: 知行三段与体重模块事件监听 ---
  // 体重步进微调按钮 (-0.1 / +0.1)
  document.querySelectorAll('.weight-step-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const step = parseFloat(btn.dataset.step) || 0;
      let curr = parseFloat(inputDailyWeight.value);
      if (isNaN(curr) || curr <= 0) {
        // 取最近一次记录的体重作为基准，若无则默认为 65.0
        const recentWeight = getMostRecentWeight();
        curr = recentWeight > 0 ? recentWeight : 65.0;
      } else {
        curr += step;
      }
      inputDailyWeight.value = curr.toFixed(1);
      handleSaveWeightOnly(false);
    });
  });

  // 独立保存体重按钮
  if (btnSaveWeightOnly) {
    btnSaveWeightOnly.addEventListener('click', () => handleSaveWeightOnly(true));
  }

  // 体重输入框实时输入防抖保存
  if (inputDailyWeight) {
    inputDailyWeight.addEventListener('input', handleWeightInput);
  }

  // 体重走势折叠抽屉切换
  if (btnToggleWeightTrend && weightTrendDrawer) {
    btnToggleWeightTrend.addEventListener('click', () => {
      const isHidden = weightTrendDrawer.style.display === 'none';
      weightTrendDrawer.style.display = isHidden ? 'block' : 'none';
      btnToggleWeightTrend.innerHTML = isHidden ? '<span>✕ 收起走势</span>' : '<span>📈 近期走势</span>';
      if (isHidden) renderWeightInlineChart();
    });
  }

  // 计划输入框实时输入自动持久化
  if (inputDailyPlan) {
    inputDailyPlan.addEventListener('input', handlePlanInput);
  }

  // 计划模板插入
  if (btnInsertPlanTemplate && inputDailyPlan) {
    btnInsertPlanTemplate.addEventListener('click', () => {
      const current = inputDailyPlan.value.trim();
      if (!current) {
        inputDailyPlan.value = '1. \n2. \n3. ';
      } else {
        inputDailyPlan.value = current + '\n' + (current.split('\n').length + 1) + '. ';
      }
      handlePlanInput();
      inputDailyPlan.focus();
    });
  }

  // 跨天友好提示回到今天
  if (btnBackToTodayInReview) {
    btnBackToTodayInReview.addEventListener('click', () => {
      state.currentDate = getTodayString();
      updateUI();
    });
  }

  // 防误丢历史快照保险箱 (计划与反思均可一键打开)
  document.querySelectorAll('.btn-open-history-snapshots, #btnOpenHistorySnapshots').forEach(btn => {
    btn.addEventListener('click', openSnapshotsModal);
  });
  if (snapshotsCloseBtn) {
    snapshotsCloseBtn.addEventListener('click', closeSnapshotsModal);
  }
  if (snapshotsModal) {
    snapshotsModal.addEventListener('click', (e) => {
      if (e.target === snapshotsModal) closeSnapshotsModal();
    });
  }

  // 反思输入框实时输入自动持久化
  if (inputDailyReflection) {
    inputDailyReflection.addEventListener('input', handleReflectionInput);
  }

  // 页面离开/切换应用时的双保险即时保存
  window.addEventListener('beforeunload', flushZhixingDrafts);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushZhixingDrafts();
  });

  // 补录时间快捷跳转
  if (btnGoTimelineAdd) {
    btnGoTimelineAdd.addEventListener('click', () => {
      switchTab('timeline');
      openRecordModal();
    });
  }

  // 饼图与摸鱼分析折叠抽屉
  if (btnToggleChartDetails && chartDetailsDrawer) {
    btnToggleChartDetails.addEventListener('click', () => {
      const isHidden = chartDetailsDrawer.style.display === 'none';
      chartDetailsDrawer.style.display = isHidden ? 'block' : 'none';
      if (toggleChartLabel) {
        toggleChartLabel.textContent = isHidden ? '📊 收起时间饼图与分析 ▴' : '📊 展开时间饼图与摸鱼深度分析 ▾';
      }
    });
  }

  // 践行微步与连赢6次动态打卡事件由 renderHabitsSection() 与 renderWinnerTrials() 挂载驱动

  // 身心觉知芯片点选事件
  document.querySelectorAll('#groupEnergyScore .score-btn').forEach(btn => {
    btn.addEventListener('click', () => handleBodyStateSelect('energy', parseInt(btn.dataset.score, 10)));
  });
  document.querySelectorAll('#groupNoseState .nose-btn').forEach(btn => {
    btn.addEventListener('click', () => handleBodyStateSelect('nose', btn.dataset.val));
  });
  document.querySelectorAll('#groupPostureScore .posture-btn').forEach(btn => {
    btn.addEventListener('click', () => handleBodyStateSelect('postureScore', parseInt(btn.dataset.score, 10)));
  });
  document.querySelectorAll('#groupStressState .stress-btn').forEach(btn => {
    btn.addEventListener('click', () => handleBodyStateSelect('stress', btn.dataset.val));
  });

  const inputRecoverMinutes = document.getElementById('inputRecoverMinutes');
  if (inputRecoverMinutes) {
    inputRecoverMinutes.addEventListener('input', () => {
      if (!state.bodyState[state.currentDate]) state.bodyState[state.currentDate] = {};
      const val = inputRecoverMinutes.value.trim();
      if (val === '') {
        delete state.bodyState[state.currentDate].recoverMinutes;
      } else {
        state.bodyState[state.currentDate].recoverMinutes = parseInt(val, 10) || 0;
      }
      saveBodyState();
    });
  }

  // 整日身心症状与情绪耐受过程文本输入事件
  if (inputBodySymptomNotes) {
    inputBodySymptomNotes.addEventListener('input', handleBodySymptomInput);
  }
  if (inputStressDetailNotes) {
    inputStressDetailNotes.addEventListener('input', handleStressDetailInput);
  }

  // 保存今日知行
  if (btnSaveDailyZhixing) {
    btnSaveDailyZhixing.addEventListener('click', handleSaveDailyZhixing);
  }

  // 复盘页局域网直通写入与一键复制
  if (btnSyncObsidianInReview) {
    btnSyncObsidianInReview.addEventListener('click', syncToObsidianLAN);
  }
  if (btnCopyDailyZhixing) {
    btnCopyDailyZhixing.addEventListener('click', copyDailyZhixingMarkdown);
  }

  // Obsidian Sync & Copy Buttons
  const btnCopyObsidian = document.getElementById('btnCopyObsidian');
  if (btnCopyObsidian) btnCopyObsidian.addEventListener('click', copyObsidianNightlyLog);

  const btnSyncObsidian = document.getElementById('btnSyncObsidian');
  if (btnSyncObsidian) btnSyncObsidian.addEventListener('click', syncToObsidianLAN);

  const btnSyncObsidianInSettings = document.getElementById('btnSyncObsidianInSettings');
  if (btnSyncObsidianInSettings) btnSyncObsidianInSettings.addEventListener('click', syncToObsidianLAN);

  const btnTestObsidianServer = document.getElementById('btnTestObsidianServer');
  if (btnTestObsidianServer) btnTestObsidianServer.addEventListener('click', testObsidianConnection);

  // ☁️ 谷歌云盘云桥同步按钮与弹窗监听 (Google Drive Cloud Bridge)
  const btnCloudSync = document.getElementById('btn-cloud-sync');
  if (btnCloudSync) btnCloudSync.addEventListener('click', handleCloudSync);

  const btnCloudSyncInReview = document.getElementById('btnCloudSyncInReview');
  if (btnCloudSyncInReview) btnCloudSyncInReview.addEventListener('click', handleCloudSync);

  const btnCloudSyncInSettings = document.getElementById('btnCloudSyncInSettings');
  if (btnCloudSyncInSettings) btnCloudSyncInSettings.addEventListener('click', handleCloudSync);

  const btnCloudBridgeCfg = document.getElementById('btn-cloud-bridge-cfg');
  if (btnCloudBridgeCfg) btnCloudBridgeCfg.addEventListener('click', openCloudBridgeModal);

  const btnSaveCloudBridgeInSettings = document.getElementById('btnSaveCloudBridgeInSettings');
  const cloudBridgeUrlInputSettings = document.getElementById('cloudBridgeUrlInputSettings');
  if (cloudBridgeUrlInputSettings) {
    cloudBridgeUrlInputSettings.value = CloudSyncAdapter.getUrl();
  }
  if (btnSaveCloudBridgeInSettings) {
    btnSaveCloudBridgeInSettings.addEventListener('click', () => {
      const val = cloudBridgeUrlInputSettings ? cloudBridgeUrlInputSettings.value.trim() : '';
      CloudSyncAdapter.setUrl(val);
      showToast(val ? '☁️ 谷歌云桥 Web App URL 已保存！' : '已清除云桥配置');
    });
  }

  const btnPullCloudInSettings = document.getElementById('btnPullCloudInSettings');
  if (btnPullCloudInSettings) {
    btnPullCloudInSettings.addEventListener('click', async () => {
      const val = cloudBridgeUrlInputSettings ? cloudBridgeUrlInputSettings.value.trim() : '';
      if (val) CloudSyncAdapter.setUrl(val);
      showToast('☁️ 正在从云端拉取漫游状态...');
      const st = await CloudSyncAdapter.pullFromCloud();
      if (st) {
        renderDailyPlanSection();
        renderDailyReflectionSection();
        renderDailyWeightSection();
        renderHabitsSection();
        renderWinnerTrials();
        renderBodyStateSection();
        updateUI();
        showToast('🟢 云端漫游状态已拉取并成功合并！');
      } else {
        showToast('⚠️ 未能拉取到云端数据，请检查网络或 URL');
      }
    });
  }

  const cloudBridgeModal = document.getElementById('cloudBridgeModal');
  const cloudBridgeCloseBtn = document.getElementById('cloudBridgeCloseBtn');
  const btnSaveCloudBridgeUrl = document.getElementById('btnSaveCloudBridgeUrl');
  const btnPullCloudNow = document.getElementById('btnPullCloudNow');
  const cloudBridgeUrlInput = document.getElementById('cloudBridgeUrlInput');

  if (cloudBridgeCloseBtn) cloudBridgeCloseBtn.addEventListener('click', closeCloudBridgeModal);
  if (cloudBridgeModal) {
    cloudBridgeModal.addEventListener('click', (e) => {
      if (e.target === cloudBridgeModal) closeCloudBridgeModal();
    });
  }
  if (btnSaveCloudBridgeUrl) {
    btnSaveCloudBridgeUrl.addEventListener('click', () => {
      const val = cloudBridgeUrlInput ? cloudBridgeUrlInput.value.trim() : '';
      CloudSyncAdapter.setUrl(val);
      if (cloudBridgeUrlInputSettings) cloudBridgeUrlInputSettings.value = val;
      showToast(val ? '☁️ 谷歌云桥 Web App URL 已保存！' : '已清除云桥配置');
      closeCloudBridgeModal();
    });
  }
  if (btnPullCloudNow) {
    btnPullCloudNow.addEventListener('click', async () => {
      const val = cloudBridgeUrlInput ? cloudBridgeUrlInput.value.trim() : '';
      if (val) CloudSyncAdapter.setUrl(val);
      showToast('☁️ 正在从云端拉取漫游状态...');
      const st = await CloudSyncAdapter.pullFromCloud();
      if (st) {
        renderDailyPlanSection();
        renderDailyReflectionSection();
        renderDailyWeightSection();
        renderHabitsSection();
        renderWinnerTrials();
        renderBodyStateSection();
        updateUI();
        showToast('🟢 云端漫游状态已拉取并成功合并！');
        closeCloudBridgeModal();
      } else {
        showToast('⚠️ 未能拉取到云端数据，请检查网络或 URL');
      }
    });
  }

  // Category Manager Modal Listeners
  const btnOpenCategoryManager = document.getElementById('btnOpenCategoryManager');
  if (btnOpenCategoryManager) btnOpenCategoryManager.addEventListener('click', openCategoryModal);

  const categoryModalCloseBtn = document.getElementById('categoryModalCloseBtn');
  if (categoryModalCloseBtn) categoryModalCloseBtn.addEventListener('click', closeCategoryModal);

  const categoryModal = document.getElementById('categoryModal');
  if (categoryModal) {
    categoryModal.addEventListener('click', (e) => {
      if (e.target === categoryModal) closeCategoryModal();
    });
  }

  const btnAddCategorySubmit = document.getElementById('btnAddCategorySubmit');
  if (btnAddCategorySubmit) btnAddCategorySubmit.addEventListener('click', handleAddNewCategory);

  const btnResetDefaultCategories = document.getElementById('btnResetDefaultCategories');
  if (btnResetDefaultCategories) btnResetDefaultCategories.addEventListener('click', handleResetDefaultCategories);

  // Habits Manager Modal Listeners
  const btnManageHabits = document.getElementById('btn-manage-habits');
  if (btnManageHabits) btnManageHabits.addEventListener('click', openHabitsModal);

  const habitsModalCloseBtn = document.getElementById('habitsModalCloseBtn');
  if (habitsModalCloseBtn) habitsModalCloseBtn.addEventListener('click', closeHabitsModal);

  const habitsModal = document.getElementById('habitsModal');
  if (habitsModal) {
    habitsModal.addEventListener('click', (e) => {
      if (e.target === habitsModal) closeHabitsModal();
    });
  }

  const btnSubmitNewHabit = document.getElementById('btnSubmitNewHabit');
  if (btnSubmitNewHabit) {
    btnSubmitNewHabit.addEventListener('click', () => {
      const typeSel = document.getElementById('newHabitType');
      const nameInp = document.getElementById('newHabitName');
      const descInp = document.getElementById('newHabitDesc');
      const name = nameInp ? nameInp.value.trim() : '';
      const desc = descInp ? descInp.value.trim() : '';
      const type = typeSel ? typeSel.value : 'baseline';
      if (!name) {
        alert('请输入微步名称！');
        return;
      }
      HabitManager.addHabit(type, name, desc);
      if (nameInp) nameInp.value = '';
      if (descInp) descInp.value = '';
      renderHabitsManageList();
      renderHabitsSection();
      showToast(`已添加${type === 'advanced' ? '进阶' : '保底'}微步「${name}」`);
    });
  }

  // Winner Trial Modal Listeners
  const btnAddTrial = document.getElementById('btn-add-trial');
  if (btnAddTrial) btnAddTrial.addEventListener('click', openTrialModal);

  const trialModalCloseBtn = document.getElementById('trialModalCloseBtn');
  if (trialModalCloseBtn) trialModalCloseBtn.addEventListener('click', closeTrialModal);

  const trialModal = document.getElementById('trialModal');
  if (trialModal) {
    trialModal.addEventListener('click', (e) => {
      if (e.target === trialModal) closeTrialModal();
    });
  }

  const btnSubmitTrial = document.getElementById('btnSubmitTrial');
  if (btnSubmitTrial) {
    btnSubmitTrial.addEventListener('click', () => {
      const nameInp = document.getElementById('trialNameInput');
      const targetInp = document.getElementById('trialTargetInput');
      const name = nameInp ? nameInp.value.trim() : '';
      const target = targetInp ? parseInt(targetInp.value, 10) || 6 : 6;
      if (!name) {
        alert('请输入小战场目标名称！');
        return;
      }
      WinnerTrialManager.addTrial(name, target);
      closeTrialModal();
      renderWinnerTrials();
      showToast(`🎯 已设立新战场「${name}」！连胜 6 次突触稳固`);
    });
  }

  // Settings actions
  const btnLoadSample = document.getElementById('btnLoadSample');
  if (btnLoadSample) btnLoadSample.addEventListener('click', () => {
    loadSampleData();
    updateUI();
    alert('已成功加载一整天的典型生活示例数据！快去主页时间流看看吧。');
  });

  const btnClearData = document.getElementById('btnClearData');
  if (btnClearData) btnClearData.addEventListener('click', () => {
    if (confirm('确定要清空所有数据吗？此操作不可撤销。')) {
      state.records = {};
      state.reflections = {};
      saveRecords();
      saveReflections();
      updateUI();
      alert('所有记录已清空。');
    }
  });

  const btnExportData = document.getElementById('btnExportData');
  if (btnExportData) btnExportData.addEventListener('click', exportData);

  const btnImportData = document.getElementById('btnImportData');
  const fileImport = document.getElementById('fileImport');
  if (btnImportData && fileImport) {
    btnImportData.addEventListener('click', () => fileImport.click());
    fileImport.addEventListener('change', importData);
  }
}

function changeDate(daysDelta) {
  if (state.activeTab === 'review') {
    flushZhixingDrafts();
  }
  const [y, m, d] = state.currentDate.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  dateObj.setDate(dateObj.getDate() + daysDelta);
  const ny = dateObj.getFullYear();
  const nm = String(dateObj.getMonth() + 1).padStart(2, '0');
  const nd = String(dateObj.getDate()).padStart(2, '0');
  state.currentDate = `${ny}-${nm}-${nd}`;
  updateUI();
}

function updateUI() {
  updateDateHeader();
  renderTimelineStream();
  renderSpectrumBar();
  updateQuickStats();
  if (state.activeTab === 'review') {
    renderReviewTab();
  } else if (state.activeTab === 'trends') {
    renderTrendsTab();
  }
}

function updateDateHeader() {
  const [y, m, d] = state.currentDate.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const weekName = weekdays[dateObj.getDay()];
  const isToday = state.currentDate === getTodayString();
  elDateDisplay.textContent = `${m}月${d}日 ${weekName}${isToday ? ' (今天)' : ''}`;
}

function renderCategoryChips() {
  categoryChipsContainer.innerHTML = '';
  state.categories.forEach(cat => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `category-chip-btn ${state.selectedCategory === cat.id ? 'selected' : ''}`;
    btn.style.color = cat.color;
    btn.innerHTML = `
      <span style="font-size: 1.25rem;">${cat.icon}</span>
      <span>${cat.name}</span>
    `;
    btn.addEventListener('click', () => {
      state.selectedCategory = cat.id;
      renderCategoryChips();
    });
    categoryChipsContainer.appendChild(btn);
  });
}

function getTodayRecords() {
  return state.records[state.currentDate] || [];
}

// Render the 24h timeline stream including gap cards
function renderTimelineStream() {
  const records = getTodayRecords().slice().sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  elTimelineStream.innerHTML = '';

  if (records.length === 0) {
    elEmptyNotice.style.display = 'block';
    // Single 24h gap
    const fullDayGap = createGapElement('00:00', '24:00', 1440);
    elTimelineStream.appendChild(fullDayGap);
    return;
  }

  elEmptyNotice.style.display = 'none';

  let currentMin = 0;

  records.forEach((rec, idx) => {
    const startMin = timeToMinutes(rec.start);
    const endMin = timeToMinutes(rec.end);

    // If there is a gap before this record
    if (startMin > currentMin) {
      const gapEl = createGapElement(minutesToTime(currentMin), rec.start, startMin - currentMin);
      elTimelineStream.appendChild(gapEl);
    }

    // Render record item
    const recEl = createRecordElement(rec);
    elTimelineStream.appendChild(recEl);

    currentMin = Math.max(currentMin, endMin);
  });

  // Gap until end of day (24:00)
  if (currentMin < 1440) {
    const gapEl = createGapElement(minutesToTime(currentMin), '24:00', 1440 - currentMin);
    elTimelineStream.appendChild(gapEl);
  }
}

function createRecordElement(rec) {
  const cat = state.categories.find(c => c.id === rec.category) || {
    name: '未命名', icon: '📌', color: '#94A3B8'
  };
  const durationText = formatDuration(rec.start, rec.end);

  const card = document.createElement('div');
  card.className = 'timeline-item';
  card.title = '点击直接编辑此时段记录';
  card.innerHTML = `
    <div class="time-badge-col">
      <div class="time-range">${rec.start} - ${rec.end}</div>
      <div class="time-duration">${durationText}</div>
    </div>
    <div class="timeline-divider-line" style="background-color: ${cat.color};"></div>
    <div class="timeline-item-body">
      <div class="timeline-item-title-row">
        <span class="timeline-item-title">${cat.icon} ${cat.name}</span>
        <span class="timeline-item-category" style="background: ${cat.color}18; color: ${cat.color};">
          ${cat.isWaster ? '⚠️ 摸鱼消耗' : (cat.isProductive ? '✨ 高效专注' : '日常')}
        </span>
      </div>
      ${rec.note ? `<div class="timeline-item-note">${escapeHtml(rec.note)}</div>` : ''}
      <div class="timeline-item-actions">
        <span style="font-size: 0.72rem; color: var(--text-light); margin-right: auto; opacity: 0.85;">轻按编辑 ✏️</span>
        <button class="item-action-btn del-btn del" title="删除此记录">🗑️</button>
      </div>
    </div>
  `;

  // 点击整个卡片任何区域（除了垃圾桶）直接触发编辑
  card.addEventListener('click', (e) => {
    if (!e.target.closest('.del-btn')) {
      openRecordModal(rec);
    }
  });

  // 单独点击垃圾桶极速删除
  const delBtn = card.querySelector('.del-btn');
  if (delBtn) {
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`确定删除时段 ${rec.start} - ${rec.end} 的记录吗？`)) {
        deleteRecord(rec.id);
        showToast('已删除记录');
      }
    });
  }

  return card;
}

function createGapElement(startTime, endTime, diffMins) {
  const hours = (diffMins / 60).toFixed(1);
  const gap = document.createElement('div');
  gap.className = 'timeline-gap';
  gap.innerHTML = `
    <div class="gap-info">
      <span class="gap-time">${startTime} - ${endTime}</span>
      <span class="gap-hint">未记录空隙 (${hours}小时)</span>
    </div>
    <button class="gap-add-btn">
      <span>➕</span> 补录这时段
    </button>
  `;
  gap.querySelector('.gap-add-btn').addEventListener('click', () => {
    openRecordModal(null, startTime, endTime === '24:00' ? '23:59' : endTime);
  });
  return gap;
}

// Render the 24h continuous spectrum bar at the top
function renderSpectrumBar() {
  const records = getTodayRecords().slice().sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  elSpectrumBar.innerHTML = '';

  let currentMin = 0;

  records.forEach(rec => {
    const startMin = timeToMinutes(rec.start);
    const endMin = timeToMinutes(rec.end);
    const cat = state.categories.find(c => c.id === rec.category) || { color: '#CBD5E1' };

    // Fill gap if any
    if (startMin > currentMin) {
      const gapWidth = ((startMin - currentMin) / 1440) * 100;
      const gapSeg = document.createElement('div');
      gapSeg.className = 'spectrum-segment';
      gapSeg.style.width = `${gapWidth}%`;
      gapSeg.style.background = '#E2E8F0';
      elSpectrumBar.appendChild(gapSeg);
    }

    const duration = endMin - startMin;
    if (duration > 0) {
      const width = (duration / 1440) * 100;
      const seg = document.createElement('div');
      seg.className = 'spectrum-segment';
      seg.style.width = `${width}%`;
      seg.style.background = cat.color;
      seg.title = `${rec.start} - ${rec.end} (${formatDuration(rec.start, rec.end)})`;
      elSpectrumBar.appendChild(seg);
    }

    currentMin = Math.max(currentMin, endMin);
  });

  if (currentMin < 1440) {
    const gapWidth = ((1440 - currentMin) / 1440) * 100;
    const gapSeg = document.createElement('div');
    gapSeg.className = 'spectrum-segment';
    gapSeg.style.width = `${gapWidth}%`;
    gapSeg.style.background = '#E2E8F0';
    elSpectrumBar.appendChild(gapSeg);
  }
}

// Quick stats calculation
function updateQuickStats() {
  const records = getTodayRecords();
  let totalMins = 0;
  let wasterMins = 0;
  let productiveMins = 0;

  records.forEach(rec => {
    const dur = getDurationMinutes(rec.start, rec.end);
    totalMins += dur;
    const cat = state.categories.find(c => c.id === rec.category);
    if (cat) {
      if (cat.isWaster) wasterMins += dur;
      if (cat.isProductive) productiveMins += dur;
    }
  });

  elLoggedHours.textContent = `${(totalMins / 60).toFixed(1)}h`;
  elWasterHours.textContent = `${(wasterMins / 60).toFixed(1)}h`;
  elProductiveHours.textContent = `${(productiveMins / 60).toFixed(1)}h`;
}

// Modal handling
function openRecordModal(existingRecord = null, defaultStart = null, defaultEnd = null) {
  const btnDeleteInModal = document.getElementById('btnDeleteRecordInModal');
  const btnSubmitRecord = document.getElementById('btnSubmitRecord');

  if (existingRecord) {
    state.editingRecordId = existingRecord.id;
    modalTitle.textContent = `修改记录 (${existingRecord.start} - ${existingRecord.end})`;
    if (btnSubmitRecord) btnSubmitRecord.textContent = '✓ 保存修改';
    if (btnDeleteInModal) {
      btnDeleteInModal.style.display = 'block';
      btnDeleteInModal.onclick = () => {
        if (confirm(`确定删除 ${existingRecord.start} - ${existingRecord.end} 的记录吗？`)) {
          deleteRecord(existingRecord.id);
          closeRecordModal();
          showToast('已删除该记录');
        }
      };
    }
    state.selectedCategory = existingRecord.category;
    inputStartTime.value = existingRecord.start;
    inputEndTime.value = existingRecord.end;
    inputNote.value = existingRecord.note || '';
  } else {
    state.editingRecordId = null;
    modalTitle.textContent = '记录新时间块';
    if (btnSubmitRecord) btnSubmitRecord.textContent = '✓ 确定保存时间块';
    if (btnDeleteInModal) btnDeleteInModal.style.display = 'none';
    state.selectedCategory = state.categories[0] ? state.categories[0].id : 'phone';

    if (defaultStart && defaultEnd) {
      inputStartTime.value = defaultStart;
      inputEndTime.value = defaultEnd;
    } else {
      // Find end time of last recorded item today
      const records = getTodayRecords().slice().sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
      if (records.length > 0) {
        const lastRec = records[records.length - 1];
        inputStartTime.value = lastRec.end;
        inputEndTime.value = minutesToTime(timeToMinutes(lastRec.end) + 30);
      } else {
        inputStartTime.value = '07:00';
        inputEndTime.value = '07:30';
      }
    }
    inputNote.value = '';
  }

  renderCategoryChips();
  recordModal.classList.add('open');
}

function closeRecordModal() {
  recordModal.classList.remove('open');
  state.editingRecordId = null;
}

function handleSaveRecord() {
  const start = inputStartTime.value;
  const end = inputEndTime.value;
  const note = inputNote.value.trim();

  if (!start || !end) {
    alert('请填写起始时间和结束时间');
    return;
  }

  if (timeToMinutes(end) <= timeToMinutes(start)) {
    alert('结束时间必须晚于起始时间！');
    return;
  }

  if (!state.records[state.currentDate]) {
    state.records[state.currentDate] = [];
  }

  const list = state.records[state.currentDate];

  if (state.editingRecordId) {
    const idx = list.findIndex(r => r.id === state.editingRecordId);
    if (idx !== -1) {
      list[idx] = {
        ...list[idx],
        category: state.selectedCategory,
        start,
        end,
        note
      };
    }
  } else {
    const newRecord = {
      id: 'rec_' + Date.now(),
      category: state.selectedCategory,
      start,
      end,
      note
    };
    list.push(newRecord);
  }

  saveRecords();
  closeRecordModal();
  updateUI();
}

function deleteRecord(recordId) {
  if (!state.records[state.currentDate]) return;
  state.records[state.currentDate] = state.records[state.currentDate].filter(r => r.id !== recordId);
  saveRecords();
  updateUI();
}

// Tabs Switch
function switchTab(tabName) {
  if (state.activeTab === 'review' && tabName !== 'review') {
    flushZhixingDrafts();
  }
  state.activeTab = tabName;
  navItems.forEach(item => {
    item.classList.toggle('active', item.dataset.tab === tabName);
  });
  tabPanes.forEach(pane => {
    pane.style.display = (pane.id === `tab-${tabName}`) ? 'block' : 'none';
  });

  if (tabName === 'timeline') {
    fabAddBtn.style.display = 'flex';
  } else {
    fabAddBtn.style.display = 'none';
  }

  updateUI();
}

// ========================================================
// v1.2.0: 知行三段合流 (晨起立志 + 暮夜对账 + 诚意慎独) 与体重数据
// ========================================================

function getMostRecentWeight() {
  const dates = Object.keys(state.weights).sort();
  if (dates.length === 0) return 0;
  return state.weights[dates[dates.length - 1]] || 0;
}

// Review Tab Controller
function renderReviewTab() {
  // 跨天/非今日浏览友好提示 (防止用户切错日期误以为数据丢失)
  const isToday = state.currentDate === getTodayString();
  if (reviewNotTodayBanner) {
    if (!isToday) {
      reviewNotTodayBanner.style.display = 'flex';
      if (reviewViewingDateText) reviewViewingDateText.textContent = state.currentDate;
    } else {
      reviewNotTodayBanner.style.display = 'none';
    }
  }

  renderDailyWeightSection();
  renderBodyStateSection();
  renderDailyPlanSection();
  renderDailyExecutionSection();
  renderHabitsSection();
  renderWinnerTrials();
  renderDailyReflectionSection();
}

// 1. 体重模块渲染与计算
function renderDailyWeightSection() {
  if (!inputDailyWeight) return;

  const currentWeight = state.weights[state.currentDate];
  inputDailyWeight.value = (currentWeight !== undefined && currentWeight !== null) ? currentWeight : '';

  // 计算与昨天的差值
  const d = new Date(state.currentDate);
  d.setDate(d.getDate() - 1);
  const yestStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const yestWeight = state.weights[yestStr];

  if (weightDiffTag) {
    if (currentWeight !== undefined && currentWeight !== null && yestWeight !== undefined && yestWeight !== null) {
      const diff = Number((currentWeight - yestWeight).toFixed(1));
      if (diff < 0) {
        weightDiffTag.className = 'weight-diff-tag down';
        weightDiffTag.textContent = `↓ 减轻 ${Math.abs(diff)} kg`;
      } else if (diff > 0) {
        weightDiffTag.className = 'weight-diff-tag up';
        weightDiffTag.textContent = `↑ 增加 ${diff} kg`;
      } else {
        weightDiffTag.className = 'weight-diff-tag flat';
        weightDiffTag.textContent = '与昨日持平';
      }
    } else if (currentWeight !== undefined && currentWeight !== null) {
      weightDiffTag.className = 'weight-diff-tag flat';
      weightDiffTag.textContent = '今日已记';
    } else {
      weightDiffTag.className = 'weight-diff-tag flat';
      weightDiffTag.textContent = '待记录';
    }
  }

  // 若展开了折叠抽屉，重新渲染内联走势图
  if (weightTrendDrawer && weightTrendDrawer.style.display !== 'none') {
    renderWeightInlineChart();
  }
}

function handleSaveWeightOnly(showToastNotice = true) {
  const val = inputDailyWeight.value.trim();
  if (val === '') {
    delete state.weights[state.currentDate];
  } else {
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      state.weights[state.currentDate] = Number(num.toFixed(1));
    }
  }
  saveWeights();
  renderDailyWeightSection();
  if (showToastNotice) {
    showToast('⚖️ 体重数据已保存');
  }
}

// 自动调整多行输入框高度 (随内容动态撑开，不再拘谨)
function autoResizeTextarea(el) {
  if (!el) return;
  el.style.height = 'auto';
  let defaultMinH = el.classList.contains('large') ? 190 : 130;
  if (el.style.minHeight) {
    const parsedMin = parseInt(el.style.minHeight, 10);
    if (!isNaN(parsedMin)) defaultMinH = parsedMin;
  }
  el.style.height = Math.max(el.scrollHeight, defaultMinH) + 'px';
}

// ==========================================
// 知行草稿快照保险箱 (防误丢与历史找回)
// ==========================================
const SNAPSHOTS_STORAGE_KEY = 'tm_zhixing_snapshots';

function loadZhixingSnapshots() {
  try {
    const raw = localStorage.getItem(SNAPSHOTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveZhixingSnapshot(type, text) {
  if (!text || text.trim().length < 2) return;
  const snapshots = loadZhixingSnapshots();
  const trimmed = text.trim();

  // 若最新一条快照类型、日期相同且内容完全一致，无需重复记录
  if (snapshots.length > 0) {
    const latest = snapshots[0];
    if (latest.date === state.currentDate && latest.type === type && latest.text === trimmed) {
      return;
    }
    // 60 秒内的连续打字微调，直接平滑更新最新一条
    if (latest.date === state.currentDate && latest.type === type && (Date.now() - latest.timestamp < 60000)) {
      latest.text = trimmed;
      latest.timestamp = Date.now();
      latest.timeStr = formatSnapshotTime(new Date());
      latest.charCount = trimmed.length;
      try {
        localStorage.setItem(SNAPSHOTS_STORAGE_KEY, JSON.stringify(snapshots));
      } catch (e) {}
      return;
    }
  }

  const now = new Date();
  const newSnap = {
    id: 'snap_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
    timestamp: Date.now(),
    date: state.currentDate,
    timeStr: formatSnapshotTime(now),
    type: type, // 'plan' | 'reflection'
    text: trimmed,
    charCount: trimmed.length
  };

  snapshots.unshift(newSnap);
  if (snapshots.length > 40) {
    snapshots.length = 40;
  }

  try {
    localStorage.setItem(SNAPSHOTS_STORAGE_KEY, JSON.stringify(snapshots));
  } catch (e) {}
}

function formatSnapshotTime(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${m}-${day} ${h}:${min}:${s}`;
}

function openSnapshotsModal() {
  if (!snapshotsModal) return;
  renderSnapshotsList();
  snapshotsModal.classList.add('open');
}

function closeSnapshotsModal() {
  if (!snapshotsModal) return;
  snapshotsModal.classList.remove('open');
}

function renderSnapshotsList() {
  if (!snapshotsListContainer) return;
  const snapshots = loadZhixingSnapshots();
  if (snapshots.length === 0) {
    snapshotsListContainer.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 30px 10px; font-size: 0.85rem;">
        🌱 暂无历史快照记录。<br>
        当您在【晨起立志·计划】或【复盘反思·诚意慎独】中输入文字时，系统会自动在本地生成防丢快照。
      </div>
    `;
    return;
  }

  snapshotsListContainer.innerHTML = '';
  snapshots.forEach((snap, idx) => {
    const item = document.createElement('div');
    item.className = 'snapshot-card-item';
    item.style.cssText = `
      background: var(--bg-card);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-md);
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    `;

    const isPlan = snap.type === 'plan';
    const typeLabel = isPlan ? '🎯 晨起计划' : '🪞 复盘反思';
    const typeBadgeColor = isPlan
      ? 'background: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE;'
      : 'background: #FAF5FF; color: #7E22CE; border: 1px solid #E9D5FF;';

    item.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; font-weight: 600; ${typeBadgeColor}">
            ${typeLabel}
          </span>
          <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500;">
            ${snap.timeStr} (${snap.date})
          </span>
        </div>
        <span style="font-size: 0.72rem; color: var(--text-muted);">
          ${snap.charCount} 字
        </span>
      </div>
      <div style="font-size: 0.82rem; color: var(--text-primary); white-space: pre-wrap; max-height: 80px; overflow-y: auto; background: var(--bg-hover); padding: 6px 8px; border-radius: 4px; line-height: 1.4;">
        ${escapeHtml(snap.text)}
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px;">
        <button type="button" class="zhixing-tool-btn btn-restore-snap" data-idx="${idx}" style="background: #2563EB; color: #ffffff; border: none; font-weight: 600; padding: 4px 10px;">
          ↺ 恢复此条到输入框
        </button>
      </div>
    `;

    snapshotsListContainer.appendChild(item);
  });

  // 绑定恢复按钮事件
  snapshotsListContainer.querySelectorAll('.btn-restore-snap').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const targetSnap = snapshots[idx];
      if (!targetSnap) return;

      const typeName = targetSnap.type === 'plan' ? '【今日计划】' : '【复盘反思】';
      if (confirm(`确定将这条 ${targetSnap.timeStr} 的 ${typeName} 快照内容恢复到当前日期的输入框吗？\n当前已存在的内容将被替换。`)) {
        if (targetSnap.type === 'plan') {
          if (inputDailyPlan) {
            inputDailyPlan.value = targetSnap.text;
            autoResizeTextarea(inputDailyPlan);
          }
          state.plans[state.currentDate] = targetSnap.text;
          savePlans();
        } else {
          if (inputDailyReflection) {
            inputDailyReflection.value = targetSnap.text;
            autoResizeTextarea(inputDailyReflection);
          }
          state.reflections[state.currentDate] = targetSnap.text;
          saveReflections();
        }
        closeSnapshotsModal();
        showToast(`✅ 已成功恢复 ${typeName} 历史快照！`);
      }
    });
  });
}

// 页面退出/切出前强制刷盘 (严密防御性保护，拒绝空值抹除已有数据)
function flushZhixingDrafts() {
  if (state.activeTab !== 'review') return;

  if (inputDailyPlan) {
    const pVal = inputDailyPlan.value;
    if (pVal || !state.plans[state.currentDate]) {
      state.plans[state.currentDate] = pVal;
    }
  }
  if (inputDailyReflection) {
    const rVal = inputDailyReflection.value;
    if (rVal || !state.reflections[state.currentDate]) {
      state.reflections[state.currentDate] = rVal;
    }
  }
  if (inputDailyWeight && inputDailyWeight.value.trim() !== '') {
    const num = parseFloat(inputDailyWeight.value.trim());
    if (!isNaN(num) && num > 0) state.weights[state.currentDate] = Number(num.toFixed(1));
  }
  if (inputBodySymptomNotes) {
    const sVal = inputBodySymptomNotes.value;
    if (!state.bodyState[state.currentDate]) state.bodyState[state.currentDate] = {};
    if (sVal || !state.bodyState[state.currentDate].bodySymptomNotes) {
      state.bodyState[state.currentDate].bodySymptomNotes = sVal;
    }
  }
  if (inputStressDetailNotes) {
    const dVal = inputStressDetailNotes.value;
    if (!state.bodyState[state.currentDate]) state.bodyState[state.currentDate] = {};
    if (dVal || !state.bodyState[state.currentDate].stressDetailNotes) {
      state.bodyState[state.currentDate].stressDetailNotes = dVal;
    }
  }
  savePlans();
  saveReflections();
  saveWeights();
  saveBodyState();
}

// 计划实时自动保存防抖处理
let planSaveTimer = null;
function handlePlanInput() {
  if (!inputDailyPlan) return;
  const val = inputDailyPlan.value;
  state.plans[state.currentDate] = val;
  autoResizeTextarea(inputDailyPlan);

  const tag = document.getElementById('planAutoSaveTag');
  if (tag) {
    tag.className = 'auto-save-tag saving';
    tag.textContent = '💾 保存中...';
  }

  clearTimeout(planSaveTimer);
  planSaveTimer = setTimeout(() => {
    savePlans();
    saveZhixingSnapshot('plan', val);
    if (tag) {
      tag.className = 'auto-save-tag';
      tag.textContent = '🟢 实时已存';
    }
  }, 200);
}

// 整日身心症状实时自动保存防抖处理
let symptomSaveTimer = null;
function handleBodySymptomInput() {
  if (!inputBodySymptomNotes) return;
  const val = inputBodySymptomNotes.value;
  if (!state.bodyState[state.currentDate]) state.bodyState[state.currentDate] = {};
  state.bodyState[state.currentDate].bodySymptomNotes = val;
  autoResizeTextarea(inputBodySymptomNotes);

  const tag = document.getElementById('symptomAutoSaveTag');
  if (tag) {
    tag.className = 'auto-save-tag saving';
    tag.textContent = '💾 保存中...';
  }

  clearTimeout(symptomSaveTimer);
  symptomSaveTimer = setTimeout(() => {
    saveBodyState();
    if (tag) {
      tag.className = 'auto-save-tag';
      tag.textContent = '🟢 实时已存';
    }
  }, 200);
}

// 情绪耐受过程实时自动保存防抖处理
let stressDetailSaveTimer = null;
function handleStressDetailInput() {
  if (!inputStressDetailNotes) return;
  const val = inputStressDetailNotes.value;
  if (!state.bodyState[state.currentDate]) state.bodyState[state.currentDate] = {};
  state.bodyState[state.currentDate].stressDetailNotes = val;
  autoResizeTextarea(inputStressDetailNotes);

  const tag = document.getElementById('stressDetailAutoSaveTag');
  if (tag) {
    tag.className = 'auto-save-tag saving';
    tag.textContent = '💾 保存中...';
  }

  clearTimeout(stressDetailSaveTimer);
  stressDetailSaveTimer = setTimeout(() => {
    saveBodyState();
    if (tag) {
      tag.className = 'auto-save-tag';
      tag.textContent = '🟢 实时已存';
    }
  }, 200);
}

// 反思实时自动保存防抖处理
let reflSaveTimer = null;
function handleReflectionInput() {
  if (!inputDailyReflection) return;
  const val = inputDailyReflection.value;
  state.reflections[state.currentDate] = val;
  autoResizeTextarea(inputDailyReflection);

  const tag = document.getElementById('reflAutoSaveTag');
  if (tag) {
    tag.className = 'auto-save-tag saving';
    tag.textContent = '💾 保存中...';
  }

  clearTimeout(reflSaveTimer);
  reflSaveTimer = setTimeout(() => {
    saveReflections();
    saveZhixingSnapshot('reflection', val);
    if (tag) {
      tag.className = 'auto-save-tag';
      tag.textContent = '🟢 实时已存';
    }
  }, 200);
}

// 体重实时输入防抖处理
let weightInputTimer = null;
function handleWeightInput() {
  if (!inputDailyWeight) return;
  clearTimeout(weightInputTimer);
  weightInputTimer = setTimeout(() => {
    handleSaveWeightOnly(false);
  }, 350);
}

// 2. 第一段：今日计划 (晨起立志) 渲染
function renderDailyPlanSection() {
  if (!inputDailyPlan) return;
  inputDailyPlan.value = state.plans[state.currentDate] || '';
  autoResizeTextarea(inputDailyPlan);
  const tag = document.getElementById('planAutoSaveTag');
  if (tag) {
    tag.className = 'auto-save-tag';
    tag.textContent = '🟢 实时已存';
  }
}

// 3. 第二段：实际执行 (暮夜对账) 动态流渲染
function renderDailyExecutionSection() {
  if (!execStreamSummary) return;

  const records = getTodayRecords().slice().sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  const categoryTotals = {};
  let totalDayMins = 0;
  let phoneMins = 0;

  if (records.length === 0) {
    execStreamSummary.innerHTML = `
      <div class="exec-empty-hint">
        🌱 今天还没有时间打卡记录<br>
        <span style="font-size: 0.72rem; color: var(--text-light); margin-top: 4px; display: inline-block;">
          点击右上角【➕ 补录时间】开始对账
        </span>
      </div>
    `;
  } else {
    let html = '';
    records.forEach(r => {
      const dur = getDurationMinutes(r.start, r.end);
      totalDayMins += dur;
      categoryTotals[r.category] = (categoryTotals[r.category] || 0) + dur;
      if (r.category === 'phone') phoneMins += dur;

      const cat = state.categories.find(c => c.id === r.category) || { name: '日常', color: '#94A3B8' };
      const note = r.note ? r.note.trim() : '打卡完成';
      html += `
        <div class="exec-item-row">
          <span class="exec-item-time">${r.start} - ${r.end}</span>
          <span class="exec-item-badge" style="background:${cat.color}1A; color:${cat.color}; border: 1px solid ${cat.color}40;">
            ${cat.name}
          </span>
          <span class="exec-item-note">${escapeHtml(note)}</span>
        </div>
      `;
    });
    execStreamSummary.innerHTML = html;
  }

  // 摸鱼黑洞预警
  if (blackHoleAlert && blackHoleSummary) {
    if (phoneMins > 0) {
      const phoneHours = (phoneMins / 60).toFixed(1);
      const percent = totalDayMins > 0 ? ((phoneMins / totalDayMins) * 100).toFixed(0) : 0;
      blackHoleAlert.style.display = 'flex';
      blackHoleSummary.innerHTML = `今日在<b>【刷手机/摸鱼】</b>上累计花费了 <b>${phoneHours} 小时</b>（约占已记录时间的 ${percent}%）。早起醒后的这几十分钟常是无意识流逝的起点，反思一下明天如何打破这个循环？`;
    } else {
      blackHoleAlert.style.display = 'none';
    }
  }

  // 渲染时间分布甜甜圈饼图
  renderCategoryDoughnutChart(categoryTotals);
}

// 4. 第三段：复盘反思 (诚意慎独) 渲染
function renderDailyReflectionSection() {
  if (!inputDailyReflection) return;
  const raw = state.reflections[state.currentDate];
  if (!raw) {
    inputDailyReflection.value = '';
  } else if (typeof raw === 'object' && raw !== null) {
    // 平滑兼容旧版本 3 个问答格式的数据对象
    const parts = [];
    if (raw.praise) parts.push(`【专注投入】${raw.praise}`);
    if (raw.wasted) parts.push(`【时间黑洞】${raw.wasted}`);
    if (raw.action) parts.push(`【明日调适】${raw.action}`);
    inputDailyReflection.value = parts.join('\n');
  } else {
    inputDailyReflection.value = String(raw);
  }
  autoResizeTextarea(inputDailyReflection);
  const tag = document.getElementById('reflAutoSaveTag');
  if (tag) {
    tag.className = 'auto-save-tag';
    tag.textContent = '🟢 实时已存';
  }
}

// 身心体态觉知 (早晚 30 秒) 与践行微步分级打卡
function renderBodyStateSection() {
  const data = state.bodyState[state.currentDate] || {};

  // 1. 晨起精力
  const energy = data.energy || null;
  const energyLabel = document.getElementById('labelEnergyScore');
  if (energyLabel) energyLabel.textContent = energy ? `${energy} 分` : '-';
  document.querySelectorAll('#groupEnergyScore .score-btn').forEach(btn => {
    btn.classList.toggle('score-active', btn.dataset.score === String(energy));
  });

  // 2. 鼻腔通气
  const nose = data.nose || null;
  const noseLabel = document.getElementById('labelNoseState');
  if (noseLabel) noseLabel.textContent = nose || '-';
  document.querySelectorAll('#groupNoseState .nose-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.val === nose);
  });

  // 3. 体态自觉
  const posture = data.postureScore || null;
  const postureLabel = document.getElementById('labelPostureScore');
  if (postureLabel) postureLabel.textContent = posture ? `${posture} 分` : '-';
  document.querySelectorAll('#groupPostureScore .posture-btn').forEach(btn => {
    btn.classList.toggle('score-active', btn.dataset.score === String(posture));
  });

  // 4. 情绪应激
  const stress = data.stress || null;
  const stressLabel = document.getElementById('labelStressState');
  if (stressLabel) stressLabel.textContent = stress || '-';
  document.querySelectorAll('#groupStressState .stress-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.val === stress);
  });

  // 5. 平复时差
  const recoverInput = document.getElementById('inputRecoverMinutes');
  if (recoverInput) {
    recoverInput.value = (data.recoverMinutes !== undefined && data.recoverMinutes !== null) ? data.recoverMinutes : '';
  }

  // 6. 整日身心状态与症状文本
  if (inputBodySymptomNotes) {
    inputBodySymptomNotes.value = data.bodySymptomNotes || '';
    autoResizeTextarea(inputBodySymptomNotes);
    const tag = document.getElementById('symptomAutoSaveTag');
    if (tag) {
      tag.className = 'auto-save-tag';
      tag.textContent = '🟢 实时已存';
    }
  }

  // 7. 情绪耐受度具体过程文本
  if (inputStressDetailNotes) {
    inputStressDetailNotes.value = data.stressDetailNotes || '';
    autoResizeTextarea(inputStressDetailNotes);
    const tag = document.getElementById('stressDetailAutoSaveTag');
    if (tag) {
      tag.className = 'auto-save-tag';
      tag.textContent = '🟢 实时已存';
    }
  }
}

function handleBodyStateSelect(type, val) {
  if (!state.bodyState[state.currentDate]) {
    state.bodyState[state.currentDate] = {};
  }
  const current = state.bodyState[state.currentDate][type];
  if (current === val) {
    delete state.bodyState[state.currentDate][type];
  } else {
    state.bodyState[state.currentDate][type] = val;
  }
  saveBodyState();
  renderBodyStateSection();
}

function renderHabitsSection() {
  const container = document.getElementById('habits-dynamic-container');
  if (!container) return;

  const cfg = HabitManager.getHabits();
  const habits = state.habits[state.currentDate] || {};

  let html = '';

  // 1. 🟢 保底线
  html += `
    <div style="margin-top: 10px;">
      <div style="font-size: 0.78rem; font-weight: 700; color: #047857; display: flex; align-items: center; justify-content: space-between;">
        <span>🟢 【保底线】不可失败的基础步 (${cfg.baseline.length} 项，做完即全天成功)</span>
      </div>
      <div class="habit-checklist" id="baselineHabitsList">
  `;

  if (cfg.baseline.length === 0) {
    html += `<div style="font-size:0.75rem; color:var(--text-muted); padding: 8px;">暂无保底步，点击右上角【⚙️ 编排】添加</div>`;
  } else {
    cfg.baseline.forEach(h => {
      const isChecked = !!(habits[h.id] || (h.legacyKey && habits[h.legacyKey]));
      html += `
        <label class="habit-item ${isChecked ? 'checked' : ''}" data-habit="${h.id}" data-legacy="${h.legacyKey || ''}">
          <input type="checkbox" class="habit-checkbox" id="chk_${h.id}" ${isChecked ? 'checked' : ''}>
          <span>${escapeHtml(h.name)} ${h.desc ? `<small style="opacity:0.75; font-size:0.75rem;">(${escapeHtml(h.desc)})</small>` : ''}</span>
        </label>
      `;
    });
  }
  html += `</div></div>`;

  // 2. 🟡 进阶项
  html += `
    <div style="margin-top: 14px;">
      <div style="font-size: 0.78rem; font-weight: 700; color: #B45309; display: flex; align-items: center; justify-content: space-between;">
        <span>🟡 【进阶项】状态充沛时的加分步 (根据精力任选 1~2 项，不强求)</span>
      </div>
      <div class="habit-checklist" id="bonusHabitsList">
  `;

  if (cfg.advanced.length === 0) {
    html += `<div style="font-size:0.75rem; color:var(--text-muted); padding: 8px;">暂无进阶步，点击右上角【⚙️ 编排】添加</div>`;
  } else {
    cfg.advanced.forEach(h => {
      const isChecked = !!(habits[h.id] || (h.legacyKey && habits[h.legacyKey]));
      html += `
        <label class="habit-item ${isChecked ? 'checked' : ''}" data-habit="${h.id}" data-legacy="${h.legacyKey || ''}">
          <input type="checkbox" class="habit-checkbox" id="chk_${h.id}" ${isChecked ? 'checked' : ''}>
          <span>${escapeHtml(h.name)} ${h.desc ? `<small style="opacity:0.75; font-size:0.75rem;">(${escapeHtml(h.desc)})</small>` : ''}</span>
        </label>
      `;
    });
  }
  html += `</div></div>`;

  container.innerHTML = html;

  // 绑定打卡点击事件
  container.querySelectorAll('.habit-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT') {
        const id = item.dataset.habit;
        const legacyKey = item.dataset.legacy;
        if (id) toggleHabit(id, legacyKey);
      }
    });
    const chk = item.querySelector('.habit-checkbox');
    if (chk) {
      chk.addEventListener('change', () => {
        const id = item.dataset.habit;
        const legacyKey = item.dataset.legacy;
        if (id) toggleHabit(id, legacyKey);
      });
    }
  });

  // 保底成就徽章判定
  const baseAccomplished = cfg.baseline.length > 0 && cfg.baseline.every(h => !!(habits[h.id] || (h.legacyKey && habits[h.legacyKey])));
  const badge = document.getElementById('habitBaseBadge');
  if (badge) {
    if (baseAccomplished) {
      badge.textContent = '🟢 今日保底已达成！';
      badge.style.background = '#ECFDF5';
      badge.style.color = '#059669';
      badge.style.borderColor = '#A7F3D0';
    } else {
      badge.textContent = '待完成保底';
      badge.style.background = '#F1F5F9';
      badge.style.color = '#64748B';
      badge.style.borderColor = '#CBD5E1';
    }
  }
}

function toggleHabit(habitId, legacyKey) {
  if (!state.habits[state.currentDate]) {
    state.habits[state.currentDate] = {};
  }
  const currentVal = !!(state.habits[state.currentDate][habitId] || (legacyKey && state.habits[state.currentDate][legacyKey]));
  const newVal = !currentVal;
  state.habits[state.currentDate][habitId] = newVal;
  if (legacyKey) {
    state.habits[state.currentDate][legacyKey] = newVal;
  }
  saveHabits();
  renderHabitsSection();
}

function renderWinnerTrials() {
  const container = document.getElementById('winner-trials-container');
  if (!container) return;

  const data = WinnerTrialManager.getData();
  const trials = data.activeTrials || [];
  let html = '';

  if (trials.length === 0) {
    html += '<div style="font-size:0.78rem;color:var(--text-muted);padding:12px 6px;text-align:center;">暂无进行中的试验战场。点击右上角【+ 新设战场】开辟极小新战场！</div>';
  } else {
    html += trials.map(trial => {
      const target = trial.target || 6;
      const wins = trial.currentWins || 0;
      const isCompleted = wins >= target;

      let dotsHtml = '';
      for (let i = 1; i <= target; i++) {
        const isWon = i <= wins;
        dotsHtml += `
          <div class="winner-dot ${isWon ? 'active today-won' : ''}" 
               onclick="WinnerTrialManager.setWins('${trial.id}', ${isWon && i === wins ? i - 1 : i})"
               style="cursor:pointer;" title="点击设置到 ${i} 胜">
            ${isWon ? '●' : i}
          </div>
        `;
      }

      let actionButtons = '';
      if (isCompleted) {
        actionButtons = `
          <div class="trial-decision-bar" style="display:flex;gap:8px;margin-top:8px;">
            <button type="button" class="btn-trial-decision btn-trial-graduate" onclick="WinnerTrialManager.graduateTrial('${trial.id}')">🎓 神经已固化·入驻丰碑</button>
            <button type="button" class="btn-trial-decision btn-trial-reset" onclick="WinnerTrialManager.resetTrial('${trial.id}')">🔄 开启第 ${(trial.cycleCount || 1) + 1} 轮</button>
          </div>
        `;
      } else {
        actionButtons = `
          <div style="display:flex;gap:8px;align-items:center;margin-top:8px;">
            <button type="button" class="btn-win-today" style="flex:1;" onclick="WinnerTrialManager.addWin('${trial.id}')">
              ⚡ 赢下一局 (+1胜)
            </button>
            ${wins > 0 ? `
              <button type="button" class="btn-secondary" style="padding:6px 12px;font-size:0.75rem;" onclick="WinnerTrialManager.undoWin('${trial.id}')">
                ↩ 撤销
              </button>
            ` : ''}
          </div>
        `;
      }

      return `
        <div class="trial-card-item ${isCompleted ? 'completed' : ''}" style="margin-top:10px;">
          <div class="trial-header" style="display:flex;justify-content:space-between;align-items:center;">
            <div class="trial-name">🎯 ${escapeHtml(trial.name)} <span class="trial-cycle-tag">第 ${trial.cycleCount || 1} 轮 · ${wins}/${target} 胜</span></div>
            <button type="button" class="btn-trial-del" onclick="WinnerTrialManager.deleteTrial('${trial.id}')" title="删除该战场">✕</button>
          </div>
          <div class="winner-dots-row" style="margin-top:8px;">
            ${dotsHtml}
          </div>
          ${actionButtons}
        </div>
      `;
    }).join('');
  }

  // 底部展示【🏛️ 胜者丰碑 (已固化神经回路)】
  if (data.graduatedTrials && data.graduatedTrials.length > 0) {
    html += `
      <details style="margin-top:14px;border-top:1px dashed var(--border);padding-top:10px;">
        <summary style="font-size:0.78rem;font-weight:700;color:var(--text-muted);cursor:pointer;">
          🏛️ 胜者丰碑 · 已固化神经回路 (${data.graduatedTrials.length})
        </summary>
        <div style="display:flex;flex-direction:column;gap:6px;margin-top:8px;">
          ${data.graduatedTrials.map(g => `
            <div style="display:flex;justify-content:space-between;font-size:0.75rem;padding:6px 10px;background:var(--card-bg);border-radius:6px;border:1px solid var(--border);">
              <span>🏆 <b>${escapeHtml(g.name)}</b> (达成 6 胜)</span>
              <span style="color:var(--text-muted);">${g.graduatedAt || ''}</span>
            </div>
          `).join('')}
        </div>
      </details>
    `;
  }

  container.innerHTML = html;
}

function openHabitsModal() {
  const modal = document.getElementById('habitsModal');
  if (modal) {
    renderHabitsManageList();
    modal.classList.add('open');
  }
}

function closeHabitsModal() {
  const modal = document.getElementById('habitsModal');
  if (modal) modal.classList.remove('open');
}

function renderHabitsManageList() {
  const container = document.getElementById('habitsManageListContainer');
  if (!container) return;

  const cfg = HabitManager.getHabits();
  let html = '';

  // 🟢 保底线列表
  html += `
    <div style="font-size: 0.8rem; font-weight: 700; color: #047857; margin-bottom: 4px;">🟢 保底线（基础步，做完即全天成功）</div>
  `;
  if (cfg.baseline.length === 0) {
    html += `<div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 8px;">暂无保底步</div>`;
  } else {
    cfg.baseline.forEach(h => {
      html += `
        <div class="habit-manage-item">
          <div class="habit-manage-info">
            <span class="habit-manage-name">${escapeHtml(h.name)}</span>
            ${h.desc ? `<span class="habit-manage-desc">${escapeHtml(h.desc)}</span>` : ''}
          </div>
          <button type="button" class="btn-delete-habit" data-id="${h.id}" title="删除该微步">✕</button>
        </div>
      `;
    });
  }

  // 🟡 进阶项列表
  html += `
    <div style="font-size: 0.8rem; font-weight: 700; color: #B45309; margin-top: 10px; margin-bottom: 4px;">🟡 进阶项（加分步，根据精力选做）</div>
  `;
  if (cfg.advanced.length === 0) {
    html += `<div style="font-size: 0.75rem; color: var(--text-muted);">暂无进阶步</div>`;
  } else {
    cfg.advanced.forEach(h => {
      html += `
        <div class="habit-manage-item">
          <div class="habit-manage-info">
            <span class="habit-manage-name">${escapeHtml(h.name)}</span>
            ${h.desc ? `<span class="habit-manage-desc">${escapeHtml(h.desc)}</span>` : ''}
          </div>
          <button type="button" class="btn-delete-habit" data-id="${h.id}" title="删除该微步">✕</button>
        </div>
      `;
    });
  }

  container.innerHTML = html;

  // 绑定删除按钮
  container.querySelectorAll('.btn-delete-habit').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (confirm('确定要删除此打卡项吗？')) {
        HabitManager.deleteHabit(id);
        renderHabitsManageList();
        renderHabitsSection();
        showToast('已删除打卡项');
      }
    });
  });
}

function openTrialModal() {
  const modal = document.getElementById('trialModal');
  if (modal) {
    const nameInp = document.getElementById('trialNameInput');
    if (nameInp) nameInp.value = '';
    modal.classList.add('open');
  }
}

function closeTrialModal() {
  const modal = document.getElementById('trialModal');
  if (modal) modal.classList.remove('open');
}

// 5. 保存知行合流整套数据
function handleSaveDailyZhixing() {
  // 保存计划
  if (inputDailyPlan) {
    state.plans[state.currentDate] = inputDailyPlan.value.trim();
    savePlans();
  }

  // 保存反思
  if (inputDailyReflection) {
    state.reflections[state.currentDate] = inputDailyReflection.value.trim();
    saveReflections();
  }

  // 保存体重、微步习惯与身心体态
  handleSaveWeightOnly(false);
  if (!state.bodyState[state.currentDate]) state.bodyState[state.currentDate] = {};
  if (inputBodySymptomNotes) {
    state.bodyState[state.currentDate].bodySymptomNotes = inputBodySymptomNotes.value;
  }
  if (inputStressDetailNotes) {
    state.bodyState[state.currentDate].stressDetailNotes = inputStressDetailNotes.value;
  }
  saveHabits();
  saveBodyState();

  showToast('🎉 今日计划、微步打卡、反思与身心数据已全部妥善保存！');
}

// 6. 内联 14 天体重走势图 (复盘页内)
function renderWeightInlineChart() {
  const ctx = document.getElementById('weightInlineChart');
  if (!ctx) return;

  const days = [];
  const weightData = [];

  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`;
    days.push(dateLabel);

    const w = state.weights[dateStr];
    weightData.push(w !== undefined ? w : null);
  }

  if (state.charts.weightInline) {
    state.charts.weightInline.destroy();
  }

  state.charts.weightInline = new Chart(ctx, {
    type: 'line',
    data: {
      labels: days,
      datasets: [{
        label: '体重 (kg)',
        data: weightData,
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
        borderWidth: 2,
        fill: true,
        tension: 0.3,
        spanGaps: true,
        pointBackgroundColor: '#059669',
        pointRadius: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => ` ${item.raw} kg`
          }
        }
      },
      scales: {
        y: {
          ticks: {
            stepSize: 0.5,
            font: { size: 10 }
          }
        },
        x: {
          ticks: { font: { size: 9 } }
        }
      }
    }
  });
}

// 7. 趋势页 30 天体重深度走势图 (Tab 3)
function renderWeightTrendChart() {
  const ctx = document.getElementById('trendWeightChart');
  if (!ctx) return;

  const days = [];
  const weightData = [];

  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`;
    days.push(dateLabel);

    const w = state.weights[dateStr];
    weightData.push(w !== undefined ? w : null);
  }

  if (state.charts.weightTrend) {
    state.charts.weightTrend.destroy();
  }

  state.charts.weightTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: days,
      datasets: [{
        label: '体重走势 (kg)',
        data: weightData,
        borderColor: '#059669',
        backgroundColor: 'rgba(5, 150, 105, 0.1)',
        borderWidth: 2.5,
        fill: true,
        tension: 0.25,
        spanGaps: true,
        pointBackgroundColor: '#047857',
        pointRadius: 3.5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (item) => ` ${item.label}: ${item.raw} kg`
          }
        }
      },
      scales: {
        y: {
          ticks: {
            stepSize: 0.5,
            font: { size: 10 }
          }
        },
        x: {
          ticks: { font: { size: 9 } }
        }
      }
    }
  });
}

function renderCategoryDoughnutChart(categoryTotals) {
  const ctx = document.getElementById('reviewPieChart');
  if (!ctx) return;

  const labels = [];
  const data = [];
  const bgColors = [];

  Object.keys(categoryTotals).forEach(catId => {
    const cat = state.categories.find(c => c.id === catId);
    if (cat) {
      labels.push(cat.name);
      data.push((categoryTotals[catId] / 60).toFixed(1));
      bgColors.push(cat.color);
    }
  });

  if (state.charts.review) {
    state.charts.review.destroy();
  }

  if (data.length === 0) {
    labels.push('暂无数据');
    data.push(1);
    bgColors.push('#CBD5E1');
  }

  state.charts.review = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: bgColors,
        borderWidth: 2,
        borderColor: '#FFFFFF'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 12,
            font: { size: 11 }
          }
        },
        tooltip: {
          callbacks: {
            label: (item) => ` ${item.label}: ${item.raw} 小时`
          }
        }
      },
      cutout: '65%'
    }
  });
}

// Trends Tab Logic
function renderTrendsTab() {
  const ctx = document.getElementById('trendBarChart');
  if (!ctx) return;

  // Last 7 days dates
  const days = [];
  const phoneHours = [];
  const productiveHours = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dateLabel = `${d.getMonth() + 1}/${d.getDate()}`;
    days.push(dateLabel);

    const recs = state.records[dateStr] || [];
    let pDur = 0;
    let wDur = 0;

    recs.forEach(r => {
      const dur = getDurationMinutes(r.start, r.end);
      const cat = state.categories.find(c => c.id === r.category);
      if (cat) {
        if (cat.isWaster) pDur += dur;
        if (cat.isProductive) wDur += dur;
      }
    });

    phoneHours.push((pDur / 60).toFixed(1));
    productiveHours.push((wDur / 60).toFixed(1));
  }

  if (state.charts.trend) {
    state.charts.trend.destroy();
  }

  state.charts.trend = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: days,
      datasets: [
        {
          label: '📱 刷手机/摸鱼 (小时)',
          data: phoneHours,
          backgroundColor: '#EF4444'
        },
        {
          label: '💻 专注产出 (小时)',
          data: productiveHours,
          backgroundColor: '#3B82F6'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1 }
        }
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { boxWidth: 12, font: { size: 11 } }
        }
      }
    }
  });

  // 渲染近期体重走势折线图 (v1.2.0)
  renderWeightTrendChart();
}

// Sample Data Generator
function loadSampleData() {
  const today = getTodayString();
  state.records[today] = [
    { id: 's1', category: 'sleep', start: '00:00', end: '07:00', note: '夜间睡眠' },
    { id: 's2', category: 'phone', start: '07:00', end: '07:35', note: '醒来没起，躺在床上刷知乎和短视频' },
    { id: 's3', category: 'routine', start: '07:35', end: '08:15', note: '洗漱穿衣、热牛奶吃早餐' },
    { id: 's4', category: 'commute', start: '08:15', end: '09:00', note: '地铁通勤' },
    { id: 's5', category: 'work', start: '09:00', end: '12:00', note: '上午黄金期：攻克核心业务逻辑代码' },
    { id: 's6', category: 'routine', start: '12:00', end: '13:00', note: '午饭与同事散步' },
    { id: 's7', category: 'work', start: '13:00', end: '17:30', note: '下午项目需求评审与联调' },
    { id: 's8', category: 'fitness', start: '18:00', end: '19:00', note: '健身房力量训练与慢跑3公里' },
    { id: 's9', category: 'routine', start: '19:00', end: '20:00', note: '晚餐与洗漱' },
    { id: 's10', category: 'work', start: '20:00', end: '21:30', note: '阅读《奇特的一生》与深度思考' },
    { id: 's11', category: 'phone', start: '21:30', end: '22:15', note: '睡前不知不觉又刷了会手机' }
  ];

  state.plans[today] = "1. 完成时镜知行三段与体重模块架构升级\n2. 研读《黄帝内经》素问第13篇\n3. 囚徒健身力量进阶练习";
  state.weights[today] = 65.5;
  state.reflections[today] = "今日上午专注投入饱满，知行合流模块一次性打通。\n睡前避免看手机屏幕，明天早起先喝温水。";

  saveRecords();
  savePlans();
  saveWeights();
  saveReflections();
}

// Data Export & Import
function exportData() {
  const data = {
    exportedAt: new Date().toISOString(),
    categories: state.categories,
    records: state.records,
    plans: state.plans,
    weights: state.weights,
    reflections: state.reflections,
    habits: state.habits,
    bodyState: state.bodyState
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `timemirror_backup_${getTodayString()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target.result);
      if (data.records) state.records = data.records;
      if (data.plans) state.plans = data.plans;
      if (data.weights) state.weights = data.weights;
      if (data.reflections) state.reflections = data.reflections;
      if (data.categories) state.categories = data.categories;
      if (data.habits) state.habits = data.habits;
      if (data.bodyState) state.bodyState = data.bodyState;
      saveRecords();
      savePlans();
      saveWeights();
      saveReflections();
      saveHabits();
      saveBodyState();
      updateUI();
      alert('数据恢复成功！');
    } catch (err) {
      alert('导入失败：文件格式不正确');
    }
  };
  reader.readAsText(file);
}

// Register PWA Service Worker
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {
        // Local dev or non-https fallback
      });
    });
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ========================================================
   v1.1.0: Toast Helper, Obsidian Sync & Category Management
   ======================================================== */

// 1. Toast Notification
function showToast(msg) {
  let toast = document.getElementById('toastNotice');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toastNotice';
    toast.className = 'toast-notice';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2400);
}

// 2. Obsidian Nightly Log Formatter (仅暮夜对账)
function generateObsidianNightlyLog(dateStr) {
  const records = (state.records[dateStr] || []).slice().sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  if (records.length === 0) {
    return '今日暂无时间打卡记录。';
  }

  const lines = records.map(rec => {
    const cat = state.categories.find(c => c.id === rec.category) || { name: '日常' };
    const note = rec.note ? rec.note.trim() : '';
    if (note) {
      return `- **${rec.start} - ${rec.end}**：【${cat.name}】${note}`;
    } else {
      return `- **${rec.start} - ${rec.end}**：【${cat.name}】`;
    }
  });

  return lines.join('\n');
}

// 2.2 完整知行三段与体重 Markdown 生成器 (直通 Obsidian 对应段落格式)
function generateFullZhixingMarkdown(dateStr) {
  const plan = inputDailyPlan ? inputDailyPlan.value.trim() : (state.plans[dateStr] || '');
  const exec = generateObsidianNightlyLog(dateStr);
  let refl = inputDailyReflection ? inputDailyReflection.value.trim() : '';
  if (!refl && state.reflections[dateStr]) {
    const raw = state.reflections[dateStr];
    refl = typeof raw === 'string' ? raw : (raw.praise || raw.wasted || raw.action ? `${raw.praise}\n${raw.wasted}\n${raw.action}` : '');
  }
  const weight = (inputDailyWeight && inputDailyWeight.value.trim() !== '') ? inputDailyWeight.value.trim() : state.weights[dateStr];

  const sections = [];

  // 第一段：晨起立志 (计划)
  sections.push('### 🎯 晨起立志（打算做什么？）');
  sections.push('> 顺应今日身心气能，参考 [[学习项目四阶追踪表]]，每日核心要务不超过 3 件：');
  if (plan) {
    const lines = plan.split('\n').map(l => l.trim()).filter(Boolean);
    lines.forEach((l, idx) => {
      const clean = l.replace(/^(?:-\s*\[[ x]\]\s*)?(?:\d+[\.\、]\s*)?/, '').trim();
      sections.push(`- [ ] ${idx + 1}. ${clean}`);
    });
  } else {
    sections.push('- [ ] 1. \n- [ ] 2. \n- [ ] 3. ');
  }
  sections.push('');

  // 第二段：暮夜对账 (实际执行)
  sections.push('### ⚡ 暮夜对账（实际做了什么？）');
  sections.push(exec);
  sections.push('');

  // 第三段：诚意慎独 (反思)
  sections.push('### 🪞 诚意慎独（今日得失与明日调适）');
  if (refl) {
    const reflLines = refl.split('\n').map(l => l.trim()).filter(Boolean);
    reflLines.forEach(l => {
      sections.push(l.startsWith('-') ? l : `- ${l}`);
    });
  } else {
    sections.push('- ');
  }
  sections.push('');

  // 第二部分：每日践行微步 (分级打卡 · 动态自适应)
  const habits = state.habits[dateStr] || {};
  const cfg = HabitManager.getHabits();

  sections.push('### 🟢 【保底线】不可失败的基础步（做完即算全天成功）');
  if (cfg.baseline && cfg.baseline.length > 0) {
    cfg.baseline.forEach(h => {
      const isChecked = !!(habits[h.id] || (h.legacyKey && habits[h.legacyKey]));
      const descText = h.desc ? `（${h.desc}）` : '';
      sections.push(`- [${isChecked ? 'x' : ' '}] ${h.name}${descText}`);
    });
  } else {
    sections.push('- [ ] 暂无保底项');
  }
  sections.push('');

  sections.push('### 🟡 【进阶项】状态充沛时的加分步（根据当天精力自由选做 1~2 项，不强求）');
  if (cfg.advanced && cfg.advanced.length > 0) {
    cfg.advanced.forEach(h => {
      const isChecked = !!(habits[h.id] || (h.legacyKey && habits[h.legacyKey]));
      const descText = h.desc ? `（${h.desc}）` : '';
      sections.push(`- [${isChecked ? 'x' : ' '}] ${h.name}${descText}`);
    });
  } else {
    sections.push('- [ ] 暂无进阶项');
  }
  sections.push('');

  // 连赢 6 次 · 胜者神经试验场看板
  const trials = WinnerTrialManager.getActiveTrials();
  if (trials && trials.length > 0) {
    sections.push('### 🎯 连赢 6 次 · 胜者神经试验场看板');
    trials.forEach(t => {
      const target = t.target || 6;
      const wins = Math.min(target, t.currentWins || 0);
      const bar = '█'.repeat(wins) + '░'.repeat(Math.max(0, target - wins));
      const statusText = wins >= target ? '已达成固化！可毕业换战场' : '攻坚中';
      sections.push(`- 🎯 **[${t.name}]**：[${bar}] ${wins}/${target} 胜 (第 ${t.cycleCount || 1} 轮 · 状态：${statusText})`);
    });
    sections.push('');
  }

  // 第三部分：身体与心绪追踪
  const body = state.bodyState[dateStr] || {};
  sections.push('### 1. 身体状态与晨起体感');
  sections.push(`- **空腹/晨起体重**：${weight ? weight + ' kg' : '___ kg'}`);
  sections.push(`- **晨起精力**：${body.energy ? body.energy + ' / 5 分（1分沉重疲惫，3分平稳，5分清爽通透）' : '___ / 5 分'}`);
  const noseOpts = ["左通右阻", "右通左阻", "均通畅", "均发堵"];
  const noseBoxes = noseOpts.map(opt => `[${body.nose === opt ? 'x' : ' '}] ${opt}`).join(' ');
  sections.push(`- **鼻腔通气**：${noseBoxes}`);
  sections.push(`- **体态自觉**：${body.postureScore ? body.postureScore + ' / 5 分（脊柱挺拔、胸背自然舒展度）' : '___ / 5 分'}`);
  const sympText = (inputBodySymptomNotes && dateStr === state.currentDate) ? inputBodySymptomNotes.value.trim() : (body.bodySymptomNotes ? body.bodySymptomNotes.trim() : '');
  sections.push(`- **整日身心状态与症状**：${sympText}`);
  sections.push('');
  sections.push('### 2. 情绪耐受度');
  const stressOpts = ["无明显波澜", "遇事发紧/心慌", "陷入焦虑退缩"];
  const stressBoxes = stressOpts.map(opt => `[${body.stress === opt ? 'x' : ' '}] ${opt}`).join(' ');
  sections.push(`- **今日应激**：${stressBoxes}`);
  sections.push(`- **平复时差**：${body.recoverMinutes !== undefined && body.recoverMinutes !== null && String(body.recoverMinutes).trim() !== '' ? body.recoverMinutes + ' 分钟（觉察并深呼吸/冥想后回神的速度）' : '___ 分钟'}`);
  const stressDetailText = (inputStressDetailNotes && dateStr === state.currentDate) ? inputStressDetailNotes.value.trim() : (body.stressDetailNotes ? body.stressDetailNotes.trim() : '');
  sections.push(`- **具体过程**：${stressDetailText}`);

  return sections.join('\n');
}

// 3. Obsidian 一键复制 (暮夜对账单项)
async function copyObsidianNightlyLog() {
  const text = generateObsidianNightlyLog(state.currentDate);
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    showToast('📋 已复制暮夜对账！直接粘贴进 Obsidian');
  } catch (err) {
    console.error('Copy error:', err);
    prompt('请长按复制今日对账文本：', text);
  }
}

// 3.2 一键复制完整知行三段与体重 (全量知行合流)
async function copyDailyZhixingMarkdown() {
  const text = generateFullZhixingMarkdown(state.currentDate);
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    showToast('📋 已复制完整知行Markdown(计划+对账+反思+体重)！');
  } catch (err) {
    console.error('Copy error:', err);
    prompt('请长按复制今日知行记录：', text);
  }
}

// 4. Obsidian 局域网极速直通同步 (全要素直通：计划+执行+反思+体重)
async function syncToObsidianLAN() {
  const serverInput = document.getElementById('obsidianServerUrl');
  let serverUrl = (serverInput ? serverInput.value.trim() : '') || localStorage.getItem('tm_obsidian_server') || 'http://192.168.31.51:28888';
  serverUrl = serverUrl.replace(/\/+$/, '');
  localStorage.setItem('tm_obsidian_server', serverUrl);

  // 动态收拢最新的界面输入内容
  let planText = state.plans[state.currentDate] || '';
  if (inputDailyPlan) {
    planText = inputDailyPlan.value.trim();
    state.plans[state.currentDate] = planText;
    savePlans();
  }

  let reflectionText = '';
  if (inputDailyReflection) {
    reflectionText = inputDailyReflection.value.trim();
    state.reflections[state.currentDate] = reflectionText;
    saveReflections();
  } else {
    reflectionText = typeof state.reflections[state.currentDate] === 'string' ? state.reflections[state.currentDate] : '';
  }

  let weightVal = state.weights[state.currentDate];
  if (inputDailyWeight && inputDailyWeight.value.trim() !== '') {
    const parsed = parseFloat(inputDailyWeight.value.trim());
    if (!isNaN(parsed) && parsed > 0) {
      weightVal = Number(parsed.toFixed(1));
      state.weights[state.currentDate] = weightVal;
      saveWeights();
    }
  }

  // 收拢最新的身心症状与情绪过程输入 (双重保障：优先获取界面输入，未改动则沿用已存数据)
  if (!state.bodyState[state.currentDate]) state.bodyState[state.currentDate] = {};
  const currentSympNotes = (inputBodySymptomNotes && inputBodySymptomNotes.value.trim()) || state.bodyState[state.currentDate].bodySymptomNotes || '';
  const currentStressNotes = (inputStressDetailNotes && inputStressDetailNotes.value.trim()) || state.bodyState[state.currentDate].stressDetailNotes || '';
  state.bodyState[state.currentDate].bodySymptomNotes = currentSympNotes;
  state.bodyState[state.currentDate].stressDetailNotes = currentStressNotes;
  saveBodyState();

  const records = (state.records[state.currentDate] || []).slice().sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  const formattedText = generateObsidianNightlyLog(state.currentDate);

  const payload = {
    date: state.currentDate,
    planText: planText,
    reflectionText: reflectionText,
    weight: weightVal !== undefined ? weightVal : null,
    habits: state.habits[state.currentDate] || {},
    habitsConfig: HabitManager.getHabits(),
    winnerTrials: WinnerTrialManager.getActiveTrials(),
    bodyState: {
      ...(state.bodyState[state.currentDate] || {}),
      bodySymptomNotes: currentSympNotes,
      stressDetailNotes: currentStressNotes
    },
    formattedText: formattedText,
    records: records.map(r => {
      const cat = state.categories.find(c => c.id === r.category) || { name: '日常' };
      return {
        start: r.start,
        end: r.end,
        category: r.category,
        categoryName: cat.name,
        note: r.note || ''
      };
    })
  };

  const statusBadge = document.getElementById('syncStatusBadge');
  if (statusBadge) {
    statusBadge.textContent = '直通写入中...';
    statusBadge.style.background = '#FEF3C7';
    statusBadge.style.color = '#D97706';
  }

  // 关键创新：如果是从 GitHub (HTTPS) 打开，使用隐形表单穿透机制，彻底绕过浏览器的 Mixed Content 拦截！
  if (location.protocol === 'https:') {
    try {
      sendViaHiddenForm(serverUrl, payload);
      return;
    } catch (e) {
      console.warn('Form post fallback to fetch:', e);
    }
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(`${serverUrl}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const data = await res.json();
    if (data.success) {
      if (statusBadge) {
        statusBadge.textContent = '🟢 已直通入库';
        statusBadge.style.background = '#D1FAE5';
        statusBadge.style.color = '#059669';
      }
      showToast('🚀 已成功直通写入电脑 Obsidian 知行日记！');
    } else {
      throw new Error(data.message || '服务端写入异常');
    }
  } catch (err) {
    console.warn('LAN sync failed:', err);
    if (statusBadge) {
      statusBadge.textContent = '⚠️ 局域网未连接';
      statusBadge.style.background = '#FEE2E2';
      statusBadge.style.color = '#DC2626';
    }
    showToast('⚠️ 未连通电脑服务，建议使用旁边的【一键复制】');
  }
}

// 跨协议穿透隐形表单提交器 (解决移动端 HTTPS 调 HTTP 问题)
function sendViaHiddenForm(serverUrl, payload) {
  let iframe = document.getElementById('tm_sync_iframe');
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.id = 'tm_sync_iframe';
    iframe.name = 'tm_sync_iframe';
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    window.addEventListener('message', (event) => {
      if (event.data && event.data.status === 'ok') {
        const statusBadge = document.getElementById('syncStatusBadge');
        if (statusBadge) {
          statusBadge.textContent = '🟢 已直通入库';
          statusBadge.style.background = '#D1FAE5';
          statusBadge.style.color = '#059669';
        }
        showToast('🚀 已成功直通写入电脑 Obsidian！');
      }
    });
  }

  let form = document.getElementById('tm_sync_form');
  if (!form) {
    form = document.createElement('form');
    form.id = 'tm_sync_form';
    form.method = 'POST';
    form.target = 'tm_sync_iframe';
    form.style.display = 'none';

    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = 'payload';
    form.appendChild(input);
    document.body.appendChild(form);
  }

  form.action = `${serverUrl}/sync`;
  form.querySelector('input[name="payload"]').value = JSON.stringify(payload);
  form.submit();

  // 乐观提示
  showToast('🚀 正在发送至电脑 Obsidian...');
  setTimeout(() => {
    const statusBadge = document.getElementById('syncStatusBadge');
    if (statusBadge && statusBadge.textContent.includes('写入中')) {
      statusBadge.textContent = '🟢 已直通入库';
      statusBadge.style.background = '#D1FAE5';
      statusBadge.style.color = '#059669';
      showToast('🚀 已直通入库！可在电脑日记查看');
    }
  }, 1000);
}

// 测试与电脑同步服务连通性
async function testObsidianConnection() {
  const serverInput = document.getElementById('obsidianServerUrl');
  let serverUrl = (serverInput ? serverInput.value.trim() : '') || 'http://192.168.31.51:28888';
  serverUrl = serverUrl.replace(/\/+$/, '');
  const msgEl = document.getElementById('obsidianServerMsg');
  if (msgEl) {
    msgEl.style.color = 'var(--text-muted)';
    msgEl.textContent = '正在检测电脑服务连通性...';
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${serverUrl}/status`, { signal: controller.signal });
    clearTimeout(timeoutId);
    const data = await res.json();
    if (data.status === 'online') {
      if (msgEl) {
        msgEl.style.color = '#10B981';
        msgEl.textContent = `✅ 连通成功！关联仓库：${data.vault} (已找到今日知行目录)`;
      }
      showToast('✅ 电脑服务连通成功！');
    }
  } catch (err) {
    if (msgEl) {
      msgEl.style.color = '#EF4444';
      msgEl.textContent = `❌ 无法连接到 ${serverUrl}。请确认电脑已运行 obsidian_sync_server.py 且手机连入同一 Wi-Fi。`;
    }
    showToast('❌ 连接失败，请检查服务是否开启');
  }
}

// ==========================================
// ☁️ 谷歌云盘云桥同步引擎 (Google Drive Cloud Bridge)
// ==========================================
function buildObsidianMarkdown(dateStr) {
  return generateFullZhixingMarkdown(dateStr || (state ? state.currentDate : getTodayString()));
}

const CloudSyncAdapter = {
  getUrl() {
    return localStorage.getItem('tm_cloud_bridge_url') || '';
  },
  setUrl(url) {
    if (url) {
      localStorage.setItem('tm_cloud_bridge_url', url.trim());
    } else {
      localStorage.removeItem('tm_cloud_bridge_url');
    }
  },
  // 1. 从谷歌云盘拉取最新全量状态 (多设备漫游)
  async pullFromCloud() {
    const url = this.getUrl();
    if (!url) return null;
    try {
      const resp = await fetch(`${url}?action=pull`, { method: 'GET', mode: 'cors' });
      if (!resp.ok) return null;
      const data = await resp.json();
      if (data && data.state) {
        // 合并云端状态到本地
        if (data.state.records) { StorageAdapter.save('records', data.state.records); state.records = data.state.records; }
        if (data.state.plans) { StorageAdapter.save('plans', data.state.plans); state.plans = data.state.plans; }
        if (data.state.reflections) { StorageAdapter.save('reflections', data.state.reflections); state.reflections = data.state.reflections; }
        if (data.state.habits) { StorageAdapter.save('habits', data.state.habits); state.habits = data.state.habits; }
        if (data.state.weights) { StorageAdapter.save('weights', data.state.weights); state.weights = data.state.weights; }
        if (data.state.bodyState) { StorageAdapter.save('body_state', data.state.bodyState); state.bodyState = data.state.bodyState; }
        if (data.state.winnerTrials) StorageAdapter.save('winner_trials', data.state.winnerTrials);
        if (data.state.habitsConfig) StorageAdapter.save('habits_config', data.state.habitsConfig);
        return data.state;
      }
    } catch (e) {
      console.warn('云端拉取同步失败(可能处于离线状态):', e);
    }
    return null;
  },
  // 2. 将当前全部数据与日记 Markdown 推送至谷歌云盘
  async pushToCloud(dateStr) {
    const url = this.getUrl();
    if (!url) return { success: false, message: '未配置谷歌云桥 URL' };

    const dStr = dateStr || (state ? state.currentDate : getTodayString());

    // 动态收拢界面当前最新输入
    if (inputDailyPlan && dStr === state.currentDate) {
      state.plans[dStr] = inputDailyPlan.value.trim();
      savePlans();
    }
    if (inputDailyReflection && dStr === state.currentDate) {
      state.reflections[dStr] = inputDailyReflection.value.trim();
      saveReflections();
    }
    if (inputDailyWeight && dStr === state.currentDate && inputDailyWeight.value.trim() !== '') {
      const parsed = parseFloat(inputDailyWeight.value.trim());
      if (!isNaN(parsed) && parsed > 0) {
        state.weights[dStr] = Number(parsed.toFixed(1));
        saveWeights();
      }
    }
    if (dStr === state.currentDate) {
      if (!state.bodyState[dStr]) state.bodyState[dStr] = {};
      if (inputBodySymptomNotes) state.bodyState[dStr].bodySymptomNotes = inputBodySymptomNotes.value.trim();
      if (inputStressDetailNotes) state.bodyState[dStr].stressDetailNotes = inputStressDetailNotes.value.trim();
      saveBodyState();
    }

    const payload = {
      action: 'push',
      date: dStr,
      updatedAt: new Date().toISOString(),
      state: {
        records: StorageAdapter.load('records', {}),
        plans: StorageAdapter.load('plans', {}),
        reflections: StorageAdapter.load('reflections', {}),
        habits: StorageAdapter.load('habits', {}),
        weights: StorageAdapter.load('weights', {}),
        bodyState: StorageAdapter.load('body_state', {}),
        winnerTrials: WinnerTrialManager.getData(),
        habitsConfig: HabitManager.getConfig()
      },
      markdownContent: buildObsidianMarkdown(dStr)
    };

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
      const res = await resp.json();
      return res;
    } catch (e) {
      return { success: false, message: '云端直连网络请求失败: ' + e.message };
    }
  }
};

async function handleCloudSync() {
  const url = CloudSyncAdapter.getUrl();
  if (!url) {
    showToast('💡 请先配置谷歌云桥 Web App URL');
    openCloudBridgeModal();
    return;
  }
  const btn = document.getElementById('btn-cloud-sync');
  const oldText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.innerHTML = '<span>☁️</span><span>正在同步到谷歌云盘...</span>';
    btn.style.opacity = '0.8';
  }
  showToast('☁️ 正在向谷歌云盘推送数据...');
  try {
    const res = await CloudSyncAdapter.pushToCloud(state.currentDate);
    if (res && (res.success || res.status === 'success' || res.ok)) {
      showToast('🟢 谷歌云盘同步成功！全端数据与 Markdown 已入库');
    } else {
      showToast('⚠️ 同步结果: ' + (res.message || JSON.stringify(res)));
    }
  } catch (e) {
    showToast('❌ 同步网络异常: ' + e.message);
  } finally {
    if (btn) {
      btn.innerHTML = oldText;
      btn.style.opacity = '1';
    }
  }
}

function openCloudBridgeModal() {
  const input = document.getElementById('cloudBridgeUrlInput');
  if (input) input.value = CloudSyncAdapter.getUrl();
  const modal = document.getElementById('cloudBridgeModal');
  if (modal) modal.classList.add('open');
}

function closeCloudBridgeModal() {
  const modal = document.getElementById('cloudBridgeModal');
  if (modal) modal.classList.remove('open');
}

// 5. Category Management System
function saveCategories() {
  StorageAdapter.save('categories', state.categories);
  renderCategoryChips();
  updateUI();
}

function openCategoryModal() {
  renderCategoryEditList();
  const modal = document.getElementById('categoryModal');
  if (modal) modal.classList.add('open');
}

function closeCategoryModal() {
  const modal = document.getElementById('categoryModal');
  if (modal) modal.classList.remove('open');
}

function renderCategoryEditList() {
  const container = document.getElementById('categoryEditList');
  if (!container) return;
  container.innerHTML = '';

  state.categories.forEach((cat, index) => {
    const item = document.createElement('div');
    item.className = 'category-edit-item';
    item.innerHTML = `
      <div class="category-edit-left">
        <span style="font-size: 1.25rem;">${cat.icon}</span>
        <div class="category-edit-dot" style="background-color: ${cat.color};"></div>
        <input type="text" class="category-edit-input" value="${escapeHtml(cat.name)}" title="点击可就地改名">
      </div>
      <div class="category-edit-actions">
        <span style="font-size: 0.7rem; color: ${cat.isWaster ? '#EF4444' : (cat.isProductive ? '#10B981' : '#94A3B8')}; font-weight: 600;">
          ${cat.isWaster ? '摸鱼' : (cat.isProductive ? '专注' : '日常')}
        </span>
        <button type="button" class="category-del-btn" title="删除此分类">🗑️</button>
      </div>
    `;

    const nameInput = item.querySelector('.category-edit-input');
    nameInput.addEventListener('change', () => {
      const val = nameInput.value.trim();
      if (val) {
        cat.name = val;
        saveCategories();
        showToast(`已重命名为「${val}」`);
      }
    });

    const delBtn = item.querySelector('.category-del-btn');
    delBtn.addEventListener('click', () => {
      if (state.categories.length <= 1) {
        alert('至少保留一个活动分类！');
        return;
      }
      if (confirm(`确定删除分类「${cat.name}」吗？`)) {
        state.categories.splice(index, 1);
        if (state.selectedCategory === cat.id) {
          state.selectedCategory = state.categories[0].id;
        }
        saveCategories();
        renderCategoryEditList();
        renderTimelineStream();
        showToast('已删除分类');
      }
    });

    container.appendChild(item);
  });
}

function handleAddNewCategory() {
  const nameInp = document.getElementById('newCatName');
  const iconInp = document.getElementById('newCatIcon');
  const colorInp = document.getElementById('newCatColor');
  const prodInp = document.getElementById('newCatIsProductive');
  const wasteInp = document.getElementById('newCatIsWaster');

  const name = nameInp ? nameInp.value.trim() : '';
  const icon = (iconInp && iconInp.value.trim()) ? iconInp.value.trim() : '✨';
  const color = colorInp ? colorInp.value : '#3B82F6';
  const isProductive = prodInp ? prodInp.checked : false;
  const isWaster = wasteInp ? wasteInp.checked : false;

  if (!name) {
    alert('请输入分类名称！');
    if (nameInp) nameInp.focus();
    return;
  }

  const newId = 'cat_' + Date.now().toString(36);
  state.categories.push({
    id: newId,
    name: name,
    icon: icon,
    color: color,
    isProductive: isProductive,
    isWaster: isWaster
  });

  saveCategories();
  renderCategoryEditList();

  if (nameInp) nameInp.value = '';
  showToast(`已新增分类「${icon} ${name}」`);
}

function handleResetDefaultCategories() {
  if (confirm('确定要恢复为系统初始默认的 8 个分类吗？自定义的分类将被重置。')) {
    state.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
    state.selectedCategory = state.categories[0].id;
    saveCategories();
    renderCategoryEditList();
    showToast('已恢复预设分类');
  }
}

