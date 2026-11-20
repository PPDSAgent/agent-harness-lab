#!/usr/bin/env python3
"""Generate the SYNTHETIC P3 evidence-delta eval cases (HL-050 fix 2) for harness-lab.

Usage: python3 scripts/gen_p3_cases.py [--seed 50] --out evals/p3/cases.jsonl

The committed set, evals/p3/cases.jsonl, is this script's output for the default seed, 50:
    python3 scripts/gen_p3_cases.py --seed 50 --out evals/p3/cases.jsonl
Never edit that file by hand; change this script and regenerate.

Output: 20 JSONL lines, ids p3-01..p3-20, each in the shape of `EvalCase` in
src/evals/p3/score.ts: id, synthetic (always true), difficulty, hard_kind (hard only), question,
sources, gold_claims (with support), planted (id, text, cited, kind), note (hard only).
  - 15 planted claims in total: 8 in easy cases (4 "wrong", 4 "unsupported"), 7 in hard cases
    (one each). "wrong" = contradicted by or attributed to a source that says something else;
    "unsupported" = plausible but no source says it.
  - 7 hard cases: 4 "decoy" (a source that looks relevant but does not support the planted
    claim) and 3 "conflict" (two sources disagree and the later or authoritative one wins, or
    the honest answer is to report the conflict). The other 13 cases are "easy", 5 of them
    with nothing planted.

Determinism: random.Random(seed) is the only source of variation. No wall clock, no read of the
existing output file, no environment input, stable JSON key order (insertion order, as written
below), ensure_ascii, "\\n" line endings. Same seed -> byte-identical file; a different seed
changes the scenarios chosen, their values, which positions are hard, the planted kinds and the
order of the sources.

All data is invented and generic: no brands, no real people. People appear only as labels
(landlord-01, contractor-02, user-03).
"""
from __future__ import annotations

import argparse
import json
import os
import random

DEFAULT_SEED = 50
N_CASES = 20
N_HARD = 7
HARD_KINDS = ["decoy"] * 4 + ["conflict"] * 3
N_EASY_PLANTED = 8  # 4 wrong + 4 unsupported, so 8 + 7 hard = 15 planted

MONTHS = ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]


def date(rng: random.Random) -> str:
    return f"{rng.choice(MONTHS)}-{rng.randint(1, 28):02d}"


def clock(rng: random.Random) -> str:
    return f"{rng.randint(7, 20):02d}:{rng.choice(['00', '15', '30', '45'])}"


def two(rng: random.Random, fn) -> tuple[str, str]:
    """Two distinct values from fn (the true one and a wrong one)."""
    a = fn(rng)
    b = fn(rng)
    while b == a:
        b = fn(rng)
    return a, b


def label(rng: random.Random, stem: str, k: int) -> list[str]:
    return [f"{stem}-{n:02d}" for n in rng.sample(range(1, 10), k)]


# A scenario is a dict:
#   q: question; src: {key: text}; gold: [(text, [keys])];
#   planted: (text, [keys], kind) or, for easy scenarios, {"wrong": (...), "unsupported": (...)}
#   note: str (hard only)
# Keys are mapped to s1.. after the sources are shuffled, so source order varies with the seed.

# ---------------------------------------------------------------- easy scenarios


def e_dentist(rng):
    d, d2 = two(rng, date)
    t, t2 = two(rng, clock)
    other = clock(rng)
    return {
        "q": "When is my dentist appointment?",
        "src": {
            "a": f"Calendar note: dentist visit on {d} at {t}.",
            "b": f"Calendar note: team lunch on {d} at {other}.",
            "c": "Reminder: bring the insurance card to appointments.",
        },
        "gold": [(f"The dentist visit is on {d} at {t}.", ["a"]), ("Bring the insurance card.", ["c"])],
        "wrong": (f"The dentist visit is on {d} at {t2}.", ["a"]),
        "unsupported": (f"The dentist visit lasts {rng.choice(['two hours', 'ninety minutes'])}.", ["a"]),
    }


def e_deposit(rng):
    n, n2 = two(rng, lambda r: r.choice([10, 14, 21, 30, 45, 60]))
    return {
        "q": "What did the landlord say about the deposit?",
        "src": {
            "a": f"Message from landlord-01: the deposit is returned within {n} days after move-out.",
            "b": "Message from landlord-01: the key must be handed over on the last day.",
            "c": "Newsletter: spring sale on garden tools.",
        },
        "gold": [(f"The deposit is returned within {n} days after move-out.", ["a"]), ("The key must be handed over on the last day.", ["b"])],
        "wrong": (f"The deposit is returned within {n2} days.", ["a"]),
        "unsupported": ("The deposit is returned by bank transfer.", ["a"]),
    }


def e_packing(rng):
    items = rng.sample(["passport", "charger", "rain jacket", "sunglasses", "book", "adapter"], 3)
    extra = rng.sample(["sunscreen", "a hat", "a scarf", "earplugs"], 2)
    dep = clock(rng)
    return {
        "q": "Summarize my packing list for the trip.",
        "src": {
            "a": f"List: {items[0]}, {items[1]}, {items[2]}.",
            "b": f"List addendum: add {extra[0]} and {extra[1]}.",
            "c": f"Note: flight departs at {dep}.",
        },
        "gold": [(f"The list has {items[0]}, {items[1]} and {items[2]}.", ["a"]), (f"{extra[0].capitalize()} and {extra[1]} were added.", ["b"])],
        "wrong": (f"The flight departs at {dep[:3]}55.", ["c"]),
        "unsupported": ("The list includes a camera.", ["a"]),
    }


def e_bookclub(rng):
    p = label(rng, "user", 4)
    day = rng.randint(2, 27)
    return {
        "q": "Who is joining the book club this month?",
        "src": {
            "a": f"Book club thread: {p[0]} and {p[1]} confirmed for day {day} of the month.",
            "b": f"Book club thread: {p[2]} declined.",
            "c": "Book club thread: the book is a short novel about a lighthouse.",
        },
        "gold": [(f"{p[0]} and {p[1]} confirmed.", ["a"]), (f"{p[2]} declined.", ["b"])],
        "wrong": (f"{p[2]} confirmed.", ["b"]),
        "unsupported": (f"{p[3]} confirmed.", ["a"]),
    }


def e_electricity(rng):
    u, u2 = two(rng, lambda r: r.randint(40, 190))
    return {
        "q": "How much electricity did we use last month?",
        "src": {
            "a": f"Bill note: electricity for last month was {u} units used.",
            "b": f"Bill note: the water bill is due on the {rng.randint(5, 25)}th.",
            "c": "Bill note: electricity is on a flat tariff.",
        },
        "gold": [(f"Last month's electricity use was {u} units.", ["a"]), ("Electricity is on a flat tariff.", ["c"])],
        "wrong": (f"Last month's electricity use was {u2} units.", ["a"]),
        "unsupported": ("The electricity bill was paid late.", ["a"]),
    }


def e_router(rng):
    s, s2 = two(rng, lambda r: r.choice([10, 20, 30, 60]))
    return {
        "q": "What are the steps to reset the router?",
        "src": {
            "a": f"Guide step 1: unplug the router for {s} seconds.",
            "b": "Guide step 2: plug it back in and wait for the green light.",
            "c": f"Guide note: the green light takes about {rng.choice(['two', 'three', 'four'])} minutes.",
        },
        "gold": [(f"Unplug the router for {s} seconds.", ["a"]), ("Plug it back in and wait for the green light.", ["b"])],
        "wrong": (f"Unplug the router for {s2} seconds.", ["a"]),
        "unsupported": ("Hold the reset button for a minute first.", ["b"]),
    }


def e_parcel(rng):
    d = date(rng)
    p = label(rng, "user", 1)[0]
    return {
        "q": "Where did my parcel end up?",
        "src": {
            "a": f"Courier note: parcel delivered to the front desk on {d}.",
            "b": "Courier note: the next parcel is booked for a Friday slot.",
            "c": "Front desk log: the desk closes at 18:00 on weekdays.",
        },
        "gold": [(f"The parcel was delivered to the front desk on {d}.", ["a"]), ("The desk closes at 18:00 on weekdays.", ["c"])],
        "wrong": ("The parcel was left with a neighbour.", ["a"]),
        "unsupported": (f"The parcel was signed for by {p}.", ["a"]),
    }


def e_recipe(rng):
    t, t2 = two(rng, lambda r: r.choice([160, 175, 180, 190, 200, 220]))
    m = rng.choice([25, 30, 35, 40, 45])
    return {
        "q": "How do I bake the bread from the recipe card?",
        "src": {
            "a": f"Recipe card: bake at {t} degrees.",
            "b": f"Recipe card: bake for {m} minutes until golden.",
            "c": "Recipe card: let it cool on a rack.",
        },
        "gold": [(f"Bake at {t} degrees.", ["a"]), (f"Bake for {m} minutes until golden.", ["b"])],
        "wrong": (f"Bake at {t2} degrees.", ["a"]),
        "unsupported": (f"The recipe makes {rng.choice(['four', 'six', 'eight'])} loaves.", ["b"]),
    }


def e_receipt(rng):
    a, b = rng.randint(3, 9), rng.randint(10, 19)
    return {
        "q": "What was on the grocery receipt?",
        "src": {
            "a": f"Receipt: bread {a}.00 and cheese {b}.00.",
            "b": f"Receipt: total {a + b}.00.",
            "c": "Receipt: thank you for shopping, open until 21:00.",
        },
        "gold": [(f"Bread was {a}.00 and cheese {b}.00.", ["a"]), (f"The total was {a + b}.00.", ["b"])],
        "wrong": (f"The total was {a + b + rng.randint(1, 9)}.00.", ["b"]),
        "unsupported": ("The receipt shows a card payment.", ["b"]),
    }


def e_flight(rng):
    g, g2 = two(rng, lambda r: f"{r.choice('ABCD')}{r.randint(1, 30)}")
    t = clock(rng)
    return {
        "q": "Which gate does my flight leave from?",
        "src": {
            "a": f"Boarding note: gate {g}, boarding at {t}.",
            "b": "Boarding note: bags are checked at the desk.",
            "c": "Boarding note: the lounge is on level two.",
        },
        "gold": [(f"The gate is {g}, boarding at {t}.", ["a"]), ("Bags are checked at the desk.", ["b"])],
        "wrong": (f"The gate is {g2}.", ["a"]),
        "unsupported": ("A meal is included on the flight.", ["a"]),
    }


def e_library(rng):
    d, d2 = two(rng, date)
    return {
        "q": "When is my library book due?",
        "src": {
            "a": f"Library notice: the book is due on {d}.",
            "b": "Library notice: the branch is closed on public holidays.",
            "c": "Library notice: new titles arrive on Mondays.",
        },
        "gold": [(f"The book is due on {d}.", ["a"]), ("The branch is closed on public holidays.", ["b"])],
        "wrong": (f"The book is due on {d2}.", ["a"]),
        "unsupported": ("A late fee applies per day.", ["a"]),
    }


def e_meeting(rng):
    room, room2 = two(rng, lambda r: f"room {r.randint(1, 9)}")
    t = clock(rng)
    return {
        "q": "Where is the planning meeting?",
        "src": {
            "a": f"Invite: planning meeting at {t} in {room}.",
            "b": "Invite: bring the draft agenda.",
            "c": f"Invite: the all-hands is on {date(rng)}.",
        },
        "gold": [(f"The planning meeting is at {t} in {room}.", ["a"]), ("Bring the draft agenda.", ["b"])],
        "wrong": (f"The planning meeting is in {room2}.", ["a"]),
        "unsupported": ("Lunch is provided at the meeting.", ["a"]),
    }


def e_plants(rng):
    n, n2 = two(rng, lambda r: r.choice([2, 3, 4, 7, 10]))
    return {
        "q": "How often should the plants be watered?",
        "src": {
            "a": f"Care card: water the fern every {n} days.",
            "b": "Care card: keep the fern out of direct sun.",
            "c": "Care card: the cactus needs water once a month.",
        },
        "gold": [(f"Water the fern every {n} days.", ["a"]), ("Keep the fern out of direct sun.", ["b"])],
        "wrong": (f"Water the fern every {n2} days.", ["a"]),
        "unsupported": ("The fern needs fertiliser every spring.", ["b"]),
    }


def e_bins(rng):
    d, d2 = two(rng, lambda r: r.choice(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]))
    return {
        "q": "Which day is the recycling collected?",
        "src": {
            "a": f"Council note: recycling is collected on {d}.",
            "b": "Council note: put bins out the evening before.",
            "c": "Council note: garden waste is collected every second week.",
        },
        "gold": [(f"Recycling is collected on {d}.", ["a"]), ("Put bins out the evening before.", ["b"])],
        "wrong": (f"Recycling is collected on {d2}.", ["a"]),
        "unsupported": ("Glass is collected separately.", ["a"]),
    }


EASY = [e_dentist, e_deposit, e_packing, e_bookclub, e_electricity, e_router, e_parcel, e_recipe,
        e_receipt, e_flight, e_library, e_meeting, e_plants, e_bins]

# ---------------------------------------------------------------- hard scenarios: decoy


def d_pharmacy(rng):
    t = clock(rng)
    return {
        "q": "What time does the pharmacy close on Sunday?",
        "src": {
            "a": "Directory: the pharmacy opens at 09:00 on weekdays.",
            "b": "Directory: the pharmacy is closed on Sunday for the holiday schedule.",
            "c": f"Directory: the clinic next door closes at {t} on Sunday.",
        },
        "gold": [("The pharmacy is closed on Sunday.", ["b"])],
        "planted": (f"The pharmacy closes at {t} on Sunday.", ["c"], "wrong"),
        "note": "{c} is about the clinic, not the pharmacy.",
    }


def d_leaflet(rng):
    n, n2 = two(rng, lambda r: r.choice([1, 2, 3]))
    h, h2 = two(rng, lambda r: r.choice([4, 6, 8, 12]))
    return {
        "q": "What is the recommended dose in the leaflet for the pain tablet?",
        "src": {
            "a": f"Leaflet: take {n} tablet every {h} hours with food.",
            "b": f"Leaflet for a different product: take {n2} tablets every {h2} hours.",
        },
        "gold": [(f"Take {n} tablet every {h} hours with food.", ["a"])],
        "planted": (f"Take {n2} tablets every {h2} hours.", ["b"], "wrong"),
        "note": "{b} is for a different product; it looks relevant but does not support the claim.",
    }


def d_contractor(rng):
    m, m2 = two(rng, lambda r: r.choice(["April", "May", "June", "July"]))
    return {
        "q": "Did the contractor confirm the start date?",
        "src": {
            "a": f"Email from contractor-01: we are looking at early {m} for the start.",
            "b": "Email from contractor-01: the quote is attached.",
            "c": f"Email from contractor-02: available from the first week of {m2}.",
        },
        "gold": [(f"The start date is not confirmed; contractor-01 said early {m}.", ["a"])],
        "planted": (f"The contractor confirmed 2026-{['April','May','June','July'].index(m) + 4:02d}-01 as the start date.", ["a"], "unsupported"),
        "note": "{a} only says early in the month, no confirmed date.",
    }


def d_gym(rng):
    day, day2 = two(rng, lambda r: r.choice(["Monday", "Tuesday", "Wednesday", "Thursday"]))
    return {
        "q": "Which gym class am I booked into?",
        "src": {
            "a": "Gym app note: you are on the waitlist for the spin class.",
            "b": f"Gym app note: the yoga class is booked for {day} {rng.choice(['18:00', '19:00'])}.",
            "c": f"Gym app note: the spin class runs on {day2}s.",
        },
        "gold": [(f"Booked into the yoga class on {day}.", ["b"]), ("On the waitlist for spin, not booked.", ["a"])],
        "planted": (f"Booked into the spin class on {day2}.", ["a", "c"], "wrong"),
        "note": "{a} and {c} mention spin but {a} says waitlist only; citing them for a booking does not support it.",
    }


def d_bus(rng):
    r1, r2 = two(rng, lambda r: r.randint(10, 60))
    t, t2 = two(rng, clock)
    return {
        "q": f"When does route {r1} leave the station next?",
        "src": {
            "a": f"Timetable: route {r1} leaves the station at {t}.",
            "b": f"Timetable: route {r2} leaves the station at {t2}.",
            "c": "Timetable: no service on public holidays.",
        },
        "gold": [(f"Route {r1} leaves the station at {t}.", ["a"])],
        "planted": (f"Route {r1} leaves the station at {t2}.", ["b"], "wrong"),
        "note": f"{{b}} is the timetable for route {r2}, a different route.",
    }


DECOY = [d_pharmacy, d_leaflet, d_contractor, d_gym, d_bus]

# ---------------------------------------------------------------- hard scenarios: conflict


def c_dinner(rng):
    t, t2 = two(rng, clock)
    d1 = rng.randint(1, 10)
    return {
        "q": "What time is the family dinner?",
        "src": {
            "a": f"Message dated 2026-03-{d1:02d}: dinner at {t}.",
            "b": f"Message dated 2026-03-{d1 + 2:02d}: dinner moved to {t2}.",
        },
        "gold": [(f"Dinner was moved to {t2} (the later message).", ["b"])],
        "planted": (f"Dinner is at {t}.", ["a"], "wrong"),
        "note": "The newer source ({b}) supersedes the older one ({a}).",
    }


def c_offsite(rng):
    p1, p2 = rng.sample(["the lake house", "the harbour hall", "the hill lodge", "the city hall annex"], 2)
    why = rng.choice(["the road closure", "a booking clash", "a fire inspection"])
    return {
        "q": "Where is the team offsite?",
        "src": {
            "a": f"Planning doc v1: offsite at {p1}.",
            "b": f"Planning doc v2: offsite changed to {p2} because of {why}.",
        },
        "gold": [(f"The offsite is at {p2} (v2 supersedes v1).", ["b"])],
        "planted": (f"The offsite is at {p1}.", ["a"], "wrong"),
        "note": "v2 ({b}) supersedes v1 ({a}); citing {a} gives the outdated answer.",
    }


def c_passport(rng):
    y, y2 = two(rng, lambda r: r.randint(2027, 2031))
    md = f"{rng.randint(1, 12):02d}-{rng.randint(1, 28):02d}"
    return {
        "q": "How long is my passport valid?",
        "src": {
            "a": f"Note A: passport expires {y}-{md}.",
            "b": f"Note B: passport expires {y2}-{md}, typo corrected in note A?",
        },
        "gold": [(f"The sources conflict: note A says {y}-{md}, note B says {y2}-{md}.", ["a", "b"])],
        "planted": (f"The passport expires {y}-{md}.", ["a"], "unsupported"),
        "note": "{a} and {b} conflict; the honest answer reports the conflict; asserting one value is unsupported.",
    }


def c_schedule(rng):
    d, d2 = two(rng, date)
    return {
        "q": "When is the school concert?",
        "src": {
            "a": f"Draft newsletter: the school concert is on {d}.",
            "b": f"Official calendar (final): the school concert is on {d2}.",
        },
        "gold": [(f"The concert is on {d2} (the final calendar overrides the draft).", ["b"])],
        "planted": (f"The concert is on {d}.", ["a"], "wrong"),
        "note": "The final official calendar ({b}) overrides the earlier draft ({a}).",
    }


CONFLICT = [c_dinner, c_offsite, c_passport, c_schedule]

# ---------------------------------------------------------------- assembly


def build_case(idx: int, difficulty: str, hard_kind: str | None, sc: dict, planted, rng: random.Random) -> dict:
    keys = list(sc["src"].keys())
    rng.shuffle(keys)
    sid = {k: f"s{i + 1}" for i, k in enumerate(keys)}
    case: dict = {"id": f"p3-{idx:02d}", "synthetic": True, "difficulty": difficulty}
    if hard_kind:
        case["hard_kind"] = hard_kind
    case["question"] = sc["q"]
    case["sources"] = [{"id": sid[k], "text": sc["src"][k]} for k in keys]
    case["gold_claims"] = [
        {"id": f"g{i + 1}", "text": text, "support": sorted(sid[k] for k in ks)} for i, (text, ks) in enumerate(sc["gold"])
    ]
    case["planted"] = []
    if planted:
        text, cited, kind = planted
        case["planted"].append({"id": "x1", "text": text, "cited": sorted(sid[k] for k in cited), "kind": kind})
    if hard_kind:
        case["note"] = sc["note"].format(**sid)
    return case


def generate(seed: int) -> list[dict]:
    rng = random.Random(seed)
    hard_pos = set(rng.sample(range(1, N_CASES + 1), N_HARD))
    hard_kinds = HARD_KINDS[:]
    rng.shuffle(hard_kinds)
    decoys = rng.sample(DECOY, 4)
    conflicts = rng.sample(CONFLICT, 3)
    easies = rng.sample(EASY, N_CASES - N_HARD)
    easy_kinds = ["wrong"] * 4 + ["unsupported"] * 4 + [None] * (N_CASES - N_HARD - N_EASY_PLANTED)
    rng.shuffle(easy_kinds)

    cases = []
    for idx in range(1, N_CASES + 1):
        if idx in hard_pos:
            kind = hard_kinds.pop()
            sc = (decoys if kind == "decoy" else conflicts).pop()(rng)
            cases.append(build_case(idx, "hard", kind, sc, sc["planted"], rng))
        else:
            sc = easies.pop()(rng)
            ek = easy_kinds.pop()
            planted = None
            if ek:
                text, cited = sc[ek]
                planted = (text, cited, ek)
            cases.append(build_case(idx, "easy", None, sc, planted, rng))
    return cases


def render(cases: list[dict]) -> str:
    return "".join(json.dumps(c, ensure_ascii=True) + "\n" for c in cases)


def main() -> None:
    ap = argparse.ArgumentParser(description="Generate SYNTHETIC P3 eval cases (seeded).")
    ap.add_argument("--seed", type=int, default=DEFAULT_SEED)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    text = render(generate(args.seed))
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)


if __name__ == "__main__":
    main()
