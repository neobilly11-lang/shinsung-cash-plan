(function(){
  'use strict';
  if(typeof TUTORIALS==='undefined')return;
  var manuals=[
    {icon:'🇰🇷',title:'0 · 국내입고',action:'국내입고 등록 열기',steps:[
      {title:'차량과 거래처 확인',picture:[['🏢','거래처 선택'],['🚚','차량번호'],['⚖️','하차 전 계근']],rule:'P.O 없이 도착한 국내 물품은 국내입고에서 시작합니다.',tip:'입출고 사진과 계근표 사진을 먼저 저장하면 다음 단계가 편합니다.'},
      {title:'패키지를 계속 등록',picture:[['🔎','강종 검색'],['📦','GW·포장재'],['➕','다음 패키지']],rule:'포장재 중량을 빼서 N/W가 자동 계산됩니다.',tip:'저장 후 강종 입력칸으로 돌아오므로 여러 패키지를 연속 등록하세요.'},
      {title:'입고 확정',picture:[['⚖️','하차 후 계근'],['✅','입고 확정'],['🔗','카카오톡 공유']],rule:'계근표 사진과 필수값을 확인한 뒤 P.O를 자동 생성합니다.',tip:'필수값이 빠지면 알림을 닫고 안내된 입력칸부터 채우세요.'}
    ]},
    {icon:'🚢',title:'1 · 수입입고 수행',action:'수입입고 관리 열기',steps:[
      {title:'확정된 입고예정 찾기',picture:[['🔎','P.O·거래처·강종'],['📋','입고대기 목록'],['👆','목록 선택']],rule:'MES에서 입고예정확정된 P.O만 수행 목록에 표시됩니다.',tip:'카운트는 패키지 수가 아니라 P.O 건수입니다.'},
      {title:'QR 또는 직접 선택',picture:[['📷','QR 입고'],['☑️','직접 선택'],['🖼️','입고사진']],rule:'입고할 패키지를 확인하고 입고확정하면 검수대기로 이동합니다.',tip:'필요하면 패키지 나누고 합치기에서 P00001-1, -2처럼 나누거나 같은 P.O·거래처·강종 패키지를 하나로 합칠 수 있습니다.'}
    ]},
    {icon:'🔍',title:'2 · 검수',action:'검수·작업 QR 열기',steps:[
      {title:'검수대상 선택',picture:[['📷','QR 촬영'],['🔎','번호·거래처·강종'],['💾','임시보관 이어하기']],rule:'QR, 검색, 검수대기 목록 중 가장 빠른 방법을 사용합니다.',tip:'임시보관 자료는 마지막 입력 위치부터 이어서 작업합니다.'},
      {title:'강종과 중량 확정',picture:[['🧪','최종강종·소강종'],['⚖️','확정중량'],['➕','분류행 추가']],rule:'한 패키지를 여러 강종과 중량으로 나눌 수 있으며 합계가 원중량을 넘을 수 없습니다.',tip:'상세강종은 선택사항입니다.'},
      {title:'필수 사진과 처리',picture:[['📸','형상사진'],['📊','분석기사진'],['✅','확정 저장']],rule:'최종강종·소강종·확정중량·형상사진·분석기사진이 필수입니다.',tip:'확정 후 행별로 포장·작업대기·로스를 끝까지 처리하세요.'}
    ]},
    {icon:'🧺',title:'3 · 재포장·재고이동·반품',action:'재포장·이동 열기',steps:[
      {title:'완료포장 만들기',picture:[['🏷️','완료번호 생성'],['📦','재고 선택'],['⚖️','N/W·G/W']],rule:'서로 다른 사내입고의 같은 강종도 한 완료번호에 합칠 수 있습니다.',tip:'Zebra ZD421용 QR·바코드를 출력해 포장에 부착하세요.'},
      {title:'포장대기와 재고이동',picture:[['📍','장소 QR'],['☑️','여러 재고 선택'],['➡️','일괄 이동']],rule:'포장대기 장소 QR을 촬영하면 그 장소의 상세재고를 바로 확인할 수 있습니다.',tip:'출하장으로 이동한 완료재고도 다른 장소로 다시 이동할 수 있습니다.'},
      {title:'반품입고',picture:[['🔎','출하품 검색'],['↩️','반품 선택'],['✅','완료재고 복원']],rule:'출하품을 완료번호·거래처·강종으로 찾아 완료재고로 되돌립니다.',tip:'반품 사유와 작업자를 확인하세요.'}
    ]},
    {icon:'🚚',title:'4 · 출하확인',action:'출하확인 열기',steps:[
      {title:'출하장 이동',picture:[['📋','S.O 선택'],['📷','완료재고 QR'],['✅','출하장 이동']],rule:'출하요청보다 많은 중량도 이동할 수 있으며 초과 경고 후 계속 진행할 수 있습니다.',tip:'이동 완료 알림과 S.O별 진행 중량을 확인하세요.'},
      {title:'출하확정',picture:[['📷','출하장 QR'],['📦','Packing List'],['💬','카카오톡 공유']],rule:'출하장 이동완료 재고를 촬영해 출하확정하고 최종 Packing List를 생성합니다.',tip:'요청량 초과 출하도 경고 확인 후 확정할 수 있습니다.'}
    ]},
    {icon:'🛠️',title:'5 · 작업대기',action:'작업대기 관리 열기',steps:[
      {title:'작업 선택',picture:[['♻️','재선별'],['✨','쇼트·산처리'],['✂️','절단']],rule:'목록에서 작업 종류를 선택하면 해당 작업만 표시됩니다.',tip:'장소는 작업 종류에 맞춰 자동 선택되며 변경할 수 있습니다.'},
      {title:'작업완료와 로스',picture:[['⏱️','작업시간'],['📸','작업 후 사진'],['⚖️','완료·로스']],rule:'완료중량과 로스를 원중량 안에서 기록합니다.',tip:'작업완료 뒤 포장확정을 눌러 3번 재포장 화면으로 이동하세요.'}
    ]},
    {icon:'⚡',title:'7 · QR 업무 바로가기',action:'통합 QR 바로가기 열기',steps:[
      {title:'QR 하나로 상태 판별',picture:[['📷','QR 촬영'],['🧭','상태 자동판별'],['➡️','맞는 업무로 이동']],rule:'완료재고·포장대기·작업대기·출하장 재고를 자동 구분합니다.',tip:'첫 화면에서는 전체 검색목록을 펼치지 않고 검색어 입력 후 결과를 선택합니다.'},
      {title:'자동 연결되는 업무',picture:[['📍','재고이동'],['🚚','출하장·출하확정'],['🛠️','작업입력']],rule:'현재 상태에 맞는 화면으로 바로 연결됩니다.',tip:'출하장 재고는 출하확정 또는 다른 장소 이동을 선택할 수 있습니다.'}
    ]},
    {icon:'📊',title:'업무관리·현황판',action:'업무관리 열기',steps:[
      {title:'자료를 찾고 확인',picture:[['P.O','구매·입고'],['S.O','판매·출하'],['📦','재고·세틀']],rule:'업무관리는 원자료와 사진, 재고, 세틀, Packing List를 확인하는 곳입니다.',tip:'현황판 숫자를 누르면 해당 상세목록으로 이동합니다.'},
      {title:'공용서버 사용 원칙',picture:[['👤','로그인 작업자'],['⏳','저장 중 기다리기'],['🔄','최신자료']],rule:'모든 작업은 로그인한 사용자 이름으로 공용서버에 저장됩니다.',tip:'저장 중에는 중복 클릭하지 말고 완료 알림을 확인하세요.'}
    ]},
    {icon:'🛟',title:'문제 해결',action:'업무수행으로 돌아가기',steps:[
      {title:'입력이 선택되지 않을 때',picture:[['⌨️','검색어 입력'],['🔽','결과 선택'],['✕','선택 지우기']],rule:'검색 결과를 눌러 확정하고 바꾸려면 선택 지우기를 먼저 누릅니다.',tip:'모바일 키보드에 가려지면 결과 영역으로 자동 이동된 뒤 선택 후 원위치로 돌아옵니다.'},
      {title:'저장·사진 오류',picture:[['📶','연결 확인'],['🖼️','사진 한 장씩'],['🔁','임시저장 복구']],rule:'사진은 압축 후 별도 저장소에 저장되고 공용자료에는 경로만 저장됩니다.',tip:'오류가 나도 입력자료는 유지됩니다. 연결 후 다시 저장하세요.'}
    ]}
  ];
  TUTORIALS.splice.apply(TUTORIALS,[0,TUTORIALS.length].concat(manuals));
  tutorialDoneSet=function(){try{return new Set(JSON.parse(localStorage.getItem('scrapTutorialDoneV2')||'[]'))}catch(_){return new Set()}};
  saveTutorialDone=function(done){try{localStorage.setItem('scrapTutorialDoneV2',JSON.stringify(Array.from(done)))}catch(_){}};
  tutorialGoWork=function(){
    if(tutorialChapter===0)return openDomesticReceiptList();
    if(tutorialChapter===1)return openScanMode('receipt');
    if(tutorialChapter===2)return openScanMode('inspect');
    if(tutorialChapter===3)return show('repack');
    if(tutorialChapter===4)return show('shippingModeMenu');
    if(tutorialChapter===5)return showWorkWaitFilter('WAITING');
    if(tutorialChapter===6&&typeof openUnifiedWorkQr==='function')return openUnifiedWorkQr();
    if(tutorialChapter===7)return show('management');
    return show('home');
  };
  function refreshCopy(){
    document.querySelectorAll('#tutorial p,.tutorial-intro p').forEach(function(el){el.textContent=el.textContent.replace(/0~5번/g,'0~7번').replace(/입고부터 출하까지/g,'국내·수입입고부터 검수·포장·출하까지')});
  }
  document.addEventListener('DOMContentLoaded',refreshCopy);
})();
