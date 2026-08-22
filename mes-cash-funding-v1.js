(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.MesCashFunding = api;
    if (root.document) {
      var start = function () { return api.install(root); };
      if (!start()) {
        var attempts = 0;
        var timer = root.setInterval(function () {
          attempts += 1;
          if (start() || attempts >= 100) root.clearInterval(timer);
        }, 100);
      }
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VERSION = "20260822-cash-formulas-3";
  var DAY = 86400000;
  var EXCEPTION_LABELS = { LOSS: "로스", CLAIM: "클레임", WEIGHING_ERROR: "계근오류" };

  function list(value) { return Array.isArray(value) ? value : []; }
  function text(value) { return String(value == null ? "" : value).trim(); }
  function upper(value) { return text(value).toUpperCase(); }
  function number(value) {
    var parsed = Number(String(value == null ? "" : value).replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function round(value) { return Math.round(number(value) * 100) / 100; }
  function clamp(value, min, max) { return Math.min(max, Math.max(min, number(value))); }
  function encode(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
    });
  }
  function urlToken(value) { return encodeURIComponent(text(value)).replace(/'/g, "%27"); }
  function active(row) {
    if (!row || row.active === false || row.deleted === true || row.isDeleted === true || row.deletedAt) return false;
    return !/^(?:CANCELLED|DELETED|VOID|ARCHIVED)$/.test(upper(row.status));
  }
  function currency(value) {
    var normalized = upper(value || "KRW");
    return normalized === "EUR" ? "EURO" : (["KRW", "USD", "JPY", "EURO"].includes(normalized) ? normalized : "KRW");
  }
  function localDate(value) {
    var date = value instanceof Date ? value : new Date(value || Date.now());
    if (isNaN(date.getTime())) return "";
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  }
  function addDays(value, days) {
    var date = new Date(String(value).slice(0, 10) + "T12:00:00");
    date.setDate(date.getDate() + number(days));
    return localDate(date);
  }
  function dayDifference(from, to) {
    var a = new Date(String(from).slice(0, 10) + "T12:00:00");
    var b = new Date(String(to).slice(0, 10) + "T12:00:00");
    if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
    return Math.round((b.getTime() - a.getTime()) / DAY);
  }
  function firstValue(row, keys) {
    for (var index = 0; index < keys.length; index += 1) {
      var value = row && row[keys[index]];
      if (value !== undefined && value !== null && text(value) !== "") return value;
    }
    return "";
  }
  function rateFor(row) {
    return currency(firstValue(row, ["currency", "purchaseCurrency", "salesCurrency"])) === "KRW"
      ? 1
      : number(firstValue(row, ["exchangeRate", "purchaseRate", "salesRate", "rate"])) || 1;
  }
  function rawLineAmount(row, kind) {
    row = row || {};
    var weight = number(firstValue(row, kind === "purchase"
      ? ["purchaseContractWeight", "contractWeight", "weight", "netWeight", "quantity"]
      : ["weight", "salesWeight", "quantity", "netWeight"]));
    var unit = number(firstValue(row, kind === "purchase"
      ? ["unitPrice", "purchaseUnitPrice", "purchasePrice", "price"]
      : ["unitPrice", "salesUnitPrice", "salesPrice", "price"]));
    var explicit = number(firstValue(row, kind === "purchase"
      ? ["foreignAmount", "purchaseAmount", "amount", "lineAmount", "totalAmount"]
      : ["foreignAmount", "salesAmount", "amount", "lineAmount", "totalAmount"]));
    return round(explicit || weight * unit);
  }
  function krwLineAmount(row, kind) {
    var explicit = number(firstValue(row, kind === "purchase"
      ? ["krwPurchaseAmount", "krwAmount", "convertedAmount", "purchaseAmountKrw"]
      : ["krwSalesAmount", "krwAmount", "convertedAmount", "salesAmountKrw"]));
    if (explicit > 0) return round(explicit);
    return round(rawLineAmount(row, kind) * rateFor(row));
  }
  function groupBy(rows, key) {
    var groups = {};
    rows.forEach(function (row) {
      var value = text(key(row)) || "미지정";
      (groups[value] = groups[value] || []).push(row);
    });
    return groups;
  }
  function paymentSource(rows) {
    return rows.slice().sort(function (a, b) {
      return text(b.cashPaymentUpdatedAt || b.updatedAt || b.createdAt).localeCompare(text(a.cashPaymentUpdatedAt || a.updatedAt || a.createdAt));
    })[0] || {};
  }
  function readPayment(row) {
    row = row || {};
    var depositAmount = number(row.cashPaymentDepositAmount);
    var balanceAmount = number(row.cashPaymentBalanceAmount);
    return {
      depositChecked: row.cashPaymentDepositChecked === true || (row.cashPaymentDepositChecked == null && depositAmount > 0),
      depositAmount: depositAmount,
      balanceChecked: row.cashPaymentBalanceChecked === true || (row.cashPaymentBalanceChecked == null && balanceAmount > 0),
      balanceAmount: balanceAmount,
      dueDate: text(row.cashPaymentDueDate),
      exceptionType: upper(row.cashPaymentExceptionType),
      memo: text(row.cashPaymentMemo),
      updatedAt: text(row.cashPaymentUpdatedAt),
      updatedBy: text(row.cashPaymentUpdatedByName),
      storedStatus: text(row.cashPaymentStatus)
    };
  }
  function percent(value, total) {
    if (!total) return 0;
    return Math.round(value / total * 1000) / 10;
  }
  function calculatePayment(total, kind, payment) {
    total = Math.max(0, number(total));
    payment = payment || {};
    var depositChecked = payment.depositChecked === true;
    var deposit = depositChecked ? clamp(payment.depositAmount, 0, total) : 0;
    var expectedBalance = Math.max(0, total - deposit);
    var balanceChecked = payment.balanceChecked === true;
    var balance = balanceChecked ? clamp(payment.balanceAmount, 0, expectedBalance) : 0;
    var exception = balanceChecked ? Math.max(0, expectedBalance - balance) : 0;
    if (!payment.exceptionType) exception = 0;
    var settled = round(deposit + balance);
    var outstanding = round(Math.max(0, total - settled - exception));
    var status = "미결제";
    var action = kind === "purchase" ? "지불" : "입금";
    if (depositChecked && deposit > 0 && !balanceChecked) status = "선금 " + percent(deposit, total) + "% " + action;
    else if (balanceChecked && outstanding <= 0.01) status = (kind === "purchase" ? "결제완료" : "수금완료") + (exception > 0 ? " · " + (EXCEPTION_LABELS[payment.exceptionType] || payment.exceptionType) : "");
    else if (settled > 0) status = "부분" + action + " " + percent(settled, total) + "%";
    return {
      total: round(total), depositChecked: depositChecked, depositAmount: round(deposit), depositPercent: percent(deposit, total),
      expectedBalance: round(expectedBalance), balanceChecked: balanceChecked, balanceAmount: round(balance),
      settledAmount: settled, settledPercent: percent(settled, total), exceptionAmount: round(exception),
      exceptionType: payment.exceptionType || "", outstandingAmount: outstanding, status: status
    };
  }
  function orderGroups(state, kind) {
    state = state || {};
    var source = kind === "purchase" ? list(state.pos) : list(state.salesOrders);
    var groups = groupBy(source.filter(active), function (row) {
      return kind === "purchase" ? firstValue(row, ["poNo", "purchaseNo", "contractNo", "id"]) : firstValue(row, ["soNo", "salesNo", "orderNo", "id"]);
    });
    return Object.keys(groups).map(function (reference) {
      var rows = groups[reference], first = rows[0] || {}, sourceRow = paymentSource(rows);
      var totalOriginal = round(rows.reduce(function (sum, row) { return sum + rawLineAmount(row, kind); }, 0));
      var totalKrw = round(rows.reduce(function (sum, row) { return sum + krwLineAmount(row, kind); }, 0));
      var payment = readPayment(sourceRow), calculated = calculatePayment(totalOriginal, kind, payment);
      var paidRatio = totalOriginal ? calculated.settledAmount / totalOriginal : 0;
      var exceptionRatio = totalOriginal ? calculated.exceptionAmount / totalOriginal : 0;
      var outstandingRatio = totalOriginal ? calculated.outstandingAmount / totalOriginal : 0;
      return {
        kind: kind, reference: reference, rows: rows, first: first,
        partner: text(kind === "purchase" ? firstValue(first, ["company", "supplier", "vendor", "partner"]) : firstValue(first, ["customer", "buyer", "company", "partner"])),
        grade: rows.map(function (row) { return text(firstValue(row, ["grade", "mainGrade", "item", "description"])); }).filter(Boolean).filter(function (value, index, all) { return all.indexOf(value) === index; }).join(" / "),
        weight: round(rows.reduce(function (sum, row) { return sum + number(firstValue(row, ["purchaseContractWeight", "contractWeight", "weight", "netWeight", "quantity"])); }, 0)),
        currency: currency(firstValue(first, ["currency", "purchaseCurrency", "salesCurrency"])),
        exchangeRate: rateFor(first), totalOriginal: totalOriginal, totalKrw: totalKrw,
        payment: payment, calculation: calculated,
        depositKrw: round(totalKrw * (totalOriginal ? calculated.depositAmount / totalOriginal : 0)),
        settledKrw: round(totalKrw * paidRatio), exceptionKrw: round(totalKrw * exceptionRatio),
        outstandingKrw: round(totalKrw * outstandingRatio), dueDate: payment.dueDate,
        createdAt: text(firstValue(sourceRow, ["createdAt", "savedAt"])), updatedAt: payment.updatedAt || text(firstValue(sourceRow, ["updatedAt", "createdAt"]))
      };
    }).sort(function (a, b) { return text(b.updatedAt).localeCompare(text(a.updatedAt)); });
  }
  function inventoryRows(rows, now) {
    now = localDate(now);
    return list(rows).map(function (row, index) {
      var weight = number(firstValue(row, ["weight", "netWeight", "nw"]));
      var value = number(firstValue(row, ["convertedAmount", "inventoryValue", "value"]));
      var perKg = number(firstValue(row, ["costPerKg", "actualPurchaseCost"])) || (weight ? value / weight : 0);
      if (!value) value = weight * perKg;
      var record = row.record || {}, origin = row.origin || {};
      var stockedAt = text(firstValue(row, ["receivedAt", "date", "stockedAt", "createdAt"]) || firstValue(record, ["receivedAt", "receiptConfirmedAt", "inboundCompletedAt", "createdAt"]) || firstValue(origin, ["receivedAt", "receiptConfirmedAt", "expectedArrivalDate", "createdAt"]));
      var days = stockedAt ? Math.max(0, dayDifference(localDate(stockedAt), now)) : 0;
      var bucket = days >= 180 ? "180일 이상" : days >= 90 ? "90~179일" : days >= 60 ? "60~89일" : days >= 30 ? "30~59일" : "30일 미만";
      return {
        id: text(row.id || row.key || row.packageNo || ("inventory-" + index)),
        poNo: text(row.poNo || origin.poNo || record.poNo), packageNo: text(row.packageNo || origin.packageNo || record.packageNo),
        grade: text(row.grade || row.gradeLabel || row.rawGrade || origin.grade || record.grade || "미분류"),
        weight: round(weight), costPerKg: round(perKg), value: round(value), stockedAt: stockedAt, days: days, bucket: bucket
      };
    }).filter(function (row) { return row.weight > 0 || row.value > 0; });
  }
  function gradeKeys(row) {
    row = row || {};
    var composed = [row.productType, row.mainGrade || row.finalGrade, row.subGrade, row.detailGrade].filter(Boolean).join(" ");
    return [composed, row.customerGrade, row.grade, row.gradeLabel, row.rawGrade, row.mainGrade, row.finalGrade, row.purchaseContractGrade, row.contractGrade, row.item, row.description]
      .map(function (value) { return upper(value).replace(/[^A-Z0-9가-힣]/g, ""); })
      .filter(Boolean).filter(function (value, index, all) { return all.indexOf(value) === index; });
  }
  function addGradeCost(map, row, weight, value) {
    if (weight <= 0 || value <= 0) return;
    gradeKeys(row).forEach(function (key) {
      var entry = map[key] || (map[key] = { weight: 0, value: 0 });
      entry.weight += weight; entry.value += value;
    });
  }
  function completedShipment(row) {
    return !!row && (/SHIPPED|DONE|COMPLETE|COMPLETED|DELIVERED|FINAL|출고완료|출하완료/.test(upper(row.status)) || !!firstValue(row, ["shippedAt", "shippingCompletedAt", "completedAt"]));
  }
  function remainingSalesWeight(state, row) {
    var contract = number(firstValue(row, ["weight", "salesWeight", "quantity", "netWeight"]));
    if (contract <= 0) return completedShipment(row) ? 0 : 0;
    var shipments = list(state.shipments).filter(active).filter(function (shipment) {
      return text(shipment.salesOrderId) === text(row.id) || (!shipment.salesOrderId && text(shipment.soNo) === text(row.soNo));
    }).filter(completedShipment);
    var shipmentIds = new Set(shipments.map(function (shipment) { return text(shipment.id); }));
    var allocations = list(state.shipmentAllocations).filter(active).filter(function (allocation) {
      return shipmentIds.has(text(allocation.shipmentId)) && (!allocation.salesOrderId || text(allocation.salesOrderId) === text(row.id));
    });
    var shipped = allocations.length
      ? allocations.reduce(function (sum, allocation) { return sum + number(firstValue(allocation, ["weight", "netWeight", "nw"])); }, 0)
      : shipments.reduce(function (sum, shipment) { return sum + number(firstValue(shipment, ["shippedWeight", "weight", "netWeight", "nw"])); }, 0);
    if (shipped <= 0 && completedShipment(row)) return 0;
    return round(Math.max(0, contract - shipped));
  }
  function plannedSalesFunding(state, costRows) {
    state = state || {};
    var currentCosts = {}, historicalCosts = {};
    list(costRows).forEach(function (row) {
      var weight = number(firstValue(row, ["weight", "netWeight", "nw"]));
      var value = number(firstValue(row, ["convertedAmount", "inventoryValue", "value"]));
      if (!value) value = weight * number(firstValue(row, ["costPerKg", "actualPurchaseCost"]));
      addGradeCost(currentCosts, row, weight, value);
    });
    list(state.pos).filter(active).forEach(function (row) {
      var weight = number(firstValue(row, ["purchaseContractWeight", "contractWeight", "weight", "netWeight", "quantity"]));
      addGradeCost(historicalCosts, row, weight, krwLineAmount(row, "purchase"));
    });
    var rows = [];
    list(state.salesOrders).filter(active).forEach(function (row) {
      var contractWeight = number(firstValue(row, ["weight", "salesWeight", "quantity", "netWeight"]));
      var remainingWeight = remainingSalesWeight(state, row);
      var completed = completedShipment(row);
      if (completed && remainingWeight <= 0) return;
      if (contractWeight <= 0 && completed) return;
      var ratio = contractWeight > 0 ? remainingWeight / contractWeight : 1;
      var salesAmount = round(krwLineAmount(row, "sales") * ratio), match = null, matchedKey = "";
      var keys = gradeKeys(row);
      for (var index = 0; index < keys.length; index += 1) {
        if (currentCosts[keys[index]]) { match = currentCosts[keys[index]]; matchedKey = keys[index]; break; }
      }
      if (!match) for (var historyIndex = 0; historyIndex < keys.length; historyIndex += 1) {
        if (historicalCosts[keys[historyIndex]]) { match = historicalCosts[keys[historyIndex]]; matchedKey = keys[historyIndex]; break; }
      }
      var costPerKg = match && match.weight ? match.value / match.weight : 0;
      var salesCost = round(remainingWeight * costPerKg);
      rows.push({
        id: text(row.id), soNo: text(row.soNo || row.salesNo || row.orderNo), grade: text(firstValue(row, ["grade", "mainGrade", "description"]) || "미분류"),
        remainingWeight: remainingWeight, salesAmount: salesAmount, salesCost: salesCost, net: round(salesAmount - salesCost),
        matchedGradeKey: matchedKey, costPerKg: round(costPerKg), costMissing: remainingWeight > 0 && !match
      });
    });
    return {
      rows: rows,
      salesAmount: round(rows.reduce(function (sum, row) { return sum + row.salesAmount; }, 0)),
      salesCost: round(rows.reduce(function (sum, row) { return sum + row.salesCost; }, 0)),
      net: round(rows.reduce(function (sum, row) { return sum + row.net; }, 0)),
      missingCostWeight: round(rows.filter(function (row) { return row.costMissing; }).reduce(function (sum, row) { return sum + row.remainingWeight; }, 0))
    };
  }
  function availableFunds(state) {
    return number(state && state.systemSettings && state.systemSettings.mesCashFundingV1 && state.systemSettings.mesCashFundingV1.availableFunds);
  }
  function buildCashReport(state, options) {
    options = options || {};
    var now = localDate(options.now || Date.now());
    var purchases = orderGroups(state, "purchase"), sales = orderGroups(state, "sales");
    var inventory = inventoryRows(options.inventory, now), plannedFunding = plannedSalesFunding(state, options.salesCostBasis), funds = options.availableFunds == null ? availableFunds(state) : number(options.availableFunds);
    var receivables = round(sales.reduce(function (sum, row) { return sum + row.outstandingKrw; }, 0));
    var payables = round(purchases.reduce(function (sum, row) { return sum + row.outstandingKrw; }, 0));
    var inventoryCost = round(inventory.reduce(function (sum, row) { return sum + row.value; }, 0));
    var inventoryAfter15Days = round(inventory.filter(function (row) { return row.days >= 15; }).reduce(function (sum, row) { return sum + row.value; }, 0));
    sales.forEach(function (row) { row.overdueDays = row.dueDate && row.dueDate < now && row.outstandingKrw > 0 ? dayDifference(row.dueDate, now) : 0; });
    purchases.forEach(function (row) { row.dueInDays = row.dueDate ? dayDifference(now, row.dueDate) : null; });
    var receivablesOver60Days = round(sales.filter(function (row) { return row.overdueDays >= 60; }).reduce(function (sum, row) { return sum + row.outstandingKrw; }, 0));
    function dueWithin(row, days) { return row.dueDate && row.dueDate <= addDays(now, days); }
    function upcoming(rows, days) { return round(rows.filter(function (row) { return row.outstandingKrw > 0 && dueWithin(row, days); }).reduce(function (sum, row) { return sum + row.outstandingKrw; }, 0)); }
    var horizons = [7, 30, 60, 90].map(function (days) {
      var inflow = upcoming(sales, days), outflow = upcoming(purchases, days);
      return { days: days, inflow: inflow, outflow: outflow, available: round(funds + inflow - outflow) };
    });
    var daily = {};
    sales.concat(purchases).forEach(function (row) {
      if (!row.dueDate || row.outstandingKrw <= 0) return;
      var date = row.dueDate < now ? now : row.dueDate;
      var entry = daily[date] || (daily[date] = { date: date, inflow: 0, outflow: 0 });
      if (row.kind === "sales") entry.inflow += row.outstandingKrw; else entry.outflow += row.outstandingKrw;
    });
    var balance = funds, shortageDate = funds <= 0 ? now : "";
    var dailyBalances = Object.keys(daily).sort().map(function (date) {
      var entry = daily[date];
      balance = round(balance + entry.inflow - entry.outflow);
      if (!shortageDate && balance <= 0) shortageDate = date;
      return { date: date, inflow: round(entry.inflow), outflow: round(entry.outflow), balance: balance };
    });
    var exceptions = sales.concat(purchases).filter(function (row) { return row.exceptionKrw > 0 && row.calculation.exceptionType; });
    return {
      now: now, availableFunds: round(funds), purchases: purchases, sales: sales, inventory: inventory,
      purchaseTotal: round(purchases.reduce(function (sum, row) { return sum + row.totalKrw; }, 0)),
      salesTotal: round(sales.reduce(function (sum, row) { return sum + row.totalKrw; }, 0)),
      receivables: receivables, payables: payables, inventoryCost: inventoryCost,
      inventoryAfter15Days: inventoryAfter15Days, receivablesOver60Days: receivablesOver60Days,
      plannedSalesAmount: plannedFunding.salesAmount, sameGradeSalesCost: plannedFunding.salesCost,
      plannedSalesNet: plannedFunding.net, plannedSalesRows: plannedFunding.rows, missingPlannedCostWeight: plannedFunding.missingCostWeight,
      netWorkingCapital: round(funds + receivables + inventoryCost - payables),
      expectedReceipts30: upcoming(sales, 30), expectedPayments30: upcoming(purchases, 30),
      forecast30: round(funds + inventoryAfter15Days - receivables - payables + receivablesOver60Days + plannedFunding.salesAmount - plannedFunding.salesCost),
      horizons: horizons, dailyBalances: dailyBalances, shortageDate: shortageDate,
      missingDueDates: sales.concat(purchases).filter(function (row) { return row.outstandingKrw > 0 && !row.dueDate; }).length,
      exceptions: exceptions,
      aging: ["30일 미만", "30~59일", "60~89일", "90~179일", "180일 이상"].map(function (label) {
        var matches = inventory.filter(function (row) { return row.bucket === label; });
        return { label: label, count: matches.length, weight: round(matches.reduce(function (sum, row) { return sum + row.weight; }, 0)), value: round(matches.reduce(function (sum, row) { return sum + row.value; }, 0)) };
      })
    };
  }

  function install(root) {
    var runtime = root.__mesRuntime;
    if (!runtime || !runtime.schemas || root.__mesCashFundingInstalled) return false;
    root.__mesCashFundingInstalled = true;
    root.document.documentElement.dataset.mesCashFundingV1 = "loaded";
    var cashMode = false;

    function state() { return runtime.getState ? runtime.getState() : {}; }
    function won(value) { return Math.round(number(value)).toLocaleString("ko-KR") + "원"; }
    function amount(value) { return number(value).toLocaleString("ko-KR", { maximumFractionDigits: 2 }); }
    function toast(message, bad) { var fn = runtime.getToast && runtime.getToast(); if (fn) fn(message, bad); }
    function currentFundingSources() {
      var inventory = [], costBasis = [], usedExecutiveReport = false;
      try {
        if (root.MesExecutiveDashboard && root.MesExecutiveDashboard.buildExecutiveReport && typeof root.mesForecastRows === "function") {
          var current = state(), settings = current.systemSettings || {};
          var executive = root.MesExecutiveDashboard.buildExecutiveReport(current, root.mesForecastRows(), settings.executiveExchangeRates || {});
          inventory = executive.unsold; costBasis = executive.all;
          try {
            var financeMonth = localDate().slice(0, 7), financeReport = root.mesExecutiveFinance && root.mesExecutiveFinance.build(financeMonth);
            if (financeReport && list(financeReport.physical).length) costBasis = financeReport.physical;
          } catch (_) { /* 기존 동일강종 재고원가를 유지 */ }
          usedExecutiveReport = true;
        }
      } catch (_) { inventory = []; costBasis = []; }
      if (!usedExecutiveReport) {
        try {
          var month = localDate().slice(0, 7), finance = root.mesExecutiveFinance && root.mesExecutiveFinance.build(month);
          inventory = finance && finance.physical || []; costBasis = inventory;
        } catch (_) { inventory = []; costBasis = []; }
      }
      return { inventory: inventory, costBasis: costBasis };
    }
    function report() { var sources = currentFundingSources(); return buildCashReport(state(), { now: localDate(), inventory: sources.inventory, salesCostBasis: sources.costBasis }); }
    function summaryKey(kind, row) { return text(kind === "purchase" ? row.poNo || row.id : row.soNo || row.id); }
    function findOrder(kind, key) { return orderGroups(state(), kind).find(function (row) { return row.reference === text(key); }); }
    function statusButton(kind, row) {
      var key = summaryKey(kind, row), order = findOrder(kind, key);
      var label = order ? order.calculation.status : "미결제";
      var settled = order && order.calculation.settledAmount > 0;
      return '<button type="button" class="cash-payment-status ' + (settled ? "paid" : "unpaid") + '" onclick="event.stopPropagation();openMesPaymentEditor(\'' + kind + '\',decodeURIComponent(\'' + urlToken(key) + '\'))">' + encode(label) + '</button>';
    }
    function installColumns() {
      [["purchase", "purchase"], ["sales", "sales"]].forEach(function (entry) {
        var schema = runtime.schemas[entry[0]], kind = entry[1];
        if (!schema || !Array.isArray(schema.cols)) return;
        for (var index = schema.cols.length - 1; index >= 0; index -= 1) if (schema.cols[index] && schema.cols[index][0] === "결제현황") schema.cols.splice(index, 1);
        var savedIndex = schema.cols.findIndex(function (column) { return column && column[0] === "저장일시"; });
        var statusIndex = schema.cols.findIndex(function (column) { return column && /구매상태|판매상태|^상태$/.test(column[0]); });
        var insertAt = savedIndex >= 0 ? savedIndex : (statusIndex >= 0 ? statusIndex + 1 : schema.cols.length);
        schema.cols.splice(insertAt, 0, ["결제현황", function (row) { return statusButton(kind, row); }, "left"]);
      });
    }
    installColumns();

    root.openMesPaymentEditor = function (kind, key) {
      var order = findOrder(kind, key);
      if (!order) { toast("결제현황 대상을 찾지 못했습니다. 최신자료를 조회해 주세요.", true); return false; }
      var payment = order.payment, calculated = order.calculation, modal = root.document.getElementById("modal"), title = root.document.getElementById("modalTitle"), body = root.document.getElementById("modalBody");
      if (!modal || !body) return false;
      if (title) title.textContent = order.reference + " · " + (kind === "purchase" ? "지급현황" : "수금현황");
      var balanceValue = payment.balanceChecked ? payment.balanceAmount : calculated.expectedBalance;
      body.innerHTML = '<form class="form-grid cash-payment-form" data-kind="' + kind + '" data-key="' + urlToken(order.reference) + '" data-total="' + order.totalOriginal + '" onsubmit="saveMesPayment(event,this)">' +
        '<div class="wide cash-payment-total"><div><small>' + (kind === "purchase" ? "구매금액" : "판매금액") + '</small><strong>' + amount(order.totalOriginal) + ' ' + encode(order.currency) + '</strong></div><div><small>원화 환산</small><strong>' + won(order.totalKrw) + '</strong></div><div><small>거래처</small><strong>' + encode(order.partner || "-") + '</strong></div></div>' +
        '<label class="cash-check"><span><input name="depositChecked" type="checkbox" ' + (payment.depositChecked ? "checked" : "") + ' onchange="cashPaymentAutoCalc(this.form)"> 선금 ' + (kind === "purchase" ? "지불" : "입금") + '</span><input name="depositAmount" type="number" min="0" step="0.01" inputmode="decimal" value="' + payment.depositAmount + '" oninput="cashPaymentAutoCalc(this.form)"></label>' +
        '<label><span>자동 계산 잔금</span><input name="expectedBalance" type="number" value="' + calculated.expectedBalance + '" readonly></label>' +
        '<label class="cash-check"><span><input name="balanceChecked" type="checkbox" ' + (payment.balanceChecked ? "checked" : "") + ' onchange="cashPaymentAutoCalc(this.form)"> 잔금 ' + (kind === "purchase" ? "지불" : "입금") + '</span><input name="balanceAmount" type="number" min="0" step="0.01" inputmode="decimal" value="' + balanceValue + '" oninput="this.form.dataset.balanceTouched=\'1\';cashPaymentAutoCalc(this.form)"></label>' +
        '<label>차감 사유<select name="exceptionType" onchange="cashPaymentAutoCalc(this.form)"><option value="">선택 안 함</option>' + Object.keys(EXCEPTION_LABELS).map(function (code) { return '<option value="' + code + '" ' + (payment.exceptionType === code ? "selected" : "") + '>' + EXCEPTION_LABELS[code] + '</option>'; }).join("") + '</select></label>' +
        '<label>' + (kind === "purchase" ? "지급예정일" : "수금예정일") + '<input name="dueDate" type="date" value="' + encode(payment.dueDate) + '"></label>' +
        '<label class="wide">결제현황 내용<textarea name="memo" placeholder="송금·입금 조건, 확인 내용 등을 입력하세요.">' + encode(payment.memo) + '</textarea></label>' +
        '<div class="wide cash-payment-preview"><small>저장 후 결제현황</small><strong data-payment-preview>' + encode(calculated.status) + '</strong><span data-payment-detail>미결제잔금 ' + amount(calculated.outstandingAmount) + ' ' + encode(order.currency) + '</span></div>' +
        '<div class="wide actions"><button class="btn primary">결제현황 저장</button><button type="button" class="btn" onclick="closeModal()">취소</button></div></form>';
      modal.classList.add("on");
      root.cashPaymentAutoCalc(body.querySelector("form"));
      return true;
    };
    root.cashPaymentAutoCalc = function (form) {
      if (!form) return;
      var total = number(form.dataset.total), depositChecked = form.depositChecked.checked;
      var deposit = depositChecked ? clamp(form.depositAmount.value, 0, total) : 0;
      var expected = Math.max(0, total - deposit);
      form.expectedBalance.value = round(expected);
      if (form.dataset.balanceTouched !== "1") form.balanceAmount.value = round(expected);
      var payment = {
        depositChecked: depositChecked, depositAmount: deposit,
        balanceChecked: form.balanceChecked.checked, balanceAmount: number(form.balanceAmount.value),
        exceptionType: form.exceptionType.value
      };
      var calculated = calculatePayment(total, form.dataset.kind, payment);
      form.querySelector("[data-payment-preview]").textContent = calculated.status;
      form.querySelector("[data-payment-detail]").textContent = "미결제잔금 " + amount(calculated.outstandingAmount) + " · 차감 " + amount(calculated.exceptionAmount);
    };
    root.saveMesPayment = async function (event, form) {
      event.preventDefault();
      var kind = form.dataset.kind, key = decodeURIComponent(form.dataset.key), order = findOrder(kind, key);
      if (!order) { toast("저장할 P.O/S.O를 찾지 못했습니다.", true); return false; }
      var payment = {
        depositChecked: form.depositChecked.checked, depositAmount: number(form.depositAmount.value),
        balanceChecked: form.balanceChecked.checked, balanceAmount: number(form.balanceAmount.value),
        exceptionType: upper(form.exceptionType.value)
      };
      var calculated = calculatePayment(order.totalOriginal, kind, payment);
      if (payment.depositAmount < 0 || payment.balanceAmount < 0 || payment.depositAmount > order.totalOriginal + 0.01 || payment.balanceAmount > calculated.expectedBalance + 0.01) {
        toast("선금·잔금은 거래금액 범위 안에서 입력해 주세요.", true); return false;
      }
      if (payment.balanceChecked && calculated.outstandingAmount > 0.01 && !payment.exceptionType) {
        toast("잔금을 실제 금액보다 적게 마감하면 로스·클레임·계근오류 중 사유를 선택해 주세요.", true); return false;
      }
      var stamp = new Date().toISOString(), operator = runtime.currentUserName ? runtime.currentUserName() : "MES";
      var commit = runtime.getCommit && runtime.getCommit();
      if (!commit) return false;
      var collection = kind === "purchase" ? "pos" : "salesOrders";
      var saved = await commit(kind === "purchase" ? "P.O 결제현황" : "S.O 결제현황", [collection], function (shared) {
        list(shared[collection]).filter(function (row) {
          return text(kind === "purchase" ? row.poNo || row.purchaseNo || row.id : row.soNo || row.salesNo || row.id) === key;
        }).forEach(function (row) {
          Object.assign(row, {
            cashPaymentStatus: calculated.status,
            cashPaymentDepositChecked: payment.depositChecked,
            cashPaymentDepositAmount: calculated.depositAmount,
            cashPaymentBalanceChecked: payment.balanceChecked,
            cashPaymentBalanceAmount: calculated.balanceAmount,
            cashPaymentSettledAmount: calculated.settledAmount,
            cashPaymentOutstandingAmount: calculated.outstandingAmount,
            cashPaymentExceptionAmount: calculated.exceptionAmount,
            cashPaymentExceptionType: calculated.exceptionType,
            cashPaymentDueDate: text(form.dueDate.value),
            cashPaymentMemo: text(form.memo.value),
            cashPaymentCurrency: order.currency,
            cashPaymentExchangeRate: order.exchangeRate,
            cashPaymentUpdatedAt: stamp,
            cashPaymentUpdatedByName: operator,
            updatedAt: stamp,
            updatedByName: operator
          });
        });
      });
      if (saved === false) return false;
      if (typeof root.closeModal === "function") root.closeModal();
      toast("결제현황을 저장했습니다.");
      return true;
    };

    function kpiButton(kind, label, value, note, warning) {
      return '<button type="button" class="cash-kpi ' + (warning ? "warning" : "") + '" onclick="openMesCashDrill(\'' + kind + '\')"><small>' + label + '</small><strong>' + value + '</strong><span>' + note + '</span></button>';
    }
    function chartHtml(data) {
      var max = Math.max(1, data.horizons.reduce(function (value, row) { return Math.max(value, row.inflow, row.outflow, Math.abs(row.available)); }, 0));
      return '<section id="mesCashFlow" class="cash-section"><div class="cash-section-head"><div><h2>예상 Cash Flow</h2><p>지급·수금예정일 기준 누적 전망</p></div><div class="cash-legend"><span class="in">예상 입금</span><span class="out">예상 지급</span><span class="balance">예상 가용자금</span></div></div><div class="cash-chart">' + data.horizons.map(function (row) {
        function height(value) { return Math.max(4, Math.round(Math.abs(value) / max * 145)); }
        return '<button type="button" onclick="openMesCashDrill(\'forecast\')"><div class="cash-bars"><i class="in" style="height:' + height(row.inflow) + 'px"></i><i class="out" style="height:' + height(row.outflow) + 'px"></i><i class="balance ' + (row.available <= 0 ? "negative" : "") + '" style="height:' + height(row.available) + 'px"></i></div><b>' + row.days + '일</b><small>입금 ' + won(row.inflow) + '</small><small>지급 ' + won(row.outflow) + '</small><strong>' + won(row.available) + '</strong></button>';
      }).join("") + '</div></section>';
    }
    function orderTable(kind, rows) {
      var sales = kind === "sales", title = sales ? "입금예정" : "지급예정";
      var body = rows.map(function (row) {
        var alert = sales && row.overdueDays > 0 ? "danger" : (!sales && row.dueInDays != null && row.dueInDays >= 0 && row.dueInDays <= 7 && row.outstandingKrw > 0 ? "warning" : "");
        var link = "openMesCashOrder('" + kind + "',decodeURIComponent('" + urlToken(row.reference) + "'))";
        return '<tr class="' + alert + '"><td class="left"><button class="cash-link" onclick="' + link + '">' + encode(row.partner || "-") + '</button></td><td><button class="cash-link" onclick="' + link + '">' + encode(row.reference) + '</button></td><td><button class="cash-link" onclick="' + link + '">' + won(row.totalKrw) + '</button></td><td><button class="cash-link" onclick="' + link + '">' + won(row.depositKrw) + '</button></td><td><button class="cash-link" onclick="' + link + '">' + won(row.settledKrw) + '</button></td><td><button class="cash-link" onclick="' + link + '">' + won(row.outstandingKrw) + '</button></td><td>' + encode(row.dueDate || "미지정") + '</td>' + (sales ? '<td>' + (row.overdueDays ? '<b class="cash-red">' + row.overdueDays + '일</b>' : "-") + '</td>' : '') + '</tr>';
      }).join("");
      return '<section id="mesCash' + (sales ? "Receipts" : "Payments") + '" class="cash-section"><div class="cash-section-head"><div><h2>' + title + '</h2><p>결제현황의 예정일과 미결제잔금을 자동 집계합니다.</p></div></div><div class="cash-table"><table><thead><tr><th>거래처</th><th>' + (sales ? "S.O" : "P.O") + '</th><th>' + (sales ? "판매금액" : "구매금액") + '</th><th>선금</th><th>' + (sales ? "수금액" : "지급액") + '</th><th>' + (sales ? "미수잔금" : "미지급잔금") + '</th><th>' + (sales ? "수금예정일" : "지급예정일") + '</th>' + (sales ? "<th>연체일수</th>" : "") + '</tr></thead><tbody>' + (body || '<tr><td colspan="8">자료가 없습니다.</td></tr>') + '</tbody></table></div></section>';
    }
    function inventoryTable(data) {
      var aging = data.aging.map(function (row) { return '<button onclick="openMesCashDrill(\'inventory\')"><small>' + row.label + '</small><b>' + won(row.value) + '</b><span>' + amount(row.weight) + ' kg</span></button>'; }).join("");
      var rows = data.inventory.map(function (row) {
        var warning = row.days >= 90 ? "warning" : "";
        var link = "openMesCashInventory(decodeURIComponent('" + urlToken(row.grade) + "'))";
        return '<tr class="' + warning + '"><td class="left"><button class="cash-link" onclick="' + link + '">' + encode(row.grade) + '</button></td><td><button class="cash-link" onclick="' + link + '">' + amount(row.weight) + ' kg</button></td><td><button class="cash-link" onclick="' + link + '">' + won(row.costPerKg) + '/kg</button></td><td><button class="cash-link" onclick="' + link + '">' + won(row.value) + '</button></td><td>' + row.days + '일 · ' + row.bucket + '</td></tr>';
      }).join("");
      return '<section id="mesCashInventory" class="cash-section"><div class="cash-section-head"><div><h2>재고자금</h2><p>판매계획에 배정되지 않은 재고의 실제매입원가</p></div></div><div class="cash-aging">' + aging + '</div><div class="cash-table"><table><thead><tr><th>강종</th><th>kg</th><th>실제매입원가</th><th>재고금액</th><th>재고일수</th></tr></thead><tbody>' + (rows || '<tr><td colspan="5">미판매 재고가 없습니다.</td></tr>') + '</tbody></table></div></section>';
    }
    function exceptionTable(data) {
      if (!data.exceptions.length) return "";
      var body = data.exceptions.map(function (row) { var link = "openMesCashOrder('" + row.kind + "',decodeURIComponent('" + urlToken(row.reference) + "'))"; return '<tr><td>' + (row.kind === "purchase" ? "P.O" : "S.O") + '</td><td><button class="cash-link" onclick="' + link + '">' + encode(row.reference) + '</button></td><td class="left"><button class="cash-link" onclick="' + link + '">' + encode(row.partner || "-") + '</button></td><td><b>' + encode(EXCEPTION_LABELS[row.calculation.exceptionType] || row.calculation.exceptionType) + '</b></td><td><button class="cash-link" onclick="' + link + '">' + won(row.exceptionKrw) + '</button></td><td class="left">' + encode(row.payment.memo || "-") + '</td></tr>'; }).join("");
      return '<section id="mesCashExceptions" class="cash-section cash-exceptions"><div class="cash-section-head"><div><h2>로스·클레임·계근오류</h2><p>잔금 마감 시 차감 저장된 자금 예외</p></div></div><div class="cash-table"><table><thead><tr><th>구분</th><th>P.O/S.O</th><th>거래처</th><th>사유</th><th>금액</th><th>내용</th></tr></thead><tbody>' + body + '</tbody></table></div></section>';
    }
    function renderCashDashboard() {
      cashMode = true;
      var data = report(), content = root.document.getElementById("content"), pageTitle = root.document.getElementById("pageTitle");
      if (!content) return false;
      if (pageTitle) pageTitle.textContent = "자금현황판";
      var shortage = data.shortageDate
        ? '<div class="cash-shortage danger"><b>⚠ 자금부족 예상일 ' + data.shortageDate + '</b><span>예정수금·예정지급 누적 후 잔액이 0원 이하가 되는 최초 날짜입니다.</span></div>'
        : '<div class="cash-shortage safe"><b>예정 자금잔액 정상</b><span>등록된 예정일 기준 자금부족 예상일이 없습니다.</span></div>';
      content.innerHTML = '<div class="dashboard-head cash-dashboard-head"><div><h1>자금현황판</h1><p>P.O 지급·S.O 수금·미판매재고를 연결한 실시간 자금 전망</p></div><div class="actions"><button class="btn" onclick="openMesAvailableFundsEditor()">현재자금 설정</button><button class="btn" onclick="openExecutiveFinanceDashboard()">기존 임원 현황판</button><button class="btn primary" onclick="loadState()">↻ 최신자료</button></div></div>' +
        shortage + (data.missingDueDates ? '<div class="cash-date-note">예정일 미입력 ' + data.missingDueDates + '건은 Cash Flow와 부족예상일 계산에서 제외되었습니다.</div>' : "") +
        (data.missingPlannedCostWeight ? '<div class="cash-date-note">동일강종 실제 매입원가 미확인 판매계획 ' + amount(data.missingPlannedCostWeight) + ' kg은 판매원가 0원으로 계산되었습니다.</div>' : "") +
        '<div class="cash-kpis">' +
          kpiButton("funds", "현재 가용자금", won(data.availableFunds), "클릭하여 현재자금 수정", data.availableFunds <= 0) +
          kpiButton("receivables", "판매 미수금", won(data.receivables), "판매총액 - 수금액 - 확정차감", false) +
          kpiButton("payables", "구매 미지급금", won(data.payables), "구매총액 - 지급액 - 확정차감", false) +
          kpiButton("inventory", "미판매재고 원가", won(data.inventoryCost), amount(data.inventory.reduce(function (sum, row) { return sum + row.weight; }, 0)) + " kg", data.inventory.some(function (row) { return row.days >= 90; })) +
          kpiButton("working", "순운전자금", won(data.netWorkingCapital), "현재자금 + 미수금 + 미판매재고원가 - 구매미지급금", data.netWorkingCapital <= 0) +
          kpiButton("forecast", "30일 예상자금", won(data.forecast30), "15일 재고 " + won(data.inventoryAfter15Days) + " · 60일 미수 " + won(data.receivablesOver60Days) + " · 전체 미출하 판매계획 " + won(data.plannedSalesAmount) + " - 동일강종 원가 " + won(data.sameGradeSalesCost), data.forecast30 <= 0) +
        '</div>' + chartHtml(data) + orderTable("sales", data.sales) + orderTable("purchase", data.purchases) + inventoryTable(data) + exceptionTable(data);
      return true;
    }
    root.openExecutiveCashDashboard = renderCashDashboard;
    root.openMesCashDrill = function (kind) {
      if (kind === "funds") return root.openMesAvailableFundsEditor();
      var id = kind === "receivables" ? "mesCashReceipts" : kind === "payables" ? "mesCashPayments" : kind === "inventory" ? "mesCashInventory" : "mesCashFlow";
      var target = root.document.getElementById(id);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    root.openMesCashOrder = function (kind, key) {
      cashMode = false;
      var view = kind === "purchase" ? "purchase" : "sales";
      if (typeof root.openView === "function") root.openView(view);
      root.setTimeout(function () { if (typeof root.openMesDetail === "function") root.openMesDetail(view, key); }, 80);
    };
    root.openMesCashInventory = function (grade) {
      cashMode = false;
      if (typeof root.openView === "function") root.openView("stockDetail");
      root.setTimeout(function () {
        if (typeof root.mesDraftSet === "function") root.mesDraftSet("q", grade);
        if (typeof root.mesApplySearch === "function") root.mesApplySearch();
      }, 80);
    };
    root.openMesAvailableFundsEditor = function () {
      var modal = root.document.getElementById("modal"), title = root.document.getElementById("modalTitle"), body = root.document.getElementById("modalBody"), data = report();
      if (!modal || !body) return false;
      if (title) title.textContent = "현재 가용자금 설정";
      body.innerHTML = '<form class="form-grid" onsubmit="saveMesAvailableFunds(event,this)"><label class="wide">현재 가용자금(원)<input name="availableFunds" type="number" step="1" value="' + data.availableFunds + '" required></label><p class="wide cash-setting-note">회사 계좌·현금 등 지금 즉시 사용할 수 있는 총 자금을 입력하세요. P.O/S.O 원본 구조를 바꾸지 않고 공용 설정에 저장합니다.</p><div class="wide actions"><button class="btn primary">저장</button><button type="button" class="btn" onclick="closeModal()">취소</button></div></form>';
      modal.classList.add("on");
      return true;
    };
    root.saveMesAvailableFunds = async function (event, form) {
      event.preventDefault();
      var value = number(form.availableFunds.value), commit = runtime.getCommit && runtime.getCommit();
      if (!commit) return false;
      var saved = await commit("현재 가용자금", ["systemSettings"], function (shared) {
        shared.systemSettings = shared.systemSettings || {};
        shared.systemSettings.mesCashFundingV1 = shared.systemSettings.mesCashFundingV1 || {};
        Object.assign(shared.systemSettings.mesCashFundingV1, { availableFunds: value, updatedAt: new Date().toISOString(), updatedByName: runtime.currentUserName ? runtime.currentUserName() : "MES" });
      });
      if (saved === false) return false;
      if (typeof root.closeModal === "function") root.closeModal();
      cashMode = true;
      renderCashDashboard();
      toast("현재 가용자금을 저장했습니다.");
      return true;
    };

    function decorateExecutiveButton() {
      if (runtime.getView && runtime.getView() !== "executive") return;
      var head = root.document.querySelector("#content .dashboard-head");
      if (!head || head.classList.contains("cash-dashboard-head")) return;
      var actions = head.querySelector(".actions");
      if (actions && !actions.querySelector(".cash-dashboard-open")) actions.insertAdjacentHTML("afterbegin", '<button class="btn cash-dashboard-open" onclick="openExecutiveCashDashboard()">자금현황판</button>');
      if (!root.document.getElementById("mesCashExecutiveAlert")) {
        var data = report(), messages = [];
        if (data.shortageDate) messages.push("자금부족 예상일 " + data.shortageDate);
        if (data.exceptions.length) messages.push("로스·클레임·계근오류 " + data.exceptions.length + "건 · " + won(data.exceptions.reduce(function (sum, row) { return sum + row.exceptionKrw; }, 0)));
        if (messages.length) head.insertAdjacentHTML("afterend", '<button id="mesCashExecutiveAlert" class="cash-executive-alert" onclick="openExecutiveCashDashboard()"><b>자금 경고</b><span>' + encode(messages.join(" · ")) + '</span><em>자금현황판 열기</em></button>');
      }
    }
    function decorateMobileCards() {
      var view = runtime.getView && runtime.getView();
      if (view !== "purchase" && view !== "sales") return;
      var schema = runtime.schemas[view], rows = schema && schema.rows ? schema.rows() : [];
      if (typeof root.filtered === "function") rows = root.filtered(rows);
      root.document.querySelectorAll("#content .mobile-card").forEach(function (card, index) {
        var dl = card.querySelector("dl"), row = rows[index];
        if (!dl || !row || dl.querySelector(".cash-mobile-payment")) return;
        dl.insertAdjacentHTML("beforeend", '<dt class="cash-mobile-payment">결제현황</dt><dd class="cash-mobile-payment">' + statusButton(view, row) + '</dd>');
      });
    }
    var baseRender = root.render;
    root.render = function () {
      installColumns();
      var output = baseRender.apply(this, arguments);
      root.requestAnimationFrame(function () {
        installColumns();
        if (cashMode && runtime.getView && runtime.getView() === "executive") renderCashDashboard();
        else decorateExecutiveButton();
        decorateMobileCards();
      });
      return output;
    };
    var baseExecutive = root.openExecutiveFinanceDashboard;
    if (typeof baseExecutive === "function") root.openExecutiveFinanceDashboard = function () { cashMode = false; var output = baseExecutive.apply(this, arguments); root.requestAnimationFrame(decorateExecutiveButton); return output; };
    var baseOpenExecutive = root.openExecutiveDashboard;
    if (typeof baseOpenExecutive === "function") root.openExecutiveDashboard = function () { cashMode = false; return baseOpenExecutive.apply(this, arguments); };
    new MutationObserver(function () { if (!cashMode) decorateExecutiveButton(); }).observe(root.document.getElementById("content") || root.document.body, { childList: true, subtree: true });

    var style = root.document.createElement("style");
    style.id = "mesCashFundingV1Style";
    style.textContent = '.cash-payment-status{border:1px solid #e2b46a;background:#fff6df;color:#8b5200;border-radius:999px;padding:7px 10px;font-weight:900;white-space:nowrap;cursor:pointer}.cash-payment-status.paid{border-color:#72c7b8;background:#e9f8f4;color:#087265}.cash-payment-total{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:14px;border-radius:14px;background:#eef8f6}.cash-payment-total small,.cash-payment-total strong{display:block}.cash-payment-total strong{font-size:19px;margin-top:5px}.cash-check>span{display:flex;align-items:center;gap:8px}.cash-check input[type=checkbox]{width:22px;height:22px}.cash-payment-preview{display:grid;gap:5px;padding:15px;border:2px solid #11978d;border-radius:13px;background:#edf9f7}.cash-payment-preview strong{font-size:22px}.cash-executive-alert{width:100%;display:flex;align-items:center;gap:14px;border:1px solid #d94f5c;border-radius:14px;background:#fff0f1;color:#9d1d2a;padding:14px 18px;margin:0 0 14px;text-align:left;cursor:pointer}.cash-executive-alert span{flex:1}.cash-executive-alert em{font-style:normal;font-weight:900}.cash-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:16px 0}.cash-kpi{border:1px solid #cadbd7;border-radius:17px;background:#fff;text-align:left;padding:18px;color:#102d28;cursor:pointer}.cash-kpi small,.cash-kpi span{display:block}.cash-kpi strong{display:block;font-size:25px;margin:8px 0}.cash-kpi.warning{border-color:#e0a438;background:#fff8df}.cash-shortage{display:flex;justify-content:space-between;gap:16px;padding:15px 18px;border-radius:14px;margin:14px 0}.cash-shortage.danger{background:#fff0f1;border:1px solid #d84e5a;color:#9d1d2a}.cash-shortage.safe{background:#eaf8f3;border:1px solid #69bba9;color:#096a5e}.cash-date-note{padding:11px 14px;border-radius:10px;background:#fff7d8;color:#85520c}.cash-section{background:#fff;border:1px solid #d5e2df;border-radius:18px;padding:18px;margin:16px 0}.cash-section-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}.cash-section-head h2{margin:0}.cash-section-head p{margin:5px 0 0;color:#627571}.cash-legend{display:flex;gap:14px;flex-wrap:wrap}.cash-legend span:before{content:"";display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:5px}.cash-legend .in:before,.cash-bars .in{background:#1a9b87}.cash-legend .out:before,.cash-bars .out{background:#e06969}.cash-legend .balance:before,.cash-bars .balance{background:#376fc2}.cash-chart{height:255px;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;align-items:end;margin-top:12px}.cash-chart>button{height:100%;border:0;border-radius:13px;background:#f4f8f7;padding:10px;display:flex;flex-direction:column;justify-content:flex-end;gap:3px;cursor:pointer}.cash-bars{height:150px;display:flex;align-items:flex-end;justify-content:center;gap:5px;border-bottom:1px solid #adbfba}.cash-bars i{display:block;width:20%;min-width:12px;border-radius:6px 6px 0 0}.cash-bars .negative{background:#b52432}.cash-chart small,.cash-chart strong{display:block}.cash-table{overflow:auto;margin-top:13px}.cash-table table{width:100%;border-collapse:collapse;white-space:nowrap}.cash-table th,.cash-table td{padding:11px;border-bottom:1px solid #e0e8e6;text-align:right}.cash-table th{background:#eef5f3}.cash-table .left{text-align:left}.cash-table tr.danger{background:#fff0f1}.cash-table tr.warning{background:#fff7df}.cash-link{border:0;background:none;color:#086d89;text-decoration:underline;font-weight:800;cursor:pointer;padding:0}.cash-red{color:#b42332}.cash-aging{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:14px}.cash-aging button{border:1px solid #d5e2df;border-radius:11px;background:#f7faf9;padding:11px;text-align:left}.cash-aging small,.cash-aging b,.cash-aging span{display:block}.cash-aging b{margin:5px 0}.cash-exceptions{border-color:#e4b35a;background:#fffaf0}.cash-setting-note{padding:12px;border-radius:10px;background:#eef8f6}@media(max-width:900px){.cash-kpis{grid-template-columns:repeat(2,1fr)}.cash-aging{grid-template-columns:repeat(2,1fr)}}@media(max-width:600px){.cash-kpis{grid-template-columns:1fr}.cash-chart{height:auto;grid-template-columns:1fr 1fr}.cash-chart>button{min-height:225px}.cash-payment-total{grid-template-columns:1fr}.cash-shortage{display:grid}.cash-aging{grid-template-columns:1fr}.cash-dashboard-head .actions{grid-template-columns:1fr!important}.cash-payment-status{white-space:normal}.cash-executive-alert{display:grid}}';
    root.document.head.appendChild(style);
    root.requestAnimationFrame(function () { decorateExecutiveButton(); decorateMobileCards(); });
    return true;
  }

  return {
    VERSION: VERSION,
    EXCEPTION_LABELS: EXCEPTION_LABELS,
    rawLineAmount: rawLineAmount,
    krwLineAmount: krwLineAmount,
    readPayment: readPayment,
    calculatePayment: calculatePayment,
    orderGroups: orderGroups,
    inventoryRows: inventoryRows,
    plannedSalesFunding: plannedSalesFunding,
    buildCashReport: buildCashReport,
    install: install
  };
});
