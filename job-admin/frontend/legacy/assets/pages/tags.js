const {
  fetchJson,
  loadSummaryIntoDom,
  wireNav,
  escapeHtml,
  showToast,
  withButtonBusy,
} = window.AdminCommon;

const TAG_VIEW_STORAGE_KEY = "tags_center_view_v1";
const TAGS_PAGE_LIMIT = 1000;
const FILTER_DEBOUNCE_MS = 250;

const VIEW_META = {
  normalized: {
    label: "归一后标签",
    hint: "当前查看：归一后标签。这里展示当前岗位库里最终生效的标签集合。",
    primaryHeader: "Normalized Tag",
    secondaryHeader: "中文对照",
    emptyText: "当前筛选下没有归一后标签",
    toastNoun: "归一后 Tag",
  },
  source: {
    label: "归一前原始标签",
    hint: "当前查看：归一前原始标签。这里展示抽取阶段留下的原始标签/原文表达集合。",
    primaryHeader: "Raw Extracted Tag",
    secondaryHeader: "中文/显示名",
    emptyText: "当前筛选下没有归一前原始标签",
    toastNoun: "原始 Tag",
  },
};

const els = {
  tagKeywordInput: document.getElementById("tagKeyword"),
  tagTypeFilterSelect: document.getElementById("tagTypeFilter"),
  tagRatioFilterSelect: document.getElementById("tagRatioFilter"),
  tagViewFilterSelect: document.getElementById("tagViewFilter"),
  tagViewHint: document.getElementById("tagViewHint"),
  loadTagsBtn: document.getElementById("loadTagsBtn"),
  tagTableBody: document.getElementById("tagTableBody"),
  tagResultCount: document.getElementById("tagResultCount"),
  fixedDimensionCount: document.getElementById("fixedDimensionCount"),
  regularTagPoolCount: document.getElementById("regularTagPoolCount"),
  softDimensionList: document.getElementById("softDimensionList"),
  growthDimensionList: document.getElementById("growthDimensionList"),
  tagPrimaryHeader: document.getElementById("tagPrimaryHeader"),
  tagSecondaryHeader: document.getElementById("tagSecondaryHeader"),
};

let filterTimer = null;
let latestRequestId = 0;
let selectedTagView = localStorage.getItem(TAG_VIEW_STORAGE_KEY) || "normalized";

function normalizeTagView(view) {
  return view === "source" ? "source" : "normalized";
}

function getCurrentViewMeta(view = selectedTagView) {
  return VIEW_META[normalizeTagView(view)];
}

function renderFixedDimensionList(container, rows) {
  if (!container) {
    return;
  }

  container.innerHTML = (rows || []).map((row) => `
    <div class="dimension-item">
      <div>
        <strong>${escapeHtml(row.tagName || row.canonicalName || "-")}</strong>
        <span>${escapeHtml(row.tagId || "固定维度")}</span>
      </div>
      <div>
        <b>${Number(row.jobCount || 0)}</b>
        <span>${((Number(row.jobRatio || 0)) * 100).toFixed(2)}%</span>
      </div>
    </div>
  `).join("") || `<div class="hint">暂无固定维度数据</div>`;
}

function renderViewMeta(view) {
  const normalizedView = normalizeTagView(view);
  selectedTagView = normalizedView;
  localStorage.setItem(TAG_VIEW_STORAGE_KEY, normalizedView);
  if (els.tagViewFilterSelect) {
    els.tagViewFilterSelect.value = normalizedView;
  }
  const meta = getCurrentViewMeta(normalizedView);
  if (els.tagViewHint) {
    els.tagViewHint.textContent = meta.hint;
  }
  if (els.tagPrimaryHeader) {
    els.tagPrimaryHeader.textContent = meta.primaryHeader;
  }
  if (els.tagSecondaryHeader) {
    els.tagSecondaryHeader.textContent = meta.secondaryHeader;
  }
}

function buildTagQueryParams() {
  return new URLSearchParams({
    q: els.tagKeywordInput?.value.trim() || "",
    tag_type: els.tagTypeFilterSelect?.value || "",
    min_ratio: els.tagRatioFilterSelect?.value || "0",
    view: normalizeTagView(els.tagViewFilterSelect?.value || selectedTagView),
    limit: String(TAGS_PAGE_LIMIT),
  });
}

function renderTagTable(rows, view) {
  if (!els.tagTableBody) {
    return;
  }

  const meta = getCurrentViewMeta(view);
  els.tagTableBody.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.tagName || "-")}</td>
      <td>${escapeHtml(row.tagNameZh || "-")}</td>
      <td>${escapeHtml(row.tagType || "-")}</td>
      <td class="mono">${escapeHtml(row.tagId || "-")}</td>
      <td>${Number(row.jobCount || 0)}</td>
      <td>${((Number(row.jobRatio || 0)) * 100).toFixed(2)}%</td>
      <td>${row.isHighFrequency ? "是" : "否"}</td>
    </tr>
  `).join("") || `<tr><td colspan="7">${escapeHtml(meta.emptyText)}</td></tr>`;
}

async function loadTags(showFeedback = true) {
  const requestId = ++latestRequestId;
  const params = buildTagQueryParams();
  const data = await fetchJson(`/api/admin/tags?${params.toString()}`);

  if (requestId !== latestRequestId) {
    return;
  }

  const view = normalizeTagView(data.view || selectedTagView);
  const rows = data.data || [];
  const fixed = data.fixedDimensions || {};
  const total = Number(data.total || rows.length);
  const fixedTotal = (fixed.softQuality || []).length + (fixed.growthPotential || []).length;

  renderViewMeta(view);
  if (els.tagResultCount) {
    els.tagResultCount.textContent = String(total);
  }
  if (els.regularTagPoolCount) {
    els.regularTagPoolCount.textContent = String(total);
  }
  if (els.fixedDimensionCount) {
    els.fixedDimensionCount.textContent = String(fixedTotal);
  }

  renderTagTable(rows, view);
  renderFixedDimensionList(els.softDimensionList, fixed.softQuality || []);
  renderFixedDimensionList(els.growthDimensionList, fixed.growthPotential || []);

  if (showFeedback) {
    showToast(`已加载 ${total} 条${getCurrentViewMeta(view).toastNoun}`, "success", 1800);
  }
}

function reloadTags(showFeedback = false) {
  return loadTags(showFeedback).catch((error) => {
    showToast(error.message || "Tag 刷新失败", "error", 3200);
  });
}

function scheduleTagReload() {
  if (filterTimer) {
    clearTimeout(filterTimer);
  }

  filterTimer = setTimeout(() => {
    filterTimer = null;
    reloadTags(false);
  }, FILTER_DEBOUNCE_MS);
}

(async function init() {
  wireNav();
  renderViewMeta(selectedTagView);
  await loadSummaryIntoDom();
  await loadTags(false);

  els.loadTagsBtn?.addEventListener("click", () => {
    withButtonBusy(els.loadTagsBtn, "刷新中...", () => loadTags(true))
      .catch((error) => showToast(error.message || "Tag 刷新失败", "error", 3200));
  });

  els.tagKeywordInput?.addEventListener("input", () => {
    scheduleTagReload();
  });

  els.tagKeywordInput?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") {
      return;
    }
    event.preventDefault();
    if (filterTimer) {
      clearTimeout(filterTimer);
      filterTimer = null;
    }
    reloadTags(false);
  });

  els.tagTypeFilterSelect?.addEventListener("change", () => {
    reloadTags(false);
  });

  els.tagRatioFilterSelect?.addEventListener("change", () => {
    reloadTags(false);
  });

els.tagViewFilterSelect?.addEventListener("change", () => {
    renderViewMeta(els.tagViewFilterSelect.value || "normalized");
    reloadTags(false);
  });
})().catch((error) => {
  showToast(error.message || "Tag 页面初始化失败", "error", 3600);
});
