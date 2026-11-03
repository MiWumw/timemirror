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

// App State
let state = {
  currentDate: getTodayString(),
  activeTab: 'timeline',
  categories: loadCategories(),
  records: loadRecords(),
  reflections: loadReflections(),
  selectedCategory: 'phone',
  editingRecordId: null,
  charts: {
    review: null,
    trend: null
  }
};

function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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

function loadCategories() {
  return StorageAdapter.load('categories', DEFAULT_CATEGORIES);
}

function loadRecords() {
  return StorageAdapter.load('records', {});
}

function saveRecords() {
  StorageAdapter.save('records', state.records);
}

function loadReflections() {
  return StorageAdapter.load('reflections', {});
}

function saveReflections() {
  StorageAdapter.save('reflections', state.reflections);
}

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

// Review Tab Elements
const starBtns = document.querySelectorAll('.star-btn');
const inputReflectPraise = document.getElementById('reflectPraise');
const inputReflectWasted = document.getElementById('reflectWasted');
const inputReflectAction = document.getElementById('reflectAction');
const btnSaveReflection = document.getElementById('btnSaveReflection');
const blackHoleAlert = document.getElementById('blackHoleAlert');
const blackHoleSummary = document.getElementById('blackHoleSummary');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  renderCategoryChips();
  // Check if first time, if no records, offer sample load
  if (Object.keys(state.records).length === 0) {
    loadSampleData();
  }
  updateUI();
  registerServiceWorker();
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

  // Star ratings in review
  starBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const score = parseInt(btn.dataset.score, 10);
      setStarRating(score);
    });
  });

  // Save reflection
  btnSaveReflection.addEventListener('click', handleSaveReflection);

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
          ${cat.isWaster ? '⚠️ 无效消耗' : (cat.isProductive ? '✨ 高效专注' : '日常')}
        </span>
      </div>
      ${rec.note ? `<div class="timeline-item-note">${escapeHtml(rec.note)}</div>` : ''}
      <div class="timeline-item-actions">
        <button class="item-action-btn edit-btn" title="编辑">✏️ 编辑</button>
        <button class="item-action-btn del-btn del" title="删除">🗑️ 删除</button>
      </div>
    </div>
  `;

  card.querySelector('.edit-btn').addEventListener('click', () => {
    openRecordModal(rec);
  });

  card.querySelector('.del-btn').addEventListener('click', () => {
    if (confirm(`确定删除时段 ${rec.start} - ${rec.end} 的记录吗？`)) {
      deleteRecord(rec.id);
    }
  });

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
  if (existingRecord) {
    state.editingRecordId = existingRecord.id;
    modalTitle.textContent = '编辑时间记录';
    state.selectedCategory = existingRecord.category;
    inputStartTime.value = existingRecord.start;
    inputEndTime.value = existingRecord.end;
    inputNote.value = existingRecord.note || '';
  } else {
    state.editingRecordId = null;
    modalTitle.textContent = '记录新时间块';
    state.selectedCategory = 'phone'; // Default highlight phone/routine

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

// Review Tab Logic
function renderReviewTab() {
  const records = getTodayRecords();
  const categoryTotals = {};
  let totalDayMins = 0;
  let phoneMins = 0;

  records.forEach(r => {
    const dur = getDurationMinutes(r.start, r.end);
    totalDayMins += dur;
    categoryTotals[r.category] = (categoryTotals[r.category] || 0) + dur;
    if (r.category === 'phone') phoneMins += dur;
  });

  // Black Hole Alert
  if (phoneMins > 0) {
    const phoneHours = (phoneMins / 60).toFixed(1);
    const percent = totalDayMins > 0 ? ((phoneMins / totalDayMins) * 100).toFixed(0) : 0;
    blackHoleAlert.style.display = 'flex';
    blackHoleSummary.innerHTML = `今日在<b>【刷手机/摸鱼】</b>上累计花费了 <b>${phoneHours} 小时</b>（约占已记录时间的 ${percent}%）。早起醒后的这几十分钟常是无意识流逝的起点，反思一下明天如何打破这个循环？`;
  } else {
    blackHoleAlert.style.display = 'none';
  }

  // Render Doughnut Chart
  renderCategoryDoughnutChart(categoryTotals);

  // Load existing reflection
  const refl = state.reflections[state.currentDate] || { rating: 0, praise: '', wasted: '', action: '' };
  setStarRating(refl.rating || 0);
  inputReflectPraise.value = refl.praise || '';
  inputReflectWasted.value = refl.wasted || '';
  inputReflectAction.value = refl.action || '';
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

function setStarRating(rating) {
  starBtns.forEach(btn => {
    const score = parseInt(btn.dataset.score, 10);
    btn.classList.toggle('active', score <= rating);
  });
  state.currentRating = rating;
}

function handleSaveReflection() {
  const praise = inputReflectPraise.value.trim();
  const wasted = inputReflectWasted.value.trim();
  const action = inputReflectAction.value.trim();

  state.reflections[state.currentDate] = {
    rating: state.currentRating || 0,
    praise,
    wasted,
    action,
    updatedAt: new Date().toISOString()
  };

  saveReflections();
  alert('🎉 今日复盘已妥善保存！持续反思是自我精进的飞轮。');
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

  state.reflections[today] = {
    rating: 4,
    praise: '上午和晚上的深度工作状态很好，而且坚持了运动！',
    wasted: '早起和睡前各被手机偷走了30多分钟，合计浪费了1个多小时。',
    action: '明天睡前把手机放在书桌上，床头只放水杯和纸质书。'
  };

  saveRecords();
  saveReflections();
}

// Data Export & Import
function exportData() {
  const data = {
    exportedAt: new Date().toISOString(),
    categories: state.categories,
    records: state.records,
    reflections: state.reflections
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
      if (data.reflections) state.reflections = data.reflections;
      if (data.categories) state.categories = data.categories;
      saveRecords();
      saveReflections();
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
