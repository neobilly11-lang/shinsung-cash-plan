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
