from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.usage import UsageRecord


class AnalysisType(str, Enum):
    semantic_duplicates = "semantic_duplicates"
    isolation_forest = "isolation_forest"
    all = "all"


class TimeRange(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    start: datetime | None = None
    end: datetime | None = None

    @model_validator(mode="after")
    def ordered(self):
        if self.start and self.end and self.start > self.end:
            raise ValueError("timeRange.start must be before or equal to timeRange.end")
        return self


class AnalysisRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    project_id: str = Field(alias="projectId", min_length=1)
    analysis_type: AnalysisType = Field(alias="analysisType")
    time_range: TimeRange | None = Field(default=None, alias="timeRange")
    records: list[UsageRecord]
