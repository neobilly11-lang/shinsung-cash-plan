(function (root) {
  "use strict";

  const VERSION = "20260823-18-amount-validation";
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
  const round4 = value => Math.round((Number(value || 0) + Number.EPSILON) * 10000) / 10000;
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
    const normalizedSourcePrice = round4(rawPrice / priceFactor);
    const calculatedAmount = round2(weight * normalizedSourcePrice);
    const amountTolerance = Math.max(0.05, Math.abs(calculatedAmount) * 0.005);
    const amountMismatch = rawAmount > 0 && calculatedAmount > 0 && Math.abs(rawAmount - calculatedAmount) > amountTolerance;
    const unitPrice = normalizedSourcePrice || round4(rawAmount > 0 && weight > 0 ? rawAmount / weight : 0);
    const total = round2(amountMismatch ? calculatedAmount : (rawAmount || weight * unitPrice));
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
      sourceAmount: round2(rawAmount),
      amountMismatch,
      amountExpected: calculatedAmount,
      priceUnit: unitCode(priceUnit, unitCode(quantityUnit)),
      amount: total,
      packageNo: clean(extra && extra.packageNo),
      packageCount: Math.max(1, Math.floor(Number(extra && extra.packageCount) || 1)),
      packingType: clean(extra && extra.packingType),
      memo: clean(extra && extra.memo),
      allowPoFallback: !!(extra && extra.allowPoFallback),
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
        const weightError = Math.abs(item.grossWeight - item.tareWeight - item.netWeight);
        if (!item.marking || item.weight <= 0 || item.price <= 0 || item.grossWeight < item.netWeight || item.tareWeight > item.grossWeight
          || weightError > Math.max(2, item.grossWeight * 0.01) || Math.abs(expected - item.amount) > Math.max(5, item.amount * 0.08)) continue;
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
   * D&D Recycling / CDD container summary packing list.
   * Each material row carries a bag count and net weight.  The document says
   * every big bag weighs 2 kg, so gross can be reconstructed without splitting
   * a material into artificial package rows.
   */
  function parseContainerMaterialPackingRows(lines, text) {
    const header = lines.slice(0, 40).join(" ");
    if (!/PACKING\s+LIST/i.test(header)
      || !/ITEM\s+DESCRIPTION\s+PACKING\s+NET\s+WEIGHT/i.test(header)
      || !/TARE\s+BIG\s+BAGS?/i.test(text)) return [];

    const rows = [];
    let containerNo = "", materialIndex = 0;
    for (const raw of lines) {
      const line = clean(raw);
      if (/^SUMMARY\s+BY\s+MATERIAL/i.test(line)) break;
      const container = line.match(/^CONTAINER\s+\d+\s*[·.-]?\s*([A-Z]{4})\s*(\d{6}\/\d)/i);
      if (container) {
        containerNo = `${container[1].toUpperCase()}${container[2]}`;
        materialIndex = 0;
        continue;
      }
      if (!containerNo || /^(?:ITEM\s+DESCRIPTION|TOTAL\s+NET|TARE\s+BIG|GROSS\s+WEIGHT)/i.test(line)) continue;
      const match = line.match(/^(.+?)\s+((?:\d+\s+bags?(?:\s*\/\s*rest\s+loose)?|loose))\s+([\d,]+(?:\.\d+)?)\s*kg$/i);
      if (!match) continue;
      const grade = clean(match[1]), packing = clean(match[2]);
      const bagMatch = packing.match(/^(\d+)\s+bags?/i), bagCount = bagMatch ? Number(bagMatch[1]) : 0;
      const net = numberValue(match[3], "US"), tare = bagCount * 2, gross = net + tare;
      if (!grade || !(net > 0)) continue;
      materialIndex++;
      rows.push(normalizeItem(grade, "", net, "KG", 0, "KG", 0, {
        style: "US", gross, tare,
        packageNo: `${containerNo}-${String(materialIndex).padStart(2, "0")}`,
        packageCount: bagCount || 1, packingType: packing,
        sourceGradeLocked: true, sourceLineNo: materialIndex,
        memo: bagCount ? `Big bag tare ${tare} kg` : "Loose"
      }));
    }
    return rows;
  }

  /* VMET packing list: container weights are present, but the grade is on the P.O. */
  function parseVmetContainerPackingRows(lines, text) {
    const header = lines.slice(0, 35).join(" ");
    if (!/PACKING\s+LIST/i.test(header) || !/VMET/i.test(text)
      || !/DES?C?TRIPTION\s+QUANTITY\s*\/\s*KG\s+PACKAGES\s+NET\s+WEIGHT/i.test(header)) return [];
    const rows = [];
    lines.forEach(line => {
      const match = clean(line).match(/^\s*(\d+)\s+Container:\s*([A-Z]{4}\d{7})\s+(ML-[A-Z0-9-]+)\s+([\d.,]+)\s+N\/?A\s+([\d\s.,]+)\s*$/i);
      if (!match) return;
      const quantity = numberValue(match[4], "US"), net = numberValue(match[5], "US");
      if (!(quantity > 0 && net > 0)) return;
      rows.push(normalizeItem("", `Container ${match[2]}`, net, "KG", 0, "KG", 0, {
        style: "US", gross: quantity,
        packageNo: `${match[2].toUpperCase()} ${match[3].toUpperCase()}`,
        packageCount: 1, packingType: "Container", allowPoFallback: true,
        sourceLineNo: Number(match[1])
      }));
    });
    return rows;
  }

  /* VMET invoice: a multi-line grade is followed by container and numeric rows. */
  function parseVmetInvoiceRows(lines, text) {
    if (!/\bVMET\b/i.test(text) || !/Ti\s+Coated\s+with\s+Ir\s*\/\s*Ru\s*\(\s*Ti\s+anode\s*\)/i.test(text)) return [];
    const rows = [];
    for (let index = 0; index < lines.length; index++) {
      const gradeMatch = clean(lines[index]).match(/(Ti\s+Coated\s+with\s+Ir\s*\/\s*Ru\s*\(\s*Ti\s+anode\s*\))/i);
      if (!gradeMatch) continue;
      const grade = clean(gradeMatch[1]).replace(/\s*\/\s*/g, "/");
      const nearby = lines.slice(index + 1, Math.min(lines.length, index + 5)).map(clean);
      const containerLine = nearby.find(line => /Container\s*:/i.test(line)) || "";
      const container = (containerLine.match(/Container\s*:\s*([A-Z]{4}\d{7})/i) || ["", ""])[1];
      const dataLine = nearby.find(line => /^\d+\s+ML-[A-Z0-9-]+\s+/i.test(line)) || "";
      const data = dataLine.match(/^\s*(\d+)\s+(ML-[A-Z0-9-]+)\s+([\d.,]+)\s+([\d.,]+)\s+([\d\s.,]+)\s*$/i);
      if (!data) continue;
      const quantity = numberValue(data[3], "EU"), price = numberValue(data[4], "EU"), amount = numberValue(data[5], "EU");
      if (!(quantity > 0 && price > 0 && amount > 0)) continue;
      rows.push(normalizeItem(grade, "HS Code 8108.30.00", data[3], "KG", data[4], "KG", data[5], {
        style: "EU", packageNo: clean(`${container} ${data[2]}`), packageCount: 1,
        sourceGradeLocked: true, sourceLineNo: Number(data[1])
      }));
    }
    return rows;
  }

  /*
   * ARROUQ/CARR-style table:
   * S.N. | DESCRIPTION | GROSS WEIGHT/TON | JUMBO WEIGHT K.G. | NET WEIGHT TON
   * The middle value is tare in kilograms while gross/net are metric tons.
   */
  function parseTonJumboPackingRows(lines, text, fileName) {
    const header = lines.slice(0, 90).join(" ");
    const fileHint = /CARR\d{6}.*PACKING\s*LIST/i.test(String(fileName || ""));
    const supplierHint = /ARROUQ\s+AL\s*[- ]\s*JOUZ/i.test(String(text || ""));
    const headerHint = /PACKING\s+LIST/i.test(header)
      && /GROSS\s+WEIGHT\s*\/?\s*TON/i.test(header)
      && /JUMBO\s+WEIGHT/i.test(header)
      && /NET\s+WEIGHT\s*\/?\s*TON/i.test(header);
    if (!fileHint && !supplierHint && !headerHint) return [];

    const rows = [];
    const normalized = value => clean(value)
      .replace(/[|]/g, " ")
      .replace(/(\d)\s*[.,]\s*(\d{3})\b/g, "$1.$2")
      .replace(/\s+/g, " ");
    const decimalPattern = /\b\d{1,3}[.,]\d{3}\b/g;
    const gradeValue = value => {
      let grade = clean(String(value || "")
        .replace(/[©®™'`_]/g, " ")
        .split(/\s+/).filter(token => !/^[a-z][A-Za-z]?$/.test(token)).join(" ")
        .replace(/^[^A-Z0-9]+|[^A-Z0-9]+$/gi, ""));
      if (/^INCO\s*718$/i.test(grade)) grade = "INCO718";
      if (/^INCO\s*825$/i.test(grade)) grade = "INCO 825";
      return grade;
    };

    for (let index = 0; index < lines.length; index++) {
      if (/^\s*(?:TOTAL|BANK|BENEFICIARY|ACCOUNT|SWIFT)\b/i.test(lines[index])) continue;
      let joined = "", accepted = false;
      for (let width = 1; width <= 2 && index + width <= lines.length; width++) {
        joined = normalized(joined + " " + lines[index + width - 1]);
        if ((joined.match(/\d{1,3}[.,]\d{3}\s*TON\b/ig) || []).length >= 2) continue;
        const rowMatch = joined.match(/^\s*[^A-Z0-9]{0,6}(\d{1,2})\b/i);
        if (!rowMatch) continue;
        const lineNo = Number(rowMatch[1]);
        if (!(lineNo > 0 && lineNo <= 99)) continue;
        const body = joined.slice(rowMatch[0].length), decimals = [...body.matchAll(decimalPattern)];
        if (!decimals.length) continue;
        const grossMatch = decimals[0], grossTon = numberValue(grossMatch[0], "US");
        const grade = gradeValue(body.slice(0, grossMatch.index));
        const afterGross = body.slice((grossMatch.index || 0) + grossMatch[0].length);
        const afterDecimals = [...afterGross.matchAll(decimalPattern)];
        let netTon = afterDecimals.length ? numberValue(afterDecimals[afterDecimals.length - 1][0], "US") : 0;
        let netStart = afterDecimals.length ? afterDecimals[afterDecimals.length - 1].index || 0 : afterGross.length;
        if (!(netTon > 0)) {
          const compactNet = [...afterGross.matchAll(/\b\d{4,6}\b/g)].pop();
          if (compactNet) {
            const candidate = numberValue(compactNet[0], "US") / 1000;
            if (candidate > 0 && candidate <= grossTon && grossTon - candidate < 0.2) {
              netTon = candidate;
              netStart = compactNet.index || 0;
            }
          }
        }
        const middle = afterGross.slice(0, netStart), tareTokens = [...middle.matchAll(/\b\d{1,3}\b/g)];
        let tareKg = tareTokens.length ? numberValue(tareTokens[tareTokens.length - 1][0], "US") : 0;
        if (!(netTon > 0) && grossTon > 0) netTon = grossTon - tareKg / 1000;
        const expectedTare = round2((grossTon - netTon) * 1000);
        if (!tareTokens.length || Math.abs(expectedTare - tareKg) > 12) tareKg = expectedTare;
        if (!grade || !/[A-Z0-9]/i.test(grade) || !(grossTon > 0 && netTon > 0 && grossTon >= netTon)) continue;
        if (Math.abs(expectedTare - tareKg) > Math.max(12, grossTon * 3)) continue;
        rows.push(normalizeItem(grade, "", netTon, "TON", 0, "TON", 0, {
          style: "US", gross: grossTon, tare: tareKg / 1000,
          packageNo: `CARR-${String(lineNo).padStart(2, "0")}`,
          packageCount: 1, sourceGradeLocked: true, sourceLineNo: lineNo,
          memo: `Jumbo/Tare ${round2(tareKg)} kg`
        }));
        index += width - 1;
        accepted = true;
        break;
      }
      if (accepted) continue;
    }
    const totalTons = [...String(text || "").matchAll(/(\d{1,3}[.,]\d{3})\s*TON\b/ig)].map(match => numberValue(match[1], "US"));
    if (totalTons.length >= 2) {
      rows.expectedGrossKg = round2(totalTons[0] * 1000);
      rows.expectedNetKg = round2(totalTons[totalTons.length - 1] * 1000);
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

  /* Parse package-detail tables whose columns are: No. | Material | Nett | Gross. */
  function parseMaterialNettGrossRows(lines, text) {
    const headerText = lines.slice(0, 90).join(" ");
    if (!/\bMATERIALS?\b/i.test(headerText) || !/\bNETT?(?:\s+WEIGHT)?\b/i.test(headerText) || !/\bGROSS(?:\s+WEIGHT)?\b/i.test(headerText)) return [];
    if (!/JUMBO\s+BAG|PACKING\s+LIST|PACKING\s+DETAIL/i.test(headerText)) return [];

    const style = numberStyle(text), rows = [];
    let currentBag = "";
    lines.forEach(rawLine => {
      const line = clean(rawLine).replace(/(\d)\s+([,.])\s*(\d)/g, "$1$2$3");
      const bagMatch = line.match(/JUMBO\s+BAG\s+NO\.?\s*([A-Z0-9-]+)/i);
      if (bagMatch) currentBag = clean(bagMatch[1]);
      if (/^(?:NO\.?\s+)?MATERIALS?\b|\bNETT?\s+GROSS\b|^TOTAL\b/i.test(line)) return;
      const match = line.match(/^\s*(\d{1,3}[A-Z]?)\s+(.+?)\s+([\d.,]+)\s+([\d.,]+)\s*$/i);
      if (!match) return;
      const rowCode = match[1].toUpperCase(), material = clean(match[2]);
      const net = numberValue(match[3], style), gross = numberValue(match[4], style);
      if (!material || !/[A-Z]/i.test(material) || !(net > 0 && gross >= net)) return;
      const tare = round2(gross - net);
      if (tare > Math.max(100, gross * 0.2)) return;
      const packageNo = `JUMBO-${rowCode || currentBag}`;
      rows.push(normalizeItem(material, "", net, "KG", 0, "KG", 0, {
        style, gross, tare, packageNo, packageCount: 1, sourceGradeLocked: true,
        sourceLineNo: Number.parseInt(rowCode, 10) || 0,
        memo: currentBag ? `Jumbo Bag No. ${currentBag}` : ""
      }));
    });
    return rows;
  }

  /*
   * Ireland Alloys-style PACKING LIST:
   * ITEM | MATERIAL DESCRIPTION | GROSS | TARE | NETT.
   * Some material names are vertically merged, so later package rows contain
   * only the packing type and weights. Keep the latest material name and
   * create one item for every physical weight row.
   */
  function parseIrelandAlloysPackingRows(lines, text) {
    const header = lines.findIndex(line => /MATERIAL\s+DESCRIPTION/i.test(line)
      && /GROSS/i.test(line) && /TARE/i.test(line) && /NETT?/i.test(line));
    if (header < 0 || !lines.slice(0, header + 1).some(line => /PACKING\s+LIST/i.test(line))) return [];

    const style = numberStyle(text), rows = [];
    const normalized = value => clean(value)
      .replace(/(\d)\s*,\s*(\d)/g, "$1,$2")
      .replace(/(\d)\s*\.\s*(\d)/g, "$1.$2");
    const packingPattern = /\b\d+\s+(?:(?:LARGE\s+)?STILLAGE|PALLET|FISHBOX|IBC|(?:DRUMS?|BAGS?)(?:\s+ON\s+\d+\s+PALLET)?)\b/i;
    const ignored = /^(?:KGS?\b|TOTALS?\b|GRAND\s+TOTALS?\b|ITEM\b|MATERIAL\s+DESCRIPTION\b)/i;
    let currentGrade = "", previous = null, generated = 0;

    function weightTriple(line) {
      const tokens = numericTokens(line, style);
      if (tokens.length < 3) return null;
      const netToken = tokens[tokens.length - 1], net = netToken.value;
      if (!(net > 0)) return null;
      const first = Math.max(0, tokens.length - 6);
      for (let grossIndex = tokens.length - 3; grossIndex >= first; grossIndex--) {
        const gross = tokens[grossIndex].value;
        if (!(gross >= net && gross > 0)) continue;
        const tareTokens = tokens.slice(grossIndex + 1, tokens.length - 1);
        if (!tareTokens.length || tareTokens.length > 2) continue;
        const tare = tareTokens.length === 1
          ? tareTokens[0].value
          : Number(tareTokens.map(token => String(Math.trunc(token.value))).join(""));
        if (!(tare >= 0) || Math.abs((gross - tare) - net) > Math.max(2, gross * 0.005)) continue;
        return { gross: round2(gross), tare: round2(tare), net: round2(net), firstIndex: tokens[grossIndex].index };
      }
      return null;
    }

    for (let index = header + 1; index < lines.length; index++) {
      const line = normalized(lines[index]);
      if (!line || /^GRAND\s+TOTALS?/i.test(line)) break;
      if (ignored.test(line)) { previous = null; continue; }
      const weights = weightTriple(line);
      if (!weights) {
        if (previous && /[A-Z]/i.test(line) && !/^(?:BANK|BENEFICIARY|ACCOUNT|SWIFT|CONTAINER|REFERENCE)\b/i.test(line)) {
          previous.marking = clean(previous.marking + " " + line);
          currentGrade = previous.marking;
        }
        continue;
      }

      let prefix = clean(line.slice(0, weights.firstIndex));
      const itemMatch = prefix.match(/^\s*(\d{1,3})\b\s*/);
      const afterItem = itemMatch ? clean(prefix.slice(itemMatch[0].length)) : "";
      const startsWithPacking = /^(?:(?:LARGE\s+)?STILLAGE|PALLET|FISHBOX|IBC|DRUMS?|BAGS?)\b/i.test(afterItem);
      const itemNo = itemMatch && !startsWithPacking && packingPattern.test(afterItem) ? Number(itemMatch[1]) : 0;
      if (itemNo) prefix = afterItem;
      const packingMatch = prefix.match(packingPattern);
      const packingType = packingMatch ? clean(packingMatch[0]) : "";
      let grade = packingMatch ? clean(prefix.slice(0, packingMatch.index)) : prefix;
      grade = grade.replace(/^[-:|]+|[-:|]+$/g, "").trim();
      if (grade && /[A-Z]/i.test(grade)) currentGrade = grade;
      else grade = currentGrade;
      if (!grade || !/[A-Z]/i.test(grade)) continue;

      generated++;
      previous = normalizeItem(grade, "", weights.net, "KG", 0, "KG", 0, {
        style, gross: weights.gross, tare: weights.tare,
        packageNo: itemNo ? `ITEM-${String(itemNo).padStart(2, "0")}` : `PL-${String(generated).padStart(3, "0")}`,
        packageCount: 1, packingType, sourceGradeLocked: true, sourceLineNo: itemNo || generated
      });
      rows.push(previous);
    }
    return rows;
  }

  /* Purchase contracts whose rows are QTY | DESCRIPTION | PRICE. */
  function parseQuantityDescriptionPriceRows(lines, text) {
    if (!/QUANTITY\s*\(?KGS?\)?.*DESCRIPTION.*PRICE\s*\(?USD\s*\/\s*KG\)?/is.test(String(text || ""))) return [];
    const rows = [];
    lines.forEach((rawLine, index) => {
      const line = clean(rawLine).replace(/([\d])\s*[}\]|{]\s*/g, "$1 ");
      const match = line.match(/^\s*([\d,.]+)\s+[_\s]*(.+?)\s+USD\s*([\d,.]+)\s*[).]?\s*$/i);
      if (!match) return;
      const ocrNumber = value => {
        let source = String(value || "").replace(/[^\d.,]/g, "").replace(/[.,]+$/, "");
        if (/^\d{1,3}(?:,\d{3})+,\d{2}$/.test(source)) {
          const split = source.lastIndexOf(",");
          source = source.slice(0, split).replace(/,/g, "") + "." + source.slice(split + 1);
        } else if (/^\d+,\d{2}$/.test(source)) source = source.replace(",", ".");
        return source;
      };
      const marking = clean(match[2]).replace(/^[_\s]+/, "");
      const item = normalizeItem(marking, "", ocrNumber(match[1]), "KG", ocrNumber(match[3]), "KG", 0, {
        style: "US", sourceGradeLocked: true, sourceLineNo: index + 1
      });
      if (item.marking && item.weight > 0 && item.price > 0) rows.push(item);
    });
    return rows;
  }

  /* Common North-American P.O rows using LB price/weight or metric-ton quantity. */
  function parsePurchaseOrderWeightRows(lines, text) {
    if (!/PURCHASE\s+ORDER/i.test(text)) return [];
    const rows = [];
    lines.forEach((rawLine, index) => {
      const line = clean(rawLine);
      let match = line.match(/^(.+?)\s+\$?([\d,.]+)\s+per\s+LB\s+([\d,.]+)\s*(M\/?TON|MTON|MT|TONS?)\b/i);
      if (match) {
        const item = normalizeItem(match[1], "", match[3], "TON", match[2], "LB", 0, {
          style: "US", sourceGradeLocked: true, sourceLineNo: index + 1
        });
        if (item.marking && item.weight > 0 && item.price > 0) rows.push(item);
        return;
      }
      match = line.match(/^\s*\d{1,3}\s+([\d,.]+)\s+(.+?)\s+\$?([\d,.]+)\s*\/\s*(LB|LBS|KG|KGS)\s+\$?([\d,.]+)\s*$/i);
      if (!match) return;
      const unit = unitCode(match[4], "LB");
      const item = normalizeItem(match[2], "", match[1], unit, match[3], unit, match[5], {
        style: "US", sourceGradeLocked: true, sourceLineNo: index + 1
      });
      if (item.marking && item.weight > 0 && item.price > 0) rows.push(item);
    });
    return rows;
  }

  /* India ERP P.O rows may wrap the item name onto the following line. */
  function parseErpPurchaseOrderRows(lines, text) {
    if (!/RM-IMPORT/i.test(text) || !/PURCHASE\s+ORDER/i.test(text)) return [];
    const rows = [];
    for (let index = 0; index < lines.length; index++) {
      const line = clean(lines[index]).replace(/[|}\]]/g, " ");
      const match = line.match(/^\s*\d{1,3}\s+\[?(.+?)\s+\d{8}\s+([\d,.]+)\s+KG\s+\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\s+([\d,.]+).*?([\d,.]+)\s*$/i);
      if (!match) continue;
      let marking = clean(match[1]);
      const next = clean(lines[index + 1] || "").replace(/^I(?=[A-Z])/, "");
      if (next && /^[A-Z][A-Z0-9 /()._-]{3,}$/i.test(next) && !TOTAL_RE.test(next)) marking = clean(`${marking} ${next}`);
      const item = normalizeItem(marking, "", match[2], "KG", match[3], "KG", match[4], {
        style: "US", sourceGradeLocked: true, sourceLineNo: index + 1
      });
      if (item.marking && item.weight > 0 && item.price > 0) rows.push(item);
    }
    return rows;
  }

  /* Japanese P.O rows: order code | description | kg | JPY/kg | JPY amount. */
  function parseJapanesePurchaseOrderRows(lines, text) {
    if (!/JPY|GPY|¥/.test(text) || !/DESCRIPTION\s+OF\s+GOODS/i.test(text)) return [];
    const rows = [];
    lines.forEach((rawLine, index) => {
      const line = clean(rawLine).replace(/[|\[\]}]/g, " ");
      const match = line.match(/^([A-Z]{3,6})\s*-\s*(\d{3,5})\s+(.+?)\s+([\d,.]+)\s*KG\s+¥?\s*([\d,.]+)\s+¥?\s*([\d,.]+)\s*$/i);
      if (!match) return;
      const item = normalizeItem(match[3], "", match[4], "KG", match[5], "KG", match[6], {
        style: "US", sourceGradeLocked: true, sourceLineNo: index + 1,
        memo: `Order ${match[1].toUpperCase()}-${match[2]}`
      });
      if (item.marking && item.weight > 0 && item.price > 0) rows.push(item);
    });
    return rows;
  }

  /* TOSUI invoice/packing rows share the same material and gross/net columns. */
  function parseTosuiRows(lines, text) {
    if (!/TOSUI\s+TRADING/i.test(text) || !/(?:INVOICE|PACKING\s+LIST)/i.test(text)) return [];
    const invoice = /\bINVOICE\b/i.test(text) && !/PACKING\s+LIST/i.test(text);
    const rows = [];
    let inTable = false;
    for (let index = 0; index < lines.length; index++) {
      const line = clean(lines[index]);
      if (/NAME\s*_?OF\s+COMMODITY/i.test(line)) { inTable = true; continue; }
      if (!inTable) continue;
      if (TOTAL_RE.test(line)) break;
      const tokens = numericTokens(line, "US");
      const count = invoice ? 4 : 2;
      if (tokens.length < count) continue;
      const tail = tokens.slice(-count);
      const gross = tail[0].value, net = tail[1].value;
      if (!(gross > 0 && net > 0 && gross >= net)) continue;
      const marking = clean(line.slice(0, tail[0].index)).replace(/[_|]+/g, " ")
        .replace(/^N\/?M\s*(?:\|\s*)?/i, "")
        .replace(/^\d+\s+PACKAGES?\s+/i, "")
        .trim();
      if (!marking || !/[A-Z]/i.test(marking)) continue;
      const price = invoice ? tail[2].value : 0, amount = invoice ? tail[3].value : 0;
      const item = normalizeItem(marking, "", net, "KG", price, "KG", amount, {
        style: "US", gross, packageCount: 1, sourceGradeLocked: true, sourceLineNo: index + 1
      });
      if (item.weight > 0 && (!invoice || item.price > 0)) rows.push(item);
    }
    return rows;
  }

  /* QTY in metric tons with the useful grade printed on following parenthetical lines. */
  function parseParentheticalMtsPackingRows(lines, text) {
    if (!/PACKING\s+LIST/i.test(text) || !/QTY\s*\(MTS\)/i.test(text)) return [];
    const rows = [];
    for (let index = 0; index < lines.length; index++) {
      const line = clean(lines[index]);
      const match = line.match(/^\s*(\d{1,3})\s+(.+?)\s+([\d,.]+)\s+([\d,.]+)\s*$/i);
      if (!match || TOTAL_RE.test(line)) continue;
      let end = index + 1;
      const nextMaterialRow = value => /^\d{1,3}\s+.+?\s+[\d,.]+\s+[\d,.]+\s*$/i.test(clean(value));
      while (end < lines.length && end < index + 7 && !nextMaterialRow(lines[end]) && !TOTAL_RE.test(clean(lines[end]))) end++;
      const fragments = [];
      for (let cursor = index + 1; cursor < end; cursor++) {
        const next = clean(lines[cursor]);
        const parenthetical = next.match(/^\((.+?)(?:\)|$)/);
        if (parenthetical) fragments.push(parenthetical[1]);
        else if (fragments.length && /\)/.test(next)) fragments.push(next.split(")")[0]);
      }
      let marking = clean(fragments.join(" ")).replace(/\s*-\s*\d+\s+JUMBO\s+BAGS?.*$/i, "");
      if (!marking) marking = clean(match[2]);
      const block = lines.slice(index + 1, end).join(" ");
      const packages = [...block.matchAll(/(\d+)\s+(?:PALLETS?|JUMBO\s+BAGS?)/ig)].reduce((sum, value) => sum + Number(value[1] || 0), 0);
      const item = normalizeItem(marking, clean(match[2]), match[3], "TON", 0, "TON", 0, {
        style: "US", gross: match[4], packageCount: packages || 1,
        packingType: packages ? clean((block.match(/\d+\s+PALLETS?(?:\s*&\s*\d+\s+JUMBO\s+BAGS?)?|\d+\s+JUMBO\s+BAGS?/i) || [""])[0]) : "",
        sourceGradeLocked: true, sourceLineNo: Number(match[1])
      });
      if (item.marking && item.weight > 0) rows.push(item);
    }
    return rows;
  }

  /* Invoice/material rows with a suffix A-G that must not be discarded. */
  function parseMaterialAmountRows(lines, text) {
    if (!/DESCRIPTION\s+OF\s+MATERIAL|DESCRIPTION\s+OF\s+GOODS/i.test(text) && !/PRICE\s*\/\s*KG\s+USD/i.test(text)) return [];
    const rows = [];
    lines.forEach((rawLine, index) => {
      const line = clean(rawLine);
      const match = line.match(/^\s*\d{1,3}\s+(.+?)\s+([\d,.]+)\s+\$?([\d,.]+)\s+\$?([\d,.]+)\s*$/i);
      if (!match || TOTAL_RE.test(line)) return;
      const item = normalizeItem(match[1], "", match[2], "KG", match[3], "KG", match[4], {
        style: "US", sourceGradeLocked: true, sourceLineNo: index + 1
      });
      if (item.marking && item.weight > 0 && item.price > 0) rows.push(item);
    });
    return rows;
  }

  /* Packing rows: No. | material | packages | gross kg | net kg. */
  function parseMaterialPackageRows(lines, text) {
    if (!/PACKING\s+LIST/i.test(text) || !/\bPKG\b/i.test(text) || !/GROSS\s+WT/i.test(text) || !/NET\s+WT/i.test(text)) return [];
    const rows = [];
    lines.forEach((rawLine, index) => {
      const line = clean(rawLine);
      const match = line.match(/^\s*(\d{1,3})\s+(.+?)\s+(\d{1,4})\s+([\d,.]+)\s+([\d,.]+)\s*$/i);
      if (!match || TOTAL_RE.test(line)) return;
      const item = normalizeItem(match[2], "", match[5], "KG", 0, "KG", 0, {
        style: "US", gross: match[4], packageCount: Number(match[3]),
        packageNo: `PL-${String(Number(match[1])).padStart(3, "0")}`,
        sourceGradeLocked: true, sourceLineNo: Number(match[1])
      });
      if (item.marking && item.weight > 0 && item.grossWeight >= item.netWeight) rows.push(item);
    });
    return rows;
  }

  /* A single grade followed by physical package rows: No. | gross | tare | net. */
  function parseParcelPackingRows(lines, text) {
    if (!/PACKING\s+LIST/i.test(text) || !/\bGROSS\b.*\bTARE\b.*\bNET\b.*\bPACKAGING\b/i.test(text)) return [];
    let grade = "";
    const gradeLine = lines.findIndex(line => /IRELAND\s+ALLOYS/i.test(line));
    if (gradeLine >= 0) grade = clean(lines[gradeLine + 1] || "");
    if (!grade || /PACKING\s+LIST/i.test(grade)) return [];
    const rows = [];
    lines.forEach(rawLine => {
      const line = clean(rawLine).replace(/[}|]/g, " ").replace(/(\d)\.(\d{3})\s*KG/ig, "$1$2 kg");
      const match = line.match(/^\s*(\d{1,3})\s+([\d,.]+)\s*KG\s+([\d,.]+)\s*KG\s+([\d,.]+)\s*KG\s*[|/]?\s*(.+)?$/i);
      if (!match) return;
      const item = normalizeItem(grade, "", match[4], "KG", 0, "KG", 0, {
        style: "US", gross: match[2], tare: match[3], packageNo: `PL-${String(Number(match[1])).padStart(3, "0")}`,
        packageCount: 1, packingType: clean(match[5]), sourceGradeLocked: true, sourceLineNo: Number(match[1])
      });
      if (item.weight > 0 && item.grossWeight >= item.netWeight) rows.push(item);
    });
    return rows;
  }

  /* European numeric packing row used by KOCA: gross | packaging | net. */
  function parseEuropeanGrossPackagingNetRows(lines, text) {
    if (!/KOCA/i.test(text) || !/PACKING\s+LIST/i.test(text)) return [];
    const rows = [];
    lines.forEach((rawLine, index) => {
      const line = clean(rawLine);
      if (TOTAL_RE.test(line)) return;
      const match = line.match(/^(.+?)\s+([\d.]+,\d+)\s*KGS?\s+([\d.]+,\d+)\s*KGS?\s+([\d.]+,\d+)\s*KGS?\s*$/i);
      if (!match) return;
      const item = normalizeItem(match[1], "", match[4], "KG", 0, "KG", 0, {
        style: "EU", gross: match[2], tare: match[3], packageCount: Number((text.match(/\((\d+)\s+PACKAGES?/i) || ["", "1"])[1]),
        sourceGradeLocked: true, sourceLineNo: index + 1
      });
      if (item.marking && item.weight > 0) rows.push(item);
    });
    return rows;
  }

  /* Price-less proforma/packing summary rows are still useful for inbound requests. */
  function parseCommodityQuantityRows(lines, text) {
    if (!/AIM\s+HIGH\s+KOREA/i.test(text) || !/PROFORMA\s+INVOICE/i.test(text)) return [];
    const rows = [];
    let inTable = false;
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = clean(lines[lineIndex]), nearbyHeader = lines.slice(Math.max(0, lineIndex - 2), lineIndex + 3).join(" ");
      if (/COMMODITY/i.test(line) && /QUANTITY|Q.?TY|KG|KGS/i.test(nearbyHeader)) { inTable = true; continue; }
      if (!inTable) continue;
      if (TOTAL_RE.test(line)) break;
      const lineNo = line.match(/^\s*(\d{1,3})\b/), tokens = numericTokens(line, "US");
      if (!lineNo || tokens.length < 2) continue;
      const afterLineNo = tokens.filter(token => token.index >= lineNo[0].length);
      const decimalTokens = afterLineNo.filter(token => /[.,]\d/.test(token.text));
      const quantityToken = decimalTokens[decimalTokens.length - 1] || afterLineNo[afterLineNo.length - 1];
      const marking = clean(line.slice(lineNo[0].length, quantityToken.index));
      if (!marking || !/[A-Z]/i.test(marking)) continue;
      const item = normalizeItem(marking, "", quantityToken.text, "KG", 0, "KG", 0, {
        style: "US", packageNo: `PL-${String(Number(lineNo[1])).padStart(3, "0")}`,
        sourceGradeLocked: true, sourceLineNo: Number(lineNo[1])
      });
      if (item.marking && item.weight > 0) rows.push(item);
    }
    const expected = numberValue((String(text || "").match(/TOTAL[^\n]*?([\d,.]+)\s*KG/i) || ["", ""])[1], "US");
    const actual = round2(rows.reduce((sum, item) => sum + item.weight, 0));
    if (expected > 0 && Math.abs(actual - expected) > 0.1) {
      for (const item of rows) {
        const corrected = round2(actual - item.weight + item.weight / 10);
        if (Math.abs(corrected - expected) > 0.1) continue;
        item.quantity = round2(item.quantity / 10);
        item.weight = item.netWeight = item.grossWeight = item.quantity;
        item.amount = round2(item.weight * item.price);
        break;
      }
    }
    return rows;
  }

  function dedupeItems(groups) {
    const out = [], seen = new Set();
    groups.flat().forEach(item => {
      if (!item || (!item.marking && !item.allowPoFallback) || item.weight <= 0) return;
      const key = `${compact(item.marking)}|${round2(item.weight)}|${round2(item.amount)}|${compact(item.packageNo)}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    });
    return out;
  }

  function selectBestRowGroup(groups, text) {
    const declared = declaredWeightTotal(text);
    return (Array.isArray(groups) ? groups : []).map((group, index) => {
      const items = dedupeItems([Array.isArray(group) ? group : []]);
      const weight = round2(items.reduce((sum, item) => sum + Number(item.netWeight || item.weight || 0), 0));
      const error = declared > 0 && weight > 0 ? Math.abs(weight - declared) / declared : Number.POSITIVE_INFINITY;
      const financial = items.filter(item => Number(item.price) > 0 && Number(item.amount) > 0
        && Math.abs(Number(item.netWeight || item.weight) * Number(item.price) - Number(item.amount)) <= Math.max(5, Number(item.amount) * 0.08)).length;
      return { items, index, weight, error, financial };
    }).filter(candidate => candidate.items.length).sort((left, right) => {
      if (declared > 0) {
        const leftExact = left.error <= 0.03, rightExact = right.error <= 0.03;
        if (leftExact !== rightExact) return rightExact - leftExact;
        if (leftExact && rightExact && left.items.length !== right.items.length) return right.items.length - left.items.length;
        if (left.error !== right.error) return left.error - right.error;
      }
      if (left.items.length !== right.items.length) return right.items.length - left.items.length;
      if (left.financial !== right.financial) return right.financial - left.financial;
      return left.index - right.index;
    })[0]?.items || [];
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
    const upperFile = String(fileName || "").toUpperCase();
    const ownCompany = /CASH\s*COW\s+METAL|SHIN\s*SUNG\s+METAL|SHINSUNG\s+METAL/i;
    const knownCompanies = [
      [/METAL\s+(?:DO|BO|OG|OO)\s+CO/i, "METAL DO CO., LTD."],
      [/ALL[-\s]*MET\s+RECYCLING/i, "ALL-MET RECYCLING, INC."],
      [/ICD\s+ALLOYS?\s+AND\s+METALS?/i, "ICD Alloys and Metals, LLC"],
      [/ARFIN\s+INDIA\s+LIMITED/i, "ARFIN INDIA LIMITED"],
      [/FUJI\s+MATERIAL\s+COMPANY/i, "FUJI MATERIAL COMPANY, LTD."],
      [/DAIDO\s+KOGYO/i, "Daido Kogyo Co., Ltd."],
      [/TOSUI\s+TRADING/i, "TOSUI TRADING CO., LTD."],
      [/AEROMET\s+ALLOYS/i, "AEROMET ALLOYS PRIVATE LIMITED"],
      [/GREEN\s+ZONE\s+METAL/i, "GREEN ZONE METAL TR. LLC"],
      [/IRELAND\s+ALLOYS/i, "IRELAND ALLOYS"],
      [/KOCA\s*METAL/i, "KOCA METAL"],
      [/AIM\s+HIGH\s+KOREA/i, "AIM HIGH KOREA INC."]
    ];
    const fileCompany = /^CGZM/i.test(upperFile || String(fileName || "")) ? "GREEN ZONE METAL TR. LLC"
      : /^CIRE/i.test(upperFile || String(fileName || "")) ? "IRELAND ALLOYS"
      : /^CKC/i.test(upperFile || String(fileName || "")) ? "KOCA METAL"
      : /^CAE/i.test(upperFile || String(fileName || "")) ? "AEROMET ALLOYS PRIVATE LIMITED"
      : /^P0366/i.test(upperFile || String(fileName || "")) ? "TOSUI TRADING CO., LTD."
      : /^P0392/i.test(upperFile || String(fileName || "")) ? "AIM HIGH KOREA INC." : "";
    const known = knownCompanies.find(entry => entry[0].test(all));
    const supplierLine = lines.find(line => /^(?:MESSRS|SUPPLIER|VENDOR|SELLER|FROM|CONSIGNOR(?:\s+DETAILS)?)\b/i.test(line) && !ownCompany.test(line));
    let company = known ? known[1] : fileCompany || (supplierLine ? clean(supplierLine.replace(/^(?:MESSRS|SUPPLIER|VENDOR|SELLER|FROM|CONSIGNOR(?:\s+DETAILS)?)\s*[:#-]?\s*/i, "").split(/\b(?:DATE|P\.?O\.?\s*NO|S\.?O\.?\s*NO)\b/i)[0]) : "");
    if (!company) {
      company = lines.slice(0, 20).filter(line => !ownCompany.test(line) && !/PURCHASE|INVOICE|ADDRESS|CONTACT|CUSTOMER/i.test(line))
        .filter(line => /\b(?:LTD|LIMITED|INC|LLC|BV|B\.V|COMPANY|CORP|METALS?|MATERIAL|RECYCLING|TRADING|ALLOYS?|INDONESIA)\b/i.test(line))
        .sort((a, b) => a.length - b.length)[0] || "";
    }
    const filePoNumber = (upperFile.match(/\bPO[\s_-]*(\d{4,8})\b/) || ["", ""])[1];
    const fileCode = filePoNumber || (upperFile.match(/(?:SSIY|SSTY)-\d{4}(?:,\d{4})?|[A-Z]{2,}[A-Z0-9-]*\d{6}[A-Z0-9-]*|\bP\d{4,8}\b/g) || [""])[0];
    const detectedPoNo = fieldFromLines(lines, [
      /(?:\bP\.?O\.?\b|\bPO\b|\bPURCHASE\s+ORDER\b)\s*(?:NO\.?|NUMBER|#|F)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9./_-]{3,})/i,
      /BUYER\s+REF\s+NO\.?\s*[:#-]?\s*([A-Z0-9][A-Z0-9./_-]{3,})/i,
      /(?:ORDER|CONTRACT)\s+(?:NO\.?|NUMBER)\s*[:#-]?\s*([A-Z0-9][A-Z0-9./_-]{3,})/i,
      /O\/?NO\s*[:#-]?\s*([A-Z0-9][A-Z0-9./_-]{3,})/i
    ]);
    const poNo = filePoNumber || (/\d{6}/.test(fileCode) ? fileCode : detectedPoNo || fileCode);
    const date = fieldFromLines(lines, [/(?:^|\b)DATE\s*[:#-]?\s*([0-9]{1,4}[-/.][A-Za-z0-9]{1,9}[-/.][0-9]{1,4})/i, /INVOICE\s+DATE\s*[:#-]?\s*([^\s]{6,20})/i]);
    const address = fieldFromLines(lines, [/^ADDRESS\s*[:#-]?\s*(.+?)(?=\s+(?:S\.?O\.?|P\.?O\.?)\s*NO|$)/i, /\bADD(?:RESS)?\s*[:#-]\s*(.+)$/i]);
    const tel = fieldFromLines(lines, [/(?:^|\b)(?:TEL|PHONE)\s*[:#-]?\s*([+()\d][+()\d .-]{6,})/i]);
    const fax = fieldFromLines(lines, [/(?:^|\b)FAX\s*[:#-]?\s*([+()\d][+()\d .-]{6,})/i]);
    const email = (all.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [""])[0];
    const paymentTerm = fieldFromLines(lines, [/PAYMENT(?:\s+TERM)?\s*[:#-]?\s*(.+?)(?=\s+PACKING\b|$)/i])
      || fieldFromLines(lines.filter(line => !/LOADING\s+TERM|SHIPPING\s+TERM/i.test(line)), [/\bTERMS?\s*[:#-]?\s*(.+)$/i]);
    return {
      poNo: clean(poNo).replace(/[.,;:]$/, ""), company: clean(company), contractDate: clean(date), address: clean(address), tel: clean(tel), fax: clean(fax), email: clean(email),
      soNo: fieldFromLines(lines, [/(?:^|\s)(?:S\.O\.|S\.O|SO)\s*(?:NO\.?|#)\s*[:#-]?\s*([A-Z0-9][A-Z0-9./_-]{2,})\b/i]),
      a10No: fieldFromLines(lines, [/A10\s*NO\s*[:#-]?\s*([A-Z0-9./_-]+)/i]),
      shipment: fieldFromLines(lines, [/SHIPMENT\s*[:#-]?\s*(.+?)(?=\s+LOADING\s+TERM|$)/i, /SHIPPING\s+TERMS?\s*[:#-]?\s*(.+)$/i]),
      loadingTerm: fieldFromLines(lines, [/LOADING\s+TERM\s*[:#-]?\s*([^|]+)$/i, /SAILING\s+ON\s*\/?\s*ABT\s*[:#-]?\s*([^|]+)$/i]),
      paymentTerm,
      packing: fieldFromLines(lines, [/PACKING\s*[:#-]?\s*(.+)$/i]),
      note: fieldFromLines(lines, [/NOTE\s*[:#-]?\s*(.+)$/i]),
      currency: /(?:\bUSD\b|US\s*\$|\$\s*\d)/i.test(all) ? "USD" : /(?:\bJPY\b|GPY|¥)/i.test(all) ? "JPY" : /(?:\bEUR\b|€)/i.test(all) ? "EUR" : /(?:\bKRW\b|₩)/i.test(all) ? "KRW" : /(?:\bGBP\b|£)/i.test(all) ? "GBP" : "USD",
      documentType: (() => {
        const header = lines.slice(0, 35).join("\n"), titleLines = lines.slice(0, 22);
        if (/INSURANCE\s+(?:CERTIFICATE|POLICY)|MARINE\s+CARGO\s+INSURANCE/i.test(all)) return "INSURANCE";
        if (/PROFORMA\s+INVOICE/i.test(header)) return "PROFORMA_INVOICE";
        if (/SALES\s+CONTRACT/i.test(header)) return "SALES_CONTRACT";
        if (/CONTRACT\s+NO\.?/i.test(header)) return "CONTRACT";
        for (const line of titleLines) {
          if (/PACKING\s+LIST/i.test(line)) return "PACKING_LIST";
          if (/\b(?:COMMERCIAL\s+)?INVOICE\b/i.test(line)) return "INVOICE";
          if (/PURCHASE\s+ORDER|PURCHASE\s+CONTRACT/i.test(line)) return "PURCHASE_ORDER";
        }
        return "UNKNOWN";
      })(),
      sourceFile: String(fileName || "")
    };
  }

  function parseText(text, fileName) {
    const lines = String(text || "").split(/\r?\n/).map(clean).filter(Boolean);
    const tonJumboRows = parseTonJumboPackingRows(lines, text, fileName);
    if (tonJumboRows.length && tonJumboRows.expectedNetKg > 0) {
      const actualNetKg = round2(tonJumboRows.reduce((sum, item) => sum + item.netWeight, 0));
      if (Math.abs(actualNetKg - tonJumboRows.expectedNetKg) > 2) throw Error(`PACKING LIST 총 N/W ${tonJumboRows.expectedNetKg.toLocaleString()} kg 중 ${actualNetKg.toLocaleString()} kg만 인식했습니다. 일부 행 누락을 방지하여 등록을 중단했습니다.`);
    }
    const priorityGroups = [parseQuantityDescriptionPriceRows(lines, text), parsePurchaseOrderWeightRows(lines, text), parseErpPurchaseOrderRows(lines, text), parseJapanesePurchaseOrderRows(lines, text), parseTosuiRows(lines, text), parseParentheticalMtsPackingRows(lines, text), parseMaterialAmountRows(lines, text), parseMaterialPackageRows(lines, text), parseParcelPackingRows(lines, text), parseEuropeanGrossPackagingNetRows(lines, text), parseCommodityQuantityRows(lines, text)];
    const fallbackGroups = [parseVmetInvoiceRows(lines, text), parseVmetContainerPackingRows(lines, text), parseContainerMaterialPackingRows(lines, text), tonJumboRows, parseIrelandAlloysPackingRows(lines, text), parseMaterialNettGrossRows(lines, text), parseMergedMaterialPackingRows(lines, text), parsePackingListRows(lines, text), parsePricePerTon(lines), parseGrossTareNet(lines, text), parseContractRows(lines, text), parseColumnarContractOcr(lines, text), parseGenericRows(lines, text)];
    const groups = [...priorityGroups, ...fallbackGroups];
    const best = selectBestRowGroup(groups, text);
    const items = dedupeItems([best]);
    if (/IRELAND\s+ALLOYS/i.test(text)) items.forEach(item => {
      const grade = item.marking.match(/\bMP35N\b.*$/i);
      if (grade) item.marking = clean(grade[0]);
    });
    return { ...metadata(lines, fileName), items, lines, diagnostics: { parser: "text", candidates: groups.map(group => group.length), version: VERSION } };
  }

  function documentQuality(documentData) {
    const data = documentData || {}, items = Array.isArray(data.items) ? data.items : [];
    let score = 0;
    if (data.documentType && data.documentType !== "UNKNOWN") score += 10;
    if (clean(data.company)) score += 10;
    if (clean(data.poNo || data.soNo)) score += 10;
    if (!items.length) return Math.min(30, score);
    score += 30;
    const validRows = items.filter(item => clean(item.marking || item.description) && Number(item.netWeight || item.weight) > 0).length;
    score += 20 * validRows / items.length;
    const financialRows = items.filter(item => Number(item.price) > 0 && Number(item.amount) > 0);
    if (financialRows.length) {
      const consistent = financialRows.filter(item => Math.abs(Number(item.netWeight || item.weight) * Number(item.price) - Number(item.amount)) <= Math.max(5, Number(item.amount) * 0.08)).length;
      score += 10 * consistent / financialRows.length;
    } else if (data.documentType === "PACKING_LIST") score += 8;
    const amountMismatchRows = items.filter(item => item.amountMismatch).length;
    if (amountMismatchRows) score -= Math.min(25, amountMismatchRows * 8);
    const weightRows = items.filter(item => Number(item.grossWeight || item.netWeight || item.weight) >= Number(item.netWeight || item.weight) && Number(item.netWeight || item.weight) > 0).length;
    score += 5 * weightRows / items.length;
    const unique = new Set(items.map(item => `${compact(item.marking)}|${round2(item.netWeight || item.weight)}|${round2(item.amount)}`)).size;
    if (unique < items.length) score -= Math.min(15, (items.length - unique) * 3);
    return round2(Math.max(0, Math.min(100, score)));
  }

  function declaredWeightTotal(text) {
    const values = [];
    String(text || "").split(/\r?\n/).forEach(line => {
      if (!TOTAL_RE.test(clean(line)) || !/\b(?:KG|KGS|MTS?|TONNES?|LBS?)\b/i.test(line) || /(?:USD|US\$|EUR|JPY)\s*$/i.test(clean(line))) return;
      const unitMatch = line.match(/\b(KG|KGS|MTS?|TONNES?|LBS?)\b/i), beforeUnit = unitMatch ? line.slice(0, unitMatch.index) : line;
      const tokens = numericTokens(beforeUnit, numberStyle(line));
      if (!tokens.length) return;
      const raw = tokens[tokens.length - 1].value, unit = unitCode(unitMatch && unitMatch[1], "KG"), factor = WEIGHT_FACTORS[unit] || 1;
      if (raw > 0) values.push(round2(raw * factor));
    });
    return values.length ? values[values.length - 1] : 0;
  }

  function mergeParsedCandidates(candidates) {
    const usable = (Array.isArray(candidates) ? candidates : []).filter(candidate => candidate && candidate.data);
    if (!usable.length) return parseText("", "");
    const methodPriority = method => /원본문자-위치/.test(method || "") ? 4 : /표.*OCR/.test(method || "") ? 3 : /OCR/.test(method || "") ? 2 : /원본문자/.test(method || "") ? 1 : 0;
    const scored = usable.map((candidate, index) => {
      const weight = round2((candidate.data.items || []).reduce((sum, item) => sum + Number(item.netWeight || item.weight || 0), 0)), declaredWeight = declaredWeightTotal(candidate.text);
      const weightError = declaredWeight > 0 && weight > 0 ? Math.abs(weight - declaredWeight) / declaredWeight : 0;
      const rowBonus = Math.min(12, Math.max(0, (candidate.data.items || []).length - 1) * 1.5);
      const quality = Math.max(0, Math.min(100, documentQuality(candidate.data) + rowBonus - (weightError > 0.03 ? Math.min(40, 10 + weightError * 35) : 0)));
      return { ...candidate, index, quality: round2(quality), weight, declaredWeight };
    }).sort((left, right) => right.quality - left.quality || (right.data.items || []).length - (left.data.items || []).length || methodPriority(right.method) - methodPriority(left.method) || left.index - right.index);
    const winner = scored[0], result = { ...winner.data, items: (winner.data.items || []).map(item => ({ ...item })) };
    const fields = ["poNo", "soNo", "company", "contractDate", "address", "tel", "fax", "email", "a10No", "shipment", "loadingTerm", "paymentTerm", "packing", "note", "currency", "documentType"];
    for (const field of fields) {
      if (clean(result[field]) && !(field === "documentType" && result[field] === "UNKNOWN")) continue;
      const source = scored.find(candidate => clean(candidate.data[field]) && !(field === "documentType" && candidate.data[field] === "UNKNOWN"));
      if (source) result[field] = source.data[field];
    }
    const signatures = new Set(scored.map(candidate => `${(candidate.data.items || []).length}|${candidate.weight}`));
    const declaredWeights = scored.map(candidate => candidate.declaredWeight).filter(value => value > 0).sort((left, right) => left - right);
    const declaredNetWeight = declaredWeights.length ? declaredWeights[Math.floor(declaredWeights.length / 2)] : 0;
    const selectedNetWeight = round2(result.items.reduce((sum, item) => sum + Number(item.netWeight || item.weight || 0), 0));
    const weightTotalMismatch = declaredNetWeight > 0 && selectedNetWeight > 0 && Math.abs(selectedNetWeight - declaredNetWeight) > Math.max(2, declaredNetWeight * 0.03);
    const amountMismatchCount = result.items.filter(item => item.amountMismatch).length;
    result.diagnostics = {
      ...(result.diagnostics || {}), version: VERSION, extractionMethod: winner.method || "text", confidence: winner.quality,
      extractionCandidates: scored.map(candidate => ({ method: candidate.method || "text", confidence: candidate.quality, itemCount: (candidate.data.items || []).length, netWeight: candidate.weight, declaredNetWeight: candidate.declaredWeight || 0 })),
      candidateDisagreement: signatures.size > 1, declaredNetWeight, selectedNetWeight, weightTotalMismatch, amountMismatchCount
    };
    if (amountMismatchCount) {
      result.diagnostics.reviewRequired = true;
      result.diagnostics.warning = `금액 불일치 ${amountMismatchCount}건을 감지해 인식된 중량×단가로 자동 보정했습니다. 저장 전 해당 행을 확인하세요.`;
    }
    result.sourceText = String(winner.text || "");
    Object.defineProperty(result, "__candidateDocuments", {
      value: scored.map(candidate => ({ method: candidate.method || "text", confidence: candidate.quality, text: String(candidate.text || ""), items: (candidate.data.items || []).map(item => ({ ...item })) })),
      enumerable: false, configurable: true, writable: true
    });
    return result;
  }

  function columnIndex(headers, aliases, excluded) {
    const keys = aliases.map(headerKey);
    for (const key of keys) {
      let index = headers.findIndex((value, idx) => idx !== excluded && value === key);
      if (index >= 0) return index;
    }
    for (const key of keys.filter(value => value.length >= 4)) {
      let index = headers.findIndex((value, idx) => idx !== excluded && (value.startsWith(key) || value.endsWith(key)));
      if (index >= 0) return index;
    }
    return -1;
  }

  function nextValue(row, start) {
    for (let index = start + 1; index < row.length; index++) if (clean(row[index])) return clean(row[index]);
    return "";
  }

  function matrixField(matrix, aliases, beforeRow) {
    const keys = aliases.map(headerKey);
    let value = "";
    matrix.slice(0, beforeRow < 0 ? 50 : beforeRow).forEach(row => {
      row.forEach((cell, index) => {
        if (!keys.includes(headerKey(cell))) return;
        const candidate = nextValue(row, index);
        if (candidate) value = candidate;
      });
    });
    return value;
  }

  function parseMatrix(sourceMatrix, fileName) {
    const matrix = (sourceMatrix || []).map(row => Array.isArray(row) ? row : []);

    let headerRow = -1, columns = {};
    for (let index = 0; index < Math.min(matrix.length, 60); index++) {
      const headers = matrix[index].map(headerKey);
      const marking = columnIndex(headers, HEADER_ALIASES.marking);
      const quantity = columnIndex(headers, HEADER_ALIASES.quantity);
      const net = columnIndex(headers, HEADER_ALIASES.net);
      if (marking < 0 || (quantity < 0 && net < 0 && columnIndex(headers, HEADER_ALIASES.gross) < 0)) continue;
      headerRow = index;
      for (const [name, aliases] of Object.entries(HEADER_ALIASES)) columns[name] = columnIndex(headers, aliases, name === "description" ? marking : -1);
      break;
    }
    if (headerRow < 0) return parseText(matrix.map(row => row.filter(value => clean(value)).join(" ")).join("\n"), fileName);
    const headerText = matrix[headerRow].map(clean).join(" "), units = sourceUnits(headerText), style = numberStyle(headerText), items = [];
    for (const row of matrix.slice(headerRow + 1)) {
      const first = clean(row.find(value => clean(value)) || "");
      if (TOTAL_RE.test(first)) break;
      const marking = clean(row[columns.marking]);
      if (!marking) continue;
      const description = columns.description >= 0 ? clean(row[columns.description]) : "";
      const unit = columns.unit >= 0 ? unitCode(row[columns.unit], units.quantity) : units.quantity;
      const gross = columns.gross >= 0 ? row[columns.gross] : "";
      const tare = columns.tare >= 0 ? row[columns.tare] : "";
      const quantityCell = columns.net >= 0 && clean(row[columns.net]) ? row[columns.net] : columns.quantity >= 0 ? row[columns.quantity] : gross;
      let amount = columns.amount >= 0 ? row[columns.amount] : "";
      if (!clean(amount)) {
        const tail = row.slice(Math.max(columns.price + 1, columns.quantity + 1)).map(value => ({ value, number: numberValue(value, style) })).filter(value => clean(value.value) && value.number > 0);
        amount = tail.length ? tail[tail.length - 1].value : "";
      }
      const item = normalizeItem(marking, description, quantityCell, unit, columns.price >= 0 ? row[columns.price] : "", units.price, amount, {
        style, gross: clean(gross) ? gross : quantityCell, tare: clean(tare) ? tare : null,
        packageNo: columns.packageNo >= 0 ? row[columns.packageNo] : "",
        packageCount: columns.packageCount >= 0 ? numberValue(row[columns.packageCount], style) : 1,
        packingType: columns.packingType >= 0 ? row[columns.packingType] : ""
      });
      if (item.weight > 0) items.push(item);
    }
    const joined = matrix.map(row => row.filter(value => clean(value)).join(" "));
    const meta = metadata(joined, fileName);
    Object.assign(meta, {
      company: matrixField(matrix, ["MESSRS", "SUPPLIER", "VENDOR", "거래처명"], headerRow) || meta.company,
      contractDate: matrixField(matrix, ["DATE", "CONTRACT DATE", "계약일"], headerRow) || meta.contractDate,
      address: matrixField(matrix, ["ADDRESS", "주소"], headerRow) || meta.address,
      tel: matrixField(matrix, ["TEL", "PHONE", "전화"], headerRow) || meta.tel,
      email: matrixField(matrix, ["EMAIL", "E-MAIL", "이메일"], headerRow) || meta.email,
      poNo: matrixField(matrix, ["PO NO", "P.O NO", "PONO", "P.O 넘버"], headerRow) || meta.poNo,
      soNo: matrixField(matrix, ["SO NO", "S.O NO", "SONO"], headerRow) || meta.soNo,
      a10No: matrixField(matrix, ["A10 NO", "A10NO"], headerRow) || meta.a10No,
      shipment: matrixField(matrix, ["SHIPMENT", "INCOTERMS"], headerRow) || meta.shipment,
      loadingTerm: matrixField(matrix, ["LOADING TERM", "입고예정일"], headerRow) || meta.loadingTerm,
      paymentTerm: matrixField(matrix, ["PAYMENT", "PAYMENT TERM"], headerRow) || meta.paymentTerm,
      packing: matrixField(matrix, ["PACKING", "PACKAGE"], headerRow) || meta.packing,
      note: matrixField(matrix, ["NOTE", "REMARK"], headerRow) || meta.note,
      items: dedupeItems([items]), matrix, diagnostics: { parser: "matrix", headerRow: headerRow + 1, version: VERSION }
    });
    return meta;
  }

  const core = { VERSION, round2, numberValue, unitCode, sourceUnits, normalizeItem, parseText, parseMatrix, selectBestRowGroup, documentQuality, declaredWeightTotal, mergeParsedCandidates, parsePackingListRows, parseContainerMaterialPackingRows, parseVmetContainerPackingRows, parseVmetInvoiceRows, parseTonJumboPackingRows, parseMergedMaterialPackingRows, parseMaterialNettGrossRows, parseIrelandAlloysPackingRows, parseColumnarContractOcr, parseQuantityDescriptionPriceRows, parsePurchaseOrderWeightRows, parseErpPurchaseOrderRows, parseJapanesePurchaseOrderRows, parseTosuiRows, parseParentheticalMtsPackingRows, parseMaterialAmountRows, parseMaterialPackageRows, parseParcelPackingRows, parseEuropeanGrossPackagingNetRows, parseCommodityQuantityRows, compact, headerKey };
  root.MesDocumentImporterV4 = core;
  globalThis.MesDocumentImporterV4 = core;
  globalThis.__mesDocumentImporterV4 = core;
  if (typeof module !== "undefined" && module.exports) module.exports = core;
  if (typeof document === "undefined") return;

  const style = document.createElement("style");
  style.textContent = `
    .mes-import-native{display:grid;gap:18px}.mes-import-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
    .mes-import-steps b{padding:12px 8px;border-radius:12px;background:#edf5f2;text-align:center;color:#0d5f4d}
    .mes-import-drop{display:block;padding:26px;border:2px dashed #87aa9f;border-radius:18px;background:#f7fbf9;text-align:center;cursor:pointer}
    .mes-import-drop input{display:block;width:100%;margin-top:16px;font-size:16px}.mes-import-status{padding:14px;border-radius:12px;background:#f1f4f3;font-weight:700}
    .mes-import-review{margin-bottom:14px;padding:14px;border-radius:12px;font-weight:800}.mes-import-review.ok{background:#e8f7f2;color:#086b58}.mes-import-review.warning{background:#fff0d5;color:#8b5400;border:1px solid #efbd5c}
    .mes-po-form-title{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;padding:18px;border-radius:14px;background:#0b3228;color:#fff}
    .mes-po-items{display:grid;gap:12px}.mes-po-item{display:grid;gap:12px;padding:16px;border:1px solid #cbd8d4;border-radius:16px;background:#fff}
    .mes-po-item-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.mes-po-item-grid label{min-width:0}.mes-po-item-grid input,.mes-po-item-grid select{width:100%}
    .mes-system-fields{grid-column:1/-1}.mes-system-fields summary{cursor:pointer;font-weight:800;color:#0d705b}.wide-modal{width:min(1180px,96vw)!important;max-width:1180px!important}
    @media(max-width:760px){.mes-import-steps{grid-template-columns:repeat(2,minmax(0,1fr))}.mes-po-item-grid{grid-template-columns:1fr 1fr}.mes-po-item-grid label:first-child,.mes-po-item-grid label:nth-child(2),.mes-system-fields{grid-column:1/-1}.mes-import-drop{padding:20px 12px}}
  `;
  document.head.appendChild(style);

  const byId = id => document.getElementById(id);
  let importRequest = 0;
  let masterMappings = null;

  function loadScript(src, test) {
    if (test()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(Error("문서 분석 모듈을 불러오지 못했습니다."));
      document.head.appendChild(script);
    });
  }

  async function mappings() {
    if (masterMappings) return masterMappings;
    try {
      const response = await fetch("cashcow-marking-master.json?v=20260804-2", { cache: "no-store" });
      const json = await response.json();
      masterMappings = Array.isArray(json.mappings) ? json.mappings : [];
    } catch (_) { masterMappings = []; }
    return masterMappings;
  }


  function similarity(a, b) {
    a = compact(a); b = compact(b);
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.includes(b) || b.includes(a)) return Math.min(1, Math.min(a.length, b.length) / Math.max(a.length, b.length) + 0.15);
    const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let left = 1; left <= a.length; left++) {
      let diagonal = previous[0]; previous[0] = left;
      for (let right = 1; right <= b.length; right++) {
        const above = previous[right], cost = a[left - 1] === b[right - 1] ? 0 : 1;
        previous[right] = Math.min(previous[right] + 1, previous[right - 1] + 1, diagonal + cost);
        diagonal = above;
      }
    }
    const editScore = 1 - previous[b.length] / Math.max(a.length, b.length);
    const bigrams = value => {
      const map = new Map();
      for (let index = 0; index < value.length - 1; index++) map.set(value.slice(index, index + 2), (map.get(value.slice(index, index + 2)) || 0) + 1);
      return map;
    };
    const leftPairs = bigrams(a), rightPairs = bigrams(b);
    let commonPairs = 0, pairCount = 0;
    leftPairs.forEach((count, key) => { pairCount += count; commonPairs += Math.min(count, rightPairs.get(key) || 0); });
    rightPairs.forEach(count => { pairCount += count; });
    const pairScore = pairCount ? 2 * commonPairs / pairCount : 0;
    return Math.max(editScore, pairScore);
  }

  function liveState() {
    try {
      if (typeof state !== "undefined" && state) return state;
    } catch (_) { /* separate browser script global */ }
    return root.state && typeof root.state === "object" ? root.state : {};
  }

  function activeRows(value) {
    return (Array.isArray(value) ? value : []).filter(row => row && !/CANCELLED|SUPERSEDED/i.test(String(row.status || row.inboundRequestStatus || "")));
  }

  function referenceKey(value) {
    return compact(value).replace(/^(?:PO|SO)/, "");
  }

  function savedRows(targetType) {
    const source = liveState(), rows = [], add = (kind, row) => rows.push({ ...row, __historyKind: kind });
    activeRows(source.pos).forEach(row => add("PO", row));
    activeRows(source.salesOrders).forEach(row => add("SO", row));
    ["splits", "bags", "gradeMasters"].forEach(collection => activeRows(source[collection]).forEach(row => add("GRADE", row)));
    activeRows(source.purchaseRequests).forEach(request => {
      activeRows(request.items).forEach(item => add("PO", { ...request, ...item, poNo: item.poNo || request.poNo, company: item.company || request.company }));
    });
    const target = String(targetType || "").toUpperCase();
    if (target === "SO") return rows.filter(row => row.__historyKind === "SO" || row.__historyKind === "GRADE");
    if (target === "PO" || target === "PACKING") return rows.filter(row => row.__historyKind === "PO" || row.__historyKind === "GRADE");
    return rows;
  }

  function rowMarking(row) {
    return clean(row && (row.mainGrade || row.grade || row.item || row.marking || row.detailGrade || row.description));
  }

  function rowSources(row) {
    return [...new Set([row && row.marking, row && row.sourceGrade, row && row.purchaseContractGrade, row && row.contractGrade, row && row.item, row && row.description, row && row.grade, row && row.mainGrade, row && row.subGrade, row && row.detailGrade].map(clean).filter(Boolean))];
  }

  function runtimeMappings(rows) {
    return rows.map(row => ({
      marking: rowMarking(row), description: clean(row.description || row.detailGrade), sources: rowSources(row),
      itemName: clean(row.item || row.description || row.purchaseContractGrade || row.contractGrade || row.marking || row.grade || row.mainGrade),
      productType: clean(row.productType || row.type), mainGrade: clean(row.mainGrade || row.grade),
      subGrade: clean(row.subGrade), detailGrade: clean(row.detailGrade || row.description)
    })).filter(map => map.marking && map.sources.length);
  }

  function savedItemEntries(rows) {
    const entries = [], seen = new Set();
    (Array.isArray(rows) ? rows : []).forEach(row => {
      const itemName = clean(row && (row.item || row.description || row.purchaseContractGrade || row.contractGrade || row.marking || row.grade || row.mainGrade));
      const key = compact(itemName);
      if (!itemName || key.length < 3 || seen.has(key)) return;
      seen.add(key);
      entries.push({ itemName, row, sources: rowSources(row) });
    });
    return entries;
  }

  function storedItemEvidence(items, entries) {
    const used = new Set(), matches = [];
    (Array.isArray(items) ? items : []).forEach((item, itemIndex) => {
      let best = null;
      (Array.isArray(entries) ? entries : []).forEach((entry, entryIndex) => {
        if (used.has(entryIndex)) return;
        const values = [item.marking, item.description, `${item.marking || ""} ${item.description || ""}`];
        const score = Math.max(0, ...values.flatMap(value => entry.sources.map(source => similarity(value, source))));
        if (!best || score > best.score) best = { entry, entryIndex, itemIndex, score };
      });
      if (best && best.score >= 0.68) { used.add(best.entryIndex); matches.push(best); }
    });
    return { matches, count: matches.length, coverage: items && items.length ? matches.length / items.length : 0 };
  }

  function storedItemRowRecovery(text, entries) {
    const source = String(text || ""), lines = source.split(/\r?\n/).map(clean).filter(Boolean);
    if (!lines.length || !entries.length) return [];
    const style = numberStyle(source), units = sourceUnits(source), priceFirst = /PRICE[^\n]{0,50}(?:Q.?TY|QUANTITY|WEIGHT)/i.test(source);
    const grossNet = /GROSS[^\n]{0,80}(?:TARE[^\n]{0,40})?NET/i.test(source), hasFinancial = /(?:UNIT\s+PRICE|PRICE)[^\n]{0,80}(?:AMOUNT|VALUE)|(?:AMOUNT|VALUE)[^\n]{0,80}(?:UNIT\s+PRICE|PRICE)/i.test(source);
    const recovered = [], seen = new Set();
    lines.forEach((line, lineIndex) => {
      if (TOTAL_RE.test(line) || /(?:DESCRIPTION|ITEM|MATERIAL|COMMODITY).*(?:Q.?TY|QUANTITY|WEIGHT|PRICE|AMOUNT)/i.test(line)) return;
      const lineKey = compact(line);
      let matched = null;
      entries.forEach(entry => {
        const score = Math.max(0, ...entry.sources.map(sourceName => {
          const key = compact(sourceName);
          if (key.length >= 4 && lineKey.includes(key)) return 1;
          return similarity(line, sourceName);
        }));
        if (!matched || score > matched.score) matched = { entry, score };
      });
      if (!matched || matched.score < 0.72) return;
      const nameNumbers = new Set(matched.entry.sources.flatMap(sourceName => numericTokens(sourceName, style).map(token => token.value)));
      let tokens = numericTokens(line, style).filter(token => !nameNumbers.has(token.value));
      if (tokens.length > 1 && tokens[0].index <= 3 && tokens[0].value > 0 && tokens[0].value <= 100) tokens = tokens.slice(1);
      if (!tokens.length) return;
      let quantity = 0, price = 0, amount = 0, gross = 0;
      for (let index = 0; index + 2 < tokens.length; index++) {
        const first = tokens[index].value, second = tokens[index + 1].value, third = tokens[index + 2].value;
        const q = priceFirst ? second : first, p = priceFirst ? first : second;
        if (q > 0 && p > 0 && third > 0 && Math.abs(q * p - third) <= Math.max(5, third * 0.08)) {
          quantity = q; price = p; amount = third; break;
        }
      }
      if (!quantity && grossNet && tokens.length >= 2) {
        gross = tokens[tokens.length - 2].value;
        quantity = tokens[tokens.length - 1].value;
      }
      if (!quantity && hasFinancial && tokens.length >= 2) {
        quantity = priceFirst ? tokens[tokens.length - 1].value : tokens[0].value;
        price = priceFirst ? tokens[0].value : tokens[1].value;
      }
      if (!quantity) quantity = tokens[tokens.length - 1].value;
      if (!(quantity > 0) || quantity > 1e8) return;
      const item = normalizeItem(matched.entry.itemName, "", quantity, units.quantity, price, units.price, amount, {
        gross: gross || quantity, sourceLineNo: lineIndex + 1
      });
      item.matchedItemName = matched.entry.itemName;
      const key = `${compact(item.matchedItemName)}|${round2(item.netWeight)}|${round2(item.amount)}|${lineIndex}`;
      if (!item.marking || item.netWeight <= 0 || seen.has(key)) return;
      seen.add(key); recovered.push(item);
    });
    if (recovered.length < 2) return [];
    const declared = declaredWeightTotal(source), recoveredWeight = round2(recovered.reduce((sum, item) => sum + item.netWeight, 0));
    if (declared > 0 && Math.abs(recoveredWeight - declared) > Math.max(2, declared * 0.05)) return [];
    return recovered;
  }

  function historyAlignment(items, rows) {
    const sourceItems = Array.isArray(items) ? items : [], sourceRows = Array.isArray(rows) ? rows : [];
    if (!sourceItems.length || !sourceRows.length) return 0;
    const used = new Set();
    let total = 0;
    sourceItems.forEach((item, index) => {
      let best = null;
      sourceRows.forEach((row, rowIndex) => {
        if (used.has(row)) return;
        const gradeScore = Math.max(0, ...rowSources(row).map(value => similarity(item.marking || item.description, value)));
        const rowWeight = Number(row.netWeight || row.weight || row.quantity || 0), itemWeight = Number(item.netWeight || item.weight || 0);
        const weightScore = rowWeight > 0 && itemWeight > 0 ? Math.max(0, 1 - Math.abs(rowWeight - itemWeight) / Math.max(rowWeight, itemWeight)) : 0;
        const score = gradeScore * 0.65 + weightScore * 0.3 + (rowIndex === index ? 0.05 : 0);
        if (!best || score > best.score) best = { row, score };
      });
      if (best) { used.add(best.row); total += best.score; }
    });
    return total / Math.max(sourceItems.length, sourceRows.length);
  }

  async function mapItems(documentData, options) {
    options = options || {};
    documentData.items = Array.isArray(documentData.items) ? documentData.items : [];
    documentData.diagnostics = documentData.diagnostics || { version: VERSION };
    const stateValue = liveState(), allRows = savedRows(), rows = savedRows(options.targetType), itemEntries = savedItemEntries(rows), master = await mappings();
    const list = [...runtimeMappings(allRows), ...master];
    const documentRefs = [documentData.poNo, documentData.soNo, options.poNo, options.soNo].map(referenceKey).filter(Boolean);
    const searchable = compact(`${documentData.sourceFile || ""} ${documentData.sourceText || ""}`);
    rows.forEach(row => {
      [row.poNo, row.soNo, row.orderNo].map(referenceKey).filter(value => value.length >= 4).forEach(value => {
        if (searchable.includes(value) && !documentRefs.includes(value)) documentRefs.push(value);
      });
    });
    const exactRows = rows.filter(row => [row.poNo, row.soNo, row.orderNo].map(referenceKey).some(value => value && documentRefs.includes(value)));
    const partnerRow = exactRows.find(row => clean(row.company || row.customer || row.partner));
    if (partnerRow) documentData.company = clean(partnerRow.company || partnerRow.customer || partnerRow.partner);
    else if (documentData.company) {
      const names = [...new Set(allRows.map(row => clean(row.company || row.customer || row.partner)).filter(Boolean))];
      const nearest = names.map(name => ({ name, score: similarity(documentData.company, name) })).sort((left, right) => right.score - left.score)[0];
      if (nearest && nearest.score >= 0.72) {
        documentData.company = nearest.name;
        documentData.diagnostics.partnerMatchedFromHistory = true;
      }
    }

    if (exactRows.length && Array.isArray(documentData.__candidateDocuments) && documentData.__candidateDocuments.length > 1) {
      const currentAlignment = historyAlignment(documentData.items, exactRows);
      const candidates = documentData.__candidateDocuments.map(candidate => ({ ...candidate, alignment: historyAlignment(candidate.items, exactRows) }))
        .sort((left, right) => right.alignment - left.alignment || right.confidence - left.confidence);
      const best = candidates[0];
      if (best && best.items.length && best.alignment >= 0.55 && best.alignment > currentAlignment + 0.05) {
        documentData.items = best.items.map(item => ({ ...item }));
        documentData.diagnostics.extractionMethod = best.method;
        documentData.diagnostics.confidence = best.confidence;
        documentData.diagnostics.historyCandidateSelection = true;
        documentData.diagnostics.usedSavedData = true;
      }
    }

    if (itemEntries.length && Array.isArray(documentData.__candidateDocuments) && documentData.__candidateDocuments.length) {
      const currentEvidence = storedItemEvidence(documentData.items, itemEntries);
      const candidates = documentData.__candidateDocuments.map(candidate => {
        const recovered = storedItemRowRecovery(candidate.text, itemEntries), items = recovered.length > candidate.items.length ? recovered : candidate.items;
        return { ...candidate, items, savedItemRowRecovery: recovered.length > candidate.items.length, evidence: storedItemEvidence(items, itemEntries) };
      })
        .sort((left, right) => right.evidence.count - left.evidence.count || right.items.length - left.items.length || right.evidence.coverage - left.evidence.coverage || right.confidence - left.confidence);
      const best = candidates[0];
      if (best && best.items.length > documentData.items.length && best.evidence.count >= 2 && best.evidence.count > currentEvidence.count) {
        documentData.items = best.items.map(item => ({ ...item }));
        documentData.diagnostics.extractionMethod = best.method;
        documentData.diagnostics.confidence = best.confidence;
        documentData.diagnostics.savedItemCandidateSelection = true;
        documentData.diagnostics.savedItemRowRecovery = !!best.savedItemRowRecovery;
        documentData.diagnostics.usedSavedData = true;
      }
    }

    if (!documentData.items.length && exactRows.length) {
      const recovered = [], seen = new Set();
      exactRows.forEach((row, index) => {
        const marking = rowMarking(row), weight = Number(row.netWeight || row.weight || row.quantity || 0);
        const key = `${compact(marking)}|${round2(weight)}|${clean(row.packageNo || row.id || index)}`;
        if (!marking || weight <= 0 || seen.has(key)) return;
        seen.add(key);
        const unitPrice = Number(row.unitPrice || row.price || 0), amount = Number(row.purchaseAmount || row.amount || row.foreignAmount || 0);
        const item = normalizeItem(marking, clean(row.description || row.detailGrade), weight, "KG", unitPrice, "KG", amount, {
          gross: row.grossWeight || weight, packageNo: row.packageNo, packageCount: row.packageCount || row.plannedPackageCount || 1,
          packingType: row.packingType || row.packing, sourceGradeLocked: true, sourceLineNo: index + 1
        });
        item.historyRecovered = true;
        recovered.push(item);
      });
      if (recovered.length) {
        documentData.items = recovered;
        documentData.diagnostics.historyRecovery = true;
        documentData.diagnostics.reviewRequired = true;
        documentData.diagnostics.warning = "문서 표 인식이 불완전하여 동일 번호의 저장자료로 품목을 복구했습니다. 저장 전 중량과 단가를 확인하세요.";
        documentData.diagnostics.confidence = Math.min(88, Number(documentData.diagnostics.confidence) || 88);
      }
    }

    const usedExactRows = new Set();
    documentData.items.forEach((item, index) => {
      let exact = null;
      exactRows.forEach((row, rowIndex) => {
        if (usedExactRows.has(row)) return;
        const sources = rowSources(row), gradeScore = Math.max(0, ...sources.map(value => similarity(item.marking, value)));
        const rowWeight = Number(row.netWeight || row.weight || row.quantity || 0), itemWeight = Number(item.netWeight || item.weight || 0);
        const weightScore = rowWeight > 0 && itemWeight > 0 ? Math.max(0, 1 - Math.abs(rowWeight - itemWeight) / Math.max(rowWeight, itemWeight)) : 0;
        const score = gradeScore * 0.65 + weightScore * 0.3 + (rowIndex === index ? 0.05 : 0);
        if (!exact || score > exact.score) exact = { row, score };
      });
      if (exact && (exact.score >= 0.45 || exactRows.length === documentData.items.length)) {
        const row = exact.row, matched = rowMarking(row) || item.marking;
        usedExactRows.add(row);
        item.matchedMarking = matched;
        item.matchedItemName = clean(row.item || row.description || row.purchaseContractGrade || row.contractGrade || matched);
        item.matchedDescription = clean(row.description || row.detailGrade || item.description);
        item.productType = clean(row.productType || (stateValue.gradeTypes && stateValue.gradeTypes[matched]) || item.productType);
        item.mainGrade = clean(row.mainGrade || row.grade || matched);
        item.subGrade = clean(row.subGrade);
        item.detailGrade = clean(row.detailGrade || row.description || item.description);
        item.matchConfidence = round2(Math.max(0.8, exact.score) * 100);
        documentData.diagnostics.usedSavedData = true;
        return;
      }
      if (item.sourceGradeLocked) {
        item.matchedMarking = item.marking;
        item.matchedDescription = item.description || "";
        item.productType = clean(item.productType || (stateValue.gradeTypes && stateValue.gradeTypes[item.marking]));
        item.matchConfidence = 100;
        return;
      }
      let best = null;
      list.forEach(map => {
        const candidates = [map.marking, ...(Array.isArray(map.sources) ? map.sources : [])];
        const score = Math.max(...candidates.map(value => similarity(item.marking, value)));
        if (!best || score > best.score) best = { map, score };
      });
      if (best && best.score >= 0.68) {
        item.matchedMarking = best.map.marking;
        item.matchedItemName = clean(best.map.itemName || best.map.description || best.map.marking);
        item.matchedDescription = best.map.description || item.description;
        item.productType = clean(best.map.productType || (stateValue.gradeTypes && stateValue.gradeTypes[best.map.marking]) || item.productType);
        item.mainGrade = clean(best.map.mainGrade || best.map.marking);
        item.subGrade = clean(best.map.subGrade || item.subGrade);
        item.detailGrade = clean(best.map.detailGrade || item.detailGrade || item.description);
        item.matchConfidence = round2(best.score * 100);
        documentData.diagnostics.usedSavedData = true;
      }
    });
    return documentData;
  }

  core.mapItems = mapItems;

  function textContentVariants(items) {
    const words = (items || []).map(item => ({
      text: clean(item.str), x: Number(item.transform && item.transform[4]) || 0,
      y: Number(item.transform && item.transform[5]) || 0
    })).filter(item => item.text);
    const groups = [];
    words.slice().sort((left, right) => right.y - left.y || left.x - right.x).forEach(item => {
      let row = groups.find(group => Math.abs(group.y - item.y) <= 3);
      if (!row) { row = { y: item.y, words: [] }; groups.push(row); }
      row.words.push(item);
    });
    const layout = groups.sort((left, right) => right.y - left.y).map(group => group.words.sort((left, right) => left.x - right.x).map(item => item.text).join(" ")).join("\n");
    return { layout, raw: words.map(item => item.text).join(" "), chars: words.reduce((sum, item) => sum + item.text.length, 0) };
  }

  function enhanceOcrCanvas(canvas) {
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    const image = context.getImageData(0, 0, canvas.width, canvas.height), data = image.data;
    for (let index = 0; index < data.length; index += 4) {
      const gray = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114;
      const value = gray > 218 ? 255 : Math.max(0, Math.min(255, (gray - 128) * 1.45 + 128));
      data[index] = data[index + 1] = data[index + 2] = value;
      data[index + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    return canvas;
  }

  async function ocrPdfPages(pdf, pageNumbers, pageSegMode, requestId) {
    await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js", () => !!root.Tesseract);
    let worker = null;
    const pages = [];
    try {
      worker = await root.Tesseract.createWorker("eng", 1, { logger: message => {
        if (message.status === "recognizing text" && requestId === importRequest && typeof setSync === "function") setSync(`사진 OCR ${pageSegMode === "6" ? "표" : "전체"} · ${Math.round((message.progress || 0) * 100)}%`);
      }});
      await worker.setParameters({ preserve_interword_spaces: "1", tessedit_pageseg_mode: String(pageSegMode), user_defined_dpi: "300" });
      for (const pageNumber of pageNumbers) {
        if (requestId !== importRequest) throw Error("새 파일을 선택하여 이전 분석을 중단했습니다.");
        if (typeof setSync === "function") setSync(`페이지 사진 ${pageNumber}/${pdf.numPages} · OCR ${pageSegMode === "6" ? "표 재구성" : "전체 읽기"}`);
        const page = await pdf.getPage(pageNumber), viewport = page.getViewport({ scale: pageSegMode === "6" ? 2.65 : 3 });
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d", { alpha: false, willReadFrequently: pageSegMode === "6" });
        context.fillStyle = "#fff"; context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport, background: "white" }).promise;
        const result = await worker.recognize(pageSegMode === "6" ? enhanceOcrCanvas(canvas) : canvas);
        pages.push(String(result.data && result.data.text || ""));
        canvas.width = 1; canvas.height = 1;
      }
    } finally { if (worker) await worker.terminate(); }
    return pages.join("\n");
  }

  async function ocrPdfTableBands(pdf, pageNumbers, baseText, requestId) {
    await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js", () => !!root.Tesseract);
    let worker = null;
    const bandTexts = [[], []], bands = [{ top: 0.17, height: 0.52 }, { top: 0.36, height: 0.52 }];
    try {
      worker = await root.Tesseract.createWorker("eng", 1, { logger: message => {
        if (message.status === "recognizing text" && requestId === importRequest && typeof setSync === "function") setSync(`표 영역 정밀 OCR · ${Math.round((message.progress || 0) * 100)}%`);
      }});
      await worker.setParameters({ preserve_interword_spaces: "1", tessedit_pageseg_mode: "4", user_defined_dpi: "300" });
      for (const pageNumber of pageNumbers) {
        if (requestId !== importRequest) throw Error("새 파일을 선택하여 이전 분석을 중단했습니다.");
        const page = await pdf.getPage(pageNumber), viewport = page.getViewport({ scale: 4.15 }), source = document.createElement("canvas");
        source.width = Math.ceil(viewport.width); source.height = Math.ceil(viewport.height);
        const sourceContext = source.getContext("2d", { alpha: false });
        sourceContext.fillStyle = "#fff"; sourceContext.fillRect(0, 0, source.width, source.height);
        await page.render({ canvasContext: sourceContext, viewport, background: "white" }).promise;
        for (let bandIndex = 0; bandIndex < bands.length; bandIndex++) {
          const band = bands[bandIndex], top = Math.floor(source.height * band.top), height = Math.min(source.height - top, Math.floor(source.height * band.height));
          const crop = document.createElement("canvas"); crop.width = source.width; crop.height = height;
          const cropContext = crop.getContext("2d", { alpha: false, willReadFrequently: true });
          cropContext.fillStyle = "#fff"; cropContext.fillRect(0, 0, crop.width, crop.height);
          cropContext.drawImage(source, 0, top, source.width, height, 0, 0, crop.width, crop.height);
          const result = await worker.recognize(enhanceOcrCanvas(crop));
          bandTexts[bandIndex].push(String(result.data && result.data.text || ""));
          crop.width = 1; crop.height = 1;
        }
        source.width = 1; source.height = 1;
      }
    } finally { if (worker) await worker.terminate(); }
    return bandTexts.map((pages, index) => ({ method: `페이지사진-표영역OCR-${index + 1}`, text: `${pages.join("\n")}\n${baseText || ""}` }));
  }

  async function pdfDocuments(file, requestId) {
    await loadScript("https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js", () => !!root.pdfjsLib);
    root.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
    const pdf = await root.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const layoutPages = [], rawPages = [], scannedPages = [], candidates = [];
    try {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        if (requestId !== importRequest) throw Error("새 파일을 선택하여 이전 분석을 중단했습니다.");
        if (typeof setSync === "function") setSync(`원본문자 ${pageNumber}/${pdf.numPages} 페이지 분석 중`);
        const page = await pdf.getPage(pageNumber), content = await page.getTextContent(), variants = textContentVariants(content.items);
        layoutPages.push(variants.layout); rawPages.push(variants.raw);
        if (variants.chars < 80) scannedPages.push(pageNumber);
      }
      const layoutText = layoutPages.join("\n"), rawText = rawPages.join("\n");
      if (clean(layoutText)) candidates.push({ method: "원본문자-위치복원", text: layoutText, data: parseText(layoutText, file.name) });
      if (clean(rawText) && compact(rawText) !== compact(layoutText)) candidates.push({ method: "원본문자-연속읽기", text: rawText, data: parseText(rawText, file.name) });
      let combined = mergeParsedCandidates(candidates), ocrPageNumbers = scannedPages.length ? scannedPages : Array.from({ length: Math.min(pdf.numPages, 3) }, (_, index) => index + 1);
      if (combined.documentType !== "INSURANCE" && ocrPageNumbers.length) {
        const ocrFull = await ocrPdfPages(pdf, ocrPageNumbers, "3", requestId);
        if (clean(ocrFull)) candidates.push({ method: "페이지사진-OCR", text: ocrFull, data: parseText(ocrFull, file.name) });
        combined = mergeParsedCandidates(candidates);
        if (scannedPages.length || combined.diagnostics.confidence < 85 || combined.diagnostics.candidateDisagreement) {
          const ocrTable = await ocrPdfPages(pdf, ocrPageNumbers, "6", requestId);
          if (clean(ocrTable)) candidates.push({ method: "페이지사진-표OCR", text: ocrTable, data: parseText(ocrTable, file.name) });
          combined = mergeParsedCandidates(candidates);
        }
        if (!combined.items.length || combined.diagnostics.confidence < 80 || combined.diagnostics.weightTotalMismatch) {
          const baseText = candidates.map(candidate => candidate.text).find(text => declaredWeightTotal(text) > 0) || candidates.map(candidate => candidate.text).find(Boolean) || "";
          const bands = await ocrPdfTableBands(pdf, ocrPageNumbers, baseText, requestId);
          bands.forEach(candidate => { if (clean(candidate.text)) candidates.push({ ...candidate, data: parseText(candidate.text, file.name) }); });
          combined = mergeParsedCandidates(candidates);
        }
      }
      combined.diagnostics.pageCount = pdf.numPages;
      combined.diagnostics.ocrPages = combined.diagnostics.extractionCandidates.some(candidate => /OCR/.test(candidate.method)) ? ocrPageNumbers : [];
      if (combined.diagnostics.weightTotalMismatch) {
        combined.diagnostics.reviewRequired = true;
        combined.diagnostics.warning = `문서 합계 ${combined.diagnostics.declaredNetWeight.toLocaleString()} kg과 인식행 합계 ${combined.diagnostics.selectedNetWeight.toLocaleString()} kg이 달라 저장 전 확인이 필요합니다.`;
      }
      combined.sourceFile = combined.sourceFile || file.name;
      return combined;
    } finally { if (pdf && pdf.destroy) await pdf.destroy(); }
  }

  async function imageDocuments(file, requestId) {
    await loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js", () => !!root.Tesseract);
    let worker = null;
    const candidates = [];
    try {
      worker = await root.Tesseract.createWorker("eng", 1, { logger: message => {
        if (requestId === importRequest && message.status === "recognizing text" && typeof setSync === "function") setSync(`사진 문자 인식 ${Math.round((message.progress || 0) * 100)}%`);
      }});
      for (const mode of ["3", "6"]) {
        await worker.setParameters({ preserve_interword_spaces: "1", tessedit_pageseg_mode: mode, user_defined_dpi: "300" });
        const result = await worker.recognize(file), text = String(result.data && result.data.text || "");
        if (clean(text)) candidates.push({ method: mode === "3" ? "사진-OCR" : "사진-표OCR", text, data: parseText(text, file.name) });
      }
    } finally { if (worker) await worker.terminate(); }
    const combined = mergeParsedCandidates(candidates);
    combined.diagnostics.ocrPages = [1]; combined.diagnostics.pageCount = 1;
    combined.sourceFile = combined.sourceFile || file.name;
    return combined;
  }

  async function importFile(file, options) {
    options = options || {};
    if (!file) throw Error("파일을 선택하세요.");
    const requestId = ++importRequest, name = file.name || "", lower = name.toLowerCase();
    let parsed;
    if (/\.(?:xlsx|xls|csv|tsv)$/.test(lower)) {
      if (typeof mesEnsureXlsx === "function") await mesEnsureXlsx();
      else await loadScript("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js", () => !!root.XLSX);
      const workbook = root.XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
      const candidates = workbook.SheetNames.map(sheetName => parseMatrix(root.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "", raw: false }), name));
      parsed = candidates.sort((a, b) => documentQuality(b) - documentQuality(a) || b.items.length - a.items.length)[0];
      parsed.diagnostics.sheets = workbook.SheetNames.length;
      parsed.diagnostics.confidence = documentQuality(parsed);
    } else if (/\.pdf$/.test(lower)) parsed = await pdfDocuments(file, requestId);
    else if (/\.(?:png|jpe?g|webp|bmp|heic)$/i.test(lower) || /^image\//.test(file.type || "")) parsed = await imageDocuments(file, requestId);
    else {
      const text = await file.text();
      parsed = mergeParsedCandidates([{ method: "텍스트", text, data: parseText(text, name) }]);
    }
    if (requestId !== importRequest) throw Error("새 파일을 선택하여 이전 분석을 중단했습니다.");
    if (parsed.documentType === "INSURANCE") throw Error("보험증권은 품목 불러오기 대상이 아닙니다. 해당 거래의 Invoice 또는 Packing List를 선택하세요.");
    parsed = await mapItems(parsed, options);
    if (!parsed.items.length) throw Error("원본문자·페이지 사진 OCR·저장자료 대조에서도 강종·중량 행을 찾지 못했습니다. 표 전체가 보이는 파일인지 확인하세요.");
    return parsed;
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
      poNo: source.poNo || "", company: source.company || "", contractDate: source.contractDate || "", address: source.address || "", tel: source.tel || "", fax: source.fax || "", email: source.email || "", soNo: source.soNo || "", a10No: source.a10No || "", shipment: source.shipment || "", loadingTerm: source.loadingTerm || "", paymentTerm: source.paymentTerm || "", packing: source.packing || "", note: source.note || "", currency: source.currency || "USD", sourceFile: source.sourceFile || "직접입력", diagnostics: source.diagnostics || {}, items: source.items && source.items.length ? source.items : [{}]
    };
  }

  function openDirectPo(documentData) {
    const source = poDocumentDefaults(documentData);
    const amountMismatchCount = source.items.filter(item => item.amountMismatch).length;
    const importWarning = amountMismatchCount
      ? `<div class="wide mes-import-review warning">금액 불일치 ${amountMismatchCount}건을 감지해 중량×단가로 자동 보정했습니다. 표시된 중량·단가·TOTAL VALUE를 확인하세요.</div>`
      : (source.diagnostics.reviewRequired ? `<div class="wide mes-import-review warning">${escHtml(source.diagnostics.warning || "자동 인식 결과를 저장 전에 확인하세요.")}</div>` : "");
    byId("modalTitle").textContent = "P.O 직접입력 · 업로드 양식과 동일 항목";
    byId("modalBody").innerHTML = `<form id="mesPoV4Form" class="form-grid mes-po-form" onsubmit="saveMesPoV4(event,this)">
      <div class="wide mes-po-form-title"><b>PURCHASE CONTRACT</b><span>CASH COW METAL CO.,LTD · 입력 후 현장관리 공용서버 동시 반영</span></div>
      ${importWarning}
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
      <label>통화<select name="currency">${["USD", "KRW", "JPY", "EUR", "GBP"].map(value => `<option ${source.currency === value ? "selected" : ""}>${value}</option>`).join("")}</select></label><label>환율<input name="rate" type="number" step="0.01" value="1"></label>
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
      const parsed = await importFile(file, { targetType: "PO" });
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
      const parsed = await importFile(file, { targetType: "PACKING", poNo }), sourceRows = safe(po.rows);
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
