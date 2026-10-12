"""Feature construction shared by the analytics detectors.

``usable_prompts`` feeds the semantic duplicate detector. ``build_feature_matrix``
turns usage records into the numeric matrix consumed by the Isolation Forest
detector while keeping a row-to-request mapping so every anomaly can be
attributed to the record it came from. Input records are only ever read.
"""

from dataclasses import dataclass, field

import numpy as np

from app.features.transformers import FEATURE_NAMES, sanitize_number
from app.schemas.usage import UsageRecord
from app.semantic.normalizer import normalize_prompt

# Features a record must supply at least one of to be analyzable. ``total_tokens``
# is derived and therefore not part of this check.
CORE_FEATURES: tuple[str, ...] = (
    "input_tokens",
    "output_tokens",
    "estimated_cost",
    "latency_ms",
    "retry_count",
)

NO_USABLE_FEATURES_REASON = "no usable numerical usage features (tokens, cost, latency, retries)"


def usable_prompts(records):
    selected, prompts = [], []
    for record in records:
        prompt = normalize_prompt(record.prompt)
        if prompt:
            selected.append(record)
            prompts.append(prompt)
    return selected, prompts


@dataclass
class FeatureMatrix:
    """Numeric matrix plus the row-to-request mapping that explains it.

    ``values`` keeps ``NaN`` for missing features; imputation happens in a
    separate transform step so raw observations stay inspectable as evidence.
    """

    request_ids: list[str]
    feature_names: tuple[str, ...]
    values: np.ndarray
    raw_values: list[dict[str, float | None]]
    excluded_request_ids: list[str] = field(default_factory=list)
    excluded_reasons: dict[str, str] = field(default_factory=dict)

    @property
    def row_count(self) -> int:
        return len(self.request_ids)


def extract_features(record: UsageRecord) -> dict[str, float | None]:
    """Map one usage record to the raw numerical feature vector."""
    input_tokens = sanitize_number(record.input_tokens)
    output_tokens = sanitize_number(record.output_tokens)
    total_tokens = (
        input_tokens + output_tokens
        if input_tokens is not None and output_tokens is not None
        else None
    )
    return {
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
        "estimated_cost": sanitize_number(record.estimated_cost),
        "latency_ms": sanitize_number(record.latency_ms),
        "retry_count": sanitize_number(record.retry_count),
    }


def build_feature_matrix(records: list[UsageRecord]) -> FeatureMatrix:
    """Build the feature matrix for every record with usable numerical usage.

    Records without a single usable numerical feature are excluded rather than
    imputed: there is nothing to impute them from. Missing individual features
    are left as ``NaN`` for the imputer to fill from the batch median.
    """
    request_ids: list[str] = []
    raw_rows: list[dict[str, float | None]] = []
    rows: list[list[float]] = []
    excluded_request_ids: list[str] = []
    excluded_reasons: dict[str, str] = {}

    for record in records:
        features = extract_features(record)
        if all(features[name] is None for name in CORE_FEATURES):
            excluded_request_ids.append(record.request_id)
            excluded_reasons[record.request_id] = NO_USABLE_FEATURES_REASON
            continue
        request_ids.append(record.request_id)
        raw_rows.append(features)
        rows.append([np.nan if features[name] is None else features[name] for name in FEATURE_NAMES])

    values = np.array(rows, dtype=float).reshape(len(rows), len(FEATURE_NAMES))
    return FeatureMatrix(
        request_ids=request_ids,
        feature_names=FEATURE_NAMES,
        values=values,
        raw_values=raw_rows,
        excluded_request_ids=excluded_request_ids,
        excluded_reasons=excluded_reasons,
    )
