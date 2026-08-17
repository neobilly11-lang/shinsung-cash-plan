(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.MesExecutiveDashboard = api;
    if (root.document) api.install(root);
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VERSION = "20260816-2";
  var PHYSICAL_STAGES = ["arrival", "uninspected", "workWaiting", "unpacked", "completed"];
  var STAGE_LABELS = {
    arrival: "입항예정",
    uninspected: "미검수",
    workWaiting: "작업대기",
    unpacked: "미포장",
    completed: "완료재고",
    shippingPlanned: "판매계획완료"
  };

  function list(value) { return Array.isArray(value) ? value : []; }
  function text(value) { return String(value == null ? "" : value).trim(); }
  function upper(value) { return text(value).toUpperCase(); }
  function number(value) {
    var parsed = Number(String(value == null ? "" : value).replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function round(value) { return Math.round(number(value) * 100) / 100; }
  function encode(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char];
    });
  }
  function active(row) {
    if (!row || row.active === false || row.deleted === true || row.isDeleted === true || row.deletedAt) return false;
    return !/^(?:CANCELLED|DELETED|VOID|ARCHIVED)$/.test(upper(row.status));
  }
  function normalizeCurrency(value) {
    var currency = upper(value || "KRW");
    if (currency === "EUR") return "EURO";
    return ["KRW", "USD", "JPY", "EURO"].includes(currency) ? currency : "KRW";
  }
  function rowWeight(row) {
    return number(row && (row.netWeight != null && row.netWeight !== "" ? row.netWeight : row.nw != null && row.nw !== "" ? row.nw : row.weight));
  }
  function rowUnitPrice(row, weight) {
    var unit = number(row && (row.unitPrice != null ? row.unitPrice : row.purchasePrice != null ? row.purchasePrice : row.price != null ? row.price : row.usdPrice));
    if (unit > 0) return unit;
    var amount = number(row && (row.amount || row.totalValue || row.purchaseAmount || row.salesAmount));
    return amount > 0 && weight > 0 ? amount / weight : 0;
  }
  function gradeLabel(row, fallback) {
    row = row || {};
    return [row.productType, row.mainGrade || row.finalGrade, row.subGrade, row.detailGrade].filter(Boolean).join(" · ") || text(row.grade || row.originalGrade || row.itemName || fallback || "미분류");
  }
  function currentEmail(root) {
    var auth = root.__mesRuntime && root.__mesRuntime.getAuthUser && root.__mesRuntime.getAuthUser();
    return text(auth && auth.email).toLowerCase();
  }
  function settings(state) {
    if (!state.systemSettings || typeof state.systemSettings !== "object") state.systemSettings = {};
    if (!Array.isArray(state.systemSettings.executiveUsers)) state.systemSettings.executiveUsers = [];
    if (!state.systemSettings.executiveExchangeRates || typeof state.systemSettings.executiveExchangeRates !== "object") state.systemSettings.executiveExchangeRates = {};
    if (!Array.isArray(state.systemSettings.executiveExchangeRateHistory)) state.systemSettings.executiveExchangeRateHistory = [];
    return state.systemSettings;
  }
  function executiveUsers(state) {
    return list(settings(state).executiveUsers).map(function (row) {
      return { name: text(row && row.name), email: text(row && row.email).toLowerCase() };
    }).filter(function (row) { return row.email; }).slice(0, 2);
  }
  function isExecutive(state, email) {
    email = text(email).toLowerCase();
    return !!email && executiveUsers(state).some(function (row) { return row.email === email; });
  }
  function canManageExecutives(state, email) {
    email = text(email).toLowerCase();
    var users = executiveUsers(state);
    var admin = text(settings(state).soleAdminEmail).toLowerCase();
    return !users.length || (!!email && (email === admin || isExecutive(state, email)));
  }

  function allRows(state) {
    return [].concat(list(state.pos), list(state.salesOrders), list(state.purchaseRequests), list(state.auditLogs), list(state.userProfiles), list(state.users));
  }
  function userCandidates(state, root) {
    var map = new Map();
    function add(name, email) {
      email = text(email).toLowerCase();
      if (!email || !email.includes("@")) return;
      if (!map.has(email)) map.set(email, { name: text(name) || email.split("@")[0], email: email });
    }
    var auth = root && root.__mesRuntime && root.__mesRuntime.getAuthUser && root.__mesRuntime.getAuthUser();
    add(auth && (auth.user_metadata && (auth.user_metadata.name || auth.user_metadata.full_name)), auth && auth.email);
    allRows(state).forEach(function (row) {
      add(row && (row.name || row.userName || row.operatorName || row.createdByName || row.updatedByName), row && (row.email || row.userEmail || row.operatorEmail || row.actorEmail || row.createdByEmail || row.updatedByEmail));
    });
    executiveUsers(state).forEach(function (row) { add(row.name, row.email); });
    return Array.from(map.values()).sort(function (a, b) { return a.name.localeCompare(b.name, "ko"); });
  }

  function packageNoOf(record) {
    record = record || {};
    return text(record.packageNo || record.sourcePackageNo || record.internalPackageNo || record.inboundNo || record.bag && record.bag.packageNo || record.move && record.move.packageNo);
  }
  function findOrigin(state, record) {
    record = record || {};
    if (record.poNo && (record.company || record.unitPrice || record.purchasePrice)) return record;
    var packageNo = packageNoOf(record);
    var pos = list(state.pos).filter(active);
    if (packageNo) {
      var matched = pos.find(function (row) { return text(row.packageNo) === packageNo || text(row.internalPackageNo) === packageNo; });
      if (matched) return matched;
    }
    var poNo = text(record.poNo || record.purchaseNo || record.bag && record.bag.poNo);
    if (poNo) {
      var byPo = pos.find(function (row) { return text(row.poNo) === poNo; });
      if (byPo) return byPo;
    }
    var completionNo = text(record.completionNo || record.bagNo || record.id);
    if (completionNo) {
      var input = list(state.inputs).find(function (row) { return text(row.bagId || row.completionNo || row.bagNo) === completionNo; });
      if (input) return findOrigin(state, input);
    }
    return record;
  }
  function purchaseMeta(state, source, group) {
    var record = source && source.record || {};
    var origin = findOrigin(state, record);
    var weight = number(source && source.weight);
    return {
      stage: text(source && source.stage),
      grade: text(source && source.sourceLabel) || gradeLabel(record, group && group.gradeLabel),
      rawGrade: text(source && source.rawSourceLabel) || gradeLabel(origin),
      partner: text(origin.company || origin.supplier || record.company || record.supplier),
      poNo: text(origin.poNo || record.poNo || record.purchaseNo),
      packageNo: packageNoOf(record) || packageNoOf(origin),
      weight: weight,
      unitPrice: rowUnitPrice(origin, weight),
      currency: normalizeCurrency(origin.currency || record.currency),
      exchangeRate: number(origin.exchangeRate || record.exchangeRate),
      record: record,
      origin: origin,
      groupId: text(group && group.id)
    };
  }
  function saleMeta(source) {
    var record = source && source.record || {};
    var weight = number(source && source.weight);
    return {
      soNo: text(record.soNo || record.salesNo),
      customer: text(record.customer || record.salesCompany || record.company),
      weight: weight,
      unitPrice: rowUnitPrice(record, weight),
      currency: normalizeCurrency(record.currency),
      exchangeRate: number(record.exchangeRate),
      record: record
    };
  }
  function deriveRates(state, saved) {
    var rates = { KRW: 1, USD: 0, JPY: 0, EURO: 0 };
    ["USD", "JPY", "EURO"].forEach(function (currency) {
      var configured = number(saved && (saved[currency] != null ? saved[currency] : currency === "EURO" ? saved.EUR : 0));
      if (configured > 0) { rates[currency] = configured; return; }
      var candidates = allRows(state).filter(function (row) { return normalizeCurrency(row && row.currency) === currency && number(row && row.exchangeRate) > 0; }).sort(function (a, b) {
        return text(b.updatedAt || b.createdAt).localeCompare(text(a.updatedAt || a.createdAt));
      });
      rates[currency] = candidates.length ? number(candidates[0].exchangeRate) : 0;
    });
    return rates;
  }
  function convertedAmount(weight, unitPrice, currency, rowRate, rates) {
    currency = normalizeCurrency(currency);
    var rate = currency === "KRW" ? 1 : number(rates && rates[currency]) || number(rowRate);
    return { originalAmount: round(number(weight) * number(unitPrice)), rate: rate, convertedAmount: round(number(weight) * number(unitPrice) * rate) };
  }

  function buildExecutiveReport(state, forecasts, savedRates) {
    state = state || {};
    var rates = deriveRates(state, savedRates || settings(state).executiveExchangeRates);
    var unsold = [], planned = [];
    list(forecasts).filter(function (group) { return group && !group.isFamilySummary; }).forEach(function (group) {
      var physical = list(group.sources).filter(function (source) { return PHYSICAL_STAGES.includes(source.stage) && number(source.weight) > 0; }).map(function (source) { return purchaseMeta(state, source, group); });
      var sales = list(group.sources).filter(function (source) { return source.stage === "shippingPlanned" && number(source.weight) > 0; }).map(saleMeta);
      var pools = physical.map(function (row) { return Object.assign({}, row, { remaining: row.weight }); });
      sales.forEach(function (sale) {
        var saleRemaining = sale.weight;
        pools.forEach(function (pool) {
          if (saleRemaining <= 0 || pool.remaining <= 0) return;
          var quantity = Math.min(pool.remaining, saleRemaining);
          var currency = sale.currency || pool.currency;
          var unitPrice = sale.unitPrice || pool.unitPrice;
          var value = convertedAmount(quantity, unitPrice, currency, sale.exchangeRate || pool.exchangeRate, rates);
          planned.push(Object.assign({}, pool, sale, value, {
            category: "planned", stage: "shippingPlanned", weight: round(quantity),
            partner: sale.customer || pool.partner, supplier: pool.partner,
            currency: currency, unitPrice: unitPrice
          }));
          pool.remaining = round(pool.remaining - quantity);
          saleRemaining = round(saleRemaining - quantity);
        });
      });
      pools.forEach(function (pool) {
        if (pool.remaining <= 0) return;
        var value = convertedAmount(pool.remaining, pool.unitPrice, pool.currency, pool.exchangeRate, rates);
        unsold.push(Object.assign({}, pool, value, { category: "unsold", weight: round(pool.remaining) }));
      });
    });
    function sum(rows, key) { return round(rows.reduce(function (total, row) { return total + number(row[key]); }, 0)); }
    var all = unsold.concat(planned);
    return {
      rates: rates,
      unsold: unsold,
      planned: planned,
      all: all,
      totals: {
        unsold: sum(unsold, "convertedAmount"),
        planned: sum(planned, "convertedAmount"),
        total: sum(all, "convertedAmount"),
        unsoldWeight: sum(unsold, "weight"),
        plannedWeight: sum(planned, "weight"),
        totalWeight: sum(all, "weight")
      }
    };
  }

  function createExchangeRateHistoryEntry(beforeReport, afterReport, previousRates, nextRates, previousEffectiveAt, changedAt, changedBy) {
    beforeReport = beforeReport || { totals: {} };
    afterReport = afterReport || { totals: {} };
    changedAt = changedAt || new Date().toISOString();
    function totals(report) {
      return {
        total: round(report.totals && report.totals.total),
        unsold: round(report.totals && report.totals.unsold),
        planned: round(report.totals && report.totals.planned)
      };
    }
    var before = totals(beforeReport), after = totals(afterReport);
    return {
      id: "fx-" + changedAt,
      previousEffectiveAt: previousEffectiveAt || changedAt,
      changedAt: changedAt,
      changedBy: text(changedBy),
      previousRates: Object.assign({}, previousRates || {}),
      nextRates: Object.assign({}, nextRates || {}),
      previousTotals: before,
      nextTotals: after,
      differences: {
        total: round(after.total - before.total),
        unsold: round(after.unsold - before.unsold),
        planned: round(after.planned - before.planned)
      }
    };
  }

  function install(root) {
    var runtime = root.__mesRuntime;
    if (!runtime || root.__mesExecutiveDashboardInstalled) return false;
    root.__mesExecutiveDashboardInstalled = true;
    var baseBuildNav = root.buildNav;
    var baseOpenView = root.openView;
    var baseRender = root.render;
    var baseOpenRegistration = root.openMesRegistration;
    var baseOpenExpectedSo = root.openExpectedSoComposer;
    var baseSaveEdit = root.saveEdit;
    var category = "total";
    var filters = { grade: "", partner: "", po: "", currency: "" };
    var historyFilters = { from: "", to: "" };

    function state() { return runtime.getState(); }
    function fmt(value) { return (runtime.fmt || function (v) { return number(v).toLocaleString("ko-KR"); })(value); }
    function email() { return currentEmail(root); }
    function allowed() { return isExecutive(state(), email()); }
    function manageAllowed() { return canManageExecutives(state(), email()); }
    function report() {
      var forecasts = typeof root.mesForecastRows === "function" ? root.mesForecastRows() : [];
      return buildExecutiveReport(state(), forecasts, settings(state()).executiveExchangeRates);
    }
    function decorateCurrencies() {
      root.document.querySelectorAll('select[name="currency"]').forEach(function (select) {
        Array.from(select.options).forEach(function (option) {
          if (upper(option.value || option.textContent) === "EUR") {
            option.value = "EURO";
            option.textContent = "EURO";
          }
        });
        ["KRW", "USD", "JPY", "EURO"].forEach(function (value) {
          var exists = Array.from(select.options).some(function (option) { return upper(option.value || option.textContent) === value; });
          if (!exists) select.add(new Option(value, value));
        });
      });
    }
    function navButton() {
      if (!allowed()) return "";
      return '<div class="nav-group mes-executive-nav"><div class="nav-title">임원 전용</div><button class="nav-btn" data-id="executive" onclick="openExecutiveDashboard()"><b>14</b> 임원용 현황판</button></div>';
    }
    root.buildNav = function () {
      var result = baseBuildNav.apply(this, arguments);
      var nav = root.document.getElementById("nav");
      if (nav && !nav.querySelector(".mes-executive-nav")) nav.insertAdjacentHTML("beforeend", navButton());
      return result;
    };
    root.openExecutiveDashboard = function () {
      if (!allowed()) { root.toast("임원으로 지정된 사용자만 확인할 수 있습니다.", true); return false; }
      return baseOpenView.call(root, "executive");
    };
    root.openView = function (id) {
      if (id === "executive" && !allowed()) { root.toast("임원으로 지정된 사용자만 확인할 수 있습니다.", true); return false; }
      return baseOpenView.apply(this, arguments);
    };
    root.setExecutiveCategory = function (next) { category = next; renderExecutive(); };
    root.applyExecutiveFilters = function () {
      var form = root.document.getElementById("mesExecutiveFilter");
      if (form) {
        var data = new FormData(form);
        filters = { grade: text(data.get("grade")), partner: text(data.get("partner")), po: text(data.get("po")), currency: text(data.get("currency")) };
      }
      renderExecutive();
    };
    root.clearExecutiveFilters = function () { filters = { grade: "", partner: "", po: "", currency: "" }; renderExecutive(); };

    function visibleRows(data) {
      var rows = category === "unsold" ? data.unsold : category === "planned" ? data.planned : data.all;
      var grade = upper(filters.grade), partner = upper(filters.partner), po = upper(filters.po), currency = upper(filters.currency);
      return rows.filter(function (row) {
        return (!grade || upper(row.grade + " " + row.rawGrade).includes(grade)) &&
          (!partner || upper(row.partner + " " + row.supplier + " " + row.customer).includes(partner)) &&
          (!po || upper(row.poNo + " " + row.soNo + " " + row.packageNo).includes(po)) &&
          (!currency || normalizeCurrency(row.currency) === currency);
      });
    }
    function rowTable(rows) {
      if (!rows.length) return '<div class="empty">검색 조건에 맞는 재고가 없습니다.</div>';
      var total = round(rows.reduce(function (sum, row) { return sum + row.convertedAmount; }, 0));
      var weight = round(rows.reduce(function (sum, row) { return sum + row.weight; }, 0));
      return '<div class="mes-exec-table"><table><thead><tr><th>구분</th><th>재고단계</th><th>강종</th><th>거래처</th><th>P.O / S.O</th><th>중량</th><th>단가</th><th>통화</th><th>적용환율</th><th>환산액(KRW)</th></tr></thead><tbody>' + rows.map(function (row) {
        return '<tr><td>' + (row.category === "planned" ? "판매계획완료" : "미판매") + '</td><td>' + encode(STAGE_LABELS[row.stage] || row.stage) + '</td><td class="left">' + encode(row.grade || row.rawGrade) + '</td><td class="left">' + encode(row.partner || row.supplier || "-") + '</td><td>' + encode([row.poNo, row.soNo].filter(Boolean).join(" / ") || "-") + '</td><td>' + fmt(row.weight) + ' kg</td><td>' + (row.unitPrice ? fmt(row.unitPrice) : "단가 미입력") + '</td><td>' + encode(normalizeCurrency(row.currency)) + '</td><td>' + (row.rate ? fmt(row.rate) : "환율 미입력") + '</td><td><b>' + fmt(row.convertedAmount) + '</b></td></tr>';
      }).join("") + '</tbody><tfoot><tr><th colspan="5">검색 결과 합계</th><th>' + fmt(weight) + ' kg</th><th colspan="3"></th><th>' + fmt(total) + '원</th></tr></tfoot></table></div>';
    }
    function localDate(value) {
      if (!value) return "-";
      var parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? text(value) : parsed.toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    }
    function exchangeHistoryEntries() {
      var from = text(historyFilters.from), to = text(historyFilters.to);
      return list(settings(state()).executiveExchangeRateHistory).filter(function (entry) {
        var changedDate = text(entry && entry.changedAt).slice(0, 10);
        return (!from || changedDate >= from) && (!to || changedDate <= to);
      });
    }
    function exchangeHistoryRows(history) {
      var categories = [{ key: "total", label: "총재고" }, { key: "unsold", label: "미판매 예상재고" }, { key: "planned", label: "판매계획완료 재고" }];
      return history.flatMap(function (entry) {
        return categories.map(function (category) {
          return {
            id: text(entry.id),
            category: category.label,
            previousEffectiveAt: localDate(entry.previousEffectiveAt),
            previousTotal: number(entry.previousTotals && entry.previousTotals[category.key]),
            changedAt: localDate(entry.changedAt),
            nextTotal: number(entry.nextTotals && entry.nextTotals[category.key]),
            difference: number(entry.differences && entry.differences[category.key]),
            previousRates: Object.assign({}, entry.previousRates || {}),
            nextRates: Object.assign({}, entry.nextRates || {}),
            changedBy: text(entry.changedBy || "-")
          };
        });
      });
    }
    function exchangeHistoryTable() {
      var allHistory = list(settings(state()).executiveExchangeRateHistory);
      var history = exchangeHistoryEntries();
      var controls = '<div class="mes-exec-history-filter"><label>시작일<input id="mesFxHistoryFrom" type="date" value="' + encode(historyFilters.from) + '"></label><label>종료일<input id="mesFxHistoryTo" type="date" value="' + encode(historyFilters.to) + '"></label><button type="button" class="btn primary" onclick="applyExecutiveHistoryFilters()">기간 검색</button><button type="button" class="btn" onclick="clearExecutiveHistoryFilters()">전체 보기</button><button type="button" class="btn" onclick="downloadExecutiveExchangeHistory()">엑셀 다운로드</button></div>';
      var head = '<div class="panel mes-exec-history"><div class="dashboard-head"><div><h2>환율 변경 이력 · 예상 환차손익</h2><p>변경 전 금액과 변경 후 금액을 기준일별로 보존합니다. 검색 결과 ' + history.length + '건 / 전체 ' + allHistory.length + '건</p></div></div>' + controls;
      if (!allHistory.length) return head + '<div class="empty">아직 환율 변경 이력이 없습니다.</div></div>';
      if (!history.length) return head + '<div class="empty">선택한 기간에 환율 변경 이력이 없습니다.</div></div>';
      var categories = [{ key: "total", label: "총재고" }, { key: "unsold", label: "미판매 예상재고" }, { key: "planned", label: "판매계획완료 재고" }];
      return head + '<div class="mes-exec-table"><table><thead><tr><th>구분</th><th>변경 전 기준일</th><th>변경 전 금액</th><th>변경일</th><th>변경 후 금액</th><th>환차익 / 환차손</th><th>변경 전 환율</th><th>변경 후 환율</th><th>변경자</th><th>관리</th></tr></thead><tbody>' + history.flatMap(function (entry) {
        return categories.map(function (category, index) {
          var difference = number(entry.differences && entry.differences[category.key]);
          var previousRateText = ["USD", "JPY", "EURO"].map(function (currency) { return currency + " " + fmt(entry.previousRates && entry.previousRates[currency]); }).join(" · ");
          var nextRateText = ["USD", "JPY", "EURO"].map(function (currency) { return currency + " " + fmt(entry.nextRates && entry.nextRates[currency]); }).join(" · ");
          var removeCell = index === 0 ? '<td rowspan="3"><button type="button" class="btn danger" onclick="deleteExecutiveExchangeHistory(\'' + encode(entry.id) + '\')">삭제</button></td>' : '';
          return '<tr><td class="left"><b>' + category.label + '</b></td><td>' + encode(localDate(entry.previousEffectiveAt)) + '</td><td>' + fmt(entry.previousTotals && entry.previousTotals[category.key]) + '원</td><td>' + encode(localDate(entry.changedAt)) + '</td><td>' + fmt(entry.nextTotals && entry.nextTotals[category.key]) + '원</td><td class="' + (difference >= 0 ? "gain" : "loss") + '"><b>' + (difference > 0 ? "+" : "") + fmt(difference) + '원</b></td><td>' + encode(previousRateText) + '</td><td>' + encode(nextRateText) + '</td><td>' + encode(entry.changedBy || "-") + '</td>' + removeCell + '</tr>';
        });
      }).join("") + '</tbody></table></div></div>';
    }
    function renderExecutive() {
      if (!allowed()) { baseOpenView.call(root, "dashboard"); return; }
      var data = report(), rows = visibleRows(data), totals = data.totals;
      var title = category === "unsold" ? "미판매 예상재고" : category === "planned" ? "판매계획완료 재고" : "총재고";
      var content = root.document.getElementById("content");
      var pageTitle = root.document.getElementById("pageTitle");
      if (pageTitle) pageTitle.textContent = "임원용 현황판";
      content.innerHTML = '<div class="dashboard-head"><div><h1>임원용 현황판</h1><p>지정된 임원 2명만 조회할 수 있습니다. 금액은 적용환율 기준 원화 환산액입니다.</p></div><div class="actions"><button class="btn" onclick="openExecutiveExchangeRates()">예상환차손 · 환율 일괄변경</button><button class="btn" onclick="openExecutiveUserManager()">임원 2명 지정</button><button class="btn primary" onclick="loadState()">↻ 최신자료 조회</button></div></div>' +
        '<div class="mes-exec-kpis"><button class="mes-exec-kpi ' + (category === "total" ? "on" : "") + '" onclick="setExecutiveCategory(\'total\')"><small>총재고 환산액</small><strong>' + fmt(totals.total) + '원</strong><span>' + fmt(totals.totalWeight) + ' kg</span></button><button class="mes-exec-kpi ' + (category === "unsold" ? "on" : "") + '" onclick="setExecutiveCategory(\'unsold\')"><small>미판매 예상재고액</small><strong>' + fmt(totals.unsold) + '원</strong><span>' + fmt(totals.unsoldWeight) + ' kg</span></button><button class="mes-exec-kpi ' + (category === "planned" ? "on" : "") + '" onclick="setExecutiveCategory(\'planned\')"><small>판매계획완료 재고액</small><strong>' + fmt(totals.planned) + '원</strong><span>' + fmt(totals.plannedWeight) + ' kg</span></button></div>' +
        '<div class="panel"><div class="dashboard-head"><div><h2>' + title + ' 상세 재고</h2><p>S.O 출하확정 재고는 제외됩니다.</p></div></div><form id="mesExecutiveFilter" class="mes-exec-filter" onsubmit="event.preventDefault();applyExecutiveFilters()"><label>강종<input name="grade" value="' + encode(filters.grade) + '" placeholder="강종 검색"></label><label>거래처<input name="partner" value="' + encode(filters.partner) + '" placeholder="공급사·판매처 검색"></label><label>P.O / S.O<input name="po" value="' + encode(filters.po) + '" placeholder="P.O·S.O·사내번호 검색"></label><label>통화<select name="currency"><option value="">전체</option>' + ["KRW", "USD", "JPY", "EURO"].map(function (value) { return '<option ' + (filters.currency === value ? "selected" : "") + '>' + value + '</option>'; }).join("") + '</select></label><button class="btn primary">검색</button><button type="button" class="btn" onclick="clearExecutiveFilters()">초기화</button></form>' + rowTable(rows) + '</div>' + exchangeHistoryTable();
      decorateCurrencies();
      var nav = root.document.getElementById("nav");
      if (nav) nav.querySelectorAll(".nav-btn").forEach(function (button) { button.classList.toggle("on", button.dataset.id === "executive"); });
    }

    root.applyExecutiveHistoryFilters = function () {
      var from = root.document.getElementById("mesFxHistoryFrom");
      var to = root.document.getElementById("mesFxHistoryTo");
      historyFilters = { from: text(from && from.value), to: text(to && to.value) };
      if (historyFilters.from && historyFilters.to && historyFilters.from > historyFilters.to) {
        root.toast("시작일은 종료일보다 늦을 수 없습니다.", true);
        return;
      }
      renderExecutive();
    };
    root.clearExecutiveHistoryFilters = function () {
      historyFilters = { from: "", to: "" };
      renderExecutive();
    };
    root.downloadExecutiveExchangeHistory = async function () {
      var history = exchangeHistoryEntries();
      if (!history.length) { root.toast("다운로드할 환율 변경 이력이 없습니다.", true); return; }
      var rows = [["구분", "변경 전 기준일", "변경 전 금액(KRW)", "변경일", "변경 후 금액(KRW)", "환차익·환차손(KRW)", "변경 전 USD", "변경 전 JPY", "변경 전 EURO", "변경 후 USD", "변경 후 JPY", "변경 후 EURO", "변경자"]];
      exchangeHistoryRows(history).forEach(function (row) {
        rows.push([row.category, row.previousEffectiveAt, row.previousTotal, row.changedAt, row.nextTotal, row.difference, number(row.previousRates.USD), number(row.previousRates.JPY), number(row.previousRates.EURO), number(row.nextRates.USD), number(row.nextRates.JPY), number(row.nextRates.EURO), row.changedBy]);
      });
      var from = historyFilters.from || "전체", to = historyFilters.to || "전체";
      var fileName = "환율변경이력_예상환차손익_" + from + "_" + to + ".xlsx";
      try {
        if (typeof root.mesEnsureXlsx === "function") await root.mesEnsureXlsx();
        if (!root.XLSX) throw new Error("Excel 모듈을 불러오지 못했습니다.");
        var sheet = root.XLSX.utils.aoa_to_sheet(rows);
        sheet["!cols"] = [{ wch: 22 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 24 }];
        var book = root.XLSX.utils.book_new();
        root.XLSX.utils.book_append_sheet(book, sheet, "환율 변경 이력");
        root.XLSX.writeFile(book, fileName, { compression: true });
        root.toast("환율 변경 이력 엑셀 다운로드를 시작했습니다.");
      } catch (error) {
        root.toast("엑셀 다운로드 실패: " + text(error && error.message), true);
      }
    };
    root.deleteExecutiveExchangeHistory = async function (id) {
      if (!allowed()) { root.toast("임원만 환율 이력을 삭제할 수 있습니다.", true); return; }
      if (!root.confirm("선택한 환율 변경 이력을 삭제하시겠습니까?")) return;
      var ok = await root.commit("환율 변경 이력 삭제", ["systemSettings"], function (next) {
        var config = settings(next);
        config.executiveExchangeRateHistory = list(config.executiveExchangeRateHistory).filter(function (entry) { return text(entry && entry.id) !== text(id); });
      });
      if (ok) { root.toast("환율 변경 이력을 삭제했습니다."); renderExecutive(); }
    };

    root.openExecutiveUserManager = function () {
      if (!manageAllowed()) { root.toast("임원 지정 권한이 없습니다.", true); return; }
      var current = executiveUsers(state()), candidates = userCandidates(state(), root);
      var options = candidates.map(function (row) { return '<option value="' + encode(row.email) + '">' + encode(row.name + " · " + row.email) + '</option>'; }).join("");
      root.$("modalTitle").textContent = "임원 사용자 2명 지정";
      root.$("modalBody").innerHTML = '<form id="mesExecutiveUsersForm" class="form-grid"><label>임원 1 이름<input name="name1" value="' + encode(current[0] && current[0].name) + '" required></label><label>임원 1 이메일<input name="email1" type="email" list="mesExecutiveCandidates" value="' + encode(current[0] && current[0].email) + '" required></label><label>임원 2 이름<input name="name2" value="' + encode(current[1] && current[1].name) + '" required></label><label>임원 2 이메일<input name="email2" type="email" list="mesExecutiveCandidates" value="' + encode(current[1] && current[1].email) + '" required></label><datalist id="mesExecutiveCandidates">' + options + '</datalist><p class="wide mes-exec-note">서로 다른 이메일 2명을 지정해야 하며, 지정된 사용자만 임원용 현황판을 열 수 있습니다.</p><div class="wide actions"><button type="button" class="btn primary" onclick="saveExecutiveUsers()">임원 2명 저장</button><button type="button" class="btn" onclick="closeModal()">취소</button></div></form>';
      root.$("modal").classList.add("on");
    };
    root.saveExecutiveUsers = async function () {
      var form = root.document.getElementById("mesExecutiveUsersForm");
      if (!form) return;
      var data = new FormData(form), users = [1, 2].map(function (index) { return { name: text(data.get("name" + index)), email: text(data.get("email" + index)).toLowerCase() }; });
      if (users.some(function (row) { return !row.name || !row.email.includes("@"); }) || users[0].email === users[1].email) { root.toast("이름과 이메일이 올바른 서로 다른 임원 2명을 입력하세요.", true); return; }
      var ok = await root.commit("임원 사용자 2명 지정", ["systemSettings"], function (next) {
        settings(next).executiveUsers = users;
        settings(next).executiveUsersUpdatedAt = new Date().toISOString();
        settings(next).executiveUsersUpdatedBy = email();
      });
      if (ok) { root.closeModal(); root.buildNav(); if (allowed()) root.openExecutiveDashboard(); else root.openView("dashboard"); }
    };

    root.openExecutiveExchangeRates = function () {
      if (!allowed()) { root.toast("임원만 예상환차손 환율을 변경할 수 있습니다.", true); return; }
      var data = report(), rates = data.rates, saved = settings(state()).executiveExchangeRates || {};
      root.$("modalTitle").textContent = "예상환차손 · 환율 일괄변경";
      root.$("modalBody").innerHTML = '<form id="mesExecutiveRatesForm" class="form-grid"><label>USD 환율<input name="USD" type="number" min="0" step="0.01" value="' + (number(rates.USD) || "") + '" placeholder="1 USD당 KRW"></label><label>JPY 환율<input name="JPY" type="number" min="0" step="0.0001" value="' + (number(rates.JPY) || "") + '" placeholder="1 JPY당 KRW"></label><label>EURO 환율<input name="EURO" type="number" min="0" step="0.01" value="' + (number(rates.EURO) || "") + '" placeholder="1 EURO당 KRW"></label><div class="wide mes-exec-note"><b>적용 범위</b><br>총재고·미판매·판매계획완료 재고의 환산액에 동시에 적용합니다. P.O와 S.O 원본 환율은 변경하지 않습니다.<br>현재 총 환산액: ' + fmt(data.totals.total) + '원</div><div class="wide actions"><button type="button" class="btn primary" onclick="saveExecutiveExchangeRates()">예상환율 일괄 적용</button><button type="button" class="btn" onclick="closeModal()">취소</button></div></form>';
      root.$("modal").classList.add("on");
    };
    root.saveExecutiveExchangeRates = async function () {
      var form = root.document.getElementById("mesExecutiveRatesForm");
      if (!form) return;
      var data = new FormData(form), nextRates = { USD: number(data.get("USD")), JPY: number(data.get("JPY")), EURO: number(data.get("EURO")) };
      if (Object.keys(nextRates).some(function (key) { return nextRates[key] < 0; })) { root.toast("환율은 0 이상으로 입력하세요.", true); return; }
      var currentState = state(), config = settings(currentState);
      var forecasts = typeof root.mesForecastRows === "function" ? root.mesForecastRows() : [];
      var previousRates = deriveRates(currentState, config.executiveExchangeRates);
      var beforeReport = buildExecutiveReport(currentState, forecasts, previousRates);
      var afterReport = buildExecutiveReport(currentState, forecasts, nextRates);
      var changedAt = new Date().toISOString();
      var historyEntry = createExchangeRateHistoryEntry(beforeReport, afterReport, previousRates, nextRates, config.executiveExchangeRatesUpdatedAt || changedAt, changedAt, email());
      var ok = await root.commit("임원용 예상환율 일괄변경", ["systemSettings"], function (next) {
        var config = settings(next);
        config.executiveExchangeRates = nextRates;
        config.executiveExchangeRatesUpdatedAt = changedAt;
        config.executiveExchangeRatesUpdatedBy = email();
        config.executiveExchangeRateHistory = [historyEntry].concat(list(config.executiveExchangeRateHistory)).slice(0, 200);
      });
      if (ok) {
        root.closeModal(); renderExecutive();
        var difference = historyEntry.differences.total;
        root.toast("환율 적용 완료 · 예상 환차손익 " + (difference >= 0 ? "+" : "") + fmt(difference) + "원");
      }
    };

    function decorateDashboard() {
      decorateCurrencies();
      if (runtime.getView() !== "dashboard") return;
      var actions = root.document.querySelector("#content .dashboard-head .actions");
      if (!actions) return;
      if (allowed() && !actions.querySelector(".mes-executive-open")) actions.insertAdjacentHTML("afterbegin", '<button class="btn primary mes-executive-open" onclick="openExecutiveDashboard()">임원용 현황판</button>');
      if (manageAllowed() && !actions.querySelector(".mes-executive-manage")) actions.insertAdjacentHTML("afterbegin", '<button class="btn mes-executive-manage" onclick="openExecutiveUserManager()">임원 2명 지정</button>');
    }
    root.render = function () {
      if (runtime.getView() === "executive") { renderExecutive(); return; }
      var result = baseRender.apply(this, arguments);
      root.requestAnimationFrame(decorateDashboard);
      return result;
    };
    if (typeof baseOpenRegistration === "function") root.openMesRegistration = function () { var result = baseOpenRegistration.apply(this, arguments); decorateCurrencies(); return result; };
    if (typeof baseOpenExpectedSo === "function") root.openExpectedSoComposer = function () { var result = baseOpenExpectedSo.apply(this, arguments); decorateCurrencies(); return result; };
    if (typeof baseSaveEdit === "function") root.saveEdit = async function (id, type, form) {
      if (type !== "sales") return baseSaveEdit.apply(this, arguments);
      var data = new FormData(form);
      var ok = await root.commit("판매계획 상세 수정", ["salesOrders"], function (next) {
        list(next.salesOrders).filter(function (row) { return text(row.id) === text(id) || text(row.soNo) === text(id); }).forEach(function (row) {
          row.customer = text(data.get("customer"));
          row.shipDate = text(data.get("shipDate"));
          row.expectedDepartureDate = text(data.get("shipDate"));
          row.mainGrade = text(data.get("grade"));
          row.finalGrade = text(data.get("grade"));
          row.grade = text(data.get("grade"));
          row.netWeight = number(data.get("weight"));
          row.weight = number(data.get("weight"));
          row.currency = normalizeCurrency(data.get("currency"));
          row.exchangeRate = number(data.get("rate")) || 1;
          row.rate = row.exchangeRate;
          row.status = text(data.get("status"));
          row.memo = text(data.get("memo"));
          row.salesMemo = row.memo;
          row.updatedAt = new Date().toISOString();
        });
      });
      if (ok) root.closeModal();
      return ok;
    };

    var style = root.document.createElement("style");
    style.id = "mesExecutiveDashboardV1Style";
    style.textContent = '.mes-exec-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:0 0 18px}.mes-exec-kpi{border:1px solid #cddbd8;border-radius:20px;background:#fff;padding:22px;text-align:left;cursor:pointer}.mes-exec-kpi.on{background:linear-gradient(135deg,#0b3040,#0b8778);color:#fff}.mes-exec-kpi small,.mes-exec-kpi span{display:block}.mes-exec-kpi strong{display:block;font-size:28px;margin:10px 0}.mes-exec-filter{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr)) auto auto;gap:10px;align-items:end;margin-bottom:16px}.mes-exec-filter label{display:grid;gap:6px;font-weight:700}.mes-exec-filter input,.mes-exec-filter select{width:100%;padding:12px;border:1px solid #cbd8d5;border-radius:10px}.mes-exec-table{overflow:auto;max-height:58vh}.mes-exec-table table{width:100%;border-collapse:collapse;white-space:nowrap}.mes-exec-table th,.mes-exec-table td{border:1px solid #dbe3e1;padding:10px;text-align:right}.mes-exec-table th{background:#eef5f4}.mes-exec-table .left{text-align:left}.mes-exec-table .gain{color:#08785f}.mes-exec-table .loss{color:#b4232f}.mes-exec-history{margin-top:18px}.mes-exec-history-filter{display:grid;grid-template-columns:minmax(150px,1fr) minmax(150px,1fr) auto auto auto;gap:10px;align-items:end;margin:0 0 16px}.mes-exec-history-filter label{display:grid;gap:6px;font-weight:700}.mes-exec-history-filter input{width:100%;padding:12px;border:1px solid #cbd8d5;border-radius:10px}.mes-exec-note{padding:16px;border-radius:12px;background:#eef7f5;line-height:1.7}@media(max-width:760px){.mes-exec-history-filter{grid-template-columns:1fr 1fr}.mes-exec-history-filter .btn{min-height:48px}.mes-exec-kpis{grid-template-columns:1fr}.mes-exec-filter{grid-template-columns:1fr 1fr}.mes-exec-kpi strong{font-size:24px}.mes-exec-table{max-height:52vh}.mes-exec-filter .btn{min-height:48px}}';
    root.document.head.appendChild(style);
    root.buildNav();
    root.requestAnimationFrame(decorateDashboard);
    return true;
  }

  return {
    VERSION: VERSION,
    normalizeCurrency: normalizeCurrency,
    deriveRates: deriveRates,
    buildExecutiveReport: buildExecutiveReport,
    createExchangeRateHistoryEntry: createExchangeRateHistoryEntry,
    executiveUsers: executiveUsers,
    isExecutive: isExecutive,
    canManageExecutives: canManageExecutives,
    install: install
  };
});

/* Executive Finance Dashboard V2 - monthly KPI, landed cost, realized profit */
(function (root) {
  "use strict";
  var runtime = root.__mesRuntime;
  if (!runtime || root.__mesExecutiveFinanceV2Installed) return;
  root.__mesExecutiveFinanceV2Installed = true;
  var DAY = 86400000;
  var HOUR = 3600000;
  var financeMonth = new Date().toISOString().slice(0, 7);
  var drillKind = "purchase";
  var drillQuery = "";
  function list(v) { return Array.isArray(v) ? v : []; }
  function num(v) { var n = Number(String(v == null ? "" : v).replace(/,/g, "")); return Number.isFinite(n) ? n : 0; }
  function txt(v) { return String(v == null ? "" : v).trim(); }
  function upper(v) { return txt(v).toUpperCase(); }
  function esc(v) { return txt(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
  function active(v) { return v && v.active !== false && v.deleted !== true && v.isDeleted !== true && !v.deletedAt && upper(v.status) !== "CANCELLED"; }
  function pick(row, keys) { for (var i=0;i<keys.length;i+=1) { var value=row && row[keys[i]]; if (value !== undefined && value !== null && txt(value) !== "") return value; } return ""; }
  function dateValue(row, keys) { var raw=pick(row,keys); if (!raw) return ""; var d=new Date(raw); return isNaN(d.getTime()) ? "" : d.toISOString(); }
  function monthOf(value) { var d=new Date(value); return isNaN(d.getTime()) ? "" : d.toISOString().slice(0,7); }
  function endOfMonth(month) { var p=month.split("-").map(Number); return new Date(p[0],p[1],0,23,59,59,999); }
  function prevMonth(month) { var p=month.split("-").map(Number), d=new Date(p[0],p[1]-2,1); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"); }
  function daysBetween(a,b) { var x=new Date(a), y=new Date(b); if (isNaN(x)||isNaN(y)) return 0; return Math.max(0,Math.ceil((y-x)/DAY)); }
  function hoursBetween(a,b) { var x=new Date(a), y=new Date(b); if (isNaN(x)||isNaN(y)) return 0; return Math.max(0,(y-x)/HOUR); }
  function fmt(v) { return Math.round(num(v)).toLocaleString("ko-KR"); }
  function money(v) { var n=num(v), a=Math.abs(n); if (a>=100000000) return (n/100000000).toFixed(2)+"억"; if (a>=10000) return (n/10000).toFixed(0)+"만"; return fmt(n)+"원"; }
  function pct(v) { return (num(v)||0).toFixed(1)+"%"; }
  function kg(v) { return fmt(v)+" kg"; }
  function settings(state) { state.systemSettings=state.systemSettings||{}; state.systemSettings.executiveFinanceV2=state.systemSettings.executiveFinanceV2||{}; var s=state.systemSettings.executiveFinanceV2; s.importCustomsByPo=s.importCustomsByPo||{}; s.exportCostByOutbound=s.exportCostByOutbound||{}; return s; }
  function rateMap(state) {
    var base={KRW:1,USD:1,JPY:1,EURO:1};
    try { var api=root.MesExecutiveDashboard; if (api&&api.deriveRates) return api.deriveRates(state,(state.systemSettings||{}).executiveExchangeRates||{}); } catch(e) {}
    return base;
  }
  function currency(v) { var c=upper(v||"KRW"); return c==="EUR"?"EURO":(c||"KRW"); }
  function toKrw(amount,curr,rate,rates) { var c=currency(curr); if (c==="KRW") return num(amount); return num(amount)*(num(rate)||num(rates[c])||1); }
  function weightOf(row) { return num(pick(row,["purchaseContractWeight","contractWeight","purchaseQuantity","contractQuantity","plannedPurchaseWeight","netWeight","nw","weight","grossWeight","gw"])); }
  function priceOf(row) { return num(pick(row,["unitPrice","purchaseUnitPrice","purchasePrice","price","usdPrice","pricePerKg"])); }
  function gradeOf(row) { return [pick(row,["productType","category"]),pick(row,["mainGrade","finalGrade","grade","gradeName","contractGrade"]),pick(row,["subGrade","shape"]),pick(row,["detailGrade","description"])].filter(Boolean).join(" · "); }
  function normGrade(v) { return upper(v).replace(/[^A-Z0-9가-힣]/g,""); }
  function similar(a,b) {
    a=normGrade(a); b=normGrade(b); if(!a||!b)return 0; if(a===b)return 1; if(a.indexOf(b)>=0||b.indexOf(a)>=0)return Math.min(a.length,b.length)/Math.max(a.length,b.length)+0.2;
    var aset={}; for(var i=0;i<a.length;i++)aset[a[i]]=1; var hit=0; for(var j=0;j<b.length;j++)if(aset[b[j]])hit++; return hit/Math.max(a.length,b.length);
  }
  function rowAmountKrw(row,weight,rates) {
    var curr=currency(pick(row,["currency","purchaseCurrency","moneyUnit"]));
    var rate=num(pick(row,["rate","exchangeRate","purchaseRate"]));
    var explicit=num(pick(row,["purchaseAmount","totalPurchaseAmount","lineAmount","totalAmount"]));
    var amount=explicit||weight*priceOf(row);
    return toKrw(amount,curr,rate,rates);
  }
  function groupBy(rows,keyFn) { var m={}; rows.forEach(function(r){var k=txt(keyFn(r))||"-";(m[k]=m[k]||[]).push(r);}); return m; }
  function poSummaries(state) {
    var rates=rateMap(state), costs=settings(state).importCustomsByPo;
    var groups=groupBy(list(state.pos).filter(active),function(r){return pick(r,["poNo","purchaseNo","contractNo"]);});
    return Object.keys(groups).map(function(poNo){
      var rows=groups[poNo], first=rows[0]||{}, weight=0, purchase=0, receivedDates=[], expectedDates=[];
      rows.forEach(function(r){var w=weightOf(r);weight+=w;purchase+=rowAmountKrw(r,w,rates);var rd=dateValue(r,["receivedAt","receiptConfirmedAt","inboundCompletedAt","arrivalConfirmedAt"]);if(rd)receivedDates.push(rd);var ed=dateValue(r,["arrivalExpectedAt","expectedAt","expectedDate","eta","createdAt"]);if(ed)expectedDates.push(ed);});
      var custom=costs[poNo]||{}, customs=num(custom.total), total=purchase+customs;
      var origin=upper(pick(first,["purchaseOrigin","origin","type"]));
      return {kind:"purchase",key:poNo,poNo:poNo,partner:pick(first,["company","supplier","vendor","partner"]),grade:rows.map(gradeOf).filter(Boolean).join(" / "),weight:weight,purchaseAmount:purchase,customs:customs,totalCost:total,costPerKg:weight?total/weight:0,receivedAt:receivedDates.sort()[0]||"",expectedAt:expectedDates.sort()[0]||"",isImport:!(origin.indexOf("국내")>=0||origin==="DOMESTIC"),currency:currency(pick(first,["currency","purchaseCurrency"])),rows:rows,customEntry:custom};
    });
  }
  function finalShipment(s) { var st=upper(pick(s,["status","shippingStatus","shipmentStatus"])); return !!dateValue(s,["shippedAt","completedAt","confirmedAt","shippingCompletedAt"]) || /SHIPPED|DONE|COMPLETE|FINAL|확정|완료/.test(st); }
  function saleRowAmount(row,weight,rates) {
    var curr=currency(pick(row,["currency","salesCurrency","moneyUnit"])), rate=num(pick(row,["rate","exchangeRate","salesRate"]));
    var explicit=num(pick(row,["salesAmount","totalSalesAmount","lineAmount","totalAmount","amount"]));
    var baseWeight=weightOf(row)||num(pick(row,["salesWeight","quantity"]));
    var unit=num(pick(row,["unitPrice","salesUnitPrice","price","usdPrice"]));
    var amount=explicit||baseWeight*unit;
    if(weight>0&&baseWeight>0&&explicit)amount=explicit*(weight/baseWeight);
    else if(weight>0&&unit)amount=weight*unit;
    return toKrw(amount,curr,rate,rates);
  }
  function gradeCostIndex(pos) {
    var idx={};
    pos.forEach(function(p){p.rows.forEach(function(r){var g=normGrade(gradeOf(r)||p.grade),w=weightOf(r),cost=w*p.costPerKg;if(!g||!w)return;var x=idx[g]||(idx[g]={weight:0,cost:0,dateWeights:[],source:p});x.weight+=w;x.cost+=cost;x.dateWeights.push({date:p.receivedAt||p.expectedAt,weight:w});});});
    return idx;
  }
  function closestGrade(index,grade) { var key=normGrade(grade); if(index[key])return index[key]; var best=null,score=0;Object.keys(index).forEach(function(k){var s=similar(k,key);if(s>score){score=s;best=index[k];}});return score>=0.7?best:null; }
  function sourcePackageId(row) { return txt(pick(row,["packageNo","internalInboundNo","sourcePackageNo","sourceNo","inboundNo","code","bagNo"])); }
  function workCostIndex(state,pos) {
    var byPackage={}, out={};
    list(state.inputs).filter(active).forEach(function(r){var k=sourcePackageId(r);if(!k)return;var d=dateValue(r,["inspectionStartedAt","inspectionStartAt","startedAt","createdAt"]);if(d&&(!byPackage[k]||d<byPackage[k].start)) (byPackage[k]=byPackage[k]||{}).start=d;});
    list(state.bags).filter(active).forEach(function(r){var k=sourcePackageId(r);if(!k)return;var d=dateValue(r,["packingCompletedAt","completedAt","movedAt","createdAt"]);if(d)(byPackage[k]=byPackage[k]||{}).end=d;});
    list(state.movements).filter(active).forEach(function(r){var k=sourcePackageId(r);if(!k)return;var st=upper(pick(r,["toStatus","status","type"]));if(/COMPLETE|완료|PACK/.test(st)){var d=dateValue(r,["completedAt","movedAt","createdAt"]);if(d)(byPackage[k]=byPackage[k]||{}).end=d;}});
    var waits={};
    list(state.workWaits).filter(active).forEach(function(r){var k=sourcePackageId(r);if(!k)return;var h=num(pick(r,["processingHours","workHours","hours"]));if(!h)h=hoursBetween(dateValue(r,["workStartedAt","startedAt","createdAt"]),dateValue(r,["workCompletedAt","completedAt","finishedAt"]));waits[k]=(waits[k]||0)+h*20000;});
    pos.forEach(function(p){p.rows.forEach(function(r){var k=sourcePackageId(r),w=weightOf(r),g=normGrade(gradeOf(r)||p.grade),t=byPackage[k]||{};var continuous=hoursBetween(t.start,t.end)*(400000/24);var total=continuous+(waits[k]||0);if(!g||!w)return;var x=out[g]||(out[g]={weight:0,cost:0});x.weight+=w;x.cost+=total;});});
    return out;
  }
  function allocationWeight(state,shipment,sale) {
    var sid=txt(shipment.id), soid=txt(sale&&sale.id), sono=txt(pick(sale||shipment,["soNo","salesNo"]));
    return list(state.shipmentAllocations).filter(active).filter(function(a){return (sid&&txt(a.shipmentId)===sid)||(soid&&txt(a.salesOrderId)===soid)||(sono&&txt(pick(a,["soNo","salesNo"]))===sono);});
  }
  function outboundSummaries(state,pos) {
    var rates=rateMap(state), sales=list(state.salesOrders).filter(active), saleById={}, saleByNo={}, costs=settings(state).exportCostByOutbound, gradeCosts=gradeCostIndex(pos), workCosts=workCostIndex(state,pos);
    sales.forEach(function(s){saleById[txt(s.id)]=s;var no=txt(pick(s,["soNo","salesNo","orderNo"]));if(no)(saleByNo[no]=saleByNo[no]||[]).push(s);});
    var shipments=list(state.shipments).filter(active).filter(finalShipment), out=[];
    shipments.forEach(function(sh){
      var soNo=txt(pick(sh,["soNo","salesNo"])), rows=(saleByNo[soNo]||[]).slice(), direct=saleById[txt(sh.salesOrderId)];if(direct&&rows.indexOf(direct)<0)rows.push(direct);if(!rows.length)rows=[sh];
      var totalContract=rows.reduce(function(a,r){return a+(weightOf(r)||num(pick(r,["salesWeight","quantity"])));},0);
      var shipped=num(pick(sh,["shippedWeight","weight","netWeight","nw"]))||totalContract;
      var date=dateValue(sh,["shippedAt","shippingCompletedAt","completedAt","confirmedAt","updatedAt"]);
      var remaining=shipped, salesAmount=0, gradeParts=[], weightedCost=0, work=0, inboundWeighted=0, inboundWeight=0;
      rows.forEach(function(r){var rw=weightOf(r)||num(pick(r,["salesWeight","quantity"]));var use=totalContract?shipped*(rw/totalContract):shipped/rows.length;var g=gradeOf(r)||gradeOf(sh);gradeParts.push(g);salesAmount+=saleRowAmount(r,use,rates);var ci=closestGrade(gradeCosts,g);var wi=closestGrade(workCosts,g);if(ci){weightedCost+=use*(ci.cost/ci.weight);ci.dateWeights.forEach(function(dw){if(dw.date){inboundWeighted+=new Date(dw.date).getTime()*dw.weight;inboundWeight+=dw.weight;}});}if(wi)work+=use*(wi.cost/wi.weight);remaining-=use;});
      var allocations=allocationWeight(state,sh,rows[0]), allocInbound=[];
      allocations.forEach(function(a){var pid=sourcePackageId(a), pdate="";pos.some(function(p){return p.rows.some(function(r){if(sourcePackageId(r)===pid){pdate=p.receivedAt||p.expectedAt;return true;}return false;});});if(pdate)allocInbound.push(pdate);});
      var inboundDate=allocInbound.sort()[0]||(inboundWeight?new Date(inboundWeighted/inboundWeight).toISOString():"");
      var inventoryDays=daysBetween(inboundDate,date), interest=weightedCost*inventoryDays*0.0001;
      var key=txt(sh.id)||soNo||txt(sh.salesOrderId), exp=costs[key]||costs[soNo]||{}, exportCost=num(exp.total), profit=salesAmount-weightedCost-work-interest-exportCost;
      out.push({kind:"outbound",key:key,soNo:soNo||txt(sh.salesOrderId)||key,partner:pick(rows[0],["customer","company","buyer","partner"]),grade:gradeParts.filter(Boolean).join(" / "),weight:shipped,date:date,salesAmount:salesAmount,purchaseCost:weightedCost,workCost:work,interestCost:interest,exportCost:exportCost,profit:profit,margin:salesAmount?profit/salesAmount*100:0,inventoryDays:inventoryDays,shipment:sh,salesRows:rows,costEntry:exp});
    });
    return out;
  }
  function forecastPhysical(state,pos) {
    var forecasts=typeof root.mesForecastRows==="function"?list(root.mesForecastRows()):[], costIdx=gradeCostIndex(pos), rows=[];
    forecasts.forEach(function(f){if(f.isFamilySummary)return;list(f.sources).forEach(function(src){if(["uninspected","workWaiting","unpacked","completed"].indexOf(src.stage)<0)return;var rec=src.record||{},w=num(src.weight),g=src.rawSourceLabel||src.sourceLabel||f.gradeLabel||gradeOf(rec),ci=closestGrade(costIdx,g);var costPerKg=ci?ci.cost/ci.weight:0;var d=dateValue(rec,["receivedAt","receiptConfirmedAt","inboundCompletedAt","createdAt","updatedAt"]);rows.push({kind:"inventory",key:src.groupId||sourcePackageId(rec)||g,partner:pick(rec,["company","supplier","vendor","partner"]),poNo:pick(rec,["poNo","purchaseNo","contractNo"]),packageNo:sourcePackageId(rec),grade:g,stage:src.stage,weight:w,date:d,costPerKg:costPerKg,value:w*costPerKg,record:rec});});});
    return rows;
  }
  function selected(rows,month,dateKey) { return rows.filter(function(r){return monthOf(r[dateKey||"date"])===month;}); }
  function build(month) {
    var state=runtime.getState(), pos=poSummaries(state), outbound=outboundSummaries(state,pos), inbound=pos.filter(function(p){return monthOf(p.receivedAt)===month;}), sales=selected(outbound,month), physical=forecastPhysical(state,pos), asOf=endOfMonth(month), age=[{label:"30일 이하",min:0,max:30},{label:"31~60일",min:31,max:60},{label:"61~90일",min:61,max:90},{label:"91~180일",min:91,max:180},{label:"180일 초과",min:181,max:99999}];
    physical.forEach(function(r){r.days=daysBetween(r.date,asOf);});
    var buckets=age.map(function(b){var rs=physical.filter(function(r){return r.days>=b.min&&r.days<=b.max;}),weight=rs.reduce(function(a,r){return a+r.weight;},0),value=rs.reduce(function(a,r){return a+r.value;},0);return {label:b.label,weight:weight,value:value,rows:rs};});
    var purchase=inbound.reduce(function(a,r){return a+r.totalCost;},0), purchaseBase=inbound.reduce(function(a,r){return a+r.purchaseAmount;},0), customs=inbound.reduce(function(a,r){return a+r.customs;},0), inboundWeight=inbound.reduce(function(a,r){return a+r.weight;},0);
    var prev=pos.filter(function(p){return monthOf(p.receivedAt)===prevMonth(month);}).reduce(function(a,r){return a+r.totalCost;},0);
    var salesAmount=sales.reduce(function(a,r){return a+r.salesAmount;},0), cogs=sales.reduce(function(a,r){return a+r.purchaseCost;},0),work=sales.reduce(function(a,r){return a+r.workCost;},0),interest=sales.reduce(function(a,r){return a+r.interestCost;},0),exports=sales.reduce(function(a,r){return a+r.exportCost;},0),profit=sales.reduce(function(a,r){return a+r.profit;},0);
    var stockValue=physical.reduce(function(a,r){return a+r.value;},0), stockWeight=physical.reduce(function(a,r){return a+r.weight;},0), longRows=physical.filter(function(r){return r.days>=90;}), longValue=longRows.reduce(function(a,r){return a+r.value;},0), longWeight=longRows.reduce(function(a,r){return a+r.weight;},0);
    return {month:month,state:state,pos:pos,outbound:outbound,inbound:inbound,sales:sales,physical:physical,buckets:buckets,purchase:purchase,purchaseBase:purchaseBase,customs:customs,inboundWeight:inboundWeight,prevPurchase:prev,mom:prev?(purchase-prev)/prev*100:0,salesAmount:salesAmount,cogs:cogs,work:work,interest:interest,exports:exports,profit:profit,margin:salesAmount?profit/salesAmount*100:0,stockValue:stockValue,stockWeight:stockWeight,longRows:longRows,longValue:longValue,longWeight:longWeight,turnover:sales.length?sales.reduce(function(a,r){return a+r.inventoryDays;},0)/sales.length:0,missingCustoms:inbound.filter(function(p){return p.isImport&&!p.customEntry.updatedAt;}),missingExports:sales.filter(function(r){return !r.costEntry.updatedAt;})};
  }
  function drillRows(report,kind) {
    if(kind==="purchase")return report.inbound;
    if(kind==="sales"||kind==="profit"||kind==="turnover")return report.sales;
    if(kind==="long")return report.longRows;
    if(kind.indexOf("bucket:")===0){var label=kind.slice(7),b=report.buckets.find(function(x){return x.label===label;});return b?b.rows:[];}
    return report.physical;
  }
  function drillTitle(kind) { return kind==="purchase"?"이번 달 매입":kind==="sales"?"이번 달 매출":kind==="profit"?"실현이익":kind==="long"?"90일 이상 장기재고":kind==="turnover"?"출고 재고회전":kind.indexOf("bucket:")===0?kind.slice(7)+" 재고":"현재재고"; }
  function table(report) {
    var rows=drillRows(report,drillKind),q=upper(drillQuery);if(q)rows=rows.filter(function(r){return upper([r.partner,r.poNo,r.soNo,r.packageNo,r.key,r.grade].join(" ")).indexOf(q)>=0;});
    var head='<tr><th>거래처</th><th>P.O / S.O</th><th>사내입고 / 출고번호</th><th>강종</th><th>중량</th><th>금액·원가</th><th>세부비용·보유일</th><th>상세</th></tr>';
    var body=rows.map(function(r,i){var ref=r.poNo||r.soNo||"-",sub=r.packageNo||r.key||"-",amount=r.kind==="purchase"?r.totalCost:r.kind==="outbound"?r.salesAmount:r.value,details=r.kind==="purchase"?"통관 "+fmt(r.customs)+"원 · kg당 "+fmt(r.costPerKg):r.kind==="outbound"?"원가 "+fmt(r.purchaseCost)+" · 작업 "+fmt(r.workCost)+" · 이자 "+fmt(r.interestCost)+" · 수출 "+fmt(r.exportCost):"보유 "+fmt(r.days)+"일";return '<tr><td>'+esc(r.partner||"-")+'</td><td>'+esc(ref)+'</td><td>'+esc(sub)+'</td><td>'+esc(r.grade||"-")+'</td><td>'+kg(r.weight)+'</td><td>'+fmt(amount)+'원</td><td>'+esc(details)+'</td><td><button class="btn" onclick="openExecutiveFinanceDetail(\''+drillKind+'\','+i+')">보기</button></td></tr>';}).join("");
    return '<div class="mes-fin-drill"><div class="mes-fin-drill-head"><div><h2>'+drillTitle(drillKind)+'</h2><p>거래처 → P.O/S.O → 사내입고번호/출고번호까지 확인합니다.</p></div><form onsubmit="event.preventDefault();setExecutiveFinanceQuery(this.q.value)"><input name="q" value="'+esc(drillQuery)+'" placeholder="거래처·P.O·S.O·사내입고·출고 검색"><button class="btn primary">검색</button></form></div><div class="mes-fin-table"><table><thead>'+head+'</thead><tbody>'+body+'</tbody></table></div></div>';
  }
  function renderDashboard() {
    var report=build(financeMonth), content=root.document.getElementById("content"), pageTitle=root.document.getElementById("pageTitle");if(!content)return;if(pageTitle)pageTitle.textContent="임원용 현황판";
    var kpis=[
      {k:"purchase",t:"매입총액 / 매입원가",v:money(report.purchase),s:"매입 "+money(report.purchaseBase)+" + 통관 "+money(report.customs)},
      {k:"sales",t:"이번 달 매출액",v:money(report.salesAmount),s:"출고확정 "+fmt(report.sales.length)+"건"},
      {k:"profit",t:"실현이익",v:money(report.profit),s:"작업 "+money(report.work)+" · 이자 "+money(report.interest)+" · 수출 "+money(report.exports)},
      {k:"profit",t:"실현이익률",v:pct(report.margin),s:"실현이익 ÷ 매출액"},
      {k:"long",t:"90일 이상 장기재고",v:money(report.longValue),s:kg(report.longWeight)},
      {k:"turnover",t:"평균 재고회전일",v:report.turnover.toFixed(1)+"일",s:"출고 완료 재고 기준"}
    ];
    var alerts="";
    if(report.missingCustoms.length||report.missingExports.length)alerts='<section class="mes-fin-alert"><h2>누락 비용 즉시 입력</h2><div class="mes-fin-alert-grid">'+report.missingCustoms.map(function(p){return '<button onclick="openExecutiveCostEditor(\'import\',\''+esc(p.poNo)+'\')"><b>통관비 기입요망</b><span>'+esc(p.poNo)+' · '+esc(p.partner)+' · '+kg(p.weight)+'</span></button>';}).join("")+report.missingExports.map(function(o){return '<button onclick="openExecutiveCostEditor(\'export\',\''+esc(o.key)+'\')"><b>수출비용 기입요망</b><span>'+esc(o.soNo)+' · '+esc(o.partner)+' · '+kg(o.weight)+'</span></button>';}).join("")+'</div></section>';
    var buckets=report.buckets.map(function(b){return '<button onclick="setExecutiveFinanceDrill(\'bucket:'+b.label+'\')"><b>'+b.label+'</b><strong>'+money(b.value)+'</strong><span>'+kg(b.weight)+' · '+pct(report.stockWeight?b.weight/report.stockWeight*100:0)+'</span></button>';}).join("");
    content.innerHTML='<div class="dashboard-head"><div><h1>임원용 MES 대시보드</h1><p>선택한 월의 매입·출고와 현재 공용재고를 같은 계산 함수로 집계합니다.</p></div><div class="actions"><label class="mes-fin-month">기준월<input type="month" value="'+financeMonth+'" onchange="setExecutiveFinanceMonth(this.value)"></label><button class="btn" onclick="openExecutiveExchangeRates()">환율·환차손익</button><button class="btn" onclick="openExecutiveUserManager()">임원 지정</button><button class="btn primary" onclick="loadState()">↻ 최신자료</button></div></div>'+
      '<div class="mes-fin-kpis">'+kpis.map(function(k){return '<button class="'+(drillKind===k.k?"on":"")+'" onclick="setExecutiveFinanceDrill(\''+k.k+'\')"><small>'+k.t+'</small><strong>'+k.v+'</strong><span>'+k.s+'</span></button>';}).join("")+'</div>'+alerts+
      '<section class="mes-fin-flow"><button class="mes-fin-flow-main" onclick="setExecutiveFinanceDrill(\'purchase\')"><small>입고 · '+financeMonth+'</small><strong>'+money(report.purchase)+' / '+(report.inboundWeight/1000).toFixed(1)+'톤</strong><span>평균 매입단가 '+fmt(report.inboundWeight?report.purchase/report.inboundWeight:0)+'원/kg · 전월대비 '+(report.mom>=0?"▲ ":"▼ ")+pct(Math.abs(report.mom))+'</span></button><div class="mes-fin-arrow">↓</div>'+
      '<div class="mes-fin-current"><button class="mes-fin-flow-main" onclick="setExecutiveFinanceDrill(\'stock\')"><small>현재재고</small><strong>'+money(report.stockValue)+' / '+(report.stockWeight/1000).toFixed(1)+'톤</strong><span>선택월 말일을 기준으로 보유기간을 계산</span></button><div class="mes-fin-buckets">'+buckets+'</div></div><div class="mes-fin-arrow">↓</div>'+
      '<button class="mes-fin-flow-main" onclick="setExecutiveFinanceDrill(\'sales\')"><small>출고 · '+financeMonth+'</small><strong>매출 '+money(report.salesAmount)+' / 원가 '+money(report.cogs)+'</strong><span>이익 '+money(report.profit)+' · '+pct(report.margin)+'</span></button></section>'+table(report);
  }
  root.mesExecutiveFinance={build:build,poSummaries:poSummaries,outboundSummaries:outboundSummaries,forecastPhysical:forecastPhysical};
  root.setExecutiveFinanceMonth=function(v){if(/^\d{4}-\d{2}$/.test(v))financeMonth=v;renderDashboard();};
  root.setExecutiveFinanceDrill=function(v){drillKind=v;drillQuery="";renderDashboard();root.setTimeout(function(){var x=root.document.querySelector(".mes-fin-drill");if(x)x.scrollIntoView({behavior:"smooth",block:"start"});},30);};
  root.setExecutiveFinanceQuery=function(v){drillQuery=txt(v);renderDashboard();};
  root.openExecutiveFinanceDetail=function(kind,index){var report=build(financeMonth),rows=drillRows(report,kind),r=rows[index];if(!r)return;var detail=r.kind==="purchase"?'<p><b>매입금액</b> '+fmt(r.purchaseAmount)+'원</p><p><b>수입통관비</b> '+fmt(r.customs)+'원 ('+fmt(r.weight?r.customs/r.weight:0)+'원/kg)</p><p><b>매입총액</b> '+fmt(r.totalCost)+'원</p><button class="btn primary" onclick="openExecutiveCostEditor(\'import\',\''+esc(r.poNo)+'\')">통관비 입력·수정</button>':r.kind==="outbound"?'<p><b>매출액</b> '+fmt(r.salesAmount)+'원</p><p><b>수입원가</b> '+fmt(r.purchaseCost)+'원</p><p><b>작업비</b> '+fmt(r.workCost)+'원</p><p><b>재고이자부담비</b> '+fmt(r.interestCost)+'원 ('+fmt(r.inventoryDays)+'일)</p><p><b>수출비용</b> '+fmt(r.exportCost)+'원</p><p><b>실현이익</b> '+fmt(r.profit)+'원 · '+pct(r.margin)+'</p><button class="btn primary" onclick="openExecutiveCostEditor(\'export\',\''+esc(r.key)+'\')">수출비용 입력·수정</button>':'<p><b>재고단계</b> '+esc(r.stage)+'</p><p><b>보유일</b> '+fmt(r.days)+'일</p><p><b>원가</b> '+fmt(r.costPerKg)+'원/kg</p><p><b>재고금액</b> '+fmt(r.value)+'원</p>';
    root.document.getElementById("modal").innerHTML='<div class="modal-backdrop" onclick="if(event.target===this)this.innerHTML=\'\'"><div class="modal-card"><div class="modal-head"><h2>'+esc(r.poNo||r.soNo||r.key)+' · 상세</h2><button onclick="this.closest(\'.modal-backdrop\').remove()">×</button></div><div class="mes-fin-detail"><p><b>거래처</b> '+esc(r.partner||"-")+'</p><p><b>강종</b> '+esc(r.grade||"-")+'</p><p><b>중량</b> '+kg(r.weight)+'</p>'+detail+'</div></div></div>';
  };
  root.openExecutiveCostEditor=function(type,key){
    var report=build(financeMonth), isImport=type==="import", row=isImport?report.pos.find(function(p){return p.poNo===key;}):report.outbound.find(function(o){return o.key===key||o.soNo===key;});if(!row)return;
    var old=isImport?row.customs:row.exportCost, title=isImport?"수입통관비":"수출비용", meta=isImport?row.poNo:row.soNo;
    root.document.getElementById("modal").innerHTML='<div class="modal-backdrop"><div class="modal-card"><div class="modal-head"><h2>'+title+' 입력</h2><button onclick="this.closest(\'.modal-backdrop\').remove()">×</button></div><form class="form-grid" onsubmit="event.preventDefault();saveExecutiveCost(\''+type+'\',\''+esc(key)+'\',this.total.value)"><div class="mes-fin-cost-info"><b>'+esc(meta)+'</b><span>'+esc(row.partner||"-")+'</span><span>기준중량 '+kg(row.weight)+'</span></div><label>'+title+' 총액(원)<input name="total" type="number" min="0" step="1" value="'+num(old)+'" required oninput="document.getElementById(\'mesCostPerKg\').textContent=(Number(this.value||0)/'+(row.weight||1)+').toLocaleString(\'ko-KR\',{maximumFractionDigits:2})+\' 원/kg\'"></label><div class="mes-fin-perkg"><small>자동 계산 kg당 비용</small><strong id="mesCostPerKg">'+(row.weight?num(old)/row.weight:0).toLocaleString("ko-KR",{maximumFractionDigits:2})+' 원/kg</strong></div><div class="form-actions"><button class="btn primary">저장</button><button type="button" class="btn" onclick="this.closest(\'.modal-backdrop\').remove()">취소</button></div></form></div></div>';
  };
  root.saveExecutiveCost=async function(type,key,value){
    var state=runtime.getState(), s=settings(state), entry={total:num(value),updatedAt:new Date().toISOString(),updatedBy:runtime.currentUserName?runtime.currentUserName():""};
    if(type==="import")s.importCustomsByPo[key]=entry;else s.exportCostByOutbound[key]=entry;
    try{await runtime.getCommit()(["systemSettings"]);var m=root.document.getElementById("modal");if(m)m.innerHTML="";if(runtime.getToast())runtime.getToast()((type==="import"?"통관비":"수출비용")+" 저장 완료","success");renderDashboard();}catch(e){if(runtime.getToast())runtime.getToast()("비용 저장 실패: "+(e.message||e),"error");}
  };
  function decorateFinanceForms(){
    var modal=root.document.getElementById("modal");if(!modal)return;var form=modal.querySelector("form[onsubmit*='saveEdit']");if(!form||form.dataset.executiveFinanceDecorated)return;var raw=form.getAttribute("onsubmit")||"",m=raw.match(/saveEdit\('([^']+)'\s*,\s*'(purchase|shipping)'/);if(!m)return;var id=m[1],type=m[2],report=build(financeMonth),row=type==="purchase"?report.pos.find(function(p){return p.poNo===id;}):report.outbound.find(function(o){return o.key===id||o.soNo===id||txt(o.shipment.id)===id;});var cost=row?(type==="purchase"?row.customs:row.exportCost):0;var label=type==="purchase"?"수입통관비 총액(원)":"수출비용 총액(원)";var wrap=root.document.createElement("label");wrap.className="mes-fin-embedded";wrap.innerHTML=label+'<input type="number" min="0" step="1" value="'+num(cost)+'" data-exec-cost><small>'+(type==="purchase"&&row&&row.weight?"자동 kg당 "+fmt(cost/row.weight)+"원":"임원 KPI 실현원가에 반영")+'</small>';var actions=form.querySelector(".form-actions");if(actions)form.insertBefore(wrap,actions);else form.appendChild(wrap);wrap.querySelector("input").addEventListener("change",function(){root.saveExecutiveCost(type,type==="purchase"?id:(row?row.key:id),this.value);});form.dataset.executiveFinanceDecorated="1";
  }
  var baseRender=root.render;
  root.render=function(){var out=baseRender.apply(this,arguments);if(runtime.getView&&runtime.getView()==="executive")root.requestAnimationFrame(renderDashboard);root.requestAnimationFrame(decorateFinanceForms);return out;};
  new MutationObserver(decorateFinanceForms).observe(root.document.body,{childList:true,subtree:true});
  var style=root.document.createElement("style");style.id="mesExecutiveFinanceV2Style";style.textContent='.mes-fin-month{display:flex;align-items:center;gap:8px;font-weight:800}.mes-fin-month input{padding:10px;border:1px solid #cbd8d5;border-radius:10px}.mes-fin-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:16px 0}.mes-fin-kpis button,.mes-fin-flow-main,.mes-fin-buckets button{border:1px solid #cbd8d5;border-radius:16px;background:#fff;text-align:left;padding:18px;color:#102d28}.mes-fin-kpis button.on{border-color:#0798a9;box-shadow:0 0 0 2px #0798a922}.mes-fin-kpis small,.mes-fin-flow small{display:block;color:#5f7470;font-weight:800}.mes-fin-kpis strong,.mes-fin-flow-main strong{display:block;font-size:26px;margin:8px 0}.mes-fin-kpis span,.mes-fin-flow span{display:block;color:#5f7470}.mes-fin-alert{background:#fff5dc;border:1px solid #efc34e;border-radius:16px;padding:16px;margin:16px 0}.mes-fin-alert-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.mes-fin-alert button{display:flex;flex-direction:column;gap:4px;padding:14px;border:1px solid #e7b640;border-radius:12px;background:#fff;text-align:left}.mes-fin-alert b{color:#b14920}.mes-fin-flow{display:grid;gap:10px;background:#edf7f5;border-radius:20px;padding:18px}.mes-fin-flow-main{width:100%;background:linear-gradient(135deg,#0b314b,#078b83);color:#fff}.mes-fin-flow-main small,.mes-fin-flow-main span{color:#d8f3ee}.mes-fin-arrow{text-align:center;font-size:28px;font-weight:900;color:#07887c}.mes-fin-current{display:grid;gap:10px}.mes-fin-buckets{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.mes-fin-buckets strong{display:block;margin:7px 0}.mes-fin-drill{background:#fff;border-radius:18px;padding:18px;margin-top:16px}.mes-fin-drill-head{display:flex;justify-content:space-between;gap:16px}.mes-fin-drill-head form{display:flex;gap:8px}.mes-fin-drill-head input{min-width:300px;padding:12px;border:1px solid #cbd8d5;border-radius:10px}.mes-fin-table{overflow:auto;max-height:55vh}.mes-fin-table table{width:100%;border-collapse:collapse;white-space:nowrap}.mes-fin-table th,.mes-fin-table td{padding:11px;border-bottom:1px solid #e1e9e7;text-align:left}.mes-fin-cost-info{display:grid;gap:5px;padding:14px;border-radius:12px;background:#edf7f5}.mes-fin-perkg{padding:14px;border:1px solid #cbd8d5;border-radius:12px}.mes-fin-perkg strong{display:block;font-size:22px}.mes-fin-detail{display:grid;gap:10px}.mes-fin-detail p{margin:0;padding:10px;background:#f4f8f7;border-radius:10px}.mes-fin-embedded{border:2px solid #0798a9;border-radius:12px;padding:12px;background:#effafa}.mes-fin-embedded small{display:block;margin-top:5px;color:#607672}@media(max-width:900px){.mes-fin-kpis{grid-template-columns:repeat(2,1fr)}.mes-fin-buckets{grid-template-columns:repeat(2,1fr)}.mes-fin-alert-grid{grid-template-columns:1fr}.mes-fin-drill-head{display:block}.mes-fin-drill-head form{margin-top:10px}.mes-fin-drill-head input{min-width:0;flex:1}}@media(max-width:560px){.mes-fin-kpis{grid-template-columns:1fr}.mes-fin-kpis strong,.mes-fin-flow-main strong{font-size:22px}.dashboard-head .actions{display:grid;grid-template-columns:1fr 1fr}.mes-fin-month{grid-column:1/-1}.mes-fin-buckets{grid-template-columns:1fr}.mes-fin-flow{padding:12px}}';root.document.head.appendChild(style);
  if(runtime.getView&&runtime.getView()==="executive")root.requestAnimationFrame(renderDashboard);
})(window);
