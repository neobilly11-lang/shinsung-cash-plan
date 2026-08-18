(function(){
  'use strict';
  var root=window,doc=document;
  function txt(v){return String(v==null?'':v).trim()}
  function num(v){var n=Number(String(v==null?'':v).replace(/,/g,''));return Number.isFinite(n)?n:0}
  function fmt(v,d){return num(v).toLocaleString('en-US',{maximumFractionDigits:d==null?2:d})}
  function safe(v){return Array.isArray(v)?v:[]}
  function date(v){if(!v)return'';var d=new Date(v);return Number.isNaN(d.getTime())?txt(v):d.toISOString().slice(0,10)}
  function currentState(){try{return root.__mesRuntime&&root.__mesRuntime.getState?root.__mesRuntime.getState():root.state||{}}catch(_){return root.state||{}}}
  function fieldDetail(poNo){try{return typeof root.settlementPoDetail==='function'?root.settlementPoDetail(poNo):null}catch(_){return null}}
  function rowValue(r,kind,i){
    r=r||{};var description=kind==='actual'?(r.description||r.finalGrade||[r.productType,r.mainGrade||r.grade,r.subGrade,r.detailGrade].filter(Boolean).join(' ')):(r.description||r.sourceGrade||r.customerGrade||r.grade||'');
    return{no:i+1,description:txt(description),sourceGrade:txt(r.sourceGrade||r.customerGrade||r.grade),weight:num(r.weight||r.confirmedWeight||r.nw||r.planWeight),price:num(r.price||r.unitPrice),amount:num(r.amount)||(num(r.weight||r.confirmedWeight||r.nw||r.planWeight)*num(r.price||r.unitPrice)),remark:txt(r.remark||r.memo||r.anomalyMemo),hasAnomaly:!!(r.hasAnomaly||r.anomalyPhoto||r.abnormalPhoto),packageNo:txt(r.packageNo||r.internalNo)}
  }
  function sum(rows,key){return safe(rows).reduce(function(total,row){return total+num(row[key])},0)}
  function mesDetail(poNo,pre){
    var st=currentState(),pos=safe(st.pos).filter(function(x){return txt(x.poNo)===txt(poNo)&&txt(x.status)!=='CANCELLED'}),po=pos[0]||{},settlements=safe(st.preSettlements).filter(function(x){return txt(x.poNo)===txt(poNo)&&txt(x.status)!=='CANCELLED'});
    var originalRows=pos.map(function(p,i){return rowValue(p,'original',i)}),actualRows=(pre?settlements:[]).map(function(r,i){var source=pos.find(function(p){return txt(p.id)===txt(r.sourceId)||txt(p.packageNo)===txt(r.packageNo)})||{};return rowValue(Object.assign({},source,r),'actual',i)});
    if(!actualRows.length)actualRows=originalRows.map(function(r,i){return rowValue(r,'actual',i)});
    return{poNo:poNo,company:txt(po.company||po.supplier),address:txt(po.address||po.supplierAddress),phone:txt(po.phone||po.tel),fax:txt(po.fax),receiptDate:date(po.receivedAt||po.receiptDate||po.createdAt||new Date()),date:date(new Date()),invoiceNo:txt(po.invoiceNo||poNo),originalRows:originalRows,actualRows:actualRows,inputAmount:sum(originalRows,'amount'),actualAmount:sum(actualRows,'amount'),provisionalAmount:sum(actualRows,'amount')*.9,balance:sum(actualRows,'amount')*.1,operatorName:txt(po.operatorName||po.workerName),isPre:!!pre};
  }
  function detail(poNo,pre){
    var d=!pre&&fieldDetail(poNo);if(!d)return mesDetail(poNo,pre);
    var originals=safe(d.originalRows||d.invoiceRows||d.sourceRows).map(function(r,i){return rowValue(r,'original',i)}),actuals=safe(d.actualRows||d.finalRows||d.items||d.rows).map(function(r,i){return rowValue(r,'actual',i)});
    if(!originals.length)originals=actuals.map(function(r,i){return rowValue(r,'original',i)});
    return{poNo:txt(d.poNo||poNo),company:txt(d.company||safe(d.companies)[0]),address:txt(d.address),phone:txt(d.phone||d.tel),fax:txt(d.fax),receiptDate:date(d.receiptDate||d.receivedAt),date:date(d.date||new Date()),invoiceNo:txt(d.invoiceNo||d.poNo||poNo),originalRows:originals,actualRows:actuals,inputAmount:num(d.inputAmount)||sum(originals,'amount'),actualAmount:num(d.actualAmount)||sum(actuals,'amount'),provisionalAmount:num(d.provisionalAmount)||(sum(actuals,'amount')*.9),balance:num(d.balance)||(sum(actuals,'amount')-num(d.provisionalAmount||sum(actuals,'amount')*.9)),operatorName:txt(d.approver||d.operatorName),isPre:false};
  }
  function canvas(w,h){var c=doc.createElement('canvas');c.width=w;c.height=h;var x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,w,h);x.lineWidth=2;x.strokeStyle='#111';x.fillStyle='#111';x.textBaseline='middle';return[c,x]}
  function line(x,x1,y1,x2,y2,w){x.lineWidth=w||2;x.beginPath();x.moveTo(x1,y1);x.lineTo(x2,y2);x.stroke()}
  function rect(x,x1,y1,w,h,fill){if(fill){x.fillStyle=fill;x.fillRect(x1,y1,w,h);x.fillStyle='#111'}x.strokeRect(x1,y1,w,h)}
  function fitText(x,text,x1,y,w,h,opt){
    opt=opt||{};var size=opt.size||24,min=opt.min||9,weight=opt.bold?'700 ':'',family=opt.family||'Arial, "Malgun Gothic", sans-serif',s=txt(text),align=opt.align||'center';x.textAlign=align;
    while(size>min){x.font=weight+size+'px '+family;if(x.measureText(s).width<=w-10)break;size--}
    x.fillStyle=opt.color||'#111';var px=x1+(align==='left'?5:align==='right'?w-5:w/2);
    if(opt.wrap){var words=s.split(/\s+/),lines=[],row='';words.forEach(function(word){var next=row?row+' '+word:word;if(x.measureText(next).width>w-10&&row){lines.push(row);row=word}else row=next});if(row)lines.push(row);lines.slice(0,opt.maxLines||2).forEach(function(t,i){x.fillText(t,px,y+h/2+(i-(Math.min(lines.length,opt.maxLines||2)-1)/2)*(size+3))})}else x.fillText(s,px,y+h/2);x.fillStyle='#111';
  }
  function cell(x,value,x1,y,w,h,opt){rect(x,x1,y,w,h,opt&&opt.fill);fitText(x,value,x1,y,w,h,opt)}
  function domestic(d){
    var out=canvas(1600,1131),c=out[0],x=out[1],L=55,T=35,W=1490,leftW=520,gap=30,rightX=L+leftW+gap,rightW=W-leftW-gap;
    x.textAlign='left';x.font='700 34px "Malgun Gothic", Arial';x.fillText('(주) 신 성 금 속',L,T+28);x.font='700 18px Arial';x.fillText('www.shinsungmetal.net',L,T+59);
    x.font='17px "Malgun Gothic", Arial';x.fillText('경상남도 함안군 칠서면 공단동길 205-29',L,T+108);x.fillText('Tel : 055-582-1105   Fax : 055-582-1106',L,T+135);x.fillText('tax@shinsungmetal.net',L,T+162);
    var iy=T,iw=rightW,lab=105,rowH=38;[['상호',d.company],['주소',d.address],['Tel.',d.phone],['Fax.',d.fax],['P/O No.',d.poNo]].forEach(function(r,i){cell(x,r[0],rightX,iy+i*rowH,lab,rowH,{size:16,bold:true,fill:'#f1f1f1'});cell(x,r[1],rightX+lab,iy+i*rowH,iw-lab-(i===0?310:0),rowH,{size:17,align:'left'})});cell(x,'입고일',rightX+iw-310,iy,95,rowH,{size:15,bold:true,fill:'#f1f1f1'});cell(x,d.receiptDate||d.date,rightX+iw-215,iy,215,rowH,{size:16});
    var y=245,titleH=48;cell(x,'입  고  내  역',L,y,leftW,titleH,{size:24,bold:true,fill:'#e6f0eb'});fitText(x,'➜',L+leftW,y,gap,titleH,{size:30,bold:true,color:'#16816f'});cell(x,'정  산  내  역',rightX,y,rightW,titleH,{size:24,bold:true,fill:'#e6f0eb'});y+=titleH;
    var lc=[300,130,90],lh=['품목','무게(G/W)','비고'],rc=[330,110,110,135,205,50],rh=['품목','무게(N/W)','단가','Total','비고','사진'];
    lh.forEach(function(h,i){cell(x,h,L+lc.slice(0,i).reduce(function(s,v){return s+v},0),y,lc[i],42,{size:17,bold:true,fill:'#efefef'})});rh.forEach(function(h,i){cell(x,h,rightX+rc.slice(0,i).reduce(function(s,v){return s+v},0),y,rc[i],42,{size:17,bold:true,fill:'#efefef'})});y+=42;
    var count=18,rowHeight=31,originals=d.originalRows.slice(0,count),actuals=d.actualRows.slice(0,count);
    for(var i=0;i<count;i++){
      var a=originals[i]||{},b=actuals[i]||{},lv=[a.description||'',a.weight?fmt(a.weight):'',a.remark||''],rv=[b.description||'',b.weight?fmt(b.weight):'',b.price?fmt(b.price):'',b.amount?fmt(b.amount):'',b.remark||'',b.hasAnomaly?'Photo':''];
      lv.forEach(function(v,j){cell(x,v,L+lc.slice(0,j).reduce(function(s,n){return s+n},0),y,lc[j],rowHeight,{size:15,min:8,align:j===0||j===2?'left':'center'})});rv.forEach(function(v,j){cell(x,v,rightX+rc.slice(0,j).reduce(function(s,n){return s+n},0),y,rc[j],rowHeight,{size:j===5?11:15,min:7,align:j===0||j===4?'left':'center'})});y+=rowHeight;
    }
    var originalWeight=sum(d.originalRows,'weight'),actualWeight=sum(d.actualRows,'weight');cell(x,'Total',L,y,300,44,{size:18,bold:true,fill:'#efefef'});cell(x,fmt(originalWeight),L+300,y,130,44,{size:18,bold:true,fill:'#efefef'});cell(x,'',L+430,y,90,44,{fill:'#efefef'});cell(x,'Total',rightX,y,330,44,{size:18,bold:true,fill:'#efefef'});cell(x,fmt(actualWeight),rightX+330,y,110,44,{size:18,bold:true,fill:'#efefef'});cell(x,'',rightX+440,y,110,44,{fill:'#efefef'});cell(x,'Total :',rightX+550,y,135,44,{size:18,bold:true,fill:'#efefef'});cell(x,fmt(d.actualAmount),rightX+685,y,205,44,{size:18,bold:true,fill:'#efefef'});cell(x,'',rightX+890,y,50,44,{fill:'#efefef'});
    var summaryY=y-76;cell(x,'공급가액 :',rightX+550,summaryY,135,34,{size:15,bold:true});cell(x,fmt(d.actualAmount),rightX+685,summaryY,205,34,{size:15,align:'right'});cell(x,'부가세 :',rightX+550,summaryY+34,135,34,{size:15,bold:true});cell(x,'0',rightX+685,summaryY+34,205,34,{size:15,align:'right'});
    y+=72;fitText(x,'세금계산서 발행 요청일 : '+(d.date||''),L,y,650,82,{size:22,bold:true,align:'left'});fitText(x,'확인자 : '+(d.operatorName||''),rightX+450,y,450,28,{size:17,align:'left'});fitText(x,'Yours faithfully',rightX+450,y+30,450,26,{size:16,align:'left'});fitText(x,'신 성 금 속',rightX+450,y+58,450,26,{size:20,bold:true,align:'left'});
    return c;
  }
  function overseas(d){
    var out=canvas(1240,1754),c=out[0],x=out[1],L=45,T=34,W=1150,leftW=470,rightX=L+leftW,rightW=W-leftW;
    x.textAlign='left';x.font='700 32px Arial';x.fillText('SHIN SUNG METAL CO.,LTD',L,T+24);x.textAlign='right';x.font='700 50px Georgia';x.fillText(d.isPre?'Pre-Settlement Report':'Settlement Report',L+W,T+30);
    fitText(x,'Messrs.',L,T+82,130,38,{size:18,bold:true,align:'left'});fitText(x,d.company,L+130,T+82,570,38,{size:19,bold:true,align:'left'});fitText(x,'Date :',L+730,T+82,120,38,{size:18,bold:true,align:'left'});fitText(x,d.date,L+850,T+82,300,38,{size:18,align:'left'});fitText(x,'INVOICE No :',L+730,T+120,160,38,{size:17,bold:true,align:'left'});fitText(x,d.invoiceNo,L+890,T+120,260,38,{size:17,align:'left'});fitText(x,'P/O No :',L+730,T+158,160,38,{size:17,bold:true,align:'left'});fitText(x,d.poNo,L+890,T+158,260,38,{size:17,align:'left'});
    var y=T+230;cell(x,'Invoice Value',L,y,leftW,48,{size:22,bold:true,fill:'#e8f1ed'});cell(x,'Actual Value After Inspection',rightX,y,rightW,48,{size:22,bold:true,fill:'#e8f1ed'});y+=48;
    var lc=[205,90,75,100],lh=['Description','Weight(Kg)','Price(USD/Kg)','Amount(USD)'],rc=[250,80,75,100,135,40],rh=['Description','Weight(Kg)','Price(USD/Kg)','Amount(USD)','Remark','Photo'];
    lh.forEach(function(h,i){cell(x,h,L+lc.slice(0,i).reduce(function(s,v){return s+v},0),y,lc[i],54,{size:15,bold:true,fill:'#efefef',wrap:true})});rh.forEach(function(h,i){cell(x,h,rightX+rc.slice(0,i).reduce(function(s,v){return s+v},0),y,rc[i],54,{size:i===5?11:15,bold:true,fill:'#efefef',wrap:true})});y+=54;
    var count=31,rowHeight=27,originals=d.originalRows.slice(0,count),actuals=d.actualRows.slice(0,count);
    for(var i=0;i<count;i++){
      var a=originals[i]||{},b=actuals[i]||{},lv=[a.description||'',a.weight?fmt(a.weight):'',a.price?fmt(a.price):'',a.amount?fmt(a.amount):''],rv=[b.description||'',b.weight?fmt(b.weight):'',b.price?fmt(b.price):'',b.amount?fmt(b.amount):'',b.remark||'',b.hasAnomaly?'Photo':''];
      lv.forEach(function(v,j){cell(x,v,L+lc.slice(0,j).reduce(function(s,n){return s+n},0),y,lc[j],rowHeight,{size:14,min:7,align:j===0?'left':'center'})});rv.forEach(function(v,j){cell(x,v,rightX+rc.slice(0,j).reduce(function(s,n){return s+n},0),y,rc[j],rowHeight,{size:j===5?9:14,min:7,align:j===0||j===4?'left':'center'})});y+=rowHeight;
    }
    cell(x,'TOTAL',L,y,205,42,{size:17,bold:true,fill:'#eee'});cell(x,fmt(sum(d.originalRows,'weight')),L+205,y,90,42,{size:17,bold:true,fill:'#eee'});cell(x,'',L+295,y,75,42,{fill:'#eee'});cell(x,fmt(d.inputAmount),L+370,y,100,42,{size:17,bold:true,fill:'#eee'});cell(x,'TOTAL',rightX,y,250,42,{size:17,bold:true,fill:'#eee'});cell(x,fmt(sum(d.actualRows,'weight')),rightX+250,y,80,42,{size:17,bold:true,fill:'#eee'});cell(x,'',rightX+330,y,75,42,{fill:'#eee'});cell(x,fmt(d.actualAmount),rightX+405,y,100,42,{size:17,bold:true,fill:'#eee'});cell(x,'',rightX+505,y,135,42,{fill:'#eee'});cell(x,'',rightX+640,y,40,42,{fill:'#eee'});
    y+=68;var sx=rightX+195,sl=285,sv=200;[['Actual value',d.actualAmount],['Provisonal Payment ( 90% )',d.provisionalAmount],['Balance',d.balance]].forEach(function(row,i){cell(x,row[0],sx,y+i*42,sl,42,{size:16,bold:true,fill:'#f5f5f5'});cell(x,fmt(row[1]),sx+sl,y+i*42,sv,42,{size:17,bold:true,align:'right'})});
    y+=170;fitText(x,'SELLER',L,y,leftW,38,{size:18,bold:true,align:'left'});fitText(x,'BUYER',rightX,y,rightW,38,{size:18,bold:true,align:'left'});fitText(x,'SHIN SUNG METAL CO.,LTD',L,y+58,leftW,38,{size:18,bold:true,align:'left'});line(x,L,y+105,L+leftW-45,y+105,1);line(x,rightX,y+105,L+W,y+105,1);
    return c;
  }
  function makeCanvases(poNo,type,pre){var d=detail(poNo,pre),over=String(type).toUpperCase()==='OVERSEAS',pageSize=over?31:18,total=Math.max(1,Math.ceil(Math.max(d.originalRows.length,d.actualRows.length)/pageSize)),pages=[];for(var i=0;i<total;i++){var part=Object.assign({},d,{originalRows:d.originalRows.slice(i*pageSize,(i+1)*pageSize),actualRows:d.actualRows.slice(i*pageSize,(i+1)*pageSize)});pages.push(over?overseas(part):domestic(part))}return pages}
  function makeCanvas(poNo,type,pre){return makeCanvases(poNo,type,pre)[0]}
  async function pdfBlob(canvases,type){if(!root.PDFLib)throw new Error('PDF 엔진을 불러오지 못했습니다. 새로고침 후 다시 시도하세요.');var PDFDocument=root.PDFLib.PDFDocument,pdf=await PDFDocument.create(),land=String(type).toUpperCase()!=='OVERSEAS',list=Array.isArray(canvases)?canvases:[canvases];for(var i=0;i<list.length;i++){var page=pdf.addPage(land?[841.89,595.28]:[595.28,841.89]),png=await pdf.embedPng(list[i].toDataURL('image/png')),size=page.getSize();page.drawImage(png,{x:0,y:0,width:size.width,height:size.height})}return new Blob([await pdf.save()],{type:'application/pdf'})}
  function save(blob,name){var a=doc.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;doc.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},1000)}
  async function download(poNo,type,pre){var blob=await pdfBlob(makeCanvases(poNo,type,pre),type);save(blob,txt(poNo).replace(/[\\/:*?"<>|]+/g,'_')+'_'+(pre?'선세틀_':'')+(String(type).toUpperCase()==='OVERSEAS'?'해외':'국내')+'.pdf');return blob}
  async function share(poNo,type,pre){var blob=await pdfBlob(makeCanvases(poNo,type,pre),type),file=new File([blob],txt(poNo)+'_'+(pre?'선세틀_':'')+(String(type).toUpperCase()==='OVERSEAS'?'해외':'국내')+'.pdf',{type:'application/pdf'});if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({title:txt(poNo),text:'신성금속 '+(pre?'선세틀':'세틀먼트')+' 자료',files:[file]});return}save(blob,file.name);if(root.notify)root.notify('PDF 파일을 내려받았습니다. 카카오톡에서 파일을 첨부해 주세요.')}
  root.SettlementPdfV1={detail:detail,makeCanvas:makeCanvas,makeCanvases:makeCanvases,pdfBlob:pdfBlob,download:download,share:share};
  var current={poNo:'',type:'DOMESTIC'};
  function remember(poNo,type){if(poNo)current.poNo=txt(poNo);if(type)current.type=String(type).toUpperCase()==='OVERSEAS'?'OVERSEAS':'DOMESTIC';root.__settlementPdfCurrent=current}
  root.downloadSettlementPdf=function(poNo,type){remember(poNo,type);return download(current.poNo,current.type,false)};
  root.downloadCurrentSettlementPdf=function(){return download(current.poNo,current.type,false)};
  if(typeof root.openSettlementPreview==='function'){var openPreview=root.openSettlementPreview;root.openSettlementPreview=function(poNo,type){remember(poNo,type);return openPreview.apply(this,arguments)}}
  if(typeof root.setSettlementPreviewTemplate==='function'){var setTemplate=root.setSettlementPreviewTemplate;root.setSettlementPreviewTemplate=function(type){remember('',type);return setTemplate.apply(this,arguments)}}
  function decoratePreSettlement(){
    if(!root.__mesRuntime||typeof root.openPreSettlementDetail!=='function'||root.openPreSettlementDetail.__settlementTemplateV1)return;
    var original=root.openPreSettlementDetail,wrapped=function(poNo){original.apply(this,arguments);var body=doc.getElementById('modalBody');if(!body)return;var actions=body.querySelector('.actions');if(!actions)return;var selector=doc.createElement('select');selector.id='preSettlementPdfTemplate';selector.innerHTML='<option value="DOMESTIC">국내 선세틀 양식</option><option value="OVERSEAS">해외 Pre-Settlement</option>';actions.insertBefore(selector,actions.firstChild);actions.querySelectorAll('button').forEach(function(button){if(button.textContent.indexOf('PDF 다운로드')>=0)button.onclick=function(){download(poNo,selector.value,true)};if(button.textContent.indexOf('카카오톡')>=0)button.onclick=function(){share(poNo,selector.value,true)}})};
    wrapped.__settlementTemplateV1=true;root.openPreSettlementDetail=wrapped;
  }
  function decorate(){
    decoratePreSettlement();var title=doc.getElementById('settlementPreviewTitle');if(title){var match=txt(title.textContent).match(/^([^·]+)/);if(match)remember(match[1],/해외|Overseas/i.test(title.textContent)?'OVERSEAS':'DOMESTIC')}
    var actions=doc.getElementById('settlementPreviewActions');if(actions&&!actions.querySelector('.settlement-pdf-v1')){var btn=doc.createElement('button');btn.className='btn primary settlement-pdf-v1';btn.textContent='PDF 다운로드';btn.onclick=function(){root.downloadCurrentSettlementPdf()};actions.appendChild(btn)}
    doc.querySelectorAll('[data-settlement-po]').forEach(function(card){var a=card.querySelector('.settlement-actions');if(a&&!a.querySelector('.settlement-pdf-v1')){var b=doc.createElement('button');b.className='btn settlement-pdf-v1';b.textContent='PDF 다운로드';b.onclick=function(){var sel=card.querySelector('select');download(card.dataset.settlementPo,sel?sel.value:'DOMESTIC',false)};a.appendChild(b)}})
  }
  new MutationObserver(function(){decorate()}).observe(doc.documentElement,{childList:true,subtree:true});decorate();
})();
