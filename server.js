require('dotenv').config();

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const XLSX = require('xlsx');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const FEISHU_BASE = 'https://open.feishu.cn/open-apis';
const columnMap = require('./data/column-map.json');

let tokenCache = { token: '', expireAt: 0 };

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan('dev'));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function normalizeHeader(value) {
  return String(value ?? '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findColumnIndex(headers, candidates) {
  const normalized = headers.map(normalizeHeader);
  for (const candidate of candidates) {
    const c = normalizeHeader(candidate).toLowerCase();
    let idx = normalized.findIndex((h) => h.toLowerCase() === c);
    if (idx >= 0) return idx;
    idx = normalized.findIndex((h) => h.toLowerCase().includes(c));
    if (idx >= 0) return idx;
  }
  return -1;
}

function excelSerialToDate(serial) {
  if (typeof serial !== 'number' || Number.isNaN(serial)) return null;
  // Excel 1900 date system. JS Date UTC avoids timezone drift for display.
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400 * 1000;
  const date = new Date(utcValue);
  if (date.getUTCFullYear() < 2000 || date.getUTCFullYear() > 2100) return null;
  return date.toISOString().slice(0, 10);
}

function parseDateValue(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') return excelSerialToDate(value) || String(value);
  const text = String(value).trim();
  if (!text) return '';
  const serialMaybe = Number(text);
  if (/^\d{5}(\.\d+)?$/.test(text)) return excelSerialToDate(serialMaybe) || text;
  const m = text.match(/(20\d{2})[\-/\.年](\d{1,2})[\-/\.月](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const m2 = text.match(/(\d{1,2})[\-/\.月](\d{1,2})(?:日|号)?/);
  if (m2) {
    const year = new Date().getFullYear();
    return `${year}-${m2[1].padStart(2, '0')}-${m2[2].padStart(2, '0')}`;
  }
  return text;
}

function cleanText(value) {
  return String(value ?? '').replace(/\r/g, '\n').trim();
}

function mapRowsToFixtures(values, sourceFactory = '') {
  if (!Array.isArray(values) || values.length < 2) return [];
  const headers = values[0].map(normalizeHeader);
  const indexes = {};
  for (const [key, candidates] of Object.entries(columnMap)) {
    indexes[key] = findColumnIndex(headers, candidates);
  }

  return values.slice(1).map((row, i) => {
    const get = (key) => (indexes[key] >= 0 ? row[indexes[key]] : '');
    const factory = cleanText(get('factory')) || sourceFactory;
    const fixtureCode = cleanText(get('fixtureCode'));
    const fixtureName = cleanText(get('fixtureName'));
    const supplier = cleanText(get('supplier'));
    const dueDate = parseDateValue(get('dueDate'));
    if (!supplier && !fixtureCode && !fixtureName && !dueDate) return null;
    return {
      id: `${sourceFactory}-${i + 2}-${fixtureCode || fixtureName || supplier}`,
      factory,
      applicant: cleanText(get('applicant')),
      user: cleanText(get('user')),
      designer: cleanText(get('designer')),
      purchaseDate: parseDateValue(get('purchaseDate')),
      supplier,
      fixtureCode,
      fixtureName,
      quantity: cleanText(get('quantity')),
      outsourceStatus: cleanText(get('outsourceStatus')),
      dueDate,
      currentStatus: cleanText(get('currentStatus')),
      arrivalConfirm: cleanText(get('arrivalConfirm')),
      poDate: parseDateValue(get('poDate')),
      remark: cleanText(get('remark')),
      prNo: cleanText(get('prNo')),
      sourceFactory,
      rawRowNumber: i + 2
    };
  }).filter(Boolean);
}

async function getTenantAccessToken() {
  const now = Date.now();
  if (tokenCache.token && tokenCache.expireAt > now + 60_000) return tokenCache.token;

  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  if (!appId || !appSecret) throw new Error('缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET。');

  const resp = await axios.post(`${FEISHU_BASE}/auth/v3/tenant_access_token/internal`, {
    app_id: appId,
    app_secret: appSecret
  });
  if (resp.data.code !== 0) {
    throw new Error(`获取 tenant_access_token 失败：${resp.data.msg || JSON.stringify(resp.data)}`);
  }
  tokenCache = {
    token: resp.data.tenant_access_token,
    expireAt: Date.now() + Number(resp.data.expire || 7000) * 1000
  };
  return tokenCache.token;
}

function parseRangesConfig() {
  const ranges = String(process.env.FEISHU_SHEET_RANGES || '').split(',').map(s => s.trim()).filter(Boolean);
  return ranges.map(item => {
    const [factory, range] = item.includes('|') ? item.split('|') : ['', item];
    return { factory: factory.trim(), range: range.trim() };
  });
}

async function resolveSpreadsheetToken(token) {
  if (process.env.FEISHU_SPREADSHEET_TOKEN) return process.env.FEISHU_SPREADSHEET_TOKEN;
  const wikiNodeToken = process.env.FEISHU_WIKI_NODE_TOKEN;
  if (!wikiNodeToken) throw new Error('缺少 FEISHU_SPREADSHEET_TOKEN 或 FEISHU_WIKI_NODE_TOKEN。');
  const url = `${FEISHU_BASE}/wiki/v2/spaces/get_node?token=${encodeURIComponent(wikiNodeToken)}`;
  const resp = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
  if (resp.data.code !== 0) {
    throw new Error(`解析 Wiki 节点失败：${resp.data.msg || JSON.stringify(resp.data)}`);
  }
  const node = resp.data?.data?.node || resp.data?.data || {};
  const objType = node.obj_type || node.objType;
  const objToken = node.obj_token || node.objToken;
  if (objType && objType !== 'sheet') throw new Error(`Wiki 节点类型不是电子表格：obj_type=${objType}`);
  if (!objToken) throw new Error(`Wiki 节点没有返回 obj_token：${JSON.stringify(resp.data)}`);
  return objToken;
}

async function readFeishuRange(spreadsheetToken, tenantToken, range) {
  const url = `${FEISHU_BASE}/sheets/v2/spreadsheets/${spreadsheetToken}/values/${encodeURIComponent(range)}`;
  const resp = await axios.get(url, {
    headers: { Authorization: `Bearer ${tenantToken}` }
  });
  if (resp.data.code !== 0) {
    throw new Error(`读取飞书范围失败：${resp.data.msg || JSON.stringify(resp.data)}`);
  }
  return resp.data?.data?.valueRange?.values || [];
}

async function loadFromFeishu() {
  const configs = parseRangesConfig();
  if (!configs.length) throw new Error('缺少 FEISHU_SHEET_RANGES。');
  const tenantToken = await getTenantAccessToken();
  const spreadsheetToken = await resolveSpreadsheetToken(tenantToken);
  const all = [];
  for (const cfg of configs) {
    const values = await readFeishuRange(spreadsheetToken, tenantToken, cfg.range);
    all.push(...mapRowsToFixtures(values, cfg.factory));
  }
  return all;
}

function loadFromLocalXlsx() {
  const localPath = process.env.LOCAL_XLSX_PATH;
  if (!localPath) return null;
  const absolute = path.isAbsolute(localPath) ? localPath : path.join(__dirname, localPath);
  if (!fs.existsSync(absolute)) throw new Error(`LOCAL_XLSX_PATH 不存在：${absolute}`);
  const workbook = XLSX.readFile(absolute, { cellDates: false });
  const all = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const values = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, blankrows: false });
    all.push(...mapRowsToFixtures(values, sheetName));
  }
  return all;
}

app.get('/api/fixtures', async (req, res) => {
  try {
    let data = loadFromLocalXlsx();
    let source = 'local-xlsx';
    if (!data) {
      data = await loadFromFeishu();
      source = 'feishu';
    }
    res.json({ ok: true, source, updatedAt: new Date().toISOString(), count: data.length, data });
  } catch (error) {
    res.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`治具外发交期跟催看板已启动：http://localhost:${PORT}`);
});
