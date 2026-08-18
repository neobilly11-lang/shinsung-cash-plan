(function(){
  'use strict';
  var root=window,doc=document;
  function runtime(){return root.__mesRuntime||{}}
  function state(){try{return runtime().getState?runtime().getState():root.state||{}}catch(_){return root.state||{}}}
  function list(v){return Array.isArray(v)?v:[]}
  function text(v){return String(v==null?'':v).trim()}
  function number(v){var n=Number(String(v==null?'':v).replace(/,/g,''));return Number.isFinite(n)?n:0}
  function esc(v){return text(v).replace(/[&<>"']/g,function(ch){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]})}
  function fmt(v,d){return number(v).toLocaleString('ko-KR',{maximumFractionDigits:d==null?1:d})}
  function now(){return new Date().toISOString()}
  function uid(){return Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9)}
  function userName(){try{return text(runtime().currentUserName&&runtime().currentUserName())||'사용자'}catch(_){return'사용자'}}
  function userKey(){try{var u=runtime().getAuthUser&&runtime().getAuthUser();return text(u&&u.email)||userName()}catch(_){return userName()}}
  function commit(label,keys,mutator){var fn=runtime().getCommit&&runtime().getCommit();return typeof fn==='function'?fn(label,keys,mutator):Promise.resolve(false)}
  function toast(message,error){var fn=runtime().getToast&&runtime().getToast();if(typeof fn==='function')fn(message,!!error)}

  var LANG_KEY='shinsung-mes-language-v1';
  var language='ko';
  try{language=localStorage.getItem(LANG_KEY+':'+userKey())||localStorage.getItem(LANG_KEY)||'ko'}catch(_){ }
  if(language!=='en')language='ko';
  var translations={
    '통합 현황판':'Integrated Dashboard','입고·출하 일정':'Inbound / Shipping Schedule','구매계획':'Purchase Plan','판매계획':'Sales Plan',
    '입고요청현황':'Inbound Requests','입고현황':'Inbound Status','생산현황':'Production Status','세틀현황':'Settlement Status',
    '재고현황':'Inventory Status','재고상세':'Inventory Details','출하계획':'Shipping Plan','출고현황':'Shipment History',
    '일일 작업일지':'Daily Work Log','샘플관리':'Sample Management','분석치 관리':'Analysis Management','임원용 현황판':'Executive Dashboard',
    '현장관리 열기':'Open Field App','조회':'Search','초기화':'Reset','엑셀':'Excel','상세보기':'Details','상세 수정':'Edit Details',
    '목록으로 돌아가기':'Back to List','닫기':'Close','취소':'Cancel','저장':'Save','수정':'Edit','삭제':'Delete','완료':'Complete',
    '지금 동기화':'Sync Now','오늘 작업일지':'Today Work Log','생산관리':'Production Management','작업분배':'Work Assignment',
    '현장관리자 모드':'Field Manager Mode','작업자별 생산능력':'Capacity by Worker','저장된 작업분배':'Saved Assignments',
    '합류':'Include','배제':'Exclude','작업분배 저장':'Save Assignment','예상 작업일수':'Estimated Work Days','예상 작업비':'Estimated Labor Cost',
    '전체':'All','검색':'Search','공용서버에 수정 저장':'Save to Shared Server','PDF 다운로드':'Download PDF','PDF 카카오톡 전송':'Share PDF',
    '국내 세틀 양식':'Domestic Settlement','해외 세틀 양식':'Overseas Settlement','국내 선세틀 양식':'Domestic Pre-Settlement',
    '해외 Pre-Settlement':'Overseas Pre-Settlement','선세틀 수정':'Edit Pre-Settlement','양식 미리보기':'Preview Form',
    '이번 달 매입총액':'Monthly Purchases','이번 달 매출액':'Monthly Sales','실현이익':'Realized Profit','실현이익률':'Profit Margin',
    '현재재고':'Current Inventory','입항예정':'Expected Arrival','입고완료':'Inbound Complete','작업대기':'Work Queue','출하완료':'Shipped',
    '누락비용 즉시 입력':'Enter Missing Costs','환율 변경 이력 · 예상 환차손익':'FX History & Estimated Gain/Loss',
    '월별 KPI 대시보드':'Monthly KPI Dashboard','예상환차손 · 환율 일괄변경':'FX Estimate / Bulk Rate Change','임원 2명 지정':'Assign Two Executives'
  };
  var reverse={};Object.keys(translations).forEach(function(k){reverse[translations[k]]=k});
  function translateTextNode(node){
    var raw=node.nodeValue,trim=raw.trim(),map=language==='en'?translations:reverse;
    if(!trim||!map[trim])return;
    node.nodeValue=raw.replace(trim,map[trim]);
  }
  function translateDOM(){
    doc.documentElement.lang=language==='en'?'en':'ko';
    var walker=doc.createTreeWalker(doc.body||doc.documentElement,NodeFilter.SHOW_TEXT,{acceptNode:function(n){var p=n.parentElement;if(!p||/^(SCRIPT|STYLE|TEXTAREA|INPUT|OPTION)$/i.test(p.tagName)||p.closest('#mesLanguageToggle'))return NodeFilter.FILTER_REJECT;return NodeFilter.FILTER_ACCEPT}}),nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);nodes.forEach(translateTextNode);
    var toggle=doc.getElementById('mesLanguageToggle');if(toggle)toggle.textContent=language==='en'?'한국어':'English';
  }
  async function saveLanguage(){
    try{localStorage.setItem(LANG_KEY,language);localStorage.setItem(LANG_KEY+':'+userKey(),language)}catch(_){ }
    await commit('MES 표시언어 저장',['systemSettings'],function(s){s.systemSettings=s.systemSettings&&typeof s.systemSettings==='object'&&!Array.isArray(s.systemSettings)?s.systemSettings:{};s.systemSettings.mesLanguageByUser=s.systemSettings.mesLanguageByUser||{};s.systemSettings.mesLanguageByUser[userKey()]=language});
  }
  root.toggleMesLanguage=async function(){language=language==='ko'?'en':'ko';await saveLanguage();var render=runtime().getRender&&runtime().getRender();if(typeof render==='function')render();setTimeout(translateDOM,0)};
  function injectLanguageButton(){
    if(doc.getElementById('mesLanguageToggle'))return;
    var target=doc.querySelector('.top-actions,.topbar .actions,.topbar')||doc.body;
    var button=doc.createElement('button');button.id='mesLanguageToggle';button.className='btn mes-language-toggle';button.type='button';button.onclick=root.toggleMesLanguage;button.textContent=language==='en'?'한국어':'English';target.insertBefore(button,target.firstChild||null);
  }
  function hydrateLanguage(){var prefs=state().systemSettings&&state().systemSettings.mesLanguageByUser;if(prefs&&prefs[userKey()]&&prefs[userKey()]!==language){language=prefs[userKey()]==='en'?'en':'ko';try{localStorage.setItem(LANG_KEY+':'+userKey(),language)}catch(_){ }}injectLanguageButton();translateDOM()}

  var taskDefs=[
    {id:'INBOUND',ko:'입고요청',en:'Inbound',defaults:1200},
    {id:'INSPECTION',ko:'검수',en:'Inspection',defaults:500},
    {id:'GENERAL',ko:'일반작업',en:'General Work',defaults:350},
    {id:'SHOT',ko:'쇼트',en:'Shot Blasting',defaults:250},
    {id:'CUTTING',ko:'절단',en:'Cutting',defaults:200},
    {id:'ACID',ko:'산처리',en:'Acid Treatment',defaults:180},
    {id:'RESELECT',ko:'재선별',en:'Re-sorting',defaults:300},
    {id:'SHIPPING',ko:'출하요청',en:'Shipping',defaults:1000},
    {id:'MOVE',ko:'재고이동',en:'Stock Move',defaults:1200}
  ];
  function taskLabel(id){var d=taskDefs.find(function(x){return x.id===id});return d?(language==='en'?d.en:d.ko):id}
  function actor(row){var keys=['operatorName','workerName','completedByName','inspectorName','inspector','receiptWorkerName','shippingWorkerName','createdByName','updatedByName','actorName','userName','assigneeName'];for(var i=0;i<keys.length;i++){if(text(row&&row[keys[i]]))return text(row[keys[i]])}return''}
  function rowWeight(row){var keys=['weight','nw','confirmedWeight','planWeight','shippedWeight','inputWeight','moveWeight','assignedWeight','actualWeight'];for(var i=0;i<keys.length;i++){var n=number(row&&row[keys[i]]);if(n>0)return n}return 0}
  function parseHours(row){
    var direct=number(row&&row.hours)||number(row&&row.workHours)||number(row&&row.durationHours);if(direct>0)return direct;
    var minute=number(row&&row.minutes)||number(row&&row.durationMinutes)||number(row&&row.workMinutes);if(minute>0)return minute/60;
    var start=row&&(row.startedAt||row.startAt||row.workStartedAt||row.createdAt),end=row&&(row.completedAt||row.finishedAt||row.endAt||row.updatedAt);
    if(start&&end){var ms=new Date(end)-new Date(start);if(Number.isFinite(ms)&&ms>0)return Math.max(.25,ms/36e5)}
    return 1;
  }
  function canonicalTask(row,fallback){var t=(text(row&&row.workType)+' '+text(row&&row.type)+' '+text(row&&row.category)+' '+text(row&&row.action)).toUpperCase();if(/SHOT|쇼트/.test(t))return'SHOT';if(/CUT|절단/.test(t))return'CUTTING';if(/ACID|산처리|산 작업/.test(t))return'ACID';if(/RECHECK|RESELECT|재검수|재선별/.test(t))return'RESELECT';return fallback||'GENERAL'}
  function finished(row){var s=text(row&&row.status).toUpperCase();return !s||/COMPLETE|COMPLETED|DONE|FINAL|SHIPPED|RECEIVED|CLOSED|FINISH/.test(s)}
  function events(){
    var s=state(),out=[];
    function add(rows,type){list(rows).forEach(function(r){var name=actor(r);if(!name||!finished(r))return;var w=rowWeight(r);if(w<=0)return;out.push({user:name,task:type==='WORK'?canonicalTask(r,'GENERAL'):type,weight:w,hours:parseHours(r),at:r.completedAt||r.updatedAt||r.createdAt})})}
    add(s.receiptWorks,'INBOUND');add(s.domesticReceipts,'INBOUND');add(s.splits,'INSPECTION');add(s.workWaits,'WORK');add(s.shippingWorks,'SHIPPING');add(s.shipments,'SHIPPING');add(s.movements,'MOVE');add(s.waitingMoves,'MOVE');
    return out;
  }
  function registeredUsers(){
    var s=state(),names=new Set([userName()]);
    events().forEach(function(e){if(e.user)names.add(e.user)});
    [s.users,s.workers,s.registeredUsers,s.systemSettings&&s.systemSettings.users,s.systemSettings&&s.systemSettings.workers].forEach(function(rows){list(rows).forEach(function(u){var name=text(u.name||u.displayName||u.userName||u.email);if(name)names.add(name)})});
    return Array.from(names).filter(Boolean).sort(function(a,b){return a.localeCompare(b,'ko')});
  }
  function capacities(){
    var ev=events(),users=registeredUsers(),global={};
    taskDefs.forEach(function(t){var rows=ev.filter(function(e){return e.task===t.id}),w=rows.reduce(function(s,x){return s+x.weight},0),h=rows.reduce(function(s,x){return s+x.hours},0);global[t.id]=h>0?w/h:t.defaults});
    return users.map(function(name){var by={};taskDefs.forEach(function(t){var rows=ev.filter(function(e){return e.user===name&&e.task===t.id}),w=rows.reduce(function(s,x){return s+x.weight},0),h=rows.reduce(function(s,x){return s+x.hours},0);by[t.id]={rate:h>0?w/h:global[t.id],actual:h>0,samples:rows.length,totalWeight:w,totalHours:h}});return{name:name,by:by}})
  }
  function assignments(){return list(state().productionAssignments).filter(function(x){return text(x.status)!=='CANCELLED'})}
  function modal(title,html,wide){var m=doc.getElementById('modal'),t=doc.getElementById('modalTitle'),b=doc.getElementById('modalBody');if(!m||!t||!b)return;t.textContent=title;b.innerHTML=html;var card=m.querySelector('.modal-card');if(card)card.classList.toggle('wide-modal',!!wide);m.classList.add('on')}
  function capacityTable(){
    var caps=capacities();if(!caps.length)return'<p class="empty">등록된 작업자가 없습니다.</p>';
    return'<div class="table-wrap manager-capacity-table"><table><thead><tr><th>작업자 ID</th>'+taskDefs.map(function(t){return'<th>'+esc(taskLabel(t.id))+'<small>kg/h</small></th>'}).join('')+'</tr></thead><tbody>'+caps.map(function(u){return'<tr><th>'+esc(u.name)+'</th>'+taskDefs.map(function(t){var c=u.by[t.id];return'<td><b>'+fmt(c.rate,0)+'</b><small>'+(c.actual?(c.samples+'건 · '+fmt(c.totalHours,1)+'h'):(language==='en'?'Baseline':'기준값'))+'</small></td>'}).join('')+'</tr>'}).join('')+'</tbody></table></div>'
  }
  function assignmentCards(){var rows=assignments().slice().sort(function(a,b){return text(b.createdAt).localeCompare(text(a.createdAt))});if(!rows.length)return'<p class="empty">저장된 작업분배가 없습니다.</p>';return'<div class="manager-assignment-list">'+rows.map(function(a){return'<article><div><b>'+esc(taskLabel(a.taskType))+' · '+fmt(a.targetWeight)+' kg</b><small>'+esc(list(a.userNames).join(' + '))+' · '+fmt(a.capacityPerHour,0)+' kg/h</small><small>'+fmt(a.estimatedDays,2)+'일 · '+Math.round(number(a.estimatedCost)).toLocaleString('ko-KR')+'원 · 달성예상 '+fmt(a.achievementRate,0)+'%</small></div><div class="actions"><button class="btn" onclick="editProductionAssignment(\''+esc(a.id)+'\')">수정</button><button class="btn danger" onclick="deleteProductionAssignment(\''+esc(a.id)+'\')">삭제</button></div></article>'}).join('')+'</div>'}
  root.openProductionManager=function(){modal(language==='en'?'Field Manager Mode · Production Management':'현장관리자 모드 · 생산관리','<div class="manager-banner"><b>'+(language==='en'?'Measured capacity':'실측 생산능력')+'</b><span>'+(language==='en'?'Scores are calculated from completed kilograms per work hour.':'완료한 중량 ÷ 실제 작업시간으로 작업별 kg/시간 점수를 계산합니다.')+'</span></div><div class="manager-head"><h3>'+(language==='en'?'Capacity by Worker':'작업자별 생산능력')+'</h3><button class="btn primary" onclick="openProductionAssignment()">'+(language==='en'?'Work Assignment':'작업분배')+'</button></div>'+capacityTable()+'<div class="manager-head"><h3>'+(language==='en'?'Saved Assignments':'저장된 작업분배')+'</h3></div>'+assignmentCards(),true)};
  function assignmentForm(saved){
    saved=saved||{};var selected=new Set(list(saved.userNames)),users=registeredUsers();
    return'<form id="productionAssignmentForm" onsubmit="saveProductionAssignment(event,this,\''+esc(saved.id||'')+'\')"><div class="form-grid"><label>작업 종류<select name="taskType" onchange="updateProductionAssignmentEstimate()">'+taskDefs.map(function(t){return'<option value="'+t.id+'" '+(saved.taskType===t.id?'selected':'')+'>'+esc(taskLabel(t.id))+'</option>'}).join('')+'</select></label><label>배분 중량(kg)<input name="targetWeight" type="number" min="0.01" step="0.01" required value="'+esc(saved.targetWeight||'')+'" oninput="updateProductionAssignmentEstimate()"></label><label>완료 목표일<input name="dueDate" type="date" value="'+esc(saved.dueDate||'')+'" onchange="updateProductionAssignmentEstimate()"></label><label>시간당 인건비(1명)<input name="hourlyCost" type="number" min="0" step="100" value="'+esc(saved.hourlyCost||20000)+'" oninput="updateProductionAssignmentEstimate()"></label></div><h3>작업자 2명까지 합류</h3><div class="manager-user-picker">'+users.map(function(name){var on=selected.has(name);return'<button type="button" class="manager-user '+(on?'on':'')+'" data-user="'+esc(name)+'" onclick="toggleProductionAssignee(this)"><span>'+esc(name)+'</span><b>'+(on?'배제':'합류')+'</b></button>'}).join('')+'</div><div id="productionAssignmentEstimate" class="manager-estimate"></div><label class="manager-note">작업지시 메모<textarea name="memo">'+esc(saved.memo||'')+'</textarea></label><div class="actions"><button class="btn primary">작업분배 저장</button><button type="button" class="btn" onclick="openProductionManager()">취소</button></div></form>'
  }
  root.openProductionAssignment=function(id){var saved=id?assignments().find(function(x){return x.id===id}):null;modal(language==='en'?'Work Assignment':'작업분배',assignmentForm(saved),true);setTimeout(root.updateProductionAssignmentEstimate,0)};
  root.editProductionAssignment=root.openProductionAssignment;
  root.toggleProductionAssignee=function(button){var active=Array.from(doc.querySelectorAll('.manager-user.on'));if(!button.classList.contains('on')&&active.length>=2){toast('작업자는 두 명까지만 합류할 수 있습니다.',true);return}button.classList.toggle('on');button.querySelector('b').textContent=button.classList.contains('on')?'배제':'합류';root.updateProductionAssignmentEstimate()};
  function estimateFromForm(){var form=doc.getElementById('productionAssignmentForm');if(!form)return null;function field(name){return form.elements&&form.elements.namedItem?form.elements.namedItem(name):form.querySelector('[name="'+name+'"]')}var task=field('taskType').value,target=number(field('targetWeight').value),names=Array.from(form.querySelectorAll('.manager-user.on')).map(function(b){return b.dataset.user}),caps=capacities(),rate=names.reduce(function(sum,name){var u=caps.find(function(x){return x.name===name});return sum+(u&&u.by[task]?number(u.by[task].rate):0)},0),hours=rate>0?target/rate:0,days=hours/8,cost=hours*names.length*number(field('hourlyCost').value),due=field('dueDate').value,dueDays=due?Math.max(1,Math.ceil((new Date(due+'T23:59:59')-new Date())/864e5)):0,achievement=dueDays>0&&days>0?Math.min(100,dueDays/days*100):(rate>0?100:0);return{taskType:task,targetWeight:target,userNames:names,capacityPerHour:rate,estimatedHours:hours,estimatedDays:days,estimatedCost:cost,dueDate:due,achievementRate:achievement,memo:text(field('memo').value),hourlyCost:number(field('hourlyCost').value)}}
  root.updateProductionAssignmentEstimate=function(){var e=estimateFromForm(),box=doc.getElementById('productionAssignmentEstimate');if(!e||!box)return;box.innerHTML='<div><small>합산 생산능력</small><b>'+fmt(e.capacityPerHour,0)+' kg/h</b></div><div><small>예상 작업시간</small><b>'+fmt(e.estimatedHours,2)+'시간</b></div><div><small>예상 작업일수</small><b>'+fmt(e.estimatedDays,2)+'일</b></div><div><small>예상 작업비</small><b>'+Math.round(e.estimatedCost).toLocaleString('ko-KR')+'원</b></div><div><small>달성예상율</small><b>'+fmt(e.achievementRate,0)+'%</b></div>'};
  root.saveProductionAssignment=async function(event,form,id){event.preventDefault();var e=estimateFromForm();if(!e||e.targetWeight<=0)return toast('배분 중량을 입력하세요.',true);if(!e.userNames.length)return toast('작업자를 한 명 이상 합류시키세요.',true);var ok=await commit('생산 작업분배 저장',['productionAssignments'],function(s){s.productionAssignments=list(s.productionAssignments);var old=s.productionAssignments.find(function(x){return x.id===id}),record=Object.assign(old||{id:uid(),createdAt:now(),status:'WAITING'},e,{updatedAt:now(),updatedByName:userName()});if(!old)s.productionAssignments.push(record)});if(ok){toast('작업분배를 공용 서버에 저장했습니다.');root.openProductionManager()}};
  root.deleteProductionAssignment=async function(id){if(!confirm('이 작업분배를 삭제하시겠습니까?'))return;var ok=await commit('생산 작업분배 삭제',['productionAssignments'],function(s){var x=list(s.productionAssignments).find(function(r){return r.id===id});if(x){x.status='CANCELLED';x.cancelledAt=now();x.cancelledByName=userName()}});if(ok)root.openProductionManager()};
  function decorateProduction(){if(runtime().getView&&runtime().getView()!=='production')return;var actions=doc.querySelector('#content .dashboard-head .actions');if(actions&&!actions.querySelector('.production-manager-button')){var b=doc.createElement('button');b.className='btn primary production-manager-button';b.textContent=language==='en'?'Production Management':'생산관리';b.onclick=root.openProductionManager;actions.insertBefore(b,actions.firstChild||null)}}
  function decorate(){hydrateLanguage();decorateProduction()}
  function injectStyles(){if(doc.getElementById('mesManagerLanguageV1Style'))return;var style=doc.createElement('style');style.id='mesManagerLanguageV1Style';style.textContent='\
.mes-language-toggle{white-space:nowrap;background:#fff;color:#0b5660;border:1px solid #9fd2d3}\
.manager-banner{display:flex;gap:12px;align-items:center;padding:18px 20px;border-radius:18px;background:linear-gradient(120deg,#0c355a,#07989c);color:#fff;margin-bottom:18px}.manager-banner b{font-size:1.2rem}.manager-banner span{opacity:.9}\
.manager-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:22px 0 10px}.manager-head h3{margin:0}\
.manager-capacity-table th,.manager-capacity-table td{text-align:center;min-width:100px}.manager-capacity-table th:first-child{position:sticky;left:0;z-index:2;background:#eef5f8}.manager-capacity-table small,.manager-assignment-list small{display:block;margin-top:4px;color:#607080;font-weight:500}\
.manager-user-picker{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin:10px 0 18px}.manager-user{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border:2px solid #dfe8eb;border-radius:14px;background:#fff;font:inherit}.manager-user.on{border-color:#07989c;background:#e6f8f5;color:#075a62}.manager-user b{color:#07848a}\
.manager-estimate{display:grid;grid-template-columns:repeat(5,minmax(120px,1fr));gap:10px;padding:14px;background:#f1f6f8;border-radius:16px}.manager-estimate>div{padding:12px;background:#fff;border-radius:12px}.manager-estimate small,.manager-estimate b{display:block}.manager-estimate b{margin-top:6px;font-size:1.15rem;color:#075a62}.manager-note{display:block;margin:16px 0}.manager-note textarea{width:100%;min-height:90px}\
.manager-assignment-list{display:grid;gap:10px}.manager-assignment-list article{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:14px 16px;border:1px solid #dce6e9;border-radius:14px;background:#fff}.manager-assignment-list article>div:first-child{min-width:0}.manager-assignment-list .actions{margin:0;flex-wrap:nowrap}\
@media(max-width:760px){.manager-banner{align-items:flex-start;flex-direction:column}.manager-head{align-items:stretch}.manager-capacity-table{max-height:55vh}.manager-estimate{grid-template-columns:repeat(2,minmax(0,1fr))}.manager-assignment-list article{align-items:stretch;flex-direction:column}.mes-language-toggle{min-height:44px}}';doc.head.appendChild(style)}
  var observer=new MutationObserver(function(){clearTimeout(observer._timer);observer._timer=setTimeout(decorate,20)});observer.observe(doc.documentElement,{childList:true,subtree:true});
  injectStyles();if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',decorate);else decorate();
  root.__mesManagerLanguageV1={get language(){return language},capacities:capacities,events:events,version:'20260818-1'};
})();

