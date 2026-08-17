/* field-required-domestic-alert-fix-v11 */
(function(root){
  'use strict';
  if(root.fieldRequiredDomesticAlertFixV11) return;
  root.fieldRequiredDomesticAlertFixV11=true;

  var dismissedSignature='';
  var lastSignature='';
  var scanTimer=0;
  var currentTarget=null;

  function visible(el){
    if(!el) return false;
    var style=getComputedStyle(el);
    return style.display!=='none' && style.visibility!=='hidden' && el.getClientRects().length>0;
  }
  function clean(value){return String(value==null?'':value).replace(/\s+/g,' ').trim();}
  function findLabelByText(pattern){
    var nodes=document.querySelectorAll('label,[role="button"],button,.upload-box,.photo-box,div');
    for(var i=0;i<nodes.length;i++){
      var node=nodes[i], value=clean(node.textContent);
      if(value.length>120 || !pattern.test(value)) continue;
      if(node.matches('label,[role="button"],button,.upload-box,.photo-box') || node.querySelector('input[type="file"]')) return node;
    }
    return null;
  }
  function weighTarget(){
    var input=document.getElementById('domesticWeightSlipPhoto')
      || document.querySelector('input[type="file"][id*="weightSlip" i],input[type="file"][name*="weightSlip" i],input[type="file"][id*="weigh" i],input[type="file"][name*="weigh" i]');
    return input ? (input.closest('label,.upload-box,.photo-box') || input) : findLabelByText(/계근표\s*사진/);
  }
  function clearMark(){
    document.querySelectorAll('.required-missing-v11').forEach(function(el){el.classList.remove('required-missing-v11');});
    currentTarget=null;
  }
  function ensureNotice(){
    var notice=document.getElementById('fieldRequiredNotice');
    if(!notice){
      notice=document.createElement('div');
      notice.id='fieldRequiredNotice';
      notice.hidden=true;
      notice.setAttribute('role','alert');
      notice.setAttribute('aria-live','assertive');
      notice.innerHTML='<b>⚠ 필수사항을 확인해 주세요</b><p class="required-list"></p><p class="required-progress"></p>';
      document.body.appendChild(notice);
    }
    notice.style.pointerEvents='auto';
    notice.style.paddingRight='84px';
    if(!notice.querySelector('.required-close')){
      var close=document.createElement('button');
      close.type='button';
      close.className='required-close';
      close.setAttribute('aria-label','알림 닫기');
      close.textContent='× 닫기';
      notice.insertBefore(close,notice.firstChild);
    }
    return notice;
  }
  function closeNotice(){
    var notice=document.getElementById('fieldRequiredNotice');
    if(notice) notice.hidden=true;
    dismissedSignature=lastSignature;
    clearMark();
  }
  function focusTarget(target){
    if(!target) return;
    clearMark();
    currentTarget=target;
    target.classList.add('required-missing-v11');
    try{target.scrollIntoView({behavior:'smooth',block:'center'});}catch(_){target.scrollIntoView();}
    var focusable=target.matches('input,select,textarea,button') ? target : target.querySelector('input,select,textarea,button');
    setTimeout(function(){
      try{if(focusable) focusable.focus({preventScroll:true});}catch(_){}
    },360);
  }
  function showRequired(signature,listText,progressText,target){
    lastSignature=signature;
    if(dismissedSignature===signature) return;
    var notice=ensureNotice();
    var list=notice.querySelector('.required-list');
    var progress=notice.querySelector('.required-progress');
    if(list) list.textContent=listText;
    if(progress) progress.textContent=progressText || '누락된 필수항목으로 이동합니다.';
    notice.hidden=false;
    focusTarget(target);
  }
  function candidateText(){
    var nodes=document.querySelectorAll('[role="alert"],.error,.msg,.message,.notice,[id*="msg" i],[id*="error" i],[id*="status" i],div,p,span');
    for(var i=0;i<nodes.length;i++){
      var el=nodes[i];
      if(!visible(el)) continue;
      var value=clean(el.textContent);
      if(value.length>240) continue;
      if(/입고\s*확정\s*전\s*계근표\s*사진을\s*촬영하거나\s*업로드/.test(value)) return value;
    }
    return '';
  }
  function scan(){
    scanTimer=0;
    ensureNotice();
    var message=candidateText();
    if(message){
      showRequired('domestic-weight-slip','필수사항: 계근표 사진','먼저 “계근표 사진 필수” 촬영·업로드 칸으로 이동합니다.',weighTarget());
    }
  }
  function scheduleScan(){
    if(scanTimer) return;
    scanTimer=setTimeout(scan,45);
  }
  function install(){
    if(!document.getElementById('fieldRequiredAlertFixV11Style')){
      var style=document.createElement('style');
      style.id='fieldRequiredAlertFixV11Style';
      style.textContent='#fieldRequiredNotice{pointer-events:auto!important;padding-right:84px!important}#fieldRequiredNotice .required-close{position:absolute;right:12px;top:10px;min-width:58px;height:40px;border:0;border-radius:11px;background:#f6e4e4;color:#922d2d;font-size:15px;font-weight:900;cursor:pointer;z-index:2}.required-missing-v11{outline:4px solid #d94848!important;outline-offset:4px!important;border-radius:14px!important;box-shadow:0 0 0 8px rgba(217,72,72,.14)!important}@media(max-width:600px){#fieldRequiredNotice{padding-right:76px!important}#fieldRequiredNotice .required-close{right:9px;top:9px;min-width:54px;height:38px;font-size:14px}}';
      document.head.appendChild(style);
    }
    var notice=ensureNotice();
    if(notice.dataset.closeV11!=='1'){
      notice.dataset.closeV11='1';
      notice.addEventListener('click',function(event){
        if(event.target.closest('.required-close')){event.preventDefault();event.stopPropagation();closeNotice();}
      },true);
    }
    document.addEventListener('click',function(event){
      var button=event.target.closest('button,[role="button"],input[type="button"],input[type="submit"]');
      if(!button) return;
      var label=clean(button.value || button.textContent);
      if(/입고\s*확정/.test(label)){
        dismissedSignature='';
        setTimeout(scan,80);
        setTimeout(scan,320);
      }
    },true);
    var observer=new MutationObserver(function(mutations){
      ensureNotice();
      for(var i=0;i<mutations.length;i++){
        var target=mutations[i].target;
        var value=clean(target && target.textContent);
        if(/계근표\s*사진|필수사항|입고\s*확정\s*전/.test(value)){scheduleScan();break;}
      }
    });
    observer.observe(document.documentElement,{childList:true,subtree:true,characterData:true});
    scheduleScan();
    document.documentElement.dataset.fieldRequiredDomesticAlertFixV11='ready';
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})(window);
