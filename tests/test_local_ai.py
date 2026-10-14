"""Local AI (Ollama) - tested against a small pretend Ollama server, plus real ffmpeg."""
import json
import socket
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

from app.analyzer import SCHEMA, AnalysisFailed
from app.config import ConfigError, resolve_ai_provider
from app.db import Database
from app.downloader import Downloaded
from app.local_ai import analyze_with_local_ai, check_ready
from app.media import FFMPEG, MediaError
from app.pipeline import Pipeline
from tests.conftest import FakeYouTube, make_settings

GOOD_ANSWER = {
    "is_asmr": True, "confidence": "high", "triggers": ["slime"], "summary": "Hands squish pink slime.",
    "title": "ASMR Pink Slime Squishing", "description": "Soft slime sounds.", "tags": ["asmr", "slime"],
    "hashtags": ["#slime"],
}


class FakeOllama:
    def __init__(self):
        self.requests: list[dict] = []
        self.models = ["gemma3:4b"]
        self.status = 200
        self.reply: object = GOOD_ANSWER
        fake = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def _send(self, code, body):
                data = json.dumps(body).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def do_GET(self):
                self._send(200, {"models": [{"name": n} for n in fake.models]})

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                fake.requests.append(body)
                if fake.status != 200:
                    self._send(fake.status, fake.reply)
                    return
                content = fake.reply if isinstance(fake.reply, str) else json.dumps(fake.reply)
                self._send(200, {"message": {"role": "assistant", "content": content}, "done": True})

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()


@pytest.fixture
def ollama():
    fake = FakeOllama()
    yield fake
    fake.server.shutdown()


def closed_port_url() -> str:
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return f"http://127.0.0.1:{port}"


@pytest.fixture(scope="module")
def frames(tmp_path_factory):
    folder = tmp_path_factory.mktemp("frames")
    paths = []
    for i, color in enumerate(["red", "green", "blue", "yellow"]):
        p = folder / f"frame_{i:02d}.jpg"
        subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c={color}:s=384x682",
                        "-frames:v", "1", str(p)], check=True, capture_output=True, timeout=60)
        paths.append(p)
    return paths


def video(caption="Pink slime squish #asmr #slime"):
    return Downloaded(path=Path("x.mp4"), caption=caption, uploader="slimer", duration=20,
                      width=1080, height=1920, hashtags=[w for w in caption.split() if w.startswith("#")])


def settings(tmp_path, url, **extra):
    return make_settings(tmp_path, ai_provider="local", ollama_url=url, **extra)


def test_sends_one_grid_picture_and_reads_the_answer(tmp_path, ollama, frames):
    meta = analyze_with_local_ai(frames, video(), settings(tmp_path, ollama.url))
    req = ollama.requests[0]
    assert req["model"] == "gemma3:4b"
    assert list(req["format"]["properties"])[:2] == ["seen", "is_asmr"]  # describe first, then decide
    assert set(SCHEMA["properties"]) < set(req["format"]["properties"])
    assert req["stream"] is False
    user = req["messages"][1]
    assert len(user["images"]) == 1  # 4 frames combined into one picture
    assert "2x2 grid" in user["content"] and "Pink slime squish" in user["content"]
    assert meta.title == "ASMR Pink Slime Squishing"
    assert meta.is_asmr is True and meta.triggers == ["slime"]


def test_caption_saying_asmr_overrules_a_doubtful_small_model(tmp_path, ollama, frames):
    ollama.reply = {**GOOD_ANSWER, "is_asmr": False, "title": "", "triggers": []}
    meta = analyze_with_local_ai(frames, video(), settings(tmp_path, ollama.url))
    assert meta.is_asmr is True and meta.confidence == "medium"
    assert meta.title  # filled in from free mode
    assert meta.triggers == ["slime"]


@pytest.mark.parametrize("status, error, expected", [
    (404, "model 'gemma3:4b' not found", "isn't downloaded"),
    (500, "model requires more system memory (5.1 GiB) than is available", "ran out of memory"),
    (500, "something odd", "Local AI error: something odd"),
])
def test_ollama_errors_are_explained(tmp_path, ollama, frames, status, error, expected):
    ollama.status, ollama.reply = status, {"error": error}
    with pytest.raises(AnalysisFailed, match=expected):
        analyze_with_local_ai(frames, video(), settings(tmp_path, ollama.url))


def test_unreadable_answer(tmp_path, ollama, frames):
    ollama.reply = "this is not json"
    with pytest.raises(AnalysisFailed, match="could not be read"):
        analyze_with_local_ai(frames, video(), settings(tmp_path, ollama.url))


def test_ollama_not_running(tmp_path, frames):
    with pytest.raises(AnalysisFailed, match="isn't running"):
        analyze_with_local_ai(frames, video(), settings(tmp_path, closed_port_url()))


def test_check_ready(tmp_path, ollama):
    assert check_ready(settings(tmp_path, ollama.url))[0] is True
    ready, message = check_ready(settings(tmp_path, ollama.url, local_ai_model="qwen3-vl:2b"))
    assert ready is False and "isn't downloaded" in message
    ready, message = check_ready(settings(tmp_path, closed_port_url()))
    assert ready is False and "isn't running" in message


def test_model_name_without_tag_means_latest(tmp_path, ollama):
    ollama.models = ["gemma3:latest"]
    assert check_ready(settings(tmp_path, ollama.url, local_ai_model="gemma3"))[0] is True


def test_pipeline_uses_local_ai_with_small_frames(tmp_path):
    s = settings(tmp_path, "http://127.0.0.1:1")
    pipeline = Pipeline(s, Database(s.db_path), FakeYouTube())
    assert pipeline._analyze is analyze_with_local_ai

    seen = {}

    def frames_spy(video, out_dir, duration, count=6, width=768):
        seen.update(count=count, width=width)
        raise MediaError("stop here")

    pipeline._frames = frames_spy
    pipeline._describe(1, video())
    assert seen == {"count": 4, "width": 384}


@pytest.mark.parametrize("raw, has_key, expected", [
    ("", False, "free"), ("", True, "claude"), ("local", True, "local"), (" LOCAL ", False, "local"),
    ("free", True, "free"),
])
def test_ai_provider_setting(raw, has_key, expected):
    assert resolve_ai_provider(raw, has_key) == expected


@pytest.mark.parametrize("raw, has_key", [("gpt", False), ("claude", False)])
def test_bad_ai_provider_setting(raw, has_key):
    with pytest.raises(ConfigError):
        resolve_ai_provider(raw, has_key)
