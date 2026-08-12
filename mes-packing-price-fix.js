Exit code: 0
Wall time: 2.8 seconds
Output:
(function mesPackingPriceFixV1(){
  'use strict';
  function round2(value){return Math.round((Number(value)||0)*100)/100;}
  function cleanNumber(value){return Number(String(value==null?'':value).replace(/,/g,'').replace(/[^0-9.+-]/g,''))||0;}
  function normalizeText(value){return String(value==null?'':value).replace(/\s+/g,' ').trim();}
  function normalizeHeader(value){return normalizeText(value).toUpperCase().replace(/[\s_.'#()\[\]{}:/\\-]+/g,'');}
  function weightToKg(value,unit){
    var n=cleanNumber(value),u=String(unit||'KG').toUpperCase().replace(/\s/g,'');
    if(/^LB|POUND/.test(u))return round2(n*0.45359237);
    if(/^(?:MT|M\/T|T|TON|TONS|TONNE|TONNES)$/.test(u))return round2(n*1000);
    return round2(n);
  }
  function priceToKg(value,unit){
    var n=cleanNumber(value),u=String(unit||'KG').toUpperCase().replace(/\s/g,'');
    if(/^LB|POUND/.test(u))return round2(n/0.45359237);
    if(/^(?:MT|M\/T|T|TON|TONS|TONNE|TONNES)$/.test(u))return round2(n/1000);
    return round2(n);
  }
  function headerUnit(text,fallback){
    var m=String(text||'').match(/(?:\(|\/|PER\s+)?\s*(KGS?|KILOGRAMS?|LBS?|POUNDS?|MT|M\/T|TONS?|TONNES?|TON)\s*\)?/i);
    return m?m[1]:fallback||'KG';
  }
  function validGrade(value){
    var text=normalizeText(value);
    return text.length>0&&!/^(?:TOTAL|SUBTOTAL|GRAND\s*TOTAL|합계|소계|NO\.?|ITEM)$/i.test(text);
  }
  function packingKeyword(token){return /^(?:BAG|BAGS|BUNDLE|BUNDLES|PALLET|PALLETS|BOX|BOXES|DRUM|DRUMS|BALE|BALES|CASE|CASES|PACK|PACKAGE|PACKAGES|LOOSE|SKID|SKIDS)$/i.test(token);}
  function parsePackingPrefix(prefix,previousGrade){
    var tokens=normalizeText(prefix).split(' ').filter(Boolean),packingAt=-1;
    for(var i=0;i<tokens.length;i++)if(packingKeyword(tokens[i])){packingAt=i;break;}
    if(packingAt<0)return null;
    var packingStart=packingAt>0&&/^\d+$/.test(tokens[packingAt-1])?packingAt-1:packingAt;
    var packageIndex=packingStart-1;
    if(packageIndex<0)return null;
    var packageNo=tokens[packageIndex];
    if(!/[0-9]/.test(packageNo)||/^(?:20|40)FT$/i.test(packageNo))return null;
    var gradeTokens=tokens.slice(0,packageIndex);
    var grade=normalizeText(gradeTokens.join(' '))||previousGrade||'';
    return{grade:grade,packageNo:packageNo,packingType:normalizeText(tokens.slice(packingStart).join(' '))};
  }
  function parsePackingLines(lines){
    var source=(lines||[]).map(normalizeText).filter(Boolean),joined=source.join('\n');
    var unitMatch=joined.match(/(?:GROSS|NET|G\/W|N\/W)[^\n]{0,35}?\(?\s*(KGS?|LBS?|POUNDS?|MT|M\/T|TONS?|TONNES?|TON)\s*\)?/i);
    var docUnit=unitMatch?unitMatch[1]:'KG',rows=[],previousGrade='';
    source.forEach(function(original){
      if(/\b(?:GRAND\s*TOTAL|SUBTOTAL|TOTAL|합계|소계)\b/i.test(original)||/\b(?:GROSS\s*WEIGHT|NET\s*WEIGHT|PACKING\s*NO|REMARK)\b/i.test(original))return;
      var line=original.replace(/(-?\d[\d,.]*)\s*(?:KGS?|KILOGRAMS?|LBS?|POUNDS?|MT|M\/T|TONS?|TONNES?|TON)\b/ig,'$1').replace(/\s+/g,' ').trim();
      var m=line.match(/^(.*?)\s+(-?\d[\d,]*(?:\.\d+)?)\s+(-?\d[\d,]*(?:\.\d+)?)\s+(-?\d[\d,]*(?:\.\d+)?)(?:\s+(.*))?$/);
      var prefix,gw,tare,nw,memo='';
      if(m){prefix=m[1];gw=m[2];tare=m[3];nw=m[4];memo=m[5]||'';}
      else{
        m=line.match(/^(.*?)\s+(-?\d[\d,]*(?:\.\d+)?)\s+(-?\d[\d,]*(?:\.\d+)?)(?:\s+(.*))?$/);
        if(!m)return;prefix=m[1];gw=m[2];nw=m[3];tare=cleanNumber(gw)-cleanNumber(nw);memo=m[4]||'';
      }
      var info=parsePackingPrefix(prefix,previousGrade);if(!info||!validGrade(info.grade))return;
      previousGrade=info.grade;
      rows.push({grade:info.grade,packageNo:info.packageNo,packingType:info.packingType,gw:weightToKg(gw,docUnit),tare:weightToKg(tare,docUnit),nw:weightToKg(nw,docUnit),weight:weightToKg(nw,docUnit),packageCount:1,memo:normalizeText(memo)});
    });
    return rows;
  }
  function findHeaderRow(matrix,mode){
    var best={index:-1,score:0};
    (matrix||[]).forEach(function(row,index){
      var cells=(row||[]).map(normalizeHeader),joined=cells.join('|'),score=0;
      if(mode==='packing'){
        if(/강종|GRADE|ITEM|DESCRIPTION|COMMODITY/.test(joined))score+=2;
        if(/GROSSWEIGHT|GW|총중량/.test(joined))score+=3;
        if(/NETWEIGHT|NW|실량/.test(joined))score+=3;
        if(/PACKINGNO|PACKAGENO|패킹번호|포장번호/.test(joined))score+=2;
      }else{
        if(/DESCRIPTION|COMMODITY|GRADE|MARKING|강종/.test(joined))score+=3;
        if(/QUANTITY|QTY|WEIGHT|중량/.test(joined))score+=3;
        if(/PRICE|UNITPRICE|단가/.test(joined))score+=3;
        if(/AMOUNT|VALUE|금액/.test(joined))score+=1;
      }
      if(score>best.score)best={index:index,score:score};
    });
    return best.score>=4?best.index:-1;
  }
  function columnIndex(headers,patterns){
    for(var i=0;i<headers.length;i++)for(var p=0;p<patterns.length;p++)if(patterns[p].test(headers[i]))return i;
    return-1;
  }
  function parsePackingMatrix(matrix){
    var hi=findHeaderRow(matrix,'packing');if(hi<0)return[];
    var rawHeaders=matrix[hi].map(normalizeText),headers=rawHeaders.map(normalizeHeader);
    var gradeCol=columnIndex(headers,[/^(?:강종|강종명|ITEM|GRADE|DESCRIPTION|COMMODITY)$/,/강종|DESCRIPTION|COMMODITY|GRADE|ITEM/]);
    var packageCol=columnIndex(headers,[/PACKINGNO|PACKAGENO|패킹번호|포장번호|PACKAGE/]);
    var packingCol=columnIndex(headers,[/^(?:포장|PACKING|PACKINGTYPE|PACKAGECLASS)$/,/포장종류/]);
    var gwCol=columnIndex(headers,[/GROSSWEIGHT|^GW$|총중량/]);
    var tareCol=columnIndex(headers,[/LOSSWEIGHT|TAREWEIGHT|감량|포장중량/]);
    var nwCol=columnIndex(headers,[/NETWEIGHT|^NW$|실량/]);
    var unit=headerUnit(rawHeaders[gwCol>=0?gwCol:nwCol]||'KG','KG'),rows=[],previousGrade='';
    for(var r=hi+1;r<matrix.length;r++){
      var row=matrix[r]||[],grade=normalizeText(row[gradeCol]),packageNo=normalizeText(row[packageCol]),packingType=normalizeText(row[packingCol]);
      if(row.some(function(cell){return /^(?:TOTAL|GRAND\s*TOTAL|SUBTOTAL|합계|소계)$/i.test(normalizeText(cell));}))continue;
      if(grade&&/^(?:TOTAL|GRAND\s*TOTAL|합계|소계)$/i.test(grade))continue;
      if(grade)previousGrade=grade;else grade=previousGrade;
      var gw=weightToKg(row[gwCol],unit),nw=weightToKg(row[nwCol],unit),tare=tareCol>=0?weightToKg(row[tareCol],unit):round2(gw-nw);
      if(!validGrade(grade)||(!packageNo&&gw<=0&&nw<=0)||gw<=0&&nw<=0)continue;
      rows.push({grade:grade,packageNo:packageNo,packingType:packingType,gw:gw||round2(nw+tare),tare:tare,nw:nw||round2(gw-tare),weight:nw||round2(gw-tare),packageCount:1,memo:''});
    }
    return rows;
  }
  function parseOrderLines(lines){
    var source=(lines||[]).map(normalizeText).filter(Boolean),joined=source.join('\n'),header=source.find(function(x){return /(?:Q.?TY|QUANTITY|WEIGHT|중량)/i.test(x)&&/(?:PRICE|UNIT\s*PRICE|단가)/i.test(x);})||'';
    var quantityFirst=!header||header.search(/Q.?TY|QUANTITY|WEIGHT|중량/i)<=header.search(/PRICE|UNIT\s*PRICE|단가/i);
    var qUnit=headerUnit((header.match(/(?:Q.?TY|QUANTITY|WEIGHT|중량)[^|]{0,35}/i)||[])[0]||header,'KG');
    var pPart=(header.match(/(?:PRICE|UNIT\s*PRICE|단가)[^|]{0,40}/i)||[])[0]||header,pUnit=headerUnit(pPart,'KG');
    var currency=(joined.match(/\b(?:USD|US\$|KRW|EUR|JPY)\b/i)||['USD'])[0].toUpperCase().replace('US$','USD'),rows=[];
    source.forEach(function(line){
      if(/\b(?:TOTAL|SUBTOTAL|GRAND\s*TOTAL|합계|소계)\b/i.test(line)||/(?:Q.?TY|QUANTITY|PRICE|AMOUNT).*(?:Q.?TY|QUANTITY|PRICE|AMOUNT)/i.test(line))return;
      var explicitQty=line.match(/(-?\d[\d,]*(?:\.\d+)?)\s*(KGS?|KILOGRAMS?|LBS?|POUNDS?|MT|M\/T|TONS?|TONNES?|TON)\b/i);
      var explicitPrice=line.match(/(?:USD|US\$|\$|KRW|EUR|JPY)\s*([\d,]+(?:\.\d+)?)\s*(?:\/|PER\s+)(KGS?|LBS?|POUNDS?|MT|M\/T|TONS?|TONNES?|TON)\b/i)||line.match(/([\d,]+(?:\.\d+)?)\s*(?:USD|US\$|\$|KRW|EUR|JPY)\s*(?:\/|PER\s+)(KGS?|LBS?|POUNDS?|MT|M\/T|TONS?|TONNES?|TON)\b/i);
      if(explicitQty&&explicitPrice){
        var before=line.slice(0,explicitQty.index).replace(/^\s*\d+[.)-]?\s*/,'').trim();
        if(validGrade(before))rows.push({grade:before,weight:weightToKg(explicitQty[1],explicitQty[2]),unitPrice:priceToKg(explicitPrice[1],explicitPrice[2]),currency:currency,packageCount:1});
        return;
      }
      var m=line.match(/^\s*\d+[.)-]?\s+(.+?)\s+(-?\d[\d,]*(?:\.\d+)?)\s+(-?\d[\d,]*(?:\.\d+)?)(?:\s+(-?\d[\d,]*(?:\.\d+)?))?\s*$/);
      if(!m)return;
      var grade=normalizeText(m[1]),first=cleanNumber(m[2]),second=cleanNumber(m[3]),amount=cleanNumber(m[4]);
      if(!validGrade(grade))return;
      var qty=quantityFirst?first:second,price=quantityFirst?second:first,weight=weightToKg(qty,qUnit),unitPrice=priceToKg(price,pUnit);
      if(amount>0&&weight>0&&(!unitPrice||Math.abs(weight*unitPrice-amount)>Math.max(5,amount*.35)))unitPrice=round2(amount/weight);
      rows.push({grade:grade,weight:weight,unitPrice:unitPrice,currency:currency,amount:amount||round2(weight*unitPrice),packageCount:1});
    });
    return rows;
  }
  function parseOrderMatrix(matrix){
    var hi=findHeaderRow(matrix,'order');if(hi<0)return[];
    var rawHeaders=matrix[hi].map(normalizeText),headers=rawHeaders.map(normalizeHeader);
    var gradeCol=columnIndex(headers,[/DESCRIPTION|COMMODITY|GRADE|MARKING|강종/]);
    var qtyCol=columnIndex(headers,[/QUANTITY|QTY|WEIGHT|중량/]);
    var priceCol=columnIndex(headers,[/UNITPRICE|PRICE|단가/]);
    var amountCol=columnIndex(headers,[/AMOUNT|TOTALVALUE|VALUE|금액|합계/]);
    var qUnit=headerUnit(rawHeaders[qtyCol]||'KG','KG'),pUnit=headerUnit(rawHeaders[priceCol]||'KG','KG'),rows=[];
    for(var r=hi+1;r<matrix.length;r++){
      var row=matrix[r]||[],grade=normalizeText(row[gradeCol]);if(!validGrade(grade))continue;
      var weight=weightToKg(row[qtyCol],qUnit),unitPrice=priceToKg(row[priceCol],pUnit),amount=cleanNumber(row[amountCol]);
      if(weight<=0)continue;if(amount>0&&unitPrice<=0)unitPrice=round2(amount/weight);
      rows.push({grade:grade,weight:weight,unitPrice:unitPrice,amount:amount||round2(weight*unitPrice),packageCount:1});
    }
    return rows;
  }
  async function workbookMatrices(file){
    await mesEnsureXlsx();
    var wb=XLSX.read(await file.arrayBuffer(),{type:'array'});
    return wb.SheetNames.map(function(name){return XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:'',raw:true});});
  }
  async function parsePackingFile(file){
    if(/\.xlsx?$/i.test(file.name)){var matrices=await workbookMatrices(file),rows=[];matrices.forEach(function(m){rows=rows.concat(parsePackingMatrix(m));});return{rows:rows};}
    var lines=/\.pdf$/i.test(file.name)?await mesPdfLines(file):await mesImageLines(file);
    return{rows:parsePackingLines(lines),lines:lines};
  }
  async function parseOrderFile(file){
    if(/\.xlsx?$/i.test(file.name)){var matrices=await workbookMatrices(file),rows=[];matrices.forEach(function(m){rows=rows.concat(parseOrderMatrix(m));});return{poNo:'',company:'',rows:rows};}
    var lines=/\.pdf$/i.test(file.name)?await mesPdfLines(file):await mesImageLines(file),rows=parseOrderLines(lines);
    return{poNo:mesDocNo(lines,file.name),company:mesDocCompany(lines),rows:rows,currency:rows[0]&&rows[0].currency||'USD'};
  }

  window.__mesPackingPriceFixV1={parsePackingLines:parsePackingLines,parsePackingMatrix:parsePackingMatrix,parseOrderLines:parseOrderLines,parseOrderMatrix:parseOrderMatrix,weightToKg:weightToKg,priceToKg:priceToKg};

  window.mesRegistrationLine=function(type){
    var isPo=type==='PO';
    return '<div class="line-editor registration-line"><div class="line-editor-head"><b>'+(isPo?'P.O 품목':'S.O 품목')+'</b><button type="button" class="btn danger" onclick="this.closest(\'.registration-line\').remove()">행 삭제</button></div><div class="form-grid">'
      +'<label>품종<input name="productType" placeholder="NI / TI / STS"></label><label>강종<input name="mainGrade" required></label><label>소강종<input name="subGrade"></label><label>상세강종<input name="detailGrade"></label>'
      +(isPo?'<label>거래처 강종<input name="sourceGrade" required></label><label>패키지 수<input name="packageCount" type="number" min="1" value="1"></label>':'')
      +'<label>'+(isPo?'총 중량':'요청 중량')+'(kg)<input name="weight" type="number" min="0.01" step="0.01" required></label><label>단가(통화/kg)<input name="unitPrice" type="number" min="0" step="0.01"></label></div></div>';
  };

  window.saveMesRegistration=async function(event,form,type){
    event.preventDefault();var v=formData(form),lines=Array.from(form.querySelectorAll('.registration-line')).map(mesLineData);
    if(!v.orderNo||!v.partner||!lines.length)return toast('번호·거래처와 한 개 이상의 품목을 입력하세요.',true);
    var createdAt=new Date().toISOString(),ok=false;
    if(type==='PO'){
      var next=mesNextPackage();ok=await commit('MES P.O 등록',['pos'],function(s){lines.forEach(function(line){var count=Math.max(1,Math.floor(num(line.packageCount))),each=round2(num(line.weight)/count),unitPrice=round2(line.unitPrice);for(var i=0;i<count;i++)s.pos.push({id:crypto.randomUUID(),poNo:v.orderNo,company:v.partner,packageNo:next(),grade:line.sourceGrade,productType:line.productType,mainGrade:line.mainGrade,subGrade:line.subGrade,detailGrade:line.detailGrade,weight:each,grossWeight:each,netWeight:each,unitPrice:unitPrice,purchaseUnitPrice:unitPrice,amount:round2(each*unitPrice),expectedArrivalDate:v.planDate,type:v.kind,currency:v.currency,exchangeRate:num(v.rate)||1,purchaseStatus:'구매확정',status:'CONFIRMED',receiptStatus:'WAITING',inspectionStatus:'NOT_RECEIVED',createdAt:createdAt,createdByName:currentUserName()});});});
    }else{
      ok=await commit('MES S.O 등록',['salesOrders'],function(s){lines.forEach(function(line){s.salesOrders.push({id:crypto.randomUUID(),soNo:v.orderNo,customer:v.partner,shipDate:v.planDate,packingListType:v.kind==='OVERSEAS'?'OVERSEAS':'DOMESTIC',currency:v.currency,exchangeRate:num(v.rate)||1,productType:line.productType,mainGrade:line.mainGrade,subGrade:line.subGrade,detailGrade:line.detailGrade,grade:[line.productType,line.mainGrade,line.subGrade,line.detailGrade].filter(Boolean).join(' · '),weight:round2(line.weight),unitPrice:round2(line.unitPrice),amount:round2(num(line.weight)*num(line.unitPrice)),status:'WAITING',createdAt:createdAt,createdByName:currentUserName()});});});
    }
    if(ok){closeModal();openView(type==='PO'?'purchase':'sales');toast((type==='PO'?'P.O':'S.O')+' 저장완료 · 구매/판매계획에 등록했습니다.');}
  };

  window.mesFillPoForm=function(parsed){
    window.openMesDirectPoRegistration();var form=$('modalBody').querySelector('form');if(!form)return;
    form.querySelector('[name=orderNo]').value=parsed.poNo||'';form.querySelector('[name=partner]').value=parsed.company||'';
    if(parsed.currency&&form.querySelector('[name=currency]'))form.querySelector('[name=currency]').value=parsed.currency;
    if(parsed.rate&&form.querySelector('[name=rate]'))form.querySelector('[name=rate]').value=parsed.rate;
    var holder=form.querySelector('.registration-lines');holder.innerHTML='';
    (parsed.rows.length?parsed.rows:[{grade:'',weight:'',packageCount:1}]).forEach(function(row){holder.insertAdjacentHTML('beforeend',mesRegistrationLine('PO'));var line=holder.lastElementChild;line.querySelector('[name=sourceGrade]').value=row.grade||'';line.querySelector('[name=mainGrade]').value=row.grade||'';line.querySelector('[name=weight]').value=row.weight||'';line.querySelector('[name=packageCount]').value=row.packageCount||1;line.querySelector('[name=unitPrice]').value=row.unitPrice||'';});
    $('modalTitle').textContent='P.O 자동완성 결과 · 중량·단가 확인 후 저장';holder.scrollIntoView({behavior:'smooth',block:'start'});toast('거래처 서류 분석 완료 · 중량과 단가를 확인한 뒤 저장하세요.');
  };
  window.mesAnalyzePoDocument=async function(file){
    if(!file)return;$('progress').classList.add('on');
    try{var parsed=await parseOrderFile(file);if(!parsed.rows.length)throw Error('강종·중량·단가 품목을 찾지 못했습니다.');mesFillPoForm(parsed);}catch(error){toast('서류 자동완성 실패: '+error.message,true);}finally{$('progress').classList.remove('on');setSync('공용 서버 연결됨');}
  };

  window.analyzePackingRequestFile=async function(poNo,file){
    if(!file)return;$('progress').classList.add('on');
    try{
      var parsed=await parsePackingFile(file),po=poRows().find(function(x){return x.poNo===poNo;}),defaults=requestDefaultItems(po);
      var items=parsed.rows.map(function(row,index){var base=defaults[index]||{};return{packageNo:row.packageNo||base.packageNo||'',grade:row.grade||base.grade||'',gw:round2(row.gw||row.weight),nw:round2(row.nw||row.weight),packingType:row.packingType||base.packingType||'',memo:row.memo||''};});
      if(!items.length)throw Error('Package No.·강종·G/W·N/W 행을 찾지 못했습니다.');renderPackingRequestForm(po,items);toast('PACKING LIST '+items.length+'개 패키지 자동완성 완료 · 내용을 확인하세요.');
    }catch(error){toast('PACKING LIST 자동완성 실패: '+error.message,true);}finally{$('progress').classList.remove('on');setSync('공용 서버 연결됨');}
  };

  window.mesEditLine=function(record,type){
    if(type==='PO')return '<div class="line-editor edit-line" data-id="'+esc(record.id)+'"><div class="form-grid"><label>거래처 강종<input name="grade" value="'+esc(record.grade||'')+'"></label><label>중량(kg)<input name="weight" type="number" step="0.01" value="'+num(record.weight)+'"></label><label>단가(통화/kg)<input name="unitPrice" type="number" step="0.01" value="'+round2(record.unitPrice||record.purchaseUnitPrice)+'"></label><label>입고상태<select name="receiptStatus"><option '+(record.receiptStatus==='WAITING'?'selected':'')+'>WAITING</option><option '+(record.receiptStatus==='RECEIVED'?'selected':'')+'>RECEIVED</option></select></label><label>검수상태<select name="inspectionStatus"><option '+(record.inspectionStatus==='WAITING'?'selected':'')+'>WAITING</option><option '+(record.inspectionStatus==='IN_PROGRESS'?'selected':'')+'>IN_PROGRESS</option><option '+(record.inspectionStatus==='COMPLETE'?'selected':'')+'>COMPLETE</option></select></label></div></div>';
    return '<div class="line-editor edit-line" data-id="'+esc(record.id)+'"><div class="form-grid"><label>품종<input name="productType" value="'+esc(record.productType||'')+'"></label><label>강종<input name="mainGrade" value="'+esc(record.mainGrade||record.grade||'')+'"></label><label>소강종<input name="subGrade" value="'+esc(record.subGrade||'')+'"></label><label>상세강종<input name="detailGrade" value="'+esc(record.detailGrade||'')+'"></label><label>중량(kg)<input name="weight" type="number" step="0.01" value="'+num(record.weight)+'"></label><label>상태<select name="status"><option '+(record.status==='WAITING'?'selected':'')+'>WAITING</option><option '+(record.status==='READY'?'selected':'')+'>READY</option><option '+(record.status==='FINAL'?'selected':'')+'>FINAL</option><option '+(record.status==='SHIPPED'?'selected':'')+'>SHIPPED</option></select></label></div></div>';
  };
  var originalShowMesDetailEditor=window.showMesDetailEditor;
  window.showMesDetailEditor=function(){
    var view=mesCurrentDetail.view,id=mesCurrentDetail.id,row=mesRow(view,id);if(!row)return;
    if(['purchase','settlement'].includes(view)){
      var rows=row.rows||safe(state.pos).filter(function(x){return x.poNo===row.poNo;});
      $('modalBody').innerHTML='<form class="form-grid" onsubmit="saveMesDetail(event,this)"><label>P.O 번호<input name="poNo" value="'+esc(row.poNo)+'"></label><label>거래처<input name="company" value="'+esc(row.company)+'"></label><label>입고예정일<input name="expected" type="date" value="'+(date(row.expected)==='-'?'':date(row.expected))+'"></label><label>통화<select name="currency"><option '+(row.currency==='KRW'?'selected':'')+'>KRW</option><option '+(row.currency!=='KRW'?'selected':'')+'>USD</option></select></label><label>환율<input name="rate" type="number" step="0.01" value="'+(num(row.rate)||1)+'"></label><label>세틀상태<select name="settlementStatus"><option>미완료</option><option '+(row.rows&&row.rows[0]&&row.rows[0].settlementStatus==='검토중'?'selected':'')+'>검토중</option><option '+(row.rows&&row.rows[0]&&row.rows[0].settlementStatus==='완료'?'selected':'')+'>완료</option></select></label><div class="registration-lines"><h3>사내입고 품목 · 단가 수정 가능</h3>'+rows.map(function(x){return mesEditLine(x,'PO');}).join('')+'</div><div class="wide actions"><button class="btn primary">환율·단가 포함 수정 저장</button><button type="button" class="btn" onclick="openMesDetail(\''+view+'\',\''+esc(id)+'\')">취소</button></div></form>';
      return;
    }
    return originalShowMesDetailEditor.apply(this,arguments);
  };
  var originalSaveMesDetail=window.saveMesDetail;
  window.saveMesDetail=async function(event,form){
    var view=mesCurrentDetail.view,id=mesCurrentDetail.id;
    if(!['purchase','settlement'].includes(view))return originalSaveMesDetail.apply(this,arguments);
    event.preventDefault();var v=formData(form),ok=await commit('P.O 상세 환율·단가 수정',['pos'],function(s){form.querySelectorAll('.edit-line').forEach(function(line){var x=s.pos.find(function(p){return p.id===line.dataset.id;});if(!x)return;var d=mesLineData(line),unitPrice=round2(d.unitPrice),weight=round2(d.weight);Object.assign(x,{poNo:v.poNo,company:v.company,expectedArrivalDate:v.expected,currency:v.currency,exchangeRate:num(v.rate)||1,grade:d.grade,weight:weight,grossWeight:x.grossWeight||weight,netWeight:x.netWeight||weight,unitPrice:unitPrice,purchaseUnitPrice:unitPrice,amount:round2(weight*unitPrice),receiptStatus:d.receiptStatus,inspectionStatus:d.inspectionStatus,settlementStatus:v.settlementStatus,updatedAt:new Date().toISOString(),updatedByName:currentUserName()});});});
    if(ok){openMesDetail(view,v.poNo);toast('환율과 품목별 단가까지 수정 저장했습니다.');}
  };
  window.mesPurchaseDetail=function(row){
    var rows=row.rows||safe(state.pos).filter(function(x){return x.poNo===row.poNo&&x.status!=='CANCELLED';});
    return mesSection('구매 계약 세부내역',[['P.O',function(x){return x.poNo;}],['거래처',function(x){return x.company;}],['거래처 강종',function(x){return x.grade;}],['패키지',function(x){return x.packageNo;}],['계약중량',function(x){return fmt(x.weight);}],['단가('+esc(row.currency||'USD')+'/kg)',function(x){return fmt(x.unitPrice||x.purchaseUnitPrice);}],['통화',function(x){return x.currency||row.currency;}],['환율',function(x){return fmt(x.exchangeRate||row.rate);}],['금액',function(x){return fmt(x.amount||num(x.weight)*num(x.unitPrice||x.purchaseUnitPrice));}],['입고예정일',function(x){return date(x.expectedArrivalDate||x.arrivalDate);}],['구매상태',function(x){return x.purchaseStatus||x.status;}]],rows);
  };

  /*
   * 입고현황은 P.O 원본이 아니라 PACKING LIST가 확정된 입고요청을 기준으로 만든다.
   * 업무수행 0번에서 확정한 국내입고는 purchaseRequests 없이 P.O가 생성되므로
   * domesticReceipt 표식이 있는 자료도 같은 목록에 포함한다.
   */
  function validPackingRequest(request){
    return request&&request.status!=='CANCELLED'&&safe(request.items).some(function(item){
      return normalizeText(item.grade)&&cleanNumber(item.gw||item.nw||item.weight)>0;
    });
  }
  function confirmedDomesticPoSet(){
    return new Set(safe(state.domesticReceipts).filter(function(receipt){
      return receipt.status==='CONFIRMED'&&receipt.poNo;
    }).map(function(receipt){return receipt.poNo;}));
  }
  function requestSourcePos(request,item,index,used){
    var candidates=safe(state.pos).filter(function(pos){return pos.status!=='CANCELLED'&&pos.poNo===request.poNo;});
    var packageNo=normalizeText(item.packageNo).toLowerCase(),match=candidates.find(function(pos){
      return !used.has(pos.id)&&packageNo&&normalizeText(pos.packageNo).toLowerCase()===packageNo;
    });
    if(!match){
      var grade=normalizeText(item.grade).toLowerCase();
      match=candidates.find(function(pos){return !used.has(pos.id)&&normalizeText(pos.grade).toLowerCase()===grade;});
    }
    if(!match)match=candidates.find(function(pos){return !used.has(pos.id);})||candidates[index]||null;
    if(match)used.add(match.id);
    return match;
  }
  function requestedInboundRows(){
    var rows=[],usedPos=new Set(),domesticPos=new Set(),domesticPo=confirmedDomesticPoSet();
    safe(state.purchaseRequests).filter(validPackingRequest).forEach(function(request){
      safe(request.items).forEach(function(item,index){
        if(!normalizeText(item.grade)||cleanNumber(item.gw||item.nw||item.weight)<=0)return;
        var source=requestSourcePos(request,item,index,usedPos),nw=round2(item.nw||item.weight||item.gw),gw=round2(item.gw||item.weight||item.nw);
        rows.push({
          id:source&&source.id||('request:'+request.id+':'+index),
          sourcePosId:source&&source.id||'',requestId:request.id,requestNo:request.requestNo||'',
          packageNo:item.packageNo||source&&source.packageNo||((request.requestNo||request.poNo)+'-'+(index+1)),
          poNo:request.poNo,company:request.company||source&&source.company||'',grade:item.grade||source&&source.grade||'',
          planWeight:nw,receivedWeight:source&&source.receivedAt?round2(source.netWeight||source.weight||nw):0,
          grossWeight:gw,receivedAt:source&&source.receivedAt||'',status:source&&source.receiptStatus||'WAITING',
          inspection:source&&source.inspectionStatus||'NOT_RECEIVED',memo:item.memo||source&&source.receiptMemo||'',
          requestDate:request.requestDate||'',savedAt:request.updatedAt||request.createdAt||'',sourceType:'PACKING_LIST'
        });
      });
    });
    safe(state.pos).filter(function(pos){
      return pos.status!=='CANCELLED'&&(pos.domesticReceipt===true||pos.domesticReceiptId||domesticPo.has(pos.poNo));
    }).forEach(function(pos){
      if(usedPos.has(pos.id)||domesticPos.has(pos.id))return;domesticPos.add(pos.id);
      rows.push({id:pos.id,sourcePosId:pos.id,packageNo:pos.packageNo,poNo:pos.poNo,company:pos.company,grade:pos.grade,
        planWeight:round2(pos.netWeight||pos.weight),receivedWeight:round2(pos.netWeight||pos.weight),grossWeight:round2(pos.grossWeight||pos.weight),
        receivedAt:pos.receivedAt,status:pos.receiptStatus||'RECEIVED',inspection:pos.inspectionStatus||'WAITING',memo:pos.receiptMemo||pos.packageMemo||'',
        requestDate:pos.receivedAt||pos.createdAt||'',savedAt:pos.receivedAt||pos.createdAt||'',sourceType:'FORCE_DOMESTIC'});
    });
    return rows.sort(function(a,b){return String(b.requestDate||b.savedAt||'').localeCompare(String(a.requestDate||a.savedAt||''));});
  }
  window.__mesPackingPriceFixV1.validPackingRequest=validPackingRequest;
  window.__mesPackingPriceFixV1.requestedInboundRows=requestedInboundRows;
  window.inboundRows=requestedInboundRows;
  try{inboundRows=requestedInboundRows;}catch(_){/* 전역 함수 바인딩이 읽기 전용인 환경 */}
  if(typeof schemas!=='undefined'&&schemas.inbound){
    schemas.inbound.title='입고현황 · PACKING LIST 등록자료';
    schemas.inbound.rows=requestedInboundRows;
    schemas.inbound.cols=[
      ['입고구분',function(row){return row.sourceType==='FORCE_DOMESTIC'?'강제입고':'입고요청';}],
      ['요청번호',function(row){return row.requestNo||'-';}],
      ['P.O',function(row){return row.poNo||'-';}],
      ['사내입고번호',function(row){return row.packageNo||'-';},'link'],
      ['공급사',function(row){return row.company||'-';},'left'],
      ['강종',function(row){return row.grade||'-';},'left'],
      ['PACKING N/W(kg)',function(row){return fmt(row.planWeight);}],
      ['입고 N/W(kg)',function(row){return fmt(row.receivedWeight);}],
      ['입고일',function(row){return date(row.receivedAt);}],
      ['입고상태',function(row){return status(row.status);}],
      ['검수상태',function(row){return status(row.inspection);}],
      ['자료저장일',function(row){return dt(row.savedAt||row.requestDate);}]
    ];
  }
  window.openForceInboundRegistration=function(){
    var target='./stable-inspection-mobile-v4.html?forceInbound=1#domesticReceipt';
    window.location.href=target;
  };
  function decorateInboundPackingGate(){
    if(typeof currentView==='undefined'||currentView!=='inbound')return;
    var content=document.getElementById('content'),head=content&&content.querySelector('.dashboard-head'),actions=head&&head.querySelector('.actions');
    if(!head||!actions)return;
    var paragraph=head.querySelector('p');
    if(paragraph)paragraph.textContent='PACKING LIST가 저장된 입고요청과 업무수행 0번 강제입고만 표시합니다.';
    if(!document.getElementById('mesForceInboundButton'))actions.insertAdjacentHTML('afterbegin','<button id="mesForceInboundButton" class="btn primary" onclick="openForceInboundRegistration()">＋ 강제 입고등록</button>');
    if(!document.getElementById('mesInboundPackingNotice'))head.insertAdjacentHTML('afterend','<div id="mesInboundPackingNotice" class="detail-banner" style="margin:0 0 16px"><h2>입고현황 표시 기준</h2><p>① P.O의 PACKING LIST를 입고요청으로 저장한 패키지 ② 업무수행 0번에서 P.O 없이 확정한 강제입고만 표시됩니다.</p></div>');
  }
  var renderBeforeInboundPackingGate=window.render;
  if(typeof renderBeforeInboundPackingGate==='function'){
    window.render=function(){var value=renderBeforeInboundPackingGate.apply(this,arguments);decorateInboundPackingGate();requestAnimationFrame(decorateInboundPackingGate);return value;};
    try{render=window.render;}catch(_){/* 전역 함수 바인딩 호환 */}
  }
  var inboundDetailBeforePackingGate=window.mesInboundDetail;
  window.mesInboundDetail=function(row){
    var source=safe(state.pos).find(function(pos){return pos.id===(row.sourcePosId||row.id);});
    if(source&&typeof inboundDetailBeforePackingGate==='function')return inboundDetailBeforePackingGate(Object.assign({},row,{id:source.id}));
    var request=safe(state.purchaseRequests).find(function(item){return item.id===row.requestId;});
    return mesSection('PACKING LIST 입고요청',[['요청번호',function(){return row.requestNo||'-';}],['P.O',function(){return row.poNo;}],['Package No.',function(){return row.packageNo;}],['거래처',function(){return row.company;}],['강종',function(){return row.grade;}],['G/W',function(){return fmt(row.grossWeight);}],['N/W',function(){return fmt(row.planWeight);}],['요청일',function(){return date(row.requestDate);}],['작업자',function(){return request&&request.operatorName||'-';}]],[row]);
  };
  document.documentElement.dataset.mesPackingPriceFixV1='ready';
})();

