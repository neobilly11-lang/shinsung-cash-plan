(function partyNameListShortenerV1(){
  'use strict';

  var LIMIT=10;
  var LIST_SCOPES='table tbody,[id$="List"],[id$="Rows"],[id$="Grid"],.cards,.list-grid,.result-list';
  var scheduled=false;

  function safeArray(value){return Array.isArray(value)?value:[]}
  function textLength(value){return Array.from(String(value||'')).length}
  function shortName(value){
    var chars=Array.from(String(value||'').trim());
    return chars.length>LIMIT?chars.slice(0,LIMIT).join('')+'…':chars.join('');
  }
  function partyNames(){
    var source=window.state||{};
    var names=[];
    safeArray(source.companies).forEach(function(value){names.push(value)});
    safeArray(source.pos).forEach(function(row){names.push(row&&row.company)});
    safeArray(source.salesOrders).forEach(function(row){names.push(row&&row.customer)});
    safeArray(source.shipments).forEach(function(row){names.push(row&&row.customer)});
    safeArray(source.domesticReceipts).forEach(function(row){names.push(row&&row.supplier)});
    safeArray(source.workWaits).forEach(function(row){names.push(row&&row.company)});
    return Array.from(new Set(names.map(function(value){return String(value||'').trim()}).filter(function(value){return textLength(value)>LIMIT})))
      .sort(function(a,b){return textLength(b)-textLength(a)});
  }
  function listTextNodes(){
    var nodes=[];
    document.querySelectorAll(LIST_SCOPES).forEach(function(scope){
      if(scope.closest('.modal.on,.view.on')||scope.closest('#content')||scope.tagName==='TBODY'){
        var walker=document.createTreeWalker(scope,NodeFilter.SHOW_TEXT);
        var node;
        while((node=walker.nextNode())){
          var parent=node.parentElement;
          if(!parent||parent.closest('script,style,textarea,input,select,option,datalist'))continue;
          nodes.push(node);
        }
      }
    });
    return nodes;
  }
  function apply(){
    scheduled=false;
    var names=partyNames();
    if(!names.length)return;
    listTextNodes().forEach(function(node){
      var original=node.nodeValue||'';
      var changed=original;
      var matched='';
      names.forEach(function(name){
        if(changed.indexOf(name)!==-1){changed=changed.split(name).join(shortName(name));matched=matched||name}
      });
      if(changed!==original){
        node.nodeValue=changed;
        var owner=node.parentElement;
        if(owner&&!owner.title)owner.title=matched;
      }
    });
    document.documentElement.dataset.partyNameListShortenerV1='ready';
  }
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(apply);
  }

  window.shortListPartyName=shortName;
  new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
  else schedule();
})();

