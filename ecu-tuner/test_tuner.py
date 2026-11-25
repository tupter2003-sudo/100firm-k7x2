#!/usr/bin/env python3
"""Round-trip the 372505 map editor on a synthetic image with the real header strings."""
import struct
import tuner

RL = tuner.RL


def u16(d, a):
    return d[a] | (d[a + 1] << 8)


def make_bin():
    d = bytearray(b"\xff" * tuner.SIZE)
    for addr, sig in tuner.IDENT.items():
        d[addr : addr + len(sig)] = sig
    rpm = [1000, 1500, 1750, 1950, 2250, 2500, 3000, 3500, 4000, 4500, 5000, 5500, 5700, 5900, 6100, 6700]
    # Angry-like cliff: dead until 1950, then ~163%
    pct = [90.8, 110, 121, 163, 162, 157, 156, 156, 156, 157, 156, 153, 152, 150, 117, 115]
    n = len(rpm)
    for addr, shift in ((tuner.LDRXN, 0), (tuner.LDRXNZK, 4)):
        struct.pack_into("<H", d, addr, n)
        for i, r in enumerate(rpm):
            struct.pack_into("<H", d, addr + 2 + 2 * i, int(r * 4))
        for i, p in enumerate(pct):
            struct.pack_into("<H", d, addr + 2 + 2 * n + 2 * i, int(round((p - shift) / RL)))
    for r in range(15):
        d[tuner.LAMFA_RPM + r] = int((1000 + r * 400) / 40)
        for c in range(6):
            d[tuner.LAMFA + 6 * r + c] = 0x71 if c == 5 else 0x7D
    for i in range(256):
        struct.pack_into("<H", d, tuner.KFMIRL + 2 * i, int(180 / RL))
    for base in (tuner.KFZWOP, tuner.KFZWOP2):
        for i in range(tuner.KFZWOP_ROWS * tuner.KFZWOP_COLS):
            d[base + i] = 10
    for i in range(20):
        d[tuner.KFZWOP + i] = (-6) & 0xFF
        d[tuner.KFZWOP2 + i] = (-6) & 0xFF
    d[tuner.LOPE_AT : tuner.LOPE_AT + 4] = tuner.LOPE_ON
    struct.pack_into("<H", d, tuner.NMAX, 6800 * 4)
    d[tuner.CDKAT] = 3
    # KFZW high-load cells
    for base in (tuner.KFZW, tuner.KFZW2):
        for i in range(tuner.KFZW_ROWS * tuner.KFZW_COLS):
            d[base + i] = 20
    return bytes(d)


def test_reject_and_roundtrip():
    try:
        tuner.analyze(b"\x00" * 100)
        raise SystemExit("short file should fail")
    except ValueError:
        pass
    raw = make_bin()
    info = tuner.analyze(raw)
    assert info["lope"] is True
    assert info["peak"] == 163.0
    assert info["cliff"] > 1.2
    assert info["popcorn_cells"] == 40
    rec = tuner.recommend(info)
    assert rec["sliders"]["smooth"] is True
    assert rec["sliders"]["peak"] == 150
    assert rec["sliders"]["lope"] == "off"
    assert rec["sliders"]["popcorn"] == "off"
    out, used = tuner.apply(raw, rec["sliders"])
    after = tuner.analyze(out)
    assert after["lope"] is False
    assert after["popcorn_cells"] == 0
    assert after["peak"] == 150.0
    assert after["at_1500"] > info["at_1500"]
    assert after["nmax"] == 6800
    assert after["cdkat"] == 3
    assert out[tuner.LOPE_AT : tuner.LOPE_AT + 4] == tuner.LOPE_OFF
    # scale-only path keeps the cliff ratio
    scaled, _ = tuner.apply(raw, {"peak": 150, "smooth": False, "fuel": 0, "timing": 0, "popcorn": "keep", "lope": "keep"})
    sc = tuner.analyze(scaled)
    assert abs(sc["peak"] - 150) < 0.6
    assert sc["lope"] is True
    print("ok", "before", info["at_1500"], info["at_1950"], "after", after["at_1500"], after["at_1750"], after["at_1950"])


if __name__ == "__main__":
    test_reject_and_roundtrip()
