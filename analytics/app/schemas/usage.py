from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StrictStr, field_validator


class UsageRecord(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    request_id: StrictStr = Field(alias="requestId", min_length=1)
    timestamp: datetime | None = None
    model: str | None = None
    provider: str | None = None
    prompt: str | None = None
    input_tokens: StrictInt | None = Field(default=None, alias="inputTokens", ge=0)
    output_tokens: StrictInt | None = Field(default=None, alias="outputTokens", ge=0)
    estimated_cost: float | None = Field(default=None, alias="estimatedCost", ge=0, allow_inf_nan=False)
    latency_ms: float | None = Field(default=None, alias="latencyMs", ge=0, allow_inf_nan=False)
    retry_count: StrictInt | None = Field(default=None, alias="retryCount", ge=0)
    feature: str | None = None
    user_id: str | None = Field(default=None, alias="userId")

    @field_validator("request_id")
    @classmethod
    def request_id_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("requestId must not be blank")
        return value
