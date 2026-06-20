import os
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from portrait_builder_api import router as portrait_builder_router

from .admin_routes import router as admin_router
from .config import FRONTEND_DIR
from .job_data_service import initialize_runtime, shutdown_runtime
from .job_routes import router as job_router
from .match_routes import router as match_router
from .normalization_routes import router as normalization_router


def create_app() -> FastAPI:
    app = FastAPI(title="Job Matcher Agent v3.0")
    
    # CORS tightening
    allowed_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173,http://localhost:8001").split(",")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Standardized API error response handler
    @app.exception_handler(HTTPException)
    async def api_http_exception_handler(request: Request, exc: HTTPException):
        if request.url.path.startswith("/api/"):
            code = "HTTP_ERROR"
            if exc.status_code == 503:
                code = "SERVICE_UNAVAILABLE"
            elif exc.status_code == 502:
                code = "BAD_GATEWAY"
            elif exc.status_code == 504:
                code = "GATEWAY_TIMEOUT"
            elif exc.status_code == 409:
                code = "CONFLICT"
            elif exc.status_code == 404:
                code = "NOT_FOUND"
            elif exc.status_code == 401:
                code = "UNAUTHORIZED"
            elif exc.status_code == 400:
                code = "BAD_REQUEST"
                
            message = exc.detail
            if isinstance(exc.detail, dict):
                message = exc.detail.get("message") or str(exc.detail)
                
            error_payload = {
                "error": {
                    "code": code,
                    "message": str(message),
                    "degraded": False,
                    "retry_after": 30 if exc.status_code in {502, 503, 504} else None
                }
            }
            return JSONResponse(status_code=exc.status_code, content=error_payload)
            
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

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
