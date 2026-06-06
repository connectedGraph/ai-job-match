from fastapi import APIRouter

from portrait_builder.api_routes_runs import router as runs_router
from portrait_builder.api_routes_uploads import router as uploads_router
from portrait_builder.api_storage import ensure_storage


ensure_storage()

router = APIRouter(prefix="/api/builder")
router.include_router(uploads_router, tags=["portrait_builder"])
router.include_router(runs_router, tags=["portrait_builder"])
