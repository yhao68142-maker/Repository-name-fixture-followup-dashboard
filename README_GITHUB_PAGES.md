# 治具外发交期跟催看板：飞书云文档 + GitHub Pages 部署版

## 重要说明

GitHub Pages 是静态网站托管，只能安全地放 HTML/CSS/JS/JSON，不能在网页前端保存飞书 App Secret。
所以本项目采用：

飞书云文档 → GitHub Actions 使用 Secrets 拉取数据 → 生成 public/data/fixtures.json → GitHub Pages 展示看板。

刷新机制：
- 默认每天北京时间 08:30 自动同步一次。
- 也可以在 GitHub Actions 页面手动点击 Run workflow 立即同步。
- 网页上的“刷新页面数据”只是重新读取已经发布的 fixtures.json，不会直接调用飞书。

如果你需要打开网页时实时读取飞书，不能只用 GitHub Pages，需要 Vercel/Render/Cloudflare Worker 等后端服务。

---

## 一、上传项目到 GitHub

1. 打开 GitHub，创建一个新仓库，例如：
   `fixture-followup-dashboard`
2. 把本项目所有文件上传到仓库根目录。
3. 确认仓库里有这些文件：
   - `public/index.html`
   - `public/app.js`
   - `scripts/fetch-feishu-data.js`
   - `.github/workflows/update-and-deploy.yml`
   - `package.json`

---

## 二、设置 GitHub Pages

进入仓库：

`Settings → Pages`

把 Source 设置为：

`GitHub Actions`

保存。

---

## 三、设置 GitHub Secrets

进入仓库：

`Settings → Secrets and variables → Actions → New repository secret`

添加下面 Secrets。

### 必填 1：飞书应用凭证

| Secret 名称 | 值 |
|---|---|
| `FEISHU_APP_ID` | 飞书开放平台自建应用的 App ID |
| `FEISHU_APP_SECRET` | 飞书开放平台自建应用的 App Secret |

### 必填 2：飞书表格来源，二选一

如果你使用的是 Wiki 链接：

`https://zj-innolight.feishu.cn/wiki/BxSgwTdZUiFI56kPBLNcoAclnId`

添加：

| Secret 名称 | 值 |
|---|---|
| `FEISHU_WIKI_NODE_TOKEN` | `BxSgwTdZUiFI56kPBLNcoAclnId` |

同时可以不填 `FEISHU_SPREADSHEET_TOKEN`。

如果你拿到了普通电子表格链接：

`https://xxx.feishu.cn/sheets/shtcnxxxxxx?sheet=3b87c3`

添加：

| Secret 名称 | 值 |
|---|---|
| `FEISHU_SPREADSHEET_TOKEN` | `shtcnxxxxxx` |

同时可以不填 `FEISHU_WIKI_NODE_TOKEN`。

### 必填 3：读取范围

| Secret 名称 | 示例值 |
|---|---|
| `FEISHU_SHEET_RANGES` | `苏州|3b87c3!A1:T5000` |

多个厂区/工作表时，用英文逗号分隔：

`苏州|3b87c3!A1:T5000,铜陵|xxxxxx!A1:T5000,泰国|yyyyyy!A1:T5000`

---

## 四、飞书开放平台权限

飞书自建应用至少需要：

- 获取 tenant_access_token 的能力；
- 读取云文档/电子表格的权限；
- 如果使用 Wiki 链接，还需要读取知识库节点信息的权限；
- 该应用必须有权限访问目标 Wiki/表格。

常见处理方式：

1. 在飞书开放平台创建企业自建应用；
2. 开通云文档、电子表格、知识库读取相关权限；
3. 发布应用版本；
4. 确认目标 Wiki/表格对该应用可访问。

---

## 五、手动运行同步和部署

进入仓库：

`Actions → Update Feishu Data and Deploy Pages → Run workflow`

等待 workflow 变成绿色成功。

成功后到：

`Settings → Pages`

查看网站地址，一般类似：

`https://你的用户名.github.io/fixture-followup-dashboard/`

---

## 六、常见错误

### 1. 解析 Wiki 节点失败

检查：

- `FEISHU_WIKI_NODE_TOKEN` 是否只填了 `/wiki/` 后面的 token；
- 飞书应用是否有知识库读取权限；
- 飞书应用是否有权限访问该 Wiki 页面。

### 2. Wiki 节点类型不是 sheet

说明这个 Wiki 链接背后不是电子表格，可能是 docx、bitable 或其他类型。
需要确认页面里的表格是否是真正飞书电子表格。

### 3. 读取飞书范围失败

检查：

- `FEISHU_SHEET_RANGES` 中的 sheetId 是否正确，例如 `3b87c3`；
- 范围格式是否为 `3b87c3!A1:T5000`；
- 表格是否超过读取范围；
- 应用是否有电子表格读取权限。

### 4. 网页打开了但是没数据

检查 Actions 日志里是否已经生成：

`public/data/fixtures.json`

如果 workflow 失败，网页会没有最新数据。

---

## 七、本地测试飞书读取

在本地新建 `.env`，参考 `.env.example` 填写，然后运行：

```bash
npm install
npm run fetch:feishu
npm start
```

浏览器打开：

`http://localhost:3000`

