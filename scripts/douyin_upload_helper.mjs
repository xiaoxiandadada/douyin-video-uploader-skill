export async function inspectDouyinPage(tab) {
  return await tab.playwright.evaluate(() => {
    const text = document.body?.innerText || "";
    const buttons = [...document.querySelectorAll("button")].slice(0, 80).map((b) => ({
      text: (b.innerText || b.textContent || "").trim(),
      disabled: b.disabled,
    }));
    const fileInputs = [...document.querySelectorAll('input[type="file"]')].map((input) => ({
      accept: input.getAttribute("accept") || "",
      multiple: input.hasAttribute("multiple"),
      visible: !!(input.offsetWidth || input.offsetHeight || input.getClientRects().length),
    }));
    return {
      url: location.href,
      title: document.title,
      textSample: text.slice(0, 2500),
      hasLoginHint: /登录|扫码|验证码/.test(text) && !/发布作品|上传视频|作品标题/.test(text),
      hasUploadHint: /上传视频|发布作品|作品标题|填写作品标题/.test(text),
      hasUploadedVideoHint: /重新上传|视频预览|作品预览|快速检测|发布设置/.test(text),
      buttons,
      fileInputs,
    };
  });
}

async function unique(locator) {
  const count = await locator.count();
  return count === 1 ? locator : null;
}

export async function dismissKnownDouyinModals(tab) {
  const clicked = [];
  for (const label of ["我知道了", "完成", "知道了"]) {
    const locator = tab.playwright.getByRole("button", { name: label, exact: true });
    const count = await locator.count();
    if (count === 1) {
      await locator.click({});
      clicked.push(label);
      await tab.playwright.waitForTimeout(500);
    }
  }
  return clicked;
}

export async function detectVideoFileUpload(tab) {
  const input = tab.playwright.locator('input[type="file"][accept*="video"]');
  const count = await input.count();
  const methodNames = [];
  let obj = input;
  while (obj) {
    methodNames.push(...Object.getOwnPropertyNames(obj));
    obj = Object.getPrototypeOf(obj);
  }
  return {
    inputCount: count,
    hasSetInputFiles: methodNames.includes("setInputFiles"),
    fallback: count === 1 ? "macos_file_chooser" : "find_upload_button",
  };
}

export async function verifyVideoUploadAccepted(tab) {
  return await tab.playwright.evaluate(() => {
    const text = document.body?.innerText || "";
    const fileInputs = [...document.querySelectorAll('input[type="file"]')].map((input) => ({
      accept: input.getAttribute("accept") || "",
      filesLength: input.files ? input.files.length : null,
      value: input.value || "",
      visible: !!(input.offsetWidth || input.offsetHeight || input.getClientRects().length),
    }));
    const videos = [...document.querySelectorAll("video")].map((video) => ({
      src: video.currentSrc || video.src || "",
      width: video.clientWidth,
      height: video.clientHeight,
    }));
    const positivePatterns = [
      /重新上传/,
      /视频预览/,
      /作品预览/,
      /快速检测/,
      /上传成功/,
      /检测完成/,
    ];
    const uploadPromptStillVisible = /点击上传/.test(text) && /拖入此区域/.test(text);
    const hasPositiveText = positivePatterns.some((pattern) => pattern.test(text));
    const hasVideoElement = videos.some((video) => video.width > 0 || video.height > 0 || video.src);
    const videoInputHasFile = fileInputs.some((input) => /video/.test(input.accept) && (input.filesLength || input.value));
    const accepted = Boolean((hasPositiveText || hasVideoElement || videoInputHasFile) && !uploadPromptStillVisible);
    return {
      accepted,
      uploadPromptStillVisible,
      hasPositiveText,
      hasVideoElement,
      videoInputHasFile,
      fileInputs,
      videos,
      textSample: text.slice(0, 1800),
    };
  });
}

export async function openVideoFileChooser(tab) {
  const videoInput = tab.playwright.locator('input[type="file"][accept*="video"]');
  if ((await videoInput.count()) === 1) {
    await videoInput.click({ force: true });
    return { opened: true, target: "video_file_input" };
  }

  const uploadText = tab.playwright.getByText("点击上传", { exact: false });
  const uploadCount = await uploadText.count();
  if (uploadCount === 1) {
    await uploadText.click({});
    return { opened: true, target: "click_upload_text" };
  }

  return { opened: false, reason: "video_input_or_upload_button_not_unique" };
}

export async function fillDouyinMetadata(tab, payload) {
  const result = { title: false, caption: false };
  const title = payload.title_for_douyin || payload.title || "";
  const caption = payload.caption || "";

  const titleBox = tab.playwright.getByPlaceholder("填写作品标题，为作品获得更多流量", { exact: true });
  if ((await titleBox.count()) === 1) {
    await titleBox.fill(title, {});
    result.title = true;
  }

  const editables = tab.playwright.locator('[contenteditable="true"]');
  const editableCount = await editables.count();
  if (editableCount === 1) {
    await editables.fill(caption, {});
    result.caption = true;
  } else if (editableCount > 1) {
    const snapshot = await tab.playwright.domSnapshot();
    const captionCandidate = snapshot.includes("添加作品简介") || snapshot.includes("描述") || snapshot.includes("话题");
    if (captionCandidate) {
      const candidate = editables.nth(0);
      await candidate.fill(caption, {});
      result.caption = true;
    }
  }

  if (!result.caption) {
    await tab.clipboard.writeText(caption);
    const boxes = tab.playwright.locator('[contenteditable="true"]');
    const count = await boxes.count();
    if (count >= 1) {
      const box = boxes.nth(0);
      await box.click({});
      await box.press("Meta+A", {});
      await box.press("Meta+V", {});
      result.caption = true;
    }
  }

  return result;
}

export async function tryDeclareAiGenerated(tab) {
  const before = await inspectDouyinPage(tab);
  if (!/自主声明|AI|人工智能|生成/.test(before.textSample)) {
    return { attempted: false, reason: "no_ai_declaration_text_visible" };
  }

  for (const label of ["请选择自主声明", "自主声明"]) {
    const target = tab.playwright.getByText(label, { exact: false });
    const count = await target.count();
    if (count === 1) {
      await target.click({});
      await tab.playwright.waitForTimeout(500);
      break;
    }
  }

  const snapshot = await tab.playwright.domSnapshot();
  for (const option of ["AI生成", "人工智能生成", "人工智能生成内容", "疑似AI生成"]) {
    if (!snapshot.includes(option)) continue;
    const locator = tab.playwright.getByText(option, { exact: false });
    const count = await locator.count();
    if (count === 1) {
      await locator.click({});
      return { attempted: true, selected: option };
    }
  }
  return { attempted: true, selected: null, reason: "ai_option_not_unique_or_not_visible" };
}

export async function setScheduledPublishTime(tab, publishAtText) {
  const scheduleLabel = tab.playwright.getByText("定时发布", { exact: true });
  const scheduleCount = await scheduleLabel.count();
  if (scheduleCount === 1) {
    await scheduleLabel.click({});
    await tab.playwright.waitForTimeout(500);
  } else {
    const target = await tab.playwright.evaluate(() => {
      const el = [...document.querySelectorAll("body *")].find((node) => (node.innerText || node.textContent || "").trim() === "定时发布");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    if (!target) return { scheduled: false, reason: "schedule_toggle_not_found" };
    await tab.cua.click(target);
    await tab.playwright.waitForTimeout(500);
  }

  const dateInput = tab.playwright.getByPlaceholder("日期和时间", { exact: true });
  const inputCount = await dateInput.count();
  if (inputCount !== 1) return { scheduled: false, reason: "date_time_input_not_unique", inputCount };
  await dateInput.fill(publishAtText, {});
  await dateInput.press("Enter", {});
  await tab.playwright.waitForTimeout(500);
  const value = await tab.playwright.evaluate(() => {
    const input = [...document.querySelectorAll("input")].find((el) => el.getAttribute("placeholder") === "日期和时间");
    return input ? input.value : null;
  });
  return { scheduled: value === publishAtText, value };
}

export async function findPublishControls(tab) {
  const snapshot = await tab.playwright.domSnapshot();
  const labels = ["发布", "定时发布", "立即发布"];
  const controls = [];
  for (const label of labels) {
    const button = tab.playwright.getByRole("button", { name: label, exact: true });
    const count = await button.count();
    controls.push({ label, role: "button", count });
  }
  return { snapshotSample: snapshot.slice(0, 2500), controls };
}

export async function attemptSubmitDouyin(tab, options = {}) {
  const { immediate = true } = options;
  const labels = immediate ? ["发布"] : ["定时发布", "发布"];
  for (const label of labels) {
    const button = tab.playwright.getByRole("button", { name: label, exact: true });
    const target = await unique(button);
    if (!target) continue;
    const enabled = await target.isEnabled();
    if (!enabled) return { submitted: false, label, reason: "button_disabled" };
    await target.click({});
    await tab.playwright.waitForTimeout(1000);
    return { submitted: true, label };
  }
  return { submitted: false, reason: "publish_button_not_found" };
}
