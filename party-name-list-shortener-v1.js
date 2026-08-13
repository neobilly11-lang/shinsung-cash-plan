Exit code: 0
Wall time: 0.8 seconds
Output:
(function partyNameListShortenerV1(){
  'use strict';

  var LIMIT=10;
  var LIST_SCOPES='table tbody,[id$="List"],[id$="Rows"],[id$="Grid"],.cards,.list-grid,.result-list,.donecard,.qrcard,.stock-detail-card,.po-group-card,.workwait-card,.request-card';
  var scheduled=false;

  function safeArray(value){return Array.isArray(value)?value:[]}
  function textLength(value){return Array.from(String(value||'')).length}
  function shortName(value){
    var chars=Array.from(String(value||'').trim());
    return chars.length>LIMIT?chars.slice(0,LIMIT).join('')+'…':chars.join('');
  }
  function currentState(){
    try{return typeof state==='object'&&state?state:(window.state||{})}
    catch(_){return window.state||{}}
  }
  function partyNames(){
    var source=currentState();
    var names=[];
    safeArray(source.companies).forEach(function(value){names.push(value)});
    safeArray(source.pos).forEach(function(row){names.push(row&&row.company)});
    safeArray(source.salesOrders).forEach(function(row){names.push(row&&row.customer)});
    safeArray(source.shipments).forEach(function(row){names.push(row&&row.customer)});
    safeArray(source.domesticReceipts).forEach(function(row){names.push(row&&row.supplier)});
    safeArray(source.workWaits).forEach(function(row){names.push(row&&row.company)});
    function collect(value,depth){
      if(depth>4||value==null)return;
      if(Array.isArray(value)){value.forEach(function(item){collect(item,depth+1)});return}
      if(typeof value!=='object')return;
      Object.keys(value).forEach(function(key){
        var child=value[key];
        if(/^(company|companyName|customer|customerName|supplier|supplierName|buyer|buyerName|seller|sellerName)$/i.test(key)&&typeof child==='string')names.push(child);
        else if(child&&typeof child==='object')collect(child,depth+1);
      });
    }
    collect(source,0);
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
    document.documentElement.dataset.partyNameListShortenerV1='ready';
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

