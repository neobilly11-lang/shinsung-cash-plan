(function mesListGradeShortenerV1(root){
  'use strict';
  if(root.__mesListGradeShortenerV1)return;
  root.__mesListGradeShortenerV1=true;
  function plain(value){
    var div=document.createElement('div');
    div.innerHTML=String(value==null?'':value);
    return String(div.textContent||'').trim();
  }
  function shortValue(label,value){
    if(!/강종/.test(String(label||'')))return value;
    var full=plain(value);
    var chars=Array.from(full);
    return chars.length>=15?'<span class="mes-grade-etc" title="'+esc(full)+'">'+esc(chars.slice(0,15).join('')+' 그 외')+'</span>':value;
  }
  function shortSchema(schema){
    if(!schema||!Array.isArray(schema.cols))return schema;
    return Object.assign({},schema,{cols:schema.cols.map(function(column){
      if(!/강종/.test(String(column[0]||'')))return column;
      return [column[0],function(row){return shortValue(column[0],column[1](row));},column[2]];
    })});
  }
  var baseTable=root.tableHtml;
  if(typeof baseTable==='function')root.tableHtml=function(schema,rows){return baseTable(shortSchema(schema),rows);};
  var baseCards=root.cardsHtml;
  if(typeof baseCards==='function')root.cardsHtml=function(schema,rows){return baseCards(shortSchema(schema),rows);};
  try{tableHtml=root.tableHtml;cardsHtml=root.cardsHtml;}catch(_){ }
  document.documentElement.dataset.mesListGradeShortenerV1='ready';
})(window);
