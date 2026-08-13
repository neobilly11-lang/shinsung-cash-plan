(function fieldListGradeShortenerV1(){
  'use strict';
  if(window.__fieldListGradeShortenerV1)return;
  window.__fieldListGradeShortenerV1=true;

  var LIMIT=10;
  var LIST_SCOPES='table tbody,[id$="List"],[id$="Rows"],[id$="Grid"],.result-list';
  var scheduled=false;

  function safeArray(value){return Array.isArray(value)?value:[]}
  function currentState(){
    try{return typeof state==='object'&&state?state:(window.state||{})}
    catch(_){return window.state||{}}
  }
  function addGrade(target,value){
    value=String(value||'').trim();
    if(Array.from(value).length>=LIMIT)target.push(value);
  }
  function gradeNames(){
    var source=currentState();
    var names=[];
    function collectRow(row){
      if(!row||typeof row!=='object')return;
      ['grade','mainGrade','finalGrade','confirmedGrade','supplierGrade'].forEach(function(key){addGrade(names,row[key])});
      safeArray(row.items).forEach(collectRow);
      safeArray(row.rows).forEach(collectRow);
    }
    ['pos','splits','bags','salesOrders','shipments','workWaits','purchaseRequests','domesticReceipts'].forEach(function(key){
      safeArray(source[key]).forEach(collectRow);
    });
    return Array.from(new Set(names)).sort(function(a,b){return Array.from(b).length-Array.from(a).length});
  }
  function apply(){
    scheduled=false;
    var names=gradeNames();
    document.documentElement.dataset.fieldListGradeShortenerV1='ready';
    if(!names.length)return;
    document.querySelectorAll(LIST_SCOPES).forEach(function(scope){
      if(scope.matches('#importReceiptDirectList,#inspectionSettlementRows')||scope.closest('#importReceiptDirect,#inspectionSettlement'))return;
      var walker=document.createTreeWalker(scope,NodeFilter.SHOW_TEXT);
      var node;
      while((node=walker.nextNode())){
        var parent=node.parentElement;
        if(!parent||parent.closest('script,style,textarea,input,select,option,datalist'))continue;
        var original=node.nodeValue||'',changed=original,matched='';
        names.forEach(function(name){
          if(changed.indexOf(name)!==-1){changed=changed.split(name).join('그 외');matched=matched||name}
        });
        if(changed!==original){
          node.nodeValue=changed;
          if(!parent.title)parent.title=matched;
        }
      }
    });
  }
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(apply);
  }
  new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
  else schedule();
})();

(function receiptGradeFallbackV2(){
  'use strict';
  if(window.__receiptGradeFallbackV2||typeof window.renderReceipt!=='function')return;
  window.__receiptGradeFallbackV2=true;
  var baseRenderReceipt=window.renderReceipt;
  window.renderReceipt=function(){
    baseRenderReceipt.apply(this,arguments);
    try{
      var source=typeof state==='object'&&state?state:(window.state||{});
      var packageNo=typeof currentReceiptPackage!=='undefined'?currentReceiptPackage:'';
      var row=(Array.isArray(source.pos)?source.pos:[]).find(function(item){return item&&item.packageNo===packageNo;});
      if(!row)return;
      var grade=String(row.grade||row.sourceGrade||row.mainGrade||row.detailGrade||'강종 미지정').trim();
      var cards=Array.from(document.querySelectorAll('#receiptSummary > div'));
      var card=cards.find(function(item){return /강종/.test(item.querySelector('small')?.textContent||'');})||cards[3];
      var value=card?.querySelector('b');
      if(value)value.textContent=grade;
      document.documentElement.dataset.receiptGradeFallbackV2='ready';
    }catch(error){console.warn('receipt grade fallback',error);}
  };
  try{renderReceipt=window.renderReceipt;}catch(_){ }
})();

(function directReceiptGradeFallbackV3(){
  'use strict';
  if(window.__directReceiptGradeFallbackV3||typeof window.renderImportReceiptDirect!=='function')return;
  window.__directReceiptGradeFallbackV3=true;

  function sourceState(){
    try{return typeof state==='object'&&state?state:(window.state||{});}
    catch(_){return window.state||{};}
  }
  function receiptGrade(row){
    if(!row)return '강종 미지정';
    return String(
      row.grade||row.sourceGrade||row.mainGrade||row.material||row.description||
      row.confirmedGrade||row.finalGrade||row.detailGrade||row.subGrade||'강종 미지정'
    ).trim()||'강종 미지정';
  }
  function packageRow(packageNo){
    var rows=Array.isArray(sourceState().pos)?sourceState().pos:[];
    return rows.find(function(row){return row&&String(row.packageNo||'')===String(packageNo||'');});
  }
  function refreshDirectReceiptGradeRows(){
    document.querySelectorAll('#importReceiptDirectList [data-workflow-choice^="import:"]').forEach(function(label){
      var key=String(label.getAttribute('data-workflow-choice')||'');
      var row=packageRow(key.slice(7));
      var content=label.querySelector('.workflow-check-content');
      if(!row||!content)return;
      var br=content.querySelector('br');
      if(!br){br=document.createElement('br');content.appendChild(br);}
      while(br.nextSibling)br.nextSibling.remove();
      content.appendChild(document.createTextNode(
        receiptGrade(row)+' · '+(typeof kg==='function'?kg(row.weight):String(row.weight||0)+' kg')+
        ' · P.O '+String(row.poNo||'-')
      ));
      label.dataset.receiptGrade=receiptGrade(row);
    });
    document.documentElement.dataset.directReceiptGradeFallbackV3='ready';
  }

  var baseDirectFilter=typeof window.directImportFilteredPackages==='function'?window.directImportFilteredPackages:null;
  if(baseDirectFilter){
    window.directImportFilteredPackages=function(){
      var rows=baseDirectFilter.apply(this,arguments);
      var input=document.getElementById('importReceiptDirectSearch');
      var query=String(input?.value||'').trim().toLowerCase();
      if(!query)return rows;
      var waiting=typeof importWaitingPackages==='function'?importWaitingPackages():[];
      var po=typeof selectedImportPoNo!=='undefined'?selectedImportPoNo:'';
      return waiting.filter(function(row){
        if(po&&row.poNo!==po)return false;
        return [row.packageNo,row.poNo,row.company,receiptGrade(row),row.grade,row.sourceGrade,row.mainGrade,
          row.material,row.description,row.confirmedGrade,row.finalGrade,row.subGrade,row.detailGrade]
          .some(function(value){return String(value||'').toLowerCase().includes(query);});
      });
    };
    try{directImportFilteredPackages=window.directImportFilteredPackages;}catch(_){ }
  }

  var baseDirectRender=window.renderImportReceiptDirect;
  window.renderImportReceiptDirect=function(){
    var result=baseDirectRender.apply(this,arguments);
    refreshDirectReceiptGradeRows();
    return result;
  };
  try{renderImportReceiptDirect=window.renderImportReceiptDirect;}catch(_){ }
  try{if(document.getElementById('importReceiptDirectList'))refreshDirectReceiptGradeRows();}catch(error){
    console.warn('direct receipt grade fallback',error);
  }
})();
