(function(){
  'use strict';
  if(window.__mesScheduleInboundPersistenceV1)return;
  window.__mesScheduleInboundPersistenceV1=true;

  var monthCursor=new Date();
  monthCursor=new Date(monthCursor.getFullYear(),monthCursor.getMonth(),1);
  var typeFilter={purchase:true,arrival:true,sales:true,departurePlan:true,departureConfirmed:true};
  var query='';

  function list(value){return Array.isArray(value)?value:[];}
  function text(value){return String(value==null?'':value).trim();}
  function number(value){var n=Number(String(value==null?'':value).replace(/,/g,''));return Number.isFinite(n)?n:0;}
  function dateKey(value){
    var match=text(value).match(/(20\d{2})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/);
    if(match)return match[1]+'-'+String(number(match[2])).padStart(2,'0')+'-'+String(number(match[3])).padStart(2,'0');
    return text(value).slice(0,10);
  }
  function key(value){return text(value).toUpperCase().replace(/[\s._-]+/g,'');}
  function unique(values){return Array.from(new Set(values.map(text).filter(Boolean)));}
  function itemGrade(item){return text(item.customerGrade||item.sourceGrade||item.grade||[item.productType,item.mainGrade,item.subGrade,item.detailGrade].filter(Boolean).join(' · '));}
  function fullGrade(items,fallback){return unique(list(items).map(itemGrade).concat([fallback])).join(' / ');}
  function short(value){value=text(value);return value.length>15?value.slice(0,15)+' 외':value;}
  function hasStatus(row,statuses){return statuses.includes(text(row&&row.status).toUpperCase());}
  function requestForPo(poNo){
    var rows=window.mesInboundRequestRows?window.mesInboundRequestRows():list(state.purchaseRequests);
    return rows.find(function(row){return key(row.poNo)===key(poNo)&&!hasStatus(row,['CANCELLED','CANCELED','DELETED']);})||null;
  }
  function purchaseEvents(){
    var seen=new Set(),events=[];
    list(poRows()).forEach(function(po){
      var request=requestForPo(po.poNo),when=dateKey(request&&request.requestDate),items=request&&request.items||po.rows;
      if(!when)return;
      seen.add(key(po.poNo));
      events.push({type:'purchase',date:when,time:text(request&&request.requestTime),number:po.poNo,partner:text(request&&request.company||po.company),grade:fullGrade(items,po.grade),weight:number(request&&request.totalNw||po.nw),id:po.poNo});
    });
    list(state.purchaseRequests).forEach(function(request){
      if(!request||seen.has(key(request.poNo))||hasStatus(request,['CANCELLED','CANCELED','DELETED']))return;
      var when=dateKey(request.requestDate);if(!when)return;
      events.push({type:'purchase',date:when,time:text(request.requestTime),number:request.poNo,partner:text(request.company),grade:fullGrade(request.items,request.gradeSummary),weight:list(request.items).reduce(function(sum,item){return sum+number(item.nw||item.netWeight||item.weight);},0),id:request.poNo});
    });
    return events;
  }
  function arrivalEvents(){
    var seen=new Set(),events=[];
    list(poRows()).forEach(function(po){
      var request=requestForPo(po.poNo),first=list(po.rows)[0]||{},when=dateKey(request&&request.arrivalPlanDate||first.arrivalPlanDate||first.expectedArrivalDate||po.expected),items=request&&request.items||po.rows;
      if(!when)return;
      seen.add(key(po.poNo));
      events.push({type:'arrival',date:when,time:'',number:po.poNo,partner:text(request&&request.company||po.company),grade:fullGrade(items,po.grade),weight:number(request&&request.totalNw||po.nw),id:po.poNo});
    });
    list(state.purchaseRequests).forEach(function(request){
      if(!request||seen.has(key(request.poNo))||hasStatus(request,['CANCELLED','CANCELED','DELETED']))return;
      var when=dateKey(request.arrivalPlanDate||request.expectedArrivalDate);if(!when)return;
      events.push({type:'arrival',date:when,time:'',number:request.poNo,partner:text(request.company),grade:fullGrade(request.items,request.gradeSummary),weight:list(request.items).reduce(function(sum,item){return sum+number(item.nw||item.netWeight||item.weight);},0),id:request.poNo});
    });
    return events;
  }
  function salesEvents(){
    var rows=[];try{rows=list(salesRows());}catch(_){rows=[];}
    return rows.map(function(order){
      var items=list(order.items),request=items.find(function(item){return item.shippingRequestStatus==='REQUESTED'||item.shippingRequestedAt||item.shippingRequestDate;})||items[0]||{};
      var when=dateKey(request.shippingRequestDate||request.requestDate);if(!when)return null;
      return{type:'sales',date:when,time:text(request.shippingRequestTime||request.requestTime),number:order.soNo,partner:text(order.customer),grade:fullGrade(items,order.grade),weight:number(order.weight),id:order.soNo};
    }).filter(Boolean);
  }
  function departurePlanEvents(){
    var rows=[];try{rows=list(salesRows());}catch(_){rows=[];}
    return rows.map(function(order){
      var items=list(order.items),source=items.find(function(item){return item.departurePlanDate||item.shippingPlanDate||item.shipDate;})||items[0]||{};
      var when=dateKey(source.departurePlanDate||source.shippingPlanDate||source.shipDate||order.departurePlanDate||order.shippingPlanDate||order.shipDate);if(!when)return null;
      return{type:'departurePlan',date:when,time:text(source.departurePlanTime||source.shippingPlanTime),number:order.soNo,partner:text(order.customer),grade:fullGrade(items,order.grade),weight:number(order.weight),id:order.soNo};
    }).filter(Boolean);
  }
  function departureConfirmedEvents(){
    var rows=[];try{rows=list(schemas.shipping.rows());}catch(_){rows=[];}
    var seen=new Set();
    return rows.map(function(row){
      var when=dateKey(row.etdConfirmedDate);if(!when)return null;
      var identity=[row.shipmentId||row.id,row.soNo,when].join('|');if(seen.has(identity))return null;seen.add(identity);
      return{type:'departureConfirmed',date:when,time:'',number:row.soNo,partner:text(row.customer),grade:fullGrade(row.items,row.grade),weight:number(row.shippedWeight||row.weight),id:row.id};
    }).filter(Boolean);
  }
  function allEvents(){
    var q=query.toLowerCase();
    return purchaseEvents().concat(arrivalEvents(),salesEvents(),departurePlanEvents(),departureConfirmedEvents()).filter(function(event){
      return typeFilter[event.type]&&(!q||[event.number,event.partner,event.grade,event.date].join(' ').toLowerCase().includes(q));
    });
  }
  function escapeHtml(value){return typeof esc==='function'?esc(value):text(value).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function monthTitle(cursor){return cursor.getFullYear()+'. '+String(cursor.getMonth()+1).padStart(2,'0');}
  function localKey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function openEvent(event){
    var view=event.type==='departureConfirmed'?'shipping':(['sales','departurePlan'].includes(event.type)?'sales':'purchase');
    return "openMesDetail('"+view+"',decodeURIComponent('"+encodeURIComponent(event.id)+"'))";
  }
  function eventHtml(event){
    var marker=event.time||(event.type==='purchase'?'입고요청':event.type==='arrival'?'입항예정':event.type==='sales'?'출하요청':event.type==='departurePlan'?'출항예정':event.type==='departureConfirmed'?'출항확정':'');
    var label=(marker?marker+' ':'')+event.partner+' · '+event.grade+' · '+event.number;
    return"<button class='schedule-event "+event.type+"' title='"+escapeHtml(label)+"' onclick=\""+openEvent(event)+"\"><span></span><b>"+escapeHtml(marker)+"</b> "+escapeHtml(short(event.partner))+' · '+escapeHtml(short(event.grade))+"<small>"+escapeHtml(event.number)+"</small></button>";
  }
  function miniCalendar(){
    var year=monthCursor.getFullYear(),month=monthCursor.getMonth(),first=new Date(year,month,1),start=new Date(year,month,1-first.getDay()),today=localKey(new Date());
    var html="<div class='mini-week'><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div><div class='mini-days'>";
    for(var i=0;i<42;i++){var d=new Date(start);d.setDate(start.getDate()+i);html+="<span class='"+(d.getMonth()===month?'':'muted')+(localKey(d)===today?' today':'')+"'>"+d.getDate()+"</span>";}
    return html+'</div>';
  }
  function calendarGrid(events){
    var year=monthCursor.getFullYear(),month=monthCursor.getMonth(),first=new Date(year,month,1),start=new Date(year,month,1-first.getDay()),today=localKey(new Date());
    var byDate=new Map();events.forEach(function(event){if(!byDate.has(event.date))byDate.set(event.date,[]);byDate.get(event.date).push(event);});
    var html="<div class='calendar-weekdays'><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div><div class='calendar-days'>";
    for(var i=0;i<42;i++){
      var d=new Date(start);d.setDate(start.getDate()+i);var dayKey=localKey(d),items=byDate.get(dayKey)||[];
      html+="<div class='calendar-day "+(d.getMonth()===month?'':'outside')+(dayKey===today?' today':'')+"'><div class='day-number'>"+d.getDate()+"</div><div class='day-events'>"+items.map(eventHtml).join('')+'</div></div>';
    }
    return html+'</div>';
  }
  function mobileList(events){
    var month=String(monthCursor.getMonth()+1).padStart(2,'0'),prefix=monthCursor.getFullYear()+'-'+month;
    var rows=events.filter(function(event){return event.date.indexOf(prefix)===0;}).sort(function(a,b){return(a.date+a.time).localeCompare(b.date+b.time);});
    if(!rows.length)return"<div class='schedule-empty'>이 달의 입고·출하 일정이 없습니다.</div>";
    var current='',html='';rows.forEach(function(event){if(current!==event.date){current=event.date;html+="<h3>"+escapeHtml(current)+"</h3>";}html+=eventHtml(event);});return html;
  }
  function renderSchedule(){
    if(typeof window.mesRepairInboundRequestPackages==='function')window.mesRepairInboundRequestPackages();
    var events=allEvents();
    document.querySelectorAll('.nav-btn').forEach(function(button){button.classList.toggle('on',button.dataset.id==='schedule');});
    $('pageTitle').textContent='입고·출하 일정';
    $('content').innerHTML="<div class='schedule-head'><div><h1>입고·출하 일정</h1><p>입고 요청부터 입항·출항 예정 및 확정 일정을 한눈에 확인합니다.</p></div><div class='schedule-search'><input id='mesScheduleQuery' value='"+escapeHtml(query)+"' placeholder='P.O · S.O · 거래처 · 거래처 강종 검색'><button class='btn primary' onclick='mesScheduleSearch()'>검색</button></div></div>"
      +"<div class='schedule-shell'><aside class='schedule-side'><button class='btn primary wide' onclick=\"openView('purchase')\">구매계획 열기</button><button class='btn wide' onclick=\"openView('sales')\">판매계획 열기</button><div class='mini-title'><button onclick='mesScheduleMove(-1)'>‹</button><b>"+escapeHtml(monthTitle(monthCursor))+"</b><button onclick='mesScheduleMove(1)'>›</button></div>"+miniCalendar()+"<div class='schedule-types'><label data-schedule-type='purchase'><input type='checkbox' "+(typeFilter.purchase?'checked':'')+" onchange=\"mesScheduleToggle('purchase',this.checked)\"><i class='purchase'></i> 입고요청일</label><label data-schedule-type='arrival'><input type='checkbox' "+(typeFilter.arrival?'checked':'')+" onchange=\"mesScheduleToggle('arrival',this.checked)\"><i class='arrival'></i> 입항예정일</label><label data-schedule-type='sales'><input type='checkbox' "+(typeFilter.sales?'checked':'')+" onchange=\"mesScheduleToggle('sales',this.checked)\"><i class='sales'></i> 출하요청일</label><label data-schedule-type='departurePlan'><input type='checkbox' "+(typeFilter.departurePlan?'checked':'')+" onchange=\"mesScheduleToggle('departurePlan',this.checked)\"><i class='departure-plan'></i> 출항예정일</label><label data-schedule-type='departureConfirmed'><input type='checkbox' "+(typeFilter.departureConfirmed?'checked':'')+" onchange=\"mesScheduleToggle('departureConfirmed',this.checked)\"><i class='departure-confirmed'></i> 출항확정일</label></div></aside>"
      +"<main class='schedule-main'><div class='calendar-toolbar'><h2>"+escapeHtml(monthTitle(monthCursor))+"</h2><div><button class='btn' onclick='mesScheduleMove(-1)'>이전</button><button class='btn' onclick='mesScheduleToday()'>오늘</button><button class='btn' onclick='mesScheduleMove(1)'>다음</button></div></div>"+calendarGrid(events)+"<div class='schedule-mobile-list'>"+mobileList(events)+"</div></main></div>";
  }

  window.mesScheduleMove=function(amount){monthCursor=new Date(monthCursor.getFullYear(),monthCursor.getMonth()+amount,1);renderSchedule();};
  window.mesScheduleToday=function(){var now=new Date();monthCursor=new Date(now.getFullYear(),now.getMonth(),1);renderSchedule();};
  window.mesScheduleToggle=function(type,checked){typeFilter[type]=checked;renderSchedule();};
  window.mesScheduleSearch=function(){query=text($('mesScheduleQuery')&&$('mesScheduleQuery').value);renderSchedule();};
  window.mesScheduleEvents=allEvents;

  var style=document.createElement('style');
  style.textContent=".schedule-head{display:flex;align-items:end;justify-content:space-between;gap:18px;margin-bottom:18px}.schedule-head h1{margin:0;font-size:28px}.schedule-head p{margin:7px 0 0;color:var(--muted)}.schedule-search{display:flex;gap:8px;min-width:420px}.schedule-search input{min-width:0;flex:1}.schedule-shell{display:grid;grid-template-columns:270px minmax(0,1fr);gap:16px}.schedule-side,.schedule-main{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px}.schedule-side>.wide{width:100%;margin-bottom:8px}.mini-title{display:flex;align-items:center;justify-content:space-between;margin:15px 0 8px}.mini-title button{border:0;background:#eef4f8;border-radius:8px;width:34px;height:34px;font-size:22px}.mini-week,.mini-days{display:grid;grid-template-columns:repeat(7,1fr);text-align:center;gap:2px}.mini-week span{font-size:11px;color:var(--muted);padding:5px 0}.mini-days span{padding:6px 0;border-radius:7px;font-size:12px}.mini-days .muted{color:#c1c8ce}.mini-days .today{background:#168777;color:#fff}.schedule-types{display:grid;gap:5px;margin-top:16px;padding:12px;border:1px solid var(--line);border-radius:12px;background:#f8fbfc}.schedule-types label{display:flex;align-items:center;gap:8px;padding:8px;border-radius:8px;font-weight:800;cursor:pointer}.schedule-types label[data-schedule-type='arrival']{background:#fff4d8;color:#8a5200}.schedule-types label[data-schedule-type='departurePlan']{background:#f4f0ff}.schedule-types label[data-schedule-type='departureConfirmed']{background:#ecfaf6}.schedule-types i{width:11px;height:11px;border-radius:3px;flex:0 0 auto}.schedule-types i.purchase{background:#ef6a74}.schedule-types i.arrival{background:#f1a12a}.schedule-types i.sales{background:#2ba8c8}.schedule-types i.departure-plan{background:#7b61c9}.schedule-types i.departure-confirmed{background:#13836f}.calendar-toolbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.calendar-toolbar h2{margin:0}.calendar-toolbar>div{display:flex;gap:7px}.calendar-weekdays,.calendar-days{display:grid;grid-template-columns:repeat(7,minmax(110px,1fr))}.calendar-weekdays span{text-align:center;padding:10px;font-weight:800;background:#f1f5f8}.calendar-weekdays span:first-child{color:#d94852}.calendar-weekdays span:last-child{color:#2574bd}.calendar-day{min-height:128px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:8px;min-width:0}.calendar-day:nth-child(7n+1){border-left:1px solid var(--line)}.calendar-day.outside{background:#fafbfc;color:#b8c0c7}.calendar-day.today{background:#eef9ff;box-shadow:inset 0 0 0 2px #41a6d9}.day-number{font-weight:800;margin-bottom:5px}.calendar-day:nth-child(7n+1) .day-number{color:#d94852}.calendar-day:nth-child(7n) .day-number{color:#2574bd}.day-events{display:grid;gap:4px}.schedule-event{display:block;width:100%;border:0;border-radius:6px;background:#fff5f6;padding:5px 6px;text-align:left;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer;color:#172b25}.schedule-event.arrival{background:#fff1c7;box-shadow:inset 3px 0 0 #f1a12a}.schedule-event.sales{background:#eefaff}.schedule-event.departurePlan{background:#f4f0ff}.schedule-event.departureConfirmed{background:#ecfaf6}.schedule-event span{display:inline-block;width:6px;height:6px;border-radius:2px;background:#ef6a74;margin-right:4px}.schedule-event.arrival span{background:#f1a12a}.schedule-event.sales span{background:#2ba8c8}.schedule-event.departurePlan span{background:#7b61c9}.schedule-event.departureConfirmed span{background:#13836f}.schedule-event small{display:block;margin-left:10px;color:#60716b;overflow:hidden;text-overflow:ellipsis}.schedule-mobile-list{display:none}.schedule-empty{padding:28px;text-align:center;color:var(--muted)}@media(max-width:900px){.schedule-head{display:block}.schedule-search{min-width:0;margin-top:13px}.schedule-shell{grid-template-columns:1fr}.schedule-side{display:grid;grid-template-columns:1fr 1fr;gap:8px}.schedule-side .mini-title,.schedule-side .mini-week,.schedule-side .mini-days{display:none}.schedule-types{grid-column:1/-1;margin:0;display:flex;gap:8px;flex-wrap:wrap}.schedule-types label{min-height:44px;padding:9px 12px}.calendar-weekdays,.calendar-days{display:none}.schedule-mobile-list{display:block}.schedule-mobile-list h3{margin:16px 0 7px;padding-bottom:6px;border-bottom:1px solid var(--line)}.schedule-mobile-list .schedule-event{font-size:14px;padding:11px;margin-bottom:7px;white-space:normal}.calendar-toolbar h2{font-size:20px}}@media(max-width:520px){.schedule-search{display:grid;grid-template-columns:1fr auto}.schedule-side{grid-template-columns:1fr}.schedule-types{display:grid;grid-template-columns:1fr 1fr}.schedule-types label{font-size:14px}.calendar-toolbar{align-items:flex-start;gap:8px}.calendar-toolbar>div{gap:4px}.calendar-toolbar .btn{padding:9px 10px}}";
  document.head.appendChild(style);

  if(Array.isArray(VIEWS)&&!VIEWS.some(function(view){return view.id==='schedule';}))VIEWS.unshift({group:'일정',id:'schedule',icon:'📅',label:'입고·출하 일정'});
  if(typeof buildNav==='function')buildNav();

  var mesSchemas=typeof schemas!=='undefined'?schemas:window.schemas;
  if(mesSchemas){
    ['purchase','sales'].forEach(function(view){
      var schema=mesSchemas[view];if(!schema)return;
      schema.cols.forEach(function(column){if(['대표강종','거래처강종','강종'].includes(text(column[0])))column[0]='거래처 강종명';});
    });
  }
  var previousRender=window.render;
  window.render=function(){if(typeof currentView!=='undefined'&&currentView==='schedule')return renderSchedule();return previousRender.apply(this,arguments);};
  if(location.hash==='#schedule'){currentView='schedule';window.render();}
  document.documentElement.dataset.mesScheduleInboundPersistenceV1='loaded';
})();

