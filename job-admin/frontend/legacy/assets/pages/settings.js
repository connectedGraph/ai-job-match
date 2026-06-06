const {
  fetchJson,
  loadSummaryIntoDom,
  wireNav,
  loadConfigs,
  saveConfigs,
  ensureDefaultConfigs,
  uid,
  escapeHtml,
  showToast,
  withButtonBusy,
} = window.AdminCommon;

const state = { configs: [], selectedConfigId: null };

function currentConfig() {
  return state.configs.find((cfg) => cfg.id === state.selectedConfigId) || state.configs[0] || null;
}

function setEditorValues(cfg) {
  cfgName.value = cfg?.name || "";
  cfgStageRole.value = cfg?.stageRole || "all";
  cfgMode.value = cfg?.apiMode || "chat_completions";
  cfgChatSystemRole.value = cfg?.chatCompletionsSystemRole || "system";
  cfgEnabled.checked = cfg?.enabled ?? true;
  cfgBaseUrl.value = cfg?.baseUrl || "";
  cfgApiKey.value = cfg?.apiKey || "";
  cfgModel.value = cfg?.model || "";
  cfgConcurrency.value = cfg?.concurrency || 30;
  cfgRequestsPerMinute.value = cfg?.requestsPerMinute || 800;
  cfgTemperature.value = cfg?.temperature ?? 0.2;
  cfgTokens.value = cfg?.maxTokens || 4000;
  configTestBox.textContent = "暂无测试结果";
  deleteConfigBtn.disabled = !cfg;
}

function renderConfigs() {
  configList.innerHTML = state.configs.map((cfg) => `
    <div class="job-card ${cfg.id === state.selectedConfigId ? "active" : ""}" data-config-id="${cfg.id}">
      <h4>${escapeHtml(cfg.name || "未命名配置")}</h4>
      <div class="meta">
        <span class="pill">${cfg.enabled ? "启用" : "停用"}</span>
        <span>${escapeHtml(cfg.apiMode)}</span>
        <span>${escapeHtml(cfg.apiMode === "chat_completions" ? `role ${cfg.chatCompletionsSystemRole || "system"}` : "role -")}</span>
        <span>并发 ${cfg.concurrency}</span>
        <span>RPM ${cfg.requestsPerMinute || 800}</span>
      </div>
      <div class="desc">${escapeHtml(cfg.model || "未选模型")} @ ${escapeHtml(cfg.baseUrl || "未配置主机")}</div>
    </div>
  `).join("") || `<div class="hint">暂无配置，请新建一条。</div>`;

  setEditorValues(currentConfig());
}

function readEditor() {
  return {
    ...(currentConfig() || { id: uid(), enabled: true }),
    name: cfgName.value.trim(),
    stageRole: cfgStageRole.value || "all",
    apiMode: cfgMode.value,
    chatCompletionsSystemRole: cfgChatSystemRole.value || "system",
    baseUrl: cfgBaseUrl.value.trim(),
    apiKey: cfgApiKey.value.trim(),
    model: cfgModel.value.trim(),
    concurrency: Number(cfgConcurrency.value || 30),
    requestsPerMinute: Number(cfgRequestsPerMinute.value || 800),
    temperature: Number(cfgTemperature.value || 0.2),
    maxTokens: Number(cfgTokens.value || 4000),
    enabled: cfgEnabled.checked,
  };
}

function renderTestResult(payload) {
  configTestBox.textContent = JSON.stringify(payload, null, 2);
}

async function fetchModels() {
  const cfg = readEditor();
  if (!cfg.baseUrl || !cfg.apiKey) {
    showToast("请先填写 Base URL 和 API Key", "error");
    return;
  }

  const data = await fetchJson("/api/builder/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey }),
  });

  const selected = prompt(`可用模型：\n${data.models.join("\n")}\n\n输入要写入的模型名`, data.models[0] || cfg.model || "");
  if (selected !== null) {
    cfgModel.value = selected.trim();
    showToast(`已拉取 ${data.models.length} 个模型`, "success", 1800);
  } else {
    showToast("已取消模型写入", "info", 1500);
  }
}

async function testCurrentConfig() {
  const cfg = readEditor();
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) {
    showToast("请先填写 Base URL、API Key 和模型名", "error");
    return;
  }

  renderTestResult({
    status: "pending",
    message: "正在发送测试请求",
    request: {
      apiMode: cfg.apiMode,
      chatCompletionsSystemRole: cfg.chatCompletionsSystemRole || "system",
      model: cfg.model,
      baseUrl: cfg.baseUrl,
      message: "测试，请直接回复1",
    },
  });

  const result = await fetchJson("/api/builder/configs/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config: cfg }),
  });

  renderTestResult(result);
  showToast("模型测试成功", "success", 1800);
}

function saveCurrentConfig() {
  const next = readEditor();
  const exists = state.configs.some((item) => item.id === next.id);
  state.configs = exists
    ? state.configs.map((item) => (item.id === next.id ? next : item))
    : [next, ...state.configs];
  state.selectedConfigId = next.id;
  saveConfigs(state.configs);
  renderConfigs();
  showToast(`配置 ${next.name || next.id} 已保存`, "success");
}

function deleteCurrentConfig() {
  const cfg = currentConfig();
  if (!cfg) {
    showToast("当前没有可删除的配置", "info", 1800);
    return;
  }
  const confirmed = window.confirm(`确定删除配置「${cfg.name || cfg.id}」？`);
  if (!confirmed) return;

  state.configs = state.configs.filter((item) => item.id !== cfg.id);
  state.selectedConfigId = state.configs[0]?.id || null;
  saveConfigs(state.configs);
  renderConfigs();
  showToast(`已删除配置 ${cfg.name || cfg.id}`, "success", 1800);
}

(async function init() {
  wireNav();
  await loadSummaryIntoDom();
  state.configs = ensureDefaultConfigs(loadConfigs());
  state.selectedConfigId = state.configs[0]?.id || null;
  renderConfigs();

  addConfigBtn.addEventListener("click", () => {
    state.configs.unshift({
      id: uid(),
      name: `配置 ${state.configs.length + 1}`,
      baseUrl: "",
      apiKey: "",
      model: "",
      stageRole: "all",
      apiMode: "chat_completions",
      chatCompletionsSystemRole: "system",
      concurrency: 30,
      requestsPerMinute: 800,
      temperature: 0.2,
      maxTokens: 4000,
      enabled: true,
    });
    state.selectedConfigId = state.configs[0].id;
    saveConfigs(state.configs);
    renderConfigs();
    showToast("已新增配置", "success", 1800);
  });

  configList.addEventListener("click", (event) => {
    const card = event.target.closest("[data-config-id]");
    if (!card) return;
    state.selectedConfigId = card.dataset.configId;
    renderConfigs();
    showToast("已切换配置", "info", 1200);
  });

  fetchModelsBtn.addEventListener("click", () => {
    fetchModels().catch((error) => showToast(error.message || "模型列表拉取失败", "error", 3200));
  });

  testConfigBtn.addEventListener("click", () => {
    withButtonBusy(testConfigBtn, "测试中...", () => testCurrentConfig())
      .catch((error) => {
        renderTestResult({
          ok: false,
          message: error.message || "模型测试失败",
          request: {
            apiMode: cfgMode.value,
            chatCompletionsSystemRole: cfgChatSystemRole.value || "system",
            model: cfgModel.value.trim(),
            baseUrl: cfgBaseUrl.value.trim(),
            message: "测试，请直接回复1",
          },
        });
        showToast(error.message || "模型测试失败", "error", 3200);
      });
  });

  deleteConfigBtn.addEventListener("click", () => {
    try {
      deleteCurrentConfig();
    } catch (error) {
      showToast(error.message || "删除配置失败", "error", 3200);
    }
  });

  saveConfigBtn.addEventListener("click", () => {
    try {
      saveCurrentConfig();
    } catch (error) {
      showToast(error.message || "配置保存失败", "error", 3200);
    }
  });
})().catch((error) => {
  showToast(error.message || "配置页初始化失败", "error", 3600);
});
