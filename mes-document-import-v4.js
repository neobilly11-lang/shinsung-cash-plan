(function (root) {
  "use strict";

  const VERSION = "20260813-8";
  const WEIGHT_FACTORS = { KG: 1, LB: 0.45359237, TON: 1000 };
  const DESC_RE = /(Nickel\s+Alloy\s+Scrap|Cobalt\s+Scrap|Stainless\s+Steel\s+Scrap|Titanium\s+Scrap|Copper\s+Scrap|Tungsten\s+Scrap|Molybden(?:um|ium)\s+Scrap|Ferro\s+Titanium\s+Scrap)/i;
  const TOTAL_RE = /^(?:T\s*O\s*T\s*A\s*L|TOTAL|SUBTOTAL|GRAND\s+TOTAL|?⑷퀎)\b/i;
  const HEADER_ALIASES = {
    marking: ["MARKING", "GRADE", "COMMODITY", "COMODOTY", "ITEM NAME", "MATERIAL", "ALLOY", "?덈챸", "媛뺤쥌", "?곸꽭媛뺤쥌"],
    description: ["DESCRIPTION", "ITEM DESCRIPTION", "DESCRIPTION OF GOODS", "PRODUCT DESCRIPTION", "SCRAP TYPE", "?ㅻ챸", "?덈ぉ?ㅻ챸"],
    quantity: ["QTY", "QTY KG", "QTY KGS", "QTY LB", "QTY LBS", "QUANTITY", "WEIGHT", "NET WEIGHT", "NET", "NW", "N/W", "以묐웾", "?뺤젙以묐웾"],
    gross: ["GROSS WEIGHT", "GROSS", "GW", "G/W"],
    tare: ["TARE WEIGHT", "TARE"],
    net: ["NET WEIGHT", "NET", "NW", "N/W"],
    price: ["UNIT PRICE", "PRICE", "USD PRICE", "USD/KG", "USD/LB", "USD/TON", "PRICE PER TON", "PRICE PER KG", "PRICE PER LB", "?④?"],
    amount: ["TOTAL VALUE", "TOTAL AMOUNT", "AMOUNT", "VALUE", "TOTAL USD", "?⑷퀎湲덉븸", "珥앷툑??],
    unit: ["UNIT", "UOM", "?⑥쐞"],
    packageNo: ["PACKAGE NO", "PACKAGE NUMBER", "PKG NO", "PACK NO", "?⑦궎吏踰덊샇", "?щ궡?낃퀬踰덊샇"],
    packageCount: ["PACKAGE COUNT", "PACKAGES", "PKGS", "?⑦궎吏 ??, "?섎웾"],
    packingType: ["PACKING TYPE", "PACKAGE TYPE", "PACKING", "?ъ옣醫낅쪟", "?ъ옣??]
  };

  const round2 = value => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  const clean = value => String(value == null ? "" : value).replace(/[|]+/g, " ").replace(/\s+/g, " ").trim();
  const headerKey = value => clean(value).toUpperCase().replace(/[^A-Z0-9媛-??/g, "");
  const compact = value => clean(value).toUpperCase().replace(/[^A-Z0-9媛-??/g, "");

  function numberStyle(text) {
    const source = String(text || "");
    if (/\d{1,3}(?:\.\d{3})+,\d{1,3}\b/.test(source)) return "EU";
    if (/PRICE\s+PER\s+(?:TON|KG|LB)/i.test(source) && /\b\d+\.\d{3},\d{3}\b/.test(source)) return "EU";
    return "US";
  }

  function numberValue(value, style) {
    let text = String(value == null ? "" : value).replace(/[$???s]/g, "").replace(/[^\d.,+-]/g, "");
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
    return [...String(line || "").matchAll(/[$????\s*[+-]?\d(?:[\d.,]*\d)?/g)].map(match => ({
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
      const match = line.match(/^(.*?)\s+[$???\s*([\d.,]+)\s+([\d.,]+)\s+[$???\s*([\d.,]+)(?:\s+\d+\s*%\s+[$???\s*[\d.,]+)?\s*$/i);
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
        const match = clean(joined).match(/^\s*(?:\d{1,3}\s+)?(.+?)\s+(?:\d{4,}\s+)?([\d,.]+)\s+([\d,.]+)\s+([\d,.]+)\s*(LB|LBS|KG|KGS)?\s+[$????\s*([\d,.]+)\s*(?:\/?\s*(?:LB|LBS|KG|KGS)|P|PP)?\s+[$????\s*([\d,.]+)\s*$/i);
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
    const rowRe = new RegExp(`^\\s*(\\d{1,3})\\s+(.+?)\\s+(${DESC_RE.source})\\s+([\\d,.]+)\\s+[$????\\s*([\\d,.]+)\\s+[$????\\s*([\\d,.]+)\\s*$`, "i");
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
      if (!/[A-Za-z媛-??/.test(parts.marking) || parts.marking.length < 2) continue;

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
      const lnMatch = line.match(/^\s*(\d{1,3})\b/) || line.match(/\/\s*(\d{1,3})\b/) || line.match(/\bNO\.[A-Z0-9.-]+\s+(\d{1,3})\b/i);
      if (!lnMatch) return null;
      const ln = Number(lnMatch[1]);
      if (!ln || ln > 999) return null;
      const tokens = numericTokens(line, style);
      if (tokens.length < 3) return null;
      let gross = 0, tare = 0, net = 0;
      if (tokens.length >= 4) {
        [gross, tare, net] = tokens.slice(-3).map(token => token.value);
        if (!(gross > 0 && net > 0 && gross >= net && tare >= 0 && Math.abs((gross - tare) - net) <= Math.max(5, gross * 0.015))) return null;
      } else {
        gross = tokens[tokens.length - 2].value;
        net = tokens[tokens.length - 1].value;
        tare = round2(gross - net);
        if (!(gross > 0 && net > 0 && gross >= net && tare <= Math.max(100, gross * 0.15))) return null;
      }
      const firstWeight = tokens[tokens.length >= 4 ? tokens.length - 3 : tokens.length - 2];
      const prefix = clean(line.slice(0, firstWeight.index));
      const prefixNumbers = [...prefix.matchAll(/\b(\d{1,6})\b/g)].map(match => match[1]);
      return { ln, gross: round2(gross), tare: round2(tare), net: round2(net), packageNo: prefixNumbers.length > 1 ? prefixNumbers[prefixNumbers.length - 1] : "", sourceIndex: -1 };
    };
    const materialFragment = value => {
      const line = normalizedLine(value);
      if (!/[A-Za-z]/.test(line) || /SUB\s*TOTAL|TOTAL\s+IN\s+KGS?|PALLET\s+WEIGHT/i.test(line)) return "";
      if (/\b(?:SEAL|CONTAINER)\b/i.test(line) || /^\s*NO\.[A-Z0-9.-]+/i.test(line) || /^[A-Z]{4}\d{6,}/i.test(line)) return "";
      const data = rowData(line);
      let prefix = line;
      if (data) {
        const tokens = numericTokens(line, style);
        const firstWeight = tokens[tokens.length >= 4 ? tokens.length - 3 : tokens.length - 2];
        prefix = clean(line.slice(0, firstWeight.index));
      }
      prefix = prefix.replace(/^\s*\d{1,3}\b\s*/, "").replace(/^\s*\d{1,6}\b\s*/, "");
      if (!/[A-Za-z]/.test(prefix) || /^(?:SEAL|NO\.)/i.test(prefix)) return "";
      return prefix;
    };
    const packageNoFor = (block, dataRows, row, position) => {
      if (row.packageNo) return row.packageNo;
      const previousIndex = position ? dataRows[position - 1].sourceIndex : -1;
      const nextIndex = position + 1 < dataRows.length ? dataRows[position + 1].sourceIndex : block.length;
      const before = block.slice(previousIndex + 1, row.sourceIndex).map(normalizedLine).filter(value => /^\d{1,6}$/.test(value));
      const after = block.slice(row.sourceIndex + 1, nextIndex).map(normalizedLine).filter(value => /^\d{1,6}$/.test(value));
      const values = [];
      if (before.length) values.push(before[before.length - 1]);
      if (after.length) values.push(after[0]);
      return [...new Set(values)].join("/") || `LN-${String(row.ln).padStart(2, "0")}`;
    };

    const rows = [];
    let start = header + 1;
    for (let cursor = start; cursor < lines.length; cursor++) {
      const boundary = /SUB\s*TOTAL\s+IN\s+KGS?/i.test(lines[cursor]);
      const finalBoundary = /^(?:PALLET\s+WEIGHT|TOTAL\s+IN\s+KGS?)/i.test(clean(lines[cursor]));
      if (!boundary && !finalBoundary) continue;
      const block = lines.slice(start, cursor);
      const dataRows = block.map((line, index) => { const row = rowData(line); if (row) row.sourceIndex = index; return row; }).filter(Boolean);
      const sourceGrade = clean(block.map(materialFragment).filter(Boolean).join(" "));
      if (sourceGrade && dataRows.length) dataRows.forEach((row, position) => {
        rows.push(normalizeItem(sourceGrade, "", row.net, "KG", 0, "KG", 0, {
          style, gross: row.gross, tare: row.tare, packageNo: packageNoFor(block, dataRows, row, position),
          packageCount: 1, sourceGradeLocked: true, sourceLineNo: row.ln
        }));
      });
      start = cursor + 1;
      if (finalBoundary) break;
    }
    return rows;
  }

  function dedupeItems(groups) {
    const out = [], seen = new Set();
    groups.flat().forEach(item => {
      if (!item || !item.marking || item.weight <= 0) return;
      const key = `${compact(item.marking)}|${round2(item.weight)}|${round2(item.amount)}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    });
    return out;
  }

  function fieldFromLines(lines, patterns) {
    for (const line of lines) for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match && clean(match[1])) return clean(match[1]);
    }
    return "";
  }

  function metadata(lines, fileName) {
    const all = lines.join("\n");
    const supplierLine = lines.find(line => /^(?:MESSRS|SUPPLIER|VENDOR|SELLER|FROM)\b/i.test(line));
    let company = supplierLine ? clean(supplierLine.replace(/^(?:MESSRS|SUPPLIER|VENDOR|SELLER|FROM)\s*[:#-]?\s*/i, "").split(/\b(?:DATE|P\.?O\.?\s*NO|S\.?O\.?\s*NO)\b/i)[0]) : "";
    if (!company) {
      company = lines.slice(0, 16).filter(line => !/CASH\s+COW\s+METAL|SHIN\s+SUNG\s+METAL|PURCHASE|INVOICE|ADDRESS|CONTACT|CUSTOMER/i.test(line))
        .filter(line => /\b(?:LTD|LIMITED|INC|LLC|BV|B\.V|COMPANY|CORP|METALS?|MATERIAL|RECYCLING|TRADING|ALLOYS?|INDONESIA)\b/i.test(line))
        .sort((a, b) => b.length - a.length)[0] || "";
    }
    const fileCode = (String(fileName || "").toUpperCase().match(/[A-Z]{2,}[A-Z0-9-]*\d{6}[A-Z0-9-]*/g) || [""])[0];
    const detectedPoNo = fieldFromLines(lines, [
      /(?:\bP\.?O\.?\b|\bPURCHASE\s+ORDER\b)\s*(?:NO\.?|NUMBER|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9./_-]{3,})/i,
      /BUYER\s+REF\s+NO\.?\s*[:#-]?\s*([A-Z0-9][A-Z0-9./_-]{3,})/i,
      /ORDER\s+NUMBER\s*[:#-]?\s*([A-Z0-9][A-Z0-9./_-]{3,})/i
    ]);
    const poNo = /\d{6}/.test(fileCode) ? fileCode : detectedPoNo || fileCode;
    const date = fieldFromLines(lines, [/(?:^|\b)DATE\s*[:#-]?\s*([0-9]{1,4}[-/.][A-Za-z0-9]{1,9}[-/.][0-9]{1,4})/i, /INVOICE\s+DATE\s*[:#-]?\s*([^\s]{6,20})/i]);
    const address = fieldFromLines(li…3941 tokens truncated…pdf$/.test(lower)) {
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
    if (requestId !== importRequest) throw Error("???뚯씪???좏깮?섏뿬 ?댁쟾 遺꾩꽍??以묐떒?덉뒿?덈떎.");
    if (!parsed.items.length) throw Error("媛뺤쥌쨌以묐웾 ?됱쓣 李얠? 紐삵뻽?듬땲?? ???꾩껜媛 蹂댁씠???먮낯 PDF쨌Excel ?먮뒗 ?좊챸???ъ쭊???좏깮?섏꽭??");
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
      <div class="line-editor-head"><b>?덈ぉ ${index + 1}</b><button type="button" class="btn danger" onclick="mesPoRemoveItem(this)">????젣</button></div>
      <div class="mes-po-item-grid">
        <label>MARKING 쨌 嫄곕옒泥섍컯醫?input name="sourceGrade" required value="${escHtml(marking)}"></label>
        <label>DESCRIPTION<input name="description" value="${escHtml(description)}"></label>
        <label>Q'TY<input name="quantity" type="number" min="0" step="0.001" required value="${escHtml(qty)}" oninput="mesPoItemRecalc(this)"></label>
        <label>以묐웾?⑥쐞<select name="unit" onchange="mesPoItemRecalc(this)">${["KG", "LB", "TON"].map(value => `<option ${unit === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
        <label>PRICE<input name="sourcePrice" type="number" min="0" step="0.0001" value="${escHtml(price)}" oninput="mesPoItemRecalc(this)"></label>
        <label>?④??⑥쐞<select name="priceUnit" onchange="mesPoItemRecalc(this)">${["KG", "LB", "TON"].map(value => `<option value="${value}" ${String(item.priceUnit || unit) === value ? "selected" : ""}>USD/${value}</option>`).join("")}</select></label>
        <label>TOTAL VALUE (USD)<input name="amount" type="number" min="0" step="0.01" value="${escHtml(item.amount || "")}" oninput="mesPoAmountChanged(this)"></label>
        <label>?⑦궎吏 ??input name="packageCount" type="number" min="1" step="1" value="${escHtml(item.packageCount || 1)}"></label>
        <details class="mes-system-fields"><summary>?곕━ ?쒖뒪??媛뺤쥌 遺꾨쪟 쨌 ?섏젙 媛??/summary><div class="mes-po-item-grid">
          <label>?덉쥌<input name="productType" value="${escHtml(item.productType || inferType(description, marking))}"></label>
          <label>媛뺤쥌<input name="mainGrade" value="${escHtml(item.matchedMarking || marking)}"></label>
          <label>?뚭컯醫?input name="subGrade" value="${escHtml(item.subGrade || "")}"></label>
          <label>?곸꽭媛뺤쥌<input name="detailGrade" value="${escHtml(item.detailGrade || description)}"></label>
        </div></details>
      </div>
    </article>`;
  }

  function poDocumentDefaults(documentData) {
    const source = documentData || {};
    return {
      poNo: source.poNo || "", company: source.company || "", contractDate: source.contractDate || "", address: source.address || "", tel: source.tel || "", fax: source.fax || "", email: source.email || "", soNo: source.soNo || "", a10No: source.a10No || "", shipment: source.shipment || "", loadingTerm: source.loadingTerm || "", paymentTerm: source.paymentTerm || "", packing: source.packing || "", note: source.note || "", sourceFile: source.sourceFile || "吏곸젒?낅젰", items: source.items && source.items.length ? source.items : [{}]
    };
  }

  function openDirectPo(documentData) {
    const source = poDocumentDefaults(documentData);
    byId("modalTitle").textContent = "P.O 吏곸젒?낅젰 쨌 ?낅줈???묒떇怨??숈씪 ??ぉ";
    byId("modalBody").innerHTML = `<form id="mesPoV4Form" class="form-grid mes-po-form" onsubmit="saveMesPoV4(event,this)">
      <div class="wide mes-po-form-title"><b>PURCHASE CONTRACT</b><span>CASH COW METAL CO.,LTD 쨌 ?낅젰 ???꾩옣愿由?怨듭슜?쒕쾭 ?숈떆 諛섏쁺</span></div>
      <label>P.O NO<input name="orderNo" required value="${escHtml(source.poNo)}"></label>
      <label>?낃퀬 援щ텇<select name="kind"><option value="OVERSEAS">?댁쇅?낃퀬</option><option value="DOMESTIC">援?궡?낃퀬</option></select></label>
      <label>DATE 쨌 怨꾩빟??input name="contractDate" value="${escHtml(source.contractDate)}" placeholder="?? 2026-08-13"></label>
      <label>?낃퀬?덉젙??input name="planDate" type="date" value="${/^\d{4}-\d{2}-\d{2}$/.test(source.loadingTerm) ? escHtml(source.loadingTerm) : ""}"></label>
      <label class="wide">Messrs 쨌 嫄곕옒泥섎챸<input name="partner" required value="${escHtml(source.company)}"></label>
      <label class="wide">Address<input name="address" value="${escHtml(source.address)}"></label>
      <label>Tel<input name="tel" value="${escHtml(source.tel)}"></label><label>Fax<input name="fax" value="${escHtml(source.fax)}"></label>
      <label>Email<input name="email" type="email" value="${escHtml(source.email)}"></label><label>S.O NO<input name="soNo" value="${escHtml(source.soNo)}"></label>
      <label>A10 NO<input name="a10No" value="${escHtml(source.a10No)}"></label><label>Loading Term<input name="loadingTerm" value="${escHtml(source.loadingTerm)}"></label>
      <label>Shipment<input name="shipment" value="${escHtml(source.shipment)}"></label><label>Packing<input name="packing" value="${escHtml(source.packing)}"></label>
      <label>?듯솕<select name="currency"><option>USD</option><option>KRW</option></select></label><label>?섏쑉<input name="rate" type="number" step="0.01" value="1"></label>
      <label class="wide">Payment<textarea name="paymentTerm">${escHtml(source.paymentTerm)}</textarea></label>
      <label class="wide">Note<textarea name="note">${escHtml(source.note)}</textarea></label>
      <input type="hidden" name="sourceFile" value="${escHtml(source.sourceFile)}">
      <div class="wide mes-po-items"><div class="line-editor-head"><h3>?덈ぉ 紐낆꽭</h3><button type="button" class="btn" onclick="mesPoAddItem()">+ ?덈ぉ ??異붽?</button></div><div id="mesPoV4Items">${source.items.map(poItemHtml).join("")}</div></div>
      <div class="wide actions"><button class="btn primary">P.O ???쨌 援щℓ怨꾪쉷 ?깅줉</button><button type="button" class="btn" onclick="openMesDocumentPoRegistration()">嫄곕옒泥??뚯씪 ?ㅼ떆 ?좏깮</button><button type="button" class="btn" onclick="closeModal()">痍⑥냼</button></div>
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
    if (!value.orderNo || !value.partner || !itemValues.length) return toast("P.O 踰덊샇쨌嫄곕옒泥샕룻븳 媛??댁긽???덈ぉ???낅젰?섏꽭??", true);
    const duplicate = safe(state.pos).some(item => item.poNo === value.orderNo && item.status !== "CANCELLED");
    if (duplicate && !confirm(`${value.orderNo} P.O媛 ?대? ?덉뒿?덈떎. 湲곗〈 P.O ?덈ぉ??痍⑥냼?섍퀬 ???댁슜?쇰줈 諛붽?源뚯슂?`)) return;
    const createdAt = new Date().toISOString(), nextPackage = mesNextPackage();
    const ok = await commit("MES P.O 臾몄꽌 ?깅줉", ["pos"], shared => {
      if (duplicate) safe(shared.pos).filter(item => item.poNo === value.orderNo && item.status !== "CANCELLED").forEach(item => { item.status = "CANCELLED"; item.cancelledAt = createdAt; item.cancelledByName = currentUserName(); });
      itemValues.forEach(item => {
        const normalized = normalizeItem(item.sourceGrade, item.description, item.quantity, item.unit, item.sourcePrice, item.priceUnit, item.amount, { packageCount: item.packageCount });
        const count = normalized.packageCount, eachNet = round2(normalized.weight / count), eachGross = round2(normalized.grossWeight / count);
        for (let index = 0; index < count; index++) shared.pos.push({
          id: crypto.randomUUID(), poNo: value.orderNo, company: value.partner, packageNo: nextPackage(), grade: item.sourceGrade,
          description: item.description, productType: item.productType || inferType(item.description, item.sourceGrade), mainGrade: item.mainGrade || item.sourceGrade,
          subGrade: item.subGrade || "", detailGrade: item.detailGrade || item.description || "", weight: eachNet, netWeight: eachNet, grossWeight: eachGross,
          sourceQuantity: normalized.quantity, sourceUnit: normalized.unit, unitPrice: normalized.price, sourceUnitPrice: normalized.sourcePrice,
          priceUnit: normalized.priceUnit, purchaseAmount: round2(normalized.amount / count), contractDate: value.contractDate, expectedArrivalDate: value.planDate,
          type: value.kind, currency: value.currency, exchangeRate: Number(value.rate) || 1, address: value.address, tel: value.tel, fax: value.fax, email: value.email,
          soNo: value.soNo, a10No: value.a10No, shipment: value.shipment, loadingTerm: value.loadingTerm, paymentTerm: value.paymentTerm,
          packing: value.packing, purchaseNote: value.note, sourceFile: value.sourceFile, purchaseStatus: "援щℓ?뺤젙", status: "CONFIRMED",
          receiptStatus: "WAITING", inspectionStatus: "NOT_RECEIVED", createdAt, createdByName: currentUserName()
        });
      });
    });
    if (ok) { closeModal(); openView("purchase"); toast(`${value.orderNo} P.O ??μ셿猷?쨌 援щℓ怨꾪쉷怨??꾩옣愿由?怨듭슜?쒕쾭???깅줉?덉뒿?덈떎.`); }
  };

  root.__mesOpenDirectPo = openDirectPo;

  root.openMesDocumentPoRegistration = function () {
    byId("modalTitle").textContent = "嫄곕옒泥?P.O쨌INVOICE ?뚯씪濡??깅줉";
    byId("modalBody").innerHTML = `<div class="mes-import-native">
      <div class="mes-import-steps"><b>1 ?뚯씪?좏깮</b><b>2 臾몄옄쨌??遺꾩꽍</b><b>3 ?덈ぉ ?뺤씤</b><b>4 P.O ???/b></div>
      <label class="document-upload mes-import-drop" for="mesPoDocumentFile"><b>PDF 쨌 Excel 쨌 ?ъ쭊???좏깮?섏꽭??/b><p>?몃? ?꾨줈洹몃옩???댁? ?딄퀬 ???붾㈃?먯꽌 P.O 踰덊샇쨌嫄곕옒泥샕텺ARKING쨌DESCRIPTION쨌以묐웾쨌?④?쨌TOTAL VALUE瑜??먮룞?꾩꽦?⑸땲??</p><input id="mesPoDocumentFile" type="file" accept=".pdf,.xlsx,.xls,.csv,.tsv,.txt,.png,.jpg,.jpeg,.webp" onchange="mesAnalyzePoDocument(this.files[0])"></label>
      <div id="mesPoImportStatus" class="mes-import-status">?뚯씪???좏깮?섎㈃ ??臾몄꽌濡?珥덇린?뷀븳 ??遺꾩꽍?⑸땲??</div>
      <div class="actions"><button class="btn" onclick="openMesDirectPoRegistration()">鍮?P.O 吏곸젒?낅젰</button><button class="btn" onclick="closeModal()">痍⑥냼</button></div>
    </div>`;
    byId("modal").classList.add("on");
    document.querySelector("#modal .modal-card")?.classList.add("wide-modal");
  };

  root.mesAnalyzePoDocument = async function (file) {
    if (!file) return;
    const statusBox = byId("mesPoImportStatus");
    if (statusBox) statusBox.textContent = `${file.name} 쨌 遺꾩꽍 以鍮?以?;
    byId("progress")?.classList.add("on");
    try {
      const parsed = await importFile(file);
      if (statusBox) statusBox.textContent = `${parsed.items.length}媛??덈ぉ 遺꾩꽍 ?꾨즺`;
      openDirectPo(parsed);
      toast(`${file.name} 쨌 ${parsed.items.length}媛??덈ぉ ?먮룞?꾩꽦 ?꾨즺`);
    } catch (error) {
      if (statusBox) statusBox.textContent = `遺덈윭?ㅺ린 ?ㅽ뙣: ${error.message}`;
      toast(`P.O ?뚯씪 遺덈윭?ㅺ린 ?ㅽ뙣: ${error.message}`, true);
    } finally {
      byId("progress")?.classList.remove("on");
      if (typeof setSync === "function") setSync("怨듭슜 ?쒕쾭 ?곌껐??);
    }
  };

  root.openPackingRequestUpload = function (poNo) {
    byId("modalTitle").textContent = `${poNo} 쨌 PACKING LIST ?ъ슫 遺덈윭?ㅺ린`;
    byId("modalBody").innerHTML = `<div class="mes-import-native"><div class="mes-import-steps"><b>1 ?뚯씪?좏깮</b><b>2 ?⑦궎吏 遺꾩꽍</b><b>3 GW/NW ?뺤씤</b><b>4 ?낃퀬?붿껌 ???/b></div>
      <label class="document-upload mes-import-drop" for="mesPackingFile"><b>PACKING LIST PDF 쨌 Excel 쨌 ?ъ쭊 ?좏깮</b><p>Package No.쨌媛뺤쥌쨌G/W쨌N/W쨌?ъ옣醫낅쪟瑜??쎄퀬, ?녿뒗 媛믪? P.O ?덈ぉ怨??곌껐???섏젙 媛?ν븳 ?붾㈃?쇰줈 ?꾪솚?⑸땲??</p><input id="mesPackingFile" type="file" accept=".pdf,.xlsx,.xls,.csv,.tsv,.txt,.png,.jpg,.jpeg,.webp" onchange="analyzePackingRequestFile(decodeURIComponent('${encodeURIComponent(poNo)}'),this.files[0])"></label>
      <div id="mesPackingImportStatus" class="mes-import-status">?뚯씪???좏깮?섍굅??P.O ?덈ぉ?쇰줈 諛붾줈 ?묒꽦?섏꽭??</div>
      <div class="actions"><button class="btn primary" onclick="openPackingRequestDirect(decodeURIComponent('${encodeURIComponent(poNo)}'))">P.O ?덈ぉ?쇰줈 諛붾줈 ?묒꽦</button><button class="btn" onclick="openInboundRequestBuilder(decodeURIComponent('${encodeURIComponent(poNo)}'))">?댁쟾</button></div></div>`;
    byId("modal").classList.add("on");
  };

  root.analyzePackingRequestFile = async function (poNo, file) {
    if (!file) return;
    const po = poRows().find(row => row.poNo === poNo);
    if (!po) return toast("?낃퀬?붿껌 P.O瑜?李얠? 紐삵뻽?듬땲??", true);
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
      if (!items.length) throw Error("PACKING LIST ?덈ぉ??李얠? 紐삵뻽?듬땲??");
      if (statusBox) statusBox.textContent = `${items.length}媛??⑦궎吏 ?먮룞?꾩꽦 ?꾨즺`;
      renderPackingRequestForm(po, items);
      toast(`${file.name} 쨌 ${items.length}媛??⑦궎吏 遺덈윭?ㅺ린 ?꾨즺`);
    } catch (error) {
      if (statusBox) statusBox.textContent = `遺덈윭?ㅺ린 ?ㅽ뙣: ${error.message}`;
      toast(`PACKING LIST 遺덈윭?ㅺ린 ?ㅽ뙣: ${error.message}`, true);
    } finally {
      byId("progress")?.classList.remove("on");
      if (typeof setSync === "function") setSync("怨듭슜 ?쒕쾭 ?곌껐??);
    }
  };


  function gradeSummary(value) {
    const full = clean(value);
    if (full.length <= 20) return escHtml(full || "-");
    return `<span title="${escHtml(full)}">${escHtml(full.slice(0, 20))}????/span>`;
  }

  const mesSchemas = root.schemas || (typeof schemas !== "undefined" ? schemas : null);
  const purchaseGradeColumn = mesSchemas && mesSchemas.purchase && mesSchemas.purchase.cols.find(column => column[0] === "??쒓컯醫? || column[0] === "嫄곕옒泥섍컯醫?);
  if (purchaseGradeColumn) { purchaseGradeColumn[0] = "嫄곕옒泥섍컯醫?; purchaseGradeColumn[1] = row => gradeSummary(row.grade); }

  const baseRender = root.render;
  root.render = function () {
    const result = baseRender.apply(this, arguments);
    const viewName = root.currentView || (typeof currentView !== "undefined" ? currentView : "");
    document.querySelectorAll("#content .mes-register").forEach(button => {
      if (viewName === "purchase" || viewName === "dashboard") button.remove();
    });
    if (viewName === "dashboard") document.querySelectorAll("#content .dashboard-head .actions button").forEach(button => {
      if (/P\.O\s*?깅줉|S\.O\s*?깅줉/.test(button.textContent || "")) button.remove();
    });
    if (viewName === "purchase") document.querySelectorAll("#content .dashboard-head .actions button").forEach(button => {
      if (/^\+?\s*P\.O\s*?깅줉$/.test(clean(button.textContent))) button.remove();
    });
    return result;
  };
  if (root.currentView || typeof currentView !== "undefined") root.render();
  document.documentElement.dataset.mesDocumentImportV4 = VERSION;
})(typeof window !== "undefined" ? window : globalThis);

