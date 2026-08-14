(function(root,factory){
  'use strict';
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root&&root.document)api.install(root);
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';

  var BASE_DESKTOP_SCALE=0.625;
  var DEFAULT_FACTOR=1;
  var MIN_FACTOR=0.7;
  var MAX_FACTOR=1.4;
  var STEP=0.1;
  var FILTER_TYPES=['arrival','purchase','sales','containerWork','departurePlan','departureConfirmed'];

  function number(value,fallback){
    var parsed=Number(value);
    return Number.isFinite(parsed)?parsed:fallback;
  }
  function clampFactor(value){
    var rounded=Math.round(number(value,DEFAULT_FACTOR)*10)/10;
    return Math.min(MAX_FACTOR,Math.max(MIN_FACTOR,rounded));
  }
  function normalizeIdentity(value){
    return String(value==null?'':value).trim().toLowerCase().replace(/[^a-z0-9@._-]+/g,'_')||'guest';
  }
  function readJson(store,key){
    try{return JSON.parse(store.getItem(key)||'null');}catch(_){return null;}
  }
  function sessionIdentity(root){
    var stores=[root.localStorage,root.sessionStorage];
    var keys=['scrap-auth-session-v1','scrap-auth-session-temp-v1'];
    for(var i=0;i<stores.length;i+=1){
      for(var j=0;j<keys.length;j+=1){
        var session=readJson(stores[i],keys[j]);
        var user=session&&session.user;
        var value=user&&(user.id||user.email||user.user_metadata&&(
          user.user_metadata.display_name||user.user_metadata.name
        ));
        if(value)return normalizeIdentity(value);
      }
    }
    return'guest';
  }
  function scaleKey(identity){return'shinsung-mes-ui-scale-v2:'+normalizeIdentity(identity);}
  function scheduleKey(identity){return'shinsung-mes-schedule-filter-v2:'+normalizeIdentity(identity);}
  function normalizeSchedulePrefs(value){
    if(!value||typeof value!=='object')return null;
    var result={};
    FILTER_TYPES.forEach(function(type){result[type]=value[type]!==false;});
    return result;
  }

  function install(root){
    if(root.__mesUiScaleSchedulePrefV1)return root.MesUiScaleSchedulePrefV1;
    root.__mesUiScaleSchedulePrefV1=true;
    var document=root.document;
    var currentIdentity='';
    var factor=DEFAULT_FACTOR;
    var restoringSchedule=false;
    var originalToggle=typeof root.mesScheduleToggle==='function'?root.mesScheduleToggle:null;
    var originalRender=typeof root.render==='function'?root.render:null;

    function activeIdentity(){return sessionIdentity(root);}
    function applyScale(next,save){
      factor=clampFactor(next);
      var desktopScale=BASE_DESKTOP_SCALE*factor;
      var viewportHeight=100/desktopScale;
      document.documentElement.style.setProperty('--mes-ui-scale',String(desktopScale));
      document.documentElement.style.setProperty('--mes-ui-factor',String(factor));
      document.documentElement.style.setProperty('--mes-ui-view-height',viewportHeight+'vh');
      document.documentElement.style.setProperty('--mes-ui-modal-height',(90/desktopScale)+'vh');
      document.documentElement.style.setProperty('--mes-ui-inverse-width',(100/desktopScale)+'%');
      document.documentElement.style.setProperty('--mes-ui-mobile-width',(100/factor)+'%');
      var label=document.getElementById('mesScaleValue');
      if(label)label.textContent=Math.round(factor*100)+'%';
      if(save){
        currentIdentity=activeIdentity();
        try{root.localStorage.setItem(scaleKey(currentIdentity),String(factor));}catch(_){}
      }
      return factor;
    }
    function loadScaleForIdentity(force){
      var identity=activeIdentity();
      if(!force&&identity===currentIdentity)return;
      currentIdentity=identity;
      var saved=null;
      try{saved=root.localStorage.getItem(scaleKey(identity));}catch(_){}
      applyScale(saved==null?DEFAULT_FACTOR:saved,false);
    }
    function ensureControls(){
      loadScaleForIdentity(false);
      var top=document.querySelector('.top');
      if(!top||document.getElementById('mesScaleControls'))return;
      var controls=document.createElement('div');
      controls.id='mesScaleControls';
      controls.className='mes-scale-controls';
      controls.setAttribute('aria-label','화면 크기 조절');
      controls.innerHTML="<button type='button' onclick='mesChangeScale(-0.1)' title='화면 10% 줄이기' aria-label='화면 10% 줄이기'>−</button><button type='button' id='mesScaleValue' class='mes-scale-value' onclick='mesResetScale()' title='기본 크기로 되돌리기'>100%</button><button type='button' onclick='mesChangeScale(0.1)' title='화면 10% 크게 하기' aria-label='화면 10% 크게 하기'>＋</button>";
      var sync=document.getElementById('sync');
      top.insertBefore(controls,sync||null);
      applyScale(factor,false);
    }
    root.mesChangeScale=function(amount){
      var next=applyScale(factor+number(amount,0),true);
      if(typeof root.toast==='function')root.toast('화면 크기 '+Math.round(next*100)+'%');
    };
    root.mesResetScale=function(){
      applyScale(DEFAULT_FACTOR,true);
      if(typeof root.toast==='function')root.toast('화면 크기 100%');
    };

    function readCurrentSchedulePrefs(){
      var result={};
      FILTER_TYPES.forEach(function(type){
        var input=document.querySelector("[data-schedule-type='"+type+"'] input[type='checkbox']");
        result[type]=input?input.checked:true;
      });
      return result;
    }
    function saveSchedulePrefs(){
      if(restoringSchedule)return;
      var value=readCurrentSchedulePrefs();
      try{root.localStorage.setItem(scheduleKey(activeIdentity()),JSON.stringify(value));}catch(_){}
      document.documentElement.dataset.mesSchedulePrefs=JSON.stringify(value);
    }
    function addScheduleSaveNote(){
      var box=document.querySelector('.schedule-types');
      if(!box||box.querySelector('.schedule-pref-note'))return;
      var note=document.createElement('small');
      note.className='schedule-pref-note';
      note.textContent='선택한 일정 종류는 이 사용자 계정에 자동 저장됩니다.';
      box.appendChild(note);
    }
    function restoreSchedulePrefs(){
      if(!originalToggle||typeof root.currentView!=='undefined'&&root.currentView!=='schedule'){
        addScheduleSaveNote();
        return;
      }
      var saved=null;
      try{saved=normalizeSchedulePrefs(readJson(root.localStorage,scheduleKey(activeIdentity())));}catch(_){}
      if(!saved){document.documentElement.dataset.mesSchedulePrefs='default';addScheduleSaveNote();return;}
      restoringSchedule=true;
      try{
        FILTER_TYPES.forEach(function(type){
          var input=document.querySelector("[data-schedule-type='"+type+"'] input[type='checkbox']");
          if(input&&input.checked!==saved[type])originalToggle(type,saved[type]);
        });
      }finally{restoringSchedule=false;}
      document.documentElement.dataset.mesSchedulePrefs=JSON.stringify(saved);
      addScheduleSaveNote();
    }

    if(originalToggle){
      root.mesScheduleToggle=function(type,checked){
        var result=originalToggle(type,checked);
        if(!restoringSchedule)saveSchedulePrefs();
        addScheduleSaveNote();
        return result;
      };
    }
    document.addEventListener('change',function(event){
      var target=event.target;
      if(!target||!target.matches||!target.matches("[data-schedule-type] input[type='checkbox']"))return;
      root.setTimeout(saveSchedulePrefs,0);
    });
    if(originalRender){
      root.render=function(){
        loadScaleForIdentity(false);
        var result=originalRender.apply(this,arguments);
        ensureControls();
        if((typeof currentView!=='undefined'&&currentView==='schedule')||root.location.hash==='#schedule'){
          restoreSchedulePrefs();
        }
        return result;
      };
    }

    var style=document.createElement('style');
    style.id='mesUiScaleSchedulePrefV1Style';
    style.textContent=".mes-scale-controls{display:flex;align-items:center;gap:3px;padding:3px;border:1px solid var(--line);border-radius:9px;background:#f5f8fb;white-space:nowrap}.mes-scale-controls button{border:0;background:#fff;color:#183149;min-width:30px;height:30px;padding:0 6px;border-radius:6px;font-weight:900;cursor:pointer}.mes-scale-controls .mes-scale-value{min-width:48px;color:#087a78}.schedule-pref-note{grid-column:1/-1;color:#55716c;font-weight:700;padding:6px 8px 0}@media(min-width:761px){.shell{zoom:var(--mes-ui-scale)!important;min-height:var(--mes-ui-view-height)!important;grid-template-columns:190px minmax(0,1fr)!important}.side{height:var(--mes-ui-view-height)!important;padding:10px 6px!important}.brand{padding:5px 6px 10px!important}.brand span{margin-top:3px!important}.nav-group{margin-top:7px!important}.nav-title{padding:3px 7px!important}.nav-btn{padding:7px 8px!important;gap:5px!important;border-radius:7px!important}.nav-btn b{min-width:19px!important}.field-link{margin-top:8px!important}.top{height:52px!important;padding:0 10px!important;gap:7px!important}.content{padding:9px!important;max-width:none!important}.dashboard-head{gap:8px!important;margin-bottom:9px!important}.dashboard-head p{margin-top:3px!important}.actions{gap:5px!important}.btn{padding:7px 10px!important;border-radius:7px!important}.kpis{gap:6px!important;margin-bottom:8px!important}.kpi{padding:9px!important;border-radius:9px!important}.kpi strong{margin-top:4px!important}.kpi span{margin-top:2px!important}.panel{border-radius:9px!important}.toolbar{padding:7px!important;gap:5px!important}.control label{margin-bottom:2px!important}.control input,.control select{height:34px!important;padding:0 7px!important;border-radius:6px!important}.table-wrap{max-height:calc(var(--mes-ui-view-height) - 205px)!important}th,td{padding:5px 6px!important}.status{padding:3px 6px!important}.cards{padding:5px!important;gap:5px!important}.modal{padding:8px!important}.modal-card{zoom:var(--mes-ui-scale)!important;width:min(1152px,var(--mes-ui-inverse-width))!important;max-height:var(--mes-ui-modal-height)!important;padding:12px!important;border-radius:11px!important}.modal-card.wide-modal{width:min(1888px,var(--mes-ui-inverse-width))!important}.form-grid{gap:7px!important;margin-top:9px!important}.form-grid input,.form-grid select,.form-grid textarea{margin-top:3px!important;padding:7px!important;border-radius:7px!important}.detail-banner{padding:10px!important;margin-top:8px!important}.detail-section{margin-top:8px!important}.detail-section>h3{padding:7px 9px!important}.line-editor{padding:7px!important;margin-top:6px!important}.photo-strip{gap:6px!important;padding:7px!important}.auth-card{zoom:var(--mes-ui-scale)!important;width:min(736px,var(--mes-ui-inverse-width))!important;padding:16px!important}.save-progress>div{zoom:var(--mes-ui-scale)!important}.toast{zoom:var(--mes-ui-scale)!important;right:16px!important;bottom:16px!important}.schedule-head{gap:8px!important;margin-bottom:9px!important}.schedule-shell{grid-template-columns:205px minmax(0,1fr)!important;gap:8px!important}.schedule-side,.schedule-main{padding:8px!important;border-radius:9px!important}.schedule-types{gap:3px!important;margin-top:8px!important;padding:6px!important}.schedule-types label{padding:5px!important}.calendar-toolbar{margin-bottom:6px!important}.calendar-day{min-height:105px!important;padding:4px!important}.calendar-weekdays span{padding:5px!important}.schedule-event{padding:3px 4px!important}.mes-scale-controls{padding:2px}.mes-scale-controls button{height:27px;min-width:27px}.mes-scale-controls .mes-scale-value{min-width:44px}}@media(max-width:760px){.shell{zoom:var(--mes-ui-factor);width:var(--mes-ui-mobile-width)}.mes-scale-controls{margin-left:auto}.mes-scale-controls button{min-width:27px;height:29px}.mes-scale-controls .mes-scale-value{min-width:42px}.sync{margin-left:0}.schedule-pref-note{font-size:12px}}@media(max-width:520px){.page-title{max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mes-scale-controls{gap:1px;padding:2px}.mes-scale-controls button{min-width:24px;height:27px;padding:0 3px}.mes-scale-controls .mes-scale-value{min-width:38px}.user{max-width:84px}}";
    document.head.appendChild(style);

    loadScaleForIdentity(true);
    ensureControls();
    if(root.location.hash==='#schedule')restoreSchedulePrefs();
    document.documentElement.dataset.mesUiScaleSchedulePrefV1='loaded';
    root.MesUiScaleSchedulePrefV1={
      clampFactor:clampFactor,
      normalizeIdentity:normalizeIdentity,
      normalizeSchedulePrefs:normalizeSchedulePrefs,
      applyScale:applyScale,
      restoreSchedulePrefs:restoreSchedulePrefs
    };
    return root.MesUiScaleSchedulePrefV1;
  }

  return{
    install:install,
    clampFactor:clampFactor,
    normalizeIdentity:normalizeIdentity,
    normalizeSchedulePrefs:normalizeSchedulePrefs,
    scaleKey:scaleKey,
    scheduleKey:scheduleKey
  };
});
