from fastapi import APIRouter, Query

from . import runtime_state as state
from .job_data_service import ensure_jobs_fresh, get_job_or_404
from .search_export_service import search_jobs_data


router = APIRouter(tags=["jobs"])


@router.get("/api/metadata")
async def get_metadata():
    await ensure_jobs_fresh(embed_missing=False)
    return state.metadata_cache


@router.get("/api/jobs")
@router.get("/api/jobs/search")
async def get_jobs(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=24, ge=1, le=200),
    keyword: str = "",
    basic_keyword: str = "",
    jd_keyword: str = "",
    direction: str = "",
    industry: str = "",
    company_name: str = "",
    job_type: str = "",
    tag: str = "",
    tech_stack: str = "",
    tech_capability: str = "",
    dev_tool: str = "",
    salary_min: float | None = Query(default=None, ge=0),
    salary_max: float | None = Query(default=None, ge=0),
    sort_by: str = "default",
):
    await ensure_jobs_fresh(embed_missing=False)
    return search_jobs_data(
        page=page,
        limit=limit,
        keyword=keyword,
        basic_keyword=basic_keyword,
        jd_keyword=jd_keyword,
        direction=direction,
        industry=industry,
        company_name=company_name,
        job_type=job_type,
        tag=tag,
        tech_stack=tech_stack,
        tech_capability=tech_capability,
        dev_tool=dev_tool,
        salary_min=salary_min,
        salary_max=salary_max,
        sort_by=sort_by,
    )


@router.get("/api/jobs/{job_id}")
async def get_job_detail(job_id: str):
    await ensure_jobs_fresh(embed_missing=False)
    return get_job_or_404(job_id)


@router.get("/api/careers")
@router.get("/api/careers/search")
async def get_careers(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=24, ge=1, le=200),
    keyword: str = "",
    basic_keyword: str = "",
    jd_keyword: str = "",
    direction: str = "",
    industry: str = "",
    company_name: str = "",
    job_type: str = "",
    tag: str = "",
    tech_stack: str = "",
    tech_capability: str = "",
    dev_tool: str = "",
    salary_min: float | None = Query(default=None, ge=0),
    salary_max: float | None = Query(default=None, ge=0),
    sort_by: str = "default",
):
    await ensure_jobs_fresh(embed_missing=False)
    return search_jobs_data(
        page=page,
        limit=limit,
        keyword=keyword,
        basic_keyword=basic_keyword,
        jd_keyword=jd_keyword,
        direction=direction,
        industry=industry,
        company_name=company_name,
        job_type=job_type,
        tag=tag,
        tech_stack=tech_stack,
        tech_capability=tech_capability,
        dev_tool=dev_tool,
        salary_min=salary_min,
        salary_max=salary_max,
        sort_by=sort_by,
    )


@router.get("/api/careers/directions")
async def get_career_directions():
    await ensure_jobs_fresh(embed_missing=False)
    return {"directions": state.metadata_cache.get("directions", [])}


@router.get("/api/careers/industries")
async def get_career_industries():
    await ensure_jobs_fresh(embed_missing=False)
    return {"industries": state.metadata_cache.get("industries", [])}


@router.get("/api/careers/{job_id}")
async def get_career_detail(job_id: str):
    await ensure_jobs_fresh(embed_missing=False)
    return get_job_or_404(job_id)
