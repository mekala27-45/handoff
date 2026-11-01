"""Check a daily build prompt before it is handed over. Standard library only.

    python prompt_checker.py day-22-fastpath-prompt.md

Checks, each printed as PASS or FAIL:
  1  ASCII only (no curly quotes, no em or en dashes, no symbols)
  2  no apostrophes and no straight double quotes
  3  no double hyphen used as a dash
  4  none of the banned phrases (the series vocabulary gate)
  5  the five parts and the copy markers, in order
  6  Part 3 sections 1 to 21, in order
  7  section 17 lists build steps 1 to 24, and step 9 puts the API live
  8  section 20 is a checklist numbered 1 to 18
  9  Part 2 has the statement section and the locked rules block
Exits non zero if any check fails.
"""

import re
import sys

# Split so this file does not trip its own list.
PHRASES = (
    "lever" + "age", "del" + "ve", "seam" + "less", "cutting" + " edge",
    "cutting" + "-edge", "comprehen" + "sive", "state" + " of the art",
    "state" + "-of-the-art", "empo" + "wer", "unlo" + "ck", "ele" + "vate",
    "stream" + "line", "holi" + "stic", "syner" + "gy", "game" + " changing",
    "game" + "-changing", "game" + " changer", "next" + " generation",
    "best" + " in class", "util" + "ize", "facil" + "itate", "in" + " today's",
    "it is" + " worth noting", "tape" + "stry", "testa" + "ment to",
    "revolu" + "tionize", "super" + "charge", "world" + " class",
    "world" + "-class", "embark" + " on", "ever" + "-evolving",
    "fast" + "-paced", "rob" + "ust and scalable", "spear" + "headed",
    "passion" + "ate about",
)


def stem(phrase):
    escaped = re.escape(phrase)
    if phrase.endswith("e"):
        return escaped[:-1] + "(?:e|es|ed|ing)"
    return escaped + "(?:s|ed|ing)?"


VOCAB = re.compile(r"\b(?:" + "|".join(stem(p) for p in PHRASES) + r")\b", re.I)


def section(text, start, end):
    a = text.find(start)
    if a < 0:
        return ""
    b = text.find(end, a + len(start)) if end else -1
    return text[a:b] if b > 0 else text[a:]


def steps_in(block):
    found = {}
    current = None
    for line in block.splitlines():
        m = re.match(r"^\s?(\d{1,2})\s{2}\S", line)
        if m:
            current = int(m.group(1))
            found[current] = line.strip()
        elif current is not None and line.strip():
            found[current] += " " + line.strip()
    return found


def main(path):
    text = open(path, encoding="utf-8").read()
    results = []

    bad = sorted({c for c in text if ord(c) > 127})
    results.append(("ASCII only", not bad, "non ASCII: " + " ".join(repr(c) for c in bad[:10]) if bad else ""))

    lines_q = [i + 1 for i, line in enumerate(text.splitlines()) if "'" in line or '"' in line]
    results.append(("no apostrophes or double quotes", not lines_q, "lines " + ", ".join(map(str, lines_q[:15])) if lines_q else ""))

    dash = [i + 1 for i, line in enumerate(text.splitlines()) if re.search(r"\w -- \w|\w--\w", line)]
    results.append(("no double hyphen dash", not dash, "lines " + ", ".join(map(str, dash[:15])) if dash else ""))

    hits = [(i + 1, m.group(0)) for i, line in enumerate(text.splitlines()) for m in VOCAB.finditer(line)]
    results.append(("banned vocabulary", not hits, "; ".join(f"line {n}: {w}" for n, w in hits[:15]) if hits else ""))

    markers = ["# Part 1", "# Part 2", "# Part 3: THE PROMPT (copy from here)", "## (copy to here)", "# Part 4", "# Part 5"]
    positions = [text.find("\n" + m) for m in markers]
    in_order = all(p >= 0 for p in positions) and positions == sorted(positions)
    missing = [m for m, p in zip(markers, positions) if p < 0]
    results.append(("parts and copy markers in order", in_order, "missing: " + ", ".join(missing) if missing else ("out of order" if not in_order else "")))

    part3 = section(text, "# Part 3: THE PROMPT (copy from here)", "## (copy to here)")
    heads = [int(n) for n in re.findall(r"^## (\d{1,2})\. ", part3, re.M)]
    results.append(("Part 3 sections 1 to 21 in order", heads == list(range(1, 22)), "found " + ",".join(map(str, heads))))

    s17 = section(part3, "## 17. ", "## 18. ")
    steps = steps_in(s17)
    has_all = all(n in steps for n in range(1, 25))
    nine = steps.get(9, "")
    nine_ok = bool(re.search(r"\blive\b", nine, re.I)) and bool(re.search(r"\b(API|deploy|Vercel)\b", nine))
    results.append(("build steps 1 to 24, step 9 live", has_all and nine_ok, ("missing steps " + ",".join(str(n) for n in range(1, 25) if n not in steps)) if not has_all else ("step 9 is not the live API: " + nine[:80] if not nine_ok else "")))

    s20 = section(part3, "## 20. ", "## 21. ")
    items = steps_in(s20)
    results.append(("checklist numbered 1 to 18", sorted(items) == list(range(1, 19)), "found " + ",".join(map(str, sorted(items)))))

    part2 = section(text, "# Part 2", "# Part 3")
    ok2 = "## One statement on every surface" in part2 and re.search(r"## Locked from days 1 to \d+", part2) is not None
    results.append(("statement and locked rules in Part 2", ok2, ""))

    failed = 0
    for name, ok, note in results:
        print(("PASS  " if ok else "FAIL  ") + name + (("  (" + note + ")") if note and not ok else ""))
        failed += 0 if ok else 1
    print("\nall checks pass" if not failed else f"\n{failed} check(s) fail")
    return 0 if not failed else 1


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python prompt_checker.py day-NN-name-prompt.md")
        sys.exit(2)
    sys.exit(main(sys.argv[1]))
