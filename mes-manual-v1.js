(function(){
  'use strict';
  var root=window,doc=document;
  if(typeof VIEWS==='undefined'||typeof openView!=='function')return;
  if(!VIEWS.some(function(v){return v.id==='manual'}))VIEWS.push({group:'도움말',id:'manual',icon:'15',label:'MES 사용 메뉴얼'});
  var oldRender=render;
  var sections=[
    ['⌂','통합·임원 현황판','전체 흐름, 월별 KPI, 재고금액, 비용 누락, 환율 이력을 확인합니다.','dashboard'],
    ['📅','입고·출하 일정','입항예정일→입고요청일→출하요청일→컨테이너작업일→출항예정일→출항확정일을 확인합니다.','schedule'],
    ['01','구매계획','국내·해외 P.O를 직접 생성하거나 거래처 PDF·Excel·사진으로 등록하고 입항예정·입고요청을 진행합니다.','purchase'],
    ['02','판매계획','S.O·예상 S.O를 만들고 판매잔량, 출하요청, 환율과 금액을 관리합니다.','sales'],
    ['03','입고요청현황','Packing List 패키지별 G/W·N/W를 확인하고 입고요청·입고예정확정을 처리합니다.','inboundRequest'],
    ['04','입고현황','확정된 입고자료를 P.O·사내입고번호·강종·상태로 조회합니다.','inbound'],
    ['05','생산현황','검수·작업·사진·로스 내역과 작업자별 생산능력 및 작업분배 예상시간·비용을 확인합니다.','production'],
    ['06','세틀현황','국내·해외 세틀과 선세틀을 미리보고 Excel·PDF로 내려받습니다.','settlement'],
    ['07','재고현황','거래처강종과 최종강종, 공정별 재고, 유사강종 묶음과 예상재고를 집계합니다.','inventory'],
    ['08','재고상세','완료번호·사내입고번호별 위치, G/W·N/W, 사진과 이동이력을 확인합니다.','stockDetail'],
    ['09','출하계획','배차요청·상차예정확정·예상/확정 ETD와 출하요청 재고를 관리합니다.','shippingPlan'],
    ['10','출고현황','출하완료 내역, Packing List, 수출비용과 출고일을 확인합니다.','shipping'],
    ['11','일일 작업일지','입고·검수·작업대기완료·출하 총량을 미리보고 PDF·카카오톡으로 공유합니다.','daily'],
    ['12','샘플관리','샘플을 등록하고 S-번호 재고, 사진, 인수·발송·결과를 관리합니다.','samples'],
    ['13','분석치 관리','사내입고와 샘플별 분석사진·PDF를 첨부하고 상세에서 확인합니다.','analysis'],
    ['14','임원용 현황판','연간·월간 매입, 입항·입고·현재·작업대기 재고액, 이익과 환차손익을 확인합니다.','executive']
  ];
  function esc(s){return String(s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function manualHtml(){return '<div class="mes-manual-page"><div class="dashboard-head"><div><h1>MES 사용 메뉴얼</h1><p>현장관리와 연결된 계획·입고·생산·재고·출하 업무를 순서대로 확인합니다.</p></div><div class="actions"><button class="btn primary" onclick="openView(\'dashboard\')">통합 현황판 열기</button><button class="btn" onclick="window.open(\'stable-inspection-mobile-v4.html#home\',\'_blank\')">현장관리 열기</button></div></div><section class="manual-flow"><b>기본 업무 흐름</b><div>구매계획 → 입항예정·입고요청 → 입고확정 → 검수·작업 → 포장·재고 → 출하요청·확정 → 세틀·작업일지</div></section><div class="manual-grid">'+sections.map(function(s){return '<article class="manual-card"><span class="manual-no">'+esc(s[0])+'</span><h3>'+esc(s[1])+'</h3><p>'+esc(s[2])+'</p><button class="btn primary" onclick="openView(\''+esc(s[3])+'\')">바로 열기</button></article>'}).join('')+'</div><section class="manual-notes"><h2>PC·모바일 공통 사용법</h2><div class="manual-note-grid"><div><b>검색</b><p>검색어를 모두 입력한 뒤 반드시 조회를 누르세요. 입력 중에는 화면이 바뀌지 않습니다.</p></div><div><b>저장</b><p>저장 중에는 버튼을 다시 누르지 말고 “저장 완료” 알림을 확인하세요.</p></div><div><b>상세·수정</b><p>목록의 상세보기를 눌러 원자료를 확인하고 필요한 항목만 수정합니다.</p></div><div><b>현장 연동</b><p>MES와 현장관리는 같은 계정과 공용서버를 사용하므로 한쪽 저장 결과가 다른 쪽에 반영됩니다.</p></div><div><b>모바일</b><p>왼쪽 위 메뉴 버튼으로 01~15 화면을 열고 닫습니다. 표는 좌우로 밀어 확인할 수 있습니다.</p></div><div><b>English</b><p>상단 English 버튼으로 영문 화면을 켜고 한국어 버튼으로 다시 복귀합니다.</p></div></div></section></div>'}
  render=function(){if(currentView==='manual'){document.querySelectorAll('.nav-btn').forEach(function(b){b.classList.toggle('on',b.dataset.id==='manual')});$('pageTitle').textContent='MES 사용 메뉴얼';$('content').innerHTML=manualHtml();return}return oldRender.apply(this,arguments)};
  root.render=render;
  var style=doc.createElement('style');style.textContent='.mes-manual-page{padding:4px}.manual-flow{margin:0 0 14px;padding:18px 20px;border-radius:16px;background:linear-gradient(135deg,#0c4760,#008f91);color:#fff;font-size:16px}.manual-flow div{margin-top:8px;font-size:15px}.manual-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.manual-card{position:relative;min-height:190px;padding:20px;border:1px solid #d9e2ea;border-radius:16px;background:#fff;box-shadow:0 4px 14px rgba(19,45,74,.06)}.manual-card h3{margin:6px 0 10px;font-size:18px}.manual-card p{min-height:66px;line-height:1.55;color:#526070}.manual-no{display:inline-flex;min-width:36px;height:30px;align-items:center;justify-content:center;border-radius:9px;background:#e8f7f7;color:#087d82;font-weight:800}.manual-notes{margin-top:16px;padding:20px;border-radius:16px;background:#f4f7fb}.manual-note-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.manual-note-grid>div{padding:14px;border-radius:12px;background:#fff}.manual-note-grid p{margin:6px 0 0;line-height:1.5;color:#526070}@media(max-width:900px){.manual-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.manual-note-grid{grid-template-columns:1fr 1fr}}@media(max-width:620px){.manual-grid,.manual-note-grid{grid-template-columns:1fr}.manual-card{min-height:0}.manual-card p{min-height:0}.manual-flow{font-size:14px}.mes-manual-page .dashboard-head{align-items:flex-start}.mes-manual-page .dashboard-head .actions{width:100%}.mes-manual-page .dashboard-head .actions .btn{flex:1}}';doc.head.appendChild(style);
  buildNav();
  if(location.hash==='#manual')openView('manual');
})();
