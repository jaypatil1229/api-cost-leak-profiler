import numpy as np
import pytest
from app.schemas.usage import UsageRecord
from app.semantic.detector import SemanticDuplicateDetector
class FakeEmbeddings:
    def encode(self,prompts): return np.array([[1.,0.],[.99,.01],[0.,1.]])[:len(prompts)]
def rows(): return [UsageRecord(requestId="r1",prompt="similar one"),UsageRecord(requestId="r2",prompt="similar two"),UsageRecord(requestId="r3",prompt="different")]
def test_finding_and_missing_prompt():
    findings,meta=SemanticDuplicateDetector(FakeEmbeddings(),.9,10).detect(rows()+[UsageRecord(requestId="r4",prompt=" ")])
    assert ["r1","r2"] in [x.request_ids for x in findings]
    assert findings[0].evidence["threshold"] == .9 and meta["promptsExcluded"] == 1
def test_threshold_empty():
    assert SemanticDuplicateDetector(FakeEmbeddings(),.99999,10).detect(rows())[0] == []
    findings,meta=SemanticDuplicateDetector(FakeEmbeddings(),.8,10).detect([])
    assert not findings and meta["promptsCompared"] == 0
def test_limit():
    with pytest.raises(ValueError,match="exceeds"): SemanticDuplicateDetector(FakeEmbeddings(),.8,2).detect(rows())
