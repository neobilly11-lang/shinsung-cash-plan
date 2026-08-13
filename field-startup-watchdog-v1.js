(function fieldStartupWatchdogV1(){
  'use strict';
  var attempts=0;
  var mesReturn=new URLSearchParams(location.search).get('authReturn')==='mes'||sessionStorage.getItem('shinsung-auth-return')==='mes';
  if(new URLSearchParams(location.search).get('authReturn')==='mes')sessionStorage.setItem('shinsung-auth-return','mes');
  function installMesEntry(){
    var nav=document.querySelector('nav.bottom');
    if(!nav)return;
    nav.style.gridTemplateColumns='repeat(4,minmax(0,1fr))';
    if(nav.querySelector('[data-v="mes"]'))return;
    var button=document.createElement('button');
    button.type='button';button.dataset.v='mes';button.innerHTML='④<br>MES';
    button.addEventListener('click',function(event){event.preventDefault();location.href='/mes.html';});
    nav.appendChild(button);
  }
  function installMesAuthReturn(){
    if(!mesReturn)return;
    try{
      if(typeof authRedirectUrl==='function')authRedirectUrl=function(){var url=new URL('/stable-inspection-mobile-v4.html',location.origin);url.searchParams.set('authReturn','mes');return url.href;};
      if(typeof unlockAuthenticatedApp==='function'&&!unlockAuthenticatedApp.__mesReturnPatched){
        var baseUnlock=unlockAuthenticatedApp;
        unlockAuthenticatedApp=function(){var result=baseUnlock.apply(this,arguments);sessionStorage.removeItem('shinsung-auth-return');location.replace('/mes.html');return result;};
        unlockAuthenticatedApp.__mesReturnPatched=true;
      }
    }catch(error){console.warn('MES 인증 복귀 설정 실패',error);}
  }
  function badge(){return document.getElementById('server')}
  function isPending(){return /연결 중/.test(String(badge()&&badge().textContent||''))}
  async function rescue(){
    if(!isPending())return;
    attempts+=1;
    try{
      if(typeof loadState!=='function')throw new Error('현장관리 시작 함수를 불러오지 못했습니다.');
      await Promise.race([
        loadState(),
        new Promise(function(_,reject){setTimeout(function(){reject(new Error('공용 서버 연결 시간이 초과되었습니다.'))},50000)})
      ]);
    }catch(error){
      var target=badge();
      if(target&&isPending()){
        target.textContent='● 공용 서버 실패 · 눌러서 재연결';
        target.title=String(error&&error.message||error||'공용 서버 연결 실패');
        target.style.color='#ff8e8e';
      }
    }
    if(isPending()&&attempts<2)setTimeout(rescue,3000);
  }
  installMesEntry();
  installMesAuthReturn();
  document.documentElement.dataset.fieldStartupWatchdogV1='ready';
  setTimeout(function(){installMesEntry();installMesAuthReturn();},0);
  setTimeout(function(){
    installMesEntry();
    if(mesReturn&&typeof authUser!=='undefined'&&authUser){sessionStorage.removeItem('shinsung-auth-return');location.replace('/mes.html');}
  },1200);
  setTimeout(rescue,1800);
})();

