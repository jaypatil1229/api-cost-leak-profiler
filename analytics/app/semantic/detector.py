import hashlib, logging
from itertools import combinations
from time import perf_counter
import numpy as np
from sklearn.neighbors import NearestNeighbors
from app.features.builder import usable_prompts
from app.schemas.findings import Finding
from app.semantic.similarity import cosine_similarity
logger = logging.getLogger(__name__)
class SemanticDuplicateDetector:
    def __init__(self, embedding_service, threshold, max_records):
        self.embedding_service, self.threshold, self.max_records = embedding_service, threshold, max_records
    def detect(self, records):
        if len(records) > self.max_records:
            raise ValueError(f"record count {len(records)} exceeds MAX_SEMANTIC_RECORDS={self.max_records}")
        valid, prompts = usable_prompts(records)
        excluded = len(records)-len(valid)
        logger.info("prompts selected", extra={"record_count":len(records),"valid_prompt_count":len(valid),"excluded_count":excluded})
        if len(valid)<2:
            return [], {"recordsScanned":len(records),"promptsCompared":len(valid),"promptsExcluded":excluded,"embeddingDimension":None}
        started=perf_counter()
        vectors=self.embedding_service.encode(prompts)
        embedding_seconds=perf_counter()-started
        if vectors.ndim!=2 or vectors.shape[0]!=len(valid):
            raise RuntimeError("embedding service returned an unexpected matrix shape")
        started=perf_counter()
        pairs=self._candidate_pairs(vectors, self.threshold)
        similarity_seconds=perf_counter()-started
        findings=[]
        for i,j,score in pairs:
            if score<self.threshold: continue
            ids=sorted((valid[i].request_id,valid[j].request_id))
            digest=hashlib.sha256("|".join(ids).encode()).hexdigest()[:16]
            findings.append(Finding(id=f"semdup_{digest}",type="semantic_duplicate",severity="medium",score=float(score),
                request_ids=ids,evidence={"similarity":float(score),"threshold":self.threshold,"detector":"semantic_duplicate",
                "reason":"Prompt embedding cosine similarity met or exceeded the configured threshold."},
                recommendation="Consider caching or reusing previous results for semantically equivalent requests.",
                metadata={"similarityMetric":"cosine"}))
        info={"recordsScanned":len(records),"promptsCompared":len(valid),"promptsExcluded":excluded,
            "embeddingDimension":int(vectors.shape[1]),"embeddingSeconds":embedding_seconds,
            "similaritySeconds":similarity_seconds,"threshold":self.threshold}
        logger.info("semantic analysis complete",extra={"finding_count":len(findings),**info})
        return findings,info
    @staticmethod
    def _candidate_pairs(vectors, threshold):
        if len(vectors)<=512:
            matrix=cosine_similarity(vectors)
            return [(i,j,float(matrix[i,j])) for i,j in combinations(range(len(vectors)),2)]
        normalized=vectors/np.maximum(np.linalg.norm(vectors,axis=1,keepdims=True),1e-12)
        index=NearestNeighbors(metric="cosine",algorithm="brute",n_jobs=-1).fit(normalized)
        distances,neighbors=index.radius_neighbors(normalized,radius=max(0.0, 1.0-threshold),return_distance=True)
        return [(i,int(j),1-float(d)) for i,(ds,ns) in enumerate(zip(distances,neighbors))
                for d,j in zip(ds,ns) if i<j]
