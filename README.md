# 治具外发交期跟催看板

这个网页用于读取飞书云表格中的治具外发数据，并实现：

- 按 **厂商 / 设计人员 / 厂区 / 交期状态 / 日期范围 / 关键词** 筛选
- 自动判断 **已延期、今天到期、3天内交付、7天内交付、一个月内交付、已完成**
- 按厂商自动汇总生成个人微信跟催话术
- 一键复制到剪贴板，再由人工粘贴到个人微信发送

> 设计原则：网页不自动操作个人微信，避免误发、封号和维护风险。

---

## 1. 目录结构

```text
fixture-followup-web/
├─ server.js                 # Node.js 后端，负责读取飞书 API
├─ package.json              # 依赖配置
├─ .env.example              # 环境变量模板
├─ data/
│  └─ column-map.json        # 表格字段映射配置
└─ public/
   ├─ index.html             # 前端页面
   ├─ styles.css             # 页面样式
   └─ app.js                 # 筛选、统计、话术生成逻辑
```

---

## 2. 安装运行

### 第一步：安装 Node.js

建议安装 Node.js 18 或以上版本。

### 第二步：安装依赖

进入项目目录后运行：

```bash
npm install
```

### 第三步：配置 `.env`

复制配置模板：

```bash
copy .env.example .env
```

Mac/Linux：

```bash
cp .env.example .env
```

然后编辑 `.env`。

### 第四步：启动

```bash
npm start
```

浏览器打开：

```text
http://localhost:3000
```

---

## 3. 飞书配置方法

### 3.1 创建飞书自建应用

在飞书开放平台创建企业自建应用，并记录：

```text
FEISHU_APP_ID
FEISHU_APP_SECRET
```

### 3.2 开通权限

至少需要开通云文档/电子表格读取相关权限，例如读取电子表格内容、查看云文档等。开通后通常需要发布应用版本，并让管理员审批。

### 3.3 授权表格给应用

应用有权限还不够，还要确保该应用能访问你的表格。常见方式：

1. 把应用添加为该文档/知识库可访问对象；或  
2. 在飞书开放平台按官方文档完成云文档授权。

否则 API 可能返回“无权限”或数据为空。

### 3.4 获取 spreadsheet token

你提供的链接是：

```text
https://zj-innolight.feishu.cn/wiki/BxSgwTdZUiFI56kPBLNcoAclnId?sheet=3b87c3
```

注意：`/wiki/BxSgwTdZUiFI56kPBLNcoAclnId` 不一定就是电子表格 API 所需的 `spreadsheetToken`。

需要根据飞书开放平台官方说明，确认该 wiki 节点下挂载的真实云资源 token。官方说明里提到，可以通过知识库节点信息获取该节点挂载云资源的 `obj_token` 和 `obj_type`。

最终 `.env` 应类似：

```env
FEISHU_APP_ID=cli_xxxxxxxxxxxxx
FEISHU_APP_SECRET=xxxxxxxxxxxxxxxx
FEISHU_SPREADSHEET_TOKEN=shtcnxxxxxxxxxxxxxxxx
FEISHU_SHEET_RANGES=苏州|3b87c3!A1:T5000
```

如果多个 sheet：

```env
FEISHU_SHEET_RANGES=苏州|3b87c3!A1:T5000,铜陵|xxxxxx!A1:T5000,泰国|yyyyyy!A1:T5000
```

---

## 4. 本地 Excel 测试模式

如果飞书 API 暂时没配好，可以先用本地 Excel 测试页面功能。

把 Excel 放到：

```text
data/fixture.xlsx
```

然后 `.env` 写：

```env
LOCAL_XLSX_PATH=./data/fixture.xlsx
```

此时系统会优先读取本地 Excel，不走飞书 API。

测试完飞书后，把这一行清空：

```env
LOCAL_XLSX_PATH=
```

---

## 5. 表格字段要求

系统会自动识别以下字段名。你的表格可以使用中文或中英混合表头：

| 系统字段 | 可识别表头 |
|---|---|
| 厂区 | 厂区、工厂、Factory、Plant |
| 申请人 | 申请人、Required |
| 使用人 | 使用人、User |
| 设计人员 | 设计、设计者、Design |
| 厂商 | 厂商、Supplier、供应商 |
| 治具编码 | 治具编码、系统编码、Fixture code |
| 治具名称 | 治具名称、Fixture name |
| 数量 | 数量、Qty.、Qty |
| 发包状态 | 治具状态、发包状态、Flow status |
| 交期 | 交货日期、预计交货日期、Estimated delivery date |
| 当前状态 | 治具现状态、Status |
| 备注 | 备注、Remark |
| PR单号 | PR单号、PR Number |

字段映射可以在 `data/column-map.json` 修改。

---

## 6. 交期判断规则

| 状态 | 判断逻辑 |
|---|---|
| 已完成 | 当前状态/发包状态/备注中包含：已领用、已交齐、已到货、已完成、Received、Done 等 |
| 已延期 | 未完成，且交期 < 今天 |
| 今天到期 | 未完成，且交期 = 今天 |
| 3天内交付 | 未完成，且今天 < 交期 ≤ 今天+3天 |
| 7天内交付 | 未完成，且今天+3天 < 交期 ≤ 今天+7天 |
| 一个月内交付 | 未完成，且今天+7天 < 交期 ≤ 今天+30天 |
| 一个月后 | 未完成，且交期 > 今天+30天 |
| 无交期 | 未填写或无法识别交期 |

---

## 7. 使用流程建议

1. 打开网页。
2. 点击“同步飞书数据”。
3. 选择交期状态，例如“已延期”或“3天内交付”。
4. 选择厂商，例如“博富仕”。
5. 检查表格中筛选出来的治具。
6. 点击“复制当前筛选话术”或勾选后点击“复制勾选话术”。
7. 打开个人微信，粘贴发送给对应厂商。

---

## 8. 后续可扩展功能

后续如果需要，可以继续增加：

- 标记“已跟催”并写回飞书表格
- 记录跟催日期、跟催人、厂商回复
- 导出当前筛选结果为 Excel
- 每天打开网页自动默认筛选“已延期 + 3天内交付”
- 切换企业微信后，升级成一键发送到企业微信群机器人

---

## 9. 安全注意事项

- 不要把 `.env` 发给外部人员。
- 不要把 `FEISHU_APP_SECRET` 写进前端 JS。
- 不建议把服务部署到公网，除非增加登录认证。
- 公司内部使用时，建议部署在内网电脑或内部服务器上。
