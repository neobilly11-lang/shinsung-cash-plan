import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=name=>fs.readFileSync(new URL(`./${name}`,import.meta.url),'utf8');
const analyzerSource=read('field-inspection-subgrade-rules-v1.js');
const loaderSource=read('field-startup-watchdog-v1.js');
const packageSource=read('import-package-split-v1.js');
const manualSource=read('field-manual-v2.js');

assert.match(loaderSource,/field-inspection-subgrade-rules-v1\.js\?v=20260822-1/,'현장관리에서 소강종 분석기 규칙 모듈 로드');

let rows=[{subGrade:'VT'}];
const root={
  analyzerRequiredFor(){return true;},
  inspectionBatchRowsFromForm(){return rows;},
  state:{splits:[]},
};
const document={readyState:'complete',getElementById(){return null;},addEventListener(){},createTextNode(value){return{nodeValue:value};}};
root.window=root;
root.document=document;
root.console=console;
vm.runInNewContext(analyzerSource,root);

const analyzerApi=root.__fieldInspectionSubgradeRulesV1;
assert.equal(analyzerApi.analyzerOptionalRows([{subGrade:'VT'}]),true,'VT 분석기 사진 선택사항');
assert.equal(analyzerApi.analyzerOptionalRows([{subGrade:'at'}]),true,'AT 대소문자와 공백 정규화');
assert.equal(analyzerApi.analyzerOptionalRows([{subGrade:'TURNINGS'}]),true,'TURNINGS 분석기 사진 선택사항');
assert.equal(analyzerApi.analyzerOptionalRows([{subGrade:'VT'},{subGrade:'AT'}]),true,'예외 소강종만 있는 다중 행 선택사항');
assert.equal(analyzerApi.analyzerOptionalRows([{subGrade:'VT'},{subGrade:'VS'}]),false,'일반 소강종이 섞인 다중 행은 분석기 필수');
assert.equal(root.analyzerRequiredFor({}),false,'현재 VT 입력 행의 저장 검증에서 분석기 생략');
rows=[{subGrade:'VS'}];
assert.equal(root.analyzerRequiredFor({}),true,'일반 소강종은 기존 분석기 필수 규칙 유지');
assert.match(analyzerSource,/＋ 분석기 사진 선택사항/,'필수 입력 자동안내도 건너뛰는 선택사항 라벨 표시');
assert.match(analyzerSource,/VT·AT·TURNINGS 소강종은 분석기 사진이 선택사항/,'사용자 안내 표시');

const helperSource=[
  packageSource.match(/function normalizedMergeValue\(value\)\{[^}]+\}/)?.[0],
  packageSource.match(/function mergeValidation\(rows\)\{[\s\S]*?\n  \}/)?.[0],
].join('\n');
const helperContext={};
vm.runInNewContext(`${helperSource};this.mergeValidation=mergeValidation;`,helperContext);
const validRows=[
  {poNo:'PO-1',company:'신성',grade:'NI · IN 718 · VT'},
  {poNo:'po-1',company:' 신성 ',grade:'ni · in 718 · vt'},
];
assert.equal(helperContext.mergeValidation(validRows),'','같은 P.O·거래처·강종의 2개 이상 패키지 합치기 허용');
assert.match(helperContext.mergeValidation(validRows.slice(0,1)),/2개 이상/,'한 패키지 합치기 차단');
assert.match(helperContext.mergeValidation([validRows[0],{...validRows[1],poNo:'PO-2'}]),/같은 P\.O/,'다른 P.O 합치기 차단');
assert.match(helperContext.mergeValidation([validRows[0],{...validRows[1],company:'다른 거래처'}]),/같은 거래처/,'다른 거래처 합치기 차단');
assert.match(helperContext.mergeValidation([validRows[0],{...validRows[1],grade:'NI · IN 718 · VS'}]),/같은 강종/,'다른 강종 합치기 차단');

assert.match(packageSource,/패키지 나누고 합치기/,'입고방법 명칭 변경');
assert.match(packageSource,/IMPORT_PACKAGE_MERGE/,'패키지 합치기 감사이력 저장');
assert.match(packageSource,/mergedInto=target\.packageNo/,'합쳐진 원번호의 추적 연결 저장');
assert.match(packageSource,/internalPackageNo:target\.packageNo/,'구매요청 품목을 유지 번호로 재연결');
assert.match(packageSource,/nw:totalNw,gw:totalGw/,'구매요청 N/W·G/W 합산');
assert.match(packageSource,/state=defaults\(backup\)/,'저장 실패 시 기존 자료 복원');
assert.match(manualSource,/패키지 나누고 합치기/,'현장관리 설명도 새 명칭과 기능으로 변경');

let uiCreated=false;
const elements=new Map();
const element=id=>{
  if(!elements.has(id))elements.set(id,{id,value:'',innerHTML:'',textContent:'',disabled:false,classList:{toggle(){}},focus(){},scrollIntoView(){}});
  return elements.get(id);
};
const mergeRuntime={
  console,
  document:{
    getElementById(){return null;},
    createElement(){return{};},
    head:{appendChild(){}},
    documentElement:{dataset:{}},
  },
  state:{
    pos:[
      {id:'POS1',packageNo:'P0001',packingPackageNo:'SUP-1',poNo:'PO-1',company:'신성',grade:'NI · IN 718 · VT',weight:100,netWeight:100,grossWeight:103,status:'CONFIRMED',receiptStatus:'WAITING'},
      {id:'POS2',packageNo:'P0002',packingPackageNo:'SUP-2',poNo:'PO-1',company:'신성',grade:'NI · IN 718 · VT',weight:200,netWeight:200,grossWeight:204,status:'CONFIRMED',receiptStatus:'WAITING'},
    ],
    purchaseRequests:[{id:'REQ1',poNo:'PO-1',items:[{internalPackageNo:'P0001',packageNo:'SUP-1',nw:100,gw:103},{internalPackageNo:'P0002',packageNo:'SUP-2',nw:200,gw:204}]}],
    auditLogs:[],
  },
  selectedImportPoNo:'PO-1',
  E(id){
    if(id==='importReceiptDirect')return{insertAdjacentHTML(){uiCreated=true;}};
    if(id==='importReceiptSplit')return uiCreated?element(id):null;
    if(id==='importReceiptMethodChoices')return null;
    return element(id);
  },
  num:value=>Number(value)||0,
  kg:value=>`${Number(value)||0} kg`,
  esc:value=>String(value??''),
  safeArray:value=>Array.isArray(value)?value:[],
  stateClone:value=>structuredClone(value),
  defaults:value=>value,
  importWaitingPackages(){return mergeRuntime.state.pos.filter(row=>row.status!=='CANCELLED');},
  currentUserName(){return'테스트';},
  renderImportReceiptMethod(){},
  workflowDraftViewLabel(id){return id;},
  show(){},
  requestAnimationFrame(fn){fn();},
  queueWorkflowDraftStructuralSave(){},
  clearWorkflowDrafts(){},
  renderImportReceiptHomeCount(){},
  renderAll(){},
  showFlowToast(){},
  msg(){},
  beginSaveProgress(){},
  endSaveProgress(){},
  confirm(){return true;},
  saveState:async()=>{},
  crypto:{randomUUID:(()=>{let id=0;return()=>`ID${++id}`;})()},
};
mergeRuntime.window=mergeRuntime;
vm.runInNewContext(packageSource,mergeRuntime);
mergeRuntime.setImportPackageMode('MERGE');
mergeRuntime.toggleImportMergePackage('P0001',true);
mergeRuntime.toggleImportMergePackage('P0002',true);
await mergeRuntime.saveImportPackageMerge();
assert.equal(mergeRuntime.state.pos[0].netWeight,300,'합친 대상의 N/W 합산');
assert.equal(mergeRuntime.state.pos[0].grossWeight,307,'합친 대상의 G/W 합산');
assert.equal(mergeRuntime.state.pos[1].status,'CANCELLED','흡수된 패키지는 삭제 대신 취소 상태 유지');
assert.equal(mergeRuntime.state.pos[1].mergedInto,'P0001','흡수된 패키지에서 유지 번호로 추적 가능');
assert.equal(mergeRuntime.state.purchaseRequests[0].items.length,1,'구매요청의 선택 패키지 품목도 하나로 병합');
assert.equal(mergeRuntime.state.purchaseRequests[0].items[0].nw,300,'구매요청 품목 N/W 합산 반영');
assert.equal(mergeRuntime.state.auditLogs.at(-1).action,'IMPORT_PACKAGE_MERGE','합치기 감사이력 생성');

console.log('PASS inspection analyzer exceptions and import package split/merge flow');
