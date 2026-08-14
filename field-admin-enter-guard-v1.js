Exit code: 0
Wall time: 1.3 seconds
Output:
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
    if(!admin()){warn('?꾩껜?먮즺 珥덇린?붽? ?좉꺼 ?덉뒿?덈떎. MES?먯꽌 ?⑤룆 愿由ъ옄 ??紐낆쓣 癒쇱? 吏?뺥븯?몄슂.');return false}
    if(admin()!==email()){warn('?꾩껜?먮즺 珥덇린?붾뒗 ?⑤룆 愿由ъ옄 '+admin()+'留??ㅽ뻾?????덉뒿?덈떎.');return false}
    return original.apply(this,arguments);
  };
  try{resetAllData=window.resetAllData}catch(_){ }
  document.querySelectorAll('button[onclick="resetAllData()"],button[onclick*="resetAllData"]').forEach(function(button){button.title='?⑤룆 愿由ъ옄留??ㅽ뻾 媛??;button.dataset.enterSkip='1'});
  document.documentElement.dataset.fieldAdminEnterGuardV1='loaded';
})();

