const state = {
  all: [],
  filtered: [],
  selectedIds: new Set(),
  updatedAt: '',
  source: '',
  sheets: []
};

const $ = (id) => document.getElementById(id);

const els = {
  statusLine: $('statusLine'),
  btnRefresh: $('btnRefresh'),
  btnCopyAll: $('btnCopyAll'),
  btnCopySelected: $('btnCopySelected'),
  btnReset: $('btnReset'),
  btnThisMonth: $('btnThisMonth'),
  btnNext30: $('btnNext30'),
  btnAllDates: $('btnAllDates'),
  btnSelectVisible: $('btnSelectVisible'),
  btnClearSelect: $('btnClearSelect'),
  checkAll: $('checkAll'),
  tableBody: $('tableBody'),
  resultCount: $('resultCount'),
  messagePreview: $('messagePreview'),
  templateMode: $('templateMode'),
  dashboardBody: $('dashboardBody'),
  dashboardPeriod: $('dashboardPeriod'),
  groupDimension: $('groupDimension'),
  sheetStatus: $('sheetStatus'),
  rates: {
    delivery: $('deliveryRate'),
    delay: $('delayRate'),
    achievement: $('achievementRate'),
    deliveryBar: $('deliveryRateBar'),
    delayBar: $('delayRateBar'),
    achievementBar: $('achievementRateBar')
  },
  filters: {
    sheet: $('sheetFilter'),
    supplier: $('supplierFilter'),
    designer: $('designerFilter'),
    factory: $('factoryFilter'),
    bucket: $('bucketFilter'),
    startDate: $('startDate'),
    endDate: $('endDate'),
    keyword: $('keywordFilter'),
    hideDone: $('hideDone')
  },
  counts: {
    total: $('countTotal'),
    overdue: $('countOverdue'),
    within3: $('count3'),
    within7: $('count7'),
    within30: $('count30'),
    done: $('countDone')
  }
};

const bucketText = {
  overdue: '已延期',
  today: '今天到期',
  within3: '3天内交付',
  within7: '7天内交付',
  within30: '一个月内交付',
  later: '一个月后',
  done: '已完成',
  noDate: '无交期'
};

const groupLabel = {
  factory: '厂区 / 类别',
  supplier: '厂商',
  designer: '设计人员',
  sourceSheet: '项目 / Sheet 页签'
};

function todayZero() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDate(dateText) {
  if (!dateText) return null;
  const d = new Date(`${dateText}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(dateText) {
  const d = parseDate(dateText);
  if (!d) return null;
  return Math.round((d - todayZero()) / 86400000);
}

function isDone(item) {
  const text = `${item.currentStatus || ''} ${item.outsourceStatus || ''} ${item.remark || ''} ${item.arrivalConfirm || ''}`.toLowerCase();
  return /已领用|已交齐|已到货|已完成|完成|入库|已回厂|验收|received|closed|done|cancel|取消/.test(text);
}

function getBucket(item) {
  if (isDone(item)) return 'done';
  const diff = daysBetween(item.dueDate);
  if (diff === null) return 'noDate';
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 3) return 'within3';
  if (diff <= 7) return 'within7';
  if (diff <= 30) return 'within30';
  return 'later';
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function pct(n, d) {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10;
}

function pctText(n, d) {
  return `${pct(n, d).toFixed(1)}%`;
}

function uniq(list, key) {
  return [...new Set(list.map(x => x[key]).filter(Boolean).map(String))].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
}

function fillSelect(select, values) {
  const current = select.value;
  select.innerHTML = '<option value="">全部</option>' + values.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  if (values.includes(current)) select.value = current;
}

function refreshFilterOptions() {
  fillSelect(els.filters.sheet, uniq(state.all, 'sourceSheet'));
  fillSelect(els.filters.supplier, uniq(state.all, 'supplier'));
  fillSelect(els.filters.designer, uniq(state.all, 'designer'));
  fillSelect(els.filters.factory, uniq(state.all, 'factory'));
}

function getCurrentFilters() {
  return {
    sheet: els.filters.sheet.value,
    supplier: els.filters.supplier.value,
    designer: els.filters.designer.value,
    factory: els.filters.factory.value,
    bucket: els.filters.bucket.value,
    startDate: els.filters.startDate.value,
    endDate: els.filters.endDate.value,
    keyword: els.filters.keyword.value.trim().toLowerCase(),
    hideDone: els.filters.hideDone.checked
  };
}

function updateCounts(items = state.filtered) {
  const counts = { total: items.length, overdue: 0, within3: 0, within7: 0, within30: 0, done: 0 };
  for (const item of items) {
    const b = getBucket(item);
    if (b === 'overdue') counts.overdue++;
    if (b === 'today' || b === 'within3') counts.within3++;
    if (b === 'today' || b === 'within3' || b === 'within7') counts.within7++;
    if (b === 'today' || b === 'within3' || b === 'within7' || b === 'within30') counts.within30++;
    if (b === 'done') counts.done++;
  }
  els.counts.total.textContent = counts.total;
  els.counts.overdue.textContent = counts.overdue;
  els.counts.within3.textContent = counts.within3;
  els.counts.within7.textContent = counts.within7;
  els.counts.within30.textContent = counts.within30;
  els.counts.done.textContent = counts.done;
}

function applyFilters() {
  const f = getCurrentFilters();
  const start = parseDate(f.startDate);
  const end = parseDate(f.endDate);

  state.filtered = state.all.filter(item => {
    const bucket = getBucket(item);
    if (f.hideDone && bucket === 'done') return false;
    if (f.sheet && item.sourceSheet !== f.sheet) return false;
    if (f.supplier && item.supplier !== f.supplier) return false;
    if (f.designer && item.designer !== f.designer) return false;
    if (f.factory && item.factory !== f.factory) return false;
    if (f.bucket && bucket !== f.bucket) return false;
    const due = parseDate(item.dueDate);
    if (start && due && due < start) return false;
    if (end && due && due > end) return false;
    if ((start || end) && !due) return false;
    if (f.keyword) {
      const haystack = [item.sourceSheet, item.factory, item.supplier, item.designer, item.fixtureCode, item.fixtureName, item.remark, item.prNo, item.applicant, item.user].join(' ').toLowerCase();
      if (!haystack.includes(f.keyword)) return false;
    }
    return true;
  });

  updateCounts();
  renderDashboard();
  renderTable();
  renderMessage();
}

function makeStats(items) {
  const total = items.length;
  const done = items.filter(isDone).length;
  const overdue = items.filter(i => getBucket(i) === 'overdue').length;
  const within3 = items.filter(i => ['today', 'within3'].includes(getBucket(i))).length;
  return {
    total,
    done,
    overdue,
    within3,
    deliveryRate: pct(done, total),
    delayRate: pct(overdue, total),
    achievementRate: pct(Math.max(total - overdue, 0), total)
  };
}

function progressCell(value, kind = '') {
  return `<div class="mini-progress ${kind}"><span style="width:${Math.min(value, 100)}%"></span><b>${value.toFixed(1)}%</b></div>`;
}

function renderDashboard() {
  const stats = makeStats(state.filtered);
  els.rates.delivery.textContent = `${stats.deliveryRate.toFixed(1)}%`;
  els.rates.delay.textContent = `${stats.delayRate.toFixed(1)}%`;
  els.rates.achievement.textContent = `${stats.achievementRate.toFixed(1)}%`;
  els.rates.deliveryBar.style.width = `${Math.min(stats.deliveryRate, 100)}%`;
  els.rates.delayBar.style.width = `${Math.min(stats.delayRate, 100)}%`;
  els.rates.achievementBar.style.width = `${Math.min(stats.achievementRate, 100)}%`;

  const f = getCurrentFilters();
  const period = f.startDate || f.endDate ? `${f.startDate || '最早'} ～ ${f.endDate || '最晚'}` : '当前筛选全部交期';
  els.dashboardPeriod.textContent = `统计区间：${period}；分组：${groupLabel[els.groupDimension.value]}`;

  const dim = els.groupDimension.value;
  const groups = new Map();
  for (const item of state.filtered) {
    const key = item[dim] || '未填写';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const rows = [...groups.entries()]
    .map(([name, list]) => ({ name, ...makeStats(list) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 50)
    .map(x => `<tr>
      <td class="group-name">${escapeHtml(x.name)}</td>
      <td>${x.total}</td>
      <td>${x.done}</td>
      <td>${x.overdue}</td>
      <td>${x.within3}</td>
      <td>${progressCell(x.deliveryRate)}</td>
      <td>${progressCell(x.delayRate, 'bad')}</td>
      <td>${progressCell(x.achievementRate, 'good')}</td>
    </tr>`).join('');
  els.dashboardBody.innerHTML = rows || '<tr><td colspan="8" class="empty">当前条件下无统计数据。</td></tr>';
}

function renderSheetStatus() {
  if (!state.sheets.length) {
    els.sheetStatus.innerHTML = '<div class="empty-card">暂无 Sheet 同步信息</div>';
    return;
  }
  els.sheetStatus.innerHTML = state.sheets.map(s => `<div class="sheet-item">
    <strong>${escapeHtml(s.title || s.factory || s.sheetId)}</strong>
    <span>${escapeHtml(s.factory || '-')} · ${escapeHtml(s.rows || 0)} 条</span>
  </div>`).join('');
}

function renderTable() {
  els.resultCount.textContent = `${state.filtered.length} 条`;
  const rows = state.filtered.slice(0, 1000).map(item => {
    const bucket = getBucket(item);
    const checked = state.selectedIds.has(item.id) ? 'checked' : '';
    const diff = daysBetween(item.dueDate);
    const diffText = diff === null ? '' : (diff < 0 ? `延期 ${Math.abs(diff)} 天` : `剩 ${diff} 天`);
    return `<tr>
      <td><input class="row-check" type="checkbox" data-id="${escapeHtml(item.id)}" ${checked}></td>
      <td><span class="badge ${bucket}">${bucketText[bucket]}</span><br><small>${diffText}</small></td>
      <td><div class="ellipsis">${escapeHtml(item.sourceSheet)}</div></td>
      <td>${escapeHtml(item.supplier)}</td>
      <td>${escapeHtml(item.factory)}</td>
      <td>${escapeHtml(item.designer)}</td>
      <td><div class="ellipsis">${escapeHtml(item.fixtureCode)}</div></td>
      <td><div class="ellipsis">${escapeHtml(item.fixtureName)}</div></td>
      <td>${escapeHtml(item.quantity)}</td>
      <td>${escapeHtml(item.dueDate)}</td>
      <td><div class="ellipsis">${escapeHtml(item.currentStatus || item.outsourceStatus)}</div></td>
      <td><div class="ellipsis">${escapeHtml(item.remark)}</div></td>
    </tr>`;
  }).join('');
  els.tableBody.innerHTML = rows || '<tr><td colspan="12" class="empty">没有符合条件的数据。</td></tr>';
  els.checkAll.checked = state.filtered.length > 0 && state.filtered.every(x => state.selectedIds.has(x.id));
}

function getItemsForMessage(preferSelected = true) {
  const selected = state.filtered.filter(item => state.selectedIds.has(item.id));
  return preferSelected && selected.length ? selected : state.filtered;
}

function groupBySupplier(items) {
  const map = new Map();
  for (const item of items) {
    const supplier = item.supplier || '未填写厂商';
    if (!map.has(supplier)) map.set(supplier, []);
    map.get(supplier).push(item);
  }
  return map;
}

function classifyTemplate(items) {
  const mode = els.templateMode.value;
  if (mode !== 'auto') return mode;
  if (items.some(i => getBucket(i) === 'overdue')) return 'overdue';
  if (items.some(i => ['today', 'within3', 'within7'].includes(getBucket(i)))) return 'dueSoon';
  return 'normal';
}

function buildMessageForSupplier(supplier, items) {
  const template = classifyTemplate(items);
  const title = template === 'overdue' ? '【治具延期跟催】' : template === 'dueSoon' ? '【治具交付提醒】' : '【治具交付进度确认】';
  const intro = template === 'overdue'
    ? `以下治具已超过预计交期，请优先协助确认处理进度：`
    : template === 'dueSoon'
      ? `以下治具即将到交期，请协助确认是否可以按期交付：`
      : `请协助确认以下治具的当前制作/交付进度：`;
  const lines = items.map((item, idx) => {
    const bucket = bucketText[getBucket(item)];
    const diff = daysBetween(item.dueDate);
    const diffLine = diff === null ? '' : `   交期判断：${bucket}${diff < 0 ? `（已延期${Math.abs(diff)}天）` : `（剩余${diff}天）`}\n`;
    return `${idx + 1}. 治具编码：${item.fixtureCode || '-'}\n` +
      `   治具名称：${item.fixtureName || '-'}\n` +
      `   数量：${item.quantity || '-'}\n` +
      `   项目页签：${item.sourceSheet || '-'}\n` +
      `   厂区：${item.factory || '-'}\n` +
      `   设计人员：${item.designer || '-'}\n` +
      `   预计交期：${item.dueDate || '-'}\n` +
      diffLine +
      `   当前状态：${item.currentStatus || item.outsourceStatus || '-'}\n` +
      (item.remark ? `   备注：${item.remark.replace(/\n/g, '；')}\n` : '');
  }).join('\n');

  const ask = template === 'overdue'
    ? '请今天内回复：\n1）当前制作/交付进度；\n2）最新可交付日期；\n3）延期原因；\n4）是否需要我司配合事项。'
    : '请协助确认：\n1）是否可以按期交付；\n2）如无法按期交付，请提供最新交期及原因；\n3）是否需要我司配合事项。';

  return `${title}\n\n${supplier} 您好：\n${intro}\n\n${lines}\n${ask}\n\n谢谢。`;
}

function buildMessages(items) {
  const groups = groupBySupplier(items);
  return [...groups.entries()].map(([supplier, list]) => buildMessageForSupplier(supplier, list)).join('\n\n------------------------------\n\n');
}

function renderMessage() {
  const items = getItemsForMessage(true);
  els.messagePreview.value = items.length ? buildMessages(items) : '';
}

async function copyText(text) {
  if (!text.trim()) return alert('没有可复制的跟催文字。');
  await navigator.clipboard.writeText(text);
  localStorage.setItem('fixture-followup-last-copy', JSON.stringify({ time: new Date().toISOString(), textLength: text.length }));
  alert('已复制到剪贴板，可以粘贴到个人微信发送。');
}

async function loadData() {
  els.statusLine.textContent = '正在同步页面数据...';
  els.btnRefresh.disabled = true;
  try {
    const resp = await fetch(window.FIXTURE_DATA_URL || './data/fixtures.json', { cache: 'no-store' });
    const contentType = resp.headers.get('content-type') || '';
    if (!resp.ok) throw new Error(`数据文件不存在或未部署：HTTP ${resp.status}`);
    if (!contentType.includes('application/json')) {
      const text = await resp.text();
      throw new Error(`数据文件不是 JSON，可能是 GitHub Pages 未部署 fixtures.json：${text.slice(0, 40)}`);
    }
    const json = await resp.json();
    if (!json.ok) throw new Error(json.message || '读取失败');
    state.all = json.data || [];
    state.updatedAt = json.updatedAt;
    state.source = json.source;
    state.sheets = json.sheets || [];
    refreshFilterOptions();
    renderSheetStatus();
    applyFilters();
    els.statusLine.textContent = `已同步 ${json.count} 条数据，覆盖 ${state.sheets.length || uniq(state.all, 'sourceSheet').length} 个 Sheet。来源：${json.source}，更新时间：${new Date(json.updatedAt).toLocaleString()}。`;
  } catch (err) {
    console.error(err);
    els.statusLine.textContent = `同步失败：${err.message}`;
  } finally {
    els.btnRefresh.disabled = false;
  }
}

function setThisMonth() {
  const now = todayZero();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  els.filters.startDate.value = fmtDate(first);
  els.filters.endDate.value = fmtDate(last);
  applyFilters();
}

function setNext30() {
  const start = todayZero();
  const end = new Date(start);
  end.setDate(end.getDate() + 30);
  els.filters.startDate.value = fmtDate(start);
  els.filters.endDate.value = fmtDate(end);
  applyFilters();
}

function clearDates() {
  els.filters.startDate.value = '';
  els.filters.endDate.value = '';
  applyFilters();
}

function bindEvents() {
  Object.values(els.filters).forEach(el => {
    el.addEventListener('input', applyFilters);
    el.addEventListener('change', applyFilters);
  });
  els.groupDimension.addEventListener('change', renderDashboard);
  els.templateMode.addEventListener('change', renderMessage);
  els.btnRefresh.addEventListener('click', loadData);
  els.btnThisMonth.addEventListener('click', setThisMonth);
  els.btnNext30.addEventListener('click', setNext30);
  els.btnAllDates.addEventListener('click', clearDates);
  els.btnReset.addEventListener('click', () => {
    els.filters.sheet.value = '';
    els.filters.supplier.value = '';
    els.filters.designer.value = '';
    els.filters.factory.value = '';
    els.filters.bucket.value = '';
    els.filters.startDate.value = '';
    els.filters.endDate.value = '';
    els.filters.keyword.value = '';
    els.filters.hideDone.checked = true;
    state.selectedIds.clear();
    applyFilters();
  });
  els.tableBody.addEventListener('change', (e) => {
    if (!e.target.classList.contains('row-check')) return;
    const id = e.target.dataset.id;
    if (e.target.checked) state.selectedIds.add(id);
    else state.selectedIds.delete(id);
    renderTable();
    renderMessage();
  });
  els.checkAll.addEventListener('change', () => {
    for (const item of state.filtered) {
      if (els.checkAll.checked) state.selectedIds.add(item.id);
      else state.selectedIds.delete(item.id);
    }
    renderTable();
    renderMessage();
  });
  els.btnSelectVisible.addEventListener('click', () => {
    for (const item of state.filtered) state.selectedIds.add(item.id);
    renderTable();
    renderMessage();
  });
  els.btnClearSelect.addEventListener('click', () => {
    state.selectedIds.clear();
    renderTable();
    renderMessage();
  });
  els.btnCopyAll.addEventListener('click', () => copyText(buildMessages(state.filtered)));
  els.btnCopySelected.addEventListener('click', () => copyText(buildMessages(getItemsForMessage(true))));
}

bindEvents();
loadData();
