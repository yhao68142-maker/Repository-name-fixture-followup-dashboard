/*
  Fetch Feishu/Lark spreadsheet data and generate public/data/fixtures.json.
  Supports either:
  1) FEISHU_SPREADSHEET_TOKEN=shtcnxxx
  2) FEISHU_WIKI_NODE_TOKEN=BxS...  -> resolves obj_token through Wiki API first
*/
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const FEISHU_BASE = 'https://open.feishu.cn/open-apis';
const columnMap = require('../data/column-map.json');

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
  for (const [key, candidates] of Object.entries(columnMap)) indexes[key] = findColumnIndex(headers, candidates);

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
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;
  if (!appId || !appSecret) throw new Error('缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET。');
  const resp = await axios.post(`${FEISHU_BASE}/auth/v3/tenant_access_token/internal`, {
    app_id: appId,
    app_secret: appSecret
  });
  if (resp.data.code !== 0) throw new Error(`获取 tenant_access_token 失败：${resp.data.msg || JSON.stringify(resp.data)}`);
  return resp.data.tenant_access_token;
}

async function resolveSpreadsheetToken(token) {
  if (process.env.FEISHU_SPREADSHEET_TOKEN) return process.env.FEISHU_SPREADSHEET_TOKEN;
  const wikiNodeToken = process.env.FEISHU_WIKI_NODE_TOKEN;
  if (!wikiNodeToken) throw new Error('缺少 FEISHU_SPREADSHEET_TOKEN 或 FEISHU_WIKI_NODE_TOKEN。');

  const url = `${FEISHU_BASE}/wiki/v2/spaces/get_node?token=${encodeURIComponent(wikiNodeToken)}`;
  const resp = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
  if (resp.data.code !== 0) throw new Error(`解析 Wiki 节点失败：${resp.data.msg || JSON.stringify(resp.data)}`);

  const node = resp.data?.data?.node || resp.data?.data || {};
  const objType = node.obj_type || node.objType;
  const objToken = node.obj_token || node.objToken;
  if (objType && objType !== 'sheet') throw new Error(`Wiki 节点类型不是电子表格：obj_type=${objType}`);
  if (!objToken) throw new Error(`Wiki 节点没有返回 obj_token：${JSON.stringify(resp.data)}`);
  return objToken;
}

function parseRangesConfig() {
  const ranges = String(process.env.FEISHU_SHEET_RANGES || '').split(',').map(s => s.trim()).filter(Boolean);
  return ranges.map(item => {
    const [factory, range] = item.includes('|') ? item.split('|') : ['', item];
    return { factory: factory.trim(), range: range.trim() };
  });
}

async function readFeishuRange(spreadsheetToken, tenantToken, range) {
  const url = `${FEISHU_BASE}/sheets/v2/spreadsheets/${spreadsheetToken}/values/${encodeURIComponent(range)}`;
  const resp = await axios.get(url, { headers: { Authorization: `Bearer ${tenantToken}` } });
  if (resp.data.code !== 0) throw new Error(`读取飞书范围失败 ${range}：${resp.data.msg || JSON.stringify(resp.data)}`);
  return resp.data?.data?.valueRange?.values || [];
}

async function main() {
  const tenantToken = await getTenantAccessToken();
  const spreadsheetToken = await resolveSpreadsheetToken(tenantToken);
  const configs = parseRangesConfig();
  if (!configs.length) throw new Error('缺少 FEISHU_SHEET_RANGES，例如：苏州|3b87c3!A1:T5000');

  const all = [];
  for (const cfg of configs) {
    console.log(`读取：${cfg.factory || '-'} ${cfg.range}`);
    const values = await readFeishuRange(spreadsheetToken, tenantToken, cfg.range);
    all.push(...mapRowsToFixtures(values, cfg.factory));
  }

  const out = {
    ok: true,
    source: process.env.FEISHU_WIKI_NODE_TOKEN ? 'feishu-wiki' : 'feishu-sheet',
    updatedAt: new Date().toISOString(),
    count: all.length,
    data: all
  };
  const outPath = path.join(__dirname, '../public/data/fixtures.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`已生成 ${outPath}，共 ${all.length} 条。`);
}

main().catch((err) => {
  console.error('=== ERROR MESSAGE ===');
  console.error(err.message);

  if (err.response) {
    console.error('=== HTTP STATUS ===');
    console.error(err.response.status);

    console.error('=== RESPONSE DATA ===');
    console.error(JSON.stringify(err.response.data, null, 2));

    console.error('=== RESPONSE HEADERS ===');
    console.error(JSON.stringify(err.response.headers, null, 2));
  }

  process.exit(1);
});
