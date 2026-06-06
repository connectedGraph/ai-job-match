from fastapi import APIRouter

from ..matching_service import run_debug_score
from ..schemas import DebugScoreRequest


router = APIRouter(tags=["matching-debug"])


@router.post("/api/debug/score")
async def debug_score(req: DebugScoreRequest):
    return await run_debug_score(req)
