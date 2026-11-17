const list = document.querySelector('#group-list');
const search = document.querySelector('#group-search');
const status = document.querySelector('#group-status');
const esc = v => { const n = document.createElement('div'); n.textContent = v == null ? '' : String(v); return n.innerHTML; };
let groups = [];
let filter = 'all';
let hoverTimer = null;
const speak = text => {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = .95; speechSynthesis.speak(u);
};

const wordLink = (w, g) => `<a class="sg-word${w.seed ? '' : ' added'}" href="batch.html?batch=${encodeURIComponent(w.b)}&mode=list&word=${encodeURIComponent(w.w)}" data-say="${esc(w.w)}" title="${esc(w.zh)} · open the ${esc(w.w)} card"><span class="sg-w">${w.seed ? '' : '<i aria-label="added word">★</i>'}${esc(w.w)}</span><span class="sg-pos">${esc(w.pos)}</span><span class="sg-zh">${esc(w.zh)}</span></a>`;

function card(g) {
  const opp = g.opp.map(id => groups.find(x => x.id === id)).filter(Boolean);
  const seeds = g.words.filter(w => w.seed).length;
  return `<article class="sg-card ${g.id.startsWith('hot') ? 'is-hot' : 'is-sat'}" id="${esc(g.id)}" data-search="${esc((g.theme + ' ' + g.themeZh + ' ' + g.words.map(w => w.w + ' ' + w.zh).join(' ')).toLocaleLowerCase())}">
    <header class="sg-head"><div><p class="sg-source">${esc(g.source)}${g.words.length > seeds ? ` · ${seeds} + <b>${g.words.length - seeds} added</b>` : ''}</p><h2>${esc(g.theme)} <span>${esc(g.themeZh)}</span></h2></div><span class="sg-count">${g.words.length} words</span></header>
    <div class="sg-words">${g.words.map(w => wordLink(w, g)).join('')}</div>
    ${opp.length ? `<p class="sg-opp"><strong>反義字組 Antonym group${opp.length > 1 ? 's' : ''}:</strong> ${opp.map(o => `<a href="#${esc(o.id)}" class="sg-opp-link">${esc(o.theme)} · ${esc(o.themeZh)} (${o.words.length})</a>`).join(' ')}</p>` : ''}
  </article>`;
}

function render() {
  const term = search.value.trim().toLocaleLowerCase();
  const shown = groups.filter(g => (filter === 'all' || g.id.startsWith(filter)) && (!term || g.theme.toLocaleLowerCase().includes(term) || g.themeZh.includes(term) || g.words.some(w => w.w.toLocaleLowerCase().startsWith(term) || w.zh.includes(term))));
  list.innerHTML = shown.length ? shown.map(card).join('') : '<div class="empty-state"><h2>No group matches.</h2><p>Try another word or theme.</p></div>';
  if (term) list.querySelectorAll('.sg-word').forEach(a => { const w = a.dataset.say.toLocaleLowerCase(); const zh = a.querySelector('.sg-zh').textContent; if (w.startsWith(term) || zh.includes(term)) a.classList.add('hit'); });
  status.textContent = `${shown.length} of ${groups.length} groups · ${shown.reduce((n, g) => n + g.words.length, 0)} words`;
}

list.addEventListener('mouseover', e => {
  const a = e.target.closest('[data-say]'); if (!a) return;
  clearTimeout(hoverTimer); hoverTimer = setTimeout(() => speak(a.dataset.say), 250);
});
list.addEventListener('mouseout', () => clearTimeout(hoverTimer));
list.addEventListener('click', e => {
  const a = e.target.closest('.sg-opp-link'); if (!a) return;
  e.preventDefault();
  const target = document.querySelector(a.getAttribute('href'));
  if (!target) { filter = 'all'; document.querySelectorAll('.sg-chip').forEach(c => c.classList.toggle('active', c.dataset.filter === 'all')); search.value = ''; render(); }
  const t = document.querySelector(a.getAttribute('href'));
  if (t) { history.replaceState(null, '', a.getAttribute('href')); t.scrollIntoView({ behavior: 'smooth', block: 'start' }); t.classList.add('flash'); setTimeout(() => t.classList.remove('flash'), 2500); }
});
document.querySelectorAll('.sg-chip').forEach(c => c.addEventListener('click', () => { filter = c.dataset.filter; document.querySelectorAll('.sg-chip').forEach(x => x.classList.toggle('active', x === c)); render(); }));
search.addEventListener('input', render);

fetch('data/synonym-groups.json').then(r => r.json()).then(data => {
  groups = data;
  document.querySelector('#group-counter').textContent = `${groups.length} groups · ${groups.reduce((n, g) => n + g.words.length, 0)} words`;
  render();
  if (location.hash) {
    const t = document.querySelector(decodeURIComponent(location.hash));
    if (t) { setTimeout(() => { t.scrollIntoView({ block: 'start' }); t.classList.add('flash'); }, 50); }
  }
}).catch(() => { list.innerHTML = '<div class="empty-state"><h2>Groups unavailable</h2><p>Please refresh the page.</p></div>'; });
