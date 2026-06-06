import asyncio
import contextlib
import shutil
from typing import Any, Dict, Optional

from .api_run_metadata import build_run_index_row
from .api_runtime import RUN_CONTROLS, RUN_TASKS, active_run_task, drop_run_control, ensure_run_control
from .api_storage import (
    RUNS_DIR,
    append_jsonl,
    append_run_event,
    collect_run_snapshot_ids,
    delete_snapshot_ids,
    read_json,
    remove_run_events,
    remove_run_index_entry,
    upsert_run_index,
    write_json,
)
from .api_utils import clean_text, now_iso


def reconcile_run_execution_state(
    run_id: str,
    manifest: Dict[str, Any],
    progress: Dict[str, Any],
    *,
    persist: bool = True,
) -> Dict[str, Any]:
    status = clean_text(progress.get("status") or manifest.get("status"))
    task = active_run_task(run_id)
    task_active = bool(task and not task.done())
    reconciled = False
    reconciled_from = ""
    reason = ""
    if status in {"queued", "running", "paused"} and not task_active:
        reconciled = True
        reconciled_from = status
        reason = f"run had no active worker task while status remained {status}"
        manifest["status"] = "interrupted"
        manifest.setdefault("lifecycle", {})
        manifest["lifecycle"]["buildCompletedAt"] = manifest["lifecycle"].get("buildCompletedAt") or now_iso()
        progress["status"] = "interrupted"
        progress["completedAt"] = progress.get("completedAt") or now_iso()
        progress["resumeBlockedReason"] = reason
        if persist:
            write_run_snapshot(run_id, manifest, progress)
            append_jsonl(
                RUNS_DIR / run_id / "logs.jsonl",
                {
                    "ts": now_iso(),
                    "level": "warning",
                    "stage": "status_reconcile",
                    "message": f"run status reconciled from {status} to interrupted",
                    "reason": reason,
                },
            )
            append_run_event(
                {
                    "ts": now_iso(),
                    "runId": run_id,
                    "stage": "interrupted",
                    "reason": reason,
                    "reconciledFrom": status,
                }
            )
        status = "interrupted"
    return {
        "status": status,
        "taskActive": task_active,
        "resumeAvailable": status == "paused" and task_active,
        "reconciled": reconciled,
        "reconciledFrom": reconciled_from,
        "reason": reason or clean_text(progress.get("resumeBlockedReason")),
    }


async def wait_for_run_resume(run_id: Optional[str]) -> None:
    if not run_id:
        return
    control = RUN_CONTROLS.get(run_id)
    if not control:
        return
    await control["resumeEvent"].wait()
    if control.get("deleteRequested"):
        raise asyncio.CancelledError()


def persist_run_state(run_id: str, manifest: Dict[str, Any], progress: Dict[str, Any]) -> None:
    upsert_run_index(build_run_index_row(run_id, manifest, progress))


async def persist_run_state_async(run_id: str, manifest: Dict[str, Any], progress: Dict[str, Any]) -> None:
    await asyncio.to_thread(persist_run_state, run_id, manifest, progress)


def write_run_snapshot(run_id: str, manifest: Dict[str, Any], progress: Dict[str, Any]) -> None:
    run_dir = RUNS_DIR / run_id
    write_json(run_dir / "manifest.json", manifest)
    write_json(run_dir / "progress.json", progress)
    persist_run_state(run_id, manifest, progress)


def clear_pause_metadata(progress: Dict[str, Any]) -> None:
    progress.pop("pauseCode", None)
    progress.pop("pauseHint", None)
    progress.pop("resumeBlockedReason", None)


def pause_run_execution(
    run_id: str,
    manifest: Dict[str, Any],
    progress: Dict[str, Any],
    *,
    pause_code: str = "",
    reason: str = "",
    pause_hint: str = "",
    log_stage: str = "pause",
    log_message: str = "run paused",
    event_stage: str = "paused",
    extra_log: Optional[Dict[str, Any]] = None,
    extra_event: Optional[Dict[str, Any]] = None,
) -> None:
    manifest["status"] = "paused"
    manifest.setdefault("lifecycle", {})
    manifest["lifecycle"]["lastPausedAt"] = now_iso()
    progress["status"] = "paused"
    if pause_code:
        progress["pauseCode"] = pause_code
    else:
        progress.pop("pauseCode", None)
    if pause_hint:
        progress["pauseHint"] = pause_hint
    else:
        progress.pop("pauseHint", None)
    if reason:
        progress["resumeBlockedReason"] = reason
    else:
        progress.pop("resumeBlockedReason", None)
    write_run_snapshot(run_id, manifest, progress)
    append_jsonl(
        RUNS_DIR / run_id / "logs.jsonl",
        {
            "ts": now_iso(),
            "level": "info",
            "stage": log_stage,
            "message": log_message,
            **(extra_log or {}),
        },
    )
    append_run_event(
        {
            "ts": now_iso(),
            "runId": run_id,
            "stage": event_stage,
            **(extra_event or {}),
        }
    )


async def purge_run_record(run_id: str, preserve_snapshot_ids: Optional[set[str]] = None) -> None:
    run_dir = RUNS_DIR / run_id
    task = RUN_TASKS.get(run_id)
    if run_dir.exists():
        control = ensure_run_control(run_id)
        control["deleteRequested"] = True
        control["resumeEvent"].set()
        if task and not task.done():
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
    RUN_TASKS.pop(run_id, None)
    drop_run_control(run_id)
    delete_snapshot_ids(collect_run_snapshot_ids(run_id), preserve_snapshot_ids=preserve_snapshot_ids)
    shutil.rmtree(run_dir, ignore_errors=True)
    remove_run_index_entry(run_id)
    remove_run_events(run_id)
