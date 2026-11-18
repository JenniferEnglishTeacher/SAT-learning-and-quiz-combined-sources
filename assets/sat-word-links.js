/* SAT word links — turns every SAT-list word in a quiz page (passages, stems, options, explanations)
 * into a link to that word's own card on SAT Vocabulary Studio. Loads data/word-index.json, links the page,
 * then keeps linking whenever the quiz re-renders. Include with:
 *   <script src="https://jenniferenglishteacher.github.io/SAT-learning-and-quiz-combined-sources/assets/sat-word-links.js" defer></script>
 * Optional: <body data-sat-links-root="#quiz"> to limit the area; data-sat-links-skip=".no-links" to skip parts. */
(function () {
  const SITE = (document.currentScript && document.currentScript.src.startsWith('http://localhost')) ? 'http://localhost:8123/' : 'https://jenniferenglishteacher.github.io/SAT-learning-and-quiz-combined-sources/';
  const ROOT_SEL = document.body.dataset.satLinksRoot || '.question, .question-text, .passage, .stem, .choices, .options, .option, .feedback, .defs, .expl, .explanation, #host .content, .mock';
  const SKIP_SEL = 'script,style,textarea,input,select,code,pre,.satw,.sat-no-link,.zhbody,.cn,.tzh,.trans h4,.badge,.mini,.rowbtns,.flag,.meta,.letter,h3,h4,nav,' + (document.body.dataset.satLinksSkip || 'x-none');
  // Very common words that happen to be on the list: not worth a link in a reading passage.
  const STOP = new Set(['common', 'simple', 'remote', 'people', 'water', 'large', 'small', 'great', 'place', 'point', 'state', 'number', 'order', 'power', 'change', 'light', 'level', 'story', 'study', 'world', 'house', 'group', 'party', 'company', 'system', 'public', 'present', 'general', 'special', 'current', 'process', 'result', 'effect', 'nature', 'natural', 'figure', 'period', 'object', 'subject', 'matter', 'course', 'force', 'account', 'direct', 'certain', 'clear', 'close', 'early', 'fine', 'free', 'full', 'hard', 'high', 'human', 'late', 'likely', 'local', 'long', 'major', 'minor', 'modern', 'open', 'plain', 'poor', 'rich', 'right', 'short', 'single', 'strong', 'whole', 'rather', 'quite', 'really', 'return', 'support', 'include', 'involve', 'provide', 'require', 'consider', 'continue', 'create', 'describe', 'explain', 'example', 'research', 'social', 'important', 'different', 'possible', 'popular', 'complete', 'final', 'recent', 'original', 'actual', 'serious', 'useful', 'notice', 'share', 'spread', 'follow', 'focus', 'handle', 'imagine', 'improve', 'manage', 'mention', 'prepare', 'protect', 'raise', 'range', 'record', 'report', 'search', 'seek', 'solve', 'species', 'structure', 'surface', 'theory', 'thought', 'value', 'variety', 'version', 'volume', 'student', 'school', 'question', 'answer', 'choice', 'sentence', 'text', 'word', 'phrase', 'passage', 'information', 'idea', 'main', 'most', 'best', 'describe', 'function', 'logical', 'precise', 'conventions', 'standard', 'english', 'underlined', 'following', 'notes', 'topic', 'audience', 'goal', 'relevant', 'effectively', 'emphasize', 'introduce', 'highlight', 'similarity', 'difference', 'data', 'table', 'graph', 'statement', 'claim', 'argument', 'conclusion', 'finding', 'researchers', 'experiment', 'results', 'suggest', 'likely', 'strengthen', 'weaken', 'illustrate', 'justify', 'conclude', 'accurate', 'complete']);
  const INFLECT = (() => {
    const map = new Map();
    const add = (form, head) => { if (!map.has(form)) map.set(form, head); };
    return { map, add };
  })();
  let INDEX = null, PHRASES = new Map(), timer = null, linking = false;

  function buildForms(words) {
    for (const head of Object.keys(words)) {
      if (STOP.has(head)) continue;
      if (head.includes(' ') || head.includes('-')) { const first = head.split(/[ -]/)[0]; if (!PHRASES.has(first)) PHRASES.set(first, []); PHRASES.get(first).push(head); }
      INFLECT.add(head, head);
      const w = head;
      if (/[^aeiou]y$/.test(w)) { const s = w.slice(0, -1); INFLECT.add(s + 'ies', w); INFLECT.add(s + 'ied', w); INFLECT.add(s + 'ier', w); INFLECT.add(s + 'iest', w); INFLECT.add(s + 'ily', w); }
      if (w.endsWith('e')) { INFLECT.add(w + 'd', w); INFLECT.add(w + 's', w); INFLECT.add(w.slice(0, -1) + 'ing', w); INFLECT.add(w + 'r', w); INFLECT.add(w + 'st', w); INFLECT.add(w + 'ly', w); }
      else { INFLECT.add(w + 's', w); INFLECT.add(w + 'es', w); INFLECT.add(w + 'ed', w); INFLECT.add(w + 'ing', w); INFLECT.add(w + 'er', w); INFLECT.add(w + 'est', w); INFLECT.add(w + 'ly', w); INFLECT.add(w + w.slice(-1) + 'ed', w); INFLECT.add(w + w.slice(-1) + 'ing', w); }
      if (w.endsWith('ic')) INFLECT.add(w + 'ally', w);
      if (w.endsWith('le')) INFLECT.add(w.slice(0, -1) + 'y', w);
      if (w.endsWith('ous') || w.endsWith('ful') || w.endsWith('less') || w.endsWith('ive') || w.endsWith('ent') || w.endsWith('ant')) INFLECT.add(w + 'ness', w);
    }
  }
  const lookup = token => {
    const k = token.toLowerCase();
    const head = INFLECT.map.get(k);
    return head ? [head, INDEX.w[head]] : null;
  };
  const cardUrl = (head, entry) => `${SITE}batch.html?batch=${encodeURIComponent(INDEX.b[entry[0]])}&mode=list&word=${encodeURIComponent(entry[3] || head)}`;

  function makeLink(text, head, entry) {
    const a = document.createElement('a');
    a.className = 'satw';
    a.href = cardUrl(head, entry);
    a.target = '_blank'; a.rel = 'noopener';
    a.textContent = text;
    a.title = `${entry[3] || head} (${entry[2]}) ${entry[1]} — SAT word · open the flashcard ↗`;
    a.addEventListener('click', e => e.stopPropagation());
    return a;
  }

  function linkTextNode(node) {
    const text = node.nodeValue;
    if (!text || !/[A-Za-z]{4}/.test(text)) return;
    const re = /[A-Za-z][A-Za-z'’-]*[A-Za-z]|[A-Za-z]/g;
    let m, last = 0, frag = null;
    while ((m = re.exec(text))) {
      const tok = m[0];
      let hit = null, len = tok.length;
      const first = tok.toLowerCase();
      if (PHRASES.has(first)) {
        for (const ph of PHRASES.get(first)) {
          const cand = text.substr(m.index, ph.length);
          if (cand.toLowerCase() === ph && !/[A-Za-z]/.test(text.charAt(m.index + ph.length) || '')) { hit = [ph, INDEX.w[ph]]; len = ph.length; break; }
        }
      }
      if (!hit && tok.length >= 4) hit = lookup(tok.replace(/[’']s$/, ''));
      if (!hit) continue;
      if (!frag) frag = document.createDocumentFragment();
      frag.append(text.slice(last, m.index), makeLink(text.substr(m.index, len), hit[0], hit[1]));
      last = m.index + len;
      re.lastIndex = last;
    }
    if (frag) { frag.append(text.slice(last)); node.replaceWith(frag); }
  }

  function linkAll() {
    if (!INDEX || linking) return;
    linking = true;
    try {
      // 1. existing dictionary links (a.dict with data-w): point them at the SAT card when the word is on the list
      document.querySelectorAll('a.dict[data-w]:not([data-sat])').forEach(a => {
        a.dataset.sat = '0';
        const hit = lookup(a.dataset.w) || lookup(a.textContent.trim());
        if (!hit) return;
        a.dataset.sat = '1'; a.href = cardUrl(hit[0], hit[1]); a.classList.add('satw');
        a.title = (a.title ? a.title + ' · ' : '') + 'SAT word · open the flashcard ↗';
      });
      // 2. plain text
      const roots = [...document.querySelectorAll(ROOT_SEL)].filter((el, i, arr) => !arr.some(o => o !== el && o.contains(el)));
      roots.forEach(root => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.parentElement && (n.parentElement.closest(SKIP_SEL) || n.parentElement.closest('a'))) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
        const nodes = []; let n; while ((n = walker.nextNode())) nodes.push(n);
        nodes.forEach(linkTextNode);
      });
    } finally { linking = false; }
  }

  const style = document.createElement('style');
  style.textContent = `.satw{color:inherit;text-decoration:underline dotted #0f6c86;text-decoration-thickness:1.5px;text-underline-offset:3px;border-radius:3px}.satw:hover{background:#e3f1f5;color:#0b4b5e;text-decoration-style:solid}button .satw,.choice .satw{cursor:alias}`;
  document.head.append(style);

  fetch(SITE + 'data/word-index.json').then(r => r.json()).then(data => {
    INDEX = data; buildForms(data.w); linkAll();
    new MutationObserver(() => { if (linking) return; clearTimeout(timer); timer = setTimeout(linkAll, 120); }).observe(document.body, { childList: true, subtree: true });
  }).catch(() => {});
})();
