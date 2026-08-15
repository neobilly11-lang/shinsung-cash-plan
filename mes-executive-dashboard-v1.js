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
    function exchangeHistoryTable() {
      var history = list(settings(state()).executiveExchangeRateHistory);
      if (!history.length) return '<div class="panel mes-exec-history"><h2>환율 변경 이력</h2><div class="empty">아직 환율 변경 이력이 없습니다.</div></div>';
      var categories = [{ key: "total", label: "총재고" }, { key: "unsold", label: "미판매 예상재고" }, { key: "planned", label: "판매계획완료 재고" }];
      return '<div class="panel mes-exec-history"><div class="dashboard-head"><div><h2>환율 변경 이력 · 예상 환차손익</h2><p>변경 전 금액과 변경 후 금액을 기준일별로 보존합니다.</p></div></div><div class="mes-exec-table"><table><thead><tr><th>구분</th><th>변경 전 기준일</th><th>변경 전 금액</th><th>변경일</th><th>변경 후 금액</th><th>환차익 / 환차손</th><th>적용 환율</th><th>변경자</th></tr></thead><tbody>' + history.flatMap(function (entry) {
        return categories.map(function (category) {
          var difference = number(entry.differences && entry.differences[category.key]);
          var rateText = ["USD", "JPY", "EURO"].map(function (currency) { return currency + " " + fmt(entry.nextRates && entry.nextRates[currency]); }).join(" · ");
          return '<tr><td class="left"><b>' + category.label + '</b></td><td>' + encode(localDate(entry.previousEffectiveAt)) + '</td><td>' + fmt(entry.previousTotals && entry.previousTotals[category.key]) + '원</td><td>' + encode(localDate(entry.changedAt)) + '</td><td>' + fmt(entry.nextTotals && entry.nextTotals[category.key]) + '원</td><td class="' + (difference >= 0 ? "gain" : "loss") + '"><b>' + (difference > 0 ? "+" : "") + fmt(difference) + '원</b></td><td>' + encode(rateText) + '</td><td>' + encode(entry.changedBy || "-") + '</td></tr>';
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
    style.textContent = '.mes-exec-kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:0 0 18px}.mes-exec-kpi{border:1px solid #cddbd8;border-radius:20px;background:#fff;padding:22px;text-align:left;cursor:pointer}.mes-exec-kpi.on{background:linear-gradient(135deg,#0b3040,#0b8778);color:#fff}.mes-exec-kpi small,.mes-exec-kpi span{display:block}.mes-exec-kpi strong{display:block;font-size:28px;margin:10px 0}.mes-exec-filter{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr)) auto auto;gap:10px;align-items:end;margin-bottom:16px}.mes-exec-filter label{display:grid;gap:6px;font-weight:700}.mes-exec-filter input,.mes-exec-filter select{width:100%;padding:12px;border:1px solid #cbd8d5;border-radius:10px}.mes-exec-table{overflow:auto;max-height:58vh}.mes-exec-table table{width:100%;border-collapse:collapse;white-space:nowrap}.mes-exec-table th,.mes-exec-table td{border:1px solid #dbe3e1;padding:10px;text-align:right}.mes-exec-table th{background:#eef5f4}.mes-exec-table .left{text-align:left}.mes-exec-table .gain{color:#08785f}.mes-exec-table .loss{color:#b4232f}.mes-exec-history{margin-top:18px}.mes-exec-note{padding:16px;border-radius:12px;background:#eef7f5;line-height:1.7}@media(max-width:760px){.mes-exec-kpis{grid-template-columns:1fr}.mes-exec-filter{grid-template-columns:1fr 1fr}.mes-exec-kpi strong{font-size:24px}.mes-exec-table{max-height:52vh}.mes-exec-filter .btn{min-height:48px}}';
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
