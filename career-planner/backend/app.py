import json
import os
import sqlite3
from typing import Any, Dict, List, Optional

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import storage
from .config import CAREER_PLANNER_DIR, load_ai_llm_config
from .evaluation import build_completeness_result, calc_raw_completeness_scores
from .llm_client import call_ai_chat_json, call_resume_chat_json
from .prompts import (
    build_completeness_system_prompt,
    build_completeness_user_prompt,
    build_growth_potential_prompt,
    build_infer_system_prompt,
    build_profile_only_user_prompt,
    build_resume_parse_system_prompt,
    build_skillcheck_system_prompt,
    build_skillcheck_user_prompt,
    build_soft_quality_prompt,
)
from .security import create_access_token, decode_access_token, verify_password
from .tech_capability import (
    recommend_professional_skills,
    recommend_tech_domains,
    recommendations_for_direction,
    resolve_tag_center_catalog,
    search_catalog,
    search_professional_skills,
    search_tech_domains,
)


class Credentials(BaseModel):
    username: str
    password: str


class UsernameUpdatePayload(BaseModel):
    username: str
    currentPassword: str


class PasswordUpdatePayload(BaseModel):
    currentPassword: str
    newPassword: str


class UserDataPayload(BaseModel):
    studentData: Dict[str, Any] = Field(default_factory=dict)
    aiResults: Dict[str, Any] = Field(default_factory=dict)


class ProfileSubmitPayload(BaseModel):
    studentProfile: Dict[str, Any] = Field(default_factory=dict)
    meta: Dict[str, Any] = Field(default_factory=dict)


class ResumeParsePayload(BaseModel):
    dataUrl: str


class StudentDataPayload(BaseModel):
    studentData: Dict[str, Any] = Field(default_factory=dict)


class SkillTaskPayload(BaseModel):
    studentData: Dict[str, Any] = Field(default_factory=dict)
    techNames: str = "无"
    capNames: str = "无"
    toolNames: str = "无"
    appliedNames: List[str] = Field(default_factory=list)


class MatchWorkspacePayload(BaseModel):
    workspace: Dict[str, Any] = Field(default_factory=dict)


class MatchProxyPayload(BaseModel):
    student: Dict[str, Any]
    config: Optional[Dict[str, Any]] = None
    batch_offsets: Dict[str, int] = Field(default_factory=dict)
    top_k: int = 5


class MatchCheckPayload(BaseModel):
    student: Dict[str, Any]
    job: Dict[str, Any]
    config: Optional[Dict[str, Any]] = None


class ActiveBasketPayload(BaseModel):
    basket: Dict[str, Any] = Field(default_factory=dict)
    jobsById: Dict[str, Any] = Field(default_factory=dict)


class BasketSubmitPayload(BaseModel):
    basket: Dict[str, Any] = Field(default_factory=dict)
    jobsById: Dict[str, Any] = Field(default_factory=dict)
    student: Dict[str, Any] = Field(default_factory=dict)
    analysis: str = ""


class InternshipRecommendationPayload(BaseModel):
    student: Dict[str, Any] = Field(default_factory=dict)
    gaps: List[Dict[str, Any]] = Field(default_factory=list)
    top_k: int = 6


class ActionPlanPayload(BaseModel):
    actionPlan: Dict[str, Any] = Field(default_factory=dict)
    patch: Dict[str, Any] = Field(default_factory=dict)
    targetJobId: Optional[str] = None
    targetHarvestId: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)


class ReservedMatchPayload(BaseModel):
    payload: Dict[str, Any] = Field(default_factory=dict)


class ReportChatPayload(BaseModel):
    report: Dict[str, Any] = Field(default_factory=dict)
    messages: List[Dict[str, Any]] = Field(default_factory=list)
    question: str = ""


async def current_user(authorization: Optional[str] = Header(default=None)) -> Dict[str, Any]:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="未登录或登录已过期")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = decode_access_token(token)
        user_id = int(payload.get("sub") or 0)
    except Exception:
        raise HTTPException(status_code=401, detail="未登录或登录已过期")
    user = storage.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    return user


async def read_user_data_payload(request: Request) -> UserDataPayload:
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    student_data = (
        payload.get("studentData")
        or payload.get("student_profile")
        or payload.get("studentProfile")
        or payload.get("profile")
        or {}
    )
    ai_results = payload.get("aiResults") or payload.get("ai_results") or payload.get("studentAiEval") or {}
    if not isinstance(student_data, dict):
        student_data = {}
    if not isinstance(ai_results, dict):
        ai_results = {}
    return UserDataPayload(studentData=student_data, aiResults=ai_results)


def sanitize_resume_parse_result(result: Any) -> Any:
    if not isinstance(result, dict):
        return result
    cleaned = dict(result)
    cleaned["techDomains"] = []
    basic_info = cleaned.get("basicInfo")
    if isinstance(basic_info, dict):
        next_basic_info = dict(basic_info)
        next_basic_info.pop("techDomains", None)
        cleaned["basicInfo"] = next_basic_info
    return cleaned


def build_current_student_profile_response(user: Dict[str, Any]) -> Dict[str, Any]:
    user_data = storage.get_user_data(int(user["id"]))
    student_profile = user_data.get("studentData") or {}
    ai_results = user_data.get("aiResults") or {}
    return {
        "ok": True,
        "source": "career-planner-backend",
        "user": storage.public_user(user),
        "studentProfile": student_profile,
        "studentData": student_profile,
        "aiResults": ai_results,
        "updatedAt": user_data.get("updatedAt"),
    }


async def proxy_match_engine(path: str, payload: Dict[str, Any], *, timeout: float, error_prefix: str) -> Any:
    async with httpx.AsyncClient(timeout=timeout) as client:
        try:
            response = await client.post(
                f"http://127.0.0.1:8000{path}",
                json=payload,
            )
            response.raise_for_status()
            return response.json()
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"{error_prefix}: {str(exc)}") from exc


def _safe_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def _safe_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _student_display_name(student: Dict[str, Any]) -> str:
    basic_info = _safe_dict(student.get("basicInfo"))
    return str(basic_info.get("name") or student.get("name") or "Unknown").strip() or "Unknown"


def _job_score(job: Dict[str, Any]) -> float:
    try:
        return float(
            job.get("reportScore")
            or job.get("report_score")
            or _safe_dict(job.get("harvest_report")).get("report_score")
            or job.get("match_score")
            or job.get("matchScore")
            or _safe_dict(job.get("scoring")).get("match_score")
            or _safe_dict(job.get("score_breakdown")).get("match")
            or 0
        )
    except Exception:
        return 0.0


def _job_match_score(job: Dict[str, Any]) -> float:
    try:
        return float(
            job.get("match_score")
            or job.get("matchScore")
            or _safe_dict(job.get("scoring")).get("match_score")
            or _safe_dict(job.get("score_breakdown")).get("match")
            or 0
        )
    except Exception:
        return 0.0


def _job_gold_score(job: Dict[str, Any]) -> float:
    try:
        return float(
            job.get("gold_score")
            or job.get("goldScore")
            or _safe_dict(job.get("scoring")).get("gold_score")
            or _safe_dict(_safe_dict(job.get("score_breakdown")).get("raw")).get("gold_profile")
            or job.get("studentCompetitivenessScore")
            or 0
        )
    except Exception:
        return 0.0


def _trim_text(value: Any, limit: int = 1200) -> str:
    text = str(value or "").strip()
    return text if len(text) <= limit else f"{text[:limit]}..."


def _student_safe_assessment_text(value: Any) -> str:
    text = str(value or "").strip()
    return (
        text
        .replace("基于当前标签匹配结果的本地降级评估。", "基于当前画像标签、命中项与缺口列表的系统评估。")
        .replace("基于当前标签匹配结果的本地降级评估", "基于当前画像标签、命中项与缺口列表的系统评估")
        .replace("本地降级结果", "系统辅助评估结果")
        .replace("降级评估", "系统评估")
    )


def _compact_report_for_chat(report: Dict[str, Any]) -> Dict[str, Any]:
    report = _safe_dict(report)
    ranking = _safe_dict(report.get("ranking"))
    items = _safe_list(ranking.get("jdSplitAssessment"))[:40]
    return {
        "id": report.get("id"),
        "title": report.get("title") or ranking.get("title"),
        "companyName": report.get("companyName") or ranking.get("companyName"),
        "generatedAt": report.get("generatedAt"),
        "overview": _trim_text(report.get("overview"), 1600),
        "reportScore": report.get("reportScore"),
        "jdStarScore": report.get("jdStarScore"),
        "tagMatchScore": report.get("tagMatchScore") or report.get("matchScore"),
        "preConfidenceScore": report.get("preConfidenceScore"),
        "confidenceCoefficient": report.get("confidenceCoefficient"),
        "scoreFormula": _safe_dict(report.get("scoreFormula")),
        "jdAssessments": [
            {
                "section": item.get("section"),
                "text": _trim_text(item.get("text"), 600),
                "stars": item.get("stars"),
                "score": item.get("score"),
                "label": item.get("label"),
                "reason": _trim_text(_student_safe_assessment_text(item.get("reason")), 600),
                "evidence": _trim_text(_student_safe_assessment_text(item.get("evidence")), 600),
            }
            for item in items
            if isinstance(item, dict)
        ],
    }


def _compact_chat_history(messages: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    rows: List[Dict[str, str]] = []
    for item in messages[-8:]:
        if not isinstance(item, dict):
            continue
        role = str(item.get("role") or "").strip()
        if role not in {"user", "assistant"}:
            continue
        content = _trim_text(item.get("content"), 1000)
        if content:
            rows.append({"role": role, "content": content})
    return rows


def _next_basket_id(history: List[Any], harvests: List[Any]) -> str:
    max_id = 0
    for item in [*history, *harvests]:
        if not isinstance(item, dict):
            continue
        digits = "".join(ch for ch in str(item.get("id") or "") if ch.isdigit())
        if digits:
            max_id = max(max_id, int(digits))
    return f"basket-{str(max_id + 1).zfill(3)}"


def _create_draft_basket(history: List[Any], harvests: List[Any]) -> Dict[str, Any]:
    timestamp = storage.now_iso()
    return {
        "id": _next_basket_id(history, harvests),
        "status": "Draft",
        "createdAt": timestamp,
        "lastEditedAt": timestamp,
        "submittedAt": None,
        "completedAt": None,
        "progress": 0,
        "jobIds": [],
    }


def _build_basket_submission(
    *,
    basket: Dict[str, Any],
    jobs_by_id: Dict[str, Any],
    student: Dict[str, Any],
    analysis: str = "",
    harvest_analysis: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    timestamp = storage.now_iso()
    submitted_basket = {
        **basket,
        "status": "Submitted",
        "submittedAt": basket.get("submittedAt") or timestamp,
    }
    job_ids = [str(job_id) for job_id in _safe_list(submitted_basket.get("jobIds")) if str(job_id)]
    job_list = [
        _safe_dict(jobs_by_id.get(job_id))
        for job_id in job_ids
        if isinstance(jobs_by_id.get(job_id), dict)
    ]
    if not job_list:
        raise HTTPException(status_code=400, detail="篮子为空，无法提交分析")

    harvest_rankings = _safe_list(_safe_dict(harvest_analysis).get("rankings"))
    analysis_by_id = {
        str(item.get("stableId") or item.get("id") or ""): _safe_dict(item)
        for item in harvest_rankings
        if isinstance(item, dict)
    }
    enriched_jobs = []
    for job in job_list:
        stable_id = str(job.get("stableId") or job.get("id") or "")
        analysis_job = analysis_by_id.get(stable_id) or {}
        enriched_jobs.append({
            **job,
            **analysis_job,
            "stableId": stable_id,
        })

    rankings_source = sorted(enriched_jobs, key=_job_score, reverse=True)
    best_job = rankings_source[0]
    confidence = max(55, min(96, 64 + round(float(best_job.get("exact_match_ratio") or 0) * 28)))
    harvest_id = str(submitted_basket.get("id") or f"basket-{timestamp.replace(':', '').replace('.', '')}")
    rankings = [
        {
            "stableId": job.get("stableId") or job.get("id") or "",
            "rank": index + 1,
            "title": job.get("title") or "",
            "companyName": job.get("companyName") or "",
            "reportScore": _job_score(job),
            "matchScore": _job_match_score(job),
            "tagMatchScore": job.get("tagMatchScore"),
            "jdStarScore": job.get("jdStarScore"),
            "jdStarScoreSource": job.get("jdStarScoreSource"),
            "preConfidenceScore": job.get("preConfidenceScore"),
            "goldScore": _job_gold_score(job),
            "confidenceCoefficient": job.get("confidenceCoefficient"),
            "studentCompetitivenessScore": job.get("studentCompetitivenessScore"),
            "jdSplitAssessment": job.get("jdSplitAssessment") or [],
            "jdStarCounts": job.get("jdStarCounts") or {},
            "jdAssessmentSource": job.get("jdAssessmentSource"),
            "scoreFormula": job.get("scoreFormula") or {},
            "confidence": max(50, min(95, 58 + round(float(job.get("exact_match_ratio") or 0) * 32))),
        }
        for index, job in enumerate(rankings_source)
    ]
    harvest_record = {
        **submitted_basket,
        "id": harvest_id,
        "status": "Harvested",
        "progress": 100,
        "completedAt": timestamp,
        "overview": analysis or _safe_dict(harvest_analysis).get("overview") or "本次篮子已按最终报告分从高到低完成排序，可在收割记录中回看完整对比。",
        "confidence": confidence,
        "bestJobId": best_job.get("stableId") or best_job.get("id") or None,
        "bestJobTitle": f"{best_job.get('title') or ''} @ {best_job.get('companyName') or ''}".strip(" @"),
        "studentName": _student_display_name(student),
        "rankings": rankings,
        "studentCompetitiveness": _safe_dict(harvest_analysis).get("studentCompetitiveness"),
        "confidenceCoefficient": _safe_dict(harvest_analysis).get("confidenceCoefficient"),
        "reportModel": _safe_dict(harvest_analysis).get("model"),
    }
    basket_history_record = {
        **submitted_basket,
        "id": harvest_id,
        "status": "Harvested",
        "completedAt": timestamp,
        "harvestId": harvest_id,
        "jobIds": job_ids,
        "jobSnapshots": [
            {
                "stableId": job.get("stableId") or job.get("id") or "",
                "title": job.get("title") or "",
                "companyName": job.get("companyName") or "",
                "reportScore": _job_score(job),
                "matchScore": _job_match_score(job),
                "tagMatchScore": job.get("tagMatchScore"),
                "jdStarScore": job.get("jdStarScore"),
                "jdStarScoreSource": job.get("jdStarScoreSource"),
                "preConfidenceScore": job.get("preConfidenceScore"),
                "goldScore": _job_gold_score(job),
                "confidenceCoefficient": job.get("confidenceCoefficient"),
                "studentCompetitivenessScore": job.get("studentCompetitivenessScore"),
                "jdStarCounts": job.get("jdStarCounts") or {},
                "jdAssessmentSource": job.get("jdAssessmentSource"),
                "scoreFormula": job.get("scoreFormula") or {},
                "scoreQuality": float(job.get("score_quality") or 0),
                "exactMatchRatio": float(job.get("exact_match_ratio") or 0),
            }
            for job in rankings_source
        ],
        "bestJobId": harvest_record["bestJobId"],
        "bestJobTitle": harvest_record["bestJobTitle"],
        "confidence": confidence,
    }
    return {
        "harvest": harvest_record,
        "basketHistoryRecord": basket_history_record,
        "rankedJobs": rankings_source,
    }


def _find_harvest_payload(workspace: Dict[str, Any], basket_id: str) -> Dict[str, Any]:
    harvests = _safe_list(workspace.get("harvests"))
    basket_history = _safe_list(workspace.get("basketHistory"))
    harvest = next(
        (
            item
            for item in harvests
            if isinstance(item, dict) and str(item.get("id") or item.get("harvestId") or "") == basket_id
        ),
        None,
    )
    basket_record = next(
        (
            item
            for item in basket_history
            if isinstance(item, dict)
            and str(item.get("harvestId") or item.get("id") or "") == basket_id
        ),
        None,
    )
    if not harvest and not basket_record:
        raise HTTPException(status_code=404, detail="Harvest record not found")
    return {
        "ok": True,
        "harvest": harvest,
        "basketHistoryRecord": basket_record,
    }


def _remove_harvest_from_workspace(workspace: Dict[str, Any], basket_id: str) -> Dict[str, Any]:
    harvests = [
        item
        for item in _safe_list(workspace.get("harvests"))
        if not (
            isinstance(item, dict)
            and str(item.get("id") or item.get("harvestId") or "") == basket_id
        )
    ]
    basket_history = [
        item
        for item in _safe_list(workspace.get("basketHistory"))
        if not (
            isinstance(item, dict)
            and str(item.get("harvestId") or item.get("id") or "") == basket_id
        )
    ]
    if (
        len(harvests) == len(_safe_list(workspace.get("harvests")))
        and len(basket_history) == len(_safe_list(workspace.get("basketHistory")))
    ):
        raise HTTPException(status_code=404, detail="Harvest record not found")

    selected_harvest_id = workspace.get("selectedHarvestId")
    if selected_harvest_id == basket_id:
        selected_harvest_id = harvests[0].get("id") if harvests and isinstance(harvests[0], dict) else None

    deleted_harvest = next(
        (
            item
            for item in _safe_list(workspace.get("harvests"))
            if isinstance(item, dict) and str(item.get("id") or item.get("harvestId") or "") == basket_id
        ),
        {},
    )
    deleted_job_ids = {
        str(item)
        for item in _safe_list(deleted_harvest.get("jobIds"))
    }
    deleted_job_ids.update(
        str(rank.get("stableId") or rank.get("id") or "")
        for rank in _safe_list(deleted_harvest.get("rankings"))
        if isinstance(rank, dict) and (rank.get("stableId") or rank.get("id"))
    )
    should_clear_target = bool(workspace.get("targetJobId") and str(workspace.get("targetJobId")) in deleted_job_ids)

    next_workspace = {
        **workspace,
        "basketHistory": basket_history,
        "harvests": harvests,
        "selectedHarvestId": selected_harvest_id,
    }
    if should_clear_target:
        next_workspace["targetJobId"] = None
        next_workspace["targetHarvestId"] = None
        next_workspace["actionPlan"] = None
    return next_workspace


def create_app() -> FastAPI:
    storage.init_db()
    app = FastAPI(title="职途星 Student Backend")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # API Routes should be defined before static mounting

    @app.get("/api/health")
    async def health() -> Dict[str, str]:
        return {"status": "ok", "service": "zhitu-star-student-backend"}

    @app.post("/api/auth/register")
    async def register(payload: Credentials) -> Dict[str, Any]:
        username = payload.username.strip()
        if not username or len(payload.password) < 6:
            raise HTTPException(status_code=400, detail="用户名不能为空，密码至少 6 位")
        try:
            user = storage.create_user(username, payload.password)
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="用户名已存在")
        token = create_access_token(int(user["id"]), user["username"])
        return {"token": token, "user": storage.public_user(user)}

    @app.post("/api/auth/login")
    async def login(payload: Credentials) -> Dict[str, Any]:
        user = storage.get_user_by_username(payload.username.strip())
        if not user or not verify_password(payload.password, user.get("password_hash") or ""):
            raise HTTPException(status_code=401, detail="用户名或密码不正确")
        token = create_access_token(int(user["id"]), user["username"])
        return {"token": token, "user": storage.public_user(user)}

    @app.get("/api/auth/me")
    async def me(user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
        return {"user": storage.public_user(user)}

    @app.put("/api/auth/username")
    async def update_username(
        payload: UsernameUpdatePayload,
        user: Dict[str, Any] = Depends(current_user),
    ) -> Dict[str, Any]:
        username = payload.username.strip()
        if not username:
            raise HTTPException(status_code=400, detail="用户名不能为空")
        if not verify_password(payload.currentPassword, user.get("password_hash") or ""):
            raise HTTPException(status_code=401, detail="当前密码不正确")
        try:
            updated = storage.update_username(int(user["id"]), username)
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="用户名已存在")
        token = create_access_token(int(updated["id"]), updated["username"])
        return {"token": token, "user": storage.public_user(updated)}

    @app.put("/api/auth/password")
    async def update_password(
        payload: PasswordUpdatePayload,
        user: Dict[str, Any] = Depends(current_user),
    ) -> Dict[str, Any]:
        if len(payload.newPassword) < 6:
            raise HTTPException(status_code=400, detail="新密码至少 6 位")
        if not verify_password(payload.currentPassword, user.get("password_hash") or ""):
            raise HTTPException(status_code=401, detail="当前密码不正确")
        updated = storage.update_password(int(user["id"]), payload.newPassword)
        return {"ok": True, "user": storage.public_user(updated)}

    @app.get("/api/user-data")
    async def get_user_data(user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
        return storage.get_user_data(int(user["id"]))

    @app.get("/api/student-profile/me")
    async def get_current_student_profile(user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
        return build_current_student_profile_response(user)

    @app.put("/api/user-data")
    async def save_user_data(
        request: Request,
        user: Dict[str, Any] = Depends(current_user),
    ) -> Dict[str, Any]:
        payload = await read_user_data_payload(request)
        result = storage.upsert_user_data(int(user["id"]), payload.studentData, payload.aiResults)
        return {"ok": True, **result}

    @app.post("/api/user-data")
    async def save_user_data_post(
        request: Request,
        user: Dict[str, Any] = Depends(current_user),
    ) -> Dict[str, Any]:
        payload = await read_user_data_payload(request)
        result = storage.upsert_user_data(int(user["id"]), payload.studentData, payload.aiResults)
        return {"ok": True, **result}

    @app.post("/api/user-data/reset")
    async def reset_user_data(user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
        storage.reset_user_data(int(user["id"]))
        return {"ok": True, "message": "Portrait data reset successfully"}

    @app.get("/api/match/workspace")
    async def get_match_workspace(user: Dict[str, Any] = Depends(current_user)) -> Dict[str, Any]:
        return storage.get_match_workspace(int(user["id"]))

    @app.put("/api/match/workspace")
    async def save_match_workspace(
        payload: MatchWorkspacePayload,
        user: Dict[str, Any] = Depends(current_user),
    ) -> Dict[str, Any]:
        result = storage.upsert_match_workspace(int(user["id"]), payload.workspace)
        return {"ok": True, **result}

    @app.post("/api/match")
    async def match_proxy(
        payload: MatchProxyPayload,
        _user: Dict[str, Any] = Depends(current_user),
    ) -> Any:
        return await proxy_match_engine(
            "/api/match",
            payload.model_dump(),
            timeout=60.0,
            error_prefix="Matching engine unreachable",
        )

    @app.post("/api/match/run")
    async def match_run_proxy(
        payload: MatchProxyPayload,
        _user: Dict[str, Any] = Depends(current_user),
    ) -> Any:
        return await match_proxy(payload, _user)

    @app.post("/api/match/check")
    async def match_check_proxy(
        payload: MatchCheckPayload,
        _user: Dict[str, Any] = Depends(current_user),
    ) -> Any:
        return await proxy_match_engine(
            "/api/match/check",
            payload.model_dump(),
            timeout=45.0,
            error_prefix="Match check engine unreachable",
        )

    @app.put("/api/match/basket/active")
    async def update_active_basket(
        payload: ActiveBasketPayload,
        user: Dict[str, Any] = Depends(current_user),
    ) -> Dict[str, Any]:
        current = storage.get_match_workspace(int(user["id"])).get("workspace") or {}
        workspace = {
            **current,
            "currentBasket": payload.basket or current.get("currentBasket") or {},
            "jobsById": {
                **(current.get("jobsById") or {}),
                **(payload.jobsById or {}),
            },
        }
        result = storage.upsert_match_workspace(int(user["id"]), workspace)
        return {"ok": True, "workspace": workspace, **result}

    @app.post("/api/match/basket/submit")
    async def basket_submit(
        payload: BasketSubmitPayload,
        user: Dict[str, Any] = Depends(current_user),
    ) -> Dict[str, Any]:
        current = storage.get_match_workspace(int(user["id"])).get("workspace") or {}
        current = _safe_dict(current)
        jobs_by_id = {
            **_safe_dict(current.get("jobsById")),
            **_safe_dict(payload.jobsById),
        }
        basket = _safe_dict(payload.basket) or _safe_dict(current.get("currentBasket"))
        job_ids = [str(job_id) for job_id in _safe_list(basket.get("jobIds")) if str(job_id)]
        basket_jobs = [
            _safe_dict(jobs_by_id.get(job_id))
            for job_id in job_ids
            if isinstance(jobs_by_id.get(job_id), dict)
        ]
        harvest_analysis: Optional[Dict[str, Any]] = None
        if basket_jobs:
            try:
                harvest_analysis = await proxy_match_engine(
                    "/api/match/harvest",
                    {
                        "student": _safe_dict(payload.student),
                        "jobs": basket_jobs,
                    },
                    timeout=180.0,
                    error_prefix="丰收深度分析失败",
                )
            except HTTPException:
                harvest_analysis = None
        submission = _build_basket_submission(
            basket=basket,
            jobs_by_id=jobs_by_id,
            student=_safe_dict(payload.student),
            analysis=payload.analysis,
            harvest_analysis=harvest_analysis,
        )
        next_jobs_by_id = dict(jobs_by_id)
        for job in submission["rankedJobs"]:
            stable_id = str(job.get("stableId") or job.get("id") or "")
            if stable_id and isinstance(next_jobs_by_id.get(stable_id), dict):
                next_jobs_by_id[stable_id] = {
                    **next_jobs_by_id[stable_id],
                    "workspaceStatus": "harvested",
                }

        basket_history = [submission["basketHistoryRecord"], *_safe_list(current.get("basketHistory"))]
        harvests = [submission["harvest"], *_safe_list(current.get("harvests"))]
        workspace = {
            **current,
            "jobsById": next_jobs_by_id,
            "basketHistory": basket_history,
            "harvests": harvests,
            "currentBasket": _create_draft_basket(basket_history, harvests),
            "selectedHarvestId": submission["harvest"]["id"],
        }
        result = storage.upsert_match_workspace(int(user["id"]), workspace)
        return {
            "ok": True,
            "workspace": workspace,
            "harvest": submission["harvest"],
            "basketHistoryRecord": submission["basketHistoryRecord"],
            **result,
        }

    @app.get("/api/match/harvest/{basket_id}")
    async def get_harvest_record(
        basket_id: str,
        user: Dict[str, Any] = Depends(current_user),
    ) -> Dict[str, Any]:
        current = storage.get_match_workspace(int(user["id"])).get("workspace") or {}
        return _find_harvest_payload(_safe_dict(current), basket_id)

    @app.delete("/api/match/harvest/{basket_id}")
    async def delete_harvest_record(
        basket_id: str,
        user: Dict[str, Any] = Depends(current_user),
    ) -> Dict[str, Any]:
        current = storage.get_match_workspace(int(user["id"])).get("workspace") or {}
        workspace = _remove_harvest_from_workspace(_safe_dict(current), basket_id)
        result = storage.upsert_match_workspace(int(user["id"]), workspace)
        return {"ok": True, "workspace": workspace, **result}

    @app.post("/api/match/action-plan")
    async def save_action_plan(
        payload: ActionPlanPayload,
        user: Dict[str, Any] = Depends(current_user),
    ) -> Dict[str, Any]:
        current = storage.get_match_workspace(int(user["id"])).get("workspace") or {}
        current = _safe_dict(current)
        nested_payload = _safe_dict(payload.payload)
        incoming_plan = _safe_dict(payload.actionPlan) or _safe_dict(nested_payload.get("actionPlan"))
        current_plan = _safe_dict(current.get("actionPlan"))
        patch = _safe_dict(payload.patch) or _safe_dict(nested_payload.get("patch"))
        next_plan = {**current_plan, **incoming_plan, **patch}
        workspace = {
            **current,
            "actionPlan": next_plan,
        }
        target_job_id = payload.targetJobId or nested_payload.get("targetJobId")
        target_harvest_id = payload.targetHarvestId or nested_payload.get("targetHarvestId")
        if target_job_id is not None:
            workspace["targetJobId"] = target_job_id
        if target_harvest_id is not None:
            workspace["targetHarvestId"] = target_harvest_id
        result = storage.upsert_match_workspace(int(user["id"]), workspace)
        return {"ok": True, "workspace": workspace, "actionPlan": next_plan, **result}

    @app.post("/api/match/internship-recommendations")
    async def internship_recommendations_proxy(
        payload: InternshipRecommendationPayload,
        _user: Dict[str, Any] = Depends(current_user),
    ) -> Any:
        return await proxy_match_engine(
            "/api/match/internship-recommendations",
            payload.model_dump(),
            timeout=90.0,
            error_prefix="Internship recommendation engine unreachable",
        )

    @app.post("/api/match/profile/sync-event")
    async def profile_sync_event_placeholder(
        payload: ReservedMatchPayload,
        _user: Dict[str, Any] = Depends(current_user),
    ) -> Dict[str, Any]:
        return {"reserved": True, "endpoint": "profile_sync_event", "payload": payload.payload}

    @app.post("/api/match/insight")
    async def match_insight_proxy(
        payload: MatchProxyPayload,
        _user: Dict[str, Any] = Depends(current_user),
    ) -> Any:
        return await proxy_match_engine(
            "/api/match/insight",
            payload.model_dump(),
            timeout=120.0,
            error_prefix="Insight engine unreachable",
        )

    @app.post("/api/reports/chat")
    async def career_report_chat(
        payload: ReportChatPayload,
        _user: Dict[str, Any] = Depends(current_user),
    ) -> Dict[str, Any]:
        question = str(payload.question or "").strip()
        if not question:
            raise HTTPException(status_code=400, detail="问题不能为空")

        config = load_ai_llm_config()
        report_context = _compact_report_for_chat(payload.report)
        chat_history = _compact_chat_history(payload.messages)
        model_result = await call_ai_chat_json(
            [
                {
                    "role": "system",
                    "content": (
                        "你是职业报告解读教练，使用后端当前配置的报告聊天模型回答。"
                        "你只能基于用户提供的收藏报告内容、逐条 JD 评分、证据和聊天上下文回答。"
                        "聊天上下文是多轮会话记录，要自然延续，但不要被历史问题诱导编造。"
                        "不要编造报告外事实；如果报告信息不足，要明确指出。"
                        "answer 字段必须使用简洁 Markdown：可以用 **加粗**、短列表和自然换行；"
                        "不要输出表格，不要堆标题，控制在 120 到 260 个中文字。"
                        "输出必须是裸 JSON，不要 markdown 代码块。"
                        "格式：{\"answer\":\"直接给学生的中文回答，具体、可执行\","
                        "\"suggestedActions\":[\"下一步建议1\",\"下一步建议2\"]}"
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "report": report_context,
                            "chatHistory": chat_history,
                            "question": question,
                        },
                        ensure_ascii=False,
                    ),
                },
            ],
            max_tokens=1000,
        )
        answer = ""
        suggested_actions: List[str] = []
        if isinstance(model_result, dict):
            answer = str(model_result.get("answer") or "").strip()
            raw_actions = model_result.get("suggestedActions") or model_result.get("suggested_actions") or []
            suggested_actions = [str(item).strip() for item in raw_actions if str(item).strip()] if isinstance(raw_actions, list) else []
        if not answer:
            answer = "我读到了这份报告，但这次模型没有返回有效解读。可以换个更具体的问题再试一次。"
        return {
            "ok": True,
            "model": config.model,
            "answer": answer,
            "suggestedActions": suggested_actions[:4],
        }

    @app.get("/api/student-profile/tech-capability/recommendations")
    async def tech_capability_recommendations(
        direction: str = "",
        _user: Dict[str, Any] = Depends(current_user),
    ) -> Dict[str, Any]:
        return {
            "source": "career-planner-backend",
            "direction": direction,
            "recommendations": recommendations_for_direction(direction),
        }

    @app.get("/api/student-profile/tech-capability/search")
    async def tech_capability_search(
        query: str = "",
        type: str = "",
        direction: str = "",
        limit: int = Query(default=8, ge=1, le=50),
        _user: Dict[str, Any] = Depends(current_user),
    ) -> Dict[str, Any]:
        return {
            "source": "career-planner-backend",
            "query": query,
            "type": type,
            "direction": direction,
            "options": search_catalog(query=query, capability_type=type, direction=direction, limit=limit),
        }

    @app.get("/api/student-profile/professional-skills/search")
    async def professional_skills_search(
        query: str = "",
        category: str = "techCapability",
        type: str = "",
        limit: int = Query(default=5, ge=1, le=50),
        min_similarity: float = Query(default=0.70, ge=0.0, le=1.0),
        _user: Dict[str, Any] = Depends(current_user),
    ) -> Dict[str, Any]:
        return await search_professional_skills(
            query=query,
            category=category,
            capability_type=type,
            limit=limit,
            min_similarity=min_similarity,
        )

    @app.get("/api/student-profile/professional-skills/recommendations")
    async def professional_skills_recommendations(
        category: str = "techCapability",
        tag_type: str = "",
        type: str = "",
        limit: int = Query(default=10, ge=1, le=50),
        offset: int = Query(default=0, ge=0),
        page: int = Query(default=0, ge=0),
        random_seed: str = "",
        min_frequency: int = Query(default=10, ge=0),
        exclude_tag_ids: str = "",
        exclude_values: str = "",
        domain_ids: str = "",
        domains: str = "",
        _user: Dict[str, Any] = Depends(current_user),
    ) -> Dict[str, Any]:
        return recommend_professional_skills(
            category=category,
            tag_type=tag_type,
            capability_type=type,
            limit=limit,
            offset=offset,
            page=page,
            random_seed=random_seed,
            min_frequency=min_frequency,
            exclude_tag_ids=exclude_tag_ids,
            exclude_values=exclude_values,
            domain_ids=domain_ids,
            domains=domains,
        )

    @app.get("/api/student-profile/tech-domains/recommendations")
    async def tech_domains_recommendations(
        limit: int = Query(default=10, ge=1, le=50),
        page: int = Query(default=0, ge=0),
        min_frequency: int = Query(default=5, ge=0),
        _user: Dict[str, Any] = Depends(current_user),
    ) -> Dict[str, Any]:
        return recommend_tech_domains(limit=limit, page=page, min_frequency=min_frequency)

    @app.get("/api/student-profile/tech-domains/search")
    async def tech_domains_search(
        query: str = "",
        limit: int = Query(default=8, ge=1, le=50),
        min_frequency: int = Query(default=5, ge=0),
        _user: Dict[str, Any] = Depends(current_user),
    ) -> Dict[str, Any]:
        return search_tech_domains(query=query, limit=limit, min_frequency=min_frequency)

    @app.get("/api/student-profile/tag-center/search")
    async def tag_center_search(
        query: str = "",
        tag_type: str = "techCapabilities",
        limit: int = Query(default=5, ge=1, le=50),
        min_similarity: float = Query(default=0.70, ge=0.0, le=1.0),
        _user: Dict[str, Any] = Depends(current_user),
    ) -> Dict[str, Any]:
        result = await search_professional_skills(
            query=query,
            tag_type=tag_type,
            limit=limit,
            min_similarity=min_similarity,
        )
        return {**result, "source": "professional-skills", "compat": "tag-center/search"}

    @app.get("/api/student-profile/tag-center/resolve")
    async def tag_center_resolve(
        tag_id: str = "",
        value: str = "",
        tag_type: str = "techCapabilities",
        _user: Dict[str, Any] = Depends(current_user),
    ) -> Dict[str, Any]:
        row = resolve_tag_center_catalog(tag_id=tag_id, value=value, tag_type=tag_type)
        return {"source": "tag-center", "matched": row is not None, "tag": row}

    @app.post("/api/student-profile/submit-and-evaluate")
    async def submit_and_evaluate(
        payload: ProfileSubmitPayload,
        user: Dict[str, Any] = Depends(current_user),
    ) -> Dict[str, Any]:
        raw_scores = calc_raw_completeness_scores(payload.studentProfile)
        evaluation = {
            "rawCompletenessScores": raw_scores,
            "profileSnapshot": {
                "basicInfo": payload.studentProfile.get("basicInfo") or {},
                "techCapabilityCount": len(payload.studentProfile.get("techCapability") or []),
            },
        }
        submission = storage.insert_profile_submission(
            int(user["id"]),
            {"studentProfile": payload.studentProfile, "meta": payload.meta},
            evaluation,
        )
        current = storage.get_user_data(int(user["id"]))
        storage.upsert_user_data(int(user["id"]), payload.studentProfile, current.get("aiResults") or {})
        return {
            "source": "career-planner-backend",
            **submission,
            "nextPage": "ai-eval",
            "profileSnapshot": evaluation["profileSnapshot"],
            "message": "画像已提交并保存，正在跳转 AI 画像评估",
        }

    @app.post("/api/ai/resume/parse")
    async def parse_resume(
        payload: ResumeParsePayload,
        _user: Dict[str, Any] = Depends(current_user),
    ) -> Any:
        if not payload.dataUrl.strip():
            raise HTTPException(status_code=400, detail="dataUrl is required")
        result = await call_resume_chat_json(
            [
                {"role": "system", "content": build_resume_parse_system_prompt()},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "请根据图片中的简历内容提取结构化信息。"},
                        {"type": "image_url", "image_url": {"url": payload.dataUrl}},
                    ],
                },
            ],
            max_tokens=4000,
        )
        return sanitize_resume_parse_result(result)

    @app.post("/api/ai/profile/completeness")
    async def profile_completeness(
        payload: StudentDataPayload,
        _user: Dict[str, Any] = Depends(current_user),
    ) -> Dict[str, Any]:
        raw_scores = calc_raw_completeness_scores(payload.studentData)
        model_result = await call_ai_chat_json(
            [
                {"role": "system", "content": build_completeness_system_prompt()},
                {"role": "user", "content": build_completeness_user_prompt(payload.studentData, raw_scores)},
            ]
        )
        return build_completeness_result(model_result, raw_scores)

    @app.post("/api/ai/profile/skillcheck")
    async def profile_skillcheck(
        payload: SkillTaskPayload,
        _user: Dict[str, Any] = Depends(current_user),
    ) -> Any:
        return await call_ai_chat_json(
            [
                {
                    "role": "system",
                    "content": build_skillcheck_system_prompt(
                        payload.techNames,
                        payload.capNames,
                        payload.toolNames,
                        payload.studentData,
                    ),
                },
                {"role": "user", "content": build_skillcheck_user_prompt(payload.studentData, payload.appliedNames)},
            ]
        )

    @app.post("/api/ai/profile/infer-levels")
    async def profile_infer_levels(
        payload: SkillTaskPayload,
        _user: Dict[str, Any] = Depends(current_user),
    ) -> Any:
        return await call_ai_chat_json(
            [
                {
                    "role": "system",
                    "content": build_infer_system_prompt(payload.techNames, payload.capNames, payload.toolNames),
                },
                {"role": "user", "content": build_profile_only_user_prompt(payload.studentData)},
            ]
        )

    @app.post("/api/ai/profile/soft-quality")
    async def profile_soft_quality(
        payload: StudentDataPayload,
        _user: Dict[str, Any] = Depends(current_user),
    ) -> Any:
        return await call_ai_chat_json(
            [
                {"role": "system", "content": build_soft_quality_prompt()},
                {"role": "user", "content": build_profile_only_user_prompt(payload.studentData)},
            ]
        )

    @app.post("/api/ai/profile/growth-potential")
    async def profile_growth_potential(
        payload: StudentDataPayload,
        _user: Dict[str, Any] = Depends(current_user),
    ) -> Any:
        return await call_ai_chat_json(
            [
                {"role": "system", "content": build_growth_potential_prompt()},
                {"role": "user", "content": build_profile_only_user_prompt(payload.studentData)},
            ]
        )

    @app.get("/backend/{_path:path}", include_in_schema=False)
    async def hide_backend_files(_path: str) -> None:
        raise HTTPException(status_code=404, detail="Not Found")

    @app.get("/data/{_path:path}", include_in_schema=False)
    async def hide_data_files(_path: str) -> None:
        raise HTTPException(status_code=404, detail="Not Found")

    # --- Static Files ---
    # Development runs the React/Vite server directly on port 3000 and this
    # FastAPI app as API-only on port 8000. Production can still serve dist.
    api_only = os.environ.get("CAREER_PLANNER_API_ONLY") == "true"
    dist_path = CAREER_PLANNER_DIR / "frontend" / "dist"

    if api_only:
        @app.get("/", include_in_schema=False)
        async def api_root() -> Dict[str, str]:
            return {
                "service": "zhitu-star-student-backend",
                "mode": "api-only",
                "health": "/api/health",
            }

    elif dist_path.exists():
        from fastapi.responses import JSONResponse

        static_app = StaticFiles(directory=str(dist_path), html=True)
        app.mount("/", static_app, name="frontend")
        
        # SPA Catch-all: Redirect unknown routes to index.html so React Router takes over
        @app.exception_handler(404)
        async def spa_exception_handler(request: Request, exc: HTTPException):
            if request.url.path.startswith("/api"):
                return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
            return await static_app.get_response("index.html", request.scope)
    else:
        @app.get("/")
        async def root_missing_dist():
            return {"message": "frontend/dist not found. Run with python start.py for development."}

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=3000)
