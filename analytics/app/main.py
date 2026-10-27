import hmac
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.routes.analysis import router as analysis_router
from app.api.routes.health import router as health_router
from app.config.settings import Settings, get_settings
from app.embeddings.service import EmbeddingService
from app.semantic.detector import SemanticDuplicateDetector
from app.services.analysis_service import AnalysisService
from app.services.anomaly_service import build_anomaly_service
from app.utils.logging import configure_logging


def create_app(
    settings: Settings | None = None,
    analysis_service=None,
    embedding_service=None,
    anomaly_service=None,
) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)
    embedding_service = embedding_service or EmbeddingService(settings.embedding_model_name)
    detector = SemanticDuplicateDetector(embedding_service, settings.semantic_similarity_threshold,
                                         settings.max_semantic_records)
    anomaly_service = anomaly_service or build_anomaly_service(settings)
    analysis_service = analysis_service or AnalysisService(
        detector,
        anomaly_service,
        semantic_enabled=settings.enable_semantic_analysis,
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if settings.enable_semantic_analysis:
            try:
                embedding_service.load_model()
            except Exception:
                logging.getLogger(__name__).exception("embedding model failed to load")
        yield

    app = FastAPI(title="ACLP Analytics", version=settings.app_version, lifespan=lifespan)
    app.state.settings = settings
    app.state.embedding_service = embedding_service
    app.state.analysis_service = analysis_service
    app.state.anomaly_service = anomaly_service

    @app.middleware("http")
    async def internal_auth(request: Request, call_next):
        if request.url.path.startswith("/api/") and settings.analytics_service_key:
            supplied = request.headers.get("X-Internal-Service-Key", "")
            if not hmac.compare_digest(supplied, settings.analytics_service_key):
                return JSONResponse(status_code=401, content={"detail": "Invalid internal service credentials"})
        return await call_next(request)

    app.include_router(health_router)
    app.include_router(analysis_router)
    return app


app = create_app()
