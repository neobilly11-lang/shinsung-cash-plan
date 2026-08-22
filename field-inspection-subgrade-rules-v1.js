(function fieldInspectionSubgradeRulesV1(root){
  'use strict';
  if(root.__fieldInspectionSubgradeRulesV1)return;

  var OPTIONAL_SUBGRADES=new Set(['VT','AT','TURNINGS']);
  var baseAnalyzerRequired=root.analyzerRequiredFor;

  function normalizedSubgrade(value){
    return String(value||'').trim().toUpperCase().replace(/\s+/g,' ');
  }

  function analyzerOptionalRows(rows){
    var active=(Array.isArray(rows)?rows:[]).filter(function(row){return normalizedSubgrade(row&&row.subGrade);});
    return active.length>0&&active.every(function(row){return OPTIONAL_SUBGRADES.has(normalizedSubgrade(row.subGrade));});
  }

  function currentInspectionRows(splitId){
    if(splitId&&Array.isArray(root.state&&root.state.splits)){
      var split=root.state.splits.find(function(row){return row.id===splitId;});
      if(split)return[{subGrade:split.subGrade||''}];
    }
    try{
      if(typeof root.inspectionBatchRowsFromForm==='function')return root.inspectionBatchRowsFromForm();
    }catch(_){ }
    var select=document.getElementById('finalSub');
    return select?[{subGrade:select.value||''}]:[];
  }

  function analyzerRequiredForSubgrade(){
    var splitId=arguments.length>1?arguments[1]:'';
    var rows=currentInspectionRows(splitId);
    if(analyzerOptionalRows(rows))return false;
    return typeof baseAnalyzerRequired==='function'?baseAnalyzerRequired.apply(this,arguments):true;
  }

  function replaceLabelText(label,text){
    if(!label)return;
    var textNode=Array.from(label.childNodes).find(function(node){return node.nodeType===3&&node.nodeValue.indexOf('분석기 사진')>=0;});
    if(textNode)textNode.nodeValue=text;
    else label.appendChild(document.createTextNode(text));
  }

  function refreshAnalyzerRequirement(){
    var optional=analyzerOptionalRows(currentInspectionRows(''));
    replaceLabelText(document.getElementById('analyzerLabel'),optional?'＋ 분석기 사진 선택사항':'＋ 분석기 사진 필수');
    var rule=document.getElementById('analyzerRule');
    if(rule&&optional)rule.textContent='VT·AT·TURNINGS 소강종은 분석기 사진이 선택사항입니다.';
    return optional;
  }

  function wrap(name){
    var previous=root[name];
    if(typeof previous!=='function'||previous.__subgradeAnalyzerRule)return;
    var wrapped=function(){
      var result=previous.apply(this,arguments);
      refreshAnalyzerRequirement();
      return result;
    };
    wrapped.__subgradeAnalyzerRule=true;
    root[name]=wrapped;
  }

  function boot(){
    baseAnalyzerRequired=root.analyzerRequiredFor;
    root.analyzerRequiredFor=analyzerRequiredForSubgrade;
    wrap('updateInspectionBatchTotal');
    wrap('openInspection');
    wrap('openCuttingInspection');
    refreshAnalyzerRequirement();
  }

  root.__fieldInspectionSubgradeRulesV1={normalizedSubgrade:normalizedSubgrade,analyzerOptionalRows:analyzerOptionalRows,refreshAnalyzerRequirement:refreshAnalyzerRequirement};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);
  else boot();
})(window);
