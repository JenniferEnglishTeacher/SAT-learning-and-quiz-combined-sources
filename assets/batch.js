const params = new URLSearchParams(location.search);
const batchId = params.get('batch');
const requestedMode = params.get('mode');
const mode = ['learn', 'quiz', 'list'].includes(requestedMode) ? requestedMode : 'learn';
const grid = document.querySelector('#learn-grid');
const referenceGrid = document.querySelector('#reference-grid');
const fill = document.querySelector('#progress-fill');
const progressCopy = document.querySelector('#progress-copy');

let batch;
let learned = 0;
let order = [];
let q = 0;
let score = 0;
let results = [];
let currentStudent = null;
const relationCache = new Map();

const definitionStopWords = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'being', 'by', 'for', 'from',
  'has', 'have', 'in', 'into', 'is', 'it', 'its', 'no', 'not', 'of', 'on', 'or', 'that', 'the',
  'their', 'this', 'to', 'was', 'were', 'which', 'with', 'without'
]);

const shuffle = values => {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const esc = (value = '') => {
  const node = document.createElement('div');
  node.textContent = value;
  return node.innerHTML;
};

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.replaceAll('______', 'blank'));
  utterance.lang = 'en-US';
  const voice = speechSynthesis.getVoices().find(item => item.lang.startsWith('en'));
  if (voice) utterance.voice = voice;
  speechSynthesis.speak(utterance);
}

const speaker = (text, label = 'Listen') =>
  `<button class="speak-button" type="button" data-speak="${encodeURIComponent(text)}" aria-label="${esc(label)}">🔊</button>`;

function cambridgeUrl(term) {
  const slug = String(term).trim().toLocaleLowerCase().replace(/[^a-z0-9' -]/g, '').replace(/\s+/g, '-');
  return `https://dictionary.cambridge.org/dictionary/english-chinese-traditional/${encodeURIComponent(slug)}`;
}

function dictionaryLink(term, label = term) {
  return `<a class="dictionary-link" href="${cambridgeUrl(term)}" target="_blank" rel="noopener noreferrer" title="Look up ${esc(term)} in Cambridge English–Traditional Chinese Dictionary">${esc(label)}</a>`;
}

function linkedDefinition(definition) {
  const source = String(definition || '');
  const pattern = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;
  let output = '';
  let cursor = 0;
  let match = pattern.exec(source);
  while (match) {
    output += esc(source.slice(cursor, match.index));
    const token = match[0];
    const normalized = token.toLocaleLowerCase();
    output += token.length > 2 && !definitionStopWords.has(normalized) ? dictionaryLink(token) : esc(token);
    cursor = match.index + token.length;
    match = pattern.exec(source);
  }
  return output + esc(source.slice(cursor));
}

function relationTopics(definition) {
  return (String(definition).match(/[A-Za-z]+/g) || [])
    .map(item => item.toLocaleLowerCase())
    .filter(item => item.length > 3 && !definitionStopWords.has(item))
    .slice(0, 5)
    .join(',');
}

async function datamuseWords(parameter, query, max, posKey, topics = '') {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    const topicHint = topics ? `&topics=${encodeURIComponent(topics)}` : '';
    const url = `https://api.datamuse.com/words?${parameter}=${encodeURIComponent(query)}&max=${max * 3}&md=p${topicHint}`;
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error('Relation lookup failed');
    const data = await response.json();
    const expectedTag = { 'n.': 'n', 'v.': 'v', 'adj.': 'adj', 'adv.': 'adv' }[posKey];
    return data
      .filter(item => !expectedTag || (Array.isArray(item.tags) && item.tags.includes(expectedTag)))
      .map(item => String(item.word || '').replaceAll('_', ' ').trim())
      .filter(Boolean)
      .slice(0, max);
  } finally {
    clearTimeout(timeout);
  }
}

function wordRelations(word, posKey, definition) {
  const headword = String(word).toLocaleLowerCase();
  const key = `${headword}|${posKey}|${definition}`;
  if (!relationCache.has(key)) {
    relationCache.set(key, Promise.allSettled([
      datamuseWords('rel_syn', headword, 6, posKey, relationTopics(definition)),
      datamuseWords('rel_ant', headword, 4, posKey)
    ]).then(([synonyms, antonyms]) => ({
      synonyms: synonyms.status === 'fulfilled' ? synonyms.value.filter(item => item.toLocaleLowerCase() !== headword).slice(0, 6) : [],
      antonyms: antonyms.status === 'fulfilled' ? antonyms.value : [],
      available: synonyms.status === 'fulfilled' || antonyms.status === 'fulfilled'
    })));
  }
  return relationCache.get(key);
}

function relationRow(label, words) {
  return `<p class="relation-row"><strong>${label}:</strong> ${words.map(item => dictionaryLink(item)).join(', ')}</p>`;
}

async function loadWordRelations(word, posKey, definition, container) {
  if (!container || container.dataset.loaded === 'true') return;
  container.dataset.loaded = 'true';
  try {
    const relations = await wordRelations(word, posKey, definition);
    if (!relations.available) throw new Error('No relation service');
    const sections = [];
    sections.push(relations.synonyms.length ? relationRow('Synonyms', relations.synonyms) : '<p class="relation-row"><strong>Synonyms:</strong> No synonym listed.</p>');
    if (relations.antonyms.length) sections.push(relationRow('Antonyms', relations.antonyms));
    container.innerHTML = sections.join('');
  } catch {
    container.innerHTML = '<p class="relation-status">Synonyms are temporarily unavailable. You can still click definition words to use Cambridge Dictionary.</p>';
  }
}

let referenceRelationObserver = null;

function observeReferenceRelations(container, word) {
  if (!container) return;
  if (!('IntersectionObserver' in window)) {
    loadWordRelations(word.word, word.pos_key, word.defn_en, container);
    return;
  }
  if (!referenceRelationObserver) {
    referenceRelationObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        referenceRelationObserver.unobserve(entry.target);
        const targetWord = entry.target.relationWord;
        if (targetWord) loadWordRelations(targetWord.word, targetWord.pos_key, targetWord.defn_en, entry.target);
      });
    }, { rootMargin: '300px 0px' });
  }
  container.relationWord = word;
  referenceRelationObserver.observe(container);
}

document.addEventListener('click', event => {
  const button = event.target.closest('[data-speak]');
  if (button) speak(decodeURIComponent(button.dataset.speak));
});

function candidates(target, count) {
  const local = batch.words.filter(item => item.pos_key === target.pos_key && item.word !== target.word);
  const family = (batch.family_options?.[target.pos_key] || []).filter(item => item.word !== target.word);
  const fallback = (batch.fallback_options[target.pos_key] || []).filter(item => item.word !== target.word);
  const seen = new Set();
  // Prefer a derived form of a word from this batch before using unrelated
  // same-part-of-speech choices from elsewhere in the course.
  return [...local, ...family, ...fallback].filter(item => {
    const key = item.word.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, count);
}

const full = (sentence, word) => sentence.replaceAll('______', word);

function highlighted(text, word) {
  const source = String(text);
  const lower = source.toLocaleLowerCase();
  const target = String(word).toLocaleLowerCase();
  if (!target) return esc(source);
  let output = '';
  let cursor = 0;
  let index = lower.indexOf(target, cursor);
  while (index !== -1) {
    output += esc(source.slice(cursor, index));
    output += `<strong>${esc(source.slice(index, index + target.length))}</strong>`;
    cursor = index + target.length;
    index = lower.indexOf(target, cursor);
  }
  return output + esc(source.slice(cursor));
}

function updateProgress() {
  if (!batch) return;
  let percent = 0;
  if (mode === 'learn') percent = learned / batch.words.length * 100;
  if (mode === 'quiz') percent = q / batch.words.length * 100;
  if (mode === 'list') percent = 100;
  fill.style.width = `${Math.min(100, percent)}%`;
  if (mode === 'learn') progressCopy.textContent = `${learned} of ${batch.words.length} definition matches completed`;
  if (mode === 'quiz') progressCopy.textContent = currentStudent ? `${q} of ${batch.words.length} quiz questions answered` : 'Enter your name to begin the quiz.';
  if (mode === 'list') progressCopy.textContent = `Complete reference list · ${batch.words.length} words`;
}

function renderLearn() {
  grid.innerHTML = '';
  batch.words.forEach(word => {
    const options = shuffle([word, ...candidates(word, 2)]);
    const card = document.createElement('article');
    card.className = 'word-card';
    card.innerHTML = `<div class="word-card-header"><h3>${esc(word.word)} <span class="pos">${esc(word.pos)}</span></h3>${speaker(word.word, `Listen to ${word.word}`)}</div><p class="root-note"><strong>Root clue:</strong> ${esc(word.root_note || 'Use the word in context.')}</p><div class="sentences">${word.sentences.map(sentence => { const text = full(sentence.en, word.word); return `<div class="sentence">${speaker(text, 'Listen to example sentence')}<span>${esc(text)}</span></div>`; }).join('')}</div><p class="definition-prompt">Which definition matches this word?</p><div class="option-list">${options.map(option => `<button class="option-button" type="button" data-definition="${encodeURIComponent(option.defn_en)}">${esc(option.defn_en)}</button>`).join('')}</div><div class="reveal" hidden><p><strong>English definition:</strong> <span class="linked-definition">${linkedDefinition(word.defn_en)}</span></p><p class="dictionary-help">Click any underlined content word to open Cambridge English–Traditional Chinese Dictionary.</p><div class="word-relations" data-word-relations><p class="relation-status">Loading synonyms and antonyms…</p></div><p class="meaning-zh"><strong>繁體中文：</strong> ${esc(word.defn_zh)}</p>${word.sentences.map(sentence => `<p><strong>翻譯：</strong> ${esc(sentence.zh)}</p>`).join('')}</div>`;
    card.querySelectorAll('[data-definition]').forEach(button => button.addEventListener('click', () => {
      if (card.dataset.answered) return;
      card.dataset.answered = 'true';
      const correct = decodeURIComponent(button.dataset.definition) === word.defn_en;
      card.querySelectorAll('[data-definition]').forEach(option => {
        option.disabled = true;
        if (decodeURIComponent(option.dataset.definition) === word.defn_en) option.classList.add('correct');
      });
      if (!correct) button.classList.add('wrong');
      const reveal = card.querySelector('.reveal');
      reveal.hidden = false;
      loadWordRelations(word.word, word.pos_key, word.defn_en, reveal.querySelector('[data-word-relations]'));
      learned += 1;
      updateProgress();
    }));
    grid.append(card);
  });
}

function renderReference() {
  referenceGrid.innerHTML = '';
  batch.words.forEach(word => {
    const card = document.createElement('article');
    card.className = 'reference-card';
    card.innerHTML = `<div class="word-card-header"><h3>${esc(word.word)} <span class="pos">${esc(word.pos)}</span></h3>${speaker(word.word, `Listen to ${word.word}`)}</div><p class="root-note reference-root-note"><strong>Prefix/root clue:</strong> ${esc(word.root_note || 'Use the word in context.')}</p><div class="reference-definitions"><div class="reference-definition"><strong>English definition</strong><span class="linked-definition">${linkedDefinition(word.defn_en)}</span><span class="dictionary-help">Click any underlined content word to open Cambridge English–Traditional Chinese Dictionary.</span></div><div class="reference-definition"><strong>繁體中文</strong>${esc(word.defn_zh)}</div></div><div class="word-relations reference-relations" data-word-relations><p class="relation-status">Loading synonyms and antonyms…</p></div><div class="reference-sentences">${word.sentences.map(sentence => { const text = full(sentence.en, word.word); return `<div class="reference-sentence"><div>${speaker(text, 'Listen to example sentence')}<span>${highlighted(text, word.word)}</span></div><p><strong>翻譯：</strong> ${esc(sentence.zh)}</p></div>`; }).join('')}</div>`;
    referenceGrid.append(card);
    observeReferenceRelations(card.querySelector('[data-word-relations]'), word);
  });
}

function startQuiz() {
  const name = document.querySelector('#student-name').value.trim();
  const className = document.querySelector('#class-name').value.trim();
  if (!name) return;
  currentStudent = { name, className };
  localStorage.setItem('satVocabStudent', JSON.stringify(currentStudent));
  order = shuffle(batch.words);
  q = 0;
  score = 0;
  results = [];
  document.querySelector('#student-form').hidden = true;
  document.querySelector('#quiz-results').hidden = true;
  document.querySelector('#quiz-stage').hidden = false;
  renderQuestion();
  updateProgress();
}

function renderQuestion() {
  const target = order[q];
  const options = shuffle([target, ...candidates(target, 3)]);
  const card = document.querySelector('#question-card');
  document.querySelector('#quiz-progress').textContent = `Question ${q + 1} of ${batch.words.length}`;
  document.querySelector('#live-score').textContent = `Score ${score}/${q}`;
  card.dataset.answered = 'false';
  card.innerHTML = `<h3>Which word completes both sentences?</h3><div class="blank-sentences">${target.sentences.map(sentence => `<div class="blank-sentence">${speaker(sentence.en, 'Listen to sentence')}<span>${esc(sentence.en)}</span></div>`).join('')}</div><div class="quiz-options">${options.map(option => `<button class="quiz-option" type="button" data-word="${encodeURIComponent(option.word)}">${esc(option.word)}</button>`).join('')}</div><div class="option-explanations" hidden>${options.map(option => `<div class="option-explanation"><strong>${esc(option.word)} ${speaker(option.word, `Listen to ${option.word}`)}</strong><span>${esc(option.defn_en)} · ${esc(option.defn_zh)}</span></div>`).join('')}</div><div class="next-row" hidden><button class="primary-button" id="next-question">${q + 1 === batch.words.length ? 'See results' : 'Next question'}</button></div>`;
  card.querySelectorAll('[data-word]').forEach(button => button.addEventListener('click', () => answer(button, target)));
}

function answer(button, target) {
  const card = document.querySelector('#question-card');
  if (card.dataset.answered === 'true') return;
  card.dataset.answered = 'true';
  const chosen = decodeURIComponent(button.dataset.word);
  const correct = chosen === target.word;
  if (correct) score += 1;
  results.push({ word: target.word, chosen, correct });
  card.querySelectorAll('[data-word]').forEach(option => {
    option.disabled = true;
    if (decodeURIComponent(option.dataset.word) === target.word) option.classList.add('correct');
  });
  if (!correct) button.classList.add('wrong');
  card.querySelector('.option-explanations').hidden = false;
  card.querySelector('.next-row').hidden = false;
  q += 1;
  updateProgress();
  document.querySelector('#live-score').textContent = `Score ${score}/${q}`;
  document.querySelector('#next-question').addEventListener('click', () => q >= batch.words.length ? finishQuiz() : renderQuestion());
}

function savePending(payload) {
  const pending = JSON.parse(localStorage.getItem('satVocabPendingResults') || '[]');
  if (!pending.some(item => item.clientResultId === payload.clientResultId)) pending.push(payload);
  localStorage.setItem('satVocabPendingResults', JSON.stringify(pending));
}

async function sendPayload(payload) {
  const endpoint = window.SAT_RESULTS_ENDPOINT || '';
  if (!endpoint) return false;
  const body = JSON.stringify(payload);
  try {
    await fetch(endpoint, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body });
    return true;
  } catch {
    // Some browsers reject the opaque redirect returned by Google Apps Script
    // even though the result receiver itself is available. sendBeacon queues
    // the same JSON without waiting for that cross-origin response.
    return typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(endpoint, body);
  }
}

async function retryPendingResults() {
  if (!window.SAT_RESULTS_ENDPOINT) return;
  const pending = JSON.parse(localStorage.getItem('satVocabPendingResults') || '[]');
  const remaining = [];
  for (const payload of pending) {
    if (!(await sendPayload(payload))) remaining.push(payload);
  }
  localStorage.setItem('satVocabPendingResults', JSON.stringify(remaining));
}

async function logResult() {
  const mistakes = results.filter(item => !item.correct).map(item => item.word);
  const payload = {
    clientResultId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timeDate: new Date().toISOString(),
    studentName: currentStudent.name,
    className: currentStudent.className,
    quizBatchNumber: batch.name,
    resultPercentage: Math.round(score / batch.words.length * 100),
    mistakeWords: mistakes.join(', '),
    batchId: batch.id,
    results
  };
  const sent = await sendPayload(payload);
  if (!sent) savePending(payload);
  return sent;
}

async function finishQuiz() {
  document.querySelector('#quiz-stage').hidden = true;
  const percentage = Math.round(score / batch.words.length * 100);
  const completed = new Set(JSON.parse(localStorage.getItem('satVocabCompleted') || '[]'));
  completed.add(batch.id);
  localStorage.setItem('satVocabCompleted', JSON.stringify([...completed]));
  const sent = await logResult();
  const panel = document.querySelector('#quiz-results');
  panel.hidden = false;
  panel.innerHTML = `<p class="eyebrow">BATCH COMPLETE</p><h2>${percentage >= 80 ? 'Excellent work.' : 'Keep practicing.'}</h2><p><strong>Student:</strong> ${esc(currentStudent.name)}${currentStudent.className ? ` · ${esc(currentStudent.className)}` : ''}</p><div class="score-ring" style="--score:${percentage * 3.6}deg"><strong>${percentage}%</strong></div><p>You answered ${score} of ${batch.words.length} correctly.</p><p class="${sent ? 'submission-success' : 'submission-warning'}">${sent ? '✓ Your result was sent to your teacher’s spreadsheet.' : 'Your result is saved on this device and is waiting for the spreadsheet connection.'}</p><a class="primary-button" href="index.html">Choose another batch</a>`;
  updateProgress();
}

function prepareStudentForm() {
  const saved = JSON.parse(localStorage.getItem('satVocabStudent') || 'null');
  if (saved) {
    document.querySelector('#student-name').value = saved.name || '';
    document.querySelector('#class-name').value = saved.className || '';
  }
  document.querySelector('#student-form').addEventListener('submit', event => {
    event.preventDefault();
    if (event.currentTarget.reportValidity()) startQuiz();
  });
}

function applyMode() {
  const sections = { learn: 'learn-section', quiz: 'quiz-section', list: 'list-section' };
  Object.entries(sections).forEach(([key, id]) => {
    document.querySelector(`#${id}`).hidden = key !== mode;
    const link = document.querySelector(`#${key}-link`);
    link.href = `batch.html?batch=${encodeURIComponent(batch.id)}&mode=${key}`;
    link.classList.toggle('active', key === mode);
    if (key === mode) link.setAttribute('aria-current', 'page');
  });
}

if (!batchId) {
  document.querySelector('main').innerHTML = document.querySelector('#loading-error').innerHTML;
} else {
  Promise.all([
    fetch(`data/batches/${encodeURIComponent(batchId)}.json`).then(response => { if (!response.ok) throw Error(); return response.json(); }),
    fetch('data/batches-index.json').then(response => response.json())
  ]).then(([data, index]) => {
    batch = data;
    const position = index.batches.findIndex(item => item.id === batch.id) + 1;
    const modeNames = { learn: 'Part 1 · Learn', quiz: 'Part 2 · Quiz', list: 'Part 3 · Complete list' };
    document.title = `${modeNames[mode]} · ${batch.name} · SAT Vocabulary Studio`;
    document.querySelector('#batch-counter').textContent = `Batch ${position} of ${index.summary.total_batches}`;
    document.querySelector('#batch-part').textContent = batch.part_label;
    document.querySelector('#batch-title').textContent = batch.name;
    document.querySelector('#batch-subtitle').textContent = `${batch.subtitle} · ${batch.count} words`;
    applyMode();
    if (mode === 'learn') renderLearn();
    if (mode === 'quiz') prepareStudentForm();
    if (mode === 'list') renderReference();
    updateProgress();
    retryPendingResults();
  }).catch(() => {
    document.querySelector('main').innerHTML = document.querySelector('#loading-error').innerHTML;
  });
}
