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