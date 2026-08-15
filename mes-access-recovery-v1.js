(function mesAccessRecovery(){
  'use strict';
  var attempts=0;
  var busy=false;
  var timer=0;
  var MAX_ATTEMPTS=18;

  function setStatus(message,isError){
    var sync=document.getElementById('sync');
    if(!sync)return;
    sync.classList.toggle('bad',!!isError);
    sync.innerHTML='<b>●</b><span>'+message+'</span>';
  }

  function consumeFieldBridge(){
    var params=new URLSearchParams(location.search);
    if(params.get('authBridge')!=='1'&&params.get('from')!=='field')return false;
    var bridge=null;
    for(var store of [sessionStorage,localStorage])try{
      bridge=JSON.parse(store.getItem('shinsung-field-auth-bridge-v1')||'null');
      if(bridge&&bridge.access_token)break;
    }catch(_){ }
    if(!bridge||!bridge.access_token)return false;
    try{
      sessionStorage.removeItem('shinsung-field-auth-bridge-v1');
      localStorage.removeItem('shinsung-field-auth-bridge-v1');
      authSession=bridge;
      authUser=bridge.user||null;
      if(typeof saveSession==='function')saveSession(bridge,bridge.remember!==false);
      if(authUser&&typeof unlock==='function')unlock(bridge,authUser,bridge.remember!==false);
      else if(typeof initAuth==='function')void initAuth();
      return true;
    }catch(error){
      console.warn('MES auth bridge was not ready yet',error);
      return false;
    }
  }

  function runtimeReady(){
    return typeof buildNav==='function'&&typeof openView==='function'&&!!document.getElementById('content');
  }

  function schedule(){
    clearTimeout(timer);
    var delay=Math.min(1100,120+attempts*70);
    timer=setTimeout(recover,delay);
  }

  async function recover(force){
    if(busy)return;
    busy=true;
    try{
      if(force)attempts=0;
      attempts++;
      if(!runtimeReady()){
        if(attempts<MAX_ATTEMPTS){schedule();return;}
        throw new Error('MES runtime initialization timeout');
      }

      consumeFieldBridge();
      if(!document.querySelector('#nav .nav-btn'))buildNav();
      var content=document.getElementById('content');
      if(content&&!content.children.length)openView(location.hash.slice(1)||'dashboard');

      if(typeof authSession!=='undefined'&&!authSession){
        var remembered=typeof savedSession==='function'?savedSession():null;
        if(remembered&&typeof initAuth==='function')await initAuth();
        else{
          var auth=document.getElementById('auth');
          if(auth)auth.classList.add('on');
          setStatus('로그인 후 공용자료를 불러옵니다.',false);
        }
      }
      document.documentElement.dataset.mesAccessRecoveryV1='ready';
      document.documentElement.dataset.mesAccessRecoveryV2='ready';
    }catch(error){
      console.error('MES access recovery failed',error);
      if(attempts<MAX_ATTEMPTS){schedule();return;}
      setStatus('접속 지연 · 여기를 눌러 다시 연결',true);
      var sync=document.getElementById('sync');
      if(sync){sync.setAttribute('role','button');sync.tabIndex=0;sync.onclick=function(){recover(true);};}
    }finally{
      busy=false;
    }
  }

  window.retryMesAccess=function(){return recover(true);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){recover(false);},{once:true});
  else recover(false);
  setTimeout(function(){recover(false);},450);
})();
