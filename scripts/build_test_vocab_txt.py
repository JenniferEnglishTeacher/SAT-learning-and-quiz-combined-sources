#!/usr/bin/env python3
"""Build data/batches/sat-test-NN.json from a tab-separated vocabulary export (Tests 2, 3, 4 formats).

Usage: python3 scripts/build_test_vocab_txt.py <test_number> <export.txt>
  Test 2: Word (Qn)\tPOS. Definition. Sentence 中文翻譯      ("Module 2" line = section break)
  Test 3: word\t(pos) definition: 中文釋義 Sentence(s) 中文翻譯
  Test 4: word\t(pos) definition 中文釋義 Sentence 中文翻譯
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
n = int(sys.argv[1]); src = Path(sys.argv[2])
batch_id = f"sat-test-{n:02d}"
CJK = r"一-鿿　-〿＀-￯‘-”"

WORD_FIX = {
    "Mimick": "mimic", "contrive=fabricate=make up": ("contrive", "= fabricate = make up"),
    "disparate=diverse=different=heterogeneous": ("disparate", "= diverse = different = heterogeneous"),
    "attach ...to": "attach … to", "replace...with": "replace … with",
    "comply with=abide by": ("comply with", "= abide by"),
}

ZH2 = {
 "Indigenous": "原住民的；本土的", "tenure": "任期；（土地）保有權", "consolidate": "合併；鞏固", "unpredictable": "不可預測的",
 "secretive": "守口如瓶的；神祕的", "ordinary": "普通的；平凡的", "syntax": "句法；語法結構", "opaque": "不透明的；晦澀難懂的",
 "delegate": "委派；授權", "compose": "創作；作曲", "interpret": "解讀；詮釋", "renounce": "正式放棄；宣布拋棄",
 "diversification": "多樣化", "catastrophic": "災難性的", "elusive": "難以捉摸的；難以達成的", "abrupt": "突然的",
 "imminent": "即將發生的", "archaeological": "考古學的", "waive": "放棄（權利）；免除", "concede": "承認；讓步",
 "refute": "駁斥；反駁", "prevalence": "普遍；盛行", "replicable": "可複製的；可重現的", "predetermined": "預先決定的",
 "operative": "生效的；運作中的", "latent": "潛在的；潛伏的", "overshadow": "使黯然失色；遮蔽", "irrelevant": "不相關的",
 "representative": "有代表性的", "consistent": "一致的；始終如一的", "tenuous": "薄弱的；站不住腳的", "disorienting": "令人迷失方向的",
 "nuanced": "細膩的；有微妙差別的", "unoriginal": "缺乏創意的", "account for": "解釋；說明（原因）", "benediction": "祝福；祝禱",
 "pilgrimage": "朝聖之旅", "retrace": "折返；沿原路返回", "leisurely": "悠閒的（地）", "yield": "出產；產生",
 "reluctant": "不情願的", "foreground": "凸顯；使成為焦點", "conventional": "傳統的；常規的", "replenishment": "補充；補給",
 "outcompete": "在競爭中勝過", "mimic": "模仿；模擬", "aloft": "在高處；在空中", "resistance": "阻力；抵抗",
 "posit": "假設；斷定", "conjecture": "推測；臆測", "apparatus": "儀器；設備", "definitive": "確鑿的；決定性的",
 "undermine": "削弱；暗中破壞", "correlate": "相關；相互關聯", "gene pool": "基因庫", "misrepresent": "歪曲；不實陳述",
 "autobiographical": "自傳性的", "overlook": "忽略；未注意到", "innate": "與生俱來的；天生的", "stimuli": "刺激（物）",
 "solitary": "獨居的；單獨的", "inarguable": "無可辯駁的", "marginal": "邊緣的；次要的", "coincidental": "巧合的",
 "dexterity": "靈巧；敏捷", "indicative": "顯示的；表明的", "discrepancy": "差異；不一致", "diapause": "滯育（昆蟲發育暫停）",
 "dormant": "休眠的；蟄伏的", "foster": "培養；促進", "distorting": "使扭曲；歪曲", "synesthesia": "聯覺",
 "evoke": "喚起；引起", "prototype": "原型", "materialism": "物質主義", "disparities": "差距；不平等",
 "conspicuously": "顯眼地；明顯地", "volition": "意志；自願", "deployed": "部署；調度", "inaccessible": "無法到達的；難以接近的",
 "divergent": "分歧的；迥異的", "methodology": "方法論；研究方法", "collaboration": "合作", "characterization": "角色塑造",
 "commercialization": "商業化", "inadequate": "不足的；不充分的", "resilient": "有韌性的；能迅速恢復的", "dynamic": "充滿活力的；動態的",
 "invalidate": "使無效；推翻", "robust": "強勁的；健壯的", "underscore": "強調", "inventive": "有創意的；獨具匠心的",
 "restrained": "克制的；內斂的", "inexplicable": "無法解釋的", "mystifying": "令人困惑的", "diverse": "多元的；各式各樣的",
 "predatory": "掠食性的", "obscure": "鮮為人知的；晦澀的", "localized": "局部的；侷限於某地的", "confer": "授予；賦予",
 "agency": "能動性；主動權", "activism": "行動主義；社會運動", "luxuriant": "繁茂的", "listlessly": "無精打采地",
 "entranced": "入迷的；著迷的", "respondents": "受訪者", "predation": "捕食", "attributable": "可歸因於……的",
 "cultivated": "耕種的；栽培的", "enamel": "琺瑯質", "endothermic": "溫血的；恆溫的", "ambient": "周圍的；環境的",
 "abundance": "豐富；大量", "polarized": "兩極分化的", "novel": "新穎的", "retrospective": "回顧展",
 "deficiency": "缺乏；不足", "rind": "果皮（尤指柑橘類）", "lifelike": "逼真的", "repurpose": "改作他用；再利用",
 "mycology": "真菌學", "germination": "發芽", "revitalization": "振興；復甦", "percolate": "滲透；滲濾",
 "subterranean": "地下的", "landmark": "具里程碑意義的", "oeuvre": "（藝術家的）全部作品", "adaptation": "適應；適應性特徵",
 "ratified": "批准；正式簽署", "inauguration": "就職典禮", "titular": "同名的；名義上的", "cosmochemist": "宇宙化學家",
 "wake": "尾流；航跡",
}

def pos_key(pos):
    p = pos.lower()
    if p.startswith("n"): return "n."
    if p.startswith("adj"): return "adj."
    if p.startswith("adv"): return "adv."
    if p.startswith("v"): return "v."
    return "other"

def sq(s): return re.sub(r"\s+", " ", s).strip()

def split_en_zh(text):
    """English sentence up to the first CJK char, Chinese after it."""
    m = re.search(f"[{CJK}]", text)
    if not m: return sq(text), ""
    cut = m.start()
    d = re.search(r"[\d\s]+$", text[:cut])  # "1990年代" -> keep the digits with the Chinese
    if d: cut = d.start()
    return sq(text[:cut]), sq(text[cut:])

def fix_blank(sent, word):
    """Return (sentence, form): '______s' -> plural/3rd-person form; stray second blank '____' dropped."""
    form = None
    if "______s" in sent:
        form = word + "s"; sent = sent.replace("______s", "______")
    if "…" in word and re.search(r"\s_{3,5}\s", sent):  # "attach … to": second blank is the particle
        sent = re.sub(r"\s_{3,5}\s", f" {word.split()[-1]} ", sent); form = word.split()[0]
    return sent, form

words, section, seen = [], "", {}
for raw in src.read_text(encoding="utf-8").splitlines():
    if not raw.strip(): continue
    head, _, body = raw.partition("\t")
    head = sq(head); body = sq(body)
    if re.match(r"module\s*\d$", head, re.I) and not body:
        section = head; continue
    note = ""
    q = re.search(r"\((Q\d+)\)\s*$", head)
    if q: note = f"{section or 'Module 1'} {q.group(1)}"; head = head[:q.start()].strip()
    forms = re.match(r"(.*?)\s*\(([^()]*,[^()]*)\)\s*$", head)  # "overcome (overcome, overcame, overcome)"
    if forms: head, note = forms.group(1).strip(), "Forms: " + forms.group(2).strip()
    fix = WORD_FIX.get(head, head)
    if isinstance(fix, tuple): head, extra = fix; note = (note + " " if note else "") + extra
    else: head = fix
    word = head if head[:1].isupper() and head[1:2].isupper() else head[:1].lower() + head[1:]
    if head in ("Indigenous", "Mesopotamian", "Epicurean"): word = head

    if n == 2:
        m = re.match(r"((?:Adj|Adv|N|V)\.(?:/(?:Adj|Adv|N|V)\.)*)\s*(\(Phrasal\))?\s*(.*)", body)
        pos = m.group(1).lower() + (" phr." if m.group(2) else "")
        rest = m.group(3)
        en, zh = split_en_zh(rest)
        paren = re.search(r"\((noun|verb|adj\.?|adv\.?):\s*([^)]*)\)", en)
        if paren: note = (note + " · " if note else "") + f"{paren.group(1)}: {paren.group(2)}"; en = en[:paren.start()] + en[paren.end():]
        blank = en.index("______")
        cut = max(mm.end() for mm in re.finditer(r"\.\s+(?=[A-Z])", en[:blank]))
        defn, sent = sq(en[:cut]).rstrip("."), sq(en[cut:])
        defn_zh = ZH2.get(word, "")
        if not defn_zh: print("NO ZH:", word)
        if not section: section = "Module 1"
    else:
        m = re.match(r"((?:\([^)]*\)\s*/?\s*)+)(.*)", body)
        pos = sq(m.group(1)).replace("(", "").replace(")", "").replace(" / ", "/")
        rest = m.group(2)
        first_cjk = re.search(f"[{CJK}]", rest).start()
        defn = sq(rest[:first_cjk]).rstrip(":").strip()
        tail = rest[first_cjk:]
        sm = re.search(r"\s(?=[A-Z][a-z]|I\s|DNA|A\s|An\s)", tail)  # first English sentence start
        defn_zh = sq(tail[:sm.start()]); sent, zh = split_en_zh(tail[sm.start():])
    sent, form = fix_blank(sent, word)
    sentence = {"en": sent, "zh": zh}
    if form: sentence["form"] = form
    key = word.lower()
    if key in seen:
        if sent not in [s["en"] for s in seen[key]["sentences"]]: seen[key]["sentences"].append(sentence)
        continue
    item = {"word": word, "pos": pos, "pos_key": pos_key(pos), "defn_en": defn, "defn_zh": defn_zh,
            "root_note": note, "sentences": [sentence]}
    if section: item["section"] = section
    words.append(item); seen[key] = item
    if "______" not in sent or not defn or (n != 2 and not defn_zh):
        print("CHECK", word, "|", defn[:40], "|", defn_zh, "|", sent[:50])

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
