"""Palette validator for the daily build series, standard library only.

A faithful port of scripts/validate_palette.js from the readback repository
(config mode). Run it on a palette JSON with a light and a dark mode:

    python palette_validator.py palette.json

The JSON holds, per mode: surface, raised (the card), ink, ink2, control,
categorical (8 colours), sequential (5), ordinal (5), diverging (9, odd, with
a neutral midpoint) and status (good, warning, serious, critical).

Checks and floors, the same as the series validator:
  categorical, adjacent pairs   lightness step 0.045 or chroma step 0.02,
                                normal vision delta E 12, worst colour vision
                                deficiency delta E 8, contrast 3.0 on surface
  first three slots, all pairs  the same pair checks
  sequential and ordinal        fill contrast 1.5 on surface, lightness moves
                                one way by at least 0.06 every step
  diverging                     midpoint chroma under 0.02, fill contrast 1.5,
                                each arm steps 0.06 in lightness outwards
  status                        contrast 3.0 on the surface and on the card
  ink, ink2, control            contrast 7.0, 4.5 and 3.0 on the surface
  every categorical slot        contrast 3.0 on the card
Prints a JSON summary and exits non zero on any failure.
"""

import json
import math
import sys

HARD = {
    "lightness": 0.045,
    "chroma": 0.02,
    "contrast": 3.0,
    "contrast_fill": 1.5,
    "delta_normal": 12.0,
    "delta_cvd": 8.0,
    "ordinal_step": 0.06,
}

CVD = {
    "protanopia": [[0.1121, 0.8853, -0.0005], [0.1127, 0.8897, -0.0001], [0.0045, 0.0, 1.0]],
    "deuteranopia": [[0.292, 0.7054, -0.0003], [0.2934, 0.7089, 0.0], [-0.0209, 0.0272, 0.9979]],
    "tritanopia": [[1.0, 0.1502, -0.1387], [0.0, 0.8595, 0.1405], [0.0, 0.2645, 0.7355]],
}


def parse_hex(value):
    v = value.strip().lstrip("#")
    if len(v) != 6:
        raise ValueError("Not a six digit hex colour: " + value)
    return [int(v[i:i + 2], 16) / 255 for i in (0, 2, 4)]


def to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def oklab(rgb):
    r, g, b = (to_linear(c) for c in rgb)
    l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    return (
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    )


def oklch(rgb):
    L, a, b = oklab(rgb)
    return L, math.hypot(a, b)


def luminance(rgb):
    r, g, b = (to_linear(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def simulate(rgb, kind):
    lin = [to_linear(c) for c in rgb]
    out = []
    for row in CVD[kind]:
        c = row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]
        c = min(1.0, max(0.0, c))
        out.append(c * 12.92 if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055)
    return out


def delta_e(a, b):
    x, y = oklab(a), oklab(b)
    return 100 * math.sqrt(sum((p - q) ** 2 for p, q in zip(x, y)))


def worst_cvd(a, b):
    return min(delta_e(simulate(a, k), simulate(b, k)) for k in CVD)


def check_list(hexes, surface_hex, pairs="adjacent", ordinal=False, diverging=False):
    cols = [parse_hex(h) for h in hexes]
    surface = parse_hex(surface_hex)
    rows = []
    mid = -1
    if diverging:
        if len(cols) % 2 == 0:
            raise ValueError("A diverging scale needs an odd number of steps.")
        mid = (len(cols) - 1) // 2
        _, chroma = oklch(cols[mid])
        rows.append(("diverging midpoint is neutral", hexes[mid], round(chroma, 4), chroma < 0.02))
    for i, rgb in enumerate(cols):
        if i == mid:
            continue
        floor = HARD["contrast_fill"] if (ordinal or diverging) else HARD["contrast"]
        ratio = contrast(rgb, surface)
        label = "contrast vs surface (fill)" if (ordinal or diverging) else "contrast vs surface"
        rows.append((label, hexes[i], round(ratio, 2), ratio >= floor))
    if not (ordinal or diverging):
        if pairs == "all":
            idx = [(i, j) for i in range(len(cols)) for j in range(i + 1, len(cols))]
        else:
            idx = [(i, i + 1) for i in range(len(cols) - 1)]
        for i, j in idx:
            subject = hexes[i] + " to " + hexes[j]
            l1, c1 = oklch(cols[i])
            l2, c2 = oklch(cols[j])
            sep = abs(l1 - l2) >= HARD["lightness"] or abs(c1 - c2) >= HARD["chroma"]
            rows.append(("lightness or chroma separation", subject, round(abs(l1 - l2), 3), sep))
            n = delta_e(cols[i], cols[j])
            rows.append(("normal vision delta E", subject, round(n, 1), n >= HARD["delta_normal"]))
            w = worst_cvd(cols[i], cols[j])
            rows.append(("worst colour vision deficiency delta E", subject, round(w, 1), w >= HARD["delta_cvd"]))
    if diverging:
        light = [oklch(c)[0] for c in cols]
        arms = [list(range(mid, -1, -1)), list(range(mid, len(cols)))]
        for arm in arms:
            for k in range(len(arm) - 1):
                a, b = arm[k], arm[k + 1]
                step = abs(light[b] - light[a])
                rows.append(("arm lightness step", hexes[a] + " to " + hexes[b], round(step, 3), step >= HARD["ordinal_step"]))
    elif ordinal:
        light = [oklch(c)[0] for c in cols]
        ascending = light[-1] > light[0]
        for i in range(len(light) - 1):
            step = light[i + 1] - light[i]
            signed = step if ascending else -step
            rows.append(("ordinal lightness step", hexes[i] + " to " + hexes[i + 1], round(signed, 3), signed >= HARD["ordinal_step"]))
    return rows


def validate_system(config):
    summary = {}
    total = 0
    for mode, p in config.items():
        s = p["surface"]
        results = {
            "categorical": check_list(p["categorical"], s),
            "firstThreeAllPairs": check_list(p["categorical"][:3], s, pairs="all"),
            "sequential": check_list(p["sequential"], s, ordinal=True),
            "ordinal": check_list(p["ordinal"], s, ordinal=True),
            "diverging": check_list(p["diverging"], s, diverging=True),
        }
        extra = []
        for name, hexv in p["status"].items():
            r = contrast(parse_hex(hexv), parse_hex(s))
            extra.append(("status " + name + " contrast", hexv, round(r, 2), r >= 3.0))
        for key, floor, label in (("ink", 7.0, "primary ink contrast"), ("ink2", 4.5, "secondary ink contrast"), ("control", 3.0, "control gray contrast")):
            r = contrast(parse_hex(p[key]), parse_hex(s))
            extra.append((label, p[key], round(r, 2), r >= floor))
        for hexv in p["categorical"]:
            r = contrast(parse_hex(hexv), parse_hex(p["raised"]))
            extra.append(("card contrast", hexv, round(r, 2), r >= 3.0))
        for name, hexv in p["status"].items():
            r = contrast(parse_hex(hexv), parse_hex(p["raised"]))
            extra.append(("status " + name + " card contrast", hexv, round(r, 2), r >= 3.0))

        def worst(rows, prefix):
            vals = [v for (check, _, v, _) in rows if check.startswith(prefix)]
            return min(vals) if vals else None

        failing = [k + ": " + c + " " + subj for k, rows in results.items() for (c, subj, _, ok) in rows if not ok]
        failing += [c + " " + subj for (c, subj, _, ok) in extra if not ok]
        cat = results["categorical"]
        summary[mode] = {
            "failures": len(failing),
            "worstAdjacentCvd": worst(cat, "worst colour"),
            "worstAdjacentNormal": worst(cat, "normal vision"),
            "worstSlotContrast": worst(cat, "contrast"),
            "worstCardContrast": worst(extra, "card contrast"),
            "firstThreeAllPairsCvd": worst(results["firstThreeAllPairs"], "worst colour"),
            "failingChecks": failing,
        }
        total += len(failing)
    return {"failures": total, "modes": summary}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python palette_validator.py palette.json")
        sys.exit(2)
    with open(sys.argv[1], encoding="utf-8") as fh:
        report = validate_system(json.load(fh))
    print(json.dumps(report, indent=2))
    sys.exit(0 if report["failures"] == 0 else 1)
