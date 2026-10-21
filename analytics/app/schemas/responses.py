from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.findings import Finding
from app.schemas.requests import AnalysisType


class AnalysisResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    analysis_type: AnalysisType = Field(alias="analysisType")
    project_id: str = Field(alias="projectId")
    findings: list[Finding]
    summary: dict[str, int]
    metadata: dict[str, Any]
