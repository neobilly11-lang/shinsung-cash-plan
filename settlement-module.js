(function settlementFeatureModule(){
'use strict';

const SETTLEMENT_TEMPLATE_VERSION='20260812-settlement-v1';
let settlementMode='COMPLETED';
let settlementLongOnly=false;
let currentSettlementPoNo='';
let currentSettlementTemplate='DOMESTIC';

function settlementJsArg(value){return JSON.stringify(String(value??'')).replace(/</g,'\\u003c')}
function settlementSafeFile(value){return String(value||'settlement').replace(/[\\/:*?"<>|]/g,'_').replace(/\s+/g,'_')}
function settlementActiveRows(rows){return safeArray(rows).filter(row=>row?.status!=='CANCELLED')}
function settlementPoRows(poNo){return state.pos.filter(row=>row.status!=='CANCELLED'&&String(row.poNo||'').trim()===String(poNo||'').trim())}
function settlementReceived(row){return row.receiptStatus==='RECEIVED'||!!row.receivedAt||!!row.receiptCompletedAt||!!row.domesticReceipt}
function settlementDateValue(row){return row.receivedAt||row.receiptCompletedAt||row.confirmedAt||row.createdAt||''}
function settlementUnitPrice(row){return num(row.unitPrice??row.price??row.usdPrice??row.priceUsd??row.purchasePrice??0)}
function settlementGradeText(row){return row.grade||[row.productType,row.mainGrade,row.subGrade,row.detailGrade].filter(Boolean).join(' · ')||'미지정'}

function settlementPoGroups(){
  const groups=new Map();
  state.pos.filter(row=>row.status!=='CANCELLED'&&String(row.poNo||'').trim()).forEach(row=>{
    const poNo=String(row.poNo).trim();
    if(!groups.has(poNo))groups.set(poNo,{poNo,rows:[]});
    groups.get(poNo).rows.push(row);
  });
  return[...groups.values()].map(group=>{
    const rows=group.rows,totalWeight=rows.reduce((sum,row)=>sum+num(row.weight),0),inspectedWeight=rows.reduce((sum,row)=>sum+Math.min(num(row.weight),packageUsed(row.packageNo)),0),receivedRows=rows.filter(settlementReceived),receivedDates=receivedRows.map(settlementDateValue).filter(Boolean).sort(),complete=rows.length>0&&rows.every(row=>settlementReceived(row)&&packageRemain(row)<=0.001),progress=totalWeight>0?Math.min(100,Math.round(inspectedWeight/totalWeight*1000)/10):0,companies=[...new Set(rows.map(row=>row.company).filter(Boolean))],sourceGrades=[...new Set(rows.map(row=>row.grade).filter(Boolean))],anomalyCount=settlementAnomalyPhotos(group.poNo).length,startDate=receivedDates[0]||'';
    return{...group,totalWeight,inspectedWeight,remainingWeight:Math.max(0,totalWeight-inspectedWeight),receivedCount:receivedRows.length,packageCount:rows.length,complete,progress,companies,sourceGrades,anomalyCount,startDate,longIncomplete:!complete&&!!startDate&&daysSince(startDate)>=20};
  }).sort((a,b)=>String(b.startDate||b.rows[0]?.createdAt||'').localeCompare(String(a.startDate||a.rows[0]?.createdAt||'')));
}

function settlementPoDetail(poNo){
  const packages=settlementPoRows(poNo),packageMap=new Map(packages.map(row=>[row.packageNo,row])),splits=settlementActiveRows(state.splits).filter(row=>packageMap.has(row.packageNo)),losses=settlementActiveRows(state.losses).filter(row=>packageMap.has(row.packageNo));
  const originals=new Map(),actuals=new Map(),lossRows=[];
  for(const row of packages){
    const grade=String(row.grade||'미지정'),price=settlementUnitPrice(row),key=grade,prev=originals.get(key)||{description:grade,weight:0,price:0,amount:0,packageNos:[],remark:''};
    prev.weight+=num(row.weight);prev.amount+=num(row.weight)*price;prev.price=prev.weight?prev.amount/prev.weight:price;prev.packageNos.push(row.packageNo);originals.set(key,prev);
  }
  for(const split of splits){
    const source=packageMap.get(split.packageNo),sourceGrade=String(source?.grade||'미지정'),finalGrade=settlementGradeText(split),price=settlementUnitPrice(source||{}),key=`${sourceGrade}\u241f${finalGrade}`,memo=[split.memo,split.photoMemos?.anomaly].filter(Boolean).join(' · '),prev=actuals.get(key)||{description:finalGrade,sourceGrade,weight:0,price:0,amount:0,remark:'',packageNos:[],memos:[]};
    prev.weight+=num(split.weight);prev.amount+=num(split.weight)*price;prev.price=prev.weight?prev.amount/prev.weight:price;prev.packageNos.push(split.packageNo);if(memo)prev.memos.push(memo);actuals.set(key,prev);
  }
  for(const row of actuals.values()){
    const changed=normalizedGradeChoice(row.sourceGrade)!==normalizedGradeChoice(row.description),memo=[...new Set(row.memos)].join(' / ');row.remark=[changed?`원강종 ${row.sourceGrade} → ${row.description}`:`원강종 ${row.sourceGrade}`,memo].filter(Boolean).join(' · ');
  }
  for(const loss of losses){
    const source=packageMap.get(loss.packageNo),sourceGrade=String(source?.grade||loss.grade||'미지정'),reason=String(loss.reason||'검수 로스'),key=`${sourceGrade}\u241f${reason}`,existing=lossRows.find(row=>row.key===key);
    if(existing){existing.weight+=num(loss.weight);existing.packageNos.push(loss.packageNo)}else lossRows.push({key,description:`LOSS · ${reason}`,sourceGrade,weight:num(loss.weight),price:0,amount:0,remark:`원강종 ${sourceGrade} · ${reason}`,packageNos:[loss.packageNo],loss:true});
  }
  const group=settlementPoGroups().find(row=>row.poNo===poNo)||{poNo,rows:packages,totalWeight:0,inspectedWeight:0,remainingWeight:0,progress:0,complete:false,companies:[],sourceGrades:[],startDate:''},first=packages[0]||{},originalRows=[...originals.values()],actualRows=[...actuals.values(),...lossRows],inputAmount=originalRows.reduce((sum,row)=>sum+num(row.amount),0),actualAmount=actualRows.reduce((sum,row)=>sum+num(row.amount),0);
  return{...group,packages,splits,losses,originalRows,actualRows,company:group.companies?.join(', ')||first.company||'',address:first.companyAddress||first.supplierAddress||first.address||'',phone:first.companyPhone||first.supplierPhone||first.phone||'',fax:first.companyFax||first.supplierFax||first.fax||'',invoiceNo:first.invoiceNo||first.invoice||'',receiptDate:group.startDate||settlementDateValue(first),inputAmount,actualAmount,provisionalAmount:inputAmount*0.9,balance:actualAmount-inputAmount*0.9};
}

function settlementAnomalyPhotos(poNo){
  const packageNos=new Set(settlementPoRows(poNo).map(row=>row.packageNo)),byPath=new Map();
  settlementActiveRows(state.splits).filter(row=>packageNos.has(row.packageNo)&&row.photos?.anomaly).forEach(row=>{
    const path=String(row.photos.anomaly),entry=byPath.get(path)||{path,packageNo:row.packageNo,sourceGrade:settlementPoRows(poNo).find(p=>p.packageNo===row.packageNo)?.grade||'',finalGrades:[],memo:row.photoMemos?.anomaly||row.memo||'',createdAt:row.createdAt||''};
    entry.finalGrades.push(settlementGradeText(row));byPath.set(path,entry);
  });
  return[...byPath.values()].map(row=>({...row,finalGrades:[...new Set(row.finalGrades)]}));
}

function ensureSettlementUi(){
  ensureWorkflowEvidenceUi?.();ensureOrderPhotoUi?.();
  if(!document.getElementById('settlementFeatureStyles')){
    const style=document.createElement('style');style.id='settlementFeatureStyles';style.textContent=`
      .settlement-progress{height:16px;border-radius:999px;background:#e5ece9;overflow:hidden}.settlement-progress>span{display:block;height:100%;background:linear-gradient(90deg,#138066,#9ddf42)}
      .settlement-counts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.settlement-count-card{border:2px solid var(--line);border-radius:18px;background:#fff;padding:18px;text-align:left;min-height:120px}.settlement-count-card.on{border-color:var(--green);background:#eaf7f1}.settlement-count-card b{display:block;font-size:32px;margin-top:8px}
      .settlement-actions{display:flex;gap:8px;flex-wrap:wrap}.settlement-actions .btn,.settlement-actions select{min-height:50px}.settlement-preview-sheet{background:#fff;border:1px solid #888;padding:18px;margin-top:12px;color:#111}.settlement-preview-head{display:flex;justify-content:space-between;gap:18px;border-bottom:2px solid #222;padding-bottom:12px}.settlement-preview-head h2{margin:0}.settlement-preview-info{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px 20px;margin:14px 0}.settlement-compare{display:grid;grid-template-columns:1fr 1.35fr;gap:0;border:1px solid #222}.settlement-table{width:100%;border-collapse:collapse;font-size:13px}.settlement-table th,.settlement-table td{border:1px solid #777;padding:7px 5px;vertical-align:top}.settlement-table th{background:#f3f5f4}.settlement-table td.num{text-align:right;white-space:nowrap}.settlement-table caption{font-weight:900;font-size:17px;padding:8px;border-bottom:1px solid #222}.settlement-loss{color:#a12626;font-weight:800}.settlement-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.settlement-long{border-left:7px solid var(--red)}
      @media(max-width:760px){.settlement-compare,.settlement-preview-info,.settlement-detail-grid{grid-template-columns:1fr}.settlement-count-card{min-height:100px;padding:14px}.settlement-preview-sheet{padding:8px;overflow-x:auto}.settlement-preview-head{display:block}.settlement-table{min-width:520px}.settlement-actions>*{flex:1 1 150px}}
    `;document.head.appendChild(style)
  }
  const grid=E('management')?.querySelector('.grid'),shippingButton=E('managementShippingCompletions');
  if(grid&&!E('managementSettlements')){
    const html='<button id="managementSettlements" class="homebtn blue" onclick="openSettlementManagement()"><span id="managementSettlementCount">0건</span><strong>세틀먼트관리</strong></button>';
    if(shippingButton)shippingButton.insertAdjacentHTML('afterend',html);else grid.insertAdjacentHTML('beforeend',html);
  }
  const main=E('home')?.closest('main');
  if(main&&!E('settlements'))main.insertAdjacentHTML('beforeend',`
    <section id="settlements" class="view"><p class="eyebrow">업무관리 · 검수 정산</p><h1>세틀먼트관리</h1><button class="btn" onclick="show('management')">← 업무관리로</button><div class="settlement-counts" style="margin-top:14px"><button id="settlementCompletedCard" class="settlement-count-card" onclick="showSettlementMode('COMPLETED')"><small>검수·로스 정리가 끝난 P.O</small><b id="settlementCompletedCount">0건</b><span>완료세틀먼트</span></button><button id="settlementIncompleteCard" class="settlement-count-card" onclick="showSettlementMode('INCOMPLETE')"><small>검수가 남아 있는 P.O</small><b id="settlementIncompleteCount">0건</b><span>미완료세틀먼트</span></button></div><div class="card"><label>P.O·거래처·거래처강종·최종강종 검색<input id="settlementSearch" placeholder="세틀먼트 검색" oninput="renderSettlementManagement()"></label><div id="settlementLongFilter" class="msg"></div></div><div id="settlementRows"></div></section>
    <section id="settlementPreview" class="view"><p class="eyebrow">세틀먼트 양식 미리보기</p><h1 id="settlementPreviewTitle">Settlement Report</h1><button class="btn" onclick="show('settlements')">← 세틀먼트 목록</button><div id="settlementPreviewActions" class="settlement-actions" style="margin-top:12px"></div><div id="settlementPreviewBody"></div></section>
    <section id="settlementDetail" class="view"><p class="eyebrow">P.O 검수진행 상세</p><h1 id="settlementDetailTitle">미완료세틀먼트</h1><button class="btn" onclick="show('settlements')">← 미완료세틀먼트 목록</button><div id="settlementDetailBody"></div></section>`);
  if(E('dashboard')&&!E('dashLongSettlement')){
    const anchor=E('dashLongIncomplete')?.closest('button'),html='<button id="dashLongSettlementCard" class="dash-card" onclick="openLongSettlements()"><small>장기미세틀건수 · 입고후 20일 이상</small><b id="dashLongSettlement">0건</b></button>';
    if(anchor)anchor.insertAdjacentHTML('afterend',html);else E('dashboard')?.querySelector('.dashboard-grid')?.insertAdjacentHTML('beforeend',html);
  }
  applyUpdatedTaskLabels();
}

function applyUpdatedTaskLabels(){
  const receiptButton=E('homeImportReceiptButton');if(receiptButton?.querySelector(':scope>span'))receiptButton.querySelector(':scope>span').textContent='1 · 수입입고 수행';
  const shippingButton=[...document.querySelectorAll('#home .home-tasks button')].find(button=>String(button.getAttribute('onclick')||'').includes("shippingModeMenu"));if(shippingButton?.querySelector(':scope>span'))shippingButton.querySelector(':scope>span').textContent='4 · 출하확인';
  const eyebrow=E('shippingModeMenu')?.querySelector('.eyebrow');if(eyebrow)eyebrow.textContent='업무수행 4번 · 출하확인';
  const importEyebrow=E('importReceiptManagement')?.querySelector('.eyebrow');if(importEyebrow)importEyebrow.textContent='업무수행 1번 · 수입입고 수행';
}

function renderSettlementCounts(){
  ensureSettlementUi();const groups=settlementPoGroups(),completed=groups.filter(row=>row.complete),incomplete=groups.filter(row=>!row.complete),longRows=incomplete.filter(row=>row.longIncomplete);
  if(E('managementSettlementCount'))E('managementSettlementCount').textContent=`완료 ${completed.length} · 미완료 ${incomplete.length}`;
  if(E('settlementCompletedCount'))E('settlementCompletedCount').textContent=completed.length+'건';
  if(E('settlementIncompleteCount'))E('settlementIncompleteCount').textContent=incomplete.length+'건';
  if(E('dashLongSettlement'))E('dashLongSettlement').textContent=longRows.length+'건';
}

function openSettlementManagement(){settlementMode='COMPLETED';settlementLongOnly=false;show('settlements');renderSettlementManagement()}
function showSettlementMode(mode,longOnly=false){settlementMode=mode==='INCOMPLETE'?'INCOMPLETE':'COMPLETED';settlementLongOnly=!!longOnly;renderSettlementManagement();E('settlementRows')?.scrollIntoView({behavior:'smooth',block:'start'})}
function openLongSettlements(){settlementMode='INCOMPLETE';settlementLongOnly=true;show('settlements');renderSettlementManagement()}

function settlementSearchText(group){
  const detail=settlementPoDetail(group.poNo);return[group.poNo,...group.companies,...group.sourceGrades,...detail.actualRows.map(row=>row.description)].join(' ').toLowerCase();
}
function settlementProgressMarkup(group){return`<div class="settlement-progress" aria-label="검수진행율 ${group.progress}%"><span style="width:${Math.max(0,Math.min(100,group.progress))}%"></span></div><p><b>검수진행율 ${group.progress}%</b> · 확정·로스 ${kg(group.inspectedWeight)} / 입고 ${kg(group.totalWeight)}</p>`}
function renderSettlementManagement(){
  ensureSettlementUi();renderSettlementCounts();const q=String(E('settlementSearch')?.value||'').trim().toLowerCase();let groups=settlementPoGroups().filter(row=>settlementMode==='COMPLETED'?row.complete:!row.complete);if(settlementLongOnly)groups=groups.filter(row=>row.longIncomplete);if(q)groups=groups.filter(row=>settlementSearchText(row).includes(q));
  E('settlementCompletedCard')?.classList.toggle('on',settlementMode==='COMPLETED');E('settlementIncompleteCard')?.classList.toggle('on',settlementMode==='INCOMPLETE');
  const longMsg=E('settlementLongFilter');if(longMsg){longMsg.className=settlementLongOnly?'msg on':'msg';longMsg.innerHTML=settlementLongOnly?'입고 후 20일 이상 미완료 P.O만 표시 중입니다. <button class="btn" onclick="showSettlementMode(\'INCOMPLETE\')">전체 미완료 보기</button>':''}
  E('settlementRows').innerHTML=groups.length?groups.map(group=>settlementMode==='COMPLETED'?settlementCompletedCard(group):settlementIncompleteCard(group)).join(''):`<div class="card">${settlementLongOnly?'입고 후 20일 이상 미완료 세틀먼트가 없습니다.':'검색된 세틀먼트가 없습니다.'}</div>`;
}
function settlementCompletedCard(group){return`<article class="donecard" data-settlement-po="${esc(group.poNo)}"><span class="status-chip">완료세틀먼트</span><h2>${esc(group.poNo)} · ${esc(group.companies.join(', ')||'거래처 미지정')}</h2><p><b>거래처 강종:</b> ${esc(group.sourceGrades.join(' / ')||'미지정')}</p><div class="summary"><div><small>입고 패키지</small><b>${group.packageCount}건</b></div><div><small>입고중량</small><b>${kg(group.totalWeight)}</b></div><div><small>최종강종·로스</small><b>${kg(group.inspectedWeight)}</b></div><div><small>이상사진</small><b>${group.anomalyCount}장</b></div></div><div class="settlement-actions"><select aria-label="세틀먼트 양식"><option value="DOMESTIC">국내 세틀먼트 양식</option><option value="OVERSEAS">해외 Settlement Report</option></select><button class="btn" onclick="openSettlementPreview(this.closest('article').dataset.settlementPo,this.closest('article').querySelector('select').value)">양식 미리보기</button><button class="btn primary" onclick="downloadSettlementExcel(this.closest('article').dataset.settlementPo,this.closest('article').querySelector('select').value)">엑셀 다운로드</button><button class="btn warn" onclick="downloadSettlementAnomalyPhotos(this.closest('article').dataset.settlementPo)">이상사진 일괄다운로드</button></div></article>`}
function settlementIncompleteCard(group){const start=group.startDate?String(group.startDate).slice(0,10):'입고 전';return`<article class="donecard ${group.longIncomplete?'settlement-long':''}" data-settlement-po="${esc(group.poNo)}"><span class="status-chip ${group.longIncomplete?'red':'warn'}">${group.longIncomplete?'입고후 '+daysSince(group.startDate)+'일 · 장기미세틀':'미완료세틀먼트'}</span><h2>${esc(group.poNo)} · ${esc(group.companies.join(', ')||'거래처 미지정')}</h2><p>입고기준일 ${esc(start)} · 패키지 ${group.packageCount}건 중 입고 ${group.receivedCount}건</p>${settlementProgressMarkup(group)}<button class="btn primary" style="width:100%" onclick="openSettlementIncompleteDetail(this.closest('article').dataset.settlementPo)">완료·미완료 상세내역</button></article>`}

function openSettlementIncompleteDetail(poNo){currentSettlementPoNo=poNo;settlementMode='INCOMPLETE';show('settlementDetail');renderSettlementIncompleteDetail()}
function renderSettlementIncompleteDetail(){
  const detail=settlementPoDetail(currentSettlementPoNo);E('settlementDetailTitle').textContent=`${detail.poNo} 검수진행 ${detail.progress}%`;
  E('settlementDetailBody').innerHTML=`<div class="card">${settlementProgressMarkup(detail)}<div class="summary"><div><small>전체 패키지</small><b>${detail.packageCount}건</b></div><div><small>입고중량</small><b>${kg(detail.totalWeight)}</b></div><div><small>확정·로스</small><b>${kg(detail.inspectedWeight)}</b></div><div><small>미완료</small><b>${kg(detail.remainingWeight)}</b></div></div></div>${detail.packages.map(row=>{const splits=detail.splits.filter(split=>split.packageNo===row.packageNo),losses=detail.losses.filter(loss=>loss.packageNo===row.packageNo),remain=packageRemain(row),complete=settlementReceived(row)&&remain<=0.001;return`<article class="donecard"><span class="status-chip ${complete?'':'warn'}">${complete?'검수완료':'검수미완료'}</span><h2>${esc(row.packageNo)} · ${esc(row.grade)}</h2><p>P.O ${esc(row.poNo)} · ${esc(row.company)} · 입고 ${kg(row.weight)} · 남은 ${kg(remain)}</p><div class="settlement-detail-grid"><div class="card"><b>완료 내역</b>${splits.length?splits.map(split=>`<p>${esc(settlementGradeText(split))} · ${kg(split.weight)}${split.memo?' · '+esc(split.memo):''}</p>`).join(''):'<p>검수확정 없음</p>'}${losses.map(loss=>`<p class="settlement-loss">로스 ${kg(loss.weight)} · ${esc(loss.reason||'')}</p>`).join('')}</div><div class="card"><b>미완료 내역</b><p>${remain>0?`${esc(row.grade)} · ${kg(remain)} 검수 필요`:'모든 중량 처리완료'}</p><p>${settlementReceived(row)?'입고완료':'수입입고 대기'}</p></div></div></article>`}).join('')}`;
}

function settlementPreviewRows(rows){return rows.map(row=>`<tr class="${row.loss?'settlement-loss':''}"><td>${esc(row.description)}</td><td class="num">${num(row.weight).toLocaleString()}</td><td class="num">${row.price?num(row.price).toLocaleString(undefined,{maximumFractionDigits:2}):'-'}</td><td class="num">${num(row.amount).toLocaleString(undefined,{maximumFractionDigits:2})}</td><td>${esc(row.remark||'')}</td></tr>`).join('')}
function settlementPreviewHtml(detail,type){
  const overseas=type==='OVERSEAS',date=String(detail.receiptDate||'').slice(0,10)||new Date().toLocaleDateString('sv-SE'),inputRows=settlementPreviewRows(detail.originalRows),actualRows=settlementPreviewRows(detail.actualRows);
  return`<div class="settlement-preview-sheet"><div class="settlement-preview-head"><h2>${overseas?'SHIN SUNG METAL CO.,LTD':'㈜ 신 성 금 속'}</h2><h2>${overseas?'Settlement Report':'세틀먼트 정산서'}</h2></div><div class="settlement-preview-info"><div><b>${overseas?'Messrs.':'상호'}:</b> ${esc(detail.company)}</div><div><b>${overseas?'Date':'입고일'}:</b> ${esc(date)}</div><div><b>${overseas?'Address':'주소'}:</b> ${esc(detail.address||'-')}</div><div><b>${overseas?'P/O No.':'P/O No.'}:</b> ${esc(detail.poNo)}</div><div><b>Tel.:</b> ${esc(detail.phone||'-')}</div><div><b>${overseas?'INVOICE No.':'Fax.'}:</b> ${esc(overseas?(detail.invoiceNo||'-'):(detail.fax||'-'))}</div></div><div class="settlement-compare"><table class="settlement-table"><caption>${overseas?'Invoice Value':'입고 내역'}</caption><thead><tr><th>품목</th><th>${overseas?'Weight(Kg)':'무게(G/W)'}</th><th>${overseas?'Price(USD/Kg)':'단가'}</th><th>Amount</th><th>비고</th></tr></thead><tbody>${inputRows}</tbody><tfoot><tr><th>TOTAL</th><th class="num">${detail.totalWeight.toLocaleString()}</th><th></th><th class="num">${detail.inputAmount.toLocaleString(undefined,{maximumFractionDigits:2})}</th><th></th></tr></tfoot></table><table class="settlement-table"><caption>${overseas?'Actual Value After Inspection':'정산 내역'}</caption><thead><tr><th>최종강종·로스</th><th>${overseas?'Weight(Kg)':'무게(N/W)'}</th><th>${overseas?'Price(USD/Kg)':'단가'}</th><th>Total</th><th>변경·이상·로스 정보</th></tr></thead><tbody>${actualRows}</tbody><tfoot><tr><th>TOTAL</th><th class="num">${detail.inspectedWeight.toLocaleString()}</th><th></th><th class="num">${detail.actualAmount.toLocaleString(undefined,{maximumFractionDigits:2})}</th><th></th></tr></tfoot></table></div><p style="text-align:right"><b>이상사진 ${settlementAnomalyPhotos(detail.poNo).length}장</b> · 별도 ZIP 일괄다운로드</p></div>`;
}
function openSettlementPreview(poNo,type='DOMESTIC'){currentSettlementPoNo=poNo;currentSettlementTemplate=type==='OVERSEAS'?'OVERSEAS':'DOMESTIC';show('settlementPreview');renderSettlementPreview()}
function setSettlementPreviewTemplate(type){currentSettlementTemplate=type==='OVERSEAS'?'OVERSEAS':'DOMESTIC';renderSettlementPreview()}
function downloadCurrentSettlementExcel(){return downloadSettlementExcel(currentSettlementPoNo,currentSettlementTemplate)}
function renderSettlementPreview(){const detail=settlementPoDetail(currentSettlementPoNo),type=currentSettlementTemplate;E('settlementPreviewTitle').textContent=`${detail.poNo} · ${type==='OVERSEAS'?'해외 Settlement Report':'국내 세틀먼트'}`;E('settlementPreviewActions').innerHTML=`<button class="btn ${type==='DOMESTIC'?'primary':''}" onclick="setSettlementPreviewTemplate('DOMESTIC')">국내양식</button><button class="btn ${type==='OVERSEAS'?'primary':''}" onclick="setSettlementPreviewTemplate('OVERSEAS')">해외양식</button><button class="btn primary" onclick="downloadCurrentSettlementExcel()">엑셀 다운로드</button><button class="btn warn" data-settlement-po="${esc(detail.poNo)}" onclick="downloadSettlementAnomalyPhotos(this.dataset.settlementPo)">이상사진 ${settlementAnomalyPhotos(detail.poNo).length}장 ZIP</button>`;E('settlementPreviewBody').innerHTML=settlementPreviewHtml(detail,type)}

function settlementColumnName(index){let out='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))out=String.fromCharCode(65+(n-1)%26)+out;return out}
function settlementCellAddress(col,row){return settlementColumnName(col)+row}
function settlementXmlChildren(node,name){return[...node.childNodes].filter(child=>child.nodeType===1&&child.localName===name)}
function settlementXmlDoc(text){const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.querySelector('parsererror'))throw Error('엑셀 양식 XML을 읽을 수 없습니다.');return doc}
function settlementSerialize(doc){return new XMLSerializer().serializeToString(doc)}
function settlementWorksheetCell(doc,address){
  const mainNs='http://schemas.openxmlformats.org/spreadsheetml/2006/main',sheetData=doc.getElementsByTagNameNS('*','sheetData')[0];if(!sheetData)throw Error('엑셀 시트 데이터가 없습니다.');const rowNo=parseInt(address.match(/\d+/)?.[0]||'0',10);let row=[...sheetData.getElementsByTagNameNS('*','row')].find(node=>num(node.getAttribute('r'))===rowNo);
  if(!row){row=doc.createElementNS(mainNs,'row');row.setAttribute('r',String(rowNo));sheetData.appendChild(row)}let cell=[...row.getElementsByTagNameNS('*','c')].find(node=>node.getAttribute('r')===address);if(!cell){cell=doc.createElementNS(mainNs,'c');cell.setAttribute('r',address);row.appendChild(cell)}return cell;
}
function settlementSetCell(doc,address,value,kind='string'){
  const mainNs='http://schemas.openxmlformats.org/spreadsheetml/2006/main',cell=settlementWorksheetCell(doc,address);settlementXmlChildren(cell,'f').concat(settlementXmlChildren(cell,'v'),settlementXmlChildren(cell,'is')).forEach(node=>node.remove());
  if(value===null||value===undefined||value===''){cell.removeAttribute('t');return}
  if(kind==='number'&&Number.isFinite(Number(value))){cell.removeAttribute('t');const v=doc.createElementNS(mainNs,'v');v.textContent=String(Number(value));cell.appendChild(v);return}
  cell.setAttribute('t','inlineStr');const is=doc.createElementNS(mainNs,'is'),t=doc.createElementNS(mainNs,'t');t.setAttribute('xml:space','preserve');t.textContent=String(value);is.appendChild(t);cell.appendChild(is);
}
function settlementClearRange(doc,startCol,endCol,startRow,endRow){for(let row=startRow;row<=endRow;row++)for(let col=startCol;col<=endCol;col++)settlementSetCell(doc,settlementCellAddress(col,row),'')}
function settlementFitRows(rows,maxRows){if(rows.length<=maxRows)return rows;if(maxRows<=1)return[{description:rows.map(row=>row.description).join(' / '),weight:rows.reduce((sum,row)=>sum+num(row.weight),0),price:0,amount:rows.reduce((sum,row)=>sum+num(row.amount),0),remark:`${rows.length}개 품목 통합표시`}];const head=rows.slice(0,maxRows-1),tail=rows.slice(maxRows-1);return[...head,{description:tail.map(row=>row.description).join(' / '),weight:tail.reduce((sum,row)=>sum+num(row.weight),0),price:0,amount:tail.reduce((sum,row)=>sum+num(row.amount),0),remark:`${tail.length}개 품목 통합표시 · ${tail.map(row=>row.remark).filter(Boolean).join(' / ')}`,loss:tail.every(row=>row.loss)}]}
async function settlementSheetDocument(zip,sheetName){
  const workbookDoc=settlementXmlDoc(await zip.file('xl/workbook.xml').async('string')),sheet=[...workbookDoc.getElementsByTagNameNS('*','sheet')].find(node=>node.getAttribute('name')===sheetName);if(!sheet)throw Error(`${sheetName} 시트를 찾을 수 없습니다.`);const relId=sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id')||sheet.getAttribute('r:id'),relsDoc=settlementXmlDoc(await zip.file('xl/_rels/workbook.xml.rels').async('string')),rel=[...relsDoc.getElementsByTagNameNS('*','Relationship')].find(node=>node.getAttribute('Id')===relId);if(!rel)throw Error(`${sheetName} 시트 연결정보가 없습니다.`);const target=rel.getAttribute('Target').replace(/^\//,'').replace(/^xl\//,'');const path='xl/'+target.replace(/^\.\//,'');const file=zip.file(path);if(!file)throw Error(`${sheetName} 시트 파일이 없습니다.`);const doc=settlementXmlDoc(await file.async('string'));return{doc,path,save(){zip.file(path,settlementSerialize(doc))}};
}
function settlementFillDomestic(doc,detail){
  const date=String(detail.receiptDate||'').slice(0,10)||new Date().toLocaleDateString('sv-SE'),original=settlementFitRows(detail.originalRows,18),actual=settlementFitRows(detail.actualRows,18);settlementSetCell(doc,'G2',detail.company);settlementSetCell(doc,'J2',date);settlementSetCell(doc,'G3',detail.address||'');settlementSetCell(doc,'G4',detail.phone||'');settlementSetCell(doc,'G5',detail.fax||'');settlementSetCell(doc,'G6',detail.poNo);settlementClearRange(doc,1,3,10,27);settlementClearRange(doc,5,9,10,27);
  original.forEach((row,index)=>{const r=10+index;settlementSetCell(doc,`B${r}`,row.description);settlementSetCell(doc,`C${r}`,row.weight,'number');settlementSetCell(doc,`D${r}`,row.packageNos?.length?`사내입고 ${row.packageNos.length}건`:'')});
  actual.forEach((row,index)=>{const r=10+index;settlementSetCell(doc,`F${r}`,row.description);settlementSetCell(doc,`G${r}`,row.weight,'number');settlementSetCell(doc,`H${r}`,row.price||'',row.price?'number':'string');settlementSetCell(doc,`I${r}`,row.amount||0,'number');settlementSetCell(doc,`J${r}`,row.remark||'')});
  settlementSetCell(doc,'B28','Total');settlementSetCell(doc,'C28',detail.totalWeight,'number');settlementSetCell(doc,'F28','Total');settlementSetCell(doc,'G28',detail.inspectedWeight,'number');settlementSetCell(doc,'H26','공급가액 :');settlementSetCell(doc,'I26',detail.actualAmount,'number');settlementSetCell(doc,'H27','부가세 :');settlementSetCell(doc,'I27',detail.actualAmount*0.1,'number');settlementSetCell(doc,'I28','Total :');settlementSetCell(doc,'J28',detail.actualAmount*1.1,'number');settlementSetCell(doc,'B30',`세금계산서 발행 요청일 : ${date}`);settlementSetCell(doc,'B31',`세금계산서 작성일자 : ${date}`);settlementSetCell(doc,'B32','발행 마감 : 오후 4시');
}
function settlementFillOverseas(doc,detail,sheetName){
  const raw=sheetName==='검수원본',start=13,totalRow=raw?108:77,summaryRow=raw?111:80,maxRows=totalRow-start,date=String(detail.receiptDate||'').slice(0,10)||new Date().toLocaleDateString('sv-SE'),original=settlementFitRows(detail.originalRows,maxRows),actual=settlementFitRows(detail.actualRows,maxRows);settlementSetCell(doc,'B5',detail.company);settlementSetCell(doc,'B6',detail.address||'');settlementSetCell(doc,'B7',[detail.phone,detail.fax].filter(Boolean).join(' / '));settlementSetCell(doc,'G5',date);settlementSetCell(doc,'G6',detail.invoiceNo||'');settlementSetCell(doc,'G7',detail.poNo);settlementClearRange(doc,0,9,start,totalRow-1);
  original.forEach((row,index)=>{const r=start+index;settlementSetCell(doc,`A${r}`,row.description);settlementSetCell(doc,`B${r}`,row.weight,'number');settlementSetCell(doc,`C${r}`,row.price||'',row.price?'number':'string');settlementSetCell(doc,`D${r}`,row.amount||0,'number')});
  actual.forEach((row,index)=>{const r=start+index;settlementSetCell(doc,`E${r}`,row.description);settlementSetCell(doc,`F${r}`,row.weight,'number');settlementSetCell(doc,`G${r}`,row.price||'',row.price?'number':'string');settlementSetCell(doc,`H${r}`,row.amount||0,'number');settlementSetCell(doc,`I${r}`,row.remark||'')});
  settlementSetCell(doc,`A${totalRow}`,'TOTAL');settlementSetCell(doc,`B${totalRow}`,detail.totalWeight,'number');settlementSetCell(doc,`D${totalRow}`,detail.inputAmount,'number');settlementSetCell(doc,`E${totalRow}`,'TOTAL');settlementSetCell(doc,`F${totalRow}`,detail.inspectedWeight,'number');settlementSetCell(doc,`H${totalRow}`,detail.actualAmount,'number');settlementSetCell(doc,`E${summaryRow}`,'Actual value');settlementSetCell(doc,`H${summaryRow}`,detail.actualAmount,'number');settlementSetCell(doc,`E${summaryRow+1}`,'Provisonal Payment ( 90% )');settlementSetCell(doc,`H${summaryRow+1}`,detail.provisionalAmount,'number');settlementSetCell(doc,`E${summaryRow+2}`,'Balance');settlementSetCell(doc,`H${summaryRow+2}`,detail.balance,'number');
}
async function settlementTemplateBlob(poNo,type){
  if(!window.JSZip)throw Error('엑셀·사진 묶음 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도하세요.');const detail=settlementPoDetail(poNo),template=type==='OVERSEAS'?'settlement-overseas-template.xlsx':'settlement-domestic-template.xlsx',response=await fetch(`./${template}?v=${SETTLEMENT_TEMPLATE_VERSION}`,{cache:'no-store'});if(!response.ok)throw Error(`세틀먼트 원본 양식 HTTP ${response.status}`);const zip=await JSZip.loadAsync(await response.arrayBuffer());
  if(type==='OVERSEAS'){for(const name of ['검수원본','세틀']){const sheet=await settlementSheetDocument(zip,name);settlementFillOverseas(sheet.doc,detail,name);sheet.save()}}else{for(const name of ['S.T','S.T (2)']){const sheet=await settlementSheetDocument(zip,name);settlementFillDomestic(sheet.doc,detail);sheet.save()}}
  return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',compression:'DEFLATE',compressionOptions:{level:6}});
}
function settlementDownloadBlob(blob,fileName){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=fileName;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}
async function downloadSettlementExcel(poNo,type='DOMESTIC'){
  const normalized=type==='OVERSEAS'?'OVERSEAS':'DOMESTIC';try{beginSaveProgress('세틀먼트 엑셀 생성 중','원본 양식에 P.O별 검수·최종강종·로스 정보를 입력하고 있습니다.');const blob=await settlementTemplateBlob(poNo,normalized);settlementDownloadBlob(blob,`${settlementSafeFile(poNo)}_${normalized==='OVERSEAS'?'해외':'국내'}_세틀먼트.xlsx`);showFlowToast(`${poNo} ${normalized==='OVERSEAS'?'해외':'국내'} 세틀먼트 다운로드 완료`)}catch(error){alert('세틀먼트 다운로드 실패: '+error.message)}finally{endSaveProgress()}
}
function settlementCsvValue(value){const text=String(value??'');return/[",\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text}
function settlementPhotoExtension(contentType,path){if(/png/i.test(contentType)||/\.png($|\?)/i.test(path))return'png';if(/webp/i.test(contentType)||/\.webp($|\?)/i.test(path))return'webp';return'jpg'}
async function downloadSettlementAnomalyPhotos(poNo){
  const photos=settlementAnomalyPhotos(poNo);if(!photos.length){alert(`${poNo}에 저장된 이상사진이 없습니다.`);return}if(!window.JSZip){alert('사진 묶음 모듈을 불러오지 못했습니다. 새로고침 후 다시 시도하세요.');return}try{beginSaveProgress('이상사진 ZIP 생성 중',`0/${photos.length}장 다운로드 중`);const zip=new JSZip(),csv=[['No.','P.O','사내입고번호','거래처강종','최종강종','이상사진메모','검수시간']];for(let index=0;index<photos.length;index++){const row=photos[index],url=photoUrl(row.path),response=await fetch(url);if(!response.ok)throw Error(`${row.packageNo} 사진 HTTP ${response.status}`);const blob=await response.blob(),ext=settlementPhotoExtension(blob.type,row.path),fileName=`${String(index+1).padStart(2,'0')}_${settlementSafeFile(row.packageNo)}_${settlementSafeFile(row.finalGrades.join('-')).slice(0,60)}.${ext}`;zip.file(fileName,blob);csv.push([index+1,poNo,row.packageNo,row.sourceGrade,row.finalGrades.join(' / '),row.memo,row.createdAt]);if(E('saveProgressDetail'))E('saveProgressDetail').textContent=`${index+1}/${photos.length}장 묶음에 추가 완료`};zip.file('이상사진_목록.csv','\uFEFF'+csv.map(columns=>columns.map(settlementCsvValue).join(',')).join('\r\n'));const out=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});settlementDownloadBlob(out,`${settlementSafeFile(poNo)}_이상사진_${photos.length}장.zip`);showFlowToast(`${poNo} 이상사진 ${photos.length}장 일괄다운로드 완료`)}catch(error){alert('이상사진 일괄다운로드 실패: '+error.message)}finally{endSaveProgress()}
}

function settlementDerivedOrderPhotos(type,orderNo){
  const rows=[];if(type==='PO'){
    safeArray(state.receiptWorks).filter(work=>work.photo&&work.poNo===orderNo).forEach(work=>rows.push({id:`receipt-work-${work.id}`,orderType:'PO',orderNo,photo:work.photo,operatorName:work.operatorName||work.completedByName,createdAt:work.updatedAt||work.createdAt,sourceLabel:'수입입고 사진',status:'ACTIVE'}));
    settlementPoRows(orderNo).forEach(row=>[['receiptPhoto','수입입고 사진'],['packagePhoto','입고 패키지 사진'],['weightSlipPhoto','입고 계근표 사진']].forEach(([key,label])=>{if(row[key])rows.push({id:`po-${row.id}-${key}`,orderType:'PO',orderNo,photo:row[key],operatorName:row.receiptWorkerName||row.operatorName,createdAt:row.receivedAt||row.createdAt,sourceLabel:label,status:'ACTIVE'})}));
    safeArray(state.domesticReceipts).filter(receipt=>receipt.poNo===orderNo).forEach(receipt=>{[['arrivalPhoto','국내입고 하차 사진'],['weightSlipPhoto','국내입고 계근표 사진']].forEach(([key,label])=>{if(receipt[key])rows.push({id:`domestic-${receipt.id}-${key}`,orderType:'PO',orderNo,photo:receipt[key],operatorName:receipt.operatorName||receipt.confirmedByName,createdAt:receipt.confirmedAt||receipt.updatedAt,sourceLabel:label,status:'ACTIVE'})});safeArray(receipt.packages).forEach(pkg=>{if(pkg.photo)rows.push({id:`domestic-${receipt.id}-${pkg.id}`,orderType:'PO',orderNo,photo:pkg.photo,operatorName:receipt.operatorName||receipt.confirmedByName,createdAt:receipt.confirmedAt||receipt.updatedAt,sourceLabel:`${pkg.packageNo} 패키지 사진`,status:'ACTIVE'})})});
  }else{
    safeArray(state.shippingWorks).filter(work=>work.photo&&work.soNo===orderNo).forEach(work=>rows.push({id:`shipping-work-${work.id}`,orderType:'SO',orderNo,photo:work.photo,operatorName:work.operatorName||work.completedByName,createdAt:work.updatedAt||work.createdAt,sourceLabel:'출하 작업사진',status:'ACTIVE'}));
    state.shipments.filter(row=>row.soNo===orderNo&&row.shippingPhoto).forEach(row=>rows.push({id:`shipment-${row.id}`,orderType:'SO',orderNo,photo:row.shippingPhoto,operatorName:row.shippingWorkerName||row.operatorName,createdAt:row.shippingCompletedAt||row.createdAt,sourceLabel:'출하완료 사진',status:'ACTIVE'}));
    state.packingLists.filter(row=>row.soNo===orderNo&&row.shippingPhoto).forEach(row=>rows.push({id:`packing-${row.id}`,orderType:'SO',orderNo,photo:row.shippingPhoto,operatorName:row.shippingWorkerName||row.operatorName,createdAt:row.shippingCompletedAt||row.createdAt,sourceLabel:'PACKING LIST 출하사진',status:'ACTIVE'}));
  }return rows;
}

const activeOrderPhotosBeforeSettlementBridge=activeOrderPhotos;
activeOrderPhotos=function activeOrderPhotosWithReceiptShipping(type='',orderNo=''){
  const base=activeOrderPhotosBeforeSettlementBridge.apply(this,arguments),derived=(type&&orderNo)?settlementDerivedOrderPhotos(type,orderNo):[];const seen=new Set(),rows=[];[...base,...derived].forEach(row=>{const key=String(row.photo||'');if(!key||seen.has(key))return;seen.add(key);rows.push(row)});return rows.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
};
const orderPhotoCardHtmlBeforeSettlementBridge=orderPhotoCardHtml;
orderPhotoCardHtml=function orderPhotoCardHtmlWithEvidenceLabel(row,index){const html=orderPhotoCardHtmlBeforeSettlementBridge(row,index);return row.sourceLabel?html.replace(`<b>사진 ${index+1}</b>`,`<b>${esc(row.sourceLabel)}</b>`):html};

const showBeforeSettlementFeature=show;
show=function showWithSettlementFeature(id){ensureSettlementUi();const result=showBeforeSettlementFeature.apply(this,arguments);applyUpdatedTaskLabels();if(id==='settlements')renderSettlementManagement();if(id==='settlementPreview')renderSettlementPreview();if(id==='settlementDetail')renderSettlementIncompleteDetail();if(['settlements','settlementPreview','settlementDetail'].includes(id))document.querySelectorAll('.bottom button').forEach(button=>button.classList.toggle('on',button.dataset.v==='management'));return result};
const renderDashboardBeforeSettlementFeature=renderDashboard;
renderDashboard=function renderDashboardWithLongSettlement(){const result=renderDashboardBeforeSettlementFeature.apply(this,arguments);renderSettlementCounts();return result};
const renderAllBeforeSettlementFeature=renderAll;
renderAll=function renderAllWithSettlementFeature(){const result=renderAllBeforeSettlementFeature.apply(this,arguments);ensureSettlementUi();renderSettlementCounts();applyUpdatedTaskLabels();if(E('settlements')?.classList.contains('on'))renderSettlementManagement();if(E('settlementPreview')?.classList.contains('on'))renderSettlementPreview();if(E('settlementDetail')?.classList.contains('on'))renderSettlementIncompleteDetail();if(E('orderPhotoIndex')?.classList.contains('on'))renderOrderPhotoIndex();if(E('orderPhotoAlbum')?.classList.contains('on'))renderOrderPhotoAlbum();return result};

Object.assign(window,{openSettlementManagement,showSettlementMode,openLongSettlements,renderSettlementManagement,openSettlementIncompleteDetail,openSettlementPreview,renderSettlementPreview,setSettlementPreviewTemplate,downloadCurrentSettlementExcel,downloadSettlementExcel,downloadSettlementAnomalyPhotos});
ensureSettlementUi();renderSettlementCounts();applyUpdatedTaskLabels();
})();
