(function importPackageSplitV1(root){
  'use strict';
  if(root.__importPackageSplitV1)return;
  root.__importPackageSplitV1=true;
  if(!document.getElementById('importPackageSplitV1Style')){
    var style=document.createElement('style');style.id='importPackageSplitV1Style';style.textContent='.import-method-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.split-mode-button{background:#ffe8b2!important;color:#684600!important;border:2px solid #edae2e!important}.import-split-card{border:2px solid var(--line)}.import-split-card.selected{border-color:var(--green);box-shadow:0 0 0 4px #16856f22}.import-split-editor{margin-top:18px;border:3px solid var(--green)}.import-split-row{display:grid;grid-template-columns:minmax(130px,1fr) minmax(180px,2fr) auto;gap:10px;align-items:end;padding:12px 0;border-bottom:1px solid var(--line)}.import-split-row b{font-size:19px}.split-over-message{min-height:28px;margin:10px 0;color:var(--red);font-weight:900}@media(max-width:760px){.import-method-grid{grid-template-columns:1fr}.import-split-row{grid-template-columns:1fr}.import-split-row .btn{width:100%}}';document.head.appendChild(style);
  }
  var splitSourceNo='',splitParts=[];
  function focusSplitWeight(index,delay){
    setTimeout(function(){
      var input=E('importSplitWeight'+index);if(!input)return;
      input.scrollIntoView({behavior:'smooth',block:'center'});
      setTimeout(function(){try{input.focus({preventScroll:true});}catch(_){input.focus();}try{input.select();}catch(_){}},180);
    },delay||40);
  }
  function queueSplitDraft(){if(typeof queueWorkflowDraftStructuralSave==='function')queueWorkflowDraftStructuralSave('importReceiptSplit');}
  root.importPackageSplitDraftContext=function(){return splitSourceNo||selectedImportPoNo||'';};
  root.importPackageSplitDraftSnapshot=function(){return{sourceNo:splitSourceNo,parts:splitParts.slice(),poNo:selectedImportPoNo||''};};
  root.restoreImportPackageSplitDraft=function(snapshot){
    if(!snapshot||!snapshot.sourceNo)return false;
    if(snapshot.poNo)selectedImportPoNo=snapshot.poNo;
    splitSourceNo=String(snapshot.sourceNo||'');splitParts=(Array.isArray(snapshot.parts)?snapshot.parts:[]).map(round2);
    if(!activeSource(splitSourceNo)){splitSourceNo='';splitParts=[];return false;}
    renderImportSplitList();return true;
  };
  function activeSource(no){return state.pos.find(function(row){return row.packageNo===no&&row.status!=='CANCELLED'&&!row.receivedAt&&row.receiptStatus!=='RECEIVED';});}
  function round2(value){return Math.round(num(value)*100)/100;}
  function visibleGrade(value){var text=String(value||'').trim();return Array.from(text).length>=10?'그 외':text||'미지정';}
  function ensureUi(){
    if(E('importReceiptSplit'))return;
    var anchor=E('importReceiptDirect')||E('importReceiptMethod');
    anchor.insertAdjacentHTML('afterend',`<section id="importReceiptSplit" class="view"><p class="eyebrow">수입입고 수행 · 패키지 나누기</p><h1 id="importSplitTitle">패키지 나누기</h1><button class="btn" type="button" onclick="openImportReceiptMethod(selectedImportPoNo)">← 입고방법 선택</button><div id="importSplitCounts" class="import-receipt-count"></div><div class="card"><label>사내입고번호·거래처·강종 검색<input id="importSplitSearch" placeholder="나눌 패키지 검색" oninput="renderImportSplitList()"></label></div><div id="importSplitList"></div><div id="importSplitEditor"></div><div id="importSplitMsg" class="msg"></div></section>`);
  }
  function decorateMethod(){
    ensureUi();var choices=E('importReceiptMethodChoices');if(!choices||E('importReceiptSplitMethodButton'))return;
    choices.insertAdjacentHTML('beforeend','<button id="importReceiptSplitMethodButton" class="btn split-mode-button" type="button" onclick="openImportPackageSplit()">✂ 패키지 나누기</button>');
  }
  function waiting(){return importWaitingPackages().filter(function(row){return !selectedImportPoNo||row.poNo===selectedImportPoNo;});}
  root.openImportPackageSplit=function(poNo){
    if(poNo)selectedImportPoNo=poNo;splitSourceNo='';splitParts=[];ensureUi();renderImportSplitList();show('importReceiptSplit');
    requestAnimationFrame(function(){E('importSplitSearch')?.focus();});
  };
  root.renderImportSplitList=function(){
    ensureUi();var all=waiting(),q=String(E('importSplitSearch')?.value||'').trim().toLowerCase(),rows=all.filter(function(row){return !q||[row.packageNo,row.packingPackageNo,row.poNo,row.company,row.grade].some(function(value){return String(value||'').toLowerCase().includes(q);});});
    if(E('importSplitTitle'))E('importSplitTitle').textContent=(selectedImportPoNo||'수입입고')+' 패키지 나누기';
    if(E('importSplitCounts'))E('importSplitCounts').innerHTML='<div><small>나누기 가능</small><b>'+all.length+'건</b></div><div><small>검색결과</small><b>'+rows.length+'건</b></div><div><small>선택</small><b>'+(splitSourceNo||'-')+'</b></div>';
    if(E('importSplitList'))E('importSplitList').innerHTML=rows.length?rows.map(function(row){return '<article class="donecard import-split-card '+(row.packageNo===splitSourceNo?'selected':'')+'"><span class="status-chip warn">입고대기</span><h2>'+esc(row.packageNo)+' · '+esc(row.company)+'</h2><p>거래처 패키지 '+esc(row.packingPackageNo||'-')+' · 강종 '+esc(visibleGrade(row.grade))+'</p><div class="summary"><div><small>G/W</small><b>'+kg(row.grossWeight||row.weight)+'</b></div><div><small>N/W</small><b>'+kg(row.netWeight||row.weight)+'</b></div></div><button class="btn primary" type="button" data-split-source="'+esc(row.packageNo)+'" onclick="selectImportSplitSource(this.dataset.splitSource)">이 패키지 쪼개기</button></article>';}).join(''):'<div class="card">나누기 가능한 수입입고대기 패키지가 없습니다.</div>';
    renderImportSplitEditor();
  };
  root.selectImportSplitSource=function(no){
    var source=activeSource(no);if(!source)return msg('importSplitMsg','입고완료되었거나 찾을 수 없는 패키지입니다.',true);
    splitSourceNo=no;var total=round2(source.netWeight||source.weight),half=round2(total/2);splitParts=[half,round2(total-half)];renderImportSplitList();
    queueSplitDraft();requestAnimationFrame(function(){E('importSplitEditor')?.scrollIntoView({behavior:'smooth',block:'start'});focusSplitWeight(0,20);});
  };
  root.addImportSplitPart=function(){splitParts.push(0);var index=splitParts.length-1;renderImportSplitEditor();queueSplitDraft();focusSplitWeight(index,40);};
  root.removeImportSplitPart=function(index){if(splitParts.length<=2)return msg('importSplitMsg','패키지 나누기는 최소 2개가 필요합니다.',true);splitParts.splice(index,1);renderImportSplitEditor();queueSplitDraft();};
  root.updateImportSplitWeight=function(index,value){splitParts[index]=round2(value);renderImportSplitTotals();};
  function splitValues(){return splitParts.map(round2).filter(function(value){return value>0;});}
  function splitSummary(){var source=activeSource(splitSourceNo),total=round2(source&&(source.netWeight||source.weight)),used=round2(splitValues().reduce(function(sum,value){return sum+value;},0));return{source:source,total:total,used:used,remain:round2(total-used)};}
  function renderImportSplitTotals(){
    var info=splitSummary(),target=E('importSplitTotals');if(!target)return;
    target.innerHTML='<div><small>원 N/W</small><b>'+kg(info.total)+'</b></div><div><small>분할 합계</small><b>'+kg(info.used)+'</b></div><div><small>남은 중량</small><b style="color:'+(info.remain<0?'var(--red)':info.remain>0?'#a56300':'var(--green)')+'">'+kg(info.remain)+'</b></div>';
    if(E('importSplitExactButton'))E('importSplitExactButton').disabled=info.remain!==0||splitValues().length<2;
    if(E('importSplitLossButton')){E('importSplitLossButton').disabled=info.remain<=0||splitValues().length<2;E('importSplitLossButton').textContent=info.remain>0?'남은 '+kg(info.remain)+' 로스처리 후 완료':'남은 중량 로스처리 후 완료';}
    if(E('importSplitOver'))E('importSplitOver').textContent=info.remain<0?'원래 N/W보다 '+kg(Math.abs(info.remain))+' 초과하여 저장할 수 없습니다.':'';
  }
  function renderImportSplitEditor(){
    var target=E('importSplitEditor'),source=activeSource(splitSourceNo);if(!target)return;if(!source){target.innerHTML='';return;}
    target.innerHTML='<div class="card import-split-editor"><h2>'+esc(source.packageNo)+' 분할 중량 입력</h2><p>각 파생번호의 N/W를 입력하세요. 합계는 원 N/W를 넘을 수 없습니다.</p><div id="importSplitPartRows">'+splitParts.map(function(value,index){return '<div class="import-split-row"><b>'+esc(source.packageNo+'-'+(index+1))+'</b><label>N/W(kg)<input id="importSplitWeight'+index+'" type="number" inputmode="decimal" min="0" step="0.01" value="'+esc(value)+'" oninput="updateImportSplitWeight('+index+',this.value)"></label><button class="btn danger" type="button" onclick="removeImportSplitPart('+index+')">삭제</button></div>';}).join('')+'</div><button class="btn" type="button" onclick="addImportSplitPart()">＋ 분할 행 추가</button><div id="importSplitTotals" class="import-receipt-count"></div><div id="importSplitOver" class="split-over-message"></div><div class="grid"><button id="importSplitExactButton" class="homebtn green" type="button" onclick="saveImportPackageSplit(false)"><span>합계가 원 중량과 같을 때</span><strong>패키지 나누기 완료</strong></button><button id="importSplitLossButton" class="homebtn" style="border:3px solid #d55454" type="button" onclick="saveImportPackageSplit(true)"><span>남은 중량이 있을 때</span><strong>로스처리 후 완료</strong></button></div></div>';
    renderImportSplitTotals();
  }
  root.saveImportPackageSplit=async function(withLoss){
    var info=splitSummary(),parts=splitValues();if(!info.source)return msg('importSplitMsg','나눌 패키지를 다시 선택하세요.',true);if(parts.length<2)return msg('importSplitMsg','0kg보다 큰 분할중량을 최소 2개 입력하세요.',true);if(info.remain<0)return msg('importSplitMsg','분할 합계가 원래 중량을 넘었습니다.',true);if(!withLoss&&info.remain!==0)return msg('importSplitMsg','남은 중량이 있습니다. 로스처리 후 완료를 누르세요.',true);if(withLoss&&info.remain<=0)return msg('importSplitMsg','남은 중량이 있을 때만 로스처리를 사용할 수 있습니다.',true);
    var backup=stateClone(state),source=info.source,originalNo=source.packageNo,createdAt=new Date().toISOString(),existingNos=new Set(state.pos.map(function(row){return row.packageNo;})),suffix=0,names=[];
    while(names.length<parts.length){suffix++;var candidate=originalNo+'-'+suffix;if(!existingNos.has(candidate)){names.push(candidate);existingNos.add(candidate);}}
    var originalNw=round2(source.netWeight||source.weight),originalGw=round2(source.grossWeight||source.weight),ratio=originalNw>0?originalGw/originalNw:1,children=parts.map(function(weight,index){var child=Object.assign({},source,{id:crypto.randomUUID(),parentPackageNo:originalNo,packageNo:names[index],packingPackageNo:source.packingPackageNo?(source.packingPackageNo+'-'+(index+1)):'',weight:weight,netWeight:weight,grossWeight:round2(weight*ratio),receiptStatus:'WAITING',inspectionStatus:'NOT_RECEIVED',receivedAt:'',createdAt:createdAt,updatedAt:createdAt,splitIndex:index+1,splitCount:parts.length,splitByName:currentUserName(),status:'CONFIRMED'});delete child.cancelledAt;delete child.cancelReason;return child;});
    if(info.remain===0&&children.length){var previous=children.slice(0,-1).reduce(function(sum,row){return sum+num(row.grossWeight);},0);children[children.length-1].grossWeight=round2(originalGw-previous);}
    source.status='CANCELLED';source.cancelledAt=createdAt;source.cancelReason='수입입고 패키지 나누기';source.splitInto=names;source.splitLossWeight=withLoss?info.remain:0;state.pos.push.apply(state.pos,children);
    if(withLoss){state.losses=safeArray(state.losses);state.losses.push({id:crypto.randomUUID(),packageNo:originalNo,poNo:source.poNo,company:source.company,grade:source.grade,weight:info.remain,type:'IMPORT_PACKAGE_SPLIT_LOSS',reason:'수입입고 패키지 나누기 남은 중량 로스',status:'CONFIRMED',operatorName:currentUserName(),createdAt:createdAt});}
    safeArray(state.purchaseRequests).filter(function(request){return request.id===source.inboundRequestId||request.poNo===source.poNo;}).forEach(function(request){var next=[];safeArray(request.items).forEach(function(item){var legacyMatch=!item.internalPackageNo&&source.packingPackageNo&&item.packageNo===source.packingPackageNo;if(item.internalPackageNo===originalNo||legacyMatch){children.forEach(function(child,index){next.push(Object.assign({},item,{internalPackageNo:child.packageNo,packageNo:child.packingPackageNo||item.packageNo,nw:child.netWeight,gw:child.grossWeight,splitParentPackageNo:originalNo,splitIndex:index+1}));});}else next.push(item);});request.items=next;request.updatedAt=createdAt;});
    state.auditLogs=safeArray(state.auditLogs);state.auditLogs.push({id:crypto.randomUUID(),action:'IMPORT_PACKAGE_SPLIT',poNo:source.poNo,packageNo:originalNo,label:originalNo+' → '+names.join(', '),note:(withLoss?'로스 '+info.remain+'kg · ':'')+'분할 '+parts.join('kg, ')+'kg',operatorName:currentUserName(),createdAt:createdAt});
    beginSaveProgress('패키지 나누기 저장 중',originalNo+' 분할자료를 공용 서버에 저장하고 있습니다.');
    try{await saveState();splitSourceNo='';splitParts=[];renderImportReceiptHomeCount();renderImportSplitList();showFlowToast(originalNo+' 패키지 나누기 완료 · '+names.join(', '));msg('importSplitMsg',(withLoss?'남은 '+kg(info.remain)+' 로스처리 · ':'')+names.length+'개 파생 패키지 저장완료');}
    catch(error){state=defaults(backup);renderAll();msg('importSplitMsg','패키지 나누기 저장 실패: '+error.message,true);}finally{endSaveProgress();}
  };
  var saveSplitBeforeDraftCleanup=root.saveImportPackageSplit;
  root.saveImportPackageSplit=async function(){var sourceBefore=splitSourceNo,poBefore=selectedImportPoNo,result=await saveSplitBeforeDraftCleanup.apply(this,arguments);if(sourceBefore&&!splitSourceNo&&typeof clearWorkflowDrafts==='function')clearWorkflowDrafts(1,[sourceBefore,poBefore]);return result;};
  if(typeof root.workflowDraftViewLabel==='function'){
    var splitDraftLabelBefore=root.workflowDraftViewLabel;
    root.workflowDraftViewLabel=function(viewId){return viewId==='importReceiptSplit'?'패키지 쪼개기':splitDraftLabelBefore.apply(this,arguments);};
    try{workflowDraftViewLabel=root.workflowDraftViewLabel;}catch(_){}
  }
  var renderMethodBefore=root.renderImportReceiptMethod;
  root.renderImportReceiptMethod=function(){var result=renderMethodBefore.apply(this,arguments);decorateMethod();return result;};
  try{renderImportReceiptMethod=root.renderImportReceiptMethod;}catch(_){ }
  var showBefore=root.show;
  root.show=function(id){var result=showBefore.apply(this,arguments);if(id==='importReceiptMethod')decorateMethod();if(id==='importReceiptSplit')renderImportSplitList();return result;};
  try{show=root.show;}catch(_){ }
  ensureUi();decorateMethod();
  document.documentElement.dataset.importPackageSplitV1='ready';
})(window);
