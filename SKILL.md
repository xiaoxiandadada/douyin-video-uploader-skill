---
name: douyin-video-uploader
description: Automate Douyin Creator Center video uploads and scheduled publishing from a local content queue. Use when the user asks Codex to upload, publish, schedule, batch post, or continue a Douyin/TikTok China video queue, especially for the extreme-choice ASMR Douyin launch project in /Users/fairy/Documents/future/asmr_douyin_2day_launch.
---

# Douyin Video Uploader

## Core Rule

Confirm only the exact video/payload and destination account/action. Once the user clearly authorizes that specific item, continue through upload, form fill, AI declaration, scheduling/immediate publishing, and tracking updates without asking for more clicks.

Examples of sufficient authorization:

- "确认上传第一条"
- "可以上传这个视频"
- "定时发下一条到 08:10"
- "这条可以直接发布"

Ask again only when the video, account, platform, caption, schedule time, or final publishing mode is ambiguous.

## Workflow

1. Prefer the standard-browser publisher for fully automatic upload/publish:
   - Run `scripts/douyin_playwright_publisher.mjs --project /Users/fairy/Documents/future/asmr_douyin_2day_launch --index N`.
   - It launches local Chrome/Edge with a persistent profile, uses Playwright `setInputFiles` for the video, fills metadata, selects AI declaration, sets timing, submits, and updates `tracking.csv`.
   - It updates `tracking.csv` only after upload progress has settled and Douyin shows a publish confirmation state. A clicked publish button alone is not treated as success.
   - If that browser profile is not logged in, rerun with `--wait-login`, let the user log in once in the launched Chrome/Edge window, then continue. Future runs reuse the same profile.
2. If browser control is needed only for the in-app browser, first load the Browser skill and bootstrap the in-app browser.
3. Resolve the upload payload:
   - For the launch project, run `scripts/queue_payload.py --project /Users/fairy/Documents/future/asmr_douyin_2day_launch`.
   - Use `--index N` when the user says "第 N 条".
   - Use `--video`, `--title`, and `--caption` for ad hoc videos outside the queue.
4. Open or reuse Douyin Creator Center:
   - Upload URL: `https://creator.douyin.com/creator-micro/content/post/video?enter_from=publish_page`
   - If not logged in, stop and tell the user to log in, then resume.
5. Upload the resolved video file.
   - In the standard-browser publisher, upload with Playwright `setInputFiles`; this is the primary automatic path.
   - Prefer a real file input / supported file-upload API if present.
   - If the in-app browser cannot set local files, use the macOS system-click fallback in `scripts/macos_click_upload_and_choose.applescript`. It activates the browser host window, clicks the visible upload drop zone, opens "Go to folder", pastes the absolute `video_file`, and confirms.
   - If the native file chooser is already open, use `scripts/file_chooser_macos.applescript` directly with the absolute `video_file`.
   - If macOS blocks accessibility/automation, run `scripts/diagnose_macos_upload_permission.sh` and tell the user exactly which one-time permission is missing.
   - After any upload attempt, always verify the page shows a real upload state before continuing: a preview/video card, "重新上传", "快速检测", "视频预览", "作品预览", or equivalent. If the page still shows "点击上传" and the file input has no value, treat it as not uploaded, refill any metadata that was reset, and do not submit.
   - Only if every automatic file-upload path fails after permissions are allowed, show the upload page to the user and ask them to click the visible upload box and select the exact resolved `video_file`; resume automatically after verification.
6. Fill the publish form:
   - Title: use `title_for_douyin` from `queue_payload.py`.
   - Description: use `caption`.
   - Visibility: keep public unless the user asked otherwise.
   - Comments/downloads/interaction defaults: keep permissive unless the user asked otherwise.
   - AI/self declaration: if the page exposes "自主声明", "AI生成", "人工智能生成", or equivalent options, select the AI-generated option.
   - Cover: use `cover_file` when the UI supports cover upload; otherwise accept the generated first-frame cover if this is not blocking.
7. Choose publish timing:
   - Douyin scheduled publishing only supports times at least 2 hours ahead and within 14 days.
   - If the payload's scheduled slot is more than 2 hours away, select `定时发布` and fill `YYYY-MM-DD HH:MM`.
   - If the scheduled slot is less than 2 hours away, inside the publish window, or late, publish immediately unless the user explicitly asks to hold it.
8. Submit after the earlier video-level authorization has covered this exact action. Do not ask for another confirmation merely because the button says "发布", "定时发布", or "确认".
9. After success:
   - Capture the visible success state and URL if available.
   - Update `tracking.csv` via `scripts/queue_payload.py --project <root> --index N --mark-posted-url <url-or-success-note>`.
   - If the page does not show a success/audit/redirect confirmation after clicking publish, do not update `tracking.csv`; report the visible state and retry or diagnose the blocker.
   - If Douyin shows an SMS verification or original-device scan challenge after clicking publish, do not mark the item as published. With `--wait-login`, keep the launched Chrome/Edge window open and wait for the user to complete verification there, then continue waiting for publish confirmation.
   - If the user has authorized mirrored-phone OTP automation, pass `--auto-otp-from-screen` while the iPhone mirror/SMS window is visible, or pass `--otp-image <screenshot>`. The publisher extracts only the current 6-digit Douyin OTP, fills it into Douyin, never logs the code, and never stores it.
   - If comments are available, post/pin the `pinned_comment`; otherwise report it as the next manual/mobile step.

## Browser Helper

Use `scripts/douyin_upload_helper.mjs` from the Node REPL after Browser setup. It provides:

- `inspectDouyinPage(tab)`
- `verifyVideoUploadAccepted(tab)`
- `dismissKnownDouyinModals(tab)`
- `fillDouyinMetadata(tab, payload)`
- `tryDeclareAiGenerated(tab)`
- `findPublishControls(tab)`
- `attemptSubmitDouyin(tab, { scheduleAt, immediate })`

These helpers are defensive. If Douyin changes labels, inspect a fresh DOM snapshot and update selectors locally rather than guessing.

## Standard Browser Publisher

Use this as the default path when the user wants real automatic publishing:

```bash
cd /Users/fairy/.codex/skills/douyin-video-uploader
/Users/fairy/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
  scripts/douyin_playwright_publisher.mjs \
  --project /Users/fairy/Documents/future/asmr_douyin_2day_launch \
  --index 12
```

Useful options:

- `--wait-login`: keep the Chrome/Edge window open while the user logs in once.
- `--dry-run`: upload and fill the form but do not submit.
- `--auto-otp-from-screen`: when Douyin asks for SMS verification, capture the current Mac screen and OCR the visible iPhone mirror/SMS window for a 6-digit Douyin code. Use only after the user explicitly authorizes this for their Douyin account.
- `--otp-image <path>`: read a one-off screenshot with a visible Douyin SMS code and fill that code if a verification challenge appears.
- `--user-data-dir <dir>`: choose a persistent login profile.
- `--browser-executable <path>`: choose Chrome or Edge explicitly.

This path is preferred because in-app Browser may not expose file-upload APIs, while Playwright Core against Chrome/Edge can use `setInputFiles` directly.

Scheduling behavior: the publisher automatically uses immediate publishing when the target time is under Douyin's 2-hour scheduling minimum; otherwise it selects `定时发布` and fills the date-time input.

## Manual File Selection Handoff

When the page blocks automated file selection after both scripted upload paths fail:

1. Keep the in-app browser visible on the Douyin upload page.
2. Put the absolute `video_file` path in the clipboard when possible.
3. Tell the user to click the visible upload box, press `Cmd+Shift+G`, paste the path, and confirm.
4. After the user replies that the file is selected, call `verifyVideoUploadAccepted(tab)`.
5. Continue with metadata, AI declaration, timing, and submit only when `accepted` is true. If `accepted` is false, report the visible state and retry from the upload step.

## Fully Automatic Upload Fallback

Use this when `detectVideoFileUpload(tab)` reports no supported `setInputFiles` API:

```bash
osascript /Users/fairy/.codex/skills/douyin-video-uploader/scripts/macos_click_upload_and_choose.applescript \
  "$VIDEO_FILE"
```

Then wait a few seconds and call `verifyVideoUploadAccepted(tab)`. If accepted, continue without asking the user.

## Queue Payload

`queue_payload.py` emits JSON. Common commands:

```bash
python3 /Users/fairy/.codex/skills/douyin-video-uploader/scripts/queue_payload.py \
  --project /Users/fairy/Documents/future/asmr_douyin_2day_launch
```

```bash
python3 /Users/fairy/.codex/skills/douyin-video-uploader/scripts/queue_payload.py \
  --project /Users/fairy/Documents/future/asmr_douyin_2day_launch \
  --index 1
```

```bash
python3 /Users/fairy/.codex/skills/douyin-video-uploader/scripts/queue_payload.py \
  --project /Users/fairy/Documents/future/asmr_douyin_2day_launch \
  --index 1 \
  --mark-posted-url "published:2026-06-13T08:10"
```

Read `references/douyin_creator_center.md` when selector behavior or page labels are unclear.
