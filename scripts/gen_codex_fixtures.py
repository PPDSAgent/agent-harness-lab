#!/usr/bin/env python3
"""Generate SYNTHETIC OpenAI Codex CLI rollout session files (JSONL) for harness-lab (HL-004).

Usage: python3 scripts/gen_codex_fixtures.py [--seed 4] [--out fixtures/codex]

Output: 30 sessions over 30 synthetic UTC days (1 per day), one
`rollout-<YYYY-MM-DD>T<HH-MM-SS>-<conversation_id>.jsonl` each, plus README.md. Same seed ->
byte-identical output (random.Random(seed) only, fixed base date, no wall clock, sorted-key
JSON, "\\n" line endings, ids derived from the RNG). Only this script's own outputs
(`rollout-*.jsonl`, README.md) are removed from --out before writing.

FORMAT SOURCE (read from raw.githubusercontent.com/openai/codex/<SHA>/..., pinned
SHA 444359fa2d71b9313c902c6bd6fd598ed6d8f799, fetched 2026-11-03; harness-lab fixtures/README.md
repeats this list):
  codex-rs/history/src/lib.rs:388              RolloutLine {timestamp, ordinal?, flattened item}
  codex-rs/history/src/rollout_payload.rs:31-33 RolloutItemWire, tag="type", snake_case,
                                               variants carry `payload`
  codex-rs/protocol/src/protocol.rs:3446-3480  SessionMeta (id, timestamp, cwd, originator,
                                               cli_version, ...)
  codex-rs/rollout/src/recorder.rs:79-80,98-99 file name rollout-<timestamp>-<conversation_id>.jsonl
  codex-rs/protocol/src/models.rs:1067,1079,1141-1166,1198-1209
                                               ResponseItem: message(role), function_call
                                               (name, arguments JSON string, call_id),
                                               function_call_output (call_id, output)
  codex-rs/protocol/src/protocol.rs:1533-1536  EventMsg tag="type", snake_case
  protocol.rs:2330-2333 error{message}; 2510-2525,2545-2547,2611-2614 token_count{info:
  {total_token_usage,last_token_usage}} with TokenUsage numeric fields; 2787-2788,2818-2821
  user_message / agent_message {message}.

ASSUMPTION: (not confirmed from source; each is a guess to check against a real rollout on
Will's Mac, attended)
  - the `output` of function_call_output is emitted here as a plain string;
  - the `content` items of a response_item `message` ({"type":"input_text"/"output_text",
    "text":...});
  - the extra fields of turn_context ({"cwd","model"}), the model name, the `source` value
    and the `originator` value ("synthetic-codex-fixture");
  - how a failed tool call looks: here an `error` event_msg follows a function_call_output
    whose output string starts with "error:";
  - ordinal numbering (here 0,1,2... per file; the source says only u64, optional);
  - the call_id format ("call_" + 24 hex chars) and the shell tool's argument shape
    ({"command": [...], "workdir": ...});
  - the filename timestamp format (taken from the doc-comment example in recorder.rs:79).
  - The SYNTHETIC label is carried in an extra `synthetic` string inside the line-1
    session_meta payload; real rollouts have no such field.
The REVIEW-VERDICT / CLAIM / EVIDENCE markers are harness-lab conventions from the frozen test
contract (tests/hl-004.codex-fixtures.test.ts), not Codex features.

All data is invented: home paths use the user `demo` or `synthetic`, people are labels.
"""
from __future__ import annotations

import argparse
import json
import os
import random
from datetime import datetime, timedelta, timezone

PINNED_SHA = "444359fa2d71b9313c902c6bd6fd598ed6d8f799"
BASE_DAY = datetime(2026, 10, 1, tzinfo=timezone.utc)  # fixed synthetic start, not "today"
SESSIONS = 30
CLI_VERSION = "0.0.0-synthetic"  # ASSUMPTION: real rollouts carry the Codex CLI version
ORIGINATOR = "synthetic-codex-fixture"  # ASSUMPTION
MODEL = "synthetic-model"  # ASSUMPTION
PROJECTS = ["/Users/demo/proj", "/Users/demo/proj/api", "/Users/demo/notes", "/home/synthetic/work"]
FILES = ["src/app.ts", "src/util.ts", "tests/app.test.ts", "README.md", "scripts/build.sh", "src/index.ts"]
CMDS = [["npm", "test"], ["npm", "run", "lint"], ["npm", "run", "build"], ["git", "status"], ["ls", "-la"]]
ERRORS = ["command exited with code 1", "no such file or directory", "permission denied"]
PROSE = ["Looking at the structure first.", "Making the change now.", "Checking the result.",
         "That narrows it down.", "Running the checks."]
PEOPLE = ["user-01", "user-02", "reviewer-a", "reviewer-b"]


def jdump(o: object) -> str:
    return json.dumps(o, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def hex_id(r: random.Random, n: int) -> str:
    """n hex chars from the RNG with a hex letter forced at every 8th position, so no long
    all-digit run exists (the sensitive scan's card_number pattern flags Luhn-valid digit runs)."""
    h = "%0*x" % (n, r.getrandbits(4 * n))
    return "".join("abcdef"[int(c, 16) % 6] if i % 8 == 0 else c for i, c in enumerate(h))


def uuid_from(r: random.Random) -> str:
    h = hex_id(r, 32)
    h = h[:12] + "7" + h[13:16] + "8" + h[17:]
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:]}"


def iso(t: datetime) -> str:
    return t.strftime("%Y-%m-%dT%H:%M:%S.") + "%03dZ" % (t.microsecond // 1000)


def session(r: random.Random, idx: int, start: datetime) -> tuple[str, list[dict]]:
    cid = uuid_from(r)
    cwd = r.choice(PROJECTS)
    lines: list[dict] = []
    state = {"t": start, "tot": [0, 0, 0, 0]}  # input, cached, output, reasoning (cumulative)

    def emit(typ: str, payload: dict) -> None:
        state["t"] += timedelta(seconds=r.randint(2, 90), milliseconds=r.randint(0, 999))
        lines.append({"timestamp": iso(state["t"]), "ordinal": len(lines), "type": typ, "payload": payload})

    def ev(kind: str, **kw: object) -> None:
        emit("event_msg", {"type": kind, **kw})

    def tokens() -> None:
        last = {"input_tokens": r.randint(300, 9000), "output_tokens": r.randint(20, 1500)}
        last["cached_input_tokens"] = r.randint(0, last["input_tokens"] // 2)
        last["reasoning_output_tokens"] = r.randint(0, last["output_tokens"] // 3)
        last["total_tokens"] = last["input_tokens"] + last["output_tokens"]
        tot = state["tot"]
        tot[0] += last["input_tokens"]
        tot[1] += last["cached_input_tokens"]
        tot[2] += last["output_tokens"]
        tot[3] += last["reasoning_output_tokens"]
        total = {"input_tokens": tot[0], "cached_input_tokens": tot[1], "output_tokens": tot[2],
                 "reasoning_output_tokens": tot[3], "total_tokens": tot[0] + tot[2]}
        ev("token_count", info={"total_token_usage": total, "last_token_usage": last})

    def say(text: str) -> None:
        ev("agent_message", message=text)
        emit("response_item", {"type": "message", "role": "assistant",
                               "content": [{"type": "output_text", "text": text}]})  # ASSUMPTION shape

    lines.append({"timestamp": iso(start), "ordinal": 0, "type": "session_meta", "payload": {
        "id": cid, "session_id": cid, "timestamp": iso(start), "cwd": cwd,
        "originator": ORIGINATOR, "cli_version": CLI_VERSION, "source": "cli",
        "synthetic": f"SYNTHETIC fixture {idx} generated by scripts/gen_codex_fixtures.py; not a real Codex session"}})
    emit("turn_context", {"cwd": cwd, "model": MODEL})
    ask = f"Task from {r.choice(PEOPLE)}: update {r.choice(FILES)} in {cwd}."
    ev("user_message", message=ask)
    emit("response_item", {"type": "message", "role": "user", "content": [{"type": "input_text", "text": ask}]})
    for _ in range(r.randint(2, 6)):
        cid_call = "call_" + hex_id(r, 24)
        say(r.choice(PROSE))
        emit("response_item", {"type": "function_call", "name": "shell", "call_id": cid_call,
                               "arguments": jdump({"command": r.choice(CMDS), "workdir": cwd})})
        err = r.random() < 0.2
        out = f"error: {r.choice(ERRORS)}" if err else "ok"
        emit("response_item", {"type": "function_call_output", "call_id": cid_call, "output": out})
        if err:
            ev("error", message=out[len("error: "):])
        tokens()
    if r.random() < 0.7:
        if r.random() < 0.5:
            say(f"CLAIM: checks pass on {cwd}. EVIDENCE: `npm test` exit=0, {r.randint(10, 90)} tests passed.")
        else:
            say(f"CLAIM: the change is done and works in {cwd}.")
        tokens()
    if r.random() < 0.4:
        v = r.choice(["PASS", "PASS", "CONDITIONAL", "FAIL"])
        say(f"REVIEW-VERDICT: {v} (reviewer-{r.choice('ab')})")
        tokens()
    say("Done for this session.")
    tokens()
    return cid, lines


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--seed", type=int, default=4)
    ap.add_argument("--out", default="fixtures/codex")
    a = ap.parse_args()
    r = random.Random(a.seed)
    os.makedirs(a.out, exist_ok=True)
    for f in os.listdir(a.out):  # remove only this script's own outputs
        if (f.startswith("rollout-") and f.endswith(".jsonl")) or f == "README.md":
            os.remove(os.path.join(a.out, f))
    for n in range(1, SESSIONS + 1):
        start = BASE_DAY + timedelta(days=n - 1, hours=r.randint(0, 20), minutes=r.randint(0, 59),
                                     seconds=r.randint(0, 59))
        cid, lines = session(r, n, start)
        name = f"rollout-{start.strftime('%Y-%m-%dT%H-%M-%S')}-{cid}.jsonl"
        with open(os.path.join(a.out, name), "w", encoding="utf-8", newline="\n") as fh:
            fh.write("".join(jdump(x) + "\n" for x in lines))
    with open(os.path.join(a.out, "README.md"), "w", encoding="utf-8", newline="\n") as fh:
        fh.write(README)


README = f"""# SYNTHETIC Codex CLI rollout fixtures

SYNTHETIC. Generated by `scripts/gen_codex_fixtures.py` (default `--seed 4`): 30 sessions,
one per UTC day from 2026-10-01. Regenerate with `python3 scripts/gen_codex_fixtures.py`;
output is byte-identical per seed. Format choice, sources and ASSUMPTIONs: `../README.md`.
Pinned source: openai/codex @ {PINNED_SHA}.
"""

if __name__ == "__main__":
    main()
