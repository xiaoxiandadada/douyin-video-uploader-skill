# 抖音视频自动发布 Skill

这是一个 Codex skill，用于从本地内容队列自动上传并发布抖音创作者中心视频。它的核心发布器使用本机 Chrome/Edge + Playwright Core，因此可以直接通过 `setInputFiles` 上传本地 `mp4`，绕过 in-app browser 无法设置文件输入的问题。

## 功能

- 从 `content_calendar_day1_day2.csv` 和 `tracking.csv` 解析待发布视频。
- 自动打开抖音创作者中心发布页。
- 自动上传本地视频文件。
- 自动填写标题和作品描述。
- 自动选择 AI 内容声明。
- 支持即时发布。
- 支持抖音允许范围内的定时发布：距离当前至少 2 小时、最多 14 天。
- 只在上传进度稳定完成、且抖音返回发布成功/审核中/跳转确认后，写回 `tracking.csv` 的 `posted_url` 字段。
- 点击发布后如果出现短信验证码或原设备扫码验证，脚本会停止并保持 `tracking.csv` 未发布状态。
- 保留 in-app browser 和 macOS 文件选择器备用流程。

## 目录结构

```text
douyin-video-uploader/
├── SKILL.md
├── agents/openai.yaml
├── references/douyin_creator_center.md
├── scripts/
│   ├── douyin_playwright_publisher.mjs
│   ├── douyin_upload_helper.mjs
│   ├── queue_payload.py
│   ├── diagnose_macos_upload_permission.sh
│   ├── file_chooser_macos.applescript
│   └── macos_click_upload_and_choose.applescript
├── package.json
└── package-lock.json
```

## 安装

在 skill 目录内安装依赖：

```bash
npm install
```

需要本机已安装 Google Chrome 或 Microsoft Edge。

## 首次登录

第一次运行时，自动发布器会打开一个独立的 Chrome/Edge 持久用户目录。如果该浏览器配置尚未登录抖音，请使用：

```bash
node scripts/douyin_playwright_publisher.mjs \
  --project /Users/fairy/Documents/future/asmr_douyin_2day_launch \
  --index 12 \
  --wait-login
```

在打开的浏览器窗口中完成抖音登录。登录状态会保存在：

```text
~/.codex/douyin-playwright-profile
```

后续发布会复用该登录状态。

## 自动发布

```bash
node scripts/douyin_playwright_publisher.mjs \
  --project /Users/fairy/Documents/future/asmr_douyin_2day_launch \
  --index 12
```

常用参数：

- `--index N`：发布队列中的第 N 条。
- `--project <path>`：包含 `content_calendar_day1_day2.csv` 和 `tracking.csv` 的项目目录。
- `--wait-login`：等待用户在标准浏览器中完成登录。
- `--dry-run`：上传并填写表单，但不提交发布。
- `--user-data-dir <dir>`：指定持久浏览器登录目录。
- `--browser-executable <path>`：指定 Chrome 或 Edge 可执行文件。

## 定时发布规则

抖音创作者中心当前只允许设置：

- 至少 2 小时后的定时发布。
- 最多 14 天内的定时发布。

因此脚本逻辑是：

- 距目标发布时间 `>= 2 小时`：选择 `定时发布` 并填写时间。
- 距目标发布时间 `< 2 小时` 或已过期：使用即时发布。

## 队列数据要求

项目目录应至少包含：

```text
content_calendar_day1_day2.csv
tracking.csv
mobile_2day_upload_bundles/<NN_name>/video.mp4
mobile_2day_upload_bundles/<NN_name>/caption.txt
mobile_2day_upload_bundles/<NN_name>/pinned_comment.txt
```

`queue_payload.py` 会根据 `--index` 生成发布 payload。

## 安全说明

- 不提交账号密码或验证码。
- 登录只在本机 Chrome/Edge 用户目录中完成。
- 默认不上传 `node_modules`、缓存、`.env` 或浏览器 profile。
- 如果要开源此仓库，请先检查 `SKILL.md` 和示例路径中是否包含不希望公开的本地目录信息。

## 验证

```bash
python3 /Users/fairy/.codex/skills/.system/skill-creator/scripts/quick_validate.py .
node --check scripts/douyin_playwright_publisher.mjs
```

## 许可证

ISC
