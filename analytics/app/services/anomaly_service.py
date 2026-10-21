"""Coordinates feature building, Isolation Forest execution and finding creation.

The service is the only place that turns model output into the shared finding
contract: it keeps the row-to-request mapping, computes the batch context used
as evidence, and delegates severity to a replaceable policy. It never mutates
the supplied usage records and never claims an anomaly proves a cost leak.
"""

import hashlib
import logging
from time import perf_counter

from app.detectors.isolation_forest import (
    DETECTOR_NAME,
    DETECTOR_VERSION,
    IsolationForestConfig,
    IsolationForestDetector,
)
from app.detectors.severity import SeverityPolicy
from app.features.builder import build_feature_matrix
from app.features.transformers import IMPUTATION_STRATEGY, FeatureImputer, describe_matrix
from app.schemas.findings import Finding

logger = logging.getLogger(__name__)

FINDING_TYPE = "usage_anomaly"
SCORE_METRIC = "negative_decision_function"
SCORE_INTERPRETATION = (
    "relative model score; higher means more anomalous, it is not a probability"
)
RECOMMENDATION = (
    "Review this request's token usage, latency and retry behaviour against similar requests; "
    "confirm the usage was expected before treating it as waste."
)
ANOMALY_NOTE = (
    "Statistical outlier relative to the analyzed batch. Isolation Forest shows that the usage "
    "pattern is unusual, not why it happened and not that spend was wasted."
)

EVIDENCE_KEY_BY_FEATURE = {
    "input_tokens": "inputTokens",
    "output_tokens": "outputTokens",
    "total_tokens": "totalTokens",
    "estimated_cost": "estimatedCost",
    "latency_ms": "latencyMs",
    "retry_count": "retryCount",
}


def build_anomaly_service(settings) -> "AnomalyService":
    """Build the Isolation Forest pipeline from application settings."""
    detector = IsolationForestDetector(
        IsolationForestConfig(
            n_estimators=settings.iforest_n_estimators,
            contamination=settings.iforest_contamination,
            random_state=settings.iforest_random_state,
            max_samples=settings.iforest_max_samples,
            min_samples=settings.iforest_min_samples,
        )
    )
    policy = SeverityPolicy(
        high_percentile=settings.iforest_severity_high_percentile,
        medium_percentile=settings.iforest_severity_medium_percentile,
        cost_escalation_multiple=settings.iforest_cost_escalation_multiple,
    )
    return AnomalyService(detector, policy, max_records=settings.iforest_max_records)


class AnomalyService:
    """Runs batch anomaly detection over the usage records of one request."""

    def __init__(
        self,
        detector: IsolationForestDetector,
        severity_policy: SeverityPolicy,
        max_records: int = 5000,
    ):
        self.detector = detector
        self.severity_policy = severity_policy
        self.max_records = max_records

    def detect(self, records) -> tuple[list[Finding], dict]:
        """Return ``(findings, metadata)`` for the supplied usage records."""
        matrix = build_feature_matrix(records)
        if matrix.row_count > self.max_records:
            raise ValueError(
                f"record count {matrix.row_count} exceeds IFOREST_MAX_RECORDS={self.max_records}"
            )

        imputer = FeatureImputer.fit(matrix.values, matrix.feature_names)
        metadata = self._base_metadata(len(records), matrix, imputer)

        started = perf_counter()
        result = self.detector.detect(imputer.transform(matrix.values), imputer.column_names)
        metadata["transformAndScoreSeconds"] = round(perf_counter() - started, 6)
        metadata["modelConfig"] = result.model_config

        if result.insufficient_data:
            metadata.update(
                {
                    "status": result.status,
                    "insufficientData": True,
                    "detail": result.detail,
                    "anomalies": 0,
                }
            )
            logger.info(
                "isolation forest skipped",
                extra={"status": result.status, "recordsAnalyzed": matrix.row_count},
            )
            return [], metadata

        statistics = describe_matrix(imputer.select(matrix.values), imputer.column_names)
        median_cost = statistics.get("estimated_cost", {}).get("median")
        scores = [record.anomaly_score for record in result.scored]
        findings = [
            self._build_finding(
                record, matrix, imputer, statistics, median_cost, scores, result.model_config
            )
            for record in result.anomalies
        ]
        metadata.update(
            {
                "status": result.status,
                "insufficientData": False,
                "detail": result.detail,
                "anomalies": len(findings),
                "scoredRecords": len(scores),
                "batchStatistics": statistics,
                "scoreRange": {
                    "min": round(min(scores), 6),
                    "max": round(max(scores), 6),
                    "median": round(sorted(scores)[len(scores) // 2], 6),
                },
            }
        )
        logger.info(
            "isolation forest analysis complete",
            extra={
                "recordsAnalyzed": matrix.row_count,
                "anomaly_count": len(findings),
                "features_used": list(imputer.column_names),
            },
        )
        return findings, metadata

    def _base_metadata(self, scanned: int, matrix, imputer: FeatureImputer) -> dict:
        return {
            "detector": DETECTOR_NAME,
            "detectorVersion": DETECTOR_VERSION,
            "scoreMetric": SCORE_METRIC,
            "scoreInterpretation": SCORE_INTERPRETATION,
            "recordsScanned": scanned,
            "recordsAnalyzed": matrix.row_count,
            "recordsExcluded": len(matrix.excluded_request_ids),
            "excludedRecords": dict(matrix.excluded_reasons),
            "featureNames": list(imputer.column_names),
            "featuresDropped": list(imputer.dropped_columns),
            "imputation": imputer.to_metadata(),
            "severityPolicy": self.severity_policy.to_metadata(),
        }

    def _build_finding(
        self,
        record,
        matrix,
        imputer: FeatureImputer,
        statistics: dict,
        median_cost: float | None,
        scores: list[float],
        model_config: dict,
    ) -> Finding:
        request_id = matrix.request_ids[record.index]
        raw = matrix.raw_values[record.index]
        percentile_rank = sum(1 for score in scores if score < record.anomaly_score) / len(scores)
        severity, reasons = self.severity_policy.classify(
            percentile_rank=percentile_rank,
            estimated_cost=raw.get("estimated_cost"),
            median_cost=median_cost,
        )
        return Finding(
            id=_finding_id(request_id, record.index),
            type=FINDING_TYPE,
            severity=severity,
            score=round(record.anomaly_score, 6),
            request_ids=[request_id],
            evidence=self._evidence(
                record, request_id, raw, imputer, statistics, percentile_rank, reasons
            ),
            recommendation=RECOMMENDATION,
            metadata={
                "detector": DETECTOR_NAME,
                "detectorVersion": DETECTOR_VERSION,
                "scoreMetric": SCORE_METRIC,
                "scoreInterpretation": SCORE_INTERPRETATION,
                "percentileRank": round(percentile_rank, 6),
                "featureNames": list(imputer.column_names),
                "modelConfig": dict(model_config),
                "severityPolicy": self.severity_policy.to_metadata(),
                "severityReasons": reasons,
                "imputationStrategy": IMPUTATION_STRATEGY,
            },
        )

    def _evidence(
        self,
        record,
        request_id: str,
        raw: dict[str, float | None],
        imputer: FeatureImputer,
        statistics: dict,
        percentile_rank: float,
        reasons: list[str],
    ) -> dict:
        evidence = {
            "detector": DETECTOR_NAME,
            "detectorVersion": DETECTOR_VERSION,
            "requestId": request_id,
            "anomalyScore": round(record.anomaly_score, 6),
            "rawDecisionScore": round(record.decision_score, 6),
            "scoreMetric": SCORE_METRIC,
            "scoreInterpretation": SCORE_INTERPRETATION,
            "batchPercentileRank": round(percentile_rank, 6),
            "featureNames": list(imputer.column_names),
            "severityReasons": reasons,
            "note": ANOMALY_NOTE,
        }
        for name in imputer.column_names:
            value = raw.get(name)
            if value is not None:
                evidence[EVIDENCE_KEY_BY_FEATURE[name]] = _round(value)
        medians = {
            EVIDENCE_KEY_BY_FEATURE[name]: _round(values["median"])
            for name, values in statistics.items()
            if name in EVIDENCE_KEY_BY_FEATURE
        }
        if medians:
            evidence["batchMedians"] = medians
        comparisons = {}
        for name, values in statistics.items():
            value = raw.get(name)
            if value is None or values["median"] <= 0:
                continue
            key = f"{EVIDENCE_KEY_BY_FEATURE[name]}VsBatchMedian"
            comparisons[key] = round(value / values["median"], 4)
        if comparisons:
            evidence["medianComparisons"] = comparisons
        return evidence


def _finding_id(request_id: str, index: int) -> str:
    digest = hashlib.sha256(f"{DETECTOR_NAME}|{request_id}|{index}".encode()).hexdigest()[:16]
    return f"iforest_{digest}"


def _round(value: float) -> float:
    return round(float(value), 6)
