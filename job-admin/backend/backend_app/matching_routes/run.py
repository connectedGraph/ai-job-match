from fastapi import APIRouter

from ..matching_service import run_match
from ..schemas import MatchRequest


router = APIRouter(tags=["matching"])


@router.post("/api/match")
async def match_jobs(req: MatchRequest):
    return await run_match(req)
