from functools import lru_cache

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"
    app_version: str = "1.0.0"
    log_level: str = "INFO"
    enable_semantic_analysis: bool = True
    embedding_model_name: str = "sentence-transformers/all-MiniLM-L6-v2"
    semantic_similarity_threshold: float = Field(default=0.80, ge=-1, le=1)
    max_semantic_records: int = Field(default=5000, ge=2)
    analytics_service_key: str | None = None
    allow_prompt_logging: bool = False

    # --- Isolation Forest anomaly detector -----------------------------------
    # Size of the randomised tree ensemble fitted per analysis batch.
    iforest_n_estimators: int = Field(default=200, ge=1, le=2000)
    # Expected outlier fraction handed to scikit-learn; it moves the model decision
    # threshold and is not a claim about the real anomaly rate of the data.
    iforest_contamination: str | float = "auto"
    # Set for reproducible fits; "none" or an empty value disables determinism.
    iforest_random_state: int | None = 42
    # Rows sampled per tree: "auto", a positive int, or a float in (0, 1].
    iforest_max_samples: str | int | float = "auto"
    # Below this many analyzable records the detector reports insufficient data
    # instead of fitting an unreliable model.
    iforest_min_samples: int = Field(default=10, ge=2)
    # Request size guard mirroring MAX_SEMANTIC_RECORDS.
    iforest_max_records: int = Field(default=5000, ge=2)
    # Severity heuristics expressed as percentiles of the batch anomaly scores.
    iforest_severity_high_percentile: float = Field(default=0.98, gt=0, le=1)
    iforest_severity_medium_percentile: float = Field(default=0.90, gt=0, le=1)
    iforest_cost_escalation_multiple: float = Field(default=3.0, gt=0)

    @field_validator("iforest_contamination", mode="before")
    @classmethod
    def parse_contamination(cls, value):
        """Accept auto or a number in (0, 0.5], the values scikit-learn allows."""
        if value is None or (isinstance(value, str) and not value.strip()):
            return "auto"
        if isinstance(value, str):
            text = value.strip().lower()
            if text == "auto":
                return "auto"
            value = float(text)
        number = float(value)
        if not 0 < number <= 0.5:
            raise ValueError("IFOREST_CONTAMINATION must be auto or a number in (0, 0.5]")
        return number

    @field_validator("iforest_max_samples", mode="before")
    @classmethod
    def parse_max_samples(cls, value):
        """Accept auto, a positive int, or a float in (0, 1]."""
        message = "IFOREST_MAX_SAMPLES must be auto, a positive int or a float in (0, 1]"
        if value is None or (isinstance(value, str) and not value.strip()):
            return "auto"
        if isinstance(value, bool):
            raise ValueError(message)
        if isinstance(value, str):
            text = value.strip().lower()
            if text == "auto":
                return "auto"
            value = float(text)
        if isinstance(value, int):
            if value < 1:
                raise ValueError(message)
            return value
        number = float(value)
        if number.is_integer() and number >= 1:
            return int(number)
        if not 0 < number <= 1:
            raise ValueError(message)
        return number

    @field_validator("iforest_random_state", mode="before")
    @classmethod
    def parse_random_state(cls, value):
        if value is None or (isinstance(value, str) and value.strip().lower() in {"", "none"}):
            return None
        return value

    @model_validator(mode="after")
    def validate_settings(self):
        if self.app_env.lower() == "production" and not self.analytics_service_key:
            raise ValueError("ANALYTICS_SERVICE_KEY is required in production")
        if self.iforest_severity_medium_percentile > self.iforest_severity_high_percentile:
            raise ValueError(
                "IFOREST_SEVERITY_MEDIUM_PERCENTILE must not exceed IFOREST_SEVERITY_HIGH_PERCENTILE"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
