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
  schemas: { inventory: {}, stockDetail: {} },
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
assert.equal(customerRows.length, 1, '판매처별 표기에는 저장한 판매처 묶음만 표시');
assert.ok(customerRows.every(row => row.isCustomerGroupSummary), '미지정 판매처 개별행은 판매처별 표기에서 제외');
inventoryRoot.setInventoryDisplayMode('CUSTOMER');
assert.equal(inventoryRoot.schemas.inventory.cols[0][0], '판매처', '재고표기 방식을 판매처별 열 구성으로 전환');
assert.equal(inventoryRoot.schemas.inventory.rows()[0].customerName, '판매처 A', '판매처별 표기는 저장된 판매처 묶음만 조회');
const offerGroups = inventoryRoot.mesAggregateInventoryOfferRows([
  { grade: 'IN 718', netWeight: 1250 },
  { grade: 'IN 718', netWeight: 750 },
  { grade: '70/30 CuNi', netWeight: 500 },
]);
assert.equal(offerGroups.length, 2, 'Offer List는 같은 강종을 한 행으로 자동 합산');
assert.equal(offerGroups.find(row => row.grade === 'IN 718').netWeight, 2000, 'Offer 강종별 Total Net Weight 합계');
const inventoryFeatureSource = read('mes-inventory-family-stock-v2.js');
assert.match(inventoryFeatureSource, /currentView==='stockDetail'.*mes-stock-detail-offer/, '재고상세 화면에 판매처 재고 OFFER 버튼 표시');
assert.match(inventoryFeatureSource, /mes-stock-detail-offer-preview.*Materials to offer 미리보기/, '재고상세 화면에 Materials to offer 미리보기 버튼 표시');
assert.match(inventoryFeatureSource, /mes-stock-detail-offer-excel.*Materials to offer Excel/, '재고상세 화면에 Materials to offer Excel 버튼 표시');

inventoryState.splits.push({ id: 'S-WAIT', packageNo: 'PK-1', grade: 'IN 718', mainGrade: 'IN 718', weight: 80, status: 'CONFIRMED' });
inventoryState.waitingMoves.push({ id: 'PACK-WAIT', packageNo: 'PK-1', grade: 'IN 718', weight: 30, to: '포장대기 A', status: 'CONFIRMED' });
inventoryState.workWaits.push({ id: 'WORK-WAIT', packageNo: 'PK-2', grade: 'IN 718', weight: 40, location: '선별 작업장', status: 'WAITING' });
inventoryRoot.inventoryRows = () => [{ id: 'BAG-1', code: 'A-1', mainGrade: 'IN 718', nw: 50, packing: 3, gw: 53, location: '완료창고', status: 'ACTIVE' }];
const stockStages = inventoryRoot.mesStockDetailRows();
const in718Stock = stockStages.find(row => row.mainGrade === 'IN 718');
assert.equal(stockStages.length, 1, '재고상세는 같은 강종을 상태별 목록으로 나누지 않고 한 행으로 통합');
assert.equal(in718Stock.packingWait, 30, '한 행에 포장대기 재고량 표시');
assert.equal(in718Stock.workWait, 40, '한 행에 작업대기 재고량 표시');
assert.equal(in718Stock.completed, 50, '한 행에 완료포장 재고량 표시');
assert.equal(in718Stock.nw, 120, '한 행에 전체 재고량 합계 표시');
assert.equal(JSON.stringify(inventoryRoot.schemas.stockDetail.cols.map(column => column[0])), JSON.stringify(['품종','강종','소강종','포장대기(kg)','작업대기(kg)','완료포장(kg)','총재고(kg)','상세강종','보관위치']), '재고상세 열 순서');
const selectableOfferRows = inventoryRoot.mesInventoryOfferRows();
assert.ok(selectableOfferRows.some(row => row.statusLabel === '포장대기'), 'Offer 검색에 포장대기 재고 포함');
assert.ok(selectableOfferRows.some(row => row.statusLabel === '작업대기'), 'Offer 검색에 작업대기 재고 포함');
assert.ok(selectableOfferRows.some(row => row.statusLabel === '완료포장'), 'Offer 검색에 완료포장 재고 포함');

const settlementState = {
  pos: [{ id: 'P1', poNo: 'PO-1', packageNo: 'PK-1', company: '공급사', purchaseContractGrade: 'CUSTOMER 718', grade: '잘못된 원문', mainGrade: '잘못된 내부강종', weight: 100, unitPrice: 10, receivedAt: '2026-08-01', status: 'CONFIRMED' }],
  splits: [{ id: 'S1', packageNo: 'PK-1', productType: 'NI', mainGrade: 'IN 718', grade: '잘못된 분할강종', weight: 95, unitPrice: 10, memo: '정상', status: 'CONFIRMED' }],
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
const settlementDetail = settlementRoot.mesSettlementData('PO-1');
assert.equal(settlementDetail.originalRows[0].description, 'CUSTOMER 718', '세틀 왼쪽은 거래처 계약 강종만 표시');
assert.equal(settlementDetail.actualRows[0].description, 'NI · IN 718', '세틀 오른쪽은 검수확정 최종강종만 표시');
assert.match(overseasPreview, /Customer Grade/);
assert.match(overseasPreview, /Final Grade/);
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
assert.match(qrSource, /6 · QR 업무 바로가기/, '현장관리 QR 업무 바로가기를 6번으로 이동');
assert.doesNotMatch(qrSource, /\.qr-fast-home\{grid-column:1\/-1/, '6번 QR 카드는 5번과 같은 절반 너비');
assert.match(qrSource, /\.home-manual-wide\{grid-column:1\/-1\}/, '7번 그림 메뉴얼은 기존 6번처럼 전체 너비');
assert.match(qrSource, /tutorial\.classList\.add\('home-manual-wide'\)/, '그림 메뉴얼 카드에 전체 너비 클래스 적용');
assert.match(zebraSource, /printZebraLocationQr/, '장소 QR을 Zebra ZD421 출력기로 연결');

const fieldHtml = read('stable-inspection-mobile-v4.html');
const manualSource = read('mes-manual-v1.js');
const executiveSource = read('mes-executive-dashboard-v1.js');
assert.match(fieldHtml, /7 · 그림 메뉴얼/, '현장관리 그림 메뉴얼을 7번으로 이동');
assert.match(manualSource, /id:'manual',icon:'14'/, 'MES 튜토리얼을 14번으로 변경');
assert.match(executiveSource, /<b>15<\/b> 임원용 현황판/, 'MES 임원용 현황판을 15번으로 변경');

const apiSource = read('api/scrap-state.js');
assert.match(apiSource, /'purchaseRequests'/, '입고요청 자료가 서버 저장 허용 목록에 포함');
assert.match(apiSource, /'shippingRequests'/, '출하요청 자료가 서버 저장 허용 목록에 포함');

console.log('PASS 2026-08-21 MES grade, settlement, customer inventory, location QR regressions');
