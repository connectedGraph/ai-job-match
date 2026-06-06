import asyncio
import json
import shutil
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

from project_paths import (
    BUILDER_DB_DIR,
    BUILDER_RUNS_DIR,
    BUILDER_SNAPSHOTS_DIR,
    BUILDER_UPLOADS_DIR,
    TAG_DIR,
    ensure_runtime_dirs,
    materialize_job_library_file,
)

from .api_runtime import active_apply_task
from .api_utils import clean_text, now_iso, parse_iso_datetime, run_timeline_timestamp, sanitize_value


UPLOADS_DIR = BUILDER_UPLOADS_DIR
RUNS_DIR = BUILDER_RUNS_DIR
DB_DIR = BUILDER_DB_DIR
SNAPSHOTS_DIR = BUILDER_SNAPSHOTS_DIR
RUN_INDEX_FILE = DB_DIR / "runs_index.json"
RUN_EVENTS_FILE = DB_DIR / "run_events.jsonl"


def ensure_storage() -> None:
    ensure_runtime_dirs()


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8-sig"))


def append_jsonl(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def read_jsonl(path: Path) -> List[Any]:
    if not path.exists():
        return []
    rows: List[Any] = []
    with path.open("r", encoding="utf-8-sig") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def read_jsonl_head(path: Path, limit: int) -> List[Any]:
    if limit <= 0 or not path.exists():
        return []
    rows: List[Any] = []
    with path.open("r", encoding="utf-8-sig") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
            if len(rows) >= limit:
                break
    return rows


def read_jsonl_tail(path: Path, limit: int) -> List[Any]:
    if limit <= 0 or not path.exists():
        return []
    chunk_size = 8192
    with path.open("rb") as handle:
        handle.seek(0, 2)
        position = handle.tell()
        buffer = b""
        newline_target = limit + 1
        while position > 0 and buffer.count(b"\n") < newline_target:
            read_size = min(chunk_size, position)
            position -= read_size
            handle.seek(position)
            buffer = handle.read(read_size) + buffer
    rows: List[Any] = []
    for raw_line in buffer.splitlines()[-limit:]:
        line = raw_line.decode("utf-8-sig").strip()
        if line:
            rows.append(json.loads(line))
    return rows


def write_jsonl(path: Path, rows: List[Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


async def write_json_async(path: Path, payload: Any) -> None:
    await asyncio.to_thread(write_json, path, payload)


async def append_jsonl_async(path: Path, payload: Any) -> None:
    await asyncio.to_thread(append_jsonl, path, payload)


async def read_jsonl_async(path: Path) -> List[Any]:
    return await asyncio.to_thread(read_jsonl, path)


def apply_progress_file(run_id: str) -> Path:
    return RUNS_DIR / run_id / "apply_progress.json"


def build_apply_progress(
    run_id: str,
    *,
    status: str,
    normalize_with_existing: bool,
    source: str,
    percent: int = 0,
    stage: str = "",
    message: str = "",
    started_at: Optional[str] = None,
    completed_at: Optional[str] = None,
    error: str = "",
    summary: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    return {
        "runId": run_id,
        "status": status,
        "source": source,
        "normalizeWithExistingTags": normalize_with_existing,
        "percent": max(0, min(100, int(percent))),
        "stage": stage,
        "message": message,
        "startedAt": started_at or now_iso(),
        "completedAt": completed_at,
        "updatedAt": now_iso(),
        "error": error,
        "summary": sanitize_value(summary or {}),
    }


async def load_apply_progress(run_id: str) -> Dict[str, Any]:
    progress = read_json(apply_progress_file(run_id), {})
    if not isinstance(progress, dict):
        progress = {}
    status = clean_text(progress.get("status"))
    task = active_apply_task(run_id)
    if status == "running" and not task:
        progress["status"] = "interrupted"
        progress["message"] = clean_text(progress.get("message")) or "apply 任务已中断"
        progress["completedAt"] = progress.get("completedAt") or now_iso()
        progress["updatedAt"] = now_iso()
        await write_json_async(apply_progress_file(run_id), progress)
    return progress


def load_apply_progress_sync(run_id: str) -> Dict[str, Any]:
    progress = read_json(apply_progress_file(run_id), {})
    if not isinstance(progress, dict):
        progress = {}
    status = clean_text(progress.get("status"))
    task = active_apply_task(run_id)
    if status == "running" and not task:
        progress["status"] = "interrupted"
        progress["message"] = clean_text(progress.get("message")) or "apply 任务已中断"
        progress["completedAt"] = progress.get("completedAt") or now_iso()
        progress["updatedAt"] = now_iso()
        write_json(apply_progress_file(run_id), progress)
    return progress


def load_run_index() -> List[Dict[str, Any]]:
    return read_json(RUN_INDEX_FILE, [])


def save_run_index(rows: List[Dict[str, Any]]) -> None:
    write_json(RUN_INDEX_FILE, rows)


def upsert_run_index(row: Dict[str, Any]) -> None:
    rows = load_run_index()
    next_rows = [item for item in rows if item.get("runId") != row.get("runId")]
    next_rows.append(row)
    next_rows.sort(key=lambda item: item.get("createdAt", ""), reverse=True)
    save_run_index(next_rows)


def append_run_event(payload: Dict[str, Any]) -> None:
    append_jsonl(RUN_EVENTS_FILE, payload)


def append_embedding_log(
    run_dir: Path,
    *,
    stage: str,
    status: str,
    message: str,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    payload = {
        "ts": now_iso(),
        "stage": stage,
        "status": status,
        "message": message,
    }
    if isinstance(details, dict) and details:
        payload["details"] = sanitize_value(details)
    append_jsonl(run_dir / "embedding_logs.jsonl", payload)


def remove_run_index_entry(run_id: str) -> None:
    save_run_index([row for row in load_run_index() if clean_text(row.get("runId")) != run_id])


def remove_run_events(run_id: str) -> None:
    rows = [row for row in read_jsonl(RUN_EVENTS_FILE) if clean_text(row.get("runId")) != run_id]
    write_jsonl(RUN_EVENTS_FILE, rows)


def collect_run_snapshot_ids(run_id: str) -> List[str]:
    run_dir = RUNS_DIR / run_id
    manifest = read_json(run_dir / "manifest.json", {})
    apply_history = read_jsonl(run_dir / "apply_history.jsonl")
    snapshot_ids = []
    for row in [manifest.get("latestApply"), *apply_history]:
        if not isinstance(row, dict):
            continue
        snapshot = row.get("snapshot") or {}
        snapshot_id = clean_text(snapshot.get("snapshotId")) or clean_text(row.get("snapshotId"))
        if snapshot_id and snapshot_id not in snapshot_ids:
            snapshot_ids.append(snapshot_id)
    return snapshot_ids


def delete_snapshot_ids(snapshot_ids: List[str], preserve_snapshot_ids: Optional[set[str]] = None) -> None:
    preserve_snapshot_ids = preserve_snapshot_ids or set()
    for snapshot_id in snapshot_ids:
        if snapshot_id in preserve_snapshot_ids:
            continue
        shutil.rmtree(SNAPSHOTS_DIR / snapshot_id, ignore_errors=True)


def create_apply_snapshot(run_id: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    snapshot_created_at = now_iso()
    snapshot_id = f"snap_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
    snapshot_dir = SNAPSHOTS_DIR / snapshot_id
    snapshot_dir.mkdir(parents=True, exist_ok=True)

    job_library_file = materialize_job_library_file()
    job_snapshot_file = snapshot_dir / "career.json"
    if job_library_file.exists():
        shutil.copyfile(job_library_file, job_snapshot_file)
    else:
        write_json(job_snapshot_file, [])

    tag_snapshot_dir = snapshot_dir / "tag_center"
    if TAG_DIR.exists():
        shutil.copytree(TAG_DIR, tag_snapshot_dir, dirs_exist_ok=True)
    else:
        tag_snapshot_dir.mkdir(parents=True, exist_ok=True)

    metadata = {
        "snapshotId": snapshot_id,
        "runId": run_id,
        "snapshotCreatedAt": snapshot_created_at,
        "jobLibraryCountBefore": int((context or {}).get("jobLibraryCountBefore") or 0),
        "incomingPortraitCount": len((context or {}).get("portraits") or []),
    }
    write_json(snapshot_dir / "snapshot.json", metadata)
    return metadata


def restore_apply_snapshot(snapshot_id: str) -> Dict[str, Any]:
    snapshot_id = clean_text(snapshot_id)
    if not snapshot_id:
        raise HTTPException(status_code=400, detail="缺少可恢复的快照")
    snapshot_dir = SNAPSHOTS_DIR / snapshot_id
    metadata = read_json(snapshot_dir / "snapshot.json", {})
    if not metadata:
        raise HTTPException(status_code=404, detail="对应的系统快照不存在")

    job_library_file = materialize_job_library_file()
    job_snapshot_file = snapshot_dir / "career.json"
    if job_snapshot_file.exists():
        shutil.copyfile(job_snapshot_file, job_library_file)
    else:
        write_json(job_library_file, [])

    shutil.rmtree(TAG_DIR, ignore_errors=True)
    TAG_DIR.mkdir(parents=True, exist_ok=True)
    tag_snapshot_dir = snapshot_dir / "tag_center"
    if tag_snapshot_dir.exists():
        shutil.copytree(tag_snapshot_dir, TAG_DIR, dirs_exist_ok=True)
    return metadata


def collect_affected_run_ids(cutoff_at: str) -> List[str]:
    cutoff_dt = parse_iso_datetime(cutoff_at)
    if cutoff_dt is None:
        return []
    affected: List[Tuple[datetime, str]] = []
    for run_dir in RUNS_DIR.iterdir():
        if not run_dir.is_dir():
            continue
        manifest = read_json(run_dir / "manifest.json", {})
        progress = read_json(run_dir / "progress.json", {})
        timeline_dt = parse_iso_datetime(run_timeline_timestamp(manifest, progress))
        if timeline_dt and timeline_dt >= cutoff_dt:
            affected.append((timeline_dt, run_dir.name))
    affected.sort(reverse=True)
    return [run_id for _, run_id in affected]
