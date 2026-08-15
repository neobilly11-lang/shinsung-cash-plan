(function(){
  'use strict';
  if(window.__mesOpsUpgradeV1)return;
  window.__mesOpsUpgradeV1=true;

  var mesAuthButton=Array.from(document.querySelectorAll('#auth button')).find(function(button){return /사용자 등록|비밀번호 찾기/.test(button.textContent||'');});
  if(mesAuthButton)mesAuthButton.onclick=function(){location.href='/stable-inspection-mobile-v4.html?authReturn=mes';};

  function list(value){return Array.isArray(value)?value:[];}
  function text(value){return String(value==null?'':value).trim();}
  function number(value){var parsed=Number(String(value==null?'':value).replace(/,/g,''));return Number.isFinite(parsed)?parsed:0;}
  function dayOf(value){var raw=text(value);if(!raw)return'';var match=raw.match(/\d{4}-\d{2}-\d{2}/);if(match)return match[0];try{return new Date(value).toISOString().slice(0,10);}catch(_){return'';}}
  function firstDay(row,fields){for(var i=0;i<fields.length;i++){var value=dayOf(row&&row[fields[i]]);if(value)return value;}return'';}
  function unique(rows,keyFn){var seen=new Set();return rows.filter(function(row,index){var key=text(keyFn(row,index))||String(index);if(seen.has(key))return false;seen.add(key);return true;});}
  function displayWeight(row){return number(row&&(
    row.confirmedWeight||row.finalWeight||row.shippedWeight||row.netWeight||row.nw||row.weight||row.quantity||row.inputWeight
  ));}
  function reference(row){return text(row&&(
    row.packageNo||row.internalPackageNo||row.completionNo||row.soNo||row.poNo||row.requestNo||row.id
  ))||'-';}
  function operator(row){return text(row&&(
    row.completedByName||row.inspectorName||row.inspector||row.receiptWorkerName||row.shippingWorkerName||row.operatorName||row.updatedByName||row.actorName
  ))||'-';}
  function label(row){return text(row&&(row.grade||row.mainGrade||row.customerGrade||row.workType||row.type||row.company||row.customer))||'-';}
  function workLogGroups(targetDay){
    var incoming=unique(list(state.pos).filter(function(row){
      var active=!['CANCELLED','CANCELED','DELETED'].includes(text(row.status).toUpperCase());
      var done=!!row.receivedAt||['RECEIVED','COMPLETE','COMPLETED'].includes(text(row.receiptStatus).toUpperCase());
      return active&&done&&firstDay(row,['receivedAt','receiptCompletedAt','inboundConfirmedAt','updatedAt'])===targetDay;
    }),function(row){return row.id||row.packageNo;});
    var inspected=unique(list(state.splits).filter(function(row){
      var statusValue=text(row.status).toUpperCase();
      return !['CANCELLED','CANCELED','DELETED'].includes(statusValue)&&firstDay(row,['confirmedAt','inspectionCompletedAt','completedAt','createdAt','updatedAt'])===targetDay;
    }),function(row){return row.id||[row.packageNo,row.mainGrade,row.subGrade,row.weight].join('|');});
    var shipped=unique(list(state.shipments).filter(function(row){
      var statusValue=text(row.status).toUpperCase();
      var done=!!(row.shippedAt||row.shippingCompletedAt||row.completedAt)||['SHIPPED','COMPLETE','COMPLETED','FINAL'].includes(statusValue);
      return done&&firstDay(row,['shippedAt','shippingCompletedAt','completedAt','updatedAt'])===targetDay;
    }),function(row){return row.id||[row.soNo,row.completionNo,row.shippedWeight,row.weight].join('|');});
    var workDone=unique(list(state.workWaits).filter(function(row){
      var statusValue=text(row.status).toUpperCase();
      var done=['DONE','COMPLETE','COMPLETED','WORK_COMPLETE','FINISHED'].includes(statusValue)||!!(row.completedAt||row.doneAt);
      return done&&firstDay(row,['completedAt','doneAt','workCompletedAt','updatedAt'])===targetDay;
    }),function(row){return row.id||[row.packageNo,row.workType,row.weight].join('|');});
    return[
      {key:'inbound',name:'입고확정',rows:incoming,color:'#0f766e'},
      {key:'inspection',name:'검수확정',rows:inspected,color:'#2563eb'},
      {key:'shipping',name:'출하확정',rows:shipped,color:'#7c3aed'},
      {key:'work',name:'작업대기 작업완료',rows:workDone,color:'#d97706'}
    ].map(function(group){group.count=group.rows.length;group.weight=group.rows.reduce(function(sum,row){return sum+displayWeight(row);},0);group.operators=Array.from(new Set(group.rows.map(operator).filter(function(name){return name&&name!=='-';})));return group;});
  }
  window.mesWorkLogGroups=workLogGroups;

  var schemaObject=typeof schemas!=='undefined'?schemas:window.schemas;
  if(schemaObject&&schemaObject.sales){schemaObject.sales.cols=list(schemaObject.sales.cols).filter(function(column){return !['품종','품족'].includes(text(column&&column[0]));});}
  if(schemaObject&&schemaObject.purchase){schemaObject.purchase.cols=list(schemaObject.purchase.cols).map(function(column){if(text(column&&column[0])==='입고예정일')column[0]='입항예정일';return column;});}

  function summaryCards(groups){return groups.map(function(group){return "<article class='worklog-kpi' style='--worklog-color:"+group.color+"'><small>"+esc(group.name)+"</small><strong>"+fmt(group.weight)+" kg</strong><span>"+group.count+"건 · 작업자 "+group.operators.length+"명</span></article>";}).join('');}
  function summaryRows(groups){return groups.map(function(group){return '<tr><td class="left"><b>'+esc(group.name)+'</b></td><td>'+group.count+'건</td><td>'+fmt(group.weight)+' kg</td><td class="left">'+esc(group.operators.join(', ')||'-')+'</td></tr>';}).join('');}
  function detailRows(groups){var rows=[];groups.forEach(function(group){group.rows.slice(0,30).forEach(function(row){rows.push('<tr><td>'+esc(group.name)+'</td><td>'+esc(reference(row))+'</td><td class="left">'+esc(label(row))+'</td><td>'+fmt(displayWeight(row))+' kg</td><td>'+esc(operator(row))+'</td></tr>');});});return rows.join('');}
  function workLogMarkup(groups,includeDetails){
    var totalCount=groups.reduce(function(sum,group){return sum+group.count;},0),totalWeight=groups.reduce(function(sum,group){return sum+group.weight;},0);
    return "<div class='worklog-report'><div class='worklog-title'><div><small>신성금속 MES</small><h2>일일 작업일지</h2><p>"+esc(nowDate())+" · 입고부터 출하까지 당일 확정 실적</p></div><div><b>총 "+totalCount+"건</b><strong>"+fmt(totalWeight)+" kg</strong></div></div><div class='worklog-summary-grid'>"+summaryCards(groups)+"</div><div class='table-wrap worklog-summary-table'><table><thead><tr><th>업무 구분</th><th>건수</th><th>총량</th><th>작업자</th></tr></thead><tbody>"+summaryRows(groups)+"</tbody></table></div>"+(includeDetails?"<h3>당일 확정 내역</h3><div class='table-wrap'><table><thead><tr><th>구분</th><th>번호</th><th>강종·작업</th><th>중량</th><th>작업자</th></tr></thead><tbody>"+(detailRows(groups)||'<tr><td colspan="5">오늘 확정 자료가 없습니다.</td></tr>')+"</tbody></table></div>":'')+"</div>";
  }
  window.renderDaily=function(){
    var groups=workLogGroups(nowDate());
    $('pageTitle').textContent='일일 작업일지';
    $('content').innerHTML="<div class='dashboard-head'><div><h1>일일 작업일지</h1><p>"+esc(nowDate())+" · 확정된 작업의 건수와 총량을 자동 집계합니다.</p></div><div class='actions worklog-actions'><button class='btn primary' onclick='previewMesWorkLog()'>작업일지 미리보기</button><button class='btn' onclick='shareMesWorkLog()'>작업일지 카톡공유</button><button class='btn' onclick='downloadMesWorkLogPdf()'>작업일지 PDF 내려받기</button></div></div><div class='panel'>"+workLogMarkup(groups,true)+"</div>";
  };
  try{renderDaily=window.renderDaily;}catch(_){ }

  window.previewMesWorkLog=function(){var groups=workLogGroups(nowDate());$('modalTitle').textContent=nowDate()+' · 작업일지 미리보기';$('modalBody').innerHTML=workLogMarkup(groups,true)+"<div class='actions'><button class='btn' onclick='shareMesWorkLog()'>카톡공유</button><button class='btn primary' onclick='downloadMesWorkLogPdf()'>PDF 내려받기</button><button class='btn' onclick='closeModal()'>닫기</button></div>";$('modal').classList.add('on');};
  function workLogText(){var groups=workLogGroups(nowDate());return ['[신성금속 MES 일일 작업일지]',nowDate()].concat(groups.map(function(group){return '• '+group.name+': '+group.count+'건 / '+fmt(group.weight)+' kg';})).join('\n');}
  window.shareMesWorkLog=async function(){
    var title='신성금속 MES 일일 작업일지 '+nowDate(),body=workLogText();
    if(typeof window.mesShareText==='function')return window.mesShareText(title,body);
    var mobile=!!navigator.share&&(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent||'')||(navigator.maxTouchPoints>1&&/Macintosh/i.test(navigator.userAgent||'')));
    try{if(mobile){await navigator.share({title:title,text:body});return;}}catch(error){if(error&&error.name==='AbortError')return;}
    var copied=false;
    try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(body);copied=true;}}catch(_){ }
    if(!copied)try{var area=document.createElement('textarea');area.value=body;area.style.cssText='position:fixed;left:-9999px;top:-9999px';document.body.appendChild(area);area.focus();area.select();copied=!!(document.execCommand&&document.execCommand('copy'));area.remove();}catch(_){ }
    toast(copied?'PC 공유 준비완료 · 카카오톡 대화창에 붙여넣으세요.':'공유할 내용을 복사하지 못했습니다.',!copied);
  };

  function bytesFromBase64(base64){var binary=atob(base64),out=new Uint8Array(binary.length);for(var i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i);return out;}
  function textBytes(value){return new TextEncoder().encode(value);}
  function concatBytes(parts){var size=parts.reduce(function(sum,part){return sum+part.length;},0),out=new Uint8Array(size),offset=0;parts.forEach(function(part){out.set(part,offset);offset+=part.length;});return out;}
  function buildPdfFromJpeg(jpeg,width,height){
    var parts=[],offsets=[0],length=0;
    function push(part){parts.push(part);length+=part.length;}
    function object(id,bodyParts){offsets[id]=length;push(textBytes(id+' 0 obj\n'));bodyParts.forEach(push);push(textBytes('\nendobj\n'));}
    push(textBytes('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
    object(1,[textBytes('<< /Type /Catalog /Pages 2 0 R >>')]);
    object(2,[textBytes('<< /Type /Pages /Kids [3 0 R] /Count 1 >>')]);
    object(3,[textBytes('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>')]);
    object(4,[textBytes('<< /Type /XObject /Subtype /Image /Width '+width+' /Height '+height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.length+' >>\nstream\n'),jpeg,textBytes('\nendstream')]);
    var command=textBytes('q\n595 0 0 842 0 0 cm\n/Im0 Do\nQ\n');
    object(5,[textBytes('<< /Length '+command.length+' >>\nstream\n'),command,textBytes('endstream')]);
    var xrefAt=length;push(textBytes('xref\n0 6\n0000000000 65535 f \n'));for(var i=1;i<=5;i++)push(textBytes(String(offsets[i]).padStart(10,'0')+' 00000 n \n'));push(textBytes('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xrefAt+'\n%%EOF'));
    return concatBytes(parts);
  }
  function roundedRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
  window.downloadMesWorkLogPdf=function(){
    try{
      var groups=workLogGroups(nowDate()),canvas=document.createElement('canvas'),width=1240,height=1754;canvas.width=width;canvas.height=height;var ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.fillStyle='#082d28';ctx.fillRect(0,0,width,185);ctx.fillStyle='#fff';ctx.font='700 52px "Malgun Gothic",sans-serif';ctx.fillText('신성금속 MES 일일 작업일지',64,88);ctx.font='30px "Malgun Gothic",sans-serif';ctx.fillText(nowDate()+' · 당일 확정 실적',64,142);
      var y=235;groups.forEach(function(group){ctx.fillStyle='#f3f7f6';roundedRect(ctx,60,y,width-120,180,24);ctx.fillStyle=group.color;ctx.fillRect(60,y,14,180);ctx.fillStyle='#102a27';ctx.font='700 38px "Malgun Gothic",sans-serif';ctx.fillText(group.name,100,y+58);ctx.font='700 48px "Malgun Gothic",sans-serif';ctx.fillText(fmt(group.weight)+' kg',100,y+124);ctx.font='28px "Malgun Gothic",sans-serif';ctx.fillStyle='#536460';ctx.fillText(group.count+'건 · 작업자 '+group.operators.length+'명',760,y+105);y+=205;});
      var totalCount=groups.reduce(function(sum,group){return sum+group.count;},0),totalWeight=groups.reduce(function(sum,group){return sum+group.weight;},0);ctx.fillStyle='#0f766e';roundedRect(ctx,60,y+15,width-120,190,24);ctx.fillStyle='#fff';ctx.font='700 40px "Malgun Gothic",sans-serif';ctx.fillText('오늘 전체 확정 실적',100,y+80);ctx.font='700 52px "Malgun Gothic",sans-serif';ctx.fillText(totalCount+'건  ·  '+fmt(totalWeight)+' kg',100,y+150);ctx.fillStyle='#52645f';ctx.font='24px "Malgun Gothic",sans-serif';ctx.fillText('입고확정 · 검수확정 · 출하확정 · 작업대기 작업완료를 공용자료에서 자동 집계',60,height-70);
      var jpeg=bytesFromBase64(canvas.toDataURL('image/jpeg',0.92).split(',')[1]),pdf=buildPdfFromJpeg(jpeg,width,height),url=URL.createObjectURL(new Blob([pdf],{type:'application/pdf'})),anchor=document.createElement('a');anchor.href=url;anchor.download='신성금속_MES_일일작업일지_'+nowDate()+'.pdf';anchor.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);toast('작업일지 PDF를 내려받았습니다.');
    }catch(error){console.error(error);toast('작업일지 PDF 생성에 실패했습니다.',true);}
  };

  var oldRender=window.render;
  window.render=function(){
    if(schemaObject&&schemaObject.sales)schemaObject.sales.cols=list(schemaObject.sales.cols).filter(function(column){return !['품종','품족'].includes(text(column&&column[0]));});
    var result=oldRender.apply(this,arguments);
    if(currentView==='daily')window.renderDaily();
    return result;
  };
  try{render=window.render;}catch(_){ }

  var style=document.createElement('style');style.textContent='.worklog-actions{display:flex;gap:8px;flex-wrap:wrap}.worklog-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:18px 0}.worklog-kpi{border:1px solid #d9e4e1;border-left:8px solid var(--worklog-color);border-radius:18px;padding:20px;background:#fff;display:flex;flex-direction:column;gap:8px}.worklog-kpi small{font-size:14px;font-weight:900;color:#50625e}.worklog-kpi strong{font-size:27px;color:#102a27}.worklog-kpi span{font-size:13px;color:#687773}.worklog-title{display:flex;justify-content:space-between;gap:20px;align-items:center;border-radius:22px;padding:24px;background:linear-gradient(135deg,#0b382f,#0d806e);color:#fff}.worklog-title h2{margin:4px 0;font-size:30px}.worklog-title p{margin:0;opacity:.85}.worklog-title>div:last-child{text-align:right;display:flex;flex-direction:column;gap:4px}.worklog-title>div:last-child strong{font-size:28px}.worklog-summary-table{margin:18px 0}@media(max-width:760px){.worklog-summary-grid{grid-template-columns:1fr 1fr}.worklog-actions{display:grid;grid-template-columns:1fr}.worklog-actions .btn{width:100%}.worklog-title{align-items:flex-start;flex-direction:column}.worklog-title>div:last-child{text-align:left}.worklog-kpi{padding:15px}.worklog-kpi strong{font-size:21px}}';document.head.appendChild(style);
  document.documentElement.dataset.mesOpsUpgradeV1='loaded';
})();
