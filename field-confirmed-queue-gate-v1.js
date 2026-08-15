(function(root,factory){
  'use strict';
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root&&root.document)api.install(root);
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  function text(value){return String(value==null?'':value).trim()}
  function upper(value){return text(value).toUpperCase()}
  function list(value){return Array.isArray(value)?value:[]}
  function currentState(){
    try{return typeof state!=='undefined'?state:null}catch(_){return null}
  }

  function inboundStatus(row){
    return upper(row&&(
      row.inboundRequestStatus||
      row.receiptScheduleStatus||
      row.inboundScheduleStatus||
      row.arrivalScheduleStatus
    ));
  }

  function inboundScheduleConfirmed(row,purchaseRequests){
    if(!row)return false;
    if(inboundStatus(row)==='CONFIRMED'||row.inboundConfirmedAt||row.confirmedInboundDate)return true;
    var poNo=text(row.poNo),requestId=text(row.inboundRequestId);
    return list(purchaseRequests).some(function(request){
      if(!request)return false;
      var sameRequest=requestId&&text(request.id)===requestId;
      var samePo=poNo&&text(request.poNo)===poNo;
      if(!sameRequest&&!samePo)return false;
      return upper(request.status||request.inboundRequestStatus)==='CONFIRMED'||
        !!request.inboundConfirmedAt||!!request.confirmedInboundDate;
    });
  }

  function dispatchRequestConfirmed(row){
    if(!row)return false;
    var status=upper(row.shippingRequestStatus||row.dispatchRequestStatus);
    if(status==='REQUESTED'||status==='CONFIRMED')return true;
    return !!(row.shippingRequestNo&&row.shippingRequestedAt);
  }

  function install(win){
    if(!win||!win.document||win.document.documentElement.dataset.confirmedQueueGateV1==='ready')return;
    win.document.documentElement.dataset.confirmedQueueGateV1='installing';

    var originalImportWaitingPackages=win.importWaitingPackages;
    if(typeof originalImportWaitingPackages==='function'){
      win.importWaitingPackages=function confirmedImportWaitingPackages(){
        var shared=currentState();
        return originalImportWaitingPackages.apply(this,arguments).filter(function(row){
          return inboundScheduleConfirmed(row,shared&&shared.purchaseRequests);
        });
      };
    }

    function relabelConfirmedImport(){
      var scope=win.document.getElementById('importReceiptManagement');
      if(scope){
        scope.querySelectorAll('.status-chip').forEach(function(node){
          node.textContent=node.textContent.replace('입고요청 완료','입고예정 확정');
        });
        scope.querySelectorAll('small').forEach(function(node){
          if(node.textContent.trim()==='입고요청 P.O')node.textContent='입고예정 확정 P.O';
        });
        var empty=scope.querySelector('.card b');
        if(empty&&empty.textContent.indexOf('입고요청 완료 후')>=0){
          empty.textContent='입고예정 확정 후 대기 중인 P.O가 없습니다.';
          var note=empty.parentElement&&empty.parentElement.querySelector('p');
          if(note)note.textContent='MES 입고요청현황에서 입고예정을 확정하면 이 목록과 업무수행 1번 카운팅에 자동으로 나타납니다.';
        }
      }
      var method=win.document.getElementById('importReceiptMethodSummary');
      if(method)method.querySelectorAll('small').forEach(function(node){
        if(node.textContent.trim()==='입고요청')node.textContent='입고예정 확정';
      });
    }

    ['renderImportReceiptHomeCount','renderImportReceiptManagement','renderImportReceiptMethod'].forEach(function(name){
      var original=win[name];
      if(typeof original!=='function')return;
      win[name]=function confirmedImportRender(){
        var result=original.apply(this,arguments);
        relabelConfirmedImport();
        return result;
      };
    });

    function withConfirmedShippingRows(fn,context,args){
      var shared=currentState();
      if(!shared||!Array.isArray(shared.salesOrders))return fn.apply(context,args);
      var allRows=shared.salesOrders;
      shared.salesOrders=allRows.filter(dispatchRequestConfirmed);
      try{return fn.apply(context,args)}finally{shared.salesOrders=allRows}
    }

    // The progress dashboard must show every active S.O from the planning stage.
    // Only the actual field shipping screens are gated by dispatch confirmation.
    ['renderShippingModeMenu','renderShippingWork','renderInstantShipping'].forEach(function(name){
      var original=win[name];
      if(typeof original!=='function')return;
      win[name]=function confirmedShippingRender(){
        return withConfirmedShippingRows(original,this,arguments);
      };
    });

    if(typeof win.instantShippingOrder==='function'){
      var originalInstantShippingOrder=win.instantShippingOrder;
      win.instantShippingOrder=function confirmedInstantShippingOrder(){
        var row=originalInstantShippingOrder.apply(this,arguments);
        return dispatchRequestConfirmed(row)?row:undefined;
      };
    }

    win.fieldInboundScheduleConfirmed=inboundScheduleConfirmed;
    win.fieldDispatchRequestConfirmed=dispatchRequestConfirmed;
    win.document.documentElement.dataset.confirmedQueueGateV1='ready';
    try{
      if(typeof win.renderAll==='function')win.renderAll();
      else{
        if(typeof win.renderImportReceiptHomeCount==='function')win.renderImportReceiptHomeCount();
        if(typeof win.renderShippingModeMenu==='function')win.renderShippingModeMenu();
      }
    }catch(_){/* The regular render cycle will retry after login/state load. */}
  }

  return{
    inboundScheduleConfirmed:inboundScheduleConfirmed,
    dispatchRequestConfirmed:dispatchRequestConfirmed,
    install:install
  };
});
