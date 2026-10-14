"""Start the app:  python -m app   (start.bat does this for you)."""
from __future__ import annotations

import argparse
import logging
import sys
import threading
import webbrowser
from pathlib import Path

import uvicorn

from .config import ConfigError, load_settings
from .main import create_app


def main() -> int:
    parser = argparse.ArgumentParser(description="Instagram to YouTube ASMR uploader")
    parser.add_argument("--env-file", type=Path, help="settings file to use instead of .env")
    parser.add_argument("--no-browser", action="store_true", help="don't open the browser")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(message)s", datefmt="%H:%M:%S")
    try:
        settings = load_settings(args.env_file)
    except ConfigError as exc:
        print(f"\n  SETUP PROBLEM: {exc}\n")
        return 1

    app = create_app(settings)
    url = settings.public_base_url
    print(f"\n  Insta to YouTube is running. Open {url} in your browser.")
    print("  Keep this window open. Close it to stop the app.\n")
    if not args.no_browser:
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()
    uvicorn.run(app, host=settings.host, port=settings.port, log_level="warning")
    return 0


if __name__ == "__main__":
    sys.exit(main())
