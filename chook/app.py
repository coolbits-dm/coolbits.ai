#!/usr/bin/env python3
"""Chook – Redis stream forwarder for opipe events."""
from __future__ import annotations

import hashlib
import json
import os
import signal
import socket
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Mapping, Optional, Sequence, Tuple

import redis


LOG_PREFIX = "[chook]"
DEFAULT_INPUT_STREAM = "opipe.ops"
DEFAULT_OUTPUT_STREAM = "opipe.chook"
DEFAULT_AUDIT_STREAM = "opipe.audit"
DEFAULT_GROUP = "chook"
DEFAULT_BLOCK_MS = 5000
DEFAULT_RETRY_DELAY = 5.0
DEFAULT_REPLAY_PENDING = True


@dataclass(frozen=True)
class Settings:
    redis_url: str
    input_stream: str = DEFAULT_INPUT_STREAM
    output_stream: str = DEFAULT_OUTPUT_STREAM
    audit_stream: str = DEFAULT_AUDIT_STREAM
    consumer_group: str = DEFAULT_GROUP
    consumer_name: str = ""
    block_ms: int = DEFAULT_BLOCK_MS
    retry_delay: float = DEFAULT_RETRY_DELAY
    replay_pending: bool = DEFAULT_REPLAY_PENDING


class ChookWorker:
    """Forward messages from ``input_stream`` to downstream audit streams."""

    def __init__(self, client: redis.Redis, settings: Settings) -> None:
        self.client = client
        self.settings = settings
        consumer_name = settings.consumer_name or f"chook-{socket.gethostname()}-{os.getpid()}"
        self.consumer_name = consumer_name
        self._stop = False

    # ------------------------------------------------------------------
    def log(self, message: str) -> None:
        print(f"{LOG_PREFIX} {message}", flush=True)

    def stop(self, *_: object) -> None:
        self.log("shutdown requested")
        self._stop = True

    # ------------------------------------------------------------------
    def ensure_group(self) -> None:
        try:
            self.client.xgroup_create(
                self.settings.input_stream,
                self.settings.consumer_group,
                id="0",
                mkstream=True,
            )
            self.log(
                "created consumer group %s on stream %s"
                % (self.settings.consumer_group, self.settings.input_stream)
            )
        except redis.exceptions.ResponseError as exc:
            if "BUSYGROUP" not in str(exc):
                raise

    def replay_pending(self) -> None:
        if not self.settings.replay_pending:
            return
        while not self._stop:
            response = self.client.xreadgroup(
                self.settings.consumer_group,
                self.consumer_name,
                {self.settings.input_stream: "0"},
                count=64,
                block=0,
            )
            if not response:
                break
            self._handle_batches(response)

    # ------------------------------------------------------------------
    def run(self) -> None:
        self.ensure_group()
        self.replay_pending()
        block = max(1, self.settings.block_ms)
        self.log(
            "listening on %s as consumer %s"
            % (self.settings.input_stream, self.consumer_name)
        )
        while not self._stop:
            try:
                batches = self.client.xreadgroup(
                    self.settings.consumer_group,
                    self.consumer_name,
                    {self.settings.input_stream: ">"},
                    count=64,
                    block=block,
                )
                if not batches:
                    continue
                self._handle_batches(batches)
            except redis.exceptions.ConnectionError as exc:
                self.log(f"redis connection error: {exc}; retrying in {self.settings.retry_delay}s")
                time.sleep(self.settings.retry_delay)
            except redis.exceptions.RedisError as exc:
                self.log(f"redis error: {exc}; retrying in {self.settings.retry_delay}s")
                time.sleep(self.settings.retry_delay)

    # ------------------------------------------------------------------
    def _handle_batches(self, batches: Sequence[Tuple[str, List[Tuple[str, Mapping[str, str]]]]]) -> None:
        for stream_name, messages in batches:
            if stream_name != self.settings.input_stream:
                self.log(f"ignoring unexpected stream {stream_name}")
                continue
            for message_id, payload in messages:
                try:
                    fields = self._normalize_fields(payload)
                    self._forward(message_id, fields)
                except Exception as exc:  # pragma: no cover - defensive guard
                    self.log(f"error forwarding {message_id}: {exc}")
                    # Do not acknowledge – allow retry on next loop.
                else:
                    self.client.xack(
                        self.settings.input_stream,
                        self.settings.consumer_group,
                        message_id,
                    )

    def _normalize_fields(self, payload: Mapping[str, str]) -> Dict[str, str]:
        return {str(key): str(value) for key, value in payload.items()}

    def _forward(self, message_id: str, fields: Mapping[str, str]) -> None:
        now_iso = datetime.now(timezone.utc).isoformat()
        forwarded = dict(fields)
        forwarded.setdefault("source_stream", self.settings.input_stream)
        forwarded["source_id"] = message_id
        forwarded["forwarded_ts"] = now_iso
        self.client.xadd(self.settings.output_stream, forwarded)

        audit_body = {
            "source_stream": self.settings.input_stream,
            "source_id": message_id,
            "hash_algo": "sha256",
            "hash": hashlib.sha256(
                json.dumps(fields, sort_keys=True, separators=(",", ":")).encode("utf-8")
            ).hexdigest(),
            "forwarded_stream": self.settings.output_stream,
            "ts": now_iso,
        }
        agent = fields.get("agent")
        if agent:
            audit_body["agent"] = agent
        self.client.xadd(self.settings.audit_stream, audit_body)

    # ------------------------------------------------------------------
    def close(self) -> None:
        try:
            self.client.close()
        except Exception:  # pragma: no cover - close best effort
            pass


def load_settings() -> Settings:
    redis_url = os.getenv("REDIS_URL")
    if not redis_url:
        print("REDIS_URL must be set", file=sys.stderr)
        raise SystemExit(2)

    def env(key: str, default: Optional[str] = None) -> str:
        value = os.getenv(key)
        return value if value is not None else (default or "")

    block_ms = int(os.getenv("BLOCK_MS", str(DEFAULT_BLOCK_MS)))
    retry_delay = float(os.getenv("RETRY_DELAY", str(DEFAULT_RETRY_DELAY)))
    replay_pending_str = os.getenv("REPLAY_PENDING", str(DEFAULT_REPLAY_PENDING)).lower()
    replay_pending = replay_pending_str in {"1", "true", "yes", "on"}

    return Settings(
        redis_url=redis_url,
        input_stream=os.getenv("INPUT_STREAM", DEFAULT_INPUT_STREAM),
        output_stream=os.getenv("OUTPUT_STREAM", DEFAULT_OUTPUT_STREAM),
        audit_stream=os.getenv("AUDIT_STREAM", DEFAULT_AUDIT_STREAM),
        consumer_group=os.getenv("CONSUMER_GROUP", DEFAULT_GROUP),
        consumer_name=env("CONSUMER_NAME"),
        block_ms=block_ms,
        retry_delay=retry_delay,
        replay_pending=replay_pending,
    )


def create_client(settings: Settings) -> redis.Redis:
    return redis.from_url(settings.redis_url, decode_responses=True)


def main() -> None:
    settings = load_settings()
    client = create_client(settings)
    worker = ChookWorker(client, settings)

    signal.signal(signal.SIGTERM, worker.stop)
    signal.signal(signal.SIGINT, worker.stop)

    try:
        worker.run()
    finally:
        worker.close()


if __name__ == "__main__":
    main()
