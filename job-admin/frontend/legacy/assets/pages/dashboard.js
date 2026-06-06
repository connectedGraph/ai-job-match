const { loadSummaryIntoDom, wireNav, showToast } = window.AdminCommon;

(async function init() {
  wireNav();
  await loadSummaryIntoDom();
})().catch((error) => {
  showToast(error.message || "概览页初始化失败", "error", 3600);
});
