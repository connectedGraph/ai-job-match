from typing import Any, Dict, List

from .api_run_state import persist_run_state_async
from .api_storage import (
    append_embedding_log,
    append_jsonl_async,
    append_run_event,
    apply_progress_file,
    build_apply_progress,
    create_apply_snapshot,
    read_json,
    write_json_async,
)
from .api_utils import clean_text, now_iso, sanitize_value
from tag_sync import import_portraits_into_jobs


async def execute_apply_import(
    run_id: str,
    portraits: List[Dict[str, Any]],
    *,
    normalize_with_existing: bool,
    source: str,
    run_dir,
) -> Dict[str, Any]:
    manifest = read_json(run_dir / "manifest.json", {})
    progress = read_json(run_dir / "progress.json", {})
    apply_progress = build_apply_progress(
        run_id,
        status="running",
        normalize_with_existing=normalize_with_existing,
        source=source,
        percent=1,
        stage="prepare",
        message="准备归入岗位库",
    )
    await write_json_async(apply_progress_file(run_id), apply_progress)

    async def on_progress(event: Dict[str, Any]) -> None:
        apply_progress.update(
            {
                "status": "running",
                "percent": max(0, min(100, int(event.get("percent") or apply_progress.get("percent") or 0))),
                "stage": clean_text(event.get("stage")) or clean_text(apply_progress.get("stage")),
                "message": clean_text(event.get("message")) or clean_text(apply_progress.get("message")),
                "updatedAt": clean_text(event.get("ts")) or now_iso(),
            }
        )
        for key in [
            "embeddingStatus",
            "embeddingError",
            "embeddedTextsAdded",
            "embeddedTextsRequested",
            "pairwiseSpaceReady",
            "pairwiseSpacePoolCount",
            "pairwiseSpaceTagTypes",
            "pairwiseSpaceTextCount",
            "created",
            "updated",
            "imported",
            "importedAt",
        ]:
            if key in event:
                summary = dict(apply_progress.get("summary") or {})
                summary[key] = sanitize_value(event.get(key))
                apply_progress["summary"] = summary
        await write_json_async(apply_progress_file(run_id), apply_progress)

    try:
        import_summary = await import_portraits_into_jobs(
            portraits,
            run_id,
            normalize_with_existing=normalize_with_existing,
            before_commit=lambda context: create_apply_snapshot(run_id, context),
            progress_callback=on_progress,
        )
        append_embedding_log(
            run_dir,
            stage="job_import_embedding",
            status=clean_text(import_summary.get("embeddingStatus")) or "ok",
            message=(
                "岗位库归入阶段 embedding 出现问题"
                if clean_text(import_summary.get("embeddingError"))
                else "岗位库归入阶段 embedding 处理完成"
            ),
            details={
                "embeddingStatus": import_summary.get("embeddingStatus"),
                "embeddingError": import_summary.get("embeddingError"),
                "embeddedTextsAdded": import_summary.get("embeddedTextsAdded"),
                "embeddedTextsRequested": import_summary.get("embeddedTextsRequested"),
                "pairwiseSpaceReady": import_summary.get("pairwiseSpaceReady"),
                "pairwiseSpacePoolCount": import_summary.get("pairwiseSpacePoolCount"),
                "pairwiseSpaceTagTypes": import_summary.get("pairwiseSpaceTagTypes"),
                "pairwiseSpaceTextCount": import_summary.get("pairwiseSpaceTextCount"),
                "embeddingProfileId": import_summary.get("embeddingProfileId"),
                "embeddingProvider": import_summary.get("embeddingProvider"),
                "embeddingModel": import_summary.get("embeddingModel"),
                "normalizeWithExistingTags": import_summary.get("normalizeWithExistingTags"),
            },
        )
        await append_jsonl_async(run_dir / "apply_history.jsonl", import_summary)
        await write_json_async(run_dir / "import_summary.json", import_summary)
        manifest["latestApply"] = import_summary
        manifest.setdefault("lifecycle", {})
        manifest["lifecycle"]["latestApplyAt"] = import_summary.get("importedAt") or now_iso()
        await write_json_async(run_dir / "manifest.json", manifest)
        await persist_run_state_async(run_id, manifest, progress)
        append_run_event(
            {
                "ts": now_iso(),
                "runId": run_id,
                "stage": "applied",
                "source": source,
                "normalizeWithExistingTags": normalize_with_existing,
                "snapshotId": ((import_summary.get("snapshot") or {}).get("snapshotId")) or import_summary.get("snapshotId"),
            }
        )

        apply_progress.update(
            {
                "status": "completed",
                "percent": 100,
                "stage": "completed",
                "message": "岗位画像已成功归入岗位库",
                "completedAt": now_iso(),
                "updatedAt": now_iso(),
                "summary": sanitize_value(import_summary),
            }
        )
        await write_json_async(apply_progress_file(run_id), apply_progress)
        return import_summary
    except Exception as exc:
        apply_progress.update(
            {
                "status": "error",
                "stage": "error",
                "message": "岗位库归入失败",
                "error": str(exc),
                "completedAt": now_iso(),
                "updatedAt": now_iso(),
            }
        )
        await write_json_async(apply_progress_file(run_id), apply_progress)
        raise
