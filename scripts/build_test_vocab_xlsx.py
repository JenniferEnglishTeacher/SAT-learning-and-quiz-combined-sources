#!/usr/bin/env python3
"""Build data/batches/sat-test-NN.json from a "SAT N Vocab Grid" .xlsx.

Usage: python3 scripts/build_test_vocab_xlsx.py <test_number> <grid.xlsx>
Columns: word | POS | short English definition | 繁中釋義 | sentence with ______ | 中文翻譯
Rows whose first cell starts with "PART" become section headings.
"""
import json, re, sys
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parent.parent
n = int(sys.argv[1]); src = Path(sys.argv[2])
batch_id = f"sat-test-{n:02d}"

def pos_key(pos):
    p = pos.lower()
    if p.startswith("n"): return "n."
    if p.startswith("adj"): return "adj."
    if p.startswith("adv"): return "adv."
    if p.startswith("v"): return "v."
    return "other"

WORD_FIX = {"subsubsume": "subsume"}

def clean(v): return re.sub(r"\s+", " ", str(v or "")).strip()

ws = openpyxl.load_workbook(src, read_only=True).active
rows = list(ws.iter_rows(values_only=True))
words, section, seen = [], "", set()
for r in rows[1:]:
    first = clean(r[0])
    if not first: continue
    if first.upper().startswith("PART"):
        section = first; continue
    word, pos_raw, defn, zh, sent, tr = (clean(x) for x in r[:6])
    note = ""
    for field in ("word", "pos_raw"):  # "(v.)<br>(cleave, cleft, cleft)" / "stratum<br>(plural: strata)"
        m = re.match(r"(.*?)<br>\s*\((.*)\)\s*$", locals()[field])
        if m:
            if field == "word": word = m.group(1).strip()
            else: pos_raw = m.group(1).strip()
            note = (note + " " if note else "") + ("Forms: " + m.group(2).strip() if not m.group(2).lower().startswith("plural") else m.group(2).strip())
    word = WORD_FIX.get(word, word)
    pos = pos_raw.replace("(", "").replace(")", "").strip()
    key = word.lower()
    if key in seen:  # duplicate word -> extra example sentence
        for w in words:
            if w["word"].lower() == key and sent not in [s["en"] for s in w["sentences"]]:
                w["sentences"].append({"en": sent, "zh": tr})
        continue
    seen.add(key)
    item = {"word": word, "pos": pos, "pos_key": pos_key(pos), "defn_en": defn, "defn_zh": zh,
            "root_note": note, "sentences": [{"en": sent, "zh": tr}]}
    if section: item["section"] = section
    words.append(item)
    if "______" not in sent: print("NO BLANK:", word, "|", sent[:60])

batch = {"id": batch_id, "part": "mocktest", "part_label": "Digital SAT Practice Test Vocabulary",
         "name": f"Practice Test {n} · Vocabulary", "subtitle": "Words & options from Module 1 and Module 2",
         "count": len(words), "generated": True, "words": words, "family_options": {}, "fallback_options": {}}
(ROOT / f"data/batches/{batch_id}.json").write_text(json.dumps(batch, ensure_ascii=False, indent=1), encoding="utf-8")

index_path = ROOT / "data/mocktest-index.json"
index = json.loads(index_path.read_text(encoding="utf-8")) if index_path.exists() else {"batches": []}
entry = {"id": batch_id, "part": "mocktest", "part_label": batch["part_label"], "name": f"Practice Test {n}",
         "subtitle": "Vocabulary from Module 1 & 2", "count": len(words), "generated": True,
         "search_terms": " ".join(w["word"] for w in words)}
index["batches"] = sorted([b for b in index["batches"] if b["id"] != batch_id] + [entry], key=lambda b: b["id"])
index_path.write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
print(batch_id, len(words), "words")
