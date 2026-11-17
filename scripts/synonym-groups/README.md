# Synonym groups + SAT synonym/antonym links

1. `pip install nltk` + WordNet (`NLTK_ALLOW_PROXIED_URLOPEN=1 python3 -c "import nltk;nltk.download('wordnet');nltk.download('omw-1.4')"`), `npm install moby` (Moby Thesaurus words.txt).
2. `python3 build_rel.py <repo> <moby/words.txt>` → `/home/claude/work/rel_raw.json`, `rel_aux.json` (algorithmic candidates, ~2 min).
3. Edit `curated_adds.py` (hand-picked words per group; only corpus words are kept) and the `NEW` list in `build_groups.py` (new themes + antonym pairs; `HOT_OPP` pairs Hot Words lessons).
4. `python3 build_groups.py <repo>` → `data/synonym-groups.json`, `data/relations/<batch>.json`.
Per-word lists = own group members → opposite group members → algorithmic fill (score ≥ 6.5).
