import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import importer from "./mes-document-import-v4.js";

const total = data => Math.round(data.items.reduce((sum, item) => sum + item.netWeight, 0) * 100) / 100;
const parse = (name, text) => importer.parseText(text.trim(), name);

const fixtures = [
  {
    name: "P2398.pdf", count: 2, weight: 1250, company: "METAL DO CO., LTD.", currency: "USD",
    text: `METAL DO CO., LTD.\nContract No. P00002398\nQuantity (KGS) Description Price (USD/KG)\n1,000.00] Carpenter20 solid scrap USD4.70\n250.00] Carpenter20 turning scrap USD4.40`
  },
  {
    name: "PO 10666.pdf", count: 1, weight: 40000, company: "ALL-MET RECYCLING, INC.",
    text: `ALL-MET RECYCLING, INC.\nPurchase Order PO #: 10666\nItem - Packaging Pricing / WT Info\nTI 6-4 MED/HEAVY CUT TGS $2.6500 per LB 40 MTon`
  },
  {
    name: "PO 260260.pdf", count: 1, weight: 19958.06, company: "ICD Alloys and Metals, LLC",
    text: `PURCHASE ORDER\nPO Number: 260260\nICD Alloys and Metals, LLC\nITEM QUANTITY (LBS) DESCRIPTION UNIT PRICE EXTENDED PRICE\n1 44,000.00 INCO 617 VAC SOLIDS 6.7500/LB 297,000.00`
  },
  {
    name: "PURCHASE ORDER - 0010.PDF", count: 1, weight: 15000, company: "ARFIN INDIA LIMITED",
    text: `RM-IMPORT PURCHASE ORDER\nARFIN INDIA LIMITED\nOrder No. 0010\nSr. ItemName HSN Quantity UOM Del. Date Rate Disc GST Amount\n1 [TITANIUM SCRAP 81083000 15000.000} KG 12-06-2026 2.1000] 0.00} 0.00 31,500.00\nITURNING-IMPORT`
  },
  {
    name: "Sales Contract SS-260509.pdf", count: 2, weight: 6500, company: "FUJI MATERIAL COMPANY, LTD.", currency: "USD",
    text: `SALES CONTRACT\nFUJI MATERIAL COMPANY, LTD. (as seller)\nContract No. : SS-260509\nitem Estimated net Unit price Amount\n1 718 Solid 500 $13.20 $6,600.00\n2 718 Turning 6,000 $12.60 $75,600.00`
  },
  {
    name: "SSIY-0071,0072 PO.pdf", count: 2, weight: 60000, company: "Daido Kogyo Co., Ltd.", currency: "JPY",
    text: `Daido Kogyo Co.,Ltd\nPURCHASE ORDER\nDescription of Goods Quantity Unit Price Amount\nSSIY - 0071 Stainless 310 Solid Scraps 50,000 kg ¥610.00 ¥30,500,000\nSSIY - 0072 Stainless 309 Solid Scraps 10,000 kg ¥380.00 ¥3,800,000`
  },
  {
    name: "P0366 INVOICE.pdf", count: 2, weight: 1122, company: "TOSUI TRADING CO., LTD.",
    text: `TOSUI TRADING CO., LTD.\nINVOICE\nPURCHASE ORDER No : P0366\nMARK PACKAGES NAME OF COMMODITY GROSS WEIGHT NET WEIGHT UNIT PRICE TOTAL AMOUNT\nN/M 33 PACKAGES W-CO 740KGS 732KGS 120.00/KG USD87,840.00\nW ROLLER 390KGS 390KGS 20.00/KG USD7,800.00\nTOTAL 1,130KGS 1,122KGS`
  },
  {
    name: "P0366 PACKING LIST.pdf", count: 2, weight: 1122, company: "TOSUI TRADING CO., LTD.",
    text: `TOSUI TRADING CO., LTD.\nPACKING LIST\nPURCHASE ORDER No : P0366\nMARK PACKAGES NAME OF COMMODITY GROSS WEIGHT NET WEIGHT\nN/M 33 PACKAGES W-CO 740 732\nW ROLLER 390 390\nTOTAL 1,130 1,122`
  },
  {
    name: "CAE260701 INSURANCE.pdf", count: 0, weight: 0, company: "AEROMET ALLOYS PRIVATE LIMITED", type: "INSURANCE",
    text: `MARINE CARGO INSURANCE CERTIFICATE\nAEROMET ALLOYS PRIVATE LIMITED\nPolicy No. 12345`
  },
  {
    name: "CAE260701 PACKING LIST.pdf", count: 2, weight: 13000, company: "AEROMET ALLOYS PRIVATE LIMITED",
    text: `PACKING LIST\nAEROMET ALLOYS PRIVATE LIMITED\nDESCRIPTION QTY (MTS) NET WEIGHT GROSS WEIGHT\n1 NICKEL ALLOY SCRAP 11.172 11.367\n(C-276 SOLIDS)\n3 PALLETS & 13 JUMBO BAGS\n2 NICKEL ALLOY SCRAP 1.828 1.834\n(C-22 SOLIDS)-3 JUMBO BAGS\nTOTAL 13.000 13.201`
  },
  {
    name: "CGZM260401 INVOICE.pdf", count: 2, weight: 13585, company: "GREEN ZONE METAL TR. LLC",
    text: `Commercial Invoice\nDescription of Material Q'TY / Kg Price/Kg USD Total Amount/USD\n1 NICKEL ALLOY SCRAP A 10,245.00 $4.20 $43,029.00\n2 NICKEL ALLOY SCRAP B 3,340.00 $12.20 $40,748.00\nBENEFICIARY : GREEN ZONE METAL TR. LLC`
  },
  {
    name: "CGZM260401 PACKING LIST.pdf", count: 2, weight: 13585, company: "GREEN ZONE METAL TR. LLC",
    text: `Packing List\nNO. Material PKG GROSS WT (KG) NET WT (KG)\n1 NICKEL ALLOY SCRAP A 17 10,313.00 10,245.00\n2 NICKEL ALLOY SCRAP B 3 3,346.00 3,340.00\nTOTAL 20 13,659.00 13,585.00`
  },
  {
    name: "CIRE260302 INVOICE.pdf", count: 1, weight: 21100, company: "IRELAND ALLOYS",
    text: `IRELAND ALLOYS INVOICE\nBuyer's Reference CIRE260302\nItem/Packages Gross/Net/Cube Description Quantity Unit Price Amount\nP/N 13052-02 MP35N TURNINGS, REFINERY GRADE 21100.00 8.20 173,020.00`
  },
  {
    name: "CIRE260302 PACKING LIST.pdf", count: 2, weight: 1667, company: "IRELAND ALLOYS",
    text: `Packing List\nIreland Alloys (Cash Cow)\nMP35N turnings, parcelled, refinery grade\nNo. Gross Tare Net Packaging\n1 883 kg 20 kg 863 kg 1 pallet\n2 824 kg 20 kg 804 kg 1 pallet`
  },
  {
    name: "CKC260701 INVOICE.pdf", count: 1, weight: 7800, company: "KOCA METAL",
    text: `INVOICE\nPO No. CKC260701\nKOCA METAL\nDESCRIPTION QUANTITY UNIT PRICE TOTAL PRICE\nINCO718 TURNINGS VQ 7,800.00 KGS 12.500 USD 97,500.00 USD`
  },
  {
    name: "CKC260701 PACKING LIST.pdf", count: 1, weight: 7800, company: "KOCA METAL",
    text: `KOCA METAL\nPACKING LIST\nPO No. CKC260701\nITEMS GROSS WT KGS PACKAGE KGS NET WT KGS\nINCO718 TURNINGS VQ 8.700,00 KGS 900,00 KGS 7.800,00 KGS\n(36 Packages in total)`
  },
  {
    name: "P0392 PACKING LIST.pdf", count: 3, weight: 2565, company: "AIM HIGH KOREA INC.",
    text: `AIM HIGH KOREA INC.\nPROFORMA INVOICE\nCOMMODITY QUANTITY (KG) PACKING\n1 Ti Alloy 1,689.0: Bags\n2 Inconel 718 VS 841.0: Bags\n3 Inconel 625 AS 350. Bags\nTOTAL 2,565.0 KG`
  }
];

for (const fixture of fixtures) {
  const data = parse(fixture.name, fixture.text);
  assert.equal(data.items.length, fixture.count, `${fixture.name}: item count`);
  assert.equal(total(data), fixture.weight, `${fixture.name}: net weight`);
  assert.equal(data.company, fixture.company, `${fixture.name}: company`);
  if (fixture.currency) assert.equal(data.currency, fixture.currency, `${fixture.name}: currency`);
  if (fixture.type) assert.equal(data.documentType, fixture.type, `${fixture.name}: type`);
  assert.equal(data.soNo, "", `${fixture.name}: no false S.O number`);
}

const lb = parse(fixtures[2].name, fixtures[2].text).items[0];
assert.equal(lb.unit, "LB");
assert.equal(lb.price, 14.8812);
assert.equal(lb.amount, 297000);

const mismatchedAmount = importer.normalizeItem("IN718 VQ TURNING", "", 1000, "KG", 12.65, "KG", 228130.1, {});
assert.equal(mismatchedAmount.price, 12.65, "잘못 읽힌 총액이 정상 단가를 덮어쓰지 않음");
assert.equal(mismatchedAmount.amount, 12650, "금액 불일치 시 중량×단가로 자동 보정");
assert.equal(mismatchedAmount.sourceAmount, 228130.1, "원문 인식 금액은 진단용으로 보존");
assert.equal(mismatchedAmount.amountMismatch, true, "금액 불일치 여부 표시");

const mts = parse(fixtures[9].name, fixtures[9].text);
assert.deepEqual(mts.items.map(item => item.packageCount), [16, 3]);
assert.deepEqual(mts.items.map(item => item.marking), ["C-276 SOLIDS", "C-22 SOLIDS"]);

const koca = parse(fixtures[15].name, fixtures[15].text).items[0];
assert.equal(koca.grossWeight, 8700);
assert.equal(koca.tareWeight, 900);
assert.equal(koca.packageCount, 36);

const browser = {
  state: {
    pos: [{ poNo: "CGZM260401", company: "저장된 GREEN ZONE", grade: "NICKEL ALLOY SCRAP A", mainGrade: "C-250 TURNINGS", productType: "NI", weight: 10245, status: "CONFIRMED" }],
    salesOrders: [], splits: [], bags: [], gradeMasters: [], purchaseRequests: [], gradeTypes: {}
  },
  document: {
    createElement: () => ({}), head: { appendChild() {} }, querySelectorAll: () => [],
    documentElement: { dataset: {} }
  },
  fetch: async () => ({ json: async () => ({ mappings: [] }) }),
  render() {}
};
browser.window = browser;
browser.globalThis = browser;
vm.createContext(browser);
vm.runInContext(fs.readFileSync(new URL("./mes-document-import-v4.js", import.meta.url), "utf8"), browser);
const mapped = browser.MesDocumentImporterV4.parseText(fixtures[10].text, fixtures[10].name);
await browser.MesDocumentImporterV4.mapItems(mapped);
assert.equal(mapped.company, "저장된 GREEN ZONE");
assert.equal(mapped.items[0].matchedMarking, "C-250 TURNINGS");
assert.equal(mapped.items[0].productType, "NI");

console.log(`MES document importer ${importer.VERSION}: ${fixtures.length} document patterns passed`);
