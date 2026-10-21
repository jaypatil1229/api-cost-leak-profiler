import json
from itertools import combinations
from pathlib import Path
from app.config.settings import get_settings
from app.embeddings.service import EmbeddingService
from app.semantic.normalizer import normalize_prompt
from app.semantic.similarity import cosine_similarity

def main():
    fixture=Path(__file__).parent/"tests"/"fixtures"/"semantic_prompts.json"
    data=json.loads(fixture.read_text(encoding="utf-8"))
    service=EmbeddingService(get_settings().embedding_model_name)
    vectors=service.encode([normalize_prompt(row["text"]) for row in data])
    scores=cosine_similarity(vectors)
    pairs=list(combinations(range(len(data)),2))
    labels=[data[i]["group"]==data[j]["group"] for i,j in pairs]
    print("threshold,tp,fp,fn,precision,recall")
    for threshold in (.70,.75,.80,.85,.90,.95):
        tp=sum(bool(scores[i,j]>=threshold) and label for (i,j),label in zip(pairs,labels))
        fp=sum(bool(scores[i,j]>=threshold) and not label for (i,j),label in zip(pairs,labels))
        fn=sum(bool(scores[i,j]<threshold) and label for (i,j),label in zip(pairs,labels))
        precision=tp/(tp+fp) if tp+fp else 0
        recall=tp/(tp+fn) if tp+fn else 0
        print(f"{threshold:.2f},{tp},{fp},{fn},{precision:.3f},{recall:.3f}")
if __name__=="__main__": main()
