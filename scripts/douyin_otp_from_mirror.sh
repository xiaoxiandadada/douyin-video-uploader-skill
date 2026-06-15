#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGE_PATH="${1:-}"
TEMP_IMAGE=""

cleanup() {
  if [[ -n "$TEMP_IMAGE" && -f "$TEMP_IMAGE" ]]; then
    rm -f "$TEMP_IMAGE"
  fi
}
trap cleanup EXIT

if [[ -z "$IMAGE_PATH" ]]; then
  TEMP_IMAGE="$(mktemp -t douyin-otp-screen.XXXXXX.png)"
  /usr/sbin/screencapture -x "$TEMP_IMAGE"
  IMAGE_PATH="$TEMP_IMAGE"
fi

/usr/bin/swift "$SCRIPT_DIR/extract_douyin_otp_from_image.swift" "$IMAGE_PATH"
