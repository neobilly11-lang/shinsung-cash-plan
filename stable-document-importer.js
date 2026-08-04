(() => {
  'use strict';

  const Parser = window.ScrapDocParser;
  if (!Parser) {
    console.error('ScrapDocParser를 불러오지 못했습니다.');
    return;
  }

  const editor = {
    po: { rows: [], files: [], rawText: '' },
    so: { rows: [], files: [], rawText: '' }
  };

  const style = document.createElement('style');
  style.textContent = `
    .document-head{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
    .document-drop{border:3px dashed var(--green);border-radius:18px;background:#eff8f4;padding:20px;text-align:center;margin:14px 0}
    .document-drop strong,.document-drop small{display:block}.document-drop strong{font-size:23px}.document-drop small{color:var(--muted);margin-top:7px;line-height:1.45}
    .document-table{min-width:1240px}.document-table input,.document-table select{min-height:44px;margin:0;padding:7px;border-width:1px}.document-table textarea{min-height:58px;margin:0;padding:7px;border-width:1px;resize:vertical}
    .document-table th:nth-child(1){width:52px}.document-table th:nth-child(2){width:115px}.document-table th:nth-child(3){width:150px}.document-table th:nth-child(4){width:150px}.document-table th:nth-child(5){width:250px}.document-table th:nth-child(6){width:125px}.document-table th:nth-child(7){width:100px}.document-table th:nth-child(8){width:90px}
    .document-source{font-size:13px;color:var(--muted);line-height:1.4}.document-hint{border-left:6px solid var(--amber);background:#fff7d9;border-radius:12px;padding:12px 14px;line-height:1.5}
    .document-raw{width:100%;min-height:120px;font-family:Consolas,monospace;font-size:13px;white-space:pre-wrap}
    .document-busy{position:fixed;inset:0;z-index:340;display:none;place-items:center;background:#07110ecc;padding:18px}.document-busy.on{display:grid}.document-busy-card{width:min(94vw,470px);border-radius:24px;background:#fff;padding:28px 22px;text-align:center;box-shadow:0 24px 70px #0008}.document-busy-icon{font-size:58px;display:block;animation:document-busy-spin 1.7s linear infinite}.document-busy-card b{display:block;font-size:24px;margin-top:12px}.document-busy-card p{color:var(--muted);line-height:1.5}.document-progress{height:14px;border-radius:999px;background:#e4ebe7;overflow:hidden}.document-progress span{display:block;height:100%;background:linear-gradient(90deg,var(--green),var(--lime));transition:width .2s}
    .document-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:10px 0}.document-summary div{background:#f1f6f3;border-radius:12px;padding:12px}.document-summary small,.document-summary b{display:block}.document-summary b{font-size:20px;margin-top:4px}
    @keyframes document-busy-spin{0%{transform:rotate(0)}50%{transform:rotate(180deg)}100%{transform:rotate(360deg)}}
    @media(max-width:720px){.document-head,.document-summary{grid-template-columns:1fr}.document-drop{padding:16px}.document-drop strong{font-size:20px}}
  `;
  document.head.appendChild(style);

  function today() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function buildSection(mode) {
    const po = mode === 'po';
    const section = document.createElement('section');
    section.id = po ? 'poWrite' : 'soWrite';
    section.className = 'view';
    section.innerHTML = `
      <p class="eyebrow">${po ? '입고 P.O 작성·자동변환' : '출하 S.O 작성·자동변환'}</p>
      <h1>${po ? 'P.O 작성' : 'S.O 작성'}</h1>
      <div class="actions">
        <button class="btn" data-doc-action="back">← 업무관리</button>
        <button class="btn" data-doc-action="open-list">${po ? '등록된 P.O·QR 관리' : '출하대기 S.O 관리'}</button>
        ${po ? '<button class="btn" data-doc-action="template">신성 P.O 양식 다운로드</button>' : ''}
      </div>
      <div class="card">
        <div class="document-head">
          <label>${po ? 'P.O 넘버' : 'S.O 넘버'}<input id="${po ? 'docPoNo' : 'docSoNo'}" placeholder="문서에서 자동 추출 또는 직접 입력"></label>
          <label>${po ? '거래처명' : '판매처'}<input id="${po ? 'docPoCompany' : 'docSoCustomer'}" list="docCompanyList" placeholder="등록 거래처 검색 또는 입력"></label>
          <label>${po ? 'P.O 일자' : '출하 예정일'}<input id="${po ? 'docPoDate' : 'docSoDate'}" type="date" value="${today()}"></label>
        </div>
        <datalist id="docCompanyList"></datalist><datalist id="docMainGradeList"></datalist><datalist id="docSubGradeList"></datalist><datalist id="docStockGradeList"></datalist>
        <div class="document-drop">
          <strong>📄 PACKING LIST · INVOICE · 계약서 업로드</strong>
          <small>Excel, PDF, 촬영 사진을 읽어 COMMODITY · GRADE · DESCRIPTION을 상세강종으로 합칩니다.<br>유사한 저장 강종은 자동 제안하며 등록 전에 모두 수정할 수 있습니다.</small>
          <label class="file btn primary" style="display:inline-flex;margin-top:12px">파일 선택·자동변환<input id="${po ? 'docPoFiles' : 'docSoFiles'}" type="file" multiple accept=".xlsx,.xls,.csv,.pdf,image/*"></label>
        </div>
        <div id="${po ? 'docPoStatus' : 'docSoStatus'}" class="msg"></div>
        <div id="${po ? 'docPoSummary' : 'docSoSummary'}" class="document-summary"></div>
        <div class="document-hint">${po ? '<b>P.O 확정등록을 누를 때만 사내입고번호가 자동 생성됩니다.</b> 문서 변환과 행 수정 단계에서는 사내입고번호가 생성되지 않습니다.' : '<b>S.O 품목은 여러 행을 한 번에 등록할 수 있습니다.</b> 출하재고 강종이 자동 매칭되지 않은 행은 직접 검색해 선택하세요.'}</div>
      </div>
      <div class="actions">
        <button class="btn" data-doc-action="add">+ 빈 행 추가</button>
        <button class="btn warn" data-doc-action="rematch">전체 강종 다시 찾기</button>
        <button class="btn" data-doc-action="download">${po ? '변환결과를 P.O 양식 Excel로 다운로드' : '변환결과를 S.O Excel로 다운로드'}</button>
      </div>
      <div class="tablewrap"><table class="document-table"><thead><tr>
        <th>삭제</th><th>품종</th><th>강종(유사검색)</th><th>소강종</th><th>상세강종<br><small>원문 자동합침</small></th>${po ? '<th>원문 패키지번호</th><th>중량/1개(kg)</th><th>패키지 수</th>' : '<th>출하재고 강종</th><th>중량(kg)</th><th>행</th>'}
      </tr></thead><tbody id="${po ? 'docPoRows' : 'docSoRows'}"></tbody></table></div>
      <div class="actions"><button class="btn primary" style="width:100%;min-height:68px;font-size:22px" data-doc-action="save">${po ? 'P.O 확정등록 · 사내입고번호 자동생성' : 'S.O 품목 전체 확정등록'}</button></div>
      <div id="${po ? 'docPoSaveMsg' : 'docSoSaveMsg'}" class="msg"></div>
      <details id="${po ? 'docPoRawWrap' : 'docSoRawWrap'}" class="card" hidden><summary><b>자동인식 원문 확인</b></summary><textarea id="${po ? 'docPoRaw' : 'docSoRaw'}" class="document-raw" readonly></textarea></details>
    `;
    return section;
  }

  function ensureBusy() {
    if (E('documentBusy')) return;
    const overlay = document.createElement('div');
    overlay.id = 'documentBusy';
    overlay.className = 'document-busy';
    overlay.innerHTML = '<div class="document-busy-card"><span class="document-busy-icon">⏳</span><b id="documentBusyTitle">문서 분석 중</b><p id="documentBusyDetail">잠시만 기다려 주세요.</p><div class="document-progress"><span id="documentBusyBar" style="width:5%"></span></div></div>';
    document.body.appendChild(overlay);
  }

  function setBusy(on, title, detail, percent) {
    ensureBusy();
    E('documentBusy').classList.toggle('on', !!on);
    if (title) E('documentBusyTitle').textContent = title;
    if (detail) E('documentBusyDetail').textContent = detail;
    E('documentBusyBar').style.width = `${Math.max(3, Math.min(100, Number(percent) || 3))}%`;
  }

  function ensureSections() {
    if (!E('poWrite')) E('po').insertAdjacentElement('beforebegin', buildSection('po'));
    if (!E('soWrite')) E('so').insertAdjacentElement('beforebegin', buildSection('so'));
    ensureBusy();

    const managementButtons = [...E('management').querySelectorAll('.homebtn')];
    const poButton = managementButtons.find(button => button.textContent.includes('P.O'));
    const soButton = managementButtons.find(button => button.textContent.includes('S.O'));
    if (poButton) {
      poButton.setAttribute('onclick', "show('poWrite')");
      poButton.querySelector('strong').textContent = 'P.O 작성·문서변환';
    }
    if (soButton) {
      soButton.setAttribute('onclick', "show('soWrite')");
      soButton.querySelector('strong').textContent = 'S.O 작성·문서변환';
    }

    const poDirectCard = E('poNo')?.closest('.card');
    if (poDirectCard) poDirectCard.style.display = 'none';
    const poTitle = E('po')?.querySelector('h1');
    if (poTitle) poTitle.textContent = '등록된 P.O·사내입고번호';
    if (poTitle && !E('openPoWriter')) poTitle.insertAdjacentHTML('afterend', '<button id="openPoWriter" class="btn primary" onclick="show(\'poWrite\')">+ P.O 작성·문서 자동변환</button>');

    const soTitle = E('so')?.querySelector('h1');
    if (soTitle && !E('openSoWriter')) soTitle.insertAdjacentHTML('afterend', '<button id="openSoWriter" class="btn primary" onclick="show(\'soWrite\')">+ S.O 작성·문서 자동변환</button>');

    bindSection('po');
    bindSection('so');
  }

  function bindSection(mode) {
    const section = E(mode === 'po' ? 'poWrite' : 'soWrite');
    if (!section || section.dataset.bound) return;
    section.dataset.bound = '1';
    section.addEventListener('click', event => {
      const button = event.target.closest('[data-doc-action]');
      if (!button) return;
      const action = button.dataset.docAction;
      if (action === 'back') show('management');
      if (action === 'open-list') show(mode === 'po' ? 'po' : 'so');
      if (action === 'template') downloadTemplate();
      if (action === 'add') addBlankRow(mode);
      if (action === 'rematch') rematchAll(mode);
      if (action === 'download') downloadEditor(mode);
      if (action === 'save') mode === 'po' ? savePurchaseOrder() : saveSalesOrders();
      if (action === 'delete-row') deleteRow(mode, Number(button.dataset.index));
      if (action === 'match-row') rematchRow(mode, Number(button.dataset.index));
    });
    section.addEventListener('input', event => updateEditorValue(mode, event.target));
    section.addEventListener('change', event => updateEditorValue(mode, event.target));
    E(mode === 'po' ? 'docPoFiles' : 'docSoFiles').addEventListener('change', async event => {
      const files = [...event.target.files];
      event.target.value = '';
      await importDocuments(mode, files);
    });
  }

  function masters() {
    const mainGrades = typeof allMainGrades === 'function' ? allMainGrades() : (state.mainGrades || []);
    const subGrades = typeof allSubGrades === 'function' ? allSubGrades() : (state.subGrades || []);
    const stockGrades = typeof activeStockBags === 'function' ? [...new Set(activeStockBags().map(item => item.grade).filter(Boolean))] : [];
    return { mainGrades, subGrades, stockGrades, gradeTypes: state.gradeTypes || {} };
  }

  function syncDatalists() {
    if (!E('docCompanyList')) return;
    E('docCompanyList').innerHTML = (state.companies || []).map(value => `<option value="${esc(value)}"></option>`).join('');
    E('docMainGradeList').innerHTML = masters().mainGrades.map(value => `<option value="${esc(value)}"></option>`).join('');
    E('docSubGradeList').innerHTML = masters().subGrades.map(value => `<option value="${esc(value)}"></option>`).join('');
    E('docStockGradeList').innerHTML = masters().stockGrades.map(value => `<option value="${esc(value)}"></option>`).join('');
  }

  function blankRow() {
    return { productType: '', mainGrade: '', subGrade: '', detailGrade: '', stockGrade: '', sourcePackageNo: '', weight: '', packageCount: 1, sourceFile: '', sourceRow: '' };
  }

  function rowOptions(selected) {
    return '<option value="">품종 선택</option>' + PRODUCT_TYPES.map(value => `<option value="${value}" ${value === selected ? 'selected' : ''}>${value}</option>`).join('');
  }

  function renderRows(mode) {
    const po = mode === 'po';
    const rows = editor[mode].rows;
    const body = E(po ? 'docPoRows' : 'docSoRows');
    if (!body) return;
    body.innerHTML = rows.length ? rows.map((row, index) => `
      <tr data-index="${index}">
        <td><button class="btn danger" style="min-height:42px;padding:6px 10px" data-doc-action="delete-row" data-index="${index}">×</button></td>
        <td><select data-field="productType">${rowOptions(row.productType || '')}</select></td>
        <td><input data-field="mainGrade" list="docMainGradeList" value="${esc(row.mainGrade || '')}" placeholder="저장 강종 검색"><button class="btn" style="min-height:36px;padding:4px 8px;margin-top:4px" data-doc-action="match-row" data-index="${index}">다시 찾기</button></td>
        <td><input data-field="subGrade" list="docSubGradeList" value="${esc(row.subGrade || '')}" placeholder="소강종 선택·입력"></td>
        <td><textarea data-field="detailGrade" placeholder="COMMODITY / GRADE / DESCRIPTION">${esc(row.detailGrade || '')}</textarea><div class="document-source">${row.sourceFile ? `${esc(row.sourceFile)}${row.sourceRow ? ` · ${esc(row.sourceRow)}행` : ''}` : '직접 입력'}</div></td>
        ${po
          ? `<td><input data-field="sourcePackageNo" value="${esc(row.sourcePackageNo || '')}" placeholder="원문 No"></td><td><input data-field="weight" type="number" inputmode="decimal" step="0.001" value="${esc(row.weight || '')}"></td><td><input data-field="packageCount" type="number" min="1" step="1" value="${esc(row.packageCount || 1)}"></td>`
          : `<td><input data-field="stockGrade" list="docStockGradeList" value="${esc(row.stockGrade || '')}" placeholder="완료재고 강종 검색"></td><td><input data-field="weight" type="number" inputmode="decimal" step="0.001" value="${esc(row.weight || '')}"></td><td>${index + 1}</td>`}
      </tr>`).join('') : `<tr><td colspan="8">품목 행이 없습니다. 파일을 업로드하거나 빈 행을 추가하세요.</td></tr>`;
    renderSummary(mode);
  }

  function renderSummary(mode) {
    const rows = editor[mode].rows;
    const packages = mode === 'po' ? rows.reduce((sum, row) => sum + Math.max(1, Math.round(num(row.packageCount))), 0) : rows.length;
    const weight = rows.reduce((sum, row) => sum + num(row.weight) * (mode === 'po' ? Math.max(1, Math.round(num(row.packageCount))) : 1), 0);
    const unmatched = rows.filter(row => !row.mainGrade || (mode === 'so' && !row.stockGrade)).length;
    E(mode === 'po' ? 'docPoSummary' : 'docSoSummary').innerHTML = `<div><small>${mode === 'po' ? '생성될 사내입고' : 'S.O 품목'}</small><b>${packages}건</b></div><div><small>합계 중량</small><b>${kg(weight)}</b></div><div><small>직접확인 필요</small><b style="color:${unmatched ? 'var(--red)' : 'var(--green)'}">${unmatched}행</b></div>`;
  }

  function updateEditorValue(mode, target) {
    const field = target?.dataset?.field;
    const tr = target?.closest('tr[data-index]');
    if (!field || !tr) return;
    const row = editor[mode].rows[Number(tr.dataset.index)];
    if (!row) return;
    row[field] = target.value;
    if (field === 'mainGrade' && state.gradeTypes?.[target.value]) {
      row.productType = state.gradeTypes[target.value];
      const select = tr.querySelector('[data-field="productType"]');
      if (select) select.value = row.productType;
    }
    renderSummary(mode);
  }

  function addBlankRow(mode) {
    editor[mode].rows.push(blankRow());
    renderRows(mode);
  }

  function deleteRow(mode, index) {
    editor[mode].rows.splice(index, 1);
    renderRows(mode);
  }

  function rematchRow(mode, index) {
    const row = editor[mode].rows[index];
    if (!row) return;
    const enriched = Parser.enrichRow(row, masters());
    row.mainGrade = enriched.mainGrade || row.mainGrade;
    row.subGrade = enriched.subGrade || row.subGrade;
    row.stockGrade = enriched.stockGrade || row.stockGrade;
    row.productType = enriched.productType || row.productType;
    renderRows(mode);
  }

  function rematchAll(mode) {
    editor[mode].rows = editor[mode].rows.map(row => {
      const enriched = Parser.enrichRow(row, masters());
      return { ...row, ...enriched };
    });
    renderRows(mode);
    showEditorMessage(mode, '저장된 기준정보와 완료재고를 다시 검색했습니다. 빨간 직접확인 행을 확인하세요.');
  }

  function showEditorMessage(mode, text, error) {
    const id = mode === 'po' ? 'docPoStatus' : 'docSoStatus';
    msg(id, text, !!error);
  }

  function loadScriptOnce(src, globalName) {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    return new Promise((resolve, reject) => {
      const prior = [...document.scripts].find(script => script.src === src);
      if (prior) {
        prior.addEventListener('load', () => resolve(window[globalName]), { once: true });
        prior.addEventListener('error', () => reject(Error(`${globalName} 모듈을 불러오지 못했습니다.`)), { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve(window[globalName]);
      script.onerror = () => reject(Error(`${globalName} 모듈을 불러오지 못했습니다. 인터넷 연결을 확인하세요.`));
      document.head.appendChild(script);
    });
  }

  function textItemsToLines(items) {
    const words = items.map(item => ({ text: String(item.str || '').trim(), x: Number(item.transform?.[4]) || 0, y: Number(item.transform?.[5]) || 0 })).filter(item => item.text);
    const lines = [];
    words.sort((a, b) => Math.abs(b.y - a.y) > 3 ? b.y - a.y : a.x - b.x).forEach(word => {
      let line = lines.find(value => Math.abs(value.y - word.y) <= 3);
      if (!line) { line = { y: word.y, words: [] }; lines.push(line); }
      line.words.push(word);
    });
    return lines.sort((a, b) => b.y - a.y).map(line => line.words.sort((a, b) => a.x - b.x).map(word => word.text).join(' ')).join('\n');
  }

  async function recognize(input, label, basePercent, languages = 'eng+kor') {
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js', 'Tesseract');
    const result = await Tesseract.recognize(input, languages, {
      logger(info) {
        if (info.status === 'recognizing text') {
          const percent = basePercent + Math.round((info.progress || 0) * 18);
          setBusy(true, '사진 글자 인식 중', `${label} · ${Math.round((info.progress || 0) * 100)}%`, percent);
        }
      }
    });
    return result?.data?.text || '';
  }

  function tableCrop(source) {
    const canvas = document.createElement('canvas');
    const x = Math.round(source.width * 0.045), y = Math.round(source.height * 0.29);
    const width = Math.round(source.width * 0.91), height = Math.round(source.height * 0.30);
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(source, x, y, width, height, 0, 0, width, height);
    return canvas;
  }

  async function recognizeRuledRows(canvas, label, basePercent) {
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js', 'Tesseract');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const image = context.getImageData(0, 0, canvas.width, canvas.height), data = image.data;
    const dark = (x, y) => {
      const index = (y * canvas.width + x) * 4;
      return data[index] + data[index + 1] + data[index + 2] < 710;
    };
    const lineRows = [];
    for (let y = 0; y < canvas.height; y += 1) {
      let count = 0;
      for (let x = 0; x < canvas.width; x += 2) if (dark(x, y)) count += 1;
      if (count > canvas.width * 0.23) lineRows.push(y);
    }
    const groups = [];
    lineRows.forEach(y => {
      const last = groups[groups.length - 1];
      if (last && y <= last[last.length - 1] + 2) last.push(y); else groups.push([y]);
    });
    const boundaries = groups.map(group => Math.round((group[0] + group[group.length - 1]) / 2));
    const intervals = [];
    for (let index = 1; index < boundaries.length; index += 1) {
      const top = boundaries[index - 1] + 3, bottom = boundaries[index] - 3, height = bottom - top;
      if (height >= 10 && height <= 150) intervals.push({ top, height });
    }
    if (intervals.length < 5) return '';
    const worker = await Tesseract.createWorker('eng', 1, {
      logger(info) {
        if (info.status === 'recognizing text') setBusy(true, '표 행별 글자 인식 중', `${label} · ${Math.round((info.progress || 0) * 100)}%`, basePercent);
      }
    });
    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE, preserve_interword_spaces: '1', user_defined_dpi: '300' });
    const texts = [];
    for (let index = 0; index < intervals.length; index += 1) {
      const part = intervals[index], row = document.createElement('canvas'), pad = 12;
      row.width = canvas.width + pad * 2; row.height = part.height + pad * 2;
      const rowContext = row.getContext('2d', { willReadFrequently: true });
      rowContext.fillStyle = '#fff'; rowContext.fillRect(0, 0, row.width, row.height);
      rowContext.drawImage(canvas, 0, part.top, canvas.width, part.height, pad, pad, canvas.width, part.height);
      const rowImage = rowContext.getImageData(0, 0, row.width, row.height), rowData = rowImage.data;
      const vertical = [];
      for (let x = 0; x < row.width; x += 1) {
        let count = 0;
        for (let y = 0; y < row.height; y += 1) {
          const pixel = (y * row.width + x) * 4;
          if (rowData[pixel] + rowData[pixel + 1] + rowData[pixel + 2] < 710) count += 1;
        }
        if (count > row.height * 0.55) vertical.push(x);
      }
      vertical.forEach(x => { for (let dx = -2; dx <= 2; dx += 1) for (let y = 0; y < row.height; y += 1) { const pixel = (y * row.width + Math.max(0, Math.min(row.width - 1, x + dx))) * 4; rowData[pixel] = 255; rowData[pixel + 1] = 255; rowData[pixel + 2] = 255; } });
      rowContext.putImageData(rowImage, 0, 0);
      setBusy(true, '표 행별 글자 인식 중', `${label} · ${index + 1}/${intervals.length}행`, basePercent + index / intervals.length * 25);
      const result = await worker.recognize(row);
      if (result?.data?.text) texts.push(result.data.text.trim());
      row.width = 1; row.height = 1;
    }
    await worker.terminate();
    return texts.filter(Boolean).join('\n');
  }

  async function extractExcel(file) {
    if (!window.XLSX) throw Error('Excel 읽기 모듈이 준비되지 않았습니다.');
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    let best = { rows: [], meta: {}, warning: '' };
    for (const sheetName of workbook.SheetNames) {
      const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '', raw: false });
      const parsed = Parser.parseSheet(matrix, file.name);
      parsed.rows.forEach(row => { row.sourceSheet = sheetName; });
      if (parsed.rows.length > best.rows.length) best = parsed;
    }
    return { ...best, rawText: '' };
  }

  async function extractPdf(file) {
    await loadScriptOnce('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js', 'pdfjsLib');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const pages = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
      setBusy(true, 'PDF 표 확인 중', `${file.name} · ${pageNo}/${pdf.numPages}페이지`, 10 + pageNo / pdf.numPages * 20);
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      pages.push(textItemsToLines(content.items));
    }
    let rawText = pages.join('\n');
    let parsed = Parser.parseText(rawText, file.name);
    if (rawText.replace(/\s/g, '').length < 80 || !parsed.rows.length) {
      const ocrPages = [];
      for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
        const page = await pdf.getPage(pageNo);
        const viewport = page.getViewport({ scale: 2.35 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d', { willReadFrequently: true }), viewport }).promise;
        const fullText = await recognize(canvas, `${file.name} ${pageNo}/${pdf.numPages}페이지 전체`, 25 + pageNo / pdf.numPages * 30);
        const crop = tableCrop(canvas);
        const tableText = await recognizeRuledRows(crop, `${file.name} ${pageNo}/${pdf.numPages}페이지 표`, 58 + pageNo / pdf.numPages * 28);
        ocrPages.push(`${fullText}\n===== TABLE OCR =====\n${tableText}`);
        crop.width = 1; crop.height = 1;
        canvas.width = 1; canvas.height = 1;
      }
      rawText = ocrPages.join('\n');
      const fullParsed = Parser.parseText(rawText.replace(/===== TABLE OCR =====[\s\S]*/g, ''), file.name);
      const tableText = ocrPages.map(value => value.split('===== TABLE OCR =====')[1] || '').join('\n');
      const tableParsed = Parser.parseText(tableText, file.name);
      parsed = tableParsed.rows.length > fullParsed.rows.length ? { ...tableParsed, meta: { ...fullParsed.meta, ...Object.fromEntries(Object.entries(tableParsed.meta || {}).filter(([, value]) => value)) } } : fullParsed;
    }
    return { ...parsed, rawText };
  }

  async function extractImage(file) {
    const rawText = await recognize(file, file.name, 25);
    return { ...Parser.parseText(rawText, file.name), rawText };
  }

  async function extractFile(file) {
    const name = file.name.toLowerCase();
    if (/\.(xlsx|xls|csv)$/.test(name)) return extractExcel(file);
    if (name.endsWith('.pdf') || file.type === 'application/pdf') return extractPdf(file);
    if (file.type.startsWith('image/')) return extractImage(file);
    throw Error('지원하지 않는 파일입니다. Excel, PDF 또는 사진을 선택하세요.');
  }

  function applyMeta(mode, meta) {
    const no = E(mode === 'po' ? 'docPoNo' : 'docSoNo');
    const company = E(mode === 'po' ? 'docPoCompany' : 'docSoCustomer');
    const date = E(mode === 'po' ? 'docPoDate' : 'docSoDate');
    if (!no.value && meta.documentNo) no.value = meta.documentNo;
    if (!company.value && meta.company) company.value = meta.company;
    if (meta.date) date.value = meta.date;
  }

  async function importDocuments(mode, files) {
    if (!files.length) return;
    if (editor[mode].rows.length === 1) {
      const first = editor[mode].rows[0];
      if (!Parser.clean(first.detailGrade) && num(first.weight) <= 0 && !Parser.clean(first.sourcePackageNo)) editor[mode].rows = [];
    }
    setBusy(true, '문서 자동변환 시작', `${files.length}개 파일을 차례로 읽습니다.`, 4);
    let added = 0;
    const warnings = [];
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setBusy(true, '문서 분석 중', `${file.name} · ${index + 1}/${files.length}`, 5 + index / files.length * 85);
        const parsed = await extractFile(file);
        applyMeta(mode, parsed.meta || {});
        const enriched = parsed.rows.map(row => ({ ...Parser.enrichRow(row, masters()), sourceFile: file.name }));
        editor[mode].rows.push(...enriched);
        editor[mode].files.push(file.name);
        if (parsed.rawText) editor[mode].rawText += `${editor[mode].rawText ? '\n\n' : ''}===== ${file.name} =====\n${parsed.rawText}`;
        if (parsed.warning) warnings.push(`${file.name}: ${parsed.warning}`);
        added += enriched.length;
      }
      if (!editor[mode].rows.length) editor[mode].rows.push(blankRow());
      renderRows(mode);
      const rawWrap = E(mode === 'po' ? 'docPoRawWrap' : 'docSoRawWrap');
      const raw = E(mode === 'po' ? 'docPoRaw' : 'docSoRaw');
      rawWrap.hidden = !editor[mode].rawText;
      raw.value = editor[mode].rawText;
      const message = `${files.length}개 문서에서 ${added}개 품목을 변환했습니다.${warnings.length ? ' 자동확인이 필요한 문서가 있습니다.' : ' 등록 전에 강종과 중량을 확인하세요.'}`;
      showEditorMessage(mode, message, !added);
      setBusy(false);
    } catch (error) {
      setBusy(false);
      showEditorMessage(mode, `문서 변환 실패: ${error.message}`, true);
    }
  }

  function downloadEditor(mode) {
    if (!window.XLSX) return showEditorMessage(mode, 'Excel 모듈을 불러오지 못했습니다.', true);
    const rows = editor[mode].rows.filter(row => Parser.clean(row.detailGrade) && num(row.weight) > 0);
    if (!rows.length) return showEditorMessage(mode, '다운로드할 품목 행이 없습니다.', true);
    const workbook = XLSX.utils.book_new();
    let output;
    if (mode === 'po') {
      const poNo = E('docPoNo').value.trim(), company = E('docPoCompany').value.trim();
      output = rows.flatMap(row => Array.from({ length: Math.max(1, Math.round(num(row.packageCount))) }, () => ({ 'P.O 넘버': poNo, '거래처명': company, '강종명': row.detailGrade, '중량(kg)': num(row.weight) })));
    } else {
      const soNo = E('docSoNo').value.trim(), customer = E('docSoCustomer').value.trim(), shipDate = E('docSoDate').value;
      output = rows.map(row => ({ 'S.O 넘버': soNo, '판매처': customer, '품종': row.productType, '강종': row.mainGrade, '소강종': row.subGrade, '상세강종': row.detailGrade, '출하재고 강종': row.stockGrade, '중량(kg)': num(row.weight), '출하예정일': shipDate }));
    }
    const sheet = XLSX.utils.json_to_sheet(output);
    sheet['!cols'] = mode === 'po' ? [{ wch: 22 }, { wch: 24 }, { wch: 42 }, { wch: 14 }] : [{ wch: 20 }, { wch: 22 }, { wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 38 }, { wch: 38 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(workbook, sheet, mode === 'po' ? 'P.O입력' : 'S.O입력');
    XLSX.writeFile(workbook, mode === 'po' ? '신성스크랩_PO_업로드양식_변환결과.xlsx' : '신성스크랩_SO_변환결과.xlsx');
    showEditorMessage(mode, '현재 작성 내용을 Excel로 다운로드했습니다.');
  }

  function poDuplicates(poNo, row) {
    if (!row.sourcePackageNo) return false;
    return state.pos.some(item => item.poNo === poNo && String(item.sourcePackageNo || '') === String(row.sourcePackageNo) && Parser.normalize(item.detailGrade || item.grade) === Parser.normalize(row.detailGrade));
  }

  async function savePurchaseOrder() {
    const poNo = E('docPoNo').value.trim(), company = E('docPoCompany').value.trim(), poDate = E('docPoDate').value;
    const validRows = editor.po.rows.filter(row => Parser.clean(row.detailGrade) && num(row.weight) > 0 && Math.round(num(row.packageCount)) > 0);
    if (!poNo || !company || !poDate) return msg('docPoSaveMsg', 'P.O 넘버·거래처명·P.O 일자를 입력하세요.', true);
    if (!validRows.length || validRows.length !== editor.po.rows.length) return msg('docPoSaveMsg', '모든 품목 행의 상세강종·중량·패키지 수를 확인하세요.', true);
    const duplicates = validRows.filter(row => poDuplicates(poNo, row));
    if (duplicates.length) return msg('docPoSaveMsg', `같은 P.O와 원문 패키지번호가 이미 등록된 행이 ${duplicates.length}개 있습니다. 중복 여부를 확인하세요.`, true);
    const backup = JSON.parse(JSON.stringify(state));
    const selectedBackup = new Set(selected);
    const created = [];
    if (!state.companies.includes(company)) state.companies.push(company);
    validRows.forEach((row, rowIndex) => {
      const count = Math.max(1, Math.round(num(row.packageCount)));
      for (let part = 0; part < count; part += 1) {
        const packageNo = nextPackage();
        const item = {
          id: crypto.randomUUID(), poNo, poDate, company,
          grade: Parser.clean(row.detailGrade),
          productType: row.productType || '', mainGrade: row.mainGrade || '', subGrade: row.subGrade || '', detailGrade: Parser.clean(row.detailGrade),
          sourcePackageNo: row.sourcePackageNo || '', sourceDocument: row.sourceFile || '', sourceRow: row.sourceRow || '', sourcePart: count > 1 ? part + 1 : '',
          packageNo, weight: num(row.weight), status: 'CONFIRMED', createdAt: new Date().toISOString()
        };
        state.pos.push(item); selected.add(item.id); created.push(item);
      }
      state.auditLogs.push({ id: crypto.randomUUID(), action: 'PO_CREATE', target: poNo, row: rowIndex + 1, packages: count, at: new Date().toISOString() });
    });
    msg('docPoSaveMsg', `⏳ P.O 저장 진행 중 · ${created.length}개 사내입고번호 생성 중`);
    try {
      await saveState();
      renderSummary('po');
      msg('docPoSaveMsg', `P.O 등록 완료 · ${created.length}개 사내입고번호가 자동 생성되었습니다. (${created[0].packageNo}${created.length > 1 ? ` ~ ${created[created.length - 1].packageNo}` : ''})`);
    } catch (error) {
      state = defaults(backup); selected = selectedBackup; renderAll();
      msg('docPoSaveMsg', `P.O 저장 실패: ${error.message}`, true);
    }
  }

  async function saveSalesOrders() {
    const soNo = E('docSoNo').value.trim(), customer = E('docSoCustomer').value.trim(), shipDate = E('docSoDate').value;
    const validRows = editor.so.rows.filter(row => Parser.clean(row.detailGrade) && num(row.weight) > 0);
    if (!soNo || !customer || !shipDate) return msg('docSoSaveMsg', 'S.O 넘버·판매처·출하 예정일을 입력하세요.', true);
    if (!validRows.length || validRows.length !== editor.so.rows.length) return msg('docSoSaveMsg', '모든 품목 행의 상세강종과 중량을 확인하세요.', true);
    const duplicate = validRows.some((row, index) => state.salesOrders.some(item => item.soNo === soNo && num(item.sourceLineNo) === index + 1 && item.status !== 'CANCELLED'));
    if (duplicate) return msg('docSoSaveMsg', '같은 S.O 번호와 품목 행이 이미 등록되어 있습니다.', true);
    const backup = JSON.parse(JSON.stringify(state));
    if (!state.companies.includes(customer)) state.companies.push(customer);
    const created = validRows.map((row, index) => {
      const fallback = typeof gradeLabel === 'function' ? gradeLabel(row.mainGrade, row.subGrade, row.detailGrade, row.productType) : row.detailGrade;
      return {
        id: crypto.randomUUID(), soNo, customer,
        grade: row.stockGrade || fallback,
        productType: row.productType || '', mainGrade: row.mainGrade || '', subGrade: row.subGrade || '', detailGrade: row.detailGrade,
        stockGrade: row.stockGrade || '', weight: num(row.weight), shipDate, sourceLineNo: index + 1, sourceDocument: row.sourceFile || '',
        status: 'WAITING', createdAt: new Date().toISOString()
      };
    });
    state.salesOrders.push(...created);
    state.auditLogs.push({ id: crypto.randomUUID(), action: 'SO_CREATE', target: soNo, lines: created.length, at: new Date().toISOString() });
    msg('docSoSaveMsg', `⏳ S.O 저장 진행 중 · ${created.length}개 품목`);
    try {
      await saveState();
      msg('docSoSaveMsg', `S.O 등록 완료 · ${created.length}개 품목이 출하대기에 등록되었습니다.`);
    } catch (error) {
      state = defaults(backup); renderAll();
      msg('docSoSaveMsg', `S.O 저장 실패: ${error.message}`, true);
    }
  }

  function initializeEditor(mode) {
    syncDatalists();
    if (!editor[mode].rows.length) editor[mode].rows.push(blankRow());
    renderRows(mode);
  }

  ensureSections();
  const originalShow = show;
  show = function showWithDocumentEditors(id) {
    originalShow(id);
    if (id === 'poWrite' || id === 'soWrite') {
      document.querySelectorAll('.bottom button').forEach(button => button.classList.toggle('on', button.dataset.v === 'management'));
      initializeEditor(id === 'poWrite' ? 'po' : 'so');
    }
  };

  const originalRenderAll = renderAll;
  renderAll = function renderAllWithDocumentEditors() {
    originalRenderAll();
    syncDatalists();
    if (E('poWrite')?.classList.contains('on')) renderSummary('po');
    if (E('soWrite')?.classList.contains('on')) renderSummary('so');
  };

  window.ScrapDocumentUI = { importDocuments, addBlankRow, rematchAll, downloadEditor, savePurchaseOrder, saveSalesOrders };
})();
