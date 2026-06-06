const {
  fetchJson,
  loadSummaryIntoDom,
  wireNav,
  escapeHtml,
  loadConfigs,
  ensureDefaultConfigs,
  showToast,
  withButtonBusy,
} = window.AdminCommon;

const runCards = document.getElementById("runCards");
const runSummaryBox = document.getElementById("runSummaryBox");
const runResultBox = document.getElementById("runResultBox");
const runApplyBox = document.getElementById("runApplyBox");
const runEmbeddingBox = document.getElementById("runEmbeddingBox");
const refreshRunsBtn = document.getElementById("refreshRunsBtn");

const AUTO_REFRESH_MS = 5000;
const RETRY_STORE_KEY = "portrait_builder_run_retry_configs_v1";

let refreshTimer = null;
let activeRunId = null;
let activeSnapshot = null;
let lastErrAt = 0;

const e = escapeHtml;

function getStatus(snapshot) {
  return snapshot?.progress?.status || snapshot?.manifest?.status || "unknown";
}

function getApplyStatus(snapshot) {
  return String(snapshot?.applyProgress?.status || "").toLowerCase();
}

function formatJson(value) {
  try {
    return typeof value === "string" ? value : JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function formatTokenUsage(usage) {
  return {
    total: Number(usage?.totalTokens || 0),
    input: Number(usage?.inputTokens || 0),
    output: Number(usage?.outputTokens || 0),
    calls: Number(usage?.modelCallCount || 0),
  };
}

function readRetryStore() {
  try {
    return JSON.parse(localStorage.getItem(RETRY_STORE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeRetryStore(value) {
  localStorage.setItem(RETRY_STORE_KEY, JSON.stringify(value || {}));
}

function normalizeConfig(config) {
  if (!config || !config.baseUrl || !config.apiKey || !config.model) {
    return null;
  }
  return {
    ...config,
    id: config.id || `cfg_${Date.now()}`,
    name: config.name || config.model,
    stageRole: config.stageRole || "all",
    apiMode: config.apiMode || "chat_completions",
    chatCompletionsSystemRole: config.chatCompletionsSystemRole || "system",
    concurrency: Number(config.concurrency || 30),
    requestsPerMinute: Number(config.requestsPerMinute || 800),
    enabled: config.enabled !== false,
  };
}

function getGlobalConfigs() {
  return ensureDefaultConfigs(loadConfigs()).map(normalizeConfig).filter((config) => config?.enabled);
}

function buildConfigSignature(config) {
  return [
    config?.stageRole || "all",
    config?.apiMode || "chat_completions",
    config?.baseUrl || "",
    config?.model || "",
    config?.name || "",
  ].join("|").toLowerCase();
}

function deriveManifestConfigs(snapshot) {
  const manifestConfigs = snapshot?.manifest?.configs || [];
  const localConfigs = getGlobalConfigs();
  const byId = new Map(localConfigs.map((config) => [config.id, config]));
  const bySignature = new Map(localConfigs.map((config) => [buildConfigSignature(config), config]));
  const configs = [];
  const missing = [];

  manifestConfigs.forEach((item) => {
    const matched = byId.get(item.id) || bySignature.get(buildConfigSignature(item));
    if (!matched?.apiKey) {
      missing.push({ configId: item.id, configName: item.name || item.id || "unknown" });
      return;
    }
    const normalized = normalizeConfig({
      ...matched,
      id: item.id || matched.id,
      name: item.name || matched.name,
      baseUrl: item.baseUrl || matched.baseUrl,
      model: item.model || matched.model,
      stageRole: item.stageRole || matched.stageRole,
      apiMode: item.apiMode || matched.apiMode,
      concurrency: item.concurrency || matched.concurrency,
    });
    if (normalized) {
      configs.push(normalized);
    }
  });

  return {
    source: "manifest",
    configs,
    total: manifestConfigs.length,
    missing,
    updatedAt: "",
  };
}

function getRetryConfigState(snapshot) {
  const store = readRetryStore();
  const key = snapshot?.manifest?.runId || activeRunId;
  const override = store[key];
  if (override?.configs?.length) {
    return {
      source: "override",
      configs: override.configs.map(normalizeConfig).filter((config) => config?.enabled),
      total: override.configs.length,
      missing: [],
      updatedAt: override.updatedAt || "",
    };
  }
  return deriveManifestConfigs(snapshot);
}

function canPause(snapshot) {
  return ["queued", "running"].includes(getStatus(snapshot));
}

function canResume(snapshot) {
  return getStatus(snapshot) === "paused" && snapshot?.execution?.resumeAvailable !== false;
}

function canRetry(snapshot) {
  return ["failed", "partial", "interrupted"].includes(getStatus(snapshot))
    || Number(snapshot?.progress?.failedRecords || 0) > 0;
}

function canApply(snapshot) {
  if (["queued", "running"].includes(getApplyStatus(snapshot))) {
    return false;
  }
  return ["completed", "partial", "failed", "interrupted"].includes(getStatus(snapshot))
    && Number(snapshot?.progress?.succeededRecords || 0) > 0;
}

function canReplaceCurrentConfigs(snapshot) {
  return ["queued", "running", "paused"].includes(getStatus(snapshot));
}

function canRevoke(snapshot) {
  return Boolean(snapshot?.revokeReady || snapshot?.manifest?.latestApply?.snapshot?.snapshotId);
}

function isAutoPausedByCircuit(snapshot) {
  return getStatus(snapshot) === "paused" && snapshot?.progress?.pauseCode === "all_configs_circuit_open";
}

function activeConfigIdSet(snapshot) {
  return new Set((snapshot?.manifest?.configs || []).map((config) => config.id).filter(Boolean));
}

function buildAutoPauseNotice(snapshot) {
  if (!isAutoPausedByCircuit(snapshot)) {
    return "";
  }
  const hint = snapshot?.progress?.pauseHint || "推荐先在设置中修复或更换配置，再继续运行。";
  const reason = snapshot?.execution?.reason || "所有当前可用配置都已熔断。";
  return `
    <div style="margin-bottom:16px;padding:14px 16px;border:1px solid rgba(245,158,11,.35);border-radius:14px;background:rgba(245,158,11,.08);">
      <div style="font-size:13px;font-weight:700;color:#f59e0b;">已自动暂停</div>
      <div style="margin-top:6px;color:var(--tx-1);">${e(reason)}</div>
      <div style="margin-top:6px;color:var(--tx-2);">${e(hint)}</div>
    </div>
  `;
}

function buildActionButtons(snapshot) {
  const buttons = [];
  if (canPause(snapshot)) {
    buttons.push(`<button data-run-action="pause" class="btn btn--primary">暂停</button>`);
  }
  if (canResume(snapshot)) {
    buttons.push(`<button data-run-action="resume" class="btn btn--primary">继续</button>`);
  }
  if (canReplaceCurrentConfigs(snapshot)) {
    buttons.push(`<button data-run-action="replace-current-configs" class="btn btn--secondary">应用设置到当前批次</button>`);
  }
  if (Number(snapshot?.progress?.trippedConfigCount || 0) > 0) {
    buttons.push(`<button data-run-action="recover-circuits" class="btn btn--secondary">恢复全部熔断</button>`);
  }
  if (canRetry(snapshot)) {
    buttons.push(`<button data-run-action="retry" class="btn btn--secondary">重试失败项</button>`);
  }
  buttons.push(`<button data-run-action="save-retry-config" class="btn btn--ghost">保存重试配置</button>`);
  if (getRetryConfigState(snapshot).source === "override") {
    buttons.push(`<button data-run-action="reset-retry-config" class="btn btn--ghost">恢复批次原配置</button>`);
  }
  if (canApply(snapshot)) {
    buttons.push(`<button data-run-action="apply" class="btn btn--primary">写库</button>`);
  }
  buttons.push(
    `<button data-run-action="revoke" class="btn btn--danger" ${canRevoke(snapshot) ? "" : "disabled title=\"当前没有可撤回的入库快照\""}>永久撤回</button>`
  );
  buttons.push(`<button data-run-action="delete" class="btn btn--danger">删除</button>`);

  const artifactButtons = (snapshot?.manifest?.artifacts || [])
    .map((artifact) => `<button data-artifact="${e(artifact)}" class="btn btn--ghost">${e(artifact)}</button>`)
    .join("");

  return `<div class="button-row top-space">${buttons.join("")}${artifactButtons}</div>`;
}

function renderRunSummary(snapshot) {
  activeSnapshot = snapshot || null;
  if (!snapshot) {
    runSummaryBox.innerHTML = `<div class="hint">请选择左侧批次</div>`;
    return;
  }

  const manifest = snapshot.manifest || {};
  const progress = snapshot.progress || {};
  const retryConfigState = getRetryConfigState(snapshot);
  const usage = formatTokenUsage(progress.tokenUsage);
  const activeIds = activeConfigIdSet(snapshot);
  const configRows = Object.values(progress.configStats || {})
    .sort((left, right) => {
      const leftActive = activeIds.has(left.configId) ? 0 : 1;
      const rightActive = activeIds.has(right.configId) ? 0 : 1;
      return leftActive - rightActive;
    })
    .map((stat) => {
      const isActive = activeIds.has(stat.configId);
      const circuitLabel = stat.circuitOpen ? `熔断(${Number(stat.circuitTrips || 0)})` : "正常";
      const recoverBtn = stat.circuitOpen
        ? `<button data-config-action="recover-circuit" data-config-id="${e(stat.configId)}" class="btn btn--danger">恢复</button>`
        : "-";
      return `
        <tr style="${isActive ? "" : "opacity:.65;"}">
          <td>${e(stat.configName || stat.configId)}</td>
          <td>${e(`${stat.stageRole || "all"} / ${stat.apiMode || "-"}`)}</td>
          <td>${Number(stat.completedRecords || 0)} / ${Number(stat.assignedRecords || 0)}</td>
          <td>${Number(stat.failedRecords || 0)}</td>
          <td>${Number(stat.modelCallCount || 0)}</td>
          <td>${Number(stat.errorCount || 0)}</td>
          <td>${Number(stat.reroutedAttempts || 0)} / ${Number(stat.takeoverAttempts || 0)}</td>
          <td>${Number(stat.totalTokens || 0)}</td>
          <td>${e(circuitLabel)}</td>
          <td>${recoverBtn}</td>
        </tr>
      `;
    })
    .join("");

  const updatedAt = retryConfigState.updatedAt ? ` / 更新于 ${e(retryConfigState.updatedAt)}` : "";
  const missingInfo = retryConfigState.missing?.length ? ` / 缺少 Key ${retryConfigState.missing.length}` : "";

  runSummaryBox.innerHTML = `
    ${buildAutoPauseNotice(snapshot)}
    <div style="margin-bottom:16px;">
      <span class="job-id-badge" style="display:inline-block;font-size:13px;padding:6px 12px;">
        ID: ${e(manifest.runId || "未选择")}
      </span>
    </div>
    <div class="mini-stat-bar" style="flex-wrap:wrap;margin-bottom:16px;">
      <div class="mini-stat-tile"><span>状态</span><strong style="color:var(--teal);">${e(getStatus(snapshot))}</strong></div>
      <div class="mini-stat-tile"><span>完成进度</span><strong>${Number(progress.completedRecords || 0)} / ${Number(progress.totalRecords || 0)}</strong></div>
      <div class="mini-stat-tile"><span>自动切换</span><strong>${Number(progress.autoSwitchCount || 0)}</strong></div>
      <div class="mini-stat-tile"><span>熔断数</span><strong>${Number(progress.trippedConfigCount || 0)}</strong></div>
      <div class="mini-stat-tile"><span>Tokens</span><strong>${usage.total}</strong></div>
      <div class="mini-stat-tile"><span>输入 / 输出</span><strong>${usage.input} / ${usage.output}</strong></div>
    </div>
    <div class="card-section__hint">
      <div>策略：单配置连续错误达到 ${Number(progress.failoverThreshold || 3)} 次后自动熔断并切换。</div>
      <div>重试配置来源：${retryConfigState.source === "override" ? "本地覆盖" : "批次配置"} / 可用 ${retryConfigState.configs.length} / ${retryConfigState.total}${updatedAt}${missingInfo}</div>
      ${snapshot?.execution?.reason ? `<div style="color:var(--amber);">说明：${e(snapshot.execution.reason)}</div>` : ""}
      ${manifest?.lifecycle?.lastConfigUpdatedAt ? `<div>当前批次配置最近更新：${e(manifest.lifecycle.lastConfigUpdatedAt)}</div>` : ""}
    </div>
    <div class="section-title slim"><h3>配置运行统计</h3></div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>配置</th>
            <th>角色 / 模式</th>
            <th>完成 / 分配</th>
            <th>失败</th>
            <th>调用</th>
            <th>错误</th>
            <th>切换 / 接管</th>
            <th>Tokens</th>
            <th>熔断</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>${configRows || `<tr><td colspan="10" style="text-align:center;">暂无配置统计</td></tr>`}</tbody>
      </table>
    </div>
    <div class="button-row-wrap" style="margin-top:16px;border-top:1px solid var(--border);padding-top:16px;">
      ${buildActionButtons(snapshot)}
    </div>
  `;
}

function renderRunPreview(snapshot) {
  if (!snapshot) {
    runResultBox.innerHTML = `<div class="hint">暂无数据</div>`;
    return;
  }

  const attempts = snapshot?.attemptTracePreview || [];
  const results = snapshot?.resultPreview || [];
  const failures = snapshot?.failurePreview || [];

  const resultRows = results.map((item) => {
    const portrait = item?.portrait || {};
    return `
      <tr>
        <td>${e(item?.recordId || item?.id || "-")}</td>
        <td>${e(portrait?.jobName || portrait?.title || "-")}</td>
        <td>${e(item?.processing?.configName || item?.configName || "-")}</td>
      </tr>
    `;
  }).join("");

  const failureRows = failures.map((item) => `
    <div style="padding:12px;border-radius:12px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.18);">
      <strong>${e(item?.recordId || item?.id || "-")}</strong>
      <div class="hint" style="margin-top:6px;">${e(item?.error || "unknown error")}</div>
    </div>
  `).join("");

  const attemptRows = attempts.map((item) => `
    <div style="padding:12px;border-radius:12px;background:var(--surface-2);border:1px solid var(--border);">
      <div><strong>${e(item?.recordId || item?.id || "-")}</strong> / 尝试 ${Number(item?.attempt || 0)}</div>
      <div class="hint" style="margin-top:6px;">${e(item?.error || item?.status || "-")}</div>
      <pre style="margin-top:10px;white-space:pre-wrap;">${e(formatJson(item?.stages || []))}</pre>
    </div>
  `).join("");

  runResultBox.className = "terminal-box";
  runResultBox.style.cssText = "white-space:normal;max-height:none;";
  runResultBox.innerHTML = `
    <div class="stats-row">
      <div class="stat-tile"><span>结果预览</span><strong>${results.length}</strong></div>
      <div class="stat-tile"><span>失败预览</span><strong>${failures.length}</strong></div>
      <div class="stat-tile"><span>尝试轨迹</span><strong>${attempts.length}</strong></div>
    </div>
    <div class="section-title slim top-space"><h3>成功结果预览</h3></div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>记录</th><th>岗位名</th><th>配置</th></tr></thead>
        <tbody>${resultRows || `<tr><td colspan="3" style="text-align:center;">暂无成功结果</td></tr>`}</tbody>
      </table>
    </div>
    <div class="section-title slim top-space"><h3>失败预览</h3></div>
    <div style="display:grid;gap:10px;">${failureRows || `<div class="hint">暂无失败记录</div>`}</div>
    <div class="section-title slim top-space"><h3>尝试轨迹</h3></div>
    <div style="display:grid;gap:10px;">${attemptRows || `<div class="hint">暂无尝试轨迹</div>`}</div>
  `;
}

function renderApplyInsights(snapshot) {
  if (!snapshot) {
    runApplyBox.innerHTML = `<div class="hint">请选择左侧批次查看入库信息</div>`;
    return;
  }

  const applyProgress = snapshot?.applyProgress || {};
  const importSummary = snapshot?.importSummary || snapshot?.manifest?.latestApply || {};
  const applyStatus = getApplyStatus(snapshot);

  if (["queued", "running", "failed"].includes(applyStatus)) {
    runApplyBox.innerHTML = `
      <div class="stats-row">
        <div class="stat-tile"><span>状态</span><strong>${e(applyStatus)}</strong></div>
        <div class="stat-tile"><span>进度</span><strong>${Number(applyProgress.percent || 0)}%</strong></div>
      </div>
      <div class="hint top-space">${e(applyProgress.error || applyProgress.message || "处理中...")}</div>
      ${applyStatus === "failed" && canApply(snapshot) ? `<div class="button-row top-space"><button data-run-action="apply" class="btn btn--primary">重新写库</button></div>` : ""}
    `;
    return;
  }

  if (importSummary?.staleByRetry) {
    runApplyBox.innerHTML = `<div class="hint">当前批次已经重试，旧的入库结果已失效。</div>`;
    return;
  }

  if (!importSummary?.applied) {
    runApplyBox.innerHTML = `
      <div class="hint">当前批次尚未写库。</div>
      ${canApply(snapshot) ? `<div class="button-row top-space"><button data-run-action="apply" class="btn btn--primary">写库</button></div>` : ""}
    `;
    return;
  }

  const byTypeRows = Object.entries(importSummary?.normalizationStats?.byType || {})
    .map(([type, row]) => `
      <tr>
        <td>${e(type)}</td>
        <td>${Number(row?.total || 0)}</td>
        <td>${Number(row?.accepted || 0)}</td>
        <td>${Number(row?.embeddingAccepted || 0)}</td>
        <td>${Number(row?.new || 0)}</td>
      </tr>
    `)
    .join("");

  runApplyBox.innerHTML = `
    <div class="stats-row">
      <div class="stat-tile"><span>导入</span><strong>${Number(importSummary.imported || 0)}</strong></div>
      <div class="stat-tile"><span>新增</span><strong>${Number(importSummary.created || 0)}</strong></div>
      <div class="stat-tile"><span>更新</span><strong>${Number(importSummary.updated || 0)}</strong></div>
    </div>
    ${canApply(snapshot) ? `<div class="button-row top-space"><button data-run-action="apply" class="btn btn--primary">重新写库</button></div>` : ""}
    <div class="table-wrap top-space">
      <table>
        <thead><tr><th>标签类型</th><th>总量</th><th>接受</th><th>Embedding 接受</th><th>新增</th></tr></thead>
        <tbody>${byTypeRows || `<tr><td colspan="5" style="text-align:center;">暂无归一统计</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function renderEmbeddingLogs(snapshot) {
  if (!snapshot) {
    runEmbeddingBox.innerHTML = `<div class="hint">请选择左侧批次查看 embedding 日志</div>`;
    return;
  }

  const logs = snapshot?.embeddingLogPreview?.length
    ? snapshot.embeddingLogPreview
    : (snapshot?.importSummary?.embeddingStatus
      ? [{ stage: "import", status: snapshot.importSummary.embeddingStatus, ts: snapshot.importSummary.importedAt }]
      : []);

  runEmbeddingBox.innerHTML = logs.length
    ? `<div style="display:grid;gap:12px;">${logs.map((entry) => `
        <div style="padding:14px 16px;background:var(--surface-2);border-radius:12px;">
          <strong>${e(entry.stage || "-")}</strong>
          <span class="pill">${e(entry.status || "-")}</span>
          <div class="hint">${e(entry.ts || "-")}</div>
          ${entry.message ? `<div class="hint" style="margin-top:6px;">${e(entry.message)}</div>` : ""}
        </div>
      `).join("")}</div>`
    : `<div class="hint">暂无 embedding 日志</div>`;
}

function clearPanels(summaryMessage, applyMessage, embeddingMessage) {
  activeSnapshot = null;
  runSummaryBox.innerHTML = `<div class="hint">${e(summaryMessage)}</div>`;
  runResultBox.innerHTML = `<div class="hint">暂无数据</div>`;
  runApplyBox.innerHTML = `<div class="hint">${e(applyMessage)}</div>`;
  runEmbeddingBox.innerHTML = `<div class="hint">${e(embeddingMessage)}</div>`;
}

function renderSnapshot(snapshot) {
  activeSnapshot = snapshot || null;
  if (snapshot?.manifest?.runId) {
    activeRunId = snapshot.manifest.runId;
  }
  renderRunSummary(snapshot);
  renderRunPreview(snapshot);
  renderApplyInsights(snapshot);
  renderEmbeddingLogs(snapshot);
}

async function loadRunsList() {
  const runs = (await fetchJson("/api/builder/runs")).data || [];
  runCards.innerHTML = runs.map((run) => `
    <div class="job-card ${run.runId === activeRunId ? "active" : ""}" data-run-id="${e(run.runId)}">
      <h4>${e(run.runId)}</h4>
      <div class="meta">
        <span class="pill status-${e(run.status)}">${e(run.status)}</span>
        <span>${Number(run.completedRecords || 0)} / ${Number(run.recordCount || 0)}</span>
      </div>
      <div class="hint" style="margin-top:8px;">熔断 ${Number(run.trippedConfigCount || 0)} / 自动切换 ${Number(run.autoSwitchCount || 0)}</div>
      <div class="button-row top-space">
        ${["queued", "running"].includes(run.status) ? `<button data-card-action="pause" data-run-id="${e(run.runId)}" class="btn btn--primary">暂停</button>` : ""}
        ${run.status === "paused" ? `<button data-card-action="resume" data-run-id="${e(run.runId)}" class="btn btn--primary">继续</button>` : ""}
        <button data-card-action="delete" data-run-id="${e(run.runId)}" class="btn btn--danger">删除</button>
      </div>
    </div>
  `).join("") || `<div class="hint">暂无运行记录</div>`;
  return runs;
}

async function loadActiveRun() {
  if (!activeRunId) {
    return null;
  }
  const snapshot = await fetchJson(`/api/builder/runs/${activeRunId}`);
  renderSnapshot(snapshot);
  return snapshot;
}

async function refreshRunsView(showMessage = false) {
  await loadSummaryIntoDom();
  const runs = await loadRunsList();
  if (activeRunId) {
    if (runs.some((run) => run.runId === activeRunId)) {
      await loadActiveRun();
    } else {
      activeRunId = null;
      clearPanels("当前批次已不存在", "无入库结果", "无日志");
    }
  }
  if (showMessage) {
    showToast("已刷新", "success", 1800);
  }
}

async function execAction(label, url, options = {}, successMessage = "") {
  const response = await fetchJson(url, options);
  const snapshot = response.snapshot || response;
  if (snapshot?.manifest) {
    renderSnapshot(snapshot);
  }
  await loadRunsList();
  showToast(successMessage || response.message || `${label}成功`, "success");
  return response;
}

async function saveRetryConfigForRun() {
  if (!activeRunId) {
    throw new Error("当前没有选中批次");
  }
  const configs = getGlobalConfigs();
  if (!configs.length) {
    throw new Error("设置中没有可用配置");
  }
  const store = readRetryStore();
  store[activeRunId] = {
    updatedAt: new Date().toISOString(),
    configs,
  };
  writeRetryStore(store);
  const snapshot = await loadActiveRun();
  if (snapshot) {
    renderSnapshot(snapshot);
  }
  showToast("已保存为重试配置", "success");
}

async function resetRetryConfigForRun() {
  if (!activeRunId) {
    throw new Error("当前没有选中批次");
  }
  const store = readRetryStore();
  delete store[activeRunId];
  writeRetryStore(store);
  const snapshot = await loadActiveRun();
  if (snapshot) {
    renderSnapshot(snapshot);
  }
  showToast("已恢复批次原配置", "success");
}

async function replaceCurrentRunConfigs() {
  if (!activeRunId) {
    throw new Error("当前没有选中批次");
  }
  const configs = getGlobalConfigs();
  if (!configs.length) {
    throw new Error("设置中没有可用配置，请先去设置页修复。");
  }

  let snapshot = activeSnapshot || await fetchJson(`/api/builder/runs/${activeRunId}`);
  if (["queued", "running"].includes(getStatus(snapshot))) {
    snapshot = await fetchJson(`/api/builder/runs/${activeRunId}/pause`, { method: "POST" });
    renderSnapshot(snapshot);
  }

  const updated = await fetchJson(`/api/builder/runs/${activeRunId}/configs/replace`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pauseFirst: true, configs }),
  });
  renderSnapshot(updated);
  await loadRunsList();
  showToast("已暂停并应用设置中的配置到当前批次", "success", 2600);
}

async function retryFailedRecords() {
  if (!activeRunId) {
    throw new Error("当前没有选中批次");
  }
  const snapshot = await fetchJson(`/api/builder/runs/${activeRunId}`);
  const configs = getRetryConfigState(snapshot).configs;
  if (!configs.length) {
    throw new Error("没有可用重试配置，请先在设置页补齐可用配置。");
  }
  const response = await fetchJson(`/api/builder/runs/${activeRunId}/retry`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "failed_only", configs }),
  });
  renderSnapshot(response);
  await loadRunsList();
  showToast("已开始原地重试失败项", "success");
}

function handleRunAction(action) {
  const actions = {
    pause: () => execAction("暂停", `/api/builder/runs/${activeRunId}/pause`, { method: "POST" }, "已暂停"),
    resume: () => execAction("继续", `/api/builder/runs/${activeRunId}/resume`, { method: "POST" }, "已继续"),
    retry: () => retryFailedRecords(),
    apply: () => execAction(
      "写库",
      `/api/builder/runs/${activeRunId}/apply`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ normalizeWithExistingTags: false }),
      },
      "已触发写库"
    ),
    revoke: async () => {
      if (!window.confirm("确认永久撤回这个批次的入库结果吗？")) {
        return null;
      }
      const response = await fetchJson(`/api/builder/runs/${activeRunId}/revoke`, { method: "POST" });
      activeRunId = null;
      await loadRunsList();
      clearPanels("该批次已撤回", "无入库结果", "无日志");
      showToast(response.message || "已永久撤回", "success");
      return response;
    },
    delete: async () => {
      if (!window.confirm("确认删除这个批次吗？")) {
        return null;
      }
      await fetchJson(`/api/builder/runs/${activeRunId}`, { method: "DELETE" });
      activeRunId = null;
      await loadRunsList();
      clearPanels("该批次已删除", "无入库结果", "无日志");
      showToast("已删除", "success");
      return null;
    },
    "recover-circuits": () => execAction(
      "恢复熔断",
      `/api/builder/runs/${activeRunId}/configs/recover-circuit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configIds: [] }),
      },
      "已恢复全部熔断配置"
    ),
    "save-retry-config": () => saveRetryConfigForRun(),
    "reset-retry-config": () => resetRetryConfigForRun(),
    "replace-current-configs": () => replaceCurrentRunConfigs(),
  };
  return actions[action] ? actions[action]() : null;
}

(async function init() {
  wireNav();
  clearPanels("请选择左侧批次", "请选择左侧批次查看入库结果", "请选择左侧批次查看日志");
  await refreshRunsView(false);

  refreshTimer = setInterval(() => {
    refreshRunsView(false).catch((error) => {
      if (Date.now() - lastErrAt > 15000) {
        showToast(error.message || "自动刷新失败", "error", 2800);
        lastErrAt = Date.now();
      }
    });
  }, AUTO_REFRESH_MS);

  refreshRunsBtn.addEventListener("click", () => withButtonBusy(refreshRunsBtn, "刷新中...", () => refreshRunsView(true)));

  runCards.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-card-action]");
    if (actionButton) {
      const runId = actionButton.dataset.runId;
      const action = actionButton.dataset.cardAction;
      const url = `/api/builder/runs/${runId}${action === "delete" ? "" : `/${action}`}`;
      const runner = async () => {
        if (action === "delete") {
          if (!window.confirm(`确认删除 ${runId} 吗？`)) {
            return null;
          }
          await fetchJson(url, { method: "DELETE" });
          if (runId === activeRunId) {
            activeRunId = null;
            clearPanels("该批次已删除", "无入库结果", "无日志");
          }
          await loadRunsList();
          showToast("已删除", "success");
          return null;
        }
        const response = await fetchJson(url, { method: "POST" });
        if (runId === activeRunId) {
          renderSnapshot(response);
        }
        await loadRunsList();
        showToast(action === "pause" ? "已暂停" : "已继续", "success");
        return response;
      };
      withButtonBusy(actionButton, "处理中...", runner).catch((error) => showToast(error.message || "操作失败", "error", 3200));
      return;
    }

    const card = event.target.closest("[data-run-id]");
    if (!card) {
      return;
    }
    activeRunId = card.dataset.runId;
    document.querySelectorAll(".job-card").forEach((node) => node.classList.remove("active"));
    card.classList.add("active");
    clearPanels("加载中...", "加载中...", "加载中...");
    loadActiveRun().catch((error) => showToast(error.message || "加载批次失败", "error", 3200));
  });

  [runSummaryBox, runApplyBox].forEach((box) => {
    box.addEventListener("click", (event) => {
      const artifactButton = event.target.closest("[data-artifact]");
      if (artifactButton && activeRunId) {
        window.open(`/api/builder/runs/${activeRunId}/artifacts/${artifactButton.dataset.artifact}`);
        return;
      }

      const configButton = event.target.closest("[data-config-action]");
      if (configButton?.dataset.configAction === "recover-circuit") {
        withButtonBusy(configButton, "恢复中...", () => execAction(
          "恢复熔断",
          `/api/builder/runs/${activeRunId}/configs/recover-circuit`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ configIds: [configButton.dataset.configId] }),
          },
          "已恢复该配置熔断"
        )).catch((error) => showToast(error.message || "恢复失败", "error", 3200));
        return;
      }

      const runButton = event.target.closest("[data-run-action]");
      if (!runButton) {
        return;
      }
      withButtonBusy(runButton, "处理中...", () => handleRunAction(runButton.dataset.runAction))
        .catch((error) => showToast(error.message || "操作失败", "error", 3200));
    });
  });
})().catch((error) => {
  showToast(error.message || "运行记录页初始化失败", "error", 3600);
});
