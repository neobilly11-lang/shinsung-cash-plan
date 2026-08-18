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
  function mesDetail(poNo,pre){
    var st=currentState(),pos=safe(st.pos).filter(function(x){return txt(x.poNo)===txt(poNo)&&txt(x.status)!=='CANCELLED'}),splits=safe(st.splits).filter(function(x){return txt(x.poNo)===txt(poNo)&&txt(x.status)!=='CANCELLED'}),po=pos[0]||{},records=pre?safe(st.preSettlements).filter(function(x){return txt(x.poNo)===txt(poNo)&&txt(x.status)!=='CANCELLED'}):splits;
    var items=records.map(function(r,i){var source=pos.find(function(p){return txt(p.id)===txt(r.sourceId)||txt(p.packageNo)===txt(r.packageNo)})||{};return{no:i+1,packageNo:r.packageNo||source.packageNo||'',sourceGrade:r.sourceGrade||source.grade||source.customerGrade||'',finalGrade:[r.productType,r.mainGrade||r.finalGrade,r.subGrade,r.detailGrade].filter(Boolean).join(' '),weight:num(r.weight||r.confirmedWeight||r.nw),loss:num(r.lossWeight),remark:r.remark||r.memo||''}});
    if(!items.length)items=pos.map(function(p,i){return{no:i+1,packageNo:p.packageNo||'',sourceGrade:p.grade||p.customerGrade||'',finalGrade:p.grade||p.customerGrade||'',weight:num(p.nw||p.weight||p.planWeight),loss:0,remark:p.remark||p.memo||''}});
    return{poNo:poNo,company:po.company||po.supplier||'',date:date(po.receivedAt||po.createdAt||new Date()),invoiceNo:po.invoiceNo||poNo,items:items,totalWeight:items.reduce(function(s,x){return s+num(x.weight)},0),operatorName:items[0]&&items[0].operatorName||'',isPre:!!pre};
  }
  function detail(poNo,pre){var d=!pre&&fieldDetail(poNo);if(d){var rows=safe(d.finalRows||d.items||d.rows).map(function(r,i){return{no:i+1,packageNo:r.packageNo||r.internalNo||'',sourceGrade:r.sourceGrade||r.customerGrade||r.grade||'',finalGrade:r.finalGrade||[r.productType,r.mainGrade,r.subGrade,r.detailGrade].filter(Boolean).join(' '),weight:num(r.weight||r.confirmedWeight||r.nw),loss:num(r.lossWeight||r.loss),remark:r.remark||r.memo||r.anomalyMemo||''}});return{poNo:d.poNo||poNo,company:d.company||safe(d.companies)[0]||'',date:date(d.date||d.receivedAt||new Date()),invoiceNo:d.invoiceNo||d.poNo||poNo,items:rows,totalWeight:rows.reduce(function(s,x){return s+num(x.weight)},0),operatorName:d.approver||d.operatorName||'',isPre:false}}return mesDetail(poNo,pre)}
  function canvas(w,h){var c=doc.createElement('canvas');c.width=w;c.height=h;var x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,w,h);x.lineWidth=2;x.strokeStyle='#111';x.fillStyle='#111';x.textBaseline='middle';return[c,x]}
  function line(x,x1,y1,x2,y2,w){x.lineWidth=w||2;x.beginPath();x.moveTo(x1,y1);x.lineTo(x2,y2);x.stroke()}
  function rect(x,x1,y1,w,h,fill){if(fill){x.fillStyle=fill;x.fillRect(x1,y1,w,h);x.fillStyle='#111'}x.strokeRect(x1,y1,w,h)}
  function fitText(x,text,x1,y,w,h,opt){opt=opt||{};var size=opt.size||24,min=opt.min||10,weight=opt.bold?'700 ':'',family=opt.family||'Arial, "Malgun Gothic", sans-serif',s=txt(text);x.textAlign=opt.align||'center';while(size>min){x.font=weight+size+'px '+family;if(x.measureText(s).width<=w-12)break;size--}x.fillStyle=opt.color||'#111';if(opt.wrap){var words=s.split(/\s+/),lines=[],row='';words.forEach(function(word){var next=row?row+' '+word:word;if(x.measureText(next).width>w-12&&row){lines.push(row);row=word}else row=next});if(row)lines.push(row);lines.slice(0,opt.maxLines||3).forEach(function(t,i){x.fillText(t,x1+(opt.align==='left'?6:w/2),y+h/2+(i-(Math.min(lines.length,opt.maxLines||3)-1)/2)*(size+4))})}else{x.fillText(s,x1+(opt.align==='left'?6:w/2),y+h/2)}x.fillStyle='#111'}
  function domestic(detail){
    var out=canvas(1600,1131),c=out[0],x=out[1],L=60,T=45,W=1480;
    x.font='700 34px Arial';x.textAlign='left';x.fillText('SHINSUNG METAL CO., LTD.',L,T+24);x.font='19px Arial';x.fillText('SETTLEMENT REPORT',L,T+62);
    fitText(x,'DOMESTIC SETTLEMENT',870,T,650,55,{size:34,bold:true});
    rect(x,L,T+88,W,130);line(x,820,T+88,820,T+218);line(x,1190,T+88,1190,T+218);line(x,L,T+153,L+W,T+153);
    fitText(x,'Customer / 거래처',L,T+88,210,65,{size:20,bold:true});fitText(x,detail.company,L+210,T+88,550,65,{size:22,bold:true});fitText(x,'P.O',820,T+88,110,65,{size:20,bold:true});fitText(x,detail.poNo,930,T+88,260,65,{size:22});fitText(x,'Date',1190,T+88,100,65,{size:20,bold:true});fitText(x,detail.date,1290,T+88,250,65,{size:22});
    fitText(x,'Invoice / 입고',L,T+153,210,65,{size:20,bold:true});fitText(x,detail.invoiceNo,L+210,T+153,550,65,{size:22});fitText(x,'Type',820,T+153,110,65,{size:20,bold:true});fitText(x,detail.isPre?'PRE-SETTLEMENT':'FINAL',930,T+153,260,65,{size:22});fitText(x,'Unit',1190,T+153,100,65,{size:20,bold:true});fitText(x,'KG',1290,T+153,250,65,{size:22});
    var y=T+248,cols=[70,210,320,320,170,300],headers=['No.','Package No.','Original Grade','Final Grade','Weight (kg)','Remark'];
    headers.forEach(function(h,i){var xx=L+cols.slice(0,i).reduce(function(s,v){return s+v},0);rect(x,xx,y,cols[i],55,'#e7e7e7');fitText(x,h,xx,y,cols[i],55,{size:19,bold:true})});y+=55;
    var rows=detail.items.slice(0,18);while(rows.length<18)rows.push({});
    rows.forEach(function(r,i){var vals=[r.no||'',r.packageNo||'',r.sourceGrade||'',r.finalGrade||'',r.weight?fmt(r.weight):'',r.remark||''];var rh=38;vals.forEach(function(v,j){var xx=L+cols.slice(0,j).reduce(function(s,n){return s+n},0);rect(x,xx,y,cols[j],rh);fitText(x,v,xx,y,cols[j],rh,{size:17,min:9,align:j===2||j===3||j===5?'left':'center'})});y+=rh});
    var totalW=cols.slice(0,4).reduce(function(s,v){return s+v},0);rect(x,L,y,totalW,48,'#efefef');fitText(x,'TOTAL',L,y,totalW,48,{size:20,bold:true});rect(x,L+totalW,y,cols[4],48,'#efefef');fitText(x,fmt(detail.totalWeight),L+totalW,y,cols[4],48,{size:21,bold:true});rect(x,L+totalW+cols[4],y,cols[5],48,'#efefef');
    y+=82;x.textAlign='left';x.font='18px Arial';x.fillText('Confirmed by / 승인: '+(detail.operatorName||''),L,y);x.fillText('SHINSUNG METAL CO., LTD.',1120,y);line(x,1110,y+28,1535,y+28,1);
    return c;
  }
  function overseas(detail){
    var out=canvas(1240,1754),c=out[0],x=out[1],L=55,T=38,W=1130;
    x.font='700 29px Arial';x.textAlign='left';x.fillText('SHINSUNG METAL CO., LTD.',L,T+20);x.textAlign='right';x.font='700 46px Georgia';x.fillText('SETTLEMENT REPORT',L+W,T+30);
    rect(x,L,T+74,W,160);line(x,L,T+126,L+W,T+126);line(x,L,T+180,L+W,T+180);line(x,810,T+74,810,T+234);
    fitText(x,'Messrs.',L,T+74,150,52,{size:19,bold:true});fitText(x,detail.company,L+150,T+74,605,52,{size:21,align:'left'});fitText(x,'Date',810,T+74,110,52,{size:19,bold:true});fitText(x,detail.date,920,T+74,265,52,{size:20});
    fitText(x,'Invoice No.',L,T+126,150,54,{size:19,bold:true});fitText(x,detail.invoiceNo,L+150,T+126,605,54,{size:20,align:'left'});fitText(x,'P/O No.',810,T+126,110,54,{size:19,bold:true});fitText(x,detail.poNo,920,T+126,265,54,{size:20});
    fitText(x,'Report Type',L,T+180,150,54,{size:19,bold:true});fitText(x,detail.isPre?'PRE-SETTLEMENT':'FINAL SETTLEMENT',L+150,T+180,605,54,{size:20,align:'left'});fitText(x,'Unit',810,T+180,110,54,{size:19,bold:true});fitText(x,'KG',920,T+180,265,54,{size:20});
    var y=T+270;fitText(x,'INVOICE VALUE',L,y,520,52,{size:23,bold:true});fitText(x,'ACTUAL VALUE AFTER INSPECTION',L+520,y,610,52,{size:23,bold:true});y+=52;
    var cols=[55,210,125,130,55,210,215,130],headers=['No.','Description','Package','Weight','No.','Original Grade','Final Grade','Weight'];
    headers.forEach(function(h,i){var xx=L+cols.slice(0,i).reduce(function(s,v){return s+v},0);rect(x,xx,y,cols[i],50,'#e9e9e9');fitText(x,h,xx,y,cols[i],50,{size:17,bold:true})});y+=50;
    var rows=detail.items.slice(0,28);while(rows.length<28)rows.push({});
    rows.forEach(function(r,i){var vals=[r.no||'',r.sourceGrade||'',r.packageNo||'',r.weight?fmt(r.weight):'',r.no||'',r.sourceGrade||'',r.finalGrade||'',r.weight?fmt(r.weight):''];var rh=36;vals.forEach(function(v,j){var xx=L+cols.slice(0,j).reduce(function(s,n){return s+n},0);rect(x,xx,y,cols[j],rh);fitText(x,v,xx,y,cols[j],rh,{size:15,min:8,align:[1,5,6].includes(j)?'left':'center'})});y+=rh});
    var leftW=cols.slice(0,4).reduce(function(s,v){return s+v},0),rightW=W-leftW;rect(x,L,y,leftW-130,48,'#eee');fitText(x,'TOTAL',L,y,leftW-130,48,{size:19,bold:true});rect(x,L+leftW-130,y,130,48,'#eee');fitText(x,fmt(detail.totalWeight),L+leftW-130,y,130,48,{size:19,bold:true});rect(x,L+leftW,y,rightW-130,48,'#eee');fitText(x,'TOTAL',L+leftW,y,rightW-130,48,{size:19,bold:true});rect(x,L+W-130,y,130,48,'#eee');fitText(x,fmt(detail.totalWeight),L+W-130,y,130,48,{size:19,bold:true});
    y+=76;rect(x,L,y,W,55);fitText(x,'ACTUAL VALUE',L,y,340,55,{size:18,bold:true});fitText(x,fmt(detail.totalWeight)+' KG',L+340,y,W-340,55,{size:20,bold:true,align:'left'});y+=55;rect(x,L,y,W,55);fitText(x,'PROVISIONAL VALUE',L,y,340,55,{size:18,bold:true});y+=55;rect(x,L,y,W,55);fitText(x,'BALANCE',L,y,340,55,{size:18,bold:true});
    y+=105;x.textAlign='left';x.font='18px Arial';x.fillText('Remark: '+(detail.items.map(function(r){return r.remark}).filter(Boolean).join(' / ')||''),L,y);x.textAlign='right';x.font='700 20px Arial';x.fillText('SHINSUNG METAL CO., LTD.',L+W,y+52);line(x,790,y+80,L+W,y+80,1);
    return c;
  }
  function makeCanvas(poNo,type,pre){var d=detail(poNo,pre);return String(type).toUpperCase()==='OVERSEAS'?overseas(d):domestic(d)}
  async function pdfBlob(canvas,type){if(!root.PDFLib)throw new Error('PDF 엔진을 불러오지 못했습니다. 새로고침 후 다시 시도하세요.');var PDFDocument=root.PDFLib.PDFDocument,pdf=await PDFDocument.create(),land=String(type).toUpperCase()!=='OVERSEAS',page=pdf.addPage(land?[841.89,595.28]:[595.28,841.89]),png=await pdf.embedPng(canvas.toDataURL('image/png')),size=page.getSize();page.drawImage(png,{x:0,y:0,width:size.width,height:size.height});return new Blob([await pdf.save()],{type:'application/pdf'})}
  function save(blob,name){var a=doc.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;doc.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},1000)}
  async function download(poNo,type,pre){var blob=await pdfBlob(makeCanvas(poNo,type,pre),type);save(blob,txt(poNo).replace(/[\\/:*?"<>|]+/g,'_')+'_'+(pre?'선세틀_':'')+(String(type).toUpperCase()==='OVERSEAS'?'해외':'국내')+'.pdf');return blob}
  async function share(poNo,type,pre){var blob=await pdfBlob(makeCanvas(poNo,type,pre),type),file=new File([blob],txt(poNo)+'_'+(pre?'선세틀_':'')+(String(type).toUpperCase()==='OVERSEAS'?'해외':'국내')+'.pdf',{type:'application/pdf'});if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({title:txt(poNo),text:'신성금속 '+(pre?'선세틀':'세틀먼트')+' 자료',files:[file]});return}save(blob,file.name);if(root.notify)root.notify('PDF 파일을 내려받았습니다. 카카오톡에서 파일을 첨부해 주세요.')}
  root.SettlementPdfV1={detail:detail,makeCanvas:makeCanvas,pdfBlob:pdfBlob,download:download,share:share};
  var current={poNo:'',type:'DOMESTIC'};
  function remember(poNo,type){if(poNo)current.poNo=txt(poNo);if(type)current.type=String(type).toUpperCase()==='OVERSEAS'?'OVERSEAS':'DOMESTIC';root.__settlementPdfCurrent=current}
  root.downloadSettlementPdf=function(poNo,type){remember(poNo,type);return download(current.poNo,current.type,false)};
  root.downloadCurrentSettlementPdf=function(){return download(current.poNo,current.type,false)};
  if(typeof root.openSettlementPreview==='function'){
    var openPreview=root.openSettlementPreview;
    root.openSettlementPreview=function(poNo,type){remember(poNo,type);return openPreview.apply(this,arguments)};
  }
  if(typeof root.setSettlementPreviewTemplate==='function'){
    var setTemplate=root.setSettlementPreviewTemplate;
    root.setSettlementPreviewTemplate=function(type){remember('',type);return setTemplate.apply(this,arguments)};
  }
  function decoratePreSettlement(){
    if(!root.__mesRuntime||typeof root.openPreSettlementDetail!=='function'||root.openPreSettlementDetail.__settlementTemplateV1)return;
    var original=root.openPreSettlementDetail;
    var wrapped=function(poNo){
      original.apply(this,arguments);
      var body=doc.getElementById('modalBody');if(!body)return;
      var actions=body.querySelector('.actions');if(!actions)return;
      var selector=doc.createElement('select');selector.id='preSettlementPdfTemplate';selector.innerHTML='<option value="DOMESTIC">국내 선세틀 양식</option><option value="OVERSEAS">해외 Pre-Settlement</option>';
      actions.insertBefore(selector,actions.firstChild);
      var buttons=actions.querySelectorAll('button');
      buttons.forEach(function(button){
        if(button.textContent.indexOf('PDF 다운로드')>=0)button.onclick=function(){download(poNo,selector.value,true)};
        if(button.textContent.indexOf('카카오톡')>=0)button.onclick=function(){share(poNo,selector.value,true)};
      });
    };
    wrapped.__settlementTemplateV1=true;root.openPreSettlementDetail=wrapped;
  }
  function decorate(){
    decoratePreSettlement();
    var title=doc.getElementById('settlementPreviewTitle');if(title){var match=txt(title.textContent).match(/^([^·]+)/);if(match)remember(match[1],/해외|Overseas/i.test(title.textContent)?'OVERSEAS':'DOMESTIC')}
    var actions=doc.getElementById('settlementPreviewActions');if(actions&&!actions.querySelector('.settlement-pdf-v1')){var btn=doc.createElement('button');btn.className='btn primary settlement-pdf-v1';btn.textContent='PDF 다운로드';btn.onclick=function(){root.downloadCurrentSettlementPdf()};actions.appendChild(btn)}
    doc.querySelectorAll('[data-settlement-po]').forEach(function(card){var a=card.querySelector('.settlement-actions');if(a&&!a.querySelector('.settlement-pdf-v1')){var b=doc.createElement('button');b.className='btn settlement-pdf-v1';b.textContent='PDF 다운로드';b.onclick=function(){var sel=card.querySelector('select');download(card.dataset.settlementPo,sel?sel.value:'DOMESTIC',false)};a.appendChild(b)}})
  }
  new MutationObserver(function(){decorate()}).observe(doc.documentElement,{childList:true,subtree:true});decorate();
})();

