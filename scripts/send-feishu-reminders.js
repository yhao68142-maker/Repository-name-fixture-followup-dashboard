const fs = require('fs');
const path = require('path');
const axios = require('axios');

const WEBHOOK_URL = process.env.FEISHU_REMINDER_WEBHOOK;
const DATA_FILE = path.join(__dirname, '../public/data/fixtures.json');
const CHINA_HOLIDAYS = new Set(
  String(process.env.CHINA_HOLIDAYS || '')
    .split(',')
    .map(date => date.trim())
    .filter(Boolean)
);

function getChinaDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short'
  }).formatToParts(date);

  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

function getChinaTodayString(date = new Date()) {
  const parts = getChinaDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dateToDayNumber(dateText) {
  const match = String(dateText || '').trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!match) return null;
  return Math.floor(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86400000);
}

function isChinaWeekend(date = new Date()) {
  const weekday = getChinaDateParts(date).weekday;
  return weekday === 'Sat' || weekday === 'Sun';
}

function isChinaHoliday(todayText) {
  return CHINA_HOLIDAYS.has(todayText);
}

function shouldSkipToday() {
  const todayText = getChinaTodayString();
  if (isChinaWeekend()) {
    return { skip: true, reason: `今天是中国周末：${todayText}` };
  }
  if (isChinaHoliday(todayText)) {
    return { skip: true, reason: `今天是中国法定假期：${todayText}` };
  }
  return { skip: false, todayText };
}

function parseDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  const match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function daysBetweenDateText(fromText, toText) {
  const fromDay = dateToDayNumber(fromText);
  const toDay = dateToDayNumber(toText);
  if (fromDay === null || toDay === null) return null;
  return toDay - fromDay;
}

function isDelivered(item) {
  return String(item.currentStatus || item.outsourceStatus || '').includes('已领用');
}

function isAudit(item) {
  const status = String(item.currentStatus || item.outsourceStatus || '');
  return status.includes('仓库验收中') || status.includes('打样中');
}

function shouldRemind(daysLeft) {
  if (daysLeft < 0) return true;
  if (daysLeft <= 5) return true;
  if (daysLeft <= 14) return (14 - daysLeft) % 3 === 0;
  return false;
}

function reminderLevel(daysLeft) {
  if (daysLeft < 0) return 'overdue';
  if (daysLeft <= 5) return 'urgent';
  return 'normal';
}

function levelText(level, daysLeft) {
  if (level === 'overdue') return `已延期 ${Math.abs(daysLeft)} 天`;
  if (level === 'urgent') return `剩余 ${daysLeft} 天，每日追踪`;
  return `剩余 ${daysLeft} 天，提前两周提醒`;
}

function groupBySupplier(items) {
  const groups = new Map();
  for (const item of items) {
    const key = item.supplier || '未填写厂商';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()];
}

function itemLine(item) {
  const code = item.fixtureCode || '-';
  const name = item.fixtureName || '-';
  const due = item.dueDate || '-';
  const designer = item.designer || '-';
  const factory = item.factory || item.sourceFactory || '-';
  return `- ${code}｜${name}｜交期：${due}｜设计：${designer}｜厂区：${factory}`;
}

function buildTextMessage(items, updatedAt) {
  const overdue = items.filter(item => item.level === 'overdue');
  const urgent = items.filter(item => item.level === 'urgent');
  const normal = items.filter(item => item.level === 'normal');

  const lines = [];
  lines.push('【治具交期自动提醒】');
  lines.push(`数据更新时间：${updatedAt ? new Date(updatedAt).toLocaleString('zh-CN') : '-'}`);
  lines.push('');

  if (overdue.length) {
    lines.push('🚨🚨🚨【已延期，请今天重点追踪】🚨🚨🚨');
    for (const [supplier, list] of groupBySupplier(overdue)) {
      lines.push(`厂商：${supplier}`);
      list.slice(0, 20).forEach(item => lines.push(`${levelText(item.level, item.daysLeft)} ${itemLine(item)}`));
      if (list.length > 20) lines.push(`还有 ${list.length - 20} 条延期项目未展开，请到看板确认。`);
      lines.push('');
    }
  }

  if (urgent.length) {
    lines.push('【剩余 5 天内，每日追踪】');
    for (const [supplier, list] of groupBySupplier(urgent)) {
      lines.push(`厂商：${supplier}`);
      list.slice(0, 20).forEach(item => lines.push(`${levelText(item.level, item.daysLeft)} ${itemLine(item)}`));
      if (list.length > 20) lines.push(`还有 ${list.length - 20} 条临近项目未展开，请到看板确认。`);
      lines.push('');
    }
  }

  if (normal.length) {
    lines.push('【提前两周，每三天提醒】');
    for (const [supplier, list] of groupBySupplier(normal)) {
      lines.push(`厂商：${supplier}`);
      list.slice(0, 20).forEach(item => lines.push(`${levelText(item.level, item.daysLeft)} ${itemLine(item)}`));
      if (list.length > 20) lines.push(`还有 ${list.length - 20} 条两周内项目未展开，请到看板确认。`);
      lines.push('');
    }
  }

  lines.push('请相关责任人确认厂商交付进度，并在飞书表格中更新最新状态。');
  return lines.join('\n');
}

function buildFeishuCard(items, updatedAt) {
  const overdue = items.filter(item => item.level === 'overdue');
  const urgent = items.filter(item => item.level === 'urgent');
  const normal = items.filter(item => item.level === 'normal');
  const elements = [];

  elements.push({
    tag: 'div',
    text: {
      tag: 'lark_md',
      content: `数据更新时间：${updatedAt ? new Date(updatedAt).toLocaleString('zh-CN') : '-'}\n本次需提醒：**${items.length}** 条`
    }
  });

  if (overdue.length) {
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `<font color='red'>**🚨 已延期，请今天重点追踪：${overdue.length} 条**</font>`
      }
    });
    for (const [supplier, list] of groupBySupplier(overdue)) {
      const content = [`**厂商：${supplier}**`]
        .concat(list.slice(0, 10).map(item => `<font color='red'>**${levelText(item.level, item.daysLeft)}**</font> ${itemLine(item)}`))
        .concat(list.length > 10 ? [`还有 ${list.length - 10} 条延期项目未展开，请到看板确认。`] : [])
        .join('\n');
      elements.push({ tag: 'div', text: { tag: 'lark_md', content } });
    }
  }

  if (urgent.length) {
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**⚠️ 剩余 5 天内，每日追踪：${urgent.length} 条**`
      }
    });
    for (const [supplier, list] of groupBySupplier(urgent)) {
      const content = [`**厂商：${supplier}**`]
        .concat(list.slice(0, 10).map(item => `**${levelText(item.level, item.daysLeft)}** ${itemLine(item)}`))
        .concat(list.length > 10 ? [`还有 ${list.length - 10} 条临近项目未展开，请到看板确认。`] : [])
        .join('\n');
      elements.push({ tag: 'div', text: { tag: 'lark_md', content } });
    }
  }

  if (normal.length) {
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: `**📌 提前两周，每三天提醒：${normal.length} 条**`
      }
    });
    for (const [supplier, list] of groupBySupplier(normal)) {
      const content = [`**厂商：${supplier}**`]
        .concat(list.slice(0, 10).map(item => `${levelText(item.level, item.daysLeft)} ${itemLine(item)}`))
        .concat(list.length > 10 ? [`还有 ${list.length - 10} 条两周内项目未展开，请到看板确认。`] : [])
        .join('\n');
      elements.push({ tag: 'div', text: { tag: 'lark_md', content } });
    }
  }

  elements.push({
    tag: 'div',
    text: {
      tag: 'lark_md',
      content: '请相关责任人确认厂商交付进度，并在飞书表格中更新最新状态。'
    }
  });

  return {
    msg_type: 'interactive',
    card: {
      config: {
        wide_screen_mode: true
      },
      header: {
        template: overdue.length ? 'red' : urgent.length ? 'orange' : 'blue',
        title: {
          tag: 'plain_text',
          content: overdue.length ? '🚨 治具交期延期提醒' : '治具交期自动提醒'
        }
      },
      elements
    }
  };
}

async function sendFeishuMessage(items, updatedAt) {
  if (!WEBHOOK_URL) {
    throw new Error('缺少 FEISHU_REMINDER_WEBHOOK，请在 GitHub Secrets 中配置飞书机器人 Webhook。');
  }

  await axios.post(WEBHOOK_URL, buildFeishuCard(items, updatedAt));
}

async function main() {
  const skip = shouldSkipToday();
  if (skip.skip) {
    console.log(`${skip.reason}，跳过发送飞书提醒。`);
    return;
  }

  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(`数据文件不存在：${DATA_FILE}`);
  }

  const json = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const todayText = getChinaTodayString();
  const source = Array.isArray(json.data) ? json.data : [];

  const targets = source
    .filter(item => item && item.dueDate)
    .filter(item => !isDelivered(item))
    .filter(item => !isAudit(item))
    .map(item => {
      const due = parseDate(item.dueDate);
      if (!due) return null;
      const daysLeft = daysBetweenDateText(todayText, item.dueDate);
      if (daysLeft === null) return null;
      const level = reminderLevel(daysLeft);
      return { ...item, daysLeft, level };
    })
    .filter(Boolean)
    .filter(item => shouldRemind(item.daysLeft))
    .sort((a, b) => a.daysLeft - b.daysLeft);

  if (!targets.length) {
    console.log('今天没有需要提醒的治具。');
    return;
  }

  const text = buildTextMessage(targets, json.updatedAt);
  console.log(text);
  await sendFeishuMessage(targets, json.updatedAt);
  console.log(`已发送飞书提醒，共 ${targets.length} 条。`);
}

main().catch(err => {
  console.error(err.message);
  if (err.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});
