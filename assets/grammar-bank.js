/* Digital SAT Grammar Question Bank — one page, two sets (?set=official | ?set=ai).
   Data: data/grammar/bank.json (built by scripts/build_grammar_bank.py). */
(() => {
  const $ = s => document.querySelector(s);
  const params = new URLSearchParams(location.search);
  const SET = params.get('set') === 'ai' ? 'ai' : 'official';
  const STORE = 'satGrammarBank:v1';
  const PAGE = 30;
  const SET_LABEL = { official: '官方', ai: 'AI' };

  let BANK, ITEMS, BY_ID, CONCEPTS, CMAP;
  let state = loadState();
  let view = { concept: 'all', sub: null, shown: PAGE };
  let session = null; // mixed-practice session

  const esc = v => { const d = document.createElement('div'); d.textContent = v ?? ''; return d.innerHTML; };
  const md = v => esc(v).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  const blank = v => esc(v).replace(/_{3,}/g, '<span class="gb-blank">______</span>');

  function loadState() {
    try { const s = JSON.parse(localStorage.getItem(STORE) || '{}'); return { answers: s.answers || {}, wrong: s.wrong || [] }; }
    catch (e) { return { answers: {}, wrong: [] }; }
  }
  function saveState() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {}
    $('#gb-wrong-n').textContent = state.wrong.length;
  }
  function record(item, sel) {
    const ok = sel === item.answer;
    state.answers[item.id] = { sel, ok, t: Date.now() };
    const i = state.wrong.indexOf(item.id);
    if (!ok && i < 0) state.wrong.push(item.id);
    if (ok && i >= 0) state.wrong.splice(i, 1);
    saveState();
    renderSide();
    return ok;
  }

  /* ---------- clause analysis markup (same notation as the 200Q page) ---------- */
  const RE = /\[(1|2|d|p)(?::([^|]+))?\|([^\]]+)\]|\{([^}]+)\}|«([^»]+)»|‹([^›]+)›|⟨([^⟩]+)⟩/g;
  function mark(src) {
    let out = '', last = 0, m; RE.lastIndex = 0;
    while ((m = RE.exec(src))) {
      out += esc(src.slice(last, m.index));
      if (m[1]) { const c = { 1: 's1', 2: 's2', d: 'sd', p: 'sp' }[m[1]]; out += `<span class="seg ${c}">${m[2] ? `<span class="tag">${esc(m[2])}</span>` : ''}${esc(m[3])}</span>`; }
      else if (m[4]) out += `<span class="tw">${esc(m[4])}</span>`;
      else if (m[5]) out += `<span class="cj">${esc(m[5])}</span>`;
      else if (m[6]) out += `<span class="cc">${esc(m[6])}</span>`;
      else out += m[7] === '∅' ? '<span class="none" title="no punctuation">∅</span>' : `<span class="pu">${esc(m[7])}</span>`;
      last = RE.lastIndex;
    }
    return out + esc(src.slice(last));
  }
  function pattern(src) {
    const has2 = /\[2[|:]/.test(src), parts = []; let m; RE.lastIndex = 0;
    while ((m = RE.exec(src))) {
      let t;
      if (m[1] === '1') t = m[2] || (has2 ? 'IC1' : 'IC');
      else if (m[1] === '2') t = m[2] ? 'IC2 ' + m[2] : 'IC2';
      else if (m[1] === 'd') t = (m[2] && !/nonessential/.test(m[2])) ? m[2] : (m[2] ? 'DC (nonessential)' : 'DC');
      else if (m[1] === 'p') t = m[2] || 'phrase';
      else if (m[4]) t = m[4]; else if (m[5]) t = m[5]; else if (m[6]) t = m[6];
      else t = m[7] === '∅' ? '∅' : '<' + m[7] + '>';
      if (t.startsWith('<')) { parts.push(t); continue; }
      if (parts.length && parts[parts.length - 1] === t) continue;
      parts.push(t);
    }
    return parts.join(' ').replace(/ <(.)>/g, '$1').replace(/^<(.)>/, '$1').replace(/— /g, '—');
  }
  const LEGEND = `<div class="gb-legend"><span class="seg s1">Independent clause 1</span><span class="seg s2">Independent clause 2</span><span class="seg sd">Dependent clause 從屬子句</span><span class="seg sp">Phrase 片語</span><span class="tw">however / though</span><span class="pu">; , .</span></div>`;

  /* ---------- question card ---------- */
  function questionCard(item, num, opts = {}) {
    const art = document.createElement('article');
    art.className = 'grammar-question gb-q';
    art.dataset.id = item.id;
    const c = CMAP[item.concept];
    art.innerHTML = `
      <div class="gb-q-head">
        <strong>${num ? 'Q' + num : ''}</strong>
        <span class="gb-badge ${item.set}">${item.set === 'official' ? '官方 Official' : 'AI'}</span>
        <span class="gb-origin">${esc(item.origin.replace(/^(Official|AI) · /, ''))}</span>
        ${opts.showConcept ? `<span class="gb-tag">${esc(c.zh)}</span>` : ''}
        <span class="gb-tag gb-tag-sub" title="${esc(item.skill)}">${esc(item.sub)}</span>
        <span class="gb-status"></span>
      </div>
      <p class="question-passage">${blank(item.passage)}</p>
      <p class="question-direction">${esc(item.stem)}</p>
      <div class="grammar-options"></div>
      <div class="gb-after" hidden>
        <div class="grammar-feedback"></div>
        <div class="gb-q-actions"></div>
        <div class="gb-analysis" hidden></div>
      </div>`;
    const box = art.querySelector('.grammar-options');
    Object.entries(item.options).forEach(([k, v]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'grammar-option'; b.dataset.k = k;
      b.innerHTML = `<strong>${k})</strong><span>${esc(v)}</span>`;
      b.addEventListener('click', () => grade(art, item, k, opts));
      box.append(b);
    });
    const prev = state.answers[item.id];
    if (prev && !opts.fresh) showResult(art, item, prev.sel, opts, true);
    return art;
  }

  function grade(art, item, sel, opts) {
    if (art.dataset.graded) return;
    const ok = record(item, sel);
    showResult(art, item, sel, opts, false);
    if (opts.onAnswer) opts.onAnswer(ok);
  }

  function showResult(art, item, sel, opts, restored) {
    art.dataset.graded = '1';
    const ok = sel === item.answer;
    art.classList.toggle('is-wrong', !ok); art.classList.toggle('is-right', ok);
    art.querySelectorAll('.grammar-option').forEach(b => {
      b.disabled = true;
      b.classList.remove('correct', 'wrong');
      if (b.dataset.k === item.answer) b.classList.add('correct');
      else if (b.dataset.k === sel) b.classList.add('wrong');
    });
    art.querySelector('.gb-status').textContent = ok ? '✓' : '✗';
    art.querySelector('.gb-status').className = 'gb-status ' + (ok ? 'ok' : 'no');
    const after = art.querySelector('.gb-after'); after.hidden = false;
    const fb = art.querySelector('.grammar-feedback');
    fb.className = 'grammar-feedback ' + (ok ? 'correct' : 'wrong');
    let why = '';
    if (item.why) why = '<ul class="gb-why">' + Object.entries(item.why).map(([k, v]) => `<li class="${k === item.answer ? 'ok' : ''}"><b>${k})</b> ${v}</li>`).join('') + '</ul>';
    fb.innerHTML = `<strong>${restored ? (ok ? '上次答對 ✓' : `上次選 ${esc(sel)}，答錯 ✗`) : (ok ? 'Correct!' : 'Not quite.')}</strong><p><b>Answer: ${item.answer}.</b> ${esc(item.explanation)}</p>${why}`;
    const acts = art.querySelector('.gb-q-actions'); acts.innerHTML = '';
    if (item.mk) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'gb-btn gb-btn-sm'; b.textContent = '看子句分析';
      const an = art.querySelector('.gb-analysis');
      b.addEventListener('click', () => {
        if (an.hidden) { an.innerHTML = `<div class="sent">${mark(item.mk)}</div><span class="pattern">${esc(pattern(item.mk))}</span>${LEGEND}`; an.hidden = false; b.textContent = '隱藏子句分析'; }
        else { an.hidden = true; b.textContent = '看子句分析'; }
      });
      acts.append(b);
    }
    if (!opts.session) {
      const r = document.createElement('button'); r.type = 'button'; r.className = 'gb-btn gb-btn-sm gb-btn-ghost'; r.textContent = '重做這題';
      r.addEventListener('click', () => { const fresh = questionCard(item, art.dataset.num, { ...opts, fresh: true }); fresh.dataset.num = art.dataset.num; art.replaceWith(fresh); });
      acts.append(r);
    }
    if (state.wrong.includes(item.id)) {
      const t = document.createElement('span'); t.className = 'gb-inwrong'; t.textContent = '已在錯題清單'; acts.append(t);
    }
  }

  /* ---------- sidebar ---------- */
  function setItems(set) { return ITEMS.filter(i => i.set === set); }
  function stats(list) {
    let done = 0, right = 0;
    list.forEach(i => { const a = state.answers[i.id]; if (a) { done++; if (a.ok) right++; } });
    return { n: list.length, done, right };
  }

  function renderSide() {
    const mine = setItems(SET);
    const nav = $('#gb-concepts'); nav.innerHTML = '';
    const sel = $('#gb-concept-select'); sel.innerHTML = '';
    const all = stats(mine);
    const mk = (id, label, zh, st, active) => {
      const a = document.createElement('a');
      a.href = '#c=' + id; a.className = 'gb-cnav' + (active ? ' active' : '');
      const pct = st.n ? Math.round(st.done / st.n * 100) : 0;
      a.innerHTML = `<span class="gb-cnav-t"><b>${esc(label)}</b>${zh ? `<small>${esc(zh)}</small>` : ''}</span><span class="gb-cnav-n">${st.done}/${st.n}</span><span class="gb-bar"><i style="width:${pct}%"></i></span>`;
      return a;
    };
    nav.append(mk('all', '全部概念', `All concepts`, all, view.concept === 'all'));
    sel.add(new Option(`全部概念 (${all.n})`, 'all'));
    CONCEPTS.forEach(c => {
      const list = mine.filter(i => i.concept === c.id);
      const st = stats(list);
      const a = mk(c.id, c.en, c.zh, st, view.concept === c.id);
      nav.append(a);
      if (view.concept === c.id) {
        const subs = document.createElement('div'); subs.className = 'gb-subs';
        c.subs.forEach(s => {
          const n = list.filter(i => i.sub === s).length;
          const b = document.createElement('a');
          b.href = '#c=' + c.id + '&s=' + encodeURIComponent(s);
          b.className = 'gb-subnav' + (view.sub === s ? ' active' : '') + (n ? '' : ' empty');
          b.innerHTML = `${esc(s)} <span>${n}</span>`;
          subs.append(b);
        });
        nav.append(subs);
      }
      sel.add(new Option(`${c.zh} ${c.en} (${list.length})`, c.id));
    });
    sel.value = view.concept;
  }

  /* ---------- main list ---------- */
  function filtered() {
    const q = $('#gb-search').value.trim().toLowerCase();
    const f = $('#gb-filter').value;
    return setItems(SET).filter(i =>
      (view.concept === 'all' || i.concept === view.concept) &&
      (!view.sub || i.sub === view.sub) &&
      (f !== 'todo' || !state.answers[i.id]) &&
      (f !== 'wrong' || state.wrong.includes(i.id)) &&
      (!q || (i.passage + ' ' + Object.values(i.options).join(' ') + ' ' + i.skill + ' ' + i.sub + ' ' + i.origin).toLowerCase().includes(q)));
  }

  function notesHtml() {
    if (view.concept === 'all') return '';
    let notes = BANK.notes.filter(n => n.concept === view.concept && (!view.sub || !n.sub || n.sub === view.sub));
    if (!notes.length) return '';
    return `<details class="gb-notes"><summary>📘 規則說明與例句 <span>${notes.length}</span></summary><div class="gb-notes-body">${notes.map(n => `
      <div class="gb-note"><p class="gb-note-from">${esc(n.from)}${n.sub ? ' · ' + esc(n.sub) : ''}</p><h4>${esc(n.title)}</h4>
      <p>${n.html ? n.en : md(n.en)}</p>${n.zh ? `<p lang="zh-Hant" class="gb-zh">${n.html ? esc(n.zh) : md(n.zh)}</p>` : ''}
      ${n.examples && n.examples.length ? `<ol>${n.examples.map(e => `<li>${md(e)}</li>`).join('')}</ol>` : ''}</div>`).join('')}</div></details>`;
  }

  function renderMain() {
    if (session) return renderSession();
    const main = $('#gb-main');
    const c = CMAP[view.concept];
    const list = filtered();
    const otherSet = SET === 'official' ? 'ai' : 'official';
    const otherN = ITEMS.filter(i => i.set === otherSet && (view.concept === 'all' || i.concept === view.concept) && (!view.sub || i.sub === view.sub)).length;
    const hash = location.hash || '';
    const st = stats(list);
    main.innerHTML = `
      <div class="gb-chead">
        <div><p class="eyebrow">${SET === 'official' ? '① 官方題 OFFICIAL' : '② AI 題 AI-GENERATED'}</p>
        <h2>${c ? esc(c.en) : 'All grammar concepts'}${c ? ` <small>${esc(c.zh)}</small>` : ''}</h2>
        <p class="gb-dim">${view.sub ? esc(view.sub) + ' · ' : ''}${list.length} 題 · 已作答 ${st.done} · 答對 ${st.right}</p></div>
        <div class="gb-chead-actions">
          <a class="gb-btn" href="grammar-bank.html?set=${otherSet}${hash}">同一概念的${SET_LABEL[otherSet]}題（${otherN}）→</a>
          ${list.length ? '<button type="button" class="gb-btn gb-btn-primary" id="gb-practice-here">練這些題（隨機）</button>' : ''}
        </div>
      </div>
      ${c ? `<div class="gb-chips"><a href="#c=${c.id}" class="${view.sub ? '' : 'active'}">全部子技能</a>${c.subs.map(sb => `<a href="#c=${c.id}&s=${encodeURIComponent(sb)}" class="${view.sub === sb ? 'active' : ''}">${esc(sb)}</a>`).join('')}</div>` : ''}
      ${notesHtml()}
      <div class="gb-list"></div>`;
    const box = main.querySelector('.gb-list');
    if (!list.length) box.innerHTML = '<div class="gb-empty">沒有符合的題目。試試清除搜尋或切換篩選。</div>';
    list.slice(0, view.shown).forEach((it, i) => { const card = questionCard(it, i + 1, { showConcept: view.concept === 'all' }); card.dataset.num = i + 1; box.append(card); });
    if (list.length > view.shown) {
      const more = document.createElement('button'); more.type = 'button'; more.className = 'gb-btn gb-more';
      more.textContent = `顯示更多（還有 ${list.length - view.shown} 題）`;
      more.addEventListener('click', () => { view.shown += PAGE; renderMain(); });
      box.append(more);
    }
    const ph = $('#gb-practice-here');
    if (ph) ph.addEventListener('click', () => startSession(shuffle(list.map(i => i.id)).slice(0, 20), `${c ? c.zh : '全部概念'}${view.sub ? ' · ' + view.sub : ''}`));
  }

  /* ---------- mixed practice session ---------- */
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function startSession(ids, label) {
    if (!ids.length) return;
    session = { ids, label, i: 0, right: 0, results: [] };
    closeDrawer();
    renderSession();
    window.scrollTo({ top: $('.gb-shell').offsetTop - 10, behavior: 'smooth' });
  }

  function renderSession() {
    const main = $('#gb-main');
    const s = session;
    if (s.i >= s.ids.length) return renderSummary();
    const item = BY_ID[s.ids[s.i]];
    main.innerHTML = `
      <div class="gb-session-head">
        <div><p class="eyebrow">🎲 混合練習 MIXED PRACTICE</p><h2>${esc(s.label)}</h2>
        <p class="gb-dim">第 ${s.i + 1} / ${s.ids.length} 題 · 答對 ${s.right}</p></div>
        <button type="button" class="gb-btn gb-btn-ghost" id="gb-session-end">結束練習</button>
      </div>
      <div class="progress-track gb-track"><span style="width:${Math.round(s.i / s.ids.length * 100)}%"></span></div>
      <div class="gb-session-q"></div>
      <div class="gb-session-next" hidden><button type="button" class="gb-btn gb-btn-primary" id="gb-next">${s.i + 1 === s.ids.length ? '看成績' : '下一題 →'}</button></div>`;
    const card = questionCard(item, s.i + 1, { fresh: true, session: true, showConcept: true, onAnswer: ok => {
      if (ok) s.right++;
      s.results.push({ id: item.id, ok });
      main.querySelector('.gb-session-next').hidden = false;
      main.querySelector('.gb-dim').textContent = `第 ${s.i + 1} / ${s.ids.length} 題 · 答對 ${s.right}`;
      $('#gb-next').focus({ preventScroll: true });
    } });
    main.querySelector('.gb-session-q').append(card);
    $('#gb-next').addEventListener('click', () => { s.i++; renderSession(); window.scrollTo({ top: $('.gb-shell').offsetTop - 10 }); });
    $('#gb-session-end').addEventListener('click', () => { s.ids = s.ids.slice(0, s.results.length); s.i = s.results.length; renderSession(); });
  }

  function renderSummary() {
    const s = session, main = $('#gb-main');
    const total = s.results.length, wrong = s.results.filter(r => !r.ok);
    const pct = total ? Math.round(s.right / total * 100) : 0;
    const byC = {};
    s.results.forEach(r => { const c = BY_ID[r.id].concept; byC[c] = byC[c] || { n: 0, ok: 0 }; byC[c].n++; if (r.ok) byC[c].ok++; });
    main.innerHTML = `
      <div class="gb-summary">
        <p class="eyebrow">練習結果 RESULTS</p><h2>${esc(s.label)}</h2>
        <div class="gb-score"><b>${s.right}</b> / ${total}<span>${pct}%</span></div>
        <table class="gb-ctable"><tbody>${Object.entries(byC).map(([c, v]) => `<tr><td>${esc(CMAP[c].zh)} <small>${esc(CMAP[c].en)}</small></td><td>${v.ok} / ${v.n}</td></tr>`).join('')}</tbody></table>
        ${wrong.length ? `<h3>答錯的題目（已加入錯題清單）</h3><ol class="gb-wrong-mini">${wrong.map(r => { const it = BY_ID[r.id]; return `<li><span class="gb-badge ${it.set}">${SET_LABEL[it.set]}</span> ${esc(CMAP[it.concept].zh)} · ${esc(it.passage.slice(0, 90))}…</li>`; }).join('')}</ol>` : '<p>全部答對！🎉</p>'}
        <div class="gb-dialog-actions">
          ${wrong.length ? '<button type="button" class="gb-btn gb-btn-primary" id="gb-redo-wrong">再練這次的錯題</button>' : ''}
          <button type="button" class="gb-btn" id="gb-new-mix">再來一組</button>
          <button type="button" class="gb-btn gb-btn-ghost" id="gb-back">回到題庫</button>
        </div>
      </div>`;
    const rw = $('#gb-redo-wrong'); if (rw) rw.addEventListener('click', () => startSession(shuffle(wrong.map(r => r.id)), s.label + ' · 錯題'));
    $('#gb-new-mix').addEventListener('click', openMix);
    $('#gb-back').addEventListener('click', () => { session = null; renderMain(); });
  }

  /* ---------- mixed practice dialog ---------- */
  function openMix() {
    const box = $('#mix-concepts'); box.innerHTML = '';
    CONCEPTS.forEach(c => {
      const l = document.createElement('label');
      l.innerHTML = `<input type="checkbox" name="mc" value="${c.id}" ${view.concept === 'all' || view.concept === c.id ? 'checked' : ''}><span>${esc(c.zh)}<small>${esc(c.en)}</small></span>`;
      box.append(l);
    });
    const form = $('#gb-mix-form');
    form.querySelector(`input[name=src][value=${SET}]`).checked = true;
    updateAvail();
    $('#gb-mix-dialog').showModal();
  }
  function mixPool() {
    const f = $('#gb-mix-form');
    const src = f.querySelector('input[name=src]:checked').value;
    const cs = [...f.querySelectorAll('input[name=mc]:checked')].map(x => x.value);
    return ITEMS.filter(i => (src === 'both' || i.set === src) && cs.includes(i.concept));
  }
  function updateAvail() {
    const n = mixPool().length;
    $('#mix-available').textContent = `可抽的題目：${n} 題`;
    $('#mix-go').disabled = !n;
  }
  $('#gb-mix-form').addEventListener('change', updateAvail);
  $('#mix-all').addEventListener('click', () => { document.querySelectorAll('input[name=mc]').forEach(x => x.checked = true); updateAvail(); });
  $('#mix-none').addEventListener('click', () => { document.querySelectorAll('input[name=mc]').forEach(x => x.checked = false); updateAvail(); });
  $('#gb-mix-dialog').addEventListener('close', () => {
    if ($('#gb-mix-dialog').returnValue !== 'go') return;
    const f = $('#gb-mix-form');
    const pool = mixPool();
    const count = +f.querySelector('input[name=count]:checked').value || pool.length;
    let ids;
    if (f.querySelector('input[name=unseen]').checked) {
      const un = shuffle(pool.filter(i => !state.answers[i.id]).map(i => i.id));
      const seen = shuffle(pool.filter(i => state.answers[i.id]).map(i => i.id));
      ids = un.concat(seen).slice(0, count);
      ids = shuffle(ids);
    } else ids = shuffle(pool.map(i => i.id)).slice(0, count);
    const src = f.querySelector('input[name=src]:checked').value;
    const cs = [...f.querySelectorAll('input[name=mc]:checked')].map(x => CMAP[x.value].zh);
    startSession(ids, `${{ both: '官方 + AI', official: '官方', ai: 'AI' }[src]} · ${cs.length === CONCEPTS.length ? '全部概念' : cs.join('、')}`);
  });
  $('#gb-mix').addEventListener('click', openMix);

  /* ---------- mistakes drawer ---------- */
  function openDrawer() { renderWrong(); $('#gb-drawer').hidden = false; $('#gb-overlay').hidden = false; }
  function closeDrawer() { $('#gb-drawer').hidden = true; $('#gb-overlay').hidden = true; }
  function renderWrong() {
    const box = $('#gb-wrong-list');
    const ids = state.wrong.filter(id => BY_ID[id]);
    $('#gb-wrong-practice').disabled = !ids.length; $('#gb-wrong-xlsx').disabled = !ids.length; $('#gb-wrong-clear').disabled = !ids.length;
    if (!ids.length) { box.innerHTML = '<p class="gb-empty">目前沒有錯題。</p>'; return; }
    box.innerHTML = CONCEPTS.map(c => {
      const mine = ids.filter(id => BY_ID[id].concept === c.id);
      if (!mine.length) return '';
      return `<h3>${esc(c.zh)} <small>${esc(c.en)} · ${mine.length}</small></h3><ul>${mine.map(id => { const it = BY_ID[id]; const a = state.answers[id];
        return `<li><span class="gb-badge ${it.set}">${SET_LABEL[it.set]}</span><span class="gb-wl-text">${esc(it.passage.replace(/_{3,}/g, '____').slice(0, 110))}…<small>${esc(it.sub)} · 你選 ${esc(a ? a.sel : '–')}，正解 ${it.answer}</small></span><button type="button" class="gb-x" data-rm="${id}" aria-label="移除">✕</button></li>`; }).join('')}</ul>`;
    }).join('');
    box.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { state.wrong = state.wrong.filter(x => x !== b.dataset.rm); saveState(); renderWrong(); renderSide(); }));
  }
  $('#gb-wrong-btn').addEventListener('click', openDrawer);
  $('#gb-drawer-close').addEventListener('click', closeDrawer);
  $('#gb-overlay').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
  $('#gb-wrong-practice').addEventListener('click', () => startSession(shuffle(state.wrong.filter(id => BY_ID[id])), '錯題清單'));
  $('#gb-wrong-clear').addEventListener('click', () => { if (confirm('確定要清除全部錯題嗎？')) { state.wrong = []; saveState(); renderWrong(); renderSide(); } });
  $('#gb-wrong-xlsx').addEventListener('click', downloadWrong);

  function loadScript(src) { return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.append(s); }); }
  async function downloadWrong() {
    const rows = state.wrong.filter(id => BY_ID[id]).map((id, n) => {
      const it = BY_ID[id], a = state.answers[id] || {};
      return { 'No.': n + 1, '題庫': it.set === 'official' ? '官方 Official' : 'AI', '文法概念': CMAP[it.concept].zh + ' ' + CMAP[it.concept].en, '子技能': it.sub, '出處': it.origin,
        'Passage': it.passage, 'Question': it.stem, 'A': it.options.A || '', 'B': it.options.B || '', 'C': it.options.C || '', 'D': it.options.D || '',
        '正確答案': it.answer, '你的答案': a.sel || '', '解析': it.explanation };
    });
    const d = new Date(), stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    try {
      if (!window.XLSX) await loadScript('assets/vendor/xlsx.mini.min.js');
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [6, 12, 30, 28, 30, 70, 30, 18, 18, 18, 18, 8, 8, 60].map(w => ({ wch: w }));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Mistakes');
      XLSX.writeFile(wb, `SAT_Grammar_Mistakes_${stamp}.xlsx`);
    } catch (e) {
      const keys = Object.keys(rows[0]);
      const csv = '﻿' + [keys.join(',')].concat(rows.map(r => keys.map(k => '"' + String(r[k]).replace(/"/g, '""') + '"').join(','))).join('\r\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `SAT_Grammar_Mistakes_${stamp}.csv`; a.click();
    }
  }

  /* ---------- routing ---------- */
  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    const c = h.get('c');
    view.concept = c && CMAP[c] ? c : 'all';
    const s = h.get('s');
    view.sub = s && CMAP[view.concept] && CMAP[view.concept].subs.includes(s) ? s : null;
    view.shown = PAGE;
  }
  window.addEventListener('hashchange', () => { session = null; readHash(); renderSide(); renderMain(); });
  $('#gb-concept-select').addEventListener('change', e => { location.hash = 'c=' + e.target.value; });
  let tmr; $('#gb-search').addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(() => { session = null; view.shown = PAGE; renderMain(); }, 200); });
  $('#gb-filter').addEventListener('change', () => { session = null; view.shown = PAGE; renderMain(); });

  /* ---------- boot ---------- */
  fetch('data/grammar/bank.json?v=20261111').then(r => { if (!r.ok) throw new Error('Question bank unavailable'); return r.json(); }).then(data => {
    BANK = data; ITEMS = data.items; CONCEPTS = data.concepts;
    BY_ID = Object.fromEntries(ITEMS.map(i => [i.id, i]));
    CMAP = Object.fromEntries(CONCEPTS.map(c => [c.id, c]));
    const nO = ITEMS.filter(i => i.set === 'official').length, nA = ITEMS.length - nO;
    $('#sw-official-n').textContent = `Official · ${nO} 題`;
    $('#sw-ai-n').textContent = `AI-generated · ${nA} 題`;
    $('#sw-' + SET).classList.add('active'); $('#sw-' + SET).setAttribute('aria-selected', 'true');
    // keep the chosen concept when switching sets
    ['official', 'ai'].forEach(s => $('#sw-' + s).addEventListener('click', e => { e.preventDefault(); location.href = `grammar-bank.html?set=${s}${location.hash}`; }));
    if (SET === 'official') {
      $('#gb-title').textContent = 'Official Digital SAT Grammar Qs';
      $('#gb-sub').textContent = `${nO} 道官方題（Practice Tests 1–10，重複出現的題目只列一次），依 ${CONCEPTS.length} 個文法概念分類。`;
    } else {
      $('#gb-title').textContent = 'AI-generated Digital SAT Grammar Qs';
      $('#gb-sub').textContent = `${nA} 道 AI 題（含各主題課程練習題、子句分析題，以及改寫自官方的 Quick Review），依 ${CONCEPTS.length} 個文法概念分類。`;
    }
    document.title = $('#gb-title').textContent + ' · SAT Grammar';
    readHash(); saveState(); renderSide(); renderMain();
  }).catch(err => { $('#gb-main').innerHTML = `<div class="gb-empty"><h2>題庫載入失敗</h2><p>${esc(err.message)}，請重新整理頁面。</p></div>`; });
})();
