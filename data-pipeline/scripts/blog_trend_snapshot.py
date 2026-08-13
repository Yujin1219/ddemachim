"""Append-only JSONL snapshots for daily blog trend runs."""
from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence

from blog_trend_metrics import normalize_blog_link


SNAPSHOT_SCHEMA_VERSION = 1


def default_collected_at() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _collected_at(value: Any) -> str:
    if value is None or value == "":
        return default_collected_at()
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    if isinstance(value, date):
        return f"{value.isoformat()}T00:00:00Z"
    return str(value).strip()


def snapshot_identity(record: Mapping[str, Any], *, collected_at: Any = None) -> tuple[str, str, str] | None:
    timestamp = _collected_at(record.get("collected_at", collected_at))
    query = str(record.get("query", "") or "").strip()
    link = normalize_blog_link(record.get("link"))
    if not timestamp or not query or link is None:
        return None
    return timestamp, query, link


@dataclass(frozen=True)
class SnapshotAppendResult:
    appended: int
    skipped_existing: int
    skipped_invalid: int


class JsonlSnapshotStore:
    """Read existing keys and append only unseen records.

    Existing lines are never rewritten.  Malformed historical lines are
    ignored during key discovery so a damaged old record cannot cause data
    loss or prevent a new daily snapshot from being appended.
    """

    def __init__(self, path: Path, *, schema_version: int = SNAPSHOT_SCHEMA_VERSION) -> None:
        self.path = Path(path)
        self.schema_version = int(schema_version)

    def _existing_keys(self) -> set[tuple[str, str, str]]:
        keys: set[tuple[str, str, str]] = set()
        if not self.path.exists():
            return keys
        with self.path.open("r", encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(record, Mapping):
                    identity = snapshot_identity(record)
                    if identity is not None:
                        keys.add(identity)
        return keys

    def read_records(self) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []
        if not self.path.exists():
            return records
        with self.path.open("r", encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(record, dict):
                    records.append(record)
        return records

    def append(
        self,
        records: Iterable[Mapping[str, Any]],
        *,
        collected_at: Any = None,
    ) -> SnapshotAppendResult:
        effective_collected_at = _collected_at(collected_at)
        existing = self._existing_keys()
        batch: set[tuple[str, str, str]] = set()
        to_write: list[dict[str, Any]] = []
        skipped_existing = 0
        skipped_invalid = 0
        for raw in records:
            if not isinstance(raw, Mapping):
                skipped_invalid += 1
                continue
            record = dict(raw)
            record.setdefault("collected_at", effective_collected_at)
            record["schema_version"] = self.schema_version
            identity = snapshot_identity(record, collected_at=effective_collected_at)
            if identity is None:
                skipped_invalid += 1
                continue
            if identity in existing or identity in batch:
                skipped_existing += 1
                continue
            batch.add(identity)
            record["collected_at"], record["query"], record["link"] = identity
            to_write.append(record)

        if to_write:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.open("a", encoding="utf-8") as handle:
                for record in to_write:
                    handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")
        return SnapshotAppendResult(len(to_write), skipped_existing, skipped_invalid)


def snapshot_schema_document() -> dict[str, Any]:
    return {
        "schema_version": SNAPSHOT_SCHEMA_VERSION,
        "format": "jsonl",
        "append_only": True,
        "idempotency_key": ["collected_at", "query", "link"],
        "credential_policy": "API credentials are never stored in snapshot records.",
    }
