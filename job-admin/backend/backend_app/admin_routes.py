from fastapi import APIRouter, HTTPException, Query

from .job_data_service import (
    create_job_record,
    delete_job_record,
    get_admin_frequency_data,
    ensure_jobs_fresh,
    get_admin_summary_data,
    get_admin_tags_data,
    update_job_record,
)
from .schemas import JobExportRequest, JobMutationRequest, TagCenterResolveRequest, TagExportRequest
from .search_export_service import export_jobs_data, export_tags_data
from .tag_center_service import resolve_tag_center, search_tag_center
from tag_sync import normalize_existing_job_library_strict


router = APIRouter(tags=["admin"])


@router.get("/api/admin/summary")
async def get_admin_summary():
    return get_admin_summary_data()


@router.get("/api/admin/tags")
async def get_admin_tags(
    q: str = "",
    tag_type: str = "",
    view: str = "normalized",
    min_ratio: float = Query(default=0.0, ge=0.0, le=1.0),
    limit: int = Query(default=200, ge=1, le=1000),
):
    return get_admin_tags_data(
        q=q,
        tag_type=tag_type,
        view=view,
        min_ratio=min_ratio,
        limit=limit,
    )


@router.post("/api/admin/tags/normalize")
async def normalize_admin_tags():
    try:
        result = await normalize_existing_job_library_strict()
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc) or "Strict normalization failed") from exc
    await ensure_jobs_fresh(embed_missing=False)
    return result


@router.get("/api/admin/frequencies")
async def get_admin_frequencies(
    q: str = "",
    tag_type: str = "",
    view: str = "normalized",
    min_ratio: float = Query(default=0.0, ge=0.0, le=1.0),
    limit: int = Query(default=500, ge=1, le=5000),
):
    return get_admin_frequency_data(
        q=q,
        tag_type=tag_type,
        view=view,
        min_ratio=min_ratio,
        limit=limit,
    )


@router.get("/api/admin/tag-center/tags")
async def get_admin_tag_center_tags(
    q: str = "",
    tag_type: str = "",
    limit: int = Query(default=20, ge=1, le=500),
    min_job_count: int = Query(default=0, ge=0),
):
    await ensure_jobs_fresh(embed_missing=False)
    return search_tag_center(
        query=q,
        tag_type=tag_type,
        limit=limit,
        min_job_count=min_job_count,
    )


@router.post("/api/admin/tag-center/resolve")
async def resolve_admin_tag_center_tag(req: TagCenterResolveRequest):
    await ensure_jobs_fresh(embed_missing=False)
    row = resolve_tag_center(
        tag_id=req.tag_id,
        value=req.value,
        tag_type=req.tag_type,
    )
    return {"matched": row is not None, "tag": row}


@router.post("/api/admin/tags/export")
async def export_admin_tags(req: TagExportRequest):
    await ensure_jobs_fresh(embed_missing=False)
    return export_tags_data(
        tag_type=req.tag_type,
        view=req.view,
        q=req.q,
        min_ratio=req.min_ratio,
        limit=req.limit,
        format=req.format,
        output_path=req.output_path,
        output_dir=req.output_dir,
        filename=req.filename,
    )


@router.post("/api/admin/jobs")
async def create_job(req: JobMutationRequest):
    await ensure_jobs_fresh(embed_missing=False)
    return await create_job_record(req.job)


@router.post("/api/admin/jobs/export")
async def export_admin_jobs(req: JobExportRequest):
    await ensure_jobs_fresh(embed_missing=False)
    return export_jobs_data(
        keyword=req.keyword,
        basic_keyword=req.basic_keyword,
        jd_keyword=req.jd_keyword,
        direction=req.direction,
        industry=req.industry,
        company_name=req.company_name,
        job_type=req.job_type,
        tag=req.tag,
        tech_stack=req.tech_stack,
        tech_capability=req.tech_capability,
        dev_tool=req.dev_tool,
        salary_min=req.salary_min,
        salary_max=req.salary_max,
        sort_by=req.sort_by,
        format=req.format,
        export_limit=req.export_limit,
        output_path=req.output_path,
        output_dir=req.output_dir,
        filename=req.filename,
    )


@router.put("/api/admin/jobs/{job_id}")
async def update_job(job_id: str, req: JobMutationRequest):
    await ensure_jobs_fresh(embed_missing=False)
    return await update_job_record(job_id, req.job)


@router.delete("/api/admin/jobs/{job_id}")
async def delete_job(job_id: str):
    await ensure_jobs_fresh(embed_missing=False)
    return await delete_job_record(job_id)
