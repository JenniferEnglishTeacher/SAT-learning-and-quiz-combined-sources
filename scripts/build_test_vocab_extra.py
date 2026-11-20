#!/usr/bin/env python3
"""Build vocabulary batches for the non-numbered mock tests (Princeton, Cram School).
usage: python3 scripts/build_test_vocab_extra.py <slug> <source.txt>
source format: '#Section heading' lines, then 'word|pos|definition|中文|example with ______|翻譯[|form]'
"""
import json, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
NAMES = {'princeton': ('Princeton Digital SAT Mock Test', 'Words & options from Module 1 and Module 2'),
         'cram': ('Cram School Mock Test (Aug 1, 2026)', 'Words & options from Module 1 and Module 2')}
slug, src = sys.argv[1], sys.argv[2]
words, section = [], ''
for line in open(src, encoding='utf-8'):
    line = line.rstrip('\n')
    if not line.strip(): continue
    if line.startswith('#'): section = line[1:].strip(); continue
    f = line.split('|')
    word, pos, en, zh, ex, exzh = f[:6]
    sent = {'en': ex, 'zh': exzh}
    if len(f) > 6 and f[6]: sent['form'] = f[6]
    assert '______' in ex, word
    words.append({'word': word, 'pos': pos, 'pos_key': pos, 'defn_en': en, 'defn_zh': zh, 'root_note': '', 'sentences': [sent], 'section': section})
bid = f'sat-test-{slug}'
name, sub = NAMES[slug]
batch = {'id': bid, 'part': 'mocktest', 'part_label': 'Digital SAT Practice Test Vocabulary', 'name': f'{name} · Vocabulary', 'subtitle': sub,
         'count': len(words), 'generated': True, 'words': words, 'family_options': {}, 'fallback_options': {}}
(ROOT / f'data/batches/{bid}.json').write_text(json.dumps(batch, ensure_ascii=False, indent=1), encoding='utf-8')
ip = ROOT / 'data/mocktest-index.json'
idx = json.loads(ip.read_text(encoding='utf-8'))
idx['batches'] = [b for b in idx['batches'] if b['id'] != bid] + [{'id': bid, 'part': 'mocktest', 'part_label': 'Digital SAT Practice Test Vocabulary',
    'name': name, 'subtitle': 'Vocabulary from Module 1 & 2', 'count': len(words), 'generated': True, 'search_terms': ' '.join(w['word'] for w in words)}]
ip.write_text(json.dumps(idx, ensure_ascii=False, indent=1), encoding='utf-8')
print(bid, len(words), 'words')
