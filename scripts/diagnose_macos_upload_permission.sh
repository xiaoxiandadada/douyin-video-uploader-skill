#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
target="${1:-/tmp/douyin-upload-permission-test.mp4}"

printf 'macos_upload_permission_check\n'
printf 'target=%s\n' "$target"

if ! command -v osascript >/dev/null 2>&1; then
  printf 'status=missing_osascript\n'
  exit 2
fi

if osascript -e 'tell application "System Events" to key code 53' >/tmp/douyin-upload-permission.out 2>/tmp/douyin-upload-permission.err; then
  printf 'status=keyboard_events_allowed\n'
  exit 0
fi

printf 'status=keyboard_events_blocked\n'
printf 'stderr=%s\n' "$(tr '\n' ' ' </tmp/douyin-upload-permission.err)"
printf 'next=Open macOS System Settings > Privacy & Security > Accessibility, then enable the Codex app/terminal host or osascript, and retry.\n'

# Keep this path visible so callers know which chooser script uses the same permission.
printf 'chooser_script=%s\n' "$script_dir/file_chooser_macos.applescript"
exit 1
