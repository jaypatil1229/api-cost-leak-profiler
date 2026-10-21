"""Numerical feature transformations for the ACLP anomaly detector.

The Isolation Forest detector consumes a dense numeric matrix. This module owns
the deterministic, reusable parts of that conversion: validation of raw numeric
values and batch-scoped median imputation of missing values.

Imputation parameters fitted from a batch are captured in :class:`FeatureImputer`
so the exact same transformation can be replayed later instead of being
recomputed silently from different data.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

# Feature names in matrix-column order. All are numeric measurements of usage;
# identifiers and categorical fields are deliberately excluded.
FEATURE_NAMES: tuple[str, ...] = (
    "input_tokens",
    "output_tokens",
    "total_tokens",
    "estimated_cost",
    "latency_ms",
    "retry_count",
)

IMPUTATION_STRATEGY = "batch_median"


def sanitize_number(value) -> float | None:
    """Return a finite, non-negative float, or None when the value is unusable.

    Negative token counts, costs and latencies are invalid, so they are treated
    as missing rather than being clipped to zero. Large valid values are kept:
    extreme usage is exactly what the detector is meant to surface.
    """
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not np.isfinite(number) or number < 0:
        return None
    return number


@dataclass(frozen=True)
class FeatureImputer:
    """Median imputation fitted on one batch and replayable on later batches.

    Columns with no observed value anywhere in the fitting batch carry no
    information and are dropped instead of being filled with zeros. Every
    missing value in a retained column is replaced with that column's observed
    median.
    """

    columns: tuple[int, ...]
    column_names: tuple[str, ...]
    medians: tuple[float, ...]
    dropped_columns: tuple[str, ...]
    observations: tuple[int, ...]

    @classmethod
    def fit(cls, values: np.ndarray, feature_names) -> FeatureImputer:
        matrix = _as_matrix(values, len(feature_names))
        columns: list[int] = []
        names: list[str] = []
        medians: list[float] = []
        observations: list[int] = []
        dropped: list[str] = []
        for index, name in enumerate(feature_names):
            column = matrix[:, index]
            observed = column[np.isfinite(column)]
            if observed.size == 0:
                dropped.append(name)
                continue
            columns.append(index)
            names.append(name)
            medians.append(float(np.median(observed)))
            observations.append(int(observed.size))
        return cls(tuple(columns), tuple(names), tuple(medians), tuple(dropped), tuple(observations))

    def transform(self, values: np.ndarray) -> np.ndarray:
        """Return the imputed matrix restricted to the retained columns."""
        selected = self.select(values).copy()
        for position, median in enumerate(self.medians):
            column = selected[:, position]
            column[~np.isfinite(column)] = median
        return selected

    def select(self, values: np.ndarray) -> np.ndarray:
        """Return the raw, unimputed matrix restricted to the retained columns."""
        matrix = _as_matrix(values, len(self.dropped_columns) + len(self.column_names))
        return matrix[:, list(self.columns)]

    def fit_transform(self, values: np.ndarray, feature_names) -> np.ndarray:
        return self.fit(values, feature_names).transform(values)

    def to_metadata(self) -> dict:
        """Serialisable description of the fitted transformation."""
        return {
            "strategy": IMPUTATION_STRATEGY,
            "medians": {name: round(median, 6) for name, median in zip(self.column_names, self.medians)},
            "observedValues": dict(zip(self.column_names, self.observations)),
            "droppedFeatures": list(self.dropped_columns),
        }


def describe_matrix(values: np.ndarray, feature_names) -> dict[str, dict[str, float]]:
    """Per-feature statistics over observed (non-imputed) values, for context.

    Statistics are computed from the raw matrix, so imputed entries never feed
    back into the numbers used to describe the batch.
    """
    matrix = _as_matrix(values, len(feature_names))
    summary: dict[str, dict[str, float]] = {}
    for index, name in enumerate(feature_names):
        column = matrix[:, index]
        observed = column[np.isfinite(column)]
        if observed.size == 0:
            continue
        summary[name] = {
            "median": float(np.median(observed)),
            "min": float(np.min(observed)),
            "max": float(np.max(observed)),
            "p95": float(np.percentile(observed, 95)),
        }
    return summary


def _as_matrix(values: np.ndarray, width: int) -> np.ndarray:
    matrix = np.asarray(values, dtype=float)
    if matrix.ndim != 2:
        raise ValueError("feature values must be a two-dimensional matrix")
    if matrix.shape[1] != width:
        raise ValueError("feature matrix width does not match the supplied feature names")
    return matrix
