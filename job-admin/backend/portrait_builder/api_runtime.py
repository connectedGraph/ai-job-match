import asyncio
from typing import Any, Dict, Optional


RUN_TASKS: Dict[str, asyncio.Task] = {}
APPLY_TASKS: Dict[str, asyncio.Task] = {}
RUN_CONTROLS: Dict[str, Dict[str, Any]] = {}
CONFIG_FAILOVER_THRESHOLD = 3


def ensure_run_control(run_id: str) -> Dict[str, Any]:
    control = RUN_CONTROLS.get(run_id)
    if control is None:
        resume_event = asyncio.Event()
        resume_event.set()
        control = {
            "resumeEvent": resume_event,
            "deleteRequested": False,
            "runLock": None,
            "manifestRef": None,
            "progressRef": None,
            "configState": None,
        }
        RUN_CONTROLS[run_id] = control
    return control


def drop_run_control(run_id: str) -> None:
    RUN_CONTROLS.pop(run_id, None)


def active_run_task(run_id: str) -> Optional[asyncio.Task]:
    task = RUN_TASKS.get(run_id)
    if task is not None and task.done():
        RUN_TASKS.pop(run_id, None)
        task = None
    return task


def active_apply_task(run_id: str) -> Optional[asyncio.Task]:
    task = APPLY_TASKS.get(run_id)
    if task is not None and task.done():
        APPLY_TASKS.pop(run_id, None)
        task = None
    return task
