from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams

from app.config import get_settings

settings = get_settings()

qdrant_client = QdrantClient(url=settings.QDRANT_URL)

COLLECTION_NAME = settings.QDRANT_COLLECTION
VECTOR_SIZE = 384  # sentence-transformers/all-MiniLM-L6-v2


def init_qdrant():
    collections = [c.name for c in qdrant_client.get_collections().collections]
    if COLLECTION_NAME not in collections:
        qdrant_client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
        )


def get_qdrant():
    return qdrant_client
