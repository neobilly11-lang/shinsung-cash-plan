import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = name => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

const mesSource = read('mes.html');
const gradeHelpers = mesSource.match(/function broadAlloyGrade\(value\).*?function purchaseContractGrade\(row\).*?\n/s)?.[0];
assert.ok(gradeHelpers, '구매 계약 강종 보정 함수를 찾을 수 있어야 함');
const gradeContext = {};
vm.runInNewContext(gradeHelpers, gradeContext);
assert.equal(
  gradeContext.purchaseContractGrade({ grade: 'NICKEL ALLOY', mainGrade: 'IN 718' }),
  'IN 718',
  '넓은 합금 분류보다 실제 상세 강종을 우선',
);
assert.equal(
  gradeContext.purchaseContractGrade({ purchaseContractGrade: 'NICKEL ALLOY', grade: 'IN 939', mainGrade: 'IN 939' }),
  'NICKEL ALLOY',
  '명시적으로 저장된 계약 강종은 변경하지 않음',
);
assert.equal(
  gradeContext.purchaseContractGrade({ grade: '70/30 CuNi', mainGrade: 'CU' }),
  '70/30 CuNi',
  '구체적인 원 강종은 그대로 유지',
);

const inventoryState = {
  expectedSalesOrders: [], inventoryGradeMappings: [], purchaseRequests: [],
  gradeMasters: [], gradeTypes: {}, mainGrades: [], subGrades: [],
  splits: [], losses: [], inputs: [], bags: [], salesOrders: [], shipments: [],
  shipmentAllocations: [], waitingMoves: [], workWaits: [], domesticReceipts: [],
  pos: [
    { id: 'P1', packageNo: 'PK-1', poNo: 'PO-1', grade: 'NICKEL ALLOY', mainGrade: 'IN 718', weight: 100, receivedAt: '2026-08-01', status: 'CONFIRMED' },
    { id: 'P2', packageNo: 'PK-2', poNo: 'PO-2', grade: 'COPPER ALLOY', mainGrade: '70/30 CuNi', weight: 200, receivedAt: '2026-08-01', status: 'CONFIRMED' },
    { id: 'P3', packageNo: 'PK-3', poNo: 'PO-3', purchaseContractGrade: 'NICKEL ALLOY', grade: 'IN 939', mainGrade: 'IN 939', weight: 50, receivedAt: '2026-08-01', status: 'CONFIRMED' },
  ],
};
const inventoryDocument = {
  documentElement: { dataset: {} },
  addEventListener() {},
  querySelector() { return null; },
};
const inventoryRoot = {
  state: inventoryState,
  schemas: { inventory: {} },
  defaults: value => value,
  fmt: value => String(value),
  $: () => null,
  currentUserName: () => '테스트',
  inventoryRows: () => [],
  mesSection: () => '',
  commit: async () => true,
  render() {},
  toast() {},
};
vm.runInNewContext(read('mes-inventory-family-stock-v2.js'), {
  window: inventoryRoot,
  document: inventoryDocument,
  location: { search: '' },
  localStorage: { getItem: () => null, setItem() {} },
  navigator: {},
  URLSearchParams,
  URL,
  console,
  requestAnimationFrame() {},
  setTimeout() {},
});
const gradeRows = inventoryRoot.mesForecastRows(false).filter(row => !row.isFamilySummary);
const nickel = gradeRows.find(row => row.mainGrade === 'IN 718');
const copper = gradeRows.find(row => row.mainGrade === '70/30 CuNi');
const explicitGeneric = gradeRows.find(row => row.mainGrade === 'NICKEL ALLOY');
assert.equal(nickel.customerGrade, 'IN 718', '재고현황 거래처 강종도 상세 강종으로 복구');
assert.equal(copper.customerGrade, '70/30 CuNi', 'COPPER ALLOY 오표기를 CuNi 상세 강종으로 복구');
assert.equal(explicitGeneric.customerGrade, 'NICKEL ALLOY', '명시 계약 강종은 재고현황에서도 보존');

inventoryState.inventoryGradeMappings.push({
  id: 'CUSTOMER-1', kind: 'CUSTOMER_GROUP', customerName: '판매처 A',
  memberIds: [nickel.id, copper.id], memberLabels: [nickel.gradeLabel, copper.gradeLabel],
});
const customerRows = inventoryRoot.mesCustomerInventoryRows(false);
const customerGroup = customerRows.find(row => row.isCustomerGroupSummary);
assert.equal(customerGroup.customerName, '판매처 A', '판매처 이름으로 묶음 표시');
assert.equal(customerGroup.members.length, 2, '선택한 두 강종을 판매처 묶음으로 구성');
assert.equal(customerGroup.expectedStock, 300, '판매처별 예상재고 합산');
assert.ok(customerRows.some(row => row.isCustomerUnassigned), '묶지 않은 재고는 미지정 판매처로 유지');
inventoryRoot.setInventoryDisplayMode('CUSTOMER');
assert.equal(inventoryRoot.schemas.inventory.cols[0][0], '판매처', '재고표기 방식을 판매처별 열 구성으로 전환');
assert.equal(inventoryRoot.schemas.inventory.rows()[0].customerName, '미지정 판매처', '판매처별 표기는 판매처 이름 순으로 조회');

const settlementState = {
  pos: [{ id: 'P1', poNo: 'PO-1', packageNo: 'PK-1', company: '공급사', grade: 'IN 718', weight: 100, unitPrice: 10, receivedAt: '2026-08-01', status: 'CONFIRMED' }],
  splits: [{ id: 'S1', packageNo: 'PK-1', mainGrade: 'IN 718', weight: 95, unitPrice: 10, memo: '정상', status: 'CONFIRMED' }],
  losses: [], orderPhotos: [],
};
const settlementDocument = {
  head: { appendChild() {} },
  createElement() { return { id: '', textContent: '' }; },
  getElementById() { return null; },
  querySelectorAll() { return []; },
};
const settlementRoot = {
  __mesRuntime: { getState: () => settlementState },
  document: settlementDocument,
  addEventListener() {},
};
vm.runInNewContext(read('mes-settlement-exact-v1.js'), {
  window: settlementRoot,
  document: settlementDocument,
  console,
  setTimeout() {},
  requestAnimationFrame() {},
  Blob,
  URL,
});
const overseasPreview = settlementRoot.mesSettlementPreview(settlementRoot.mesSettlementData('PO-1'), 'OVERSEAS');
assert.doesNotMatch(overseasPreview, /<th>Photo<\/th>/, '세틀 미리보기에서 Photo 열 제거');
assert.match(overseasPreview, /Actual Value After Inspection<\/th>/);
assert.match(overseasPreview, /colspan="5"/, '사진 열 제거 후 실제 검수 영역은 5열');
const settlementSource = read('mes-settlement-exact-v1.js');
assert.match(settlementSource, /hideColumn\(doc,10\)/, '다운로드 Excel에서도 Photo 열 숨김');
assert.doesNotMatch(settlementSource, /setSmall\(doc,'J12','Photo'/, '다운로드 Excel Photo 헤더 제거');

const qrSource = read('field-unified-qr-workflow-v1.js');
const zebraSource = read('field-zebra-zd421-labels-v1.js');
assert.match(qrSource, /inventoryLocation=/, '재고 장소 전용 QR 주소 생성');
assert.match(qrSource, /printInventoryLocationQr/, '재고 장소 QR 출력 기능');
assert.match(qrSource, /④ 재고이동에 선택되었습니다/, '7번 QR 이동에서 4번 재고이동 안내');
assert.match(qrSource, /renderMoveLocationChoices/, '이동 후 장소 선택창 자동 열기');
assert.match(zebraSource, /printZebraLocationQr/, '장소 QR을 Zebra ZD421 출력기로 연결');

const apiSource = read('api/scrap-state.js');
assert.match(apiSource, /'purchaseRequests'/, '입고요청 자료가 서버 저장 허용 목록에 포함');
assert.match(apiSource, /'shippingRequests'/, '출하요청 자료가 서버 저장 허용 목록에 포함');

console.log('PASS 2026-08-21 MES grade, settlement, customer inventory, location QR regressions');
