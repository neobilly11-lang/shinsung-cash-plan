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

  function installMesAccess(){
    var nav=document.querySelector('nav.bottom');
    if(nav&&!nav.querySelector('[data-v="mes"]')){
      var button=document.createElement('button');
      button.dataset.v='mes';button.innerHTML='④<br>MES';
      button.addEventListener('click',function(){window.openMesFromField();});
      nav.appendChild(button);nav.style.gridTemplateColumns='repeat(4,minmax(0,1fr))';
    }
    window.openMesFromField=function openMesFromField(){
      var session=null;
      try{session=typeof authSession!=='undefined'&&authSession&&authSession.access_token?authSession:null;}catch(_){}
      if(!session)for(var pair of [[localStorage,'scrap-auth-session-v1'],[sessionStorage,'scrap-auth-session-temp-v1']])try{var value=JSON.parse(pair[0].getItem(pair[1])||'null');if(value&&value.access_token){session=value;break;}}catch(_){}
      if(session)try{
        var user=(typeof authUser!=='undefined'&&authUser)||session.user||null;
        var bridge=Object.assign({},session,{user:user,remember:session.remember!==false,source:'field',createdAt:Date.now()});
        sessionStorage.setItem('shinsung-field-auth-bridge-v1',JSON.stringify(bridge));
        if(bridge.remember)localStorage.setItem('shinsung-field-auth-bridge-v1',JSON.stringify(bridge));
      }catch(_){}
      location.assign('/mes.html?v=mes-access-sales-balance-20260814-1&from=field&authBridge=1#dashboard');
    };
    if(nav){var mes=nav.querySelector('[data-v="mes"]');if(mes)mes.onclick=function(event){event.preventDefault();window.openMesFromField();};}
  }

  installMesAccess();

  document.documentElement.dataset.fieldPackingDraftGuardV1='loaded';
})();

