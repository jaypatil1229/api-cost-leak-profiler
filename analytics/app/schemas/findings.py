from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class Finding(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: str
    type: str
    severity: str
    score: float
    request_ids: list[str] = Field(alias="requestIds")
    evidence: dict[str, Any]
    estimated_impact: float | None = Field(default=None, alias="estimatedImpact")
    recommendation: str
    metadata: dict[str, Any] = Field(default_factory=dict)
