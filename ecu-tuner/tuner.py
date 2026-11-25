"""Read and edit known maps on Audi A4 BFB ME7.5 8E0909518AQ / SW 372505.

Edits stay on addresses verified for this software. Other bins are rejected.
"""
from __future__ import annotations

import hashlib
import struct
from typing import Any

SIZE = 0x100000
RL = 0.0234375

IDENT = {
    0x1001D: b"U24H4AQ01",
    0x118F2: b"8E0909518AQ",
    0x183BC: b"372505",
}

LDRXN = 0x29C68
LDRXNZK = 0x29CAA
LAMFA = 0x26E66
LAMFA_RPM = 0x26E4A
LAMFA_ROWS, LAMFA_COLS = 15, 6
KFZW = 0x12850
KFZW2 = 0x12910
KFZW_ROWS, KFZW_COLS = 16, 12
KFZWOP = 0x11C2C
KFZWOP2 = 0x11CDC
KFZWOP_ROWS, KFZWOP_COLS = 16, 11
KFMIRL = 0x1EFD4
NMAX = 0x168FE
CDKAT = 0x181A3
LOPE_AT = 0xB8944
LOPE_ON = bytes.fromhex("da8c0000")
LOPE_OFF = bytes.fromhex("f3f8f089")

# Fraction of the requested peak. None = leave the 1000 rpm cell alone.
SMOOTH = (
    (1000, None),
    (1500, 0.78),
    (1750, 0.90),
    (1950, 0.97),
    (2250, 1.00),
    (2500, 1.00),
    (3000, 1.00),
    (3500, 1.00),
    (4000, 1.00),
    (4500, 0.995),
    (5000, 0.985),
    (5500, 0.97),
    (5700, 0.96),
    (5900, 0.95),
    (6100, 0.90),
    (6700, 0.85),
)


def u16(d: bytes, a: int) -> int:
    return d[a] | (d[a + 1] << 8)


def put_u16(d: bytearray, a: int, v: int) -> None:
    struct.pack_into("<H", d, a, max(0, min(0xFFFF, int(v))))


def s8(b: int) -> int:
    return b - 256 if b > 127 else b


def check_ident(d: bytes) -> str | None:
    if len(d) != SIZE:
        return "размер не 1 МБ (нужен полный дамп 1048576 байт)"
    for addr, sig in IDENT.items():
        if d[addr : addr + len(sig)] != sig:
            return "это не 8E0909518AQ / 372505 — крутилки только для этой прошивки"
    return None


def curve(d: bytes, addr: int) -> tuple[list[float], list[int]]:
    n = u16(d, addr)
    if not 4 <= n <= 24:
        raise ValueError("битая кривая LDRXN")
    rpm = [u16(d, addr + 2 + 2 * i) / 4 for i in range(n)]
    raw = [u16(d, addr + 2 + 2 * n + 2 * i) for i in range(n)]
    return rpm, raw


def write_curve_data(d: bytearray, addr: int, raw: list[int]) -> None:
    n = u16(d, addr)
    if n != len(raw):
        raise ValueError("длина кривой не сходится")
    base = addr + 2 + 2 * n
    for i, v in enumerate(raw):
        put_u16(d, base + 2 * i, v)


def smooth_frac(rpm: float) -> float | None:
    pts = SMOOTH
    if rpm <= pts[0][0] + 50:
        return None
    if rpm >= pts[-1][0]:
        return pts[-1][1]
    for (r0, f0), (r1, f1) in zip(pts, pts[1:]):
        if r0 <= rpm <= r1 and f0 is not None and f1 is not None:
            t = (rpm - r0) / (r1 - r0)
            return f0 + (f1 - f0) * t
    return 1.0


def analyze(d: bytes) -> dict[str, Any]:
    err = check_ident(d)
    if err:
        raise ValueError(err)
    rpm, raw = curve(d, LDRXN)
    _, raw_zk = curve(d, LDRXNZK)
    pct = [round(v * RL, 1) for v in raw]
    peak = max(pct[1:]) if len(pct) > 1 else max(pct)
    by = {int(r): p for r, p in zip(rpm, pct)}
    low = by.get(1750) or pct[min(2, len(pct) - 1)]
    mid = by.get(1950) or pct[min(3, len(pct) - 1)]
    cliff = round(mid / low, 2) if low else 1.0

    lamfa_wot = []
    for r in range(LAMFA_ROWS):
        if d[LAMFA_RPM + r] * 40 < 2200:
            continue
        lamfa_wot.append(d[LAMFA + LAMFA_COLS * r + 5] / 128)
    lamfa_avg = round(sum(lamfa_wot) / len(lamfa_wot), 3) if lamfa_wot else 0

    pop = 0
    for base in (KFZWOP, KFZWOP2):
        for i in range(KFZWOP_ROWS * KFZWOP_COLS):
            if s8(d[base + i]) < 0:
                pop += 1

    kmax = max(u16(d, KFMIRL + 2 * i) * RL for i in range(256))
    lope = d[LOPE_AT : LOPE_AT + 4] == LOPE_ON

    return {
        "ok": True,
        "sha256": hashlib.sha256(d).hexdigest(),
        "ecu": "8E0909518AQ",
        "sw": "372505",
        "rpm": [int(r) for r in rpm],
        "ldrxn": pct,
        "ldrxnzk": [round(v * RL, 1) for v in raw_zk],
        "peak": round(peak, 1),
        "at_1500": by.get(1500),
        "at_1750": by.get(1750),
        "at_1950": by.get(1950),
        "cliff": cliff,
        "lamfa_wot": lamfa_avg,
        "kfmirl_max": round(kmax, 1),
        "popcorn_cells": pop,
        "lope": lope,
        "nmax": u16(d, NMAX) / 4,
        "cdkat": d[CDKAT],
        "notes": _notes(peak, cliff, lamfa_avg, pop, lope),
    }


def _notes(peak: float, cliff: float, lamfa: float, pop: int, lope: bool) -> list[str]:
    out = []
    if lope:
        out.append("Включён ASM idle-lope (хук 0xB8944). На 2-й передаче из‑за него машина вставала колом.")
    if pop > 8:
        out.append(f"Попкорн в KFZWOP: {pop} отрицательных ячеек. Греет выпуск на сбросе газа.")
    if cliff >= 1.15:
        out.append(f"Скачок наддува {cliff:.2f}× между 1750 и 1950 — с низов пусто, потом хватает.")
    if peak >= 165:
        out.append(f"Пик LDRXN {peak:.0f}% для сток K03 высокий: ЭБУ режет и отпускает, коллектор греется.")
    elif peak >= 155:
        out.append(f"Пик LDRXN {peak:.0f}%. На длинном полном газу выпуск уже может краснеть.")
    if lamfa >= 0.90:
        out.append(f"Лямбда на полном газу ~{lamfa:.2f}. Для жары лучше богаче (меньше число).")
    if not out:
        out.append("Явных ловушек этой прошивки не видно. Крутилки всё равно меняют только известные карты.")
    return out


def recommend(info: dict[str, Any]) -> dict[str, Any]:
    """Rule set for this ECU. Not a model that rewrites arbitrary bytes."""
    sliders = {
        "peak": info["peak"],
        "smooth": False,
        "fuel": 0,
        "timing": 0,
        "popcorn": "keep",
        "lope": "keep",
    }
    why = []
    if info["lope"]:
        sliders["lope"] = "off"
        why.append("Lope выключен — остаётся тяга, уходит кол на 2-й.")
    if info["popcorn_cells"] > 8:
        sliders["popcorn"] = "off"
        why.append("Попкорн выключен — меньше жара на сбросе.")
    if info["peak"] >= 158 or info["cliff"] >= 1.15:
        sliders["smooth"] = True
        sliders["peak"] = 150
        why.append("Наддув выставлен гладкой полкой 150%: есть низ и нет скачка, из‑за которого K03 дёргает.")
    if info["lamfa_wot"] >= 0.88:
        sliders["fuel"] = 8
        why.append("Смесь на полном газу богаче примерно на 8%, чтобы коллектор не калил.")
    if info["peak"] >= 155:
        sliders["timing"] = 2
        why.append("На высокой нагрузке −1.5° зажигания. Сильный ретард сам греет выпуск, поэтому только чуть.")
    if not why:
        why.append("Менять почти нечего. Ползунки стоят на текущих значениях файла.")
    return {"sliders": sliders, "why": why}


def _clamp_sliders(info: dict[str, Any], s: dict[str, Any]) -> dict[str, Any]:
    peak = float(s.get("peak", info["peak"]))
    peak = max(120.0, min(180.0, peak))
    fuel = int(s.get("fuel", 0))
    fuel = max(0, min(15, fuel))
    timing = int(s.get("timing", 0))
    timing = max(0, min(6, timing))
    return {
        "peak": peak,
        "smooth": bool(s.get("smooth")),
        "fuel": fuel,
        "timing": timing,
        "popcorn": "off" if s.get("popcorn") == "off" else "keep",
        "lope": "off" if s.get("lope") == "off" else "keep",
    }


def apply(original: bytes, sliders: dict[str, Any]) -> tuple[bytearray, dict[str, Any]]:
    err = check_ident(original)
    if err:
        raise ValueError(err)
    info = analyze(original)
    s = _clamp_sliders(info, sliders)
    d = bytearray(original)
    rpm, raw = curve(d, LDRXN)
    _, raw_zk = curve(d, LDRXNZK)
    delta = [a - b for a, b in zip(raw, raw_zk)]
    peak_now = max(raw[1:]) if len(raw) > 1 else max(raw)
    target_raw = s["peak"] / RL

    new_raw = []
    for r, old in zip(rpm, raw):
        if s["smooth"]:
            frac = smooth_frac(r)
            if frac is None:
                new_raw.append(old)
            else:
                new_raw.append(int(round(target_raw * frac)))
        else:
            if r <= 1100 or peak_now <= 0:
                new_raw.append(old)
            else:
                new_raw.append(int(round(old * target_raw / peak_now)))
    write_curve_data(d, LDRXN, new_raw)
    write_curve_data(d, LDRXNZK, [max(0, v - delta[i]) for i, v in enumerate(new_raw)])

    if s["fuel"]:
        factor = 1 - s["fuel"] / 100
        for row in range(LAMFA_ROWS):
            if original[LAMFA_RPM + row] * 40 < 1800:
                continue
            for col in (3, 4, 5):
                a = LAMFA + LAMFA_COLS * row + col
                v = d[a]
                if v < 0x80:
                    d[a] = max(0x64, int(round(v * factor)))

    if s["timing"]:
        for base in (KFZW, KFZW2):
            for row in range(KFZW_ROWS):
                for col in range(8, 12):
                    a = base + KFZW_COLS * row + col
                    v = s8(d[a]) - s["timing"]
                    d[a] = v & 0xFF

    if s["popcorn"] == "off":
        for base in (KFZWOP, KFZWOP2):
            for i in range(KFZWOP_ROWS * KFZWOP_COLS):
                if s8(d[base + i]) < 0:
                    d[base + i] = 0

    if s["lope"] == "off" and d[LOPE_AT : LOPE_AT + 4] == LOPE_ON:
        d[LOPE_AT : LOPE_AT + 4] = LOPE_OFF

    # Redline and catalyst stay as in the file.
    if u16(d, NMAX) != u16(original, NMAX) or d[CDKAT] != original[CDKAT]:
        raise RuntimeError("NMAX/CDKAT сдвинулись — правка отменена")
    return d, s
