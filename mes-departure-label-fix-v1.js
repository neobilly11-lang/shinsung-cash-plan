(function(){
  'use strict';
  if(window.__mesDepartureLabelFixV1)return;
  window.__mesDepartureLabelFixV1=true;

  function rename(root){
    if(!root)return;
    var walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    var node;
    while((node=walker.nextNode())){
      if(node.nodeValue&&node.nodeValue.includes('출하예정일')){
        node.nodeValue=node.nodeValue.replaceAll('출하예정일','출항예정일');
      }
    }
  }

  function apply(){rename(document.body);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});
  else apply();
  new MutationObserver(function(records){
    records.forEach(function(record){
      record.addedNodes.forEach(function(node){
        if(node.nodeType===Node.TEXT_NODE){
          if(node.nodeValue&&node.nodeValue.includes('출하예정일'))node.nodeValue=node.nodeValue.replaceAll('출하예정일','출항예정일');
        }else rename(node);
      });
    });
  }).observe(document.documentElement,{childList:true,subtree:true});
  function loadUpgrade(src,id){
    if(document.getElementById(id))return;
    var script=document.createElement('script');script.id=id;script.src=src;script.defer=true;document.head.appendChild(script);
  }
  loadUpgrade('/mes-sales-balance-v1.js?v=20260814-1','mesSalesBalanceV1Loader');
  loadUpgrade('/mes-access-recovery-v1.js?v=20260814-1','mesAccessRecoveryV1Loader');
  document.documentElement.dataset.mesDepartureLabelFixV1='loaded';
})();

