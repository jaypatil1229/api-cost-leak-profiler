"""scikit-learn Isolation Forest wrapper used by the ACLP anomaly detector.

Isolation Forest builds an ensemble of randomised trees and isolates each
observation with a small number of splits. Records that are easy to isolate
look unusual next to the rest of the batch. The output is a statistical
outlier signal: a flagged record is unusual and worth investigating, it is not
proof that the record caused a cost leak.

scikit-learn convention used here:

* ``fit_predict`` returns ``-1`` for anomalies and ``1`` for inliers;
* ``decision_function`` returns a score whose negative values mark records the
  model flags, so the decision threshold is ``0``;
* the public anomaly score is ``-decision_function``, meaning higher is more
  anomalous. It is a relative model score, not a probability.
"""

from dataclasses import dataclass, field
from time import perf_counter

import numpy as np
from sklearn.ensemble import IsolationForest

DETECTOR_NAME = "isolation_forest"
DETECTOR_VERSION = "1.0.0"

STATUS_OK = "ok"
STATUS_INSUFFICIENT_DATA = "insufficient_data"
STATUS_NO_FEATURES = "no_features"


@dataclass(frozen=True)
class IsolationForestConfig:
    """Model configuration; every value is supplied by application settings."""

    n_estimators: int = 200
    contamination: str | float = "auto"
    random_state: int | None = 42
    max_samples: str | int | float = "auto"
    min_samples: int = 10


@dataclass(frozen=True)
class ScoredRecord:
    """Per-row model output, aligned with the rows of the feature matrix."""

    index: int
    label: int
    decision_score: float
    anomaly_score: float


@dataclass(frozen=True)
class IsolationForestResult:
    """Model outcome. ``status`` is non-ok when nothing could be scored."""

    status: str
    detail: str
    feature_names: tuple[str, ...]
    scored: tuple[ScoredRecord, ...] = ()
    model_config: dict = field(default_factory=dict)

    @property
    def anomalies(self) -> tuple[ScoredRecord, ...]:
        return tuple(record for record in self.scored if record.label == -1)

    @property
    def insufficient_data(self) -> bool:
        return self.status != STATUS_OK


class IsolationForestDetector:
    """Fits and applies ``sklearn.ensemble.IsolationForest`` on a feature matrix.

    The detector is deliberately pure: it receives a fully imputed numeric
    matrix and the matching feature names, and returns per-row labels and
    scores. Feature building and imputation stay outside so both can be tested
    and reused independently.
    """

    name = DETECTOR_NAME
    version = DETECTOR_VERSION

    def __init__(self, config: IsolationForestConfig):
        self.config = config

    def detect(self, values: np.ndarray, feature_names) -> IsolationForestResult:
        matrix = np.asarray(values, dtype=float)
        if matrix.ndim != 2:
            raise ValueError("feature matrix must be two-dimensional")

        names = tuple(feature_names)
        if matrix.shape[1] == 0 or not names:
            return IsolationForestResult(
                status=STATUS_NO_FEATURES,
                detail="no usable numerical features were available for this batch",
                feature_names=names,
                model_config=self._model_config(None),
            )
        if matrix.shape[0] < self.config.min_samples:
            return IsolationForestResult(
                status=STATUS_INSUFFICIENT_DATA,
                detail=(
                    f"{matrix.shape[0]} analyzable record(s) is below the configured minimum of "
                    f"{self.config.min_samples}; tiny or homogeneous batches do not establish "
                    "reliable baseline usage"
                ),
                feature_names=names,
                model_config=self._model_config(None),
            )
        if not np.isfinite(matrix).all():
            raise ValueError("feature matrix contains missing or non-finite values after imputation")

        max_samples = resolve_max_samples(self.config.max_samples, matrix.shape[0])
        model = IsolationForest(
            n_estimators=self.config.n_estimators,
            contamination=self.config.contamination,
            random_state=self.config.random_state,
            max_samples=max_samples,
        )
        started = perf_counter()
        labels = model.fit_predict(matrix)
        decision_scores = model.decision_function(matrix)
        fit_seconds = perf_counter() - started

        scored = tuple(
            ScoredRecord(
                index=index,
                label=int(labels[index]),
                decision_score=float(decision_scores[index]),
                anomaly_score=float(-decision_scores[index]),
            )
            for index in range(matrix.shape[0])
        )
        return IsolationForestResult(
            status=STATUS_OK,
            detail=f"scored {matrix.shape[0]} record(s) across {len(names)} feature(s)",
            feature_names=names,
            scored=scored,
            model_config=self._model_config(max_samples, fit_seconds),
        )

    def _model_config(self, max_samples: int | None, fit_seconds: float | None = None) -> dict:
        config = {
            "nEstimators": self.config.n_estimators,
            "contamination": self.config.contamination,
            "randomState": self.config.random_state,
            "maxSamplesRequested": self.config.max_samples,
            "maxSamplesUsed": max_samples,
            "minSamples": self.config.min_samples,
            "decisionThreshold": 0.0,
            "decisionThresholdNote": "records with decision_function < 0 are flagged",
        }
        if fit_seconds is not None:
            config["fitSeconds"] = round(fit_seconds, 6)
        return config


def resolve_max_samples(value: str | int | float, row_count: int) -> int:
    """Resolve the configured ``max_samples`` against the actual batch size.

    scikit-learn warns when an integer exceeds the sample count and truncates a
    float to zero on very small batches, so both cases are clamped here and the
    effective value is reported in the analysis metadata.
    """
    if isinstance(value, str):
        return min(256, row_count)
    if isinstance(value, (int, np.integer)) and not isinstance(value, bool):
        return max(1, min(int(value), row_count))
    return max(1, min(int(float(value) * row_count), row_count))
