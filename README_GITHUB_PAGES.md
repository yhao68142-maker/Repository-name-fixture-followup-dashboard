# 治具外发交期跟催数据看板 - GitHub Pages 部署版

## 一、版本说明

本版本支持从飞书 Wiki 电子表格读取**所有 Sheet 页签**，并在 GitHub Pages 上生成静态网页看板。

主要功能：

- 自动读取飞书云表格所有 Sheet 页签。
- 支持按项目 / Sheet 页签筛选，例如：苏州治具、铜陵治具、泰国治具、加急治具、CO-NPI 治具需求、耦合治具库存。
- 支持按厂区、厂商、设计人员、交期状态、交期区间、关键词筛选。
- 支持用户自定义日期区间。
- 支持交付绩效看板：交付率、延期率、当前达成率。
- 支持按厂区、厂商、设计人员、Sheet 页签分组统计。
- 支持自动生成微信跟催话术并一键复制。

## 二、GitHub Secrets 配置

进入：

```text
Settings → Secrets and variables → Actions → New repository secret
```

至少配置以下内容：

| Secret 名称 | 示例 |
|---|---|
| FEISHU_APP_ID | cli_xxxxxxxxxxxxx |
| FEISHU_APP_SECRET | 飞书应用密钥 |
| FEISHU_WIKI_NODE_TOKEN | BxSgwTdZUiFI56kPBLNcoAclnId |
| FEISHU_SHEET_RANGES | ALL |

注意：新版建议将 `FEISHU_SHEET_RANGES` 设置为：

```text
ALL
```

这样程序会自动读取飞书表格里的全部 Sheet 页签，不需要手动填写每个 sheetId。

如果只想读取指定 Sheet，也可以写：

```text
苏州|3b87c3!A1:Z5000,铜陵|xxxxxx!A1:Z5000,泰国|yyyyyy!A1:Z5000
```

## 三、飞书权限

飞书开放平台应用建议开通以下读取权限：

- 查看知识空间节点信息 `wiki:node:read`
- 查看知识空间节点列表 `wiki:node:retrieve`
- 查看知识空间信息 `wiki:space:read`
- 查看电子表格 / 读取电子表格内容相关权限
- 查看云文档 / 云空间文件相关权限

添加权限后必须发布应用版本，否则 GitHub Actions 不会生效。

## 四、部署方式

进入 GitHub 仓库：

```text
Settings → Pages → Source → GitHub Actions
```

然后运行：

```text
Actions → Update Feishu Data and Deploy Pages → Run workflow
```

成功后，访问 GitHub Pages 地址即可。

## 五、检查数据文件

部署成功后，打开：

```text
https://你的用户名.github.io/仓库名/data/fixtures.json
```

如果能看到 JSON，说明飞书数据已经成功同步。

## 六、指标定义

当前版本指标定义如下：

- 交付率 = 已完成项目数 / 当前筛选总项目数
- 延期率 = 未完成且交期已过项目数 / 当前筛选总项目数
- 当前达成率 = 未延期项目数 / 当前筛选总项目数

如果后续表格增加“实际到货日期”字段，可升级为：

- 准时交付率 = 实际到货日期 <= 预计交期 的项目数 / 已完成项目数

## 七、使用建议

日常使用流程：

1. GitHub Actions 每天自动同步一次飞书数据。
2. 打开网页看板。
3. 选择 Sheet 页签、厂区、厂商、设计人员、交期状态或日期区间。
4. 查看交付率、延期率、达成率。
5. 勾选需要跟催的治具。
6. 点击复制话术。
7. 粘贴到个人微信发送给对应厂商。

