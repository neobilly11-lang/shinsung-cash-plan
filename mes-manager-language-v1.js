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
  var languageLocalChoice=false;
  try{var savedLanguage=localStorage.getItem(LANG_KEY+':'+userKey())||localStorage.getItem(LANG_KEY);if(savedLanguage){language=savedLanguage;languageLocalChoice=true}}catch(_){ }
  try{var requestedLanguage=new URL(root.location.href).searchParams.get('meslang');if(requestedLanguage==='ko'||requestedLanguage==='en'){language=requestedLanguage;languageLocalChoice=true;localStorage.setItem(LANG_KEY,language);localStorage.setItem(LANG_KEY+':'+userKey(),language)}}catch(_){ }
  if(language!=='en')language='ko';
  var translations={
    /* main navigation */
    '통합 현황판':'Integrated Dashboard','입고·출하 일정':'Inbound / Shipping Schedule','구매계획':'Purchase Plan','판매계획':'Sales Plan',
    '입고요청현황':'Inbound Requests','입고현황':'Inbound Status','생산현황':'Production Status','세틀현황':'Settlement Status',
    '재고현황':'Inventory Status','재고상세':'Inventory Details','출하계획':'Shipping Plan','출고현황':'Shipment History',
    '일일 작업일지':'Daily Work Log','샘플관리':'Sample Management','분석치 관리':'Analysis Management','임원용 현황판':'Executive Dashboard',
    '현장관리 열기':'Open Field App','계획 관리':'Planning','입고·생산':'Inbound / Production','재고·출하':'Inventory / Shipping',
    '기록':'Records','품질관리':'Quality Management','임원 전용':'Executive Only','신성금속 MES':'Shinsung Metal MES',
    '현장관리 실시간 연동 시스템':'Real-time Field Management Integration','메뉴 열기':'Open Menu','메뉴 닫기':'Close Menu',
    /* common buttons and messages */
    '조회':'Search','검색':'Search','초기화':'Reset','엑셀':'Excel','엑셀 다운로드':'Download Excel','상세보기':'Details','상세 수정':'Edit Details',
    '목록으로 돌아가기':'Back to List','닫기':'Close','취소':'Cancel','저장':'Save','수정':'Edit','삭제':'Delete','완료':'Complete','등록':'Register',
    '선택':'Select','확인':'Confirm','새로 입력':'New Entry','다시 불러오기':'Reload','최신자료 조회':'Load Latest Data','지금 동기화':'Sync Now',
    '공용서버에 수정 저장':'Save to Shared Server','공용 서버 연결됨':'Shared Server Connected','실시간 연결':'Live Connection',
    '로그인':'Log In','로그아웃':'Log Out','사용자 로그인':'User Login','로그인 후 공용자료를 불러옵니다.':'Log in to load shared data.',
    '현장관리와 같은 계정으로 로그인하세요.':'Use the same account as the Field App.','이름 또는 이메일':'Name or Email','등록한 이름 또는 이메일':'Registered name or email',
    '비밀번호':'Password','자동접속 유지':'Keep me signed in','로그인·접속':'Log In','사용자 등록·비밀번호 찾기':'Register / Reset Password',
    '접속 지연 · 여기를 눌러 다시 연결':'Connection delayed · Tap to reconnect','저장 완료 · 현장관리 동시 반영':'Saved · Field app updated',
    '검색어 입력 중에는 화면이 바뀌지 않습니다.':'The screen will not change while you type.','조건 입력 후 반드시 조회를 눌러 주세요.':'Enter filters, then press Search.',
    '검색 조건에 맞는 자료가 없습니다.':'No records match the search criteria.','등록된 자료가 없습니다.':'No records found.','자료가 없습니다.':'No data available.',
    '전체':'All','국내':'Domestic','국외':'Overseas','해외':'Overseas','대기':'Waiting','진행중':'In Progress','미완료':'Incomplete','완료':'Complete',
    /* forms, filters and table columns */
    '통합 검색':'Unified Search','저장일 시작':'Saved Date From','저장일 종료':'Saved Date To','저장일시':'Saved At','저장일':'Saved Date',
    '상태':'Status','상태별 선택':'Filter by Status','표시건수':'Rows per Page','번호':'Number','No.':'No.','구분':'Category','상세':'Details',
    '거래처':'Vendor / Customer','거래처명':'Company Name','공급사':'Supplier','고객사':'Customer','판매처':'Customer','회사':'Company',
    'P.O 번호':'P.O Number','S.O 번호':'S.O Number','구매번호':'Purchase No.','판매번호':'Sales No.','사내입고번호':'Internal Receipt No.',
    '완료번호':'Completed Pack No.','요청번호':'Request No.','관련번호':'Reference No.','패키지번호':'Package No.','패키지 수':'Packages',
    '품종':'Category','강종':'Grade','대표강종':'Main Grade','거래처 강종':'Supplier Grade','거래처강종':'Supplier Grade',
    '소강종':'Subgrade','상세강종':'Detailed Grade','품명':'Item Description','품목':'Items','품목설명':'Item Description','설명':'Description',
    '중량':'Weight','중량(kg)':'Weight (kg)','확정중량':'Confirmed Weight','수량':'Quantity','단위':'Unit','중량단위':'Weight Unit','단가단위':'Price Unit',
    '단가':'Unit Price','금액':'Amount','총금액':'Total Amount','합계금액':'Total Amount','통화':'Currency','환율':'Exchange Rate','적용환율':'Applied Rate',
    '메모':'Memo','비고':'Remarks','주소':'Address','전화':'Telephone','이메일':'Email','계약일':'Contract Date','입고 구분':'Inbound Type',
    '입고예정일':'Expected Inbound Date','입항예정일':'Expected Arrival Date','출항예정일':'Estimated Departure Date','출항확정일':'Confirmed Departure Date',
    '입고요청일':'Inbound Request Date','출하요청일':'Shipping Request Date','컨테이너 작업일':'Container Work Date','작업일':'Work Date','완료일':'Completion Date',
    '입고상태':'Inbound Status','검수상태':'Inspection Status','구매상태':'Purchase Status','판매상태':'Sales Status','출하상태':'Shipping Status',
    '재고단계':'Inventory Stage','보관위치':'Storage Location','장소 검색':'Search Location','저장된 장소 검색':'Search Saved Locations',
    /* plan and document workflow */
    'P.O 등록':'Register P.O','S.O 등록':'Register S.O','P.O 생성':'Create P.O','S.O 생성':'Create S.O','P.O 다운로드':'Download P.O','S.O 다운로드':'Download S.O',
    '직접입력':'Manual Entry','빈 P.O 직접입력':'Blank P.O Entry','거래처 파일로 등록':'Import Vendor Document','거래처 P.O·INVOICE 파일로 등록':'Import Vendor P.O / Invoice',
    '거래처 파일 다시 선택':'Select Another Vendor File','파일선택':'Choose File','사진 선택':'Choose Photo','문서 등록':'Register Document','문자·표 분석':'Text / Table Analysis',
    '분석 준비 중':'Preparing Analysis','페이지 분석 중':'Analyzing Page','쉬운 불러오기':'Easy Import','품목 행 추가':'Add Item Row','행 삭제':'Delete Row',
    '우리 시스템 강종 분류 · 수정 가능':'Mapped to Our Grade System · Editable','직접입력 · 업로드 양식과 동일 항목':'Manual Entry · Same Fields as Upload Template',
    '저장 · 구매계획 등록':'Save · Register Purchase Plan','입력 후 현장관리 공용서버 동시 반영':'Saves to MES and Field App Shared Server',
    '구매확정':'Purchase Confirmed','판매확정':'Sales Confirmed','구매대기':'Purchase Pending','판매대기':'Sales Pending','부분입고':'Partially Received',
    '입항예정':'Expected Arrival','입고요청':'Inbound Request','입고요청완료':'Inbound Request Complete','입고예정확정':'Confirm Inbound Schedule',
    '출하예정':'Expected Shipping','출하요청':'Shipping Request','배차요청':'Vehicle Assignment Request','상차예정확정':'Confirm Loading Schedule',
    '입항예정 수정':'Edit Expected Arrival','입고요청 수정':'Edit Inbound Request','배차요청 수정':'Edit Vehicle Request','상차예정 수정':'Edit Loading Schedule',
    '카카오톡 보내기':'Share via KakaoTalk','카카오톡 공유':'Share via KakaoTalk','카톡':'KakaoTalk','공유하기':'Share','파일 만들기':'Create File',
    '전체 흔적 삭제':'Delete All Related Records','전체흔적 삭제하기':'Delete All Related Records','강제 입고등록':'Force Inbound Registration',
    /* dashboard and operations */
    '신성금속 통합 생산현황':'Shinsung Metal Integrated Production Status','현장관리와 동일한 공용자료를 실시간으로 집계합니다.':'Live summary from the same shared field-management data.',
    '일정':'Schedule','계획관리':'Planning','화면 크기 조절':'Adjust Display Size','화면 10% 줄이기':'Zoom Out 10%','화면 10% 크게 하기':'Zoom In 10%',
    '오늘 작업일지':'Today’s Work Log','단독 관리자 설정':'Single Administrator Settings','계획':'Plan','포장':'Packs','완료포장':'Completed Packs',
    '쇼트·산처리·절단':'Shot · Acid · Cutting','누적 처리':'Cumulative Processing','등록된 작업자가 없습니다.':'No registered workers.',
    '저장된 작업분배가 없습니다.':'No saved work assignments.','작업자 ID':'Worker ID','기준값':'Baseline',
    '입고대기':'Inbound Queue','검수대기':'Inspection Queue','생산대기':'Production Queue','작업대기':'Work Queue','포장대기':'Packing Queue',
    '미검수':'Uninspected','미검수재고':'Uninspected Inventory','미포장':'Unpacked','미포장재고':'Unpacked Inventory','완료재고':'Completed Inventory',
    '출하대기':'Shipping Queue','출하예정':'Scheduled to Ship','출하확정':'Shipping Confirmed','출하완료':'Shipped','오늘 작업':'Today’s Work','누적':'Cumulative',
    '원재고':'Original Inventory','검수·작업 미완료':'Inspection / Work Incomplete','출하 가능':'Available to Ship','공정별 중량':'Weight by Process','MES 사용자':'MES Users',
    '사진보기':'View Photos','사진':'Photo','첨부파일':'Attachments','작업자':'Worker','검수자':'Inspector','작업시간':'Work Time','소요시간':'Elapsed Time',
    '생산관리':'Production Management','작업분배':'Work Assignment','현장관리자 모드':'Field Manager Mode','작업자별 생산능력':'Capacity by Worker',
    '저장된 작업분배':'Saved Assignments','합류':'Include','배제':'Exclude','작업분배 저장':'Save Assignment','예상 작업일수':'Estimated Work Days',
    '예상 작업비':'Estimated Labor Cost','합산 생산능력':'Combined Capacity','예상 작업시간':'Estimated Work Hours','달성예상율':'Estimated Completion Rate',
    '작업 종류':'Work Type','배분 중량(kg)':'Assigned Weight (kg)','완료 목표일':'Target Completion Date','시간당 인건비(1명)':'Hourly Labor Cost (per person)',
    '작업자 2명까지 합류':'Include Up to 2 Workers','작업지시 메모':'Work Instruction Memo','일반작업':'General Work','쇼트':'Shot Blasting','절단':'Cutting',
    '산처리':'Acid Treatment','재선별':'Re-sorting','검수':'Inspection','재고이동':'Inventory Transfer',
    /* schedule */
    '구매계획 열기':'Open Purchase Plan','판매계획 열기':'Open Sales Plan','이전':'Previous','오늘':'Today','다음':'Next',
    '입항예정일':'Expected Arrival Date','입고요청일':'Inbound Request Date','출하요청일':'Shipping Request Date','컨테이너작업일':'Container Work Date',
    /* inventory */
    '강종별 재고 총량':'Total Inventory by Grade','재고표기 방식':'Inventory Display Rules','재고표기 방식 · 비슷한 그레이드 묶기':'Inventory Display Rules · Group Similar Grades',
    '원문 유지':'Keep Original','원문유지':'Keep Original','묶음표기':'Grouped View','유사강종':'Similar Grades','유사강종 재고':'Similar-grade Inventory',
    '유사강종 출하예정':'Similar-grade Scheduled Shipping','유사강종 예상재고':'Estimated Similar-grade Inventory','예상남은재고':'Estimated Remaining Inventory',
    '입항예정재고':'Expected-arrival Inventory','작업대기재고':'Work-queue Inventory','완료재고(kg)':'Completed Inventory (kg)',
    '입항예정재고(kg)':'Expected-arrival Inventory (kg)','미검수재고(kg)':'Uninspected Inventory (kg)','작업대기재고(kg)':'Work-queue Inventory (kg)',
    '미포장재고(kg)':'Unpacked Inventory (kg)','유사강종 재고(kg)':'Similar-grade Inventory (kg)','유사강종 출하예정(kg)':'Similar-grade Scheduled Shipping (kg)',
    '유사강종 예상재고(kg)':'Estimated Similar-grade Inventory (kg)','단계별 원본 내역':'Original Records by Stage','원 강종':'Original Grade',
    '구성 수정':'Edit Group','묶음 삭제':'Delete Group','묶음 이름':'Group Name','묶음 이름 저장':'Save Group Name','묶음 표시명':'Group Display Name',
    '유사강종 묶음 수정':'Edit Similar-grade Group','선택 강종 묶음에서 제외':'Remove Selected Grades from Group','선택 강종 묶음에 합류':'Add Selected Grades to Group',
    '다른 강종 유사강종 묶음 합류':'Add Other Grades to Similar-grade Group','재고표기 방식 저장':'Save Inventory Display Rule','재고표기 방식 삭제':'Delete Inventory Display Rule',
    '예상 S.O 작성':'Create Estimated S.O','예상 S.O 작성하기':'Create Estimated S.O','예상 S.O 목록':'Estimated S.O List','예상 S.O 미리보기':'Estimated S.O Preview',
    '예상 S.O 번호':'Estimated S.O Number','예상 S.O 저장':'Save Estimated S.O','예상 S.O 수정':'Edit Estimated S.O','예상 S.O 삭제':'Delete Estimated S.O',
    '예상 판매중량(kg)':'Estimated Sales Weight (kg)','예상 단가':'Estimated Unit Price','예상 판매금액':'Estimated Sales Amount','예상 판매 참고사항':'Estimated Sales Notes',
    '실제 판매와 별도 저장':'Saved Separately from Actual Sales','실제 판매·출하 재고에는 반영되지 않습니다.':'This does not affect actual sales or shipping inventory.',
    /* settlement */
    'PDF 다운로드':'Download PDF','PDF 카카오톡 전송':'Share PDF via KakaoTalk','양식 미리보기':'Preview Form','세틀 다운로드':'Download Settlement',
    '사진 일괄 다운로드':'Download All Photos','국내 세틀 양식':'Domestic Settlement','해외 세틀 양식':'Overseas Settlement',
    '국내 선세틀 양식':'Domestic Pre-Settlement','해외 Pre-Settlement':'Overseas Pre-Settlement','선세틀':'Pre-Settlement','선세틀 수정':'Edit Pre-Settlement',
    '선세틀완료':'Pre-Settlement Complete','완료 세틀':'Completed Settlements','미완료 세틀':'Incomplete Settlements','세틀완료':'Settlement Complete',
    '계약중량':'Contract Weight','검수확정':'Inspection Confirmed','로스':'Loss','리마크':'Remarks','PHOTO':'PHOTO',
    /* executive dashboard */
    '연간 총매입액':'Annual Purchases','월간 매입총액':'Monthly Purchases','이번 달 매입총액':'Monthly Purchases','이번 달 매출액':'Monthly Sales',
    '입항예정 총액':'Expected-arrival Value','입고완료 총액':'Received Value','현재재고 총액':'Current Inventory Value','작업대기 총액':'Work-queue Value',
    '매입총액':'Total Purchase Cost','매입원가':'Purchase Cost','매출액':'Sales','실현이익':'Realized Profit','실현이익률':'Profit Margin',
    '작업비':'Processing Cost','재고이자부담비':'Inventory Interest Cost','수출비용':'Export Cost','수입통관비':'Import Clearance Cost',
    '90일 이상 장기재고':'Inventory Over 90 Days','평균 재고회전일':'Average Inventory Turnover Days','누락비용 즉시 입력':'Enter Missing Costs',
    '통관비 기입요망':'Clearance Cost Required','수출비용 기입요망':'Export Cost Required','월별 KPI 대시보드':'Monthly KPI Dashboard',
    '환율 변경 이력 · 예상 환차손익':'FX History & Estimated Gain/Loss','예상환차손 · 환율 일괄변경':'FX Estimate / Bulk Rate Change',
    '임원 2명 지정':'Assign Two Executives','임원 사용자 2명 지정':'Assign Two Executive Users','임원 1 이름':'Executive 1 Name','임원 1 이메일':'Executive 1 Email',
    '임원 2 이름':'Executive 2 Name','임원 2 이메일':'Executive 2 Email','임원 2명 저장':'Save Executives','총재고 환산액':'Total Inventory Value',
    '미판매 예상재고액':'Estimated Unsold Inventory Value','판매계획완료 재고액':'Sales-planned Inventory Value','미판매 예상재고':'Estimated Unsold Inventory',
    '판매계획완료 재고':'Sales-planned Inventory','상세 재고':'Inventory Details','변경 전 금액':'Previous Amount','변경 후 금액':'Updated Amount',
    '변경 전 기준일':'Previous Base Date','변경일':'Changed At','변경자':'Changed By','환차익 / 환차손':'FX Gain / Loss','환율 변경 이력':'FX History',
    '적용 범위':'Scope','적용 환율':'Applied Exchange Rate','예상환율 일괄 적용':'Apply Estimated Rate to All','검색 결과 합계':'Search Result Total'
  };
  var reverse={};Object.keys(translations).forEach(function(k){if(!reverse[translations[k]])reverse[translations[k]]=k});
  var originalText=new WeakMap(),originalAttrs=new WeakMap();
  var languageHydrated=false;
  var phraseKeys=Object.keys(translations).filter(function(k){return k.length>=3}).sort(function(a,b){return b.length-a.length});
  function translatedString(raw){
    var trim=String(raw==null?'':raw).trim();if(!trim)return raw;
    if(language==='ko')return reverse[trim]?String(raw).replace(trim,reverse[trim]):raw;
    if(translations[trim])return String(raw).replace(trim,translations[trim]);
    var out=String(raw);phraseKeys.forEach(function(k){if(out.indexOf(k)>=0)out=out.split(k).join(translations[k])});
    out=out.replace(/(\d+(?:\.\d+)?)\s*건/g,'$1 items').replace(/(\d+(?:\.\d+)?)\s*개/g,'$1 pcs');
    return out;
  }
  function translateTextNode(node){
    var raw=node.nodeValue;if(!String(raw||'').trim())return;
    if(language==='ko'){
      if(originalText.has(node)){node.nodeValue=originalText.get(node);originalText.delete(node);return}
      node.nodeValue=translatedString(raw);return;
    }
    if(!originalText.has(node)&&/[가-힣]/.test(raw))originalText.set(node,raw);
    node.nodeValue=translatedString(raw);
  }
  function translateElementAttributes(el){
    var attrs=['placeholder','title','aria-label'];
    if(language==='ko'){
      var saved=originalAttrs.get(el);if(saved){attrs.forEach(function(a){if(Object.prototype.hasOwnProperty.call(saved,a)){if(saved[a]==null)el.removeAttribute(a);else el.setAttribute(a,saved[a])}});originalAttrs.delete(el)}
      return;
    }
    var before={},changed=false;attrs.forEach(function(a){if(!el.hasAttribute(a))return;var value=el.getAttribute(a),next=translatedString(value);if(next!==value){before[a]=value;el.setAttribute(a,next);changed=true}});if(changed&&!originalAttrs.has(el))originalAttrs.set(el,before);
  }
  function translateDOM(){
    doc.documentElement.lang=language==='en'?'en':'ko';
    var toggleNode=doc.getElementById('mesLanguageToggle');
    var walker=doc.createTreeWalker(doc.body||doc.documentElement,NodeFilter.SHOW_TEXT,{acceptNode:function(n){var p=n.parentElement;if(!p||/^(SCRIPT|STYLE|TEXTAREA|INPUT)$/i.test(p.tagName)||(toggleNode&&(p===toggleNode||toggleNode.contains(p))))return NodeFilter.FILTER_REJECT;return NodeFilter.FILTER_ACCEPT}}),nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);nodes.forEach(function(node){try{translateTextNode(node)}catch(_){ }});
    Array.from(doc.querySelectorAll('[placeholder],[title],[aria-label]')).forEach(function(el){try{translateElementAttributes(el)}catch(_){ }});
    var toggle=doc.getElementById('mesLanguageToggle');if(toggle)toggle.textContent=language==='en'?'한국어':'English';
  }
  async function saveLanguage(){
    try{localStorage.setItem(LANG_KEY,language);localStorage.setItem(LANG_KEY+':'+userKey(),language)}catch(_){ }
    try{await commit('MES 표시언어 저장',['systemSettings'],function(s){s.systemSettings=s.systemSettings&&typeof s.systemSettings==='object'&&!Array.isArray(s.systemSettings)?s.systemSettings:{};s.systemSettings.mesLanguageByUser=s.systemSettings.mesLanguageByUser||{};s.systemSettings.mesLanguageByUser[userKey()]=language})}catch(_){ }
  }
  root.toggleMesLanguage=function(){
    language=language==='ko'?'en':'ko';
    languageLocalChoice=true;
    translateDOM();
    setTimeout(translateDOM,0);setTimeout(translateDOM,120);
    Promise.resolve(saveLanguage()).catch(function(){});
  };
  function bindLanguageButton(button){
    if(!button||button.__mesLanguageBound)return;
    button.__mesLanguageBound=true;
    button.addEventListener('click',function(event){
      event.preventDefault();event.stopPropagation();
      root.toggleMesLanguage();
    },true);
  }
  function languageHref(){
    try{var nextUrl=new URL(root.location.href);nextUrl.searchParams.set('meslang',language==='en'?'ko':'en');return nextUrl.href}catch(_){return language==='en'?'?meslang=ko':'?meslang=en'}
  }
  function injectLanguageButton(){
    var existing=doc.getElementById('mesLanguageToggle');
    if(existing){
      if(existing.tagName!=='A'){
        var replacement=doc.createElement('a');replacement.id=existing.id;replacement.className=existing.className;existing.replaceWith(replacement);existing=replacement;
      }
      existing.href=languageHref();
      existing.textContent=language==='en'?'한국어':'English';
      bindLanguageButton(existing);
      return;
    }
    var target=doc.querySelector('.top-actions,.topbar .actions,.topbar')||doc.body;
    var button=doc.createElement('a');button.id='mesLanguageToggle';button.className='btn mes-language-toggle';button.href=languageHref();button.textContent=language==='en'?'한국어':'English';bindLanguageButton(button);target.insertBefore(button,target.firstChild||null);
  }
  function hydrateLanguage(){if(!languageHydrated){var prefs=state().systemSettings&&state().systemSettings.mesLanguageByUser;if(!languageLocalChoice&&prefs&&prefs[userKey()]&&prefs[userKey()]!==language){language=prefs[userKey()]==='en'?'en':'ko';try{localStorage.setItem(LANG_KEY+':'+userKey(),language)}catch(_){ }}languageHydrated=true}injectLanguageButton();translateDOM()}

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
  doc.addEventListener('click',function(event){
    var target=event.target;
    while(target&&target!==doc){
      if(target.id==='mesLanguageToggle'&&!target.__mesLanguageBound){
        event.preventDefault();event.stopPropagation();
        root.toggleMesLanguage();return false;
      }
      target=target.parentNode;
    }
  },false);
  var observer=new MutationObserver(function(){clearTimeout(observer._timer);observer._timer=setTimeout(decorate,20)});observer.observe(doc.documentElement,{childList:true,subtree:true});
  root.__mesManagerLanguageV1={get language(){return language},capacities:capacities,events:events,translate:translateDOM,version:'20260818-6'};
  injectStyles();if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',decorate);else{try{decorate()}catch(_){injectLanguageButton()}}
})();

