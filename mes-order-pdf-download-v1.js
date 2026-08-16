(function mesOrderPdfDownloadModule(root) {
  "use strict";

  var embeddedTemplates = root.MES_ORDER_TEMPLATE_ASSETS || {};
  var TEMPLATE = {
    PO1: embeddedTemplates.PO1 || "order-templates/purchase-order-page-1.png",
    PO2: embeddedTemplates.PO2 || "order-templates/purchase-order-page-2.png",
    SO1: embeddedTemplates.SO1 || "order-templates/sales-order-page-1.png"
  };
  var imageCache = new Map();

  function list(value) { return Array.isArray(value) ? value : []; }
  function number(value) {
    var parsed = Number(String(value == null ? "" : value).replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function text(value) { return String(value == null ? "" : value).trim(); }
  function escapeHtml(value) {
    return text(value).replace(/[&<>"']/g, function (character) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character];
    });
  }
  function pick(row, keys, fallback) {
    row = row || {};
    for (var index = 0; index < keys.length; index += 1) {
      var value = row[keys[index]];
      if (value !== undefined && value !== null && text(value) !== "") return value;
    }
    return fallback == null ? "" : fallback;
  }
  function money(value) {
    return number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function quantity(value) {
    var numeric = number(value);
    return numeric.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }
  function displayDate(value, poStyle) {
    if (!value) return "";
    var raw = String(value).slice(0, 10);
    var parsed = new Date(raw + "T00:00:00");
    if (Number.isNaN(parsed.getTime())) return raw;
    if (!poStyle) return raw;
    return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, " ");
  }
  function currentState() {
    return root.__mesRuntime && root.__mesRuntime.getState ? root.__mesRuntime.getState() : (root.state || {});
  }
  function activeView() {
    return root.__mesRuntime && root.__mesRuntime.getView ? root.__mesRuntime.getView() : root.currentView;
  }
  function notify(message, failed) {
    var fn = root.toast || (root.__mesRuntime && root.__mesRuntime.getToast && root.__mesRuntime.getToast());
    if (typeof fn === "function") fn(message, !!failed);
  }
  function modalElements() {
    return {
      modal: document.getElementById("modal"),
      title: document.getElementById("modalTitle"),
      body: document.getElementById("modalBody")
    };
  }
  function groupBy(rows, keyName) {
    var groups = new Map();
    list(rows).filter(function (row) { return row && row.status !== "CANCELLED"; }).forEach(function (row) {
      var key = text(row[keyName] || row.id || "미지정");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    });
    return Array.from(groups, function (entry) {
      var items = entry[1], first = items[0] || {};
      return {
        id: entry[0], items: items,
        partner: keyName === "poNo" ? pick(first, ["company", "supplier", "partner"]) : pick(first, ["customer", "company", "buyer"]),
        date: keyName === "poNo" ? pick(first, ["contractDate", "purchaseDate", "createdAt"]) : pick(first, ["orderDate", "contractDate", "createdAt"]),
        grade: Array.from(new Set(items.map(function (item) {
          return pick(item, ["purchaseContractGrade", "contractGrade", "grade", "mainGrade", "itemName"]);
        }).filter(Boolean))).join(" / "),
        weight: items.reduce(function (sum, item) {
          return sum + number(pick(item, keyName === "poNo"
            ? ["purchaseContractWeight", "contractWeight", "weight", "netWeight", "grossWeight"]
            : ["weight", "netWeight", "grossWeight"], 0));
        }, 0)
      };
    }).sort(function (a, b) { return String(b.date || "").localeCompare(String(a.date || "")); });
  }
  function documentGroups(type) {
    var stateValue = currentState();
    return type === "PO" ? groupBy(stateValue.pos, "poNo") : groupBy(stateValue.salesOrders, "soNo");
  }

  function addDownloadButton() {
    var view = activeView();
    if (view !== "purchase" && view !== "sales") return;
    var actions = document.querySelector("#content .dashboard-head .actions");
    if (!actions || actions.querySelector(".mes-order-download")) return;
    var type = view === "purchase" ? "PO" : "SO";
    var button = document.createElement("button");
    button.type = "button";
    button.className = "btn mes-order-download";
    button.textContent = type === "PO" ? "P.O 다운로드" : "S.O 다운로드";
    button.onclick = function (event) { event.stopPropagation(); root.openMesOrderDownload(type); };
    var registration = actions.querySelector(".purchase-mode-actions, .mes-register");
    if (registration) registration.insertAdjacentElement("afterend", button);
    else actions.insertAdjacentElement("afterbegin", button);
  }

  function injectStyle() {
    if (document.getElementById("mesOrderPdfStyle")) return;
    var style = document.createElement("style");
    style.id = "mesOrderPdfStyle";
    style.textContent = [
      ".mes-order-download{background:#fff!important;border-color:#0d96a7!important;color:#08798a!important;font-weight:900}",
      ".order-download-head{display:grid;grid-template-columns:1fr auto;gap:10px;margin-bottom:14px}",
      ".order-download-head input{min-height:48px;border:1px solid #cbd8df;border-radius:10px;padding:0 14px;font-size:16px}",
      ".order-download-list{display:grid;gap:10px;max-height:62vh;overflow:auto;padding-right:3px}",
      ".order-download-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;border:1px solid #dce5eb;border-radius:14px;padding:14px;background:#fff}",
      ".order-download-card b{display:block;font-size:18px}.order-download-card p{margin:5px 0 0;color:#617082;line-height:1.45}",
      ".order-download-card .btn{white-space:nowrap}",
      ".order-download-empty{padding:30px;text-align:center;color:#728093;border:1px dashed #cbd8df;border-radius:14px}",
      "@media(max-width:700px){.order-download-head{grid-template-columns:1fr}.order-download-card{grid-template-columns:1fr}.order-download-card .btn{width:100%}.mes-order-download{width:100%}}"
    ].join("");
    document.head.appendChild(style);
  }

  root.openMesOrderDownload = function openMesOrderDownload(type) {
    var elements = modalElements(), groups = documentGroups(type);
    if (!elements.modal || !elements.body) return notify("다운로드 화면을 열 수 없습니다.", true);
    elements.title.textContent = (type === "PO" ? "P.O" : "S.O") + " 양식 PDF 다운로드";
    elements.body.innerHTML = "<div class='order-download-head'><input id='mesOrderDownloadSearch' placeholder='" + (type === "PO" ? "P.O 번호 · 거래처 · 강종 검색" : "S.O 번호 · 판매처 · 강종 검색") + "' oninput='filterMesOrderDownload(this.value)'><button class='btn' type='button' onclick='closeModal()'>닫기</button></div>"
      + "<div id='mesOrderDownloadList' class='order-download-list'>" + orderCards(type, groups) + "</div>";
    elements.modal.classList.add("on");
    var card = elements.modal.querySelector(".modal-card");
    if (card) card.classList.add("wide-modal");
    root.__mesOrderDownload = { type: type, groups: groups };
    setTimeout(function () { document.getElementById("mesOrderDownloadSearch")?.focus(); }, 80);
  };

  function orderCards(type, groups) {
    if (!groups.length) return "<div class='order-download-empty'>다운로드할 등록자료가 없습니다.</div>";
    return groups.map(function (group) {
      var search = [group.id, group.partner, group.grade].join(" ").toLowerCase();
      return "<article class='order-download-card' data-search='" + escapeHtml(search) + "'><div><b>" + escapeHtml(group.id) + "</b><p>" + escapeHtml(group.partner || "거래처 미지정") + " · " + escapeHtml(group.grade || "강종 미지정") + "<br>" + group.items.length + "행 · " + quantity(group.weight) + " kg</p></div><button class='btn primary' type='button' onclick='downloadMesOrderPdf(\"" + type + "\",decodeURIComponent(\"" + encodeURIComponent(group.id) + "\"),this)'>PDF 다운로드</button></article>";
    }).join("");
  }

  root.filterMesOrderDownload = function filterMesOrderDownload(query) {
    var normalized = text(query).toLowerCase();
    document.querySelectorAll("#mesOrderDownloadList .order-download-card").forEach(function (card) {
      card.hidden = normalized && !String(card.dataset.search || "").includes(normalized);
    });
  };

  function loadImage(source) {
    if (imageCache.has(source)) return imageCache.get(source);
    var promise = new Promise(function (resolve, reject) {
      var image = new Image();
      image.onload = function () { resolve(image); };
      image.onerror = function () { reject(new Error("양식 이미지를 불러오지 못했습니다: " + source)); };
      image.src = String(source).indexOf("data:") === 0
        ? source
        : source + "?v=20260816-order-download-2";
    });
    imageCache.set(source, promise);
    return promise;
  }
  function makeCanvas(image) {
    var canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    var context = canvas.getContext("2d");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    context.textBaseline = "alphabetic";
    context.fillStyle = "#111";
    return { canvas: canvas, context: context };
  }
  function clear(context, x, y, width, height) {
    context.save(); context.fillStyle = "#fff"; context.fillRect(x, y, width, height); context.restore();
  }
  function fitFont(context, value, maxWidth, startSize, minSize, weight) {
    var size = startSize;
    do {
      context.font = (weight || "400") + " " + size + "px Arial, 'Noto Sans KR', sans-serif";
      if (context.measureText(text(value)).width <= maxWidth) return size;
      size -= 1;
    } while (size >= minSize);
    return minSize;
  }
  function write(context, value, x, y, maxWidth, options) {
    options = options || {};
    var stringValue = text(value), size = fitFont(context, stringValue, maxWidth, options.size || 17, options.min || 9, options.weight || "400");
    context.font = (options.weight || "400") + " " + size + "px Arial, 'Noto Sans KR', sans-serif";
    context.fillStyle = options.color || "#111";
    context.textAlign = options.align || "left";
    var drawX = options.align === "right" ? x + maxWidth : options.align === "center" ? x + maxWidth / 2 : x;
    context.fillText(stringValue, drawX, y, maxWidth);
  }
  function wrapped(context, value, x, y, maxWidth, lineHeight, maxLines, options) {
    options = options || {};
    var words = text(value).split(/\s+/).filter(Boolean), lines = [], current = "";
    context.font = (options.weight || "400") + " " + (options.size || 15) + "px Arial, 'Noto Sans KR', sans-serif";
    words.forEach(function (word) {
      var next = current ? current + " " + word : word;
      if (context.measureText(next).width <= maxWidth || !current) current = next;
      else { lines.push(current); current = word; }
    });
    if (current) lines.push(current);
    lines.slice(0, maxLines || lines.length).forEach(function (line, index) {
      write(context, line, x, y + index * lineHeight, maxWidth, options);
    });
  }
  function orderItemText(item) {
    return pick(item, ["item", "itemName", "marking", "matchedMarking", "mainGrade", "purchaseContractGrade", "contractGrade", "grade"]);
  }
  function orderDescription(item) {
    return pick(item, ["description", "detailGrade", "matchedDescription", "sourceDescription", "subGrade"], orderItemText(item));
  }
  function poWeight(item) {
    return number(pick(item, ["purchaseContractWeight", "contractWeight", "purchaseQuantity", "contractQuantity", "weight", "netWeight", "grossWeight"], 0));
  }
  function orderPrice(item) {
    var amount = orderAmount(item), weight = item.soNo ? number(item.weight) : poWeight(item);
    return number(pick(item, ["unitPrice", "sourceUnitPrice", "price", "purchaseUnitPrice", "salesUnitPrice"], amount && weight ? amount / weight : 0));
  }
  function orderAmount(item) {
    var direct = number(pick(item, ["purchaseAmount", "salesAmount", "amount", "totalValue", "total"], 0));
    var weight = item.soNo ? number(item.weight) : poWeight(item);
    return direct || weight * number(pick(item, ["unitPrice", "sourceUnitPrice", "price", "purchaseUnitPrice", "salesUnitPrice"], 0));
  }

  async function renderPurchase(group) {
    var images = await Promise.all([loadImage(TEMPLATE.PO1), loadImage(TEMPLATE.PO2)]);
    var pageOne = makeCanvas(images[0]), ctx = pageOne.context, items = group.items.slice(0, 12), first = group.items[0] || {};
    clear(ctx, 199, 268, 451, 32); clear(ctx, 840, 268, 225, 32);
    clear(ctx, 199, 307, 866, 35); clear(ctx, 199, 348, 451, 34); clear(ctx, 839, 348, 226, 34);
    clear(ctx, 199, 389, 451, 34); clear(ctx, 839, 389, 226, 34); clear(ctx, 199, 430, 451, 34);
    clear(ctx, 199, 472, 866, 34); clear(ctx, 199, 511, 866, 114);
    write(ctx, group.partner, 205, 290, 438, { size: 16, min: 10 });
    write(ctx, displayDate(pick(first, ["contractDate", "purchaseDate", "createdAt"]), true), 847, 290, 210, { size: 16, min: 10 });
    write(ctx, pick(first, ["address", "supplierAddress", "partnerAddress"]), 205, 331, 850, { size: 15, min: 8 });
    write(ctx, pick(first, ["tel", "phone", "supplierTel"]), 205, 372, 438, { size: 15, min: 9 });
    write(ctx, group.id, 847, 372, 210, { size: 16, min: 10 });
    write(ctx, pick(first, ["fax", "supplierFax"]), 205, 413, 438, { size: 15, min: 9 });
    write(ctx, pick(first, ["confirming", "confirmedBy", "confirmingName"]), 847, 413, 210, { size: 14, min: 9 });
    write(ctx, pick(first, ["shipment", "shippingTerm", "loadingTerm"]), 205, 454, 438, { size: 15, min: 9 });
    write(ctx, pick(first, ["paymentTerm", "payment", "paymentTerms"]), 205, 496, 850, { size: 15, min: 8 });
    wrapped(ctx, pick(first, ["purchaseNote", "note", "memo"]), 205, 536, 850, 21, 4, { size: 14, min: 9 });

    var rowTop = 732, rowHeight = 39.2;
    clear(ctx, 66, rowTop + 1, 1000, rowHeight * 12 - 2);
    items.forEach(function (item, index) {
      var baseline = rowTop + index * rowHeight + 26, currency = pick(item, ["currency"], pick(first, ["currency"], "USD"));
      write(ctx, index + 1, 72, baseline, 40, { size: 15 });
      write(ctx, orderItemText(item), 126, baseline, 150, { size: 15, min: 8 });
      write(ctx, orderDescription(item), 294, baseline, 295, { size: 15, min: 8 });
      write(ctx, quantity(poWeight(item)), 607, baseline, 110, { size: 15, min: 9, align: "right" });
      write(ctx, money(orderPrice(item)), 738, baseline, 82, { size: 14, min: 8, align: "right" });
      write(ctx, money(orderAmount(item)), 839, baseline, 151, { size: 14, min: 8, align: "right" });
      write(ctx, currency, 1012, baseline, 48, { size: 14, min: 9, align: "center" });
    });
    clear(ctx, 326, 1220, 680, 43);
    write(ctx, "Total", 347, 1248, 190, { size: 17, align: "center" });
    write(ctx, quantity(items.reduce(function (sum, item) { return sum + poWeight(item); }, 0)), 610, 1248, 115, { size: 17, align: "right" });
    write(ctx, money(items.reduce(function (sum, item) { return sum + orderAmount(item); }, 0)), 835, 1248, 155, { size: 17, align: "right" });

    var pageTwo = makeCanvas(images[1]), ctx2 = pageTwo.context;
    clear(ctx2, 560, 535, 505, 160);
    ctx2.strokeStyle = "#111"; ctx2.lineWidth = 1; ctx2.strokeRect(560, 564, 505, 72);
    write(ctx2, "SELLER", 584, 612, 130, { size: 20, align: "center" });
    write(ctx2, group.partner, 730, 589, 315, { size: 15, min: 8, weight: "700", align: "center" });
    write(ctx2, "SIGN", 730, 623, 315, { size: 18, weight: "700", align: "center" });
    return [pageOne.canvas, pageTwo.canvas];
  }

  async function renderSales(group) {
    var image = await loadImage(TEMPLATE.SO1), page = makeCanvas(image), ctx = page.context, items = group.items.slice(0, 12), first = group.items[0] || {};
    clear(ctx, 293, 319, 360, 34); clear(ctx, 753, 319, 310, 34); clear(ctx, 293, 357, 770, 34);
    clear(ctx, 293, 396, 360, 34); clear(ctx, 753, 396, 310, 34); clear(ctx, 293, 433, 360, 34); clear(ctx, 753, 433, 310, 34);
    clear(ctx, 293, 471, 360, 34); clear(ctx, 753, 471, 310, 34); clear(ctx, 293, 508, 770, 56);
    write(ctx, group.partner, 316, 343, 325, { size: 15, min: 9 });
    write(ctx, displayDate(pick(first, ["orderDate", "contractDate", "createdAt"]), false), 777, 343, 278, { size: 15, min: 10 });
    write(ctx, pick(first, ["address", "customerAddress", "buyerAddress"]), 316, 381, 735, { size: 14, min: 8 });
    write(ctx, pick(first, ["tel", "phone", "customerTel"]), 316, 419, 325, { size: 14, min: 9 });
    write(ctx, group.id, 777, 419, 278, { size: 15, min: 10 });
    write(ctx, pick(first, ["fax", "customerFax"]), 316, 457, 325, { size: 14, min: 9 });
    write(ctx, pick(first, ["poNo", "customerPoNo", "purchaseOrderNo"]), 777, 457, 278, { size: 14, min: 9 });
    write(ctx, pick(first, ["shipment", "shippingTerm", "deliveryTerm"]), 316, 495, 325, { size: 14, min: 8 });
    write(ctx, pick(first, ["packing", "packingTerm", "packingType"]), 777, 495, 278, { size: 14, min: 8 });
    wrapped(ctx, pick(first, ["note", "memo", "salesMemo"]), 316, 535, 735, 18, 2, { size: 13, min: 8 });

    clear(ctx, 83, 630, 980, 404);
    var rowHeight = Math.min(37, 382 / Math.max(items.length, 1));
    items.forEach(function (item, index) {
      var baseline = 654 + index * rowHeight, itemLabel = orderItemText(item), currency = pick(item, ["currency"], pick(first, ["currency"], "USD"));
      if (item.productType && item.mainGrade && !String(itemLabel).includes(item.productType)) itemLabel = [item.productType, item.mainGrade, item.subGrade].filter(Boolean).join(" ");
      write(ctx, index + 1, 91, baseline, 42, { size: 14, align: "center" });
      write(ctx, itemLabel, 139, baseline, 164, { size: 14, min: 8, align: "center" });
      write(ctx, orderDescription(item), 319, baseline, 253, { size: 14, min: 8 });
      write(ctx, quantity(number(item.weight || item.netWeight || item.grossWeight)), 577, baseline, 82, { size: 14, min: 9, align: "right" });
      write(ctx, money(orderPrice(item)), 674, baseline, 70, { size: 14, min: 8, align: "right" });
      write(ctx, money(orderAmount(item)), 765, baseline, 113, { size: 14, min: 8, align: "right" });
      write(ctx, currency, 895, baseline, 52, { size: 13, min: 8, align: "center" });
      write(ctx, pick(item, ["itemNote", "note", "memo"]), 955, baseline, 100, { size: 12, min: 7, align: "center" });
    });
    clear(ctx, 280, 1043, 620, 34);
    write(ctx, "T O T A L", 290, 1068, 170, { size: 15, align: "center" });
    write(ctx, quantity(items.reduce(function (sum, item) { return sum + number(item.weight || item.netWeight || item.grossWeight); }, 0)), 570, 1068, 100, { size: 15, align: "right" });
    var symbol = pick(first, ["currency"], "USD") === "USD" ? "$" : pick(first, ["currency"], "USD") + " ";
    write(ctx, symbol + money(items.reduce(function (sum, item) { return sum + orderAmount(item); }, 0)), 735, 1068, 150, { size: 15, align: "right" });
    clear(ctx, 752, 1256, 310, 114); ctx.strokeStyle = "#e22"; ctx.lineWidth = 1; ctx.strokeRect(752, 1256, 310, 114);
    write(ctx, "BUYER", 752, 1321, 310, { size: 15, align: "center" });
    write(ctx, group.partner, 765, 1352, 284, { size: 12, min: 8, weight: "700", align: "center" });
    return [page.canvas];
  }

  async function saveCanvases(canvases, filename) {
    if (!root.PDFLib || !root.PDFLib.PDFDocument) throw new Error("PDF 생성 모듈을 불러오지 못했습니다.");
    var documentPdf = await root.PDFLib.PDFDocument.create();
    for (var index = 0; index < canvases.length; index += 1) {
      var canvas = canvases[index], bytes = await fetch(canvas.toDataURL("image/png")).then(function (response) { return response.arrayBuffer(); });
      var image = await documentPdf.embedPng(bytes), page = documentPdf.addPage([595.28, 841.89]);
      page.drawImage(image, { x: 0, y: 0, width: 595.28, height: 841.89 });
    }
    var output = await documentPdf.save(), blob = new Blob([output], { type: "application/pdf" }), link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.download = filename; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(function () { URL.revokeObjectURL(link.href); }, 5000);
  }

  root.downloadMesOrderPdf = async function downloadMesOrderPdf(type, id, button) {
    var group = documentGroups(type).find(function (entry) { return String(entry.id) === String(id); });
    if (!group) return notify("선택한 " + type + " 자료를 찾을 수 없습니다.", true);
    var original = button && button.textContent;
    if (button) { button.disabled = true; button.textContent = "PDF 생성 중…"; }
    try {
      var canvases = type === "PO" ? await renderPurchase(group) : await renderSales(group);
      await saveCanvases(canvases, group.id.replace(/[\\/:*?"<>|]/g, "_") + "_" + (type === "PO" ? "PURCHASE_ORDER" : "SALES_ORDER") + ".pdf");
      notify(group.id + " " + type + " PDF 다운로드를 시작했습니다.");
    } catch (error) {
      console.error(error); notify(type + " PDF 생성 실패: " + (error && error.message ? error.message : error), true);
    } finally {
      if (button) { button.disabled = false; button.textContent = original || "PDF 다운로드"; }
    }
  };

  injectStyle();
  var previousRender = root.render;
  if (typeof previousRender === "function") {
    root.render = function mesRenderWithOrderDownloads() {
      var result = previousRender.apply(this, arguments);
      setTimeout(addDownloadButton, 0);
      return result;
    };
  }
  var observer = new MutationObserver(function () { addDownloadButton(); });
  observer.observe(document.body, { childList: true, subtree: true });
  addDownloadButton();
})(window);

