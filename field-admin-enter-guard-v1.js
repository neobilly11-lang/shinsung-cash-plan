(function(){
  'use strict';
  if(window.__fieldAdminEnterGuardV1)return;
  window.__fieldAdminEnterGuardV1=true;
  function text(value){return String(value==null?'':value).trim()}
  function email(){try{return text(authUser&&authUser.email).toLowerCase()}catch(_){return''}}
  function admin(){try{return text(state&&state.systemSettings&&state.systemSettings.soleAdminEmail).toLowerCase()}catch(_){return''}}
  function warn(message){try{showFlowToast(message)}catch(_){alert(message)}}
  document.addEventListener('keydown',function(event){
    if(event.key!=='Enter'||event.shiftKey||event.ctrlKey||event.altKey||event.metaKey)return;
    var target=event.target;if(!target||target.tagName==='TEXTAREA'||target.tagName==='BUTTON'||target.type==='submit'||target.closest('[role=listbox]'))return;
    if(!/^(INPUT|SELECT)$/.test(target.tagName))return;
    var view=target.closest('.view.on')||target.closest('form')||document;
    var controls=Array.from(view.querySelectorAll('input,select,textarea,button')).filter(function(el){return !el.disabled&&el.type!=='hidden'&&el.offsetParent!==null&&!el.matches('.danger,[data-enter-skip]')});
    var at=controls.indexOf(target),next=controls.slice(at+1).find(function(el){return el.tagName!=='BUTTON'||el.type==='button'});if(!next)return;
    event.preventDefault();next.focus({preventScroll:true});next.scrollIntoView({behavior:'smooth',block:'center'});
  },true);
  var original=window.resetAllData;
  if(typeof original==='function')window.resetAllData=function(){
    if(!admin()){warn('전체자료 초기화가 잠겨 있습니다. MES에서 단독 관리자 한 명을 먼저 지정하세요.');return false}
    if(admin()!==email()){warn('전체자료 초기화는 단독 관리자 '+admin()+'만 실행할 수 있습니다.');return false}
    return original.apply(this,arguments);
  };
  try{resetAllData=window.resetAllData}catch(_){ }
  document.querySelectorAll('button[onclick="resetAllData()"],button[onclick*="resetAllData"]').forEach(function(button){button.title='단독 관리자만 실행 가능';button.dataset.enterSkip='1'});
  document.documentElement.dataset.fieldAdminEnterGuardV1='loaded';
})();
