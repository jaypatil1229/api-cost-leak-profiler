import numpy as np
from sklearn.metrics.pairwise import cosine_similarity as sklearn_cosine_similarity


def cosine_similarity(embeddings: np.ndarray) -> np.ndarray:
    values = np.asarray(embeddings)
    if values.ndim != 2:
        raise ValueError("embeddings must be two-dimensional")
    if values.shape[0] == 0:
        return np.empty((0, 0), dtype=float)
    return sklearn_cosine_similarity(values)
