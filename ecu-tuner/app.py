#!/usr/bin/env python3
"""Local tuner for one ECU: 8E0909518AQ SW 372505. Upload, read maps, set sliders, download."""
from __future__ import annotations

import os
import subprocess
import tempfile
import uuid
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

import tuner

HERE = Path(__file__).resolve().parent
ME7SUM = os.environ.get("ME7SUM", str(HERE / "bin" / "me7sum"))
SESSIONS: dict[str, bytes] = {}
MAX_SESSIONS = 6

app = Flask(__name__, static_folder=str(HERE / "static"))


def _remember(blob: bytes) -> str:
    while len(SESSIONS) >= MAX_SESSIONS:
        SESSIONS.pop(next(iter(SESSIONS)))
    sid = uuid.uuid4().hex
    SESSIONS[sid] = blob
    return sid


def _file() -> bytes:
    f = request.files.get("bin")
    if f is None:
        raise ValueError("файл не приложен")
    blob = f.read()
    if len(blob) > tuner.SIZE:
        raise ValueError("файл больше 1 МБ")
    return blob


def _checksum(blob: bytes) -> bytes:
    if not os.path.isfile(ME7SUM):
        raise RuntimeError("me7sum не найден, контрольную сумму посчитать нельзя")
    fd, path = tempfile.mkstemp(suffix=".bin")
    os.close(fd)
    try:
        open(path, "wb").write(blob)
        fixed = path + ".chk"
        run = subprocess.run([ME7SUM, path, fixed], capture_output=True, text=True)
        log = run.stdout + run.stderr
        if os.path.exists(fixed):
            os.replace(fixed, path)
        elif "No errors were found" not in log and "0 error" not in log:
            raise RuntimeError("me7sum не смог поправить суммы. Нужен полный дамп этого ЭБУ.\n" + log[-800:])
        check = subprocess.run([ME7SUM, path], capture_output=True, text=True)
        text = check.stdout + check.stderr
        if "0 error" not in text and "No errors were found" not in text:
            raise RuntimeError("после правки суммы не сошлись:\n" + text[-800:])
        return open(path, "rb").read()
    finally:
        for p in (path, path + ".chk"):
            if os.path.exists(p):
                os.remove(p)


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.post("/api/analyze")
def api_analyze():
    try:
        blob = _file()
        info = tuner.analyze(blob)
    except ValueError as e:
        return jsonify(ok=False, error=str(e)), 400
    sid = _remember(blob)
    rec = tuner.recommend(info)
    return jsonify(ok=True, id=sid, analysis=info, recommend=rec)


@app.post("/api/preview")
def api_preview():
    body = request.get_json(silent=True) or {}
    blob = SESSIONS.get(body.get("id") or "")
    if blob is None:
        return jsonify(ok=False, error="закинь файл ещё раз"), 400
    try:
        edited, used = tuner.apply(blob, body.get("sliders") or {})
        info = tuner.analyze(bytes(edited))
    except ValueError as e:
        return jsonify(ok=False, error=str(e)), 400
    return jsonify(ok=True, used=used, rpm=info["rpm"], ldrxn=info["ldrxn"], peak=info["peak"], lope=info["lope"], popcorn_cells=info["popcorn_cells"])


@app.post("/api/build")
def api_build():
    body = request.get_json(silent=True) or {}
    blob = SESSIONS.get(body.get("id") or "")
    if blob is None:
        return jsonify(ok=False, error="файл уже выгружен из памяти, закинь его ещё раз"), 400
    try:
        edited, used = tuner.apply(blob, body.get("sliders") or {})
        out = _checksum(bytes(edited))
        info = tuner.analyze(out)
    except (ValueError, RuntimeError) as e:
        return jsonify(ok=False, error=str(e)), 400
    name = "372505_tuned.bin"
    fd, path = tempfile.mkstemp(suffix=".bin")
    os.close(fd)
    open(path, "wb").write(out)
    resp = send_from_directory(
        os.path.dirname(path),
        os.path.basename(path),
        as_attachment=True,
        download_name=name,
    )
    resp.headers["X-Peak"] = str(info["peak"])
    resp.headers["X-Sha256"] = info["sha256"]
    resp.call_on_close(lambda: os.path.exists(path) and os.remove(path))
    return resp


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "8765")), debug=False)
