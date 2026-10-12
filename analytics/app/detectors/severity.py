"""Severity assignment for statistical anomaly findings.

Model detection and severity are deliberately separate concerns. An Isolation
Forest outlier is not automatically a financial incident, and the model score
is not a probability, so this policy is an explicit, documented and replaceable
heuristic rather than a calibrated risk model.

The default policy is conservative:

* severity starts from how extreme the record's anomaly score is within the
  analyzed batch (its percentile rank);
* it is escalated one level, at most to ``high``, only when the record's
  estimated cost is a clear multiple of the batch median cost;
* nothing is ever auto-classified above ``high``; cost attribution and critical
  escalation stay in the backend.

Swap in another policy object with the same ``classify`` signature to change the
rules without touching the detector.
"""

from dataclasses import dataclass

SEVERITY_LEVELS: tuple[str, ...] = ("low", "medium", "high")
DEFAULT_SEVERITY = "low"


def escalate(severity: str) -> str:
    """Raise severity by one level, capped at the highest defined level."""
    index = SEVERITY_LEVELS.index(severity)
    return SEVERITY_LEVELS[min(index + 1, len(SEVERITY_LEVELS) - 1)]


@dataclass(frozen=True)
class SeverityPolicy:
    """Batch-relative severity heuristic; independently configurable."""

    high_percentile: float = 0.98
    medium_percentile: float = 0.90
    cost_escalation_multiple: float = 3.0

    def classify(
        self,
        percentile_rank: float,
        estimated_cost: float | None = None,
        median_cost: float | None = None,
    ) -> tuple[str, list[str]]:
        """Return ``(severity, reasons)`` for one anomalous record."""
        severity = DEFAULT_SEVERITY
        if percentile_rank >= self.high_percentile:
            severity = "high"
            reasons = [
                f"anomaly score sits in the top {_percent(1 - self.high_percentile)} of this batch"
            ]
        elif percentile_rank >= self.medium_percentile:
            severity = "medium"
            reasons = [
                f"anomaly score sits in the top {_percent(1 - self.medium_percentile)} of this batch"
            ]
        else:
            reasons = [
                "anomaly score passed the model decision threshold but is not extreme for this batch"
            ]

        if (
            estimated_cost is not None
            and median_cost is not None
            and median_cost > 0
            and estimated_cost >= self.cost_escalation_multiple * median_cost
        ):
            escalated = escalate(severity)
            reasons.append(
                f"estimated cost was at least {_number(self.cost_escalation_multiple)}x the batch "
                f"median cost (severity raised from {severity} to {escalated})"
            )
            severity = escalated
        return severity, reasons

    def to_metadata(self) -> dict:
        return {
            "policy": "batch_percentile_with_cost_escalation",
            "highPercentile": self.high_percentile,
            "mediumPercentile": self.medium_percentile,
            "costEscalationMultiple": self.cost_escalation_multiple,
            "note": "heuristic severity, not a calibrated probability of financial impact",
        }


def _percent(fraction: float) -> str:
    return f"{fraction * 100:.1f}%"


def _number(value: float) -> str:
    return f"{value:g}"
