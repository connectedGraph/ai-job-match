import asyncio
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

from project_paths import TAG_DIR, ensure_runtime_dirs
from tag_sync import get_embedding_cache_status, normalize_existing_job_library_strict

from .job_data_service import ensure_jobs_fresh


NORMALIZATION_DIR = TAG_DIR / "normalization_runs"
RUN_INDEX_FILE = NORMALIZATION_DIR / "runs_index.json"
RUN_TASKS: Dict[str, asyncio.Task] = {}


def now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def ensure_normalization_storage() -> None:
    ensure_runtime_dirs()
    NORMALIZATION_DIR.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def read_json(path: Path, default: Any = None) -> Any:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8-sig"))


def append_jsonl(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


def read_jsonl(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    rows: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8-sig") as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def load_run_index() -> List[Dict[str, Any]]:
    ensure_normalization_storage()
    return read_json(RUN_INDEX_FILE, [])


def save_run_index(rows: List[Dict[str, Any]]) -> None:
    write_json(RUN_INDEX_FILE, rows)


def upsert_run_index(row: Dict[str, Any]) -> None:
    rows = [item for item in load_run_index() if item.get("runId") != row.get("runId")]
    rows.append(row)
    rows.sort(key=lambda item: item.get("createdAt", ""), reverse=True)
    save_run_index(rows)


def run_dir(run_id: str) -> Path:
    return NORMALIZATION_DIR / run_id


def latest_running_task() -> str | None:
    for run_id, task in list(RUN_TASKS.items()):
        if task.done():
            RUN_TASKS.pop(run_id, None)
            continue
        return run_id
    return None


def build_run_index_row(run_id: str) -> Dict[str, Any]:
    manifest = read_json(run_dir(run_id) / "manifest.json", {})
    progress = read_json(run_dir(run_id) / "progress.json", {})
    result = read_json(run_dir(run_id) / "result.json", {})
    return {
        "runId": run_id,
        "status": progress.get("status") or manifest.get("status") or "unknown",
        "createdAt": manifest.get("createdAt"),
        "startedAt": progress.get("startedAt"),
        "completedAt": progress.get("completedAt"),
        "percent": int(progress.get("percent") or 0),
        "stage": progress.get("stage") or "",
        "message": progress.get("message") or "",
        "changed": int((result or {}).get("changed") or 0),
        "normalized": int((result or {}).get("normalized") or 0),
        "embeddingModel": (result or {}).get("embeddingModel") or manifest.get("embeddingModel"),
    }


def get_normalization_run_snapshot(run_id: str) -> Dict[str, Any]:
    base = run_dir(run_id)
    manifest = read_json(base / "manifest.json", {})
    progress = read_json(base / "progress.json", {})
    result = read_json(base / "result.json", {})
    logs = read_jsonl(base / "logs.jsonl")
    return {
        "runId": run_id,
        "manifest": manifest,
        "progress": progress,
        "result": result,
        "logsTail": logs[-120:],
        "cacheStatus": get_embedding_cache_status(),
        "isActive": run_id in RUN_TASKS and not RUN_TASKS[run_id].done(),
    }


def list_normalization_runs() -> Dict[str, Any]:
    rows = []
    for row in load_run_index():
        run_id = row.get("runId")
        if not run_id:
            continue
        rows.append(build_run_index_row(run_id))
    return {
        "activeRunId": latest_running_task(),
        "data": rows,
        "cacheStatus": get_embedding_cache_status(),
    }


async def _persist_progress(run_id: str, progress: Dict[str, Any]) -> None:
    base = run_dir(run_id)
    write_json(base / "progress.json", progress)
    upsert_run_index(build_run_index_row(run_id))


async def _append_log(run_id: str, payload: Dict[str, Any]) -> None:
    append_jsonl(run_dir(run_id) / "logs.jsonl", payload)


async def _execute_normalization_run(run_id: str) -> None:
    base = run_dir(run_id)
    manifest = read_json(base / "manifest.json", {})
    progress = read_json(base / "progress.json", {})

    progress["status"] = "running"
    progress["startedAt"] = progress.get("startedAt") or now_iso()
    write_json(base / "progress.json", progress)
    upsert_run_index(build_run_index_row(run_id))

    async def on_progress(event: Dict[str, Any]) -> None:
        next_progress = {
            **progress,
            "status": "running",
            "percent": int(event.get("percent") or 0),
            "stage": event.get("stage") or "",
            "message": event.get("message") or "",
            "updatedAt": event.get("ts") or now_iso(),
            "cacheStatus": event.get("cacheStatus") or get_embedding_cache_status(),
            "startedAt": progress.get("startedAt") or now_iso(),
            "completedAt": None,
        }
        progress.update(next_progress)
        await _persist_progress(run_id, next_progress)

    async def on_log(event: Dict[str, Any]) -> None:
        await _append_log(run_id, event)

    try:
        result = await normalize_existing_job_library_strict(
            progress_callback=on_progress,
            log_callback=on_log,
            run_cache_dir=base / "cache",
        )
        await ensure_jobs_fresh(embed_missing=False)
        progress.update(
            {
                "status": "completed",
                "percent": 100,
                "stage": "completed",
                "message": "全库归一完成",
                "completedAt": now_iso(),
                "updatedAt": now_iso(),
                "cacheStatus": result.get("cacheStatus") or get_embedding_cache_status(),
            }
        )
        manifest["status"] = "completed"
        manifest["completedAt"] = progress["completedAt"]
        write_json(base / "manifest.json", manifest)
        write_json(base / "result.json", result)
        await _persist_progress(run_id, progress)
        await _append_log(
            run_id,
            {
                "ts": now_iso(),
                "stage": "completed",
                "message": "全库归一完成",
                "payload": {
                    "changed": result.get("changed", 0),
                    "normalized": result.get("normalized", 0),
                },
            },
        )
    except Exception as exc:
        progress.update(
            {
                "status": "failed",
                "stage": "failed",
                "message": str(exc),
                "completedAt": now_iso(),
                "updatedAt": now_iso(),
                "cacheStatus": get_embedding_cache_status(),
            }
        )
        manifest["status"] = "failed"
        manifest["completedAt"] = progress["completedAt"]
        write_json(base / "manifest.json", manifest)
        write_json(
            base / "result.json",
            {
                "ok": False,
                "error": str(exc),
                "cacheStatus": get_embedding_cache_status(),
                "failedAt": now_iso(),
            },
        )
        await _persist_progress(run_id, progress)
        await _append_log(
            run_id,
            {
                "ts": now_iso(),
                "stage": "failed",
                "message": "全库归一失败",
                "payload": {"error": str(exc)},
            },
        )
    finally:
        RUN_TASKS.pop(run_id, None)
        upsert_run_index(build_run_index_row(run_id))


async def start_normalization_run() -> Dict[str, Any]:
    ensure_normalization_storage()
    active_run_id = latest_running_task()
    if active_run_id:
        return get_normalization_run_snapshot(active_run_id)

    run_id = f"norm_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
    base = run_dir(run_id)
    base.mkdir(parents=True, exist_ok=True)

    cache_status = get_embedding_cache_status()
    manifest = {
        "runId": run_id,
        "status": "queued",
        "createdAt": now_iso(),
        "completedAt": None,
        "embeddingProfileId": cache_status.get("profileId"),
        "embeddingProvider": cache_status.get("provider"),
        "embeddingModel": cache_status.get("model"),
        "runCacheDir": str(base / "cache"),
    }
    progress = {
        "status": "queued",
        "percent": 0,
        "stage": "queued",
        "message": "等待启动",
        "createdAt": manifest["createdAt"],
        "startedAt": None,
        "completedAt": None,
        "updatedAt": manifest["createdAt"],
        "cacheStatus": cache_status,
    }
    write_json(base / "manifest.json", manifest)
    write_json(base / "progress.json", progress)
    write_json(base / "result.json", {})
    append_jsonl(
        base / "logs.jsonl",
        {
            "ts": now_iso(),
            "stage": "queued",
            "message": "归一任务已创建",
            "payload": {"cacheStatus": cache_status},
        },
    )
    upsert_run_index(build_run_index_row(run_id))
    RUN_TASKS[run_id] = asyncio.create_task(_execute_normalization_run(run_id))
    return get_normalization_run_snapshot(run_id)
