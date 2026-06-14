# Douyin Creator Center Notes

## Known Upload Page

Use:

```text
https://creator.douyin.com/creator-micro/content/post/video?enter_from=publish_page
```

If the page redirects to login or creator home, preserve the user's login state and navigate back to the upload URL after login.

## Current Field Labels

These labels have been observed on Douyin Creator Center and should be treated as candidates, not guarantees:

- Title placeholder: `填写作品标题，为作品获得更多流量`
- Description/contenteditable area: first visible `contenteditable="true"` after title
- Visibility: `公开`
- Publish timing: `立即发布`, `定时发布`
- AI disclosure: `自主声明`, `请选择自主声明`, options containing `AI`, `人工智能`, `生成`
- Helper modals: `我知道了`, `完成`
- Warnings that are usually non-blocking: `横/竖双封面缺失`

## Safety And Authorization

The user wants only video-level confirmation. Treat a clear instruction such as "确认上传第 N 条" as authorization to complete the external side effect for that exact payload. If the resolved video or action differs from the user's wording, stop and clarify.

Do not ask the user to paste passwords, SMS codes, or QR data into chat. Let them log in directly on Douyin.

## Upload Failure Modes

The in-app browser Playwright surface may not expose upstream `setInputFiles`. If direct local file upload fails:

1. Open the file chooser from the Douyin upload button.
2. Run `scripts/file_chooser_macos.applescript` with the absolute video path.
3. If macOS denies automation/accessibility, tell the user to grant Accessibility/Automation permission to the running Codex app or terminal host once, then retry.

Do not silently skip the upload. The page must show a preview/upload progress or an uploaded video card before metadata fill and submission.

## Post-Publish Tracking

After success, update the queue:

- `tracking.csv` `posted_url`: use the visible work URL when available.
- If no URL is available yet, write a timestamp marker such as `published:2026-06-13T08:10`.
- Keep metric columns blank until the 2-hour or 24-hour review.
