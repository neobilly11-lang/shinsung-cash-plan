(function repackGradeSearchV1(root){
  'use strict';
  if(root.__repackGradeSearchV1)return;
  root.__repackGradeSearchV1=true;
  var lastRows=[];

  function safe(value){return Array.isArray(value)?value:[]}
  function text(value){return String(value==null?'':value).trim()}
  function lower(value){return text(value).toLowerCase()}
  function currentState(){try{return typeof state==='object'&&state?state:(root.state||{})}catch(_){return root.state||{}}}
  function gradeRowsForPackage(packageNo){
    try{return typeof packingSourceGradeRows==='function'?safe(packingSourceGradeRows(packageNo)).filter(function(row){return Number(row.available)>0;}):[]}
    catch(_){return[]}
  }
  function searchableRows(query){
    var s=currentState(),q=lower(query),rows=[];
    safe(s.pos).forEach(function(pkg){
      gradeRowsForPackage(pkg.packageNo).forEach(function(row){
        var split=row.split||{},hay=[pkg.packageNo,pkg.poNo,pkg.company,row.grade,split.productType,split.mainGrade,split.subGrade,split.detailGrade].map(text).join(' ').toLowerCase();
        if(!q||hay.includes(q))rows.push({packageNo:pkg.packageNo,poNo:pkg.poNo||'',company:pkg.company||'',supplierGrade:pkg.grade||'',grade:row.grade||'',available:Number(row.available)||0});
      });
    });
    return rows.sort(function(a,b){return String(b.packageNo).localeCompare(String(a.packageNo),'en',{numeric:true})||String(a.grade).localeCompare(String(b.grade));});
  }
  function resultTarget(){return document.getElementById('repackSourceSearchResults')}
  function decorate(){
    var input=document.getElementById('repackPackageNo');if(!input)return;
    var label=input.closest('label');if(label&&label.firstChild&&label.firstChild.nodeType===Node.TEXT_NODE)label.firstChild.nodeValue='사내입고번호·완료번호·검수확정 강종 검색';
    input.placeholder='번호·거래처·강종·소강종·상세강종 검색';
    input.setAttribute('oninput','renderRepackSourceSearchResults(this.value)');
    input.setAttribute('onkeydown','handleRepackSourceSearchKey(event)');
    var form=input.closest('.form'),button=form&&Array.from(form.querySelectorAll('button')).find(function(item){return /불러오기/.test(item.textContent||'');});
    if(button){button.textContent='검색·불러오기';button.setAttribute('onclick','loadRepackSourceSearchValue()');}
    if(!resultTarget()){
      var target=document.createElement('div');target.id='repackSourceSearchResults';
      var sourceInfo=document.getElementById('sourceInfo');if(sourceInfo)sourceInfo.parentNode.insertBefore(target,sourceInfo);
    }
  }
  root.renderRepackSourceSearchResults=function(query){
    decorate();var target=resultTarget(),q=text(query);if(!target)return[];
    if(!q){target.innerHTML='';lastRows=[];return lastRows;}
    lastRows=searchableRows(q).slice(0,40);
    target.innerHTML=lastRows.length?'<div class="card" style="border:3px solid var(--green);margin-top:12px"><div class="actions" style="justify-content:space-between;align-items:center"><b>검수확정 강종 검색결과</b><span class="status-chip">'+lastRows.length+'건</span></div>'+lastRows.map(function(row){return '<button type="button" class="btn repack-grade-search-result" style="width:100%;margin-top:10px;text-align:left;min-height:68px" data-package="'+esc(row.packageNo)+'" data-grade="'+esc(row.grade)+'" onclick="chooseRepackSourceSearch(this.dataset.package,this.dataset.grade)"><b>'+esc(row.packageNo)+' · '+esc(row.grade)+'</b><br><small>'+esc(row.company)+' · P.O '+esc(row.poNo||'-')+' · 이동 가능 '+kg(row.available)+'</small></button>';}).join('')+'</div>':'<div class="msg on" style="margin-top:12px">번호·거래처·검수확정 강종에 일치하는 이동 가능 재고가 없습니다.</div>';
    return lastRows;
  };
  root.chooseRepackSourceSearch=function(packageNo,grade){
    var input=document.getElementById('repackPackageNo');if(input)input.value=packageNo;
    if(resultTarget())resultTarget().innerHTML='';
    if(typeof prepareRepackPackage==='function')prepareRepackPackage(packageNo);
    requestAnimationFrame(function(){
      var cards=Array.from(document.querySelectorAll('#packingSourceChoices .packing-source-choice'));
      var card=cards.find(function(item){return text(item.querySelector('h3')&&item.querySelector('h3').textContent)===text(grade);})||cards[0];
      if(!card)return;
      card.scrollIntoView({behavior:'smooth',block:'center'});
      var button=Array.from(card.querySelectorAll('button')).find(function(item){return /재고 이동/.test(item.textContent||'');});
      setTimeout(function(){try{button&&button.focus({preventScroll:true});}catch(_){button&&button.focus();}},180);
    });
  };
  root.loadRepackSourceSearchValue=function(){
    var input=document.getElementById('repackPackageNo'),raw=text(input&&input.value),s=currentState();if(!raw)return;
    var upper=raw.toUpperCase(),exactPackage=safe(s.pos).some(function(row){return text(row.packageNo).toUpperCase()===upper;}),exactBag=safe(s.bags).some(function(row){var code=typeof bagCode==='function'?bagCode(row):(row.completionNo||row.bagNo);return text(code).toUpperCase()===upper;});
    if(exactPackage||exactBag){if(resultTarget())resultTarget().innerHTML='';return prepareRepackPackage(raw);}
    var rows=root.renderRepackSourceSearchResults(raw);
    if(rows.length===1)return root.chooseRepackSourceSearch(rows[0].packageNo,rows[0].grade);
    if(typeof msg==='function')msg('sourceInfo',rows.length?'검색 결과에서 이동할 사내입고번호·강종을 선택하세요.':'검색된 검수확정 재고가 없습니다.',!rows.length);
  };
  root.handleRepackSourceSearchKey=function(event){if(event.key!=='Enter')return;event.preventDefault();root.loadRepackSourceSearchValue();};

  var baseRender=root.renderRepack;
  if(typeof baseRender==='function')root.renderRepack=function(){var result=baseRender.apply(this,arguments);decorate();var input=document.getElementById('repackPackageNo');if(input&&text(input.value))root.renderRepackSourceSearchResults(input.value);return result;};
  try{renderRepack=root.renderRepack;}catch(_){ }
  decorate();
  document.documentElement.dataset.repackGradeSearchV1='ready';
})(window);
