#!/usr/bin/env python3
"""Build data/grammar/bank.json — one question bank for the two grammar hubs.

Inputs (all in the repo):
  source/grammar/official-229.json        229 official Digital SAT questions (Tests 1-10)
  source/grammar/ai-combined-319.json     319 AI-generated questions (Parts 1 + 2)
  source/grammar/clause-analysis-200q.json  colour-coded clause markup for Part 2 Q1-200
  source/grammar/however-though.json      6 however/though rules + 18 analysed questions
  data/grammar/<lesson>.json              topic lessons (rules, examples, mixed questions)

Rules:
  * Official items come only from the 229 bank (lesson copies are duplicates).
  * AI items = the 319 combined + every non-official lesson item.
  * Quick Review items are shortened official questions -> AI set, labelled "改寫自官方".
  * Every item gets a concept + sub-skill from one shared taxonomy.
"""
import json, re, sys, html
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'source' / 'grammar'
LESSONS = ROOT / 'data' / 'grammar'

CONCEPTS = [
    ('boundaries', 'Sentence Boundaries & Conjunctions', '句子界線與連接詞',
     ['Period / semicolon between clauses', 'Comma + FANBOYS', 'Subordinating conjunctions', 'Questions & sentence structure']),
    ('transition-punct', 'Punctuating Transition Words', '轉折副詞的標點',
     ['however', 'though', 'Other conjunctive adverbs (thus, therefore…)']),
    ('colons-commas', 'Colons, Commas & Dashes', '冒號、逗號與破折號',
     ['Colons', 'Essential vs. nonessential elements', 'Introductory & supplementary elements', 'No punctuation needed', 'Semicolons in complex lists']),
    ('possessive', 'Possessives & Plurals', '所有格與複數', ['Possessive vs. plural nouns']),
    ('verb-form', 'Verb Forms', '動詞形式', ['Finite (main) verbs', 'Nonfinite: participles, infinitives, absolutes', 'Parallel verbs']),
    ('verb-tense', 'Verb Tense', '動詞時態', ['Simple present', 'Simple past & past perfect', 'Present perfect', 'Tense consistency']),
    ('sv', 'Subject–Verb Agreement', '主詞動詞一致', ['Interrupters & trap nouns', 'Relative clauses & inverted sentences', 'Special subjects (gerunds, titles, each)', 'Agreement + tense / parallel verbs']),
    ('pronoun', 'Pronoun & Determiner Agreement', '代名詞與限定詞一致', ['Pronoun–antecedent agreement', 'Possessive pronouns (its / their)', 'Reflexives & determiners']),
    ('modifier', 'Modifiers & Comparisons', '修飾語與比較', ['Dangling modifiers', 'Logical comparisons & placement']),
    ('transitions', 'Transitions: Logical Connectors', '轉折語：邏輯關係', ['Contrast / concession', 'Cause & effect / conclusion', 'Addition / similarity', 'Example / specification / emphasis', 'Time / sequence', 'Alternative / purpose / other']),
]
SUBS = {c[0]: c[3] for c in CONCEPTS}


def sub(concept, i):
    return SUBS[concept][i]


def has(text, *words):
    t = text.lower()
    return any(w in t for w in words)


# ---------- keyword classifiers inside one concept ----------
def tp_sub(options):
    t = ' '.join(options.values()).lower()
    if 'however' in t: return sub('transition-punct', 0)
    if 'though' in t: return sub('transition-punct', 1)
    return sub('transition-punct', 2)


def verbform_sub(s):
    if has(s, 'parallel'): return sub('verb-form', 2)
    if has(s, 'main verb needed', 'finite verb in', 'finite (main)') or s.lower().startswith('finite'):
        return sub('verb-form', 0)
    if has(s, 'nonfinite', 'participle', 'participial', 'infinitive', 'absolute'): return sub('verb-form', 1)
    return sub('verb-form', 0)


def tense_sub(s):
    if has(s, 'consisten', 'literary'): return sub('verb-tense', 3)
    if has(s, 'present perfect', 'since', 'up to now'): return sub('verb-tense', 2)
    if has(s, 'past'): return sub('verb-tense', 1)
    if has(s, 'present', 'today', 'general'): return sub('verb-tense', 0)
    return sub('verb-tense', 3)


def sv_sub(s):
    if has(s, 'present perfect', 'parallel', 'tense'): return sub('sv', 3)
    if has(s, 'relative', 'invert'): return sub('sv', 1)
    if has(s, 'gerund', 'title', 'each', 'conjunction', 'clause subject'): return sub('sv', 2)
    return sub('sv', 0)


def pron_sub(s):
    if has(s, 'possessive', "it’s", "it's", "they’re", "they're"): return sub('pronoun', 1)
    if has(s, 'reflexive', 'determiner', 'this', 'these', 'those'): return sub('pronoun', 2)
    return sub('pronoun', 0)


def mod_sub(s):
    return sub('modifier', 0) if has(s, 'dangling') else sub('modifier', 1)


def trans_sub(s):
    if has(s, 'contrast', 'concession', 'exception', 'correction'): return sub('transitions', 0)
    if has(s, 'cause', 'conclusion', 'inference', 'consequence', 'result'): return sub('transitions', 1)
    if has(s, 'addition', 'similar', 'comparison'): return sub('transitions', 2)
    if has(s, 'example', 'illustration', 'specification', 'elaboration', 'emphasis'): return sub('transitions', 3)
    if has(s, 'time', 'sequence', 'trend', 'enumeration'): return sub('transitions', 4)
    return sub('transitions', 5)


def punct_official(skill, options):
    s = skill.lower()
    if has(s, 'conjunctive adverb', 'adverb placement', 'interrupting adverb', 'interrupting conjunctive'):
        return 'transition-punct', tp_sub(options)
    if has(s, 'complex series'): return 'colons-commas', sub('colons-commas', 4)
    if has(s, 'colon'): return 'colons-commas', sub('colons-commas', 0)
    if has(s, 'fanboys'): return 'boundaries', sub('boundaries', 1)
    if has(s, 'sentence boundary', 'semicolon between independent'): return 'boundaries', sub('boundaries', 0)
    if has(s, 'contrasting dependent clause'): return 'boundaries', sub('boundaries', 2)
    if s.startswith('no punctuation between'): return 'colons-commas', sub('colons-commas', 3)
    if has(s, 'introductory', 'participial', 'absolute', 'supplement'):
        return 'colons-commas', sub('colons-commas', 2)
    return 'colons-commas', sub('colons-commas', 1)


def classify_official(q):
    cat, skill = q['category'], q['skill']
    if cat == 'Punctuation': return punct_official(skill, q['options'])
    if cat == 'Transition': return 'transitions', trans_sub(skill)
    if cat == 'Verb Form': return 'verb-form', verbform_sub(skill)
    if cat == 'Verb Tense': return 'verb-tense', tense_sub(skill)
    if cat == 'Agreement (S-V)': return 'sv', sv_sub(skill)
    if cat == 'Agreement (Pronoun)': return 'pronoun', pron_sub(skill)
    if cat == 'Modifier': return 'modifier', mod_sub(skill)
    if cat == 'Possessive/Plural': return 'possessive', sub('possessive', 0)
    if cat == 'Sentence Structure': return 'boundaries', sub('boundaries', 3)
    raise ValueError(cat)


def classify_ai(q):
    cat, sb, skill = q['cat'], q['sub'], q['skill']
    s = sb + ' ' + skill
    if cat.startswith('1.'):
        if sb == 'Verb tense': return 'verb-tense', tense_sub(skill)
        return 'verb-form', verbform_sub(s)
    if cat.startswith('2.'):
        if sb.startswith('Subject'): return 'sv', sv_sub(skill)
        return 'pronoun', pron_sub(skill)
    if cat.startswith('3.'): return 'modifier', mod_sub(skill)
    if cat.startswith('4.'):
        if 'FANBOYS' in sb: return 'boundaries', sub('boundaries', 1)
        if 'Subordinating' in sb: return 'boundaries', sub('boundaries', 2)
        if 'introductory' in sb: return 'colons-commas', sub('colons-commas', 2)
        return 'boundaries', sub('boundaries', 0)
    if cat.startswith('5.'):
        if sb == 'Colons': return 'colons-commas', sub('colons-commas', 0)
        return 'colons-commas', sub('colons-commas', 1)
    if cat.startswith('6.'):
        if sb == 'however': return 'transition-punct', sub('transition-punct', 0)
        if sb == 'though': return 'transition-punct', sub('transition-punct', 1)
        return 'transition-punct', sub('transition-punct', 2)
    if cat.startswith('7.'): return 'transitions', trans_sub(s)
    raise ValueError(cat)


# lesson section -> (concept, sub index). None = classify each item by its official source.
LESSON_MAP = {
    'punctuation': {1: ('boundaries', 0), 2: ('boundaries', 1), 3: ('boundaries', 0), 4: ('transition-punct', 0),
                    5: ('transition-punct', 0), 6: ('transition-punct', 0), 7: ('transition-punct', 1),
                    8: ('colons-commas', 0), 9: ('colons-commas', 0), 10: ('colons-commas', 0),
                    11: ('colons-commas', 2), 12: ('colons-commas', 1), 13: ('colons-commas', 1),
                    14: ('colons-commas', 1), 15: ('colons-commas', 1), 16: ('colons-commas', 2),
                    17: ('colons-commas', 2), 18: ('colons-commas', 1), 19: ('colons-commas', 3),
                    20: ('colons-commas', 4), 21: ('possessive', 0), 22: ('pronoun', 1), 23: ('boundaries', 3)},
    'supplement-1b': {1: ('transition-punct', None), 2: ('colons-commas', 2), 3: ('colons-commas', 4), 4: None},
    'verb-forms': {1: ('verb-form', 0), 2: ('verb-form', 0), 3: ('verb-form', 1), 4: ('verb-form', 1),
                   5: ('verb-form', 1), 6: ('verb-form', 2)},
    'verb-tense': {1: ('verb-tense', 0), 2: ('verb-tense', 1), 3: ('verb-tense', 1), 4: ('verb-tense', 2), 5: ('verb-tense', 3)},
    'subject-verb-agreement': {1: ('sv', 0), 2: ('sv', 0), 3: ('sv', 2), 4: ('sv', 1), 5: ('sv', 1), 6: ('sv', 3)},
    'pronouns-modifiers': {1: ('pronoun', 0), 2: ('pronoun', 0), 3: ('pronoun', 2), 4: ('modifier', 0),
                           5: ('modifier', 0), 6: ('modifier', 1)},
    'transitions-part-1': {1: ('transitions', 0), 2: ('transitions', 0), 3: ('transitions', 2), 4: ('transitions', 3),
                           5: ('transitions', 3), 6: ('transitions', 3)},
    'transitions-part-2': {1: ('transitions', 1), 2: ('transitions', 1), 3: ('transitions', 4), 4: ('transitions', 4),
                           5: ('transitions', 2), 6: ('transitions', 5)},
    'grammar-handout-2': {1: ('verb-form', 0), 2: ('verb-form', 1), 3: ('verb-tense', None), 4: ('sv', None),
                          5: ('pronoun', None), 6: ('modifier', None), 7: ('transitions', None)},
    'quick-review': {i: None for i in range(1, 10)},
}
LESSON_NAMES = {
    'punctuation': 'Punctuation lesson', 'supplement-1b': 'Supplement 1B', 'verb-forms': 'Verb Forms lesson',
    'verb-tense': 'Verb Tense lesson', 'subject-verb-agreement': 'Subject–Verb Agreement lesson',
    'pronouns-modifiers': 'Pronouns & Modifiers lesson', 'transitions-part-1': 'Transitions Part 1',
    'transitions-part-2': 'Transitions Part 2', 'grammar-handout-2': 'Handout 2', 'quick-review': 'Quick Review',
}
QUICK_REVIEW_FALLBACK = {1: 'boundaries', 2: 'verb-form', 3: 'verb-tense', 4: 'sv', 5: 'pronoun', 6: 'possessive',
                         7: 'modifier', 8: 'boundaries', 9: 'transitions'}

norm = lambda t: re.sub(r'[^a-z0-9]+', '', (t or '').lower())


def official_ref(src):
    """'SAT 2 M1 Q22' / 'Official Digital SAT 2, Module 1, Q20' -> ('2','1','22')."""
    m = re.search(r'SAT\s*(\d+)[,\s]*(?:Module|M)\s*(\d)[,\s]*Q\s*(\d+)', src)
    return m.groups() if m else None


def letters_from_opts(opts):
    return {o['label']: o['text'] for o in opts}


def main():
    official = json.load(open(SRC / 'official-229.json'))
    combined = json.load(open(SRC / 'ai-combined-319.json'))
    g200 = json.load(open(SRC / 'clause-analysis-200q.json'))
    ht = json.load(open(SRC / 'however-though.json'))

    by_ref = {}
    for q in official:
        by_ref[(q['test'], q['module'], q['originalQuestion'])] = q
        for m in re.finditer(r'SAT\s*(\d+)\s*M(\d)\s*Q(\d+)', q.get('alsoAppears') or ''):
            by_ref.setdefault(m.groups(), q)

    mk200 = {q['n']: q['mk'] for g in g200 for q in g['qs']}
    code200 = {q['n']: g['code'] for g in g200 for q in g['qs']}
    # however/though analyses keyed by passage
    ht_by_pass = {norm(q['passage'])[:120]: q for q in ht['questions']}

    items, seen = [], set()

    def add(item):
        k = norm(item['passage'])[:160] + '|' + norm(' '.join(item['options'].values()))
        if k in seen:
            return False
        seen.add(k)
        hq = ht_by_pass.get(norm(item['passage'])[:120])
        if hq:
            item.setdefault('mk', hq['marked'])
            item['why'] = hq['why']
        items.append(item)
        return True

    # 1. official
    for q in official:
        c, s = classify_official(q)
        add({'id': f"o{q['no']}", 'set': 'official', 'concept': c, 'sub': s, 'skill': q['skill'],
             'origin': f"Official · Digital SAT {q['test']} – Module {q['module']} · Q{q['originalQuestion']}"
                       + (f" (also {q['alsoAppears']})" if q.get('alsoAppears') else ''),
             'passage': q['passage'], 'stem': q['stem'], 'options': q['options'], 'answer': q['answer'],
             'explanation': q['explanation']})
    n_off = len(items)

    # 2. AI combined
    for q in combined:
        c, s = classify_ai(q)
        it = {'id': 'a-' + q['id'], 'set': 'ai', 'concept': c, 'sub': s, 'skill': q['skill'],
              'origin': 'AI · ' + q['src'].replace('Set 1', 'Part 1').replace('Set 2', 'Part 2'), 'passage': q['passage'], 'stem': q['stem'], 'options': q['options'],
              'answer': q['answer'], 'explanation': q['explanation']}
        m = re.match(r'Set 2 · Q(\d+)', q['src'])
        if m and int(m.group(1)) in mk200:
            it['mk'] = mk200[int(m.group(1))]
            it['code'] = code200[int(m.group(1))]
        add(it)

    # 3. lessons
    notes = []
    dropped_official, unmatched = 0, []
    for slug, secmap in LESSON_MAP.items():
        d = json.load(open(LESSONS / f'{slug}.json'))
        for sec in d['sections']:
            target = secmap.get(sec['number'])
            note_concept = target[0] if target else None
            if slug == 'quick-review':
                note_concept = QUICK_REVIEW_FALLBACK[sec['number']]
            if note_concept and slug not in ('quick-review',):
                notes.append({'concept': note_concept,
                              'sub': SUBS[note_concept][target[1]] if target and target[1] is not None else None,
                              'from': LESSON_NAMES[slug], 'title': sec['title'], 'en': sec['explanation_en'],
                              'zh': sec.get('explanation_zh', ''), 'examples': sec.get('examples', [])})
            for q in sec['questions']:
                src = q.get('source') or ''
                ref = official_ref(src)
                oq = by_ref.get(ref) if ref else None
                if slug != 'quick-review' and src.startswith('Official'):
                    if oq is None:
                        unmatched.append((slug, src))
                    else:
                        dropped_official += 1
                        continue
                # decide concept/sub
                if oq is not None:
                    c, s = classify_official(oq)
                elif target and target[1] is not None:
                    c, s = target[0], SUBS[target[0]][target[1]]
                elif target:
                    c = target[0]
                    s = {'transition-punct': lambda: tp_sub(letters_from_opts(q['options'])),
                         'verb-tense': lambda: tense_sub(sec['title'] + ' ' + q['explanation']),
                         'sv': lambda: sv_sub(q['explanation']), 'pronoun': lambda: pron_sub(q['explanation']),
                         'modifier': lambda: mod_sub(q['explanation']),
                         'transitions': lambda: trans_sub(q['explanation'])}[c]()
                else:
                    c = QUICK_REVIEW_FALLBACK.get(sec['number'], 'boundaries')
                    s = SUBS[c][0]
                if slug == 'quick-review':
                    origin = 'AI · 改寫自官方 ' + (re.search(r'\(([^)]*)\)', src).group(1) if '(' in src else src)
                else:
                    origin = f"AI · {LESSON_NAMES[slug]}"
                add({'id': f"a-{slug}-{sec['number']}-{q['number']}", 'set': 'ai', 'concept': c, 'sub': s,
                     'skill': sec['title'], 'origin': origin, 'passage': q['passage'], 'stem': q['prompt'],
                     'options': letters_from_opts(q['options']), 'answer': q['correct'],
                     'explanation': q['explanation']})

    # however / though rule notes
    for r in ht['rules']:
        notes.append({'concept': 'transition-punct', 'sub': None, 'from': 'however / though clause analysis',
                      'title': re.sub('<[^>]+>', '', r['formula']), 'en': r['note'], 'zh': r['zh'],
                      'examples': [], 'html': True})

    # de-duplicate notes by title within a concept
    seen_notes, uniq = set(), []
    for n in notes:
        k = (n['concept'], norm(n['title']))
        if k in seen_notes: continue
        seen_notes.add(k); uniq.append(n)

    for it in items:
        assert it['answer'] in it['options'], it['id']
        assert it['sub'] in SUBS[it['concept']], (it['id'], it['sub'])

    bank = {'concepts': [{'id': c[0], 'en': c[1], 'zh': c[2], 'subs': c[3]} for c in CONCEPTS],
            'notes': uniq, 'items': items}
    out = LESSONS / 'bank.json'
    out.write_text(json.dumps(bank, ensure_ascii=False, separators=(',', ':')))
    from collections import Counter
    print('official', n_off, 'ai', len(items) - n_off, 'notes', len(uniq), 'dropped lesson-official', dropped_official)
    print('unmatched official refs:', unmatched)
    for cid, *_ in CONCEPTS:
        o = Counter(i['sub'] for i in items if i['concept'] == cid and i['set'] == 'official')
        a = Counter(i['sub'] for i in items if i['concept'] == cid and i['set'] == 'ai')
        print(f"{cid:17} official {sum(o.values()):3}  ai {sum(a.values()):3}")
        for sname in SUBS[cid]:
            print(f"     {sname[:45]:45} {o[sname]:3} {a[sname]:3}")
    print('with clause analysis:', sum('mk' in i for i in items))
    print('size', out.stat().st_size)


if __name__ == '__main__':
    main()
