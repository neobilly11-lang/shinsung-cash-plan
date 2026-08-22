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

const sales = cash.orderGroups(state, 'sales');
const so1 = sales.find((row) => row.reference === 'SO-1');
const so2 = sales.find((row) => row.reference === 'SO-2');
assert.equal(so1.calculation.status, '선금 25% 입금', '판매 선금 비율 자동 표기');
assert.equal(so2.calculation.status, '수금완료 · 클레임', '잔금 차액의 클레임 마감 표기');
assert.equal(so2.calculation.exceptionAmount, 100, '잔금 변경액과 계약잔금의 차이를 자동 계산');
assert.equal(so2.calculation.outstandingAmount, 0, '확정 차감액은 미수잔금에서 제외');

const report = cash.buildCashReport(state, {
  now: '2026-08-22',
  inventory: [{ id: 'INV-1', grade: 'IN 718', weight: 100, costPerKg: 3000, value: 300000, receivedAt: '2026-05-14' }],
});
assert.equal(report.availableFunds, 500000, '현재 가용자금');
assert.equal(report.receivables, 1500000, '판매총액 - 수금액 - 확정차감');
assert.equal(report.payables, 1910000, '구매총액 - 지급액');
assert.equal(report.inventoryCost, 300000, '미판매재고 원가');
assert.equal(report.netWorkingCapital, 90000, '순운전자금 계산');
assert.equal(report.forecast30, 90000, '30일 예정수금·예정지급 반영');
assert.equal(report.shortageDate, '2026-08-23', '날짜별 누적 잔액 최초 0원 이하 날짜 경고');
assert.equal(report.inventory[0].bucket, '90~179일', '90일 이상 미판매재고 경고 구간');
assert.equal(report.exceptions.length, 1, '로스·클레임·계근오류 임원 집계');

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

console.log('PASS MES cash funding calculations and compatibility');
