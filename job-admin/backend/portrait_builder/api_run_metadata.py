from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

from .api_client import empty_token_usage, mask_api_key, merge_token_usage
from .api_models import BuilderConfig, RunOptions, STRUCTURED_INPUT_MODES, config_stage_role
from .api_runtime import CONFIG_FAILOVER_THRESHOLD
from .api_storage import RUNS_DIR, read_json, read_jsonl
from .api_utils import clean_text, now_iso, run_timeline_timestamp


def latest_apply_snapshot_info(manifest: Dict[str, Any]) -> Dict[str, Any]:
    latest_apply = manifest.get("latestApply") or {}
    snapshot = latest_apply.get("snapshot") or {}
    return snapshot if isinstance(snapshot, dict) else {}


def build_run_index_row(
    run_id: str,
    manifest: Dict[str, Any],
    progress: Dict[str, Any],
) -> Dict[str, Any]:
    latest_apply = manifest.get("latestApply") or {}
    snapshot = latest_apply_snapshot_info(manifest)
    return {
        "runId": run_id,
        "status": progress.get("status") or manifest.get("status"),
        "createdAt": manifest.get("createdAt") or progress.get("createdAt"),
        "startedAt": progress.get("startedAt"),
        "completedAt": progress.get("completedAt"),
        "recordCount": progress.get("totalRecords") or manifest.get("upload", {}).get("recordCount", 0),
        "inputMode": manifest.get("upload", {}).get("inputMode", "raw_source"),
        "completedRecords": progress.get("completedRecords", 0),
        "succeededRecords": progress.get("succeededRecords", 0),
        "failedRecords": progress.get("failedRecords", 0),
        "uploadFileName": manifest.get("upload", {}).get("fileName"),
        "retryOfRunId": manifest.get("retryOfRunId"),
        "retryMode": manifest.get("retryMode"),
        "autoApplyToJobLibrary": manifest.get("options", {}).get("autoApplyToJobLibrary", False),
        "normalizeWithExistingTags": manifest.get("options", {}).get("normalizeWithExistingTags", False),
        "latestApply": latest_apply,
        "timelineAt": run_timeline_timestamp(manifest, progress),
        "revokeReady": bool(clean_text(snapshot.get("snapshotId"))),
        "autoSwitchCount": int(progress.get("autoSwitchCount") or 0),
        "trippedConfigCount": int(progress.get("trippedConfigCount") or 0),
        "tokenUsage": merge_token_usage(progress.get("tokenUsage"), None),
    }


def config_runtime_defaults() -> Dict[str, Any]:
    return {
        "selectionCount": 0,
        "successCount": 0,
        "errorCount": 0,
        "consecutiveErrors": 0,
        "circuitOpen": False,
        "circuitTrips": 0,
        "circuitOpenedAt": None,
        "reroutedAttempts": 0,
        "takeoverAttempts": 0,
        "lastError": "",
        "lastErrorAt": None,
        "lastSuccessAt": None,
        "lastSelectedAt": None,
        **empty_token_usage(),
    }


def config_stat_payload(config: BuilderConfig, assigned_records: int = 0) -> Dict[str, Any]:
    return {
        "configId": config.id,
        "configName": config.name,
        "assignedRecords": assigned_records,
        "completedRecords": 0,
        "succeededRecords": 0,
        "failedRecords": 0,
        "stageRole": config_stage_role(config),
        "concurrency": config.concurrency,
        "requestsPerMinute": config.requestsPerMinute,
        "apiMode": config.apiMode,
        "chatCompletionsSystemRole": config.chatCompletionsSystemRole,
        "model": config.model,
        **config_runtime_defaults(),
    }


def ensure_progress_failover_fields(progress: Dict[str, Any]) -> Dict[str, Any]:
    progress["failoverThreshold"] = int(progress.get("failoverThreshold") or CONFIG_FAILOVER_THRESHOLD)
    progress["autoSwitchCount"] = int(progress.get("autoSwitchCount") or 0)
    progress["trippedConfigCount"] = int(progress.get("trippedConfigCount") or 0)
    progress["tokenUsage"] = merge_token_usage(progress.get("tokenUsage"), None)
    config_stats = progress.get("configStats") if isinstance(progress.get("configStats"), dict) else {}
    for stat in config_stats.values():
        if not isinstance(stat, dict):
            continue
        for key, value in config_runtime_defaults().items():
            stat.setdefault(key, value)
    return progress


def resolve_runtime_stage_config_sets(configs: List[BuilderConfig], input_mode: str) -> Tuple[List[BuilderConfig], List[BuilderConfig]]:
    preprocess_configs, extract_configs = resolve_stage_config_sets(configs)
    if input_mode in STRUCTURED_INPUT_MODES:
        preprocess_configs = extract_configs
    return preprocess_configs, extract_configs


def exhausted_stage_pools(manifest: Dict[str, Any], progress: Dict[str, Any]) -> List[str]:
    stage_pools = manifest.get("stagePools") if isinstance(manifest.get("stagePools"), dict) else {}
    config_stats = progress.get("configStats") if isinstance(progress.get("configStats"), dict) else {}
    exhausted: List[str] = []
    for stage_name, pool_key in (
        ("preprocess", "preprocessConfigIds"),
        ("extract", "extractConfigIds"),
    ):
        config_ids = [clean_text(config_id) for config_id in stage_pools.get(pool_key, []) if clean_text(config_id)]
        if not config_ids:
            continue
        if all(isinstance(config_stats.get(config_id), dict) and config_stats[config_id].get("circuitOpen") for config_id in config_ids):
            exhausted.append(stage_name)
    return exhausted


def recover_circuit_stats(progress: Dict[str, Any], config_ids: Optional[List[str]] = None) -> List[Dict[str, Any]]:
    config_stats = progress.get("configStats") if isinstance(progress.get("configStats"), dict) else {}
    if not isinstance(config_stats, dict):
        return []
    target_ids = [clean_text(config_id) for config_id in (config_ids or []) if clean_text(config_id)]
    if not target_ids:
        target_ids = [config_id for config_id, stat in config_stats.items() if isinstance(stat, dict) and stat.get("circuitOpen")]
    restored: List[Dict[str, Any]] = []
    for config_id in target_ids:
        stat = config_stats.get(config_id)
        if not isinstance(stat, dict):
            continue
        was_open = bool(stat.get("circuitOpen"))
        stat["circuitOpen"] = False
        stat["consecutiveErrors"] = 0
        stat["circuitOpenedAt"] = None
        if was_open:
            restored.append(
                {
                    "configId": config_id,
                    "configName": clean_text(stat.get("configName")) or config_id,
                    "circuitTrips": int(stat.get("circuitTrips") or 0),
                }
            )
    progress["trippedConfigCount"] = sum(
        1
        for item in config_stats.values()
        if isinstance(item, dict) and item.get("circuitOpen")
    )
    return restored


def summarize_retry_scope(run_id: str, mode: str) -> Tuple[List[Dict[str, Any]], List[int], Dict[str, Any]]:
    run_dir = RUNS_DIR / run_id
    records = read_json(run_dir / "normalized_input.json", [])
    if not records:
        raise HTTPException(status_code=404, detail="原始运行输入不存在")
    failures = read_jsonl(run_dir / "failures.jsonl")
    results = read_jsonl(run_dir / "results.jsonl")
    failed_indexes = sorted({int(row.get("recordIndex")) for row in failures if row.get("recordIndex") is not None})
    succeeded_indexes = sorted({int(row.get("recordIndex")) for row in results if row.get("recordIndex") is not None})
    all_indexes = list(range(len(records)))
    unfinished_indexes = sorted(set(all_indexes) - set(failed_indexes) - set(succeeded_indexes))
    if mode == "full":
        selected_indexes = all_indexes
    elif mode == "unfinished_only":
        selected_indexes = unfinished_indexes
    else:
        selected_indexes = sorted(set(failed_indexes) | set(unfinished_indexes))
    selected_records = [records[index] for index in selected_indexes]
    return selected_records, selected_indexes, {
        "failedIndexes": failed_indexes,
        "succeededIndexes": succeeded_indexes,
        "unfinishedIndexes": unfinished_indexes,
        "selectedIndexes": selected_indexes,
    }


def build_assignment_plan(total_records: int, configs: List[BuilderConfig]) -> Tuple[List[str], Dict[str, int]]:
    slots: List[str] = []
    for config in configs:
        slots.extend([config.id] * config.concurrency)
    if not slots:
        raise HTTPException(status_code=400, detail="没有可用配置")
    assignments: List[str] = []
    counts = {config.id: 0 for config in configs}
    for index in range(total_records):
        config_id = slots[index % len(slots)]
        assignments.append(config_id)
        counts[config_id] += 1
    return assignments, counts


def resolve_stage_config_sets(configs: List[BuilderConfig]) -> Tuple[List[BuilderConfig], List[BuilderConfig]]:
    preprocess_configs = [config for config in configs if config_stage_role(config) in {"all", "preprocess"}]
    extract_configs = [config for config in configs if config_stage_role(config) in {"all", "extract"}]
    if not preprocess_configs:
        preprocess_configs = extract_configs or configs
    if not extract_configs:
        extract_configs = preprocess_configs or configs
    return preprocess_configs, extract_configs


def serialize_configs(configs: List[BuilderConfig]) -> List[Dict[str, Any]]:
    return [
        {
            "id": config.id,
            "name": config.name,
            "baseUrl": config.baseUrl,
            "apiKeyMasked": mask_api_key(config.apiKey),
            "model": config.model,
            "stageRole": config_stage_role(config),
            "apiMode": config.apiMode,
            "chatCompletionsSystemRole": config.chatCompletionsSystemRole,
            "concurrency": config.concurrency,
            "requestsPerMinute": config.requestsPerMinute,
        }
        for config in configs
    ]


def build_run_manifest(
    run_id: str,
    upload_summary: Dict[str, Any],
    configs: List[BuilderConfig],
    options: RunOptions,
    counts: Dict[str, int],
    assignments: List[str],
    preflight: Dict[str, Any],
    retry_of_run_id: Optional[str] = None,
    retry_mode: Optional[str] = None,
    retry_scope: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    input_mode = clean_text(upload_summary.get("inputMode")) or "raw_source"
    preprocess_configs, extract_configs = resolve_runtime_stage_config_sets(configs, input_mode)
    return {
        "runId": run_id,
        "status": "queued",
        "createdAt": now_iso(),
        "upload": upload_summary,
        "inputMode": input_mode,
        "configs": serialize_configs(configs),
        "options": options.model_dump(),
        "preflight": preflight,
        "retryOfRunId": retry_of_run_id,
        "retryMode": retry_mode,
        "retryScope": retry_scope or {},
        "stagePools": {
            "preprocessConfigIds": [config.id for config in preprocess_configs],
            "extractConfigIds": [config.id for config in extract_configs],
        },
        "routingPolicy": {
            "type": "config_circuit_breaker",
            "failoverThreshold": CONFIG_FAILOVER_THRESHOLD,
            "scope": "per_config_global",
        },
        "assignmentPlan": {
            "slots": assignments[: min(len(assignments), 24)],
            "counts": counts,
        },
        "artifacts": [
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
        ],
        "lifecycle": {
            "buildQueuedAt": now_iso(),
            "buildStartedAt": None,
            "buildCompletedAt": None,
            "latestApplyAt": None,
        },
    }


def build_progress(run_id: str, total_records: int, configs: List[BuilderConfig], counts: Dict[str, int]) -> Dict[str, Any]:
    return {
        "runId": run_id,
        "status": "queued",
        "inputMode": "raw_source",
        "createdAt": now_iso(),
        "startedAt": None,
        "completedAt": None,
        "totalRecords": total_records,
        "completedRecords": 0,
        "succeededRecords": 0,
        "failedRecords": 0,
        "failoverThreshold": CONFIG_FAILOVER_THRESHOLD,
        "autoSwitchCount": 0,
        "trippedConfigCount": 0,
        "tokenUsage": empty_token_usage(),
        "configStats": {
            config.id: config_stat_payload(config, assigned_records=counts.get(config.id, 0))
            for config in configs
        },
    }


def build_progress_from_rows(
    run_id: str,
    total_records: int,
    result_rows: List[Dict[str, Any]],
    failure_rows: List[Dict[str, Any]],
    configs: List[BuilderConfig],
    retry_counts: Dict[str, int],
    manifest: Dict[str, Any],
    prior_progress: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    config_meta: Dict[str, Dict[str, Any]] = {}
    for item in manifest.get("configs", []):
        config_id = clean_text(item.get("id"))
        if not config_id:
            continue
        config_meta[config_id] = {
            "configName": clean_text(item.get("name")) or config_id,
            "stageRole": clean_text(item.get("stageRole")) or "all",
            "concurrency": int(item.get("concurrency") or 30),
            "requestsPerMinute": int(item.get("requestsPerMinute") or 800),
            "apiMode": clean_text(item.get("apiMode")) or "chat_completions",
            "chatCompletionsSystemRole": clean_text(item.get("chatCompletionsSystemRole")) or "system",
            "model": clean_text(item.get("model")),
        }
    for config in configs:
        config_meta[config.id] = {
            "configName": config.name,
            "stageRole": config_stage_role(config),
            "concurrency": config.concurrency,
            "requestsPerMinute": config.requestsPerMinute,
            "apiMode": config.apiMode,
            "chatCompletionsSystemRole": config.chatCompletionsSystemRole,
            "model": config.model,
        }

    stats: Dict[str, Dict[str, Any]] = {}
    total_token_usage = empty_token_usage()

    def ensure_stat(config_id: str, config_name: str = "") -> Dict[str, Any]:
        meta = config_meta.get(config_id, {})
        stat = stats.setdefault(
            config_id,
            {
                "configId": config_id,
                "configName": config_name or meta.get("configName") or config_id or "unknown",
                "assignedRecords": 0,
                "completedRecords": 0,
                "succeededRecords": 0,
                "failedRecords": 0,
                "stageRole": meta.get("stageRole", "all"),
                "concurrency": meta.get("concurrency", 30),
                "requestsPerMinute": meta.get("requestsPerMinute", 800),
                "apiMode": meta.get("apiMode", "chat_completions"),
                "chatCompletionsSystemRole": meta.get("chatCompletionsSystemRole", "system"),
                "model": meta.get("model", ""),
                **config_runtime_defaults(),
            },
        )
        if config_name and stat["configName"] == "unknown":
            stat["configName"] = config_name
        return stat

    for row in result_rows:
        processing = row.get("processing") or {}
        config_id = clean_text(processing.get("configId")) or clean_text(row.get("configId")) or "unknown"
        stat = ensure_stat(config_id, clean_text(processing.get("configName")) or clean_text(row.get("configName")))
        stat["assignedRecords"] += 1
        stat["completedRecords"] += 1
        stat["succeededRecords"] += 1
        total_token_usage = merge_token_usage(total_token_usage, processing.get("tokenUsage"))
        for usage_config_id, usage_payload in (processing.get("configTokenUsage") or {}).items():
            usage_stat = ensure_stat(clean_text(usage_config_id) or config_id)
            merged_usage = merge_token_usage(usage_stat, usage_payload)
            usage_stat.update(merged_usage)

    for row in failure_rows:
        config_id = clean_text(row.get("configId")) or "unknown"
        stat = ensure_stat(config_id, clean_text(row.get("configName")))
        stat["assignedRecords"] += 1
        stat["completedRecords"] += 1
        stat["failedRecords"] += 1

    for config in configs:
        ensure_stat(config.id, config.name)
    for config_id, count in retry_counts.items():
        ensure_stat(config_id)
        stats[config_id]["assignedRecords"] += count

    return {
        "runId": run_id,
        "status": "running",
        "inputMode": manifest.get("upload", {}).get("inputMode", "raw_source"),
        "createdAt": (prior_progress or {}).get("createdAt") or manifest.get("createdAt") or now_iso(),
        "startedAt": now_iso(),
        "completedAt": None,
        "totalRecords": total_records,
        "completedRecords": len(result_rows) + len(failure_rows),
        "succeededRecords": len(result_rows),
        "failedRecords": len(failure_rows),
        "failoverThreshold": CONFIG_FAILOVER_THRESHOLD,
        "autoSwitchCount": 0,
        "trippedConfigCount": 0,
        "tokenUsage": total_token_usage,
        "configStats": stats,
        "retryingIndexes": [],
    }
