from fastapi import APIRouter

from ..match_check_service import run_match_check
from ..schemas import MatchCheckRequest


router = APIRouter(tags=["matching-check"])


@router.post("/api/match/check")
async def match_check(req: MatchCheckRequest):
    return await run_match_check(req)
