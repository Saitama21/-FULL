(() => {
  'use strict';

  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const STORAGE = 'cncToleranceFull:v1';
  const PROJECTS = 'cncToleranceProjects:v1';
  const SETTINGS = 'cncToleranceSettings:v1';
  const SCROLLS = 'cncToleranceScrolls:v1';

  const state = {
    screen: 'home',
    activeTool: 'shaft',
    reverseType: 'shaft',
    lastCalculation: safeJSON(localStorage.getItem(STORAGE), null),
    settings: Object.assign({theme:'system', haptic:true, autosave:true}, safeJSON(localStorage.getItem(SETTINGS), {})),
    deferredInstall: null
  };

  function safeJSON(v, fallback){ try { return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
  function n(v){ const x = Number(String(v).replace(',', '.')); return Number.isFinite(x) ? x : NaN; }
  function fmt(v, digits=3){ if(!Number.isFinite(v)) return '—'; const z = Math.abs(v) < Math.pow(10,-digits)/2 ? 0 : v; return z.toFixed(digits); }
  function signed(v, digits=3){ if(!Number.isFinite(v)) return '—'; const z = Math.abs(v) < Math.pow(10,-digits)/2 ? 0 : v; return `${z>0?'+':''}${z.toFixed(digits)}`; }
  function clamp(x,a,b){ return Math.max(a,Math.min(b,x)); }
  function vib(){ if(state.settings.haptic && navigator.vibrate) navigator.vibrate(12); }
  function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1600); }

  const sizeSteps = [
    [0,3,Math.sqrt(1*3)],[3,6,Math.sqrt(3*6)],[6,10,Math.sqrt(6*10)],[10,18,Math.sqrt(10*18)],
    [18,30,Math.sqrt(18*30)],[30,50,Math.sqrt(30*50)],[50,80,Math.sqrt(50*80)],[80,120,Math.sqrt(80*120)],
    [120,180,Math.sqrt(120*180)],[180,250,Math.sqrt(180*250)],[250,315,Math.sqrt(250*315)],[315,400,Math.sqrt(315*400)],[400,500,Math.sqrt(400*500)]
  ];
  const gradeFactor = {5:7,6:10,7:16,8:25,9:40,10:64,11:100,12:160,13:250,14:400,15:640,16:1000};
  const shaftFields = ['h5','h6','h7','h8','h9','h10','h11','g6','g7','f6','f7','e7','e8','d8','d9','js6','js7'];
  const holeFields = ['H6','H7','H8','H9','H10','H11','G6','G7','F7','E8','D9','JS6','JS7'];

  function stepMean(D){
    const s = sizeSteps.find(([lo,hi]) => D>lo && D<=hi) || sizeSteps[sizeSteps.length-1];
    return s[2];
  }
  function IT(D, grade){
    if(!(D>0 && D<=500) || !gradeFactor[grade]) return NaN;
    const dm = stepMean(D);
    const i = 0.45*Math.cbrt(dm)+0.001*dm; // µm
    return gradeFactor[grade]*i/1000; // mm
  }
  function fdShaft(letter,D){
    const dm=stepMean(D);
    const L=letter.toLowerCase();
    if(L==='h') return {es:0};
    if(L==='g') return {es:-(2.5*Math.pow(dm,0.34))/1000};
    if(L==='f') return {es:-(5.5*Math.pow(dm,0.41))/1000};
    if(L==='e') return {es:-(11*Math.pow(dm,0.41))/1000};
    if(L==='d') return {es:-(16*Math.pow(dm,0.44))/1000};
    return null;
  }
  function fdHole(letter,D){
    const L=letter.toUpperCase();
    const dm=stepMean(D);
    if(L==='H') return {EI:0};
    if(L==='G') return {EI:(2.5*Math.pow(dm,0.34))/1000};
    if(L==='F') return {EI:(5.5*Math.pow(dm,0.41))/1000};
    if(L==='E') return {EI:(11*Math.pow(dm,0.41))/1000};
    if(L==='D') return {EI:(16*Math.pow(dm,0.44))/1000};
    return null;
  }
  function parseField(field){
    const m = String(field).match(/^([A-Za-z]+)(\d{1,2})$/); if(!m) return null;
    return {letter:m[1], grade:Number(m[2])};
  }
  function toleranceLimits(type,D,field){
    const p=parseField(field); if(!p) return null;
    const T=IT(D,p.grade); if(!Number.isFinite(T)) return null;
    const isJS=p.letter.toLowerCase()==='js';
    let upper,lower;
    if(type==='shaft'){
      if(isJS){ upper=T/2; lower=-T/2; }
      else { const fd=fdShaft(p.letter,D); if(!fd) return null; upper=fd.es; lower=upper-T; }
    } else {
      if(isJS){ upper=T/2; lower=-T/2; }
      else { const fd=fdHole(p.letter,D); if(!fd) return null; lower=fd.EI; upper=lower+T; }
    }
    return {type,D,field,grade:p.grade,T,upper,lower,min:D+lower,max:D+upper,target:D+(upper+lower)/2};
  }

  function populateSelect(sel, arr){
    arr.forEach(v=>{ const o=document.createElement('option');o.value=v;o.textContent=v;sel.append(o); });
  }
  populateSelect($('#shaftField'), shaftFields); populateSelect($('#fitShaft'), shaftFields);
  populateSelect($('#holeField'), holeFields); populateSelect($('#fitHole'), holeFields);

  function metric(label,value,accent=false){
    return `<div class="metric-card glass ${accent?'accent':''}"><span>${label}</span><strong>${value}</strong></div>`;
  }
  function renderTolerance(type,r,target){
    if(!r){ target.innerHTML='<div class="info-note glass">Введите номинал 0–500 мм и выберите поле допуска.</div>'; return; }
    target.innerHTML=`<div class="standard-row"><span>ISO 286 — расчётная база</span><span>Единицы: мм</span></div>
      <div class="deviation-grid">
        ${metric(type==='shaft'?'Верхнее отклонение es':'Верхнее отклонение ES',signed(r.upper))}
        ${metric(type==='shaft'?'Нижнее отклонение ei':'Нижнее отклонение EI',signed(r.lower))}
        ${metric('Мин. размер',fmt(r.min))}
        ${metric('Макс. размер',fmt(r.max))}
        ${metric('Середина допуска',fmt(r.target,4))}
        ${metric('Целевой размер',fmt(r.target,4),true)}
      </div>`;
  }

  function saveLast(calc){
    state.lastCalculation=calc;
    if(state.settings.autosave) localStorage.setItem(STORAGE,JSON.stringify(calc));
    renderLast();
  }
  function renderLast(){
    const c=state.lastCalculation, box=$('#lastCalcCard');
    if(!c){ box.className='empty-state glass'; box.innerHTML='<div class="empty-icon">⌖</div><b>Пока пусто</b><span>После первого расчёта здесь появится быстрый результат.</span>'; return; }
    box.className='project-item glass';
    box.innerHTML=`<div class="project-item-head"><div><h3>${c.title||'Последний расчёт'}</h3><small>${new Date(c.time||Date.now()).toLocaleString('ru-RU')}</small></div><span class="tag">${c.type||'расчёт'}</span></div><div class="project-tags">${(c.tags||[]).map(x=>`<span class="tag">${x}</span>`).join('')}</div>`;
  }
  renderLast();

  function calcToleranceAction(type){
    const D=n(type==='shaft'?$('#shaftNominal').value:$('#holeNominal').value);
    const field=(type==='shaft'?$('#shaftField'):$('#holeField')).value;
    const result=toleranceLimits(type,D,field);
    const target=type==='shaft'?$('#shaftResults'):$('#holeResults');
    if(!result){ renderTolerance(type,null,target); toast('Проверьте размер и поле допуска'); return; }
    renderTolerance(type,result,target); vib();
    saveLast({type:'Допуск',title:`Ø${fmt(D,3)} ${field}`,time:Date.now(),tags:[`min ${fmt(result.min)}`,`max ${fmt(result.max)}`,`цель ${fmt(result.target,4)}`],data:result});
  }
  $('#calcShaft').onclick=()=>calcToleranceAction('shaft');
  $('#calcHole').onclick=()=>calcToleranceAction('hole');

  $('#calcFit').onclick=()=>{
    const D=n($('#shaftNominal').value || $('#holeNominal').value);
    const h=$('#fitHole').value,s=$('#fitShaft').value;
    const hole=toleranceLimits('hole',D,h), shaft=toleranceLimits('shaft',D,s), box=$('#fitResult');
    if(!hole||!shaft){ box.className='fit-result muted'; box.textContent='Введите номинал и выберите отверстие/вал.'; return; }
    const minClear=hole.min-shaft.max, maxClear=hole.max-shaft.min;
    let label='Переходная посадка',cls='warn';
    if(minClear>=0){label='Посадка с зазором';cls='';}
    if(maxClear<0){label='Посадка с натягом';cls='danger';}
    box.className='fit-result';
    box.innerHTML=`<span class="fit-pill ${cls}">${label}</span><b>${h}/${s}</b><br>Минимум: <b>${signed(minClear,4)} мм</b> · Максимум: <b>${signed(maxClear,4)} мм</b>`;
    vib(); saveLast({type:'Посадка',title:`Ø${fmt(D)} ${h}/${s}`,time:Date.now(),tags:[label,`min ${signed(minClear,4)}`,`max ${signed(maxClear,4)}`],data:{D,h,s,minClear,maxClear}});
  };

  function openReverse(type){ state.reverseType=type; $('#reverseDialog').showModal(); $('#reverseResults').innerHTML=''; }
  $('#openReverseShaft').onclick=()=>openReverse('shaft'); $('#openReverseHole').onclick=()=>openReverse('hole');
  $('#runReverse').onclick=()=>{
    const D=n($('#revNominal').value), upper=n($('#revUpper').value), lower=n($('#revLower').value);
    if(!Number.isFinite(D)||!Number.isFinite(upper)||!Number.isFinite(lower)){ toast('Заполните три значения'); return; }
    const fields=state.reverseType==='shaft'?shaftFields:holeFields;
    const candidates=fields.map(field=>{
      const r=toleranceLimits(state.reverseType,D,field); if(!r) return null;
      const err=Math.abs(r.upper-upper)+Math.abs(r.lower-lower);
      const scale=Math.max(0.005,Math.abs(upper-lower),r.T);
      const score=clamp(100*(1-err/(scale*2.25)),0,100);
      return {field,r,err,score};
    }).filter(Boolean).sort((a,b)=>a.err-b.err).slice(0,5);
    $('#reverseResults').innerHTML=candidates.map((c,i)=>`<div class="reverse-item glass"><div class="project-item-head"><strong>${c.field}</strong><span class="tag">${i===0?'Лучшее совпадение':`${Math.round(c.score)}%`}</span></div><div class="reverse-meta"><span>${signed(c.r.upper)} / ${signed(c.r.lower)}</span><span>Δ ${fmt(c.err,4)} мм</span></div><div class="score-bar"><i style="width:${c.score}%"></i></div></div>`).join('');
    vib();
  };

  const threadData = {
    1:[0.25],1.2:[0.25],1.4:[0.3],1.6:[0.35],1.8:[0.35],2:[0.4,0.25],2.5:[0.45,0.35],3:[0.5,0.35],3.5:[0.6],4:[0.7,0.5],5:[0.8,0.5],6:[1,0.75,0.5],7:[1,0.75],8:[1.25,1,0.75],10:[1.5,1.25,1,0.75],12:[1.75,1.5,1.25,1],14:[2,1.5,1.25],16:[2,1.5,1],18:[2.5,2,1.5,1],20:[2.5,2,1.5,1],22:[2.5,2,1.5,1],24:[3,2,1.5,1],27:[3,2,1.5],30:[3.5,3,2,1.5],33:[3.5,3,2,1.5],36:[4,3,2,1.5],39:[4,3,2,1.5],42:[4.5,4,3,2,1.5],45:[4.5,4,3,2,1.5],48:[5,4,3,2,1.5],52:[5,4,3,2,1.5],56:[5.5,4,3,2,1.5],60:[5.5,4,3,2,1.5],64:[6,4,3,2,1.5],68:[6,4,3,2,1.5],72:[6,4,3,2,1.5],76:[6,4,3,2,1.5],80:[6,4,3,2,1.5],90:[6,4,3,2,1.5],100:[6,4,3,2,1.5],110:[6,4,3,2,1.5],120:[6,4,3,2,1.5],130:[6,4,3,2,1.5],140:[6,4,3,2,1.5],150:[6,4,3,2,1.5]
  };
  Object.keys(threadData).forEach(k=>{const o=document.createElement('option');o.value=k;o.textContent=`M${k}`;$('#threadSize').append(o)});
  $('#threadSize').onchange=()=>{
    const d=$('#threadSize').value,p=$('#threadPitch'); p.innerHTML='<option value="">Выберите шаг</option>';
    (threadData[d]||[]).forEach(x=>{const o=document.createElement('option');o.value=x;o.textContent=String(x);p.append(o)});
  };
  $('#calcThread').onclick=()=>{
    const d=n($('#threadSize').value), p=n($('#threadPitch').value), box=$('#threadResults');
    if(!Number.isFinite(d)||!Number.isFinite(p)){ box.innerHTML='<div class="info-note glass">Выберите номинал и шаг.</div>'; return; }
    const d2=d-0.649519*p, d1=d-1.226869*p, D1=d-1.082532*p, drill=d-p, H=0.8660254*p;
    box.innerHTML=`<div class="thread-hero"><div class="metric-card glass accent"><span>Резьба</span><strong>M${d}×${p}</strong></div>${metric('Сверло под метчик ≈',`${fmt(drill,2)} мм`)}</div><div class="deviation-grid">${metric('Средний Ø d₂',`${fmt(d2,3)} мм`)}${metric('Мин. Ø наружной d₁',`${fmt(d1,3)} мм`)}${metric('Мин. Ø внутренней D₁',`${fmt(D1,3)} мм`)}${metric('Высота профиля H',`${fmt(H,3)} мм`)}</div>`;
    vib(); saveLast({type:'Резьба',title:`M${d}×${p}`,time:Date.now(),tags:[`сверло ≈ ${fmt(drill,2)}`,`d₂ ${fmt(d2,3)}`],data:{d,p,d2,d1,D1,drill,H}});
  };

  $('#calcRough').onclick=()=>{
    const r=n($('#roughR').value), f=n($('#roughF').value);
    const cards=$$('#roughResults strong');
    if(!(r>0)||!(f>0)){cards.forEach(x=>x.textContent='—');toast('Введите радиус и подачу');return;}
    const Ra=(f*f/(32*r))*1000, Rz=Ra*5, Rt=Ra*8;
    cards[0].textContent=fmt(Ra,2); cards[1].textContent=fmt(Rz,2); cards[2].textContent=fmt(Rt,2);
    vib(); saveLast({type:'Шероховатость',title:`rε ${r} · f ${f}`,time:Date.now(),tags:[`Ra ≈ ${fmt(Ra,2)} мкм`,`Rz ≈ ${fmt(Rz,2)}`],data:{r,f,Ra,Rz,Rt}});
  };

  const hardnessTable = [
    {hrc:20,hb:226,hv:238},{hrc:25,hb:253,hv:266},{hrc:30,hb:286,hv:302},{hrc:35,hb:327,hv:345},{hrc:40,hb:375,hv:395},{hrc:45,hb:429,hv:452},{hrc:50,hb:481,hv:513},{hrc:55,hb:543,hv:595},{hrc:60,hb:654,hv:697},{hrc:62,hb:688,hv:746},{hrc:64,hb:722,hv:800},{hrc:66,hb:756,hv:865},{hrc:68,hb:782,hv:940}
  ];
  function interpFrom(scale,val){
    const key=scale.toLowerCase();
    const arr=hardnessTable;
    for(let i=0;i<arr.length-1;i++){
      const a=arr[i],b=arr[i+1], lo=Math.min(a[key],b[key]),hi=Math.max(a[key],b[key]);
      if(val>=lo&&val<=hi){ const t=(val-a[key])/(b[key]-a[key]); return {hrc:a.hrc+t*(b.hrc-a.hrc),hb:a.hb+t*(b.hb-a.hb),hv:a.hv+t*(b.hv-a.hv)}; }
    }
    return null;
  }
  $('#calcHardness').onclick=()=>{
    const scale=$('#hardScale').value,val=n($('#hardValue').value), cards=$$('#hardResults strong');
    const r=Number.isFinite(val)?interpFrom(scale,val):null;
    if(!r){cards.forEach(x=>x.textContent='—');$('#hardRm').textContent='—';toast('Значение вне рабочего диапазона таблицы');return;}
    cards[0].textContent=fmt(r.hrc,1);cards[1].textContent=Math.round(r.hb);cards[2].textContent=Math.round(r.hv);
    const Rm=Math.round(r.hb*3.45); $('#hardRm').textContent=Rm;
    vib(); saveLast({type:'Твёрдость',title:`${scale} ${val}`,time:Date.now(),tags:[`HRC ${fmt(r.hrc,1)}`,`HB ${Math.round(r.hb)}`,`HV ${Math.round(r.hv)}`],data:{...r,Rm}});
  };

  $('#mmValue').addEventListener('input',e=>{ const v=n(e.target.value); $('#inchValue').value=Number.isFinite(v)?fmt(v/25.4,5):''; });
  $('#inchValue').addEventListener('input',e=>{ const v=n(e.target.value); $('#mmValue').value=Number.isFinite(v)?fmt(v*25.4,4):''; });

  $('#calcCutting').onclick=()=>{
    const D=n($('#cutD').value),Vc=n($('#cutVc').value),f=n($('#cutF').value),ap=n($('#cutAp').value), cards=$$('#cutResults strong');
    if(!(D>0)||!(Vc>0)){cards.forEach(x=>x.textContent='—');toast('Введите диаметр и Vc');return;}
    const S=1000*Vc/(Math.PI*D), F=Number.isFinite(f)?S*f:NaN;
    cards[0].textContent=Math.round(S);cards[1].textContent=Number.isFinite(F)?Math.round(F):'—';cards[2].textContent=Number.isFinite(ap)?fmt(ap,2):'—';
    vib(); saveLast({type:'Режим',title:`Ø${D} · Vc ${Vc}`,time:Date.now(),tags:[`S ${Math.round(S)} об/мин`,Number.isFinite(F)?`F ${Math.round(F)} мм/мин`:''],data:{D,Vc,f,ap,S,F}});
  };

  function setTool(tool){
    state.activeTool=tool;
    $$('#toolTabs button').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
    $$('.tool-panel').forEach(p=>p.classList.toggle('active',p.dataset.toolPanel===tool));
    requestAnimationFrame(()=>$('#mainScroller').scrollTop=0);
  }
  $$('#toolTabs button').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));

  function goScreen(name){
    const scroller=$('#mainScroller');
    const scrolls=safeJSON(localStorage.getItem(SCROLLS),{}); scrolls[state.screen]=scroller.scrollTop; localStorage.setItem(SCROLLS,JSON.stringify(scrolls));
    state.screen=name;
    $$('.screen').forEach(s=>s.classList.toggle('active',s.dataset.screen===name));
    $$('#dock button').forEach(b=>b.classList.toggle('active',b.dataset.screenTarget===name));
    requestAnimationFrame(()=>{const ss=safeJSON(localStorage.getItem(SCROLLS),{});scroller.scrollTop=ss[name]||0;});
  }
  $$('#dock button').forEach(b=>b.onclick=()=>goScreen(b.dataset.screenTarget));
  $$('[data-jump]').forEach(b=>b.onclick=()=>{const j=b.dataset.jump;if(['threads','roughness','hardness'].includes(j)){goScreen('tolerances');setTool(j)}else goScreen(j)});

  function clearInputs(root=document){
    $$('input',root).forEach(i=>{ if(i.type==='checkbox') return; i.value=''; });
    $$('select',root).forEach(s=>{ s.selectedIndex=0; });
  }
  function clearTolerance(){
    clearInputs($('[data-screen="tolerances"]'));
    $('#shaftResults').innerHTML='';$('#holeResults').innerHTML='';$('#threadResults').innerHTML='';$('#fitResult').className='fit-result muted';$('#fitResult').textContent='Выберите поля допуска.';
    $$('#roughResults strong').forEach(x=>x.textContent='—');$$('#hardResults strong').forEach(x=>x.textContent='—');$('#hardRm').textContent='—';
    $('#threadPitch').innerHTML='<option value="">Сначала номинал</option>'; setTool('shaft');
    toast('Новый расчёт — поля очищены');
  }
  $('#newToleranceCalc').onclick=clearTolerance;
  $('#newCalcHome').onclick=()=>{clearTolerance();goScreen('tolerances')};
  $('#newCuttingCalc').onclick=()=>{clearInputs($('[data-screen="calc"]'));$$('#cutResults strong').forEach(x=>x.textContent='—');toast('Поля очищены')};
  $('#clearLast').onclick=()=>{state.lastCalculation=null;localStorage.removeItem(STORAGE);renderLast();};

  function projects(){return safeJSON(localStorage.getItem(PROJECTS),[])}
  function writeProjects(arr){localStorage.setItem(PROJECTS,JSON.stringify(arr));renderProjects()}
  function renderProjects(){
    const arr=projects(), list=$('#projectsList');
    if(!arr.length){list.innerHTML='<div class="empty-state glass"><div class="empty-icon">▱</div><b>Проектов пока нет</b><span>Сохраните любой текущий результат.</span></div>';return;}
    list.innerHTML=arr.map((p,i)=>`<div class="project-item glass"><div class="project-item-head"><div><h3>${p.title||'Расчёт'}</h3><small>${new Date(p.savedAt).toLocaleString('ru-RU')}</small></div><span class="tag">${p.type||'проект'}</span></div><div class="project-tags">${(p.tags||[]).filter(Boolean).map(x=>`<span class="tag">${x}</span>`).join('')}</div><div class="project-actions"><button data-load-project="${i}">Показать</button><button data-delete-project="${i}">Удалить</button></div></div>`).join('');
    $$('[data-delete-project]').forEach(b=>b.onclick=()=>{const a=projects();a.splice(Number(b.dataset.deleteProject),1);writeProjects(a);vib()});
    $$('[data-load-project]').forEach(b=>b.onclick=()=>{const p=projects()[Number(b.dataset.loadProject)];state.lastCalculation=p;renderLast();goScreen('home');toast('Проект загружен в карточку')});
  }
  renderProjects();
  $('#saveCurrentProject').onclick=()=>{
    if(!state.lastCalculation){toast('Сначала выполните расчёт');return;}
    const a=projects();a.unshift({...state.lastCalculation,savedAt:Date.now()});writeProjects(a.slice(0,100));toast('Проект сохранён локально');vib();
  };
  $('#exportProjects').onclick=()=>{
    const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),projects:projects()},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='cnc-projects.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  $('#importProjects').onchange=async(e)=>{
    const f=e.target.files?.[0];if(!f)return;try{const data=JSON.parse(await f.text());const arr=Array.isArray(data)?data:data.projects;if(!Array.isArray(arr))throw 0;writeProjects(arr);toast('Проекты импортированы')}catch{toast('Не удалось прочитать JSON')}finally{e.target.value=''}
  };

  function applyTheme(){
    const pref=state.settings.theme;
    const dark=pref==='dark'||(pref==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
    const resolved=dark?'dark':'light';
    document.documentElement.dataset.theme=resolved;
    document.documentElement.style.colorScheme=resolved;
    const themeColor=document.querySelector('meta[name="theme-color"]');
    if(themeColor) themeColor.setAttribute('content', dark ? '#0b1017' : '#f5f8fc');
    document.documentElement.style.backgroundColor=dark ? '#0b1017' : '#f5f8fc';
    document.body.style.backgroundColor=dark ? '#0b1017' : '#f5f8fc';
    $('#themeSelect').value=pref;
  }
  applyTheme();matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(state.settings.theme==='system')applyTheme()});
  $('#themeSelect').onchange=e=>{state.settings.theme=e.target.value;persistSettings();applyTheme()};
  $('#themeBtn').onclick=()=>{const cur=state.settings.theme;state.settings.theme=cur==='light'?'dark':cur==='dark'?'system':'light';persistSettings();applyTheme();toast(`Тема: ${state.settings.theme==='system'?'по системе':state.settings.theme==='dark'?'тёмная':'светлая'}`)};
  $('#hapticToggle').checked=state.settings.haptic;$('#autosaveToggle').checked=state.settings.autosave;
  $('#hapticToggle').onchange=e=>{state.settings.haptic=e.target.checked;persistSettings()};$('#autosaveToggle').onchange=e=>{state.settings.autosave=e.target.checked;persistSettings()};
  function persistSettings(){localStorage.setItem(SETTINGS,JSON.stringify(state.settings))}
  $('#clearAllData').onclick=()=>{if(!confirm('Удалить все локальные расчёты, проекты и настройки?'))return;[STORAGE,PROJECTS,SETTINGS,SCROLLS].forEach(k=>localStorage.removeItem(k));location.reload()};

  let lastY=0, lastDirection='up';
  $('#mainScroller').addEventListener('scroll',e=>{
    const y=e.currentTarget.scrollTop, delta=y-lastY;
    if(Math.abs(delta)>10){lastDirection=delta>0?'down':'up';$('#dock').classList.toggle('hidden',lastDirection==='down'&&y>90);lastY=y;}
  },{passive:true});

  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.deferredInstall=e;$('#installBtn').style.display='block'});
  $('#installBtn').onclick=async()=>{
    if(state.deferredInstall){state.deferredInstall.prompt();await state.deferredInstall.userChoice;state.deferredInstall=null;}
    else toast('iPhone: Safari → Поделиться → На экран «Домой»');
  };



  // Dock diagnostics: measure the real standalone viewport and calibrate only dock bottom.
  (()=>{
    const panel=$('#dockDebugPanel'), open=$('#dockDebugOpen'), close=$('#dockDebugClose');
    const slider=$('#dockDebugOffset'), value=$('#dockDebugOffsetValue'), readout=$('#dockDebugReadout');
    const line=$('#dockDebugViewportLine'), dock=$('#dock');
    if(!panel||!open||!dock) return;
    const KEY='cncDockDebugBottom';
    const probe=document.createElement('div');
    probe.style.cssText='position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px)';
    document.body.appendChild(probe);
    const px=v=>Number.parseFloat(v)||0;
    function safeInsets(){const s=getComputedStyle(probe);return {top:px(s.paddingTop),right:px(s.paddingRight),bottom:px(s.paddingBottom),left:px(s.paddingLeft)}}
    function currentOffset(){return Number.parseFloat(getComputedStyle(dock).bottom)||0}
    function applyOffset(v){v=Math.max(-60,Math.min(20,Number(v)));dock.style.setProperty('bottom',`${v}px`,'important');slider.value=String(v);value.textContent=String(v);localStorage.setItem(KEY,String(v));requestAnimationFrame(update)}
    function report(){
      const vv=window.visualViewport, r=dock.getBoundingClientRect(), safe=safeInsets();
      const visualBottom=vv ? vv.offsetTop+vv.height : window.innerHeight;
      const displayMode=matchMedia('(display-mode: standalone)').matches ? 'standalone' : (navigator.standalone ? 'ios-standalone' : 'browser');
      return [
        `mode: ${displayMode}`,
        `DPR: ${window.devicePixelRatio}`,
        `screen: ${screen.width}×${screen.height}`,
        `avail: ${screen.availWidth}×${screen.availHeight}`,
        `inner: ${window.innerWidth}×${window.innerHeight}`,
        `client: ${document.documentElement.clientWidth}×${document.documentElement.clientHeight}`,
        `visualViewport: ${vv?`${vv.width.toFixed(1)}×${vv.height.toFixed(1)} offsetTop=${vv.offsetTop.toFixed(1)} scale=${vv.scale}`:'n/a'}`,
        `safe: top=${safe.top} right=${safe.right} bottom=${safe.bottom} left=${safe.left}`,
        `dock rect: top=${r.top.toFixed(1)} bottom=${r.bottom.toFixed(1)} h=${r.height.toFixed(1)}`,
        `dock css bottom: ${currentOffset().toFixed(1)}px`,
        `gap to inner bottom: ${(window.innerHeight-r.bottom).toFixed(1)}px`,
        `gap to visual bottom: ${(visualBottom-r.bottom).toFixed(1)}px`,
        `scrollY(main): ${$('#mainScroller')?.scrollTop||0}`
      ].join('\n');
    }
    function update(){if(!panel.hidden) readout.textContent=report()}
    function show(){panel.hidden=false;line.hidden=false;const saved=localStorage.getItem(KEY);applyOffset(saved===null?2:Number(saved));update();setTimeout(update,100)}
    function hide(){panel.hidden=true;line.hidden=true}
    open.addEventListener('click',show);close.addEventListener('click',hide);
    slider.addEventListener('input',e=>applyOffset(e.target.value));
    $('#dockDebugReset')?.addEventListener('click',()=>applyOffset(2));
    $('#dockDebugCopy')?.addEventListener('click',async()=>{const t=report()+`\ncalibrated bottom: ${slider.value}px`;try{await navigator.clipboard.writeText(t);toast('Отчёт скопирован')}catch{window.prompt('Скопируйте отчёт:',t)}});
    window.addEventListener('resize',update,{passive:true});
    visualViewport?.addEventListener('resize',update,{passive:true});visualViewport?.addEventListener('scroll',update,{passive:true});
    const saved=localStorage.getItem(KEY);if(saved!==null) applyOffset(Number(saved));
  })();

  if('serviceWorker' in navigator){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));}
})();
