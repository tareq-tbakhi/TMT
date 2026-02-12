"""
Channel Manager — maintains the list of monitored channels,
handles join/leave with human-like pacing.
"""
import asyncio
import json
import logging
from pathlib import Path

from app.telegram.client import join_channel, leave_channel, get_channel_messages

logger = logging.getLogger(__name__)

SEED_CHANNELS_PATH = Path(__file__).parent.parent.parent / "data" / "seed_channels.json"

# In-memory channel registry
_monitored_channels: dict[str, dict] = {}


def get_seed_channels() -> list[dict]:
    """Load seed channel list from JSON file."""
    if SEED_CHANNELS_PATH.exists():
        with open(SEED_CHANNELS_PATH) as f:
            return json.load(f)
    return [
        {"username": "gazanow", "category": "crisis", "language": "ar"},
        {"username": "PalestineNewsNetwork", "category": "news", "language": "ar"},
        {"username": "QudsNen", "category": "news", "language": "ar"},
        {"username": "medical_aid_palestine", "category": "medical", "language": "en"},
    ]


async def initialize_channels():
    """Join all seed channels on startup."""
    seed = get_seed_channels()
    for channel in seed:
        username = channel["username"]
        success = await join_channel(username)
        if success:
            _monitored_channels[username] = {
                **channel,
                "status": "active",
                "message_count": 0,
            }
        # Human-like pacing between joins
        await asyncio.sleep(10)

    logger.info(f"Initialized {len(_monitored_channels)} channels")


async def add_channel(username: str, category: str = "unknown", language: str = "ar") -> bool:
    """Add a new channel to monitor."""
    if username in _monitored_channels:
        return True
    success = await join_channel(username)
    if success:
        _monitored_channels[username] = {
            "username": username,
            "category": category,
            "language": language,
            "status": "active",
            "message_count": 0,
        }
    return success


async def remove_channel(username: str) -> bool:
    """Stop monitoring a channel."""
    if username not in _monitored_channels:
        return False
    success = await leave_channel(username)
    if success:
        del _monitored_channels[username]
    return success


def get_monitored_channels() -> list[dict]:
    """Get list of all currently monitored channels."""
    return list(_monitored_channels.values())


async def fetch_recent_messages(limit_per_channel: int = 20) -> list[dict]:
    """Fetch recent messages from all monitored channels."""
    all_messages = []
    for username in _monitored_channels:
        messages = await get_channel_messages(username, limit=limit_per_channel)
        all_messages.extend(messages)
        # Pacing between channel reads
        await asyncio.sleep(2)
    return all_messages
