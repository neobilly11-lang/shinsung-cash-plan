import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./mes-cash-funding-v1.js', import.meta.url), 'utf8');
class MutationObserver { observe() {} }
const context = { module: { exports: {} }, exports: {}, console, MutationObserver };
context.globalThis = context;
vm.runInNewContext(source, context);
const cash = context.module.exports;

assert.ok(cash, '자금현황 계산 API를 내보내야 함');

const state = {
  pos: [
    {
      id: 'PO-1-A', poNo: 'PO-1', company: '해외 공급사', grade: 'IN 718',
      weight: 60, unitPrice: 10, amount: 600, currency: 'USD', exchangeRate: 1300,
      cashPaymentDepositChecked: true, cashPaymentDepositAmount: 300,
      cashPaymentBalanceChecked: false, cashPaymentBalanceAmount: 700,
      cashPaymentDueDate: '2026-08-25', cashPaymentUpdatedAt: '2026-08-22T01:00:00.000Z', status: 'CONFIRMED',
    },
    {
      id: 'PO-1-B', poNo: 'PO-1', company: '해외 공급사', grade: 'IN 718',
      weight: 40, unitPrice: 10, amount: 400, currency: 'USD', exchangeRate: 1300,
      cashPaymentDepositChecked: true, cashPaymentDepositAmount: 300,
      cashPaymentBalanceChecked: false, cashPaymentBalanceAmount: 700,
      cashPaymentDueDate: '2026-08-25', cashPaymentUpdatedAt: '2026-08-22T01:00:00.000Z', status: 'CONFIRMED',
    },
    {
      id: 'PO-2', poNo: 'PO-2', company: '국내 공급사', grade: 'STS 304',
      weight: 100, unitPrice: 10000, amount: 1000000, currency: 'KRW',
      cashPaymentDueDate: '2026-08-23', status: 'CONFIRMED',
    },
  ],
  salesOrders: [
    {
      id: 'SO-1', soNo: 'SO-1', customer: '판매처 A', grade: 'IN 718',
      weight: 100, unitPrice: 20000, amount: 2000000, currency: 'KRW',
      cashPaymentDepositChecked: true, cashPaymentDepositAmount: 500000,
      cashPaymentBalanceChecked: false, cashPaymentBalanceAmount: 1500000,
      cashPaymentDueDate: '2026-08-30', status: 'WAITING',
    },
    {
      id: 'SO-2', soNo: 'SO-2', customer: '판매처 B', grade: 'TI',
      weight: 10, unitPrice: 100, amount: 1000, currency: 'KRW',
      cashPaymentDepositChecked: true, cashPaymentDepositAmount: 200,
      cashPaymentBalanceChecked: true, cashPaymentBalanceAmount: 700,
      cashPaymentExceptionType: 'CLAIM', cashPaymentDueDate: '2026-08-22', status: 'WAITING',
    },
  ],
  systemSettings: { mesCashFundingV1: { availableFunds: 500000 } },
};

const purchases = cash.orderGroups(state, 'purchase');
const po1 = purchases.find((row) => row.reference === 'PO-1');
assert.equal(po1.totalOriginal, 1000, '여러 P.O 품목의 거래통화 금액을 주문별로 합산');
assert.equal(po1.totalKrw, 1300000, '저장 환율로 원화 환산');
assert.equal(po1.calculation.status, '선금 30% 지불', '구매 선금 비율 자동 표기');
assert.equal(po1.calculation.outstandingAmount, 700, '선금 입력 후 잔금 자동 계산');
assert.equal(po1.outstandingKrw, 910000, '미지급잔금을 원화로 환산');

const cmmeRows = [
  [1632, 12.65, 228130.1], [1519, 12.65, 13800], [1664, 12.65, 11426], [1761, 12.65, 4477.8], [1719, 12.65, 17578],
  [1568, 12.65], [1586, 12.65], [1614, 12.65], [1680, 12.65], [1706, 12.65], [1585, 12.65], [1063, 12.65],
  [1005, 8.48], [644, 5.8], [1326, 5.8], [1317, 3.4], [1000, 13.8],
].map(([weight, unitPrice, purchaseAmount], index) => ({
  id: `CMME-${index + 1}`, poNo: 'CMME260701', weight, unitPrice,
  amount: Math.round(weight * unitPrice * 100) / 100,
  ...(purchaseAmount ? { purchaseAmount } : {}), currency: 'USD', exchangeRate: 1415, status: 'CONFIRMED',
}));
const cmme = cash.orderGroups({ pos: cmmeRows }, 'purchase')[0];
assert.equal(cmme.totalOriginal, 279803.25, '중량×단가와 일치하는 행 금액 합계로 CMME260701 구매금액 복구');
assert.equal(cmme.amountValidation.legacyTotalOriginal, 450283.4, '잘못 우선되던 purchaseAmount 합계를 진단용으로 보존');
assert.equal(cmme.amountValidation.correctedLines, 5, '불일치한 초기 5개 행을 자동 감지');
assert.equal(cmme.totalKrw, 395921598.75, '보정된 외화금액에 환율 적용');

const sales = cash.orderGroups(state, 'sales');
const so1 = sales.find((row) => row.reference === 'SO-1');
const so2 = sales.find((row) => row.reference === 'SO-2');
assert.equal(so1.calculation.status, '선금 25% 입금', '판매 선금 비율 자동 표기');
assert.equal(so2.calculation.status, '수금완료 · 클레임', '잔금 차액의 클레임 마감 표기');
assert.equal(so2.calculation.exceptionAmount, 100, '잔금 변경액과 계약잔금의 차이를 자동 계산');
assert.equal(so2.calculation.outstandingAmount, 0, '확정 차감액은 미수잔금에서 제외');
const agreedSale = cash.orderGroups({ salesOrders: [{ id: 'SO-AGREED', soNo: 'SO-AGREED', weight: 4502, unitPrice: 13.88, amount: 69400, currency: 'USD', status: 'WAITING' }] }, 'sales')[0];
assert.equal(agreedSale.totalOriginal, 69400, '판매 계약 총액 한 필드는 중량×단가와 달라도 기존 금액 보존');
assert.equal(agreedSale.amountValidation.corrected, false, '판매 계약금액을 자동으로 덮어쓰지 않음');

const report = cash.buildCashReport(state, {
  now: '2026-08-22',
  inventory: [{ id: 'INV-1', grade: 'IN 718', weight: 100, costPerKg: 3000, value: 300000, receivedAt: '2026-05-14' }],
  salesCostBasis: [{ id: 'COST-1', grade: 'IN 718', weight: 100, convertedAmount: 300000 }],
});
assert.equal(report.availableFunds, 500000, '현재 가용자금');
assert.equal(report.receivables, 1500000, '판매총액 - 수금액 - 확정차감');
assert.equal(report.payables, 1910000, '구매총액 - 지급액');
assert.equal(report.inventoryCost, 300000, '미판매재고 원가');
assert.equal(report.netWorkingCapital, 390000, '순운전자금 = 현재자금 + 미수금 + 미판매재고원가 - 구매미지급금');
assert.equal(report.inventoryAfter15Days, 300000, '입고 후 15일 이상 미판매재고 원가');
assert.equal(report.receivablesOver60Days, 0, '수금예정일 60일 이상 지난 미수잔금');
assert.equal(report.plannedSalesAmount, 2001000, '날짜와 관계없이 전체 미출하 판매계획 자금 반영');
assert.equal(report.sameGradeSalesCost, 300000, '미출하 판매계획과 동일강종 실제 매입원가 차감');
assert.equal(report.plannedSalesNet, 1701000, '판매계획자금 - 동일강종 판매원가');
assert.equal(report.missingPlannedCostWeight, 10, '동일강종 원가 미확인 판매계획 중량 경고');
assert.equal(report.forecast30, -909000, '30일 예상자금에 미출하 판매계획 순자금 추가');
assert.equal(report.shortageDate, '2026-08-23', '날짜별 누적 잔액 최초 0원 이하 날짜 경고');
assert.equal(report.inventory[0].bucket, '90~179일', '90일 이상 미판매재고 경고 구간');
assert.equal(report.exceptions.length, 1, '로스·클레임·계근오류 임원 집계');

const boundaryReport = cash.buildCashReport({
  pos: [],
  salesOrders: [
    { id: 'SO-60', soNo: 'SO-60', customer: '60일 경과', amount: 100000, currency: 'KRW', cashPaymentDueDate: '2026-06-23', status: 'SHIPPED' },
    { id: 'SO-59', soNo: 'SO-59', customer: '59일 경과', amount: 200000, currency: 'KRW', cashPaymentDueDate: '2026-06-24', status: 'SHIPPED' },
  ],
  systemSettings: { mesCashFundingV1: { availableFunds: 1000000 } },
}, {
  now: '2026-08-22',
  inventory: [
    { id: 'INV-15', grade: '15일 재고', weight: 10, value: 150000, receivedAt: '2026-08-07' },
    { id: 'INV-14', grade: '14일 재고', weight: 10, value: 140000, receivedAt: '2026-08-08' },
  ],
});
assert.equal(boundaryReport.inventoryAfter15Days, 150000, '입고 15일째부터 30일 예상자금에 포함');
assert.equal(boundaryReport.receivablesOver60Days, 100000, '수금예정일 60일째부터 가산하고 59일은 제외');
assert.equal(boundaryReport.netWorkingCapital, 1590000, '순운전자금에 전체 미판매재고 원가 포함');
assert.equal(boundaryReport.forecast30, 950000, '30일 예상자금 경계값 계산');

const partialPlan = cash.plannedSalesFunding({
  pos: [],
  salesOrders: [{ id: 'SO-PART', soNo: 'SO-PART', grade: 'IN 625', weight: 100, amount: 1000000, currency: 'KRW', status: 'WAITING' }],
  shipments: [
    { id: 'SHIP-PART', salesOrderId: 'SO-PART', soNo: 'SO-PART', weight: 40, status: 'SHIPPED', shippedAt: '2026-08-20' },
    { id: 'SHIP-RESERVED', salesOrderId: 'SO-PART', soNo: 'SO-PART', weight: 30, status: 'WAITING' },
  ],
  shipmentAllocations: [{ id: 'ALLOC-RESERVED', shipmentId: 'SHIP-RESERVED', salesOrderId: 'SO-PART', weight: 30, status: 'CONFIRMED' }],
}, [{ grade: 'IN 625', weight: 100, value: 200000 }]);
assert.equal(partialPlan.rows[0].remainingWeight, 60, '부분 출하만 차감하고 미출하 배정재고는 판매계획에 유지');
assert.equal(partialPlan.salesAmount, 600000, '부분 출하 비율만큼 판매계획자금 계산');
assert.equal(partialPlan.salesCost, 120000, '동일강종 kg당 실제 매입원가로 남은 중량 계산');
assert.equal(partialPlan.net, 480000, '부분 출하 미판매계획 순자금');

const legacy = cash.orderGroups({ pos: [{ id: 'L1', poNo: 'PO-OLD', amount: 100, currency: 'KRW', status: 'CONFIRMED' }] }, 'purchase')[0];
assert.equal(legacy.calculation.status, '미결제', '기존 자료는 수정 없이 미결제로 호환');

const installedSchemas = {
  purchase: { cols: [['구매상태', () => ''], ['저장일시', () => '']], rows: () => [] },
  sales: { cols: [['상태', () => ''], ['저장일시', () => '']], rows: () => [] },
};
const contentNode = { querySelector() { return null; } };
const documentStub = {
  documentElement: { dataset: {} }, body: {}, head: { appendChild() {} },
  createElement() { return { id: '', textContent: '' }; },
  getElementById(id) { return id === 'content' ? contentNode : null; },
  querySelector() { return null; }, querySelectorAll() { return []; },
};
const root = {
  __mesRuntime: { schemas: installedSchemas, getState: () => state, getView: () => 'purchase', getToast: () => () => {} },
  document: documentStub, render() {}, requestAnimationFrame() {}, setTimeout() {},
};
assert.equal(cash.install(root), true, 'MES 런타임에 자금 기능 설치');
assert.deepEqual(Array.from(installedSchemas.purchase.cols, (column) => column[0]), ['구매상태', '결제현황', '저장일시'], '구매상태와 저장일시 사이에 결제현황');
assert.deepEqual(Array.from(installedSchemas.sales.cols, (column) => column[0]), ['상태', '결제현황', '저장일시'], '판매상태와 저장일시 사이에 결제현황');

const html = fs.readFileSync(new URL('./mes.html', import.meta.url), 'utf8');
assert.match(html, /mes-cash-funding-v1\.js/, 'MES 화면에서 자금 모듈 로드');
assert.match(source, /\["결제현황"/, '구매·판매 결제현황 열 설치');
assert.match(source, /자금부족 예상일/, '자금부족 예상일 화면 경고');
assert.match(source, /현재자금 \+ 미수금 \+ 미판매재고원가 - 구매미지급금/, '순운전자금 계산식 화면 표기');
assert.match(source, /미출하 판매계획/, '전체 미출하 판매계획 순자금 화면 표기');

console.log('PASS MES cash funding calculations and compatibility');
