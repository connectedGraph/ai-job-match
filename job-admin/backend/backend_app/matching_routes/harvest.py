from fastapi import APIRouter

from ..matching_service import run_match_harvest
from ..schemas import MatchHarvestRequest


router = APIRouter(tags=["matching-harvest"])


@router.post("/api/match/harvest")
async def match_harvest(req: MatchHarvestRequest):
    return await run_match_harvest(req)
