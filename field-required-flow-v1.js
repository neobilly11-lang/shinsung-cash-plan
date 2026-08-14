(function fieldRequiredFlowV1(){
  'use strict';
  if(window.__fieldRequiredFlowV1)return;

  const doc=document;
  const state={lastAction:null,queue:[],currentKey:'',timer:0,notice:null};
  const SAVE_WORDS=/(????뺤젙|?깅줉|?꾨즺|?대룞|?붿껌|泥섎━|?앹꽦)/;
  const IGNORE_ACTION=/(??젣|痍⑥냼|?リ린|議고쉶|寃???좏깮|蹂닿린|誘몃━蹂닿린|?ㅼ슫濡쒕뱶|?몄뇙|異쒕젰|珥ъ쁺|?ъ쭊|QR|移댄넚|怨듭쑀|?꾩떆蹂닿?|?꾩떆???/i;
  const OPTIONAL=/(?좏깮?ы빆|?좏깮\)|?꾩슂?????꾩슂??吏곸젒 ?낅젰|硫붾え|鍮꾧퀬|?댁긽 ?ъ쭊|?곸꽭媛뺤쥌)/;
  const ACTIONABLE_ERROR=/(?낅젰?섏꽭???좏깮?섏꽭???꾩닔|紐⑤뱺 .*??ぉ|紐⑤뱺 .*???뺥솗???낅젰|珥ъ쁺?섍굅???낅줈????嫄??댁긽 ?좏깮|?됱쓣 ?섎굹 ?댁긽|0kg蹂대떎 而??댄븯?ъ빞|?쇱튂?댁빞|?깅줉??.*?좏깮|?뺤씤?섏꽭??/;
  const NON_FIELD_ERROR=/(?대? .*?깅줉|以묐났|李얠쓣 ???놁뒿?덈떎|????ㅽ뙣|HTTP|?쒕쾭|?쒓컙 珥덇낵|媛숈뒿?덈떎|?놁뒿?덈떎\.?$)/;

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
    {name:'P.O 踰덊샇',test:/P\.?O\.?\s*(踰덊샇|?섎쾭)?/i,select:['#poNo','[id*="PoNo"]','[id*="PONo"]','[name*="poNo" i]'],words:['p.o','po踰덊샇','po ?섎쾭','p.o ?섎쾭']},
    {name:'S.O 踰덊샇',test:/S\.?O\.?\s*(踰덊샇|?섎쾭)?/i,select:['#soNo','[id*="SoNo"]','[id*="SONo"]','[name*="soNo" i]'],words:['s.o','so踰덊샇','so ?섎쾭','s.o ?섎쾭']},
    {name:'嫄곕옒泥샕룹텧?섏쿂',test:/(嫄곕옒泥?怨듦툒??異쒗븯泥??먮ℓ泥?怨좉컼??/,select:['#company','#soCustomer','[id*="Company"]','[id*="Customer"]','[id*="Supplier"]'],words:['嫄곕옒泥?,'怨듦툒??,'異쒗븯泥?,'?먮ℓ泥?,'怨좉컼??]},
    {name:'李⑤웾踰덊샇',test:/李⑤웾踰덊샇/,select:['[id*="vehicle" i]'],words:['李⑤웾踰덊샇']},
    {name:'?곕씫泥?,test:/(?곕씫泥??꾪솕踰덊샇|湲곗궗?꾨쾲)/,select:['[id*="phone" i]','[id*="contact" i]'],words:['?곕씫泥?,'?꾪솕踰덊샇','湲곗궗?꾨쾲']},
    {name:'1?묒뾽??,test:/1?묒뾽??,select:['#handoverWorker1'],words:['1?묒뾽??]},
    {name:'2?묒뾽??,test:/2?묒뾽??,select:['#handoverWorker2'],words:['2?묒뾽??]},
    {name:'?묒뾽?먃룰??섏옄',test:/(?:^|[^12])?묒뾽??寃?섏옄/,select:['#inspector','[id*="Worker"]','[id*="worker"]','[id*="Inspector"]'],words:['?묒뾽??,'寃?섏옄']},
    {name:'?덉쥌',test:/?덉쥌/,select:['#finalType','[id^="inspectionType-"]','#editFinalType','#bagType','[id*="ProductType"]'],words:['?덉쥌']},
    {name:'理쒖쥌媛뺤쥌쨌媛뺤쥌',test:/(理쒖쥌\s*媛뺤쥌|寃??s*媛뺤쥌|媛뺤쥌紐?(?:^|[^??)媛뺤쥌)/,select:['#finalMain','[id^="inspectionMain-"]','#editFinalMain','#grade','#soGrade','#bagMain','[id*="Grade"]'],words:['理쒖쥌 媛뺤쥌','理쒖쥌媛뺤쥌','寃??媛뺤쥌','媛뺤쥌紐?,'媛뺤쥌']},
    {name:'?뚭컯醫?,test:/?뚭컯醫?,select:['#finalSub','[id^="inspectionSub-"]','#editFinalSub','#bagSub','[id*="SubGrade"]'],words:['?뚭컯醫?]},
    {name:'以묐웾',test:/(以묐웾|?섎웾|G\/W|N\/W|GW|NW)/i,select:['#finalWeight','[id^="inspectionWeight-"]','#editFinalWeight','#weight','#soWeight','[id*="Weight"]','[id*="weight"]','[id*="Quantity"]'],words:['?뺤젙 以묐웾','?대룞 以묐웾','?묒뾽?湲?以묐웾','?⑥? ?덉긽?섎웾','以묐웾','?섎웾','g/w','n/w','gw','nw']},
    {name:'?좎쭨',test:/(?좎쭨|?쇱옄|異쒗븯?덉젙???낃퀬?뺤젙???낇빆?덉젙??/,select:['#soDate','input[type="date"]'],words:['異쒗븯?덉젙??,'?낃퀬?뺤젙??,'?낇빆?덉젙??,'?좎쭨','?쇱옄']},
    {name:'?쒓컙',test:/(?쒓컙|?쑣룸텇)/,select:['input[type="time"]','[id*="Hour"]','[id*="Minute"]','[id*="Time"]'],words:['媛怨듭떆媛?,'?뺤젙?쒓컙','?쒓컙','?쑣룸텇']},
    {name:'?뺤긽 ?ъ쭊',test:/(?뺤긽 ?ъ쭊|臾쇳뭹?ъ쭊|?묒뾽???ъ쭊)/,select:['#shapePhoto','[id*="ResultPhoto"]','[id*="ItemPhoto"]'],words:['?뺤긽 ?ъ쭊','臾쇳뭹?ъ쭊','?묒뾽???ъ쭊']},
    {name:'遺꾩꽍湲??ъ쭊',test:/(遺꾩꽍湲??ъ쭊|遺꾩꽍移??ъ쭊)/,select:['#analyzerPhoto','[id*="AnalyzerPhoto"]','[id*="AnalysisPhoto"]'],words:['遺꾩꽍湲??ъ쭊','遺꾩꽍移??ъ쭊']},
    {name:'誘몄옉???ъ쭊',test:/誘몄옉???ъ쭊/,select:['#handoverPhoto'],words:['誘몄옉???ъ쭊']},
    {name:'怨꾧렐???ъ쭊',test:/怨꾧렐???ъ쭊/,select:['[id*="weightSlip" i]'],words:['怨꾧렐???ъ쭊']},
    {name:'?섏젙 ?ъ쑀',test:/?섏젙 ?ъ쑀/,select:['#editReason','[id*="Reason"]'],words:['?섏젙 ?ъ쑀']},
    {name:'濡쒖뒪 泥섎━ ?ъ쑀',test:/濡쒖뒪 泥섎━ ?ъ쑀/,select:['[id*="lossReason" i]'],words:['濡쒖뒪 泥섎━ ?ъ쑀']},
    {name:'?묒뾽 醫낅쪟',test:/?묒뾽 醫낅쪟/,select:['[id*="workType" i]','[name*="workType" i]'],words:['?묒뾽 醫낅쪟']},
    {name:'?묒뾽?湲??μ냼',test:/(?묒뾽?湲??μ냼|?묒뾽 ?湲곗옣???묒뾽??/,select:['[id*="workWaitLocation" i]','[id*="workLocation" i]'],words:['?묒뾽?湲??μ냼','?묒뾽 ?湲곗옣??,'?묒뾽??]},
    {name:'?ъ옣?湲??μ냼',test:/(?ъ옣?湲곗옣|?ъ옣?湲??μ냼)/,select:['[id*="waitingLocation" i]','[id*="packingWait" i]'],words:['?ъ옣?湲곗옣','?ъ옣?湲??μ냼']},
    {name:'?대룞 ?μ냼',test:/(?대룞?μ냼|?ш퀬 ?대룞?μ냼|?대룞 ???μ냼)/,select:['[id*="moveLocation" i]','[id*="destination" i]'],words:['?대룞?μ냼','?ш퀬 ?대룞?μ냼','?대룞 ???μ냼']},
    {name:'?꾨즺踰덊샇',test:/?꾨즺踰덊샇/,select:['[id*="bagNo" i]','[id*="completionNo" i]','[id*="completeNo" i]'],words:['?꾨즺踰덊샇']},
    {name:'?곸꽭?묒뾽吏移?,test:/?곸꽭?묒뾽吏移?,select:['[id*="Instruction"]','[id*="instruction"]'],words:['?곸꽭?묒뾽吏移?]}
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
  function displayName(el,fallback='?꾩닔 ?낅젰??ぉ'){
    const label=el.closest('label');
    if(label){
      const clone=label.cloneNode(true);
      clone.querySelectorAll('input,select,textarea,button,datalist,option,small').forEach(node=>node.remove());
      const text=String(clone.textContent||'').replace(/[竊?횞]/g,' ').replace(/\s+/g,' ').trim();
      if(text)return text.replace(/\s*(寃???좏깮|吏곸젒 ?낅젰).*$/,'').trim()||text;
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
    if((el.type==='number'||/以묐웾|?섎웾|weight|quantity/.test(controlText(el)))&&Number(value)<=0)return true;
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
      if(el.required||el.getAttribute('aria-required')==='true'||el.dataset.required==='true'||(text.includes('?꾩닔')&&!OPTIONAL.test(text)))addUnique(result,el,displayName(el));
    });
    return result;
  }
  function fallbackAllFields(root){
    const result=[];
    allControls(root).forEach(el=>{
      const text=controlText(el);
      if(OPTIONAL.test(text)||el.type==='search'||/寃??寃곌낵|紐⑸줉 寃??.test(text))return;
      addUnique(result,el,displayName(el));
    });
    return result;
  }
  function locateMissing(message,messageId){
    const root=actionRoot(messageId),handler=actionHandler(state.lastAction),result=[];
    controlsForSchema(root,handler).forEach(item=>addUnique(result,item.el,item.name));
    const matched=categories.filter(category=>category.test.test(message));
    matched.forEach(category=>{
      const force=/(寃?됲빐 ?좏깮|?좏깮?섏꽭???뺤씤?섏꽭??/.test(message)&&!/(紐⑤뱺 .*??紐⑤뱺 .*??ぉ)/.test(message);
      controlsForCategory(root,category,force).forEach(item=>addUnique(result,item.el,item.name,force));
    });
    explicitRequired(root).forEach(item=>addUnique(result,item.el,item.name));
    if(!result.length&&/(紐⑤뱺 .*??ぉ|紐⑤몢 ?낅젰|?뺥솗???낅젰)/.test(message))fallbackAllFields(root).forEach(item=>addUnique(result,item.el,item.name));
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
    notice.innerHTML='<b>???꾩닔?ы빆???뺤씤??二쇱꽭??/b><p class="required-list"></p><p class="required-progress"></p>';
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
    notice.querySelector('.required-list').textContent='?꾩닔?ы빆: '+names.map((name,index)=>`${index+1}. ${name}`).join(' 쨌 ');
    const current=remaining.find(item=>item.key===state.currentKey)||remaining[0];
    notice.querySelector('.required-progress').textContent=`癒쇱? ??{current.name}???낅젰移몄쑝濡??대룞?⑸땲??${message?' 쨌 '+message:''}`;
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
      if(typeof window.showFlowToast==='function')window.showFlowToast('?꾩닔?ы빆 ?낅젰 ?꾨즺');
    }
    return true;
  }
  function guideFromError(messageId,text){
    const message=String(text||'').trim();
    if(!ACTIONABLE_ERROR.test(message)||NON_FIELD_ERROR.test(message)&&!/?낅젰|?좏깮|?꾩닔/.test(message))return;
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
    if(items.length){event.preventDefault();startFlow(items,'?꾩닔 ?낅젰媛믪쓣 ?뺤씤?섏꽭??');}
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

