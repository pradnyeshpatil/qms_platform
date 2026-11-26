"""Closing-time checks (PROJECT_SPEC §8: "open 8D reports or incomplete tasks produce a warning; blocking behaviour
configurable"). Modules that hang work off a complaint (8D reports, tasks) register a check here instead of the
complaints app importing them:

    register_closure_check(lambda complaint: [
        {"code": "open_tasks", "message": "2 tasks are still open.", "blocking": policy.blocks_closure}
    ] if open_tasks(complaint) else [])

A check returns a list of {"code", "message", "blocking"}. Blocking findings refuse the close (400); the rest are
returned as `warnings` on the response and recorded in the audit entry.
"""
from collections.abc import Callable

_CHECKS: list[Callable] = []


def register_closure_check(check: Callable) -> Callable:
    if check not in _CHECKS:
        _CHECKS.append(check)
    return check


def unregister_closure_check(check: Callable) -> None:
    if check in _CHECKS:
        _CHECKS.remove(check)


def run_closure_checks(complaint) -> list[dict]:
    findings = []
    for check in list(_CHECKS):
        for f in check(complaint) or []:
            findings.append({"code": f["code"], "message": f["message"], "blocking": bool(f.get("blocking"))})
    return findings
