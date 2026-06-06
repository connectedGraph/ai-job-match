from fastapi import APIRouter

from ..matching_service import run_match_insight
from ..schemas import MatchRequest


router = APIRouter(tags=["matching-insight"])


@router.post("/api/match/insight")
async def match_insight(req: MatchRequest):
    return await run_match_insight(req)
