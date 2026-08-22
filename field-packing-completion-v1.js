(function(){
'use strict';

const doc=document;
const byId=id=>doc.getElementById(id);
const safe=value=>typeof esc==='function'
  ?esc(String(value??''))
  :String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const amount=value=>typeof num==='function'?num(value):Number(value)||0;
const weight=value=>typeof kg==='function'?kg(value):`${amount(value).toLocaleString('ko-KR')} kg`;

let selectedBagId='';
let saving=false;
let moveAfterQrBagId='';

function activeSavedBags(){
  return (Array.isArray(state?.bags)?state.bags:[])
    .filter(bag=>!['DEPLETED','SHIPPED'].includes(bag.status))
    .slice()
    .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))||String(bagCode(b)).localeCompare(String(bagCode(a)),'ko',{numeric:true}));
}

function bagReviewRow(bag){
  const net=amount(typeof bagStockWeight==='function'?bagStockWeight(bag.id):0);
  const packaging=amount(typeof bagPackagingWeight==='function'?bagPackagingWeight(bag):bag.packagingWeight);
  return{
    bag,
    id:bag.id,
    code:typeof bagCode==='function'?bagCode(bag):bag.completionNo||bag.bagNo||'',
    grade:bag.grade||'강종 미지정',
    net,
    gross:net+packaging,
    packaging,
    location:bag.location||'미지정',
    sourceNos:typeof bagSourcePackageNos==='function'?bagSourcePackageNos(bag.id):[],
    confirmed:Boolean(bag.packingCompletedAt||bag.status==='COMPLETE'),
  };
}

function reviewStatus(row){
  if(row.confirmed)return'포장완료 확정';
  return row.net>0?'포장완료 확정대기':'완료재고 투입 전';
}

function addStyle(){
  if(byId('packingCompletionStyle'))return;
  const style=doc.createElement('style');
  style.id='packingCompletionStyle';
  style.textContent=`
.packing-completion-open{min-height:66px;font-size:20px;margin-top:12px}
.packing-completion-panel{display:none;margin-top:14px;border-top:2px dashed #b9cec5;padding-top:14px}.packing-completion-panel.on{display:block}
.packing-completion-list{max-height:48vh;overflow:auto;overscroll-behavior:contain;margin-top:10px}
.packing-completion-row{display:grid;grid-template-columns:34px 1fr;gap:11px;align-items:center;border:2px solid #d8e4df;border-radius:17px;background:#fff;padding:14px;margin:9px 0;cursor:pointer}
.packing-completion-row input{width:30px;height:30px;min-height:30px;margin:0}.packing-completion-row.on{border-color:#087c66;background:#eafff7;box-shadow:0 0 0 3px #087c6622}
.packing-completion-row b,.packing-completion-row small{display:block}.packing-completion-row small{margin-top:4px;color:#53665f}.packing-completion-row .status-chip{display:inline-block;margin-top:6px}
.packing-completion-confirm{width:100%;min-height:66px;margin-top:12px;font-size:20px}
@media(max-width:700px){.packing-completion-list{max-height:none;overflow:visible}.packing-completion-row{padding:13px 12px}}
`;
  doc.head.appendChild(style);
}

function addUi(){
  const completionInput=byId('completionNo'),card=completionInput?.closest('.card'),message=byId('bagMsg');
  if(!card||!message||byId('packingCompletionOpen'))return;
  message.insertAdjacentHTML('afterend',`
    <button type="button" id="packingCompletionOpen" class="btn warn packing-completion-open" style="width:100%" onclick="openPackingCompletionReview()">포장완료하기</button>
    <div id="packingCompletionPanel" class="packing-completion-panel">
      <div class="actions" style="justify-content:space-between;align-items:center">
        <b>저장된 완료번호 확인</b>
        <button type="button" class="btn" onclick="closePackingCompletionReview()">닫기</button>
      </div>
      <p style="color:var(--muted)">저장된 완료번호의 강종·중량·포장무게를 확인하고 포장완료를 확정하세요.</p>
      <div id="packingCompletionSummary" class="msg"></div>
      <div id="packingCompletionList" class="packing-completion-list"></div>
      <button type="button" id="packingCompletionConfirm" class="btn primary packing-completion-confirm" onclick="confirmPackingCompletion()">포장완료확정 · QR 프린터하기</button>
      <div id="packingCompletionMsg" class="msg"></div>
    </div>`);
}

function selectedOrPreferredBag(rows){
  const selected=rows.find(row=>row.id===selectedBagId);
  if(selected)return selected;
  const current=byId('bagSelect')?.value||'';
  return rows.find(row=>row.id===current)||rows.find(row=>row.net>0&&!row.confirmed)||rows.find(row=>row.net>0)||rows[0]||null;
}

function renderPackingCompletionReview(){
  addUi();
  const target=byId('packingCompletionList'),summary=byId('packingCompletionSummary');
  if(!target||!summary)return;
  const rows=activeSavedBags().slice(0,50).map(bagReviewRow),preferred=selectedOrPreferredBag(rows);
  selectedBagId=preferred?.id||'';
  const ready=rows.filter(row=>row.net>0&&!row.confirmed).length;
  summary.className='msg on';
  summary.textContent=rows.length?`저장 완료번호 ${rows.length}건 · 포장완료 확정대기 ${ready}건`:'저장된 완료번호가 없습니다.';
  target.innerHTML=rows.length?rows.map(row=>`
    <label class="packing-completion-row ${row.id===selectedBagId?'on':''}">
      <input type="radio" name="packingCompletionBag" value="${safe(row.id)}" ${row.id===selectedBagId?'checked':''} onchange="selectPackingCompletion(this.value)">
      <span>
        <b>${safe(row.code)} · ${safe(row.grade)}</b>
        <small>N/W ${weight(row.net)} · G/W ${weight(row.gross)} · 포장무게 ${weight(row.packaging)}</small>
        <small>현재 장소 ${safe(row.location)} · 사내입고번호 ${row.sourceNos.map(safe).join(', ')||'투입 이력 없음'}</small>
        <span class="status-chip ${row.net<=0?'warn':''}">${safe(reviewStatus(row))}</span>
      </span>
    </label>`).join(''):'<div class="card">먼저 새 완료번호를 생성하고 검수확정 재고를 투입하세요.</div>';
}

function selectPackingCompletion(id){
  selectedBagId=String(id||'');
  renderPackingCompletionReview();
}

function openPackingCompletionReview(){
  addUi();
  renderPackingCompletionReview();
  const panel=byId('packingCompletionPanel');
  panel?.classList.add('on');
  setTimeout(()=>panel?.scrollIntoView({behavior:'smooth',block:'start'}),40);
}

function closePackingCompletionReview(){
  byId('packingCompletionPanel')?.classList.remove('on');
}

function setCompletionMessage(text,error=false){
  const target=byId('packingCompletionMsg');
  if(!target)return;
  target.className='msg on'+(error?' err':'');
  target.textContent=text;
}

function prepareStockMove(bag){
  if(typeof ensureBatchStockMoveUi==='function')ensureBatchStockMoveUi();
  if(typeof toggleBatchStockMoveSearchPanel==='function')toggleBatchStockMoveSearchPanel(true);
  if(typeof selectAllBatchStockMoves==='function')selectAllBatchStockMoves(false);
  const search=byId('stockMoveCompletionGradeSearch'),before=byId('stockMoveBeforeLocationSearch'),destination=byId('moveLocation');
  if(search)search.value=bagReviewRow(bag).code;
  if(before)before.value='';
  if(destination)destination.value='';
  if(typeof renderBatchStockMoveSearch==='function')renderBatchStockMoveSearch();
  if(typeof toggleBatchStockMove==='function')toggleBatchStockMove(bag.id,true);
  if(typeof msg==='function')msg('moveInfo',`${bagReviewRow(bag).code} 포장완료 재고가 ④ 재고이동에 자동 선택되었습니다. 이동 후 장소를 선택하세요.`);
}

function focusStockMoveDestination(bagId){
  const bag=(state.bags||[]).find(row=>row.id===bagId);
  if(!bag)return;
  show('repack');
  prepareStockMove(bag);
  const destination=byId('moveLocation');
  setTimeout(()=>{
    destination?.scrollIntoView({behavior:'smooth',block:'center'});
    try{destination?.focus({preventScroll:true})}catch(_){destination?.focus()}
    if(typeof renderMoveLocationChoices==='function')renderMoveLocationChoices();
  },140);
}

async function confirmPackingCompletion(){
  if(saving)return;
  const bag=(state.bags||[]).find(row=>row.id===selectedBagId&&!['DEPLETED','SHIPPED'].includes(row.status)),row=bag&&bagReviewRow(bag);
  if(!bag)return setCompletionMessage('포장완료할 저장 자료를 선택하세요.',true);
  if(row.net<=0)return setCompletionMessage(`${row.code}에 투입된 완료재고 중량이 없습니다. 먼저 검수확정 재고를 완료번호에 이동하세요.`,true);
  const backup=JSON.parse(JSON.stringify(state)),now=new Date().toISOString(),operator=typeof currentUserName==='function'?currentUserName():'';
  saving=true;
  if(byId('packingCompletionConfirm'))byId('packingCompletionConfirm').disabled=true;
  try{
    if(!bag.packingCompletedAt){
      bag.status='COMPLETE';
      bag.packingCompletedAt=now;
      bag.packingCompletedBy=operator;
      bag.updatedAt=now;
      if(!Array.isArray(state.auditLogs))state.auditLogs=[];
      state.auditLogs.push({id:crypto.randomUUID(),action:'PACKING_COMPLETE_CONFIRM',bagId:bag.id,completionNo:row.code,grade:row.grade,netWeight:row.net,grossWeight:row.gross,operatorName:operator,createdAt:now});
      await saveState();
    }
    prepareStockMove(bag);
    moveAfterQrBagId=bag.id;
    pendingPackingFocusId='';
    const continueButton=byId('completionQrContinue');
    if(continueButton)continueButton.textContent='QR 닫기 · ④ 이동 후 장소 선택';
    showCompletionQr(bag);
    setCompletionMessage(`${row.code} 포장완료를 확정했습니다. QR을 프린터한 뒤 닫으면 이동 후 장소 선택으로 자동 이동합니다.`);
    if(typeof showFlowToast==='function')showFlowToast(`${row.code} 포장완료확정 · QR 프린터 준비완료`,2400);
  }catch(error){
    state=typeof defaults==='function'?defaults(backup):backup;
    if(typeof renderAll==='function')renderAll();
    setCompletionMessage('포장완료확정 저장 실패: '+error.message,true);
  }finally{
    saving=false;
    if(byId('packingCompletionConfirm'))byId('packingCompletionConfirm').disabled=false;
  }
}

function wrapQrClose(){
  const previous=window.closeCompletionQr;
  if(typeof previous!=='function'||previous.__packingCompletionMove)return;
  const wrapped=function(){
    const bagId=moveAfterQrBagId;
    moveAfterQrBagId='';
    const result=previous.apply(this,arguments);
    const continueButton=byId('completionQrContinue');
    if(continueButton)continueButton.textContent='QR 닫기 · 다음 입력칸으로';
    if(bagId)setTimeout(()=>focusStockMoveDestination(bagId),80);
    return result;
  };
  wrapped.__packingCompletionMove=true;
  window.closeCompletionQr=wrapped;
}

function boot(){
  addStyle();
  addUi();
  wrapQrClose();
  const previous=window.renderAll;
  if(typeof previous==='function'&&!previous.__packingCompletionReview){
    const wrapped=function(){
      const result=previous.apply(this,arguments);
      addUi();
      if(byId('packingCompletionPanel')?.classList.contains('on'))renderPackingCompletionReview();
      return result;
    };
    wrapped.__packingCompletionReview=true;
    window.renderAll=wrapped;
  }
}

window.openPackingCompletionReview=openPackingCompletionReview;
window.closePackingCompletionReview=closePackingCompletionReview;
window.renderPackingCompletionReview=renderPackingCompletionReview;
window.selectPackingCompletion=selectPackingCompletion;
window.confirmPackingCompletion=confirmPackingCompletion;
window.__fieldPackingCompletionV1={bagReviewRow,reviewStatus};

if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0));
else setTimeout(boot,0);
})();
