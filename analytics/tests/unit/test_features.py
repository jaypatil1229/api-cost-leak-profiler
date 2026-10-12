import numpy as np
import pytest

from app.features.builder import build_feature_matrix
from app.features.transformers import FEATURE_NAMES, FeatureImputer, describe_matrix, sanitize_number
from app.schemas.usage import UsageRecord


def record(**overrides) -> UsageRecord:
    payload = {"requestId": "req_1", "inputTokens": 500, "outputTokens": 200, "estimatedCost": 0.003,
               "latencyMs": 400, "retryCount": 0}
    payload.update(overrides)
    return UsageRecord(**payload)


def test_sanitize_number_rejects_invalid_values():
    assert sanitize_number(12) == 12.0
    assert sanitize_number(0) == 0.0
    assert sanitize_number(-1) is None
    assert sanitize_number(float("nan")) is None
    assert sanitize_number(float("inf")) is None
    assert sanitize_number(None) is None
    assert sanitize_number(True) is None
    assert sanitize_number("nope") is None


def test_build_feature_matrix_derives_totals_and_keeps_nan_for_missing():
    matrix = build_feature_matrix([record(), record(requestId="req_2", outputTokens=None)])

    assert matrix.request_ids == ["req_1", "req_2"]
    assert matrix.feature_names == FEATURE_NAMES
    first = matrix.values[0]
    assert first[FEATURE_NAMES.index("total_tokens")] == 700
    second_total = matrix.values[1][FEATURE_NAMES.index("total_tokens")]
    assert np.isnan(second_total)
    assert matrix.raw_values[1]["total_tokens"] is None
    assert matrix.raw_values[1]["output_tokens"] is None


def test_build_feature_matrix_excludes_records_without_usable_numbers():
    empty = record(requestId="empty", inputTokens=None, outputTokens=None, estimatedCost=None,
                   latencyMs=None, retryCount=None)
    matrix = build_feature_matrix([empty, record(requestId="kept", inputTokens=5)])

    assert matrix.request_ids == ["kept"]
    assert matrix.excluded_request_ids == ["empty"]
    assert "empty" in matrix.excluded_reasons
    assert matrix.values.shape == (1, len(FEATURE_NAMES))


def test_build_feature_matrix_ignores_negative_values_and_does_not_mutate_records():
    # Negative usage is rejected by the API model, but a record built by other
    # internal callers must not be able to corrupt the feature matrix.
    original = UsageRecord.model_construct(requestId="req_1", inputTokens=-5, outputTokens=None,
                                           estimatedCost=-0.1, latencyMs=100, retryCount=None)
    matrix = build_feature_matrix([original])

    assert matrix.raw_values[0]["input_tokens"] is None
    assert matrix.raw_values[0]["estimated_cost"] is None
    assert matrix.raw_values[0]["latency_ms"] == 100
    assert original.input_tokens == -5
    assert original.estimated_cost == -0.1


def test_build_feature_matrix_handles_empty_input():
    matrix = build_feature_matrix([])

    assert matrix.row_count == 0
    assert matrix.values.shape == (0, len(FEATURE_NAMES))


def test_imputer_uses_observed_median_and_drops_empty_columns():
    values = np.array([
        [10.0, np.nan, np.nan],
        [20.0, 4.0, np.nan],
        [30.0, np.nan, np.nan],
    ])
    imputer = FeatureImputer.fit(values, ("a", "b", "c"))

    assert imputer.column_names == ("a", "b")
    assert imputer.dropped_columns == ("c",)
    assert imputer.medians == (20.0, 4.0)
    assert imputer.observations == (3, 1)
    transformed = imputer.transform(values)
    assert transformed.tolist() == [[10.0, 4.0], [20.0, 4.0], [30.0, 4.0]]


def test_imputer_replays_fitted_medians_on_a_later_batch():
    fitted = FeatureImputer.fit(np.array([[2.0, 2.0], [4.0, np.nan]]), ("a", "b"))
    later = fitted.transform(np.array([[np.nan, 10.0]]))

    assert later.tolist() == [[3.0, 10.0]]


def test_imputer_metadata_is_serialisable_and_names_dropped_features():
    imputer = FeatureImputer.fit(np.array([[1.0, np.nan]]), ("a", "b"))

    assert imputer.to_metadata() == {
        "strategy": "batch_median",
        "medians": {"a": 1.0},
        "observedValues": {"a": 1},
        "droppedFeatures": ["b"],
    }


def test_imputer_rejects_mismatched_widths():
    with pytest.raises(ValueError, match="width"):
        FeatureImputer.fit(np.array([[1.0, 2.0]]), ("only_one",))


def test_describe_matrix_ignores_missing_values():
    stats = describe_matrix(np.array([[1.0, np.nan], [3.0, 5.0], [np.nan, 5.0]]), ("a", "b"))

    assert stats["a"] == {"median": 2.0, "min": 1.0, "max": 3.0, "p95": 2.9}
    assert stats["b"]["median"] == 5.0
