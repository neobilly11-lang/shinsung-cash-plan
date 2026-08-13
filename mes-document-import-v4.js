(function (root) {
  "use strict";

  const VERSION = "20260813-12";
  const WEIGHT_FACTORS = { KG: 1, LB: 0.45359237, TON: 1000 };
  const DESC_RE = /(Nickel\s+Alloy\s+Scrap|Cobalt\s+Scrap|Stainless\s+Steel\s+Scrap|Titanium\s+Scrap|Copper\s+Scrap|Tungsten\s+Scrap|Molybden(?:um|ium)\s+Scrap|Ferro\s+Titanium\s+Scrap)/i;
  const TOTAL_RE = /^(?:T\s*O\s*T\s*A\s*L|TOTAL|SUBTOTAL|GRAND\s+TOTAL|합계)\b/i;
  const HEADER_ALIASES = {
    marking: ["MARKING", "GRADE", "COMMODITY", "COMODOTY", "ITEM NAME", "MATERIAL", "MATERIALS", "ALLOY", "품명", "강종", "상세강종"],
    description: ["DESCRIPTION", "ITEM DESCRIPTION", "DESCRIPTION OF GOODS", "PRODUCT DESCRIPTION", "SCRAP TYPE", "설명", "품목설명"],
    quantity: ["QTY", "QTY KG", "QTY KGS", "QTY LB", "QTY LBS", "QUANTITY", "WEIGHT", "NET WEIGHT", "NETT WEIGHT", "NET", "NETT", "NW", "N/W", "중량", "확정중량"],
    gross: ["GROSS WEIGHT", "GROSS", "GW", "G/W"],
    tare: ["TARE WEIGHT", "TARE"],
    net: ["NET WEIGHT", "NETT WEIGHT", "NET", "NETT", "NW", "N/W"],
    price: ["UNIT PRICE", "PRICE", "USD PRICE", "USD/KG", "USD/LB", "USD/TON", "PRICE PER TON", "PRICE PER KG", "PRICE PER LB", "단가"],
    amount: ["TOTAL VALUE", "TOTAL AMOUNT", "AMOUNT", "VALUE", "TOTAL USD", "합계금액", "총금액"],
    unit: ["UNIT", "UOM", "단위"],
    packageNo: ["PACKAGE NO", "PACKAGE NUMBER", "PKG NO", "PACK NO", "패키지번호", "사내입고번호"],
    packageCount: ["PACKAGE COUNT", "PACKAGES", "PKGS", "패키지 수", "수량"],
    packingType: ["PACKING TYPE", "PACKAGE TYPE", "PACKING", "포장종류", "포장재"]
  };

  const round2 = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  const clean = value => String(value == null ? "" : value).replace(/[|]+/g, " ").replace(/\s+/g, " ").trim();
  const headerKey = value => clean(value).toUpperCase().replace(/[^A-Z0-9가-힣]/g, "");
  const compact = value => clean(value).toUpperCase().replace(/[^A-Z0-9가-힣]/g, "");

  function numberStyle(text) {
    const source = String(text || "");
    if (/\d{1,3}(?:\.\d{3})+,\d{1,3}\b/.test(source)) return "EU";
    if (/PRICE\s+PER\s+(?:TON|KG|LB)/i.test(source) && /\b\d+\.\d{3},\d{3}\b/.test(source)) return "EU";
    return "US";
  }

  function numberValue(value, style) {
    let text = String(value == null ? "" : value).replace(/[$€£\s]/g, "").replace(/[^\d.,+-]/g, "");
    if (!text) return 0;
    const mode = style || numberStyle(text);
    if (mode === "EU") text = text.replace(/\./g, "").replace(",", ".");
    else text = text.replace(/,/g, "");
    return Number(text) || 0;
  }

  function unitCode(value, fallback) {
    const text = clean(value).toUpperCase();
    if (/\b(?:LB|LBS|POUND|POUNDS)\b/.test(text)) return "LB";
    if (/\b(?:METRIC\s*TON|TONNE|TONNES|TONS?|MT|M\/?T)\b/.test(text)) return "TON";
    if (/\b(?:KG|KGS|KILOGRAM|KILOGRAMS)\b/.test(text)) return "KG";
    return fallback || "KG";
  }

  function sourceUnits(text) {
    const source = String(text || "");
    if (/PRICE\s+PER\s+(?:METRIC\s+)?TON/i.test(source)) return { quantity: "TON", price: "TON" };
    const header = source.split(/\r?\n/).slice(0, 100).join(" ");
    const quantity = unitCode((header.match(/(?:Q.?TY|QUANTITY|NET\s+WEIGHT|GROSS\s+WEIGHT)[^\n]{0,40}/i) || [""])[0], "KG");
    const price = unitCode((header.match(/(?:UNIT\s+PRICE|PRICE|US\$\s+PER)[^\n]{0,40}/i) || [""])[0], quantity);
    return { quantity, price };
  }

  function normalizeItem(marking, description, quantity, quantityUnit, price, priceUnit, amount, extra) {
    const qtyFactor = WEIGHT_FACTORS[unitCode(quantityUnit)] || 1;
    const priceFactor = WEIGHT_FACTORS[unitCode(priceUnit, unitCode(quantityUnit))] || qtyFactor;
    const qty = numberValue(quantity, extra && extra.style);
    const rawPrice = numberValue(price, extra && extra.style);
    const rawAmount = numberValue(amount, extra && extra.style);
    const weight = round2(qty * qtyFactor);
    const unitPrice = round2(rawAmount > 0 && weight > 0 ? rawAmount / weight : rawPrice / priceFactor);
    const total = round2(rawAmount || weight * unitPrice);
    const grossWeight = extra && extra.gross != null ? round2(numberValue(extra.gross, extra.style) * qtyFactor) : weight;
    const tareWeight = extra && extra.tare != null ? round2(numberValue(extra.tare, extra.style) * qtyFactor) : Math.max(0, round2(grossWeight - weight));
    return {
      marking: clean(marking),
      description: clean(description),
      weight,
      grossWeight,
      tareWeight,
      netWeight: weight,
      quantity: round2(qty),
      unit: unitCode(quantityUnit),
      price: unitPrice,
      sourcePrice: round2(rawPrice),
      priceUnit: unitCode(priceUnit, unitCode(quantityUnit)),
      amount: total,
      packageNo: clean(extra && extra.packageNo),
      packageCount: Math.max(1, Math.floor(Number(extra && extra.packageCount) || 1)),
      packingType: clean(extra && extra.packingType),
      memo: clean(extra && extra.memo),
      sourceGradeLocked: !!(extra && extra.sourceGradeLocked),
      sourceLineNo: Number(extra && extra.sourceLineNo) || 0
    };
  }

  function numericTokens(line, style) {
    return [...String(line || "").matchAll(/[$€£]?\s*[+-]?\d(?:[\d.,]*\d)?/g)].map(match => ({
      text: match[0],
      value: numberValue(match[0], style),
      index: match.index || 0,
      end: (match.index || 0) + match[0].length
    }));
  }


  function descriptionParts(value) {
    let text = clean(value).replace(/^\d{1,3}[.)-]?\s+/, "");
    let description = "";
    const suffix = text.match(new RegExp(`^(.*?)\\s*(?:/|-)?\\s*(${DESC_RE.source})$`, "i"));
    if (suffix) {
      text = clean(suffix[1]);
      description = clean(suffix[2]);
    } else {
      const prefix = text.match(new RegExp(`^(${DESC_RE.source})\\s*[-/:]?\\s*(.+)$`, "i"));
      if (prefix) {
        description = clean(prefix[1]);
        text = clean(prefix[2]);
      }
    }
    return { marking: text, description };
  }

  function parsePricePerTon(lines) {
    if (!lines.some(line => /PRICE\s+PER\s+TON/i.test(line))) return [];
    const rows = [];
    for (const line of lines) {
      if (TOTAL_RE.test(line) || /PRICE\s+PER\s+TON/i.test(line)) continue;
      const match = line.match(/^(.*?)\s+[$€£]\s*([\d.,]+)\s+([\d.,]+)\s+[$€£]\s*([\d.,]+)(?:\s+\d+\s*%\s+[$€£]\s*[\d.,]+)?\s*$/i);
      if (!match) continue;
      const item = normalizeItem(match[1], "", match[3], "TON", match[2], "TON", match[4], { style: "EU" });
      if (item.marking && item.weight > 0 && item.amount > 0) rows.push(item);
    }
    return rows;
  }

  function parseGrossTareNet(lines, text) {
    const style = numberStyle(text);
    const units = sourceUnits(text);
    const rows = [];
    for (let index = 0; index < lines.length; index++) {
      if (TOTAL_RE.test(lines[index]) || /GROSS\s+(?:LBS?|WEIGHT).*TARE/i.test(lines[index])) continue;
      let joined = lines[index];
      for (let width = 1; width <= 3 && index + width <= lines.length; width++) {
        if (width > 1) joined += " " + lines[index + width - 1];
        const match = clean(joined).match(/^\s*(?:\d{1,3}\s+)?(.+?)\s+(?:\d{4,}\s+)?([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s*(LB|LBS|KG|KGS)?\s+[$€£]?\s*([\d,.]+)\s*(?:\/?\s*(?:LB|LBS|KG|KGS)|P|PP)?\s+[$€£]?\s*([\d,.]+)\s*$/i);
        if (!match) continue;
        const unit = unitCode(match[5], units.quantity);
        const parts = descriptionParts(match[1]);
        const item = normalizeItem(parts.marking, parts.description, match[4], unit, match[6], unit, match[7], {
          gross: match[2], tare: match[3], style
        });
        const expected = round2(item.weight * item.price);
        if (!item.marking || item.weight <= 0 || item.price <= 0 || Math.abs(expected - item.amount) > Math.max(5, item.amount * 0.08)) continue;
        rows.push(item);
        index += width - 1;
        break;
      }
    }
    return rows;
  }

  function parseContractRows(lines, text) {
    const style = numberStyle(text);
    const units = sourceUnits(text);
    const rows = [];
    const rowRe = new RegExp(`^\\s*(\\d{1,3})\\s+(.+?)\\s+(${DESC_RE.source})\\s+([\\d,.]+)\\s+[$€£]?\\s*([\\d,.]+)\\s+[$€£]?\\s*([\\d,.]+)\\s*$`, "i");
    for (let index = 0; index < lines.length; index++) {
      if (TOTAL_RE.test(lines[index]) || /MARKING.*DESCRIPTION.*(?:Q.?TY|QUANTITY)/i.test(lines[index])) continue;
      let joined = "";
      for (let width = 1; width <= 3 && index + width <= lines.length; width++) {
        joined = clean(joined + " " + lines[index + width - 1]);
        const match = joined.match(rowRe);
        if (!match) continue;
        const item = normalizeItem(match[2], match[3], match[4], units.quantity, match[5], units.price, match[6], { style });
        if (!item.marking || item.weight <= 0 || item.price <= 0) continue;
        rows.push(item);
        index += width - 1;
        break;
      }
    }
    return rows;
  }

  function canonicalOcrDescription(value) {
    const text = compact(value);
    if (/STAINL.*STEELSCRAP/.test(text)) return "Stainless steel scrap";
    if (/NICKELALLOY.*SCRAP/.test(text) || /NICKELALLOY/.test(text)) return "Nickel alloy scrap";
    if (/COPPER.*SCRAP/.test(text)) return "Copper scrap";
    if (/TITANIUM.*SCRAP/.test(text)) return "Titanium scrap";
    if (/COBALT.*SCRAP/.test(text)) return "Cobalt scrap";
    if (/TUNGSTEN.*SCRAP/.test(text)) return "Tungsten scrap";
    if (/MOLYBDEN.*SCRAP/.test(text)) return "Molybdenum scrap";
    if (/FERRO.*TITANIUM.*SCRAP/.test(text)) return "Ferro Titanium scrap";
    return clean(value);
  }

  function extractOcrContractMarkings(value, expectedCount) {
    const source = clean(value).toUpperCase();
    const pattern = /\b(?:SMO|INCO(?:NEL|LOY)?|ALLOY|HAST(?:ELLOY)?|MONEL|NIMONIC|UDIMET|WASPALOY|SUS|STS|AISI|TI|CP|HS|FSX|MAR)\s*[- ]?\s*[A-Z0-9][A-Z0-9./-]*\b|\b\d{1,3}\s*\/\s*\d{1,3}\s+(?:COPPER|BRASS)\b|\b\d{1,3}\s+[A-Z]{1,5}\d{0,3}\b|\b[A-Z]{1,5}\s*[- ]?\d{2,4}[A-Z0-9/-]*\b|\b\d{3,4}\b/g;
    const result = [];
    for (const match of source.matchAll(pattern)) {
      const marking = clean(match[0]).replace(/\s*\/\s*/g, "/");
      if (!marking || result.includes(marking)) continue;
      result.push(marking);
      if (expectedCount > 0 && result.length >= expectedCount) break;
    }
    return result;
  }

  function parseColumnarContractOcr(lines, text) {
    const flat = clean(text);
    if (!/\bMARKING\b/i.test(flat) || !/\bPRICE\b/i.test(flat) || !/(?:Q\s*['’]?\s*TY|QUANTITY)/i.test(flat)) return [];

    const descriptions = [];
    const descriptionPattern = /Stainl[a-z]*\s+stee[l1i]\s+scrap|Nicke[l1i]\s+a[l1i]\s*loy\s+scrap|Copper\s+scrap|Titanium\s+scrap|Cobalt\s+scrap|Tungsten\s+scrap|Molybden(?:um|ium)\s+scrap|Ferro\s+Titanium\s+scrap/ig;
    for (const match of flat.matchAll(descriptionPattern)) descriptions.push(canonicalOcrDescription(match[0]));
    if (descriptions.length < 2) return [];

    const priceLabel = /\bPRICE\s*(?:\([^)]*\))?/i.exec(flat);
    const quantityLabel = /(?:Q\s*['’]?\s*TY|QUANTITY)\s*(?:\([^)]*\))?/i.exec(flat);
    const markingLabel = /\bMARKING\b/i.exec(flat);
    if (!priceLabel || !quantityLabel || !markingLabel) return [];

    const afterPrice = flat.slice(priceLabel.index + priceLabel[0].length);
    const priceStop = afterPrice.search(/\b(?:USD|DATE|DESCRIPTION)\b/i);
    const prices = numericTokens(priceStop >= 0 ? afterPrice.slice(0, priceStop) : afterPrice, "US")
      .map(token => token.value).filter(value => value > 0 && value < 100000).slice(0, descriptions.length);

    const afterQuantity = flat.slice(quantityLabel.index + quantityLabel[0].length);
    const quantityStop = afterQuantity.search(/\b(?:BUYER|AMOUNT|TOTAL\s+AMOUNT|BANK)\b/i);
    const quantities = numericTokens(quantityStop >= 0 ? afterQuantity.slice(0, quantityStop) : afterQuantity, "US")
      .map(token => token.value).filter(value => value > 0 && value < 100000000).slice(0, descriptions.length);

    const afterMarking = flat.slice(markingLabel.index + markingLabel[0].length);
    const markingStop = afterMarking.search(/\bTOTAL\b/i);
    const markings = extractOcrContractMarkings(markingStop >= 0 ? afterMarking.slice(0, markingStop) : afterMarking, descriptions.length);
    const count = Math.min(descriptions.length, markings.length, quantities.length, prices.length);
    if (count < 2) return [];

    const unit = sourceUnits(flat).quantity || "KG";
    return Array.from({ length: count }, (_, index) => normalizeItem(
      markings[index], descriptions[index], quantities[index], unit, prices[index], unit, 0,
      { style: "US", sourceLineNo: index + 1 }
    )).filter(item => item.marking && item.weight > 0 && item.price > 0);
  }

  function parseGenericRows(lines, text) {
    const style = numberStyle(text);
    const units = sourceUnits(text);
    const priceFirst = lines.some(line => {
      const p = line.search(/PRICE/i), q = line.search(/Q.?TY|QUANTITY|NET\s+WEIGHT/i);
      return p >= 0 && q >= 0 && p < q;
    });
    const rows = [];
    for (const line of lines) {
      if (!line || TOTAL_RE.test(line) || /MARKING|DESCRIPTION\s+OF\s+GOODS|ITEM\s+NAME|Q.?TY|QUANTITY|UNIT\s+PRICE/i.test(line)) continue;
      const tokens = numericTokens(line, style);
      if (tokens.length < 3) continue;
      const triple = tokens.slice(-3);
      let quantityToken = priceFirst ? triple[1] : triple[0];
      let priceToken = priceFirst ? triple[0] : triple[1];
      const amountToken = triple[2];
      const quantity = quantityToken.value, price = priceToken.value, amount = amountToken.value;
      if (!quantity || !price || !amount || quantity > 1e8) continue;
      if (Math.abs(quantity * price - amount) > Math.max(5, amount * 0.08)) continue;
      const prefix = line.slice(0, Math.min(quantityToken.index, priceToken.index));
      const parts = descriptionParts(prefix);
      if ((!/[A-Za-z가-힣]/.test(parts.marking) && !/^\d{3,4}$/.test(parts.marking)) || parts.marking.length < 2) continue;

      rows.push(normalizeItem(parts.marking, parts.description, quantity, units.quantity, price, units.price, amount, { style }));
    }
    return rows;
  }

  function parsePackingListRows(lines, text) {
    if (!lines.some(line => /PACKING\s+LIST/i.test(line))
      || !lines.some(line => /N\.?\s*W(?:T|EIGHT)?/i.test(line))
      || !lines.some(line => /G\.?\s*W(?:T|EIGHT)?/i.test(line))) return [];
    const style = numberStyle(text), rows = [];
    const isBoundary = line => /^(?:TOTAL|BANK\s+INFORMATION|BENEFICIARY|SWIFT\s+CODE|ACCOUNT\s+NO)/i.test(clean(line));
    const isMarking = line => /\bMARKING\s*:/i.test(line);
    const descriptionBefore = index => {
      for (let cursor = index - 1; cursor >= Math.max(0, index - 4); cursor--) {
        const value = clean(lines[cursor]);
        if (!value || /DESCRIPTION\s+OF\s+GOODS|QTY|PACKAGES|N\.?\s*WT|G\.?\s*WT|CONTAINER/i.test(value)) continue;
        if (/^[A-Z][A-Z\s/-]{3,}\s+SCRAP$/i.test(value)) return value;
      }
      return "";
    };
    const tailValues = joined => {
      const tokens = numericTokens(joined, style);
      for (const count of [4, 3]) {
        if (tokens.length < count) continue;
        const tail = tokens.slice(-count), values = tail.map(token => token.value);
        const packages = values[0], net = values[1], gross = values[2], cbm = count === 4 ? values[3] : 0;
        if (!Number.isInteger(packages) || packages < 1 || packages > 10000) continue;
        if (net <= 0 || gross <= 0 || gross < net || gross > net * 1.5) continue;
        if (cbm < 0 || cbm > 100000) continue;
        return { packages, net, gross, cbm, firstIndex: tail[0].index };
      }
      return null;
    };
    for (let index = 0; index < lines.length; index++) {
      if (!isMarking(lines[index])) continue;
      const description = descriptionBefore(index);
      let joined = clean(lines[index]), matched = tailValues(joined), end = index;
      for (let width = 1; !matched && width <= 6 && index + width < lines.length; width++) {
        const next = clean(lines[index + width]);
        if (!next || isBoundary(next) || (width > 1 && isMarking(next))) break;
        joined = clean(joined + " " + next);
        matched = tailValues(joined);
        end = index + width;
      }
      if (!matched) continue;
      const markingPart = clean(joined.slice(0, matched.firstIndex))
        .replace(/^.*?\bMARKING\s*:\s*/i, "")
        .replace(/\s+CONTAINER\s+NO\.?\s*:.*$/i, "");
      if (!markingPart || !/[A-Za-z\uAC00-\uD7A3]/.test(markingPart)) continue;
      let packageNo = "";
      const containerSource = lines.slice(index, Math.min(lines.length, end + 4)).join(" ");
      const containerMatch = containerSource.match(/CONTAINER\s+NO\.?\s*:\s*([A-Z0-9-]{5,})/i);
      if (containerMatch) packageNo = clean(containerMatch[1]);
      rows.push(normalizeItem(markingPart, description, matched.net, "KG", 0, "KG", 0, {
        style, gross: matched.gross, packageCount: matched.packages, packageNo,
        memo: matched.cbm ? `CBM ${round2(matched.cbm)}` : ""
      }));
      index = Math.max(index, end);
    }
    return rows;
  }

  /*
   * ARROUQ/CARR-style table:
   * S.N. | DESCRIPTION | GROSS WEIGHT/TON | JUMBO WEIGHT K.G. | NET WEIGHT TON
   * The middle value is tare in kilograms while gross/net are metric tons.
   */
  function parseTonJumboPackingRows(lines, text) {
    const header = lines.slice(0, 90).join(" ");
    if (!/PACKING\s+LIST/i.test(header)
      || !/GROSS\s+WEIGHT\s*\/?\s*TON/i.test(header)
      || !/JUMBO\s+WEIGHT/i.test(header)
      || !/NET\s+WEIGHT\s*\/?\s*TON/i.test(header)) return [];

    const rows = [];
    const normalized = value => clean(value)
      .replace(/[|]/g, " ")
      .replace(/(\d)\s*[.,]\s*(\d{3})\b/g, "$1.$2")
      .replace(/\s+/g, " ");
    const rowPattern = /^\s*(\d{1,2})[.)-]?\s+(.+?)\s+(\d{1,3}[.,]\d{3})\s+(\d{1,3})\s+(\d{1,3}[.,]\d{3})\s*$/i;

    for (let index = 0; index < lines.length; index++) {
      if (/^\s*(?:TOTAL|BANK|BENEFICIARY|ACCOUNT|SWIFT)\b/i.test(lines[index])) continue;
      let joined = "";
      for (let width = 1; width <= 3 && index + width <= lines.length; width++) {
        joined = normalized(joined + " " + lines[index + width - 1]);
        const match = joined.match(rowPattern);
        if (!match) continue;
        const lineNo = Number(match[1]), grade = clean(match[2]);
        const grossTon = numberValue(match[3], "US"), tareKg = numberValue(match[4], "US"), netTon = numberValue(match[5], "US");
        const expectedTare = round2((grossTon - netTon) * 1000);
        if (!grade || !/[A-Z0-9]/i.test(grade) || !(grossTon > 0 && netTon > 0 && grossTon >= netTon)) continue;
        if (Math.abs(expectedTare - tareKg) > Math.max(5, grossTon * 2)) continue;
        rows.push(normalizeItem(grade, "", netTon, "TON", 0, "TON", 0, {
          style: "US", gross: grossTon, tare: tareKg / 1000,
          packageNo: `CARR-${String(lineNo).padStart(2, "0")}`,
          packageCount: 1, sourceGradeLocked: true, sourceLineNo: lineNo,
          memo: `Jumbo/Tare ${round2(tareKg)} kg`
        }));
        index += width - 1;
        break;
      }
    }
    return rows;
  }

  /* Reconstruct MATERIAL values that are vertically merged across package rows. */
  function parseMergedMaterialPackingRows(lines, text) {
    const header = lines.findIndex(line => /PACKING\s*#/i.test(line)
      && /MATERIAL/i.test(line) && /GROSS/i.test(line) && /TARE/i.test(line) && /NET/i.test(line));
    if (header < 0 || !lines.slice(header + 1).some(line => /SUB\s*TOTAL\s+IN\s+KGS?/i.test(line))) return [];

    const style = numberStyle(text);
    const normalizedLine = value => clean(value)
      .replace(/(\d)\s+([,.])\s*(\d)/g, "$1$2$3")
      .replace(/(\d)\s+([,.])\s*(\d)/g, "$1$2$3");
    const rowData = value => {
      const line = normalizedLine(value);
      const lnMatch = line.match(/^\s*(\d{1,3})\b/) …6906 tokens truncated…es: true });
      const candidates = workbook.SheetNames.map(sheetName => parseMatrix(root.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false }), name));
      parsed = candidates.sort((a, b) => b.items.length - a.items.length)[0];
      parsed.diagnostics.sheets = workbook.SheetNames.length;
    } else if (/\.pdf$/.test(lower)) {
      const extracted = await pdfText(file, requestId);
      parsed = parseText(extracted.text, name);
      parsed.diagnostics.ocrPages = extracted.ocrPages;
      parsed.diagnostics.pageCount = extracted.pageCount;
    } else if (/\.(?:png|jpe?g|webp|bmp|heic)$/i.test(lower) || /^image\//.test(file.type || "")) {
      const extracted = await imageText(file, requestId);
      parsed = parseText(extracted.text, name);
      parsed.diagnostics.ocrPages = extracted.ocrPages;
      parsed.diagnostics.pageCount = extracted.pageCount;
    } else {
      parsed = parseText(await file.text(), name);

    }
    if (requestId !== importRequest) throw Error("새 파일을 선택하여 이전 분석을 중단했습니다.");
    if (!parsed.items.length) throw Error("강종·중량 행을 찾지 못했습니다. 표 전체가 보이는 원본 PDF·Excel 또는 선명한 사진을 선택하세요.");
    return mapItems(parsed);
  }

  core.importFile = importFile;

  function escHtml(value) {
    if (typeof esc === "function") return esc(value);
    return String(value == null ? "" : value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }

  function inferType(description, marking) {
    const text = `${description || ""} ${marking || ""}`.toUpperCase();
    if (/STAINLESS|SUS|STS/.test(text)) return "STS";
    if (/TITANIUM|\bTI\b/.test(text)) return "TI";
    if (/COBALT|\bCO\b|STEL(?:L)?ITE/.test(text)) return "CO";
    if (/COPPER|\bCU\b/.test(text)) return "CU";
    if (/MOLY|\bMO\b/.test(text)) return "MO";
    if (/NICKEL|INCONEL|INCOLOY|HAST|MONEL|NIMONIC|\bNI\b/.test(text)) return "NI";
    return "OTHER";
  }

  function poItemHtml(item, index) {
    item = item || {};
    const marking = item.marking || item.matchedMarking || "", description = item.description || item.matchedDescription || "";
    const qty = item.quantity || item.weight || "", unit = item.unit || "KG", price = item.sourcePrice || (item.price && round2(item.price * (WEIGHT_FACTORS[item.priceUnit || unit] || 1))) || "";
    return `<article class="mes-po-item registration-line">
      <div class="line-editor-head"><b>품목 ${index + 1}</b><button type="button" class="btn danger" onclick="mesPoRemoveItem(this)">행 삭제</button></div>
      <div class="mes-po-item-grid">
        <label>MARKING · 거래처강종<input name="sourceGrade" required value="${escHtml(marking)}"></label>
        <label>DESCRIPTION<input name="description" value="${escHtml(description)}"></label>
        <label>Q'TY<input name="quantity" type="number" min="0" step="0.001" required value="${escHtml(qty)}" oninput="mesPoItemRecalc(this)"></label>
        <label>중량단위<select name="unit" onchange="mesPoItemRecalc(this)">${["KG", "LB", "TON"].map(value => `<option ${unit === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
        <label>PRICE<input name="sourcePrice" type="number" min="0" step="0.0001" value="${escHtml(price)}" oninput="mesPoItemRecalc(this)"></label>
        <label>단가단위<select name="priceUnit" onchange="mesPoItemRecalc(this)">${["KG", "LB", "TON"].map(value => `<option value="${value}" ${String(item.priceUnit || unit) === value ? "selected" : ""}>USD/${value}</option>`).join("")}</select></label>
        <label>TOTAL VALUE (USD)<input name="amount" type="number" min="0" step="0.01" value="${escHtml(item.amount || "")}" oninput="mesPoAmountChanged(this)"></label>
        <label>패키지 수<input name="packageCount" type="number" min="1" step="1" value="${escHtml(item.packageCount || 1)}"></label>
        <details class="mes-system-fields"><summary>우리 시스템 강종 분류 · 수정 가능</summary><div class="mes-po-item-grid">
          <label>품종<input name="productType" value="${escHtml(item.productType || inferType(description, marking))}"></label>
          <label>강종<input name="mainGrade" value="${escHtml(item.matchedMarking || marking)}"></label>
          <label>소강종<input name="subGrade" value="${escHtml(item.subGrade || "")}"></label>
          <label>상세강종<input name="detailGrade" value="${escHtml(item.detailGrade || description)}"></label>
        </div></details>
      </div>
    </article>`;
  }

  function poDocumentDefaults(documentData) {
    const source = documentData || {};
    return {
      poNo: source.poNo || "", company: source.company || "", contractDate: source.contractDate || "", address: source.address || "", tel: source.tel || "", fax: source.fax || "", email: source.email || "", soNo: source.soNo || "", a10No: source.a10No || "", shipment: source.shipment || "", loadingTerm: source.loadingTerm || "", paymentTerm: source.paymentTerm || "", packing: source.packing || "", note: source.note || "", sourceFile: source.sourceFile || "직접입력", items: source.items && source.items.length ? source.items : [{}]
    };
  }

  function openDirectPo(documentData) {
    const source = poDocumentDefaults(documentData);
    byId("modalTitle").textContent = "P.O 직접입력 · 업로드 양식과 동일 항목";
    byId("modalBody").innerHTML = `<form id="mesPoV4Form" class="form-grid mes-po-form" onsubmit="saveMesPoV4(event,this)">
      <div class="wide mes-po-form-title"><b>PURCHASE CONTRACT</b><span>CASH COW METAL CO.,LTD · 입력 후 현장관리 공용서버 동시 반영</span></div>
      <label>P.O NO<input name="orderNo" required value="${escHtml(source.poNo)}"></label>
      <label>입고 구분<select name="kind"><option value="OVERSEAS">해외입고</option><option value="DOMESTIC">국내입고</option></select></label>
      <label>DATE · 계약일<input name="contractDate" value="${escHtml(source.contractDate)}" placeholder="예: 2026-08-13"></label>
      <label>입고예정일<input name="planDate" type="date" value="${/^\d{4}-\d{2}-\d{2}$/.test(source.loadingTerm) ? escHtml(source.loadingTerm) : ""}"></label>
      <label class="wide">Messrs · 거래처명<input name="partner" required value="${escHtml(source.company)}"></label>
      <label class="wide">Address<input name="address" value="${escHtml(source.address)}"></label>
      <label>Tel<input name="tel" value="${escHtml(source.tel)}"></label><label>Fax<input name="fax" value="${escHtml(source.fax)}"></label>
      <label>Email<input name="email" type="email" value="${escHtml(source.email)}"></label><label>S.O NO<input name="soNo" value="${escHtml(source.soNo)}"></label>
      <label>A10 NO<input name="a10No" value="${escHtml(source.a10No)}"></label><label>Loading Term<input name="loadingTerm" value="${escHtml(source.loadingTerm)}"></label>
      <label>Shipment<input name="shipment" value="${escHtml(source.shipment)}"></label><label>Packing<input name="packing" value="${escHtml(source.packing)}"></label>
      <label>통화<select name="currency"><option>USD</option><option>KRW</option></select></label><label>환율<input name="rate" type="number" step="0.01" value="1"></label>
      <label class="wide">Payment<textarea name="paymentTerm">${escHtml(source.paymentTerm)}</textarea></label>
      <label class="wide">Note<textarea name="note">${escHtml(source.note)}</textarea></label>
      <input type="hidden" name="sourceFile" value="${escHtml(source.sourceFile)}">
      <div class="wide mes-po-items"><div class="line-editor-head"><h3>품목 명세</h3><button type="button" class="btn" onclick="mesPoAddItem()">+ 품목 행 추가</button></div><div id="mesPoV4Items">${source.items.map(poItemHtml).join("")}</div></div>
      <div class="wide actions"><button class="btn primary">P.O 저장 · 구매계획 등록</button><button type="button" class="btn" onclick="openMesDocumentPoRegistration()">거래처 파일 다시 선택</button><button type="button" class="btn" onclick="closeModal()">취소</button></div>
    </form>`;
    byId("modal").classList.add("on");
    document.querySelector("#modal .modal-card")?.classList.add("wide-modal");
    setTimeout(() => byId("mesPoV4Form")?.querySelector("[name=orderNo]")?.focus(), 80);
  }

  root.openMesDirectPoRegistration = function () { openDirectPo(null); };
  root.mesPoAddItem = function () { const holder = byId("mesPoV4Items"); if (holder) holder.insertAdjacentHTML("beforeend", poItemHtml({}, holder.children.length)); };
  root.mesPoRemoveItem = function (button) { const item = button.closest(".mes-po-item"); if (item && byId("mesPoV4Items").children.length > 1) item.remove(); };
  root.mesPoItemRecalc = function (input) {
    const item = input.closest(".mes-po-item"), quantity = Number(item.querySelector("[name=quantity]").value) || 0, unit = item.querySelector("[name=unit]").value, price = Number(item.querySelector("[name=sourcePrice]").value) || 0, priceUnit = item.querySelector("[name=priceUnit]").value;
    const weight = quantity * (WEIGHT_FACTORS[unit] || 1), unitPrice = price / (WEIGHT_FACTORS[priceUnit] || 1), amount = round2(weight * unitPrice);
    if (amount > 0) item.querySelector("[name=amount]").value = amount;
  };
  root.mesPoAmountChanged = function (input) {
    const item = input.closest(".mes-po-item"), amount = Number(input.value) || 0, quantity = Number(item.querySelector("[name=quantity]").value) || 0;
    if (amount > 0 && quantity > 0) item.querySelector("[name=sourcePrice]").value = round2(amount / quantity);
  };

  function itemFormData(item) {
    return Object.fromEntries([...item.querySelectorAll("input[name],select[name],textarea[name]")].map(input => [input.name, input.value]));
  }


  root.saveMesPoV4 = async function (event, form) {
    event.preventDefault();
    const value = Object.fromEntries(new FormData(form).entries()), itemValues = [...form.querySelectorAll(".mes-po-item")].map(itemFormData).filter(item => item.sourceGrade && Number(item.quantity) > 0);
    if (!value.orderNo || !value.partner || !itemValues.length) return toast("P.O 번호·거래처·한 개 이상의 품목을 입력하세요.", true);
    const duplicate = safe(state.pos).some(item => item.poNo === value.orderNo && item.status !== "CANCELLED");
    if (duplicate && !confirm(`${value.orderNo} P.O가 이미 있습니다. 기존 P.O 품목을 취소하고 새 내용으로 바꿀까요?`)) return;
    const createdAt = new Date().toISOString(), nextPackage = mesNextPackage();
    const ok = await commit("MES P.O 문서 등록", ["pos"], shared => {
      if (duplicate) safe(shared.pos).filter(item => item.poNo === value.orderNo && item.status !== "CANCELLED").forEach(item => { item.status = "CANCELLED"; item.cancelledAt = createdAt; item.cancelledByName = currentUserName(); });
      itemValues.forEach(item => {
        const normalized = normalizeItem(item.sourceGrade, item.description, item.quantity, item.unit, item.sourcePrice, item.priceUnit, item.amount, { packageCount: item.packageCount });
        const count = normalized.packageCount;
        shared.pos.push({
          id: crypto.randomUUID(), poNo: value.orderNo, company: value.partner, packageNo: nextPackage(), grade: item.sourceGrade,
          description: item.description, productType: item.productType || inferType(item.description, item.sourceGrade), mainGrade: item.mainGrade || item.sourceGrade,
          subGrade: item.subGrade || "", detailGrade: item.detailGrade || item.description || "", weight: normalized.weight, netWeight: normalized.netWeight || normalized.weight, grossWeight: normalized.grossWeight,
          packageCount: count, plannedPackageCount: count,
          sourceQuantity: normalized.quantity, sourceUnit: normalized.unit, unitPrice: normalized.price, sourceUnitPrice: normalized.sourcePrice,
          priceUnit: normalized.priceUnit, purchaseAmount: normalized.amount, contractDate: value.contractDate, expectedArrivalDate: value.planDate,
          type: value.kind, currency: value.currency, exchangeRate: Number(value.rate) || 1, address: value.address, tel: value.tel, fax: value.fax, email: value.email,
          soNo: value.soNo, a10No: value.a10No, shipment: value.shipment, loadingTerm: value.loadingTerm, paymentTerm: value.paymentTerm,
          packing: value.packing, purchaseNote: value.note, sourceFile: value.sourceFile, purchaseStatus: "구매확정", status: "CONFIRMED",
          receiptStatus: "WAITING", inspectionStatus: "NOT_RECEIVED", createdAt, createdByName: currentUserName()
        });
      });
    });
    if (ok) { closeModal(); openView("purchase"); toast(`${value.orderNo} P.O 저장완료 · 구매계획과 현장관리 공용서버에 등록했습니다.`); }
  };

  root.__mesOpenDirectPo = openDirectPo;

  root.openMesDocumentPoRegistration = function () {
    byId("modalTitle").textContent = "거래처 P.O·INVOICE 파일로 등록";
    byId("modalBody").innerHTML = `<div class="mes-import-native">
      <div class="mes-import-steps"><b>1 파일선택</b><b>2 문자·표 분석</b><b>3 품목 확인</b><b>4 P.O 저장</b></div>
      <label class="document-upload mes-import-drop" for="mesPoDocumentFile"><b>PDF · Excel · 사진을 선택하세요</b><p>외부 프로그램을 열지 않고 이 화면에서 P.O 번호·거래처·MARKING·DESCRIPTION·중량·단가·TOTAL VALUE를 자동완성합니다.</p><input id="mesPoDocumentFile" type="file" accept=".pdf,.xlsx,.xls,.csv,.tsv,.txt,.png,.jpg,.jpeg,.webp" onchange="mesAnalyzePoDocument(this.files[0])"></label>
      <div id="mesPoImportStatus" class="mes-import-status">파일을 선택하면 새 문서로 초기화한 뒤 분석합니다.</div>
      <div class="actions"><button class="btn" onclick="openMesDirectPoRegistration()">빈 P.O 직접입력</button><button class="btn" onclick="closeModal()">취소</button></div>
    </div>`;
    byId("modal").classList.add("on");
    document.querySelector("#modal .modal-card")?.classList.add("wide-modal");
  };

  root.mesAnalyzePoDocument = async function (file) {
    if (!file) return;
    const statusBox = byId("mesPoImportStatus");
    if (statusBox) statusBox.textContent = `${file.name} · 분석 준비 중`;
    byId("progress")?.classList.add("on");
    try {
      const parsed = await importFile(file);
      if (statusBox) statusBox.textContent = `${parsed.items.length}개 품목 분석 완료`;
      openDirectPo(parsed);
      toast(`${file.name} · ${parsed.items.length}개 품목 자동완성 완료`);
    } catch (error) {
      if (statusBox) statusBox.textContent = `불러오기 실패: ${error.message}`;
      toast(`P.O 파일 불러오기 실패: ${error.message}`, true);
    } finally {
      byId("progress")?.classList.remove("on");
      if (typeof setSync === "function") setSync("공용 서버 연결됨");
    }
  };

  root.openPackingRequestUpload = function (poNo) {
    byId("modalTitle").textContent = `${poNo} · PACKING LIST 쉬운 불러오기`;
    byId("modalBody").innerHTML = `<div class="mes-import-native"><div class="mes-import-steps"><b>1 파일선택</b><b>2 패키지 분석</b><b>3 GW/NW 확인</b><b>4 입고요청 저장</b></div>
      <label class="document-upload mes-import-drop" for="mesPackingFile"><b>PACKING LIST PDF · Excel · 사진 선택</b><p>Package No.·강종·G/W·N/W·포장종류를 읽고, 없는 값은 P.O 품목과 연결해 수정 가능한 화면으로 전환합니다.</p><input id="mesPackingFile" type="file" accept=".pdf,.xlsx,.xls,.csv,.tsv,.txt,.png,.jpg,.jpeg,.webp" onchange="analyzePackingRequestFile(decodeURIComponent('${encodeURIComponent(poNo)}'),this.files[0])"></label>
      <div id="mesPackingImportStatus" class="mes-import-status">파일을 선택하거나 P.O 품목으로 바로 작성하세요.</div>
      <div class="actions"><button class="btn primary" onclick="openPackingRequestDirect(decodeURIComponent('${encodeURIComponent(poNo)}'))">P.O 품목으로 바로 작성</button><button class="btn" onclick="openInboundRequestBuilder(decodeURIComponent('${encodeURIComponent(poNo)}'))">이전</button></div></div>`;
    byId("modal").classList.add("on");
  };

  root.analyzePackingRequestFile = async function (poNo, file) {
    if (!file) return;
    const po = poRows().find(row => row.poNo === poNo);
    if (!po) return toast("입고요청 P.O를 찾지 못했습니다.", true);
    byId("progress")?.classList.add("on");
    const statusBox = byId("mesPackingImportStatus");
    try {
      const parsed = await importFile(file), sourceRows = safe(po.rows);
      const items = parsed.items.map((item, index) => {
        const matched = sourceRows.find(row => compact(row.grade) === compact(item.matchedMarking || item.marking)) || sourceRows.find(row => similarity(row.grade, item.marking) >= 0.68) || sourceRows[index] || {};
        return {
          packageNo: item.packageNo || `PL-${String(index + 1).padStart(3, "0")}`,
          grade: item.matchedMarking || item.marking || matched.grade || "",
          gw: round2(item.grossWeight || item.weight), nw: round2(item.netWeight || item.weight),
          packingType: item.packingType || parsed.packing || matched.packingType || "", memo: item.memo || "",
          productType: matched.productType || inferType(item.description, item.marking), mainGrade: matched.mainGrade || item.matchedMarking || item.marking,
          subGrade: matched.subGrade || "", detailGrade: matched.detailGrade || item.description || ""
        };
      });
      if (!items.length) throw Error("PACKING LIST 품목을 찾지 못했습니다.");
      if (statusBox) statusBox.textContent = `${items.length}개 패키지 자동완성 완료`;
      renderPackingRequestForm(po, items);
      toast(`${file.name} · ${items.length}개 패키지 불러오기 완료`);
    } catch (error) {
      if (statusBox) statusBox.textContent = `불러오기 실패: ${error.message}`;
      toast(`PACKING LIST 불러오기 실패: ${error.message}`, true);
    } finally {
      byId("progress")?.classList.remove("on");
      if (typeof setSync === "function") setSync("공용 서버 연결됨");
    }
  };


  function gradeSummary(value) {
    const full = clean(value);
    if (full.length <= 20) return escHtml(full || "-");
    return `<span title="${escHtml(full)}">${escHtml(full.slice(0, 20))}… 외</span>`;
  }

  const mesSchemas = root.schemas || (typeof schemas !== "undefined" ? schemas : null);
  const purchaseGradeColumn = mesSchemas && mesSchemas.purchase && mesSchemas.purchase.cols.find(column => column[0] === "대표강종" || column[0] === "거래처강종");
  if (purchaseGradeColumn) { purchaseGradeColumn[0] = "거래처강종"; purchaseGradeColumn[1] = row => gradeSummary(row.grade); }

  const baseRender = root.render;
  root.render = function () {
    const result = baseRender.apply(this, arguments);
    const viewName = root.currentView || (typeof currentView !== "undefined" ? currentView : "");
    document.querySelectorAll("#content .mes-register").forEach(button => {
      if (viewName === "purchase" || viewName === "dashboard") button.remove();
    });
    if (viewName === "dashboard") document.querySelectorAll("#content .dashboard-head .actions button").forEach(button => {
      if (/P\.O\s*등록|S\.O\s*등록/.test(button.textContent || "")) button.remove();
    });
    if (viewName === "purchase") document.querySelectorAll("#content .dashboard-head .actions button").forEach(button => {
      if (/^\+?\s*P\.O\s*등록$/.test(clean(button.textContent))) button.remove();
    });
    return result;
  };
  if (root.currentView || typeof currentView !== "undefined") root.render();
  document.documentElement.dataset.mesDocumentImportV4 = VERSION;
})(typeof window !== "undefined" ? window : globalThis);

