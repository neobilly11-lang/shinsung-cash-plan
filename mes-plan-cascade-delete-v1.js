(function(root,factory){
  'use strict';
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root){root.MesPlanCascadeDeleteV1=api;if(root.document)api.install(root);}
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';

  function list(value){return Array.isArray(value)?value:[];}
  function text(value){return String(value==null?'':value).trim();}
  function upper(value){return text(value).toUpperCase();}
  function number(value){var parsed=Number(String(value==null?'':value).replace(/,/g,''));return Number.isFinite(parsed)?parsed:0;}
  function key(value){return upper(value).replace(/\s+/g,' ');}
  function firstNumber(row,names){
    for(var i=0;i<names.length;i+=1){
      var raw=row&&row[names[i]];
      if(raw!==undefined&&raw!==null&&text(raw)!=='')return Math.max(0,number(raw));
    }
    return 0;
  }
  function customerGrade(row){
    return text(row&&(row.customerGrade||row.sourceGrade||row.grade||row.originalGrade||row.mainGrade||row.description));
  }
  function dominantCustomerGrade(items){
    var totals=new Map(),labels=new Map(),order=[];
    list(items).forEach(function(item){
      var label=customerGrade(item);if(!label)return;
      var normalized=key(label),weight=firstNumber(item,['netWeight','nw','weight','quantity','grossWeight','gw','planWeight','receivedWeight','confirmedWeight','shippedWeight','stock']);
      if(!totals.has(normalized)){totals.set(normalized,0);labels.set(normalized,label);order.push(normalized);}
      totals.set(normalized,totals.get(normalized)+weight);
    });
    if(!order.length)return'';
    order.sort(function(a,b){var delta=totals.get(b)-totals.get(a);return delta||0;});
    return labels.get(order[0])||'';
  }
  function applyDominantGrade(row){
    if(!row||typeof row!=='object')return row;
    var items=list(row.items).length?row.items:(list(row.rows).length?row.rows:[row]);
    var grade=dominantCustomerGrade(items);if(!grade)return row;
    var next=Object.assign({},row,{grade:grade,customerGrade:grade});
    if(Object.prototype.hasOwnProperty.call(row,'gradeSummary'))next.gradeSummary=grade;
    if(Object.prototype.hasOwnProperty.call(row,'mainGrades'))next.mainGrades=grade;
    return next;
  }

  function scalarValues(value){
    if(Array.isArray(value))return value.map(text).filter(Boolean);
    if(value&&typeof value==='object')return Object.keys(value).concat(Object.values(value).map(text)).filter(Boolean);
    var valueText=text(value);return valueText?[valueText]:[];
  }
  function fieldMatches(record,fieldPattern,refs){
    if(!record||typeof record!=='object'||!refs.size)return false;
    return Object.keys(record).some(function(name){
      if(!fieldPattern.test(name))return false;
      return scalarValues(record[name]).some(function(value){return refs.has(key(value));});
    });
  }
  function poReference(record,poRefs,packageRefs){
    if(!record||typeof record!=='object')return false;
    if(upper(record.orderType)==='PO'&&poRefs.has(key(record.orderNo)))return true;
    return fieldMatches(record,/^(?:poNo|purchaseNo|purchaseOrderNo|sourcePoNo|requestPoNo|poNos)$/i,poRefs)
      ||fieldMatches(record,/(?:^|_)(?:packageNo|packageNos|packageId|packageIds|internalPackageNo|sourcePackageNo|sourcePackageNos|originalPackageNo)$/i,packageRefs)
      ||fieldMatches(record,/^(?:reference|relatedNo)$/i,new Set(Array.from(poRefs).concat(Array.from(packageRefs))));
  }
  function salesReference(record,soRefs,itemRefs,shipmentRefs,packingRefs){
    if(!record||typeof record!=='object')return false;
    if(upper(record.orderType)==='SO'&&soRefs.has(key(record.orderNo)))return true;
    return fieldMatches(record,/^(?:soNo|salesNo|salesOrderNo|sourceSoNo|soNos)$/i,soRefs)
      ||fieldMatches(record,/^(?:salesOrderId|salesOrderIds|orderId|orderIds)$/i,itemRefs)
      ||fieldMatches(record,/^(?:shipmentId|shipmentIds)$/i,shipmentRefs)
      ||fieldMatches(record,/^(?:packingListId|packingListIds)$/i,packingRefs)
      ||fieldMatches(record,/^(?:reference|relatedNo)$/i,new Set(Array.from(soRefs).concat(Array.from(itemRefs))));
  }
  function bagReference(record,bagRefs,completionRefs){
    return fieldMatches(record,/^(?:bagId|bagIds|sourceBagId|sourceBagIds|targetBagId)$/i,bagRefs)
      ||fieldMatches(record,/^(?:completionNo|completionNos|sourceCompletionNo)$/i,completionRefs);
  }
  function excludedMasterCollection(name){
    return /^(?:auditLogs|locations|mainGrades|subGrades|productTypes|workers|users|packagingTypes|workWaitLocations|selectionGuides|customers|companies|savedMappings|settings|config|configuration)$/i.test(name);
  }
  function setArray(shared,name,next,changed,counts){
    var before=list(shared[name]);
    if(before.length===next.length&&before.every(function(item,index){return item===next[index];}))return;
    shared[name]=next;changed.add(name);counts[name]=(counts[name]||0)+Math.max(0,before.length-next.length);
  }
  function removeMatching(shared,name,predicate,changed,counts){
    if(!Array.isArray(shared[name]))return[];
    var removed=[],kept=[];
    shared[name].forEach(function(item){if(predicate(item)){removed.push(item);}else kept.push(item);});
    if(removed.length)setArray(shared,name,kept,changed,counts);
    return removed;
  }
  function recordIdSet(records){return new Set(list(records).map(function(row){return key(row&&row.id);}).filter(Boolean));}
  function addRecordRefs(target,records,names){
    list(records).forEach(function(row){list(names).forEach(function(name){scalarValues(row&&row[name]).forEach(function(value){if(value)target.add(key(value));});});});
  }
  function activeRecord(row){return !['CANCELLED','CANCELED','DELETED'].includes(upper(row&&row.status));}

  function stockForBag(shared,bagId){
    var incoming=list(shared.inputs).filter(function(row){return activeRecord(row)&&key(row.bagId)===key(bagId);}).reduce(function(sum,row){return sum+number(row.weight);},0);
    var moved=list(shared.inputs).filter(function(row){return activeRecord(row)&&key(row.sourceBagId)===key(bagId);}).reduce(function(sum,row){return sum+number(row.weight);},0);
    var shipped=list(shared.shipmentAllocations).filter(function(row){return activeRecord(row)&&key(row.bagId)===key(bagId);}).reduce(function(sum,row){return sum+number(row.weight);},0);
    var returned=list(shared.returnReceipts).filter(function(row){return activeRecord(row)&&key(row.bagId)===key(bagId);}).reduce(function(sum,row){return sum+number(row.weight);},0);
    return Math.max(0,incoming-moved-shipped+returned);
  }
  function sanitizeDocumentRows(shared,removedBagRefs,removedCompletionRefs,packageRefs,changed){
    ['packingLists','shipments'].forEach(function(name){
      if(!Array.isArray(shared[name]))return;
      var touched=false,next=shared[name].map(function(row){
        if(!row||typeof row!=='object')return row;
        var copy=Object.assign({},row),local=false;
        ['bagIds','confirmedBagIds','finalBagIds'].forEach(function(field){if(Array.isArray(copy[field])){var filtered=copy[field].filter(function(value){return !removedBagRefs.has(key(value));});if(filtered.length!==copy[field].length){copy[field]=filtered;local=true;}}});
        ['completionNos'].forEach(function(field){if(Array.isArray(copy[field])){var filtered=copy[field].filter(function(value){return !removedCompletionRefs.has(key(value));});if(filtered.length!==copy[field].length){copy[field]=filtered;local=true;}}});
        ['packageNos'].forEach(function(field){if(Array.isArray(copy[field])){var filtered=copy[field].filter(function(value){return !packageRefs.has(key(value));});if(filtered.length!==copy[field].length){copy[field]=filtered;local=true;}}});
        if(copy.bagWeights&&typeof copy.bagWeights==='object'){var weights=Object.assign({},copy.bagWeights);Object.keys(weights).forEach(function(id){if(removedBagRefs.has(key(id))){delete weights[id];local=true;}});copy.bagWeights=weights;}
        if(local){touched=true;return copy;}return row;
      });
      if(touched){shared[name]=next;changed.add(name);}
    });
  }

  function cascadePurchase(shared,poNo){
    var changed=new Set(),counts={},target=key(poNo),poRefs=new Set([target]);
    var purchaseRows=list(shared.pos).filter(function(row){return key(row.poNo)===target;});
    var packageRefs=new Set();addRecordRefs(packageRefs,purchaseRows,['id','packageNo','internalPackageNo']);
    var eventIds=new Set();
    Object.keys(shared).forEach(function(name){
      if(!Array.isArray(shared[name])||excludedMasterCollection(name))return;
      shared[name].forEach(function(row){if(poReference(row,poRefs,packageRefs)&&row&&row.id)eventIds.add(key(row.id));});
    });
    removeMatching(shared,'pos',function(row){return key(row.poNo)===target;},changed,counts);
    var protectedCore=new Set(['pos','inputs','bags','salesOrders','packingLists','shipments','shipmentAllocations','auditLogs']);
    Object.keys(shared).forEach(function(name){
      if(!Array.isArray(shared[name])||excludedMasterCollection(name)||protectedCore.has(name))return;
      removeMatching(shared,name,function(row){return poReference(row,poRefs,packageRefs);},changed,counts);
    });
    var allInputs=list(shared.inputs),removedInputIds=new Set();
    allInputs.forEach(function(row){
      if(poReference(row,poRefs,packageRefs)||fieldMatches(row,/^(?:sourceSplitId|sourceWaitingMoveId|sourceMoveId)$/i,eventIds))removedInputIds.add(key(row.id));
    });
    var removedBagRefs=new Set(),candidateBagRefs=new Set();
    allInputs.forEach(function(row){if(removedInputIds.has(key(row.id))&&row.bagId)candidateBagRefs.add(key(row.bagId));});
    var progress=true;
    while(progress){
      progress=false;
      Array.from(candidateBagRefs).forEach(function(bagId){
        if(removedBagRefs.has(bagId))return;
        var remaining=allInputs.some(function(row){return activeRecord(row)&&!removedInputIds.has(key(row.id))&&key(row.bagId)===bagId&&!removedBagRefs.has(key(row.sourceBagId));});
        if(remaining)return;
        removedBagRefs.add(bagId);progress=true;
        allInputs.forEach(function(row){
          if(key(row.bagId)===bagId||key(row.sourceBagId)===bagId){
            if(!removedInputIds.has(key(row.id))){removedInputIds.add(key(row.id));if(row.bagId)candidateBagRefs.add(key(row.bagId));}
          }
        });
      });
    }
    if(removedInputIds.size)removeMatching(shared,'inputs',function(row){return removedInputIds.has(key(row.id));},changed,counts);
    var removedBags=list(shared.bags).filter(function(row){return removedBagRefs.has(key(row.id));}),removedCompletionRefs=new Set();
    addRecordRefs(removedCompletionRefs,removedBags,['completionNo','bagNo','code']);
    if(removedBagRefs.size)removeMatching(shared,'bags',function(row){return removedBagRefs.has(key(row.id));},changed,counts);
    if(removedBagRefs.size){
      removeMatching(shared,'shipmentAllocations',function(row){return bagReference(row,removedBagRefs,removedCompletionRefs);},changed,counts);
      Object.keys(shared).forEach(function(name){
        if(!Array.isArray(shared[name])||excludedMasterCollection(name)||['pos','inputs','bags','salesOrders','packingLists','shipments','shipmentAllocations','auditLogs'].includes(name))return;
        removeMatching(shared,name,function(row){return bagReference(row,removedBagRefs,removedCompletionRefs);},changed,counts);
      });
      sanitizeDocumentRows(shared,removedBagRefs,removedCompletionRefs,packageRefs,changed);
    }
    return{kind:'purchase',target:poNo,changedKeys:Array.from(changed),counts:counts,removedPackages:purchaseRows.length};
  }
  function cascadeSales(shared,soNo){
    var changed=new Set(),counts={},target=key(soNo),soRefs=new Set([target]);
    var items=list(shared.salesOrders).filter(function(row){return key(row.soNo)===target;});
    var itemRefs=recordIdSet(items),empty=new Set();
    var shipments=list(shared.shipments).filter(function(row){return salesReference(row,soRefs,itemRefs,empty,empty);});
    var shipmentRefs=recordIdSet(shipments);
    var packingLists=list(shared.packingLists).filter(function(row){return salesReference(row,soRefs,itemRefs,shipmentRefs,empty);});
    var packingRefs=recordIdSet(packingLists);
    var allocations=list(shared.shipmentAllocations).filter(function(row){return salesReference(row,soRefs,itemRefs,shipmentRefs,packingRefs);});
    var affectedBagRefs=new Set();addRecordRefs(affectedBagRefs,allocations,['bagId']);
    removeMatching(shared,'salesOrders',function(row){return key(row.soNo)===target;},changed,counts);
    removeMatching(shared,'shipments',function(row){return salesReference(row,soRefs,itemRefs,shipmentRefs,packingRefs);},changed,counts);
    removeMatching(shared,'packingLists',function(row){return salesReference(row,soRefs,itemRefs,shipmentRefs,packingRefs);},changed,counts);
    removeMatching(shared,'shipmentAllocations',function(row){return salesReference(row,soRefs,itemRefs,shipmentRefs,packingRefs);},changed,counts);
    var protectedCore=new Set(['pos','splits','inputs','bags','losses','workWaits','salesOrders','packingLists','shipments','shipmentAllocations','auditLogs']);
    Object.keys(shared).forEach(function(name){
      if(!Array.isArray(shared[name])||excludedMasterCollection(name)||protectedCore.has(name))return;
      removeMatching(shared,name,function(row){return salesReference(row,soRefs,itemRefs,shipmentRefs,packingRefs);},changed,counts);
    });
    if(affectedBagRefs.size&&Array.isArray(shared.bags)){
      var touched=false;
      shared.bags.forEach(function(bag){
        if(!affectedBagRefs.has(key(bag.id)))return;
        var stock=stockForBag(shared,bag.id),status=upper(bag.status);
        if(stock>0&&['SHIPPED','DEPLETED'].includes(status)){bag.status='COMPLETE';delete bag.shippedAt;delete bag.depletedAt;touched=true;}
      });
      if(touched)changed.add('bags');
    }
    return{kind:'sales',target:soNo,changedKeys:Array.from(changed),counts:counts,removedItems:items.length};
  }
  function cascadeDelete(shared,kindName,target){
    if(kindName==='purchase')return cascadePurchase(shared,target);
    if(kindName==='sales')return cascadeSales(shared,target);
    throw new Error('지원하지 않는 삭제 구분입니다.');
  }

  function install(win){
    if(win.__mesPlanCascadeDeleteV1)return;
    win.__mesPlanCascadeDeleteV1=true;
    var doc=win.document;
    function globalValue(name){try{return win[name];}catch(_){return undefined;}}
    function current(){try{return currentView;}catch(_){return win.currentView||'';}}
    function activeState(){try{return state;}catch(_){return win.state||{};}}
    function userName(){try{return currentUserName();}catch(_){return'';}}
    function userEmail(){try{return authUser&&authUser.email||'';}catch(_){return'';}}
    function escapeHtml(value){try{return esc(value);}catch(_){return text(value).replace(/[&<>"']/g,function(ch){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});}}
    function notify(message,bad){try{return toast(message,bad);}catch(_){if(bad)console.error(message);else console.log(message);}}
    function collectionSummary(result){var total=Object.keys(result.counts||{}).reduce(function(sum,name){return sum+number(result.counts[name]);},0);return total+'건';}
    function rowKey(view,row){return view==='purchase'?text(row&&row.poNo):text(row&&row.soNo);}
    function viewRows(view){try{return list(schemas[view].rows());}catch(_){return[];}}
    function resolveKey(view,id){var row=viewRows(view).find(function(item){return text(item.id)===text(id)||rowKey(view,item)===text(id);});return rowKey(view,row)||text(id);}

    function wrapSchemaRows(name){
      try{
        var schema=schemas[name];if(!schema||typeof schema.rows!=='function'||schema.rows.__dominantGradeV1)return;
        var previous=schema.rows,wrapped=function(){return list(previous()).map(applyDominantGrade);};
        wrapped.__dominantGradeV1=true;wrapped.__previous=previous;schema.rows=wrapped;
      }catch(_){/* optional schema */}
    }
    ['purchase','sales','inbound','production','settlement','inboundRequest','shippingPlan','shipping'].forEach(wrapSchemaRows);
    try{
      var previousPoRows=poRows;
      poRows=function(){return list(previousPoRows()).map(applyDominantGrade);};
      poRows.__dominantGradeV1=true;
      if(schemas.purchase)schemas.purchase.rows=poRows;
    }catch(_){/* global lexical binding differs by browser */}
    try{
      var previousSalesRows=salesRows;
      salesRows=function(){return list(previousSalesRows()).map(applyDominantGrade);};
      salesRows.__dominantGradeV1=true;
      if(schemas.sales)schemas.sales.rows=salesRows;
    }catch(_){/* global lexical binding differs by browser */}

    async function saveCascade(kindName,target){
      var progress=doc.getElementById('progress');if(progress)progress.classList.add('on');
      try{
        for(var attempt=0;attempt<4;attempt+=1){
          var latest=await mesFetchState(),draft=defaults(structuredClone(latest.payload)),result=cascadeDelete(draft,kindName,target);
          if(!result.changedKeys.length)throw new Error('삭제할 연결자료를 찾지 못했습니다.');
          var stamp=new Date().toISOString(),audit={id:crypto.randomUUID(),action:'MES_CASCADE_DELETE',label:'계획 연결자료 일괄 삭제',targetType:kindName==='purchase'?'PO':'SO',targetNo:target,operatorName:userName(),operatorEmail:userEmail(),hiddenFromMes:true,createdAt:stamp,removedCounts:result.counts};
          draft.auditLogs=list(draft.auditLogs).concat(audit);
          var changes={auditLogs:draft.auditLogs};result.changedKeys.forEach(function(name){changes[name]=draft[name];});
          var response=await fetch('/api/scrap-state',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({changes:changes,baseRevision:number(latest.revision)})});
          var out={};try{out=await response.json();}catch(_){out={};}
          if(response.status===409)continue;
          if(!response.ok)throw new Error(out.error||('저장 HTTP '+response.status));
          try{state=draft;revision=number(out.revision)||number(latest.revision)+1;mesWriteCache(state,revision);}catch(_){/* cache is optional */}
          if(progress)progress.classList.remove('on');
          try{closeModal();}catch(_){/* modal may be closed */}
          try{render();}catch(_){/* next reload paints */}
          notify((kindName==='purchase'?'P.O ':'S.O ')+target+' 삭제 완료 · 1~11번 연결자료 '+collectionSummary(result)+'을 정리했습니다.');
          return true;
        }
        throw new Error('다른 작업자의 저장과 반복 충돌했습니다. 다시 눌러 주세요.');
      }catch(error){notify('전체 흔적 삭제 실패: '+error.message,true);return false;}
      finally{if(progress)progress.classList.remove('on');}
    }
    win.requestMesCascadeDelete=async function(view,id){
      var kindName=view==='purchase'?'purchase':view==='sales'?'sales':'';if(!kindName)return;
      var target=resolveKey(view,id);if(!target)return notify('삭제할 번호를 찾지 못했습니다.',true);
      var label=(kindName==='purchase'?'P.O ':'S.O ')+target;
      if(!win.confirm(label+'와 연결된 입고·검수·재고·출하 등 1~11번 업무자료가 함께 삭제됩니다.\n\n이 작업은 되돌리기 어렵습니다. 계속하시겠습니까?'))return;
      var typed=win.prompt('오삭제 방지를 위해 아래 번호를 그대로 입력하세요.\n'+target,'');
      if(text(typed)!==target)return notify('번호가 일치하지 않아 삭제를 취소했습니다.',true);
      return saveCascade(kindName,target);
    };
    function deleteButton(view,keyValue,compact){
      return '<button class="btn danger mes-cascade-delete-btn '+(compact?'compact':'')+'" onclick="event.stopPropagation();requestMesCascadeDelete(\''+view+'\',decodeURIComponent(\''+encodeURIComponent(keyValue)+'\'))">전체 흔적 삭제</button>';
    }
    function decorateDeleteButtons(){
      var view=current();if(!['purchase','sales'].includes(view))return;
      var rows;
      try{rows=typeof filtered==='function'?filtered(schemas[view].rows()):schemas[view].rows();}catch(_){rows=[];}
      doc.querySelectorAll('#content .table-wrap tbody tr:not(.total-row)').forEach(function(tr,index){
        var row=rows[index];if(!row||tr.querySelector('.mes-cascade-delete-btn'))return;
        var cell=tr.lastElementChild,keyValue=rowKey(view,row);if(cell&&keyValue)cell.insertAdjacentHTML('beforeend',deleteButton(view,keyValue,true));
      });
      doc.querySelectorAll('#content .cards .mobile-card').forEach(function(card,index){
        var row=rows[index];if(!row||card.querySelector('.mes-cascade-delete-btn'))return;
        var keyValue=rowKey(view,row);if(keyValue)card.insertAdjacentHTML('beforeend',deleteButton(view,keyValue,false));
      });
    }
    var previousRender=win.render;
    win.render=function(){var result=previousRender.apply(this,arguments);requestAnimationFrame(decorateDeleteButtons);setTimeout(decorateDeleteButtons,40);return result;};
    try{render=win.render;}catch(_){/* function binding fallback */}
    var previousOpen=win.openMesDetail;
    win.openMesDetail=function(view,id){
      var result=previousOpen.apply(this,arguments);
      if(['purchase','sales'].includes(view))setTimeout(function(){
        var actions=doc.querySelector('#modalBody .detail-actions')||doc.querySelector('#modalBody .actions');
        var target=resolveKey(view,id);if(actions&&target&&!actions.querySelector('.mes-cascade-delete-btn'))actions.insertAdjacentHTML('afterbegin',deleteButton(view,target,false));
      },0);
      return result;
    };
    try{openMesDetail=win.openMesDetail;}catch(_){/* function binding fallback */}
    var style=doc.createElement('style');style.id='mesPlanCascadeDeleteV1Style';style.textContent='.mes-cascade-delete-btn{background:#b4232f!important;border-color:#b4232f!important;color:#fff!important}.mes-cascade-delete-btn.compact{margin-left:6px;padding:8px 10px}.mes-cascade-delete-btn:hover{background:#8e1822!important}@media(max-width:760px){.mes-cascade-delete-btn{width:100%;margin-top:9px}}';doc.head.appendChild(style);
    if(current())win.render();
    doc.documentElement.dataset.mesPlanCascadeDeleteV1='loaded';
  }

  return{dominantCustomerGrade:dominantCustomerGrade,applyDominantGrade:applyDominantGrade,cascadeDelete:cascadeDelete,cascadePurchase:cascadePurchase,cascadeSales:cascadeSales,install:install};
});
