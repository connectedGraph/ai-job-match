import asyncio
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

from .api_apply_service import execute_apply_import as _execute_apply_import
from .api_models import BuilderConfig, RunOptions
from .api_run_metadata import (
    build_assignment_plan,
    build_progress,
    build_progress_from_rows,
    build_run_manifest,
    ensure_progress_failover_fields,
    latest_apply_snapshot_info,
    resolve_stage_config_sets,
    serialize_configs,
)
from .api_run_state import persist_run_state, reconcile_run_execution_state
from .api_runtime import APPLY_TASKS, RUN_TASKS, ensure_run_control
from .api_storage import (
    RUNS_DIR,
    append_jsonl,
    append_run_event,
    load_apply_progress_sync,
    read_json,
    read_jsonl,
    read_jsonl_head,
    read_jsonl_tail,
    write_json,
    write_jsonl,
)
from .api_utils import clean_text, now_iso

ProcessRunCallable = Callable[..., Awaitable[None]]


async def execute_apply_import(
    run_id: str,
    portraits: List[Dict[str, Any]],
    *,
    normalize_with_existing: bool,
    source: str,
) -> Dict[str, Any]:
    run_dir = RUNS_DIR / run_id
    try:
        return await _execute_apply_import(
            run_id,
            portraits,
            normalize_with_existing=normalize_with_existing,
            source=source,
            run_dir=run_dir,
        )
    finally:
        APPLY_TASKS.pop(run_id, None)


def safe_run_snapshot(run_id: str) -> Dict[str, Any]:
    run_dir = RUNS_DIR / run_id
    manifest = read_json(run_dir / "manifest.json", {})
    progress = ensure_progress_failover_fields(read_json(run_dir / "progress.json", {}))
    logs = read_jsonl_tail(run_dir / "logs.jsonl", 50)
    embedding_logs = read_jsonl_tail(run_dir / "embedding_logs.jsonl", 50)
    results = read_jsonl_head(run_dir / "results.jsonl", 10)
    failures = read_jsonl_head(run_dir / "failures.jsonl", 10)
    attempt_traces = read_jsonl_head(run_dir / "attempt_traces.jsonl", 25)
    apply_history = read_jsonl_tail(run_dir / "apply_history.jsonl", 20)
    import_summary = read_json(run_dir / "import_summary.json", {})
    apply_progress = load_apply_progress_sync(run_id)
    execution = reconcile_run_execution_state(run_id, manifest, progress)
    return {
        "manifest": manifest,
        "progress": progress,
        "execution": execution,
        "applyProgress": apply_progress,
        "logsTail": logs,
        "embeddingLogPreview": embedding_logs,
        "resultPreview": results,
        "failurePreview": failures,
        "attemptTracePreview": attempt_traces,
        "applyHistory": apply_history,
        "importSummary": import_summary,
        "revokeReady": bool(clean_text(latest_apply_snapshot_info(manifest).get("snapshotId"))),
    }


def _schedule_run_task(
    run_id: str,
    records: List[Dict[str, Any]],
    configs: List[BuilderConfig],
    options: RunOptions,
    *,
    process_run_func: ProcessRunCallable,
    indexed_records: Optional[List[Tuple[int, Dict[str, Any]]]] = None,
) -> None:
    control = ensure_run_control(run_id)
    control["deleteRequested"] = False
    control["resumeEvent"].set()
    task = asyncio.create_task(
        process_run_func(
            run_id,
            records,
            configs,
            options,
            indexed_records=indexed_records,
        )
    )
    RUN_TASKS[run_id] = task


async def start_run_with_records(
    records: List[Dict[str, Any]],
    upload_summary: Dict[str, Any],
    configs: List[BuilderConfig],
    options: RunOptions,
    *,
    process_run_func: ProcessRunCallable,
    retry_of_run_id: Optional[str] = None,
    retry_mode: Optional[str] = None,
    retry_scope: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    from .api_client import preflight_configs
    from .api_models import STRUCTURED_INPUT_MODES

    preflight = await preflight_configs(configs)
    if not preflight["ok"]:
        raise HTTPException(status_code=400, detail={"message": "配置 API 不可用，批次未启动", "preflight": preflight})

    run_id = f"run_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
    run_dir = RUNS_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    input_mode = clean_text(upload_summary.get("inputMode")) or "raw_source"
    preprocess_configs, extract_configs = resolve_stage_config_sets(configs)
    if input_mode in STRUCTURED_INPUT_MODES:
        preprocess_configs = extract_configs
    assignments, counts = build_assignment_plan(len(records), preprocess_configs)
    manifest = build_run_manifest(
        run_id,
        upload_summary,
        configs,
        options,
        counts,
        assignments,
        preflight,
        retry_of_run_id,
        retry_mode,
        retry_scope,
    )
    progress = build_progress(run_id, len(records), configs, counts)
    progress["inputMode"] = input_mode
    write_json(run_dir / "manifest.json", manifest)
    write_json(run_dir / "normalized_input.json", records)
    write_json(run_dir / "progress.json", progress)
    persist_run_state(run_id, manifest, progress)
    append_run_event(
        {
            "ts": now_iso(),
            "runId": run_id,
            "stage": "queued",
            "retryOfRunId": retry_of_run_id,
            "retryMode": retry_mode,
        }
    )
    _schedule_run_task(run_id, records, configs, options, process_run_func=process_run_func)
    return safe_run_snapshot(run_id)


async def retry_run_in_place(
    run_id: str,
    selected_records: List[Dict[str, Any]],
    selected_indexes: List[int],
    retry_mode: str,
    retry_scope: Dict[str, Any],
    configs: List[BuilderConfig],
    options: RunOptions,
    *,
    process_run_func: ProcessRunCallable,
) -> Dict[str, Any]:
    if run_id in RUN_TASKS and not RUN_TASKS[run_id].done():
        raise HTTPException(status_code=409, detail="当前运行仍在执行，不能再次重试")

    run_dir = RUNS_DIR / run_id
    manifest = read_json(run_dir / "manifest.json", {})
    prior_progress = read_json(run_dir / "progress.json", {})
    all_records = read_json(run_dir / "normalized_input.json", [])
    if not all_records:
        raise HTTPException(status_code=404, detail="原始运行输入不存在")

    selected_set = set(selected_indexes)
    preserved_results = [
        row for row in read_jsonl(run_dir / "results.jsonl")
        if int(row.get("recordIndex", -1)) not in selected_set
    ]
    preserved_failures = [
        row for row in read_jsonl(run_dir / "failures.jsonl")
        if int(row.get("recordIndex", -1)) not in selected_set
    ]
    write_jsonl(run_dir / "results.jsonl", preserved_results)
    write_jsonl(run_dir / "failures.jsonl", preserved_failures)
    write_json(
        run_dir / "portraits.json",
        [row["portrait"] for row in sorted(preserved_results, key=lambda row: row["recordIndex"])],
    )

    assignments, counts = build_assignment_plan(len(selected_records), configs)
    pending_summary = {
        "runId": run_id,
        "applied": False,
        "autoApplyToJobLibrary": options.autoApplyToJobLibrary,
        "normalizeWithExistingTags": options.normalizeWithExistingTags,
        "reason": "retry in place pending apply refresh",
        "recordedAt": now_iso(),
        "staleByRetry": True,
    }
    write_json(run_dir / "import_summary.json", pending_summary)

    manifest["status"] = "running"
    manifest["configs"] = serialize_configs(configs)
    manifest["options"] = options.model_dump()
    manifest["retryMode"] = retry_mode
    manifest["retryScope"] = retry_scope
    manifest["latestApply"] = {}
    manifest["autoImport"] = pending_summary
    manifest.setdefault("lifecycle", {})
    manifest["lifecycle"]["lastRetryAt"] = now_iso()
    manifest["lifecycle"]["buildCompletedAt"] = None
    manifest.setdefault("retryHistory", [])
    manifest["retryHistory"].append(
        {
            "retriedAt": now_iso(),
            "selectedIndexes": selected_indexes,
            "recordCount": len(selected_indexes),
            "configIds": [config.id for config in configs],
            "inPlace": True,
        }
    )
    manifest["retryHistory"] = manifest["retryHistory"][-20:]

    progress = build_progress_from_rows(
        run_id,
        len(all_records),
        preserved_results,
        preserved_failures,
        configs,
        counts,
        manifest,
        prior_progress=prior_progress,
    )
    progress["retryingIndexes"] = selected_indexes
    progress["retryMode"] = retry_mode

    write_json(run_dir / "manifest.json", manifest)
    write_json(run_dir / "progress.json", progress)
    append_jsonl(
        run_dir / "logs.jsonl",
        {
            "ts": now_iso(),
            "level": "info",
            "stage": "retry_in_place",
            "retryMode": retry_mode,
            "selectedIndexes": selected_indexes,
            "message": f"原地重试 {len(selected_indexes)} 条记录",
        },
    )
    persist_run_state(run_id, manifest, progress)
    append_run_event(
        {
            "ts": now_iso(),
            "runId": run_id,
            "stage": "retry_in_place",
            "retryMode": retry_mode,
            "selectedIndexes": selected_indexes,
            "recordCount": len(selected_indexes),
        }
    )

    indexed_records = list(zip(selected_indexes, selected_records))
    _schedule_run_task(
        run_id,
        all_records,
        configs,
        options,
        process_run_func=process_run_func,
        indexed_records=indexed_records,
    )
    return safe_run_snapshot(run_id)
