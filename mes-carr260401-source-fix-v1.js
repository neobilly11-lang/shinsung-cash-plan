(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.MesCarr260401SourceFix = api;
    if (root.document) api.install(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var PO_NO = "CARR260401";

  function number(value) {
    var parsed = Number(String(value == null ? "" : value).replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function active(row) {
    return row && String(row.status || "").toUpperCase() !== "CANCELLED";
  }

  function samePo(row) {
    return String(row && row.poNo || "").trim().toUpperCase() === PO_NO;
  }

  function searchableGrade(row) {
    return [
      row && row.grade,
      row && row.sourceGrade,
      row && row.mainGrade,
      row && row.marking,
      row && row.description,
      row && row.detailGrade
    ].filter(Boolean).join(" ").toUpperCase().replace(/[＿_]/g, " ").replace(/\s+/g, " ").trim();
  }

  function copperKind(row) {
    var text = searchableGrade(row);
    var compact = text.replace(/\s+/g, "");
    var fields = [row && row.grade, row && row.sourceGrade, row && row.mainGrade, row && row.marking]
      .filter(Boolean)
      .map(function (value) { return String(value).toUpperCase().replace(/\s+/g, " ").trim(); });
    if (fields.some(function (value) { return /^(?:CU\s*·?\s*)?(?:COPPER\s*)?70(?:\s*\/\s*(?:20|30))?(?:\s*COPPER)?$/.test(value); }) || /(?:^|[^0-9])70\/(?:20|30)(?:[^0-9]|$)/.test(text) || /COPPER\s*70\/(?:20|30)/.test(text)) return "70";
    if (fields.some(function (value) { return /^(?:CU\s*·?\s*)?(?:COPPER\s*)?90(?:\s*\/\s*(?:10|20))?(?:\s*COPPER)?$/.test(value); }) || /(?:^|[^0-9])90\/(?:10|20)(?:[^0-9]|$)/.test(text) || /COPPER\s*90\/(?:10|20)/.test(text)) return "90";
    return "";
  }

  function assign(row, key, value, report) {
    if (row[key] === value) return;
    row[key] = value;
    report.changed = true;
  }

  function correctPurchaseRow(row, report) {
    var kind = copperKind(row);
    if (!kind) return;
    var isPackingRow = Boolean(row.inboundRequestId || row.inboundRequestNo || row.packingPackageNo);
    var canonical = kind === "70" ? "70/30 COPPER" : "90/10 COPPER";
    var netWeight = kind === "70" ? 494 : 4218;
    var grossWeight = kind === "70" && isPackingRow ? 498 : netWeight;
    var unitPrice = kind === "70" ? 9 : 6.9;

    assign(row, "grade", canonical, report);
    if (Object.prototype.hasOwnProperty.call(row, "sourceGrade")) assign(row, "sourceGrade", canonical, report);
    if (Object.prototype.hasOwnProperty.call(row, "marking")) assign(row, "marking", canonical, report);
    assign(row, "weight", netWeight, report);
    assign(row, "netWeight", netWeight, report);
    assign(row, "grossWeight", grossWeight, report);
    if (Object.prototype.hasOwnProperty.call(row, "tareWeight")) assign(row, "tareWeight", Math.max(0, grossWeight - netWeight), report);
    ["price", "unitPrice", "purchasePrice", "usdPrice"].forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(row, key)) assign(row, key, unitPrice, report);
    });
    ["amount", "total", "totalValue", "purchaseAmount"].forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(row, key)) assign(row, key, Math.round(netWeight * unitPrice * 100) / 100, report);
    });
    report.rows.push({ kind: kind, grade: canonical, netWeight: netWeight, grossWeight: grossWeight });
  }

  function correctRequestItem(item, report) {
    var kind = copperKind(item);
    if (!kind) return;
    var canonical = kind === "70" ? "70/30 COPPER" : "90/10 COPPER";
    var netWeight = kind === "70" ? 494 : 4218;
    var grossWeight = kind === "70" ? 498 : 4218;
    assign(item, "grade", canonical, report);
    ["marking", "description", "sourceGrade"].forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(item, key)) assign(item, key, canonical, report);
    });
    assign(item, "weight", netWeight, report);
    assign(item, "nw", netWeight, report);
    assign(item, "netWeight", netWeight, report);
    assign(item, "gw", grossWeight, report);
    assign(item, "grossWeight", grossWeight, report);
    if (Object.prototype.hasOwnProperty.call(item, "tareWeight")) assign(item, "tareWeight", grossWeight - netWeight, report);
  }

  function correctCarr260401State(state) {
    var report = { changed: false, rows: [] };
    if (!state || typeof state !== "object") return report;

    (Array.isArray(state.pos) ? state.pos : []).forEach(function (row) {
      if (active(row) && samePo(row)) correctPurchaseRow(row, report);
    });

    (Array.isArray(state.purchaseRequests) ? state.purchaseRequests : []).forEach(function (request) {
      if (!active(request) || !samePo(request)) return;
      var items = Array.isArray(request.items) ? request.items : [];
      items.forEach(function (item) { correctRequestItem(item, report); });
      if (items.length) {
        var summary = items.map(function (item) {
          return String(item.grade || item.marking || "").trim();
        }).filter(Boolean).join(" / ");
        if (summary && Object.prototype.hasOwnProperty.call(request, "gradeSummary")) assign(request, "gradeSummary", summary, report);
      }
    });

    return report;
  }

  function install(root) {
    var runtime = root.__mesRuntime;
    if (!runtime || root.__mesCarr260401SourceFixInstalled) return false;
    root.__mesCarr260401SourceFixInstalled = true;
    var originalLoad = root.loadState;
    var persisting = false;
    var pendingPersist = false;

    async function persistCorrection() {
      if (persisting || !pendingPersist) return;
      persisting = true;
      pendingPersist = false;
      try {
        var commit = runtime.getCommit();
        await commit("CARR260401 원본 P.O 강종·중량 정정", ["pos", "purchaseRequests"], function (draft) {
          correctCarr260401State(draft);
        });
      } finally {
        persisting = false;
      }
    }

    if (typeof originalLoad === "function") {
      root.loadState = async function (shouldRender) {
        var renderAfter = shouldRender !== false;
        var result = await originalLoad.call(this, false);
        var current = runtime.getState();
        var report = correctCarr260401State(current);
        runtime.setState(current);
        if (renderAfter) runtime.getRender()();
        if (report.changed && !persisting) {
          pendingPersist = true;
          root.setTimeout(persistCorrection, 0);
        }
        return result;
      };
    }

    var initial = runtime.getState();
    var initialReport = correctCarr260401State(initial);
    runtime.setState(initial);
    if (initialReport.changed) {
      runtime.getRender()();
      pendingPersist = true;
      root.setTimeout(persistCorrection, 0);
    }
    return true;
  }

  return {
    PO_NO: PO_NO,
    copperKind: copperKind,
    correctCarr260401State: correctCarr260401State,
    install: install,
    number: number
  };
});
