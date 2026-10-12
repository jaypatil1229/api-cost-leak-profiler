import logging
from fastapi import APIRouter, Depends, HTTPException
from app.api.dependencies import get_analysis_service
from app.schemas.requests import AnalysisRequest
from app.schemas.responses import AnalysisResponse
from app.services.analysis_service import UnsupportedAnalysisError
logger=logging.getLogger(__name__)
router=APIRouter(prefix="/api/v1")
@router.post("/analyze",response_model=AnalysisResponse)
def analyze(payload:AnalysisRequest,service=Depends(get_analysis_service)):
    try:
        logger.info("analysis started",extra={"project_id":payload.project_id,"analysis_type":payload.analysis_type.value,"record_count":len(payload.records)})
        return service.analyze(payload)
    except UnsupportedAnalysisError as exc: raise HTTPException(status_code=422,detail=str(exc)) from exc
    except ValueError as exc: raise HTTPException(status_code=422,detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("analysis failed",extra={"project_id":payload.project_id})
        raise HTTPException(status_code=503,detail="Analysis engine is unavailable") from exc
