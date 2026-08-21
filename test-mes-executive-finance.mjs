import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./mes-executive-dashboard-v1.js', import.meta.url), 'utf8');
const marker = '/* Executive Finance Dashboard V2';
const financeSource = source.slice(source.indexOf(marker));

const state = {
  pos: [{
    id: 'PO-LINE-1',
    poNo: 'PO-1',
    company: '공급사 A',
    packageNo: 'P001',
    mainGrade: 'IN 718',
    weight: 100,
    unitPrice: 10,
    currency: 'KRW',
    type: 'OVERSEAS',
    purchaseDate: '2026-08-01T00:00:00.000Z',
    receivedAt: '2026-08-01T00:00:00.000Z',
    status: 'CONFIRMED',
  }],
  inputs: [
    { id: 'INPUT-1', bagId: 'B1', packageNo: 'P001', weight: 100, status: 'CONFIRMED', createdAt: '2026-08-03T00:00:00.000Z' },
    { id: 'INPUT-2', bagId: 'B2', sourceBagId: 'B1', weight: 40, status: 'CONFIRMED', createdAt: '2026-08-04T00:00:00.000Z' },
  ],
  bags: [
    { id: 'B1', completionNo: 'C001', status: 'COMPLETE' },
    { id: 'B2', completionNo: 'C002', status: 'COMPLETE' },
  ],
  workWaits: [{ id: 'WAIT-1', packageNo: 'P001', processingHours: 10, status: 'COMPLETE' }],
  salesOrders: [{
    id: 'SALE-1',
    soNo: 'SO-1',
    customer: '판매처 A',
    mainGrade: 'IN 718',
    weight: 50,
    unitPrice: 20000,
    currency: 'KRW',
    status: 'SHIPPED',
  }],
  shipments: [{
    id: 'SHIP-1',
    salesOrderId: 'SALE-1',
    soNo: 'SO-1',
    weight: 50,
    status: 'SHIPPED',
    shippedAt: '2026-08-11T00:00:00.000Z',
  }],
  shipmentAllocations: [{
    id: 'ALLOC-1',
    shipmentId: 'SHIP-1',
    salesOrderId: 'SALE-1',
    bagId: 'B1',
    completionNo: 'C001',
    weight: 50,
    status: 'CONFIRMED',
  }],
  systemSettings: {
    executiveFinanceV2: {
      importCustomsByPo: { 'PO-1': { total: 1000, updatedAt: '2026-08-01T00:00:00.000Z' } },
      exportCostByOutbound: { 'SHIP-1': { total: 5000, updatedAt: '2026-08-11T00:00:00.000Z' } },
    },
  },
};

const nodes = { content: { innerHTML: '' }, pageTitle: { textContent: '' } };
const document = {
  documentElement: { dataset: {} },
  body: {},
  head: { appendChild() {} },
  createElement() { return { id: '', textContent: '' }; },
  getElementById(id) { return nodes[id] || null; },
  querySelector() { return null; },
};
const runtime = {
  schemas: {},
  getState: () => state,
  getView: () => 'dashboard',
  getToast: () => () => {},
  getCommit: () => async () => true,
};
const root = {
  __mesRuntime: runtime,
  document,
  render() {},
  requestAnimationFrame() {},
  setTimeout() {},
};
class MutationObserver { observe() {} }

vm.runInNewContext(financeSource, { window: root, MutationObserver });

const finance = root.mesExecutiveFinance;
assert.ok(finance, '임원용 재무 계산 API가 설치되어야 함');

const po = finance.poSummaries(state)[0];
assert.equal(po.purchaseAmount, 1000, 'P.O 매입금액');
assert.equal(po.customs, 1000, '수입통관비');
assert.equal(po.totalCost, 2000, '매입총액 = 매입금액 + 수입통관비');
assert.equal(po.costPerKg, 20, '통관비를 포함한 kg당 수입원가');

const domesticState = JSON.parse(JSON.stringify(state));
domesticState.pos[0].type = 'OVERSEAS';
domesticState.pos[0].domesticReceipt = true;
domesticState.pos[0].domesticReceiptId = 'DOMESTIC-1';
const domesticPo = finance.poSummaries(domesticState)[0];
assert.equal(domesticPo.isImport, false, '국내입고 플래그가 있으면 수입 통관 대상이 아님');
assert.equal(domesticPo.customs, 0, '국내입고는 저장된 통관비가 있어도 계산에서 제외');
assert.equal(domesticPo.totalCost, domesticPo.purchaseAmount, '국내입고 총원가는 매입금액만 반영');

const packages = finance.packageCostIndex(state, [po]);
assert.equal(packages.P001.workHours, 48, '작업시간 = 입고완료부터 완료포장 이동까지');
assert.equal(packages.P001.workCost, 800000, '작업비 = 48시간 × 400,000원 / 24시간');

const nested = finance.bagPackageWeights(state, 'B2');
assert.deepEqual({ ...nested }, { P001: 40 }, '재포장된 완료재고도 원 사내입고번호를 추적');

const outbound = finance.outboundSummaries(state, [po])[0];
assert.equal(outbound.salesAmount, 1000000, '매출액');
assert.equal(outbound.purchaseCost, 1000, '출고중량에 대응하는 수입원가');
assert.equal(outbound.workCost, 400000, '작업비를 사내입고 중량으로 kg당 환산');
assert.equal(outbound.inventoryDays, 10, '재고회전일 = 입고일부터 출고일까지');
assert.equal(outbound.interestCost, 1, '재고이자 = 원가 × 일수 × 0.01%');
assert.equal(outbound.exportCost, 5000, '출고별 수출비용');
assert.equal(outbound.profit, 593999, '실현이익 계산식');

const splitState = JSON.parse(JSON.stringify(state));
splitState.shipments = [
  { id: 'SHIP-A', salesOrderId: 'SALE-1', soNo: 'SO-1', weight: 25, status: 'SHIPPED', shippedAt: '2026-08-11T00:00:00.000Z' },
  { id: 'SHIP-B', salesOrderId: 'SALE-1', soNo: 'SO-1', weight: 25, status: 'SHIPPED', shippedAt: '2026-08-12T00:00:00.000Z' },
];
splitState.shipmentAllocations = [
  { id: 'ALLOC-A', shipmentId: 'SHIP-A', salesOrderId: 'SALE-1', bagId: 'B1', weight: 25, status: 'CONFIRMED' },
  { id: 'ALLOC-B', shipmentId: 'SHIP-B', salesOrderId: 'SALE-1', bagId: 'B1', weight: 25, status: 'CONFIRMED' },
];
const splitPo = finance.poSummaries(splitState)[0];
const splitOutbound = finance.outboundSummaries(splitState, [splitPo]);
assert.deepEqual(Array.from(splitOutbound, (row) => row.purchaseCost), [500, 500], '분할 출고는 각 출고번호의 배정재고만 원가 계산');
assert.deepEqual(Array.from(splitOutbound, (row) => row.workCost), [200000, 200000], '분할 출고 작업비 중복 방지');

const report = finance.build('2026-08');
assert.equal(report.customerSales.length, 1, '거래처별 매출 집계');
assert.equal(report.customerSales[0].partner, '판매처 A');
assert.equal(report.customerSales[0].salesAmount, 1000000);
assert.equal(report.turnover, 10, '평균 재고회전일은 출고중량 가중평균');

root.openExecutiveFinanceDashboard();
assert.match(nodes.content.innerHTML, /거래처별 매출액/);
assert.match(nodes.content.innerHTML, /판매처 A/);
assert.match(nodes.content.innerHTML, /통관비를 포함한 kg당 수입원가|통관/);

console.log('PASS MES executive finance calculations');
