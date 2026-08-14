(function(){
  'use strict';
  if(window.__fieldPackingDraftGuardV1)return;
  window.__fieldPackingDraftGuardV1=true;

  function text(value){return String(value==null?'':value).trim();}
  function newestBag(before){return state.bags.filter(function(row){return !before.has(row.id);}).sort(function(a,b){return text(b.createdAt).localeCompare(text(a.createdAt));})[0]||null;}
  function keepCurrentPackingContext(bag,sourceNo){
    if(!bag)return;
    sourceNo=text(sourceNo).toUpperCase();
    clearTimeout(workflowDraftTimer);clearTimeout(workflowDraftRetryTimer);
    workflowDraftQueued=false;
    workflowDraftTouchedViews.add('repack');
    if(sourceNo){currentPackingSourceNo=sourceNo;if(E('repackPackageNo'))E('repackPackageNo').value=sourceNo;}
    renderRepack(bag.id);
    if(E('bagSelect'))E('bagSelect').value=bag.id;
    sessionStorage.setItem('workflowDraftBagId',bag.id);
    if(sourceNo)clearWorkflowDrafts(3,[sourceNo]);
    workflowDraftTouchedViews.add('repack');
    queueWorkflowDraftStructuralSave('repack');
  }

  var createBagBeforeDraftGuard=window.createBag;
  window.createBag=async function createBagWithFreshPackingDraft(){
    var before=new Set(state.bags.map(function(row){return row.id;}));
    var sourceNo=text(E('repackPackageNo')&&E('repackPackageNo').value)||text(currentPackingSourceNo);
    var result=await createBagBeforeDraftGuard.apply(this,arguments);
    var bag=newestBag(before);
    if(bag)keepCurrentPackingContext(bag,sourceNo);
    return result;
  };

  var closeCompletionQrBeforeDraftGuard=window.closeCompletionQr;
  window.closeCompletionQr=function closeCompletionQrWithFreshPackingContext(){
    var bag=state.bags.find(function(row){return row.id===currentQrBagId;})||state.bags.find(function(row){return row.id===sessionStorage.getItem('workflowDraftBagId');});
    var sourceNo=text(currentPackingSourceNo)||text(E('repackPackageNo')&&E('repackPackageNo').value);
    var result=closeCompletionQrBeforeDraftGuard.apply(this,arguments);
    if(bag){
      keepCurrentPackingContext(bag,sourceNo);
      if(inspectionSettlementAction==='PACKING'&&currentInspectionSettlementBatchId)focusInspectionSettlementPackingSource();
      else if(currentWorkWaitPackingId)focusWorkWaitPackingSource();
    }
    return result;
  };

  var setSimplePackingMoveBeforeDraftGuard=window.setSimplePackingMove;
  window.setSimplePackingMove=function setSimplePackingMoveWithoutDraftCollision(no,grade,mode){
    workflowDraftTouchedViews.add('repack');
    clearTimeout(workflowDraftTimer);clearTimeout(workflowDraftRetryTimer);
    var result=setSimplePackingMoveBeforeDraftGuard.apply(this,arguments);
    currentPackingSourceNo=no;
    workflowDraftTouchedViews.add('repack');
    queueWorkflowDraftStructuralSave('repack');
    return result;
  };

  document.documentElement.dataset.fieldPackingDraftGuardV1='loaded';
})();
