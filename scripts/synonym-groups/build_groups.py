"""Build SAT synonym groups: HOT lessons (expanded) + new themed groups. Also derive
per-word SAT synonym/antonym lists (group-based first, algorithmic fill) and write
per-batch relation files + the group JSON into the SAT-learning repo."""
import json, re, collections, sys, os
REPO = sys.argv[1]
aux = json.load(open('/home/claude/work/rel_aux.json'))
raw = json.load(open('/home/claude/work/rel_raw.json'))
corpus, syn_scores, moby = aux['corpus'], aux['syn_scores'], aux['moby']
hot = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hot-original-lessons.json')))  # the 35 original Hot Words lessons (frozen)

def ok(w): return w in corpus

# ---- HOT lessons as groups. Opposite pairs give antonym links. ----
HOT_OPP = {1: 2, 3: 15, 4: 28, 5: 7, 6: 7, 8: 9, 12: 19, 13: 16, 14: 16, 15: 17}
# lessons that are not real synonym sets: do not expand, no antonyms
HOT_MISC = {21, 24, 26, 29, 30, 31, 32, 33, 34, 35}

groups = []
for u in hot:
    seeds = [c['w'].lower() for c in u['cards'] if ok(c['w'].lower())]
    groups.append({'id': f'hot-{u["unit"]:02d}', 'source': f'Hot Words Lesson {u["unit"]}', 'theme': u['theme'],
                   'themeZh': u['themeZh'], 'seeds': seeds, 'expand': u['unit'] not in HOT_MISC, 'opp': []})
gid = {g['id']: g for g in groups}
for a, b in HOT_OPP.items():
    gid[f'hot-{a:02d}']['opp'].append(f'hot-{b:02d}'); gid[f'hot-{b:02d}']['opp'].append(f'hot-{a:02d}')

# ---- New themed groups (seeds filtered to corpus words). Pairs = antonym groups. ----
NEW = [
 ('deceit', 'Deceit and Trickery', '欺騙與詭計', 'duplicity chicanery guile subterfuge beguile dupe hoodwink swindle bamboozle feign dissemble equivocate prevaricate mendacious disingenuous specious fraudulent', 'honesty'),
 ('honesty', 'Honesty and Sincerity', '誠實與真誠', 'candid frank forthright veracity probity integrity ingenuous straightforward sincere genuine scrupulous upright guileless', 'deceit'),
 ('courage', 'Courage and Boldness', '勇敢與大膽', 'intrepid audacious dauntless undaunted valiant valor fortitude stalwart plucky gallant mettle fearless', 'cowardice'),
 ('cowardice', 'Fear and Cowardice', '恐懼與膽小', 'timid timorous craven pusillanimous trepidation apprehensive diffident cower dastardly skittish faint-hearted', 'courage'),
 ('anger', 'Anger and Irritation', '憤怒與惱怒', 'irate indignant incensed wrath ire livid exasperate irascible choleric petulant peevish irk vex rankle infuriate fury', 'calm'),
 ('calm', 'Calm and Composure', '平靜與沉著', 'serene placid tranquil composure equanimity imperturbable unflappable sedate halcyon unruffled poise', 'anger'),
 ('gloom', 'Sadness and Gloom', '悲傷與憂鬱', 'melancholy morose despondent dejected disconsolate doleful lugubrious somber woeful forlorn lament dolorous mournful sullen', 'joy'),
 ('joy', 'Joy and Cheerfulness', '喜悅與開朗', 'elated jubilant exultant euphoric blithe buoyant jovial mirth gleeful exuberant sanguine ecstatic jocund rapture', 'gloom'),
 ('increase', 'Increase and Growth', '增加與成長', 'augment amplify burgeon proliferate escalate swell accrue magnify multiply expand flourish wax', 'decrease'),
 ('decrease', 'Decrease and Decline', '減少與衰退', 'dwindle abate wane diminish ebb recede subside curtail attenuate taper deteriorate deplete shrink', 'increase'),
 ('strengthen', 'Strengthen and Support', '加強與支持', 'bolster buttress fortify reinforce consolidate corroborate substantiate underpin shore invigorate galvanize sustain', 'weaken'),
 ('weaken', 'Weaken and Undermine', '削弱與破壞', 'undermine enervate debilitate sap enfeeble vitiate impair erode cripple attenuate subvert emasculate', 'strengthen'),
 ('clear', 'Clear and Obvious', '清楚與明顯', 'lucid manifest patent palpable explicit overt unequivocal perspicuous evident conspicuous transparent salient blatant', 'vague'),
 ('vague', 'Vague and Obscure', '模糊與難懂', 'ambiguous nebulous abstruse recondite arcane esoteric opaque cryptic enigmatic obscure equivocal inscrutable murky hazy', 'clear'),
 ('praise-sub', 'Flattery and Praise (excessive)', '過度諂媚與讚美', 'adulation flattery fawn blandishment sycophantic obsequious unctuous toady cajole wheedle', 'criticize-sub'),
 ('criticize-sub', 'Belittling and Slander', '貶低與誹謗', 'disparage belittle denigrate deride vilify malign slander libel defame calumny traduce derogatory deprecate decry discredit aspersion', 'praise-sub'),
 ('flexible', 'Flexible and Yielding', '靈活與順從', 'malleable pliable pliant supple tractable docile amenable acquiescent accommodating yielding adaptable', 'rigid'),
 ('rigid', 'Rigid and Strict', '嚴格與僵硬', 'stringent austere rigorous inflexible dogmatic draconian uncompromising unbending exacting severe stern', 'flexible'),
 ('fake', 'Fake and Imitation', '虛假與仿造', 'spurious counterfeit bogus sham ersatz feigned fictitious apocryphal faux specious contrived', 'genuine'),
 ('genuine', 'Genuine and Authentic', '真實與可靠', 'authentic bona fide veritable legitimate verifiable unfeigned credible valid actual real', 'fake'),
 ('diligent', 'Diligent and Hardworking', '勤奮與努力', 'assiduous industrious sedulous diligent painstaking indefatigable tireless persevering untiring studious', 'lazy2'),
 ('lazy2', 'Idle and Neglectful', '怠惰與疏忽', 'idle slothful remiss negligent lax dilatory shiftless lackadaisical desultory truant', 'diligent'),
 ('wealth', 'Wealth and Luxury', '富有與奢華', 'affluent opulent prosperous lucrative sumptuous luxurious plutocrat magnate well-heeled posh', 'poverty'),
 ('poverty', 'Poverty and Need', '貧窮與匱乏', 'destitute indigent impoverished impecunious penniless penury privation pauper insolvent bankrupt needy', 'wealth'),
 ('permanent', 'Permanent and Lasting', '永久與持久', 'perennial perpetual enduring immutable indelible abiding everlasting eternal durable perdurable interminable', 'hot-23'),
 ('rebel', 'Rebellion and Disobedience', '反叛與違抗', 'insurgent insubordinate mutinous seditious defiant renegade dissident iconoclast heretic recalcitrant refractory contumacious', 'hot-15'),
 ('loyal', 'Loyalty and Devotion', '忠誠與奉獻', 'allegiance fidelity steadfast staunch devoted faithful fealty constancy unswerving', 'betray'),
 ('betray', 'Betrayal and Treachery', '背叛與不忠', 'treacherous perfidious traitor turncoat apostate defect renegade duplicitous faithless disloyal perfidy', 'loyal'),
 ('knowledge', 'Knowledge and Learning', '學識與博學', 'erudite scholarly pedantic learned sage savant literati omniscient cognizant well-read lettered', 'ignorance'),
 ('ignorance', 'Ignorance and Foolishness', '無知與愚蠢', 'ignorant illiterate benighted obtuse fatuous inane vacuous dolt simpleton asinine imbecile nescient', 'knowledge'),
 ('doubt', 'Doubt and Skepticism', '懷疑與質疑', 'skeptical dubious incredulous cynical distrustful suspicious misgiving qualm wary leery', 'certainty'),
 ('certainty', 'Certainty and Conviction', '確信與堅信', 'conviction certitude assured unequivocal indubitable incontrovertible irrefutable undeniable dogmatic categorical', 'doubt'),
 ('luck', 'Luck and Good Fortune', '幸運與福氣', 'fortuitous serendipity providential auspicious propitious felicitous windfall boon fortunate', 'disaster'),
 ('disaster', 'Disaster and Misfortune', '災難與不幸', 'calamity catastrophe cataclysm debacle fiasco catastrophic calamitous dire ruinous havoc devastation adversity', 'luck'),
 ('lively', 'Lively and Energetic', '活潑與充滿活力', 'vivacious animated spirited dynamic vigorous sprightly effervescent robust zestful peppy brisk', 'hot-14'),
 ('shy', 'Shy and Modest', '害羞與謙遜', 'bashful demure unassuming self-effacing humble modest coy retiring diffident meek reserved', 'hot-03'),
 ('kind', 'Kindness and Compassion', '仁慈與同情', 'compassionate benevolent humane magnanimous clement lenient merciful tender altruistic charitable benign sympathetic', 'cruel'),
 ('cruel', 'Cruelty and Harshness', '殘酷與嚴苛', 'ruthless brutal callous barbarous merciless pitiless inhumane sadistic savage vicious heartless ferocious', 'kind'),
 ('beauty', 'Beauty and Elegance', '美麗與優雅', 'exquisite resplendent comely pulchritude elegant graceful ravishing aesthetic ornate picturesque', 'ugly'),
 ('ugly', 'Ugliness and Repulsiveness', '醜陋與令人厭惡', 'grotesque hideous repugnant repulsive unsightly loathsome abhorrent revolting ghastly odious', 'beauty'),
 ('begin', 'Beginnings and Origins', '開始與起源', 'inception genesis nascent incipient embryonic inaugurate initiate commence rudimentary advent onset fledgling', 'end'),
 ('end', 'Endings and Finality', '結束與終結', 'terminate culminate conclude cessation demise finale expire denouement extinguish abolish consummate', 'begin'),
 ('agree', 'Agreement and Harmony', '一致與和諧', 'concord accord consensus concur unanimous harmony congruent compatible consonant rapport assent', 'disagree'),
 ('disagree', 'Disagreement and Conflict', '分歧與衝突', 'discord dissent dissension friction schism rift strife at odds incongruous contention', 'agree'),
 ('respect', 'Respect and Reverence', '尊敬與崇敬', 'revere venerate esteem deference homage reverence admire honor idolize exalt', 'contempt'),
 ('contempt', 'Contempt and Scorn', '輕蔑與鄙視', 'scorn disdain derision contemptuous sneer scoff spurn flout despise jeer mock ridicule', 'respect'),
 ('order', 'Order and Method', '秩序與條理', 'systematic methodical orderly coherent meticulous regimented organized disciplined structured', 'chaos'),
 ('chaos', 'Chaos and Disorder', '混亂與失序', 'anarchy pandemonium bedlam tumult mayhem havoc turmoil upheaval chaotic disarray haphazard erratic', 'order'),
 ('necessary', 'Necessary and Essential', '必要與不可或缺', 'indispensable imperative requisite essential vital integral crucial prerequisite obligatory compulsory', 'unnecessary'),
 ('unnecessary', 'Unnecessary and Excessive', '多餘與過度', 'superfluous redundant gratuitous extraneous dispensable expendable supererogatory needless surplus', 'necessary'),
 ('old2', 'Old and Outdated', '古老與過時', 'archaic antiquated obsolete antediluvian anachronistic outmoded passe primeval hoary venerable', 'new2'),
 ('new2', 'New and Original', '新穎與原創', 'novel innovative unprecedented avant-garde newfangled pioneering fresh modern cutting-edge inventive', 'old2'),
 ('skill', 'Skill and Mastery', '技巧與精通', 'adept adroit deft dexterous proficient virtuoso consummate masterful accomplished skillful expert', 'clumsy'),
 ('clumsy', 'Clumsy and Incompetent', '笨拙與無能', 'inept awkward maladroit bungling gauche ungainly incompetent inexpert fumbling klutz', 'skill'),
 ('temporary2', 'Hesitation and Delay', '猶豫與拖延', 'procrastinate dawdle vacillate waver dither hesitate temporize dilatory loiter linger tarry', 'hot-17'),
 ('surprise', 'Surprise and Wonder', '驚奇與讚嘆', 'astonish astound flabbergast dumbfound stupefy awe marvel bewilder stagger startle', None),
 ('hide-show', 'Reveal and Disclose', '揭露與公開', 'divulge disclose unveil reveal expose manifest proclaim promulgate broadcast publicize', 'hot-25'),
 ('universal', 'Universal and Widespread', '普遍與廣泛', 'ubiquitous pervasive omnipresent prevalent rampant rife widespread endemic pandemic sweeping', 'rare'),
 ('rare', 'Rare and Scarce', '稀少與罕見', 'scarce sparse scant meager paucity dearth rare uncommon exiguous infrequent', 'universal'),
]
new_ids = {n[0] for n in NEW}
for key, theme, zh, words, opp in NEW:
    seeds = [w for w in words.split() if ok(w)]
    if len(seeds) < 3:
        print('skip', key, seeds); continue
    g = {'id': f'sat-{key}', 'source': 'New SAT group', 'theme': theme, 'themeZh': zh, 'seeds': seeds, 'expand': True, 'opp': []}
    if opp:
        g['opp'].append(opp if opp.startswith('hot-') else f'sat-{opp}')
    groups.append(g); gid[g['id']] = g
EXTRA_OPP = [('hot-20', 'sat-rare'), ('hot-22', 'sat-lazy2'), ('hot-11', 'sat-kind'), ('hot-25', 'sat-hide-show')]
for a, b in EXTRA_OPP:
    if a in gid and b in gid and b not in gid[a]['opp']: gid[a]['opp'].append(b)
for g in groups:
    for o in list(g['opp']):
        if o in gid and g['id'] not in gid[o]['opp']:
            gid[o]['opp'].append(g['id'])
    g['opp'] = [o for o in g['opp'] if o in gid]

# ---- expansion ----
EXCLUDE_ALL = {'lay', 'ready', 'cutting', 'common', 'flat', 'simple', 'plain', 'straight', 'even', 'loose', 'cross', 'human', 'famous', 'perfect',
               'certain', 'linear', 'continue', 'foreign', 'normal', 'weak', 'backward', 'dismiss', 'reject', 'refuse', 'withdraw', 'consume',
               'decent', 'delicate', 'thorough', 'rough', 'lean', 'slim', 'scrawny', 'tiny', 'shallow', 'difficult', 'favorable', 'substantial',
               'constant', 'stable', 'permanent', 'loyal', 'conjugal', 'lovelorn', 'convert', 'proselyte', 'atheist', 'ambidextrous', 'agnostic',
               'incredible', 'anxiety', 'misanthropic', 'congenital', 'revolution', 'rebellion', 'tyrannical', 'importunate', 'irrevocable',
               'inevitable', 'omnipotent', 'hallowed', 'chronic', 'feline', 'corruptible', 'fragile', 'impulsive', 'homely', 'forbidding',
               'unapproachable', 'squeamish', 'innocuous', 'bereavement', 'bereaved', 'barren', 'distressed', 'overstate', 'exaggerate', 'rarefy',
               'rattle', 'afflict', 'overthrow', 'profound', 'courtly', 'euphemistic', 'flamboyant', 'florid', 'glorious', 'majestic',
               'appropriate', 'suitable', 'expedient', 'dexter', 'fate', 'destiny', 'surmount', 'cancel', 'cumulative', 'plausible', 'verisimilar',
               'gratis', 'adventitious', 'supervenient', 'bracing', 'invigorating', 'exceptional', 'prodigious', 'quintessential', 'parturient',
               'abecedarian', 'elementary', 'primitive', 'infantile', 'autochthonous', 'dormant', 'moribund', 'quaint', 'belated', 'extinct',
               'paralyze', 'petrify', 'overwhelm', 'advertise', 'highlight', 'indicate', 'demonstrate', 'declare', 'announce', 'blissful', 'dulcet',
               'harmonious', 'sociable', 'fluent', 'cheeky', 'astringent', 'scathing', 'sporadic', 'fitful', 'spasmodic',
               'dispersed', 'irregular', 'devout', 'pious', 'committed', 'consistent', 'laborious', 'strenuous', 'toxic', 'inarticulate',
               'stereotyped', 'regnant', 'dyed-in-the-wool', 'exhaustive', 'comprehensive', 'occasional', 'jejune', 'quip', 'mystery', 'puzzle',
               'riddle', 'contrary', 'menial', 'prostrate', 'lifeless', 'inert', 'inactive', 'temporal', 'torrid', 'keen', 'oleaginous',
               'compliment', 'coax', 'degrade', 'hypocritical', 'garbled', 'shoddy', 'unnatural', 'facile', 'manageable', 'responsive',
               'receptive', 'susceptible', 'limber', 'thoughtless', 'inadvertent', 'delinquent', 'derelict', 'deprave', 'debase', 'intellectual',
               'mentor', 'guru', 'highbrow', 'scruple', 'apprehension', 'foreboding', 'implicit', 'decisive', 'unmitigated', 'fatal',
               'potent', 'puissant', 'forceful', 'vivid', 'mercurial', 'conciliatory', 'salutary', 'obscene', 'provenance', 'epilogue',
               'peroration', 'consent', 'coincident', 'rupture', 'cleft', 'logomachy', 'embroilment', 'de rigueur', 'sine qua non',
               'pleonastic', 'pointless', 'supernumerary', 'nimble', 'polished', 'versatile', 'maven', 'magisterial', 'deficient', 'tactless',
               'lengthen', 'prolong', 'protract', 'delay', 'falter', 'fluctuate', 'oscillate', 'impart', 'evince', 'glib', 'self-important',
               'stale', 'threadbare', 'lay', 'subdue', 'soften', 'slacken', 'liberal', 'unselfish', 'economical', 'provident', 'scanty',
               'perturbation', 'discomposure', 'malignant', 'injurious', 'uninterested', 'disinterested', 'blase', 'abject', 'unregenerate',
               'dour', 'grating', 'rough', 'cherish', 'applaud', 'hallow', 'plenty', 'fecund', 'capacious', 'voluminous', 'glut', 'observant',
               'discreet', 'changeable', 'fickle', 'mutable', 'shifty', 'piddling', 'superficial', 'clever', 'cogent', 'sensible', 'ready',
               'generous', 'stout', 'nerve', 'prowess', 'foolhardy', 'adventuresome', 'tremulous', 'extravagant', 'scoff at', 'contempt', 'eviscerate'}
EXCLUDE = {}
assigned = {}
for g in groups:
    for s in g['seeds']:
        assigned.setdefault(s, g['id'])

def affinity(c, seeds):
    """How strongly corpus word c belongs with the seed set."""
    sc = 0.0; hits = 0
    for s in seeds:
        v = syn_scores.get(s, {}).get(c, 0) + syn_scores.get(c, {}).get(s, 0)
        if v:
            sc += v; hits += 1
        elif c in moby.get(s, []) and s in moby.get(c, []):
            sc += 2; hits += 1
    return sc, hits

sys.path.insert(0, '/home/claude/work')
from curated_adds import ADD
for g in groups:
    g['members'] = list(g['seeds'])
    g['added'] = []
    if not g['expand']:
        continue
    for w in ADD.get(g['id'], '').split():
        if ok(w) and w not in g['members'] and w not in assigned:
            g['members'].append(w); g['added'].append(w); assigned[w] = g['id']

print(len(groups), 'groups;', sum(len(g['members']) for g in groups), 'member slots')
for g in groups:
    print(g['id'], g['theme'], len(g['seeds']), '+', len(g.get('added', [])), g.get('added', [])[:8])

# ---- per-word relations ----
members_of = collections.defaultdict(list)
for g in groups:
    for m in g['members']:
        members_of[m].append(g['id'])
rel = {}
for k in corpus:
    syn, ant = [], []
    for g_id in members_of.get(k, []):
        g = gid[g_id]
        if g['id'].startswith('hot-') and int(g['id'][4:]) in HOT_MISC:
            continue
        syn += [m for m in g['members'] if m != k]
        for o in g['opp']:
            ant += gid[o]['members']
    syn += [c for c in raw['synonyms'].get(k, []) if syn_scores.get(k, {}).get(c, 0) >= 6.5 and c not in EXCLUDE_ALL]
    ant += [c for c in raw['antonyms'].get(k, []) if c not in EXCLUDE_ALL]
    seen = set([k]); S = []
    for w in syn:
        if w not in seen and w in corpus:
            seen.add(w); S.append(w)
    A = []
    for w in ant:
        if w not in seen and w in corpus:
            seen.add(w); A.append(w)
    rel[k] = {'syn': S[:9], 'ant': A[:6], 'groups': [g for g in members_of.get(k, [])]}

# ---- write to repo ----
os.makedirs(f'{REPO}/data/relations', exist_ok=True)
idx = json.load(open(f'{REPO}/data/batches-index.json'))
for b in idx['batches']:
    data = json.load(open(f'{REPO}/data/batches/{b["id"]}.json'))
    out = {}
    for w in data['words']:
        k = re.sub(r'\s+', ' ', re.sub(r'\(.*?\)', '', w['word']).replace('^', '').strip().lower())
        r = rel.get(k)
        if not r: continue
        ref = lambda x: {'w': corpus[x]['word'], 'b': corpus[x]['batch'], 'zh': corpus[x]['zh'].split('；')[0].split('/')[0][:12]}
        out[w['word']] = {'syn': [ref(x) for x in r['syn']], 'ant': [ref(x) for x in r['ant']], 'groups': r['groups']}
    json.dump(out, open(f'{REPO}/data/relations/{b["id"]}.json', 'w'), ensure_ascii=False, separators=(',', ':'))

gout = [{'id': g['id'], 'source': g['source'], 'theme': g['theme'], 'themeZh': g['themeZh'], 'opp': g['opp'],
         'words': [{'w': corpus[m]['word'], 'pos': '/'.join(corpus[m]['pos']), 'zh': corpus[m]['zh'], 'b': corpus[m]['batch'], 'seed': m in g['seeds']} for m in g['members']]}
        for g in groups]
json.dump(gout, open(f'{REPO}/data/synonym-groups.json', 'w'), ensure_ascii=False, separators=(',', ':'))
print('words with syn', sum(1 for r in rel.values() if r['syn']), 'ant', sum(1 for r in rel.values() if r['ant']))
