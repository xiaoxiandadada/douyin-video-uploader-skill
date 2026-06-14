#!/usr/bin/env python3
import argparse
import csv
import json
from datetime import datetime
from pathlib import Path


DEFAULT_PROJECT = Path("/Users/fairy/Documents/future/asmr_douyin_2day_launch")


def read_csv(path):
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def write_csv(path, rows, fieldnames):
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def abs_path(root, value):
    p = Path(value)
    return p if p.is_absolute() else root / p


def compact_title(title):
    return "".join(str(title).split())[:30]


def parse_dt(row):
    return datetime.strptime(f"{row['date']} {row['time']}", "%Y-%m-%d %H:%M")


def bundle_for_index(root, index):
    bundle_root = root / "mobile_2day_upload_bundles"
    if not bundle_root.exists():
        return None
    prefix = f"{index:02d}_"
    matches = sorted(p for p in bundle_root.iterdir() if p.is_dir() and p.name.startswith(prefix))
    return matches[0] if matches else None


def read_text_if_exists(path):
    return path.read_text(encoding="utf-8").strip() if path and path.exists() else ""


def status_for(now, scheduled):
    minutes = int((scheduled - now).total_seconds() // 60)
    if minutes > 25:
        return {
            "timing": "before_window",
            "minutes_to_slot": minutes,
            "recommended_publish_mode": "schedule",
            "message": f"before scheduled window by {minutes} minutes",
        }
    if minutes >= 0:
        return {
            "timing": "in_window",
            "minutes_to_slot": minutes,
            "recommended_publish_mode": "immediate_or_schedule",
            "message": f"in publish window, {minutes} minutes to slot",
        }
    return {
        "timing": "late",
        "minutes_to_slot": minutes,
        "recommended_publish_mode": "immediate",
        "message": f"late by {abs(minutes)} minutes",
    }


def select_index(tracking_rows):
    for i, row in enumerate(tracking_rows, start=1):
        if not (row.get("posted_url") or "").strip():
            return i
    return None


def payload_from_project(root, index):
    schedule_path = root / "content_calendar_day1_day2.csv"
    tracking_path = root / "tracking.csv"
    schedule_rows = read_csv(schedule_path)
    tracking_rows = read_csv(tracking_path)
    if index is None:
        index = select_index(tracking_rows)
    if index is None:
        raise SystemExit("All rows appear to have posted_url values.")
    if index < 1 or index > len(schedule_rows):
        raise SystemExit(f"Index {index} is outside schedule length {len(schedule_rows)}.")

    schedule = schedule_rows[index - 1]
    tracking = tracking_rows[index - 1] if index <= len(tracking_rows) else {}
    bundle = bundle_for_index(root, index)
    caption = read_text_if_exists(bundle / "caption.txt") if bundle else ""
    pinned = read_text_if_exists(bundle / "pinned_comment.txt") if bundle else ""
    if not caption:
        caption = "\n\n".join(x for x in [schedule.get("caption_core", ""), schedule.get("hashtags", "")] if x)

    video_file = bundle / "video.mp4" if bundle and (bundle / "video.mp4").exists() else abs_path(root, tracking.get("video_file") or schedule["video_file"])
    cover_file = bundle / "cover.jpg" if bundle and (bundle / "cover.jpg").exists() else abs_path(root, schedule.get("cover_file", ""))
    scheduled = parse_dt(schedule)

    return {
        "project_root": str(root),
        "index": index,
        "account_hint": "Douyin Creator Center current logged-in account",
        "platform": schedule.get("platform_priority") or tracking.get("platform") or "抖音",
        "series": schedule.get("series", ""),
        "title": schedule.get("title", tracking.get("video_title", "")),
        "title_for_douyin": compact_title(schedule.get("title", tracking.get("video_title", ""))),
        "caption": caption,
        "pinned_comment": pinned,
        "hashtags": schedule.get("hashtags", ""),
        "video_file": str(video_file),
        "cover_file": str(cover_file),
        "publish_date": schedule["date"],
        "publish_time": schedule["time"],
        "publish_at": scheduled.isoformat(),
        "success_signal": schedule.get("success_signal", ""),
        "next_action": schedule.get("next_action", ""),
        "posted_url": tracking.get("posted_url", ""),
        "status": status_for(datetime.now(), scheduled),
    }


def payload_from_args(args):
    if not args.video:
        raise SystemExit("--video is required outside project queue mode.")
    caption = args.caption or (Path(args.caption_file).read_text(encoding="utf-8").strip() if args.caption_file else "")
    return {
        "project_root": None,
        "index": args.index,
        "account_hint": "Douyin Creator Center current logged-in account",
        "platform": "抖音",
        "series": "",
        "title": args.title or Path(args.video).stem,
        "title_for_douyin": compact_title(args.title or Path(args.video).stem),
        "caption": caption,
        "pinned_comment": args.pinned_comment or "",
        "hashtags": "",
        "video_file": str(Path(args.video).expanduser().resolve()),
        "cover_file": str(Path(args.cover).expanduser().resolve()) if args.cover else "",
        "publish_date": args.publish_date or "",
        "publish_time": args.publish_time or "",
        "publish_at": "",
        "success_signal": "",
        "next_action": "",
        "posted_url": "",
        "status": {"timing": "ad_hoc", "recommended_publish_mode": "immediate"},
    }


def mark_posted(root, index, url):
    tracking_path = root / "tracking.csv"
    rows = read_csv(tracking_path)
    if index < 1 or index > len(rows):
        raise SystemExit(f"Index {index} is outside tracking length {len(rows)}.")
    rows[index - 1]["posted_url"] = url
    with tracking_path.open(newline="", encoding="utf-8") as f:
        fieldnames = csv.DictReader(f).fieldnames
    write_csv(tracking_path, rows, fieldnames)
    return {"updated": str(tracking_path), "index": index, "posted_url": url}


def main():
    parser = argparse.ArgumentParser(description="Resolve or update a Douyin upload payload.")
    parser.add_argument("--project", default=str(DEFAULT_PROJECT), help="Project root containing schedule/tracking CSV files.")
    parser.add_argument("--index", type=int, help="1-based queue index.")
    parser.add_argument("--video", help="Ad hoc video path.")
    parser.add_argument("--cover", help="Ad hoc cover path.")
    parser.add_argument("--title", help="Ad hoc title.")
    parser.add_argument("--caption", help="Ad hoc caption text.")
    parser.add_argument("--caption-file", help="Read ad hoc caption from file.")
    parser.add_argument("--pinned-comment", help="Ad hoc pinned comment.")
    parser.add_argument("--publish-date", help="Ad hoc publish date YYYY-MM-DD.")
    parser.add_argument("--publish-time", help="Ad hoc publish time HH:MM.")
    parser.add_argument("--mark-posted-url", help="Update tracking.csv posted_url for --index.")
    args = parser.parse_args()

    root = Path(args.project).expanduser().resolve()
    if args.mark_posted_url:
        if not args.index:
            raise SystemExit("--index is required with --mark-posted-url.")
        print(json.dumps(mark_posted(root, args.index, args.mark_posted_url), ensure_ascii=False, indent=2))
        return

    if args.video:
        payload = payload_from_args(args)
    else:
        payload = payload_from_project(root, args.index)
    print(json.dumps(payload, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
