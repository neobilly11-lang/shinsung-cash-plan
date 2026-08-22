(function(){
  'use strict';
  var VERSION='20260822-fullscreen-preview-1';
  var DOMESTIC_LOGO='./template-media/domestic-image1.png';
  var OVERSEAS_LOGO='./template-media/overseas-image1.png';
  var OVERSEAS_SIGNATURE='./template-media/overseas-image2.png';

  function rt(){return window.__mesRuntime||{}}
  function st(){return typeof rt().getState==='function'?(rt().getState()||{}):{}}
  function safe(value){return Array.isArray(value)?value:[]}
  function num(value){var parsed=Number(String(value??'').replace(/,/g,''));return Number.isFinite(parsed)?parsed:0}
  function esc(value){return String(value??'').replace(/[&<>"']/g,function(char){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]})}
  function active(rows){return safe(rows).filter(function(row){return row&&row.status!=='CANCELLED'})}
  function sourceGrade(row){row=row||{};return String(row.purchaseContractGrade||row.contractGrade||row.customerGrade||row.supplierGrade||row.sourceGrade||row.originalGrade||row.grade||row.itemName||row.description||'').trim()}
  function finalGrade(row){row=row||{};var main=String(row.finalGrade||row.mainGrade||'').trim();if(main)return[row.productType,main,row.subGrade,row.detailGrade].filter(Boolean).join(' · ');return String(row.grade||'').trim()}
  function dateOnly(value){return String(value||'').slice(0,10)}
  function priceOf(row){return num(row&&(
    row.unitPrice??row.price??row.purchaseUnitPrice??row.usdPrice??row.buyPrice
  ))}
  function poRows(poNo){return active(st().pos).filter(function(row){return String(row.poNo||'')===String(poNo||'')})}
  function photoMemo(row,key){return String(row&&row.photoMemos&&row.photoMemos[key]||'')}
  function hasAnomaly(row){return !!(row&&row.photos&&row.photos.anomaly)||!!(row&&row.anomalyPhoto)||!!photoMemo(row,'anomaly')}
  function uniqueText(values){return Array.from(new Set(values.map(function(v){return String(v||'').trim()}).filter(Boolean))).join(' / ')}
  function fitRows(rows,maxRows){
    if(rows.length<=maxRows)return rows;
    if(maxRows<=1)return[{description:rows.map(function(r){return r.description}).join(' / '),weight:rows.reduce(function(s,r){return s+num(r.weight)},0),price:0,amount:rows.reduce(function(s,r){return s+num(r.amount)},0),remark:uniqueText(rows.map(function(r){return r.remark})),hasAnomaly:rows.some(function(r){return r.hasAnomaly})}];
    var head=rows.slice(0,maxRows-1),tail=rows.slice(maxRows-1);
    head.push({description:tail.map(function(r){return r.description}).join(' / '),weight:tail.reduce(function(s,r){return s+num(r.weight)},0),price:0,amount:tail.reduce(function(s,r){return s+num(r.amount)},0),remark:uniqueText(tail.map(function(r){return r.remark})),hasAnomaly:tail.some(function(r){return r.hasAnomaly}),loss:tail.every(function(r){return r.loss})});
    return head;
  }
  function previewRowCount(detail){
    return Math.max(safe(detail&&detail.originalRows).length,safe(detail&&detail.actualRows).length)+3;
  }

  function exactDetail(poNo){
    var state=st(),packages=poRows(poNo),packageMap=new Map(packages.map(function(row){return[String(row.packageNo||''),row]}));
    var splits=active(state.splits).filter(function(row){return packageMap.has(String(row.packageNo||''))});
    var losses=active(state.losses).filter(function(row){return packageMap.has(String(row.packageNo||''))});
    var photos=splits.concat(losses,active(state.orderPhotos).filter(function(row){return String(row.poNo||row.orderNo||'')===String(poNo||'')}));
    var originalRows=packages.map(function(row){var weight=num(row.netWeight||row.nw||row.weight),price=priceOf(row);return{description:sourceGrade(row)||'거래처 강종 미지정',weight:weight,price:price,amount:weight*price}});
    var actualRows=splits.map(function(row){var source=packageMap.get(String(row.packageNo||''))||{},price=priceOf(row)||priceOf(source),remark=photoMemo(row,'anomaly')||photoMemo(row,'shape')||row.memo||'',confirmedGrade=finalGrade(row);return{description:confirmedGrade||'최종강종 미확정',weight:num(row.weight),price:price,amount:num(row.weight)*price,remark:remark,hasAnomaly:hasAnomaly(row),loss:false}});
    losses.forEach(function(row){var source=packageMap.get(String(row.packageNo||''))||{},price=priceOf(source),label=sourceGrade(source);actualRows.push({description:'LOSS'+(label?' ('+label+')':''),weight:num(row.weight),price:price,amount:0,remark:row.reason||row.memo||'LOSS',hasAnomaly:hasAnomaly(row),loss:true})});
    if(!actualRows.length){actualRows=packages.map(function(row){return{description:'최종강종 미확정',weight:0,price:priceOf(row),amount:0,remark:'검수 미완료',hasAnomaly:false,loss:false}})}
    var first=packages[0]||{},totalWeight=originalRows.reduce(function(s,r){return s+r.weight},0),inspectedWeight=actualRows.reduce(function(s,r){return s+r.weight},0),inputAmount=originalRows.reduce(function(s,r){return s+r.amount},0),actualAmount=actualRows.reduce(function(s,r){return s+r.amount},0);
    return{
      poNo:String(poNo||''),company:first.company||first.supplier||'',address:first.companyAddress||first.supplierAddress||first.address||'',phone:first.companyPhone||first.supplierPhone||first.phone||'',fax:first.companyFax||first.supplierFax||first.fax||'',invoiceNo:first.invoiceNo||first.documentNo||'',receiptDate:dateOnly(first.receivedAt||first.receiptDate||first.updatedAt||first.createdAt)||new Date().toLocaleDateString('sv-SE'),
      packages:packages,pos:packages,splits:splits,losses:losses,photos:photos,originalRows:originalRows,actualRows:actualRows,totalWeight:totalWeight,inspectedWeight:inspectedWeight,inputAmount:inputAmount,actualAmount:actualAmount,provisionalAmount:inputAmount*.9,balance:actualAmount-inputAmount*.9
    };
  }

  function xmlDoc(text){var doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw Error('엑셀 원본 양식 XML을 읽을 수 없습니다.');return doc}
  function serialize(doc){return new XMLSerializer().serializeToString(doc)}
  function children(node,name){return Array.from(node.childNodes).filter(function(child){return child.nodeType===1&&child.localName===name})}
  function columnName(index){var out='';for(var n=index+1;n>0;n=Math.floor((n-1)/26))out=String.fromCharCode(65+(n-1)%26)+out;return out}
  function address(col,row){return columnName(col)+row}
  function cell(doc,cellAddress){
    var ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main',sheetData=doc.getElementsByTagNameNS('*','sheetData')[0];if(!sheetData)throw Error('엑셀 시트 데이터가 없습니다.');
    var rowNo=parseInt((cellAddress.match(/\d+/)||['0'])[0],10),row=Array.from(sheetData.getElementsByTagNameNS('*','row')).find(function(node){return num(node.getAttribute('r'))===rowNo});
    if(!row){row=doc.createElementNS(ns,'row');row.setAttribute('r',String(rowNo));sheetData.appendChild(row)}
    var found=Array.from(row.getElementsByTagNameNS('*','c')).find(function(node){return node.getAttribute('r')===cellAddress});
    if(!found){found=doc.createElementNS(ns,'c');found.setAttribute('r',cellAddress);row.appendChild(found)}
    return found;
  }
  function setCell(doc,cellAddress,value,kind){
    var ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main',target=cell(doc,cellAddress);children(target,'f').concat(children(target,'v'),children(target,'is')).forEach(function(node){node.remove()});
    if(value===null||value===undefined||value===''){target.removeAttribute('t');return}
    if(kind==='number'&&Number.isFinite(Number(value))){target.removeAttribute('t');var v=doc.createElementNS(ns,'v');v.textContent=String(Number(value));target.appendChild(v);return}
    target.setAttribute('t','inlineStr');var inline=doc.createElementNS(ns,'is'),text=doc.createElementNS(ns,'t');text.setAttribute('xml:space','preserve');text.textContent=String(value);inline.appendChild(text);target.appendChild(inline);
  }
  function setSmall(doc,cellAddress,value,size){
    if(value===null||value===undefined||value===''){setCell(doc,cellAddress,'');return}
    var ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main',target=cell(doc,cellAddress);children(target,'f').concat(children(target,'v'),children(target,'is')).forEach(function(node){node.remove()});target.setAttribute('t','inlineStr');
    var inline=doc.createElementNS(ns,'is'),run=doc.createElementNS(ns,'r'),props=doc.createElementNS(ns,'rPr'),fontSize=doc.createElementNS(ns,'sz'),text=doc.createElementNS(ns,'t');fontSize.setAttribute('val',String(size||8));props.appendChild(fontSize);text.setAttribute('xml:space','preserve');text.textContent=String(value);run.appendChild(props);run.appendChild(text);inline.appendChild(run);target.appendChild(inline);
  }
  function clearRange(doc,startCol,endCol,startRow,endRow){for(var row=startRow;row<=endRow;row++)for(var col=startCol;col<=endCol;col++)setCell(doc,address(col,row),'')}
  function hideColumn(doc,column){var cols=Array.from(doc.getElementsByTagNameNS('*','col')),target=cols.find(function(node){return num(node.getAttribute('min'))<=column&&num(node.getAttribute('max'))>=column;});if(!target)return;target.setAttribute('hidden','1');target.setAttribute('width','0');target.setAttribute('customWidth','1')}
  function excelDate(value){var time=Date.parse(dateOnly(value)+'T00:00:00Z');return Number.isFinite(time)?Math.round(time/86400000)+25569:''}
  function addressLines(value){var text=String(value||'').trim();if(!text)return['',''];var lines=text.split(/\r?\n/).map(function(v){return v.trim()}).filter(Boolean);if(lines.length>1)return[lines[0],lines.slice(1).join(' ')];if(text.length<=42)return[text,''];var at=text.lastIndexOf(' ',42);if(at<18)at=text.indexOf(' ',28);return at<0?[text,'']:[text.slice(0,at).trim(),text.slice(at+1).trim()]}
  async function sheetDocument(zip,sheetName){
    var workbook=xmlDoc(await zip.file('xl/workbook.xml').async('string')),sheet=Array.from(workbook.getElementsByTagNameNS('*','sheet')).find(function(node){return node.getAttribute('name')===sheetName});if(!sheet)throw Error(sheetName+' 시트를 찾을 수 없습니다.');
    var relId=sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')||sheet.getAttribute('r:id'),rels=xmlDoc(await zip.file('xl/_rels/workbook.xml.rels').async('string')),rel=Array.from(rels.getElementsByTagNameNS('*','Relationship')).find(function(node){return node.getAttribute('Id')===relId});if(!rel)throw Error(sheetName+' 시트 연결정보가 없습니다.');
    var target=rel.getAttribute('Target').replace(/^\//,'').replace(/^xl\//,''),path='xl/'+target.replace(/^\.\//,''),file=zip.file(path);if(!file)throw Error(sheetName+' 시트 파일이 없습니다.');var doc=xmlDoc(await file.async('string'));return{doc:doc,save:function(){zip.file(path,serialize(doc))}};
  }
  function fillDomestic(doc,detail,sheetName){
    var raw=sheetName==='S.T',date=detail.receiptDate,dateSerial=excelDate(date),original=fitRows(detail.originalRows,18),actual=fitRows(detail.actualRows,18),actualValue=raw?0:detail.actualAmount;
    setCell(doc,'G2',detail.company);setCell(doc,'J2',dateSerial,'number');setSmall(doc,'G3',detail.address,9);setCell(doc,'G4',detail.phone);setCell(doc,'G5',detail.fax);setCell(doc,'G6',detail.poNo);clearRange(doc,1,3,10,27);clearRange(doc,5,9,10,27);
    original.forEach(function(row,index){var r=10+index;setCell(doc,'B'+r,row.description);setCell(doc,'C'+r,row.weight,'number');setCell(doc,'D'+r,'')});
    actual.forEach(function(row,index){var r=10+index;setCell(doc,'F'+r,row.description);setCell(doc,'G'+r,row.weight,'number');setCell(doc,'H'+r,raw?'':(row.price||''),!raw&&row.price?'number':'string');setCell(doc,'I'+r,raw?0:(row.amount||0),'number');setSmall(doc,'J'+r,row.remark||'',8)});
    setCell(doc,'B28','Total');setCell(doc,'C28',detail.totalWeight,'number');setCell(doc,'F28','Total');setCell(doc,'G28',detail.inspectedWeight,'number');setCell(doc,'H26','공급가액 :');setCell(doc,'I26',actualValue,'number');setCell(doc,'H27','부가세 :');setCell(doc,'I27',actualValue*.1,'number');setCell(doc,'I28','Total :');setCell(doc,'J28',actualValue*1.1,'number');setCell(doc,'B30','세금계산서 발행 요청일 : '+date);setCell(doc,'B31','세금계산서 작성일자 : '+date);setCell(doc,'B32','발행 마감 : 오후 4시');
  }
  function fillOverseas(doc,detail,sheetName){
    var raw=sheetName==='검수원본',start=13,totalRow=raw?108:77,summaryRow=raw?111:80,maxRows=totalRow-start,date=detail.receiptDate,dateSerial=excelDate(date),lines=addressLines(detail.address),original=fitRows(detail.originalRows,maxRows),actual=fitRows(detail.actualRows,maxRows),actualValue=raw?0:detail.actualAmount,balance=raw?-detail.provisionalAmount:detail.balance;
    setCell(doc,'B5',detail.company);setCell(doc,'B6',lines[0]);setCell(doc,'B7',lines[1]);setCell(doc,'B8',[detail.phone,detail.fax].filter(Boolean).join('   '));setCell(doc,'G5',dateSerial,'number');setCell(doc,'G6',detail.invoiceNo);setCell(doc,'G7',detail.poNo);clearRange(doc,0,9,start,totalRow-1);setCell(doc,'J12','');hideColumn(doc,10);
    original.forEach(function(row,index){var r=start+index;setCell(doc,'A'+r,row.description);setCell(doc,'B'+r,row.weight,'number');setCell(doc,'C'+r,row.price||'',row.price?'number':'string');setCell(doc,'D'+r,row.amount||0,'number')});
    actual.forEach(function(row,index){var r=start+index;setCell(doc,'E'+r,row.description);setCell(doc,'F'+r,row.weight,'number');setCell(doc,'G'+r,raw?'':(row.price||''),!raw&&row.price?'number':'string');setCell(doc,'H'+r,raw?0:(row.amount||0),'number');setSmall(doc,'I'+r,row.remark||'',6.5);setCell(doc,'J'+r,'')});
    setCell(doc,'A'+totalRow,'TOTAL');setCell(doc,'B'+totalRow,detail.totalWeight,'number');setCell(doc,'D'+totalRow,detail.inputAmount,'number');setCell(doc,'E'+totalRow,'TOTAL');setCell(doc,'F'+totalRow,detail.inspectedWeight,'number');setCell(doc,'H'+totalRow,actualValue,'number');setCell(doc,'E'+summaryRow,'Actual value');setCell(doc,'H'+summaryRow,actualValue,'number');setCell(doc,'E'+(summaryRow+1),'Provisonal Payment ( 90% )');setCell(doc,'H'+(summaryRow+1),detail.provisionalAmount,'number');setCell(doc,'E'+(summaryRow+2),'Balance');setCell(doc,'H'+(summaryRow+2),balance,'number');
  }
  var jsZipLoading=null;
  function ensureJSZip(){
    if(window.JSZip)return Promise.resolve(window.JSZip);
    if(jsZipLoading)return jsZipLoading;
    var sources=['https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js','https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js','https://unpkg.com/jszip@3.10.1/dist/jszip.min.js'];
    jsZipLoading=new Promise(function(resolve,reject){
      function load(index){
        if(window.JSZip){resolve(window.JSZip);return}
        if(index>=sources.length){reject(Error('원본 Excel 생성 모듈 연결에 실패했습니다. 인터넷 연결을 확인한 뒤 다시 눌러 주세요.'));return}
        var script=document.createElement('script'),finished=false,timer=setTimeout(function(){if(finished)return;finished=true;script.remove();load(index+1)},12000);
        script.src=sources[index];script.async=true;script.onload=function(){if(finished)return;finished=true;clearTimeout(timer);if(window.JSZip)resolve(window.JSZip);else load(index+1)};script.onerror=function(){if(finished)return;finished=true;clearTimeout(timer);script.remove();load(index+1)};document.head.appendChild(script)
      }
      load(0)
    });
    return jsZipLoading;
  }
  async function removeYellowFills(zip){
    var file=zip.file('xl/styles.xml');if(!file)return;
    var text=await file.async('string');
    text=text.replace(/<(fgColor|bgColor)\b([^>]*?)rgb="(?:FF)?(?:FFFF00|FFF2CC|FFE699|FFD966|FFC000)"([^>]*)\/>/gi,'<$1$2rgb="FFFFFFFF"$3/>');
    zip.file('xl/styles.xml',text);
  }
  async function templateBlob(poNo,type){
    var JSZipCtor=await ensureJSZip();
    var detail=exactDetail(poNo),template=type==='OVERSEAS'?'settlement-overseas-template.xlsx':'settlement-domestic-template.xlsx',response=await fetch('./'+template+'?v='+VERSION,{cache:'no-store'});if(!response.ok)throw Error('세틀먼트 원본 양식 HTTP '+response.status);var zip=await JSZipCtor.loadAsync(await response.arrayBuffer());
    if(type==='OVERSEAS'){for(const name of ['검수원본','세틀']){var sheet=await sheetDocument(zip,name);fillOverseas(sheet.doc,detail,name);sheet.save()}}else{for(const name of ['S.T','S.T (2)']){var domesticSheet=await sheetDocument(zip,name);fillDomestic(domesticSheet.doc,detail,name);domesticSheet.save()}}
    await removeYellowFills(zip);
    var bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:6}});
    return new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }
  function downloadBlob(blob,fileName){if(navigator.msSaveOrOpenBlob){navigator.msSaveOrOpenBlob(blob,fileName);return}var url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=fileName;a.rel='noopener';a.style.display='none';document.body.appendChild(a);a.click();setTimeout(function(){a.remove();URL.revokeObjectURL(url)},30000)}
  function previewDate(value,overseas){var raw=dateOnly(value),date=new Date((raw||new Date().toLocaleDateString('sv-SE'))+'T00:00:00');if(!Number.isFinite(date.getTime()))return raw;return overseas?String(date.getDate()).padStart(2,'0')+'/'+String(date.getMonth()+1).padStart(2,'0')+'/'+date.getFullYear():(date.getMonth()+1)+'/'+date.getDate()+'/'+String(date.getFullYear()).slice(-2)}
  function money(value){return num(value).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
  function domesticPreview(detail){
    var previewRows=previewRowCount(detail),original=fitRows(detail.originalRows,previewRows),actual=fitRows(detail.actualRows,previewRows),supply=detail.actualAmount,tax=supply*.1;
    var left=Array.from({length:previewRows},function(_,i){var row=original[i];return'<tr><td>'+(row?esc(row.description):'')+'</td><td class="num">'+(row?num(row.weight).toLocaleString():'')+'</td><td></td></tr>'}).join('');
    var right=Array.from({length:previewRows},function(_,i){var row=actual[i];return'<tr><td>'+(row?esc(row.description):'')+'</td><td class="num">'+(row?num(row.weight).toLocaleString():'')+'</td><td class="num">'+(row&&row.price?num(row.price).toLocaleString(undefined,{maximumFractionDigits:2}):'')+'</td><td class="num">'+(row?num(row.amount).toLocaleString(undefined,{maximumFractionDigits:2}):'')+'</td><td class="memo">'+(row?esc(row.remark):'')+'</td></tr>'}).join('');
    return'<div class="settlement-excel-preview-shell"><div class="settlement-excel-paper settlement-domestic-paper"><div class="settlement-domestic-top"><div class="settlement-domestic-brand"><img src="'+DOMESTIC_LOGO+'"><div class="settlement-domestic-brand-main"><b>(주) 신 성 금 속</b><span>www.shinsungmetal.net</span></div><div class="settlement-domestic-company">경상남도 함안군 칠원읍 원서로 205-29<br>Tel : 055-582-1105&nbsp;&nbsp; Fax : 055-582-1106<br>tax@shinsungmetal.net</div></div><div class="settlement-domestic-info"><span>상호</span><b>'+esc(detail.company)+'</b><span>입고일</span><b>'+esc(previewDate(detail.receiptDate,false))+'</b><span>주소</span><span class="wide-value">'+esc(detail.address)+'</span><span>Tel.</span><span class="wide-value">'+esc(detail.phone)+'</span><span>Fax.</span><span class="wide-value">'+esc(detail.fax)+'</span><span>P/O No.</span><span class="wide-value">'+esc(detail.poNo)+'</span></div></div><div class="settlement-domestic-tables"><table class="settlement-domestic-table"><colgroup><col style="width:48%"><col style="width:20%"><col style="width:32%"></colgroup><caption>입 고 내 역</caption><thead><tr><th>거래처 강종</th><th>무게(G/W)</th><th>비고</th></tr></thead><tbody>'+left+'</tbody><tfoot><tr><th>Total</th><th class="num">'+detail.totalWeight.toLocaleString()+'</th><th></th></tr></tfoot></table><div class="settlement-domestic-arrow">⇨</div><table class="settlement-domestic-table"><colgroup><col style="width:32%"><col style="width:14%"><col style="width:14%"><col style="width:18%"><col style="width:22%"></colgroup><caption>정 산 내 역</caption><thead><tr><th>최종강종</th><th>무게(N/W)</th><th>단가</th><th>Total</th><th>비고</th></tr></thead><tbody>'+right+'</tbody><tfoot><tr><th>Total</th><th class="num">'+detail.inspectedWeight.toLocaleString()+'</th><th></th><th>Total :</th><th class="num">'+num(supply+tax).toLocaleString(undefined,{maximumFractionDigits:2})+'</th></tr></tfoot></table></div><div class="settlement-domestic-footer"><div class="settlement-domestic-taxbox">세금계산서 발행 요청일 : '+esc(detail.receiptDate)+'</div><div class="settlement-domestic-approval"><div class="settlement-domestic-approval-line">확인자 :</div><span>Yours faithfully</span><strong>신 성 금 속</strong></div></div></div></div>';
  }
  function overseasPreview(detail){
    var previewRows=previewRowCount(detail),original=fitRows(detail.originalRows,previewRows),actual=fitRows(detail.actualRows,previewRows),rows=Array.from({length:previewRows},function(_,i){var left=original[i],right=actual[i];return'<tr><td>'+(left?esc(left.description):'')+'</td><td class="num">'+(left?num(left.weight).toLocaleString():'')+'</td><td class="num">'+(left&&left.price?money(left.price):'')+'</td><td class="num">'+(left?money(left.amount):'')+'</td><td>'+(right?esc(right.description):'')+'</td><td class="num">'+(right?num(right.weight).toLocaleString():'')+'</td><td class="num">'+(right&&right.price?money(right.price):'')+'</td><td class="num">'+(right?money(right.amount):'')+'</td><td>'+(right?esc(right.remark):'')+'</td></tr>'}).join('');
    return'<div class="settlement-excel-preview-shell"><div class="settlement-excel-paper settlement-overseas-paper"><div class="settlement-overseas-brand"><div class="settlement-overseas-brand-left"><img src="'+OVERSEAS_LOGO+'"><b>SHIN SUNG METAL CO.,LTD</b></div><strong>Settlement Report</strong></div><div class="settlement-overseas-info"><span>Messrs.</span><b>'+esc(detail.company)+'</b><span>Date :</span><b>'+esc(previewDate(detail.receiptDate,true))+'</b><span></span><span class="address">'+esc(detail.address)+'</span><span>INVOICE No :</span><span>'+esc(detail.invoiceNo)+'</span><span></span><span>'+esc([detail.phone,detail.fax].filter(Boolean).join('   '))+'</span><span>P/O No :</span><span>'+esc(detail.poNo)+'</span></div><table class="settlement-overseas-grid"><colgroup><col style="width:12%"><col style="width:9%"><col style="width:10%"><col style="width:10%"><col style="width:12%"><col style="width:9%"><col style="width:10%"><col style="width:10%"><col style="width:18%"></colgroup><thead><tr><th class="section-head" colspan="4">Invoice Value</th><th class="section-head" colspan="5">Actual Value After Inspection</th></tr><tr><th>Customer Grade</th><th>Weight(Kg)</th><th>Price(USD/Kg)</th><th>Amount(USD)</th><th>Final Grade</th><th>Weight(Kg)</th><th>Price(USD/Kg)</th><th>Amount(USD)</th><th>Remark</th></tr></thead><tbody>'+rows+'</tbody><tfoot><tr><th>TOTAL</th><th class="num">'+detail.totalWeight.toLocaleString()+'</th><th></th><th class="num">'+money(detail.inputAmount)+'</th><th>TOTAL</th><th class="num">'+detail.inspectedWeight.toLocaleString()+'</th><th></th><th class="num">'+money(detail.actualAmount)+'</th><th></th></tr></tfoot></table><table class="settlement-overseas-summary"><colgroup><col style="width:70%"><col style="width:30%"></colgroup><tr><td>Actual value</td><td class="num">'+money(detail.actualAmount)+'</td></tr><tr><td>Provisonal Payment ( 90% )</td><td class="num">'+money(detail.provisionalAmount)+'</td></tr><tr><td><b>Balance</b></td><td class="num"><b>'+money(detail.balance)+'</b></td></tr></table><div class="settlement-overseas-sign"><div>SELLER</div><div class="buyer"><span>BUYER</span><img src="'+OVERSEAS_SIGNATURE+'"></div></div></div></div>';
  }
  function preview(detail,type){return type==='OVERSEAS'?overseasPreview(detail):domesticPreview(detail)}
  function injectStyles(){if(document.getElementById('mesSettlementExactStyles'))return;var style=document.createElement('style');style.id='mesSettlementExactStyles';style.textContent=`
    .settlement-excel-preview-shell{width:100%;overflow:visible;background:#dfe3e2;padding:6px 6px 18px;box-sizing:border-box;position:relative}.settlement-excel-preview-shell *{box-sizing:border-box}.settlement-excel-paper{margin:0;background:#fff;color:#111;font-family:Arial,"Malgun Gothic",sans-serif;box-shadow:0 2px 12px #0002;overflow:hidden}.settlement-excel-paper table{border-collapse:collapse;table-layout:fixed;width:100%;min-width:0!important;max-width:100%;margin:0}.settlement-excel-paper th,.settlement-excel-paper td{position:static!important;border:1px solid #5b5b5b!important;background:#fff!important;color:#111;font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.settlement-excel-paper .num{text-align:right}
    .settlement-domestic-paper{width:1180px;padding:8px 12px 10px}.settlement-domestic-top{display:grid;grid-template-columns:40% 60%;min-height:210px}.settlement-domestic-brand{display:grid;grid-template-columns:22% 78%;grid-template-rows:58% 42%;border-bottom:1px solid #aaa}.settlement-domestic-brand img{align-self:center;justify-self:center;width:76%;max-height:82%;object-fit:contain}.settlement-domestic-brand-main{align-self:center}.settlement-domestic-brand-main b{display:block;font-size:31px;letter-spacing:.22em}.settlement-domestic-brand-main span{display:block;font-size:21px}.settlement-domestic-company{grid-column:1/3;text-align:center;font-size:12px;line-height:1.45}.settlement-domestic-info{display:grid;grid-template-columns:16% 43% 15% 26%;grid-template-rows:repeat(5,1fr);font-size:14px;border-bottom:1px solid #aaa}.settlement-domestic-info>*{padding:2px 5px;border-bottom:1px solid #ddd;overflow:hidden}.settlement-domestic-info .wide-value{grid-column:2/5}.settlement-domestic-tables{display:grid;grid-template-columns:40% 4% 56%;margin-top:5px}.settlement-domestic-arrow{display:flex;align-items:center;justify-content:center;font-size:42px}.settlement-domestic-table{font-size:13px}.settlement-domestic-table:first-child col:nth-child(1){width:48%}.settlement-domestic-table caption{border:1px solid #333;border-bottom:0;padding:3px;font-size:16px;letter-spacing:.5em}.settlement-domestic-table th{font-size:14px;height:22px}.settlement-domestic-table td{height:21px;padding:1px 4px;text-align:center}.settlement-domestic-table:nth-of-type(2) th:nth-child(1){width:32%}.settlement-domestic-table:nth-of-type(2) th:nth-child(2),.settlement-domestic-table:nth-of-type(2) th:nth-child(3){width:14%}.settlement-domestic-table:nth-of-type(2) th:nth-child(4){width:18%}.settlement-domestic-table:nth-of-type(2) th:nth-child(5){width:22%}.settlement-domestic-footer{display:grid;grid-template-columns:61% 39%;min-height:110px;margin-top:5px}.settlement-domestic-taxbox{border:1px solid #333;display:flex;align-items:center;justify-content:center;font-size:18px}.settlement-domestic-approval{padding:6px 3% 0 18%;font-size:14px}.settlement-domestic-approval-line{border-bottom:1px solid #333;padding:3px 0}.settlement-domestic-approval strong{display:block;font-size:17px;letter-spacing:.25em;margin-top:9px}
    .settlement-overseas-paper{width:760px;padding:10px 16px 18px}.settlement-overseas-brand{display:grid;grid-template-columns:44% 56%;align-items:center;border-bottom:1.5px solid #333;min-height:52px}.settlement-overseas-brand-left{display:flex;align-items:center;gap:5px}.settlement-overseas-brand-left img{width:11%;max-height:38px}.settlement-overseas-brand-left b{font-size:18px}.settlement-overseas-brand strong{text-align:center;font-size:20px}.settlement-overseas-info{display:grid;grid-template-columns:10% 34% 12% 44%;grid-template-rows:repeat(4,minmax(12px,auto));font-size:9px;line-height:1.25;margin:7px 0 8px}.settlement-overseas-info>*{padding:1px 3px;overflow:hidden}.settlement-overseas-grid{font-size:7.5px}.settlement-overseas-grid th,.settlement-overseas-grid td{height:12px;padding:1px 2px;line-height:1.05}.settlement-overseas-grid th:nth-child(1),.settlement-overseas-grid td:nth-child(1),.settlement-overseas-grid th:nth-child(5),.settlement-overseas-grid td:nth-child(5){width:12%}.settlement-overseas-grid th:nth-child(2),.settlement-overseas-grid td:nth-child(2),.settlement-overseas-grid th:nth-child(6),.settlement-overseas-grid td:nth-child(6){width:9%}.settlement-overseas-grid th:nth-child(3),.settlement-overseas-grid td:nth-child(3),.settlement-overseas-grid th:nth-child(4),.settlement-overseas-grid td:nth-child(4),.settlement-overseas-grid th:nth-child(7),.settlement-overseas-grid td:nth-child(7),.settlement-overseas-grid th:nth-child(8),.settlement-overseas-grid td:nth-child(8){width:10%}.settlement-overseas-grid th:nth-child(9),.settlement-overseas-grid td:nth-child(9){width:18%}.settlement-overseas-grid .section-head{font-size:11px;height:23px;font-weight:700}.settlement-overseas-summary{width:56%;margin:10px 0 0 44%;font-size:8px}.settlement-overseas-summary td{padding:3px}.settlement-overseas-sign{display:grid;grid-template-columns:44% 56%;margin-top:10px;border:1px solid #e88;min-height:45px;font-size:7px}.settlement-overseas-sign>div{padding:5px;border-right:1px solid #e88}.settlement-overseas-sign .buyer{display:grid;grid-template-columns:18% 82%}.settlement-overseas-sign .buyer img{width:72%;max-height:40px;object-fit:contain;justify-self:end}
    #mesSettlementFullscreenPreview{position:fixed!important;inset:0!important;z-index:1000!important;width:100vw!important;height:100dvh!important;display:none;flex-direction:column;background:#edf1f2;color:#14222b;zoom:1!important;transform:none!important}#mesSettlementFullscreenPreview.on{display:flex}.mes-settlement-fullscreen-bar{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px max(10px,env(safe-area-inset-right)) 10px max(10px,env(safe-area-inset-left));background:#102f3d;color:#fff;box-shadow:0 3px 16px #0004}.mes-settlement-fullscreen-title b,.mes-settlement-fullscreen-title small{display:block}.mes-settlement-fullscreen-title b{font-size:18px}.mes-settlement-fullscreen-title small{margin-top:2px;color:#c9e5df}.mes-settlement-fullscreen-tools{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.mes-settlement-fullscreen-tools .btn{min-height:40px;padding:8px 12px}.mes-settlement-fullscreen-tools .active{background:#0c9a8c;border-color:#0c9a8c;color:#fff}.mes-settlement-fullscreen-close{background:#fff0f0!important;border-color:#ffb8b8!important;color:#922b2b!important}.mes-settlement-fullscreen-body{flex:1 1 auto;min-width:0;min-height:0;overflow:auto;padding:10px;display:block;overscroll-behavior:contain}.mes-settlement-fullscreen-body .settlement-excel-preview-shell{margin:0 auto;padding:0;background:transparent;overflow:visible}.mes-settlement-fullscreen-body .settlement-excel-paper{position:absolute;left:0;top:0;margin:0!important}.mes-settlement-inline-guide{margin:8px 0;padding:10px 12px;border-radius:10px;background:#e8f7f4;color:#086a5f;font-weight:800}.settlement-excel-preview-shell[data-settlement-inline-open]{cursor:zoom-in;outline:2px dashed #45a99c;outline-offset:3px}
    @media(max-width:700px){.mes-settlement-fullscreen-bar{display:block}.mes-settlement-fullscreen-title{margin-bottom:8px}.mes-settlement-fullscreen-tools{display:grid;grid-template-columns:1fr 1fr}.mes-settlement-fullscreen-tools .btn{width:100%}.mes-settlement-fullscreen-body{padding:6px}}
  `;document.head.appendChild(style)}
function fitPreview(){document.querySelectorAll('.settlement-excel-preview-shell').forEach(function(shell){if(shell.closest('#mesSettlementFullscreenPreview'))return;var paper=shell.querySelector('.settlement-excel-paper');if(!paper)return;var base=paper.classList.contains('settlement-domestic-paper')?1180:760;shell.style.height='auto';shell.style.minHeight='0';paper.style.width=base+'px';paper.style.transform='none';paper.style.margin='0';var available=Math.max(1,shell.clientWidth-12);if(available<10)return;var naturalHeight=Math.max(1,paper.scrollHeight,paper.offsetHeight),scale=Math.min(1,available/base),visualWidth=base*scale,visualHeight=naturalHeight*scale;paper.style.transformOrigin='top left';paper.style.transform='scale('+scale+')';paper.style.marginLeft=Math.max(0,(available-visualWidth)/2)+'px';shell.style.height=Math.ceil(visualHeight+24)+'px';shell.style.minHeight=Math.ceil(visualHeight+24)+'px';shell.dataset.previewScale=String(scale);shell.dataset.previewVisualHeight=String(Math.round(visualHeight));Array.from(paper.querySelectorAll('img')).forEach(function(image){if(image.dataset.settlementFitBound)return;image.dataset.settlementFitBound='1';image.addEventListener('load',scheduleFit,{once:true});image.addEventListener('error',scheduleFit,{once:true})})})}
  function scheduleFit(){[0,40,120,300,600,1200,2000].forEach(function(delay){setTimeout(function(){requestAnimationFrame(fitPreview)},delay)})}

  var fullscreenState=null,bodyOverflowBeforeFullscreen='';
  function ensureFullscreenViewer(){
    var existing=document.getElementById('mesSettlementFullscreenPreview');if(existing)return existing;
    var viewer=document.createElement('section');viewer.id='mesSettlementFullscreenPreview';viewer.setAttribute('role','dialog');viewer.setAttribute('aria-modal','true');viewer.setAttribute('aria-label','세틀먼트 전체화면 미리보기');
    viewer.innerHTML='<div class="mes-settlement-fullscreen-bar"><div class="mes-settlement-fullscreen-title"><b id="mesSettlementFullscreenTitle">세틀먼트 전체화면</b><small id="mesSettlementFullscreenScale">문서 전체를 화면 폭에 맞춰 표시합니다.</small></div><div class="mes-settlement-fullscreen-tools"><button id="mesSettlementFullscreenDomestic" class="btn" type="button" onclick="switchMesSettlementFullscreen(\'DOMESTIC\')">국내양식</button><button id="mesSettlementFullscreenOverseas" class="btn" type="button" onclick="switchMesSettlementFullscreen(\'OVERSEAS\')">해외양식</button><button class="btn primary" type="button" onclick="downloadCurrentMesSettlementFullscreen()">엑셀 다운로드</button><button class="btn mes-settlement-fullscreen-close" type="button" onclick="closeMesSettlementFullscreen()">닫기 ×</button></div></div><div id="mesSettlementFullscreenBody" class="mes-settlement-fullscreen-body"></div>';
    document.body.appendChild(viewer);return viewer;
  }
  function fitFullscreenPreview(){
    var viewer=document.getElementById('mesSettlementFullscreenPreview');if(!viewer||!viewer.classList.contains('on'))return;
    var body=document.getElementById('mesSettlementFullscreenBody'),shell=body&&body.querySelector('.settlement-excel-preview-shell'),paper=shell&&shell.querySelector('.settlement-excel-paper');if(!body||!shell||!paper)return;
    var base=paper.classList.contains('settlement-domestic-paper')?1180:760;
    shell.dataset.fullscreen='1';shell.style.width=base+'px';shell.style.height='auto';shell.style.minHeight='0';shell.style.padding='0';paper.style.position='static';paper.style.width=base+'px';paper.style.transform='none';paper.style.margin='0';
    var naturalHeight=Math.max(1,paper.scrollHeight,paper.offsetHeight),available=Math.max(1,body.clientWidth-20),scale=Math.min(1,available/base),visualWidth=Math.ceil(base*scale),visualHeight=Math.ceil(naturalHeight*scale);
    shell.style.width=visualWidth+'px';shell.style.height=visualHeight+'px';shell.style.minHeight=visualHeight+'px';paper.style.position='absolute';paper.style.transformOrigin='top left';paper.style.transform='scale('+scale+')';
    var scaleText=document.getElementById('mesSettlementFullscreenScale');if(scaleText)scaleText.textContent='전체 열 화면맞춤 · '+Math.round(scale*100)+'% · 좌우 잘림 없음';
    Array.from(paper.querySelectorAll('img')).forEach(function(image){if(image.dataset.fullscreenFitBound)return;image.dataset.fullscreenFitBound='1';image.addEventListener('load',scheduleFullscreenFit,{once:true});image.addEventListener('error',scheduleFullscreenFit,{once:true})});
  }
  function scheduleFullscreenFit(){[0,60,180,420].forEach(function(delay){setTimeout(function(){requestAnimationFrame(fitFullscreenPreview)},delay)})}
  function renderFullscreenViewer(){
    if(!fullscreenState)return;var viewer=ensureFullscreenViewer(),body=document.getElementById('mesSettlementFullscreenBody'),detail=exactDetail(fullscreenState.poNo),type=fullscreenState.type;
    document.getElementById('mesSettlementFullscreenTitle').textContent=fullscreenState.poNo+' · '+(type==='OVERSEAS'?'해외 Settlement Report':'국내 세틀먼트');
    document.getElementById('mesSettlementFullscreenDomestic').classList.toggle('active',type==='DOMESTIC');document.getElementById('mesSettlementFullscreenOverseas').classList.toggle('active',type==='OVERSEAS');
    body.innerHTML=preview(detail,type);body.scrollTop=0;body.scrollLeft=0;viewer.classList.add('on');scheduleFullscreenFit();
  }
  function openFullscreenViewer(poNo,type){
    fullscreenState={poNo:String(poNo||''),type:type==='OVERSEAS'?'OVERSEAS':'DOMESTIC'};var viewer=ensureFullscreenViewer();if(!viewer.classList.contains('on')){bodyOverflowBeforeFullscreen=document.body.style.overflow||'';document.body.style.overflow='hidden'}renderFullscreenViewer();
  }
  function switchFullscreenViewer(type){if(!fullscreenState)return;fullscreenState.type=type==='OVERSEAS'?'OVERSEAS':'DOMESTIC';try{mesSettlementTemplates[fullscreenState.poNo]=fullscreenState.type}catch(_){ }renderFullscreenViewer()}
  function closeFullscreenViewer(){var viewer=document.getElementById('mesSettlementFullscreenPreview');if(viewer)viewer.classList.remove('on');document.body.style.overflow=bodyOverflowBeforeFullscreen;fullscreenState=null}
  function downloadFullscreen(){if(!fullscreenState)return;return(window.downloadMesExactSettlement||window.downloadMesSettlement)(fullscreenState.poNo,fullscreenState.type)}
  function decorateInlinePreview(poNo){
    var modal=document.getElementById('modal'),actions=modal&&modal.querySelector('.settlement-actions'),shell=modal&&modal.querySelector('.settlement-excel-preview-shell');if(!actions||!shell)return;
    var buttons=actions.querySelectorAll('button'),type=buttons[1]&&buttons[1].classList.contains('primary')?'OVERSEAS':'DOMESTIC';if(buttons[0])buttons[0].textContent='국내양식 전체화면';if(buttons[1])buttons[1].textContent='해외양식 전체화면';
    if(!actions.nextElementSibling||!actions.nextElementSibling.classList.contains('mes-settlement-inline-guide'))actions.insertAdjacentHTML('afterend','<div class="mes-settlement-inline-guide">아래 양식을 누르거나 위 전체화면 버튼을 누르면 모든 열을 한 화면에 맞춰 표시합니다.</div>');
    shell.dataset.settlementInlineOpen='1';shell.setAttribute('role','button');shell.setAttribute('tabindex','0');shell.setAttribute('aria-label','세틀먼트 전체화면으로 열기');shell.onclick=function(){openFullscreenViewer(poNo,type)};shell.onkeydown=function(event){if(event.key==='Enter'||event.key===' '){event.preventDefault();openFullscreenViewer(poNo,type)}};
  }

  var exactData=function(poNo){return exactDetail(poNo)};
  var exactPreview=function(detail,type){injectStyles();scheduleFit();return preview(detail,type==='OVERSEAS'?'OVERSEAS':'DOMESTIC')};
  var exactDownload=async function(poNo,type){
    var progress=document.getElementById('progress'),toast=typeof rt().getToast==='function'?rt().getToast():window.toast,normalized=type==='OVERSEAS'?'OVERSEAS':'DOMESTIC';if(progress)progress.classList.add('on');
    try{var blob=await templateBlob(poNo,normalized);downloadBlob(blob,String(poNo||'SETTLEMENT').replace(/[\\/:*?"<>|]/g,'_')+'_'+(normalized==='OVERSEAS'?'해외':'국내')+'_세틀먼트.xlsx');if(typeof toast==='function')toast(poNo+' 원본 양식 세틀먼트 다운로드 완료')}
    catch(error){if(typeof toast==='function')toast('세틀 다운로드 실패: '+error.message,true);else alert('세틀 다운로드 실패: '+error.message)}finally{if(progress)progress.classList.remove('on')}
  };
  window.mesExactSettlementData=window.mesSettlementData=exactData;
  window.mesExactSettlementPreview=window.mesSettlementPreview=exactPreview;
  window.fitMesSettlementPreview=scheduleFit;
  window.downloadMesExactSettlement=window.downloadMesSettlement=exactDownload;
  window.openMesSettlementFullscreen=openFullscreenViewer;
  window.switchMesSettlementFullscreen=switchFullscreenViewer;
  window.closeMesSettlementFullscreen=closeFullscreenViewer;
  window.downloadCurrentMesSettlementFullscreen=downloadFullscreen;
  var setTemplateBefore=window.setMesSettlementTemplate;
  if(typeof setTemplateBefore==='function')window.setMesSettlementTemplate=function(poNo,type){var normalized=type==='OVERSEAS'?'OVERSEAS':'DOMESTIC';try{mesSettlementTemplates[poNo]=normalized}catch(_){ }openFullscreenViewer(poNo,normalized)};
  var openDetailBefore=window.openMesDetail;
  if(typeof openDetailBefore==='function')window.openMesDetail=function(view,id){var result=openDetailBefore.apply(this,arguments);if(view==='settlement')setTimeout(function(){decorateInlinePreview(id)},0);return result};
  window.addEventListener('resize',function(){scheduleFit();scheduleFullscreenFit()},{passive:true});window.addEventListener('keydown',function(event){if(event.key==='Escape'&&document.getElementById('mesSettlementFullscreenPreview')?.classList.contains('on'))closeFullscreenViewer()});injectStyles();
})();
