import asyncio
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException

from job_profile_schema import normalize_job_profile
from tag_sync import export_job_tag_embeddings

from .api_client import (
    AsyncRequestRateLimiter,
    build_chat_completions_request_package,
    build_responses_request_package,
    call_model,
    call_model_messages,
    empty_token_usage,
    merge_token_usage,
    normalize_chat_messages,
)
from .api_models import (
    BuilderConfig,
    ConfigExecutionError,
    DIRECT_STAGE4_INPUT_MODE,
    RunOptions,
    STRUCTURED_INPUT_MODES,
    config_stage_role,
)
from .api_record_merge import (
    merge_structured_extract_results,
    merge_structured_missing_only_results,
    source_has_explicit_tech,
    source_has_explicit_group,
)
from .api_run_metadata import (
    build_assignment_plan,
    build_progress,
    config_runtime_defaults,
    config_stat_payload,
    ensure_progress_failover_fields,
    exhausted_stage_pools,
    resolve_runtime_stage_config_sets,
)
from .api_run_service import execute_apply_import
from .api_run_state import (
    clear_pause_metadata,
    pause_run_execution,
    persist_run_state,
    persist_run_state_async,
    wait_for_run_resume,
    write_run_snapshot,
)
from .api_runtime import CONFIG_FAILOVER_THRESHOLD, RUN_TASKS, drop_run_control, ensure_run_control
from .api_storage import (
    RUNS_DIR,
    append_embedding_log,
    append_jsonl_async,
    append_run_event,
    read_json,
    read_jsonl_async,
    write_json,
    write_json_async,
)
from .api_utils import clean_text, now_iso
from .pipeline_core import (
    build_restored_job_information_text,
    build_stage1_base_info_prompts,
    build_stage1_candidate,
    build_stage1_field_restore_prompts,
    build_stage2_structure_messages,
    build_stage3_sentence_classifier_prompts,
    build_stage4_soft_direct_prompts,
    build_stage4_soft_prompts,
    build_stage4_tech_direct_prompts,
    build_stage4_tech_prompts,
    extract_json_object,
    format_tech_capability_type_validation_error,
    make_builder_record_id,
    merge_noise_sentences_into_notes,
    merge_portrait,
    normalize_base_portrait,
    normalize_field_restore_mapping,
    normalize_sentence_classification,
    normalize_soft_portrait,
    normalize_structure_payload,
    normalize_tech_portrait,
    summarize_tech_capability_type_validation_from_items,
    summarize_tech_capability_type_validation_from_payload,
)


def empty_tech_capability_type_run_stats() -> Dict[str, Any]:
    return {
        "validatedRecords": 0,
        "recordsWithIssues": 0,
        "totalCapabilities": 0,
        "validExplicitCount": 0,
        "missingTypeCount": 0,
        "invalidTypeCount": 0,
        "byType": {
            "principle": 0,
            "scene": 0,
            "engineering": 0,
            "soft_flag": 0,
        },
        "sampleRecords": [],
    }


def merge_tech_capability_type_run_stats(
    aggregate: Dict[str, Any],
    summary: Dict[str, Any],
    *,
    record_index: int,
    record_id: str,
) -> Dict[str, Any]:
    aggregate["validatedRecords"] = int(aggregate.get("validatedRecords") or 0) + 1
    aggregate["totalCapabilities"] = int(aggregate.get("totalCapabilities") or 0) + int(summary.get("totalCapabilities") or 0)
    aggregate["validExplicitCount"] = int(aggregate.get("validExplicitCount") or 0) + int(summary.get("validExplicitCount") or 0)
    aggregate["missingTypeCount"] = int(aggregate.get("missingTypeCount") or 0) + int(summary.get("missingTypeCount") or 0)
    aggregate["invalidTypeCount"] = int(aggregate.get("invalidTypeCount") or 0) + int(summary.get("invalidTypeCount") or 0)
    by_type = aggregate.setdefault("byType", {})
    for type_name in ("principle", "scene", "engineering", "soft_flag"):
        by_type[type_name] = int(by_type.get(type_name) or 0) + int((summary.get("byType") or {}).get(type_name) or 0)
    if summary.get("hasIssues"):
        aggregate["recordsWithIssues"] = int(aggregate.get("recordsWithIssues") or 0) + 1
        sample_records = aggregate.setdefault("sampleRecords", [])
        if len(sample_records) < 10:
            sample_records.append(
                {
                    "recordIndex": record_index,
                    "recordId": record_id,
                    "missingTypeCount": int(summary.get("missingTypeCount") or 0),
                    "invalidTypeCount": int(summary.get("invalidTypeCount") or 0),
                    "samples": summary.get("samples") or [],
                }
            )
    return aggregate


class TechCapabilityTypeValidationError(ValueError):
    def __init__(self, validation: Dict[str, Any]):
        self.validation = validation
        super().__init__(format_tech_capability_type_validation_error(validation))


async def process_record(
    record: Dict[str, Any],
    index: int,
    preprocess_config: BuilderConfig,
    extract_config: Optional[BuilderConfig] = None,
    run_id: Optional[str] = None,
) -> Dict[str, Any]:
    return await process_record_with_rate_limit(
        record,
        index,
        preprocess_config,
        None,
        extract_config,
        None,
        None,
        run_id=run_id,
    )


async def process_record_with_rate_limit(
    record: Dict[str, Any],
    index: int,
    preprocess_config: BuilderConfig,
    preprocess_rate_limiter: Optional[AsyncRequestRateLimiter],
    extract_config: Optional[BuilderConfig] = None,
    extract_rate_limiter: Optional[AsyncRequestRateLimiter] = None,
    extract_semaphore: Optional[asyncio.Semaphore] = None,
    run_id: Optional[str] = None,
    on_config_success: Optional[Any] = None,
    on_token_usage: Optional[Any] = None,
    input_mode: str = "raw_source",
    debug_prompt_trace: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    extract_config = extract_config or preprocess_config
    extract_rate_limiter = extract_rate_limiter or preprocess_rate_limiter
    record_id = make_builder_record_id(index, run_id)
    input_mode = clean_text(input_mode) or "raw_source"
    structured_mode = input_mode in STRUCTURED_INPUT_MODES
    fill_missing_mode = input_mode == "structured_job_json_fill_missing"
    direct_stage4_mode = input_mode == DIRECT_STAGE4_INPUT_MODE
    processing_token_usage = empty_token_usage()
    config_token_usage: Dict[str, Dict[str, int]] = {}
    stage_token_usage: Dict[str, Dict[str, int]] = {}
    prompt_trace = debug_prompt_trace if isinstance(debug_prompt_trace, dict) else None
    if prompt_trace is not None:
        prompt_trace.setdefault("stages", [])

    def snapshot_messages(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        snapshots: List[Dict[str, Any]] = []
        for message in messages:
            if not isinstance(message, dict):
                continue
            snapshots.append(
                {
                    "role": message.get("role"),
                    "content": message.get("content"),
                }
            )
        return snapshots

    def append_prompt_stage(
        stage_name: str,
        stage_role: str,
        config: BuilderConfig,
        messages: List[Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        if prompt_trace is None:
            return None
        stage_trace = {
            "stageName": stage_name,
            "stageRole": stage_role,
            "configId": config.id,
            "configName": config.name,
            "messages": snapshot_messages(messages),
            "requestPackage": (
                build_responses_request_package(config, normalize_chat_messages(snapshot_messages(messages)))
                if config.apiMode == "responses"
                else build_chat_completions_request_package(config, normalize_chat_messages(snapshot_messages(messages)))
            ),
        }
        prompt_trace["stages"].append(stage_trace)
        return stage_trace

    def find_prompt_stage(stage_name: str) -> Optional[Dict[str, Any]]:
        if prompt_trace is None:
            return None
        for stage in reversed(prompt_trace.get("stages", [])):
            if clean_text(stage.get("stageName")) == stage_name:
                return stage
        return None

    def annotate_stage_success(stage_name: str, response: Dict[str, Any]) -> None:
        stage_trace = find_prompt_stage(stage_name)
        if stage_trace is None:
            return
        stage_trace["status"] = "success"
        stage_trace["responseText"] = clean_text(response.get("text"))
        if response.get("requestPackage"):
            stage_trace["requestPackage"] = response.get("requestPackage")
        if response.get("transport"):
            stage_trace["transport"] = response.get("transport")

    def annotate_stage_error(stage_name: str, error: Exception, raw_text: Optional[str] = None) -> None:
        if prompt_trace is not None:
            prompt_trace["errorStageName"] = stage_name
        stage_trace = find_prompt_stage(stage_name)
        if stage_trace is None:
            return
        stage_trace["status"] = "parse_error" if isinstance(error, ValueError) else "error"
        stage_trace["error"] = str(error)
        if raw_text:
            stage_trace["responseText"] = clean_text(raw_text)

    def parse_json_stage(stage_name: str, raw_text: Optional[str]) -> Any:
        try:
            return extract_json_object(raw_text)
        except Exception as exc:
            annotate_stage_error(stage_name, exc, raw_text)
            raise

    async def notify_config_success(config_id: str) -> None:
        if on_config_success is None:
            return
        result = on_config_success(config_id)
        if asyncio.iscoroutine(result):
            await result

    async def notify_token_usage(config_id: str, stage_role: str, stage_name: str, usage: Dict[str, int]) -> None:
        nonlocal processing_token_usage
        normalized_usage = merge_token_usage(None, usage)
        processing_token_usage = merge_token_usage(processing_token_usage, normalized_usage)
        config_token_usage[config_id] = merge_token_usage(config_token_usage.get(config_id), normalized_usage)
        stage_token_usage[stage_name] = merge_token_usage(stage_token_usage.get(stage_name), normalized_usage)
        if on_token_usage is None:
            return
        result = on_token_usage(config_id, stage_role, stage_name, normalized_usage)
        if asyncio.iscoroutine(result):
            await result

    async def call_preprocess_stage(stage_name: str, system_prompt: str, user_prompt: str) -> str:
        append_prompt_stage(
            stage_name,
            "preprocess",
            preprocess_config,
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        try:
            response = await call_model(
                preprocess_config,
                system_prompt,
                user_prompt,
                rate_limiter=preprocess_rate_limiter,
            )
        except Exception as exc:
            raise ConfigExecutionError(
                config=preprocess_config,
                stage_role="preprocess",
                stage_name=stage_name,
                cause=exc,
            ) from exc
        response_text = clean_text(response.get("text"))
        annotate_stage_success(stage_name, response)
        await notify_token_usage(preprocess_config.id, "preprocess", stage_name, response.get("usage"))
        await notify_config_success(preprocess_config.id)
        return response_text

    async def call_preprocess_messages_stage(stage_name: str, messages: List[Dict[str, str]]) -> str:
        append_prompt_stage(stage_name, "preprocess", preprocess_config, messages)
        try:
            response = await call_model_messages(
                preprocess_config,
                messages,
                rate_limiter=preprocess_rate_limiter,
            )
        except Exception as exc:
            raise ConfigExecutionError(
                config=preprocess_config,
                stage_role="preprocess",
                stage_name=stage_name,
                cause=exc,
            ) from exc
        response_text = clean_text(response.get("text"))
        annotate_stage_success(stage_name, response)
        await notify_token_usage(preprocess_config.id, "preprocess", stage_name, response.get("usage"))
        await notify_config_success(preprocess_config.id)
        return response_text

    async def call_extract_stage() -> Tuple[str, str]:
        append_prompt_stage(
            "stage4_tech",
            "extract",
            extract_config,
            [
                {"role": "system", "content": tech_system},
                {"role": "user", "content": tech_user},
            ],
        )
        append_prompt_stage(
            "stage4_soft",
            "extract",
            extract_config,
            [
                {"role": "system", "content": soft_system},
                {"role": "user", "content": soft_user},
            ],
        )
        result = await asyncio.gather(
            call_model(extract_config, tech_system, tech_user, rate_limiter=extract_rate_limiter),
            call_model(extract_config, soft_system, soft_user, rate_limiter=extract_rate_limiter),
            return_exceptions=True,
        )
        tech_result, soft_result = result
        if not isinstance(tech_result, Exception):
            annotate_stage_success("stage4_tech", tech_result)
            await notify_token_usage(extract_config.id, "extract", "stage4_tech", tech_result.get("usage"))
        else:
            tech_stage_trace = find_prompt_stage("stage4_tech")
            if tech_stage_trace is not None:
                tech_stage_trace["status"] = "error"
                tech_stage_trace["error"] = str(tech_result)
        if not isinstance(soft_result, Exception):
            annotate_stage_success("stage4_soft", soft_result)
            await notify_token_usage(extract_config.id, "extract", "stage4_soft", soft_result.get("usage"))
        else:
            soft_stage_trace = find_prompt_stage("stage4_soft")
            if soft_stage_trace is not None:
                soft_stage_trace["status"] = "error"
                soft_stage_trace["error"] = str(soft_result)
        if isinstance(tech_result, Exception) or isinstance(soft_result, Exception):
            exc = tech_result if isinstance(tech_result, Exception) else soft_result
            raise ConfigExecutionError(
                config=extract_config,
                stage_role="extract",
                stage_name="stage4_extract",
                cause=exc,
            ) from exc
        await notify_config_success(extract_config.id)
        return clean_text(tech_result.get("text")), clean_text(soft_result.get("text"))

    stage1_restore_raw = None
    stage1_base_raw = None
    stage2_structure_raw = None
    field_restore: Dict[str, Any] = {}
    restored_job_text = None
    if structured_mode:
        base_portrait = normalize_job_profile(record)
        base_portrait["id"] = record_id
        base_portrait = normalize_job_profile(base_portrait)
    else:
        await wait_for_run_resume(run_id)
        stage1_restore_system, stage1_restore_user = build_stage1_field_restore_prompts(record, record_id)
        stage1_restore_raw = await call_preprocess_stage("stage1_field_restore", stage1_restore_system, stage1_restore_user)
        field_restore = normalize_field_restore_mapping(parse_json_stage("stage1_field_restore", stage1_restore_raw))

        restored_job_text = build_restored_job_information_text(record, field_restore, record_id)

        await wait_for_run_resume(run_id)
        stage1_base_system, stage1_base_user = build_stage1_base_info_prompts(restored_job_text)
        stage1_base_raw = await call_preprocess_stage("stage1_base_info", stage1_base_system, stage1_base_user)

        await wait_for_run_resume(run_id)
        stage2_structure_messages = build_stage2_structure_messages(field_restore, restored_job_text)
        stage2_structure_raw = await call_preprocess_messages_stage("stage2_structure", stage2_structure_messages)

        stage1_candidate = build_stage1_candidate(
            parse_json_stage("stage1_base_info", stage1_base_raw),
            normalize_structure_payload(parse_json_stage("stage2_structure", stage2_structure_raw)),
            record_id,
        )
        base_portrait = normalize_base_portrait(stage1_candidate, record_id)

    tech_raw = None
    soft_raw = None
    stage3_classifier_raw = None
    sentence_payload = {"tech_sentences": [], "soft_sentences": [], "noise_sentences": []}
    need_tech_extract = True
    need_soft_extract = True
    if fill_missing_mode:
        need_tech_extract = not (
            source_has_explicit_tech(record)
            and source_has_explicit_group(record, "techCapabilities")
            and source_has_explicit_group(record, "devTools")
        )
        need_soft_extract = not (
            source_has_explicit_group(record, "softQuality")
            and source_has_explicit_group(record, "growthPotential")
        )

    if (need_tech_extract or need_soft_extract) and not direct_stage4_mode:
        await wait_for_run_resume(run_id)
        stage3_classifier_system, stage3_classifier_user = build_stage3_sentence_classifier_prompts(base_portrait)
        stage3_classifier_raw = await call_preprocess_stage(
            "stage3_sentence_classifier",
            stage3_classifier_system,
            stage3_classifier_user,
        )
        sentence_payload = normalize_sentence_classification(
            parse_json_stage("stage3_sentence_classifier", stage3_classifier_raw)
        )
        base_portrait = merge_noise_sentences_into_notes(base_portrait, sentence_payload)

    if need_tech_extract:
        if direct_stage4_mode:
            tech_system, tech_user = build_stage4_tech_direct_prompts(base_portrait)
        else:
            tech_system, tech_user = build_stage4_tech_prompts(base_portrait, sentence_payload)
    else:
        tech_system = tech_user = ""
    if need_soft_extract:
        if direct_stage4_mode:
            soft_system, soft_user = build_stage4_soft_direct_prompts(base_portrait)
        else:
            soft_system, soft_user = build_stage4_soft_prompts(base_portrait, sentence_payload)
    else:
        soft_system = soft_user = ""

    if need_tech_extract or need_soft_extract:
        if need_tech_extract and need_soft_extract:
            if extract_semaphore is not None:
                async with extract_semaphore:
                    await wait_for_run_resume(run_id)
                    tech_raw, soft_raw = await call_extract_stage()
            else:
                await wait_for_run_resume(run_id)
                tech_raw, soft_raw = await call_extract_stage()
        elif need_tech_extract:
            try:
                if extract_semaphore is not None:
                    async with extract_semaphore:
                        await wait_for_run_resume(run_id)
                        tech_response = await call_model(
                            extract_config,
                            tech_system,
                            tech_user,
                            rate_limiter=extract_rate_limiter,
                        )
                else:
                    await wait_for_run_resume(run_id)
                    tech_response = await call_model(
                        extract_config,
                        tech_system,
                        tech_user,
                        rate_limiter=extract_rate_limiter,
                    )
            except Exception as exc:
                raise ConfigExecutionError(
                    config=extract_config,
                    stage_role="extract",
                    stage_name="stage4_tech",
                    cause=exc,
                ) from exc
            await notify_token_usage(extract_config.id, "extract", "stage4_tech", tech_response.get("usage"))
            await notify_config_success(extract_config.id)
            tech_raw = clean_text(tech_response.get("text"))
            annotate_stage_success("stage4_tech", tech_response)
        elif need_soft_extract:
            try:
                if extract_semaphore is not None:
                    async with extract_semaphore:
                        await wait_for_run_resume(run_id)
                        soft_response = await call_model(
                            extract_config,
                            soft_system,
                            soft_user,
                            rate_limiter=extract_rate_limiter,
                        )
                else:
                    await wait_for_run_resume(run_id)
                    soft_response = await call_model(
                        extract_config,
                        soft_system,
                        soft_user,
                        rate_limiter=extract_rate_limiter,
                    )
            except Exception as exc:
                raise ConfigExecutionError(
                    config=extract_config,
                    stage_role="extract",
                    stage_name="stage4_soft",
                    cause=exc,
                ) from exc
            await notify_token_usage(extract_config.id, "extract", "stage4_soft", soft_response.get("usage"))
            await notify_config_success(extract_config.id)
            soft_raw = clean_text(soft_response.get("text"))
            annotate_stage_success("stage4_soft", soft_response)

    parsed_tech_payload = parse_json_stage("stage4_tech", tech_raw) if tech_raw else {}
    parsed_soft_payload = parse_json_stage("stage4_soft", soft_raw) if soft_raw else {}
    stage4_tech_type_validation = summarize_tech_capability_type_validation_from_payload(
        parsed_tech_payload,
        source="stage4Extracted",
    )
    tech_portrait = (
        normalize_tech_portrait(parsed_tech_payload)
        if tech_raw
        else {"techStack": [], "techCapabilities": [], "devTools": []}
    )
    tech_portrait_type_validation = summarize_tech_capability_type_validation_from_items(
        tech_portrait.get("techCapabilities"),
        source="stage4Normalized",
    )
    soft_portrait = (
        normalize_soft_portrait(parsed_soft_payload)
        if soft_raw
        else {"softQuality": [], "growthPotential": []}
    )
    if input_mode in {"structured_job_json_extract", DIRECT_STAGE4_INPUT_MODE}:
        portrait = merge_structured_extract_results(record, base_portrait, tech_portrait, soft_portrait)
    elif fill_missing_mode:
        portrait = merge_structured_missing_only_results(record, base_portrait, tech_portrait, soft_portrait)
    else:
        portrait = normalize_job_profile(merge_portrait(base_portrait, tech_portrait, soft_portrait))
    final_tech_type_validation = summarize_tech_capability_type_validation_from_items(
        portrait.get("techCapabilities"),
        source="finalPortrait",
    )
    tech_capability_type_validation = {
        "stage4Extracted": stage4_tech_type_validation,
        "stage4Normalized": tech_portrait_type_validation,
        "finalPortrait": final_tech_type_validation,
        "hasIssues": any(
            summary.get("hasIssues")
            for summary in (
                stage4_tech_type_validation,
                tech_portrait_type_validation,
                final_tech_type_validation,
            )
            if isinstance(summary, dict)
        ),
    }
    if prompt_trace is not None:
        prompt_trace["techCapabilityTypeValidation"] = tech_capability_type_validation
    if tech_capability_type_validation["hasIssues"]:
        raise TechCapabilityTypeValidationError(tech_capability_type_validation)
    return {
        "recordIndex": index,
        "recordId": base_portrait["id"],
        "sourceRaw": record,
        "basePortrait": base_portrait,
        "portrait": portrait,
        "processing": {
            "configId": preprocess_config.id,
            "configName": preprocess_config.name,
            "apiMode": preprocess_config.apiMode,
            "model": preprocess_config.model,
            "stageRole": config_stage_role(preprocess_config),
            "extractConfigId": extract_config.id,
            "extractConfigName": extract_config.name,
            "extractApiMode": extract_config.apiMode,
            "extractModel": extract_config.model,
            "extractStageRole": config_stage_role(extract_config),
            "inputMode": input_mode,
            "step3ClassifierUsed": bool(stage3_classifier_raw),
            "stage4InputStrategy": "jd_split_direct" if direct_stage4_mode else "classified_requirements",
            "tokenUsage": processing_token_usage,
            "configTokenUsage": config_token_usage,
            "stageTokenUsage": stage_token_usage,
            "techCapabilityTypeValidation": tech_capability_type_validation,
            "finishedAt": now_iso(),
        },
        "rawModelOutputs": {
            "stage1_field_restore": stage1_restore_raw,
            "stage1_base_info": stage1_base_raw,
            "stage2_structure": stage2_structure_raw,
            "stage3_sentence_classifier": stage3_classifier_raw,
            "stage4_tech": tech_raw,
            "stage4_soft": soft_raw,
        },
        "stage1Artifacts": {
            "fieldRestore": field_restore,
            "restoredJobText": restored_job_text,
            "sentenceClassification": sentence_payload,
        },
    }


async def log_run(run_dir: Path, lock: asyncio.Lock, payload: Dict[str, Any]) -> None:
    async with lock:
        await append_jsonl_async(run_dir / "logs.jsonl", {"ts": now_iso(), **payload})


async def persist_progress(run_dir: Path, lock: asyncio.Lock, progress: Dict[str, Any]) -> None:
    async with lock:
        await write_json_async(run_dir / "progress.json", progress)


def build_runtime_config_state(
    configs: List[BuilderConfig],
    input_mode: str,
    position_count: int,
) -> Dict[str, Any]:
    preprocess_configs, extract_configs = resolve_runtime_stage_config_sets(configs, input_mode)
    preprocess_slots, preprocess_counts = build_assignment_plan(position_count, preprocess_configs)
    extract_slots, extract_counts = build_assignment_plan(position_count, extract_configs)
    primary_stage = "extract" if input_mode in STRUCTURED_INPUT_MODES else "preprocess"
    primary_counts = extract_counts if primary_stage == "extract" else preprocess_counts
    return {
        "positionCount": position_count,
        "inputMode": input_mode,
        "primaryStage": primary_stage,
        "configs": configs,
        "configById": {config.id: config for config in configs},
        "stageConfigIds": {
            "preprocess": [config.id for config in preprocess_configs],
            "extract": [config.id for config in extract_configs],
        },
        "stageSlots": {
            "preprocess": preprocess_slots,
            "extract": extract_slots,
        },
        "stageCounts": {
            "preprocess": preprocess_counts,
            "extract": extract_counts,
            "primary": primary_counts,
        },
        "preprocessRateLimiters": {
            config.id: AsyncRequestRateLimiter(config.requestsPerMinute, 60.0)
            for config in preprocess_configs
        },
        "preprocessSemaphores": {
            config.id: asyncio.Semaphore(config.concurrency)
            for config in preprocess_configs
        },
        "extractRateLimiters": {
            config.id: AsyncRequestRateLimiter(config.requestsPerMinute, 60.0)
            for config in extract_configs
        },
        "extractSemaphores": {
            config.id: asyncio.Semaphore(config.concurrency)
            for config in extract_configs
        },
    }


def sync_progress_config_stats(progress: Dict[str, Any], runtime_state: Dict[str, Any]) -> None:
    config_stats = progress.setdefault("configStats", {})
    primary_counts = runtime_state.get("stageCounts", {}).get("primary", {})
    for config in runtime_state.get("configs", []):
        stat = config_stats.get(config.id)
        if not isinstance(stat, dict):
            stat = config_stat_payload(config, assigned_records=primary_counts.get(config.id, 0))
            config_stats[config.id] = stat
        stat["configId"] = config.id
        stat["configName"] = config.name
        stat["stageRole"] = config_stage_role(config)
        stat["concurrency"] = config.concurrency
        stat["requestsPerMinute"] = config.requestsPerMinute
        stat["apiMode"] = config.apiMode
        stat["chatCompletionsSystemRole"] = config.chatCompletionsSystemRole
        stat["model"] = config.model
        stat["assignedRecords"] = primary_counts.get(config.id, stat.get("assignedRecords", 0))
        for key, value in config_runtime_defaults().items():
            stat.setdefault(key, value)
    progress["trippedConfigCount"] = sum(
        1
        for item in config_stats.values()
        if isinstance(item, dict) and item.get("circuitOpen")
    )


async def process_run(
    run_id: str,
    records: List[Dict[str, Any]],
    configs: List[BuilderConfig],
    options: RunOptions,
    indexed_records: Optional[List[Tuple[int, Dict[str, Any]]]] = None,
) -> None:
    run_dir = RUNS_DIR / run_id
    run_lock = asyncio.Lock()
    job_items = indexed_records if indexed_records is not None else list(enumerate(records))
    manifest = read_json(run_dir / "manifest.json", {})
    input_mode = clean_text((manifest.get("upload") or {}).get("inputMode") or manifest.get("inputMode")) or "raw_source"
    control = ensure_run_control(run_id)
    runtime_state = build_runtime_config_state(configs, input_mode, len(job_items))
    assignments = runtime_state["stageSlots"][runtime_state["primaryStage"]]
    counts = runtime_state["stageCounts"]["primary"]
    config_jobs: Dict[str, List[Tuple[int, int, Dict[str, Any]]]] = defaultdict(list)
    for position, (index, record) in enumerate(job_items):
        config_jobs[assignments[position]].append((position, index, record))

    progress = ensure_progress_failover_fields(
        read_json(run_dir / "progress.json", build_progress(run_id, len(records), configs, counts))
    )
    progress["status"] = "paused" if not control["resumeEvent"].is_set() else "running"
    progress["inputMode"] = input_mode
    progress["startedAt"] = progress.get("startedAt") or now_iso()
    progress.setdefault("techCapabilityTypeValidation", empty_tech_capability_type_run_stats())
    sync_progress_config_stats(progress, runtime_state)
    write_json(run_dir / "progress.json", progress)
    manifest["status"] = progress["status"]
    manifest.setdefault("lifecycle", {})
    manifest["lifecycle"]["buildStartedAt"] = manifest["lifecycle"].get("buildStartedAt") or now_iso()
    write_json(run_dir / "manifest.json", manifest)
    persist_run_state(run_id, manifest, progress)
    append_run_event({"ts": now_iso(), "runId": run_id, "stage": progress["status"]})
    control["runLock"] = run_lock
    control["manifestRef"] = manifest
    control["progressRef"] = progress
    control["configState"] = runtime_state
    stage_cursors = {"preprocess": 0, "extract": 0}

    def get_runtime_state() -> Dict[str, Any]:
        current_state = control.get("configState")
        return current_state if isinstance(current_state, dict) else runtime_state

    def current_config_by_id() -> Dict[str, BuilderConfig]:
        return get_runtime_state().get("configById", {})

    def ensure_config_stat(config_id: str) -> Dict[str, Any]:
        stat = progress.setdefault("configStats", {}).get(config_id)
        if stat is None:
            config = current_config_by_id().get(config_id)
            if config is not None:
                current_counts = get_runtime_state().get("stageCounts", {}).get("primary", {})
                stat = config_stat_payload(config, assigned_records=current_counts.get(config_id, 0))
            else:
                stat = {
                    "configId": config_id,
                    "configName": config_id or "unknown",
                    "assignedRecords": 0,
                    "completedRecords": 0,
                    "succeededRecords": 0,
                    "failedRecords": 0,
                    "stageRole": "all",
                    "concurrency": 30,
                    "requestsPerMinute": 800,
                    "apiMode": "chat_completions",
                    "chatCompletionsSystemRole": "system",
                    "model": "",
                    **config_runtime_defaults(),
                }
            progress["configStats"][config_id] = stat
        for key, value in config_runtime_defaults().items():
            stat.setdefault(key, value)
        return stat

    def recompute_tripped_config_count() -> None:
        progress["trippedConfigCount"] = sum(
            1 for item in progress.get("configStats", {}).values() if item.get("circuitOpen")
        )

    async def persist_progress_state() -> None:
        sync_progress_config_stats(progress, get_runtime_state())
        await write_json_async(run_dir / "progress.json", progress)
        await persist_run_state_async(run_id, manifest, progress)

    def maybe_auto_pause_for_stage_locked(stage_name: str) -> bool:
        exhausted_stages = exhausted_stage_pools(manifest, progress)
        if stage_name not in exhausted_stages:
            return False
        if not control["resumeEvent"].is_set() and clean_text(progress.get("pauseCode")) == "all_configs_circuit_open":
            return True
        control["resumeEvent"].clear()
        pause_run_execution(
            run_id,
            manifest,
            progress,
            pause_code="all_configs_circuit_open",
            reason=f"all active {stage_name} configs are circuit-open",
            pause_hint="推荐先在设置中修复或更换配置，再继续运行。",
            log_stage="auto_pause_all_circuits",
            log_message="run auto-paused because all active configs are circuit-open",
            event_stage="auto_paused",
            extra_log={
                "stageRole": stage_name,
                "configIds": get_runtime_state().get("stageConfigIds", {}).get(stage_name, []),
            },
            extra_event={"stageRole": stage_name},
        )
        return True

    async def record_config_selection(
        stage_name: str,
        preferred_config_id: str,
        selected_config_id: str,
        record_index: int,
        record_id: str,
        reason: str,
    ) -> Optional[Dict[str, Any]]:
        switch_payload: Optional[Dict[str, Any]] = None
        async with run_lock:
            selected_stat = ensure_config_stat(selected_config_id)
            selected_stat["selectionCount"] += 1
            selected_stat["lastSelectedAt"] = now_iso()
            if selected_config_id != preferred_config_id:
                preferred_stat = ensure_config_stat(preferred_config_id)
                preferred_stat["reroutedAttempts"] += 1
                selected_stat["takeoverAttempts"] += 1
                progress["autoSwitchCount"] = int(progress.get("autoSwitchCount") or 0) + 1
                await persist_progress_state()
                switch_payload = {
                    "level": "warning",
                    "stage": "config_failover",
                    "recordIndex": record_index,
                    "recordId": record_id,
                    "configId": preferred_config_id,
                    "selectedConfigId": selected_config_id,
                    "reason": reason,
                    "message": f"{stage_name} 配置切换：{preferred_config_id} -> {selected_config_id}",
                }
        return switch_payload

    async def note_config_success(config_id: str) -> None:
        async with run_lock:
            stat = ensure_config_stat(config_id)
            stat["successCount"] += 1
            stat["consecutiveErrors"] = 0
            stat["lastSuccessAt"] = now_iso()

    async def note_token_usage(config_id: str, stage_role: str, stage_name: str, usage: Dict[str, int]) -> None:
        async with run_lock:
            stat = ensure_config_stat(config_id)
            merged_stat_usage = merge_token_usage(stat, usage)
            stat.update(merged_stat_usage)
            progress["tokenUsage"] = merge_token_usage(progress.get("tokenUsage"), usage)
            await persist_progress_state()

    async def note_config_failure(config_id: str, error_text: str) -> Optional[Dict[str, Any]]:
        async with run_lock:
            stat = ensure_config_stat(config_id)
            stat["errorCount"] += 1
            stat["consecutiveErrors"] += 1
            stat["lastError"] = error_text
            stat["lastErrorAt"] = now_iso()
            if not stat.get("circuitOpen") and int(stat.get("consecutiveErrors") or 0) >= CONFIG_FAILOVER_THRESHOLD:
                stat["circuitOpen"] = True
                stat["circuitTrips"] += 1
                stat["circuitOpenedAt"] = now_iso()
                recompute_tripped_config_count()
                affected_stages = [
                    stage_name
                    for stage_name, config_ids in get_runtime_state().get("stageConfigIds", {}).items()
                    if config_id in config_ids
                ]
                auto_paused = any(maybe_auto_pause_for_stage_locked(stage_name) for stage_name in affected_stages)
                if not auto_paused:
                    await persist_progress_state()
                return {
                    "level": "error",
                    "stage": "config_circuit_open",
                    "configId": config_id,
                    "message": f"配置 {config_id} 连续错误达到 {CONFIG_FAILOVER_THRESHOLD} 次，已熔断",
                }
        return None

    async def select_effective_config(
        stage_name: str,
        position: int,
        record_index: int,
        record_id: str,
    ) -> Tuple[BuilderConfig, Optional[Dict[str, Any]]]:
        eligible_ids = get_runtime_state().get("stageConfigIds", {}).get(stage_name, [])
        if not eligible_ids:
            raise HTTPException(status_code=400, detail=f"{stage_name} 没有可用配置")

        while True:
            runtime = get_runtime_state()
            eligible_ids = runtime.get("stageConfigIds", {}).get(stage_name, [])
            if not eligible_ids:
                raise HTTPException(status_code=400, detail=f"{stage_name} 娌℃湁鍙敤閰嶇疆")

            stage_slots = runtime.get("stageSlots", {}).get(stage_name) or eligible_ids
            preferred_config_id = stage_slots[position % len(stage_slots)]
            pause_requested = False
            async with run_lock:
                runtime = get_runtime_state()
                eligible_ids = runtime.get("stageConfigIds", {}).get(stage_name, [])
                if not eligible_ids:
                    raise HTTPException(status_code=400, detail=f"{stage_name} 娌℃湁鍙敤閰嶇疆")
                stage_slots = runtime.get("stageSlots", {}).get(stage_name) or eligible_ids
                preferred_config_id = stage_slots[position % len(stage_slots)]
                preferred_stat = ensure_config_stat(preferred_config_id)
                if not preferred_stat.get("circuitOpen"):
                    selected_id = preferred_config_id
                    reason = "preferred_available"
                else:
                    healthy_ids = [
                        config_id
                        for config_id in eligible_ids
                        if not ensure_config_stat(config_id).get("circuitOpen")
                    ]
                    if healthy_ids:
                        cursor = stage_cursors[stage_name] % len(healthy_ids)
                        selected_id = healthy_ids[cursor]
                        stage_cursors[stage_name] = (cursor + 1) % len(healthy_ids)
                        reason = "preferred_circuit_open"
                    else:
                        pause_requested = maybe_auto_pause_for_stage_locked(stage_name)
                        selected_id = ""
                        reason = "all_configs_circuit_open"

            if pause_requested:
                await wait_for_run_resume(run_id)
                continue

            switch_payload = await record_config_selection(
                stage_name,
                preferred_config_id,
                selected_id,
                record_index,
                record_id,
                reason,
            )
            selected_config = get_runtime_state().get("configById", {}).get(selected_id)
            if selected_config is None:
                raise HTTPException(status_code=409, detail=f"{stage_name} 閰嶇疆 {selected_id} 宸蹭笉鍙敤")
            return selected_config, switch_payload

    async def worker(primary_config_id: str, jobs: List[Tuple[int, int, Dict[str, Any]]]) -> None:
        async def process_one(position: int, index: int, record: Dict[str, Any]) -> None:
            await wait_for_run_resume(run_id)
            record_id = make_builder_record_id(index, run_id)
            current_runtime = get_runtime_state()
            preprocess_slots = current_runtime.get("stageSlots", {}).get("preprocess") or [primary_config_id]
            extract_slots = current_runtime.get("stageSlots", {}).get("extract") or preprocess_slots
            primary_preprocess_id = preprocess_slots[position % len(preprocess_slots)]
            primary_extract_id = extract_slots[position % len(extract_slots)]
            await log_run(
                run_dir,
                run_lock,
                {
                    "level": "info",
                    "stage": "start",
                    "recordIndex": index,
                    "recordId": record_id,
                    "configId": primary_preprocess_id,
                    "extractConfigId": primary_extract_id,
                    "message": "开始处理岗位记录",
                },
            )

            last_error: Optional[Exception] = None
            last_preprocess_config = current_config_by_id().get(primary_preprocess_id) or next(iter(current_config_by_id().values()))
            last_extract_config = current_config_by_id().get(primary_extract_id) or last_preprocess_config
            attempt_traces: List[Dict[str, Any]] = []
            last_type_validation_summary: Optional[Dict[str, Any]] = None
            record_had_error = False
            for attempt in range(1, options.maxAttemptsPerRecord + 1):
                await wait_for_run_resume(run_id)
                preprocess_config, preprocess_switch_log = await select_effective_config(
                    "preprocess",
                    position,
                    index,
                    record_id,
                )
                extract_config, extract_switch_log = await select_effective_config(
                    "extract",
                    position,
                    index,
                    record_id,
                )
                last_preprocess_config = preprocess_config
                last_extract_config = extract_config
                if preprocess_switch_log:
                    preprocess_switch_log["attempt"] = attempt
                    await log_run(run_dir, run_lock, preprocess_switch_log)
                if extract_switch_log:
                    extract_switch_log["attempt"] = attempt
                    await log_run(run_dir, run_lock, extract_switch_log)

                attempt_trace = {
                    "attempt": attempt,
                    "recordIndex": index,
                    "recordId": record_id,
                    "preprocessConfigId": preprocess_config.id,
                    "preprocessConfigName": preprocess_config.name,
                    "extractConfigId": extract_config.id,
                    "extractConfigName": extract_config.name,
                    "startedAt": now_iso(),
                    "stages": [],
                }
                try:
                    async with get_runtime_state()["preprocessSemaphores"][preprocess_config.id]:
                        result = await process_record_with_rate_limit(
                            record,
                            index,
                            preprocess_config,
                            get_runtime_state()["preprocessRateLimiters"][preprocess_config.id],
                            extract_config,
                            get_runtime_state()["extractRateLimiters"][extract_config.id],
                            get_runtime_state()["extractSemaphores"][extract_config.id],
                            run_id=run_id,
                            on_config_success=note_config_success,
                            on_token_usage=note_token_usage,
                            input_mode=input_mode,
                            debug_prompt_trace=attempt_trace,
                        )
                    result["processing"]["attempt"] = attempt
                    attempt_trace["status"] = "success"
                    attempt_trace["finishedAt"] = now_iso()
                    if attempt_traces:
                        result["processing"]["attemptTraces"] = attempt_traces + [attempt_trace]
                    if record_had_error:
                        async with run_lock:
                            await append_jsonl_async(run_dir / "attempt_traces.jsonl", attempt_trace)
                    async with run_lock:
                        await append_jsonl_async(run_dir / "results.jsonl", result)
                        merge_tech_capability_type_run_stats(
                            progress.setdefault("techCapabilityTypeValidation", empty_tech_capability_type_run_stats()),
                            ((result.get("processing") or {}).get("techCapabilityTypeValidation") or {}).get("finalPortrait") or {},
                            record_index=index,
                            record_id=result["recordId"],
                        )
                        progress["completedRecords"] += 1
                        progress["succeededRecords"] += 1
                        preprocess_stat = ensure_config_stat(preprocess_config.id)
                        preprocess_stat["completedRecords"] += 1
                        preprocess_stat["succeededRecords"] += 1
                        await persist_progress_state()
                    await log_run(
                        run_dir,
                        run_lock,
                        {
                            "level": "info",
                            "stage": "done",
                            "recordIndex": index,
                            "recordId": result["recordId"],
                            "configId": preprocess_config.id,
                            "extractConfigId": extract_config.id,
                            "attempt": attempt,
                            "message": "岗位画像生成完成",
                        },
                    )
                    return
                except Exception as exc:
                    last_error = exc
                    record_had_error = True
                    attempt_trace["status"] = "error"
                    attempt_trace["error"] = str(exc)
                    attempt_trace["finishedAt"] = now_iso()
                    if isinstance(exc, TechCapabilityTypeValidationError):
                        attempt_trace["techCapabilityTypeValidation"] = exc.validation
                        last_type_validation_summary = (exc.validation.get("finalPortrait") or {})
                    attempt_traces.append(attempt_trace)
                    attempt_error_payload = {
                        "runId": run_id,
                        "recordIndex": index,
                        "recordId": record_id,
                        "attempt": attempt,
                        "configId": preprocess_config.id,
                        "configName": preprocess_config.name,
                        "extractConfigId": extract_config.id,
                        "extractConfigName": extract_config.name,
                        "stageRole": "preprocess+extract",
                        "startedAt": attempt_trace["startedAt"],
                        "finishedAt": attempt_trace["finishedAt"],
                        "status": "error",
                        "errorStageName": attempt_trace.get("errorStageName"),
                        "error": str(exc),
                        "stages": attempt_trace["stages"],
                    }
                    if isinstance(exc, TechCapabilityTypeValidationError):
                        attempt_error_payload["techCapabilityTypeValidation"] = exc.validation
                    async with run_lock:
                        await append_jsonl_async(run_dir / "attempt_traces.jsonl", attempt_error_payload)
                    trip_payload = None
                    if isinstance(exc, ConfigExecutionError):
                        trip_payload = await note_config_failure(exc.config_id, str(exc))
                    await log_run(
                        run_dir,
                        run_lock,
                        {
                            "level": "warning" if attempt < options.maxAttemptsPerRecord else "error",
                            "stage": "retry" if attempt < options.maxAttemptsPerRecord else "error",
                            "recordIndex": index,
                            "recordId": record_id,
                            "configId": getattr(exc, "config_id", preprocess_config.id),
                            "extractConfigId": extract_config.id,
                            "attempt": attempt,
                            "message": str(exc),
                            "techCapabilityTypeValidation": exc.validation if isinstance(exc, TechCapabilityTypeValidationError) else None,
                        },
                    )
                    if trip_payload:
                        trip_payload["recordIndex"] = index
                        trip_payload["recordId"] = record_id
                        trip_payload["attempt"] = attempt
                        await log_run(run_dir, run_lock, trip_payload)
                    if attempt < options.maxAttemptsPerRecord:
                        await asyncio.sleep(min(2 * attempt, 6))

            failure_payload = {
                "recordIndex": index,
                "recordId": record_id,
                "sourceRaw": record,
                "configId": last_preprocess_config.id,
                "configName": last_preprocess_config.name,
                "extractConfigId": last_extract_config.id,
                "extractConfigName": last_extract_config.name,
                "error": str(last_error) if last_error else "unknown error",
                "attempts": options.maxAttemptsPerRecord,
                "failedAt": now_iso(),
            }
            if attempt_traces:
                failure_payload["attemptTraces"] = attempt_traces
            if last_type_validation_summary:
                failure_payload["techCapabilityTypeValidation"] = last_type_validation_summary
            async with run_lock:
                await append_jsonl_async(run_dir / "failures.jsonl", failure_payload)
                if last_type_validation_summary:
                    merge_tech_capability_type_run_stats(
                        progress.setdefault("techCapabilityTypeValidation", empty_tech_capability_type_run_stats()),
                        last_type_validation_summary,
                        record_index=index,
                        record_id=record_id,
                    )
                progress["completedRecords"] += 1
                progress["failedRecords"] += 1
                preprocess_stat = ensure_config_stat(last_preprocess_config.id)
                preprocess_stat["completedRecords"] += 1
                preprocess_stat["failedRecords"] += 1
                await persist_progress_state()
            await log_run(
                run_dir,
                run_lock,
                {
                    "level": "error",
                    "stage": "error",
                    "recordIndex": index,
                    "recordId": failure_payload["recordId"],
                    "configId": failure_payload["configId"],
                    "extractConfigId": failure_payload["extractConfigId"],
                    "attempt": options.maxAttemptsPerRecord,
                    "message": failure_payload["error"],
                },
            )

        await asyncio.gather(*(process_one(position, index, record) for position, index, record in jobs))

    try:
        await asyncio.gather(*(worker(config_id, jobs) for config_id, jobs in config_jobs.items()))
        result_rows = await read_jsonl_async(run_dir / "results.jsonl")
        portraits = [row["portrait"] for row in sorted(result_rows, key=lambda row: row["recordIndex"])]
        await write_json_async(run_dir / "portraits.json", portraits)
        embedding_artifact = await export_job_tag_embeddings(portraits, run_dir / "tag_embeddings.jsonl")
        append_embedding_log(
            run_dir,
            stage="tag_embedding_export",
            status="error" if clean_text(embedding_artifact.get("error")) else "ok",
            message=(
                "批次标签向量导出失败"
                if clean_text(embedding_artifact.get("error"))
                else "批次标签向量导出完成"
            ),
            details=embedding_artifact,
        )

        import_summary = {
            "runId": run_id,
            "applied": False,
            "autoApplyToJobLibrary": options.autoApplyToJobLibrary,
            "normalizeWithExistingTags": options.normalizeWithExistingTags,
            "reason": "auto apply disabled",
            "recordedAt": now_iso(),
            "tagEmbeddingArtifact": embedding_artifact,
        }
        if portraits and options.autoApplyToJobLibrary:
            import_summary = await execute_apply_import(
                run_id,
                portraits,
                normalize_with_existing=options.normalizeWithExistingTags,
                source="auto",
            )
            import_summary["tagEmbeddingArtifact"] = embedding_artifact
            manifest["latestApply"] = import_summary
            manifest["lifecycle"]["latestApplyAt"] = import_summary.get("importedAt") or now_iso()

        await write_json_async(run_dir / "import_summary.json", import_summary)
        manifest["status"] = "completed" if progress["failedRecords"] == 0 else "partial"
        manifest["autoImport"] = import_summary
        manifest["lifecycle"]["buildCompletedAt"] = now_iso()
        await write_json_async(run_dir / "manifest.json", manifest)
        clear_pause_metadata(progress)
        progress["status"] = manifest["status"]
        progress["completedAt"] = now_iso()
        await persist_progress(run_dir, run_lock, progress)
        await persist_run_state_async(run_id, manifest, progress)
        append_run_event(
            {
                "ts": now_iso(),
                "runId": run_id,
                "stage": "completed",
                "status": manifest["status"],
                "autoApplied": options.autoApplyToJobLibrary,
            }
        )
    except asyncio.CancelledError:
        final_status = "deleted" if control.get("deleteRequested") else "interrupted"
        if run_dir.exists():
            manifest = read_json(run_dir / "manifest.json", manifest)
            progress = read_json(run_dir / "progress.json", progress)
            manifest["status"] = final_status
            manifest.setdefault("lifecycle", {})
            manifest["lifecycle"]["buildCompletedAt"] = now_iso()
            clear_pause_metadata(progress)
            progress["status"] = final_status
            progress["completedAt"] = now_iso()
            write_run_snapshot(run_id, manifest, progress)
            await log_run(
                run_dir,
                run_lock,
                {"level": "warning", "stage": final_status, "message": "run cancelled"},
            )
        append_run_event({"ts": now_iso(), "runId": run_id, "stage": final_status})
        raise
    except Exception as exc:
        manifest["status"] = "failed"
        manifest.setdefault("lifecycle", {})
        manifest["lifecycle"]["buildCompletedAt"] = now_iso()
        write_json(run_dir / "manifest.json", manifest)
        clear_pause_metadata(progress)
        progress["status"] = "failed"
        progress["completedAt"] = now_iso()
        progress["fatalError"] = str(exc)
        await persist_progress(run_dir, run_lock, progress)
        await log_run(run_dir, run_lock, {"level": "fatal", "stage": "run", "message": str(exc)})
        persist_run_state(run_id, manifest, progress)
        append_run_event({"ts": now_iso(), "runId": run_id, "stage": "failed", "message": str(exc)})
    finally:
        RUN_TASKS.pop(run_id, None)
        control["runLock"] = None
        control["manifestRef"] = None
        control["progressRef"] = None
        control["configState"] = None
        if control.get("deleteRequested"):
            drop_run_control(run_id)
