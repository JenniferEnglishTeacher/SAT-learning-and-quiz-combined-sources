const params = new URLSearchParams(location.search);
const batchId = params.get('batch');
const requestedMode = params.get('mode');
let mode = ['learn', 'quiz', 'list'].includes(requestedMode) ? requestedMode : 'learn';
const grid = document.querySelector('#learn-grid');
const referenceGrid = document.querySelector('#reference-grid');
const fill = document.querySelector('#progress-fill');
const progressCopy = document.querySelector('#progress-copy');

let batch;
let learned = 0;
const rendered = { learn: false, list: false, quiz: false };

// Quiz state. quizKind is 'batch' (every word in this unit) or 'review'
// (only the words the student marked, with all four choices drawn from them).
let quizKind = 'batch';
let quizWords = [];
let quizActive = false;
let order = [];
let q = 0;
let score = 0;
let results = [];
let currentStudent = null;
let lastQuiz = null;
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

const readStore = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
};
const writeStore = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
};

/* ---------------- Speech ---------------- */

function speak(text) {
  if (!('speechSynthesis' in window) || !text) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(String(text).replaceAll('______', 'blank'));
  utterance.lang = 'en-US';
  const voice = speechSynthesis.getVoices().find(item => item.lang.startsWith('en'));
  if (voice) utterance.voice = voice;
  speechSynthesis.speak(utterance);
}

const say = text => `data-say="${encodeURIComponent(text)}"`;

const speaker = (text, label = 'Listen') =>
  `<button class="speak-button" type="button" data-speak="${encodeURIComponent(text)}" aria-label="${esc(label)}">🔊</button>`;

let hoverSpeech = readStore('satVocabHoverSpeech', true) !== false;
let hoverTimer = null;
let hoverTarget = null;

// Hover-to-listen: words, synonyms/antonyms, and example sentences carry a
// data-say attribute. Mouse only, so tapping on phones still behaves normally.
document.addEventListener('pointerover', event => {
  if (event.pointerType && event.pointerType !== 'mouse') return;
  const target = event.target.closest('[data-say]');
  if (!target || target === hoverTarget) return;
  hoverTarget = target;
  clearTimeout(hoverTimer);
  if (!hoverSpeech) return;
  hoverTimer = setTimeout(() => speak(decodeURIComponent(target.dataset.say)), 220);
});

document.addEventListener('pointerout', event => {
  if (!hoverTarget) return;
  const next = event.relatedTarget;
  if (next && hoverTarget.contains(next)) return;
  clearTimeout(hoverTimer);
  hoverTarget = null;
});

/* ---------------- Dictionary links & relations ---------------- */

function cambridgeUrl(term) {
  const slug = String(term).trim().toLocaleLowerCase().replace(/[^a-z0-9' -]/g, '').replace(/\s+/g, '-');
  return `https://dictionary.cambridge.org/dictionary/english-chinese-traditional/${encodeURIComponent(slug)}`;
}

function dictionaryLink(term, label = term, speakOnHover = false) {
  return `<a class="dictionary-link" href="${cambridgeUrl(term)}" target="_blank" rel="noopener noreferrer" ${speakOnHover ? say(term) : ''} title="Look up ${esc(term)} in Cambridge English–Traditional Chinese Dictionary">${esc(label)}</a>`;
}

function linkedDefinition(definition, allWords = false) {
  const source = String(definition || '');
  const pattern = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;
  let output = '';
  let cursor = 0;
  let match = pattern.exec(source);
  while (match) {
    output += esc(source.slice(cursor, match.index));
    const token = match[0];
    const normalized = token.toLocaleLowerCase();
    output += allWords || (token.length > 2 && !definitionStopWords.has(normalized)) ? dictionaryLink(token) : esc(token);
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

function wordRelations(word, posKey, definition, curatedSynonyms = [], curatedAntonyms = []) {
  const headword = String(word).toLocaleLowerCase();
  const curatedSynonymList = Array.isArray(curatedSynonyms) ? curatedSynonyms.filter(Boolean) : [];
  const curatedAntonymList = Array.isArray(curatedAntonyms) ? curatedAntonyms.filter(Boolean) : [];
  const key = `${headword}|${posKey}|${definition}|${curatedSynonymList.join(',')}|${curatedAntonymList.join(',')}`;
  if (!relationCache.has(key)) {
    relationCache.set(key, Promise.allSettled([
      datamuseWords('rel_syn', headword, 6, posKey, relationTopics(definition)),
      datamuseWords('rel_ant', headword, 4, posKey)
    ]).then(([synonyms, antonyms]) => {
      const dynamicSynonyms = synonyms.status === 'fulfilled' ? synonyms.value : [];
      const dynamicAntonyms = antonyms.status === 'fulfilled' ? antonyms.value : [];
      const unique = values => [...new Map(values.map(item => [String(item).toLocaleLowerCase(), String(item)])).values()];
      return {
        synonyms: unique([...curatedSynonymList, ...dynamicSynonyms]).filter(item => item.toLocaleLowerCase() !== headword).slice(0, 6),
        antonyms: unique([...curatedAntonymList, ...dynamicAntonyms]).slice(0, 4),
        available: curatedSynonymList.length > 0 || curatedAntonymList.length > 0 || synonyms.status === 'fulfilled' || antonyms.status === 'fulfilled'
      };
    }));
  }
  return relationCache.get(key);
}

function relationRow(label, words) {
  return `<p class="relation-row"><strong>${label}:</strong> ${words.map(item => dictionaryLink(item, item, true)).join(', ')}</p>`;
}

async function loadWordRelations(word, posKey, definition, container, curatedSynonyms = [], curatedAntonyms = []) {
  if (!container || container.dataset.loaded === 'true') return;
  container.dataset.loaded = 'true';
  try {
    const relations = await wordRelations(word, posKey, definition, curatedSynonyms, curatedAntonyms);
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
    loadWordRelations(word.word, word.pos_key, word.defn_en, container, word.synonyms, word.antonyms);
    return;
  }
  if (!referenceRelationObserver) {
    referenceRelationObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        referenceRelationObserver.unobserve(entry.target);
        const targetWord = entry.target.relationWord;
        if (targetWord) loadWordRelations(targetWord.word, targetWord.pos_key, targetWord.defn_en, entry.target, targetWord.synonyms, targetWord.antonyms);
      });
    }, { rootMargin: '300px 0px' });
  }
  container.relationWord = word;
  referenceRelationObserver.observe(container);
}

/* ---------------- Review list (words the student marks) ---------------- */

const reviewKey = () => `satVocabReview:${batch.id}`;
let reviewWords = new Set();

function loadReview() {
  const valid = new Set(batch.words.map(item => item.word));
  reviewWords = new Set(readStore(reviewKey(), []).filter(word => valid.has(word)));
}

function saveReview() {
  writeStore(reviewKey(), [...reviewWords]);
  refreshReviewUi();
}

function toggleReview(word, force) {
  const on = force ?? !reviewWords.has(word);
  if (on) reviewWords.add(word); else reviewWords.delete(word);
  saveReview();
}

const isBatchWord = word => batch.words.some(item => item.word === word);

function reviewToggle(word) {
  const on = reviewWords.has(word);
  return `<button class="review-toggle${on ? ' on' : ''}" type="button" data-review="${encodeURIComponent(word)}" aria-pressed="${on}" title="Add this word to the words I want to review">${on ? '★ Review' : '☆ Review'}</button>`;
}

function wordTitle(word) {
  return `<div class="word-title">${speaker(word.word, `Listen to ${word.word}`)}<h3 class="review-word${reviewWords.has(word.word) ? ' marked' : ''}" ${say(word.word)} data-review="${encodeURIComponent(word.word)}" title="Click to mark for review">${esc(word.word)} <span class="pos">${esc(word.pos)}</span></h3></div>`;
}

function refreshReviewUi() {
  document.querySelectorAll('[data-review]').forEach(node => {
    const on = reviewWords.has(decodeURIComponent(node.dataset.review));
    if (node.classList.contains('review-toggle')) {
      node.classList.toggle('on', on);
      node.setAttribute('aria-pressed', String(on));
      node.textContent = on ? '★ Review' : '☆ Review';
    } else {
      node.classList.toggle('marked', on);
    }
  });
  const count = reviewWords.size;
  const reviewButton = document.querySelector('#bar-review');
  if (reviewButton) {
    reviewButton.disabled = count < 4;
    reviewButton.innerHTML = `★ Test the words I want to review <span class="bar-count">${count}</span>`;
    reviewButton.title = count < 4 ? 'Mark at least 4 words (click a word or its ☆ Review button).' : `Start a quiz with your ${count} marked words`;
  }
  const hint = document.querySelector('#bar-hint');
  if (hint) hint.textContent = count === 0 ? 'Click any word to mark it for review.' : count < 4 ? `Mark ${4 - count} more word${4 - count === 1 ? '' : 's'} to start a review quiz.` : '';
  const clear = document.querySelector('#bar-clear');
  if (clear) clear.hidden = count === 0;
}

/* ---------------- Global click handling ---------------- */

document.addEventListener('click', event => {
  const button = event.target.closest('[data-speak]');
  if (button) { speak(decodeURIComponent(button.dataset.speak)); return; }
  const review = event.target.closest('[data-review]');
  if (review) { toggleReview(decodeURIComponent(review.dataset.review)); return; }
  const quizButton = event.target.closest('[data-start-quiz]');
  if (quizButton) { event.preventDefault(); openQuiz(quizButton.dataset.startQuiz); }
});

/* ---------------- Learn & reference rendering ---------------- */

function candidates(target, count) {
  const local = batch.words.filter(item => item.pos_key === target.pos_key && item.word !== target.word);
  const family = (batch.family_options?.[target.pos_key] || []).filter(item => item.word !== target.word);
  const fallback = (batch.fallback_options?.[target.pos_key] || []).filter(item => item.word !== target.word);
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

// Review quizzes: all four choices come from the marked words, preferring
// the same part of speech when the student marked enough of them.
function reviewCandidates(target, count) {
  const pool = shuffle(quizWords.filter(item => item.word !== target.word));
  const samePos = pool.filter(item => item.pos_key === target.pos_key);
  const otherPos = pool.filter(item => item.pos_key !== target.pos_key);
  return [...samePos, ...otherPos].slice(0, count);
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
  const total = quizWords.length || batch.words.length;
  if (mode === 'learn') percent = learned / batch.words.length * 100;
  if (mode === 'quiz') percent = quizActive ? q / total * 100 : 0;
  if (mode === 'list') percent = 100;
  fill.style.width = `${Math.min(100, percent)}%`;
  if (mode === 'learn') progressCopy.textContent = `${learned} of ${batch.words.length} definition matches completed`;
  if (mode === 'quiz') progressCopy.textContent = quizActive ? `${q} of ${total} quiz questions answered` : 'Enter your name to begin the quiz.';
  if (mode === 'list') progressCopy.textContent = `Complete reference list · ${batch.words.length} words`;
}

function sectionHeading(section) {
  const heading = document.createElement('div');
  heading.className = 'batch-word-section';
  const sectionCount = batch.words.filter(item => item.section === section).length;
  heading.innerHTML = `<p class="eyebrow">IM PREFIX GROUP</p><h3>${esc(section)}</h3><p>${sectionCount} SAT core words</p>`;
  return heading;
}

function quizCallout() {
  const box = document.createElement('div');
  box.className = 'quiz-callout';
  box.innerHTML = `<div><strong>Ready to check yourself?</strong><p>Take the quiz for all ${batch.words.length} words, or test only the words you marked ★.</p></div><div class="quiz-callout-actions"><button class="primary-button" type="button" data-start-quiz="batch">📝 Take the quiz</button><button class="secondary-button" type="button" data-start-quiz="review" data-needs-review>★ Test my review words</button></div>`;
  return box;
}

function renderLearn() {
  grid.innerHTML = '';
  let currentSection = '';
  batch.words.forEach(word => {
    if (word.section && word.section !== currentSection) {
      currentSection = word.section;
      grid.append(sectionHeading(currentSection));
    }
    const options = shuffle([word, ...candidates(word, 2)]);
    const card = document.createElement('article');
    card.className = 'word-card';
    card.innerHTML = `<div class="word-card-header">${wordTitle(word)}${reviewToggle(word.word)}</div><p class="root-note"><strong>Root clue:</strong> ${esc(word.root_note || 'Use the word in context.')}</p><div class="sentences">${word.sentences.map(sentence => { const text = full(sentence.en, word.word); return `<div class="sentence">${speaker(text, 'Listen to example sentence')}<span ${say(text)}>${esc(text)}</span></div>`; }).join('')}</div><p class="definition-prompt">Which definition matches this word?</p><p class="definition-link-help">Click a definition card to answer, or click any underlined word to look it up.</p><div class="option-list">${options.map(option => `<div class="option-button definition-option" role="button" tabindex="0" data-definition="${encodeURIComponent(option.defn_en)}"><span class="definition-option-text">${linkedDefinition(option.defn_en, true)}</span><span class="definition-option-action" aria-hidden="true">Choose</span></div>`).join('')}</div><div class="reveal" hidden><p><strong>English definition:</strong> <span class="linked-definition">${linkedDefinition(word.defn_en)}</span></p><p class="dictionary-help">Click any underlined content word to open Cambridge English–Traditional Chinese Dictionary.</p><div class="word-relations" data-word-relations><p class="relation-status">Loading synonyms and antonyms…</p></div><p class="meaning-zh"><strong>繁體中文：</strong> ${esc(word.defn_zh)}</p>${word.sentences.map(sentence => `<p><strong>翻譯：</strong> ${esc(sentence.zh)}</p>`).join('')}</div>`;
    const answerDefinition = button => {
      if (card.dataset.answered) return;
      card.dataset.answered = 'true';
      const correct = decodeURIComponent(button.dataset.definition) === word.defn_en;
      card.querySelectorAll('[data-definition]').forEach(option => {
        option.classList.add('locked');
        option.tabIndex = -1;
        if (decodeURIComponent(option.dataset.definition) === word.defn_en) option.classList.add('correct');
      });
      if (!correct) button.classList.add('wrong');
      const reveal = card.querySelector('.reveal');
      reveal.hidden = false;
      loadWordRelations(word.word, word.pos_key, word.defn_en, reveal.querySelector('[data-word-relations]'), word.synonyms, word.antonyms);
      learned += 1;
      updateProgress();
    };
    card.querySelectorAll('[data-definition]').forEach(button => {
      button.addEventListener('click', event => {
        if (event.target.closest('.dictionary-link')) return;
        answerDefinition(button);
      });
      button.addEventListener('keydown', event => {
        if (event.target !== button || !['Enter', ' '].includes(event.key)) return;
        event.preventDefault();
        answerDefinition(button);
      });
    });
    grid.append(card);
  });
  grid.append(quizCallout());
  rendered.learn = true;
}

function renderReference() {
  referenceGrid.innerHTML = '';
  let currentSection = '';
  batch.words.forEach(word => {
    if (word.section && word.section !== currentSection) {
      currentSection = word.section;
      referenceGrid.append(sectionHeading(currentSection));
    }
    const card = document.createElement('article');
    card.className = 'reference-card';
    card.innerHTML = `<div class="word-card-header">${wordTitle(word)}${reviewToggle(word.word)}</div><p class="root-note reference-root-note"><strong>Prefix/root clue:</strong> ${esc(word.root_note || 'Use the word in context.')}</p><div class="reference-definitions"><div class="reference-definition"><strong>English definition</strong><span class="linked-definition">${linkedDefinition(word.defn_en)}</span><span class="dictionary-help">Click any underlined content word to open Cambridge English–Traditional Chinese Dictionary.</span></div><div class="reference-definition"><strong>繁體中文</strong>${esc(word.defn_zh)}</div></div><div class="word-relations reference-relations" data-word-relations><p class="relation-status">Loading synonyms and antonyms…</p></div><div class="reference-sentences">${word.sentences.map(sentence => { const text = full(sentence.en, word.word); return `<div class="reference-sentence"><div>${speaker(text, 'Listen to example sentence')}<span ${say(text)}>${highlighted(text, word.word)}</span></div><p><strong>翻譯：</strong> ${esc(sentence.zh)}</p></div>`; }).join('')}</div>`;
    referenceGrid.append(card);
    observeReferenceRelations(card.querySelector('[data-word-relations]'), word);
  });
  referenceGrid.append(quizCallout());
  rendered.list = true;
}

/* ---------------- Quiz ---------------- */

function quizLabel() {
  return quizKind === 'review' ? `${batch.name} · Review set (${quizWords.length} words)` : batch.name;
}

function prepareQuizForm() {
  const note = document.querySelector('#quiz-start-note');
  const title = document.querySelector('#quiz-heading');
  const intro = document.querySelector('#quiz-intro');
  if (quizKind === 'review') {
    title.textContent = 'Test the words I want to review';
    intro.textContent = `A new multiple-choice set made only from the ${quizWords.length} words you marked. All four choices in every question come from your review words.`;
    note.innerHTML = `<strong>${quizWords.length} review words:</strong> ${quizWords.map(item => esc(item.word)).join(', ')}`;
  } else {
    title.textContent = 'Test your memory';
    intro.textContent = 'Enter your name, then complete one question for every word. Each answer choice has the same part of speech.';
    note.textContent = `${batch.words.length} questions, randomized each time. You can end the quiz early.`;
  }
  document.querySelector('#start-quiz').textContent = quizKind === 'review' ? 'Start the review quiz' : 'Start the quiz';
  document.querySelector('#student-form').hidden = false;
  document.querySelector('#quiz-stage').hidden = true;
  document.querySelector('#quiz-results').hidden = true;
}

function openQuiz(kind) {
  if (kind === 'review' && reviewWords.size < 4) {
    alert('Mark at least 4 words first: click a word or its ☆ Review button.');
    return;
  }
  if (quizActive) {
    if (kind === quizKind && mode === 'quiz') return;
    if (kind === quizKind) { setMode('quiz'); return; }
    if (!confirm('Leave the quiz in progress and start a new one?')) { setMode('quiz'); return; }
    quizActive = false;
  }
  quizKind = kind === 'review' ? 'review' : 'batch';
  quizWords = quizKind === 'review' ? batch.words.filter(item => reviewWords.has(item.word)) : [...batch.words];
  prepareQuizForm();
  setMode('quiz');
}

function startQuiz() {
  const name = document.querySelector('#student-name').value.trim();
  const className = document.querySelector('#class-name').value.trim();
  if (!name) return;
  currentStudent = { name, className };
  writeStore('satVocabStudent', currentStudent);
  if (!quizWords.length) quizWords = [...batch.words];
  order = shuffle(quizWords);
  q = 0;
  score = 0;
  results = [];
  quizActive = true;
  document.querySelector('#student-form').hidden = true;
  document.querySelector('#quiz-results').hidden = true;
  document.querySelector('#quiz-stage').hidden = false;
  document.querySelector('#quiz-kind').textContent = quizKind === 'review' ? '★ Review set' : '';
  renderQuestion();
  updateProgress();
  refreshBar();
}

function renderQuestion() {
  const target = order[q];
  const others = quizKind === 'review' ? reviewCandidates(target, 3) : candidates(target, 3);
  const options = shuffle([target, ...others]);
  const card = document.querySelector('#question-card');
  document.querySelector('#quiz-progress').textContent = `Question ${q + 1} of ${order.length}`;
  document.querySelector('#live-score').textContent = `Score ${score}/${q}`;
  card.dataset.answered = 'false';
  card.innerHTML = `<h3>Which word completes both sentences?</h3><div class="blank-sentences">${target.sentences.map(sentence => `<div class="blank-sentence">${speaker(sentence.en, 'Listen to sentence')}<span ${say(sentence.en)}>${esc(sentence.en)}</span></div>`).join('')}</div><div class="quiz-options">${options.map(option => `<button class="quiz-option" type="button" ${say(option.word)} data-word="${encodeURIComponent(option.word)}">${esc(option.word)}</button>`).join('')}</div><div class="option-explanations" hidden>${options.map(option => `<div class="option-explanation"><strong>${speaker(option.word, `Listen to ${option.word}`)}<span ${say(option.word)}>${esc(option.word)}</span>${isBatchWord(option.word) ? reviewToggle(option.word) : ''}</strong><span>${esc(option.defn_en)} · ${esc(option.defn_zh)}</span></div>`).join('')}</div><div class="next-row" hidden><button class="primary-button" id="next-question">${q + 1 === order.length ? 'See results' : 'Next question'}</button></div>`;
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
  document.querySelector('#next-question').addEventListener('click', () => q >= order.length ? finishQuiz() : renderQuestion());
}

function savePending(payload) {
  const pending = readStore('satVocabPendingResults', []);
  if (!pending.some(item => item.clientResultId === payload.clientResultId)) pending.push(payload);
  writeStore('satVocabPendingResults', pending);
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
  const pending = readStore('satVocabPendingResults', []);
  const remaining = [];
  for (const payload of pending) {
    if (!(await sendPayload(payload))) remaining.push(payload);
  }
  writeStore('satVocabPendingResults', remaining);
}

async function logResult(summary) {
  const label = summary.endedEarly
    ? `${quizLabel()} · ended early (${summary.answered}/${summary.total} answered)`
    : quizLabel();
  const payload = {
    clientResultId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timeDate: new Date().toISOString(),
    studentName: currentStudent.name,
    className: currentStudent.className,
    quizBatchNumber: label,
    resultPercentage: summary.percentage,
    mistakeWords: summary.mistakes.map(item => item.word).join(', '),
    batchId: batch.id,
    quizType: quizKind,
    score: summary.score,
    answered: summary.answered,
    totalQuestions: summary.total,
    results
  };
  const sent = await sendPayload(payload);
  if (!sent) savePending(payload);
  return sent;
}

function endQuizEarly() {
  if (!quizActive) return;
  const message = q === 0
    ? 'You have not answered any questions yet. End the quiz anyway?'
    : `End the quiz now? Your result for the ${q} question${q === 1 ? '' : 's'} you answered will be sent to your teacher.`;
  if (!confirm(message)) return;
  finishQuiz(true);
}

async function finishQuiz(early = false) {
  quizActive = false;
  document.querySelector('#quiz-stage').hidden = true;
  const answered = results.length;
  const total = order.length;
  const percentage = answered ? Math.round(score / answered * 100) : 0;
  const byWord = new Map(quizWords.map(item => [item.word, item]));
  const mistakes = results.filter(item => !item.correct).map(item => ({ ...byWord.get(item.word), chosen: item.chosen, status: 'Wrong' }));
  const answeredWords = new Set(results.map(item => item.word));
  const notAnswered = order.filter(item => !answeredWords.has(item.word)).map(item => ({ ...item, chosen: '', status: 'Not answered' }));
  const endedEarly = early && answered < total;
  const summary = { score, answered, total, percentage, mistakes, notAnswered, endedEarly };
  lastQuiz = { ...summary, kind: quizKind, student: currentStudent, label: quizLabel() };

  if (quizKind === 'batch' && !endedEarly) {
    const completed = new Set(readStore('satVocabCompleted', []));
    completed.add(batch.id);
    writeStore('satVocabCompleted', [...completed]);
  }

  const panel = document.querySelector('#quiz-results');
  panel.hidden = false;
  panel.innerHTML = '<p>Saving your result…</p>';
  const sent = answered ? await logResult(summary) : null;
  const sentLine = sent === null
    ? '<p class="submission-warning">No questions were answered, so nothing was sent.</p>'
    : `<p class="${sent ? 'submission-success' : 'submission-warning'}">${sent ? '✓ Your result was sent to your teacher’s spreadsheet.' : 'Your result is saved on this device and is waiting for the spreadsheet connection.'}</p>`;
  const practiceCount = mistakes.length + notAnswered.length;
  const mistakeList = mistakes.length
    ? `<div class="mistake-list"><h3>Words to practise</h3>${mistakes.map(item => `<div class="mistake-row">${speaker(item.word, `Listen to ${item.word}`)}<strong ${say(item.word)}>${esc(item.word)}</strong><span>${esc(item.pos || '')} · ${esc(item.defn_zh || '')}</span><em>You chose: ${esc(item.chosen)}</em></div>`).join('')}</div>`
    : '';
  panel.innerHTML = `<p class="eyebrow">${quizKind === 'review' ? 'REVIEW SET COMPLETE' : endedEarly ? 'QUIZ ENDED' : 'BATCH COMPLETE'}</p><h2>${percentage >= 80 ? 'Excellent work.' : 'Keep practicing.'}</h2><p><strong>Student:</strong> ${esc(currentStudent.name)}${currentStudent.className ? ` · ${esc(currentStudent.className)}` : ''}</p><div class="score-ring" style="--score:${percentage * 3.6}deg"><strong>${percentage}%</strong></div><p>You answered ${score} of ${answered} correctly${endedEarly ? ` (${answered} of ${total} questions attempted)` : ''}.</p>${sentLine}${mistakeList}<div class="result-actions"><button class="primary-button" type="button" id="download-mistakes"${practiceCount ? '' : ' disabled'}>⬇ Download mistakes (Excel)</button>${mistakes.length ? '<button class="secondary-button" type="button" id="mark-mistakes">★ Add mistakes to my review words</button>' : ''}<button class="secondary-button" type="button" data-start-quiz="${quizKind}">↻ Try again</button><a class="secondary-button" href="index.html">Choose another batch</a></div>${practiceCount ? '' : '<p class="muted">No mistakes — nothing to download.</p>'}`;
  panel.querySelector('#download-mistakes')?.addEventListener('click', downloadMistakes);
  panel.querySelector('#mark-mistakes')?.addEventListener('click', event => {
    mistakes.forEach(item => reviewWords.add(item.word));
    saveReview();
    event.currentTarget.textContent = '✓ Added to your review words';
    event.currentTarget.disabled = true;
  });
  updateProgress();
  refreshBar();
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
}

function mistakeRows() {
  const rows = [...lastQuiz.mistakes, ...lastQuiz.notAnswered];
  return rows.map((item, index) => ({
    'No.': index + 1,
    Status: item.status,
    Word: item.word,
    POS: item.pos || '',
    'Your answer': item.chosen || '',
    'English definition': item.defn_en || '',
    '繁體中文': item.defn_zh || '',
    'Root clue': item.root_note || '',
    'Example sentence 1': item.sentences?.[0] ? full(item.sentences[0].en, item.word) : '',
    '翻譯 1': item.sentences?.[0]?.zh || '',
    'Example sentence 2': item.sentences?.[1] ? full(item.sentences[1].en, item.word) : '',
    '翻譯 2': item.sentences?.[1]?.zh || ''
  }));
}

function downloadFileName(extension) {
  const safe = value => String(value || '').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_').slice(0, 40);
  const date = new Date().toISOString().slice(0, 10);
  return `${safe(batch.id)}${lastQuiz.kind === 'review' ? '_review' : ''}_mistakes_${safe(lastQuiz.student?.name)}_${date}.${extension}`;
}

async function downloadMistakes() {
  if (!lastQuiz) return;
  const rows = mistakeRows();
  if (!rows.length) return;
  try {
    if (!window.XLSX) await loadScript('assets/vendor/xlsx.mini.min.js');
    const sheet = XLSX.utils.json_to_sheet(rows);
    sheet['!cols'] = [6, 13, 18, 8, 18, 40, 22, 30, 55, 35, 55, 35].map(wch => ({ wch }));
    const info = XLSX.utils.aoa_to_sheet([
      ['Student', lastQuiz.student?.name || ''],
      ['Class', lastQuiz.student?.className || ''],
      ['Quiz', lastQuiz.label],
      ['Date', new Date().toLocaleString()],
      ['Score', `${lastQuiz.score} / ${lastQuiz.answered} (${lastQuiz.percentage}%)`],
      ['Questions attempted', `${lastQuiz.answered} of ${lastQuiz.total}`]
    ]);
    info['!cols'] = [{ wch: 20 }, { wch: 60 }];
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Mistakes');
    XLSX.utils.book_append_sheet(book, info, 'Quiz info');
    XLSX.writeFile(book, downloadFileName('xlsx'));
  } catch {
    // Fallback: a UTF-8 CSV that Excel and Google Sheets both open.
    const headers = Object.keys(rows[0]);
    const cell = value => `"${String(value).replaceAll('"', '""')}"`;
    const csv = [headers.map(cell).join(','), ...rows.map(row => headers.map(key => cell(row[key])).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const link = Object.assign(document.createElement('a'), { href: url, download: downloadFileName('csv') });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function prepareStudentForm() {
  if (rendered.quiz) return;
  const saved = readStore('satVocabStudent', null);
  if (saved) {
    document.querySelector('#student-name').value = saved.name || '';
    document.querySelector('#class-name').value = saved.className || '';
  }
  document.querySelector('#student-form').addEventListener('submit', event => {
    event.preventDefault();
    if (event.currentTarget.reportValidity()) startQuiz();
  });
  document.querySelector('#end-quiz').addEventListener('click', endQuizEarly);
  rendered.quiz = true;
}

/* ---------------- Mode switching & study bar ---------------- */

function setMode(next, push = true) {
  mode = next;
  const sections = { learn: 'learn-section', quiz: 'quiz-section', list: 'list-section' };
  Object.entries(sections).forEach(([key, id]) => {
    document.querySelector(`#${id}`).hidden = key !== mode;
    const link = document.querySelector(`#${key}-link`);
    link.href = `batch.html?batch=${encodeURIComponent(batch.id)}&mode=${key}`;
    link.classList.toggle('active', key === mode);
    if (key === mode) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  if (mode === 'learn' && !rendered.learn) renderLearn();
  if (mode === 'list' && !rendered.list) renderReference();
  if (mode === 'quiz') {
    prepareStudentForm();
    if (!quizActive && !quizWords.length) { quizKind = 'batch'; quizWords = [...batch.words]; prepareQuizForm(); }
  }
  const modeNames = { learn: 'Part 1 · Learn', quiz: 'Part 2 · Quiz', list: 'Part 3 · Complete list' };
  document.title = `${modeNames[mode]} · ${batch.name} · SAT Vocabulary Studio`;
  if (push) {
    const url = `batch.html?batch=${encodeURIComponent(batch.id)}&mode=${mode}`;
    history.pushState({ mode }, '', url);
    document.querySelector('.batch-mode-nav').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  refreshReviewUi();
  refreshBar();
  updateProgress();
}

function buildStudyBar() {
  const bar = document.createElement('div');
  bar.className = 'study-bar';
  bar.setAttribute('role', 'region');
  bar.setAttribute('aria-label', 'Quiz and review tools');
  bar.innerHTML = `<button class="primary-button" type="button" id="bar-quiz" data-start-quiz="batch">📝 Quiz</button><button class="secondary-button" type="button" id="bar-review" data-start-quiz="review"></button><button class="link-button" type="button" id="bar-clear" hidden>Clear marks</button><span class="bar-hint" id="bar-hint"></span><button class="hover-toggle" type="button" id="bar-hover" aria-pressed="${hoverSpeech}" title="Speak words, synonyms, antonyms and sentences when the mouse moves over them. If you hear nothing, click anywhere on the page once."></button>`;
  document.body.append(bar);
  document.body.classList.add('has-study-bar');
  bar.querySelector('#bar-clear').addEventListener('click', () => {
    if (!confirm(`Remove all ${reviewWords.size} review marks for this batch?`)) return;
    reviewWords.clear();
    saveReview();
  });
  bar.querySelector('#bar-hover').addEventListener('click', () => {
    hoverSpeech = !hoverSpeech;
    writeStore('satVocabHoverSpeech', hoverSpeech);
    if (!hoverSpeech && 'speechSynthesis' in window) speechSynthesis.cancel();
    refreshBar();
  });
}

function refreshBar() {
  const quizButton = document.querySelector('#bar-quiz');
  if (!quizButton) return;
  quizButton.hidden = mode === 'quiz' && quizKind === 'batch';
  quizButton.textContent = quizActive && quizKind === 'batch' ? '📝 Back to my quiz' : '📝 Take the quiz';
  const hover = document.querySelector('#bar-hover');
  hover.setAttribute('aria-pressed', String(hoverSpeech));
  hover.textContent = hoverSpeech ? '🔊 Hover to listen: On' : '🔇 Hover to listen: Off';
  document.querySelectorAll('[data-needs-review]').forEach(node => {
    node.disabled = reviewWords.size < 4;
    node.title = reviewWords.size < 4 ? 'Mark at least 4 words first.' : '';
  });
}

window.addEventListener('popstate', () => {
  const next = new URLSearchParams(location.search).get('mode');
  if (batch && ['learn', 'quiz', 'list'].includes(next)) setMode(next, false);
});

document.querySelectorAll('.batch-mode-nav a').forEach(link => link.addEventListener('click', event => {
  if (!batch) return;
  event.preventDefault();
  const next = link.id.replace('-link', '');
  if (next === 'quiz') openQuiz(quizActive ? quizKind : 'batch');
  else setMode(next);
}));

if (!batchId) {
  document.querySelector('main').innerHTML = document.querySelector('#loading-error').innerHTML;
} else {
  Promise.all([
    fetch(`data/batches/${encodeURIComponent(batchId)}.json`).then(response => { if (!response.ok) throw Error(); return response.json(); }),
    fetch('data/batches-index.json').then(response => response.json())
  ]).then(([data, index]) => {
    batch = data;
    const position = index.batches.findIndex(item => item.id === batch.id) + 1;
    document.querySelector('#batch-counter').textContent = `Batch ${position} of ${index.summary.total_batches}`;
    document.querySelector('#batch-part').textContent = batch.part_label;
    document.querySelector('#batch-title').textContent = batch.name;
    document.querySelector('#batch-subtitle').textContent = `${batch.subtitle} · ${batch.count} words`;
    loadReview();
    buildStudyBar();
    history.replaceState({ mode }, '', location.href);
    if (mode === 'quiz' && params.get('set') === 'review' && reviewWords.size >= 4) {
      openQuiz('review');
      history.replaceState({ mode: 'quiz' }, '', location.href);
    } else {
      setMode(mode, false);
    }
    retryPendingResults();
  }).catch(() => {
    document.querySelector('main').innerHTML = document.querySelector('#loading-error').innerHTML;
  });
}
