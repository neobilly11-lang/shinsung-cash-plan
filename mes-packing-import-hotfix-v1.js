(function (root) {
  "use strict";

  const VERSION = "20260813-5";
  const number = value => {
    const parsed = Number(String(value == null ? "" : value).replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const round2 = value => Math.round((number(value) + Number.EPSILON) * 100) / 100;
  const clean = value => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const compact = value => clean(value).toUpperCase().replace(/[^A-Z0-9\uAC00-\uD7A3]/g, "");
  const safeArray = value => Array.isArray(value) ? value : [];

  function similarity(left, right) {
    const a = compact(left), b = compact(right);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) {
      return Math.min(1, Math.min(a.length, b.length) / Math.max(a.length, b.length) + 0.15);
    }
    const chars = new Set(a);
    const common = [...new Set(b)].filter(char => chars.has(char)).length;
    return common / Math.max(new Set(a).size, new Set(b).size);
  }

  function inferProductType(...values) {
    const text = values.map(clean).join(" ").toUpperCase();
    if (/\bNI(?:CKEL)?\b|INCONEL|HASTELLOY|NIMONIC/.test(text)) return "NI";
    if (/\bTI(?:TANIUM)?\b/.test(text)) return "TI";
    if (/\bSTS\b|STAINLESS|\bSUS\b/.test(text)) return "STS";
    if (/\bCO(?:BALT)?\b/.test(text)) return "CO";
    if (/\bMO(?:LYBDENUM)?\b/.test(text)) return "MO";
    if (/\bCU(?:PPER)?\b/.test(text)) return "CU";
    return "OTHER";
  }

  function currentPo(poNo) {
    try {
      if (typeof root.poRows === "function") return safeArray(root.poRows()).find(row => row.poNo === poNo);
      if (typeof poRows === "function") return safeArray(poRows()).find(row => row.poNo === poNo);
    } catch (_) {}
    return null;
  }

  function showToast(message, error) {
    try {
      if (typeof root.toast === "function") return root.toast(message, error);
      if (typeof toast === "function") return toast(message, error);
    } catch (_) {}
  }

  function showForm(po, items) {
    if (typeof root.renderPackingRequestForm === "function") return root.renderPackingRequestForm(po, items);
    if (typeof renderPackingRequestForm === "function") return renderPackingRequestForm(po, items);

    // The original MES page keeps renderPackingRequestForm inside a closure, so
    // it is not always exposed on window. Open the normal direct-entry screen
    // first, then replace its rows with the analyzed PACKING LIST values.
    if (typeof root.openPackingRequestDirect === "function" && po?.poNo) {
      root.openPackingRequestDirect(po.poNo);
      const holder = document.getElementById("packingRequestLines");
      if (!holder) throw Error("입고요청 입력 화면을 불러오지 못했습니다. 잠시 후 다시 시도하세요.");

      const wanted = Math.max(1, safeArray(items).length);
      while (holder.querySelectorAll(".packing-request-line").length < wanted) {
        if (typeof root.addPackingRequestLine !== "function") break;
        root.addPackingRequestLine();
      }
      while (holder.querySelectorAll(".packing-request-line").length > wanted) {
        holder.lastElementChild?.remove();
      }

      const rows = [...holder.querySelectorAll(".packing-request-line")];
      safeArray(items).forEach((item, index) => {
        const row = rows[index];
        if (!row) return;
        const set = (name, value) => {
          const field = row.querySelector(`[name="${name}"]`);
          if (field) field.value = value == null ? "" : value;
        };
        set("packageNo", item.packageNo || "");
        set("grade", item.grade || item.mainGrade || "");
        set("gw", round2(item.gw || item.grossWeight || item.nw || item.weight));
        set("nw", round2(item.nw || item.netWeight || item.weight));
        set("packingType", item.packingType || "");
        set("memo", item.memo || "");
      });

      if (typeof root.updatePackingRequestTotals === "function") root.updatePackingRequestTotals();
      const modal = document.getElementById("modal");
      modal?.classList.add("on");
      holder.scrollIntoView?.({ behavior: "smooth", block: "start" });
      return holder;
    }

    throw Error("입고요청 입력 화면을 열 수 없습니다. 새로고침 후 다시 시도하세요.");
  }

  async function parsePackingFile(file, options) {
    const importer = root.MesDocumentImporterV4 || root.__mesDocumentImporterV4;
    if (!importer || typeof importer.importFile !== "function") {
      throw Error("PACKING LIST 공용 분석기를 불러오지 못했습니다. 새로고침 후 다시 시도하세요.");
    }
    return importer.importFile(file, options || {});
  }

  root.mesPdfLines = async function mesPdfLinesCompatibility(file) {
    const parsed = await parsePackingFile(file);
    return safeArray(parsed.lines);
  };

  root.mesDocNo = function mesDocNoCompatibility(lines, fileName) {
    const importer = root.MesDocumentImporterV4 || root.__mesDocumentImporterV4;
    return importer?.parseText?.(safeArray(lines).join("\n"), fileName || "")?.poNo || "";
  };

  root.mesDocCompany = function mesDocCompanyCompatibility(lines) {
    const importer = root.MesDocumentImporterV4 || root.__mesDocumentImporterV4;
    return importer?.parseText?.(safeArray(lines).join("\n"), "")?.company || "";
  };

  root.mesDocItems = function mesDocItemsCompatibility(lines) {
    const importer = root.MesDocumentImporterV4 || root.__mesDocumentImporterV4;
    return safeArray(importer?.parseText?.(safeArray(lines).join("\n"), "")?.items).map(item => ({
      grade: item.marking || item.matchedMarking || "",
      weight: round2(item.netWeight || item.weight),
      nw: round2(item.netWeight || item.weight),
      gw: round2(item.grossWeight || item.netWeight || item.weight),
      price: round2(item.price),
      amount: round2(item.amount),
      packingType: item.packingType || "",
      packageNo: item.packageNo || ""
    }));
  };

  root.mesAnalyzePoDocument = async function mesAnalyzePoDocumentV3(file) {
    if (!file) return;
    const progress = document.getElementById("progress");
    const statusBox = document.getElementById("mesPoImportStatus");
    progress?.classList.add("on");
    if (statusBox) statusBox.textContent = `${file.name} · P.O·INVOICE 분석 중`;
    try {
      const parsed = await parsePackingFile(file, { targetType: "PO" });
      if (!safeArray(parsed.items).length) throw Error("강종·중량 품목을 찾지 못했습니다.");
      if (statusBox) statusBox.textContent = `${parsed.items.length}개 품목 분석 완료`;
      if (typeof root.__mesOpenDirectPo === "function") root.__mesOpenDirectPo(parsed);
      else if (typeof root.openMesDirectPoWithData === "function") root.openMesDirectPoWithData(parsed);
      else throw Error("P.O 자동완성 입력 화면을 열 수 없습니다. 새로고침 후 다시 시도하세요.");
      showToast(`${file.name} · ${parsed.items.length}개 품목 자동완성 완료`);
    } catch (error) {
      if (statusBox) statusBox.textContent = `불러오기 실패: ${error.message}`;
      showToast(`서류 자동완성 실패: ${error.message}`, true);
    } finally {
      progress?.classList.remove("on");
    }
  };

  root.analyzePackingRequestFile = async function analyzePackingRequestFileV1(poNo, file) {
    if (!file) return;
    const po = currentPo(poNo);
    if (!po) return showToast("입고요청 P.O를 찾지 못했습니다.", true);

    const progress = document.getElementById("progress");
    const statusBox = document.getElementById("mesPackingImportStatus");
    progress?.classList.add("on");
    if (statusBox) statusBox.textContent = `${file.name} · PACKING LIST 분석 중`;

    try {
      const parsed = await parsePackingFile(file, { targetType: "PACKING", poNo });
      const sourceRows = safeArray(po.rows);
      const parsedItems = safeArray(parsed.items);
      const items = parsedItems.map((item, index) => {
        const sourceName = item.marking || item.grade || item.matchedMarking || "";
        const exact = sourceRows.find(row => compact(row.grade) === compact(sourceName));
        const nearest = sourceRows.map(row => ({ row, score: similarity(row.grade, sourceName) }))
          .sort((a, b) => b.score - a.score)[0];
        // A supplier MATERIAL value is authoritative.  A PO row may provide
        // classification metadata only when it is an exact or strong match;
        // never replace it with the highest-scoring unrelated row.
        const matched = exact || (nearest && nearest.score >= 0.82 ? nearest.row : {});
        const netWeight = round2(item.netWeight || item.weight || item.quantity || 0);
        const grossWeight = round2(item.grossWeight || item.gw || netWeight);
        const grade = item.marking || item.grade || item.matchedMarking || matched.grade || "";
        return {
          packageNo: item.packageNo || `PL-${String(index + 1).padStart(3, "0")}`,
          grade,
          gw: grossWeight,
          nw: netWeight,
          packingType: item.packingType || parsed.packing || matched.packingType || "",
          memo: item.memo || "",
          productType: matched.productType || inferProductType(item.description, grade),
          mainGrade: matched.mainGrade || grade,
          subGrade: matched.subGrade || "",
          detailGrade: matched.detailGrade || item.description || ""
        };
      }).filter(item => item.grade || item.gw > 0 || item.nw > 0);

      if (!items.length) throw Error("PACKING LIST에서 강종·중량 품목을 찾지 못했습니다.");
      if (statusBox) statusBox.textContent = `${items.length}개 패키지 자동완성 완료`;
      showForm(po, items);
      showToast(`${file.name} · ${items.length}개 패키지 불러오기 완료`);
    } catch (error) {
      if (statusBox) statusBox.textContent = `불러오기 실패: ${error.message}`;
      showToast(`PACKING LIST 자동완성 실패: ${error.message}`, true);
    } finally {
      progress?.classList.remove("on");
      try {
        if (typeof root.setSync === "function") root.setSync("공용 서버 연결됨");
        else if (typeof setSync === "function") setSync("공용 서버 연결됨");
      } catch (_) {}
    }
  };

  document.documentElement.dataset.mesPackingImportHotfix = VERSION;
})(window);
