const {
  fetchJson,
  loadSummaryIntoDom,
  wireNav,
  loadConfigs,
  ensureDefaultConfigs,
  escapeHtml,
  showToast,
  withButtonBusy,
} = window.AdminCommon;

const POLL_MS = 3000;

const state = {
  activeNormalizeRunId: null,
  activeTagReviewRunId: null,
  normalizePollTimer: null,
  tagReviewPollTimer: null,
  reviewConfigs: [],
  selectedReviewConfigId: null,
  selectedReviewMode: "all",
};

const els = {
  metricCacheRows: document.getElementById("metricCacheRows"),
  metricCacheSize: document.getElementById("metricCacheSize"),
  metricNormalizeRuns: document.getElementById("metricNormalizeRuns"),
  metricNormalizePercent: document.getElementById("metricNormalizePercent"),
  cacheStatusBox: document.getElementById("cacheStatusBox"),
  normalizeRunDetail: document.getElementById("normalizeRunDetail"),
  normalizeLogBox: document.getElementById("normalizeLogBox"),
  normalizeRunCards: document.getElementById("normalizeRunCards"),
  acceptedWordRail: document.getElementById("acceptedWordRail"),
  newWordRail: document.getElementById("newWordRail"),
  suggestWordRail: document.getElementById("suggestWordRail"),
  refreshNormalizeBtn: document.getElementById("refreshNormalizeBtn"),
  startNormalizeBtn: document.getElementById("startNormalizeBtn"),

  tagReviewConfigSelect: document.getElementById("tagReviewConfigSelect"),
  tagReviewMaxAttempts: document.getElementById("tagReviewMaxAttempts"),
  tagReviewModeSelect: document.getElementById("tagReviewModeSelect"),
  refreshTagReviewBtn: document.getElementById("refreshTagReviewBtn"),
  startTagReviewBtn: document.getElementById("startTagReviewBtn"),
  pauseTagReviewBtn: document.getElementById("pauseTagReviewBtn"),
  resumeTagReviewBtn: document.getElementById("resumeTagReviewBtn"),
  restartTagReviewBtn: document.getElementById("restartTagReviewBtn"),
  metricReviewCandidates: document.getElementById("metricReviewCandidates"),
  metricReviewTechStack: document.getElementById("metricReviewTechStack"),
  metricReviewTechCapabilities: document.getElementById("metricReviewTechCapabilities"),
  metricReviewDevTools: document.getElementById("metricReviewDevTools"),
  metricReviewReplaced: document.getElementById("metricReviewReplaced"),
  tagReviewSummaryBox: document.getElementById("tagReviewSummaryBox"),
  tagReviewRunDetail: document.getElementById("tagReviewRunDetail"),
  tagReviewLogBox: document.getElementById("tagReviewLogBox"),
  tagReviewRunCards: document.getElementById("tagReviewRunCards"),
  tagReviewResultBox: document.getElementById("tagReviewResultBox"),
  reviewReplacedRail: document.getElementById("reviewReplacedRail"),
  reviewUnchangedRail: document.getElementById("reviewUnchangedRail"),
  reviewFailedRail: document.getElementById("reviewFailedRail"),
};

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function clampInt(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function isTerminalStatus(status) {
  return status === "completed" || status === "failed";
}

function isTagReviewSettledStatus(status) {
  return ["completed", "failed", "paused", "stopped"].includes(String(status || "").toLowerCase());
}

function getRunStatus(snapshot) {
  return snapshot?.progress?.status || snapshot?.manifest?.status || "unknown";
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "medium",
  }).format(date);
}

function getSelectedReviewMode() {
  return els.tagReviewModeSelect?.value || state.selectedReviewMode || "all";
}

function getReviewModeLabel(mode) {
  if (mode === "unreviewed_only") return "Unreviewed Only";
  return "Full Review";
}

function renderReviewModeOptions(options, selectedValue) {
  if (!els.tagReviewModeSelect) return;
  const rows = Array.isArray(options) && options.length
    ? options
    : [
        { value: "all", label: "Full Review" },
        { value: "unreviewed_only", label: "Unreviewed Only" },
      ];
  const normalized = rows.some((item) => item?.value === selectedValue)
    ? selectedValue
    : (rows[0]?.value || "all");
  state.selectedReviewMode = normalized;
  els.tagReviewModeSelect.innerHTML = rows.map((item) => `
    <option value="${escapeHtml(item.value || "all")}" ${item.value === normalized ? "selected" : ""}>
      ${escapeHtml(item.label || item.value || "all")}
    </option>
  `).join("");
  els.tagReviewModeSelect.value = normalized;
}

function setButtonEnabled(button, enabled) {
  if (!button) return;
  if (button.dataset.busy === "1") return;
  button.disabled = !enabled;
}

function updateTagReviewControlState(snapshot) {
  const current = snapshot || {};
  setButtonEnabled(els.pauseTagReviewBtn, Boolean(current.canPause));
  setButtonEnabled(els.resumeTagReviewBtn, Boolean(current.canResume));
  setButtonEnabled(els.restartTagReviewBtn, Boolean(current.canRestart));
}

function formatJson(payload) {
  return JSON.stringify(payload ?? {}, null, 2);
}

function buildDetailGrid(items) {
  return `
    <div class="detail-grid">
      ${items.map((item) => `
        <div class="detail-tile">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(String(item.value ?? "-"))}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function formatLogEntries(logs) {
  const rows = Array.isArray(logs) ? logs : [];
  if (!rows.length) {
    return "// no logs yet...";
  }
  return rows.map((entry) => {
    const parts = [
      `[${entry?.ts || "-"}] ${entry?.stage || "log"}`,
    ];
    if (entry?.message) {
      parts.push(String(entry.message));
    }
    if (entry?.payload && Object.keys(entry.payload).length) {
      parts.push(formatJson(entry.payload));
    }
    return parts.join("\n");
  }).join("\n\n");
}

function formatCompactValue(value) {
  if (value == null || value === "") return "-";
  if (Array.isArray(value)) {
    const joined = value.map((item) => formatCompactValue(item)).filter((item) => item && item !== "-").join(" | ");
    return joined || "-";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function normalizeTagReviewLogStage(stage) {
  const value = String(stage || "log").toLowerCase();
  const labels = {
    queued: "Queued",
    started: "Started",
    resumed: "Resumed",
    pause_requested: "Pause Requested",
    paused: "Paused",
    review_retry: "Retry",
    review_failed: "Review Failed",
    review_replaced: "Replaced",
    review_deleted: "Deleted",
    review_split: "Split",
    completed: "Completed",
    failed: "Run Failed",
  };
  return labels[value] || value.replaceAll("_", " ");
}

function getTagReviewLogTone(stage) {
  const value = String(stage || "").toLowerCase();
  if (value.includes("failed")) return "error";
  if (value.includes("deleted") || value.includes("split") || value.includes("replaced") || value === "completed") return "success";
  if (value.includes("pause")) return "warn";
  return "info";
}

function buildTagReviewLogPayload(payload) {
  const current = payload && typeof payload === "object" ? payload : {};
  const keys = [
    "tagType",
    "currentName",
    "action",
    "replacement",
    "replacements",
    "reviewMode",
    "candidateIndex",
    "totalCandidates",
    "reviewedCandidates",
    "changedCandidates",
    "failedCandidates",
    "occurrenceCount",
    "reviewCount",
    "attempt",
    "maxAttempts",
    "nextIndex",
    "error",
    "restartOfRunId",
  ];
  const seen = new Set();
  const ordered = [];
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(current, key)) {
      ordered.push([key, current[key]]);
      seen.add(key);
    }
  }
  for (const [key, value] of Object.entries(current)) {
    if (seen.has(key)) continue;
    if (value && typeof value === "object") continue;
    ordered.push([key, value]);
  }
  if (!ordered.length) return "";
  return `
    <div class="review-log-payload">
      ${ordered.slice(0, 12).map(([key, value]) => `
        <span class="review-log-chip">
          <strong>${escapeHtml(key)}</strong>
          <span>${escapeHtml(formatCompactValue(value))}</span>
        </span>
      `).join("")}
    </div>
  `;
}

function renderTagReviewLogEntries(logs) {
  const rows = Array.isArray(logs) ? logs.slice().reverse() : [];
  if (!rows.length) {
    return `<div class="review-log-empty">No tag review logs yet.</div>`;
  }
  return `
    <div class="review-log-list">
      ${rows.map((entry) => {
        const stage = String(entry?.stage || "log");
        const tone = getTagReviewLogTone(stage);
        return `
          <div class="review-log-entry review-log-entry--${tone}">
            <div class="review-log-top">
              <span class="review-log-stage">${escapeHtml(normalizeTagReviewLogStage(stage))}</span>
              <span class="review-log-time">${escapeHtml(formatDateTime(entry?.ts))}</span>
            </div>
            <div class="review-log-message">${escapeHtml(entry?.message || "no message")}</div>
            ${buildTagReviewLogPayload(entry?.payload)}
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderChipRail(container, items, emptyText, variantClass, renderBody) {
  if (!container) return;
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) {
    container.innerHTML = `<div class="hint">${escapeHtml(emptyText)}</div>`;
    return;
  }
  container.innerHTML = `
    <div class="review-chip-list">
      ${rows.map((item) => `
        <div class="review-chip ${variantClass || ""}">
          ${renderBody(item)}
        </div>
      `).join("")}
    </div>
  `;
}

function renderCacheStatus(cache) {
  const current = cache || {};
  if (els.metricCacheRows) {
    els.metricCacheRows.textContent = String(current.matchedRows || 0);
  }
  if (els.metricCacheSize) {
    els.metricCacheSize.textContent = formatBytes(current.sizeBytes || 0);
  }
  if (!els.cacheStatusBox) return;

  const summary = {
    profileId: current.profileId || "-",
    provider: current.provider || "-",
    model: current.model || "-",
    dimensions: current.dimensions || 0,
    matchedRows: current.matchedRows || 0,
    totalRows: current.totalRows || 0,
    sizeBytes: current.sizeBytes || 0,
    updatedAt: current.updatedAt || "-",
  };

  els.cacheStatusBox.innerHTML = `
    <div class="mono-badge">cache</div>
    ${buildDetailGrid([
      { label: "Profile", value: summary.profileId },
      { label: "Provider", value: summary.provider },
      { label: "Model", value: summary.model },
      { label: "Dimensions", value: summary.dimensions },
      { label: "Matched Rows", value: summary.matchedRows },
      { label: "Updated At", value: summary.updatedAt },
    ])}
    <pre style="margin-top: 12px;">${escapeHtml(formatJson(summary))}</pre>
  `;
}

function renderNormalizeRunCards(runs) {
  const rows = Array.isArray(runs) ? runs : [];
  if (els.metricNormalizeRuns) {
    els.metricNormalizeRuns.textContent = String(rows.length);
  }
  if (!els.normalizeRunCards) return;
  if (!rows.length) {
    els.normalizeRunCards.innerHTML = `<div class="hint">暂无归一任务</div>`;
    return;
  }
  els.normalizeRunCards.innerHTML = rows.map((run) => `
    <div class="job-card ${run.runId === state.activeNormalizeRunId ? "active" : ""}" data-normalize-run-id="${escapeHtml(run.runId)}">
      <h4>${escapeHtml(run.runId)}</h4>
      <div class="meta">
        <span class="pill">${escapeHtml(run.status || "unknown")}</span>
        <span>${escapeHtml(run.stage || "-")}</span>
        <span>${Number(run.percent || 0)}%</span>
      </div>
      <div class="desc">${escapeHtml(run.message || "no message")}</div>
      <div class="hint">changed ${Number(run.changed || 0)} / normalized ${Number(run.normalized || 0)}</div>
    </div>
  `).join("");
}

function renderNormalizeRunDetail(snapshot) {
  if (!els.normalizeRunDetail) return;
  if (!snapshot) {
    els.normalizeRunDetail.innerHTML = `<div class="hint">请选择一条归一任务</div>`;
    if (els.metricNormalizePercent) {
      els.metricNormalizePercent.textContent = "0%";
    }
    return;
  }

  const progress = snapshot.progress || {};
  const result = snapshot.result || {};
  const percent = Number(progress.percent || 0);
  if (els.metricNormalizePercent) {
    els.metricNormalizePercent.textContent = `${percent}%`;
  }

  const preview = {
    changed: result.changed || 0,
    normalized: result.normalized || 0,
    embeddingModel: result.embeddingModel || snapshot?.manifest?.embeddingModel || "-",
    embeddingStatus: result.embeddingStatus || "-",
    pairwiseSpaceReady: result.pairwiseSpaceReady,
    pairwiseSpacePoolCount: result.pairwiseSpacePoolCount || 0,
    pairwiseSpaceTagTypes: result.pairwiseSpaceTagTypes || [],
    pairwiseSpaceTextCount: result.pairwiseSpaceTextCount || 0,
    cacheStatus: snapshot.cacheStatus || {},
  };

  els.normalizeRunDetail.innerHTML = `
    <div class="mono-badge">${escapeHtml(snapshot.runId || "-")}</div>
    <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
    ${buildDetailGrid([
      { label: "Status", value: getRunStatus(snapshot) },
      { label: "Stage", value: progress.stage || "-" },
      { label: "Progress", value: `${percent}%` },
      { label: "Changed Jobs", value: result.changed || 0 },
      { label: "Normalized Tags", value: result.normalized || 0 },
      { label: "Embedding", value: result.embeddingStatus || "-" },
      { label: "Pairwise Space", value: result.pairwiseSpaceReady ? "ready" : "not ready" },
      { label: "Pool Count", value: result.pairwiseSpacePoolCount || 0 },
      { label: "Completed At", value: progress.completedAt || "-" },
    ])}
    <pre style="margin-top: 12px;">${escapeHtml(formatJson(preview))}</pre>
  `;
}

function renderNormalizeLogs(snapshot) {
  if (!els.normalizeLogBox) return;
  els.normalizeLogBox.textContent = formatLogEntries(snapshot?.logsTail || []);
}

function renderNormalizeDecisionSummary(snapshot) {
  const summary = snapshot?.result?.normalizationStats?.decisionSummary || {};

  renderChipRail(
    els.acceptedWordRail,
    summary.accepted || [],
    "当前任务还没有 accepted 结果",
    "review-chip--replaced",
    (item) => `
      <strong>${escapeHtml(item.sourceName || "-")}</strong>
      <span>${escapeHtml(item.method || "accepted")}</span>
      <span>${escapeHtml(item.canonicalName || "-")}</span>
    `,
  );

  renderChipRail(
    els.newWordRail,
    summary.new || [],
    "当前任务还没有 retained 结果",
    "review-chip--unchanged",
    (item) => `
      <strong>${escapeHtml(item.sourceName || "-")}</strong>
      <span>${escapeHtml(item.tagType || "-")}</span>
    `,
  );

  renderChipRail(
    els.suggestWordRail,
    summary.suggestions || [],
    "当前任务还没有 suggestion 结果",
    "",
    (item) => `
      <strong>${escapeHtml(item.sourceName || "-")}</strong>
      <span>${escapeHtml(item.suggestedName || "-")}</span>
      <span>${item.score == null ? "-" : `${(Number(item.score) * 100).toFixed(1)}%`}</span>
    `,
  );
}

async function loadNormalizeRuns() {
  const data = await fetchJson("/api/admin/normalization/runs");
  renderCacheStatus(data.cacheStatus || {});
  renderNormalizeRunCards(data.data || []);

  if (!state.activeNormalizeRunId && data.activeRunId) {
    state.activeNormalizeRunId = data.activeRunId;
  }
  if (!state.activeNormalizeRunId && (data.data || []).length) {
    state.activeNormalizeRunId = data.data[0].runId;
  }
  if (state.activeNormalizeRunId && !(data.data || []).some((run) => run.runId === state.activeNormalizeRunId)) {
    state.activeNormalizeRunId = data.activeRunId || data.data?.[0]?.runId || null;
  }
  return data;
}

async function loadActiveNormalizeRun() {
  if (!state.activeNormalizeRunId) {
    renderNormalizeRunDetail(null);
    renderNormalizeLogs(null);
    renderNormalizeDecisionSummary(null);
    return null;
  }
  const snapshot = await fetchJson(`/api/admin/normalization/runs/${encodeURIComponent(state.activeNormalizeRunId)}`);
  renderNormalizeRunDetail(snapshot);
  renderNormalizeLogs(snapshot);
  renderNormalizeDecisionSummary(snapshot);
  renderCacheStatus(snapshot.cacheStatus || {});
  return snapshot;
}

async function refreshNormalizeSection(showFeedback = false, refreshSummary = true) {
  if (refreshSummary) {
    await loadSummaryIntoDom();
  }
  const data = await loadNormalizeRuns();
  if (state.activeNormalizeRunId) {
    await loadActiveNormalizeRun();
  }
  if (showFeedback) {
    showToast("归一任务状态已刷新", "success", 1600);
  }
  return data;
}

function startNormalizePolling() {
  clearInterval(state.normalizePollTimer);
  if (!state.activeNormalizeRunId) return;
  state.normalizePollTimer = setInterval(async () => {
    try {
      const snapshot = await loadActiveNormalizeRun();
      await loadNormalizeRuns();
      if (!snapshot || isTerminalStatus(getRunStatus(snapshot))) {
        clearInterval(state.normalizePollTimer);
        await loadSummaryIntoDom();
      }
    } catch (error) {
      clearInterval(state.normalizePollTimer);
      showToast(error.message || "归一状态轮询失败", "error", 3200);
    }
  }, POLL_MS);
}

async function startNormalizeRun() {
  const snapshot = await fetchJson("/api/admin/normalization/runs", { method: "POST" });
  state.activeNormalizeRunId = snapshot.runId;
  await refreshNormalizeSection(false, true);
  startNormalizePolling();
  showToast(`归一任务 ${snapshot.runId} 已启动`, "success", 2200);
}

function getReviewConfigs() {
  let configs = ensureDefaultConfigs(loadConfigs());
  if (!Array.isArray(configs)) {
    configs = [];
  }
  const enabled = configs.filter((cfg) => cfg && cfg.enabled !== false);
  return enabled.length ? enabled : configs;
}

function renderReviewConfigOptions() {
  state.reviewConfigs = getReviewConfigs();
  if (!state.selectedReviewConfigId || !state.reviewConfigs.some((cfg) => cfg.id === state.selectedReviewConfigId)) {
    state.selectedReviewConfigId = state.reviewConfigs[0]?.id || null;
  }
  if (!els.tagReviewConfigSelect) return;

  if (!state.reviewConfigs.length) {
    els.tagReviewConfigSelect.innerHTML = `<option value="">No configs found</option>`;
    els.tagReviewConfigSelect.disabled = true;
    return;
  }

  els.tagReviewConfigSelect.disabled = false;
  els.tagReviewConfigSelect.innerHTML = state.reviewConfigs.map((cfg) => `
    <option value="${escapeHtml(cfg.id)}" ${cfg.id === state.selectedReviewConfigId ? "selected" : ""}>
      ${escapeHtml(cfg.name || cfg.id)} | ${escapeHtml(cfg.model || "-")} | ${escapeHtml(cfg.baseUrl || "-")}
    </option>
  `).join("");
}

function getSelectedReviewConfig() {
  return state.reviewConfigs.find((cfg) => cfg.id === state.selectedReviewConfigId) || null;
}

function renderTagReviewSummary(summary, runCount = 0) {
  const current = summary || {};
  const byType = current.byType || {};
  const reviewMode = current.reviewMode || getSelectedReviewMode();

  if (els.metricReviewCandidates) {
    els.metricReviewCandidates.textContent = String(current.totalCandidates || 0);
  }
  if (els.metricReviewTechStack) {
    els.metricReviewTechStack.textContent = String(byType.techStack || 0);
  }
  if (els.metricReviewTechCapabilities) {
    els.metricReviewTechCapabilities.textContent = String(byType.techCapabilities || 0);
  }
  if (els.metricReviewDevTools) {
    els.metricReviewDevTools.textContent = String(byType.devTools || 0);
  }

  if (!els.tagReviewSummaryBox) return;

  const topSamples = (current.topSamples || []).slice(0, 12).map((item, index) => ({
    index: index + 1,
    tagType: item.tagType || "-",
    currentName: item.currentName || "-",
    sampleRawText: item.sampleRawText || "-",
    sampleRawTexts: item.sampleRawTexts || [],
    occurrenceCount: Number(item.occurrenceCount || 0),
    reviewCount: Number(item.reviewCount || 0),
    lastReviewedAt: item.lastReviewedAt || "-",
  }));

  els.tagReviewSummaryBox.innerHTML = `
    <div class="mono-badge">mode: ${escapeHtml(getReviewModeLabel(reviewMode))}</div>
    ${buildDetailGrid([
      { label: "Selected Candidates", value: current.totalCandidates || 0 },
      { label: "Source Candidates", value: current.sourceTotalCandidates || current.totalCandidates || 0 },
      { label: "Tech Stack", value: byType.techStack || 0 },
      { label: "Tech Capabilities", value: byType.techCapabilities || 0 },
      { label: "Dev Tools", value: byType.devTools || 0 },
      { label: "Skipped Reviewed", value: current.skippedReviewedCandidates || 0 },
      { label: "Reviewed Before", value: current.reviewedBeforeCandidates || 0 },
      { label: "Reviewed >1", value: current.repeatReviewedCandidates || 0 },
      { label: "History Runs", value: runCount },
      { label: "Prompt Samples", value: "random up to 3 raw texts" },
      { label: "Writeback", value: "jobs + tag assets" },
    ])}
    <pre style="margin-top: 12px;">${escapeHtml(formatJson({ topSamples }))}</pre>
  `;
}

function renderTagReviewRunCards(runs) {
  const rows = Array.isArray(runs) ? runs.slice() : [];
  rows.sort((left, right) => String(right?.createdAt || "").localeCompare(String(left?.createdAt || "")));
  if (!els.tagReviewRunCards) return;
  if (!rows.length) {
    els.tagReviewRunCards.innerHTML = `<div class="hint">暂无标签复查任务</div>`;
    return;
  }
  els.tagReviewRunCards.innerHTML = rows.map((run) => `
    <div class="job-card ${run.runId === state.activeTagReviewRunId ? "active" : ""}" data-tag-review-run-id="${escapeHtml(run.runId)}">
      <h4>${escapeHtml(run.runId)}</h4>
      <div class="meta">
        <span class="pill">${escapeHtml(run.status || "unknown")}</span>
        <span>${escapeHtml(run.stage || "-")}</span>
        <span>${Number(run.percent || 0)}%</span>
      </div>
      <div class="desc">${escapeHtml(run.configName || "-")} @ ${escapeHtml(run.model || "-")}</div>
      <div class="hint">mode ${escapeHtml(getReviewModeLabel(run.reviewMode || "all"))} | started ${escapeHtml(formatDateTime(run.startedAt || run.createdAt))} | resumed x${Number(run.resumeCount || 0)}</div>
      <div class="hint">reviewed ${Number(run.reviewed || 0)} / changed ${Number(run.changed || 0)} / deleted ${Number(run.deleted || 0)} / split ${Number(run.split || 0)} / failed ${Number(run.failed || 0)}</div>
    </div>
  `).join("");
}

function renderTagReviewRunDetail(snapshot) {
  if (!els.tagReviewRunDetail) return;
  if (!snapshot) {
    els.tagReviewRunDetail.innerHTML = `<div class="hint">请选择一条标签复查任务</div>`;
    if (els.metricReviewReplaced) {
      els.metricReviewReplaced.textContent = "0";
    }
    updateTagReviewControlState(null);
    return;
  }

  const progress = snapshot.progress || {};
  const result = snapshot.result || {};
  const manifest = snapshot.manifest || {};
  const percent = Number(progress.percent || 0);
  updateTagReviewControlState(snapshot);
  if (els.metricReviewReplaced) {
    els.metricReviewReplaced.textContent = String(result.changedCandidates || progress.changedCandidates || 0);
  }

  const preview = {
    reviewMode: manifest.reviewMode || progress.reviewMode || "all",
    startedAt: progress.startedAt || manifest.createdAt || "-",
    pausedAt: progress.pausedAt || "-",
    lastResumedAt: progress.lastResumedAt || "-",
    resumeCount: progress.resumeCount || 0,
    totalCandidates: progress.totalCandidates || manifest?.candidateSummary?.totalCandidates || 0,
    nextIndex: progress.nextIndex || 0,
    maxAttempts: manifest.maxAttempts || "-",
    reviewedCandidates: result.reviewedCandidates || progress.reviewedCandidates || 0,
    changedCandidates: result.changedCandidates || progress.changedCandidates || 0,
    replacedCandidates: result.replacedCandidates || progress.replacedCandidates || 0,
    deletedCandidates: result.deletedCandidates || progress.deletedCandidates || 0,
    splitCandidates: result.splitCandidates || progress.splitCandidates || 0,
    unchangedCandidates: result.unchangedCandidates || progress.unchangedCandidates || 0,
    failedCandidates: result.failedCandidates || progress.failedCandidates || 0,
    updatedOccurrences: result.updatedOccurrences || progress.updatedOccurrences || 0,
    directNormalizedOccurrences: result.directNormalizedOccurrences || progress.directNormalizedOccurrences || 0,
    tokenUsage: result.tokenUsage || {},
    config: result.config || manifest.config || {},
    candidateSummary: result.candidateSummary || manifest.candidateSummary || {},
    reviewStatsSummary: result.reviewStatsSummary || manifest.reviewStatsSummary || {},
  };

  els.tagReviewRunDetail.innerHTML = `
    <div class="mono-badge">${escapeHtml(snapshot.runId || "-")}</div>
    <div class="progress-track"><div class="progress-fill" style="width:${percent}%"></div></div>
    ${buildDetailGrid([
      { label: "Status", value: getRunStatus(snapshot) },
      { label: "Stage", value: progress.stage || "-" },
      { label: "Review Mode", value: getReviewModeLabel(preview.reviewMode) },
      { label: "Progress", value: `${percent}%` },
      { label: "Cursor", value: `${preview.nextIndex} / ${preview.totalCandidates}` },
      { label: "Max Attempts", value: preview.maxAttempts },
      { label: "Started At", value: formatDateTime(preview.startedAt) },
      { label: "Paused At", value: formatDateTime(preview.pausedAt) },
      { label: "Last Resumed", value: formatDateTime(preview.lastResumedAt) },
      { label: "Resume Count", value: preview.resumeCount },
      { label: "Reviewed", value: preview.reviewedCandidates },
      { label: "Changed", value: preview.changedCandidates },
      { label: "Replaced", value: preview.replacedCandidates },
      { label: "Deleted", value: preview.deletedCandidates },
      { label: "Split", value: preview.splitCandidates },
      { label: "Unchanged", value: preview.unchangedCandidates },
      { label: "Failed", value: preview.failedCandidates },
      { label: "Updated Occurrences", value: preview.updatedOccurrences },
      { label: "Direct Normalized", value: preview.directNormalizedOccurrences },
      { label: "Completed At", value: formatDateTime(progress.completedAt) },
    ])}
    <pre style="margin-top: 12px;">${escapeHtml(formatJson(preview))}</pre>
  `;
}

function renderTagReviewLogs(snapshot) {
  if (!els.tagReviewLogBox) return;
  els.tagReviewLogBox.innerHTML = renderTagReviewLogEntries(snapshot?.logsTail || []);
}

function renderTagReviewResult(snapshot) {
  if (!els.tagReviewResultBox) return;
  if (!snapshot) {
    els.tagReviewResultBox.textContent = "// no tag review result yet...";
    return;
  }
  els.tagReviewResultBox.textContent = formatJson(snapshot.result || {});
}

function renderTagReviewDecisionSummary(snapshot) {
  const summary = snapshot?.result?.decisionSummary || {};

  renderChipRail(
    els.reviewReplacedRail,
    summary.replaced || [],
    "当前任务还没有 changed / delete / split 记录",
    "review-chip--replaced",
    (item) => `
      <strong>${escapeHtml(item.currentName || "-")}</strong>
      <span>${escapeHtml(item.action || "replace")} · ${escapeHtml(item.replacement || "-")}</span>
      <span>${escapeHtml(item.tagType || "-")} · ${Number(item.occurrenceCount || 0)}</span>
      <span>reviewCount ${Number(item.reviewCount || 0)}</span>
    `,
  );

  renderChipRail(
    els.reviewUnchangedRail,
    summary.unchanged || [],
    "当前任务还没有 unchanged 记录",
    "review-chip--unchanged",
    (item) => `
      <strong>${escapeHtml(item.currentName || "-")}</strong>
      <span>${escapeHtml(item.tagType || "-")}</span>
      <span>${escapeHtml(item.sampleRawText || "-")}</span>
      <span>reviewCount ${Number(item.reviewCount || 0)}</span>
    `,
  );

  renderChipRail(
    els.reviewFailedRail,
    summary.failed || [],
    "当前任务还没有失败记录",
    "review-chip--failed",
    (item) => `
      <strong>${escapeHtml(item.currentName || "-")}</strong>
      <span>${escapeHtml(item.tagType || "-")}</span>
      <span>${escapeHtml(item.error || "-")}</span>
      <span>reviewCount ${Number(item.reviewCount || 0)}</span>
    `,
  );
}

async function loadTagReviewRuns() {
  renderReviewConfigOptions();
  const reviewMode = getSelectedReviewMode();
  const data = await fetchJson(`/api/admin/normalization/tag-review/runs?review_mode=${encodeURIComponent(reviewMode)}`);
  renderReviewModeOptions(data.availableReviewModes, data.reviewMode || reviewMode);
  renderTagReviewSummary(data.summary || {}, (data.data || []).length);
  renderTagReviewRunCards(data.data || []);

  if (!state.activeTagReviewRunId && data.activeRunId) {
    state.activeTagReviewRunId = data.activeRunId;
  }
  if (!state.activeTagReviewRunId && (data.data || []).length) {
    state.activeTagReviewRunId = data.data[0].runId;
  }
  if (state.activeTagReviewRunId && !(data.data || []).some((run) => run.runId === state.activeTagReviewRunId)) {
    state.activeTagReviewRunId = data.activeRunId || data.data?.[0]?.runId || null;
  }
  if (!state.activeTagReviewRunId) {
    updateTagReviewControlState(null);
  }
  return data;
}

async function loadActiveTagReviewRun() {
  if (!state.activeTagReviewRunId) {
    renderTagReviewRunDetail(null);
    renderTagReviewLogs(null);
    renderTagReviewResult(null);
    renderTagReviewDecisionSummary(null);
    updateTagReviewControlState(null);
    return null;
  }
  const snapshot = await fetchJson(`/api/admin/normalization/tag-review/runs/${encodeURIComponent(state.activeTagReviewRunId)}`);
  renderTagReviewRunDetail(snapshot);
  renderTagReviewLogs(snapshot);
  renderTagReviewResult(snapshot);
  renderTagReviewDecisionSummary(snapshot);
  return snapshot;
}

async function refreshTagReviewSection(showFeedback = false, refreshSummary = true) {
  if (refreshSummary) {
    await loadSummaryIntoDom();
  }
  const data = await loadTagReviewRuns();
  if (state.activeTagReviewRunId) {
    await loadActiveTagReviewRun();
  }
  if (showFeedback) {
    showToast("标签复查状态已刷新", "success", 1600);
  }
  return data;
}

function startTagReviewPolling() {
  clearInterval(state.tagReviewPollTimer);
  if (!state.activeTagReviewRunId) return;
  state.tagReviewPollTimer = setInterval(async () => {
    try {
      const snapshot = await loadActiveTagReviewRun();
      if (!snapshot || isTagReviewSettledStatus(getRunStatus(snapshot))) {
        clearInterval(state.tagReviewPollTimer);
        await loadTagReviewRuns();
        await loadSummaryIntoDom();
      }
    } catch (error) {
      clearInterval(state.tagReviewPollTimer);
      showToast(error.message || "标签复查轮询失败", "error", 3200);
    }
  }, POLL_MS);
}

async function startTagReviewRun() {
  const config = getSelectedReviewConfig();
  if (!config) {
    throw new Error("请先在设置页准备可用模型配置");
  }
  if (!config.baseUrl || !config.apiKey || !config.model) {
    throw new Error("当前配置缺少 Base URL、API Key 或模型名");
  }

  const maxAttempts = clampInt(els.tagReviewMaxAttempts?.value || 3, 1, 5, 3);
  if (els.tagReviewMaxAttempts) {
    els.tagReviewMaxAttempts.value = String(maxAttempts);
  }

  const confirmed = window.confirm(
    `将使用配置「${config.name || config.id}」逐个复查当前中文标签。\n` +
    `范围：techStack / techCapabilities / devTools 中当前标签名含中文的项。\n` +
    `techStack 可严格删除；techCapabilities 可一拆二。\n` +
    `prompt 原文样本：随机最多 3 条。\n` +
    `最大重试：${maxAttempts}。\n\n继续吗？`,
  );
  if (!confirmed) {
    return;
  }

  const snapshot = await fetchJson("/api/admin/normalization/tag-review/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      config,
      maxAttempts,
    }),
  });

  state.activeTagReviewRunId = snapshot.runId;
  await refreshTagReviewSection(false, true);
  startTagReviewPolling();
  showToast(`标签复查任务 ${snapshot.runId} 已启动`, "success", 2200);
}

async function startTagReviewRunV2() {
  const config = getSelectedReviewConfig();
  if (!config) {
    throw new Error("请先在设置页准备可用模型配置");
  }
  if (!config.baseUrl || !config.apiKey || !config.model) {
    throw new Error("当前配置缺少 Base URL、API Key 或模型名");
  }

  const maxAttempts = clampInt(els.tagReviewMaxAttempts?.value || 3, 1, 5, 3);
  const reviewMode = getSelectedReviewMode();
  if (els.tagReviewMaxAttempts) {
    els.tagReviewMaxAttempts.value = String(maxAttempts);
  }

  const confirmed = window.confirm(
    `将使用配置「${config.name || config.id}」启动标签复查。\n` +
    `模式：${getReviewModeLabel(reviewMode)}\n` +
    `范围：techStack / techCapabilities / devTools\n` +
    `Prompt 样本：随机最多 3 条原始摘取文本\n` +
    `最大重试：${maxAttempts}\n\n继续吗？`,
  );
  if (!confirmed) {
    return;
  }

  const snapshot = await fetchJson("/api/admin/normalization/tag-review/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      config,
      maxAttempts,
      reviewMode,
    }),
  });

  state.activeTagReviewRunId = snapshot.runId;
  await refreshTagReviewSection(false, true);
  startTagReviewPolling();
  showToast(`标签复查任务 ${snapshot.runId} 已启动`, "success", 2200);
}

async function pauseSelectedTagReviewRun() {
  if (!state.activeTagReviewRunId) {
    throw new Error("请先选择一条标签复查任务");
  }
  const snapshot = await fetchJson(`/api/admin/normalization/tag-review/runs/${encodeURIComponent(state.activeTagReviewRunId)}/pause`, {
    method: "POST",
  });
  await refreshTagReviewSection(false, true);
  if (snapshot && !isTagReviewSettledStatus(getRunStatus(snapshot))) {
    startTagReviewPolling();
  }
  showToast("已请求暂停，当前候选处理完后会进入 paused。", "success", 2200);
}

async function resumeSelectedTagReviewRun() {
  if (!state.activeTagReviewRunId) {
    throw new Error("请先选择一条标签复查任务");
  }
  const snapshot = await fetchJson(`/api/admin/normalization/tag-review/runs/${encodeURIComponent(state.activeTagReviewRunId)}/resume`, {
    method: "POST",
  });
  state.activeTagReviewRunId = snapshot.runId || state.activeTagReviewRunId;
  await refreshTagReviewSection(false, true);
  startTagReviewPolling();
  showToast("标签复查任务已继续。", "success", 2200);
}

async function restartSelectedTagReviewRun() {
  if (!state.activeTagReviewRunId) {
    throw new Error("请先选择一条标签复查任务");
  }
  const confirmed = window.confirm(
    `将基于任务 ${state.activeTagReviewRunId} 的保存请求重新开始一条新的标签复查任务。\n` +
    "这会创建新的 run，原 run 历史会保留。\n\n继续吗？",
  );
  if (!confirmed) {
    return;
  }
  const snapshot = await fetchJson(`/api/admin/normalization/tag-review/runs/${encodeURIComponent(state.activeTagReviewRunId)}/restart`, {
    method: "POST",
  });
  state.activeTagReviewRunId = snapshot.runId;
  await refreshTagReviewSection(false, true);
  startTagReviewPolling();
  showToast(`已重新开始，新的任务是 ${snapshot.runId}。`, "success", 2200);
}

function wireEvents() {
  els.refreshNormalizeBtn?.addEventListener("click", () => {
    withButtonBusy(els.refreshNormalizeBtn, "刷新中...", () => refreshNormalizeSection(true, true))
      .catch((error) => showToast(error.message || "刷新归一状态失败", "error", 3200));
  });

  els.startNormalizeBtn?.addEventListener("click", () => {
    {
      const confirmed = window.confirm("启动全库归一后，系统必须先拿到完整的两两归一向量空间；如果向量缺失或空间不完整，任务会直接失败，不再降级继续。继续吗？");
      if (!confirmed) return;
      withButtonBusy(els.startNormalizeBtn, "鍚姩涓?..", startNormalizeRun)
        .catch((error) => showToast(error.message || "鍚姩褰掍竴浠诲姟澶辫触", "error", 3600));
      return;
    }
    const confirmed = window.confirm("启动全库归一后，会按当前缓存和匹配规则重新处理 techCapabilities / devTools / certifications。继续吗？");
    if (!confirmed) return;
    withButtonBusy(els.startNormalizeBtn, "启动中...", startNormalizeRun)
      .catch((error) => showToast(error.message || "启动归一任务失败", "error", 3600));
  });

  els.normalizeRunCards?.addEventListener("click", (event) => {
    const card = event.target.closest("[data-normalize-run-id]");
    if (!card) return;
    state.activeNormalizeRunId = card.dataset.normalizeRunId;
    loadActiveNormalizeRun()
      .then((snapshot) => {
        if (snapshot && !isTerminalStatus(getRunStatus(snapshot))) {
          startNormalizePolling();
        }
        return loadNormalizeRuns();
      })
      .catch((error) => showToast(error.message || "加载归一任务详情失败", "error", 3200));
  });

  els.tagReviewConfigSelect?.addEventListener("change", () => {
    state.selectedReviewConfigId = els.tagReviewConfigSelect.value || null;
  });

  els.tagReviewMaxAttempts?.addEventListener("change", () => {
    const nextValue = clampInt(els.tagReviewMaxAttempts.value, 1, 5, 3);
    els.tagReviewMaxAttempts.value = String(nextValue);
  });

  els.tagReviewModeSelect?.addEventListener("change", () => {
    state.selectedReviewMode = els.tagReviewModeSelect.value || "all";
    refreshTagReviewSection(false, false)
      .catch((error) => showToast(error.message || "切换复查模式失败", "error", 3200));
  });

  els.refreshTagReviewBtn?.addEventListener("click", () => {
    withButtonBusy(els.refreshTagReviewBtn, "刷新中...", () => refreshTagReviewSection(true, true))
      .catch((error) => showToast(error.message || "刷新标签复查状态失败", "error", 3200));
  });

  els.startTagReviewBtn?.addEventListener("click", () => {
    withButtonBusy(els.startTagReviewBtn, "启动中...", startTagReviewRunV2)
      .catch((error) => showToast(error.message || "启动标签复查失败", "error", 3600));
  });

  els.pauseTagReviewBtn?.addEventListener("click", () => {
    withButtonBusy(els.pauseTagReviewBtn, "暂停中...", pauseSelectedTagReviewRun)
      .then(() => loadActiveTagReviewRun().catch(() => null))
      .catch((error) => showToast(error.message || "暂停标签复查失败", "error", 3600));
  });

  els.resumeTagReviewBtn?.addEventListener("click", () => {
    withButtonBusy(els.resumeTagReviewBtn, "继续中...", resumeSelectedTagReviewRun)
      .then(() => loadActiveTagReviewRun().catch(() => null))
      .catch((error) => showToast(error.message || "继续标签复查失败", "error", 3600));
  });

  els.restartTagReviewBtn?.addEventListener("click", () => {
    withButtonBusy(els.restartTagReviewBtn, "重启中...", restartSelectedTagReviewRun)
      .then(() => loadActiveTagReviewRun().catch(() => null))
      .catch((error) => showToast(error.message || "重新开始标签复查失败", "error", 3600));
  });

  els.tagReviewRunCards?.addEventListener("click", (event) => {
    const card = event.target.closest("[data-tag-review-run-id]");
    if (!card) return;
    state.activeTagReviewRunId = card.dataset.tagReviewRunId;
    loadActiveTagReviewRun()
      .then((snapshot) => {
        if (snapshot && !isTagReviewSettledStatus(getRunStatus(snapshot))) {
          startTagReviewPolling();
        }
        return loadTagReviewRuns();
      })
      .catch((error) => showToast(error.message || "加载标签复查详情失败", "error", 3200));
  });
}

(async function init() {
  wireNav();
  renderReviewConfigOptions();
  renderReviewModeOptions(null, state.selectedReviewMode);
  updateTagReviewControlState(null);
  wireEvents();

  await loadSummaryIntoDom();
  await loadNormalizeRuns();
  await loadTagReviewRuns();

  if (state.activeNormalizeRunId) {
    const snapshot = await loadActiveNormalizeRun();
    if (snapshot && !isTerminalStatus(getRunStatus(snapshot))) {
      startNormalizePolling();
    }
  }

  if (state.activeTagReviewRunId) {
    const snapshot = await loadActiveTagReviewRun();
    if (snapshot && !isTagReviewSettledStatus(getRunStatus(snapshot))) {
      startTagReviewPolling();
    }
  }
})().catch((error) => {
  showToast(error.message || "归一页面初始化失败", "error", 3600);
});
