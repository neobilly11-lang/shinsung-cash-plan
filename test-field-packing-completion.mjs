import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read=name=>fs.readFileSync(new URL(`./${name}`,import.meta.url),'utf8');
const source=read('field-packing-completion-v1.js');
const loader=read('field-startup-watchdog-v1.js');

assert.match(loader,/field-packing-completion-v1\.js\?v=20260822-1/,'현장관리 시작 시 포장완료 모듈 로드');
assert.match(loader,/data-packing-completion-v1|packingCompletionV1/,'포장완료 모듈 중복 로드 방지');
assert.match(source,/>포장완료하기<\/button>/,'완료번호 생성 아래 포장완료하기 버튼 제공');
assert.match(source,/저장된 완료번호 확인/,'버튼을 누르면 저장된 완료번호 자료 표시');
assert.match(source,/포장완료확정 · QR 프린터하기/,'포장완료확정과 QR 프린터 흐름 연결');
assert.match(source,/showCompletionQr\(bag\)/,'확정한 완료번호 QR 미리보기 열기');
assert.match(source,/PACKING_COMPLETE_CONFIRM/,'기존 bags와 auditLogs에 포장완료 이력 저장');
assert.match(source,/packingCompletedAt/,'완료번호에 포장완료 시각을 호환 필드로 추가');
assert.match(source,/selectAllBatchStockMoves\('false'\)|selectAllBatchStockMoves\(false\)/,'기존 재고이동 선택 해제 후 대상 지정');
assert.match(source,/toggleBatchStockMove\(bag\.id,true\)/,'확정한 완료번호를 ④ 재고이동에 자동 선택');
assert.match(source,/destination\?\.focus/,'QR 창을 닫은 뒤 이동 후 장소로 커서 이동');
assert.match(source,/renderMoveLocationChoices/,'이동 후 저장장소 선택 목록 자동 표시');
assert.match(source,/QR 닫기 · ④ 이동 후 장소 선택/,'QR 프린터 다음 단계 안내 표시');

const root={};
const context={
  window:root,
  document:{readyState:'complete',getElementById(){return null},addEventListener(){}},
  state:{bags:[]},
  bagStockWeight:id=>id==='B1'?1250:0,
  bagPackagingWeight:()=>3,
  bagCode:bag=>bag.completionNo,
  bagSourcePackageNos:()=>['P000123'],
  kg:value=>`${Number(value).toLocaleString('ko-KR')} kg`,
  num:value=>Number(value)||0,
  setTimeout(){},
  console,
};
vm.runInNewContext(source,context);
const row=root.__fieldPackingCompletionV1.bagReviewRow({id:'B1',completionNo:'A-20260822-1',grade:'NI · IN 718 · VS',packagingWeight:3,status:'OPEN'});
assert.equal(row.net,1250,'저장된 완료번호의 실제 투입 N/W 표시');
assert.equal(row.gross,1253,'N/W와 포장무게로 G/W 자동 계산');
assert.equal(row.sourceNos[0],'P000123','연결된 사내입고번호 표시');
assert.equal(root.__fieldPackingCompletionV1.reviewStatus(row),'포장완료 확정대기','중량이 있는 미확정 자료 상태 표시');

console.log('PASS field packing completion, QR print and stock move focus flow');
