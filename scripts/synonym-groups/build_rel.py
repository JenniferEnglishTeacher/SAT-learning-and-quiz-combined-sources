"""Build SAT synonym/antonym links restricted to words that have a card on the site.

Sources: NLTK WordNet (synsets, similar_tos, also_sees, antonyms, derivational forms)
+ Moby Thesaurus (npm `moby`, words.txt). Candidates must be corpus words; they are
scored by agreement between sources, Moby list overlap, POS match and shared Chinese gloss
characters. Output: one JSON per batch at data/relations/<batch>.json.
"""
import json, re, sys, collections, unicodedata
from nltk.corpus import wordnet as wn

REPO, MOBY = sys.argv[1], sys.argv[2]
idx = json.load(open(f'{REPO}/data/batches-index.json'))
batch_ids = [b['id'] for b in idx['batches']]

def norm(w):
    w = unicodedata.normalize('NFKD', w).encode('ascii', 'ignore').decode()
    w = re.sub(r'\(.*?\)', '', w).replace('^', '')
    return re.sub(r'\s+', ' ', w.strip().lower().replace('_', ' '))

WNPOS = {'n.': [wn.NOUN], 'v.': [wn.VERB], 'adj.': [wn.ADJ, wn.ADJ_SAT], 'adv.': [wn.ADV]}
corpus = {}          # key -> {word, pos:set, zh, batch}
batch_words = {}
for bid in batch_ids:
    data = json.load(open(f'{REPO}/data/batches/{bid}.json'))
    batch_words[bid] = data['words']
    for w in data['words']:
        k = norm(w['word'])
        e = corpus.setdefault(k, {'word': w['word'], 'pos': set(), 'zh': w['defn_zh'], 'batch': bid, 'defs': []})
        e['pos'].add(w['pos_key'])
        e['defs'].append((w['pos_key'], w['defn_zh']))
print('corpus', len(corpus))

moby = {}
for line in open(MOBY, encoding='latin-1'):
    parts = [norm(p) for p in line.rstrip('\n').split(',')]
    if parts[0]:
        moby.setdefault(parts[0], set()).update(p for p in parts[1:] if p)

def wn_pos(posset):
    out = []
    for p in posset:
        out += WNPOS.get(p, [])
    return out or None

def synsets(word, posset, senses=4):
    res = []
    for p in (wn_pos(posset) or [None]):
        ss = wn.synsets(word.replace(' ', '_'), pos=p)
        res += ss[:senses]
    return res

def lemma_names(ss):
    return {norm(l.name()) for l in ss.lemmas()}

def cjk(s):
    return set(ch for ch in s if '一' <= ch <= '鿿') - set('的地得之性者人物事一不')

def wn_syn_scores(k, posset):
    sc = collections.Counter()
    for rank, s in enumerate(synsets(k, posset)):
        w = 3 if rank < 2 else 2
        for n in lemma_names(s):
            sc[n] = max(sc[n], w)
        for rel in s.similar_tos() + s.also_sees() + s.verb_groups():
            for n in lemma_names(rel):
                sc[n] = max(sc[n], 2)
            for rel2 in rel.similar_tos():          # sibling satellites of the same head
                for n in lemma_names(rel2):
                    sc[n] = max(sc[n], 1)
    sc.pop(k, None)
    return sc

def wn_antonyms(k, posset):
    out = set()
    for s in synsets(k, posset):
        for l in s.lemmas():
            for a in l.antonyms():
                out.add(norm(a.name()))
        for rel in s.similar_tos():                 # satellite adj -> head -> antonym head
            for l in rel.lemmas():
                for a in l.antonyms():
                    out.add(norm(a.name()))
                    for s2 in a.synset().similar_tos():
                        out |= lemma_names(s2)
    return out

def moby_overlap(a, b):
    A, B = moby.get(a), moby.get(b)
    if not A or not B:
        return 0.0
    return len(A & B) / min(len(A), len(B))

def pos_ok(c, posset):
    return bool(corpus[c]['pos'] & posset)

def score_synonyms(k):
    e = corpus[k]; posset = e['pos']
    cand = collections.Counter()
    for c, s in wn_syn_scores(k, posset).items():
        if c in corpus and c != k:
            cand[c] += s * 1.5
    for c in moby.get(k, ()):
        if c in corpus and c != k:
            cand[c] += 1.0
            if k in moby.get(c, ()):
                cand[c] += 1.0
    zk = cjk(e['zh'])
    final = {}
    for c, s in cand.items():
        if not pos_ok(c, posset):
            continue
        ov = moby_overlap(k, c)
        s += ov * 6
        shared = len(zk & cjk(corpus[c]['zh']))
        s += min(shared, 2) * 1.0
        final[c] = s
    return final

syn_scores = {}
for k in corpus:
    syn_scores[k] = score_synonyms(k)

SYN_MIN = 3.0
def top_syn(k, n=7):
    items = sorted(syn_scores[k].items(), key=lambda kv: -kv[1])
    return [c for c, s in items if s >= SYN_MIN][:n]

synonyms = {k: top_syn(k) for k in corpus}

def antonym_scores(k):
    e = corpus[k]; posset = e['pos']
    seeds = collections.Counter()
    for a in wn_antonyms(k, posset):
        seeds[a] += 3
    for c in synonyms[k][:5] + [c for c, s in wn_syn_scores(k, posset).items() if s >= 2]:
        for a in wn_antonyms(c, posset):
            seeds[a] += 1
    seeds.pop(k, None)
    cand = collections.Counter()
    syn_set = set(synonyms[k]) | {k}
    for a, w in seeds.items():
        if a in corpus and a not in syn_set and pos_ok(a, posset):
            cand[a] += 3 * w
        # expand each seed to its own SAT-level synonyms
        for c, s in wn_syn_scores(a, posset).items():
            if c in corpus and c not in syn_set and pos_ok(c, posset):
                cand[c] += s * w * 0.6
        for c in moby.get(a, ()):
            if c in corpus and c not in syn_set and pos_ok(c, posset):
                cand[c] += w * (0.6 + 3 * moby_overlap(a, c)) * (1.5 if a in moby.get(c, ()) else 1)
    # drop anything Moby thinks is a synonym of the headword
    for c in list(cand):
        if c in moby.get(k, ()) or k in moby.get(c, ()):
            del cand[c]
    return cand

ANT_MIN = 3.0
antonyms = {}
for k in corpus:
    sc = antonym_scores(k)
    antonyms[k] = [c for c, s in sorted(sc.items(), key=lambda kv: -kv[1]) if s >= ANT_MIN][:6]

# Derivational fallback: abjection (n.) borrows from abject (adj.) etc. when it has nothing.
def deriv_forms(k):
    out = set()
    for s in synsets(k, corpus[k]['pos']):
        for l in s.lemmas():
            if norm(l.name()) != k:
                continue
            for d in l.derivationally_related_forms():
                out.add(norm(d.name()))
    return {d for d in out if d in corpus and d != k}

def map_pos(words, posset):
    out = []
    for w in words:
        if pos_ok(w, posset):
            out.append(w); continue
        for d in deriv_forms(w):
            if pos_ok(d, posset):
                out.append(d)
    return list(dict.fromkeys(out))

for k in corpus:
    posset = corpus[k]['pos']
    if len(synonyms[k]) < 2 or not antonyms[k]:
        for d in deriv_forms(k):
            if len(synonyms[k]) < 2:
                extra = [w for w in map_pos(synonyms[d], posset) if w != k and w not in synonyms[k]]
                synonyms[k] += extra[: 5 - len(synonyms[k])]
            if not antonyms[k]:
                antonyms[k] = [w for w in map_pos(antonyms[d], posset) if w != k and w not in synonyms[k]][:5]

# Symmetry: if A lists B as antonym, let B list A too (cheap, improves coverage).
for k in list(corpus):
    for a in antonyms[k]:
        if k not in antonyms[a] and len(antonyms[a]) < 6 and k not in synonyms[a] and pos_ok(k, corpus[a]['pos']):
            antonyms[a].append(k)

json.dump({'synonyms': synonyms, 'antonyms': antonyms}, open('/home/claude/work/rel_raw.json', 'w'))
json.dump({'syn_scores': syn_scores,
           'moby': {k: sorted(v & set(corpus)) for k, v in moby.items() if k in corpus},
           'corpus': {k: {'word': e['word'], 'pos': sorted(e['pos']), 'zh': e['zh'], 'batch': e['batch']} for k, e in corpus.items()}},
          open('/home/claude/work/rel_aux.json', 'w'))
have_s = sum(1 for k in corpus if synonyms[k]); have_a = sum(1 for k in corpus if antonyms[k])
print('with synonyms', have_s, 'with antonyms', have_a, 'of', len(corpus))
