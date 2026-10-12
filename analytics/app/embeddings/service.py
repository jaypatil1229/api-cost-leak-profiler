from threading import Lock

import numpy as np
from sentence_transformers import SentenceTransformer


class EmbeddingService:
    """Thread-safe, lazy model wrapper reused across API requests."""

    def __init__(self, model_name: str):
        self.model_name = model_name
        self._model: SentenceTransformer | None = None
        self._lock = Lock()

    def load_model(self) -> None:
        if self._model is None:
            with self._lock:
                if self._model is None:
                    self._model = SentenceTransformer(self.model_name)

    def encode(self, prompts: list[str]) -> np.ndarray:
        if not prompts:
            info = self.get_model_info()
            return np.empty((0, info["dimension"] or 0), dtype=np.float32)
        self.load_model()
        assert self._model is not None
        return np.asarray(self._model.encode(prompts, convert_to_numpy=True, show_progress_bar=False))

    def get_model_info(self) -> dict:
        ready = self._model is not None
        return {"ready": ready, "name": self.model_name,
                "dimension": self._model.get_sentence_embedding_dimension() if ready else None}
