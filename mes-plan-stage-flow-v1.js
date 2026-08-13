(function(){
  'use strict';
  if(window.__mesPlanStageFlowV1)return;
  window.__mesPlanStageFlowV1=true;

  function list(value){return Array.isArray(value)?value:[];}
  function text(value){return String(value==null?'':value).trim();}
  function number(value){var parsed=Number(String(value==null?'':value).replace(/,/g,''));return Number.isFinite(parsed)?parsed:0;}
  function upper(value){return text(value).toUpperCase();}
  function encoded(value){return encodeURIComponent(text(value));}
  function missing(value){return text(value)||'<span class="stage-missing">기입요망</span>';}
  function stageLabel(status,type){
    status=upper(status);
    if(type==='inbound')return status==='CONFIRMED'?'입고예정확정':status==='REQUESTED'?'입고요청':'입항예정';
    return status==='CONFIRMED'?'상차예정확정':status==='REQUESTED'?'배차요청':'출하요청';
  }
  function nextStatus(oldStatus,planned){return['REQUESTED','CONFIRMED'].includes(upper(oldStatus))?upper(oldStatus):planned;}
  function stageRequestRows(){
    var rows=window.mesInboundRequestRows?window.mesInboundRequestRows():list(state.purchaseRequests);
    return rows.filter(function(row){return !['CANCELLED','CANCELED','DELETED'].includes(upper(row.status));}).map(function(row){
      var items=list(row.items),arrivalDate=text(row.arrivalPlanDate||row.expectedArrivalDate||items[0]&&items[0].arrivalPlanDate);
      return Object.assign({},row,{
        arrivalPlanDate:arrivalDate,
        requestDate:text(row.requestDate),
        confirmedDate:text(row.confirmedInboundDate||row.inboundConfirmedDate),
        confirmedTime:text(row.confirmedInboundTime||row.inboundConfirmedTime),
        stageStatus:upper(row.status)||'PLANNED',
        packageCount:items.length,
        totalGw:items.reduce(function(sum,item){return sum+number(item.gw||item.grossWeight);},0),
        totalNw:items.reduce(function(sum,item){return sum+number(item.nw||item.netWeight||item.weight);},0),
        savedAt:row.updatedAt||row.createdAt||row.arrivalPlannedAt||''
      });
    }).sort(function(a,b){return text(b.arrivalPlanDate||b.requestDate||b.savedAt).localeCompare(text(a.arrivalPlanDate||a.requestDate||a.savedAt));});
  }
  function inboundById(id){return stageRequestRows().find(function(row){return text(row.id)===text(id)||text(row.requestNo)===text(id)||text(row.poNo)===text(id);});}
  function inboundActionHtml(row){
    var id=encoded(row.id||row.requestNo),requestDone=['REQUESTED','CONFIRMED'].includes(row.stageStatus),confirmDone=row.stageStatus==='CONFIRMED';
    return "<div class='stage-actions'><button class='btn stage-request "+(requestDone?'done':'')+"' onclick=\"event.stopPropagation();openInboundStageRequest(decodeURIComponent('"+id+"'))\">"+(requestDone?'입고요청 수정':'입고요청')+"</button><button class='btn stage-confirm "+(confirmDone?'done':'')+"' onclick=\"event.stopPropagation();openInboundStageConfirm(decodeURIComponent('"+id+"'))\">"+(confirmDone?'입고확정 수정':'입고예정확정')+"</button></div>";
  }

  var mesSchemas=typeof schemas!=='undefined'?schemas:window.schemas;
  if(mesSchemas&&mesSchemas.inboundRequest){
    mesSchemas.inboundRequest.rows=stageRequestRows;
    mesSchemas.inboundRequest.cols=[
      ['예정번호',function(row){return row.requestNo||'-';},'link'],['P.O',function(row){return row.poNo||'-';}],['구분',function(row){return row.importType==='OVERSEAS'?'해외입고':'국내입고';}],
      ['거래처',function(row){return row.company||'-';},'left'],['거래처 강종명',function(row){return row.gradeSummary||'-';},'left'],['입항예정일',function(row){return row.arrivalPlanDate||'-';}],
      ['입고요청일',function(row){return row.requestDate||'-';}],['입고확정일시',function(row){return row.confirmedDate?(row.confirmedDate+' '+row.confirmedTime):'-';}],['컨테이너',function(row){return row.containerSize||'-';}],
      ['차량번호',function(row){return missing(row.vehicleNo);}],['연락처',function(row){return missing(row.contact);}],['패키지',function(row){return row.packageCount+'개';}],
      ['G/W',function(row){return fmt(row.totalGw)+' kg';}],['N/W',function(row){return fmt(row.totalNw)+' kg';}],['단계',function(row){return status(stageLabel(row.stageStatus,'inbound'));}],
      ['작업자',function(row){return row.operatorName||'-';}],['진행',inboundActionHtml]
    ];
  }

  window.openInboundRequestBuilder=function(poNo){
    var po=poRows().find(function(row){return text(row.poNo)===text(poNo);});if(!po)return toast('P.O 자료를 찾지 못했습니다.',true);
    $('modalTitle').textContent=poNo+' · 입항예정 등록';
    $('modalBody').innerHTML="<div class='request-summary'><div><small>P.O</small><b>"+esc(po.poNo)+"</b></div><div><small>거래처</small><b>"+esc(po.company)+"</b></div><div><small>품목</small><b>"+po.rows.length+"개</b></div><div><small>계획 N/W</small><b>"+fmt(po.nw)+" kg</b></div></div><p>입항예정 PACKING LIST 입력 방법을 선택하세요.</p><div class='request-mode-grid'><button class='request-mode-card' onclick=\"openPackingRequestDirect(decodeURIComponent('"+encoded(poNo)+"'))\"><b>PACKING LIST 직접입력</b><span>P.O 품목을 불러온 뒤 패키지번호·G/W·N/W·포장종류를 직접 수정합니다.</span></button><button class='request-mode-card' onclick=\"openPackingRequestUpload(decodeURIComponent('"+encoded(poNo)+"'))\"><b>업로드로 자동완성</b><span>PDF·Excel·사진파일에서 강종과 중량을 읽어 자동으로 입력합니다.</span></button></div>";
    $('modal').classList.add('on');
  };

  function stagePackingLineHtml(row,index){
    row=row||{};
    return "<div class='line-editor packing-request-line'><div class='line-editor-head'><b>패키지 "+(index+1)+"</b><button type='button' class='btn danger' onclick='this.closest(\".packing-request-line\").remove();updatePackingRequestTotals()'>삭제</button></div><div class='form-grid'><label>Package No.<input name='packageNo' value='"+esc(row.packageNo||'')+"'></label><label>강종<input name='grade' value='"+esc(row.grade||'')+"' required></label><label>G/W(kg)<input name='gw' type='number' step='0.01' value='"+esc(row.gw||row.weight||'')+"' oninput='updatePackingRequestTotals()'></label><label>N/W(kg)<input name='nw' type='number' step='0.01' value='"+esc(row.nw||row.weight||'')+"' oninput='updatePackingRequestTotals()'></label><label>포장 종류<input name='packingType' value='"+esc(row.packingType||'')+"'></label><label>비고<input name='memo' value='"+esc(row.memo||'')+"'></label></div></div>";
  }
  function stageRequestDefaultItems(po){return list(po&&po.rows).map(function(row){return{packageNo:row.packingPackageNo||'',grade:row.grade||'',gw:number(row.grossWeight||row.weight),nw:number(row.netWeight||row.weight),packingType:row.packingType||'',memo:row.packingMemo||''};});}
  function stageNextRequestNo(){var day=nowDate().replace(/-/g,''),max=0;list(state.purchaseRequests).forEach(function(row){var match=text(row.requestNo).match(new RegExp('^IR-'+day+'-(\\d+)$'));if(match)max=Math.max(max,number(match[1]));});return 'IR-'+day+'-'+String(max+1).padStart(3,'0');}

  window.renderPackingRequestForm=function(po,items){
    var saved=inboundById(po.poNo)||{},arrivalDate=saved.arrivalPlanDate||po.expected||nowDate();
    $('modalTitle').textContent=po.poNo+' · 입항예정 작성';
    $('modalBody').innerHTML="<form id='inboundRequestForm' class='form-grid' onsubmit=\"saveInboundArrivalPlan(event,this,decodeURIComponent('"+encoded(po.poNo)+"'))\"><label>입고 구분<select name='importType'><option value='DOMESTIC' "+((saved.importType||po.rows[0]&&po.rows[0].type)==='DOMESTIC'?'selected':'')+">국내입고</option><option value='OVERSEAS' "+((saved.importType||po.rows[0]&&po.rows[0].type)!=='DOMESTIC'?'selected':'')+">해외입고</option></select></label><label>입항예정일 <b class='stage-required'>필수</b><input name='arrivalPlanDate' type='date' required value='"+esc(arrivalDate)+"'></label><div id='packingRequestLines' class='packing-request-lines'>"+items.map(stagePackingLineHtml).join('')+"</div><div class='wide actions'><button type='button' class='btn' onclick='addPackingRequestLine()'>+ 패키지 행 추가</button><button class='btn primary'>입항예정 저장</button><button type='button' class='btn' onclick=\"openInboundRequestBuilder(decodeURIComponent('"+encoded(po.poNo)+"'))\">← 입력방법 선택</button></div></form>";
    $('modal').classList.add('on');updatePackingRequestTotals();setTimeout(function(){$('inboundRequestForm')&&$('inboundRequestForm').querySelector('[name=arrivalPlanDate]')&&$('inboundRequestForm').querySelector('[name=arrivalPlanDate]').focus();},70);
  };
  window.openPackingRequestDirect=function(poNo){
    var po=poRows().find(function(row){return text(row.poNo)===text(poNo);}),saved=inboundById(poNo);
    if(!po)return toast('P.O 자료를 찾지 못했습니다.',true);
    window.renderPackingRequestForm(po,saved&&list(saved.items).length?saved.items:stageRequestDefaultItems(po));
  };
  window.addPackingRequestLine=function(){var holder=$('packingRequestLines'),index=holder.querySelectorAll('.packing-request-line').length;holder.insertAdjacentHTML('beforeend',stagePackingLineHtml({},index));holder.lastElementChild.scrollIntoView({behavior:'smooth',block:'center'});};
  window.openPackingRequestUpload=function(poNo){
    $('modalTitle').textContent=poNo+' · 입항예정 PACKING LIST 자동완성';
    $('modalBody').innerHTML="<div class='document-upload'><b>PDF · Excel · 사진파일 업로드</b><p>거래처 PACKING LIST의 강종과 G/W·N/W를 읽어 입항예정 입력란을 자동완성합니다.</p><input type='file' accept='.pdf,.xlsx,.xls,image/*' onchange=\"analyzePackingRequestFile(decodeURIComponent('"+encoded(poNo)+"'),this.files[0])\"></div><div class='actions'><button class='btn' onclick=\"openInboundRequestBuilder(decodeURIComponent('"+encoded(poNo)+"'))\">← 입력방법 선택</button></div>";
  };
  window.analyzePackingRequestFile=async function(poNo,file){
    if(!file)return;$('progress').classList.add('on');
    try{
      var importer=window.MesDocumentImporterV4||window.__mesDocumentImporterV4;
      if(!importer||typeof importer.importFile!=='function')throw Error('PACKING LIST 공용 분석기를 불러오지 못했습니다. 새로고침 후 다시 시도하세요.');
      var documentData=await importer.importFile(file),parsed={rows:list(documentData.items).map(function(item){return{packageNo:item.packageNo||'',grade:item.matchedMarking||item.marking||'',gw:number(item.grossWeight||item.weight),nw:number(item.netWeight||item.weight),packingType:item.packingType||documentData.packing||'',memo:item.memo||'',packageCount:number(item.packageCount)||1};})};
      var po=poRows().find(function(row){return text(row.poNo)===text(poNo);}),defaults=stageRequestDefaultItems(po);
      var items=list(parsed.rows).map(function(row,index){var base=defaults[index]||(defaults.length===1?defaults[0]:{});return{packageNo:row.packageNo||base.packingPackageNo||base.packageNo||'',grade:row.grade||base.grade||'',gw:number(row.gw||row.weight),nw:number(row.nw||row.weight),packingType:row.packingType||base.packingType||'',memo:row.memo||'',packageCount:number(row.packageCount)||1};});
      if(!items.length)throw Error('강종과 중량을 찾지 못했습니다.');
      window.renderPackingRequestForm(po,items);toast('PACKING LIST 자동완성 완료 · 입항예정일을 확인하세요.');
    }catch(error){toast('PACKING LIST 자동완성 실패: '+error.message,true);}
    finally{$('progress').classList.remove('on');setSync('공용 서버 연결됨');}
  };

  function packingItems(form){return Array.from(form.querySelectorAll('.packing-request-line')).map(function(line){return{packageNo:line.querySelector('[name=packageNo]').value.trim(),grade:line.querySelector('[name=grade]').value.trim(),gw:number(line.querySelector('[name=gw]').value),nw:number(line.querySelector('[name=nw]').value),packingType:line.querySelector('[name=packingType]').value.trim(),memo:line.querySelector('[name=memo]').value.trim()};}).filter(function(item){return item.grade&&(item.gw>0||item.nw>0);});}
  window.saveInboundArrivalPlan=async function(event,form,poNo){
    event.preventDefault();var value=formData(form),items=packingItems(form);if(!value.arrivalPlanDate)return toast('입항예정일을 입력하세요.',true);if(!items.length)return toast('강종과 G/W 또는 N/W가 입력된 패키지가 필요합니다.',true);
    var po=poRows().find(function(row){return text(row.poNo)===text(poNo);}),existing=inboundById(poNo),stamp=new Date().toISOString(),requestId=existing&&existing.id||crypto.randomUUID(),requestNo=existing&&existing.requestNo||stageNextRequestNo(),gradeSummary=Array.from(new Set(items.map(function(item){return item.grade;}))).join(' / ');
    var ok=await commit('MES 입항예정 저장',['purchaseRequests','pos'],function(shared){
      shared.purchaseRequests=list(shared.purchaseRequests);var request=shared.purchaseRequests.find(function(row){return text(row.id)===text(requestId)||text(row.poNo)===text(poNo);});
      var active=list(shared.pos).filter(function(row){return text(row.poNo)===text(poNo)&&row.status!=='CANCELLED'&&!row.inboundRequestSuperseded;}),linked=active.filter(function(row){return text(row.inboundRequestId)===text(requestId);}),candidates=(linked.length?linked:active).slice(),max=list(shared.pos).reduce(function(result,row){var match=text(row.packageNo).match(/^P(\d+)$/i);return Math.max(result,match?number(match[1]):0);},0),generated=[];
      var savedStage=nextStatus(request&&request.status,'PLANNED');
      items.forEach(function(item,index){var row=candidates[index];if(!row){max++;row={id:crypto.randomUUID(),poNo:poNo,company:po.company,packageNo:'P'+String(max).padStart(6,'0'),createdAt:stamp};shared.pos.push(row);}Object.assign(row,{poNo:poNo,company:po.company,grade:item.grade,weight:number(item.nw)||number(item.gw),grossWeight:number(item.gw)||number(item.nw),netWeight:number(item.nw)||number(item.gw),packingPackageNo:item.packageNo||'',packingType:item.packingType||'',packingMemo:item.memo||'',inboundRequestItemIndex:index+1,inboundRequestId:requestId,inboundRequestNo:requestNo,inboundRequestStatus:savedStage,inboundRequestSuperseded:false,arrivalPlanDate:value.arrivalPlanDate,expectedArrivalDate:value.arrivalPlanDate,importType:value.importType,purchaseStatus:stageLabel(savedStage,'inbound'),receiptStatus:row.receiptStatus||'WAITING',inspectionStatus:row.inspectionStatus||'NOT_RECEIVED',status:'CONFIRMED',updatedAt:stamp,updatedByName:currentUserName()});generated.push(Object.assign({},item,{internalPackageNo:row.packageNo}));});
      candidates.slice(items.length).forEach(function(row){row.inboundRequestSuperseded=true;row.inboundRequestStatus='SUPERSEDED';row.supersededInboundRequestId=requestId;row.supersededAt=stamp;if(!row.receivedAt){row.status='CANCELLED';row.cancelledAt=stamp;row.cancelReason='입항예정 PACKING LIST 수정';}});
      var data=Object.assign({},request||{}, {id:requestId,requestNo:requestNo,poNo:poNo,company:po.company,importType:value.importType,arrivalPlanDate:value.arrivalPlanDate,items:generated,itemCount:generated.length,packageCount:generated.length,gradeSummary:gradeSummary,status:savedStage,operatorName:currentUserName(),operatorEmail:authUser&&authUser.email||'',arrivalPlannedAt:stamp,createdAt:request&&request.createdAt||stamp,updatedAt:stamp});
      if(request)Object.assign(request,data);else shared.purchaseRequests.push(data);
    });
    if(ok){closeModal();openView('inboundRequest');toast('입항예정 저장완료 · 입고요청현황에서 다음 단계를 진행하세요.');}
  };

  function inboundSummary(row){return "<div class='request-summary'><div><small>P.O</small><b>"+esc(row.poNo)+"</b></div><div><small>거래처</small><b>"+esc(row.company)+"</b></div><div><small>입항예정일</small><b>"+esc(row.arrivalPlanDate||'-')+"</b></div><div><small>패키지</small><b>"+row.packageCount+"개</b></div></div>";}
  function stageCard(label,value,raw){return '<dt>'+esc(label)+'</dt><dd>'+(raw?value:esc(value||'-'))+'</dd>';}
  function inboundStageCards(rows){return "<div class='cards'>"+(rows.map(function(row){return "<article class='mobile-card'><h3>"+esc(row.requestNo||row.poNo)+"</h3><dl>"+stageCard('P.O',row.poNo)+stageCard('거래처',row.company)+stageCard('거래처 강종명',row.gradeSummary)+stageCard('단계',stageLabel(row.stageStatus,'inbound'))+stageCard('입항예정일',row.arrivalPlanDate)+stageCard('입고요청일',row.requestDate)+stageCard('입고확정일시',row.confirmedDate?(row.confirmedDate+' '+row.confirmedTime):'-')+stageCard('컨테이너',row.containerSize)+stageCard('차량번호',text(row.vehicleNo)?esc(row.vehicleNo):missing(''),true)+stageCard('연락처',text(row.contact)?esc(row.contact):missing(''),true)+"</dl>"+inboundActionHtml(row)+"<button class='btn' onclick=\"openInboundStageDetail(decodeURIComponent('"+encoded(row.id)+"'))\">상세보기</button></article>";}).join('')||"<div class='empty'>자료가 없습니다.</div>")+"</div>";}
  function containerChoices(name,saved,includeOpen){var values=includeOpen?['20FT','40FT','OPEN TOP']:['20FT','40FT'];return "<div class='container-choice'>"+values.map(function(value){return "<label><input type='radio' name='"+name+"' value='"+value+"' "+(saved===value?'checked':'')+"><span>"+value+"</span></label>";}).join('')+'</div>';}
  window.openInboundStageRequest=function(id){
    var row=inboundById(id);if(!row)return toast('입항예정 자료를 찾지 못했습니다.',true);
    $('modalTitle').textContent=row.poNo+' · 입고요청';$('modalBody').innerHTML=inboundSummary(row)+"<form id='inboundStageRequestForm' class='form-grid' onsubmit=\"saveInboundStageRequest(event,this,decodeURIComponent('"+encoded(row.id)+"'))\"><label>입항예정일 <b class='stage-required'>필수</b><input name='arrivalPlanDate' type='date' required value='"+esc(row.arrivalPlanDate||nowDate())+"'></label><label>입고요청일 <b class='stage-required'>필수</b><input name='requestDate' type='date' required value='"+esc(row.requestDate||nowDate())+"'></label><label class='wide'>컨테이너 <b class='stage-required'>필수</b>"+containerChoices('containerSize',row.containerSize,false)+"</label><div class='wide actions'><button class='btn primary'>요청하기</button><button type='button' class='btn' onclick='closeModal()'>취소</button></div></form>";$('modal').classList.add('on');
  };
  window.saveInboundStageRequest=async function(event,form,id){
    event.preventDefault();var value=formData(form),container=form.querySelector('[name=containerSize]:checked')&&form.querySelector('[name=containerSize]:checked').value;if(!value.arrivalPlanDate)return toast('입항예정일을 입력하세요.',true);if(!value.requestDate)return toast('입고요청일을 입력하세요.',true);if(!container)return toast('컨테이너를 선택하세요.',true);var row=inboundById(id),stamp=new Date().toISOString();
    var ok=await commit('MES 입고요청 저장',['purchaseRequests','pos'],function(shared){var request=list(shared.purchaseRequests).find(function(item){return text(item.id)===text(row.id)||text(item.poNo)===text(row.poNo);});if(request)Object.assign(request,{arrivalPlanDate:value.arrivalPlanDate,requestDate:value.requestDate,containerSize:container,status:'REQUESTED',requestedAt:stamp,updatedAt:stamp,requestOperatorName:currentUserName()});list(shared.pos).filter(function(item){return (text(item.inboundRequestId)===text(row.id)||text(item.poNo)===text(row.poNo))&&!item.inboundRequestSuperseded;}).forEach(function(item){Object.assign(item,{arrivalPlanDate:value.arrivalPlanDate,expectedArrivalDate:value.arrivalPlanDate,inboundRequestStatus:'REQUESTED',inboundRequestDate:value.requestDate,inboundContainerSize:container,containerSize:container,purchaseStatus:'입고요청',updatedAt:stamp,updatedByName:currentUserName()});});});
    if(ok){closeModal();openView('inboundRequest');toast('입고요청이 확정되었습니다.');}
  };
  window.openInboundStageConfirm=function(id){
    var row=inboundById(id);if(!row)return toast('입고요청 자료를 찾지 못했습니다.',true);
    $('modalTitle').textContent=row.poNo+' · 입고예정확정';$('modalBody').innerHTML=inboundSummary(row)+"<form id='inboundStageConfirmForm' class='form-grid' onsubmit=\"saveInboundStageConfirm(event,this,decodeURIComponent('"+encoded(row.id)+"'))\"><label>입고확정일 <b class='stage-required'>필수</b><input name='confirmedDate' type='date' required value='"+esc(row.confirmedDate||row.requestDate||nowDate())+"'></label><label>입고확정시간 <b class='stage-required'>필수</b><input name='confirmedTime' type='time' required value='"+esc(row.confirmedTime||'09:00')+"'></label><label class='wide'>컨테이너 <b class='stage-required'>필수</b>"+containerChoices('containerSize',row.containerSize,false)+"</label><label>차량번호 <small>선택</small><input name='vehicleNo' value='"+esc(row.vehicleNo||'')+"' placeholder='미입력 시 기입요망 표시'></label><label>연락처 <small>선택</small><input name='contact' type='tel' value='"+esc(row.contact||'')+"' placeholder='미입력 시 기입요망 표시'></label><div class='wide actions'><button class='btn primary'>입고예정확정</button><button type='button' class='btn' onclick='closeModal()'>취소</button></div></form>";$('modal').classList.add('on');
  };
  window.saveInboundStageConfirm=async function(event,form,id){
    event.preventDefault();var value=formData(form),container=form.querySelector('[name=containerSize]:checked')&&form.querySelector('[name=containerSize]:checked').value;if(!value.confirmedDate||!value.confirmedTime)return toast('입고확정일과 시간을 입력하세요.',true);if(!container)return toast('컨테이너를 선택하세요.',true);var row=inboundById(id),stamp=new Date().toISOString(),confirmedAt=value.confirmedDate+'T'+value.confirmedTime+':00';
    var ok=await commit('MES 입고예정확정',['purchaseRequests','pos'],function(shared){var request=list(shared.purchaseRequests).find(function(item){return text(item.id)===text(row.id)||text(item.poNo)===text(row.poNo);});if(request)Object.assign(request,{arrivalPlanDate:row.arrivalPlanDate,confirmedInboundDate:value.co