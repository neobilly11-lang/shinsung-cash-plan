(function mesAccessRecovery(){
  'use strict';
  function consumeFieldBridge(){
    var params=new URLSearchParams(location.search);
    if(params.get('authBridge')!=='1'&&params.get('from')!=='field')return false;
    var bridge=null;
    for(var store of [sessionStorage,localStorage])try{
      bridge=JSON.parse(store.getItem('shinsung-field-auth-bridge-v1')||'null');
      if(bridge&&bridge.access_token)break;
    }catch(_){}
    if(!bridge||!bridge.access_token)return false;
    try{
      sessionStorage.removeItem('shinsung-field-auth-bridge-v1');
      localStorage.removeItem('shinsung-field-auth-bridge-v1');
      authSession=bridge;authUser=bridge.user||null;
      if(typeof saveSession==='function')saveSession(bridge,bridge.remember!==false);
      if(authUser&&typeof unlock==='function')unlock(bridge,authUser,bridge.remember!==false);
      else if(typeof initAuth==='function')void initAuth();
      return true;
    }catch(_){return false;}
  }
  function recover(){
    try{
      consumeFieldBridge();
      if(!document.querySelector('#nav .nav-btn')&&typeof buildNav==='function')buildNav();
      if(!document.getElementById('content')?.children.length&&typeof openView==='function')openView(location.hash.slice(1)||'dashboard');
      if(typeof authSession!=='undefined'&&!authSession&&typeof initAuth==='function')void initAuth();
      document.documentElement.dataset.mesAccessRecoveryV1='ready';
    }catch(error){
      var sync=document.getElementById('sync');
      if(sync)sync.innerHTML='<b>●</b><span>접속 복구 중 · 새로고침해 주세요</span>';
      console.error('MES access recovery failed',error);
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',recover,{once:true});
  else recover();
  setTimeout(recover,350);
})();

