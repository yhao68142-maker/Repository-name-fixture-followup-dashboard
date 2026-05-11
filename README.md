# 治具外发交期跟催数据看板

面向治具外发管理场景的轻量化网页看板。数据源来自飞书云表格，页面部署在 GitHub Pages。

## 功能

- 读取飞书 Wiki 表格全部 Sheet 页签。
- 按项目页签、厂区、厂商、设计人员、交期状态、日期区间筛选。
- 自动识别已延期、今天到期、3天内、7天内、一个月内、已完成等状态。
- 提供交付率、延期率、当前达成率看板。
- 按厂区、厂商、设计人员、Sheet 页签进行分组统计。
- 生成微信跟催话术并一键复制。

## GitHub Pages 推荐配置

GitHub Secrets：

```text
FEISHU_APP_ID=你的飞书 App ID
FEISHU_APP_SECRET=你的飞书 App Secret
FEISHU_WIKI_NODE_TOKEN=BxSgwTdZUiFI56kPBLNcoAclnId
FEISHU_SHEET_RANGES=ALL
```

部署：

```text
Settings → Pages → Source → GitHub Actions
Actions → Update Feishu Data and Deploy Pages → Run workflow
```
