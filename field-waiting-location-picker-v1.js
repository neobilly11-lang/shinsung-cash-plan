/* load standalone domestic required alert before legacy setup */
(function(){try{if(!document.querySelector('script[data-domestic-alert-v11]')){var s=document.createElement('script');s.src='field-required-domestic-alert-fix-v11.js?v=20260818-15';s.async=false;s.dataset.domesticAlertV11='1';(document.head||document.documentElement).appendChild(s);}}catch(_){}})();
(function(root){
  'use strict';
  function text(value){return String(value==null?'':value).trim();}
  function list(value){return Array.isArray(value)?value:[];}
  function escapeHtml(value){return String(value==null?'':value).replace(/[&<>"']/g,function(char){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char];});}
  function stateValue(){try{return typeof state!=='undefined'?state:root.state;}catch(_){return root.state;}}
  function matches(query){
    var q=text(query).toLowerCase();
    return Array.from(new Set(list(stateValue()&&stateValue().waitingLocations).map(text).filter(Boolean))).filter(function(value){return!q||value.toLowerCase().includes(q);}).slice(0,30);
  }
  function indexOfInput(input){return text(input.id).replace('simpleWaitingLocation-','');}
  function pickerId(input){return'simpleWaitingLocationPicker-'+indexOfInput(input);}
  function weightInput(input){return document.getElementById('simpleWaitingWeight-'+indexOfInput(input));}
  function hide(input){var picker=document.getElementById(pickerId(input));if(picker)picker.classList.remove('on');}
  function render(input){
    var picker=document.getElementById(pickerId(input)),target=picker&&picker.querySelector('.field-waiting-location-results');if(!picker||!target)return;
    var rows=matches(input.value),selected=text(input.value).toLowerCase();
    target.innerHTML=rows.length?rows.map(function(value){return'<button type="button" class="field-waiting-location-choice '+(value.toLowerCase()===selected?'selected':'')+'" data-value="'+escapeHtml(value)+'">'+escapeHtml(value)+'</button>';}).join(''):'<div class="field-waiting-location-empty">저장 장소가 없습니다. 직접 입력하면 이동확정 시 함께 저장됩니다.</div>';
    picker.classList.add('on');
  }
  function select(input,value){
    input.value=text(value);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));hide(input);
    var next=weightInput(input);if(next){next.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(function(){next.focus({preventScroll:true});next.select&&next.select();},180);}
  }
  function installInput(input){
    if(!input||input.dataset.waitingPickerV1==='1')return;
    input.dataset.waitingPickerV1='1';input.removeAttribute('list');input.setAttribute('autocomplete','off');input.setAttribute('aria-autocomplete','list');
    var legacy=document.getElementById('simpleWaitingLocationList-'+indexOfInput(input));if(legacy)legacy.remove();
    var label=input.closest('label');if(!label)return;
    var picker=document.createElement('div');picker.id=pickerId(input);picker.className='field-waiting-location-picker';picker.innerHTML='<b>포장대기 장소 검색결과 · 눌러서 선택</b><div class="field-waiting-location-results"></div><button type="button" class="field-waiting-location-clear">× 선택 지우기 · 다른 장소 입력</button>';
    label.insertAdjacentElement('afterend',picker);
    input.addEventListener('focus',function(){render(input);});input.addEventListener('input',function(){render(input);});
    input.addEventListener('keydown',function(event){if(event.key==='Enter'){var first=matches(input.value)[0];if(first){event.preventDefault();select(input,first);}}});
    input.addEventListener('blur',function(){setTimeout(function(){if(!picker.matches(':focus-within'))hide(input);},180);});
    picker.addEventListener('pointerdown',function(event){event.preventDefault();});
    picker.addEventListener('click',function(event){var choice=event.target.closest('.field-waiting-location-choice');if(choice)return select(input,choice.dataset.value);if(event.target.closest('.field-waiting-location-clear')){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();render(input);}});
  }
  function installAll(){document.querySelectorAll('input[id^="simpleWaitingLocation-"]').forEach(installInput);}
  var style=document.createElement('style');style.textContent='.field-waiting-location-picker{display:none;grid-column:1/-1;border:2px solid #e4a92d;background:#fff8e8;border-radius:16px;padding:12px;margin-top:-4px}.field-waiting-location-picker.on{display:block}.field-waiting-location-picker>b{display:block;margin-bottom:8px;color:#744f00}.field-waiting-location-results{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.field-waiting-location-choice,.field-waiting-location-clear{min-height:50px;border:1px solid #ddc688;border-radius:12px;background:#fff;padding:10px;font-weight:800;text-align:left}.field-waiting-location-choice.selected{background:#0d806b;color:#fff;border-color:#0d806b}.field-waiting-location-clear{width:100%;margin-top:8px;background:#fff1cf;color:#754f00;text-align:center}.field-waiting-location-empty{grid-column:1/-1;padding:12px;color:#7b6b4b}@media(max-width:520px){.field-waiting-location-results{grid-template-columns:1fr}.field-waiting-location-choice{font-size:18px;min-height:56px}}';document.head.appendChild(style);
  ['renderPackingSourceChoices','setSimplePackingMove'].forEach(function(name){var original=root[name];if(typeof original!=='function')return;root[name]=function(){var result=original.apply(this,arguments);requestAnimationFrame(installAll);return result;};});
  document.addEventListener('change',function(event){var selectNode=event.target;if(!selectNode||!/^simpleWaitingLocationSelect-/.test(selectNode.id))return;var input=document.getElementById('simpleWaitingLocation-'+text(selectNode.id).replace('simpleWaitingLocationSelect-',''));if(input&&selectNode.value)select(input,selectNode.value);},true);
  var observer=new MutationObserver(function(){installAll();});observer.observe(document.documentElement,{childList:true,subtree:true});
  installAll();document.documentElement.dataset.fieldWaitingLocationPickerV1='ready';
  root.fieldWaitingLocationPickerInstall=installAll;
})(window);


/* field-required-domestic-alert-fix-v10 */
(function(root){
  'use strict';
  if(root.fieldRequiredDomesticAlertFixV10) return;
  root.fieldRequiredDomesticAlertFixV10=true;

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
    document.querySelectorAll('.required-missing-v10').forEach(function(el){el.classList.remove('required-missing-v10');});
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
    target.classList.add('required-missing-v10');
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
    if(!document.getElementById('fieldRequiredAlertFixV10Style')){
      var style=document.createElement('style');
      style.id='fieldRequiredAlertFixV10Style';
      style.textContent='#fieldRequiredNotice{pointer-events:auto!important;padding-right:84px!important}#fieldRequiredNotice .required-close{position:absolute;right:12px;top:10px;min-width:58px;height:40px;border:0;border-radius:11px;background:#f6e4e4;color:#922d2d;font-size:15px;font-weight:900;cursor:pointer;z-index:2}.required-missing-v10{outline:4px solid #d94848!important;outline-offset:4px!important;border-radius:14px!important;box-shadow:0 0 0 8px rgba(217,72,72,.14)!important}@media(max-width:600px){#fieldRequiredNotice{padding-right:76px!important}#fieldRequiredNotice .required-close{right:9px;top:9px;min-width:54px;height:38px;font-size:14px}}';
      document.head.appendChild(style);
    }
    var notice=ensureNotice();
    if(notice.dataset.closeV10!=='1'){
      notice.dataset.closeV10='1';
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
    document.documentElement.dataset.fieldRequiredDomesticAlertFixV10='ready';
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})(window);
