"""Celery tasks for embedding generation."""
import asyncio
import logging

from tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@celery_app.task(name="tasks.embedding_tasks.generate_and_store")
def generate_and_store(text: str, metadata: dict = None):
    """Generate embedding for text and store in Qdrant."""
    from app.services.ai_agent.embeddings import generate_embedding, store_embedding

    async def _run():
        embedding = await generate_embedding(text)
        if embedding:
            point_id = await store_embedding(text=text, embedding=embedding, metadata=metadata or {})
            logger.info(f"Stored embedding: {point_id}")
            return point_id
        return None

    return _run_async(_run())


@celery_app.task(name="tasks.embedding_tasks.batch_generate")
def batch_generate(texts: list[dict]):
    """Generate embeddings for a batch of texts."""
    from app.services.ai_agent.embeddings import generate_embedding, store_embedding

    async def _run():
        count = 0
        for item in texts:
            embedding = await generate_embedding(item["text"])
            if embedding:
                await store_embedding(
                    text=item["text"],
                    embedding=embedding,
                    metadata=item.get("metadata", {}),
                )
                count += 1
        logger.info(f"Batch generated {count}/{len(texts)} embeddings")
        return count

    return _run_async(_run())
