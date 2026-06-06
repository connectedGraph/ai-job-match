from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from portrait_builder_api import router as portrait_builder_router

from .admin_routes import router as admin_router
from .config import FRONTEND_DIR
from .job_data_service import initialize_runtime, shutdown_runtime
from .job_routes import router as job_router
from .match_routes import router as match_router
from .normalization_routes import router as normalization_router


def create_app() -> FastAPI:
    app = FastAPI(title="Job Matcher Agent v3.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(portrait_builder_router)
    app.include_router(match_router)
    app.include_router(job_router)
    app.include_router(admin_router)
    app.include_router(normalization_router)

    @app.get("/api/health")
    async def health():
        return {"status": "ok", "service": "job-matching-backend"}

    app.router.on_startup.append(initialize_runtime)
    app.router.on_shutdown.append(shutdown_runtime)
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="static")
    return app
