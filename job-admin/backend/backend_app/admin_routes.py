import json

import httpx
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
from .model_config import load_flagship_llm_config
from .schemas import JobExportRequest, JobMutationRequest, TagCenterResolveRequest, TagExportRequest, TagQueryRequest
from .search_export_service import export_jobs_data, export_tags_data
from .tag_center_service import resolve_tag_center, search_tag_center
from .tag_trend_service import get_hot_tags, get_tag_trend_detail
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


import asyncio
import shutil
from .config import logger
from project_paths import resolve_job_library_file, TAG_DIR, DOMAIN_DIR

_normalization_lock = asyncio.Lock()

class NormalizationTransaction:
    def __init__(self):
        self.job_file = resolve_job_library_file()
        self.tag_dir = TAG_DIR
        self.domain_dir = DOMAIN_DIR
        self.backup_dir = self.job_file.parent / "normalization_checkpoint"
        
    def create_checkpoint(self):
        if self.backup_dir.exists():
            shutil.rmtree(self.backup_dir)
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        if self.job_file.exists():
            shutil.copy2(self.job_file, self.backup_dir / self.job_file.name)
        if self.tag_dir.exists():
            shutil.copytree(self.tag_dir, self.backup_dir / self.tag_dir.name)
        if self.domain_dir.exists():
            shutil.copytree(self.domain_dir, self.backup_dir / self.domain_dir.name)
            
    def rollback(self):
        if not self.backup_dir.exists():
            return
        backup_job = self.backup_dir / self.job_file.name
        if backup_job.exists():
            shutil.copy2(backup_job, self.job_file)
        elif self.job_file.exists():
            self.job_file.unlink()
            
        backup_tag = self.backup_dir / self.tag_dir.name
        if backup_tag.exists():
            if self.tag_dir.exists():
                shutil.rmtree(self.tag_dir)
            shutil.copytree(backup_tag, self.tag_dir)
            
        backup_domain = self.backup_dir / self.domain_dir.name
        if backup_domain.exists():
            if self.domain_dir.exists():
                shutil.rmtree(self.domain_dir)
            shutil.copytree(backup_domain, self.domain_dir)
            
    def cleanup(self):
        if self.backup_dir.exists():
            shutil.rmtree(self.backup_dir)


@router.post("/api/admin/tags/normalize")
async def normalize_admin_tags():
    if _normalization_lock.locked():
        raise HTTPException(status_code=409, detail="标签标准化正在运行中，请勿重复提交")
        
    async with _normalization_lock:
        tx = NormalizationTransaction()
        try:
            tx.create_checkpoint()
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"创建标准化备份失败: {str(exc)}")
            
        try:
            result = await normalize_existing_job_library_strict()
            await ensure_jobs_fresh(embed_missing=False)
            tx.cleanup()
            return result
        except Exception as exc:
            logger.error("Normalization failed, rolling back to checkpoint. Error: %s", str(exc))
            try:
                tx.rollback()
            except Exception as rollback_err:
                logger.critical("Failed to rollback normalization checkpoint: %s", str(rollback_err))
            tx.cleanup()
            if isinstance(exc, HTTPException):
                raise exc
            raise HTTPException(status_code=409, detail=str(exc) or "Strict normalization failed") from exc


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


# --- Tag Trend Endpoints ---

async def _call_llm_text(messages: list, config) -> str:
    body = {
        "model": config.model,
        "temperature": 0.5,
        "max_tokens": 800,
        "messages": messages,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{config.base_url}/chat/completions",
            headers={"Authorization": f"Bearer {config.api_key}", "Content-Type": "application/json"},
            json=body,
        )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"].strip()


@router.get("/api/tags/hot")
async def hot_tags_endpoint(
    limit: int = Query(default=20, ge=1, le=100),
    time_range: int = Query(default=30),  # TODO(time-series): filter by date range when real data available
):
    data = get_hot_tags(limit)
    return {"data": data, "total": len(data)}


@router.get("/api/tags/trend/{tag_id}")
async def tag_trend_endpoint(tag_id: str):
    tag = get_tag_trend_detail(tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    return tag


@router.post("/api/agent/tag-query")
async def tag_agent_endpoint(req: TagQueryRequest):
    hot = get_hot_tags(20)
    system_msg = (
        "You are a career advisor for CS students. Answer in the same language as the question.\n"
        f"Current top hot tags (JSON):\n{json.dumps(hot, ensure_ascii=False)}\n"
        "Be concise (under 200 words)."
    )
    user_msg = req.query
    if req.context:
        user_msg = f"Student context: {req.context}\n{user_msg}"
    cfg = load_flagship_llm_config()
    try:
        answer = await _call_llm_text(
            [{"role": "system", "content": system_msg}, {"role": "user", "content": user_msg}],
            cfg,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM error: {exc}") from exc
    return {"answer": answer, "tags": hot[:5]}
