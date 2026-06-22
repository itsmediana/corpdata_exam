const TEST_SIZE = 20;
const STORAGE_KEY = 'corpDataQuiz_PRO_v2';
const LABELS = ['А','Б','В','Г','Д','Е','Ж','З','И','К'];
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => Array.from(root.querySelectorAll(s));

let app = loadApp();
let activeProfile = null;

function defaultApp(){ return { version: 2, currentProfile: '', profiles: {} }; }
function defaultProfile(name){
  return { name, createdAt: new Date().toISOString(), answers: {}, wrongIds: [], historyWrongIds: [], usedRandomCycle: [], active: null, lastMode: 'home' };
}
function loadApp(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultApp(); } catch(e){ return defaultApp(); } }
function saveApp(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(app)); }
function getProfile(){
  if(!app.currentProfile || !app.profiles[app.currentProfile]) return null;
  return app.profiles[app.currentProfile];
}
function setProfile(name){
  name = (name || 'Диана').trim();
  if(!app.profiles[name]) app.profiles[name] = defaultProfile(name);
  app.currentProfile = name; activeProfile = app.profiles[name]; saveApp();
}
function syncProfile(){ activeProfile = getProfile(); }

function shuffle(arr){
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function sample(arr, n){ return shuffle(arr).slice(0, n); }
function unique(arr){ return [...new Set(arr)]; }
function normalizeKeys(keys){ return [...(keys || [])].sort().join('|'); }
function getQuestion(id){ return QUESTIONS.find(q=>q.id===id); }
function allIds(){ return QUESTIONS.map(q=>q.id); }
function idsByTopic(topic){ return QUESTIONS.filter(q=>q.topic === topic).map(q=>q.id); }
function topicInfo(){
  const map = new Map();
  QUESTIONS.forEach(q => {
    if(!map.has(q.topic)) map.set(q.topic, {topic:q.topic, title:q.topicTitle, count:0});
    map.get(q.topic).count++;
  });
  return [...map.values()].sort((a,b)=>a.topic-b.topic);
}
function pageIds(){
  const p = activeProfile?.active; if(!p) return [];
  const start = (p.page || 0) * TEST_SIZE;
  return p.ids.slice(start, start + TEST_SIZE);
}
function totalPages(){
  const p=activeProfile?.active; if(!p) return 1;
  return Math.max(1, Math.ceil(p.ids.length / TEST_SIZE));
}
function typeLabel(q){ return q.type==='single'?'один ответ':q.type==='multiple'?'несколько ответов':q.type==='match'?'сопоставление':'порядок'; }
function escapeHtml(s){ return String(s ?? '').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
function escapeAttr(s){ return escapeHtml(s).replace(/`/g,'&#096;'); }
function cssEscape(s){ return String(s).replace(/([ #;?%&,.+*~\':"!^$[\]()=>|/@])/g,'\\$1'); }

function showToast(text){ const t=$('#toast'); t.textContent=text; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 2200); }

function ensureOrders(q){
  const a = activeProfile.active;
  if(!a.orders) a.orders = {};
  if(!a.orders[q.id]) a.orders[q.id] = {};
  const o = a.orders[q.id];
  if((q.type === 'single' || q.type === 'multiple') && !o.options) o.options = shuffle(q.options.map(x=>x.key));
  if(q.type === 'match' && !o.matchRights) o.matchRights = shuffle(q.pairs.map(x=>x.right));
  if(q.type === 'order' && !o.orderOptions) o.orderOptions = shuffle(q.options.map(x=>x.key));
  saveApp(); return o;
}

function startRandomTest(){
  syncProfile();
  const used = new Set(activeProfile.usedRandomCycle || []);
  let available = allIds().filter(id => !used.has(id));
  if(available.length < TEST_SIZE){ activeProfile.usedRandomCycle = []; available = allIds(); }
  const grouped = new Map();
  available.forEach(id => { const q=getQuestion(id); if(!grouped.has(q.topic)) grouped.set(q.topic, []); grouped.get(q.topic).push(id); });
  let chosen=[];
  for(const topic of shuffle([...grouped.keys()])){
    if(chosen.length >= TEST_SIZE) break;
    const ids = grouped.get(topic); if(ids.length) chosen.push(sample(ids,1)[0]);
  }
  const rest = available.filter(id=>!chosen.includes(id));
  chosen = [...chosen, ...sample(rest, TEST_SIZE - chosen.length)];
  chosen = shuffle(chosen);
  activeProfile.usedRandomCycle = unique([...(activeProfile.usedRandomCycle || []), ...chosen]);
  activeProfile.active = { mode:'random', title:'Рандомный тест', ids:chosen, page:0, orders:{}, startedAt:new Date().toISOString(), attemptId:cryptoId() };
  saveApp(); renderQuiz();
}
function startMarathon(){
  activeProfile.active = { mode:'marathon', title:'Марафон по всему банку', ids:shuffle(allIds()), page:0, orders:{}, startedAt:new Date().toISOString(), attemptId:cryptoId() };
  saveApp(); renderQuiz();
}
function startTopic(topic){
  const info = topicInfo().find(t=>t.topic===topic);
  activeProfile.active = { mode:'topic', topic, title:`Тема ${topic}. ${info?.title || ''}`, ids:shuffle(idsByTopic(topic)), page:0, orders:{}, startedAt:new Date().toISOString(), attemptId:cryptoId() };
  saveApp(); renderQuiz();
}
function startMistakes(){
  const ids = (activeProfile.wrongIds || []).filter(id=>getQuestion(id));
  if(!ids.length){ showToast('Пока нет ошибок к разбору. Красота ✨'); return; }
  activeProfile.active = { mode:'mistakes', title:'Разбор ошибок', ids:shuffle(ids), page:0, orders:{}, startedAt:new Date().toISOString(), attemptId:cryptoId() };
  saveApp(); renderQuiz();
}
function repeatCurrent(){
  const a=activeProfile.active; if(!a) return;
  if(!confirm('Сбросить ответы в этом режиме и пройти заново?')) return;
  a.ids.forEach(id => { delete activeProfile.answers[id]; });
  activeProfile.wrongIds = (activeProfile.wrongIds || []).filter(id => !a.ids.includes(id));
  a.orders = {}; a.page = 0; a.startedAt = new Date().toISOString(); a.attemptId = cryptoId();
  if(a.mode !== 'random') a.ids = shuffle(a.ids);
  saveApp(); renderQuiz(); showToast('Сбросили. Новый заход, новая легенда');
}
function cryptoId(){ return `${Date.now()}_${Math.random().toString(16).slice(2)}`; }

function renderApp(){
  syncProfile();
  $('#totalQuestionsView').textContent = QUESTIONS.length;
  if(!activeProfile){
    $('#profilePanel').classList.remove('hidden');
    $('#homeView').classList.add('hidden');
    $('#quizView').classList.add('hidden');
    $('#profileNameView').textContent = '—';
    return;
  }
  $('#profilePanel').classList.add('hidden');
  $('#profileNameView').textContent = activeProfile.name;
  renderHome();
}
function renderHome(){
  $('#homeView').classList.remove('hidden'); $('#quizView').classList.add('hidden'); $('#hero').classList.remove('hidden');
  updateGlobalStats(); renderTopics();
}
function updateGlobalStats(){
  const answers = activeProfile?.answers || {};
  $('#answeredAllView').textContent = Object.keys(answers).length;
  $('#wrongBankView').textContent = (activeProfile?.wrongIds || []).length;
}
function renderTopics(){
  const grid=$('#topicGrid'); grid.innerHTML='';
  topicInfo().forEach(t=>{
    const ids=idsByTopic(t.topic);
    const recs=ids.map(id=>activeProfile.answers[id]).filter(Boolean);
    const ok=recs.filter(r=>r.ok).length;
    const pct = ids.length ? Math.round(recs.length / ids.length * 100) : 0;
    const card=document.createElement('article'); card.className='topic-card';
    card.innerHTML=`
      <h3>Тема ${t.topic}. ${escapeHtml(t.title)}</h3>
      <div class="topic-row"><span>${t.count} вопросов</span><span>${ok}/${recs.length || 0} верно из решённых</span></div>
      <div class="progress"><span style="width:${pct}%"></span></div>
      <button data-topic="${t.topic}">Открыть тему</button>`;
    $('button', card).addEventListener('click',()=>startTopic(t.topic));
    grid.appendChild(card);
  });
}
function renderQuiz(){
  $('#homeView').classList.add('hidden'); $('#quizView').classList.remove('hidden'); $('#hero').classList.add('hidden');
  const a=activeProfile.active;
  const ids=pageIds();
  const pages=totalPages();
  $('#modeLabel').textContent = modeText(a.mode);
  $('#quizTitle').textContent = a.title;
  $('#quizMeta').textContent = `${a.ids.length} вопросов · страница ${(a.page || 0)+1}/${pages}`;
  $('#prevPageBtn').disabled = (a.page || 0) <= 0;
  $('#nextPageBtn').disabled = (a.page || 0) >= pages - 1;
  const box=$('#questions'); box.innerHTML='';
  ids.forEach((id, idx)=> box.appendChild(renderQuestion(getQuestion(id), (a.page || 0)*TEST_SIZE + idx + 1)));
  updatePageStats(); renderSummary(false); window.scrollTo({top:0,behavior:'smooth'});
}
function modeText(mode){ return mode==='random'?'рандомный тест':mode==='marathon'?'марафон':mode==='topic'?'тема':mode==='mistakes'?'ошибки':'режим'; }
function renderQuestion(q, num){
  const card=document.createElement('article'); card.className='question-card'; card.dataset.qid=q.id;
  card.innerHTML=`<div class="q-meta"><span class="pill">Тема ${q.topic}: ${escapeHtml(q.topicTitle)}</span><span class="pill type">${typeLabel(q)}</span></div><h2 class="q-title">${num}. ${escapeHtml(q.prompt)}</h2>`;
  const area=document.createElement('div');
  if(q.type==='single' || q.type==='multiple') area.appendChild(renderOptions(q));
  if(q.type==='match') area.appendChild(renderMatch(q));
  if(q.type==='order') area.appendChild(renderOrder(q));
  card.appendChild(area);
  const actions=document.createElement('div'); actions.className='actions';
  actions.innerHTML='<button class="check-btn">Проверить</button><span class="result"></span>';
  const exp=document.createElement('div'); exp.className='explanation'; exp.innerHTML=`<div>${escapeHtml(q.explanation || '')}</div>`;
  card.appendChild(actions); card.appendChild(exp);
  $('.check-btn', card).addEventListener('click',()=>checkQuestion(q, card, true));
  restoreAnswer(q, card);
  return card;
}
function renderOptions(q){
  const wrap=document.createElement('div'); wrap.className='options';
  const order = ensureOrders(q).options;
  order.forEach((key, i)=>{
    const opt=q.options.find(x=>x.key===key); const id=`${q.id}_${key}`;
    const row=document.createElement('label'); row.className='option'; row.dataset.key=key;
    row.innerHTML=`<input type="${q.type==='single'?'radio':'checkbox'}" name="${q.id}" value="${key}" id="${id}"><span class="letter">${LABELS[i]}</span><span>${escapeHtml(opt.text)}</span>`;
    wrap.appendChild(row);
  });
  return wrap;
}
function renderMatch(q){
  const wrap=document.createElement('div'); wrap.className='match';
  const rights = ensureOrders(q).matchRights;
  q.pairs.forEach((p,i)=>{
    const row=document.createElement('div'); row.className='match-row'; row.dataset.key=p.key;
    row.innerHTML=`<div class="left"><span class="letter">${LABELS[i]}</span> ${escapeHtml(p.left)}</div><select><option value="">Выбери соответствие…</option>${rights.map(r=>`<option value="${escapeAttr(r)}">${escapeHtml(r)}</option>`).join('')}</select>`;
    wrap.appendChild(row);
  });
  return wrap;
}
function renderOrder(q){
  const wrap=document.createElement('div'); wrap.className='order';
  const order = ensureOrders(q).orderOptions;
  order.forEach((key,i)=>{
    const opt=q.options.find(x=>x.key===key);
    const row=document.createElement('div'); row.className='order-row'; row.dataset.key=key;
    row.innerHTML=`<div class="left"><span class="letter">${LABELS[i]}</span> ${escapeHtml(opt.text)}</div><select><option value="">Место в порядке…</option>${Array.from({length:q.options.length},(_,j)=>`<option value="${j+1}">${j+1}</option>`).join('')}</select>`;
    wrap.appendChild(row);
  });
  return wrap;
}
function getAnswer(q, card){
  if(q.type==='single' || q.type==='multiple') return $$('input:checked', card).map(i=>i.value);
  if(q.type==='match'){ const ans={}; $$('.match-row', card).forEach(r=>ans[r.dataset.key]=$('select', r).value); return ans; }
  if(q.type==='order'){ const ans={}; $$('.order-row', card).forEach(r=>ans[r.dataset.key]=$('select', r).value); return ans; }
}
function isAnswered(q, ans){
  if(q.type==='single' || q.type==='multiple') return ans.length > 0;
  if(q.type==='match') return Object.values(ans).every(Boolean);
  if(q.type==='order') return Object.values(ans).every(Boolean);
}
function isCorrect(q, ans){
  if(q.type==='single' || q.type==='multiple') return normalizeKeys(ans)===normalizeKeys(q.answer);
  if(q.type==='match') return q.pairs.every(p=>ans[p.key]===p.right);
  if(q.type==='order') return q.answer.every((key, idx)=>String(ans[key])===String(idx+1));
}
function checkQuestion(q, card, loud=false){
  const ans=getAnswer(q, card);
  if(!isAnswered(q, ans) && loud){ showToast('Сначала выбери ответ, хитрюга'); return false; }
  const ok=isCorrect(q, ans);
  card.classList.add('checked');
  const res=$('.result', card); res.textContent=ok?'Верно ✅':'Неверно — в копилку ошибок 🫡'; res.className=`result ${ok?'ok':'bad'}`;
  renderCorrections(q, card, ans);
  saveAnswer(q, ans, ok);
  updatePageStats(); renderSummary(false); return ok;
}
function renderCorrections(q, card, ans){
  $$('.correct-box,.wrong-box', card).forEach(x=>x.remove());
  if(q.type==='single' || q.type==='multiple'){
    $$('.option', card).forEach(row=>{
      row.classList.remove('correct','wrong');
      const key=row.dataset.key;
      if(q.answer.includes(key)) row.classList.add('correct');
      const input=$('input', row);
      if(input.checked && !q.answer.includes(key)) row.classList.add('wrong');
    });
    const correctTexts = q.answer.map(key => q.options.find(o=>o.key===key)?.text).filter(Boolean).join('; ');
    $('.explanation', card).insertAdjacentHTML('beforeend', `<div class="correct-box">Правильно: ${escapeHtml(correctTexts)}</div>`);
  }
  if(q.type==='match'){
    $$('.match-row', card).forEach(row=>{
      const p=q.pairs.find(x=>x.key===row.dataset.key); const sel=$('select', row);
      sel.style.borderColor = sel.value===p.right ? '#86efac' : '#fecaca';
      sel.style.background = sel.value===p.right ? '#f0fdf4' : '#fff1f2';
    });
    const text = q.pairs.map(p=>`${p.left} → ${p.right}`).join('; ');
    $('.explanation', card).insertAdjacentHTML('beforeend', `<div class="correct-box">Правильно: ${escapeHtml(text)}</div>`);
  }
  if(q.type==='order'){
    $$('.order-row', card).forEach(row=>{
      const idx=q.answer.indexOf(row.dataset.key)+1; const sel=$('select', row);
      sel.style.borderColor = String(sel.value)===String(idx) ? '#86efac' : '#fecaca';
      sel.style.background = String(sel.value)===String(idx) ? '#f0fdf4' : '#fff1f2';
    });
    const text = q.answer.map((key,i)=>`${i+1}) ${q.options.find(o=>o.key===key)?.text}`).join('; ');
    $('.explanation', card).insertAdjacentHTML('beforeend', `<div class="correct-box">Правильно: ${escapeHtml(text)}</div>`);
  }
}
function saveAnswer(q, ans, ok){
  activeProfile.answers[q.id] = { ok, ans, updatedAt:new Date().toISOString(), mode:activeProfile.active?.mode || 'unknown' };
  let wrong = new Set(activeProfile.wrongIds || []);
  let hist = new Set(activeProfile.historyWrongIds || []);
  if(ok) wrong.delete(q.id); else { wrong.add(q.id); hist.add(q.id); }
  activeProfile.wrongIds = [...wrong]; activeProfile.historyWrongIds = [...hist]; saveApp(); updateGlobalStats();
}
function restoreAnswer(q, card){
  const rec = activeProfile.answers[q.id]; if(!rec) return;
  if(q.type==='single' || q.type==='multiple') rec.ans.forEach(k=>{ const inp=$(`input[value="${cssEscape(k)}"]`, card); if(inp) inp.checked=true; });
  if(q.type==='match') Object.entries(rec.ans).forEach(([k,v])=>{ const row=$(`.match-row[data-key="${cssEscape(k)}"]`, card); if(row) $('select', row).value=v; });
  if(q.type==='order') Object.entries(rec.ans).forEach(([k,v])=>{ const row=$(`.order-row[data-key="${cssEscape(k)}"]`, card); if(row) $('select', row).value=v; });
  checkQuestion(q, card, false);
}
function updatePageStats(){
  const ids=pageIds(); const recs=ids.map(id=>activeProfile.answers[id]).filter(Boolean);
  const correct=recs.filter(r=>r.ok).length;
  $('#pageAnswered').textContent=recs.length; $('#pageCorrect').textContent=correct; $('#pageWrong').textContent=recs.length-correct;
  $('#progressBar').style.width=(ids.length ? recs.length/ids.length*100 : 0)+'%';
}
function renderSummary(force){
  const ids=pageIds(); const recs=ids.map(id=>activeProfile.answers[id]).filter(Boolean); const box=$('#summary');
  if(!force && recs.length < ids.length){ box.className='summary hidden'; box.innerHTML=''; return; }
  const correct = recs.filter(r=>r.ok).length; const total=ids.length || 1; const pct=Math.round(correct/total*100);
  const cls=pct>=85?'good':pct>=60?'mid':'bad';
  const phrase = pct>=85 ? 'королева данных, вопросов нет' : (pct>=60 ? 'нормально, но ошибки надо добить' : 'пока шатает, но это лечится повторением');
  box.className=`summary ${cls}`;
  box.innerHTML=`<h2>Страница: ${correct}/${ids.length} (${pct}%)</h2><p>${phrase}. Ошибки автоматически попали в отдельный режим.</p>`;
}

function exportProgress(){
  const profile = getProfile(); if(!profile) return;
  const payload = { app:'corpDataQuizPro', version:2, exportedAt:new Date().toISOString(), profile };
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download=`corpdata-progress-${profile.name}-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(url);
}
function importProgress(file){
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const data=JSON.parse(reader.result); const profile=data.profile || data;
      if(!profile.name || !profile.answers) throw new Error('bad file');
      app.profiles[profile.name]=profile; app.currentProfile=profile.name; saveApp(); renderApp(); showToast('Прогресс импортирован');
    }catch(e){ alert('Не получилось импортировать файл прогресса. Проверь, что это JSON из этого тренажёра.'); }
  };
  reader.readAsText(file);
}

$('#startProfileBtn').addEventListener('click',()=>{ setProfile($('#profileNameInput').value); renderApp(); showToast('Погнали учить'); });
$('#changeProfileBtn').addEventListener('click',()=>{ const name=prompt('Имя профиля:', app.currentProfile || 'Диана'); if(name){ setProfile(name); renderApp(); } });
$('#homeLogo').addEventListener('click',()=>renderHome());
$('#startRandomBtn').addEventListener('click',startRandomTest);
$('#startMarathonBtn').addEventListener('click',startMarathon);
$('#startMistakesBtn').addEventListener('click',startMistakes);
$('#backHomeBtn').addEventListener('click',renderHome);
$('#prevPageBtn').addEventListener('click',()=>{ activeProfile.active.page=Math.max(0,(activeProfile.active.page||0)-1); saveApp(); renderQuiz(); });
$('#nextPageBtn').addEventListener('click',()=>{ activeProfile.active.page=Math.min(totalPages()-1,(activeProfile.active.page||0)+1); saveApp(); renderQuiz(); });
$('#checkPageBtn').addEventListener('click',()=>{ $$('.question-card').forEach(card=>checkQuestion(getQuestion(card.dataset.qid), card, false)); renderSummary(true); showToast('Страница проверена'); });
$('#newAttemptBtn').addEventListener('click',repeatCurrent);
$('#exportBtn').addEventListener('click',exportProgress);
$('#importInput').addEventListener('change',e=>{ if(e.target.files[0]) importProgress(e.target.files[0]); e.target.value=''; });
$('#resetProfileBtn').addEventListener('click',()=>{ if(confirm('Сбросить весь прогресс текущего профиля?')){ const name=activeProfile.name; app.profiles[name]=defaultProfile(name); saveApp(); renderApp(); showToast('Профиль сброшен'); }});

renderApp();
