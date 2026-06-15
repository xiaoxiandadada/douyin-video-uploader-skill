#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const SKILL_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const QUEUE = path.join(SKILL_ROOT, "scripts", "queue_payload.py");
const DEFAULT_PROJECT = "/Users/fairy/Documents/future/asmr_douyin_2day_launch";
const UPLOAD_URL = "https://creator.douyin.com/creator-micro/content/post/video?enter_from=publish_page";

function argValue(name, fallback = undefined) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function runJson(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `${command} failed`).trim());
  }
  return JSON.parse(result.stdout);
}

function resolveBrowser() {
  const explicit = argValue("--browser-executable");
  const candidates = [
    explicit,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error("No Chrome/Edge executable found. Pass --browser-executable <path>.");
  return found;
}

async function clickTextIfPresent(page, text, options = {}) {
  await clearBlockingOverlays(page);
  const locator = page.getByText(text, { exact: options.exact ?? false });
  const count = await locator.count();
  if (count === 1) {
    try {
      await locator.click({ timeout: options.timeout ?? 3000 });
    } catch (error) {
      const label = page.locator("label").filter({ hasText: text });
      if ((await label.count()) === 1) {
        await label.click({ force: true, timeout: options.timeout ?? 3000 });
      } else {
        await locator.click({ force: true, timeout: options.timeout ?? 3000 });
      }
    }
    return true;
  }
  return false;
}

async function clearBlockingOverlays(page) {
  await page.evaluate(() => {
    for (const selector of [
      ".shepherd-element",
      ".shepherd-modal-overlay-container",
      "[data-douyin-creator-pc-master-shepherd-step-id]",
    ]) {
      for (const el of document.querySelectorAll(selector)) {
        el.remove();
      }
    }
  }).catch(() => {});
}

async function dismissModals(page) {
  await clearBlockingOverlays(page);
  await page.keyboard.press("Escape").catch(() => {});
  for (const label of ["我知道了", "知道了", "完成"]) {
    const button = page.getByRole("button", { name: label, exact: true });
    if ((await button.count()) === 1) {
      await button.click().catch(() => {});
      await page.waitForTimeout(500);
    }
  }
}

async function handleBlockingModals(page) {
  await clearBlockingOverlays(page);
  const handled = [];
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const modal = page.locator('[role="modal"], .semi-modal-wrap').first();
    if ((await modal.count()) === 0) break;
    const text = (await modal.innerText({ timeout: 1000 }).catch(() => "")).slice(0, 1000);
    const checkbox = modal.locator('input[type="checkbox"], .semi-checkbox, [role="checkbox"]').first();
    if ((await checkbox.count()) > 0) {
      await checkbox.click({ force: true, timeout: 1500 }).catch(() => {});
    }
    let clicked = false;
    for (const label of ["确认发布", "继续发布", "确认", "确定", "同意", "我知道了", "知道了", "完成", "下一步"]) {
      const button = modal.getByRole("button", { name: label, exact: true });
      if ((await button.count()) > 0) {
        await button.first().click({ force: true, timeout: 2000 }).catch(() => {});
        handled.push({ label, text });
        clicked = true;
        await page.waitForTimeout(800);
        break;
      }
    }
    if (!clicked) {
      await page.keyboard.press("Escape").catch(() => {});
      handled.push({ label: "Escape", text });
      await page.waitForTimeout(800);
    }
  }
  return handled;
}

async function pageState(page) {
  return await page.evaluate(() => {
    const text = document.body?.innerText || "";
    const titleInput = [...document.querySelectorAll("input")].find((el) =>
      el.getAttribute("placeholder") === "填写作品标题，为作品获得更多流量"
    );
    return {
      url: location.href,
      title: document.title,
      bodyText: text,
      bodySample: text.slice(0, 6000),
      hasLoginHint: /登录|扫码|验证码/.test(text) && !/发布作品|上传视频|作品标题/.test(text),
      hasVerificationChallenge: /短信验证码|接收短信验证码|获取验证码|使用原设备扫码|为确保是本人操作/.test(text),
      hasUploadPrompt: /点击上传/.test(text) && /拖入此区域/.test(text),
      hasUploadedHint: /重新上传|视频预览|作品预览|快速检测|上传成功|检测完成/.test(text),
      titleValue: titleInput?.value || "",
    };
  });
}

function compactState(state) {
  if (!state || typeof state !== "object") return state;
  const { bodyText, ...rest } = state;
  return rest;
}

function compactResult(result) {
  if (!result || typeof result !== "object") return result;
  return {
    ...result,
    state: compactState(result.state),
  };
}

async function waitForLoginIfNeeded(page) {
  let state = await pageState(page);
  if (!state.hasLoginHint) return state;
  console.log(JSON.stringify({ status: "login_required", url: state.url }, null, 2));
  if (!hasFlag("--wait-login")) {
    throw new Error("Douyin login required in the launched Chrome/Edge profile. Re-run with --wait-login after logging in.");
  }
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(3000);
    state = await pageState(page);
    if (!state.hasLoginHint) return state;
  }
  throw new Error("Timed out waiting for Douyin login.");
}

async function uploadVideo(page, videoFile) {
  let input = null;
  const deadlineForInput = Date.now() + 90 * 1000;
  while (Date.now() < deadlineForInput && !input) {
    for (const frame of page.frames()) {
      const candidate = frame.locator('input[type="file"][accept*="video"]');
      if ((await candidate.count()) > 0) {
        input = candidate.first();
        break;
      }
    }
    if (!input) {
      await page.waitForTimeout(1500);
      const state = await pageState(page);
      if (state.hasLoginHint) throw new Error("Douyin login required before upload input is available.");
      if (!state.url.includes("/content/post/video")) {
        await page.goto(UPLOAD_URL, { waitUntil: "domcontentloaded" });
      }
    }
  }
  if (!input) {
    const state = await pageState(page);
    throw new Error(`Video file input not found on Douyin upload page. state=${JSON.stringify(state)}`);
  }
  await input.setInputFiles(videoFile);
  const deadline = Date.now() + 5 * 60 * 1000;
  while (Date.now() < deadline) {
    const state = await pageState(page);
    if (state.hasUploadedHint || !state.hasUploadPrompt) return state;
    await page.waitForTimeout(2000);
  }
  throw new Error("Video file was set but Douyin did not show upload/preview state within 5 minutes.");
}

async function waitForUploadToSettle(page) {
  const deadline = Date.now() + 10 * 60 * 1000;
  let stableChecks = 0;
  let latest = await pageState(page);
  while (Date.now() < deadline) {
    latest = await pageState(page);
    const text = latest.bodyText || latest.bodySample || "";
    const uploadFailed = /上传失败|文件上传失败|视频处理失败|检测失败/.test(text);
    if (uploadFailed) {
      return { settled: false, failed: true, reason: "upload_failed_text_seen", state: latest };
    }
    const uploading = /上传过程中|当前速度|剩余时间|取消上传|已上传[:：]|检测中\s*\d{1,3}%|(?:^|[^\d])\d{1,3}%/.test(text);
    const uploadSurfaceGone = !latest.hasUploadPrompt;
    if (!uploading && uploadSurfaceGone) {
      stableChecks += 1;
      if (stableChecks >= 3) return { settled: true, state: latest };
    } else {
      stableChecks = 0;
    }
    await page.waitForTimeout(2000);
  }
  return { settled: false, state: latest };
}

async function fillMetadata(page, payload) {
  await clearBlockingOverlays(page);
  const title = payload.title_for_douyin || payload.title || "";
  const titleBox = page.getByPlaceholder("填写作品标题，为作品获得更多流量");
  if ((await titleBox.count()) === 1) {
    await titleBox.fill(title);
  }

  const caption = payload.caption || "";
  const editables = page.locator('[contenteditable="true"]');
  const editableCount = await editables.count();
  if (editableCount > 0) {
    await editables.first().click();
    await page.keyboard.press("Meta+A");
    await page.keyboard.press("Backspace");
    await page.keyboard.insertText(caption);
  }
}

async function declareAi(page) {
  await clearBlockingOverlays(page);
  const state = await pageState(page);
  if (!/自主声明|AI|人工智能|生成/.test(state.bodySample)) return { attempted: false };
  await clickTextIfPresent(page, "请选择自主声明");
  await clickTextIfPresent(page, "自主声明");
  await page.waitForTimeout(500);
  for (const label of ["AI生成", "人工智能生成", "人工智能生成内容", "内容由AI生成", "疑似AI生成"]) {
    if (await clickTextIfPresent(page, label)) return { attempted: true, selected: label };
  }
  return { attempted: true, selected: null };
}

async function setSchedule(page, payload) {
  await clearBlockingOverlays(page);
  const mode = payload.status?.recommended_publish_mode || "immediate";
  if (mode === "immediate") return { mode: "immediate" };

  const publishAtText = `${payload.publish_date} ${payload.publish_time}`;
  const publishAt = payload.publish_at ? new Date(payload.publish_at) : null;
  const minutesToPublish = publishAt ? Math.floor((publishAt.getTime() - Date.now()) / 60000) : null;
  if (minutesToPublish !== null && minutesToPublish < 120) {
    return {
      mode: "immediate",
      scheduled: false,
      reason: "douyin_requires_schedule_at_least_2_hours_ahead",
      minutesToPublish,
    };
  }

  const scheduleLabel = page.locator("label").filter({ hasText: "定时发布" });
  if ((await scheduleLabel.count()) === 1) {
    await scheduleLabel.click({ force: true });
  } else {
    const clicked = await clickTextIfPresent(page, "定时发布", { exact: true });
    if (!clicked) return { mode: "schedule", scheduled: false, reason: "schedule_toggle_not_found" };
  }
  await page.waitForTimeout(700);

  const candidates = [
    page.locator('input[placeholder="日期和时间"]'),
    page.getByPlaceholder("日期和时间"),
    page.locator('input[placeholder*="日期"]'),
    page.locator('input[placeholder*="时间"]'),
  ];
  for (const locator of candidates) {
    const count = await locator.count();
    if (count >= 1) {
      const target = count === 1 ? locator : locator.last();
      await target.fill(publishAtText);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(500);
      const value = await target.inputValue().catch(() => "");
      return {
        mode: "schedule",
        scheduled: value.includes(payload.publish_date) && value.includes(payload.publish_time),
        publishAtText,
        value,
      };
    }
  }
  return { mode: "schedule", scheduled: false, reason: "datetime_input_not_found" };
}

async function submit(page, payload, schedule = {}) {
  await clearBlockingOverlays(page);
  await handleBlockingModals(page);
  const immediate = payload.status?.recommended_publish_mode === "immediate" || schedule.mode === "immediate" || !schedule.scheduled;
  const labels = immediate ? ["发布"] : ["定时发布", "发布"];
  for (const label of labels) {
    const button = page.getByRole("button", { name: label, exact: true });
    if ((await button.count()) === 1) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await button.click({ timeout: 10000 });
          break;
        } catch (error) {
          const handled = await handleBlockingModals(page);
          if (attempt === 2 || handled.length === 0) throw error;
        }
      }
      await page.waitForTimeout(1500);
      await handleBlockingModals(page);
      for (const confirm of ["确认发布", "继续发布", "确定", "确认"]) {
        const confirmButton = page.getByRole("button", { name: confirm, exact: true });
        if ((await confirmButton.count()) === 1) {
          await confirmButton.click();
          await page.waitForTimeout(1500);
          await handleBlockingModals(page);
          break;
        }
      }
      return { submitted: true, label };
    }
  }
  return { submitted: false, reason: "publish_button_not_found" };
}

async function waitForPublishConfirmation(page) {
  const deadline = Date.now() + 5 * 60 * 1000;
  let latest = await pageState(page);
  while (Date.now() < deadline) {
    latest = await pageState(page);
    const text = latest.bodyText || latest.bodySample || "";
    const url = latest.url || page.url();
    if (latest.hasVerificationChallenge) {
      return { confirmed: false, reason: "verification_challenge_seen", state: latest };
    }
    const failedByText = /发布失败|提交失败|请稍后重试|网络异常|审核未通过/.test(text);
    if (failedByText) {
      return { confirmed: false, reason: "failure_text_seen", state: latest };
    }
    const confirmedByText = /发布成功|作品发布成功|提交成功|已提交审核|审核中|发布完成/.test(text);
    const confirmedByUrl = /creator-micro\/content\/(manage|home|overview)|creator-micro\/home/.test(url);
    if (confirmedByText || confirmedByUrl) {
      return { confirmed: true, reason: confirmedByText ? "success_text_seen" : "success_url_seen", state: latest };
    }
    await page.waitForTimeout(2000);
  }
  return { confirmed: false, reason: "timeout_waiting_for_publish_confirmation", state: latest };
}

async function main() {
  const project = argValue("--project", DEFAULT_PROJECT);
  const index = argValue("--index");
  const dryRun = hasFlag("--dry-run");
  const payloadArgs = ["--project", project];
  if (index) payloadArgs.push("--index", index);
  const payload = runJson("python3", [QUEUE, ...payloadArgs]);
  if (!existsSync(payload.video_file)) throw new Error(`Video file not found: ${payload.video_file}`);

  const userDataDir = argValue("--user-data-dir", path.join(homedir(), ".codex", "douyin-playwright-profile"));
  await mkdir(userDataDir, { recursive: true });
  const browserPath = resolveBrowser();
  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: browserPath,
    headless: false,
    viewport: { width: 1280, height: 900 },
  });
  const page = context.pages()[0] || await context.newPage();
  await page.goto(UPLOAD_URL, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2000);
  await waitForLoginIfNeeded(page);
  await dismissModals(page);
  const uploadState = await uploadVideo(page, payload.video_file);
  const uploadSettled = await waitForUploadToSettle(page);
  if (!uploadSettled.settled) {
    throw new Error(`Upload did not settle; refusing to submit. state=${JSON.stringify(compactResult(uploadSettled))}`);
  }
  await fillMetadata(page, payload);
  const ai = await declareAi(page);
  const modalsAfterAi = await handleBlockingModals(page);
  const schedule = await setSchedule(page, payload);
  const beforeSubmit = await pageState(page);
  let submitResult = { submitted: false, dryRun: true };
  let publishConfirmation = { confirmed: false, dryRun: true };
  if (!dryRun) {
    submitResult = await submit(page, payload, schedule);
    if (submitResult.submitted) {
      publishConfirmation = await waitForPublishConfirmation(page);
    }
  }

  const marker = `published:${new Date().toISOString()}`;
  const confirmedPosted = dryRun || (submitResult.submitted && publishConfirmation.confirmed);
  if (!dryRun && submitResult.submitted && !publishConfirmation.confirmed) {
    throw new Error(`Publish click was not confirmed by Douyin. result=${JSON.stringify(compactResult(publishConfirmation))}`);
  }
  if (!dryRun && confirmedPosted && payload.project_root && payload.index) {
    runJson("python3", [QUEUE, "--project", payload.project_root, "--index", String(payload.index), "--mark-posted-url", marker]);
  }

  console.log(JSON.stringify({
    ok: confirmedPosted,
    dryRun,
    payload: {
      index: payload.index,
      title: payload.title,
      video_file: payload.video_file,
      publish_at: payload.publish_at,
      recommended_publish_mode: payload.status?.recommended_publish_mode,
    },
    uploadState: {
      hasUploadedHint: uploadState.hasUploadedHint,
      hasUploadPrompt: uploadState.hasUploadPrompt,
    },
    uploadSettled: compactResult(uploadSettled),
    ai,
    modalsAfterAi,
    schedule,
    beforeSubmit: compactState(beforeSubmit),
    submitResult,
    publishConfirmation: compactResult(publishConfirmation),
    trackingMarker: !dryRun && confirmedPosted ? marker : null,
  }, null, 2));
  await context.close();
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, error: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});
