from fastapi import APIRouter, Request

from app.detectors.isolation_forest import STATUS_OK

router = APIRouter()


@router.get("/health")
def health(request: Request):
    info = request.app.state.embedding_service.get_model_info()
    service = getattr(request.app.state, "anomaly_service", None)
    detector = getattr(service, "detector", None)
    anomaly = {
        "ready": detector is not None,
        "name": getattr(detector, "name", None),
        "version": getattr(detector, "version", None),
        "status": STATUS_OK if detector is not None else "not_configured",
    }
    return {
        "status": "ok" if info["ready"] else "degraded",
        "serviceVersion": request.app.state.settings.app_version,
        "embeddingModel": info,
        "anomalyDetector": anomaly,
    }
