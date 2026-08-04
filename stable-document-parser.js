(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ScrapDocParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PACKING_WORDS = /\b(?:PALLET|PAIL|BAG|BOX|DRUM|BUNDLE|PACK(?:AGE)?|SKID|TON\s*BAG|FLECON|FLEXIBLE|\ud314\ub81b|\ud1a4\ubc31|\ub9c8\ub300|\ubc15\uc2a4|\ub4dc\ub7fc)\b/i;
  const SKIP_LINE = /(?:TOTAL|SUBTOTAL|PAGE\s*TOTAL|UNIT\s*PRICE|AMOUNT|RATE\s*%|ANALYSIS\s*%|BANK\s*DETAIL|PAYMENT|SHIPMENT|ORIGIN|REMARK)/i;

  function clean(value) {
    return String(value == null ? '' : value).replace(/\u00a0/g, ' ').replace(/[\t ]+/g, ' ').trim();
  }

  function normalize(value) {
    return clean(value).toUpperCase().replace(/INCONEL/g, 'I').replace(/UDIMET/g, 'U').replace(/TITANIUM/g, 'TI').replace(/STAINLESS/g, 'STS').replace(/[^A-Z0-9\u3131-\uD79D]/g, '');
  }

  function parseWeight(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const text = clean(value).replace(/,/g, '');
    const match = text.match(/-?\d+(?:\.\d+)?/);
    return match ? Number(match[0]) || 0 : 0;
  }

  function uniqueJoin(values) {
    const out = [];
    values.map(clean).filter(Boolean).forEach(value => {
      if (!out.some(existing => normalize(existing) === normalize(value))) out.push(value);
    });
    return out.join(' / ');
  }

  function headerKey(value) {
    return clean(value).toUpperCase().replace(/[\s._\-/#()\[\]]/g, '');
  }

  function headerRole(value) {
    const key = headerKey(value);
    if (!key) return '';
    if (/^(PONUMBER|PONO|PURCHASEORDER|PURCHASEORDERNO|PO\ub118\ubc84|\uacc4\uc57d\ubc88\ud638|\ubc1c\uc8fc\ubc88\ud638)$/.test(key)) return 'po';
    if (/^(SONUMBER|SONO|SALESORDER|SALESORDERNO|SO\ub118\ubc84|\ucd9c\ud558\uc9c0\uc2dc\ubc88\ud638)$/.test(key)) return 'so';
    if (/^(VENDOR|SUPPLIER|SELLER|COMPANY|CUSTOMER|BUYER|SHIPTO|SOLDTO|\uac70\ub798\ucc98|\uac70\ub798\ucc98\uba85|\ub9e4\uc785\ucc98|\ud310\ub9e4\ucc98|\ucd9c\ud558\ucc98)$/.test(key)) return 'company';
    if (/^(COMMODITY|GRADE|DESCRIPTION|ITEMDESCRIPTION|PRODUCTDESCRIPTION|MATERIAL|MATERIALGRADE|ITEM|PRODUCT|FORM|SHAPE|MATERIALFORM|PRODUCTFORM|CONDITION|\uac15\uc885|\uac15\uc885\uba85|\uc0c1\ud488\uba85|\ud488\uba85|\ud488\uc885|\ud615\uc0c1|\uc0c1\uc138\uac15\uc885)$/.test(key)) return 'detail';
    if (/^(NW|NETWEIGHT|NETWT|QUANTITYKG|QTYKG|WEIGHTKG|WEIGHT|QUANTITY|QTY|\uc911\ub7c9|\uc911\ub7c9KG|\uc21c\uc911\ub7c9|\uc218\ub7c9KG)$/.test(key)) return 'weight';
    if (/^(GW|GROSSWEIGHT|GROSSWT)$/.test(key)) return 'gross';
    if (/^(UNITPRICE|PRICE|USDPRICE|UNITPRICEUSD|PRICEUSD|\ub2e8\uac00|\ub9e4\uc785\ub2e8\uac00|USD\ub2e8\uac00)$/.test(key)) return 'unitPrice';
    if (/^(EXCHANGERATE|FXRATE|USDKRW|\ud658\uc728|\ub9e4\uc785\ud658\uc728)$/.test(key)) return 'exchangeRate';
    if (/^(CONTAINER|CONTAINERSPEC|CONTAINERTYPE|\ucee8\ud14c\uc774\ub108|\ucee8\ud14c\uc774\ub108\uaddc\uaca9)$/.test(key)) return 'containerSpec';
    if (/^(PURCHASESTATUS|PURCHASEYN|\uad6c\ub9e4\uc5ec\ubd80|\ub9e4\uc785\uc5ec\ubd80)$/.test(key)) return 'purchaseStatus';
    if (/^(ETA|ARRIVALDATE|EXPECTEDARRIVAL|\uc785\ud56d\uc608\uc815\uc77c|\uc785\uace0\uc608\uc815\uc77c)$/.test(key)) return 'eta';
    if (/^(NO|NUMBER|PACKAGENO|PACKINGNO|BAGNO|PALLETNO|PKGNO|\ud328\ud0a4\uc9c0\ubc88\ud638|\ub9c8\ub300\ubc88\ud638|\ubc88\ud638)$/.test(key)) return 'sourceNo';
    if (/^(PACKAGES|PACKAGECOUNT|PACKINGQTY|BAGS|COUNT|\ud328\ud0a4\uc9c0\uc218|\ub9c8\ub300\uc218|\uac1c\uc218)$/.test(key)) return 'count';
    if (/^(DATE|ORDERDATE|PODATE|SODATE|\uacc4\uc57d\uc77c|\ubc1c\uc8fc\uc77c|\ucd9c\ud558\uc77c|\uc608\uc815\uc77c)$/.test(key)) return 'date';
    return '';
  }

  function findHeader(matrix) {
    let best = null;
    const limit = Math.min(matrix.length, 45);
    for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
      const row = Array.isArray(matrix[rowIndex]) ? matrix[rowIndex] : [];
      const roles = row.map(headerRole);
      const detailCount = roles.filter(role => role === 'detail').length;
      const hasWeight = roles.includes('weight') || roles.includes('gross');
      const score = detailCount * 5 + (roles.includes('weight') ? 5 : 0) + (roles.includes('gross') ? 2 : 0) + (roles.includes('po') || roles.includes('so') ? 2 : 0) + (roles.includes('company') ? 2 : 0) + (roles.includes('sourceNo') ? 1 : 0);
      if (detailCount && hasWeight && (!best || score > best.score)) best = { rowIndex, row, roles, score };
    }
    return best;
  }

  function cellDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    const text = clean(value);
    const match = text.match(/(20\d{2})[.\-/\ub144]\s*(\d{1,2})[.\-/\uc6d4]\s*(\d{1,2})/);
    return match ? `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}` : text;
  }

  function parseSheet(matrix, fileName) {
    const header = findHeader(matrix);
    if (!header) return { rows: [], meta: { documentNo: inferDocumentNo('', fileName), company: '', date: '' }, warning: '\ud45c \uba38\ub9ac\uae00(COMMODITY/GRADE/DESCRIPTION\uacfc \uc911\ub7c9)\uc744 \ucc3e\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4.' };
    const indices = { detail: [], po: -1, so: -1, company: -1, weight: -1, gross: -1, unitPrice: -1, exchangeRate: -1, containerSpec: -1, purchaseStatus: -1, eta: -1, sourceNo: -1, count: -1, date: -1 };
    header.roles.forEach((role, index) => {
      if (role === 'detail') indices.detail.push(index);
      else if (role && Object.prototype.hasOwnProperty.call(indices, role) && indices[role] < 0) indices[role] = index;
    });
    const above = matrix.slice(Math.max(0, header.rowIndex - 4), header.rowIndex + 1).flat().map(clean).filter(Boolean).join(' ');
    const unitLb = /\b(?:LB|LBS|POUND)\b/i.test(above);
    const rows = [];
    let carriedPo = '', carriedSo = '', carriedCompany = '', carriedDate = '', carriedExchangeRate = '', carriedContainerSpec = '', carriedPurchaseStatus = '', carriedEta = '';
    for (let rowIndex = header.rowIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
      const source = Array.isArray(matrix[rowIndex]) ? matrix[rowIndex] : [];
      const detail = uniqueJoin(indices.detail.map(index => source[index]));
      let netWeight = parseWeight(indices.weight >= 0 ? source[indices.weight] : source[indices.gross]);
      let grossWeight = parseWeight(indices.gross >= 0 ? source[indices.gross] : '');
      if (unitLb) { netWeight *= 0.45359237; grossWeight *= 0.45359237; }
      const weight = netWeight || grossWeight;
      if (!detail || !weight || /^(TOTAL|PAGE TOTAL|SUBTOTAL)$/i.test(detail)) continue;
      if (indices.po >= 0 && clean(source[indices.po])) carriedPo = clean(source[indices.po]);
      if (indices.so >= 0 && clean(source[indices.so])) carriedSo = clean(source[indices.so]);
      if (indices.company >= 0 && clean(source[indices.company])) carriedCompany = clean(source[indices.company]);
      if (indices.date >= 0 && clean(source[indices.date])) carriedDate = cellDate(source[indices.date]);
      if (indices.exchangeRate >= 0 && clean(source[indices.exchangeRate])) carriedExchangeRate = parseWeight(source[indices.exchangeRate]);
      if (indices.containerSpec >= 0 && clean(source[indices.containerSpec])) carriedContainerSpec = clean(source[indices.containerSpec]);
      if (indices.purchaseStatus >= 0 && clean(source[indices.purchaseStatus])) carriedPurchaseStatus = clean(source[indices.purchaseStatus]);
      if (indices.eta >= 0 && clean(source[indices.eta])) carriedEta = cellDate(source[indices.eta]);
      rows.push({
        detailGrade: detail,
        weight: Math.round(weight * 1000) / 1000,
        netWeight: Math.round(weight * 1000) / 1000,
        grossWeight: Math.round(grossWeight * 1000) / 1000 || '',
        unitPriceUsd: indices.unitPrice >= 0 ? parseWeight(source[indices.unitPrice]) || '' : '',
        sourcePackageNo: indices.sourceNo >= 0 ? clean(source[indices.sourceNo]) : '',
        packageCount: Math.max(1, Math.round(parseWeight(indices.count >= 0 ? source[indices.count] : 1))),
        documentNo: carriedPo || carriedSo || '',
        company: carriedCompany,
        date: carriedDate,
        exchangeRate: carriedExchangeRate,
        containerSpec: carriedContainerSpec,
        purchaseStatus: carriedPurchaseStatus,
        eta: carriedEta,
        sourceRow: rowIndex + 1
      });
    }
    const first = rows[0] || {};
    return {
      rows,
      meta: {
        documentNo: first.documentNo || inferDocumentNo('', fileName),
        company: first.company || '',
        date: first.date || '',
        exchangeRate: first.exchangeRate || '',
        containerSpec: first.containerSpec || '',
        purchaseStatus: first.purchaseStatus || '',
        eta: first.eta || ''
      },
      warning: ''
    };
  }

  function inferDocumentNo(text, fileName) {
    const body = String(text || '').replace(/\r/g, ' ');
    const patterns = [
      /\bNO[ \t]*[.:#-]*[ \t]*([A-Z0-9][A-Z0-9_\-/]{4,})/i,
      /(?:P[ \t]*\.?[ \t]*O[ \t]*\.?|PURCHASE[ \t]+ORDER|S[ \t]*\.?[ \t]*O[ \t]*\.?|SALES[ \t]+ORDER)[ \t]*(?:NO|NUMBER|#|:|\.)*[ \t]*([A-Z0-9][A-Z0-9_\-/]{3,})/i,
      /INVOICE[ \t]*(?:NO|NUMBER|#|:|\.)+[ \t]*([A-Z0-9][A-Z0-9_\-/]{3,})/i
    ];
    for (const pattern of patterns) {
      const match = body.match(pattern);
      if (match) return match[1];
    }
    const name = clean(fileName).replace(/\.[^.]+$/, '');
    const hash = name.match(/[\uff03#]\s*([A-Z0-9][A-Z0-9_-]{3,})/i);
    if (hash) return hash[1];
    const longCode = name.match(/(?:^|[^0-9])(\d{5,})(?:[^0-9]|$)/);
    return longCode ? longCode[1] : '';
  }

  function inferCompany(text) {
    const lines = String(text || '').split(/\r?\n/).map(clean).filter(Boolean);
    for (let i = 0; i < lines.length; i += 1) {
      const labelled = lines[i].match(/^(?:SUPPLIER|VENDOR|SELLER|FROM|CUSTOMER|BUYER)\s*[:\-]\s*(.+)$/i);
      if (labelled && labelled[1]) return labelled[1];
      if (/^(?:SUPPLIER|VENDOR|SELLER|FROM)\s*[:\-]?$/i.test(lines[i]) && lines[i + 1]) return lines[i + 1];
    }
    return lines.find(line => /\b(?:INC\.?|CO\.?\s*,?\s*LTD\.?|CORP\.?|CORPORATION|METAL|METALS|RECYCLING)\b/i.test(line) && !/SHIN\s*SUNG|\uc2e0\uc131\uae08\uc18d/i.test(line) && line.length < 100) || '';
  }

  function inferDate(text) {
    const source = String(text || '');
    const match = source.match(/(?:DATE\s*[:.]?\s*)?(20\d{2})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/i);
    return match ? `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}` : '';
  }

  function parseText(text, fileName) {
    const lines = String(text || '').replace(/\r/g, '\n').split(/\n+/).map(clean).filter(Boolean);
    const rows = [];
    for (let index = 0; index < lines.length; index += 1) {
      let line = lines[index].replace(/[|]+/g, ' ').replace(/\ud314\s*[\ub81b\ub7ab\ud587]|\ud1a4\s*\ubc31/gi, ' PALLET ');
      if (!line || SKIP_LINE.test(line) || /COMMODITY.*(?:QUANTITY|WEIGHT)/i.test(line)) continue;
      const numbered = line.match(/^\s*(\d{1,4})[.)\-]?\s+(.+)$/);
      const sourcePackageNo = numbered ? numbered[1] : '';
      if (numbered) line = numbered[2];
      let description = '', weight = 0;
      const packingMatch = PACKING_WORDS.exec(line);
      if (packingMatch) {
        const before = line.slice(0, packingMatch.index).trim();
        const quantity = before.match(/([\d,]+(?:\.\d+)?)\s*(?:KG|KGS|LBS?)?\s*$/i);
        if (quantity) {
          weight = parseWeight(quantity[1]);
          description = before.slice(0, quantity.index).trim();
        }
      }
      if (!weight) {
        const withKg = line.match(/^(.*?)\s+([\d,]+(?:\.\d+)?)\s*(?:KG|KGS)\b/i);
        if (withKg) {
          description = withKg[1].trim();
          weight = parseWeight(withKg[2]);
        }
      }
      if (!weight) {
        const decimals = [...line.matchAll(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d+\.\d+\b/g)];
        const candidate = decimals.find(match => match.index > 1);
        if (candidate) {
          description = line.slice(0, candidate.index).trim();
          weight = parseWeight(candidate[0]);
        }
      }
      description = description.replace(/\s+(?:QTY|QUANTITY|WEIGHT)$/i, '').trim();
      if (!description || !weight || SKIP_LINE.test(description)) continue;
      rows.push({ detailGrade: description, weight, netWeight: weight, grossWeight: '', unitPriceUsd: '', sourcePackageNo, packageCount: 1, documentNo: '', company: '', date: '', sourceRow: index + 1 });
    }
    const deduped = [];
    rows.forEach(row => {
      const key = `${row.sourcePackageNo}|${normalize(row.detailGrade)}|${row.weight}`;
      if (!deduped.some(existing => existing._key === key)) deduped.push({ ...row, _key: key });
    });
    return {
      rows: deduped.map(({ _key, ...row }) => row),
      meta: { documentNo: inferDocumentNo(text, fileName), company: inferCompany(text), date: inferDate(text) },
      warning: deduped.length ? '' : '\ud45c\uc758 \ud488\uba85\uacfc \uc911\ub7c9\uc744 \uc790\ub3d9\uc73c\ub85c \ucc3e\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4. OCR \uc6d0\ubb38\uc744 \ud655\uc778\ud558\uace0 \ud589\uc744 \ucd94\uac00\ud574 \uc8fc\uc138\uc694.'
    };
  }

  function ocrQuantity(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (!digits) return 0;
    if (digits.length >= 4 && digits.endsWith('01')) digits = digits.slice(0, -1);
    let number = Number(digits) || 0;
    if (digits.length >= 4 && digits.endsWith('00')) number /= 100;
    else if (digits.length >= 3 && digits.endsWith('0')) number /= 10;
    return number;
  }

  function parseRuledTableText(text, fileName) {
    const lines = String(text || '').split(/\r?\n/).map(line => line.trimEnd()).filter(Boolean);
    const rows = [];
    lines.forEach((line, index) => {
      if (SKIP_LINE.test(line) || !/^\s*\d{1,3}\D/.test(line)) return;
      const segments = line.trim().split(/\s{2,}/).map(clean).filter(Boolean);
      if (segments.length < 3) return;
      const rowToken = segments.shift();
      const detailIndex = segments.findIndex(value => /[A-Z\u3131-\uD79D]{2,}/i.test(value) && !/^(?:H|I|L|PACKING|PALLET)$/i.test(value));
      if (detailIndex < 0) return;
      const detailGrade = segments[detailIndex].replace(/^[|:[\]{}%]+|[|:[\]{}%]+$/g, '').trim();
      const tail = segments.slice(detailIndex + 1);
      let quantityToken = '';
      for (const value of tail) {
        const match = value.match(/\d[\d.,]{1,5}/);
        if (match) { quantityToken = match[0]; break; }
      }
      const weight = ocrQuantity(quantityToken);
      if (!detailGrade || weight <= 0) return;
      rows.push({ detailGrade, weight, netWeight: weight, grossWeight: '', unitPriceUsd: '', sourcePackageNo: String(rowToken).replace(/\D/g, '').slice(-3), packageCount: 1, documentNo: '', company: '', date: '', sourceRow: index + 1 });
    });
    return { rows, meta: { documentNo: inferDocumentNo(text, fileName), company: inferCompany(text), date: inferDate(text) }, warning: rows.length ? '' : '\ud45c \ud589\uc758 \ud488\uba85\uacfc \uc218\ub7c9\uc744 \ubcf5\uc6d0\ud558\uc9c0 \ubabb\ud588\uc2b5\ub2c8\ub2e4.' };
  }

  function levenshtein(a, b) {
    const x = normalize(a), y = normalize(b);
    if (!x) return y.length;
    if (!y) return x.length;
    const previous = Array.from({ length: y.length + 1 }, (_, index) => index);
    for (let i = 1; i <= x.length; i += 1) {
      let diagonal = previous[0];
      previous[0] = i;
      for (let j = 1; j <= y.length; j += 1) {
        const saved = previous[j];
        previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (x[i - 1] === y[j - 1] ? 0 : 1));
        diagonal = saved;
      }
    }
    return previous[y.length];
  }

  function similarity(source, candidate) {
    const a = normalize(source), b = normalize(candidate);
    if (!a || !b) return 0;
    if (a === b) return 1;
    const containment = a.includes(b) || b.includes(a) ? Math.min(a.length, b.length) / Math.max(a.length, b.length) : 0;
    const edit = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
    const sourceTokens = new Set(clean(source).toUpperCase().match(/[A-Z]+|\d+(?:\.\d+)?|[\u3131-\uD79D]+/g) || []);
    const candidateTokens = new Set(clean(candidate).toUpperCase().match(/[A-Z]+|\d+(?:\.\d+)?|[\u3131-\uD79D]+/g) || []);
    const common = [...candidateTokens].filter(token => sourceTokens.has(token)).length;
    const tokenScore = common / Math.max(1, candidateTokens.size);
    return Math.max(containment * 0.9, edit * 0.72, tokenScore * 0.88);
  }

  function bestMatch(source, candidates, threshold) {
    const ranked = [...new Set((candidates || []).map(clean).filter(Boolean))]
      .map(value => ({ value, score: similarity(source, value) }))
      .sort((a, b) => b.score - a.score);
    return ranked[0] && ranked[0].score >= (threshold == null ? 0.42 : threshold) ? ranked[0] : { value: '', score: ranked[0] ? ranked[0].score : 0 };
  }

  function inferType(detail, main, gradeTypes) {
    if (main && gradeTypes && gradeTypes[main]) return gradeTypes[main];
    const text = normalize(`${detail} ${main}`);
    if (/TI6|CPTI|TIALLOY|TITANIUM/.test(text)) return 'TI';
    if (/STS|SUS|STAINLESS/.test(text)) return 'STS';
    if (/\bCO|COBALT|HS25|L605|STELLITE/.test(clean(`${detail} ${main}`).toUpperCase())) return 'CO';
    if (/MOLY|\bMO\b/.test(clean(`${detail} ${main}`).toUpperCase())) return 'MO';
    if (/COPPER|\bCU\b/.test(clean(`${detail} ${main}`).toUpperCase())) return 'CU';
    if (/I\d{3}|INCONEL|NICKEL|NICO|U720|UDIMET|WASPALOY|HASTELLOY|NIMONIC|NI/.test(text)) return 'NI';
    return 'OTHER';
  }

  function singularGradeTerm(value) {
    const key = normalize(value);
    return key.length > 4 && key.endsWith('S') ? key.slice(0, -1) : key;
  }

  function exactSubGradeMatch(source, candidates) {
    const detailKey = normalize(source);
    const sourceTerms = (clean(source).toUpperCase().match(/[A-Z0-9]+|[\u3131-\uD79D]+/g) || []).map(singularGradeTerm);
    return [...new Set((candidates || []).map(clean).filter(Boolean))]
      .filter(value => {
        const candidateKey = normalize(value);
        if (candidateKey.length < 2) return false;
        if (detailKey.includes(candidateKey)) return true;
        const candidateTerms = (clean(value).toUpperCase().match(/[A-Z0-9]+|[\u3131-\uD79D]+/g) || []).map(singularGradeTerm);
        return candidateTerms.length > 0 && candidateTerms.every(term => sourceTerms.includes(term));
      })
      .sort((a, b) => normalize(b).length - normalize(a).length)[0] || '';
  }

  function enrichRow(row, masters) {
    const main = bestMatch(row.detailGrade, masters.mainGrades || [], 0.36).value;
    const exactSub = exactSubGradeMatch(row.detailGrade, masters.subGrades || []);
    const sub = exactSub || bestMatch(row.detailGrade, masters.subGrades || [], 0.42).value;
    const stock = bestMatch(row.detailGrade, masters.stockGrades || [], 0.4).value;
    return {
      ...row,
      productType: inferType(row.detailGrade, main, masters.gradeTypes || {}),
      mainGrade: main,
      subGrade: sub,
      stockGrade: stock
    };
  }

  return { clean, normalize, parseWeight, uniqueJoin, headerRole, findHeader, parseSheet, parseText, parseRuledTableText, ocrQuantity, inferDocumentNo, inferCompany, inferDate, levenshtein, similarity, bestMatch, inferType, singularGradeTerm, exactSubGradeMatch, enrichRow };
});
