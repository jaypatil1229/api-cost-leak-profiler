"""Dispatches an analysis request to the detectors implemented in this service.

The backend owns the deterministic detectors (exact duplicates, retry loops,
unbounded context, rule-based oversized prompts and spend spikes). This service
implements the statistical detectors only and returns the shared response
contract; each detector keeps its own logic and stays independently testable.
"""

from app.schemas.requests import AnalysisType
from app.schemas.responses import AnalysisResponse

SEMANTIC_DUPLICATE = "semantic_duplicate"
ISOLATION_FOREST = "isolation_forest"


class UnsupportedAnalysisError(Exception):
    pass


class AnalysisService:
    """Runs the requested analysis type and shapes summary and metadata."""

    def __init__(self, detector, anomaly_service=None, semantic_enabled=True):
        # ``detector`` stays the semantic duplicate detector for backwards
        # compatibility with existing wiring and tests.
        self.detector = detector
        self.anomaly_service = anomaly_service
        self.semantic_enabled = semantic_enabled

    def analyze(self, request) -> AnalysisResponse:
        analysis_type = request.analysis_type
        if analysis_type == AnalysisType.semantic_duplicates:
            findings, metadata, summary = self._semantic(request.records)
        elif analysis_type == AnalysisType.isolation_forest:
            findings, metadata, summary = self._anomaly(request.records)
        elif analysis_type == AnalysisType.all:
            findings, metadata, summary = self._all(request.records)
        else:
            raise UnsupportedAnalysisError(
                f"analysisType '{analysis_type.value}' is not implemented"
            )
        return AnalysisResponse(
            project_id=request.project_id,
            analysis_type=analysis_type,
            findings=findings,
            summary=summary,
            metadata=metadata,
        )

    def _semantic(self, records):
        if not self.semantic_enabled:
            raise UnsupportedAnalysisError("semantic_duplicates analysis is disabled")
        if not records or not any((record.prompt or "").strip() for record in records):
            raise ValueError("records must contain at least one usable prompt")
        findings, metadata = self.detector.detect(records)
        summary = {
            "recordsScanned": len(records),
            "findings": len(findings),
            "promptsExcluded": metadata.get("promptsExcluded", 0),
        }
        return findings, metadata, summary

    def _anomaly(self, records):
        service = self.anomaly_service
        if service is None:
            raise UnsupportedAnalysisError("analysisType 'isolation_forest' is not configured")
        findings, metadata = service.detect(records)
        summary = {
            "recordsScanned": len(records),
            "findings": len(findings),
            "recordsAnalyzed": metadata.get("recordsAnalyzed", 0),
            "recordsExcluded": metadata.get("recordsExcluded", 0),
        }
        return findings, metadata, summary

    def _all(self, records):
        """Run every detector implemented here and merge their findings."""
        findings = []
        metadata = {"detectors": []}
        skipped: dict[str, str] = {}
        summary = {
            "recordsScanned": len(records),
            "findings": 0,
            "promptsExcluded": 0,
            "recordsAnalyzed": 0,
            "recordsExcluded": 0,
        }

        if not self.semantic_enabled:
            skipped[SEMANTIC_DUPLICATE] = "semantic analysis is disabled"
        elif records and any((record.prompt or "").strip() for record in records):
            semantic_findings, semantic_metadata, semantic_summary = self._semantic(records)
            findings.extend(semantic_findings)
            metadata["detectors"].append(SEMANTIC_DUPLICATE)
            metadata["semanticDuplicate"] = semantic_metadata
            summary["promptsExcluded"] = semantic_summary["promptsExcluded"]
        else:
            skipped[SEMANTIC_DUPLICATE] = "no records contained a usable prompt"

        if self.anomaly_service is not None:
            anomaly_findings, anomaly_metadata, anomaly_summary = self._anomaly(records)
            findings.extend(anomaly_findings)
            metadata["detectors"].append(ISOLATION_FOREST)
            metadata["isolationForest"] = anomaly_metadata
            summary["recordsAnalyzed"] = anomaly_summary["recordsAnalyzed"]
            summary["recordsExcluded"] = anomaly_summary["recordsExcluded"]
        else:
            skipped[ISOLATION_FOREST] = "the isolation forest detector is not configured"

        if not metadata["detectors"]:
            raise ValueError(
                "records must contain at least one usable prompt or numerical usage feature"
            )
        summary["findings"] = len(findings)
        metadata["skipped"] = skipped
        return findings, metadata, summary
