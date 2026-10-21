import numpy as np
import pytest

from app.detectors.isolation_forest import (
    STATUS_INSUFFICIENT_DATA,
    STATUS_NO_FEATURES,
    STATUS_OK,
    IsolationForestConfig,
    IsolationForestDetector,
    resolve_max_samples,
)
from app.detectors.severity import SeverityPolicy, escalate


def baseline_rows(count: int = 30) -> np.ndarray:
    rng = np.random.default_rng(7)
    base = np.column_stack([
        rng.integers(480, 520, count),
        rng.integers(180, 220, count),
        np.full(count, 0.003),
        rng.integers(380, 420, count),
        np.zeros(count),
    ])
    extreme = np.array([[9000.0, 2000.0, 0.15, 4000.0, 3.0]])
    return np.vstack([base, extreme])


def detector(**overrides) -> IsolationForestDetector:
    configured = {"contamination": 0.02, "random_state": 42, "min_samples": 10}
    configured.update(overrides)
    return IsolationForestDetector(IsolationForestConfig(**configured))


NAMES = ("input_tokens", "output_tokens", "estimated_cost", "latency_ms", "retry_count")


def test_flags_the_extreme_record_and_orders_scores():
    result = detector().detect(baseline_rows(), NAMES)

    assert result.status == STATUS_OK
    assert result.insufficient_data is False
    flagged = {record.index for record in result.anomalies}
    assert flagged == {30}
    extreme = result.scored[30]
    assert extreme.label == -1
    assert extreme.decision_score < 0
    assert extreme.anomaly_score == pytest.approx(-extreme.decision_score)
    assert extreme.anomaly_score == max(record.anomaly_score for record in result.scored)
    assert result.feature_names == NAMES
    assert result.model_config["maxSamplesUsed"] == 31
    assert result.model_config["decisionThreshold"] == 0.0


def test_results_are_reproducible_for_a_fixed_random_state():
    first = detector().detect(baseline_rows(), NAMES)
    second = detector().detect(baseline_rows(), NAMES)

    assert [record.anomaly_score for record in first.scored] == [
        record.anomaly_score for record in second.scored
    ]


def test_small_batch_reports_insufficient_data_without_fabricating_anomalies():
    result = detector(min_samples=10).detect(baseline_rows(4), NAMES)

    assert result.status == STATUS_INSUFFICIENT_DATA
    assert result.insufficient_data is True
    assert result.scored == ()
    assert result.anomalies == ()
    assert "below the configured minimum" in result.detail


def test_batch_without_features_reports_no_features():
    result = detector().detect(np.empty((30, 0)), ())

    assert result.status == STATUS_NO_FEATURES
    assert result.anomalies == ()


def test_detector_rejects_non_finite_values_after_imputation():
    rows = baseline_rows()
    rows[0, 0] = np.nan

    with pytest.raises(ValueError, match="non-finite"):
        detector().detect(rows, NAMES)


def test_resolve_max_samples_clamps_to_the_batch_size():
    assert resolve_max_samples("auto", 40) == 40
    assert resolve_max_samples("auto", 1000) == 256
    assert resolve_max_samples(500, 40) == 40
    assert resolve_max_samples(10, 40) == 10
    assert resolve_max_samples(0.001, 40) == 1
    assert resolve_max_samples(0.5, 40) == 20


def test_severity_policy_uses_percentile_then_cost_escalation():
    policy = SeverityPolicy(high_percentile=0.98, medium_percentile=0.90, cost_escalation_multiple=3)

    assert policy.classify(0.50)[0] == "low"
    assert policy.classify(0.95)[0] == "medium"
    assert policy.classify(0.99)[0] == "high"
    expensive = policy.classify(0.95, estimated_cost=0.30, median_cost=0.003)
    assert expensive[0] == "high"
    assert "raised from medium to high" in expensive[1][-1]
    assert policy.classify(0.50, estimated_cost=0.30, median_cost=0.003)[0] == "medium"
    assert policy.classify(0.99, estimated_cost=0.30, median_cost=0.003)[0] == "high"
    assert policy.classify(0.95, estimated_cost=None, median_cost=0.003)[0] == "medium"
    assert policy.classify(0.95, estimated_cost=0.30, median_cost=0.0)[0] == "medium"
    assert policy.to_metadata()["policy"] == "batch_percentile_with_cost_escalation"


def test_escalate_caps_at_the_highest_level():
    assert escalate("low") == "medium"
    assert escalate("medium") == "high"
    assert escalate("high") == "high"
