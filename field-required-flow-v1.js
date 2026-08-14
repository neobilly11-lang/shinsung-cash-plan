(function fieldRequiredFlowV1(){
  'use strict';
  if(window.__fieldRequiredFlowV1)return;

  const doc=document;
  const state={lastAction:null,queue:[],currentKey:'',timer:0,notice:null};
  const SAVE_WORDS=/(저장|확정|등록|완료|이동|요청|처리|생성)/;
  const IGNORE_ACTION=/(삭제|취소|닫기|조회|검색|선택|보기|미리보기|다운로드|인쇄|출력|촬영|사진|QR|카톡|공유|임시보관|임시저장)/i;
  const OPTIONAL=/(선택사항|선택\)|필요할 때|필요시|직접 입력|메모|비고|이상 사진|상세강종)/;
  const ACTIONABLE_ERROR=/(입력하세요|선택하세요|필수|모든 .*항목|모든 .*행|정확히 입력|촬영하거나 업로드|한 건 이상 선택|행을 하나 이상|0kg보다 커|이하여야|일치해야|등록된 .*선택|확인하세요)/;
  const NON_FIELD_ERROR=/(이미 .*등록|중복|찾을 수 없습니다|저장 실패|HTTP|서버|시간 초과|같습니다|없습니다\.?$)/;

  const schemas={
    addPackage:['poNo','company','grade','weight'],
    createSalesOrder:['soNo','soCustomer','soGrade','soWeight','soDate'],
    saveInspectionHandover:['handoverWorker1','handoverWorker2','handoverEstimatedRemain','handoverPhoto'],
    saveInspectionEdit:['editFinalType','editFinalMain','editFinalSub','editFinalWeight','editReason'],
    saveMainGrade:['masterType','masterMain'],
    saveCompanyMaster:['masterCompany'],
    saveSubGrade:['masterSub'],
    saveLocation:['masterLocation'],
    saveWaitingLocation:['masterWaitingLocation'],
    saveWorkWaitLocation:['masterWorkWaitLocation']
  };

  const categories=[
    {name:'P.O 번호',test:/P\.?O\.?\s*(번호|넘버)?/i,select:['#poNo','[id*="PoNo"]','[id*="PONo"]','[name*="poNo" i]'],words:['p.o','po번호','po 넘버','p.o 넘버']},
    {name:'S.O 번호',test:/S\.?O\.?\s*(번호|넘버)?/i,select:['#soNo','[id*="SoNo"]','[id*="SONo"]','[name*="soNo" i]'],words:['s.o','so번호','so 넘버','s.o 넘버']},
    {name:'거래처·출하처',test:/(거래처|공급사|출하처|판매처|고객사)/,select:['#company','#soCustomer','[id*="Company"]','[id*="Customer"]','[id*="Supplier"]'],words:['거래처','공급사','출하처','판매처','고객사']},
    {name:'차량번호',test:/차량번호/,select:['[id*="vehicle" i]'],words:['차량번호']},
    {name:'연락처',test:/(연락처|전화번호|기사전번)/,select:['[id*="phone" i]','[id*="contact" i]'],words:['연락처','전화번호','기사전번']},
    {name:'1작업자',test:/1작업자/,select:['#handoverWorker1'],words:['1작업자']},
    {name:'2작업자',test:/2작업자/,select:['#handoverWorker2'],words:['2작업자']},
    {name:'작업자·검수자',test:/(?:^|[^12])작업자|검수자/,select:['#inspector','[id*="Worker"]','[id*="worker"]','[id*="Inspector"]'],words:['작업자','검수자']},
    {name:'품종',test:/품종/,select:['#finalType','[id^="inspectionType-"]','#editFinalType','#bagType','[id*="ProductType"]'],words:['품종']},
    {name:'최종강종·강종',test:/(최종\s*강종|검수\s*강종|강종명|(?:^|[^소])강종)/,select:['#finalMain','[id^="inspectionMain-"]','#editFinalMain','#grade','#soGrade','#bagMain','[id*="Grade"]'],words:['최종 강종','최종강종','검수 강종','강종명','강종']},
    {name:'소강종',test:/소강종/,select:['#finalSub','[id^="inspectionSub-"]','#editFinalSub','#bagSub','[id*="SubGrade"]'],words:['소강종']},
    {name:'중량',test:/(중량|수량|G\/W|N\/W|GW|NW)/i,select:['#finalWeight','[id^="inspectionWeight-"]','#editFinalWeight','#weight','#soWeight','[id*="Weight"]','[id*="weight"]','[id*="Quantity"]'],words:['확정 중량','이동 중량','작업대기 중량','남은 예상수량','중량','수량','g/w','n/w','gw','nw']},
    {name:'날짜',test:/(날짜|일자|출하예정일|입고확정일|입항예정일)/,select:['#soDate','input[type="date"]'],words:['출하예정일','입고확정일','입항예정일','날짜','일자']},
    {name:'시간',test:/(시간|시·분)/,select:['input[type="time"]','[id*="Hour"]','[id*="Minute"]','[id*="Time"]'],words:['가공시간','확정시간','시간','시·분']},
    {name:'형상 사진',test:/(형상 사진|물품사진|작업후 사진)/,select:['#shapePhoto','[id*="ResultPhoto"]','[id*="ItemPhoto"]'],words:['형상 사진','물품사진','작업후 사진']},
    {name:'분석기 사진',test:/(분석기 사진|분석치 사진)/,select:['#analyzerPhoto','[id*="AnalyzerPhoto"]','[id*="AnalysisPhoto"]'],words:['분석기 사진','분석치 사진']},
    {name:'미작업 사진',test:/미작업 사진/,select:['#handoverPhoto'],words:['미작업 사진']},
    {name:'계근표 사진',test:/계근표 사진/,select:['[id*="weightSlip" i]'],words:['계근표 사진']},
    {name:'수정 사유',test:/수정 사유/,select:['#editReason','[id*="Reason"]'],words:['수정 사유']},
    {name:'로스 처리 사유',test:/로스 처리 사유/,select:['[id*="lossReason" i]'],words:['로스 처리 사유']},
    {name:'작업 종류',test:/작업 종류/,select:['[id*="workType" i]','[name*="workType" i]'],words:['작업 종류']},
    {name:'작업대기 장소',test:/(작업대기 장소|작업 대기장소|작업장)/,select:['[id*="workWaitLocation" i]','[id*="workLocation" i]'],words:['작업대기 장소','작업 대기장소','작업장']},
    {name:'포장대기 장소',test:/(포장대기장|포장대기 장소)/,select:['[id*="waitingLocation" i]','[id*="packingWait" i]'],words:['포장대기장','포장대기 장소']},
    {name:'이동 장소',test:/(이동장소|재고 이동장소|이동 후 장소)/,select:['[id*="moveLocation" i]','[id*="destination" i]'],words:['이동장소','재고 이동장소','이동 후 장소']},
    {name:'완료번호',test:/완료번호/,select:['[id*="bagNo" i]','[id*="completionNo" i]','[id*="completeNo" i]'],words:['완료번호']},
    {name:'상세작업지침',test:/상세작업지침/,select:['[id*="Instruction"]','[id*="instruction"]'],words:['상세작업지침']}
  ];

  function norm(value){return String(value||'').replace(/\s+/g,' ').trim().toLowerCase()}
  function isVisible(el){
    if(!el||!el.isConnected||el.disabled)return false;
    const style=getComputedStyle(el),box=el.getBoundingClientRect();
    return style.display!=='none'&&style.visibility!=='hidden'&&box.width>0&&box.height>0;
  }
  function controlText(el){
    const label=el.closest('label');
    let labelText='';
    if(label){
      const clone=label.cloneNode(true);
      clone.querySelectorAll('input,select,textarea,button,datalist,option').forEach(node=>node.remove());
      labelText=clone.textContent||'';
    }
    return norm([el.id,el.name,el.getAttribute('aria-label'),el.placeholder,labelText].filter(Boolean).join(' '));
  }
  function displayName(el,fallback='필수 입력항목'){
    const label=el.closest('label');
    if(label){
      const clone=label.cloneNode(true);
      clone.querySelectorAll('input,select,textarea,button,datalist,option,small').forEach(node=>node.remove());
      const text=String(clone.textContent||'').replace(/[＋+×]/g,' ').replace(/\s+/g,' ').trim();
      if(text)return text.replace(/\s*(검색|선택|직접 입력).*$/,'').trim()||text;
    }
    return el.getAttribute('aria-label')||el.placeholder||fallback;
  }
  function isEmpty(el){
    if(!el)return true;
    if(el.matches('input[type="checkbox"],input[type="radio"]')){
      const name=el.name;
      if(name)return !doc.querySelector(`input[name="${CSS.escape(name)}"]:checked`);
      return !el.checked;
    }
    if(el.type==='file')return !(el.files&&el.files.length)&&el.dataset.photoReady!=='1'&&!el.closest('.photo-uploaded,[data-photo-ready="1"]');
    const value=String(el.value==null?'':el.value).trim();
    if(!value)return true;
    if((el.type==='number'||/중량|수량|weight|quantity/.test(controlText(el)))&&Number(value)<=0)return true;
    return false;
  }
  function activeView(){return doc.querySelector('.view.on')||doc.body}
  function actionHandler(button){
    const raw=String(button?.getAttribute('onclick')||'');
    return raw.match(/^\s*([\w$]+)/)?.[1]||'';
  }
  function actionRoot(messageId){
    const view=activeView(),message=messageId&&doc.getElementById(messageId),button=state.lastAction;
    const messageCard=message?.closest('.card,.donecard,.domestic-step,article,form');
    const buttonCard=button?.closest('.card,.donecard,.domestic-step,article,form');
    if(messageCard&&buttonCard&&messageCard===buttonCard)return messageCard;
    if(messageCard&&messageCard.querySelectorAll('input,select,textarea').length)return messageCard;
    return view;
  }
  function allControls(root){
    return [...(root||activeView()).querySelectorAll('input:not([type="hidden"]):not([type="button"]):not([type="submit"]),select,textarea')]
      .filter(isVisible);
  }
  function addUnique(list,el,name,force=false){
    if(!el||!isVisible(el)||list.some(item=>item.el===el))return;
    if(!force&&!isEmpty(el))return;
    list.push({el,name:name||displayName(el),key:el.id||el.name||('required-'+list.length)});
  }
  function controlsForSchema(root,handler){
    const result=[];
    (schemas[handler]||[]).forEach(id=>{
      const el=doc.getElementById(id);
      if(el&&(root===doc.body||root.contains(el)))addUnique(result,el,displayName(el));
    });
    return result;
  }
  function controlsForCategory(root,category,force=false){
    const result=[];
    category.select.forEach(selector=>{
      try{root.querySelectorAll(selector).forEach(el=>addUnique(result,el,category.name,force))}catch(_){ }
    });
    if(!result.length){
      allControls(root).forEach(el=>{
        const text=controlText(el);
        if(category.words.some(word=>text.includes(norm(word))))addUnique(result,el,category.name,force);
      });
    }
    return result;
  }
  function explicitRequired(root){
    const result=[];
    allControls(root).forEach(el=>{
      const text=controlText(el);
      if(el.required||el.getAttribute('aria-required')==='true'||el.dataset.required==='true'||(text.includes('필수')&&!OPTIONAL.test(text)))addUnique(result,el,displayName(el));
    });
    return result;
  }
  function fallbackAllFields(root){
    const result=[];
    allControls(root).forEach(el=>{
      const text=controlText(el);
      if(OPTIONAL.test(text)||el.type==='search'||/검색 결과|목록 검색/.test(text))return;
      addUnique(result,el,displayName(el));
    });
    return result;
  }
  function locateMissing(message,messageId){
    const root=actionRoot(messageId),handler=actionHandler(state.lastAction),result=[];
    controlsForSchema(root,handler).forEach(item=>addUnique(result,item.el,item.name));
    const matched=categories.filter(category=>category.test.test(message));
    matched.forEach(category=>{
      const force=/(검색해 선택|선택하세요|확인하세요)/.test(message)&&!/(모든 .*행|모든 .*항목)/.test(message);
      controlsForCategory(root,category,force).forEach(item=>addUnique(result,item.el,item.name,force));
    });
    explicitRequired(root).forEach(item=>addUnique(result,item.el,item.name));
    if(!result.length&&/(모든 .*항목|모두 입력|정확히 입력)/.test(message))fallbackAllFields(root).forEach(item=>addUnique(result,item.el,item.name));
    return result.sort((a,b)=>{
      if(a.el===b.el)return 0;
      const pos=a.el.compareDocumentPosition(b.el);
      return pos&Node.DOCUMENT_POSITION_FOLLOWING?-1:1;
    });
  }
  function ensureNotice(){
    if(state.notice?.isConnected)return state.notice;
    const style=doc.createElement('style');
    style.textContent=`
      #fieldRequiredNotice{position:fixed;z-index:520;left:50%;top:max(88px,10vh);width:min(560px,calc(100vw - 24px));transform:translateX(-50%);border:3px solid #c74444;border-radius:20px;background:#fff;padding:16px 18px;box-shadow:0 18px 55px #07110e66;color:#3b1515;pointer-events:none}
      #fieldRequiredNotice[hidden]{display:none}#fieldRequiredNotice b{display:block;font-size:21px}#fieldRequiredNotice p{margin:7px 0 0;line-height:1.45;font-weight:800}#fieldRequiredNotice .required-list{color:#9a2929}#fieldRequiredNotice .required-progress{color:#176d57;font-size:14px}
      .field-required-missing{outline:4px solid #d44b4b!important;outline-offset:3px!important;background:#fff0f0!important}.field-required-current{outline-color:#f1a600!important;box-shadow:0 0 0 7px #f1a60033!important}
      @media(max-width:600px){#fieldRequiredNotice{top:82px;padding:14px 15px;border-radius:16px}#fieldRequiredNotice b{font-size:19px}}
    `;
    doc.head.appendChild(style);
    const notice=doc.createElement('div');
    notice.id='fieldRequiredNotice';notice.hidden=true;notice.setAttribute('role','alert');notice.setAttribute('aria-live','assertive');
    notice.innerHTML='<b>⚠ 필수사항을 확인해 주세요</b><p class="required-list"></p><p class="required-progress"></p>';
    doc.body.appendChild(notice);state.notice=notice;return notice;
  }
  function clearMarks(){doc.querySelectorAll('.field-required-missing,.field-required-current').forEach(el=>el.classList.remove('field-required-missing','field-required-current'))}
  function currentItems(){
    return state.queue.map(item=>{
      const el=item.el?.isConnected?item.el:(item.key?doc.getElementById(item.key):null);
      return el&&isVisible(el)?{...item,el}:null;
    }).filter(Boolean);
  }
  function focusItem(item){
    if(!item?.el)return;
    clearTimeout(state.timer);clearMarks();
    currentItems().forEach(x=>x.el.classList.add('field-required-missing'));
    item.el.classList.add('field-required-current');state.currentKey=item.key;
    const target=item.el.type==='file'?(item.el.closest('label')||item.el):item.el;
    if(target!==item.el&&!target.hasAttribute('tabindex'))target.tabIndex=-1;
    target.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'});
    state.timer=setTimeout(()=>{try{target.focus({preventScroll:true});if(item.el.select&&/^(text|number|search|tel|email|date|time)$/.test(item.el.type||'text'))item.el.select()}catch(_){ }},220);
    renderNotice();
  }
  function remainingItems(){return currentItems().filter(item=>isEmpty(item.el)||item.key===state.currentKey&&item.el.dataset.requiredForce==='1')}
  function renderNotice(message=''){
    const notice=ensureNotice(),remaining=remainingItems();
    if(!remaining.length){notice.hidden=true;return}
    const names=[...new Set(remaining.map(item=>item.name))];
    notice.querySelector('.required-list').textContent='필수사항: '+names.map((name,index)=>`${index+1}. ${name}`).join(' · ');
    const current=remaining.find(item=>item.key===state.currentKey)||remaining[0];
    notice.querySelector('.required-progress').textContent=`먼저 “${current.name}” 입력칸으로 이동합니다.${message?' · '+message:''}`;
    notice.hidden=false;
  }
  function startFlow(items,message=''){
    clearMarks();
    state.queue=items.map((item,index)=>({...item,key:item.el.id||item.key||('required-'+Date.now()+'-'+index)}));
    state.queue.forEach(item=>{item.el.classList.add('field-required-missing');if(!isEmpty(item.el))item.el.dataset.requiredForce='1'});
    const first=state.queue[0];
    if(!first){state.currentKey='';return}
    focusItem(first);renderNotice(message);
  }
  function completeCurrentAndAdvance(el){
    const item=currentItems().find(x=>x.el===el||x.key===state.currentKey);
    if(!item)return false;
    if(isEmpty(item.el))return false;
    delete item.el.dataset.requiredForce;item.el.classList.remove('field-required-missing','field-required-current');
    state.queue=state.queue.filter(x=>x.key!==item.key);
    const next=remainingItems()[0];
    if(next){focusItem(next)}else{
      state.currentKey='';ensureNotice().hidden=true;clearMarks();
      if(typeof window.showFlowToast==='function')window.showFlowToast('필수사항 입력 완료');
    }
    return true;
  }
  function guideFromError(messageId,text){
    const message=String(text||'').trim();
    if(!ACTIONABLE_ERROR.test(message)||NON_FIELD_ERROR.test(message)&&!/입력|선택|필수/.test(message))return;
    const items=locateMissing(message,messageId);
    if(items.length)startFlow(items,message);
  }
  function wrapMsg(){
    const original=window.msg;
    if(typeof original!=='function'||original.__requiredFlowWrapped)return false;
    function wrapped(id,text,error){
      const result=original.apply(this,arguments);
      if(error)queueMicrotask(()=>guideFromError(id,text));
      return result;
    }
    wrapped.__requiredFlowWrapped=true;wrapped.__original=original;window.msg=wrapped;return true;
  }
  function isSaveAction(button){
    if(!button)return false;
    const text=norm(button.textContent||button.value),handler=actionHandler(button);
    if(IGNORE_ACTION.test(text))return false;
    return SAVE_WORDS.test(text)||/^save|^confirm|^create|^addPackage$/i.test(handler);
  }

  doc.addEventListener('click',event=>{
    const button=event.target.closest('button,input[type="button"],input[type="submit"]');
    if(isSaveAction(button))state.lastAction=button;
  },true);
  doc.addEventListener('invalid',event=>{
    const root=event.target.closest('.view.on,.card,form')||activeView(),items=explicitRequired(root);
    if(items.length){event.preventDefault();startFlow(items,'필수 입력값을 확인하세요.');}
  },true);
  doc.addEventListener('change',event=>{
    const el=event.target;
    if(!state.queue.some(item=>item.el===el||item.key===el.id))return;
    setTimeout(()=>completeCurrentAndAdvance(el),80);
  },true);
  doc.addEventListener('blur',event=>{
    const el=event.target;
    if(!state.queue.some(item=>item.el===el||item.key===el.id))return;
    setTimeout(()=>completeCurrentAndAdvance(el),120);
  },true);
  window.addEventListener('keydown',event=>{
    if(event.key!=='Enter'||event.isComposing||event.shiftKey||event.ctrlKey||event.altKey||event.metaKey)return;
    const el=event.target;
    if(!state.queue.some(item=>item.el===el||item.key===el.id))return;
    event.preventDefault();event.stopImmediatePropagation();
    if(!completeCurrentAndAdvance(el)){
      const item=currentItems().find(x=>x.el===el);
      if(item)focusItem(item);
    }
  },true);

  const observer=new MutationObserver(()=>{
    wrapMsg();
    if(state.queue.length&&!currentItems().length){state.queue=[];state.currentKey='';clearMarks();if(state.notice)state.notice.hidden=true}
  });
  observer.observe(doc.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  wrapMsg();ensureNotice();
  window.__fieldRequiredFlowV1={guideFromError,startFlow,get queue(){return currentItems()},version:'20260814-1'};
})();
