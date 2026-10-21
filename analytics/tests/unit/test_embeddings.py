import numpy as np
from app.embeddings.service import EmbeddingService
class FakeModel:
    def encode(self, prompts, **kwargs): return np.array([[len(p),p.count("a")] for p in prompts],dtype=np.float32)
    def get_sentence_embedding_dimension(self): return 2
def test_batch(monkeypatch):
    monkeypatch.setattr("app.embeddings.service.SentenceTransformer",lambda name:FakeModel())
    service=EmbeddingService("fake")
    assert service.encode(["alpha","beta"]).shape == (2,2)
    assert service.get_model_info()["dimension"] == 2
def test_empty_no_model():
    service=EmbeddingService("fake")
    assert service.encode([]).shape == (0,0)
    assert not service.get_model_info()["ready"]
