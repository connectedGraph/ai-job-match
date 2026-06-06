window.AdminCommon = (() => {
  const CONFIG_STORAGE_KEY = "portrait_builder_configs_v1";

  const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"]/g, (s) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[s]));

  const uid = () => `cfg_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

  async function fetchJson(url, options) {
    const res = await fetch(url, options);
    const raw = await res.text();
    let data = null;
    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        data = raw;
      }
    }
    if (!res.ok) {
      const detail = typeof data === "string"
        ? data
        : typeof data?.detail === "string"
          ? data.detail
          : data?.detail?.message || JSON.stringify(data?.detail || {});
      throw new Error(detail || `Request failed: ${res.status}`);
    }
    return data;
  }

  function loadConfigs() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG_STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function saveConfigs(configs) {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(configs));
  }

  function ensureDefaultConfigs(configs) {
    if (configs.length) return configs;
    if (localStorage.getItem(CONFIG_STORAGE_KEY) !== null) return [];
    return [{
      id: uid(),
      name: "默认配置",
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
    }];
  }

  function ensureToastHost() {
    let host = document.getElementById("toastHost");
    if (!host) {
      host = document.createElement("div");
      host.id = "toastHost";
      host.className = "toast-host";
      document.body.appendChild(host);
    }
    return host;
  }

  function showToast(message, type = "info", duration = 3000) {
    const host = ensureToastHost();
    const toast = document.createElement("div");
    const title = type === "success" ? "SUCCESS" : type === "error" ? "ERROR" : "INFO";
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<strong>${title}</strong><span>${escapeHtml(message)}</span>`;
    host.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("visible"));
    const removeToast = () => {
      toast.classList.remove("visible");
      setTimeout(() => {
        if (toast.parentElement) toast.parentElement.removeChild(toast);
      }, 220);
    };
    toast.addEventListener("click", removeToast);
    if (duration > 0) setTimeout(removeToast, duration);
    return toast;
  }

  function showInfo(message, type = "info", timeout = 2600) {
    return showToast(message, type, timeout);
  }

  function setButtonBusy(button, busy, pendingText = "处理中...") {
    if (!button) return;
    if (busy) {
      if (button.dataset.busy === "1") return;
      button.dataset.busy = "1";
      button.dataset.originalText = button.innerHTML;
      button.disabled = true;
      button.classList.add("is-busy");
      button.innerHTML = escapeHtml(pendingText);
      return;
    }
    if (button.dataset.originalText) {
      button.innerHTML = button.dataset.originalText;
    }
    button.disabled = false;
    button.classList.remove("is-busy");
    delete button.dataset.busy;
    delete button.dataset.originalText;
  }

  async function withButtonBusy(button, pendingText, action) {
    if (!button) return action();
    if (button.dataset.busy === "1") return null;
    setButtonBusy(button, true, pendingText);
    try {
      return await action();
    } finally {
      setButtonBusy(button, false);
    }
  }

  async function loadSummaryIntoDom() {
    const jobEl = document.getElementById("metricJobs");
    const tagEl = document.getElementById("metricTags");
    const highEl = document.getElementById("metricHighTags");
    const runEl = document.getElementById("metricRuns");
    if (!jobEl && !tagEl && !highEl && !runEl) return null;
    const [summary, runs] = await Promise.all([
      fetchJson("/api/admin/summary"),
      fetchJson("/api/builder/runs"),
    ]);
    if (jobEl) jobEl.textContent = summary.jobCount;
    if (tagEl) tagEl.textContent = summary.tagCount;
    if (highEl) highEl.textContent = summary.highFrequencyTagCount;
    if (runEl) runEl.textContent = (runs.data || []).length;
    return { summary, runs: runs.data || [] };
  }

  function wireNav() {
    const page = document.body.dataset.page;
    document.querySelectorAll("[data-nav-page]").forEach((node) => {
      node.classList.toggle("active", node.dataset.navPage === page);
    });
  }

  return {
    CONFIG_STORAGE_KEY,
    escapeHtml,
    uid,
    fetchJson,
    showToast,
    showInfo,
    setButtonBusy,
    withButtonBusy,
    loadConfigs,
    saveConfigs,
    ensureDefaultConfigs,
    loadSummaryIntoDom,
    wireNav,
  };
})();

window.showToast = window.AdminCommon.showToast;
