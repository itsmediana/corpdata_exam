const TEST_SIZE = 20;
const STORAGE_KEY = 'corpDataQuiz_v1';
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => Array.from(root.querySelectorAll(s));

function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}
  return a;
}
function normalizeKeys(keys){return [...keys].sort().join('');}
function save(state){localStorage.setItem(STORAGE_KEY, JSON.stringify(state));}
function load(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY));}catch(e){return null;}}

function buildTests(){
  const byTopic = new Map();
  QUESTIONS.forEach(q => {
    if(!byTopic.has(q.topic)) byTopic.set(q.topic, []);
    byTopic.get(q.topic).push(q.id);
  });
  for(const [t, ids] of byTopic) byTopic.set(t, shuffle(ids));
  const allRemaining = () => [...byTopic.values()].reduce((s,a)=>s+a.length,0);
  const tests=[];
  while(allRemaining()>0){
    let test=[];
    const topics = shuffle([...byTopic.keys()]);
    // first pass: one from each topic, чтобы блоки смешивались
    for(const t of topics){
      if(test.length>=TEST_SIZE) break;
      const arr=byTopic.get(t);
      if(arr.length) test.push(arr.pop());
    }
    // fill random remaining slots
    while(test.length<TEST_SIZE && allRemaining()>0){
      const nonempty=[...byTopic.keys()].filter(t=>byTopic.get(t).length);
      const t=nonempty[Math.floor(Math.random()*nonempty.length)];
      test.push(byTopic.get(t).pop());
    }
    tests.push(shuffle(test));
  }
  return tests;
}
function ensureState(){
  let state=load();
  if(!state || !state.tests || !state.tests.length){
    state={tests:buildTests(), current:0, checked:{}};
    save(state);
  }
  return state;
}
function getQuestion(id){return QUESTIONS.find(q=>q.id===id);}
function currentIds(){const st=ensureState(); return st.tests[st.current] || [];}
function userKey(q){return `q_${q.id}`;}

function render(){
  const st=ensureState();
  const ids=st.tests[st.current] || [];
  $('#testTitle').textContent = `Тест ${st.current+1}/${st.tests.length}`;
  $('#deckStatus').textContent = `${QUESTIONS.length} вопросов · по ${TEST_SIZE} в тесте`;
  const box=$('#questions'); box.innerHTML='';
  ids.forEach((id, idx)=> box.appendChild(renderQuestion(getQuestion(id), idx+1)));
  updateStats();
  renderSummary(false);
}
function renderQuestion(q, num){
  const card=document.createElement('article');
  card.className='question-card';
  card.dataset.qid=q.id;
  card.innerHTML=`<div class="q-meta"><span class="pill">Тема ${q.topic}: ${escapeHtml(q.topicTitle)}</span><span class="pill type">${typeLabel(q)}</span></div><h2 class="q-title">${num}. ${escapeHtml(q.prompt)}</h2>`;
  const area=document.createElement('div');
  if(q.type==='single' || q.type==='multiple') area.appendChild(renderOptions(q));
  if(q.type==='match') area.appendChild(renderMatch(q));
  if(q.type==='order') area.appendChild(renderOrder(q));
  card.appendChild(area);
  const actions=document.createElement('div'); actions.className='actions';
  actions.innerHTML=`<button class="check-btn">Проверить</button><span class="result"></span>`;
  const exp=document.createElement('div'); exp.className='explanation'; exp.textContent=q.explanation || '';
  card.appendChild(actions); card.appendChild(exp);
  $('.check-btn', card).addEventListener('click',()=>checkQuestion(q, card));
  restoreAnswer(q, card);
  return card;
}
function renderOptions(q){
  const wrap=document.createElement('div'); wrap.className='options';
  q.options.forEach(opt=>{
    const id=`${q.id}_${opt.key}`;
    const row=document.createElement('label'); row.className='option'; row.dataset.key=opt.key;
    row.innerHTML=`<input type="${q.type==='single'?'radio':'checkbox'}" name="${q.id}" value="${opt.key}" id="${id}"><span class="letter">${opt.key}</span><span>${escapeHtml(opt.text)}</span>`;
    wrap.appendChild(row);
  });
  return wrap;
}
function renderMatch(q){
  const wrap=document.createElement('div'); wrap.className='match';
  const rights=shuffle(q.pairs.map(p=>p.right));
  q.pairs.forEach((p,i)=>{
    const row=document.createElement('div'); row.className='match-row'; row.dataset.key=p.key;
    row.innerHTML=`<div class="left"><span class="letter">${p.key}</span> ${escapeHtml(p.left)}</div><select><option value="">Выбери соответствие…</option>${rights.map(r=>`<option value="${escapeAttr(r)}">${escapeHtml(r)}</option>`).join('')}</select>`;
    wrap.appendChild(row);
  });
  return wrap;
}
function renderOrder(q){
  const wrap=document.createElement('div'); wrap.className='order';
  const n=q.options.length;
  q.options.forEach(opt=>{
    const row=document.createElement('div'); row.className='order-row'; row.dataset.key=opt.key;
    row.innerHTML=`<div class="left"><span class="letter">${opt.key}</span> ${escapeHtml(opt.text)}</div><select><option value="">Место в порядке…</option>${Array.from({length:n},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}</select>`;
    wrap.appendChild(row);
  });
  return wrap;
}
function getAnswer(q, card){
  if(q.type==='single' || q.type==='multiple') return $$('input:checked', card).map(i=>i.value);
  if(q.type==='match'){
    const ans={}; $$('.match-row', card).forEach(r=>ans[r.dataset.key]=$('select', r).value); return ans;
  }
  if(q.type==='order'){
    const ans={}; $$('.order-row', card).forEach(r=>ans[r.dataset.key]=$('select', r).value); return ans;
  }
}
function isCorrect(q, ans){
  if(q.type==='single' || q.type==='multiple') return normalizeKeys(ans)===normalizeKeys(q.answer);
  if(q.type==='match') return q.pairs.every(p=>ans[p.key]===p.right);
  if(q.type==='order') return q.answer.every((key, idx)=>String(ans[key])===String(idx+1));
}
function checkQuestion(q, card){
  const ans=getAnswer(q, card);
  const ok=isCorrect(q, ans);
  card.classList.add('checked');
  const res=$('.result', card); res.textContent=ok?'Верно ✅':'Неверно — сейчас добьём 🫡'; res.className=`result ${ok?'ok':'bad'}`;
  if(q.type==='single' || q.type==='multiple'){
    $$('.option', card).forEach(row=>{
      row.classList.remove('correct','wrong');
      const key=row.dataset.key;
      if(q.answer.includes(key)) row.classList.add('correct');
      const input=$('input', row);
      if(input.checked && !q.answer.includes(key)) row.classList.add('wrong');
    });
  }
  if(q.type==='match'){
    $$('.match-row', card).forEach(row=>{
      const p=q.pairs.find(x=>x.key===row.dataset.key);
      const sel=$('select', row);
      sel.style.borderColor = sel.value===p.right ? '#86efac' : '#fecaca';
    });
  }
  if(q.type==='order'){
    $$('.order-row', card).forEach(row=>{
      const idx=q.answer.indexOf(row.dataset.key)+1;
      const sel=$('select', row);
      sel.style.borderColor = String(sel.value)===String(idx) ? '#86efac' : '#fecaca';
    });
  }
  const st=ensureState();
  st.checked[q.id]={ok, ans}; save(st);
  updateStats(); renderSummary(false);
}
function restoreAnswer(q, card){
  const st=ensureState(); const rec=st.checked[q.id]; if(!rec) return;
  if(q.type==='single' || q.type==='multiple'){
    rec.ans.forEach(k=>{const inp=$(`input[value="${cssEscape(k)}"]`, card); if(inp) inp.checked=true;});
  } else if(q.type==='match'){
    Object.entries(rec.ans).forEach(([k,v])=>{const row=$(`.match-row[data-key="${cssEscape(k)}"]`, card); if(row) $('select', row).value=v;});
  } else if(q.type==='order'){
    Object.entries(rec.ans).forEach(([k,v])=>{const row=$(`.order-row[data-key="${cssEscape(k)}"]`, card); if(row) $('select', row).value=v;});
  }
  checkQuestion(q, card);
}
function updateStats(){
  const st=ensureState(); const ids=currentIds(); const recs=ids.map(id=>st.checked[id]).filter(Boolean);
  const correct=recs.filter(r=>r.ok).length;
  $('#answeredCount').textContent=recs.length; $('#correctCount').textContent=correct; $('#wrongCount').textContent=recs.length-correct;
  $('#progressBar').style.width=(ids.length?recs.length/ids.length*100:0)+'%';
}
function renderSummary(force){
  const st=ensureState(); const ids=currentIds(); const recs=ids.map(id=>st.checked[id]).filter(Boolean);
  const box=$('#summary');
  if(!force && recs.length<ids.length){box.className='summary hidden'; box.innerHTML=''; return;}
  const correct=recs.filter(r=>r.ok).length; const total=ids.length; const pct=Math.round(correct/total*100);
  let cls=pct>=85?'good':pct>=60?'mid':'bad';
  let phrase=pct>=85?'легенда, можно идти пить чай':pct>=60?'норм, но ошибки надо добить':'пока шатает, но это чинится';
  box.className=`summary ${cls}`;
  box.innerHTML=`<h2>Результат: ${correct}/${total} (${pct}%)</h2><p>${phrase}. Нажми «Следующий тест», чтобы продолжить без повторов.</p>`;
}
$('#checkAllBtn').addEventListener('click',()=>{
  $$('.question-card').forEach(card=>checkQuestion(getQuestion(card.dataset.qid), card));
  renderSummary(true); window.scrollTo({top:0,behavior:'smooth'});
});
$('#nextTestBtn').addEventListener('click',()=>{
  const st=ensureState();
  if(st.current < st.tests.length-1){ st.current += 1; save(st); render(); window.scrollTo({top:0,behavior:'smooth'}); }
  else { alert('Ты прошла весь банк без повторов. Можно начать заново и перемешать вопросы. Королева данных 👑'); }
});
$('#resetBtn').addEventListener('click',()=>{ if(confirm('Сбросить прогресс и заново перемешать весь банк?')){ localStorage.removeItem(STORAGE_KEY); render(); }});
function typeLabel(q){return q.type==='single'?'один ответ':q.type==='multiple'?'несколько ответов':q.type==='match'?'сопоставление':'порядок';}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));}
function escapeAttr(s){return escapeHtml(s).replace(/`/g,'&#096;');}
function cssEscape(s){return String(s).replace(/([ #;?%&,.+*~\':"!^$[\]()=>|/@])/g,'\\$1');}
render();
