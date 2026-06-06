import asyncio
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from portrait_builder.api_client import AsyncRequestRateLimiter, call_model_messages, merge_token_usage
from portrait_builder.api_models import BuilderConfig
from tag_sync import IMPORT_LOCK, clean_text, load_jobs, now_iso, rebuild_tag_assets, save_jobs

from .job_data_service import ensure_jobs_fresh
from .tag_review_prompts import build_tag_review_user_prompt, get_tag_review_system_prompt
from .tag_review_service import (
    REVIEW_MODE_ALL,
    TAG_REVIEW_TASKS,
    _append_log,
    _persist_progress,
    annotate_candidates_with_review_stats,
    append_jsonl,
    append_sample,
    apply_review_decisions,
    build_candidate_summary,
    build_existing_exact_index,
    build_review_config,
    build_run_index_row,
    build_review_result_summary,
    build_review_stats_summary,
    checkpoint_path,
    clear_run_checkpoint,
    clear_run_control_action,
    collect_tag_review_candidates,
    collect_present_review_decision_keys,
    contains_cjk,
    deserialize_pending_decisions,
    empty_token_usage,
    ensure_tag_review_storage,
    get_tag_review_run_snapshot,
    latest_running_task,
    load_review_stats,
    load_run_candidates,
    load_run_checkpoint,
    load_run_control_action,
    load_run_request_config,
    mark_review_stats_applied,
    normalize_review_mode,
    parse_review_response,
    read_json,
    reconcile_orphaned_run_state,
    resolve_review_replacements,
    run_dir,
    save_run_candidates,
    save_run_checkpoint,
    save_run_request,
    select_candidates_for_review_mode,
    serialize_pending_decisions,
    summarize_config,
    touch_review_stats,
    upsert_run_index,
    write_json,
    write_run_control_action,
)


async def _execute_tag_review_run_v2(run_id: str, *, resume: bool = False) -> None:
    base = run_dir(run_id)
    manifest = read_json(base / "manifest.json", {})
    progress = read_json(base / "progress.json", {})

    config, max_attempts, review_mode = load_run_request_config(run_id)
    review_config = build_review_config(config)
    rate_limiter = AsyncRequestRateLimiter(max(1, int(review_config.requestsPerMinute or 800)))
    candidates = load_run_candidates(run_id)
    candidate_summary = manifest.get("candidateSummary") or build_candidate_summary(candidates)
    total_candidates = len(candidates)

    checkpoint = load_run_checkpoint(run_id) if resume else {}
    token_usage = checkpoint.get("tokenUsage") if isinstance(checkpoint.get("tokenUsage"), dict) else empty_token_usage()
    if not token_usage:
        token_usage = empty_token_usage()
    decision_summary = checkpoint.get("decisionSummary") if isinstance(checkpoint.get("decisionSummary"), dict) else build_review_result_summary()
    pending_decisions = deserialize_pending_decisions(checkpoint.get("pendingDecisions") or [])
    reviewed_candidates = int(checkpoint.get("reviewedCandidates") or 0)
    changed_candidates = int(checkpoint.get("changedCandidates") or 0)
    replaced_candidates = int(checkpoint.get("replacedCandidates") or 0)
    deleted_candidates = int(checkpoint.get("deletedCandidates") or 0)
    split_candidates = int(checkpoint.get("splitCandidates") or 0)
    unchanged_candidates = int(checkpoint.get("unchangedCandidates") or 0)
    failed_candidates = int(checkpoint.get("failedCandidates") or 0)
    updated_occurrences = int(checkpoint.get("updatedOccurrences") or 0)
    direct_normalized_occurrences = int(checkpoint.get("directNormalizedOccurrences") or 0)
    next_index = max(0, min(total_candidates, int(checkpoint.get("nextIndex") or progress.get("nextIndex") or 0)))

    progress.update(
        {
            "status": "running",
            "stage": "prepare" if next_index <= 0 else "review_tags",
            "message": "resuming tag review run" if resume else "starting tag review run",
            "startedAt": progress.get("startedAt") or now_iso(),
            "lastResumedAt": now_iso() if resume else progress.get("lastResumedAt"),
            "pausedAt": None,
            "resumeCount": int(progress.get("resumeCount") or 0) + (1 if resume else 0),
            "reviewMode": review_mode,
            "totalCandidates": total_candidates,
            "nextIndex": next_index,
            "updatedAt": now_iso(),
            "reviewedCandidates": reviewed_candidates,
            "changedCandidates": changed_candidates,
            "replacedCandidates": replaced_candidates,
            "deletedCandidates": deleted_candidates,
            "splitCandidates": split_candidates,
            "unchangedCandidates": unchanged_candidates,
            "failedCandidates": failed_candidates,
            "updatedOccurrences": updated_occurrences,
        }
    )
    manifest["status"] = "running"
    manifest["reviewMode"] = review_mode
    write_json(base / "manifest.json", manifest)
    await _persist_progress(run_id, progress)
    clear_run_control_action(run_id)

    async def emit_progress(percent: int, stage: str, message: str, **extra: Any) -> None:
        next_progress = {
            **progress,
            "status": "running",
            "percent": max(0, min(100, int(percent))),
            "stage": stage,
            "message": message,
            "updatedAt": now_iso(),
            **extra,
        }
        progress.update(next_progress)
        await _persist_progress(run_id, next_progress)

    async def emit_log(stage: str, message: str, payload: Optional[Dict[str, Any]] = None) -> None:
        await _append_log(
            run_id,
            {
                "ts": now_iso(),
                "stage": stage,
                "message": message,
                "payload": payload or {},
            },
        )

    def persist_checkpoint(current_next_index: int) -> None:
        save_run_checkpoint(
            run_id,
            {
                "nextIndex": max(0, min(total_candidates, int(current_next_index))),
                "reviewedCandidates": reviewed_candidates,
                "changedCandidates": changed_candidates,
                "replacedCandidates": replaced_candidates,
                "deletedCandidates": deleted_candidates,
                "splitCandidates": split_candidates,
                "unchangedCandidates": unchanged_candidates,
                "failedCandidates": failed_candidates,
                "updatedOccurrences": updated_occurrences,
                "directNormalizedOccurrences": direct_normalized_occurrences,
                "tokenUsage": token_usage,
                "decisionSummary": decision_summary,
                "pendingDecisions": serialize_pending_decisions(pending_decisions),
                "savedAt": now_iso(),
            },
        )

    async def maybe_pause(current_next_index: int) -> bool:
        if load_run_control_action(run_id) != "pause":
            return False
        persist_checkpoint(current_next_index)
        paused_at = now_iso()
        progress.update(
            {
                "status": "paused",
                "stage": "paused",
                "message": f"paused at {reviewed_candidates}/{total_candidates} reviewed candidates",
                "pausedAt": paused_at,
                "updatedAt": paused_at,
                "nextIndex": current_next_index,
                "reviewedCandidates": reviewed_candidates,
                "changedCandidates": changed_candidates,
                "replacedCandidates": replaced_candidates,
                "deletedCandidates": deleted_candidates,
                "splitCandidates": split_candidates,
                "unchangedCandidates": unchanged_candidates,
                "failedCandidates": failed_candidates,
                "updatedOccurrences": updated_occurrences,
            }
        )
        manifest["status"] = "paused"
        write_json(base / "manifest.json", manifest)
        await _persist_progress(run_id, progress)
        await emit_log(
            "paused",
            "tag review paused",
            {
                "nextIndex": current_next_index,
                "reviewedCandidates": reviewed_candidates,
                "totalCandidates": total_candidates,
                "reviewMode": review_mode,
            },
        )
        clear_run_control_action(run_id)
        return True

    try:
        async with IMPORT_LOCK:
            jobs = load_jobs()
            review_stats = load_review_stats()
            exact_index = build_existing_exact_index(jobs)

            await emit_log(
                "started" if not resume else "resumed",
                "tag review started" if not resume else "tag review resumed",
                {
                    "reviewMode": review_mode,
                    "totalCandidates": total_candidates,
                    "nextIndex": next_index,
                    "maxAttempts": max_attempts,
                    "config": summarize_config(review_config),
                    "candidateSummary": candidate_summary,
                },
            )

            if not candidates:
                final_result = {
                    "ok": True,
                    "reviewedCandidates": 0,
                    "changedCandidates": 0,
                    "replacedCandidates": 0,
                    "deletedCandidates": 0,
                    "splitCandidates": 0,
                    "unchangedCandidates": 0,
                    "failedCandidates": 0,
                    "updatedOccurrences": 0,
                    "directNormalizedOccurrences": 0,
                    "candidateSummary": candidate_summary,
                    "decisionSummary": decision_summary,
                    "reviewStatsSummary": build_review_stats_summary(review_stats),
                    "tokenUsage": token_usage,
                    "config": summarize_config(review_config),
                    "tagSummary": rebuild_tag_assets(jobs),
                    "reviewedAt": now_iso(),
                }
                progress.update({"status": "completed", "percent": 100, "stage": "completed", "message": "no tags require review", "completedAt": now_iso(), "updatedAt": now_iso()})
                manifest["status"] = "completed"
                manifest["completedAt"] = progress["completedAt"]
                write_json(base / "manifest.json", manifest)
                write_json(base / "result.json", final_result)
                clear_run_checkpoint(run_id)
                await _persist_progress(run_id, progress)
                await emit_log("completed", "tag review completed with no changes", {"reviewedCandidates": 0})
                return

            persist_checkpoint(next_index)
            await emit_progress(5 if next_index <= 0 else int(progress.get("percent") or 5), "review_tags" if next_index > 0 else "prepare", f"identified {total_candidates} tag review candidates", reviewMode=review_mode, totalCandidates=total_candidates, nextIndex=next_index, reviewedCandidates=reviewed_candidates, changedCandidates=changed_candidates, replacedCandidates=replaced_candidates, deletedCandidates=deleted_candidates, splitCandidates=split_candidates, unchangedCandidates=unchanged_candidates, failedCandidates=failed_candidates, updatedOccurrences=updated_occurrences)

            for candidate_index in range(next_index, total_candidates):
                if await maybe_pause(candidate_index):
                    return

                candidate = candidates[candidate_index]
                current_name = clean_text(candidate.get("currentName"))
                tag_type = clean_text(candidate.get("tagType"))
                sample_raw_texts = [clean_text(text) for text in (candidate.get("sampleRawTexts") or []) if clean_text(text)] or [clean_text(candidate.get("sampleRawText")) or current_name]
                sample_raw_text = sample_raw_texts[0] if sample_raw_texts else current_name
                system_prompt = get_tag_review_system_prompt(tag_type)
                user_prompt = build_tag_review_user_prompt(tag_type=tag_type, current_name=current_name, raw_texts=sample_raw_texts, current_name_contains_cjk=contains_cjk(current_name))

                last_error = ""
                replacement: Optional[Dict[str, Any]] = None
                for attempt in range(1, max_attempts + 1):
                    try:
                        response = await call_model_messages(review_config, [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}], rate_limiter=rate_limiter)
                        token_usage = merge_token_usage(token_usage, response.get("usage"))
                        replacement = parse_review_response(response.get("text"), tag_type, current_name)
                        break
                    except Exception as exc:
                        last_error = clean_text(str(exc)) or exc.__class__.__name__ or "unknown review error"
                        await emit_log("review_retry", "tag review retry scheduled", {"tagType": tag_type, "currentName": current_name, "candidateIndex": candidate_index + 1, "totalCandidates": total_candidates, "attempt": attempt, "maxAttempts": max_attempts, "error": last_error})
                        if attempt >= max_attempts:
                            break

                reviewed_candidates += 1
                next_index = candidate_index + 1
                percent = 8 + int((next_index / max(1, total_candidates)) * 84)

                if replacement is None:
                    final_error = last_error or "tag review response was not parsed"
                    stats_entry = touch_review_stats(review_stats, candidate, decision="failed", error=final_error)
                    failed_candidates += 1
                    append_sample(decision_summary["failed"], {"tagType": tag_type, "currentName": current_name, "sampleRawText": sample_raw_text, "sampleRawTexts": sample_raw_texts, "occurrenceCount": candidate.get("occurrenceCount"), "error": final_error, "reviewCount": int(stats_entry.get("reviewCount") or 0)}, ["tagType", "currentName"])
                    await emit_log("review_failed", "tag review failed", {"tagType": tag_type, "currentName": current_name, "candidateIndex": next_index, "totalCandidates": total_candidates, "sampleRawText": sample_raw_text, "error": final_error, "reviewCount": int(stats_entry.get("reviewCount") or 0)})
                    persist_checkpoint(next_index)
                    await emit_progress(percent, "review_tags", f"reviewed {next_index}/{total_candidates}; failed {failed_candidates}", reviewMode=review_mode, totalCandidates=total_candidates, nextIndex=next_index, reviewedCandidates=reviewed_candidates, changedCandidates=changed_candidates, replacedCandidates=replaced_candidates, deletedCandidates=deleted_candidates, splitCandidates=split_candidates, unchangedCandidates=unchanged_candidates, failedCandidates=failed_candidates, updatedOccurrences=updated_occurrences)
                    continue

                if replacement and replacement.get("action") == "unchanged":
                    stats_entry = touch_review_stats(review_stats, candidate, decision="unchanged")
                    unchanged_candidates += 1
                    append_sample(decision_summary["unchanged"], {"tagType": tag_type, "currentName": current_name, "sampleRawText": sample_raw_text, "sampleRawTexts": sample_raw_texts, "occurrenceCount": candidate.get("occurrenceCount"), "reviewCount": int(stats_entry.get("reviewCount") or 0)}, ["tagType", "currentName"])
                    persist_checkpoint(next_index)
                    await emit_progress(percent, "review_tags", f"reviewed {next_index}/{total_candidates}; unchanged {unchanged_candidates}", reviewMode=review_mode, totalCandidates=total_candidates, nextIndex=next_index, reviewedCandidates=reviewed_candidates, changedCandidates=changed_candidates, replacedCandidates=replaced_candidates, deletedCandidates=deleted_candidates, splitCandidates=split_candidates, unchangedCandidates=unchanged_candidates, failedCandidates=failed_candidates, updatedOccurrences=updated_occurrences)
                    continue

                action = clean_text(replacement.get("action"))
                resolved_replacements: List[str] = []
                direct_canonical_names: List[Optional[str]] = []
                direct_count = 0
                if action != "delete":
                    resolved_replacements, direct_canonical_names, direct_count = resolve_review_replacements(tag_type, replacement.get("replacements") or [], exact_index)
                    if action == "split" and len(resolved_replacements) <= 1:
                        action = "replace"

                changed_candidates += 1
                if action == "delete":
                    deleted_candidates += 1
                elif action == "split":
                    split_candidates += 1
                else:
                    replaced_candidates += 1

                pending_decisions[(tag_type, current_name.lower())] = {"action": action, "resolvedReplacements": resolved_replacements, "directCanonicalNames": direct_canonical_names, "directNormalizedCount": direct_count}
                display_replacement = "[DELETE]" if action == "delete" else " | ".join(resolved_replacements)
                stats_entry = touch_review_stats(review_stats, candidate, decision="deleted" if action == "delete" else action, replacement=display_replacement)
                append_sample(decision_summary["replaced"], {"tagType": tag_type, "currentName": current_name, "action": action, "replacement": display_replacement, "replacements": resolved_replacements, "sampleRawText": sample_raw_text, "sampleRawTexts": sample_raw_texts, "occurrenceCount": candidate.get("occurrenceCount"), "directNormalizedCount": direct_count, "reviewCount": int(stats_entry.get("reviewCount") or 0)}, ["tagType", "currentName", "action", "replacement"])
                await emit_log("review_deleted" if action == "delete" else ("review_split" if action == "split" else "review_replaced"), "tag deleted" if action == "delete" else ("tag split" if action == "split" else "tag replaced"), {"tagType": tag_type, "currentName": current_name, "candidateIndex": next_index, "totalCandidates": total_candidates, "action": action, "replacement": display_replacement, "replacements": resolved_replacements, "occurrenceCount": candidate.get("occurrenceCount"), "reviewCount": int(stats_entry.get("reviewCount") or 0)})
                persist_checkpoint(next_index)
                await emit_progress(percent, "review_tags", f"reviewed {next_index}/{total_candidates}; changed {changed_candidates}", reviewMode=review_mode, totalCandidates=total_candidates, nextIndex=next_index, reviewedCandidates=reviewed_candidates, changedCandidates=changed_candidates, replacedCandidates=replaced_candidates, deletedCandidates=deleted_candidates, splitCandidates=split_candidates, unchangedCandidates=unchanged_candidates, failedCandidates=failed_candidates, updatedOccurrences=updated_occurrences)

            if await maybe_pause(next_index):
                return

            applied_keys = collect_present_review_decision_keys(jobs, pending_decisions)
            updated_occurrences, direct_normalized_occurrences = apply_review_decisions(jobs, pending_decisions)
            await emit_progress(95, "save_jobs", f"writing back {updated_occurrences} updated tag occurrences", reviewMode=review_mode, totalCandidates=total_candidates, nextIndex=next_index, reviewedCandidates=reviewed_candidates, changedCandidates=changed_candidates, replacedCandidates=replaced_candidates, deletedCandidates=deleted_candidates, splitCandidates=split_candidates, unchangedCandidates=unchanged_candidates, failedCandidates=failed_candidates, updatedOccurrences=updated_occurrences)
            persist_checkpoint(next_index)
            save_jobs(jobs)
            tag_summary = rebuild_tag_assets(jobs)
            mark_review_stats_applied(review_stats, applied_keys, run_id=run_id)
            await ensure_jobs_fresh(embed_missing=False)
            final_result = {"ok": True, "reviewedCandidates": reviewed_candidates, "changedCandidates": changed_candidates, "replacedCandidates": replaced_candidates, "deletedCandidates": deleted_candidates, "splitCandidates": split_candidates, "unchangedCandidates": unchanged_candidates, "failedCandidates": failed_candidates, "updatedOccurrences": updated_occurrences, "directNormalizedOccurrences": direct_normalized_occurrences, "candidateSummary": candidate_summary, "decisionSummary": decision_summary, "reviewStatsSummary": build_review_stats_summary(review_stats), "tokenUsage": token_usage, "config": summarize_config(review_config), "tagSummary": tag_summary, "reviewedAt": now_iso()}
            progress.update({"status": "completed", "percent": 100, "stage": "completed", "message": "tag review completed", "completedAt": now_iso(), "updatedAt": now_iso(), "nextIndex": total_candidates, "reviewedCandidates": reviewed_candidates, "changedCandidates": changed_candidates, "replacedCandidates": replaced_candidates, "deletedCandidates": deleted_candidates, "splitCandidates": split_candidates, "unchangedCandidates": unchanged_candidates, "failedCandidates": failed_candidates, "updatedOccurrences": updated_occurrences})
            manifest["status"] = "completed"
            manifest["completedAt"] = progress["completedAt"]
            write_json(base / "manifest.json", manifest)
            write_json(base / "result.json", final_result)
            clear_run_checkpoint(run_id)
            clear_run_control_action(run_id)
            await _persist_progress(run_id, progress)
            await emit_log("completed", "tag review completed", {"reviewMode": review_mode, "reviewedCandidates": reviewed_candidates, "changedCandidates": changed_candidates, "replacedCandidates": replaced_candidates, "deletedCandidates": deleted_candidates, "splitCandidates": split_candidates, "failedCandidates": failed_candidates, "updatedOccurrences": updated_occurrences})
    except Exception as exc:
        progress.update({"status": "failed", "stage": "failed", "message": str(exc), "completedAt": now_iso(), "updatedAt": now_iso()})
        manifest["status"] = "failed"
        manifest["completedAt"] = progress["completedAt"]
        write_json(base / "manifest.json", manifest)
        write_json(base / "result.json", {"ok": False, "error": str(exc), "reviewedCandidates": reviewed_candidates, "changedCandidates": changed_candidates, "reviewedAt": now_iso()})
        persist_checkpoint(next_index)
        clear_run_control_action(run_id)
        await _persist_progress(run_id, progress)
        await _append_log(run_id, {"ts": now_iso(), "stage": "failed", "message": "tag review failed", "payload": {"error": str(exc)}})
    finally:
        TAG_REVIEW_TASKS.pop(run_id, None)
        reconcile_orphaned_run_state(run_id)


async def pause_tag_review_run(run_id: str) -> Dict[str, Any]:
    base = run_dir(run_id)
    manifest = read_json(base / "manifest.json", {})
    progress = read_json(base / "progress.json", {})
    if not manifest:
        return {}
    task = TAG_REVIEW_TASKS.get(run_id)
    if not task or task.done():
        reconcile_orphaned_run_state(run_id)
        return get_tag_review_run_snapshot(run_id)
    write_run_control_action(run_id, "pause")
    progress.update({"status": "pausing", "stage": "pausing", "message": "pause requested; waiting for current candidate to finish", "updatedAt": now_iso()})
    manifest["status"] = "pausing"
    write_json(base / "manifest.json", manifest)
    await _persist_progress(run_id, progress)
    await _append_log(run_id, {"ts": now_iso(), "stage": "pause_requested", "message": "pause requested", "payload": {}})
    return get_tag_review_run_snapshot(run_id)


async def resume_tag_review_run(run_id: str) -> Dict[str, Any]:
    base = run_dir(run_id)
    manifest = read_json(base / "manifest.json", {})
    progress = read_json(base / "progress.json", {})
    if not manifest:
        return {}
    active_run_id = latest_running_task()
    if active_run_id and active_run_id != run_id:
        raise RuntimeError(f"another tag review run is active: {active_run_id}")
    if active_run_id == run_id:
        return get_tag_review_run_snapshot(run_id)
    if not checkpoint_path(run_id).exists():
        raise RuntimeError("resume checkpoint is not available for this run")
    status = clean_text(progress.get("status") or manifest.get("status")).lower()
    if status not in {"paused", "stopped"}:
        raise RuntimeError(f"run cannot be resumed from status: {status or 'unknown'}")
    _ = load_run_request_config(run_id)
    clear_run_control_action(run_id)
    progress.update({"status": "queued", "stage": "queued", "message": "queued to resume", "updatedAt": now_iso()})
    manifest["status"] = "queued"
    write_json(base / "manifest.json", manifest)
    await _persist_progress(run_id, progress)
    TAG_REVIEW_TASKS[run_id] = asyncio.create_task(_execute_tag_review_run_v2(run_id, resume=True))
    return get_tag_review_run_snapshot(run_id)


async def restart_tag_review_run(run_id: str) -> Dict[str, Any]:
    if latest_running_task():
        raise RuntimeError("pause or wait for the active tag review run before restarting")
    config, max_attempts, review_mode = load_run_request_config(run_id)
    return await start_tag_review_run(config, max_attempts, review_mode, restart_of_run_id=run_id)


async def start_tag_review_run(
    config: BuilderConfig,
    max_attempts: int = 3,
    review_mode: str = REVIEW_MODE_ALL,
    restart_of_run_id: str = "",
) -> Dict[str, Any]:
    ensure_tag_review_storage()
    active_run_id = latest_running_task()
    if active_run_id:
        return get_tag_review_run_snapshot(active_run_id)

    review_mode = normalize_review_mode(review_mode)
    review_config = build_review_config(config)
    jobs = load_jobs()
    review_stats = load_review_stats()
    all_candidates = annotate_candidates_with_review_stats(collect_tag_review_candidates(jobs), review_stats)
    candidates, candidate_summary = select_candidates_for_review_mode(all_candidates, review_mode)

    run_id = f"tag_review_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"
    base = run_dir(run_id)
    base.mkdir(parents=True, exist_ok=True)

    manifest = {
        "runId": run_id,
        "status": "queued",
        "taskType": "tag_review",
        "createdAt": now_iso(),
        "completedAt": None,
        "config": summarize_config(review_config),
        "maxAttempts": int(max_attempts or 3),
        "scope": "all_tag_labels",
        "reviewMode": review_mode,
        "candidateSummary": candidate_summary,
        "reviewStatsSummary": build_review_stats_summary(review_stats),
        "restartOfRunId": clean_text(restart_of_run_id),
    }
    progress = {
        "status": "queued",
        "percent": 0,
        "stage": "queued",
        "message": "waiting to start",
        "createdAt": manifest["createdAt"],
        "startedAt": None,
        "lastResumedAt": None,
        "pausedAt": None,
        "completedAt": None,
        "updatedAt": manifest["createdAt"],
        "reviewMode": review_mode,
        "totalCandidates": len(candidates),
        "nextIndex": 0,
        "resumeCount": 0,
        "reviewedCandidates": 0,
        "changedCandidates": 0,
        "replacedCandidates": 0,
        "deletedCandidates": 0,
        "splitCandidates": 0,
        "unchangedCandidates": 0,
        "failedCandidates": 0,
        "updatedOccurrences": 0,
    }

    save_run_request(run_id, config, max_attempts, review_mode)
    save_run_candidates(run_id, candidates)
    clear_run_checkpoint(run_id)
    clear_run_control_action(run_id)
    write_json(base / "manifest.json", manifest)
    write_json(base / "progress.json", progress)
    write_json(base / "result.json", {})
    append_jsonl(base / "logs.jsonl", {"ts": now_iso(), "stage": "queued", "message": "tag review run queued", "payload": {"config": summarize_config(review_config), "maxAttempts": int(max_attempts or 3), "reviewMode": review_mode, "candidateSummary": candidate_summary, "restartOfRunId": clean_text(restart_of_run_id)}})
    upsert_run_index(build_run_index_row(run_id))
    TAG_REVIEW_TASKS[run_id] = asyncio.create_task(_execute_tag_review_run_v2(run_id, resume=False))
    return get_tag_review_run_snapshot(run_id)
