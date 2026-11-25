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

// ==========================================
// 智能色彩引擎 (ColorEngine): 一级高对比选色 & 二级母色阶继承去重
// ==========================================
const ColorEngine = {
  PRIMARY_PALETTE: [
    '#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#6366F1', '#F97316',
    '#14B8A6', '#D946EF', '#0EA5E9', '#EAB308', '#E11D48',
    '#22C55E', '#A855F7', '#0284C7', '#EA580C', '#64748B'
  ],
  hexToRgb(hex) {
    const clean = (hex || '#3B82F6').replace('#', '');
    const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
    const num = parseInt(full, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  },
  hexToHsl(hex) {
    let { r, g, b } = this.hexToRgb(hex);
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  },
  hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = n => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`.toUpperCase();
  },
  colorDistance(hexA, hexB) {
    const a = this.hexToRgb(hexA);
    const b = this.hexToRgb(hexB);
    return Math.sqrt(Math.pow(a.r - b.r, 2) * 2 + Math.pow(a.g - b.g, 2) * 4 + Math.pow(a.b - b.b, 2) * 3);
  },
  // 自动匹配一个与现有所有一级颜色差别最大的颜色
  pickDistinctPrimaryColor(excludeHex = null) {
    const existing = (state && Array.isArray(state.categories) ? state.categories : DEFAULT_CATEGORIES)
      .filter(c => !c.parentId)
      .map(c => c.color.toUpperCase());
    if (excludeHex) existing.push(excludeHex.toUpperCase());

    const candidates = [...this.PRIMARY_PALETTE];
    for (let h = 0; h < 360; h += 24) {
      candidates.push(this.hslToHex(h, 76, 50));
    }

    let bestColor = '#14B8A6';
    let maxMinDist = -1;
    candidates.forEach(cand => {
      const upper = cand.toUpperCase();
      if (existing.includes(upper)) return;
      let minDist = Infinity;
      existing.forEach(ex => {
        const d = this.colorDistance(upper, ex);
        if (d < minDist) minDist = d;
      });
      if (minDist > maxMinDist) {
        maxMinDist = minDist;
        bestColor = upper;
      }
    });
    return bestColor;
  },
  // 基于母类基本色生成 6 档明暗渐变色阶 (从浅到深，类似 Office Theme Colors)
  generateShadePalette(parentHex) {
    const { h, s } = this.hexToHsl(parentHex);
    const sat = s < 15 ? s : Math.min(88, Math.max(58, s));
    const lightnessLevels = [78, 67, 56, 46, 36, 26];
    return lightnessLevels.map(l => this.hslToHex(h, sat, l));
  },
  // 获取某一级母类下尚未被占用的可用色阶（自动消掉母色及兄弟子类已选颜色）
  getAvailableShadesForParent(parentId) {
    const cats = state && Array.isArray(state.categories) ? state.categories : [];
    const parent = cats.find(c => c.id === parentId);
    if (!parent) return [];
    const allShades = this.generateShadePalette(parent.color);
    const siblings = cats.filter(c => c.parentId === parentId);
    const usedColors = [parent.color, ...siblings.map(s => s.color)].map(x => x.toUpperCase());

    // 过滤掉精确命中或过近的颜色 (RGB 感知距离 < 40 视为已被占用)
    const available = allShades.filter(shade => {
      return !usedColors.some(used => used === shade || this.colorDistance(shade, used) < 42);
    });
    // 若 6 档全被占满，补充极浅/极深/微调档位兜底，保证依然不撞色
    if (available.length === 0) {
      const { h, s } = this.hexToHsl(parent.color);
      const extra = [84, 72, 61, 51, 41, 31, 21].map(l => this.hslToHex((h + 10) % 360, s, l));
      return extra.filter(sh => !usedColors.includes(sh));
    }
    return available;
  }
};

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

// ==========================================
// 📚 四阶段修学进度游标管理器 (LearningCursorManager v1.9.0)
// 每个阶段独立持有 { cur, total, unit, enabled }
// ==========================================
const LEARNING_STAGES = [
  { key: 'video', label: '视频课', icon: '🎬', color: '#3B82F6', defaultUnit: '集' },
  { key: 'note', label: '整理笔记', icon: '📝', color: '#10B981', defaultUnit: '篇' },
  { key: 'recite', label: '背诵/Anki', icon: '🧠', color: '#8B5CF6', defaultUnit: '张' },
  { key: 'share', label: '分享/复述', icon: '🗣️', color: '#F59E0B', defaultUnit: '次' }
];

const DEFAULT_LEARNING_CURSORS = {
  version: 2,
  courses: [
    {
      id: 'course_hdnj', name: '黄帝内经', icon: '📖', archived: false, updatedAt: '2026-11-25T14:00:00Z',
      stages: {
        video: { cur: 19, total: 81, unit: '集', enabled: true },
        note: { cur: 12, total: 30, unit: '篇', enabled: true },
        recite: { cur: 10, total: 100, unit: '张', enabled: true },
        share: { cur: 0, total: 10, unit: '次', enabled: false }
      }
    },
    {
      id: 'course_zjdc', name: '针灸大成', icon: '🪡', archived: false, updatedAt: '2026-11-25T12:00:00Z',
      stages: {
        video: { cur: 50, total: 81, unit: '集', enabled: true },
        note: { cur: 10, total: 12, unit: '篇', enabled: true },
        recite: { cur: 45, total: 120, unit: '张', enabled: true },
        share: { cur: 0, total: 10, unit: '次', enabled: false }
      }
    }
  ],
  dailyLogs: {}
};

const LearningCursorManager = {
  normalizeCourse(c) {
    if (!c) return c;
    const legacyTotal = Number(c.total) || 30;
    const normStages = {};
    LEARNING_STAGES.forEach(st => {
      const raw = c.stages ? c.stages[st.key] : undefined;
      if (raw && typeof raw === 'object') {
        normStages[st.key] = {
          cur: Math.max(0, Number(raw.cur) || 0),
          total: Math.max(1, Number(raw.total) || legacyTotal),
          unit: (raw.unit || st.defaultUnit).trim(),
          enabled: raw.enabled !== false
        };
      } else {
        const val = Math.max(0, Number(raw) || 0);
        normStages[st.key] = {
          cur: val,
          total: st.key === 'video' ? legacyTotal : (st.key === 'note' ? Math.max(12, Math.round(legacyTotal / 3)) : (st.key === 'recite' ? 100 : 10)),
          unit: st.key === 'video' ? (c.unit || st.defaultUnit) : st.defaultUnit,
          enabled: st.key === 'share' ? (val > 0) : true
        };
      }
    });
    return {
      ...c,
      stages: normStages
    };
  },
  getData() {
    let data = StorageAdapter.load('learning_cursors', null);
    if (!data || !Array.isArray(data.courses)) {
      data = JSON.parse(JSON.stringify(DEFAULT_LEARNING_CURSORS));
      this.saveData(data);
    } else {
      let migrated = false;
      data.courses = data.courses.map(c => {
        if (!c.stages || typeof c.stages.video !== 'object') migrated = true;
        return this.normalizeCourse(c);
      });
      if (migrated) this.saveData(data);
    }
    if (!data.dailyLogs) data.dailyLogs = {};
    return data;
  },
  saveData(data) {
    StorageAdapter.save('learning_cursors', data);
  },
  getActiveCourses() {
    return this.getData().courses.filter(c => !c.archived);
  },
  getArchivedCourses() {
    return this.getData().courses.filter(c => c.archived);
  },
  saveOrUpdateCourse(courseObj) {
    const data = this.getData();
    const norm = this.normalizeCourse({
      ...courseObj,
      updatedAt: new Date().toISOString()
    });
    const idx = data.courses.findIndex(c => c.id === norm.id);
    if (idx !== -1) {
      data.courses[idx] = norm;
    } else {
      data.courses.unshift(norm);
    }
    this.saveData(data);
    return norm;
  },
  updateCourse(courseId, fields) {
    const data = this.getData();
    const c = data.courses.find(item => item.id === courseId);
    if (!c) return null;
    if (fields.name !== undefined) c.name = fields.name.trim();
    if (fields.icon !== undefined) c.icon = fields.icon.trim() || '📘';
    if (fields.archived !== undefined) c.archived = !!fields.archived;
    if (fields.stages !== undefined) c.stages = fields.stages;
    c.updatedAt = new Date().toISOString();
    this.saveData(data);
    return c;
  },
  deleteCourse(courseId) {
    const data = this.getData();
    data.courses = data.courses.filter(c => c.id !== courseId);
    this.saveData(data);
  },
  advanceStage(courseId, stageKey, valueOrDelta, isAbsolute = false, dateStr = null) {
    const data = this.getData();
    const c = data.courses.find(item => item.id === courseId);
    if (!c) return null;
    const norm = this.normalizeCourse(c);
    const stObj = norm.stages[stageKey];
    if (!stObj) return null;

    const prevVal = Number(stObj.cur || 0);
    let nextVal = isAbsolute ? Number(valueOrDelta) : (prevVal + Number(valueOrDelta));
    if (isNaN(nextVal)) nextVal = prevVal;
    nextVal = Math.max(0, Math.min(stObj.total || 9999, nextVal));

    stObj.cur = nextVal;
    stObj.enabled = true;
    norm.updatedAt = new Date().toISOString();

    const idx = data.courses.findIndex(item => item.id === courseId);
    if (idx !== -1) data.courses[idx] = norm;

    const dKey = dateStr || (state ? state.currentDate : getTodayString());
    const delta = nextVal - prevVal;
    if (delta !== 0) {
      if (!data.dailyLogs[dKey]) data.dailyLogs[dKey] = [];
      data.dailyLogs[dKey].push({
        courseId: norm.id,
        courseName: norm.name,
        stage: stageKey,
        fromVal: prevVal,
        toVal: nextVal,
        delta: delta,
        total: stObj.total,
        unit: stObj.unit || '集',
        timestamp: new Date().toISOString()
      });
    }

    this.saveData(data);
    return { course: norm, stageObj: stObj, prevVal, nextVal, delta };
  },
  getTodayDeltaForCourseStage(dateStr, courseId, stageKey) {
    const logs = (this.getData().dailyLogs || {})[dateStr] || [];
    return logs.filter(l => l.courseId === courseId && l.stage === stageKey)
      .reduce((acc, l) => acc + (l.delta || 0), 0);
  }
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
  planViewMode: localStorage.getItem('tm_plan_view_mode') || 'checklist',
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
  let diff = 0;
  if (typeof startStr === 'number' && endStr === undefined) {
    diff = startStr;
  } else {
    const m1 = timeToMinutes(startStr);
    const m2 = timeToMinutes(endStr);
    diff = m2 - m1;
    if (diff < 0) diff += 1440;
  }
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
const planChecklistContainer = document.getElementById('planChecklistContainer');
const btnTogglePlanView = document.getElementById('btnTogglePlanView');
const btnPastePlanFromClipboard = document.getElementById('btnPastePlanFromClipboard');
const btnPullPlanBridge = document.getElementById('btnPullPlanBridge');
const planStatsTag = document.getElementById('planStatsTag');

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
  // 新设备初次载入严禁静默塞入示例数据污染真实账本
  // (示例数据仅允许在【设置】中由用户主动点击加载)
  // 首次载入即时同步填入草稿与打卡，防止 DOM 滞后与意外空值冲刷
  renderDailyPlanSection();
  renderDailyReflectionSection();
  renderDailyWeightSection();
  renderHabitsSection();
  renderWinnerTrials();
  renderLearningCursorsSection();
  renderBodyStateSection();
  updateUI();
  registerServiceWorker();

  // 🧹 自动净化误拉入今日的跨日旧时间表残留（例如 2026-11-24 的刻板节奏大表）
  const todayStr = getTodayString();
  if (state.plans[todayStr] && state.plans[todayStr].includes('今日时间节奏（2026-11-24')) {
    delete state.plans[todayStr];
    savePlans();
    renderDailyPlanSection();
  }

  // ❄️ 暂时冷冻：首次载入不再自动静默拉取云端/局域网今日计划，交由用户自由书写
  // if (!state.plans[state.currentDate]) { pullPlanFromBridge(true); }

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
  if (inputNote) {
    inputNote.addEventListener('input', () => autoResizeTextarea(inputNote));
  }

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

  // 一键将结束时间设为手机当下真实时刻
  const btnSetEndNow = document.getElementById('btnSetEndNow');
  if (btnSetEndNow) {
    btnSetEndNow.addEventListener('click', (e) => {
      e.preventDefault();
      const now = new Date();
      const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      inputEndTime.value = nowStr;
      showToast(`🕒 结束时间已设为当前时刻 ${nowStr}`);
    });
  }

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
      curr = Math.round(curr * 100) / 100;
      inputDailyWeight.value = curr;
      handleSaveWeightOnly(false);
    });
  });

  // 独立保存体重按钮
  if (btnSaveWeightOnly) {
    btnSaveWeightOnly.addEventListener('click', () => handleSaveWeightOnly(true));
  }

  // 体重输入框实时输入防抖保存与失焦整理
  if (inputDailyWeight) {
    inputDailyWeight.addEventListener('input', handleWeightInput);
    inputDailyWeight.addEventListener('blur', () => {
      handleSaveWeightOnly(false);
    });
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

  // 计划视图切换 (清单模式 vs 源码编辑)
  if (btnTogglePlanView) {
    btnTogglePlanView.addEventListener('click', () => {
      state.planViewMode = (state.planViewMode === 'checklist') ? 'raw' : 'checklist';
      localStorage.setItem('tm_plan_view_mode', state.planViewMode);
      renderDailyPlanSection();
      if (state.planViewMode === 'raw' && inputDailyPlan) {
        inputDailyPlan.focus();
      }
    });
  }

  // 一键从剪贴板载入 Gemini 安排的计划
  if (btnPastePlanFromClipboard) {
    btnPastePlanFromClipboard.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (!text || !text.trim()) {
          showToast('⚠️ 剪贴板为空，请先在 Gemini 聊天中复制安排');
          return;
        }
        state.plans[state.currentDate] = text.trim();
        if (inputDailyPlan) {
          inputDailyPlan.value = text.trim();
          autoResizeTextarea(inputDailyPlan);
        }
        savePlans();
        saveZhixingSnapshot('plan', text.trim());
        state.planViewMode = 'checklist';
        localStorage.setItem('tm_plan_view_mode', 'checklist');
        renderDailyPlanSection();
        showToast('🎉 成功识别剪贴板！时间表与待办已分离载入');
        syncPlanToBridge(state.currentDate, text.trim());
      } catch (err) {
        state.planViewMode = 'raw';
        localStorage.setItem('tm_plan_view_mode', 'raw');
        renderDailyPlanSection();
        if (inputDailyPlan) {
          inputDailyPlan.focus();
        }
        showToast('💡 剪贴板读取受限，已切至源码框，请长按粘贴');
      }
    });
  }

  // 计划云端拉取按钮 (智能双保险：优先直通谷歌云桥，若云桥未更新则自动无缝触发本地镜像自愈拉取)
  if (btnPullPlanBridge) {
    btnPullPlanBridge.addEventListener('click', async () => {
      const cloudUrl = CloudSyncAdapter.getUrl();
      let gotPlan = false;
      if (cloudUrl) {
        showToast('☁️ 正在从谷歌云盘拉取《今日计划.md》与漫游状态...');
        try {
          const st = await CloudSyncAdapter.pullFromCloud(state.currentDate);
          if (st) {
            renderDailyPlanSection();
            renderDailyReflectionSection();
            renderDailyWeightSection();
            renderHabitsSection();
            renderWinnerTrials();
            renderBodyStateSection();
            updateUI();
            const hasPlan = state.plans[state.currentDate] && state.plans[state.currentDate].trim();
            if (hasPlan) {
              gotPlan = true;
              showToast('🟢 成功从云端同步《今日计划.md》，日程与待办已就绪！');
            }
          }
        } catch (e) {
          console.warn('云桥请求异常:', e);
        }
      }

      // 🛡️ 智能自愈双保险：若云桥因 GAS 旧脚本未返回计划，毫秒级自动从电脑网关拉取同步（电脑已实时镜像 G 盘文件）
      if (!gotPlan) {
        try {
          const lanSuccess = await pullPlanFromBridge(true);
          if (lanSuccess && state.plans[state.currentDate] && state.plans[state.currentDate].trim()) {
            gotPlan = true;
            renderDailyPlanSection();
            updateUI();
            showToast('🟢 成功同步最新《今日计划.md》，日程与待办已就绪！');
          }
        } catch (lanErr) {
          console.warn('局域网网关自愈探测跳过:', lanErr);
        }
      }

      if (!gotPlan) {
        showToast('ℹ️ 今日暂无预设计划 (请确认云端或知识库已创建《今日计划.md》)');
      }
    });
  }

  // 计划模板插入 (支持双核标准 Markdown 待办格式)
  if (btnInsertPlanTemplate && inputDailyPlan) {
    btnInsertPlanTemplate.addEventListener('click', () => {
      const current = (state.plans[state.currentDate] || '').trim();
      let newPlan = '';
      if (!current) {
        newPlan = '### 🌤️ 今日怎么做（上午 / 下午大致方向）\n- 上午：\n- 下午：\n- 晚上：\n\n### 🎯 今日尽量完成\n- [ ] 1. \n- [ ] 2. \n- [ ] 3. ';
      } else {
        newPlan = current + '\n- [ ] ';
      }
      state.plans[state.currentDate] = newPlan;
      inputDailyPlan.value = newPlan;
      state.planViewMode = 'raw';
      localStorage.setItem('tm_plan_view_mode', 'raw');
      handlePlanInput();
      renderDailyPlanSection();
      inputDailyPlan.focus();
    });
  }

  // 一键清空今日计划按钮
  const btnClearDailyPlan = document.getElementById('btnClearDailyPlan');
  if (btnClearDailyPlan && inputDailyPlan) {
    btnClearDailyPlan.addEventListener('click', () => {
      if (!state.plans[state.currentDate] || confirm('确定清空当前日期的今日计划文本框吗？')) {
        state.plans[state.currentDate] = '';
        inputDailyPlan.value = '';
        savePlans();
        state.planViewMode = 'raw';
        localStorage.setItem('tm_plan_view_mode', 'raw');
        renderDailyPlanSection();
        inputDailyPlan.focus();
        showToast('🧹 已清空今日计划，可自由书写');
      }
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

  const btnCloudPull = document.getElementById('btn-cloud-pull');
  if (btnCloudPull) btnCloudPull.addEventListener('click', handleCloudPull);

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
  try {
    renderYesterdayGapAlert();
  } catch (e) {
    console.warn('renderYesterdayGapAlert error:', e);
  }
  renderTimelineStream();
  renderSpectrumBar();
  updateQuickStats();
  if (state.activeTab === 'review') {
    renderReviewTab();
  } else if (state.activeTab === 'trends') {
    renderTrendsTab();
  }
}

function getYesterdayString(baseDateStr) {
  const [y, m, d] = (baseDateStr || getTodayString()).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function findDayTimeGaps(dateStr, minGapMins = 15) {
  const list = (state.records[dateStr] || []).slice()
    .map(r => ({ s: timeToMinutes(r.start), e: timeToMinutes(r.end) }))
    .filter(item => item.e > item.s)
    .sort((a, b) => a.s - b.s);

  const merged = [];
  for (const item of list) {
    if (merged.length === 0 || item.s > merged[merged.length - 1].e) {
      merged.push({ s: item.s, e: item.e });
    } else {
      merged[merged.length - 1].e = Math.max(merged[merged.length - 1].e, item.e);
    }
  }

  const gaps = [];
  let cursor = 0;
  for (const iv of merged) {
    if (iv.s - cursor >= minGapMins) {
      gaps.push({
        start: minutesToTime(cursor),
        end: minutesToTime(iv.s),
        durationMins: iv.s - cursor
      });
    }
    cursor = Math.max(cursor, iv.e);
  }
  if (1440 - cursor >= minGapMins) {
    gaps.push({
      start: minutesToTime(cursor),
      end: '24:00',
      durationMins: 1440 - cursor
    });
  }
  return gaps;
}

function renderYesterdayGapAlert() {
  const container = document.getElementById('yesterdayGapAlertContainer');
  if (!container) return;

  // 仅在“今天”视图展示，且仅检查前一天（再往前不提醒）
  const todayStr = getTodayString();
  if (state.currentDate !== todayStr) {
    container.innerHTML = '';
    return;
  }

  const yestStr = getYesterdayString(todayStr);
  if (localStorage.getItem('tm_yest_gap_dismissed_' + yestStr) === '1') {
    container.innerHTML = '';
    return;
  }

  const yestRecords = state.records[yestStr] || [];
  // 昨天没有任何记录时也给出轻量提示；有记录但存在空白段时精确展示空档
  const gaps = findDayTimeGaps(yestStr, 15);
  if (gaps.length === 0) {
    container.innerHTML = '';
    return;
  }

  const isWholeDayEmpty = (yestRecords.length === 0);
  const gapBtnsHtml = isWholeDayEmpty
    ? `<button type="button" class="yest-gap-btn" data-start="07:00" data-end="23:59">➕ 补录昨日记录</button>`
    : gaps.map(g => {
        const endForInput = g.end === '24:00' ? '23:59' : g.end;
        const isNightTail = (timeToMinutes(g.start) >= 21 * 60 && g.end === '24:00');
        return `
          <button type="button" class="yest-gap-btn" data-start="${g.start}" data-end="${endForInput}">
            ➕ ${g.start} - ${g.end} (${formatDuration(g.start, g.end)})
          </button>
          ${isNightTail ? `<button type="button" class="yest-sleep-quick-btn" data-start="${g.start}" data-end="${endForInput}">💤 一键记为睡眠</button>` : ''}
        `;
      }).join('');

  container.innerHTML = `
    <div class="yesterday-gap-card">
      <div class="yesterday-gap-header">
        <div class="yesterday-gap-title">
          <span>🌅 昨日 (${yestStr.slice(5)}) 待补录时段</span>
          <span class="yesterday-gap-badge">${isWholeDayEmpty ? '全天未记' : `尚缺 ${gaps.length} 段`}</span>
        </div>
        <button type="button" id="btnDismissYesterdayGap" class="yesterday-gap-dismiss" title="忽略昨日提醒，不再打扰">✕ 忽略</button>
      </div>
      <div class="yesterday-gap-desc">
        ${isWholeDayEmpty ? '昨日全天暂无时间块记录，点击下方补录或直接忽略：' : '睡前等未记时段可直接点击下方补录，补满或忽略后此窗口自动消失：'}
      </div>
      <div class="yesterday-gap-actions">
        ${gapBtnsHtml}
      </div>
    </div>
  `;

  const dismissBtn = container.querySelector('#btnDismissYesterdayGap');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      localStorage.setItem('tm_yest_gap_dismissed_' + yestStr, '1');
      container.innerHTML = '';
      showToast('已忽略昨日补录提醒');
    });
  }

  container.querySelectorAll('.yest-gap-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openRecordModal(null, btn.dataset.start, btn.dataset.end, yestStr);
    });
  });

  container.querySelectorAll('.yest-sleep-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!state.records[yestStr]) state.records[yestStr] = [];
      const sleepCat = state.categories.find(c => !c.parentId && (c.id === 'sleep' || c.name.includes('睡'))) || state.categories[0];
      state.records[yestStr].push({
        id: 'rec_' + Date.now(),
        category: sleepCat ? sleepCat.id : 'sleep',
        start: btn.dataset.start,
        end: btn.dataset.end,
        note: '晨间一键补录昨日夜间睡眠'
      });
      saveRecords();
      updateUI();
      showToast(`💤 已将昨日 ${btn.dataset.start}-${btn.dataset.end} 记为睡眠！`);
    });
  });
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
  const subWrapper = document.getElementById('subCategoryChipsWrapper');

  const primaries = state.categories.filter(c => !c.parentId);
  const selectedObj = state.categories.find(c => c.id === state.selectedCategory) || primaries[0];
  const activeParentId = selectedObj ? (selectedObj.parentId || selectedObj.id) : null;

  primaries.forEach(cat => {
    const subCount = state.categories.filter(c => c.parentId === cat.id).length;
    const isParentActive = (cat.id === activeParentId);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `category-chip-btn ${isParentActive ? 'selected' : ''}`;
    btn.style.color = cat.color;
    btn.innerHTML = `
      <span style="font-size: 1.25rem;">${cat.icon}</span>
      <span>${cat.name}${subCount > 0 ? `<span class="chip-sub-count">${subCount}</span>` : ''}</span>
    `;
    btn.addEventListener('click', () => {
      state.selectedCategory = cat.id;
      renderCategoryChips();
    });
    categoryChipsContainer.appendChild(btn);
  });

  // 若当前高亮的一级大类下有二级细分，展开二级联动胶囊栏
  if (subWrapper) {
    const subs = activeParentId ? state.categories.filter(c => c.parentId === activeParentId) : [];
    const parentCat = primaries.find(p => p.id === activeParentId);
    if (subs.length > 0 && parentCat) {
      subWrapper.style.display = 'block';
      subWrapper.innerHTML = `
        <div class="sub-chips-label">↳ 「${parentCat.icon} ${escapeHtml(parentCat.name)}」细分活动：</div>
        <div class="sub-chips-list"></div>
      `;
      const listEl = subWrapper.querySelector('.sub-chips-list');

      // 通用母类兜底按钮
      const generalBtn = document.createElement('button');
      generalBtn.type = 'button';
      generalBtn.className = `sub-chip-btn ${state.selectedCategory === parentCat.id ? 'selected' : ''}`;
      generalBtn.style.setProperty('--chip-color', parentCat.color);
      generalBtn.innerHTML = `<span>${parentCat.icon} 通用</span>`;
      generalBtn.addEventListener('click', () => {
        state.selectedCategory = parentCat.id;
        renderCategoryChips();
      });
      listEl.appendChild(generalBtn);

      subs.forEach(sub => {
        const sBtn = document.createElement('button');
        sBtn.type = 'button';
        sBtn.className = `sub-chip-btn ${state.selectedCategory === sub.id ? 'selected' : ''}`;
        sBtn.style.setProperty('--chip-color', sub.color);
        sBtn.innerHTML = `<span>${sub.icon} ${escapeHtml(sub.name)}</span>`;
        sBtn.addEventListener('click', () => {
          state.selectedCategory = sub.id;
          renderCategoryChips();
        });
        listEl.appendChild(sBtn);
      });
    } else {
      subWrapper.style.display = 'none';
      subWrapper.innerHTML = '';
    }
  }

  // 入口 A：判断当前选中的活动是否为学习类（视频课/整理笔记/背诵/分享等），联动显示修学游标推进栏
  renderRecordCursorLinkBox();
}

let recordCursorLinkState = { courseId: '', stage: 'video', targetVal: 0 };

function detectStageFromCategory(catName) {
  const name = (catName || '').toLowerCase();
  if (name.includes('视频') || name.includes('听课')) return 'video';
  if (name.includes('笔记') || name.includes('词卡') || name.includes('导图') || name.includes('整理')) return 'note';
  if (name.includes('背诵') || name.includes('anki') || name.includes('刷卡')) return 'recite';
  if (name.includes('分享') || name.includes('复述') || name.includes('输出')) return 'share';
  return 'video';
}

function isLearningCategorySelected() {
  const cat = state.categories.find(c => c.id === state.selectedCategory);
  if (!cat) return false;
  const parent = cat.parentId ? state.categories.find(p => p.id === cat.parentId) : null;
  const combined = ((cat.name || '') + ' ' + (parent ? parent.name : '')).toLowerCase();
  return /学习|视频|笔记|背诵|分享|研读|anki|刷题|看书|复习|听课/.test(combined);
}

function renderRecordCursorLinkBox() {
  const box = document.getElementById('recordCursorLinkBox');
  if (!box) return;

  if (!isLearningCategorySelected()) {
    box.style.display = 'none';
    box.innerHTML = '';
    recordCursorLinkState.courseId = '';
    return;
  }

  const activeCourses = LearningCursorManager.getActiveCourses();
  if (activeCourses.length === 0) {
    box.style.display = 'none';
    return;
  }

  const cat = state.categories.find(c => c.id === state.selectedCategory);
  const autoStage = detectStageFromCategory(cat ? cat.name : '');
  // 当切换分类时同步默认阶段，但保留已选课程
  recordCursorLinkState.stage = autoStage;

  const selectedCourse = activeCourses.find(c => c.id === recordCursorLinkState.courseId) || null;
  if (selectedCourse) {
    const stObj = selectedCourse.stages[recordCursorLinkState.stage] || { cur: 0, total: 30, unit: '集' };
    recordCursorLinkState.targetVal = Math.min(stObj.total, (stObj.cur || 0) + 1);
  }

  box.style.display = 'block';
  const courseOptions = activeCourses.map(c => {
    const stObj = c.stages[recordCursorLinkState.stage] || { cur: 0, total: 30, unit: '集' };
    return `<option value="${c.id}" ${recordCursorLinkState.courseId === c.id ? 'selected' : ''}>${c.icon || '📘'} ${escapeHtml(c.name)} (当前 ${stObj.cur}/${stObj.total}${stObj.unit})</option>`;
  }).join('');

  const stageChipsHtml = LEARNING_STAGES.map(st => `
    <button type="button" class="link-stage-btn ${recordCursorLinkState.stage === st.key ? 'active' : ''}" data-stage="${st.key}">
      ${st.icon} ${st.label}
    </button>
  `).join('');

  const selStObj = selectedCourse ? (selectedCourse.stages[recordCursorLinkState.stage] || { cur: 0, total: 30, unit: '集' }) : null;

  box.innerHTML = `
    <div class="record-cursor-link-header">
      <span>📚 顺便推进修学游标（可选）</span>
      <select id="recordLinkCourseSelect" class="text-input" style="width:auto; min-width:155px; padding:4px 8px; font-size:0.76rem; font-weight:600;">
        <option value="">暂不推进游标</option>
        ${courseOptions}
      </select>
    </div>
    ${selectedCourse && selStObj ? `
      <div class="record-cursor-link-body">
        <div class="link-stage-row">${stageChipsHtml}</div>
        <div class="link-target-row">
          <span style="font-size:0.75rem;color:var(--text-muted);">推进至第</span>
          <button type="button" class="cursor-step-btn" id="btnLinkTargetDec">−</button>
          <input type="number" id="inputLinkTargetVal" class="link-target-input" value="${recordCursorLinkState.targetVal}" min="0" max="${selStObj.total}">
          <button type="button" class="cursor-step-btn" id="btnLinkTargetInc">+</button>
          <span style="font-size:0.75rem;color:var(--text-muted);">/ ${selStObj.total}${selStObj.unit}</span>
        </div>
      </div>
    ` : ''}
  `;

  const sel = box.querySelector('#recordLinkCourseSelect');
  if (sel) {
    sel.addEventListener('change', () => {
      recordCursorLinkState.courseId = sel.value;
      renderRecordCursorLinkBox();
    });
  }

  box.querySelectorAll('.link-stage-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      recordCursorLinkState.stage = btn.dataset.stage;
      if (selectedCourse) {
        const stObj = selectedCourse.stages[recordCursorLinkState.stage] || { cur: 0, total: 30 };
        recordCursorLinkState.targetVal = Math.min(stObj.total, (stObj.cur || 0) + 1);
      }
      renderRecordCursorLinkBox();
    });
  });

  const decBtn = box.querySelector('#btnLinkTargetDec');
  const incBtn = box.querySelector('#btnLinkTargetInc');
  const numInp = box.querySelector('#inputLinkTargetVal');
  if (decBtn && numInp && selectedCourse && selStObj) {
    decBtn.addEventListener('click', () => {
      const v = Math.max(0, (parseInt(numInp.value, 10) || 0) - 1);
      numInp.value = v;
      recordCursorLinkState.targetVal = v;
    });
  }
  if (incBtn && numInp && selectedCourse && selStObj) {
    incBtn.addEventListener('click', () => {
      const v = Math.min(selStObj.total, (parseInt(numInp.value, 10) || 0) + 1);
      numInp.value = v;
      recordCursorLinkState.targetVal = v;
    });
  }
  if (numInp && selectedCourse && selStObj) {
    numInp.addEventListener('change', () => {
      const v = Math.max(0, Math.min(selStObj.total, parseInt(numInp.value, 10) || 0));
      numInp.value = v;
      recordCursorLinkState.targetVal = v;
    });
  }
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
  const parentCat = cat.parentId ? state.categories.find(c => c.id === cat.parentId) : null;
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
        <span class="timeline-item-title">
          ${cat.icon} ${escapeHtml(cat.name)}
          ${parentCat ? `<span class="timeline-parent-tag" style="color: ${parentCat.color}; background: ${parentCat.color}14;">${escapeHtml(parentCat.name)}</span>` : ''}
        </span>
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
function openRecordModal(existingRecord = null, defaultStart = null, defaultEnd = null, targetDate = null) {
  const btnDeleteInModal = document.getElementById('btnDeleteRecordInModal');
  const btnSubmitRecord = document.getElementById('btnSubmitRecord');
  const activeTargetDate = targetDate || state.currentDate;
  state.editingTargetDate = activeTargetDate;
  const isCrossDay = (activeTargetDate !== state.currentDate);

  if (existingRecord) {
    state.editingRecordId = existingRecord.id;
    modalTitle.textContent = isCrossDay
      ? `补改昨日 (${activeTargetDate.slice(5)}) 记录`
      : `修改记录 (${existingRecord.start} - ${existingRecord.end})`;
    if (btnSubmitRecord) btnSubmitRecord.textContent = '✓ 保存修改';
    if (btnDeleteInModal) {
      btnDeleteInModal.style.display = 'block';
      btnDeleteInModal.onclick = () => {
        if (confirm(`确定删除 ${existingRecord.start} - ${existingRecord.end} 的记录吗？`)) {
          deleteRecord(existingRecord.id, activeTargetDate);
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
    modalTitle.textContent = isCrossDay
      ? `🌅 补录昨日 (${activeTargetDate.slice(5)}) 时间块`
      : '记录新时间块';
    if (btnSubmitRecord) {
      btnSubmitRecord.textContent = isCrossDay
        ? `✓ 保存到昨日 (${activeTargetDate.slice(5)})`
        : '✓ 确定保存时间块';
    }
    if (btnDeleteInModal) btnDeleteInModal.style.display = 'none';
    state.selectedCategory = state.categories[0] ? state.categories[0].id : 'phone';

    if (defaultStart && defaultEnd) {
      inputStartTime.value = defaultStart;
      inputEndTime.value = defaultEnd;
    } else {
      // 智能识别：接续上一个结束时间作为开始时间；结束时间自动对齐手机当下真实时间！
      const records = (state.records[activeTargetDate] || []).slice().sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
      const isViewingToday = (activeTargetDate === getTodayString());
      const now = new Date();
      const nowStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const nowMins = timeToMinutes(nowStr);

      if (records.length > 0) {
        const lastRec = records[records.length - 1];
        inputStartTime.value = lastRec.end;
        const lastEndMins = timeToMinutes(lastRec.end);

        if (isViewingToday && nowMins > lastEndMins) {
          // 手机当下时间晚于上一条记录结束时间，直接采用手机当前真实时间！
          inputEndTime.value = nowStr;
        } else {
          // 若在手机当前时间之前或查看历史日期，顺延 30 分钟
          inputEndTime.value = minutesToTime(Math.min(24 * 60 - 1, lastEndMins + 30));
        }
      } else {
        if (isViewingToday) {
          // 当天首条记录：结束时间直接为手机当下时刻，开始时间默认往前推30分钟
          inputEndTime.value = nowStr;
          const defaultStartMins = Math.max(0, nowMins - 30);
          inputStartTime.value = minutesToTime(defaultStartMins);
        } else {
          inputStartTime.value = '07:00';
          inputEndTime.value = '07:30';
        }
      }
    }
    inputNote.value = '';
  }

  renderCategoryChips();
  recordModal.classList.add('open');
  if (inputNote) {
    inputNote.style.height = 'auto';
    setTimeout(() => autoResizeTextarea(inputNote), 15);
  }
}

function closeRecordModal() {
  recordModal.classList.remove('open');
  state.editingRecordId = null;
  state.editingTargetDate = null;
  recordCursorLinkState.courseId = '';
}

function handleSaveRecord() {
  const start = inputStartTime.value;
  const end = inputEndTime.value;
  let note = inputNote.value.trim();

  if (!start || !end) {
    alert('请填写起始时间和结束时间');
    return;
  }

  if (timeToMinutes(end) <= timeToMinutes(start)) {
    alert('结束时间必须晚于起始时间！');
    return;
  }

  const targetDate = state.editingTargetDate || state.currentDate;

  // 若用户通过入口 A 关联推进了修学游标，自动落盘并智能注入备注
  let cursorAdvanceMsg = '';
  if (recordCursorLinkState.courseId && isLearningCategorySelected()) {
    const inpVal = document.getElementById('inputLinkTargetVal');
    const targetVal = inpVal ? parseInt(inpVal.value, 10) : recordCursorLinkState.targetVal;
    const advRes = LearningCursorManager.advanceStage(
      recordCursorLinkState.courseId,
      recordCursorLinkState.stage,
      targetVal,
      true,
      targetDate
    );
    if (advRes) {
      const stMeta = LEARNING_STAGES.find(s => s.key === recordCursorLinkState.stage) || { label: '' };
      const stObj = advRes.stageObj;
      const tagStr = `《${advRes.course.name}》${stMeta.label} (${advRes.nextVal}/${stObj.total}${stObj.unit})`;
      if (!note) {
        note = tagStr;
      } else if (!note.includes(advRes.course.name)) {
        note = `${tagStr} · ${note}`;
      }
      cursorAdvanceMsg = `📚 已同步推进《${advRes.course.name}》至 ${advRes.nextVal}/${stObj.total}${stObj.unit}`;
    }
  }
  if (!state.records[targetDate]) {
    state.records[targetDate] = [];
  }

  const list = state.records[targetDate];

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

  const isCrossDay = (targetDate !== state.currentDate);
  saveRecords();
  closeRecordModal();
  updateUI();
  renderLearningCursorsSection();
  if (cursorAdvanceMsg) {
    showToast(cursorAdvanceMsg);
  } else if (isCrossDay) {
    showToast(`✅ 已成功补录至昨日 (${targetDate.slice(5)})！`);
  }
}

function deleteRecord(recordId, targetDate = null) {
  const dKey = targetDate || state.currentDate;
  if (!state.records[dKey]) return;
  state.records[dKey] = state.records[dKey].filter(r => r.id !== recordId);
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
  renderLearningCursorsSection();
  renderDailyReflectionSection();
}

// 1. 体重模块渲染与计算
function renderDailyWeightSection() {
  if (!inputDailyWeight) return;

  const currentWeight = state.weights[state.currentDate];
  // 关键防护：如果用户正在输入框中打字编辑（activeElement），绝对不要改写 input.value，防止光标跳动与拼字错位（如 50.25 变成 2550）
  if (document.activeElement !== inputDailyWeight) {
    inputDailyWeight.value = (currentWeight !== undefined && currentWeight !== null) ? currentWeight : '';
  }

  // 计算与昨天的差值 (支持两位小数精度)
  const d = new Date(state.currentDate);
  d.setDate(d.getDate() - 1);
  const yestStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const yestWeight = state.weights[yestStr];

  if (weightDiffTag) {
    if (currentWeight !== undefined && currentWeight !== null && yestWeight !== undefined && yestWeight !== null) {
      const diff = Math.round((currentWeight - yestWeight) * 100) / 100;
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
      state.weights[state.currentDate] = Math.round(num * 100) / 100;
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
    if (!isNaN(num) && num > 0) state.weights[state.currentDate] = Math.round(num * 100) / 100;
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
let planBridgeSyncTimer = null;

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

  clearTimeout(planBridgeSyncTimer);
  planBridgeSyncTimer = setTimeout(() => {
    syncPlanToBridge(state.currentDate, val);
  }, 800);
}

// ========================================================
// 🎯 晨起立志 · 时间节奏与 Markdown 待办解耦渲染引擎 (v1.6.0)
// ========================================================

// 从 Markdown 文本中提取结构化项 (解耦时间节奏与可打勾待办)
function parsePlanMarkdown(markdown) {
  if (!markdown) return [];
  const lines = markdown.split('\n');
  const items = [];
  let currentHeadingText = '';

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      items.push({ type: 'empty', lineIndex: idx });
      return;
    }

    // 分隔线：---
    if (/^---+$/.test(trimmed)) {
      items.push({ type: 'divider', lineIndex: idx });
      return;
    }

    // 标题行：### 标题 或 ## 标题
    if (trimmed.startsWith('#')) {
      const match = trimmed.match(/^(#+)\s*(.*)$/);
      if (match) {
        currentHeadingText = match[2];
        items.push({
          type: 'heading',
          level: match[1].length,
          text: match[2],
          raw: line,
          lineIndex: idx
        });
        return;
      }
    }

    // 引用说明：> 说明
    if (trimmed.startsWith('>')) {
      items.push({
        type: 'quote',
        text: trimmed.replace(/^>\s*/, ''),
        raw: line,
        lineIndex: idx
      });
      return;
    }

    // 明确复选框：- [ ] 或 - [x] 或 - [X] (核心打勾待办)
    const checkboxMatch = trimmed.match(/^-\s*\[([ xX])\]\s*(.*)$/);
    if (checkboxMatch) {
      const isChecked = checkboxMatch[1].toLowerCase() === 'x';
      items.push({
        type: 'todo',
        checked: isChecked,
        text: checkboxMatch[2],
        raw: line,
        lineIndex: idx
      });
      return;
    }

    // 时间节奏行识别：
    // 形式 A: - **08:30 - 09:30**｜【唤醒固本】八段锦（30m）+ 调息（5m）+ 早餐
    // 形式 B: - **21:30 - 入眠** ｜【收敛归元】...
    const timeRhythmMatch = trimmed.match(/^(?:[-*]\s*)?\*\*([^\*]+)\*\*\s*[\|｜:\s]\s*(.*)$/);
    if (timeRhythmMatch && (/\d{1,2}:\d{2}/.test(timeRhythmMatch[1]) || /时间|入眠|清晨|上午|下午|晚上|夜间/.test(timeRhythmMatch[1]))) {
      items.push({
        type: 'schedule',
        time: timeRhythmMatch[1].trim(),
        desc: timeRhythmMatch[2].trim(),
        raw: line,
        lineIndex: idx
      });
      return;
    }

    // 若当前处于“时间节奏 / 日程”小节下，无复选框的列表项一律作为纯日程流，绝不误加 Checkbox！
    if (/时间|节奏|大表|时刻|日程/.test(currentHeadingText)) {
      const cleanText = trimmed.replace(/^[-*]\s*/, '');
      items.push({
        type: 'schedule_text',
        text: cleanText,
        raw: line,
        lineIndex: idx
      });
      return;
    }

    // 序号待办：1. 八段锦... (当不在时间小节下时，作为待办)
    const numMatch = trimmed.match(/^(\d+[\.\、])\s*(.*)$/);
    if (numMatch) {
      items.push({
        type: 'todo',
        checked: false,
        text: `${numMatch[1]} ${numMatch[2]}`,
        raw: line,
        lineIndex: idx,
        isNumbered: true
      });
      return;
    }

    // 普通列表项 (在核心待办/进阶选做小节下)：- 事项
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      items.push({
        type: 'todo',
        checked: false,
        text: trimmed.replace(/^[-*]\s*/, ''),
        raw: line,
        lineIndex: idx
      });
      return;
    }

    // 其他自由文本行
    items.push({
      type: 'plain_text',
      text: trimmed,
      raw: line,
      lineIndex: idx
    });
  });

  return items;
}

// 切换清单中某项完成状态 (严格仅对真实待办项生效)
function handleTogglePlanItem(lineIndex) {
  const currentPlan = state.plans[state.currentDate] || '';
  const lines = currentPlan.split('\n');
  if (lineIndex < 0 || lineIndex >= lines.length) return;

  const line = lines[lineIndex];
  const trimmed = line.trim();
  let newLine = line;

  if (/^-\s*\[\s*\]/.test(trimmed)) {
    newLine = line.replace(/-\s*\[\s*\]/, '- [x]');
  } else if (/^-\s*\[[xX]\]/.test(trimmed)) {
    newLine = line.replace(/-\s*\[[xX]\]/, '- [ ]');
  } else if (/^\d+[\.\、]/.test(trimmed)) {
    newLine = `- [x] ${trimmed}`;
  } else if (trimmed.startsWith('- ')) {
    newLine = `- [x] ${trimmed.substring(2)}`;
  } else {
    newLine = `- [x] ${trimmed}`;
  }

  lines[lineIndex] = newLine;
  const updatedPlan = lines.join('\n');

  // 更新状态
  state.plans[state.currentDate] = updatedPlan;
  if (inputDailyPlan) {
    inputDailyPlan.value = updatedPlan;
    autoResizeTextarea(inputDailyPlan);
  }

  // 触觉轻微振动
  if (navigator.vibrate) {
    try { navigator.vibrate(15); } catch (e) {}
  }

  // 保存本地与快照
  savePlans();
  saveZhixingSnapshot('plan', updatedPlan);

  // 刷新界面渲染
  renderDailyPlanSection();

  // 异步防抖向电脑网关保存 (若处于局域网)
  clearTimeout(planBridgeSyncTimer);
  planBridgeSyncTimer = setTimeout(() => {
    syncPlanToBridge(state.currentDate, updatedPlan);
  }, 400);
}

// 异步静默将计划推送到本地电脑网关
async function syncPlanToBridge(dateStr, planText) {
  const serverInput = document.getElementById('obsidianServerUrl');
  let serverUrl = (serverInput ? serverInput.value.trim() : '') || localStorage.getItem('tm_obsidian_server');
  if (!serverUrl) {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      serverUrl = `http://${window.location.hostname}:28888`;
    } else {
      serverUrl = 'http://192.168.31.133:28888';
    }
  }
  serverUrl = serverUrl.replace(/\/+$/, '');

  try {
    const resp = await fetch(`${serverUrl}/api/plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dateStr, planText: planText })
    });
    if (resp.ok) {
      const tag = document.getElementById('planAutoSaveTag');
      if (tag) {
        tag.className = 'auto-save-tag';
        tag.textContent = '🟢 双核已存';
      }
    }
  } catch (e) {
    // 离线静默，本地 LocalStorage 依然绝对保全
  }
}

// 从电脑局域网网关拉取今日计划
async function pullPlanFromBridge(silent = false) {
  const serverInput = document.getElementById('obsidianServerUrl');
  let serverUrl = (serverInput ? serverInput.value.trim() : '') || localStorage.getItem('tm_obsidian_server');
  if (!serverUrl) {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      serverUrl = `http://${window.location.hostname}:28888`;
    } else {
      serverUrl = 'http://192.168.31.133:28888';
    }
  }
  serverUrl = serverUrl.replace(/\/+$/, '');

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const resp = await fetch(`${serverUrl}/api/plan?date=${state.currentDate}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: ctrl.signal
    });
    clearTimeout(timer);
    if (!resp.ok) throw new Error('网络返回异常');
    const data = await resp.json();
    if (data && data.success && data.planText) {
      state.plans[state.currentDate] = data.planText;
      if (inputDailyPlan) {
        inputDailyPlan.value = data.planText;
        autoResizeTextarea(inputDailyPlan);
      }
      savePlans();
      saveZhixingSnapshot('plan', data.planText);
      renderDailyPlanSection();
      if (!silent) {
        showToast('🟢 已成功拉取电脑端最新计划！');
      }
      return true;
    } else if (!silent) {
      showToast('ℹ️ 电脑端暂无今日预置计划');
    }
  } catch (e) {
    if (!silent) {
      showToast('⚠️ 未能连接到电脑同步服务，若使用云端漫游请点击【☁️ 云端拉取】');
    }
  }
  return false;
}

// 2. 第一段：今日计划 (晨起立志) 渲染
function renderDailyPlanSection() {
  if (!inputDailyPlan) return;
  const currentPlan = state.plans[state.currentDate] || '';
  inputDailyPlan.value = currentPlan;
  autoResizeTextarea(inputDailyPlan);

  const tag = document.getElementById('planAutoSaveTag');
  if (tag) {
    tag.className = 'auto-save-tag';
    tag.textContent = '🟢 实时已存';
  }

  const mode = state.planViewMode || 'checklist';
  if (btnTogglePlanView) {
    btnTogglePlanView.textContent = (mode === 'checklist') ? '✏️ 源码' : '📋 清单';
  }

  if (mode === 'raw') {
    if (planChecklistContainer) planChecklistContainer.style.display = 'none';
    inputDailyPlan.style.display = 'block';
    if (planStatsTag) planStatsTag.style.display = 'none';
    return;
  }

  // 清单模式渲染
  inputDailyPlan.style.display = 'none';
  if (!planChecklistContainer) return;
  planChecklistContainer.style.display = 'flex';

  const items = parsePlanMarkdown(currentPlan);
  const todoItems = items.filter(it => it.type === 'todo');
  const completedCount = todoItems.filter(it => it.checked).length;
  const totalCount = todoItems.length;

  if (planStatsTag) {
    if (totalCount > 0) {
      planStatsTag.style.display = 'inline-flex';
      if (completedCount === totalCount) {
        planStatsTag.style.background = 'rgba(16, 185, 129, 0.2)';
        planStatsTag.textContent = `🎉 全部完成 (${totalCount}/${totalCount})`;
      } else {
        planStatsTag.style.background = 'rgba(16, 185, 129, 0.12)';
        planStatsTag.textContent = `${completedCount}/${totalCount} 完成`;
      }
    } else {
      planStatsTag.style.display = 'none';
    }
  }

  if (items.length === 0 || (!currentPlan.trim())) {
    planChecklistContainer.innerHTML = `
      <div class="plan-empty-hint">
        🌱 今日暂无计划事项<br>
        <span style="font-size: 0.76rem; color: var(--text-light); margin-top: 4px; display: inline-block;">
          复制 Gemini 计划后点击【📋 粘贴载入】或点击【☁️ 云端拉取】
        </span>
      </div>
    `;
    return;
  }

  let html = '';
  let inBlock = false;
  let currentBlockType = '';

  items.forEach(item => {
    if (item.type === 'heading') {
      if (inBlock) { html += `</div>`; inBlock = false; }
      html += `
        <div class="plan-section-header">
          <span>${escapeHtml(item.text)}</span>
        </div>
      `;
    } else if (item.type === 'divider') {
      if (inBlock) { html += `</div>`; inBlock = false; }
      html += `<hr class="plan-divider">`;
    } else if (item.type === 'quote') {
      html += `<div class="plan-item-quote">“${escapeHtml(item.text)}”</div>`;
    } else if (item.type === 'schedule') {
      if (!inBlock || currentBlockType !== 'schedule') {
        if (inBlock) html += `</div>`;
        html += `<div class="plan-schedule-block">`;
        inBlock = true;
        currentBlockType = 'schedule';
      }
      html += `
        <div class="plan-schedule-row">
          <span class="plan-schedule-time">${escapeHtml(item.time)}</span>
          <span class="plan-schedule-content">${escapeHtml(item.desc)}</span>
        </div>
      `;
    } else if (item.type === 'schedule_text') {
      if (!inBlock || currentBlockType !== 'schedule') {
        if (inBlock) html += `</div>`;
        html += `<div class="plan-schedule-block">`;
        inBlock = true;
        currentBlockType = 'schedule';
      }
      html += `
        <div class="plan-schedule-row">
          <span class="plan-schedule-content">${escapeHtml(item.text)}</span>
        </div>
      `;
    } else if (item.type === 'todo') {
      if (!inBlock || currentBlockType !== 'todo') {
        if (inBlock) html += `</div>`;
        html += `<div class="plan-section-block">`;
        inBlock = true;
        currentBlockType = 'todo';
      }
      html += `
        <div class="plan-item-row ${item.checked ? 'completed' : ''}" onclick="handleTogglePlanItem(${item.lineIndex})">
          <label class="plan-checkbox-wrapper" onclick="event.stopPropagation(); handleTogglePlanItem(${item.lineIndex});">
            <input type="checkbox" ${item.checked ? 'checked' : ''}>
            <span class="plan-checkbox-custom"></span>
          </label>
          <span class="plan-item-text">${escapeHtml(item.text)}</span>
        </div>
      `;
    } else if (item.type === 'plain_text') {
      html += `<div class="plan-item-quote">${escapeHtml(item.text)}</div>`;
    }
  });

  if (inBlock) html += `</div>`;
  planChecklistContainer.innerHTML = html;
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

// 体重实时输入防抖处理 (支持 50.25 等任意精度，打字中绝不重写输入框或强制取整)
let weightInputTimer = null;
function handleWeightInput() {
  if (!inputDailyWeight) return;
  clearTimeout(weightInputTimer);
  weightInputTimer = setTimeout(() => {
    handleSaveWeightOnly(false);
  }, 500);
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

// ==========================================
// 📚 入口 B：修学进度游标看板渲染与高自由度增删改弹窗 (v1.9.0)
// ==========================================
let learningCursorsBound = false;
let editingCourseIdInModal = null;

function openCourseEditModal(courseId = null) {
  const modal = document.getElementById('courseEditModal');
  const titleEl = document.getElementById('courseModalTitle');
  const iconInp = document.getElementById('editCourseIcon');
  const nameInp = document.getElementById('editCourseName');
  const stagesListEl = document.getElementById('courseStagesConfigList');
  const delBtn = document.getElementById('btnDeleteCourseInModal');
  if (!modal || !stagesListEl) return;

  const existing = courseId ? LearningCursorManager.getData().courses.find(c => c.id === courseId) : null;
  editingCourseIdInModal = existing ? existing.id : null;

  if (existing) {
    titleEl.textContent = `✏️ 编辑课程《${existing.name}》`;
    if (iconInp) iconInp.value = existing.icon || '📘';
    if (nameInp) nameInp.value = existing.name || '';
    if (delBtn) delBtn.style.display = 'block';
  } else {
    titleEl.textContent = '📚 新增修学课程';
    if (iconInp) iconInp.value = '📘';
    if (nameInp) nameInp.value = '';
    if (delBtn) delBtn.style.display = 'none';
  }

  stagesListEl.innerHTML = LEARNING_STAGES.map(st => {
    const stObj = (existing && existing.stages && existing.stages[st.key])
      ? existing.stages[st.key]
      : { cur: 0, total: st.key === 'video' ? 30 : (st.key === 'note' ? 12 : (st.key === 'recite' ? 100 : 10)), unit: st.defaultUnit, enabled: st.key !== 'share' };

    return `
      <div class="course-stage-cfg-row" data-stage="${st.key}">
        <label class="course-stage-cfg-toggle">
          <input type="checkbox" class="cfg-st-enabled" ${stObj.enabled ? 'checked' : ''}>
          <span>${st.icon} ${st.label}</span>
        </label>
        <div class="course-stage-cfg-inputs">
          <div class="cfg-num-group">
            <span>当前</span>
            <input type="number" class="text-input cfg-st-cur" value="${stObj.cur}" min="0">
          </div>
          <span style="color:var(--text-light);">/</span>
          <div class="cfg-num-group">
            <span>共</span>
            <input type="number" class="text-input cfg-st-total" value="${stObj.total}" min="1">
          </div>
          <input type="text" class="text-input cfg-st-unit" value="${escapeHtml(stObj.unit || st.defaultUnit)}" maxlength="3" placeholder="单位" title="如：集/篇/张/次">
        </div>
      </div>
    `;
  }).join('');

  modal.classList.add('open');
  if (!existing && nameInp) {
    setTimeout(() => nameInp.focus(), 100);
  }
}

function closeCourseEditModal() {
  const modal = document.getElementById('courseEditModal');
  if (modal) modal.classList.remove('open');
  editingCourseIdInModal = null;
}

function bindLearningCursorsControls() {
  if (learningCursorsBound) return;
  learningCursorsBound = true;

  const btnAdd = document.getElementById('btnToggleAddCourse');
  const btnArchived = document.getElementById('btnToggleArchivedCourses');
  const archivedBox = document.getElementById('archivedCoursesContainer');

  if (btnAdd) {
    btnAdd.addEventListener('click', () => openCourseEditModal(null));
  }
  if (btnArchived && archivedBox) {
    btnArchived.addEventListener('click', () => {
      const isHidden = archivedBox.style.display === 'none';
      archivedBox.style.display = isHidden ? 'block' : 'none';
      btnArchived.textContent = isHidden ? '📦 收起归档' : '📦 归档库';
    });
  }

  const courseModal = document.getElementById('courseEditModal');
  const closeBtn = document.getElementById('courseModalCloseBtn');
  const saveBtn = document.getElementById('btnSaveCourseInModal');
  const delBtn = document.getElementById('btnDeleteCourseInModal');

  if (closeBtn) closeBtn.addEventListener('click', closeCourseEditModal);
  if (courseModal) {
    courseModal.addEventListener('click', (e) => {
      if (e.target === courseModal) closeCourseEditModal();
    });
  }
  if (delBtn) {
    delBtn.addEventListener('click', () => {
      if (!editingCourseIdInModal) return;
      const c = LearningCursorManager.getData().courses.find(x => x.id === editingCourseIdInModal);
      if (c && confirm(`确定永久删除修学课程《${c.name}》吗？`)) {
        LearningCursorManager.deleteCourse(c.id);
        closeCourseEditModal();
        renderLearningCursorsSection();
        showToast(`🗑️ 已删除课程《${c.name}》`);
      }
    });
  }
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const nameInp = document.getElementById('editCourseName');
      const iconInp = document.getElementById('editCourseIcon');
      const name = nameInp ? nameInp.value.trim() : '';
      if (!name) {
        alert('请输入课程名称！');
        if (nameInp) nameInp.focus();
        return;
      }
      const stages = {};
      document.querySelectorAll('#courseStagesConfigList .course-stage-cfg-row').forEach(row => {
        const key = row.dataset.stage;
        const enabled = row.querySelector('.cfg-st-enabled').checked;
        const cur = Math.max(0, parseInt(row.querySelector('.cfg-st-cur').value, 10) || 0);
        const total = Math.max(1, parseInt(row.querySelector('.cfg-st-total').value, 10) || 1);
        const unit = row.querySelector('.cfg-st-unit').value.trim() || '集';
        stages[key] = { cur: Math.min(cur, total), total, unit, enabled };
      });

      const isEdit = !!editingCourseIdInModal;
      LearningCursorManager.saveOrUpdateCourse({
        id: editingCourseIdInModal || ('course_' + Date.now().toString(36)),
        name,
        icon: (iconInp && iconInp.value.trim()) ? iconInp.value.trim() : '📘',
        archived: false,
        stages
      });
      closeCourseEditModal();
      renderLearningCursorsSection();
      showToast(isEdit ? `✅ 已更新《${name}》` : `📚 已新增修学课程《${name}》`);
    });
  }
}

function renderLearningCursorsSection() {
  bindLearningCursorsControls();
  const container = document.getElementById('learningCursorsContainer');
  const archivedBox = document.getElementById('archivedCoursesContainer');
  const badge = document.getElementById('learningCursorsBadge');
  if (!container) return;

  const activeCourses = LearningCursorManager.getActiveCourses();
  const archivedCourses = LearningCursorManager.getArchivedCourses();
  const dStr = state ? state.currentDate : getTodayString();

  if (badge) {
    badge.textContent = `在学 ${activeCourses.length} 门`;
  }

  if (activeCourses.length === 0) {
    container.innerHTML = `<div style="font-size:0.78rem;color:var(--text-muted);padding:14px 6px;text-align:center;">暂无在学课程，点击右上角【+ 新增课程】建立你的四阶段进度游标！</div>`;
  } else {
    container.innerHTML = activeCourses.map(course => {
      const enabledStages = LEARNING_STAGES.filter(st => course.stages[st.key]?.enabled !== false);
      const stagesHtml = enabledStages.map(st => {
        const stObj = course.stages[st.key] || { cur: 0, total: 30, unit: st.defaultUnit };
        const curVal = Number(stObj.cur || 0);
        const total = Math.max(1, Number(stObj.total) || 1);
        const unit = stObj.unit || st.defaultUnit;
        const pct = Math.min(100, Math.round((curVal / total) * 100));
        const todayDelta = LearningCursorManager.getTodayDeltaForCourseStage(dStr, course.id, st.key);
        const deltaBadge = todayDelta > 0 ? `<span class="cursor-today-delta">今日+${todayDelta}</span>` : '';

        return `
          <div class="cursor-stage-block">
            <div class="cursor-stage-top">
              <div class="cursor-stage-label">
                <span>${st.icon} ${st.label}</span>
                ${deltaBadge}
              </div>
              <button type="button" class="cursor-val-pill" data-cid="${course.id}" data-stage="${st.key}" title="点击直接输入进度">
                <b>${curVal}</b> / ${total} ${escapeHtml(unit)}
              </button>
            </div>
            <div class="cursor-stage-bottom">
              <div class="cursor-progress-track">
                <div class="cursor-progress-fill" style="width: ${pct}%; background-color: ${st.color};"></div>
              </div>
              <div class="cursor-stage-ctrl">
                <button type="button" class="cursor-step-btn btn-cursor-dec" data-cid="${course.id}" data-stage="${st.key}" title="回退 1">−</button>
                <button type="button" class="cursor-step-btn btn-cursor-inc" data-cid="${course.id}" data-stage="${st.key}" title="推进 +1">+1</button>
              </div>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="learning-course-card">
          <div class="learning-course-header">
            <div class="learning-course-title">
              <span>${course.icon || '📘'} ${escapeHtml(course.name)}</span>
            </div>
            <div class="learning-course-actions">
              <button type="button" class="zhixing-tool-btn btn-course-edit" data-cid="${course.id}" title="修改课程、各阶段总数与单位">✏️ 编辑</button>
              <button type="button" class="zhixing-tool-btn btn-course-archive" data-cid="${course.id}" title="已学完归档">📦 归档</button>
              <button type="button" class="zhixing-tool-btn btn-course-del-active" data-cid="${course.id}" style="color:#EF4444;" title="删除课程">🗑️</button>
            </div>
          </div>
          <div class="learning-stages-list">
            ${stagesHtml || '<div style="font-size:0.75rem;color:var(--text-light);">未启用任何阶段，点击右上角 ✏️ 编辑开启</div>'}
          </div>
        </div>
      `;
    }).join('');
  }

  // 绑定步进、直接设值、编辑、归档与删除事件
  container.querySelectorAll('.btn-cursor-inc').forEach(btn => {
    btn.addEventListener('click', () => {
      const res = LearningCursorManager.advanceStage(btn.dataset.cid, btn.dataset.stage, 1, false, dStr);
      if (res) {
        if (navigator.vibrate) navigator.vibrate(25);
        renderLearningCursorsSection();
        const stMeta = LEARNING_STAGES.find(s => s.key === btn.dataset.stage);
        showToast(`📚 《${res.course.name}》${stMeta.label} 推进至 ${res.nextVal}/${res.stageObj.total}${res.stageObj.unit}`);
      }
    });
  });

  container.querySelectorAll('.btn-cursor-dec').forEach(btn => {
    btn.addEventListener('click', () => {
      const res = LearningCursorManager.advanceStage(btn.dataset.cid, btn.dataset.stage, -1, false, dStr);
      if (res) renderLearningCursorsSection();
    });
  });

  container.querySelectorAll('.cursor-val-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      const cid = btn.dataset.cid;
      const stage = btn.dataset.stage;
      const c = LearningCursorManager.getData().courses.find(x => x.id === cid);
      if (!c) return;
      const stObj = c.stages[stage];
      const stMeta = LEARNING_STAGES.find(s => s.key === stage);
      const input = prompt(`设定《${c.name}》${stMeta.label}当前进度 (0 ~ ${stObj.total}${stObj.unit})：`, stObj.cur || 0);
      if (input !== null && input.trim() !== '') {
        const num = parseInt(input.trim(), 10);
        if (!isNaN(num)) {
          LearningCursorManager.advanceStage(cid, stage, num, true, dStr);
          renderLearningCursorsSection();
        }
      }
    });
  });

  container.querySelectorAll('.btn-course-edit').forEach(btn => {
    btn.addEventListener('click', () => openCourseEditModal(btn.dataset.cid));
  });

  container.querySelectorAll('.btn-course-archive').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = LearningCursorManager.getData().courses.find(x => x.id === btn.dataset.cid);
      if (!c) return;
      if (confirm(`确定将《${c.name}》移入归档库吗？（已学完或暂时搁置，随时可恢复）`)) {
        LearningCursorManager.updateCourse(c.id, { archived: true });
        renderLearningCursorsSection();
        showToast(`📦 《${c.name}》已归档`);
      }
    });
  });

  container.querySelectorAll('.btn-course-del-active').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = LearningCursorManager.getData().courses.find(x => x.id === btn.dataset.cid);
      if (!c) return;
      if (confirm(`确定删除课程《${c.name}》吗？`)) {
        LearningCursorManager.deleteCourse(c.id);
        renderLearningCursorsSection();
        showToast(`🗑️ 已删除课程《${c.name}》`);
      }
    });
  });

  // 渲染已归档课程
  if (archivedBox) {
    if (archivedCourses.length === 0) {
      archivedBox.innerHTML = `<div style="font-size:0.74rem;color:var(--text-light);text-align:center;">归档库暂无课程</div>`;
    } else {
      archivedBox.innerHTML = `
        <div style="font-size:0.75rem;font-weight:700;color:var(--text-muted);margin-bottom:6px;">📦 已归档修学课程 (${archivedCourses.length})</div>
        ${archivedCourses.map(ac => `
          <div class="archived-course-row">
            <span>${ac.icon || '📘'} <b>${escapeHtml(ac.name)}</b></span>
            <div style="display:flex;gap:6px;">
              <button type="button" class="zhixing-tool-btn btn-course-restore" data-cid="${ac.id}">↩️ 恢复</button>
              <button type="button" class="zhixing-tool-btn btn-course-del" data-cid="${ac.id}" style="color:#EF4444;">🗑️</button>
            </div>
          </div>
        `).join('')}
      `;
      archivedBox.querySelectorAll('.btn-course-restore').forEach(btn => {
        btn.addEventListener('click', () => {
          LearningCursorManager.updateCourse(btn.dataset.cid, { archived: false });
          renderLearningCursorsSection();
          showToast('已恢复至在学列表');
        });
      });
      archivedBox.querySelectorAll('.btn-course-del').forEach(btn => {
        btn.addEventListener('click', () => {
          if (confirm('彻底删除该归档课程吗？')) {
            LearningCursorManager.deleteCourse(btn.dataset.cid);
            renderLearningCursorsSection();
            showToast('已彻底删除');
          }
        });
      });
    }
  }
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

  const buildItemHtml = (h, type, idx, total) => `
    <div class="habit-manage-item">
      <div class="habit-manage-info" style="flex:1;min-width:0;">
        <span class="habit-manage-name">${escapeHtml(h.name)}</span>
        ${h.desc ? `<span class="habit-manage-desc">${escapeHtml(h.desc)}</span>` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
        <button type="button" class="cat-move-btn btn-move-habit" data-type="${type}" data-idx="${idx}" data-dir="-1" ${idx === 0 ? 'disabled' : ''} title="上移">↑</button>
        <button type="button" class="cat-move-btn btn-move-habit" data-type="${type}" data-idx="${idx}" data-dir="1" ${idx === total - 1 ? 'disabled' : ''} title="下移">↓</button>
        <button type="button" class="zhixing-tool-btn btn-edit-habit" data-id="${h.id}" title="编辑名称与描述" style="padding:4px 8px;">✏️</button>
        <button type="button" class="btn-delete-habit" data-id="${h.id}" title="删除该微步" style="padding:4px 8px;">🗑️</button>
      </div>
    </div>
  `;

  // 🟢 保底线列表
  html += `<div style="font-size: 0.8rem; font-weight: 700; color: #047857; margin-bottom: 4px;">🟢 保底线（基础步，做完即全天成功）</div>`;
  if (cfg.baseline.length === 0) {
    html += `<div style="font-size: 0.75rem; color: var(--text-muted); margin-bottom: 8px;">暂无保底步</div>`;
  } else {
    cfg.baseline.forEach((h, i) => { html += buildItemHtml(h, 'baseline', i, cfg.baseline.length); });
  }

  // 🟡 进阶项列表
  html += `<div style="font-size: 0.8rem; font-weight: 700; color: #B45309; margin-top: 10px; margin-bottom: 4px;">🟡 进阶项（加分步，根据精力选做）</div>`;
  if (cfg.advanced.length === 0) {
    html += `<div style="font-size: 0.75rem; color: var(--text-muted);">暂无进阶步</div>`;
  } else {
    cfg.advanced.forEach((h, i) => { html += buildItemHtml(h, 'advanced', i, cfg.advanced.length); });
  }

  container.innerHTML = html;

  // 绑定排序按钮
  container.querySelectorAll('.btn-move-habit').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const idx = parseInt(btn.dataset.idx, 10);
      const dir = parseInt(btn.dataset.dir, 10);
      const list = type === 'advanced' ? cfg.advanced : cfg.baseline;
      const targetIdx = idx + dir;
      if (targetIdx < 0 || targetIdx >= list.length) return;
      const tmp = list[idx];
      list[idx] = list[targetIdx];
      list[targetIdx] = tmp;
      HabitManager.saveConfig(cfg);
      renderHabitsManageList();
      renderHabitsSection();
    });
  });

  // 绑定编辑按钮
  container.querySelectorAll('.btn-edit-habit').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const item = cfg.baseline.find(x => x.id === id) || cfg.advanced.find(x => x.id === id);
      if (!item) return;
      const newName = prompt('修改打卡项名称：', item.name);
      if (newName === null || !newName.trim()) return;
      const newDesc = prompt('修改简要说明（留空表示不显示说明）：', item.desc || '');
      if (newDesc === null) return;
      HabitManager.updateHabit(id, { name: newName.trim(), desc: newDesc.trim() });
      renderHabitsManageList();
      renderHabitsSection();
      showToast(`✅ 已更新「${newName.trim()}」`);
    });
  });

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
    // 智能保真：如果 plan 已经包含了 Markdown 小节标题 (###)、任务框 (- [ ] / - [x])、分割线 (---) 或时间表 (- **HH:MM)
    if (plan.includes('###') || plan.includes('- [') || plan.includes('**｜') || plan.includes('**|') || plan.includes('---')) {
      sections.push(plan);
    } else {
      const lines = plan.split('\n').map(l => l.trim()).filter(Boolean);
      lines.forEach((l, idx) => {
        const clean = l.replace(/^(?:-\s*\[[ x]\]\s*)?(?:\d+[\.\、]\s*)?/, '').trim();
        sections.push(`- [ ] ${idx + 1}. ${clean}`);
      });
    }
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

  // 📚 今日修学游标推进汇总
  const lcData = LearningCursorManager.getData();
  const todayCursorLogs = (lcData.dailyLogs || {})[dateStr] || [];
  if (todayCursorLogs.length > 0) {
    sections.push('### 📚 今日修学游标推进');
    const summaryMap = new Map();
    todayCursorLogs.forEach(l => {
      const key = `${l.courseId}__${l.stage}`;
      if (!summaryMap.has(key)) {
        summaryMap.set(key, { ...l });
      } else {
        const cur = summaryMap.get(key);
        cur.toVal = l.toVal;
        cur.delta += l.delta;
      }
    });
    summaryMap.forEach(item => {
      if (item.delta === 0) return;
      const stMeta = LEARNING_STAGES.find(s => s.key === item.stage) || { icon: '📖', label: item.stage };
      const sign = item.delta > 0 ? `+${item.delta}` : `${item.delta}`;
      sections.push(`- **《${item.courseName}》** ${stMeta.icon} ${stMeta.label}：第 ${item.fromVal} → **${item.toVal}/${item.total}**${item.unit || '集'} (${sign})`);
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
      weightVal = Math.round(parsed * 100) / 100;
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
// 🛡️ 多设备防炸缸·智能增量合并引擎 (Conflict-Free State Merger v1.5.0)
// ==========================================
const StateMerger = {
  // 0. 合并分类元数据（尊重用户自定义排序，并集合并云端新增分类）
  mergeCategories(local, cloud) {
    const baseList = (Array.isArray(local) && local.length > 0)
      ? [...local]
      : (Array.isArray(cloud) && cloud.length > 0 ? [...cloud] : [...DEFAULT_CATEGORIES]);
    const idMap = new Map();
    baseList.forEach(c => { if (c && c.id) idMap.set(c.id, c); });

    if (Array.isArray(cloud)) {
      cloud.forEach(c => {
        if (c && c.id && !idMap.has(c.id)) {
          idMap.set(c.id, c);
          baseList.push(c);
        }
      });
    }
    if (Array.isArray(DEFAULT_CATEGORIES)) {
      DEFAULT_CATEGORIES.forEach(c => {
        if (c && c.id && !idMap.has(c.id)) {
          idMap.set(c.id, c);
          baseList.push(c);
        }
      });
    }
    return baseList;
  },

  // 1. 合并时间记录（按日期和独有 ID 取并集，按开始时间排序，绝不冲掉任何一台设备的记录）
  mergeRecords(local, cloud) {
    const res = Object.assign({}, cloud || {});
    const lObj = local || {};
    for (const d of Object.keys(lObj)) {
      if (!res[d]) {
        res[d] = lObj[d];
      } else {
        const cList = Array.isArray(res[d]) ? res[d] : [];
        const lList = Array.isArray(lObj[d]) ? lObj[d] : [];
        // 如果云端已有真实记录，坚决过滤掉本地由系统预置的示例假数据 (s1~s11)
        const hasRealCloudRecords = cList.some(r => r && r.id && !/^s\d+$/.test(r.id));
        const filteredLocal = hasRealCloudRecords 
          ? lList.filter(r => r && r.id && !/^s\d+$/.test(r.id))
          : lList;
        const map = new Map();
        cList.forEach(r => { if (r && r.id) map.set(r.id, r); });
        filteredLocal.forEach(r => {
          if (r && r.id) {
            if (!map.has(r.id)) {
              map.set(r.id, r);
            } else {
              const existing = map.get(r.id);
              if ((r.note || '').length > (existing.note || '').length) {
                map.set(r.id, r);
              }
            }
          }
        });
        const mergedList = Array.from(map.values());
        mergedList.sort((a, b) => (a.start || '').localeCompare(b.start || ''));
        res[d] = mergedList;
      }
    }
    return res;
  },

  // 2. 合并晨起计划与反思（互补合并，类型防御防崩溃）
  mergeTexts(local, cloud) {
    const toText = (v) => {
      if (!v) return '';
      if (typeof v === 'string') return v.trim();
      if (typeof v === 'object') {
        const parts = [];
        if (v.praise) parts.push(`【专注投入】${v.praise}`);
        if (v.wasted) parts.push(`【时间黑洞】${v.wasted}`);
        if (v.action) parts.push(`【明日调适】${v.action}`);
        return parts.length > 0 ? parts.join('\n') : '';
      }
      return String(v).trim();
    };
    const res = Object.assign({}, cloud || {});
    const lObj = local || {};
    for (const d of Object.keys(lObj)) {
      const lText = toText(lObj[d]);
      const cText = toText(res[d]);
      if (!cText) {
        res[d] = lText;
      } else if (!lText) {
        res[d] = cText;
      } else if (lText === cText) {
        res[d] = cText;
      } else if (cText.includes(lText)) {
        res[d] = cText;
      } else if (lText.includes(cText)) {
        res[d] = lText;
      } else {
        res[d] = cText + '\n' + lText;
      }
    }
    return res;
  },

  // 3. 合并微步打卡（逻辑或合并，任一设备打了勾即算打勾）
  mergeHabits(local, cloud) {
    const res = Object.assign({}, cloud || {});
    const lObj = local || {};
    for (const d of Object.keys(lObj)) {
      if (!res[d]) {
        res[d] = lObj[d];
      } else {
        const lDay = lObj[d] || {};
        const cDay = res[d] || {};
        const mergedDay = Object.assign({}, cDay);
        for (const k of Object.keys(lDay)) {
          mergedDay[k] = Boolean(cDay[k] || lDay[k]);
        }
        res[d] = mergedDay;
      }
    }
    return res;
  },

  // 4. 合并体重记录
  mergeWeights(local, cloud) {
    const res = Object.assign({}, cloud || {});
    const lObj = local || {};
    for (const d of Object.keys(lObj)) {
      if (!res[d] && lObj[d]) res[d] = lObj[d];
    }
    return res;
  },

  // 5. 合并身心状态
  mergeBodyState(local, cloud) {
    const res = Object.assign({}, cloud || {});
    const lObj = local || {};
    for (const d of Object.keys(lObj)) {
      if (!res[d]) {
        res[d] = lObj[d];
      } else {
        const lDay = lObj[d] || {};
        const cDay = res[d] || {};
        res[d] = {
          energy: lDay.energy || cDay.energy,
          bodyPose: lDay.bodyPose || cDay.bodyPose,
          leftNose: Boolean(cDay.leftNose || lDay.leftNose),
          rightNose: Boolean(cDay.rightNose || lDay.rightNose),
          stressSpeed: lDay.stressSpeed || cDay.stressSpeed,
          calmSpeed: lDay.calmSpeed || cDay.calmSpeed,
          bodySymptomNotes: (cDay.bodySymptomNotes || lDay.bodySymptomNotes || ''),
          stressDetailNotes: (cDay.stressDetailNotes || lDay.stressDetailNotes || '')
        };
      }
    }
    return res;
  },

  // 6. 合并连赢6次胜者试验场（按ID取最高胜次与全部打卡流水）
  mergeWinnerTrials(local, cloud) {
    if (!cloud || !Array.isArray(cloud.activeTrials)) return local;
    if (!local || !Array.isArray(local.activeTrials)) return cloud;
    const map = new Map();
    (cloud.activeTrials || []).forEach(t => { if (t && t.id) map.set(t.id, t); });
    (local.activeTrials || []).forEach(lt => {
      if (!lt || !lt.id) return;
      if (!map.has(lt.id)) {
        map.set(lt.id, lt);
      } else {
        const ct = map.get(lt.id);
        const mergedWins = Math.max(ct.currentWins || 0, lt.currentWins || 0);
        const histMap = new Map();
        (ct.history || []).forEach(h => histMap.set(h.timestamp || h.date, h));
        (lt.history || []).forEach(h => histMap.set(h.timestamp || h.date, h));
        ct.currentWins = mergedWins;
        ct.history = Array.from(histMap.values());
        map.set(lt.id, ct);
      }
    });
    const gradMap = new Map();
    (cloud.graduatedTrials || []).forEach(t => { if (t && t.id) gradMap.set(t.id, t); });
    (local.graduatedTrials || []).forEach(t => { if (t && t.id) gradMap.set(t.id, t); });
    return {
      version: 1,
      activeTrials: Array.from(map.values()),
      graduatedTrials: Array.from(gradMap.values())
    };
  },

  // 7. 合并修学进度游标（按课程ID合并，取较新updatedAt与较高进度，并集每日增量日志）
  mergeLearningCursors(local, cloud) {
    if (!cloud || !Array.isArray(cloud.courses)) return local;
    if (!local || !Array.isArray(local.courses)) return cloud;
    const map = new Map();
    cloud.courses.forEach(c => { if (c && c.id) map.set(c.id, LearningCursorManager.normalizeCourse(c)); });
    local.courses.forEach(lcRaw => {
      if (!lcRaw || !lcRaw.id) return;
      const lc = LearningCursorManager.normalizeCourse(lcRaw);
      if (!map.has(lc.id)) {
        map.set(lc.id, lc);
      } else {
        const cc = map.get(lc.id);
        const lTime = new Date(lc.updatedAt || 0).getTime();
        const cTime = new Date(cc.updatedAt || 0).getTime();
        const winner = lTime >= cTime ? lc : cc;
        const other = lTime >= cTime ? cc : lc;
        const mergedStages = {};
        LEARNING_STAGES.forEach(st => {
          const wSt = winner.stages[st.key];
          const oSt = other.stages[st.key];
          mergedStages[st.key] = {
            ...wSt,
            cur: Math.max(Number(wSt.cur || 0), Number(oSt.cur || 0))
          };
        });
        map.set(lc.id, { ...winner, stages: mergedStages });
      }
    });
    const mergedLogs = Object.assign({}, cloud.dailyLogs || {});
    for (const d of Object.keys(local.dailyLogs || {})) {
      if (!mergedLogs[d]) {
        mergedLogs[d] = local.dailyLogs[d];
      } else {
        const tsSet = new Set(mergedLogs[d].map(x => x.timestamp));
        (local.dailyLogs[d] || []).forEach(x => {
          if (!tsSet.has(x.timestamp)) mergedLogs[d].push(x);
        });
      }
    }
    return { version: 1, courses: Array.from(map.values()), dailyLogs: mergedLogs };
  },

  // 全量合并总线入口
  mergeAll(localState, cloudState) {
    if (!cloudState) return localState;
    if (!localState) return cloudState;
    return {
      categories: this.mergeCategories(localState.categories, cloudState.categories),
      records: this.mergeRecords(localState.records, cloudState.records),
      plans: this.mergeTexts(localState.plans, cloudState.plans),
      reflections: this.mergeTexts(localState.reflections, cloudState.reflections),
      habits: this.mergeHabits(localState.habits, cloudState.habits),
      weights: this.mergeWeights(localState.weights, cloudState.weights),
      bodyState: this.mergeBodyState(localState.bodyState, cloudState.bodyState),
      winnerTrials: this.mergeWinnerTrials(localState.winnerTrials, cloudState.winnerTrials),
      habitsConfig: cloudState.habitsConfig || localState.habitsConfig,
      learningCursors: this.mergeLearningCursors(localState.learningCursors, cloudState.learningCursors)
    };
  }
};

// ==========================================
// ☁️ 谷歌云盘云桥同步引擎 (Google Drive Cloud Bridge - v1.5.0)
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
  // 1. 从谷歌云盘拉取最新全量状态并智能合并 (支持解析云端独立《今日计划.md》与漫游合并)
  async pullFromCloud(targetDate) {
    const url = this.getUrl();
    if (!url) return null;
    const queryDate = targetDate || (state ? state.currentDate : getTodayString());
    try {
      const resp = await fetch(`${url}?action=pull&date=${encodeURIComponent(queryDate)}`, { method: 'GET', mode: 'cors' });
      if (!resp.ok) return null;
      const data = await resp.json();
      if (!data) return null;

      let merged = null;
      if (data.state) {
        const localState = {
          categories: StorageAdapter.load('categories', DEFAULT_CATEGORIES),
          records: StorageAdapter.load('records', {}),
          plans: StorageAdapter.load('plans', {}),
          reflections: StorageAdapter.load('reflections', {}),
          habits: StorageAdapter.load('habits', {}),
          weights: StorageAdapter.load('weights', {}),
          bodyState: StorageAdapter.load('body_state', {}),
          winnerTrials: WinnerTrialManager.getData(),
          habitsConfig: HabitManager.getConfig(),
          learningCursors: LearningCursorManager.getData()
        };
        merged = StateMerger.mergeAll(localState, data.state);
        // 自动净化本地可能混入的系统示例假数据 (s1~s11)
        if (merged.records) {
          for (const d of Object.keys(merged.records)) {
            const list = merged.records[d];
            if (Array.isArray(list)) {
              const hasReal = list.some(r => r && r.id && !/^s\d+$/.test(r.id));
              if (hasReal) {
                merged.records[d] = list.filter(r => r && r.id && !/^s\d+$/.test(r.id));
              }
            }
          }
        }
        if (merged.categories) {
          StorageAdapter.save('categories', merged.categories);
          state.categories = merged.categories;
          if (typeof renderCategoryPills === 'function') renderCategoryPills();
        }
        if (merged.records) { StorageAdapter.save('records', merged.records); state.records = merged.records; }
        if (merged.plans) { StorageAdapter.save('plans', merged.plans); state.plans = merged.plans; }
        if (merged.reflections) { StorageAdapter.save('reflections', merged.reflections); state.reflections = merged.reflections; }
        if (merged.habits) { StorageAdapter.save('habits', merged.habits); state.habits = merged.habits; }
        if (merged.weights) { StorageAdapter.save('weights', merged.weights); state.weights = merged.weights; }
        if (merged.bodyState) { StorageAdapter.save('body_state', merged.bodyState); state.bodyState = merged.bodyState; }
        if (merged.winnerTrials) StorageAdapter.save('winner_trials', merged.winnerTrials);
        if (merged.habitsConfig) StorageAdapter.save('habits_config', merged.habitsConfig);
        if (merged.learningCursors) StorageAdapter.save('learning_cursors', merged.learningCursors);
      }

      // ❄️ 暂时冷冻云端《今日计划》自动拉取注入功能，保留代码备未来开启
      const FREEZE_CLOUD_PLAN_PULL = true;
      const rawCloudPlan = !FREEZE_CLOUD_PLAN_PULL ? (data.planMarkdown || data.todayPlan || data.todayPlanMarkdown || data.todayPlanContent || (typeof data.plan === 'string' ? data.plan : null)) : null;
      if (rawCloudPlan && typeof rawCloudPlan === 'string' && rawCloudPlan.trim()) {
        const cleanPlan = rawCloudPlan.trim();
        // 🛡️ 防御层：如果文本被意外污染为 PDF 二进制流，自动拦截防乱码
        if (cleanPlan.startsWith('%PDF-') || cleanPlan.includes('/Producer (Skia/PDF')) {
          console.warn('⚠️ 云端文件被误转为 PDF 字节流，已自动拦截防乱码');
        } else {
          state.plans[queryDate] = cleanPlan;
          StorageAdapter.save('plans', state.plans);
          if (inputDailyPlan && queryDate === state.currentDate) {
            inputDailyPlan.value = cleanPlan;
            autoResizeTextarea(inputDailyPlan);
          }
          if (!merged) {
            merged = { plans: state.plans };
          } else {
            merged.plans = state.plans;
          }
          console.log(`☁️ 成功从云端提取并注入《今日计划.md》(${queryDate})`);
        }
      }

      return merged || data;
    } catch (e) {
      console.warn('云端拉取同步失败(可能处于离线状态):', e);
    }
    return null;
  },
  // 2. 将当前全部数据智能合并后推送至谷歌云盘 (防炸缸核心：先并集后落盘)
  async pushToCloud(dateStr) {
    // 🛡️ 空库防呆熔断：如果本地账本没有任何记录，严禁盲目向云端推送，防止冲刷历史
    const allLocalRecords = StorageAdapter.load('records', {});
    const hasAnyLocalRecords = Object.values(allLocalRecords).some(list => Array.isArray(list) && list.length > 0);
    if (!hasAnyLocalRecords) {
      showToast('🛡️ 安全拦截：当前设备暂无本地数据，请先点击【从云端拉取】！');
      return { success: false, message: '当前设备无本地数据，已自动熔断拦截' };
    }
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
        state.weights[dStr] = Math.round(parsed * 100) / 100;
        saveWeights();
      }
    }
    if (dStr === state.currentDate) {
      if (!state.bodyState[dStr]) state.bodyState[dStr] = {};
      if (inputBodySymptomNotes) state.bodyState[dStr].bodySymptomNotes = inputBodySymptomNotes.value.trim();
      if (inputStressDetailNotes) state.bodyState[dStr].stressDetailNotes = inputStressDetailNotes.value.trim();
      saveBodyState();
    }

    let localState = {
      categories: StorageAdapter.load('categories', DEFAULT_CATEGORIES),
      records: StorageAdapter.load('records', {}),
      plans: StorageAdapter.load('plans', {}),
      reflections: StorageAdapter.load('reflections', {}),
      habits: StorageAdapter.load('habits', {}),
      weights: StorageAdapter.load('weights', {}),
      bodyState: StorageAdapter.load('body_state', {}),
      winnerTrials: WinnerTrialManager.getData(),
      habitsConfig: HabitManager.getConfig()
    };

    // 推送前与云端并集 (带 4 秒超时熔断保护，防止 VPN 慢速代理下双重串行等待导致卡顿半分钟)
    try {
      const pullCtrl = new AbortController();
      const pullTimer = setTimeout(() => pullCtrl.abort(), 4000);
      const pullResp = await fetch(`${url}?action=pull`, { method: 'GET', mode: 'cors', signal: pullCtrl.signal });
      clearTimeout(pullTimer);
      if (pullResp.ok) {
        const pullData = await pullResp.json();
        if (pullData && pullData.state) {
          localState = StateMerger.mergeAll(localState, pullData.state);
          if (localState.categories) {
            StorageAdapter.save('categories', localState.categories);
            state.categories = localState.categories;
            if (typeof renderCategoryPills === 'function') renderCategoryPills();
          }
          if (localState.records) { StorageAdapter.save('records', localState.records); state.records = localState.records; }
          if (localState.plans) { StorageAdapter.save('plans', localState.plans); state.plans = localState.plans; }
          if (localState.reflections) { StorageAdapter.save('reflections', localState.reflections); state.reflections = localState.reflections; }
          if (localState.habits) { StorageAdapter.save('habits', localState.habits); state.habits = localState.habits; }
          if (localState.weights) { StorageAdapter.save('weights', localState.weights); state.weights = localState.weights; }
          if (localState.bodyState) { StorageAdapter.save('body_state', localState.bodyState); state.bodyState = localState.bodyState; }
          if (localState.winnerTrials) StorageAdapter.save('winner_trials', localState.winnerTrials);
          if (localState.habitsConfig) StorageAdapter.save('habits_config', localState.habitsConfig);
        }
      }
    } catch (pullErr) {
      console.warn('推送前快速拉取合并已超时或跳过，直接基于本地最新状态打包推送:', pullErr);
    }

    const payload = {
      action: 'push',
      date: dStr,
      updatedAt: new Date().toISOString(),
      state: localState,
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

let isCloudPulling = false;
async function handleCloudPull() {
  if (isCloudPulling) {
    showToast('⏳ 正在同步拉取中，请勿重复点击');
    return;
  }
  const url = CloudSyncAdapter.getUrl();
  if (!url) {
    showToast('💡 请先配置谷歌云桥 URL');
    openCloudBridgeModal();
    return;
  }
  const btn = document.getElementById('btn-cloud-pull');
  const oldText = btn ? btn.innerHTML : '';
  isCloudPulling = true;
  if (btn) {
    btn.innerHTML = '<span>🔄</span><span>正在拉取...</span>';
    btn.style.opacity = '0.7';
    btn.style.pointerEvents = 'none';
  }
  showToast('🔄 正在从谷歌云盘拉取最新漫游数据...');
  try {
    const cloudState = await CloudSyncAdapter.pullFromCloud();
    if (cloudState) {
      renderDailyPlanSection();
      renderDailyReflectionSection();
      renderDailyWeightSection();
      renderHabitsSection();
      renderWinnerTrials();
      renderBodyStateSection();
      if (typeof renderCategoryPills === 'function') renderCategoryPills();
      updateUI();
      showToast('✅ 已成功从谷歌云盘拉取并合并！');
    } else {
      showToast('⚠️ 未能获取到云端状态或网络未连接');
    }
  } catch (err) {
    showToast('❌ 拉取失败: ' + err.message);
  } finally {
    isCloudPulling = false;
    if (btn) {
      btn.innerHTML = oldText;
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
    }
  }
}

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

let selectedShadeHex = null;
let categoryAddPanelBound = false;

function openCategoryModal() {
  renderCategoryEditList();
  refreshCategoryAddPanel();
  if (!categoryAddPanelBound) {
    categoryAddPanelBound = true;
    const parentSel = document.getElementById('newCatParentId');
    const autoBtn = document.getElementById('btnAutoPickColor');
    if (parentSel) {
      parentSel.addEventListener('change', () => updateCategoryColorModeUI());
    }
    if (autoBtn) {
      autoBtn.addEventListener('click', () => {
        const colorInp = document.getElementById('newCatColor');
        if (colorInp) {
          colorInp.value = ColorEngine.pickDistinctPrimaryColor(colorInp.value);
        }
      });
    }
  }
  const modal = document.getElementById('categoryModal');
  if (modal) modal.classList.add('open');
}

function closeCategoryModal() {
  const modal = document.getElementById('categoryModal');
  if (modal) modal.classList.remove('open');
}

function refreshCategoryAddPanel(presetParentId = null) {
  const parentSel = document.getElementById('newCatParentId');
  if (!parentSel) return;
  const currentVal = presetParentId !== null ? presetParentId : parentSel.value;
  parentSel.innerHTML = '<option value="">📁 作为顶级一级大类</option>';
  state.categories.filter(c => !c.parentId).forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `↳ 隶属「${p.icon} ${p.name}」`;
    parentSel.appendChild(opt);
  });
  if (currentVal && state.categories.some(c => c.id === currentVal && !c.parentId)) {
    parentSel.value = currentVal;
  } else {
    parentSel.value = '';
  }
  updateCategoryColorModeUI();
}

function updateCategoryColorModeUI() {
  const parentSel = document.getElementById('newCatParentId');
  const primaryRow = document.getElementById('newCatPrimaryColorRow');
  const shadeRow = document.getElementById('newCatShadeRow');
  const shadePalette = document.getElementById('newCatShadePalette');
  const colorInp = document.getElementById('newCatColor');
  const prodInp = document.getElementById('newCatIsProductive');
  const wasteInp = document.getElementById('newCatIsWaster');

  if (!parentSel || !primaryRow || !shadeRow || !shadePalette) return;

  const parentId = parentSel.value;
  if (!parentId) {
    // 一级大类模式：自动匹配高对比不撞色颜色
    primaryRow.style.display = 'flex';
    shadeRow.style.display = 'none';
    selectedShadeHex = null;
    if (colorInp) {
      colorInp.value = ColorEngine.pickDistinctPrimaryColor();
    }
  } else {
    // 二级子类模式：隐藏自由取色，展示同母色渐变色阶矩阵，自动消掉已占用色阶
    primaryRow.style.display = 'none';
    shadeRow.style.display = 'block';
    const parent = state.categories.find(c => c.id === parentId);
    if (parent) {
      if (prodInp) prodInp.checked = !!parent.isProductive;
      if (wasteInp) wasteInp.checked = !!parent.isWaster;
    }

    const availableShades = ColorEngine.getAvailableShadesForParent(parentId);
    shadePalette.innerHTML = '';

    if (availableShades.length === 0) {
      shadePalette.innerHTML = '<span style="font-size: 0.75rem; color: #EF4444;">该分类色阶已全部用完</span>';
      selectedShadeHex = parent ? parent.color : '#3B82F6';
    } else {
      selectedShadeHex = availableShades[0];
      availableShades.forEach((hex, idx) => {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = `shade-swatch-btn ${idx === 0 ? 'selected' : ''}`;
        swatch.style.backgroundColor = hex;
        swatch.title = `选择同色系色阶 ${hex}`;
        swatch.addEventListener('click', () => {
          selectedShadeHex = hex;
          shadePalette.querySelectorAll('.shade-swatch-btn').forEach(b => b.classList.remove('selected'));
          swatch.classList.add('selected');
        });
        shadePalette.appendChild(swatch);
      });
    }
  }
}

function moveCategoryOrder(catId, direction) {
  const target = state.categories.find(c => c.id === catId);
  if (!target) return;

  if (!target.parentId) {
    // 顶级一级大类排序：提取所有一级大类调换顺序后，连同各自子类按新顺序重组
    const primaries = state.categories.filter(c => !c.parentId);
    const idx = primaries.findIndex(c => c.id === catId);
    const targetIdx = idx + direction;
    if (idx === -1 || targetIdx < 0 || targetIdx >= primaries.length) return;

    const temp = primaries[idx];
    primaries[idx] = primaries[targetIdx];
    primaries[targetIdx] = temp;

    const rebuilt = [];
    primaries.forEach(p => {
      rebuilt.push(p);
      state.categories.filter(s => s.parentId === p.id).forEach(s => rebuilt.push(s));
    });
    // 兜底保留任何孤立项
    state.categories.forEach(c => {
      if (!rebuilt.some(r => r.id === c.id)) rebuilt.push(c);
    });
    state.categories = rebuilt;
  } else {
    // 二级子类排序：只在同母类下调换顺序
    const siblings = state.categories.filter(c => c.parentId === target.parentId);
    const sIdx = siblings.findIndex(c => c.id === catId);
    const targetSIdx = sIdx + direction;
    if (sIdx === -1 || targetSIdx < 0 || targetSIdx >= siblings.length) return;

    const posA = state.categories.findIndex(c => c.id === siblings[sIdx].id);
    const posB = state.categories.findIndex(c => c.id === siblings[targetSIdx].id);
    if (posA !== -1 && posB !== -1) {
      const tmp = state.categories[posA];
      state.categories[posA] = state.categories[posB];
      state.categories[posB] = tmp;
    }
  }

  saveCategories();
  renderCategoryEditList();
  refreshCategoryAddPanel();
}

function renderCategoryEditList() {
  const container = document.getElementById('categoryEditList');
  if (!container) return;
  container.innerHTML = '';

  const primaries = state.categories.filter(c => !c.parentId);

  const renderCategoryItemRow = (cat, isSub = false, posIdx = 0, totalCount = 1) => {
    const item = document.createElement('div');
    item.className = `category-edit-item ${isSub ? 'sub-category-item' : ''}`;
    item.innerHTML = `
      <div class="category-edit-left">
        ${isSub ? '<span class="sub-tree-branch">↳</span>' : ''}
        <span style="font-size: ${isSub ? '1.05rem' : '1.25rem'};">${cat.icon}</span>
        <div class="category-edit-dot" style="background-color: ${cat.color};"></div>
        <input type="text" class="category-edit-input" value="${escapeHtml(cat.name)}" title="点击可就地改名">
      </div>
      <div class="category-edit-actions">
        <div class="cat-sort-btns">
          <button type="button" class="cat-move-btn btn-move-up" ${posIdx === 0 ? 'disabled' : ''} title="上移">↑</button>
          <button type="button" class="cat-move-btn btn-move-down" ${posIdx === totalCount - 1 ? 'disabled' : ''} title="下移">↓</button>
        </div>
        ${!isSub ? '<button type="button" class="category-add-sub-btn" title="在此分类下新增二级细分">+ 子类</button>' : ''}
        <span style="font-size: 0.7rem; color: ${cat.isWaster ? '#EF4444' : (cat.isProductive ? '#10B981' : '#94A3B8')}; font-weight: 600;">
          ${cat.isWaster ? '摸鱼' : (cat.isProductive ? '专注' : '日常')}
        </span>
        <button type="button" class="category-del-btn" title="删除此分类">🗑️</button>
      </div>
    `;

    const upBtn = item.querySelector('.btn-move-up');
    const downBtn = item.querySelector('.btn-move-down');
    if (upBtn) upBtn.addEventListener('click', () => moveCategoryOrder(cat.id, -1));
    if (downBtn) downBtn.addEventListener('click', () => moveCategoryOrder(cat.id, 1));

    const nameInput = item.querySelector('.category-edit-input');
    nameInput.addEventListener('change', () => {
      const val = nameInput.value.trim();
      if (val) {
        cat.name = val;
        saveCategories();
        refreshCategoryAddPanel();
        showToast(`已重命名为「${val}」`);
      }
    });

    const addSubBtn = item.querySelector('.category-add-sub-btn');
    if (addSubBtn) {
      addSubBtn.addEventListener('click', () => {
        refreshCategoryAddPanel(cat.id);
        const nameInp = document.getElementById('newCatName');
        if (nameInp) {
          nameInp.placeholder = `输入「${cat.name}」的二级细分名称...`;
          nameInp.focus();
          nameInp.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }

    const delBtn = item.querySelector('.category-del-btn');
    delBtn.addEventListener('click', () => {
      if (!isSub && primaries.length <= 1) {
        alert('至少保留一个顶级活动大类！');
        return;
      }
      const subCount = isSub ? 0 : state.categories.filter(c => c.parentId === cat.id).length;
      const confirmMsg = subCount > 0
        ? `确定删除一级分类「${cat.name}」及其下的 ${subCount} 个二级细分吗？`
        : `确定删除分类「${cat.name}」吗？`;

      if (confirm(confirmMsg)) {
        state.categories = state.categories.filter(c => c.id !== cat.id && c.parentId !== cat.id);
        if (!state.categories.some(c => c.id === state.selectedCategory)) {
          state.selectedCategory = state.categories[0].id;
        }
        saveCategories();
        renderCategoryEditList();
        refreshCategoryAddPanel();
        renderTimelineStream();
        showToast('已删除分类');
      }
    });

    container.appendChild(item);
  };

  primaries.forEach((pCat, pIdx) => {
    renderCategoryItemRow(pCat, false, pIdx, primaries.length);
    const subs = state.categories.filter(c => c.parentId === pCat.id);
    subs.forEach((sCat, sIdx) => renderCategoryItemRow(sCat, true, sIdx, subs.length));
  });
}

function handleAddNewCategory() {
  const parentSel = document.getElementById('newCatParentId');
  const nameInp = document.getElementById('newCatName');
  const iconInp = document.getElementById('newCatIcon');
  const colorInp = document.getElementById('newCatColor');
  const prodInp = document.getElementById('newCatIsProductive');
  const wasteInp = document.getElementById('newCatIsWaster');

  const parentId = parentSel ? parentSel.value : '';
  const name = nameInp ? nameInp.value.trim() : '';
  const icon = (iconInp && iconInp.value.trim()) ? iconInp.value.trim() : (parentId ? '🔖' : '✨');
  const color = parentId ? (selectedShadeHex || '#3B82F6') : (colorInp ? colorInp.value : ColorEngine.pickDistinctPrimaryColor());
  const isProductive = prodInp ? prodInp.checked : false;
  const isWaster = wasteInp ? wasteInp.checked : false;

  if (!name) {
    alert('请输入分类名称！');
    if (nameInp) nameInp.focus();
    return;
  }

  const newId = 'cat_' + Date.now().toString(36);
  const newObj = {
    id: newId,
    name: name,
    icon: icon,
    color: color,
    isProductive: isProductive,
    isWaster: isWaster
  };
  if (parentId) {
    newObj.parentId = parentId;
    const parent = state.categories.find(c => c.id === parentId);
    if (parent) {
      newObj.isProductive = !!parent.isProductive;
      newObj.isWaster = !!parent.isWaster;
    }
  }

  state.categories.push(newObj);
  saveCategories();
  renderCategoryEditList();
  refreshCategoryAddPanel(parentId);

  if (nameInp) nameInp.value = '';
  showToast(`已新增${parentId ? '二级细分' : '一级大类'}「${icon} ${name}」`);
}

function handleResetDefaultCategories() {
  if (confirm('确定要恢复为系统初始默认的 8 个分类吗？自定义的分类将被重置。')) {
    state.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
    state.selectedCategory = state.categories[0].id;
    saveCategories();
    renderCategoryEditList();
    refreshCategoryAddPanel('');
    showToast('已恢复预设分类');
  }
}

