import numpy as np
from fastapi.testclient import TestClient
from app.config.settings import Settings
from app.embeddings.service import EmbeddingService
from app.main import create_app
class FakeModel:
    def encode(self,prompts,**kwargs): return np.array([[1.,0.] if "machine" in p.lower() else [.99,.01] for p in prompts])
    def get_sentence_embedding_dimension(self): return 2
class FakeService(EmbeddingService):
    def load_model(self): self._model=FakeModel()
def test_analyze_auth_health():
    client=TestClient(create_app(Settings(analytics_service_key="secret",semantic_similarity_threshold=.9),embedding_service=FakeService("fake")))
    payload={"projectId":"p1","analysisType":"semantic_duplicates","records":[{"requestId":"r1","prompt":"Explain machine learning"},{"requestId":"r2","prompt":"Describe machine learning"}]}
    assert client.post("/api/v1/analyze",json=payload).status_code == 401
    response=client.post("/api/v1/analyze",json=payload,headers={"X-Internal-Service-Key":"secret"})
    assert response.status_code == 200
    body=response.json()
    assert body["findings"][0]["requestIds"] == ["r1","r2"]
    assert body["findings"][0]["evidence"]["threshold"] == .9
    assert client.get("/health").json()["embeddingModel"]["ready"]
def test_bad_numeric_input():
    client=TestClient(create_app(Settings(),embedding_service=FakeService("fake")))
    result=client.post("/api/v1/analyze",json={"projectId":"p","analysisType":"semantic_duplicates","records":[{"requestId":"r","inputTokens":-3}]})
    assert result.status_code == 422


def usage_records(count):
    return [{"requestId":f"req_{index}","inputTokens":500+index,"outputTokens":200,
             "estimatedCost":0.003,"latencyMs":400,"retryCount":0} for index in range(count)]


def anomaly_client():
    settings=Settings(iforest_contamination=0.02,iforest_random_state=7)
    return TestClient(create_app(settings,embedding_service=FakeService("fake")))


def test_isolation_forest_returns_usage_anomaly_findings():
    records=usage_records(25)
    records.append({"requestId":"req_spike","inputTokens":9000,"outputTokens":2000,
                    "estimatedCost":0.15,"latencyMs":4000,"retryCount":3})
    records.append({"requestId":"req_no_features","feature":"assistant"})
    response=anomaly_client().post("/api/v1/analyze",json={"projectId":"p1","analysisType":"isolation_forest","records":records})
    assert response.status_code == 200
    body=response.json()
    assert body["analysisType"] == "isolation_forest"
    assert body["summary"] == {"recordsScanned":27,"findings":1,"recordsAnalyzed":26,"recordsExcluded":1}
    spike=next(finding for finding in body["findings"] if finding["requestIds"] == ["req_spike"])
    assert spike["type"] == "usage_anomaly"
    assert spike["severity"] == "high"
    assert spike["evidence"]["inputTokens"] == 9000
    assert spike["evidence"]["detector"] == "isolation_forest"
    assert spike["evidence"]["medianComparisons"]["totalTokensVsBatchMedian"] > 5
    assert spike["metadata"]["modelConfig"]["randomState"] == 7
    assert body["metadata"]["status"] == "ok"
    assert body["metadata"]["featureNames"] == ["input_tokens","output_tokens","total_tokens","estimated_cost","latency_ms","retry_count"]


def test_isolation_forest_reports_insufficient_data_instead_of_anomalies():
    records=[{"requestId":"a","inputTokens":10},{"requestId":"b","inputTokens":12}]
    response=anomaly_client().post("/api/v1/analyze",json={"projectId":"p1","analysisType":"isolation_forest","records":records})
    assert response.status_code == 200
    body=response.json()
    assert body["findings"] == []
    assert body["metadata"]["insufficientData"] is True
    assert body["metadata"]["status"] == "insufficient_data"
    assert body["summary"]["recordsAnalyzed"] == 2


def test_analysis_type_all_dispatches_to_both_detectors():
    records=usage_records(20)
    records[0]["prompt"]="Explain machine learning in simple terms"
    records[1]["prompt"]="Can you explain machine learning simply?"
    records.append({"requestId":"req_spike","prompt":"Explain machine learning again",
                    "inputTokens":9000,"outputTokens":2000,"estimatedCost":0.15,"latencyMs":4000,"retryCount":3})
    response=anomaly_client().post("/api/v1/analyze",json={"projectId":"p1","analysisType":"all","records":records})
    assert response.status_code == 200
    body=response.json()
    assert body["metadata"]["detectors"] == ["semantic_duplicate","isolation_forest"]
    assert body["metadata"]["skipped"] == {}
    types={finding["type"] for finding in body["findings"]}
    assert types == {"semantic_duplicate","usage_anomaly"}
    assert body["summary"]["findings"] == len(body["findings"])
    assert body["summary"]["recordsAnalyzed"] == 21
    assert body["metadata"]["isolationForest"]["status"] == "ok"


def test_analysis_type_all_without_prompts_skips_the_semantic_detector():
    response=anomaly_client().post("/api/v1/analyze",json={"projectId":"p1","analysisType":"all","records":usage_records(12)})
    assert response.status_code == 200
    body=response.json()
    assert body["metadata"]["detectors"] == ["isolation_forest"]
    assert "semantic_duplicate" in body["metadata"]["skipped"]


def test_health_reports_the_anomaly_detector():
    client=anomaly_client()
    health=client.get("/health").json()
    assert health["anomalyDetector"] == {"ready":True,"name":"isolation_forest","version":"1.0.0","status":"ok"}
