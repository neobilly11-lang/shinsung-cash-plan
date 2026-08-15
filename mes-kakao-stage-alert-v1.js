(function(){
  'use strict';
  if(window.__mesKakaoStageAlertV1)return;
  window.__mesKakaoStageAlertV1=true;

  var capturedShare=(function(){
    try{
      var url=new URL(location.href),view=url.searchParams.get('sharedView'),key=url.searchParams.get('sharedKey');
      return view&&key?{view:view,key:key,url:url.href}:null;
    }catch(_){return null;}
  })();

  function text(value){return String(value==null?'':value).trim();}
  function list(value){return Array.isArray(value)?value:[];}
  function state(){return window.__mesRuntime&&window.__mesRuntime.getState?window.__mesRuntime.getState():window.state||{};}
  function encode(value){return String(value==null?'':value).replace(/[&<>"']/g,function(char){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char];});}

  function ensureStyle(){
    if(document.getElementById('mesKakaoStageAlertStyle'))return;
    var style=document.createElement('style');
    style.id='mesKakaoStageAlertStyle';
    style.textContent='\
      .mes-kakao-alert{position:fixed;inset:0;z-index:120000;background:rgba(6,30,25,.72);display:flex;align-items:center;justify-content:center;padding:18px}\
      .mes-kakao-alert-card{width:min(620px,100%);background:#fff;border-radius:24px;padding:24px;box-shadow:0 26px 80px #0006}\
      .mes-kakao-alert-card small{display:block;color:#07806f;font-weight:900;margin-bottom:7px}\
      .mes-kakao-alert-card h2{margin:0 0 12px;color:#092f27;font-size:28px}\
      .mes-kakao-alert-card p{margin:0 0 16px;color:#40534f;line-height:1.55}\
      .mes-kakao-alert-summary{background:#eef8f5;border:1px solid #c7e5dc;border-radius:15px;padding:14px 16px;font-weight:850;color:#123b33;white-space:pre-wrap;word-break:break-word}\
      .mes-kakao-alert-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}\
      .mes-kakao-alert-actions .btn{min-height:52px;font-size:17px;font-weight:900}\
      .mes-pc-share-native{background:#fee500!important;color:#161616!important;border-color:#e3cc00!important}\
      @media(max-width:640px){.mes-kakao-alert-card{padding:19px;border-radius:20px}.mes-kakao-alert-card h2{font-size:23px}.mes-kakao-alert-actions{grid-template-columns:1fr}}';
    document.head.appendChild(style);
  }

  function closeAlert(){var layer=document.getElementById('mesKakaoStageAlert');if(layer)layer.remove();}
  window.closeMesKakaoStageAlert=closeAlert;

  function showAlert(kind,key,reason,send){
    ensureStyle();closeAlert();
    var layer=document.createElement('div');
    layer.id='mesKakaoStageAlert';layer.className='mes-kakao-alert';
    layer.innerHTML='<section class="mes-kakao-alert-card" role="dialog" aria-modal="true" aria-labelledby="mesKakaoStageAlertTitle"><small>'+encode(reason==='saved'?'저장 완료 · 알림 선택':'PC 카카오톡 공유')+'</small><h2 id="mesKakaoStageAlertTitle">담당자에게 카톡으로 알림</h2><p>'+(reason==='saved'?'저장된 내용을 담당자에게 바로 보낼 수 있습니다. 전송하기를 누른 뒤 카카오톡 앱과 대화창을 선택하세요.':'전송하기를 누른 뒤 카카오톡 앱과 대화창을 선택하세요. 상세내용 링크가 메시지에 함께 포함됩니다.')+'</p><div class="mes-kakao-alert-summary">'+encode(kind+'\n관련번호: '+(key||'-'))+'</div><div class="mes-kakao-alert-actions"><button type="button" class="btn primary mes-kakao-alert-send">전송하기</button><button type="button" class="btn mes-kakao-alert-close">창 닫기</button></div></section>';
    layer.querySelector('.mes-kakao-alert-close').onclick=closeAlert;
    layer.querySelector('.mes-kakao-alert-send').onclick=async function(){
      var button=this;button.disabled=true;button.textContent='공유창 여는 중…';
      try{closeAlert();await send();setTimeout(enhancePcFallback,30);}catch(error){button.disabled=false;button.textContent='전송하기';if(typeof window.toast==='function')window.toast('카카오톡 공유 실패: '+(error&&error.message||error),true);}
    };
    layer.addEventListener('click',function(event){if(event.target===layer)closeAlert();});
    document.body.appendChild(layer);
    setTimeout(function(){layer.querySelector('.mes-kakao-alert-send')&&layer.querySelector('.mes-kakao-alert-send').focus();},60);
  }

  function enhancePcFallback(){
    var overlay=document.getElementById('mesPcShareOverlay');
    if(!overlay||overlay.querySelector('.mes-pc-share-native'))return;
    var actions=overlay.querySelector('.actions');if(!actions)return;
    var button=document.createElement('button');button.type='button';button.className='btn mes-pc-share-native';button.textContent='내용 복사 후 카카오톡 앱 열기';
    button.onclick=async function(){
      var area=overlay.querySelector('.mes-pc-share-text'),value=area&&area.value||'';
      try{if(navigator.clipboard&&navigator.clipboard.writeText)await navigator.clipboard.writeText(value);}catch(_){ }
      try{location.href='kakaotalk://launch';}catch(_){ }
      var guide=overlay.querySelector('.mes-pc-share-guide');if(guide)guide.textContent='공유 내용과 상세 링크를 복사했습니다. 열린 카카오톡 대화창에서 Ctrl+V로 붙여넣으세요.';
    };
    actions.insertBefore(button,actions.firstChild);
  }

  function recordStamp(kind,key){
    var current=state();
    if(kind.indexOf('입고')===0){var row=list(current.purchaseRequests).find(function(item){return text(item.id)===text(key)||text(item.requestNo)===text(key)||text(item.poNo)===text(key);});return text(row&&row.updatedAt)+'|'+text(row&&row.status);}
    return list(current.salesOrders).filter(function(item){return text(item.soNo)===text(key)||text(item.id)===text(key);}).map(function(item){return text(item.updatedAt)+'|'+text(item.shippingRequestStatus);}).sort().join(';');
  }

  function installShareGate(){
    if(typeof window.shareStageRecord!=='function'||window.shareStageRecord.__mesKakaoAlertWrapped)return false;
    var original=window.shareStageRecord;
    var wrapped=function(kind,key){showAlert(kind,key,'manual',function(){return original.call(window,kind,key);});};
    wrapped.__mesKakaoAlertWrapped=true;wrapped.__original=original;window.shareStageRecord=wrapped;
    return true;
  }

  function wrapSave(name,kind,keyIndex){
    var original=window[name];if(typeof original!=='function'||original.__mesKakaoAlertWrapped)return false;
    var wrapped=async function(){
      var args=Array.prototype.slice.call(arguments),key=args[keyIndex],before=recordStamp(kind,key),result=await original.apply(this,args),after=recordStamp(kind,key);
      if(after&&after!==before){setTimeout(function(){showAlert(kind,key,'saved',function(){var share=window.shareStageRecord&&window.shareStageRecord.__original||window.shareStageRecord;return share.call(window,kind,key);});},90);}
      return result;
    };
    wrapped.__mesKakaoAlertWrapped=true;wrapped.__original=original;window[name]=wrapped;return true;
  }

  function install(){
    ensureStyle();
    installShareGate();
    wrapSave('saveInboundStageRequest','입고요청',2);
    wrapSave('saveInboundStageConfirm','입고예정확정',2);
    wrapSave('saveShippingStageRequest','배차요청',2);
    wrapSave('saveShippingStageConfirm','상차예정확정',2);
  }

  function openCapturedDetail(attempt){
    if(!capturedShare||window.__mesSharedDetailOpened)return;
    var current=state(),row;
    if(capturedShare.view==='inboundRequest'){
      row=list(current.purchaseRequests).find(function(item){return text(item.id)===text(capturedShare.key)||text(item.requestNo)===text(capturedShare.key)||text(item.poNo)===text(capturedShare.key);});
      if(row&&typeof window.openView==='function'&&typeof window.openInboundStageDetail==='function'){
        window.__mesSharedDetailOpened=true;window.openView('inboundRequest');setTimeout(function(){window.openInboundStageDetail(row.id);},100);return;
      }
    }else if(capturedShare.view==='shippingPlan'){
      var schema=window.__mesRuntime&&window.__mesRuntime.schemas&&window.__mesRuntime.schemas.shippingPlan,rows=schema&&typeof schema.rows==='function'?schema.rows():[];
      row=list(rows).find(function(item){return text(item.soNo)===text(capturedShare.key)||text(item.id)===text(capturedShare.key);});
      if(row&&typeof window.openView==='function'&&typeof window.openMesDetail==='function'){
        window.__mesSharedDetailOpened=true;window.openView('shippingPlan');setTimeout(function(){window.openMesDetail('shippingPlan',row.id);},100);return;
      }
    }
    if((attempt||0)<80)setTimeout(function(){openCapturedDetail((attempt||0)+1);},500);
  }

  var tries=0,timer=setInterval(function(){install();tries++;if(tries>40)clearInterval(timer);},250);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){install();setTimeout(function(){openCapturedDetail(0);},250);});else setTimeout(function(){install();openCapturedDetail(0);},0);
})();
