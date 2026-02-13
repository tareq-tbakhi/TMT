"""
One-time Telethon authentication script.

Generates the session file that the TMT backend uses to connect to Telegram.
Run this ONCE before starting the application.

Usage (from the backend directory):
    python scripts/telegram_auth.py

Prerequisites:
    1. Go to https://my.telegram.org
    2. Log in with your phone number
    3. Click "API development tools"
    4. Create an application (title: "TMT", short name: "tmt")
    5. Copy the api_id (integer) and api_hash (string)
    6. Create a .env file in the TMT root with:
       TELEGRAM_API_ID=<your_api_id>
       TELEGRAM_API_HASH=<your_api_hash>
       TELEGRAM_PHONE=<your_phone_with_country_code>

The script will:
    1. Connect to Telegram using your credentials
    2. Send a verification code to your Telegram app
    3. Ask you to enter the code
    4. Save the session file to backend/tmt_session.session
"""
import asyncio
import os
import sys

# Add parent directory to path so we can import app modules
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
PROJECT_DIR = os.path.dirname(BACKEND_DIR)
sys.path.insert(0, BACKEND_DIR)

from telethon import TelegramClient


def _load_dotenv():
    """Read .env file and load values into os.environ."""
    for candidate in [
        os.path.join(PROJECT_DIR, ".env"),
        os.path.join(BACKEND_DIR, ".env"),
    ]:
        if os.path.isfile(candidate):
            with open(candidate) as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, _, value = line.partition("=")
                    os.environ.setdefault(key.strip(), value.strip())
            return


async def main():
    # Load .env first so os.getenv and pydantic-settings can find values
    _load_dotenv()

    api_id = os.getenv("TELEGRAM_API_ID")
    api_hash = os.getenv("TELEGRAM_API_HASH", "")
    phone = os.getenv("TELEGRAM_PHONE", "")

    if not api_id or not api_hash or not phone:
        print()
        print("=" * 60)
        print("  TELEGRAM API SETUP INSTRUCTIONS")
        print("=" * 60)
        print()
        print("  1. Go to https://my.telegram.org")
        print("  2. Log in with your phone number")
        print("  3. Click 'API development tools'")
        print("  4. Fill in app title (e.g., 'TMT') and short name")
        print("  5. Copy the api_id and api_hash")
        print("  6. Add to your .env file (in project root):")
        print()
        print("     TELEGRAM_API_ID=<your_api_id>")
        print("     TELEGRAM_API_HASH=<your_api_hash>")
        print("     TELEGRAM_PHONE=<your_phone_with_country_code>")
        print()
        print("=" * 60)
        sys.exit(1)

    session_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "tmt_session",
    )

    print()
    print(f"  Connecting with phone: {phone}")
    print(f"  Session will be saved to: {session_path}.session")
    print()
    print("  A verification code will be sent to your Telegram app.")
    print()

    client = TelegramClient(session_path, int(api_id), api_hash)
    await client.start(phone=phone)

    me = await client.get_me()
    print()
    print("=" * 60)
    print(f"  Authenticated as: {me.first_name} ({me.phone})")
    print(f"  Session file: {session_path}.session")
    print()
    print("  You can now start the TMT backend.")
    print("  The session file will be used automatically.")
    print("=" * 60)
    print()

    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
