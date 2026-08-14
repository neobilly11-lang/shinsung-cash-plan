(function mesSalesBalanceV1(){
  'use strict';
  if(window.__mesSalesBalanceV1)return;
  window.__mesSalesBalanceV1=true;
  var selected=new Set();
  var COMPLETE=/^(FINAL|SHIPPED|DONE|COMPLETE|COMPLETED|DELIVERED)$/i;

  function list(value){return Array.isArray(value)?value:[];}
  function number(value){return Number(value)||0;}
  function html(value){return typeof esc==='function'?esc(value):String(value==null?'':value);}
  function activeShipment(shipment){return shipment&&shipment.status!=='CANCELLED'&&(COMPLETE.test(String(shipment.status||''))||shipment.shippedAt||shipment.shippingCompletedAt||shipment.completedAt);}
  function shipmentsFor(item){return list(state.shipments).filter(function(shipment){return activeShipment(shipment)&&(String(shipment.salesOrderId||'')===String(item.id)||(!shipment.salesOrderId&&String(shipment.soNo||'')===String(item.soNo||'')));});}
  function shippedWeight(item){
    var shipments=shipmentsFor(item),shipmentIds=new Set(shipments.map(function(row){return row.id;}));
    var allocations=list(state.shipmentAllocations).filter(function(row){return row.status!=='CANCELLED'&&(String(row.salesOrderId||'')===String(item.id)||shipmentIds.has(row.shipmentId));});
    if(allocations.length)return allocations.reduce(function(sum,row){return sum+number(row.weight);},0);
    return shipments.reduce(function(sum,row){
      var mapped=row.itemWeights&&number(row.itemWeights[item.id]);
      if(mapped)return sum+mapped;
      return sum+number(row.weight||row.shippedWeight);
    },0);
  }
  function itemComplete(item){return COMPLETE.test(String(item.status||''))||shipmentsFor(item).length>0;}
  function balanceRows(sourceState){
    var source=sourceState||state;
    return list(source.salesOrders).filter(function(item){
      return item.status!=='CANCELLED'&&!/^(SPLIT|CANCELLED)$/i.test(String(item.salesBalanceStatus||''))&&itemComplete(item);
    }).map(function(item){
      var planned=number(item.weight),shipped=Math.min(planned,shippedWeight(item)),remaining=Math.max(0,planned-shipped-number(item.salesBalanceResolvedWeight));
      return{item:item,id:item.id,soNo:item.soNo||'',customer:item.customer||'',grade:item.customerGrade||item.grade||[item.productType,item.mainGrade,item.subGrade,item.detailGrade].filter(Boolean).join(' · '),planned:planned,shipped:shipped,remaining:remaining};
    }).filter(function(row){return row.remaining>.001;}).sort(function(a,b){return String(b.item.shippedAt||b.item.updatedAt||b.item.createdAt||'').localeCompare(String(a.item.shippedAt||a.item.updatedAt||a.item.createdAt||''));});
  }
  function summary(){var rows=balanceRows(),weight=rows.reduce(function(sum,row){return sum+row.remaining;},0);return{rows:rows,count:rows.length,weight:weight};}
  function decorate(){
    if(currentView!=='sales')return;
    var head=document.querySelector('#content .dashboard-head');
    if(!head||document.getElementById('mesSalesBalancePanel'))return;
    var data=summary();
    head.insertAdjacentHTML('afterend','<section id="mesSalesBalancePanel" class="sales-balance-panel"><button class="sales-balance-open" onclick="openMesSalesBalanceList()"><span><small>출하확정 후 남은 판매수량</small><strong>판매 잔량</strong></span><span class="sales-balance-numbers"><b>'+data.count.toLocaleString('ko-KR')+'건</b><em>'+number(data.weight).toLocaleString('ko-KR',{maximumFractionDigits:2})+' kg</em></span></button></section>');
  }
  function selectedRows(){var rows=balanceRows();return rows.filter(function(row){return selected.has(String(row.id));});}
  function renderModal(){
    var rows=balanceRows(),total=rows.reduce(function(sum,row){return sum+row.remaining;},0),body=document.getElementById('modalBody');
    if(!body)return;
    document.getElementById('modalTitle').textContent='판매 잔량';
    body.innerHTML='<div class="sales-balance-summary"><div><small>잔량 품목</small><b>'+rows.length.toLocaleString('ko-KR')+'건</b></div><div><small>총 판매 잔량</small><b>'+number(total).toLocaleString('ko-KR',{maximumFractionDigits:2})+' kg</b></div></div>'+
      '<p class="sales-balance-guide">출하확정 중량이 S.O 판매중량보다 적은 품목입니다. 체크한 잔량은 기존 S.O 뒤에 <b>-2, -3</b> 번호를 붙여 다음 출하용 S.O로 만들 수 있습니다.</p>'+
      '<div class="sales-balance-tools"><button class="btn" onclick="selectAllMesSalesBalances(true)">전체선택</button><button class="btn" onclick="selectAllMesSalesBalances(false)">선택해제</button><button class="btn primary" onclick="splitSelectedMesSalesBalances()">선택 잔량 S.O 행추가</button><button class="btn danger" onclick="deleteSelectedMesSalesBalances()">선택 판매 잔량 삭제</button></div>'+
      '<div class="sales-balance-list">'+(rows.length?rows.map(function(row){return '<label class="sales-balance-row"><input type="checkbox" '+(selected.has(String(row.id))?'checked':'')+' onchange="toggleMesSalesBalance(\''+html(row.id)+'\',this.checked)"><span><b>'+html(row.soNo)+' · '+html(row.customer)+'</b><em>'+html(row.grade||'강종 미지정')+'</em></span><span class="sales-balance-weights"><small>판매 '+number(row.planned).toLocaleString('ko-KR',{maximumFractionDigits:2})+' kg</small><small>출하 '+number(row.shipped).toLocaleString('ko-KR',{maximumFractionDigits:2})+' kg</small><strong>판매 잔량 '+number(row.remaining).toLocaleString('ko-KR',{maximumFractionDigits:2})+' kg</strong></span></label>';}).join(''):'<div class="empty">현재 판매 잔량이 없습니다.</div>')+'</div>';
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
          var liveRow=rows.find(function(row){return String(row.id)===String(item.id);}),remaining=liveRow?liveRow.remaining:0;if(remaining<=.001)return;
          var child=structuredClone(item);resetShipmentFields(child);Object.assign(child,{id:crypto.randomUUID(),groupId:groupId,soNo:childSoNo,weight:remaining,itemIndex:index+1,itemCount:items.length,parentSoNo:item.soNo,balanceRootSoNo:root,balanceSourceItemId:item.id,splitSequence:seq,createdAt:now,updatedAt:now,createdByName:operator,updatedByName:operator});
          draft.salesOrders.push(child);Object.assign(item,{salesBalanceStatus:'SPLIT',salesBalanceResolvedWeight:remaining,salesBalanceChildSoNo:childSoNo,salesBalanceResolvedAt:now,salesBalanceResolvedBy:operator,updatedAt:now,updatedByName:operator});
        });
      });
    });
    if(saved===false)return;selected.clear();renderModal();toast('판매 잔량을 다음 S.O 번호로 추가했습니다.');
  };
  window.deleteSelectedMesSalesBalances=async function(){
    var rows=selectedRows();if(!rows.length){toast('삭제할 판매 잔량을 체크하세요.',true);return;}
    if(!confirm('선택한 판매 잔량을 목록에서 삭제하시겠습니까? 기존 출하 이력은 유지됩니다.'))return;
    var ids=rows.map(function(row){return String(row.id);}),now=new Date().toISOString(),operator=currentUserName();
    var saved=await commit('판매 잔량 삭제',['salesOrders'],function(draft){list(draft.salesOrders).filter(function(item){return ids.includes(String(item.id));}).forEach(function(item){Object.assign(item,{salesBalanceStatus:'CANCELLED',salesBalanceResolvedWeight:Math.max(0,number(item.weight)-shippedWeight(item)),salesBalanceResolvedAt:now,salesBalanceResolvedBy:operator,updatedAt:now,updatedByName:operator});});});
    if(saved===false)return;selected.clear();renderModal();toast('선택한 판매 잔량을 삭제했습니다.');
  };

  var baseRender=window.render;
  window.render=function renderWithSalesBalance(){var result=baseRender.apply(this,arguments);decorate();return result;};
  var baseCloseModal=window.closeModal;
  window.closeModal=function closeModalWithSalesBalanceCleanup(){document.querySelector('#modal .modal-card')?.classList.remove('sales-balance-modal');return baseCloseModal.apply(this,arguments);};
  var style=document.createElement('style');style.id='mesSalesBalanceV1Style';style.textContent='.modal-card.sales-balance-modal{width:min(1180px,calc(100vw - 56px))!important;max-width:calc(100vw - 56px)!important}.sales-balance-panel{margin:0 0 14px}.sales-balance-open{width:100%;border:0;border-radius:16px;background:linear-gradient(135deg,#fff3d3,#ffe2a0);color:#5c3b00;padding:18px 22px;display:flex;align-items:center;justify-content:space-between;gap:20px;text-align:left;cursor:pointer;box-shadow:var(--shadow)}.sales-balance-open small,.sales-balance-open em{display:block;font-style:normal}.sales-balance-open strong{font-size:25px}.sales-balance-numbers{text-align:right}.sales-balance-numbers b{display:block;font-size:23px}.sales-balance-summary{display:grid;grid-template-columns:1fr 1fr;gap:10px}.sales-balance-summary>div{background:#eef8f5;border-radius:12px;padding:15px}.sales-balance-summary small,.sales-balance-summary b{display:block}.sales-balance-summary b{font-size:22px;margin-top:5px}.sales-balance-guide{background:#fff8dc;padding:13px;border-radius:10px}.sales-balance-tools{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.sales-balance-list{display:grid;gap:10px}.sales-balance-row{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center;border:1px solid var(--line);border-radius:13px;padding:14px;background:#fff}.sales-balance-row input{width:25px;height:25px}.sales-balance-row span b,.sales-balance-row span em{display:block}.sales-balance-row span em{font-style:normal;color:var(--muted);margin-top:4px}.sales-balance-weights{text-align:right}.sales-balance-weights small,.sales-balance-weights strong{display:block}.sales-balance-weights strong{color:#a45800;margin-top:4px}@media(max-width:760px){.sales-balance-open{padding:14px}.sales-balance-open strong{font-size:20px}.sales-balance-numbers b{font-size:18px}.sales-balance-row{grid-template-columns:auto minmax(0,1fr)}.sales-balance-weights{grid-column:2;text-align:left}.sales-balance-summary{grid-template-columns:1fr}.sales-balance-tools .btn{flex:1 1 42%}}';document.head.appendChild(style);
  decorate();
  document.documentElement.dataset.mesSalesBalanceV1='loaded';
})();

