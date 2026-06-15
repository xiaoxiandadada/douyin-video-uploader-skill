# Douyin Video Auto-Publisher Skill

This Codex skill uploads and publishes videos to Douyin Creator Center from a local content queue. Its primary publisher uses local Chrome/Edge with Playwright Core, so it can upload local `mp4` files through `setInputFiles` instead of relying on the in-app browser file picker.

## Features

- Resolve the next publishing payload from `content_calendar_day1_day2.csv` and `tracking.csv`.
- Open Douyin Creator Center automatically.
- Upload a local video file automatically.
- Fill the title and description.
- Select the AI-generated content declaration.
- Publish immediately.
- Schedule publishing when Douyin allows it: at least 2 hours ahead and within 14 days.
- Write the publish marker back to `tracking.csv` only after upload progress has settled and Douyin confirms success, audit submission, or a post-publish redirect.
- Stop without marking `tracking.csv` as published if Douyin asks for SMS verification or an original-device scan after the publish click.
- Keep in-app browser and macOS file-picker fallbacks for constrained environments.

## Structure

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

## Install

Install dependencies inside the skill directory:

```bash
npm install
```

Google Chrome or Microsoft Edge must be installed locally.

## First Login

On the first run, the publisher opens a separate persistent Chrome/Edge profile. If this profile is not logged in to Douyin, run:

```bash
node scripts/douyin_playwright_publisher.mjs \
  --project /Users/fairy/Documents/future/asmr_douyin_2day_launch \
  --index 12 \
  --wait-login
```

Log in to Douyin in the opened browser window. The session is stored in:

```text
~/.codex/douyin-playwright-profile
```

Future runs reuse that login state.

## Publish

```bash
node scripts/douyin_playwright_publisher.mjs \
  --project /Users/fairy/Documents/future/asmr_douyin_2day_launch \
  --index 12
```

Common options:

- `--index N`: publish item N from the queue.
- `--project <path>`: project directory containing `content_calendar_day1_day2.csv` and `tracking.csv`.
- `--wait-login`: wait for the user to log in inside the standard browser.
- `--dry-run`: upload and fill the form without submitting.
- `--user-data-dir <dir>`: use a custom persistent browser profile.
- `--browser-executable <path>`: choose a specific Chrome or Edge executable.

## Scheduling Rules

Douyin Creator Center currently only supports scheduled publishing:

- at least 2 hours in the future;
- within 14 days.

The script follows this rule:

- target time `>= 2 hours` away: select scheduled publishing and fill the date-time input;
- target time `< 2 hours` away or already past: publish immediately.

## Queue Data Requirements

The project directory should contain at least:

```text
content_calendar_day1_day2.csv
tracking.csv
mobile_2day_upload_bundles/<NN_name>/video.mp4
mobile_2day_upload_bundles/<NN_name>/caption.txt
mobile_2day_upload_bundles/<NN_name>/pinned_comment.txt
```

`queue_payload.py` generates the publish payload from `--index`.

## Security Notes

- The skill does not ask for passwords, SMS codes, or QR data.
- Login happens only in the local Chrome/Edge profile.
- `node_modules`, caches, `.env`, and browser profiles are ignored by default.
- Before making the repository public, review `SKILL.md` and examples for local path details you may not want to expose.

## Validation

```bash
python3 /Users/fairy/.codex/skills/.system/skill-creator/scripts/quick_validate.py .
node --check scripts/douyin_playwright_publisher.mjs
```

## License

ISC
