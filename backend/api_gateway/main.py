"""
Compatibility wrapper for the on-disk `api-gateway/` implementation.

The actual implementation lives in `backend/api-gateway/main.py`, but the
hyphenated directory name cannot be imported directly as a Python package.

This wrapper executes the implementation code into *this* module namespace,
so FastAPI route handlers and the module-level globals they reference remain
consistent with the test suite's monkeypatching.
"""

from __future__ import annotations

from pathlib import Path

_impl_path = Path(__file__).resolve().parents[1] / "api-gateway" / "main.py"

# Ensure the executed implementation sees the correct `__file__` and
# computes `backend_dir` relative to the real implementation location.
globals()["__file__"] = str(_impl_path)

with _impl_path.open("r", encoding="utf-8") as f:
    _code = f.read()

exec(compile(_code, str(_impl_path), "exec"), globals(), globals())

