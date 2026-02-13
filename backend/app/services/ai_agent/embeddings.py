"""
Embedding generation and storage in Qdrant vector database.
"""
import logging
import uuid
from typing import Optional

from qdrant_client.models import PointStruct, Filter, FieldCondition, MatchValue

from app.db.qdrant import get_qdrant, COLLECTION_NAME, VECTOR_SIZE

logger = logging.getLogger(__name__)

# Lazy-load sentence-transformers model
_model = None


def _get_model():
    global _model
    if _model is None:
        try:
            from sentence_transformers import SentenceTransformer
            _model = SentenceTransformer("all-MiniLM-L6-v2")
            logger.info("Sentence transformer model loaded")
        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
            return None
    return _model


async def generate_embedding(text: str) -> Optional[list[float]]:
    """Generate a vector embedding for the given text."""
    model = _get_model()
    if model is None:
        # Return zero vector as fallback
        return [0.0] * VECTOR_SIZE
    try:
        embedding = model.encode(text).tolist()
        return embedding
    except Exception as e:
        logger.error(f"Embedding generation failed: {e}")
        return None


async def store_embedding(
    text: str,
    embedding: list[float],
    metadata: dict = None,
) -> str:
    """Store an embedding in Qdrant with metadata."""
    from app.db.qdrant import init_qdrant
    init_qdrant()  # ensure collection exists (idempotent)
    qdrant = get_qdrant()
    point_id = str(uuid.uuid4())

    payload = {
        "text": text,
        **(metadata or {}),
    }

    try:
        qdrant.upsert(
            collection_name=COLLECTION_NAME,
            points=[
                PointStruct(
                    id=point_id,
                    vector=embedding,
                    payload=payload,
                )
            ],
        )
        return point_id
    except Exception as e:
        logger.error(f"Failed to store embedding: {e}")
        return ""


async def search_similar(
    query_text: str,
    limit: int = 10,
    source_filter: str = None,
) -> list[dict]:
    """Search Qdrant for similar content."""
    embedding = await generate_embedding(query_text)
    if not embedding:
        return []

    qdrant = get_qdrant()
    query_filter = None
    if source_filter:
        query_filter = Filter(
            must=[FieldCondition(key="source", match=MatchValue(value=source_filter))]
        )

    try:
        results = qdrant.search(
            collection_name=COLLECTION_NAME,
            query_vector=embedding,
            limit=limit,
            query_filter=query_filter,
        )
        return [
            {
                "id": str(r.id),
                "score": r.score,
                "text": r.payload.get("text", ""),
                "metadata": {k: v for k, v in r.payload.items() if k != "text"},
            }
            for r in results
        ]
    except Exception as e:
        logger.error(f"Qdrant search failed: {e}")
        return []


async def get_knowledge_topics() -> list[str]:
    """Get a list of topics currently in the knowledge base."""
    qdrant = get_qdrant()
    try:
        # Scroll through a sample of points to extract topics
        results = qdrant.scroll(
            collection_name=COLLECTION_NAME,
            limit=100,
            with_payload=True,
        )
        topics = set()
        for point in results[0]:
            if point.payload.get("event_type"):
                topics.add(point.payload["event_type"])
            if point.payload.get("source"):
                topics.add(f"source:{point.payload['source']}")
        return list(topics)
    except Exception as e:
        logger.error(f"Failed to get topics: {e}")
        return []
