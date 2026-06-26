const state = {
  all: [],
  filtered: [],
  selectedIds: new Set(),
  updatedAt: '',
  source: '',
  sheets: [],
  activeSheet: ''
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
  sheetTabs: $('sheetTabs'),
  sheetCountBadge: $('sheetCountBadge'),
  filterSummary: $('filterSummary'),
  rates: {
    delivery: $('deliveryRate'),
    delay: $('delayRate'),
    achievement: $('achievementRate'),
    audit: $('auditRate'),
    deliveryBar: $('deliveryRateBar'),
    delayBar: $('delayRateBar'),
    achievementBar: $('achievementRateBar'),
    auditBar: $('auditRateBar')
  },
  filters: {
    sheet: $('sheetFilter'),
    supplier: $('supplierFilter'),
    designer: $('designerFilter'),
    factory: $('factoryFilter'),
    statusStage: $('statusStageFilter'),
    bucket: $('bucketFilter'),
    startDate: $('startDate'),
    endDate: $('endDate'),
    keyword: $('keywordFilter'),
    hideDelivered: $('hideDelivered'),
    hideBlank: $('hideBlank')
  },
  counts: {
    total: $('countTotal'),
    valid: $('countValid'),
    delivered: $('countDelivered'),
    audit: $('countAudit'),
    overdue: $('countOverdue'),
    blank: $('countBlank')
  }
};

const bucketText = {
  overdue: '已延期',
  today: '今天到期',
  within3: '3天内交付',
  within7: '7天内交付',
  within30: '一个月内交付',
  later: '一个月后',
  done: '已交付',
  audit: '审核阶段',
  blank: '状态空白',
  noDate: '无交期'
};

const stageText = {
  delivered: '已交付',
  audit: '审核阶段',
  production: '厂商制作中',
  blank: '状态空白',
  other: '其他状态'
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

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function norm(text) {
  return String(text ?? '').replace(/\s+/g, '').trim();
}

function currentStatusText(item) {
  return String(item.currentStatus || '').trim();
}

function statusStage(item) {
  const s = norm(currentStatusText(item));
  if (!s) return 'blank';
  if (/已领用/.test(s)) return 'delivered';
  if (/仓库验收中|打样中|验收中|审核中/.test(s)) return 'audit';
  if (/厂商制作中|制作中|加工中|生产中|发包中|已发包|外发中|进行中/.test(s)) return 'production';
  return 'other';
}

function isDelivered(item) {
  return statusStage(item) === 'delivered';
}

function isAudit(item) {
  return statusStage(item) === 'audit';
}

function isBlankStatus(item) {
  return statusStage(item) === 'blank';
}

function isMetricEligible(item) {
  const stage = statusStage(item);
  return stage !== 'blank' && stage !== 'audit';
}

function getBucket(item) {
  const stage = statusStage(item);
  if (stage === 'delivered') return 'done';
  if (stage === 'audit') return 'audit';
  if (stage === 'blank') return 'blank';
  const diff = daysBetween(item.dueDate);
  if (diff === null) return 'noDate';
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 3) return 'within3';
  if (diff <= 7) return 'within7';
  if (diff <= 30) return 'within30';
  return 'later';
}

function pct(n, d) {
  if (!d) return 0;
  return Math.round((n / d) * 1000) / 10;
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
    statusStage: els.filters.statusStage.value,
    bucket: els.filters.bucket.value,
    startDate: els.filters.startDate.value,
    endDate: els.filters.endDate.value,
    keyword: els.filters.keyword.value.trim().toLowerCase(),
    hideDelivered: els.filters.hideDelivered.checked,
    hideBlank: els.filters.hideBlank.checked
  };
}

function summarize(items) {
  const totalRows = items.length;
  const delivered = items.filter(isDelivered).length;
  const audit = items.filter(isAudit).length;
  const blank = items.filter(isBlankStatus).length;
  const eligible = items.filter(isMetricEligible);
  const valid = eligible.length;
  const overdue = eligible.filter(i => getBucket(i) === 'overdue').length;
  const within3 = eligible.filter(i => ['today', 'within3'].includes(getBucket(i))).length;
  const notDelayed = Math.max(valid - overdue, 0);
  const nonBlank = Math.max(totalRows - blank, 0);
  return {
    totalRows,
    valid,
    delivered,
    audit,
    blank,
    overdue,
    within3,
    deliveryRate: pct(delivered, valid),
    delayRate: pct(overdue, valid),
    achievementRate: pct(notDelayed, valid),
    auditRate: pct(audit, nonBlank)
  };
}

function updateCounts(items = state.filtered) {
  const s = summarize(items);
  els.counts.total.textContent = s.totalRows;
  els.counts.valid.textContent = s.valid;
  els.counts.delivered.textContent = s.delivered;
  els.counts.audit.textContent = s.audit;
  els.counts.overdue.textContent = s.overdue;
  els.counts.blank.textContent = s.blank;
}

function applyFilters() {
  const f = getCurrentFilters();
  const start = parseDate(f.startDate);
  const end = parseDate(f.endDate);

  state.filtered = state.all.filter(item => {
    const bucket = getBucket(item);
    const stage = statusStage(item);
    if (f.hideDelivered && stage === 'delivered') return false;
    if (f.hideBlank && stage === 'blank') return false;
    if (f.sheet && item.sourceSheet !== f.sheet) return false;
    if (f.supplier && item.supplier !== f.supplier) return false;
    if (f.designer && item.designer !== f.designer) return false;
    if (f.factory && item.factory !== f.factory) return false;
    if (f.statusStage && stage !== f.statusStage) return false;
    if (f.bucket && bucket !== f.bucket) return false;
    const due = parseDate(item.dueDate);
    if (start && due && due < start) return false;
    if (end && due && due > end) return false;
    if ((start || end) && !due) return false;
    if (f.keyword) {
      const haystack = [item.sourceSheet, item.factory, item.supplier, item.designer, item.fixtureCode, item.fixtureName, item.remark, item.prNo, item.applicant, item.user, item.arrivalConfirm, item.currentStatus].join(' ').toLowerCase();
      if (!haystack.includes(f.keyword)) return false;
    }
    return true;
  });

  updateCounts();
  renderDashboard();
  renderTable();
  renderMessage();
  renderFilterSummary();
}

function renderFilterSummary() {
  const f = getCurrentFilters();
  const parts = [];
  if (f.sheet) parts.push(`页签：${f.sheet}`);
  if (f.factory) parts.push(`厂区：${f.factory}`);
  if (f.supplier) parts.push(`厂商：${f.supplier}`);
  if (f.designer) parts.push(`设计：${f.designer}`);
  if (f.statusStage) parts.push(`阶段：${stageText[f.statusStage]}`);
  if (f.bucket) parts.push(`交期：${bucketText[f.bucket]}`);
  if (f.startDate || f.endDate) parts.push(`区间：${f.startDate || '最早'}～${f.endDate || '最晚'}`);
  els.filterSummary.textContent = parts.length ? `当前筛选：${parts.join(' / ')}` : '当前筛选：全部数据。可组合筛选项目、厂区、厂商、设计人员、状态和日期区间。';
}

function progressCell(value, kind = '') {
  return `<div class="mini-progress ${kind}"><span style="width:${Math.min(value, 100)}%"></span><b>${value.toFixed(1)}%</b></div>`;
}

function renderDashboard() {
  const stats = summarize(state.filtered);
  els.rates.delivery.textContent = `${stats.deliveryRate.toFixed(1)}%`;
  els.rates.delay.textContent = `${stats.delayRate.toFixed(1)}%`;
  els.rates.achievement.textContent = `${stats.achievementRate.toFixed(1)}%`;
  els.rates.audit.textContent = `${stats.auditRate.toFixed(1)}%`;
  els.rates.deliveryBar.style.width = `${Math.min(stats.deliveryRate, 100)}%`;
  els.rates.delayBar.style.width = `${Math.min(stats.delayRate, 100)}%`;
  els.rates.achievementBar.style.width = `${Math.min(stats.achievementRate, 100)}%`;
  els.rates.auditBar.style.width = `${Math.min(stats.auditRate, 100)}%`;

  const f = getCurrentFilters();
  const period = f.startDate || f.endDate ? `${f.startDate || '最早'} ～ ${f.endDate || '最晚'}` : '当前筛选全部交期';
  els.dashboardPeriod.textContent = `统计区间：${period}；分组：${groupLabel[els.groupDimension.value]}；统计母数排除状态空白与审核阶段。`;

  const dim = els.groupDimension.value;
  const groups = new Map();
  for (const item of state.filtered) {
    const key = item[dim] || '未填写';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const rows = [...groups.entries()]
    .map(([name, list]) => ({ name, ...summarize(list) }))
    .sort((a, b) => b.valid - a.valid || b.totalRows - a.totalRows)
    .slice(0, 80)
    .map(x => `<tr>
      <td class="group-name">${escapeHtml(x.name)}</td>
      <td>${x.totalRows}</td>
      <td>${x.valid}</td>
      <td>${x.delivered}</td>
      <td>${x.audit}</td>
      <td>${x.overdue}</td>
      <td>${x.blank}</td>
      <td>${progressCell(x.deliveryRate)}</td>
      <td>${progressCell(x.delayRate, 'bad')}</td>
      <td>${progressCell(x.achievementRate, 'good')}</td>
    </tr>`).join('');
  els.dashboardBody.innerHTML = rows || '<tr><td colspan="10" class="empty">当前条件下无统计数据。</td></tr>';
}

function renderSheetStatus() {
  const bySheet = new Map();
  for (const item of state.all) {
    const name = item.sourceSheet || '未命名 Sheet';
    if (!bySheet.has(name)) bySheet.set(name, []);
    bySheet.get(name).push(item);
  }
  const items = [...bySheet.entries()].map(([name, list]) => ({ name, ...summarize(list) }));
  els.sheetCountBadge.textContent = `${items.length} 个 Sheet`;
  els.sheetStatus.innerHTML = items.map(s => `<div class="sheet-item">
    <strong>${escapeHtml(s.name)}</strong>
    <span>${s.totalRows} 行 · 母数 ${s.valid} · 已交付 ${s.delivered} · 延期 ${s.overdue}</span>
  </div>`).join('') || '<div class="empty-card">暂无 Sheet 同步信息</div>';
  renderSheetTabs(items);
}

function renderSheetTabs(items) {
  const allActive = !els.filters.sheet.value ? 'active' : '';
  const tabs = [`<button class="sheet-tab ${allActive}" data-sheet="">全部项目 <b>${state.all.length}</b></button>`]
    .concat(items.map(s => {
      const active = els.filters.sheet.value === s.name ? 'active' : '';
      return `<button class="sheet-tab ${active}" data-sheet="${escapeHtml(s.name)}">${escapeHtml(s.name)} <b>${s.totalRows}</b></button>`;
    }));
  els.sheetTabs.innerHTML = tabs.join('');
}

function renderTable() {
  els.resultCount.textContent = `${state.filtered.length} 条`;
  const rows = state.filtered.slice(0, 1500).map(item => {
    const bucket = getBucket(item);
    const checked = state.selectedIds.has(item.id) ? 'checked' : '';
    const diff = daysBetween(item.dueDate);
    const diffText = diff === null ? '' : (diff < 0 ? `延期 ${Math.abs(diff)} 天` : `剩 ${diff} 天`);
    const stage = statusStage(item);
    return `<tr>
      <td><input class="row-check" type="checkbox" data-id="${escapeHtml(item.id)}" ${checked}></td>
      <td><span class="badge ${bucket}">${bucketText[bucket]}</span><br><small>${diffText}</small></td>
      <td><div class="ellipsis wide-text">${escapeHtml(item.sourceSheet)}</div></td>
      <td>${escapeHtml(item.supplier)}</td>
      <td>${escapeHtml(item.factory)}</td>
      <td>${escapeHtml(item.designer)}</td>
      <td><div class="ellipsis">${escapeHtml(item.fixtureCode)}</div></td>
      <td><div class="ellipsis wide-text">${escapeHtml(item.fixtureName)}</div></td>
      <td>${escapeHtml(item.quantity)}</td>
      <td>${escapeHtml(item.dueDate)}</td>
      <td><div class="ellipsis">${escapeHtml(item.currentStatus)}</div></td>
      <td><span class="stage ${stage}">${stageText[stage]}</span></td>
      <td><div class="ellipsis wide-text">${escapeHtml(item.remark)}</div></td>
    </tr>`;
  }).join('');
  els.tableBody.innerHTML = rows || '<tr><td colspan="13" class="empty">没有符合条件的数据。</td></tr>';
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
  if (items.some(i => statusStage(i) === 'audit')) return 'audit';
  if (items.some(i => ['today', 'within3', 'within7'].includes(getBucket(i)))) return 'dueSoon';
  return 'normal';
}

function buildMessageForSupplier(supplier, items) {
  const template = classifyTemplate(items);
  const title = template === 'overdue' ? '【治具延期跟催】' : template === 'dueSoon' ? '【治具交付提醒】' : template === 'audit' ? '【治具审核进度确认】' : '【治具交付进度确认】';
  const intro = template === 'overdue'
    ? '以下治具已超过预计交期，请优先协助确认处理进度：'
    : template === 'dueSoon'
      ? '以下治具即将到交期，请协助确认是否可以按期交付：'
      : template === 'audit'
        ? '以下治具当前处于仓库验收/打样审核阶段，请协助确认后续进度：'
        : '请协助确认以下治具的当前制作/交付进度：';
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
      `   治具现状态：${item.currentStatus || '-'}\n` +
      `   阶段判断：${stageText[statusStage(item)] || '-'}\n` +
      (item.remark ? `   备注：${String(item.remark).replace(/\n/g, '；')}\n` : '');
  }).join('\n');

  const ask = template === 'overdue'
    ? '请今天内回复：\n1）当前制作/交付进度；\n2）最新可交付日期；\n3）延期原因；\n4）是否需要我司配合事项。'
    : template === 'audit'
      ? '请协助确认：\n1）当前审核/验收进度；\n2）预计可完成确认的时间；\n3）是否存在异常或需要我司配合事项。'
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
    const dataUrl = window.FIXTURE_DATA_URL || './data/fixtures.json';
    const separator = dataUrl.includes('?') ? '&' : '?';
    const freshUrl = `${dataUrl}${separator}t=${Date.now()}`;

    const resp = await fetch(freshUrl, {
      cache: 'no-store'
    });
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
    state.selectedIds.clear();
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
    Object.assign(els.filters.sheet, { value: '' });
    els.filters.supplier.value = '';
    els.filters.designer.value = '';
    els.filters.factory.value = '';
    els.filters.statusStage.value = '';
    els.filters.bucket.value = '';
    els.filters.startDate.value = '';
    els.filters.endDate.value = '';
    els.filters.keyword.value = '';
    els.filters.hideDelivered.checked = false;
    els.filters.hideBlank.checked = false;
    state.selectedIds.clear();
    renderSheetTabs([...new Map(state.all.map(i => [i.sourceSheet, true])).keys()].map(name => ({ name, totalRows: state.all.filter(i => i.sourceSheet === name).length })));
    applyFilters();
  });
  els.sheetTabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.sheet-tab');
    if (!btn) return;
    els.filters.sheet.value = btn.dataset.sheet || '';
    state.selectedIds.clear();
    renderSheetStatus();
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
