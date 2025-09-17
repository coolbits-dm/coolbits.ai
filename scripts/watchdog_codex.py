#!/usr/bin/env python3
"""Redis-backed heartbeat watchdog for Codex agents.

This utility tails a Redis Stream (default: ``opipe.handshake``) and applies the
standard dual-agent heartbeat policy:

* ``@oCodexLocal`` – expected heartbeat every 20 seconds.
* ``@oCodexCloud`` – expected heartbeat every 15 seconds.

If an agent misses two consecutive heartbeats the watchdog emits a ``degraded``
event. Missing five heartbeats promotes the state to ``offline``. When an agent
comes back the watchdog issues a ``ready`` recovery event describing how many
heartbeats were missed.

Events are written to stdout as JSON and, when the ``--output-stream`` flag is
provided (default: ``opipe.watchdog``), also appended to a Redis stream so that
other services can consume the status transitions.
"""
from __future__ import annotations

import argparse
import json
import os
import signal
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Mapping, Optional

try:
    import redis
except ImportError as exc:  # pragma: no cover - redis is required at runtime
    raise SystemExit(
        "redis-py is required. Install with `pip install redis` in the runtime environment."
    ) from exc


DEFAULT_INPUT_STREAM = "opipe.handshake"
DEFAULT_OUTPUT_STREAM = "opipe.watchdog"
DEFAULT_GROUP = "watchdog"
DEFAULT_TICK_INTERVAL = 5.0

DEGRADED_MISSES = 2
OFFLINE_MISSES = 5


@dataclass
class AgentConfig:
    """Configuration for a monitored agent."""

    interval: float
    env: Optional[str] = None
    role: Optional[str] = None


DEFAULT_AGENTS: Mapping[str, AgentConfig] = {
    "@oCodexLocal": AgentConfig(interval=20.0, env="local", role="sandbox"),
    "@oCodexCloud": AgentConfig(interval=15.0, env="cloud", role="infra"),
}


def parse_agent(value: str) -> Mapping[str, AgentConfig]:
    """Parse ``--agent`` CLI flags.

    The syntax is ``<name>:<interval>[:<env>[:<role>]]``.  Example:

    ``--agent @oCodexLocal:20:local:sandbox``
    """

    parts = value.split(":")
    if len(parts) < 2:
        raise argparse.ArgumentTypeError(
            "Agent definition must be NAME:INTERVAL[:ENV[:ROLE]]"
        )

    name = parts[0].strip()
    if not name:
        raise argparse.ArgumentTypeError("Agent name cannot be empty")

    try:
        interval = float(parts[1])
    except ValueError as exc:
        raise argparse.ArgumentTypeError("Interval must be numeric") from exc

    env = None
    if len(parts) >= 3:
        env_value = parts[2].strip()
        env = env_value or None

    role = None
    if len(parts) >= 4:
        role_value = parts[3].strip()
        role = role_value or None

    cfg = AgentConfig(interval=interval, env=env, role=role)
    return {name: cfg}


def merge_agent_configs(overrides: Iterable[Mapping[str, AgentConfig]]) -> Dict[str, AgentConfig]:
    agents: Dict[str, AgentConfig] = {
        name: AgentConfig(interval=cfg.interval, env=cfg.env, role=cfg.role)
        for name, cfg in DEFAULT_AGENTS.items()
    }
    for override in overrides:
        for name, cfg in override.items():
            agents[name] = cfg
    return agents


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Watchdog:
    def __init__(
        self,
        client: "redis.Redis",
        *,
        stream: str,
        group: str,
        consumer: str,
        agents: Mapping[str, AgentConfig],
        output_stream: Optional[str],
        tick_interval: float,
        replay_pending: bool,
    ) -> None:
        self.client = client
        self.stream = stream
        self.group = group
        self.consumer = consumer
        self.agents = agents
        self.output_stream = output_stream
        self.tick_interval = tick_interval
        self.replay_pending = replay_pending

        self.last_seen: Dict[str, Optional[float]] = {name: None for name in agents}
        self.missed: Dict[str, int] = {name: 0 for name in agents}
        self.states: Dict[str, str] = {name: "unknown" for name in agents}
        self._stop = False

    # Redis helpers -----------------------------------------------------
    def ensure_group(self) -> None:
        try:
            self.client.xgroup_create(self.stream, self.group, id="0", mkstream=True)
        except redis.exceptions.ResponseError as exc:
            if "BUSYGROUP" not in str(exc):
                raise

    def read(self, *, block: int) -> List:
        try:
            return self.client.xreadgroup(
                self.group,
                self.consumer,
                {self.stream: ">"},
                count=32,
                block=block,
            )
        except redis.exceptions.ResponseError as exc:
            if "NOGROUP" in str(exc):
                self.ensure_group()
                return []
            raise

    def ack(self, message_id: str) -> None:
        self.client.xack(self.stream, self.group, message_id)

    # State handling ----------------------------------------------------
    def handle_heartbeat(self, agent: str) -> None:
        now = time.time()
        previous_misses = self.missed.get(agent, 0)
        self.last_seen[agent] = now
        self.missed[agent] = 0
        if self.states.get(agent) != "ready":
            note = None
            if previous_misses > 0:
                note = f"recovered_after_{previous_misses}_misses"
            self.emit(agent, "ready", note=note)
        self.states[agent] = "ready"

    def tick(self) -> None:
        now = time.time()
        for agent, cfg in self.agents.items():
            last = self.last_seen.get(agent)
            if last is None:
                continue
            elapsed = now - last
            if elapsed < cfg.interval:
                continue
            expected_misses = int(elapsed // cfg.interval)
            if expected_misses <= self.missed.get(agent, 0):
                continue
            self.missed[agent] = expected_misses

            if expected_misses >= OFFLINE_MISSES:
                if self.states.get(agent) != "offline":
                    self.emit(agent, "offline", reason="missed_5_heartbeats")
                    self.states[agent] = "offline"
                continue

            if expected_misses >= DEGRADED_MISSES and self.states.get(agent) not in {"degraded", "offline"}:
                self.emit(agent, "degraded", reason="missed_2_heartbeats")
                self.states[agent] = "degraded"

    # Output ------------------------------------------------------------
    def emit(self, agent: str, state: str, *, reason: Optional[str] = None, note: Optional[str] = None) -> None:
        cfg = self.agents[agent]
        payload = {
            "agent": agent,
            "ts": iso_now(),
            "state": state,
        }
        if cfg.env:
            payload["env"] = cfg.env
        if cfg.role:
            payload["role"] = cfg.role
        if reason:
            payload["reason"] = reason
        if note:
            payload["note"] = note

        print(json.dumps(payload), flush=True)

        if self.output_stream:
            stream_payload = {k: json.dumps(v) if isinstance(v, (dict, list)) else str(v) for k, v in payload.items()}
            stream_payload.setdefault("event", "watchdog")
            self.client.xadd(self.output_stream, stream_payload)

    # Main loop ---------------------------------------------------------
    def run(self) -> None:
        self.ensure_group()
        if self.replay_pending:
            self.drain_pending()
        next_tick = time.monotonic() + self.tick_interval

        while not self._stop:
            timeout = max(1, int((next_tick - time.monotonic()) * 1000))
            results = self.read(block=timeout)
            if results:
                for _, messages in results:
                    for message_id, fields in messages:
                        agent = fields.get("agent")
                        if agent and agent in self.agents:
                            self.handle_heartbeat(agent)
                        self.ack(message_id)
            now = time.monotonic()
            if now >= next_tick:
                self.tick()
                next_tick = now + self.tick_interval

    def drain_pending(self) -> None:
        try:
            pending = self.client.xpending(self.stream, self.group)
        except redis.exceptions.ResponseError as exc:
            if "NOGROUP" in str(exc):
                self.ensure_group()
                return
            raise

        remaining = pending[0]
        if remaining == 0:
            return

        while remaining > 0:
            batch = self.client.xreadgroup(
                self.group,
                self.consumer,
                {self.stream: "0"},
                count=min(64, remaining),
                block=1,
            )
            if not batch:
                break

            processed = 0
            for _, messages in batch:
                for message_id, fields in messages:
                    agent = fields.get("agent")
                    if agent and agent in self.agents:
                        self.handle_heartbeat(agent)
                    self.ack(message_id)
                    processed += 1

            if processed == 0:
                break
            remaining -= processed

    def stop(self) -> None:
        self._stop = True


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Codex watchdog for Redis Stream heartbeats")
    parser.add_argument("--redis-url", default=os.environ.get("REDIS_URL", "redis://localhost:6379/0"), help="Redis connection URL")
    parser.add_argument("--stream", default=DEFAULT_INPUT_STREAM, help="Input Redis Stream carrying heartbeats")
    parser.add_argument("--output-stream", default=DEFAULT_OUTPUT_STREAM, help="Redis Stream that receives watchdog state changes; set to empty string to disable")
    parser.add_argument("--group", default=DEFAULT_GROUP, help="Redis consumer group name")
    parser.add_argument("--consumer", default=os.environ.get("WATCHDOG_CONSUMER", os.uname().nodename), help="Consumer name used with the Redis group")
    parser.add_argument("--tick-interval", type=float, default=DEFAULT_TICK_INTERVAL, help="Seconds between degradation checks")
    parser.add_argument("--agent", action="append", type=parse_agent, help="Override agent definition: NAME:INTERVAL[:ENV[:ROLE]] (can be used multiple times)")
    parser.add_argument("--replay-pending", action="store_true", help="Process any pending entries in the consumer group before tailing new ones")
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    overrides = args.agent or []
    agents = merge_agent_configs(overrides)

    if not agents:
        parser.error("At least one agent must be configured")

    output_stream = args.output_stream or None

    client = redis.Redis.from_url(args.redis_url, decode_responses=True)

    watchdog = Watchdog(
        client,
        stream=args.stream,
        group=args.group,
        consumer=args.consumer,
        agents=agents,
        output_stream=output_stream,
        tick_interval=args.tick_interval,
        replay_pending=args.replay_pending,
    )

    def handle_signal(signum, frame):  # pragma: no cover - signal handler
        watchdog.stop()

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    try:
        watchdog.run()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":  # pragma: no cover - CLI entrypoint
    sys.exit(main())
