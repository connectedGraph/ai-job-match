from fastapi import APIRouter

from .check import router as check_router
from .debug import router as debug_router
from .harvest import router as harvest_router
from .internship import router as internship_router
from .insight import router as insight_router
from .run import router as run_router


router = APIRouter()
router.include_router(run_router)
router.include_router(check_router)
router.include_router(harvest_router)
router.include_router(internship_router)
router.include_router(insight_router)
router.include_router(debug_router)


__all__ = ["router"]
