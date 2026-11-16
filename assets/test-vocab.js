/* Practice-test vocabulary list: hover/click to hear, ★ to save for review, toggles for Chinese / definition / hidden word. */
const params = new URLSearchParams(location.search);
const testNumber = Math.max(1, parseInt(params.get('test') || '1', 10) || 1);
const batchId = `sat-test-${String(testNumber).padStart(2, '0')}`;
const REVIEW_KEY = 'satVocabReviewWords'; // shared with batch.html so one review list covers everything
const list = document.querySelector('#tv-list');

let batch = null;
let reviewStore = new Map();

const esc = (value = '') => { const node = document.createElement('div'); node.textContent = value; return node.innerHTML; };
const readStore = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };
const writeStore = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } };
const wordKey = word => String(word).toLocaleLowerCase();
const fillBlank = (sentence, word) => sentence.en.replaceAll('______', sentence.form || word);

/* ---------- speech ---------- */
function speak(text, tile) {
  if (!('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(String(text).replaceAll('______', 'blank'));
  utterance.lang = 'en-US';
  const voice = speechSynthesis.getVoices().find(item => item.lang.startsWith('en'));
  if (voice) utterance.voice = voice;
  if (tile) { tile.classList.add('playing'); utterance.onend = utterance.onerror = () => tile.classList.remove('playing'); }
  speechSynthesis.speak(utterance);
}

let hoverSpeech = readStore('satVocabHoverSpeech', true) !== false;
let hoverTimer = null;
let hoverTarget = null;
document.addEventListener('pointerover', event => {
  if (event.pointerType && event.pointerType !== 'mouse') return;
  const target = event.target.closest('[data-say]');
  if (!target || target === hoverTarget) return;
  hoverTarget = target;
  clearTimeout(hoverTimer);
  if (!hoverSpeech) return;
  hoverTimer = setTimeout(() => speak(decodeURIComponent(target.dataset.say)), 200);
});
document.addEventListener('pointerout', event => {
  if (!hoverTarget) return;
  if (event.relatedTarget && hoverTarget.contains(event.relatedTarget)) return;
  clearTimeout(hoverTimer);
  hoverTarget = null;
});

/* ---------- review list (shared store) ---------- */
function loadReview() {
  reviewStore = new Map(readStore(REVIEW_KEY, []).filter(item => item && item.word).map(item => [wordKey(item.word), item]));
}
function reviewRecord(item) {
  return { word: item.word, pos: item.pos, pos_key: item.pos_key, defn_en: item.defn_en, defn_zh: item.defn_zh, root_note: item.root_note || '',
    sentences: item.sentences || [], batchId: batch.id, batchName: batch.name, partLabel: batch.part_label, addedAt: Date.now() };
}
const isMarked = word => reviewStore.has(wordKey(word));
function toggleReview(word) {
  const key = wordKey(word);
  if (reviewStore.has(key)) reviewStore.delete(key);
  else { const item = batch.words.find(entry => entry.word === word); if (item) reviewStore.set(key, reviewRecord(item)); }
  writeStore(REVIEW_KEY, [...reviewStore.values()]);
  refreshReviewUi();
}
function refreshReviewUi() {
  document.querySelectorAll('[data-review]').forEach(node => {
    const on = isMarked(decodeURIComponent(node.dataset.review));
    node.classList.toggle('on', on);
    node.classList.toggle('marked', on);
    if (node.classList.contains('tv-star')) { node.textContent = on ? '★' : '☆'; node.setAttribute('aria-pressed', String(on)); node.title = on ? 'Remove from my review words' : 'Add to my review words'; }
  });
  const here = batch.words.filter(item => isMarked(item.word)).length;
  const button = document.querySelector('#tv-review-open');
  if (button) { button.textContent = `★ My review words (${reviewStore.size})`; button.disabled = reviewStore.size === 0; }
  const hint = document.querySelector('#tv-review-hint');
  if (hint) hint.textContent = reviewStore.size ? `${here} from this test · ${reviewStore.size} saved in total` : 'Click ☆ next to a word to save it for review.';
  if (document.querySelector('#tv-drawer')) renderDrawer();
}

function renderDrawer() {
  const drawer = document.querySelector('#tv-drawer');
  if (!drawer) return;
  const items = [...reviewStore.values()];
  const groups = new Map();
  items.forEach(item => { const key = item.batchName || 'Other'; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item); });
  drawer.innerHTML = `<div class="tv-drawer-head"><div><p class="eyebrow">MY REVIEW WORDS</p><h2>${items.length} saved word${items.length === 1 ? '' : 's'}</h2></div><button type="button" class="tv-star" data-close aria-label="Close">✕</button></div>
  <div class="tv-drawer-actions"><button type="button" data-download${items.length ? '' : ' disabled'}>⬇ Download (Excel)</button><button type="button" data-clear${items.length ? '' : ' hidden'}>Clear all</button></div>
  ${[...groups.entries()].map(([name, rows]) => `<h3>${esc(name)}</h3>${rows.map(item => `<div class="tv-drawer-row"><button type="button" class="tv-tile" style="width:2.2rem;height:2.2rem;font-size:1rem;border-radius:8px" data-speak="${encodeURIComponent(item.word)}" aria-label="Listen">🔊</button><div><strong data-say="${encodeURIComponent(item.word)}">${esc(item.word)}</strong><small>${esc(item.pos || '')} ${esc(item.defn_zh || '')}</small></div><button type="button" data-remove="${encodeURIComponent(item.word)}" title="Remove">✕</button></div>`).join('')}`).join('') || '<p class="tv-empty">No words saved yet.</p>'}`;
}
function openDrawer(open) {
  document.querySelector('#tv-drawer')?.remove();
  document.querySelector('#tv-backdrop')?.remove();
  if (!open) return;
  const backdrop = Object.assign(document.createElement('div'), { id: 'tv-backdrop', className: 'tv-backdrop' });
  const drawer = Object.assign(document.createElement('aside'), { id: 'tv-drawer', className: 'tv-drawer' });
  document.body.append(backdrop, drawer);
  renderDrawer();
}

function loadScript(src) {
  return new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = src; s.onload = resolve; s.onerror = reject; document.head.append(s); });
}
async function downloadReview() {
  const items = [...reviewStore.values()];
  if (!items.length) return;
  const rows = items.map((item, index) => ({
    'No.': index + 1, Word: item.word, Source: item.batchName || '', POS: item.pos || '',
    'English definition': item.defn_en || '', '繁體中文': item.defn_zh || '', 'Root clue': item.root_note || '',
    'Example sentence': item.sentences?.[0] ? fillBlank(item.sentences[0], item.word) : '', '翻譯': item.sentences?.[0]?.zh || ''
  }));
  const fileName = `my_review_words_${new Date().toISOString().slice(0, 10)}`;
  try {
    if (!window.XLSX) await loadScript('assets/vendor/xlsx.mini.min.js');
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet['!cols'] = [6, 18, 26, 8, 40, 22, 28, 60, 40].map(wch => ({ wch }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Review words');
    XLSX.writeFile(book, `${fileName}.xlsx`);
  } catch {
    const headers = Object.keys(rows[0]);
    const cell = value => `"${String(value).replaceAll('"', '""')}"`;
    const csv = [headers.map(cell).join(','), ...rows.map(row => headers.map(key => cell(row[key])).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: `${fileName}.csv` });
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/* ---------- rendering ---------- */
function cambridgeUrl(term) {
  const slug = String(term).trim().toLocaleLowerCase().replace(/[^a-z0-9' -]/g, '').replace(/\s+/g, '-');
  return `https://dictionary.cambridge.org/dictionary/english-chinese-traditional/${encodeURIComponent(slug)}`;
}
function sentenceHtml(sentence, word) {
  const filled = fillBlank(sentence, word);
  const shown = sentence.form || word;
  const index = filled.toLocaleLowerCase().indexOf(shown.toLocaleLowerCase());
  if (index === -1) return esc(filled);
  const target = filled.slice(index, index + shown.length);
  return `${esc(filled.slice(0, index))}<b class="tv-target" data-word="${esc(target)}">${esc(target)}</b>${esc(filled.slice(index + shown.length))}`;
}
function render() {
  list.innerHTML = '';
  let currentSection = '';
  batch.words.forEach((word, index) => {
    if (word.section && word.section !== currentSection) {
      currentSection = word.section;
      const heading = document.createElement('li');
      heading.className = 'tv-section';
      heading.innerHTML = `<p class="eyebrow">TEST SECTION</p><h2>${esc(currentSection)}</h2>`;
      list.append(heading);
    }
    const row = document.createElement('li');
    row.className = 'tv-row';
    row.dataset.search = `${word.word} ${word.defn_en} ${word.defn_zh}`.toLocaleLowerCase();
    const sentences = word.sentences.map(sentence => `<p class="tv-en" data-say="${encodeURIComponent(fillBlank(sentence, word.word))}" data-speak="${encodeURIComponent(fillBlank(sentence, word.word))}">${sentenceHtml(sentence, word.word)}</p><p class="tv-tr">${esc(sentence.zh || '')}</p>`).join('');
    row.innerHTML = `<div class="tv-num">${index + 1}</div>
      <button class="tv-tile" type="button" data-speak="${encodeURIComponent(word.word)}" aria-label="Listen to ${esc(word.word)}">🔊</button>
      <div class="tv-word-wrap"><div class="tv-word-line"><a class="tv-word" href="${cambridgeUrl(word.word)}" target="_blank" rel="noopener noreferrer" data-say="${encodeURIComponent(word.word)}" data-review="${encodeURIComponent(word.word)}" title="Open in Cambridge English–Traditional Chinese Dictionary">${esc(word.word)}</a><button class="tv-star" type="button" data-review="${encodeURIComponent(word.word)}" data-toggle aria-pressed="false">☆</button></div>
      <div class="tv-meta"><span class="tv-pos">${esc(word.pos)}</span><span class="tv-zh">${esc(word.defn_zh)}</span></div>
      <p class="tv-def">${esc(word.defn_en)}</p>${word.root_note ? `<p class="tv-root">${esc(word.root_note)}</p>` : ''}</div>
      <div class="tv-sent">${sentences}</div>`;
    list.append(row);
  });
  refreshReviewUi();
}

function applyHideWord() {
  const hide = document.querySelector('#opt-hide-word').checked;
  document.querySelectorAll('.tv-target').forEach(node => node.classList.toggle('blank', hide));
}

function renderTestNav(index) {
  const nav = document.querySelector('#tv-tests');
  const available = new Set((index.batches || []).map(item => item.id));
  nav.innerHTML = Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
    const id = `sat-test-${String(n).padStart(2, '0')}`;
    const ok = available.has(id);
    return `<a href="test-vocab.html?test=${n}" class="${n === testNumber ? 'active' : ''}${ok ? '' : ' pending'}" ${ok ? '' : 'aria-disabled="true" title="Coming soon"'}>Test ${n}</a>`;
  }).join('');
}

function buildBar() {
  const bar = document.createElement('div');
  bar.className = 'tv-bar';
  bar.innerHTML = `<button type="button" id="tv-review-open" class="primary">★ My review words (0)</button><span id="tv-review-hint"></span>`;
  document.body.append(bar);
}

/* ---------- events ---------- */
document.addEventListener('click', event => {
  const speakButton = event.target.closest('[data-speak]');
  if (speakButton) { speak(decodeURIComponent(speakButton.dataset.speak), speakButton.classList.contains('tv-tile') ? speakButton : null); return; }
  const star = event.target.closest('[data-toggle]');
  if (star) { toggleReview(decodeURIComponent(star.dataset.review)); return; }
  const remove = event.target.closest('[data-remove]');
  if (remove) { toggleReview(decodeURIComponent(remove.dataset.remove)); return; }
  if (event.target.closest('#tv-review-open')) { openDrawer(true); return; }
  if (event.target.closest('[data-close]') || event.target.id === 'tv-backdrop') { openDrawer(false); return; }
  if (event.target.closest('[data-download]')) { downloadReview(); return; }
  if (event.target.closest('[data-clear]')) {
    if (!confirm(`Remove all ${reviewStore.size} saved review words?`)) return;
    reviewStore.clear(); writeStore(REVIEW_KEY, []); refreshReviewUi();
  }
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') openDrawer(false); });
window.addEventListener('storage', event => { if (event.key === REVIEW_KEY && batch) { loadReview(); refreshReviewUi(); } });

document.querySelector('#opt-hide-word').addEventListener('change', applyHideWord);
document.querySelector('#opt-chinese').addEventListener('change', event => { document.body.classList.toggle('show-zh', event.target.checked); writeStore('satTestVocabShowZh', event.target.checked); });
document.querySelector('#opt-hover').addEventListener('change', event => { hoverSpeech = event.target.checked; writeStore('satVocabHoverSpeech', hoverSpeech); if (!hoverSpeech && 'speechSynthesis' in window) speechSynthesis.cancel(); });
document.querySelector('#tv-filter').addEventListener('input', event => {
  const query = event.target.value.trim().toLocaleLowerCase();
  document.querySelectorAll('.tv-row').forEach(row => { row.hidden = Boolean(query) && !row.dataset.search.includes(query); });
});

/* ---------- init ---------- */
const showZh = readStore('satTestVocabShowZh', true) !== false;
document.querySelector('#opt-chinese').checked = showZh;
document.querySelector('#opt-hover').checked = hoverSpeech;
document.body.classList.toggle('show-zh', showZh);

Promise.all([
  fetch(`data/batches/${batchId}.json`).then(response => { if (!response.ok) throw Error(); return response.json(); }),
  fetch('data/mocktest-index.json').then(response => response.ok ? response.json() : { batches: [] }).catch(() => ({ batches: [] }))
]).then(([data, index]) => {
  batch = data;
  document.title = `Practice Test ${testNumber} Vocabulary · SAT Vocabulary Studio`;
  document.querySelector('#tv-title').textContent = `Practice Test ${testNumber} · Vocabulary`;
  document.querySelector('#tv-subtitle').textContent = `${batch.subtitle} · ${batch.words.length} words`;
  document.querySelector('#tv-counter').textContent = `${batch.words.length} words`;
  renderTestNav(index);
  loadReview();
  buildBar();
  render();
}).catch(() => {
  document.querySelector('main').innerHTML = document.querySelector('#loading-error').innerHTML;
});
