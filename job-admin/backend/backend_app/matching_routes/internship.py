from fastapi import APIRouter

from ..matching_service import recommend_internship_jobs
from ..schemas import InternshipRecommendationRequest


router = APIRouter(tags=["matching"])


@router.post("/api/match/internship-recommendations")
async def internship_recommendations(req: InternshipRecommendationRequest):
    return await recommend_internship_jobs(req)
