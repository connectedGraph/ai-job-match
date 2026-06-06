const {
  fetchJson,
  loadConfigs,
  ensureDefaultConfigs,
  loadSummaryIntoDom,
  wireNav,
  escapeHtml,
  showToast,
  withButtonBusy,
} = window.AdminCommon;

const uploadInput = document.getElementById("uploadInput");
const uploadBtn = document.getElementById("uploadBtn");
const inputModeSelect = document.getElementById("inputModeSelect");
const autoApplyToggle = document.getElementById("autoApplyToggle");
const retryLimitInput = document.getElementById("retryLimitInput");
const startRunBtn = document.getElementById("startRunBtn");
const preflightBtn = document.getElementById("preflightBtn");
const uploadSummary = document.getElementById("uploadSummary");
const assignmentPreview = document.getElementById("assignmentPreview");
const preflightSummary = document.getElementById("preflightSummary");
const builderActionBar = document.getElementById("builderActionBar");
const builderLogBox = document.getElementById("builderLogBox");

let uploadState = null;
let pollTimer = null;
let applyPollTimer = null;
let activeRunId = null;
let activeRunSnapshot = null;
let lastPreflight = null;

function tokenUsageSummary(usage) {
  const total = Number(usage?.totalTokens || 0);
  const input = Number(usage?.inputTokens || 0);
  const output = Number(usage?.outputTokens || 0);
  const calls = Number(usage?.modelCallCount || 0);
  return `Token ${total} / 输入 ${input} / 输出 ${output} / 调用 ${calls}`;
}

function getRunStatus(snapshot) {
  return snapshot?.progress?.status || snapshot?.manifest?.status || "unknown";
}

function canPauseRun(snapshot) {
  return ["queued", "running"].includes(getRunStatus(snapshot));
}

function canResumeRun(snapshot) {
  return getRunStatus(snapshot) === "paused" && snapshot?.execution?.resumeAvailable !== false;
}

function canApplyRun(snapshot) {
  const applyStatus = String(snapshot?.applyProgress?.status || "").toLowerCase();
  if (["queued", "running"].includes(applyStatus)) {
    return false;
  }
  return ["completed", "partial", "failed", "interrupted"].includes(getRunStatus(snapshot))
    && Number(snapshot?.progress?.succeededRecords || 0) > 0;
}

function canRevokeRun(snapshot) {
  return Boolean(snapshot?.revokeReady || snapshot?.manifest?.latestApply?.snapshot?.snapshotId);
}

function isApplyInFlight(snapshot) {
  const status = String(snapshot?.applyProgress?.status || "").toLowerCase();
  return ["queued", "running"].includes(status);
}

function mergeApplyProgressIntoSnapshot(progress) {
  if (!activeRunSnapshot) return;
  activeRunSnapshot = {
    ...activeRunSnapshot,
    applyProgress: progress || {},
  };
  renderRun(activeRunSnapshot);
}

async function fetchApplyProgress(runId) {
  return fetchJson(`/api/builder/runs/${runId}/apply-progress`);
}

function startApplyPolling() {
  clearInterval(applyPollTimer);
  applyPollTimer = setInterval(async () => {
    if (!activeRunId) return;
    try {
      const progress = await fetchApplyProgress(activeRunId);
      mergeApplyProgressIntoSnapshot(progress);
      const status = String(progress?.status || "").toLowerCase();
      if (["completed", "failed", "interrupted"].includes(status)) {
        clearInterval(applyPollTimer);
        const snapshot = await fetchActiveRun();
        await loadSummaryIntoDom();
        if (status === "completed") {
          showToast("岗位库归入完成", "success", 2200);
        } else {
          showToast(progress?.error || progress?.message || "岗位库归入未完成", "error", 3200);
        }
        return snapshot;
      }
    } catch (error) {
      clearInterval(applyPollTimer);
      showToast(error.message || "归入进度获取失败", "error", 3200);
    }
    return null;
  }, 1500);
}

function renderAssignment() {
  const configs = ensureDefaultConfigs(loadConfigs()).filter((cfg) => cfg.enabled);
  const inputMode = inputModeSelect?.value || uploadState?.inputMode || "raw_source";
  const preprocessConfigs = configs.filter((cfg) => (cfg.stageRole || "all") !== "extract");
  const extractConfigs = configs.filter((cfg) => (cfg.stageRole || "all") !== "preprocess");
  if (!uploadState) {
    assignmentPreview.innerHTML = `<div class="hint">上传后显示任务分配。</div>`;
    return;
  }
  if (!configs.length) {
    assignmentPreview.innerHTML = `<div class="hint">当前没有启用配置，请先去配置池。</div>`;
    return;
  }
  const activePool = inputMode !== "raw_source"
    ? (extractConfigs.length ? extractConfigs : configs)
    : (preprocessConfigs.length ? preprocessConfigs : configs);
  const slots = activePool.flatMap((cfg) => Array.from({ length: Number(cfg.concurrency || 30) }, () => cfg.id));
  const counts = Object.fromEntries(configs.map((cfg) => [cfg.id, 0]));
  for (let i = 0; i < uploadState.recordCount; i += 1) {
    counts[slots[i % slots.length]] += 1;
  }
  assignmentPreview.innerHTML = `<table><thead><tr><th>配置</th><th>模式</th><th>并发</th><th>分配量</th></tr></thead><tbody>${
    configs.map((cfg) => `<tr><td>${escapeHtml(cfg.name)}</td><td>${escapeHtml(`${cfg.stageRole || "all"} / ${cfg.apiMode}`)}</td><td>${cfg.concurrency}</td><td>${counts[cfg.id]}</td></tr>`).join("")
  }</tbody></table>`;
}

function buildActionBar(snapshot) {
  if (!snapshot) {
    builderActionBar.innerHTML = `<div class="hint">当前还没有活动批次。</div>`;
    return;
  }

  const status = getRunStatus(snapshot);
  const summary = `
    <div class="hint">
      当前批次：<strong>${escapeHtml(snapshot?.manifest?.runId || activeRunId || "-")}</strong>
      / 状态：<strong>${escapeHtml(status)}</strong>
      / 成功 ${snapshot?.progress?.succeededRecords || 0}
      / 失败 ${snapshot?.progress?.failedRecords || 0}
      / ${escapeHtml(tokenUsageSummary(snapshot?.progress?.tokenUsage))}
    </div>
  `;

  const buttons = [];
  if (canPauseRun(snapshot)) {
    buttons.push(`<button data-builder-action="pause">暂停构建</button>`);
  }
  if (canResumeRun(snapshot)) {
    buttons.push(`<button data-builder-action="resume">继续构建</button>`);
  }
  if (canApplyRun(snapshot)) {
    buttons.push(`<button data-builder-action="apply">纳入岗位库</button>`);
  }
  if (canRevokeRun(snapshot)) {
    buttons.push(`<button data-builder-action="revoke" class="danger">永久撤回</button>`);
  }
  buttons.push(`<button data-builder-action="delete">删除批次</button>`);

  builderActionBar.innerHTML = `${summary}<div class="button-row">${buttons.join("")}</div>`;
}

function renderRun(snapshot) {
  activeRunSnapshot = snapshot || null;
  buildActionBar(snapshot);
  builderLogBox.textContent = JSON.stringify({
    manifest: {
      runId: snapshot?.manifest?.runId,
      status: snapshot?.manifest?.status,
      createdAt: snapshot?.manifest?.createdAt,
      latestApply: snapshot?.manifest?.latestApply || null,
    },
    progress: snapshot?.progress || {},
    applyProgress: snapshot?.applyProgress || {},
    logsTail: snapshot?.logsTail || [],
  }, null, 2);
}

function buildRunOptions() {
  return {
    autoApplyToJobLibrary: autoApplyToggle.checked,
    normalizeWithExistingTags: false,
    maxAttemptsPerRecord: Number(retryLimitInput.value || 2),
  };
}

async function runPreflight() {
  const configs = ensureDefaultConfigs(loadConfigs()).filter((cfg) => cfg.enabled);
  if (!configs.length) {
    showToast("当前没有启用配置", "error");
    return null;
  }
  const result = await fetchJson("/api/builder/configs/preflight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ configs }),
  });
  lastPreflight = result;
  preflightSummary.textContent = JSON.stringify(result, null, 2);
  if (!result.ok) {
    showToast("预检失败，存在不可用配置，本次不启动", "error", 3600);
    return result;
  }
  showToast("预检通过，配置 API 可用", "success", 1800);
  return result;
}

async function uploadSource() {
  const file = uploadInput.files[0];
  if (!file) {
    showToast("请先选择上传文件", "error");
    return;
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  uploadState = await fetchJson("/api/builder/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      contentBase64: btoa(binary),
      inputMode: inputModeSelect?.value || "raw_source",
    }),
  });
  uploadSummary.textContent = JSON.stringify(uploadState, null, 2);
  renderAssignment();
  showToast(`上传成功，共识别 ${uploadState.recordCount} 条岗位`, "success");
}

async function startRun() {
  if (!uploadState) {
    showToast("请先上传文件", "error");
    return;
  }
  const configs = ensureDefaultConfigs(loadConfigs()).filter((cfg) => cfg.enabled);
  if (!configs.length) {
    showToast("当前没有启用配置", "error");
    return;
  }
  const preflight = await runPreflight();
  if (!preflight?.ok) return;
  const snapshot = await fetchJson("/api/builder/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      uploadId: uploadState.uploadId,
      inputMode: inputModeSelect?.value || uploadState?.inputMode || "raw_source",
      configs,
      options: buildRunOptions(),
    }),
  });
  activeRunId = snapshot.manifest.runId;
  clearInterval(applyPollTimer);
  renderRun(snapshot);
  startPolling();
  showToast(`构建任务 ${activeRunId} 已启动`, "success");
}

async function fetchActiveRun() {
  if (!activeRunId) return null;
  const snapshot = await fetchJson(`/api/builder/runs/${activeRunId}`);
  renderRun(snapshot);
  if (isApplyInFlight(snapshot)) {
    startApplyPolling();
  }
  return snapshot;
}

function startPolling() {
  clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (!activeRunId) return;
    try {
      const snapshot = await fetchActiveRun();
      const status = getRunStatus(snapshot);
      if (["completed", "partial", "failed", "interrupted"].includes(status)) {
        clearInterval(pollTimer);
        await loadSummaryIntoDom();
        if (status === "completed" || status === "partial") {
          showToast(`任务 ${activeRunId} 已结束，状态：${status}`, status === "completed" ? "success" : "info", 2800);
        } else {
          showToast(`任务 ${activeRunId} 已结束，状态：${status}`, "error", 3200);
        }
      }
    } catch (error) {
      clearInterval(pollTimer);
      showToast(error.message || "运行状态拉取失败", "error", 3200);
    }
  }, 3000);
}

async function pauseActiveRun() {
  if (!activeRunId) {
    showToast("当前没有活动批次", "error");
    return;
  }
  const snapshot = await fetchJson(`/api/builder/runs/${activeRunId}/pause`, { method: "POST" });
  renderRun(snapshot);
  showToast(`批次 ${activeRunId} 已暂停`, "success");
}

async function resumeActiveRun() {
  if (!activeRunId) {
    showToast("当前没有活动批次", "error");
    return;
  }
  const snapshot = await fetchJson(`/api/builder/runs/${activeRunId}/resume`, { method: "POST" });
  renderRun(snapshot);
  startPolling();
  showToast(`批次 ${activeRunId} 已继续`, "success");
}

async function deleteActiveRun() {
  if (!activeRunId) {
    showToast("当前没有活动批次", "error");
    return;
  }
  if (!window.confirm(`删除批次 ${activeRunId} 后，将移除该批次的日志、结果和入库记录，继续吗？`)) {
    return;
  }
  const runId = activeRunId;
  await fetchJson(`/api/builder/runs/${runId}`, { method: "DELETE" });
  activeRunId = null;
  activeRunSnapshot = null;
  clearInterval(pollTimer);
  clearInterval(applyPollTimer);
  buildActionBar(null);
  builderLogBox.textContent = "[System] Ready.";
  await loadSummaryIntoDom();
  showToast(`批次 ${runId} 已删除`, "success");
}

async function revokeActiveRun() {
  if (!activeRunId) {
    showToast("当前没有活动批次", "error");
    return;
  }
  if (!window.confirm(`永久撤回 ${activeRunId} 后，将恢复到这次入库前快照，并删除这个时间点之后的所有运行记录、岗位和 tag 变更。继续吗？`)) {
    return;
  }
  const runId = activeRunId;
  const response = await fetchJson(`/api/builder/runs/${runId}/revoke`, { method: "POST" });
  activeRunId = null;
  activeRunSnapshot = null;
  clearInterval(pollTimer);
  clearInterval(applyPollTimer);
  buildActionBar(null);
  builderLogBox.textContent = "[System] Ready.";
  await loadSummaryIntoDom();
  showToast(`已永久撤回 ${response.deletedRunIds?.length || 0} 个批次`, "success");
}

async function applyActiveRun() {
  if (!activeRunId) {
    showToast("当前没有活动批次", "error");
    return;
  }
  const response = await fetchJson(`/api/builder/runs/${activeRunId}/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ normalizeWithExistingTags: false }),
  });
  renderRun(response.snapshot);
  await loadSummaryIntoDom();
  showToast("已纳入岗位库", "success");
}

function handleBuilderAction(button) {
  const action = button?.dataset?.builderAction;
  if (!action) return null;

  if (action === "pause") {
    return withButtonBusy(button, "暂停中...", pauseActiveRun);
  }
  if (action === "resume") {
    return withButtonBusy(button, "继续中...", resumeActiveRun);
  }
  if (action === "delete") {
    return withButtonBusy(button, "删除中...", deleteActiveRun);
  }
  if (action === "revoke") {
    return withButtonBusy(button, "撤回中...", revokeActiveRun);
  }
  if (action === "apply") {
    return withButtonBusy(button, "写库中...", applyActiveRun);
  }
  return null;
}

async function applyActiveRun() {
  if (!activeRunId) {
    showToast("当前没有活动批次", "error");
    return;
  }
  const response = await fetchJson(`/api/builder/runs/${activeRunId}/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ normalizeWithExistingTags: false }),
  });
  renderRun(response.snapshot);
  if (response.progress) {
    mergeApplyProgressIntoSnapshot(response.progress);
  }
  startApplyPolling();
  await loadSummaryIntoDom();
  showToast(
    response.message || (response.started ? "已开始后台归入岗位库" : "当前批次正在归入岗位库"),
    "info",
    2400,
  );
}

(async function init() {
  wireNav();
  await loadSummaryIntoDom();
  renderAssignment();
  buildActionBar(null);

  builderActionBar.addEventListener("click", (event) => {
    const button = event.target.closest("[data-builder-action]");
    if (!button) return;
    handleBuilderAction(button).catch((error) => showToast(error.message || "操作失败", "error", 3200));
  });

  uploadBtn.addEventListener("click", () => uploadSource().catch((error) => showToast(error.message || "上传失败", "error", 3200)));
  preflightBtn.addEventListener("click", () => runPreflight().catch((error) => showToast(error.message || "预检失败", "error", 3200)));
  startRunBtn.addEventListener("click", () => startRun().catch((error) => showToast(error.message || "任务启动失败", "error", 3200)));
  inputModeSelect?.addEventListener("change", renderAssignment);
})().catch((error) => {
  showToast(error.message || "上传构建页初始化失败", "error", 3600);
});
