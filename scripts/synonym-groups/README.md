# Synonym groups + SAT synonym/antonym links

1. `pip install nltk` + WordNet (`NLTK_ALLOW_PROXIED_URLOPEN=1 python3 -c "import nltk;nltk.download('wordnet');nltk.download('omw-1.4')"`), `npm install moby` (Moby Thesaurus words.txt).
2. `python3 build_rel.py <repo> <moby/words.txt>` → `/home/claude/work/rel_raw.json`, `rel_aux.json` (algorithmic candidates, ~2 min).
3. Edit `curated_adds.py` (hand-picked words per group; only corpus words are kept) and the `NEW` list in `build_groups.py` (new themes + antonym pairs; `HOT_OPP` pairs Hot Words lessons).
4. `python3 build_groups.py <repo>` → `data/synonym-groups.json`, `data/relations/<batch>.json`.
Per-word lists = own group members → opposite group members → algorithmic fill (score ≥ 6.5).

## Quiz-page word links (`assets/sat-word-links.js` + `data/word-index.json`)
word-index.json = every corpus word → [batch index, 中文, POS, headword], minus words shorter than 4 letters and minus
very common words (wordfreq zipf ≥ 4.3) that are NOT in Barron's/Hot/VA/Must-Know. Regenerate with the snippet in the
2026-11-18 session notes (pip install wordfreq; reads the Barron's repo *-words.js indices).
