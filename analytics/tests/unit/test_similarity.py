import numpy as np
from app.semantic.similarity import cosine_similarity
def test_cosine_ordering():
    matrix=cosine_similarity(np.array([[1.,0.],[.99,.01],[0.,1.]]))
    assert matrix[0,0] == 1 and matrix[0,1] > matrix[0,2]
def test_empty(): assert cosine_similarity(np.empty((0,3))).shape == (0,0)
