(function (root) {
  "use strict";

  const VERSION = "20260813-1";
  const number = value => {
    const parsed = Number(String(value == null ? "" : value).replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const round2 = value => Math.round((number(value) + Number.EPSILON) * 100) / 100;
  const clean = value => String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  const compact = value => clean(value).toUpperCase().replace(/[^A-Z0-9媛-??/g, "");
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
    throw Error("?낃퀬?붿껌 ?낅젰 ?붾㈃???????놁뒿?덈떎. ?덈줈怨좎묠 ???ㅼ떆 ?쒕룄?섏꽭??");
  }

  async function parsePackingFile(file) {
    const importer = root.MesDocumentImporterV4;
    if (!importer || typeof importer.importFile !== "function") {
      throw Error("PACKING LIST 怨듭슜 遺꾩꽍湲곕? 遺덈윭?ㅼ? 紐삵뻽?듬땲?? ?덈줈怨좎묠 ???ㅼ떆 ?쒕룄?섏꽭??");
    }
    return importer.importFile(file);
  }

  root.mesPdfLines = async function mesPdfLinesCompatibility(file) {
    const parsed = await parsePackingFile(file);
    return safeArray(parsed.lines);
  };

  root.analyzePackingRequestFile = async function analyzePackingRequestFileV1(poNo, file) {
    if (!file) return;
    const po = currentPo(poNo);
    if (!po) return showToast("?낃퀬?붿껌 P.O瑜?李얠? 紐삵뻽?듬땲??", true);

    const progress = document.getElementById("progress");
    const statusBox = document.getElementById("mesPackingImportStatus");
    progress?.classList.add("on");
    if (statusBox) statusBox.textContent = `${file.name} 쨌 PACKING LIST 遺꾩꽍 以?;

    try {
      const parsed = await parsePackingFile(file);
      const sourceRows = safeArray(po.rows);
      const parsedItems = safeArray(parsed.items);
      const items = parsedItems.map((item, index) => {
        const sourceName = item.matchedMarking || item.marking || item.grade || "";
        const matched = sourceRows.find(row => compact(row.grade) === compact(sourceName))
          || sourceRows.map(row => ({ row, score: similarity(row.grade, sourceName) }))
            .sort((a, b) => b.score - a.score)[0]?.row
          || sourceRows[index]
          || {};
        const netWeight = round2(item.netWeight || item.weight || item.quantity || 0);
        const grossWeight = round2(item.grossWeight || item.gw || netWeight);
        const grade = item.matchedMarking || item.marking || item.grade || matched.grade || "";
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

      if (!items.length) throw Error("PACKING LIST?먯꽌 媛뺤쥌쨌以묐웾 ?덈ぉ??李얠? 紐삵뻽?듬땲??");
      if (statusBox) statusBox.textContent = `${items.length}媛??⑦궎吏 ?먮룞?꾩꽦 ?꾨즺`;
      showForm(po, items);
      showToast(`${file.name} 쨌 ${items.length}媛??⑦궎吏 遺덈윭?ㅺ린 ?꾨즺`);
    } catch (error) {
      if (statusBox) statusBox.textContent = `遺덈윭?ㅺ린 ?ㅽ뙣: ${error.message}`;
      showToast(`PACKING LIST ?먮룞?꾩꽦 ?ㅽ뙣: ${error.message}`, true);
    } finally {
      progress?.classList.remove("on");
      try {
        if (typeof root.setSync === "function") root.setSync("怨듭슜 ?쒕쾭 ?곌껐??);
        else if (typeof setSync === "function") setSync("怨듭슜 ?쒕쾭 ?곌껐??);
      } catch (_) {}
    }
  };

  document.documentElement.dataset.mesPackingImportHotfix = VERSION;
})(window);
