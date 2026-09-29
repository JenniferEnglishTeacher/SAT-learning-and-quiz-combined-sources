const sectionRoot=document.querySelector('#grammar-sections');
const ruleNav=document.querySelector('#rule-nav');
const progressCopy=document.querySelector('#grammar-progress-copy');
const progressFill=document.querySelector('#grammar-progress-fill');
const storageKey='satPunctuationAnswered';
const answered=new Set(JSON.parse(localStorage.getItem(storageKey)||'[]'));
let totalQuestions=0;

const esc=value=>{const node=document.createElement('div');node.textContent=value??'';return node.innerHTML};
const optionLetter=label=>`${label})`;

function saveProgress(){
  localStorage.setItem(storageKey,JSON.stringify([...answered]));
  const done=answered.size;
  const percent=totalQuestions?Math.round(done/totalQuestions*100):0;
  progressCopy.textContent=`${done} of ${totalQuestions} questions answered · ${percent}% complete`;
  progressFill.style.width=`${percent}%`;
}

function renderQuestion(section,question){
  const key=`${section.number}-${question.number}`;
  const article=document.createElement('article');
  article.className='grammar-question';
  article.dataset.questionKey=key;
  article.innerHTML=`
    <div class="grammar-question-head"><strong>Question ${question.number}</strong><span>${esc(question.source||'Practice item')}</span></div>
    <p class="question-passage">${esc(question.passage)}</p>
    <p class="question-direction">${esc(question.prompt)}</p>
    <div class="grammar-options"></div>
    <div class="grammar-feedback" hidden></div>`;
  const options=article.querySelector('.grammar-options');
  question.options.forEach(option=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='grammar-option';
    button.dataset.label=option.label;
    button.innerHTML=`<strong>${optionLetter(option.label)}</strong><span>${esc(option.text)}</span>`;
    button.addEventListener('click',()=>gradeQuestion(article,question,option.label,key));
    options.append(button);
  });
  if(answered.has(key)) article.classList.add('previously-answered');
  return article;
}

function gradeQuestion(article,question,selected,key){
  if(article.dataset.graded==='true') return;
  article.dataset.graded='true';
  const isCorrect=selected===question.correct;
  article.querySelectorAll('.grammar-option').forEach(button=>{
    button.disabled=true;
    if(button.dataset.label===question.correct) button.classList.add('correct');
    else if(button.dataset.label===selected) button.classList.add('wrong');
  });
  const feedback=article.querySelector('.grammar-feedback');
  feedback.hidden=false;
  feedback.className=`grammar-feedback ${isCorrect?'correct':'wrong'}`;
  feedback.innerHTML=`<strong>${isCorrect?'Correct!':'Not quite.'}</strong><p><b>Answer: ${question.correct}.</b> ${esc(question.explanation)}</p>`;
  answered.add(key);
  saveProgress();
}

function renderSection(section,index){
  const details=document.createElement('details');
  details.className='grammar-rule';
  details.id=section.id;
  details.open=index===0;
  details.innerHTML=`
    <summary><span class="rule-number">${String(section.number).padStart(2,'0')}</span><span>${esc(section.title)}</span></summary>
    <div class="grammar-rule-body">
      <div class="rule-explanation"><p>${esc(section.explanation_en)}</p>${section.explanation_zh?`<p lang="zh-Hant"><strong>中文說明：</strong>${esc(section.explanation_zh)}</p>`:''}</div>
      <div class="example-panel"><h3>Two examples</h3><ol>${section.examples.map(example=>`<li>${esc(example)}</li>`).join('')}</ol></div>
      <div class="rule-questions"><h3>Test this grammar concept</h3></div>
    </div>`;
  const questions=details.querySelector('.rule-questions');
  section.questions.forEach(question=>questions.append(renderQuestion(section,question)));
  return details;
}

fetch('data/grammar/punctuation.json')
  .then(response=>{if(!response.ok)throw new Error('Course data unavailable');return response.json()})
  .then(data=>{
    totalQuestions=data.question_count;
    data.sections.forEach((section,index)=>{
      const link=document.createElement('a');
      link.href=`#${section.id}`;
      link.textContent=`${section.number}. ${section.title}`;
      link.addEventListener('click',()=>{
        const target=document.getElementById(section.id);
        if(target) target.open=true;
      });
      ruleNav.append(link);
      sectionRoot.append(renderSection(section,index));
    });
    saveProgress();
  })
  .catch(error=>{
    sectionRoot.innerHTML=`<div class="empty-state"><h2>Grammar lesson unavailable</h2><p>${esc(error.message)}. Please refresh the page.</p></div>`;
  });
