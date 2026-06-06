const {
  fetchJson,
  escapeHtml,
  loadSummaryIntoDom,
  wireNav,
  showToast,
  withButtonBusy,
} = window.AdminCommon;

const state = {
  jobs: [],
  page: 1,
  hasMore: true,
  currentJob: null,
  sortBy: "default",
  recentJobs: [],
};

function defaultJob() {
  return {
    id: "",
    title: "",
    companyName: "",
    direction: "",
    industry: "",
    metadata: { jobType: null, salaryRange: null, departmentAtmosphere: null },
    jdSplit: { jobDescriptions: [], jobRequirements: [], bonusPoints: [], notes: [] },
    basicRequirements: { education_min: null, major: [], graduationYearRange: null, certifications: [] },
    techStack: [],
    techCapabilities: [],
    devTools: [],
    softQuality: [],
    growthPotential: [],
    systemMeta: {},
  };
}

function techPreviewTags(techStack) {
  return (techStack || []).flatMap((item) => {
    if (!Array.isArray(item?.options)) return [];
    const options = (item.options || [])
      .map((option) => option?.normalizedTag || option?.name || option?.rawExtractedText || option?.skill || "")
      .filter(Boolean);
    if (!options.length) return [];
    return [{ text: `${item.groupName || "Tech Branch"}: ${options.join(" / ")}`, cls: "tag--skill" }];
  });
}

// 渲染左侧主列表 (应用全新的 job-item 极客结构)
function renderJobs() {
  jobList.innerHTML = state.jobs.map((job) => {
    // 判断当前是否被选中
    const isActive = state.currentJob?.id === job.id ? "job-item--selected" : "";
    
    // 构建 meta 信息 (公司 + 方向)
    const companyHtml = job.companyName ? `<span class="job-item__company">${escapeHtml(job.companyName)}</span>` : "";
    const dirHtml = job.direction ? `<span class="job-item__dir">${escapeHtml(job.direction)}</span>` : "";
    
    return `
      <div class="job-item ${isActive}" data-job-id="${escapeHtml(job.id)}">
        <div class="job-item__main">
          <div class="job-item__title">${escapeHtml(job.title || "未命名岗位")}</div>
          <div class="job-item__meta">
            ${companyHtml}
            ${dirHtml}
          </div>
        </div>
        <div class="job-item__id">${escapeHtml(job.id || "-")}</div>
      </div>
    `;
  }).join("") || `<div class="empty-state"><p>当前筛选条件下没有匹配的岗位。</p></div>`;
  
  if (loadMoreJobsBtn) {
    loadMoreJobsBtn.disabled = !state.hasMore;
    loadMoreJobsBtn.textContent = state.hasMore ? "Load More" : "No More Data";
  }
}

// 渲染最近新增列表 (应用全新的 recent-item 终端日志结构)
function renderRecentJobs() {
  recentJobsList.innerHTML = state.recentJobs.map((job, index) => {
    const meta = job.systemMeta || {};
    const rank = String(index + 1).padStart(2, '0'); // 生成 01, 02 排列
    const title = escapeHtml(job.title || job.id || "未命名岗位");
    const company = escapeHtml(job.companyName || "未知公司");
    
    // 尝试友好地格式化时间 (提取 HH:mm)
    let timeStr = meta.createdAt || meta.updatedAt || "-";
    if (timeStr.includes("T")) {
      const date = new Date(timeStr);
      timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }

    return `
      <div class="recent-item" data-job-id="${escapeHtml(job.id)}">
        <span class="recent-item__rank">${rank}</span>
        <span class="recent-item__name">${title} - ${company}</span>
        <span class="recent-item__time">${escapeHtml(timeStr)}</span>
      </div>
    `;
  }).join("") || `<div class="empty-state"><p>暂无最近新增记录。</p></div>`;
}

async function loadMetadata() {
  const data = await fetchJson("/api/metadata");
  if(jobDirection) jobDirection.innerHTML = `<option value="">全部方向 (All)</option>` + data.directions.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  if(jobIndustry) jobIndustry.innerHTML = `<option value="">全部行业 (All)</option>` + data.industries.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
}

async function loadRecentJobs() {
  const data = await fetchJson("/api/jobs?page=1&limit=12&sort_by=recent_created");
  state.recentJobs = data.data || [];
  renderRecentJobs();
}

async function loadJobs(reset = true) {
  if (reset) {
    state.page = 1;
    state.jobs = [];
    state.hasMore = true;
  }

  const params = new URLSearchParams({
    page: String(state.page),
    limit: "24",
    basic_keyword: jobBasicKeyword?.value.trim() || "",
    jd_keyword: jobJdKeyword?.value.trim() || "",
    direction: jobDirection?.value || "",
    industry: jobIndustry?.value || "",
    sort_by: state.sortBy,
  });

  const data = await fetchJson(`/api/jobs?${params.toString()}`);
  state.jobs = reset ? data.data : state.jobs.concat(data.data);
  state.hasMore = data.hasMore;
  renderJobs();
}

function loadJobIntoEditor(job) {
  state.currentJob = JSON.parse(JSON.stringify(job));
  
  if(editorJobId) editorJobId.textContent = job.id ? `ID: ${job.id}` : "未选择 / 新岗位";
  if(editorJobIdInput) editorJobIdInput.value = job.id || "";
  if(editorTitle) editorTitle.value = job.title || "";
  if(editorCompany) editorCompany.value = job.companyName || "";
  if(editorDirection) editorDirection.value = job.direction || "";
  if(editorIndustry) editorIndustry.value = job.industry || "";
  if(editorJobType) editorJobType.value = job.metadata?.jobType || "";
  if(editorSalary) editorSalary.value = Array.isArray(job.metadata?.salaryRange) ? job.metadata.salaryRange.join(",") : "";
  if(jobJsonEditor) jobJsonEditor.value = JSON.stringify(job, null, 2);

  // 为新 CSS 定制的标签渲染逻辑 (映射颜色分类)
  const tagsData = [
    ...techPreviewTags(job.techStack),
    ...(job.techStack || []).map((item) => ({ text: item.normalizedTag || item.name || item.rawExtractedText, cls: "tag--skill" })), // 青色
    ...(job.techCapabilities || []).map((item) => ({ text: item.normalizedTag || item.skill || item.rawExtractedText, cls: "tag--skill" })),
    ...(job.devTools || []).map((item) => ({ text: item.normalizedTag || item.skill || item.rawExtractedText, cls: "tag--skill" })),
    ...(job.softQuality || []).map((item) => ({ text: item.name, cls: "tag--soft" })), // 蓝色
    ...(job.growthPotential || []).map((item) => ({ text: item.name, cls: "tag--domain" })), // 琥珀色
  ].filter(t => t.text);

  if (jobTagPreview) {
    jobTagPreview.innerHTML = tagsData.length
      ? tagsData.map((tag) => `<span class="tag ${tag.cls}">${escapeHtml(tag.text)}</span>`).join("")
      : `<div class="tag-cloud__empty">该岗位目前暂未提取出结构化画像标签。</div>`;
  }
  
  // 刷新左侧列表以更新高亮选中状态
  renderJobs();
}

async function openJob(jobId) {
  const job = await fetchJson(`/api/jobs/${encodeURIComponent(jobId)}`);
  loadJobIntoEditor(job);
}

function syncFormToJson() {
  const payload = JSON.parse(jobJsonEditor.value || "{}");
  payload.id = editorJobIdInput.value.trim();
  payload.title = editorTitle.value.trim();
  payload.companyName = editorCompany.value.trim();
  payload.direction = editorDirection.value.trim();
  payload.industry = editorIndustry.value.trim();
  payload.metadata = payload.metadata || {};
  payload.metadata.jobType = editorJobType.value.trim() || null;

  const salary = editorSalary.value.trim();
  if (salary) {
    const parts = salary.split(",").map((v) => Number(v.trim())).filter((v) => !Number.isNaN(v));
    payload.metadata.salaryRange = parts.length === 2 ? parts : null;
  } else {
    payload.metadata.salaryRange = null;
  }

  jobJsonEditor.value = JSON.stringify(payload, null, 2);
  return payload;
}

async function refreshJobViews({ resetList = true, refreshSummary = true } = {}) {
  if (refreshSummary && typeof loadSummaryIntoDom === 'function') {
    await loadSummaryIntoDom();
  }
  await Promise.all([
    loadJobs(resetList),
    loadRecentJobs(),
  ]);
}

async function saveJob() {
  const payload = syncFormToJson();
  const currentId = state.currentJob?.id || payload.id;

  if (currentId) {
    await fetchJson(`/api/admin/jobs/${encodeURIComponent(currentId)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job: payload }),
    });
  } else {
    const created = await fetchJson("/api/admin/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ job: payload }),
    });
    payload.id = created.job.id;
  }

  await refreshJobViews({ resetList: true, refreshSummary: true });
  await openJob(payload.id);
  showToast(`Job record [${payload.id}] saved successfully.`, "success");
}

async function deleteJob() {
  const jobId = state.currentJob?.id || editorJobIdInput.value.trim();
  if (!jobId) {
    showToast("No job selected to delete.", "error");
    return;
  }
  if (!confirm(`Are you sure you want to delete job [${jobId}] ?`)) return;

  await fetchJson(`/api/admin/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" });
  loadJobIntoEditor(defaultJob());
  await refreshJobViews({ resetList: true, refreshSummary: true });
  showToast(`Job record [${jobId}] deleted.`, "success");
}

async function runSearch(showFeedback = false) {
  await loadJobs(true);
  if (showFeedback) {
    showToast("Search complete. List updated.", "success", 1600);
  }
}

// -------------------------------------------------------------
// Initialization & Event Binding
// -------------------------------------------------------------
(async function init() {
  if (typeof wireNav === 'function') wireNav();
  if (typeof loadSummaryIntoDom === 'function') await loadSummaryIntoDom();
  
  await loadMetadata();
  await Promise.all([loadJobs(true), loadRecentJobs()]);
  loadJobIntoEditor(defaultJob());

  if(window.jobSearchBtn) jobSearchBtn.addEventListener("click", () => {
    withButtonBusy(jobSearchBtn, "Searching...", async () => {
      await runSearch(true);
    }).catch((error) => showToast(error.message || "Search failed.", "error", 3200));
  });

  // 注：如果在 HTML 中删除了 reloadJobsBtn，这里需要做防空判断
  if(window.reloadJobsBtn) reloadJobsBtn.addEventListener("click", () => {
    withButtonBusy(reloadJobsBtn, "Syncing...", async () => {
      await refreshJobViews({ resetList: true, refreshSummary: true });
      showToast("Job matrix synchronized.", "success", 1600);
    }).catch((error) => showToast(error.message || "Sync failed.", "error", 3200));
  });

  if(window.loadMoreJobsBtn) loadMoreJobsBtn.addEventListener("click", () => {
    if (!state.hasMore) return;
    withButtonBusy(loadMoreJobsBtn, "Loading...", async () => {
      state.page += 1;
      await loadJobs(false);
    }).catch((error) => showToast(error.message || "Failed to load more.", "error", 3200));
  });

  if(window.saveJobBtn) saveJobBtn.addEventListener("click", () => {
    withButtonBusy(saveJobBtn, "Saving...", saveJob).catch((error) => showToast(error.message || "Save operation failed.", "error", 3200));
  });

  if(window.deleteJobBtn) deleteJobBtn.addEventListener("click", () => {
    withButtonBusy(deleteJobBtn, "Deleting...", deleteJob).catch((error) => showToast(error.message || "Delete operation failed.", "error", 3200));
  });

  // 如果没有 newJobBtn（因为我们改用顶部标题栏旁的按钮了），需要适配其 ID，假设顶栏新建按钮加了 id="newJobBtn"
  const createBtn = document.getElementById("newJobBtn") || document.querySelector('.page-title .btn--accent');
  if (createBtn) createBtn.addEventListener("click", () => {
    loadJobIntoEditor(defaultJob());
    showToast("Workspace initialized for new record.", "info", 1500);
  });

  if(window.formatJobBtn) formatJobBtn.addEventListener("click", () => {
    try {
      jobJsonEditor.value = JSON.stringify(JSON.parse(jobJsonEditor.value || "{}"), null, 2);
      showToast("JSON successfully formatted.", "success", 1500);
    } catch {
      showToast("Invalid JSON format detected.", "error", 3200);
    }
  });

  if(window.jobSort) jobSort.addEventListener("change", async () => {
    state.sortBy = jobSort.value || "default";
    try {
      await loadJobs(true);
      showToast(jobSort.value === "recent" ? "Sorted by newest." : "Sorting default applied.", "info", 1500);
    } catch (error) {
      showToast(error.message || "Sorting update failed.", "error", 3200);
    }
  });

  [window.jobBasicKeyword, window.jobJdKeyword].forEach((input) => {
    if(!input) return;
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        jobSearchBtn.click();
      }
    });
  });

  if(window.jobList) jobList.addEventListener("click", (event) => {
    // 适配新的嵌套 DOM 结构寻找 data-job-id
    const card = event.target.closest("[data-job-id]");
    if (card) {
      openJob(card.dataset.jobId).catch((error) => showToast(error.message || "Failed to load job details.", "error", 3200));
    }
  });

  if(window.recentJobsList) recentJobsList.addEventListener("click", (event) => {
    const card = event.target.closest("[data-job-id]");
    if (card) {
      openJob(card.dataset.jobId).catch((error) => showToast(error.message || "Failed to load audit record.", "error", 3200));
    }
  });
})().catch((error) => {
  if (typeof showToast === 'function') {
    showToast(error.message || "Module initialization failed.", "error", 3600);
  } else {
    console.error("Job page init error:", error);
  }
});
