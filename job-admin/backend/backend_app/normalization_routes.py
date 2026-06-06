from fastapi import APIRouter, HTTPException, Query

from .job_data_service import ensure_jobs_fresh
from .normalization_models import TagReviewStartRequest
from .normalization_service import (
    get_normalization_run_snapshot,
    list_normalization_runs,
    start_normalization_run,
)
from .tag_review_service import (
    get_tag_review_run_snapshot,
    list_tag_review_runs,
)
from .tag_review_runtime import (
    pause_tag_review_run,
    restart_tag_review_run,
    resume_tag_review_run,
    start_tag_review_run,
)


router = APIRouter(tags=["normalization"])


@router.get("/api/admin/normalization/runs")
async def get_normalization_runs():
    await ensure_jobs_fresh(embed_missing=False)
    return list_normalization_runs()


@router.post("/api/admin/normalization/runs")
async def create_normalization_run():
    await ensure_jobs_fresh(embed_missing=False)
    return await start_normalization_run()


@router.get("/api/admin/normalization/runs/{run_id}")
async def get_normalization_run(run_id: str):
    await ensure_jobs_fresh(embed_missing=False)
    snapshot = get_normalization_run_snapshot(run_id)
    if not snapshot.get("manifest"):
        raise HTTPException(status_code=404, detail="Normalization run not found")
    return snapshot


@router.get("/api/admin/normalization/cache")
async def get_normalization_cache():
    await ensure_jobs_fresh(embed_missing=False)
    return list_normalization_runs().get("cacheStatus", {})


@router.get("/api/admin/normalization/tag-review/runs")
async def get_tag_review_runs(review_mode: str = Query(default="all")):
    await ensure_jobs_fresh(embed_missing=False)
    return list_tag_review_runs(review_mode=review_mode)


@router.post("/api/admin/normalization/tag-review/runs")
async def create_tag_review_run(req: TagReviewStartRequest):
    await ensure_jobs_fresh(embed_missing=False)
    try:
        return await start_tag_review_run(req.config, req.maxAttempts, req.reviewMode)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc) or "Tag review run could not be started") from exc


@router.get("/api/admin/normalization/tag-review/runs/{run_id}")
async def get_tag_review_run(run_id: str):
    await ensure_jobs_fresh(embed_missing=False)
    snapshot = get_tag_review_run_snapshot(run_id)
    if not snapshot.get("manifest"):
        raise HTTPException(status_code=404, detail="Tag review run not found")
    return snapshot


@router.post("/api/admin/normalization/tag-review/runs/{run_id}/pause")
async def pause_tag_review(run_id: str):
    await ensure_jobs_fresh(embed_missing=False)
    try:
        snapshot = await pause_tag_review_run(run_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc) or "Tag review run could not be paused") from exc
    if not snapshot.get("manifest"):
        raise HTTPException(status_code=404, detail="Tag review run not found")
    return snapshot


@router.post("/api/admin/normalization/tag-review/runs/{run_id}/resume")
async def resume_tag_review(run_id: str):
    await ensure_jobs_fresh(embed_missing=False)
    try:
        snapshot = await resume_tag_review_run(run_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc) or "Tag review run could not be resumed") from exc
    if not snapshot.get("manifest"):
        raise HTTPException(status_code=404, detail="Tag review run not found")
    return snapshot


@router.post("/api/admin/normalization/tag-review/runs/{run_id}/restart")
async def restart_tag_review(run_id: str):
    await ensure_jobs_fresh(embed_missing=False)
    try:
        snapshot = await restart_tag_review_run(run_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc) or "Tag review run could not be restarted") from exc
    if not snapshot.get("manifest"):
        raise HTTPException(status_code=404, detail="Tag review run not found")
    return snapshot
