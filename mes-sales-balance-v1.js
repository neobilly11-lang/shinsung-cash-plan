(function mesSalesBalanceV1(){
  'use strict';
  if(window.__mesSalesBalanceV1)return;
  window.__mesSalesBalanceV1=true;

  var selected=new Set();
  var COMPLETE=/^(FINAL|SHIPPED|DONE|COMPLETE|COMPLETED|DELIVERED)$/i;
  var RESOLVED=/^(SPLIT|CANCELLED|CLOSED|TERMINATED|SALE_CLOSED)$/i;

  function list(value){return Array.isArray(value)?value:[];}
  function number(value){var parsed=Number(String(value==null?'':value).replace(/,/g,''));return Number.isFinite(parsed)?parsed:0;}
  function html(value){return typeof esc==='function'?esc(value):String(value==null?'':value);}
  function formatted(value){return number(value).toLocaleString('ko-KR',{maximumFractionDigits:2});}
  function currentState(sourceState){return sourceState||state||{};}
  function activeShipment(shipment){
    return shipment&&shipment.status!=='CANCELLED'&&(
      COMPLETE.test(String(shipment.status||''))||shipment.shippedAt||shipment.shippingCompletedAt||shipment.completedAt
    );
  }
  function shipmentsFor(item,sourceState){
    var source=currentState(sourceState),id=String(item.id||''),soNo=String(item.soNo||'');
    return list(source.shipments).filter(function(shipment){
      if(!activeShipment(shipment))return false;
      var shipmentSalesOrderId=String(shipment.salesOrderId||'');
      return shipmentSalesOrderId===id||(!shipmentSalesOrderId&&String(shipment.soNo||'')===soNo);
    });
  }
  function shippedWeight(item,sourceState){
    var source=currentState(sourceState),shipments=shipmentsFor(item,source),shipmentIds=new Set(shipments.map(function(row){return String(row.id||'');}));
    var itemId=String(item.id||''),allocations=list(source.shipmentAllocations).filter(function(row){
      if(row.status==='CANCELLED')return false;
      var allocationSalesOrderId=String(row.salesOrderId||'');
      return allocationSalesOrderId===itemId||(!allocationSalesOrderId&&shipmentIds.has(String(row.shipmentId||'')));
    });
    if(allocations.length)return allocations.reduce(function(sum,row){return sum+number(row.weight||row.nw||row.netWeight);},0);

    var direct=number(item.shippedWeight||item.shippingConfirmedWeight||item.confirmedShippingWeight||item.fulfilledWeight);
    if(direct>0)return direct;
    return shipments.reduce(function(sum,row){
      var mapped=row.itemWeights&&number(row.itemWeights[item.id]);
      if(mapped>0)return sum+mapped;
      if(String(row.salesOrderId||'')===itemId)return sum+number(row.shippedWeight||row.weight||row.nw||row.netWeight);
      return sum;
    },0);
  }
  function itemComplete(item,sourceState){
    return COMPLETE.test(String(item.status||''))||shipmentsFor(item,sourceState).length>0||shippedWeight(item,sourceState)>0;
  }
  function metric(item,sourceState){
    var source=currentState(sourceState),contract=number(item.weight),shipped=Math.min(contract,Math.max(0,shippedWeight(item,source)));
    var resolved=Math.min(Math.max(0,contract-shipped),Math.max(0,number(item.salesBalanceResolvedWeight)));
    var remaining=Math.max(0,contract-shipped-resolved),resolution=String(item.salesBalanceStatus||'');
    return{
      item:item,
      id:item.id,
      soNo:item.soNo||'',
      customer:item.customer||'',
      grade:item.customerGrade||item.grade||[item.productType,item.mainGrade,item.subGrade,item.detailGrade].filter(Boolean).join(' · '),
      contract:contract,
      shipped:shipped,
      resolved:resolved,
      remaining:remaining,
      resolution:resolution,
      closed:RESOLVED.test(resolution)
    };
  }
  function historyRows(sourceState){
    var source=currentState(sourceState);
    return list(source.salesOrders).filter(function(item){return item.status!=='CANCELLED';}).map(function(item){return metric(item,source);}).filter(function(row){
      return itemComplete(row.item,source)||row.closed||row.shipped>0;
    }).sort(function(a,b){
      return String(b.item.shippedAt||b.item.updatedAt||b.item.createdAt||'').localeCompare(String(a.item.shippedAt||a.item.updatedAt||a.item.createdAt||''));
    });
  }
  function balanceRows(sourceState){
    return historyRows(sourceState).filter(function(row){return !row.closed&&row.remaining>.001;});
  }
  function summary(){
    var rows=balanceRows(),weight=rows.reduce(function(sum,row){return sum+row.remaining;},0);
    return{rows:rows,count:rows.length,weight:weight};
  }
  function statusLabel(row){
    if(row.resolution==='SPLIT')return '잔량 S.O 분할완료';
    if(/^(CLOSED|TERMINATED|SALE_CLOSED|CANCELLED)$/i.test(row.resolution))return '판매종료';
    if(row.remaining>.001)return '판매잔량 '+formatted(row.remaining)+' kg';
    return '판매완료';
  }
  function decorate(){
    if(currentView!=='sales')return;
    var head=document.querySelector('#content .dashboard-head');
    if(!head||document.getElementById('mesSalesBalancePanel'))return;
    var data=summary();
    head.insertAdjacentHTML('afterend','<section id="mesSalesBalancePanel" class="sales-balance-panel"><button class="sales-balance-open" onclick="openMesSalesBalanceList()"><span><small>출하확정 후 남은 판매수량</small><strong>판매 잔량</strong></span><span class="sales-balance-numbers"><b>'+data.count.toLocaleString('ko-KR')+'건</b><em>'+formatted(data.weight)+' kg</em></span></button></section>');
  }
  function selectedRows(){return balanceRows().filter(function(row){return selected.has(String(row.id));});}
  function historyMarkup(rows){
    if(!rows.length)return '<div class="empty">기존 S.O 출하내역이 없습니다.</div>';
    return '<div class="sales-balance-history-table"><div class="sales-balance-history-head"><b>S.O·판매처·강종</b><b>계약중량</b><b>출하완료 재고</b><b>남은 잔량</b><b>상태</b></div>'+rows.map(function(row){
      return '<div class="sales-balance-history-row"><span><b>'+html(row.soNo)+' · '+html(row.customer)+'</b><small>'+html(row.grade||'강종 미지정')+'</small></span><b>'+formatted(row.contract)+' kg</b><b>'+formatted(row.shipped)+' kg</b><strong>'+formatted(row.remaining)+' kg</strong><em>'+html(statusLabel(row))+'</em></div>';
    }).join('')+'</div>';
  }
  function renderModal(){
    var rows=balanceRows(),history=historyRows(),total=rows.reduce(function(sum,row){return sum+row.remaining;},0),body=document.getElementById('modalBody');
    if(!body)return;
    document.getElementById('modalTitle').textContent='판매 잔량';
    body.innerHTML='<div class="sales-balance-summary"><div><small>잔량 품목</small><b>'+rows.length.toLocaleString('ko-KR')+'건</b></div><div><small>총 판매 잔량</small><b>'+formatted(total)+' kg</b></div></div>'+
      '<p class="sales-balance-guide">출하완료 재고가 계약중량보다 적으면 남은 중량을 표시합니다. 잔량을 다음 출하용 S.O로 나누거나, <b>즉시 판매종료</b>하여 판매 잔량 집계에서 제외할 수 있습니다.</p>'+
      '<div class="sales-balance-tools"><button class="btn" onclick="selectAllMesSalesBalances(true)">전체선택</button><button class="btn" onclick="selectAllMesSalesBalances(false)">선택해제</button><button class="btn primary" onclick="splitSelectedMesSalesBalances()">선택 잔량 S.O 행추가</button><button class="btn danger" onclick="closeSelectedMesSalesBalances()">선택 잔량 즉시 판매종료</button></div>'+
      '<div class="sales-balance-list">'+(rows.length?rows.map(function(row){return '<label class="sales-balance-row"><input type="checkbox" '+(selected.has(String(row.id))?'checked':'')+' onchange="toggleMesSalesBalance(\''+html(row.id)+'\',this.checked)"><span><b>'+html(row.soNo)+' · '+html(row.customer)+'</b><em>'+html(row.grade||'강종 미지정')+'</em></span><span class="sales-balance-weights"><small>계약중량 '+formatted(row.contract)+' kg</small><small>출하완료 재고 '+formatted(row.shipped)+' kg</small><strong>남은 잔량 '+formatted(row.remaining)+' kg</strong></span></label>';}).join(''):'<div class="empty">현재 판매 잔량이 없습니다.</div>')+'</div>'+
      '<section class="sales-balance-history"><h3>기존 S.O 출하·잔량 내역</h3>'+historyMarkup(history)+'</section>';
    document.querySelector('#modal .modal-card')?.classList.add('wide-modal','sales-balance-modal');
  }

  window.openMesSalesBalanceList=function(){selected.clear();renderModal();document.getElementById('modal').classList.add('on');};
  window.toggleMesSalesBalance=function(id,checked){if(checked)selected.add(String(id));else selected.delete(String(id));};
  window.selectAllMesSalesBalances=function(checked){selected.clear();if(checked)balanceRows().forEach(function(row){selected.add(String(row.id));});renderModal();};

  function splitRoot(item){var stored=String(item.balanceRootSoNo||item.parentSoNo||'');if(stored)return stored;var soNo=String(item.soNo||'SO'),match=soNo.match(/^(.*)-(\d+)$/);return match?match[1]:soNo;}
  function nextSequence(all,root){var max=1,escaped=root.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),pattern=new RegExp('^'+escaped+'-(\\d+)$');all.forEach(function(item){var stored=String(item.balanceRootSoNo||item.parentSoNo||''),match=String(item.soNo||'').match(pattern);if(stored!==root&&!match)return;max=Math.max(max,number(item.splitSequence)||number(match&&match[1])||1);});return max+1;}
  function resetShipmentFields(item){
    ['shipmentId','shippedAt','shippingCompletedAt','completedAt','packingListId','shippingRequestDate','shippingRequestedAt','shippingConfirmedDate','shippingConfirmedTime','shippingVehicleNo','driverPhone','shippingContainerNo','shippingSealNo','shippingConfirmOperatorName','shippingRequestOperatorName','salesBalanceStatus','salesBalanceResolvedWeight','salesBalanceChildSoNo','salesBalanceResolvedAt','salesBalanceResolvedBy'].forEach(function(key){delete item[key];});
    item.shippingPlanStatus='PLANNED';item.shippingRequestStatus='';item.status='WAITING';
  }
  window.splitSelectedMesSalesBalances=async function(){
    var rows=selectedRows();if(!rows.length){toast('S.O로 나눌 판매 잔량을 체크하세요.',true);return;}
    var ids=rows.map(function(row){return String(row.id);}),now=new Date().toISOString(),operator=currentUserName();
    var saved=await commit('판매 잔량 S.O 분할',['salesOrders'],function(draft){
      var sources=list(draft.salesOrders).filter(function(item){return ids.includes(String(item.id));}),groups=new Map();
      sources.forEach(function(item){var root=splitRoot(item);if(!groups.has(root))groups.set(root,[]);groups.get(root).push(item);});
      groups.forEach(function(items,root){
        var seq=nextSequence(draft.salesOrders,root),childSoNo=root+'-'+seq,groupId=crypto.randomUUID();
        items.forEach(function(item,index){
          var liveMetric=metric(item,draft),remaining=liveMetric.remaining;if(remaining<=.001)return;
          var child=structuredClone(item);resetShipmentFields(child);Object.assign(child,{id:crypto.randomUUID(),groupId:groupId,soNo:childSoNo,weight:remaining,itemIndex:index+1,itemCount:items.length,parentSoNo:item.soNo,balanceRootSoNo:root,balanceSourceItemId:item.id,splitSequence:seq,createdAt:now,updatedAt:now,createdByName:operator,updatedByName:operator});
          draft.salesOrders.push(child);Object.assign(item,{salesBalanceStatus:'SPLIT',salesBalanceResolvedWeight:remaining,salesBalanceChildSoNo:childSoNo,salesBalanceResolvedAt:now,salesBalanceResolvedBy:operator,updatedAt:now,updatedByName:operator});
        });
      });
    });
    if(saved===false)return;selected.clear();renderModal();toast('판매 잔량을 다음 S.O 번호로 추가했습니다.');
  };
  window.closeSelectedMesSalesBalances=async function(){
    var rows=selectedRows();if(!rows.length){toast('판매종료할 잔량을 체크하세요.',true);return;}
    if(!confirm('선택한 남은 잔량을 즉시 판매종료하시겠습니까? 기존 S.O와 출하내역은 그대로 유지됩니다.'))return;
    var ids=rows.map(function(row){return String(row.id);}),now=new Date().toISOString(),operator=currentUserName();
    var saved=await commit('판매 잔량 즉시 판매종료',['salesOrders'],function(draft){
      list(draft.salesOrders).filter(function(item){return ids.includes(String(item.id));}).forEach(function(item){
        var liveMetric=metric(item,draft);Object.assign(item,{salesBalanceStatus:'SALE_CLOSED',salesBalanceResolvedWeight:liveMetric.remaining,salesBalanceResolvedAt:now,salesBalanceResolvedBy:operator,salesBalanceClosedAt:now,salesBalanceClosedBy:operator,updatedAt:now,updatedByName:operator});
      });
    });
    if(saved===false)return;selected.clear();renderModal();toast('선택한 남은 잔량을 판매종료했습니다.');
  };
  window.deleteSelectedMesSalesBalances=window.closeSelectedMesSalesBalances;

  function enrichedSalesItems(row){
    var items=list(row&&row.items).length?list(row.items):list(state.salesOrders).filter(function(item){return String(item.soNo||'')===String(row&&row.soNo||'')&&item.status!=='CANCELLED';});
    return items.map(function(item){var values=metric(item);return Object.assign({},item,{contractWeight:values.contract,shippedCompletedWeight:values.shipped,salesRemainingWeight:values.remaining,salesBalanceDisplayStatus:statusLabel(values)});});
  }
  function salesContractSection(row){
    return mesSection('판매 계약 세부내역',[
      ['S.O',function(item){return item.soNo;}],
      ['판매처',function(item){return item.customer;}],
      ['품종',function(item){return item.productType;}],
      ['강종',function(item){return item.mainGrade||item.grade;}],
      ['소강종',function(item){return item.subGrade;}],
      ['상세강종',function(item){return item.detailGrade;}],
      ['계약중량',function(item){return fmt(item.contractWeight);}],
      ['출하완료 재고',function(item){return fmt(item.shippedCompletedWeight);}],
      ['남은 잔량',function(item){return fmt(item.salesRemainingWeight);}],
      ['단가',function(item){return fmt(item.unitPrice);}],
      ['통화',function(item){return item.currency;}],
      ['판매금액',function(item){return fmt(item.amount||number(item.weight)*number(item.unitPrice));}],
      ['판매상태',function(item){return item.salesBalanceDisplayStatus||item.status;}]
    ],enrichedSalesItems(row));
  }
  window.mesSalesDetail=salesContractSection;
  window.mesSalesSections=function(row){
    var items=enrichedSalesItems(row),ids=new Set(items.map(function(item){return item.id;}));
    var shipments=list(state.shipments).filter(function(item){return item.soNo===row.soNo||ids.has(item.salesOrderId);});
    var shipmentIds=new Set(shipments.map(function(item){return item.id;}));
    var allocations=list(state.shipmentAllocations).filter(function(item){return shipmentIds.has(item.shipmentId);});
    var packingLists=list(state.packingLists).filter(function(item){return item.soNo===row.soNo||ids.has(item.salesOrderId);});
    return mesSection('S.O 품목',[
      ['S.O',function(item){return item.soNo;}],['판매처',function(item){return item.customer;}],
      ['강종',function(item){return item.grade||[item.productType,item.mainGrade,item.subGrade,item.detailGrade].filter(Boolean).join(' · ');}],
      ['계약중량',function(item){return fmt(item.contractWeight);}],['출하완료 재고',function(item){return fmt(item.shippedCompletedWeight);}],
      ['남은 잔량',function(item){return fmt(item.salesRemainingWeight);}],['단가',function(item){return fmt(item.unitPrice);}],
      ['상태',function(item){return item.salesBalanceDisplayStatus||item.status;}]
    ],items)+mesSection('출하·PACKING LIST',[
      ['출하일',function(item){return date(item.shippedAt||item.shippingCompletedAt);}],['상태',function(item){return item.status;}],
      ['중량',function(item){return fmt(item.weight||item.shippedWeight);}],['작업자',function(item){return item.shippingWorkerName||item.operatorName||'-';}],
      ['메모',function(item){return item.shippingMemo||'-';}]
    ],shipments)+mesSection('완료재고 배정',[
      ['완료번호',function(item){var bag=list(state.bags).find(function(entry){return entry.id===item.bagId;});return item.completionNo||(bag?bagCode(bag):'-');}],
      ['중량',function(item){return fmt(item.weight);}],['상태',function(item){return item.status;}]
    ],allocations)+mesSection('PACKING LIST',[
      ['번호',function(item){return item.packingListNo;}],['구분',function(item){return item.type||item.templateType;}],
      ['상태',function(item){return item.status;}],['생성일',function(item){return dt(item.createdAt);}]
    ],packingLists);
  };

  var baseRender=window.render;
  window.render=function renderWithSalesBalance(){var result=baseRender.apply(this,arguments);decorate();return result;};
  var baseCloseModal=window.closeModal;
  window.closeModal=function closeModalWithSalesBalanceCleanup(){document.querySelector('#modal .modal-card')?.classList.remove('sales-balance-modal');return baseCloseModal.apply(this,arguments);};
  var style=document.createElement('style');
  style.id='mesSalesBalanceV1Style';
  style.textContent='.modal-card.sales-balance-modal{width:min(1180px,calc(100vw - 56px))!important;max-width:calc(100vw - 56px)!important}.sales-balance-panel{margin:0 0 14px}.sales-balance-open{width:100%;border:0;border-radius:16px;background:linear-gradient(135deg,#fff3d3,#ffe2a0);color:#5c3b00;padding:18px 22px;display:flex;align-items:center;justify-content:space-between;gap:20px;text-align:left;cursor:pointer;box-shadow:var(--shadow)}.sales-balance-open small,.sales-balance-open em{display:block;font-style:normal}.sales-balance-open strong{font-size:25px}.sales-balance-numbers{text-align:right}.sales-balance-numbers b{display:block;font-size:23px}.sales-balance-summary{display:grid;grid-template-columns:1fr 1fr;gap:10px}.sales-balance-summary>div{background:#eef8f5;border-radius:12px;padding:15px}.sales-balance-summary small,.sales-balance-summary b{display:block}.sales-balance-summary b{font-size:22px;margin-top:5px}.sales-balance-guide{background:#fff8dc;padding:13px;border-radius:10px}.sales-balance-tools{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.sales-balance-list{display:grid;gap:10px}.sales-balance-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center;border:1px solid var(--line);border-radius:13px;padding:14px;background:#fff}.sales-balance-row input{width:25px;height:25px}.sales-balance-row span b,.sales-balance-row span em{display:block}.sales-balance-row span em{font-style:normal;color:var(--muted);margin-top:4px}.sales-balance-weights{text-align:right}.sales-balance-weights small,.sales-balance-weights strong{display:block}.sales-balance-weights strong{color:#a45800;margin-top:4px}.sales-balance-history{margin-top:22px}.sales-balance-history h3{margin:0 0 10px}.sales-balance-history-table{border:1px solid var(--line);border-radius:13px;overflow:auto}.sales-balance-history-head,.sales-balance-history-row{display:grid;grid-template-columns:minmax(220px,2fr) repeat(4,minmax(120px,1fr));min-width:850px;align-items:center}.sales-balance-history-head{background:#eef3f8}.sales-balance-history-head>*{padding:11px}.sales-balance-history-row{border-top:1px solid var(--line)}.sales-balance-history-row>*{padding:12px}.sales-balance-history-row span b,.sales-balance-history-row span small{display:block}.sales-balance-history-row span small{color:var(--muted);margin-top:3px}.sales-balance-history-row strong{color:#a45800}.sales-balance-history-row em{font-style:normal}@media(max-width:760px){.modal-card.sales-balance-modal{width:calc(100vw - 28px)!important;max-width:calc(100vw - 28px)!important}.sales-balance-open{padding:14px}.sales-balance-open strong{font-size:20px}.sales-balance-numbers b{font-size:18px}.sales-balance-row{grid-template-columns:auto minmax(0,1fr)}.sales-balance-weights{grid-column:2;text-align:left}.sales-balance-summary{grid-template-columns:1fr}.sales-balance-tools .btn{flex:1 1 42%}.sales-balance-history-table{font-size:13px}}';
  document.head.appendChild(style);
  decorate();
  document.documentElement.dataset.mesSalesBalanceV1='loaded';
})();
