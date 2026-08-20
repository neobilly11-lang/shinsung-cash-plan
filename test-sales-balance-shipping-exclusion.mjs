import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (name) => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
const stageSource = read('./mes-plan-stage-flow-v1.js');
const balanceSource = read('./mes-sales-balance-v1.js');
const mesSource = read('./mes.html');

assert.match(stageSource, /shippingPlanExcludedItem/);
assert.match(stageSource, /items\.every\(shippingPlanExcludedItem\)/);
assert.match(balanceSource, /shippingPlanExcludeReason:\s*'SALES_BALANCE_SPLIT'/);
assert.match(balanceSource, /shippingPlanExcludeReason:\s*'SALES_BALANCE_CLOSED'/);
assert.match(balanceSource, /'shippingPlanExcluded'.*?'shippingPlanExcludeReason'.*?'shippingPlanExcludedAt'/s);
assert.match(balanceSource, /delete item\[key\]/);
assert.match(mesSource, /20260821-sales-balance-exclude-1/);

const itemExcluded = (item) => {
  const status = String(item?.salesBalanceStatus || '').trim().toUpperCase();
  return item?.shippingPlanExcluded === true || ['SPLIT', 'SALE_CLOSED', 'CLOSED'].includes(status);
};
const rowExcluded = (row) => {
  const items = Array.isArray(row?.items) ? row.items.filter(Boolean) : [];
  if (items.length) return items.every(itemExcluded);
  return itemExcluded(row);
};

const originalSplit = {
  soNo: 'S01234',
  salesBalanceStatus: 'SPLIT',
  shippingPlanExcluded: true,
};
const originalClosed = {
  soNo: 'S05678',
  salesBalanceStatus: 'SALE_CLOSED',
  shippingPlanExcluded: true,
};
const derived = {
  soNo: 'S01234-2',
  salesBalanceStatus: '',
};

assert.equal(itemExcluded(originalSplit), true, '분할된 원본 S.O는 출고계획에서 제외');
assert.equal(itemExcluded(originalClosed), true, '판매종료 원본 S.O는 출고계획에서 제외');
assert.equal(itemExcluded(derived), false, '새로 생성된 -2 S.O는 출고계획에 유지');
assert.equal(rowExcluded({ items: [originalSplit, derived] }), false, '혼합 행 전체를 잘못 제외하지 않음');
assert.deepEqual(
  [originalSplit, originalClosed, derived].filter((item) => !itemExcluded(item)).map((item) => item.soNo),
  ['S01234-2'],
  '출고계획에는 파생 S.O만 남음',
);

console.log('PASS sales-balance shipping exclusion regression');
