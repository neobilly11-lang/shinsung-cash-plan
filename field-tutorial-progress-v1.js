/* field-tutorial-progress-v1: persist stars per signed-in user */
(function(root){
  'use strict';
  if(root.fieldTutorialProgressV1) return;
  root.fieldTutorialProgressV1=true;
  var LEGACY_KEY='scrapTutorialDone';
  var LOCAL_PREFIX='scrapTutorialDoneByUser:';
  var remoteTimer=0;
  var lastRemoteSignature='';
  function clean(value){return String(value==null?'':value).trim();}
  function normalized(values){
    var source=values instanceof Set?Array.from(values):(Array.isArray(values)?values:[]);
    return Array.from(new Set(source.map(function(value){return Number(value);}).filter(function(value){return Number.isInteger(value)&&value>=0&&value<8;}))).sort(function(a,b){return a-b;});
  }
  function parse(value){try{return normalized(JSON.parse(value||'[]'));}catch(_){return[];}}
  function userIdentity(){
    var email='',name='';
    try{if(typeof currentUserEmail==='function')email=clean(currentUserEmail()).toLowerCase();}catch(_){}
    try{if(typeof currentUserName==='function')name=clean(currentUserName());}catch(_){}
    if(email)return{key:'email:'+email,email:email,name:name||email.split('@')[0]};
    return{key:'name:'+(name||'미지정').toLowerCase(),email:'',name:name||'미지정'};
  }
  function localKey(){return LOCAL_PREFIX+encodeURIComponent(userIdentity().key);}
  function appState(){try{return typeof state!=='undefined'?state:root.state;}catch(_){return root.state;}}
  function serverCompleted(){
    var data=appState(),identity=userIdentity(),record=data&&data.tutorialProgressByUser&&data.tutorialProgressByUser[identity.key];
    return normalized(record&&record.completed);
  }
  function locallyCompleted(){
    var values=[];
    try{values=values.concat(parse(localStorage.getItem(localKey())));}catch(_){}
    try{values=values.concat(parse(sessionStorage.getItem(LEGACY_KEY)));}catch(_){}
    try{values=values.concat(parse(localStorage.getItem(LEGACY_KEY)));}catch(_){}
    return normalized(values);
  }
  function storeLocal(values){
    var done=normalized(values);
    try{localStorage.setItem(localKey(),JSON.stringify(done));}catch(_){}
    try{sessionStorage.setItem(LEGACY_KEY,JSON.stringify(done));}catch(_){}
    return done;
  }
  function putInState(values){
    var data=appState(),identity=userIdentity(),done=normalized(values);
    if(!data||!identity.key)return false;
    if(!data.tutorialProgressByUser||typeof data.tutorialProgressByUser!=='object'||Array.isArray(data.tutorialProgressByUser))data.tutorialProgressByUser={};
    data.tutorialProgressByUser[identity.key]={
      completed:done,
      userEmail:identity.email,
      userName:identity.name,
      updatedAt:new Date().toISOString(),
      version:1
    };
    return true;
  }
  function queueRemote(values){
    var done=normalized(values),identity=userIdentity(),signature=identity.key+'|'+done.join(',');
    if(!putInState(done))return;
    if(signature===lastRemoteSignature)return;
    lastRemoteSignature=signature;
    clearTimeout(remoteTimer);
    remoteTimer=setTimeout(async function(){
      try{
        if(typeof writeFastCache==='function')writeFastCache();
        if(typeof saveState==='function')await saveState({quiet:true});
      }catch(error){
        lastRemoteSignature='';
        try{console.warn('별 진행도 공용 저장 재시도 필요:',error&&error.message||error);}catch(_){}
      }
    },220);
  }
  function allCompleted(){return normalized(serverCompleted().concat(locallyCompleted()));}
  function installedDoneSet(){
    var done=allCompleted();
    storeLocal(done);
    var remote=serverCompleted();
    if(done.join(',')!==remote.join(','))queueRemote(done);
    return new Set(done);
  }
  function installedSaveDone(values){
    var done=storeLocal(values);
    queueRemote(done);
  }
  function install(){
    if(typeof root.tutorialDoneSet!=='function'||typeof root.saveTutorialDone!=='function'){
      setTimeout(install,120);
      return;
    }
    root.tutorialDoneSet=installedDoneSet;
    root.saveTutorialDone=installedSaveDone;
    document.documentElement.dataset.tutorialProgressV1='ready';
  }
  install();
})(window);
