# SAT Vocabulary Learning & Quiz

A mobile-friendly static learning site for 6,805 SAT vocabulary records, organized into 236 root, prefix, and alphabetical batches.

## Current state

- The complete 236-batch course map is generated from the workbook.
- One reusable learn-and-quiz page serves every batch.
- Batch JSON files are added incrementally; `data/progress.json` is the source of truth.
- Learn mode locks each word after the first definition choice.
- Progress is stored per browser with `localStorage`.

## Build the next batch

Keep the canonical local workbook at `source/Barrons_1100_by_root_prefix.xlsx`. It is ignored by Git because the public Google Sheet remains the shared source.

```powershell
python scripts/build_batches.py --batch-count 1
```

The script validates the current expanded workbook: 6,805 records, 3,824 unclassified words, 134 categories, and 236 batches before writing output.

## Quiz result logging

Deploy a Google Apps Script Web App that appends payloads to the `quiz result` sheet, then paste its `/exec` URL into `assets/config.js`. The site sends one JSON payload per completed batch with timestamp, student name/class, batch id/name, score percentage, mistake words, and per-question results. Until an endpoint is configured, completion remains saved locally and no student data leaves the browser.

Expected columns already present: `timeDate`, `studentName`, `quizBatchNumber`, `resultPercentage`, `mistakeWords`.

## Files

- `index.html` — complete course map
- `batch.html` — reusable learn + quiz page
- `assets/` — design and interactions
- `data/batches-index.json` — all batch names, counts, word search terms, and availability
- `data/batches/*.json` — generated vocabulary content
- `data/progress.json` — generated ids and next batch
- `scripts/build_batches.py` — workbook parser and incremental generator

## GitHub Pages

Publish from the `main` branch root:

`https://jenniferenglishteacher.github.io/SAT-learning-and-quiz-combined-sources/`
