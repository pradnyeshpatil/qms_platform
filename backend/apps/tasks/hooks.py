"""Lets the module that generated a task (an 8D action row) react when the task changes, without `tasks` importing it.

    register_source("eight_d_d3_action", lambda task: ...)
"""
from collections.abc import Callable

_SOURCES: dict[str, Callable] = {}


def register_source(source_type: str, on_change: Callable) -> None:
    _SOURCES[source_type] = on_change


def notify_source(task) -> None:
    hook = _SOURCES.get(task.source_type)
    if hook is not None and task.source_id:
        hook(task)
