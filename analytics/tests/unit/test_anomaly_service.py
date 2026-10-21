import numpy as np
import pytest

from app.detectors.isolation_forest import IsolationForestConfig, IsolationForestDetector
from app.detectors.severity import SeverityPolicy
from app.schemas.usage import UsageRecord
from app.services.anomaly_service import AnomalyService


def anomaly_service(**overrides) -> AnomalyService:
    configured = {"contamination": 0.02, "random_state": 42, "min_samples": 10}
    configured.update(overrides)
    return AnomalyService(
        IsolationForestDetector(IsolationForestConfig(**configured)),
        SeverityPolicy(high_percentile=0.98, medium_percentile=0.90, cost_escalation_multiple=3.0),
    )


def usage_records(count: int = 30) -> list[UsageRecord]:
    records = [
        UsageRecord(requestId=f"req_{index:03d}", inputTokens=500 + index, outputTokens=200,
                    estimatedCost=0.003, latencyMs=400, retryCount=0)
        for index in range(count)
    ]
    records.append(UsageRecord(requestId="req_spike", inputTokens=9000, outputTokens=2000,
                               estimatedCost=0.15, latencyMs=4000, retryCount=3))
    return records


def test_detects_the_outlier_and_explains_it():
    records = usage_records()
    findings, metadata = anomaly_service().detect(records)

    assert metadata["status"] == "ok"
    assert metadata["insufficientData"] is False
    assert metadata["recordsScanned"] == 31
    assert metadata["recordsAnalyzed"] == 31
    assert metadata["recordsExcluded"] == 0
    assert metadata["imputation"]["strategy"] == "batch_median"
    assert metadata["modelConfig"]["contamination"] == 0.02
    assert metadata["featureNames"] == ["input_tokens", "output_tokens", "total_tokens",
                                        "estimated_cost", "latency_ms", "retry_count"]

    spike = next(finding for finding in findings if finding.request_ids == ["req_spike"])
    assert spike.type == "usage_anomaly"
    assert spike.id.startswith("iforest_")
    assert spike.severity == "high"
    assert spike.estimated_impact is None
    assert spike.score == max(finding.score for finding in findings)
    assert spike.evidence["inputTokens"] == 9000
    assert spike.evidence["totalTokens"] == 11000
    assert spike.evidence["estimatedCost"] == 0.15
    assert spike.evidence["retryCount"] == 3
    assert spike.evidence["detector"] == "isolation_forest"
    assert spike.evidence["rawDecisionScore"] < 0
    assert spike.evidence["medianComparisons"]["totalTokensVsBatchMedian"] > 5
    assert "batchMedians" in spike.evidence
    assert spike.metadata["modelConfig"]["randomState"] == 42
    assert spike.metadata["featureNames"] == metadata["featureNames"]
    assert "not a probability" in spike.metadata["scoreInterpretation"]
    assert any("estimated cost" in reason for reason in spike.metadata["severityReasons"])


def test_does_not_mutate_the_supplied_records():
    records = usage_records()
    before = [record.model_dump() for record in records]

    anomaly_service().detect(records)

    assert [record.model_dump() for record in records] == before


def test_excludes_records_without_numerical_usage():
    records = usage_records() + [UsageRecord(requestId="req_empty", prompt="only a prompt here")]
    findings, metadata = anomaly_service().detect(records)

    assert metadata["recordsScanned"] == 32
    assert metadata["recordsAnalyzed"] == 31
    assert metadata["recordsExcluded"] == 1
    assert "req_empty" in metadata["excludedRecords"]
    assert all("req_empty" not in finding.request_ids for finding in findings)


def test_feature_missing_everywhere_is_dropped_not_zero_filled():
    records = [
        UsageRecord(requestId=f"req_{index}", inputTokens=500, outputTokens=200, estimatedCost=0.003,
                    latencyMs=400)
        for index in range(11)
    ]
    records.append(UsageRecord(requestId="req_spike", inputTokens=9000, outputTokens=2000,
                               estimatedCost=0.15, latencyMs=4000))
    findings, metadata = anomaly_service().detect(records)

    assert "retry_count" not in metadata["featureNames"]
    assert metadata["featuresDropped"] == ["retry_count"]
    assert all("retryCount" not in finding.evidence for finding in findings)


def test_insufficient_data_returns_no_findings_and_a_clear_status():
    findings, metadata = anomaly_service().detect(usage_records(2))

    assert findings == []
    assert metadata["insufficientData"] is True
    assert metadata["status"] == "insufficient_data"
    assert "below the configured minimum" in metadata["detail"]
    assert metadata["anomalies"] == 0


def test_batch_without_any_usable_features_reports_no_features():
    findings, metadata = anomaly_service().detect(
        [UsageRecord(requestId="only_prompt", prompt="hello")]
    )

    assert findings == []
    assert metadata["status"] == "no_features"
    assert metadata["recordsAnalyzed"] == 0


def test_record_count_guard_raises_for_oversized_batches():
    service = AnomalyService(anomaly_service().detector, SeverityPolicy(), max_records=2)

    with pytest.raises(ValueError, match="IFOREST_MAX_RECORDS"):
        service.detect(usage_records(5))


def test_imputed_values_are_not_reported_as_observed_evidence():
    records = [
        UsageRecord(requestId=f"req_{index}", inputTokens=500, outputTokens=200, estimatedCost=0.003,
                    latencyMs=400, retryCount=0)
        for index in range(11)
    ]
    records.append(UsageRecord(requestId="req_partial", inputTokens=9000, latencyMs=4000))
    findings, metadata = anomaly_service().detect(records)

    partial = next(finding for finding in findings if finding.request_ids == ["req_partial"])
    assert partial.evidence["inputTokens"] == 9000
    assert "outputTokens" not in partial.evidence
    assert "estimatedCost" not in partial.evidence
    assert np.isclose(metadata["imputation"]["medians"]["output_tokens"], 200.0)
