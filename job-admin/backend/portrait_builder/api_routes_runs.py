import asyncio

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from backend_app.job_data_service import ensure_jobs_fresh

from .api_models import (
    ApplyRunRequest,
    CreateRunRequest,
    RecoverCircuitRequest,
    RetryRunRequest,
    RunOptions,
    UpdateRunConfigsRequest,
)
from .api_processing import build_runtime_config_state, process_run, sync_progress_config_stats
from .api_run_metadata import (
    build_run_index_row,
    ensure_progress_failover_fields,
    exhausted_stage_pools,
    recover_circuit_stats,
    serialize_configs,
    summarize_retry_scope,
)
from .api_run_service import (
    execute_apply_import,
    retry_run_in_place,
    safe_run_snapshot,
    start_run_with_records,
)
from .api_run_state import (
    clear_pause_metadata,
    pause_run_execution,
    persist_run_state_async,
    purge_run_record,
    reconcile_run_execution_state,
    write_run_snapshot,
)
from .api_runtime import APPLY_TASKS, active_apply_task, active_run_task, ensure_run_control
from .api_storage import (
    RUNS_DIR,
    UPLOADS_DIR,
    append_jsonl,
    append_jsonl_async,
    append_run_event,
    apply_progress_file,
    build_apply_progress,
    collect_affected_run_ids,
    delete_snapshot_ids,
    load_apply_progress,
    load_run_index,
    read_json,
    read_jsonl,
    restore_apply_snapshot,
    save_run_index,
    write_json,
    write_json_async,
)
from .api_utils import clean_text, now_iso


router = APIRouter()


def _load_manifest_progress(run_id: str):
    run_dir = RUNS_DIR / run_id
    manifest = read_json(run_dir / "manifest.json", {})
    progress = ensure_progress_failover_fields(read_json(run_dir / "progress.json", {}))
    return run_dir, manifest, progress


def _clear_auto_pause_if_resolved(manifest, progress) -> None:
    if clean_text(progress.get("pauseCode")) != "all_configs_circuit_open":
        return
    if exhausted_stage_pools(manifest, progress):
        return
    clear_pause_metadata(progress)


@router.post("/runs")
async def create_run(request: CreateRunRequest):
    upload_dir = UPLOADS_DIR / request.uploadId
    records = read_json(upload_dir / "records.json")
    summary = read_json(upload_dir / "summary.json")
    if not records or not summary:
        raise HTTPException(status_code=404, detail="upload record not found")
    if request.inputMode:
        summary["inputMode"] = request.inputMode
        write_json(upload_dir / "summary.json", summary)
    configs = [config for config in request.configs if config.enabled]
    if not configs:
        raise HTTPException(status_code=400, detail="at least one enabled config is required")
    return await start_run_with_records(
        records,
        summary,
        configs,
        request.options,
        process_run_func=process_run,
    )


@router.get("/runs")
async def list_runs():
    rows = []
    for run_dir in sorted(RUNS_DIR.iterdir(), key=lambda item: item.name, reverse=True):
        if not run_dir.is_dir():
            continue
        manifest = read_json(run_dir / "manifest.json", {})
        if not manifest:
            continue
        progress = ensure_progress_failover_fields(read_json(run_dir / "progress.json", {}))
        reconcile_run_execution_state(run_dir.name, manifest, progress)
        rows.append(build_run_index_row(run_dir.name, manifest, progress))
    if rows:
        save_run_index(rows)
    else:
        rows = load_run_index()
    return {"data": rows}


@router.get("/runs/{run_id}")
async def get_run(run_id: str):
    run_dir = RUNS_DIR / run_id
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="run record not found")
    return safe_run_snapshot(run_id)


@router.post("/runs/{run_id}/pause")
async def pause_run(run_id: str):
    run_dir, manifest, progress = _load_manifest_progress(run_id)
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="run record not found")
    task = active_run_task(run_id)
    if not task:
        raise HTTPException(status_code=409, detail="run is not active and cannot be paused")

    status = clean_text(progress.get("status") or manifest.get("status"))
    if status == "paused":
        return safe_run_snapshot(run_id)
    if status not in {"queued", "running"}:
        raise HTTPException(status_code=409, detail="only queued or running runs can be paused")

    control = ensure_run_control(run_id)
    control["resumeEvent"].clear()
    pause_run_execution(
        run_id,
        manifest,
        progress,
        log_stage="pause",
        log_message="run paused by user",
        event_stage="paused",
    )
    return safe_run_snapshot(run_id)


@router.post("/runs/{run_id}/resume")
async def resume_run(run_id: str):
    run_dir, manifest, progress = _load_manifest_progress(run_id)
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="run record not found")

    execution = reconcile_run_execution_state(run_id, manifest, progress)
    status = clean_text(progress.get("status") or manifest.get("status") or execution.get("status"))
    task = active_run_task(run_id)
    if not task:
        raise HTTPException(status_code=409, detail="run is no longer resumable")
    if status == "running":
        return safe_run_snapshot(run_id)
    if status != "paused":
        raise HTTPException(status_code=409, detail="only paused runs can resume")

    control = ensure_run_control(run_id)
    control["deleteRequested"] = False
    control["resumeEvent"].set()
    manifest["status"] = "running"
    manifest.setdefault("lifecycle", {})
    manifest["lifecycle"]["lastResumedAt"] = now_iso()
    clear_pause_metadata(progress)
    progress["status"] = "running"
    progress["startedAt"] = progress.get("startedAt") or now_iso()
    write_run_snapshot(run_id, manifest, progress)
    append_jsonl(
        run_dir / "logs.jsonl",
        {"ts": now_iso(), "level": "info", "stage": "resume", "message": "run resumed by user"},
    )
    append_run_event({"ts": now_iso(), "runId": run_id, "stage": "resumed"})
    return safe_run_snapshot(run_id)


@router.post("/runs/{run_id}/configs/replace")
async def replace_run_configs(run_id: str, request: UpdateRunConfigsRequest):
    from .api_client import preflight_configs

    run_dir, manifest, progress = _load_manifest_progress(run_id)
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="run record not found")

    configs = [config for config in request.configs if config.enabled]
    if not configs:
        raise HTTPException(status_code=400, detail="at least one enabled config is required")

    preflight = await preflight_configs(configs)
    if not preflight.get("ok"):
        raise HTTPException(
            status_code=400,
            detail={"message": "new configs failed preflight and were not applied", "preflight": preflight},
        )

    execution = reconcile_run_execution_state(run_id, manifest, progress)
    status = clean_text(progress.get("status") or manifest.get("status") or execution.get("status"))
    task = active_run_task(run_id)
    if not task:
        raise HTTPException(status_code=409, detail="run is no longer active and cannot update configs")
    if status not in {"queued", "running", "paused"}:
        raise HTTPException(status_code=409, detail="only queued, running, or paused runs can update configs")

    control = ensure_run_control(run_id)

    async def apply_update() -> None:
        nonlocal manifest, progress
        manifest = control.get("manifestRef") or manifest
        progress = ensure_progress_failover_fields(control.get("progressRef") or progress)

        current_status = clean_text(progress.get("status") or manifest.get("status"))
        if current_status in {"queued", "running"}:
            control["resumeEvent"].clear()
            pause_run_execution(
                run_id,
                manifest,
                progress,
                log_stage="config_update_pause",
                log_message="run paused before config replacement",
                event_stage="paused",
            )
        else:
            control["resumeEvent"].clear()

        input_mode = clean_text((manifest.get("upload") or {}).get("inputMode") or manifest.get("inputMode")) or "raw_source"
        current_runtime = control.get("configState") or {}
        position_count = int(current_runtime.get("positionCount") or progress.get("totalRecords") or 0)
        runtime_state = build_runtime_config_state(configs, input_mode, position_count)

        manifest["status"] = "paused"
        manifest["configs"] = serialize_configs(configs)
        manifest["preflight"] = preflight
        manifest["stagePools"] = {
            "preprocessConfigIds": runtime_state["stageConfigIds"]["preprocess"],
            "extractConfigIds": runtime_state["stageConfigIds"]["extract"],
        }
        manifest["assignmentPlan"] = {
            "slots": runtime_state["stageSlots"][runtime_state["primaryStage"]][:24],
            "counts": runtime_state["stageCounts"]["primary"],
        }
        manifest.setdefault("lifecycle", {})
        manifest["lifecycle"]["lastConfigUpdatedAt"] = now_iso()
        manifest.setdefault("configUpdateHistory", [])
        manifest["configUpdateHistory"].append(
            {
                "updatedAt": now_iso(),
                "configIds": [config.id for config in configs],
                "configCount": len(configs),
                "source": "manual_replace",
            }
        )
        manifest["configUpdateHistory"] = manifest["configUpdateHistory"][-20:]

        progress["status"] = "paused"
        clear_pause_metadata(progress)
        sync_progress_config_stats(progress, runtime_state)

        control["configState"] = runtime_state
        control["manifestRef"] = manifest
        control["progressRef"] = progress
        write_run_snapshot(run_id, manifest, progress)
        await append_jsonl_async(
            run_dir / "logs.jsonl",
            {
                "ts": now_iso(),
                "level": "info",
                "stage": "config_replace",
                "message": "run configs replaced while paused",
                "configIds": [config.id for config in configs],
            },
        )
        append_run_event(
            {
                "ts": now_iso(),
                "runId": run_id,
                "stage": "config_replace",
                "configIds": [config.id for config in configs],
            }
        )

    if control.get("runLock") is not None:
        async with control["runLock"]:
            await apply_update()
    else:
        await apply_update()

    return safe_run_snapshot(run_id)


@router.post("/runs/{run_id}/configs/recover-circuit")
async def recover_run_circuits(run_id: str, request: RecoverCircuitRequest):
    run_dir = RUNS_DIR / run_id
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="run record not found")

    control = ensure_run_control(run_id)
    task = active_run_task(run_id)
    restored = []

    if task and control.get("runLock") and control.get("progressRef") is not None and control.get("manifestRef") is not None:
        async with control["runLock"]:
            progress = ensure_progress_failover_fields(control["progressRef"])
            manifest = control["manifestRef"]
            restored = recover_circuit_stats(progress, request.configIds)
            if restored:
                _clear_auto_pause_if_resolved(manifest, progress)
                await write_json_async(run_dir / "progress.json", progress)
                await persist_run_state_async(run_id, manifest, progress)
                await append_jsonl_async(
                    run_dir / "logs.jsonl",
                    {
                        "ts": now_iso(),
                        "level": "info",
                        "stage": "manual_circuit_recover",
                        "message": "manual circuit recovery applied",
                        "restoredConfigs": restored,
                    },
                )
    else:
        manifest = read_json(run_dir / "manifest.json", {})
        progress = ensure_progress_failover_fields(read_json(run_dir / "progress.json", {}))
        restored = recover_circuit_stats(progress, request.configIds)
        if restored:
            _clear_auto_pause_if_resolved(manifest, progress)
            await write_json_async(run_dir / "progress.json", progress)
            await persist_run_state_async(run_id, manifest, progress)
            await append_jsonl_async(
                run_dir / "logs.jsonl",
                {
                    "ts": now_iso(),
                    "level": "info",
                    "stage": "manual_circuit_recover",
                    "message": "manual circuit recovery applied",
                    "restoredConfigs": restored,
                },
            )

    append_run_event(
        {
            "ts": now_iso(),
            "runId": run_id,
            "stage": "manual_circuit_recover",
            "restoredConfigIds": [item["configId"] for item in restored],
        }
    )
    return safe_run_snapshot(run_id)


@router.delete("/runs/{run_id}")
async def delete_run(run_id: str):
    run_dir = RUNS_DIR / run_id
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="run record not found")
    await purge_run_record(run_id)
    return {"ok": True, "runId": run_id}


@router.post("/runs/{run_id}/revoke")
async def revoke_run(run_id: str):
    run_dir = RUNS_DIR / run_id
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="run record not found")

    manifest = read_json(run_dir / "manifest.json", {})
    apply_history = [
        row for row in read_jsonl(run_dir / "apply_history.jsonl")
        if isinstance(row, dict) and row.get("applied")
    ]
    target_apply = apply_history[-1] if apply_history else (manifest.get("latestApply") or {})
    if not target_apply or not target_apply.get("applied"):
        raise HTTPException(status_code=409, detail="no applied snapshot is available to revoke")

    snapshot = target_apply.get("snapshot") or {}
    snapshot_id = clean_text(snapshot.get("snapshotId")) or clean_text(target_apply.get("snapshotId"))
    cutoff_at = clean_text(target_apply.get("importedAt")) or clean_text((manifest.get("lifecycle") or {}).get("latestApplyAt"))
    if not snapshot_id or not cutoff_at:
        raise HTTPException(status_code=409, detail="applied snapshot metadata is incomplete")

    affected_run_ids = collect_affected_run_ids(cutoff_at)
    if run_id not in affected_run_ids:
        affected_run_ids.append(run_id)
    preserve_snapshot_ids = {snapshot_id}
    for affected_run_id in affected_run_ids:
        await purge_run_record(affected_run_id, preserve_snapshot_ids=preserve_snapshot_ids)

    restored_snapshot = restore_apply_snapshot(snapshot_id)
    await ensure_jobs_fresh(embed_missing=False)
    delete_snapshot_ids([snapshot_id])
    return {
        "ok": True,
        "revokedRunId": run_id,
        "cutoffAt": cutoff_at,
        "deletedRunIds": affected_run_ids,
        "restoredSnapshot": restored_snapshot,
    }


@router.post("/runs/{run_id}/retry")
async def retry_run(run_id: str, request: RetryRunRequest):
    run_dir = RUNS_DIR / run_id
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="source run not found")
    if request.configs:
        configs = [config for config in request.configs if config.enabled]
    else:
        raise HTTPException(status_code=400, detail="retry requires configs with usable credentials")
    if not configs:
        raise HTTPException(status_code=400, detail="no enabled configs were provided for retry")

    selected_records, selected_indexes, retry_scope = summarize_retry_scope(run_id, request.mode)
    if not selected_records:
        raise HTTPException(status_code=400, detail="no records match the requested retry scope")

    manifest = read_json(run_dir / "manifest.json", {})
    inherited_options = RunOptions(**(manifest.get("options") or {}))
    options = request.options or inherited_options
    return await retry_run_in_place(
        run_id,
        selected_records,
        selected_indexes,
        request.mode,
        retry_scope,
        configs,
        options,
        process_run_func=process_run,
    )


@router.get("/runs/{run_id}/apply-progress")
async def get_run_apply_progress(run_id: str):
    run_dir = RUNS_DIR / run_id
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="run record not found")
    return await load_apply_progress(run_id)


@router.post("/runs/{run_id}/apply")
async def apply_run_to_job_library(run_id: str, request: ApplyRunRequest):
    run_dir = RUNS_DIR / run_id
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="run record not found")

    current_task = active_apply_task(run_id)
    if current_task is not None:
        return {
            "ok": True,
            "started": False,
            "message": "apply is already running for this batch",
            "progress": await load_apply_progress(run_id),
            "snapshot": safe_run_snapshot(run_id),
        }

    snapshot = safe_run_snapshot(run_id)
    manifest = snapshot.get("manifest") or {}
    progress = snapshot.get("progress") or {}
    status = clean_text(progress.get("status") or manifest.get("status"))
    if status in {"queued", "running", "paused"}:
        raise HTTPException(status_code=409, detail="run build is still active and cannot be applied yet")

    portraits = read_json(run_dir / "portraits.json", [])
    if not portraits:
        raise HTTPException(status_code=400, detail="no portrait results are available to apply")

    await write_json_async(
        apply_progress_file(run_id),
        build_apply_progress(
            run_id,
            status="queued",
            normalize_with_existing=request.normalizeWithExistingTags,
            source="manual",
            percent=0,
            stage="queued",
            message="waiting to start apply",
        ),
    )

    async def run_apply_task() -> None:
        await execute_apply_import(
            run_id,
            portraits,
            normalize_with_existing=request.normalizeWithExistingTags,
            source="manual",
        )

    task = asyncio.create_task(run_apply_task())
    APPLY_TASKS[run_id] = task
    return {
        "ok": True,
        "started": True,
        "message": "apply started in background",
        "progress": await load_apply_progress(run_id),
        "snapshot": safe_run_snapshot(run_id),
    }


@router.get("/runs/{run_id}/artifacts/{artifact_name}")
async def download_artifact(run_id: str, artifact_name: str):
    allowed = {
        "manifest.json",
        "progress.json",
        "normalized_input.json",
        "results.jsonl",
        "failures.jsonl",
        "logs.jsonl",
        "embedding_logs.jsonl",
        "apply_progress.json",
        "portraits.json",
        "tag_embeddings.jsonl",
        "import_summary.json",
        "apply_history.jsonl",
    }
    if artifact_name not in allowed:
        raise HTTPException(status_code=404, detail="artifact is not supported")
    file_path = RUNS_DIR / run_id / artifact_name
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="artifact file not found")
    return FileResponse(path=file_path, filename=f"{run_id}_{artifact_name}")
