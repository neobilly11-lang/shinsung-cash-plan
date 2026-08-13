(function(){
  'use strict';
  if(window.__mesInboundRequestFixV1)return;
  window.__mesInboundRequestFixV1=true;

  function list(value){return Array.isArray(value)?value:[];}
  function text(value){return String(value==null?'':value).trim();}
  function key(value){return text(value).toUpperCase().replace(/[\s._-]+/g,'');}
  function number(value){var parsed=Number(String(value==null?'':value).replace(/,/g,''));return Number.isFinite(parsed)?parsed:0;}
  function timeValue(row){return text(row&&(
    row.updatedAt||row.inboundRequestedAt||row.requestedAt||row.createdAt||row.requestDate
  ));}
  function validRequest(row){
    var status=text(row&&row.status).toUpperCase();
    return !!row&&!!key(row.poNo)&&!['CANCELLED','CANCELED','DELETED'].includes(status);
  }
  function activeRequestPackage(row){
    var status=text(row&&row.status).toUpperCase();
    var requestStatus=text(row&&row.inboundRequestStatus).toUpperCase();
    return !!row&&!row.inboundRequestSuperseded&&!['CANCELLED','CANCELED','DELETED','SUPERSEDED'].includes(status)&&!['CANCELLED','CANCELED','DELETED','SUPERSEDED'].includes(requestStatus);
  }
  function poByKey(){
    var map=new Map();
    try{list(poRows()).forEach(function(po){if(key(po.poNo))map.set(key(po.poNo),po);});}catch(_){}
    return map;
  }
  function packageItem(row){
    return {
      packageNo:text(row.packageNo||row.internalNo||row.id),
      grade:text(row.grade||row.originalGrade||row.detailGrade||row.mainGrade),
      gw:number(row.grossWeight||row.gw||row.weight),
      nw:number(row.netWeight||row.nw||row.weight),
      packingType:text(row.packingType||row.packageType),
      memo:text(row.memo||row.note)
    };
  }
  function decorateRequest(row,poMap){
    var request=Object.assign({},row),requestKey=key(request.poNo),po=poMap.get(requestKey)||{};
    if(po.poNo)request.poNo=po.poNo;
    var items=list(request.items);
    request.company=text(request.company||po.company);
    request.items=items;
    request.gradeSummary=text(request.gradeSummary)||Array.from(new Set(items.map(function(item){return text(item.grade);}))).filter(Boolean).join(' / ');
    request.packageCount=items.length;
    request.totalGw=items.reduce(function(sum,item){return sum+number(item.gw||item.grossWeight);},0);
    request.totalNw=items.reduce(function(sum,item){return sum+number(item.nw||item.netWeight||item.weight);},0);
    request.savedAt=request.updatedAt||request.createdAt||request.inboundRequestedAt||'';
    request.searchText=[request.requestNo,request.poNo,request.company,request.gradeSummary,request.containerSize,request.vehicleNo,request.contact]
      .concat(items.reduce(function(values,item){return values.concat([item.packageNo,item.grade,item.packingType,item.memo]);},[]))
      .map(text).filter(Boolean).join(' ');
    return request;
  }
  function fallbackRequest(poNo,rows,poMap){
    var first=rows.slice().sort(function(a,b){return timeValue(b).localeCompare(timeValue(a));})[0]||{},po=poMap.get(key(poNo))||{};
    var stamp=first.inboundRequestedAt||first.updatedAt||first.createdAt||'';
    var arrivalPart=text(first.arrivalPlanDate||first.expectedArrivalDate);
    var datePart=text(first.inboundRequestDate||(first.inboundRequestedAt&&first.inboundRequestedAt.slice(0,10)));
    var timePart=text(first.inboundRequestTime||(stamp&&stamp.slice(11,16)));
    return {
      id:text(first.inboundRequestId)||('recovered-inbound-'+key(poNo)),
      requestNo:text(first.inboundRequestNo)||('IR-'+text(poNo)),
      poNo:po.poNo||text(poNo),
      company:text(first.company||po.company),
      importType:text(first.importType||first.type)||'OVERSEAS',
      arrivalPlanDate:arrivalPart,
      requestDate:datePart,
      requestTime:timePart,
      containerSize:text(first.inboundContainerSize||first.containerSize),
      vehicleNo:text(first.inboundVehicleNo||first.vehicleNo),
      contact:text(first.inboundContact||first.contact),
      items:rows.map(packageItem),
      status:text(first.inboundRequestStatus)||'REQUESTED',
      operatorName:text(first.updatedByName||first.createdByName),
      createdAt:stamp,
      updatedAt:first.updatedAt||stamp,
      recoveredFromPackages:true
    };
  }
  function reconcileInboundRequests(){
    if(typeof state==='undefined'||!state)return [];
    var poMap=poByKey(),byPo=new Map();
    list(state.purchaseRequests).filter(validRequest).forEach(function(row){
      var requestKey=key(row.poNo),previous=byPo.get(requestKey);
      if(!previous||timeValue(row)>=timeValue(previous))byPo.set(requestKey,Object.assign({},row));
    });
    var markedByPo=new Map();
    list(state.pos).filter(activeRequestPackage).forEach(function(row){
      var marked=row&&(row.inboundRequestId||row.inboundRequestNo||text(row.inboundRequestStatus).toUpperCase()==='REQUESTED');
      var requestKey=key(row&&row.poNo);
      if(!marked||!requestKey)return;
      if(!markedByPo.has(requestKey))markedByPo.set(requestKey,[]);
      markedByPo.get(requestKey).push(row);
    });
    markedByPo.forEach(function(rows,requestKey){
      var existing=byPo.get(requestKey);
      if(!existing){
        byPo.set(requestKey,fallbackRequest(rows[0].poNo,rows,poMap));
        return;
      }
      /* 사용자가 저장한 PACKING LIST가 있으면 예전 P.O 패키지 행으로 덮어쓰지 않는다. */
      if(!list(existing.items).length)existing.items=rows.map(packageItem);
      var newest=rows.slice().sort(function(a,b){return timeValue(b).localeCompare(timeValue(a));})[0]||{};
      existing.id=existing.id||newest.inboundRequestId;
      existing.requestNo=existing.requestNo||newest.inboundRequestNo;
      existing.status=existing.status||newest.inboundRequestStatus||'REQUESTED';
      existing.arrivalPlanDate=existing.arrivalPlanDate||newest.arrivalPlanDate||newest.expectedArrivalDate;
      existing.requestDate=existing.requestDate||newest.inboundRequestDate||text(newest.inboundRequestedAt).slice(0,10);
      existing.requestTime=existing.requestTime||text(newest.inboundRequestedAt).slice(11,16);
    });
    var rows=Array.from(byPo.values()).map(function(row){return decorateRequest(row,poMap);}).sort(function(a,b){return timeValue(b).localeCompare(timeValue(a));});
    state.purchaseRequests=rows;
    return rows;
  }

  function repairSupersededPackages(){
    if(window.__mesInboundRepairBusy||typeof commit!=='function'||typeof state==='undefined')return;
    var repairs=[];
    list(state.purchaseRequests).filter(validRequest).forEach(function(request){
      var items=list(request.items),requestKey=key(request.poNo);
      if(!items.length||!requestKey)return;
      var linked=list(state.pos).filter(function(row){
        return key(row.poNo)===requestKey&&activeRequestPackage(row)&&(
          text(row.inboundRequestId)===text(request.id)||text(row.inboundRequestNo)===text(request.requestNo)
        );
      }).sort(function(a,b){return number(a.inboundRequestItemIndex)-number(b.inboundRequestItemIndex);});
      if(linked.length>items.length)repairs.push({requestId:request.id,requestNo:request.requestNo,poNo:request.poNo,count:items.length});
    });
    if(!repairs.length)return;
    window.__mesInboundRepairBusy=true;
    setTimeout(async function(){
      try{
        await commit('입고요청 패키지 수 동기화',['purchaseRequests','pos'],function(draft){
          var stamp=new Date().toISOString();
          repairs.forEach(function(repair){
            var request=list(draft.purchaseRequests).find(function(row){return text(row.id)===text(repair.requestId)||key(row.poNo)===key(repair.poNo);});
            if(!request)return;
            var keepCount=list(request.items).length||repair.count;
            request.itemCount=keepCount;request.packageCount=keepCount;
            var linked=list(draft.pos).filter(function(row){
              return key(row.poNo)===key(repair.poNo)&&activeRequestPackage(row)&&(
                text(row.inboundRequestId)===text(request.id)||text(row.inboundRequestNo)===text(request.requestNo)
              );
            }).sort(function(a,b){return number(a.inboundRequestItemIndex)-number(b.inboundRequestItemIndex);});
            linked.slice(keepCount).forEach(function(row){
              row.inboundRequestSuperseded=true;
              row.inboundRequestStatus='SUPERSEDED';
              row.supersededInboundRequestId=request.id;
              row.supersededInboundRequestNo=request.requestNo;
              row.supersededAt=stamp;
              if(!row.receivedAt)row.status='CANCELLED';
            });
          });
        });
      }finally{window.__mesInboundRepairBusy=false;}
    },50);
  }
  function requestForPo(poNo){
    var requestKey=key(poNo);
    return reconcileInboundRequests().find(function(row){return key(row.poNo)===requestKey;})||null;
  }
  function buttonHtml(row){
    var existing=requestForPo(row.poNo),encoded=encodeURIComponent(row.poNo);
    var action=existing?'openPackingRequestDirect':'openInboundRequestBuilder';
    var label=existing?'입고요청완료 · 수정':'입고요청';
    return "<button class='btn inbound-request-action "+(existing?'done':'')+"' data-inbound-request-state='"+(existing?'completed':'waiting')+"' onclick='event.stopPropagation();"+action+"(decodeURIComponent(\""+encoded+"\"))'>"+label+"</button>";
  }
  function decoratePurchaseButtons(){
    if(typeof currentView==='undefined'||currentView!=='purchase'||!window.schemas||!schemas.purchase)return;
    var rows=typeof filtered==='function'?filtered(schemas.purchase.rows()):schemas.purchase.rows();
    document.querySelectorAll('#content .table-wrap tbody tr:not(.total-row)').forEach(function(tr,index){
      var row=rows[index];if(!row)return;
      var old=tr.querySelector('.inbound-request-action');if(old)old.remove();
      if(tr.lastElementChild)tr.lastElementChild.insertAdjacentHTML('beforeend',buttonHtml(row));
    });
    document.querySelectorAll('#content .cards .mobile-card').forEach(function(card,index){
      var row=rows[index];if(!row)return;
      var old=card.querySelector('.inbound-request-action');if(old)old.remove();
      card.insertAdjacentHTML('beforeend',buttonHtml(row));
    });
  }

  reconcileInboundRequests();
  if(window.schemas&&schemas.inboundRequest)schemas.inboundRequest.rows=reconcileInboundRequests;
  window.mesInboundRequestRows=reconcileInboundRequests;
  window.mesInboundRequestForPo=requestForPo;
  window.mesRepairInboundRequestPackages=repairSupersededPackages;

  var previousRender=window.render;
  window.render=function(){
    reconcileInboundRequests();
    repairSupersededPackages();
    var result=previousRender.apply(this,arguments);
    if(typeof currentView!=='undefined'&&currentView==='purchase'){
      requestAnimationFrame(decoratePurchaseButtons);
      setTimeout(decoratePurchaseButtons,20);
    }
    return result;
  };
  if(typeof currentView!=='undefined'&&currentView)window.render();
  document.documentElement.dataset.mesInboundRequestFixV1='loaded';
})();
