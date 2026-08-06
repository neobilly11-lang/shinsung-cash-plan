(() => {
  'use strict';

  const Parser = window.ScrapDocParser;
  let preview = null;
  let availabilityKind = 'completed';
  let availabilityRequestId = '';
  const availabilitySelected = new Set();

  const style = document.createElement('style');
  style.textContent = `
    .ship-request-hero{background:linear-gradient(135deg,#173f76,#0d725d);color:#fff;border-radius:22px;padding:20px;margin:14px 0}.ship-request-hero small,.ship-request-hero b{display:block}.ship-request-hero b{font-size:clamp(38px,8vw,68px);margin:4px 0}.ship-request-hero small{color:#dceee8;font-weight:900}
    .ship-request-bar{height:22px;border-radius:999px;background:#ffffff33;overflow:hidden;margin:12px 0}.ship-request-bar span{display:block;height:100%;background:var(--lime);transition:width .35s}
    .ship-request-breakdown{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.ship-request-kind{border:1px solid var(--line);border-radius:14px;background:#fff;padding:13px}.ship-request-kind small,.ship-request-kind b,.ship-request-kind span{display:block}.ship-request-kind b{font-size:23px;margin:5px 0}.ship-request-kind span{font-size:12px;color:var(--muted)}
    .ship-request-ready{border:2px solid var(--green);background:#eff8f4}.ship-request-wait{border:2px solid var(--amber);background:#fffaf0}.ship-request-card{border-left:8px solid var(--green)}.ship-request-card.low{border-left-color:var(--amber)}
    .ship-request-home{width:100%;margin-top:12px;text-align:left;border:3px solid #173f76;background:#eaf2ff;color:#173f76}.ship-request-home b{font-size:29px}
    .ship-stock-browser{margin-top:16px}.ship-stock-title{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap}.ship-stock-title h2{margin:0}.ship-stock-title p{margin:0;color:var(--muted);font-weight:800}
    .ship-stock-cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:12px 0}.ship-stock-card{min-height:122px;border:2px solid var(--line);border-radius:18px;background:#fff;padding:14px;text-align:left;color:var(--ink);cursor:pointer}.ship-stock-card small,.ship-stock-card b,.ship-stock-card span{display:block}.ship-stock-card small{font-size:15px;font-weight:900}.ship-stock-card b{font-size:clamp(25px,4vw,38px);margin:5px 0}.ship-stock-card span{color:var(--muted);font-weight:800}.ship-stock-card.active{border-color:var(--green);background:#eaf7f2;box-shadow:0 0 0 3px #0d725d22}.ship-stock-card.wait.active{border-color:#b77800;background:#fff7df;box-shadow:0 0 0 3px #f5b94244}
    .ship-stock-panel{border:2px solid var(--line);border-radius:18px;background:#fff;padding:14px}.ship-stock-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px}.ship-stock-toolbar .btn{min-height:48px}.ship-stock-toolbar .print-count{margin-left:auto;font-weight:900;color:var(--green)}
    .ship-stock-list{display:grid;gap:10px}.ship-stock-row{display:grid;grid-template-columns:auto 88px minmax(0,1fr) auto;gap:12px;align-items:center;border:1px solid var(--line);border-radius:16px;padding:12px;background:#f8fbf9}.ship-stock-row.selected{border:2px solid var(--green);background:#eef9f5}.ship-stock-row input{width:32px;height:32px;min-height:32px;accent-color:var(--green)}.ship-stock-qr{width:82px;height:82px;border:1px solid var(--line);border-radius:10px;background:#fff;padding:4px;object-fit:contain}.ship-stock-main b,.ship-stock-main span,.ship-stock-main small{display:block}.ship-stock-main b{font-size:20px}.ship-stock-main span{font-weight:800;margin-top:3px}.ship-stock-main small{color:var(--muted);margin-top:3px}.ship-stock-weight{font-size:20px;font-weight:950;white-space:nowrap}.ship-stock-empty{padding:28px;text-align:center;color:var(--muted);font-weight:900}
    @media(max-width:900px){.ship-stock-cards{grid-template-columns:1fr 1fr}.ship-stock-row{grid-template-columns:auto 70px minmax(0,1fr)}.ship-stock-qr{width:66px;height:66px}.ship-stock-weight{grid-column:2/4;text-align:right}}
    @media(max-width:820px){.ship-request-breakdown{grid-template-columns:1fr 1fr}}@media(max-width:470px){.ship-request-breakdown{grid-template-columns:1fr}.ship-stock-cards{grid-template-columns:1fr 1fr}.ship-stock-card{min-height:104px;padding:11px}.ship-stock-card b{font-size:25px}.ship-stock-row{grid-template-columns:auto minmax(0,1fr)}.ship-stock-qr{display:none}.ship-stock-weight{grid-column:2}.ship-stock-toolbar .print-count{width:100%;margin-left:0}}
  `;
  document.head.appendChild(style);

  function ensureArray() {
    if (!Array.isArray(state.shippingRequests)) state.shippingRequests = [];
    if (!Array.isArray(state.auditLogs)) state.auditLogs = [];
  }

  function normalizeShippingGrade(value) {
    let compact = String(value || '').normalize('NFKC').toUpperCase()
      .replace(/\b(?:NICKEL|COBALT|TITANIUM|STAINLESS(?:\s+STEEL)?|COPPER|MOLYBDENUM|TUNGSTEN)\s+(?:ALLOY\s+)?SCRAP\b/g, ' ')
      .replace(/INCONEL(?=\s*\d)|INCO(?=\s*\d)/g, 'IN')
      .replace(/\bHASTELLOY\b/g, 'HS')
      .replace(/^\s*(?:NI|TI|STS|CO|MO|CU|OTHER)\s*[·/_-]+\s*/, '')
      .replace(/[^A-Z0-9가-힣]+/g, '');
    compact = compact.replace(/^CO(\d+)NI(\d+)$/, '$1CO$2NI').replace(/^NI(\d+)CO(\d+)$/, '$2CO$1NI');
    if (compact === 'HS68') compact = 'HS6B';
    return compact;
  }

  function shippingGradeNumbers(value) {
    return normalizeShippingGrade(value).match(/\d+/g) || [];
  }

  function similar(a, b) {
    const candidate = normalizeShippingGrade(a), requested = normalizeShippingGrade(b);
    if (!candidate || !requested) return false;
    const candidateNumbers = shippingGradeNumbers(candidate), requestedNumbers = shippingGradeNumbers(requested);
    if (requestedNumbers.length && candidateNumbers.join('|') !== requestedNumbers.join('|')) return false;
    if (candidate === requested || candidate.includes(requested)) return true;
    const lengthRatio = Math.min(candidate.length, requested.length) / Math.max(candidate.length, requested.length);
    return lengthRatio >= 0.8 && (Parser ? Parser.similarity(candidate, requested) >= 0.84 : false);
  }

  function recordGradeValues(record) {
    if (!record) return [];
    return [
      record.grade,
      record.originalGrade,
      gradeLabel(record.mainGrade, record.subGrade, record.detailGrade, record.productType),
      [record.mainGrade, record.subGrade, record.detailGrade].filter(Boolean).join(' '),
      record.mainGrade,
      record.detailGrade,
      record.subGrade
    ].filter(Boolean);
  }

  function recordMatches(record, grade) {
    return !grade || recordGradeValues(record).some(value => similar(value, grade));
  }

  function workTaskMatches(task, p, grade) {
    if (!grade) return true;
    const taskValues = recordGradeValues(task);
    return taskValues.length ? taskValues.some(value => similar(value, grade)) : !!p && packageMatches(p, grade);
  }

  function packageGradeValues(p) {
    const splits = state.splits.filter(split => split.packageNo === p.packageNo && split.status !== 'CANCELLED');
    return [...recordGradeValues(p), ...splits.flatMap(recordGradeValues)].filter(Boolean);
  }

  function packageMatches(p, grade) {
    return packageGradeValues(p).some(value => similar(value, grade));
  }

  function requestSalesOrderIds(soNo) {
    if (!soNo) return new Set();
    return new Set(state.salesOrders.filter(order => order.status !== 'CANCELLED' && order.soNo === soNo).map(order => order.id));
  }

  function reservedBagWeight(bagId, currentSoNo = '') {
    const currentOrderIds = requestSalesOrderIds(currentSoNo);
    return state.shippingAreaMoves
      .filter(move => move.bagId === bagId && move.status === 'AT_AREA' && !currentOrderIds.has(move.salesOrderId))
      .reduce((sum, move) => sum + num(move.weight), 0);
  }

  function completedWeight(grade, currentSoNo = '') {
    return activeStockBags().filter(bag => recordMatches(bag, grade)).reduce((sum, bag) => sum + Math.max(0, bagStockWeight(bag.id) - reservedBagWeight(bag.id, currentSoNo)), 0);
  }

  function confirmedPackageWeight(p, grade) {
    const confirmed = state.splits.filter(split => split.packageNo === p.packageNo && split.status !== 'CANCELLED' && recordMatches(split, grade)).reduce((sum, split) => sum + num(split.weight), 0);
    const used = state.inputs.filter(input => input.packageNo === p.packageNo && input.status !== 'CANCELLED' && gradeMatches(input.grade, grade)).reduce((sum, input) => sum + num(input.weight), 0);
    return Math.max(0, confirmed - used);
  }

  function gradeMatches(value, grade) {
    return !grade || similar(value, grade);
  }

  function selectedGrade() {
    const input = E('shipStockGrade');
    if (!input) return '';
    let value = String(input.value || '').trim();
    if (value) return value;
    const latest = state.shippingRequests.filter(item => item.status !== 'CANCELLED' && item.grade).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
    if (latest?.grade) {
      input.value = latest.grade;
      availabilityRequestId = latest.id;
      value = latest.grade;
    }
    return value;
  }

  function availabilityRequestSoNo() {
    return state.shippingRequests.find(item => item.id === availabilityRequestId && item.status !== 'CANCELLED')?.soNo || '';
  }

  function packageDisplayGrade(p, grade) {
    const rows = state.splits.filter(split => split.packageNo === p.packageNo && split.status !== 'CANCELLED' && recordMatches(split, grade));
    const values = rows.map(split => split.grade || gradeLabel(split.mainGrade, split.subGrade, split.detailGrade, split.productType)).filter(Boolean);
    return [...new Set(values)].join(', ') || p.grade || '-';
  }

  function packageGradeParts(p, grade) {
    const split = state.splits.find(row => row.packageNo === p.packageNo && row.status !== 'CANCELLED' && recordMatches(row, grade));
    return {
      mainGrade: split?.mainGrade || p.mainGrade || p.grade || '-',
      subGrade: split?.subGrade || p.subGrade || '-',
      detailGrade: split?.detailGrade || p.detailGrade || split?.grade || p.grade || '-'
    };
  }

  function latestWaitingLocation(packageNo) {
    return state.waitingMoves.filter(move => move.packageNo === packageNo && move.status !== 'CANCELLED').slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0]?.to || '';
  }

  function availabilityItems(kind, grade = selectedGrade()) {
    if (kind === 'completed') {
      return activeStockBags().filter(bag => recordMatches(bag, grade)).map(bag => {
        const weight = Math.max(0, bagStockWeight(bag.id) - reservedBagWeight(bag.id, availabilityRequestSoNo()));
        const sources = typeof bagSourcePackageNos === 'function' ? bagSourcePackageNos(bag.id) : [];
        const companies = [...new Set(sources.map(no => state.pos.find(p => p.packageNo === no)?.company).filter(Boolean))];
        return { key: `completed:${bag.id}`, kind, code: bagCode(bag), company: companies.join(', ') || '완료재고', grade: bag.grade || '-', mainGrade: bag.mainGrade || bag.grade || '-', subGrade: bag.subGrade || '-', detailGrade: bag.detailGrade || bag.grade || '-', location: bag.location || '미지정', weight, qr: completionQrUrl(bag, 300) };
      }).filter(item => item.weight > 0);
    }

    if (kind === 'packing') {
      return state.pos.filter(p => !grade || packageMatches(p, grade)).map(p => {
        const weight = confirmedPackageWeight(p, grade);
        const parts = packageGradeParts(p, grade);
        return { key: `packing:${p.id}`, kind, code: p.packageNo, company: p.company || '-', grade: packageDisplayGrade(p, grade), ...parts, location: latestWaitingLocation(p.packageNo) || '검수완료·포장준비', weight, qr: qrUrl(p, 300) };
      }).filter(item => item.weight > 0);
    }

    if (kind === 'work') {
      return state.workWaits.filter(task => {
        if (task.status !== 'WAITING') return false;
        const p = state.pos.find(row => row.packageNo === task.packageNo);
        return workTaskMatches(task, p, grade);
      }).map(task => {
        const p = state.pos.find(row => row.packageNo === task.packageNo);
        const parts = packageGradeParts(p || task, grade);
        return { key: `work:${task.id}`, kind, code: task.packageNo, company: task.company || p?.company || '-', grade: task.originalGrade || p?.grade || '-', ...parts, location: `${task.type || '작업'} · ${task.location || '장소 미지정'}`, note: task.instruction || '', weight: num(task.weight), qr: workWaitQrUrl(task, 300) };
      }).filter(item => item.weight > 0);
    }

    if (kind === 'inspection') {
      return state.pos.filter(p => recordMatches(p, grade)).map(p => {
        const waits = state.workWaits.filter(task => task.packageNo === p.packageNo && workTaskMatches(task, p, grade));
        const workWaiting = waits.filter(task => task.status === 'WAITING').reduce((sum, task) => sum + num(task.weight), 0);
        const workDone = waits.filter(task => task.status === 'DONE').reduce((sum, task) => sum + num(task.weight), 0);
        const started = state.splits.some(split => split.packageNo === p.packageNo && split.status !== 'CANCELLED') || state.inspectionDrafts.some(draft => draft.packageNo === p.packageNo && draft.status === 'TEMP') || waits.length > 0;
        const weight = started ? Math.max(0, packageRemain(p) - workWaiting - workDone) : 0;
        const parts = packageGradeParts(p, grade);
        return { key: `inspection:${p.id}`, kind, code: p.packageNo, company: p.company || '-', grade: p.grade || '-', ...parts, location: state.inspectionDrafts.some(draft => draft.packageNo === p.packageNo && draft.status === 'TEMP') ? '검수 임시보관' : '검수 진행중', weight, qr: qrUrl(p, 300) };
      }).filter(item => item.weight > 0);
    }
    return [];
  }

  const availabilityLabels = {
    completed: ['완료재고', '즉시 출하 가능'],
    packing: ['포장대기', '검수확정·미포장'],
    work: ['작업대기', '작업 완료 필요'],
    inspection: ['검수대기', '검수 진행 필요']
  };

  function allAvailabilityItems() {
    return Object.keys(availabilityLabels).flatMap(kind => availabilityItems(kind));
  }

  function renderAvailabilityBrowser() {
    const host = E('shipReqAvailability');
    if (!host) return;
    const grade = selectedGrade();
    const buckets = Object.keys(availabilityLabels).map(kind => {
      const items = availabilityItems(kind, grade);
      return { kind, items, weight: items.reduce((sum, item) => sum + item.weight, 0) };
    });
    const current = buckets.find(bucket => bucket.kind === availabilityKind) || buckets[0];
    const validKeys = new Set(buckets.flatMap(bucket => bucket.items.map(item => item.key)));
    [...availabilitySelected].forEach(key => { if (!validKeys.has(key)) availabilitySelected.delete(key); });
    host.innerHTML = `<div class="ship-stock-browser"><div class="ship-stock-title"><div><h2>${grade ? esc(grade) + ' ' : ''}출하 준비 재고</h2><p>항목을 누르면 상세목록과 QR을 확인할 수 있습니다.</p></div><span class="status-chip">공용 서버 현재자료</span></div><div class="ship-stock-cards">${buckets.map(bucket => {
      const [label, note] = availabilityLabels[bucket.kind];
      return `<button type="button" class="ship-stock-card ${bucket.kind === availabilityKind ? 'active' : ''} ${bucket.kind === 'work' || bucket.kind === 'inspection' ? 'wait' : ''}" onclick="openShippingAvailability('${bucket.kind}')" aria-pressed="${bucket.kind === availabilityKind}"><small>${label} · ${bucket.items.length}건</small><b>${kg(bucket.weight)}</b><span>${note} · 목록 보기</span></button>`;
    }).join('')}</div><div class="ship-stock-panel"><div class="ship-stock-toolbar"><b>${availabilityLabels[current.kind][0]} 상세목록</b><button type="button" class="btn" onclick="selectShippingAvailability(true)">현재 목록 전체선택</button><button type="button" class="btn" onclick="selectShippingAvailability(false)">선택해제</button><button type="button" class="btn primary" onclick="printShippingAvailability()">선택 QR A4 일괄출력</button><span class="print-count">${availabilitySelected.size}개 선택</span></div><div class="ship-stock-list">${current.items.length ? current.items.map(item => `<label class="ship-stock-row ${availabilitySelected.has(item.key) ? 'selected' : ''}"><input type="checkbox" ${availabilitySelected.has(item.key) ? 'checked' : ''} onchange="toggleShippingAvailability('${item.key}',this.checked)"><img class="ship-stock-qr" src="${item.qr}" loading="lazy" alt="${esc(item.code)} QR"><span class="ship-stock-main"><b>${esc(item.code)} · ${esc(item.company)}</b><span>${esc(item.mainGrade)} · ${esc(item.subGrade)} · ${esc(item.detailGrade)}</span><small>${esc(item.location)}${item.note ? ' · ' + esc(item.note) : ''}</small></span><span class="ship-stock-weight">${kg(item.weight)}</span></label>`).join('') : '<div class="ship-stock-empty">해당 조건의 자료가 없습니다.</div>'}</div></div></div>`;
  }

  function openShippingAvailability(kind) {
    if (!availabilityLabels[kind]) return;
    availabilityKind = kind;
    renderAvailabilityBrowser();
    E('shipReqAvailability')?.querySelector('.ship-stock-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function toggleShippingAvailability(key, checked) {
    checked ? availabilitySelected.add(key) : availabilitySelected.delete(key);
    renderAvailabilityBrowser();
  }

  function selectShippingAvailability(checked) {
    const keys = availabilityItems(availabilityKind).map(item => item.key);
    keys.forEach(key => checked ? availabilitySelected.add(key) : availabilitySelected.delete(key));
    renderAvailabilityBrowser();
  }

  function labelHtml(item) {
    const label = availabilityLabels[item.kind]?.[0] || '출하 준비';
    return `<article class="label"><img src="${item.qr}"><div><b class="co">${esc(label)} · ${esc(item.company)}</b><span class="gr">강종 ${esc(item.mainGrade || item.grade || '-')}</span><span class="detail">소강종 ${esc(item.subGrade || '-')}</span><span class="detail">상세강종 ${esc(item.detailGrade || item.grade || '-')}</span><b class="pkg">${esc(item.code)}</b><span>${esc(item.location)} · ${kg(item.weight)}</span></div></article>`;
  }

  async function printShippingAvailability() {
    const items = allAvailabilityItems().filter(item => availabilitySelected.has(item.key));
    if (!items.length) return alert('QR로 출력할 자료를 먼저 체크하세요.');
    E('labels').innerHTML = items.map(labelHtml).join('');
    const images = [...E('labels').querySelectorAll('img')];
    try {
      await Promise.race([
        Promise.all(images.map(image => image.complete && image.naturalWidth ? Promise.resolve() : new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; }))),
        new Promise((_, reject) => setTimeout(() => reject(Error('QR 생성 시간 초과')), 15000))
      ]);
      window.print();
    } catch (error) {
      alert(`QR 출력 준비 실패: ${error.message}`);
    }
  }

  function requestForecast(grade, requestedWeight, currentSoNo = '') {
    const requested = Math.max(0, num(requestedWeight));
    const result = { completed: completedWeight(grade, currentSoNo), packing: 0, work: 0, inspection: 0, inbound: 0, requested };
    state.pos.filter(p => packageMatches(p, grade) || recordMatches(p, grade)).forEach(p => {
      const remain = packageRemain(p);
      result.packing += confirmedPackageWeight(p, grade);
      const waits = state.workWaits.filter(task => task.packageNo === p.packageNo && workTaskMatches(task, p, grade));
      const workWaiting = Math.min(remain, waits.filter(task => task.status === 'WAITING').reduce((sum, task) => sum + num(task.weight), 0));
      const roomAfterWait = Math.max(0, remain - workWaiting);
      const workDone = Math.min(roomAfterWait, waits.filter(task => task.status === 'DONE').reduce((sum, task) => sum + num(task.weight), 0));
      result.work += workWaiting;
      result.packing += workDone;
      const unassigned = Math.max(0, remain - workWaiting - workDone);
      const started = state.splits.some(split => split.packageNo === p.packageNo && split.status !== 'CANCELLED') || state.inspectionDrafts.some(draft => draft.packageNo === p.packageNo && draft.status === 'TEMP') || waits.length > 0;
      if (recordMatches(p, grade)) {
        if (started) result.inspection += unassigned;
        else result.inbound += unassigned;
      }
    });
    result.ready = result.completed + result.packing;
    result.progress = requested > 0 ? Math.min(100, result.ready / requested * 100) : 0;
    return result;
  }

  function percent(value, total) {
    return total > 0 ? Math.min(100, Math.max(0, value / total * 100)) : 0;
  }

  function pct(value) {
    return `${Math.round(value * 10) / 10}%`;
  }

  function breakdownHtml(data) {
    const cells = [
      ['완료재고', data.completed, 'ship-request-ready'],
      ['포장대기', data.packing, 'ship-request-ready'],
      ['작업대기', data.work, 'ship-request-wait'],
      ['검수대기', data.inspection, 'ship-request-wait'],
      ['입고대기', data.inbound, 'ship-request-wait']
    ];
    return `<div class="ship-request-breakdown">${cells.map(([label, weight, className]) => `<div class="ship-request-kind ${className}"><small>${label}</small><b>${pct(percent(weight, data.requested))}</b><span>${kg(weight)}</span></div>`).join('')}</div>`;
  }

  function forecastHtml(data, title) {
    return `<div class="ship-request-hero"><small>${esc(title || '현재 출하가능율')}</small><b>${pct(data.progress)}</b><div class="ship-request-bar"><span style="width:${data.progress}%"></span></div><span>즉시 가능 ${kg(data.ready)} / 요청 ${kg(data.requested)}</span></div>${breakdownHtml(data)}`;
  }

  function buildWriteSection() {
    const section = document.createElement('section');
    section.id = 'shippingRequestWrite';
    section.className = 'view';
    section.innerHTML = `
      <p class="eyebrow">출하 전 재고 준비 요청</p><h1>출하대기 요청</h1>
      <div class="actions"><button class="btn" onclick="show('management')">← 업무관리</button><button class="btn" onclick="show('shippingRequestStatus')">요청 진행현황</button></div>
      <div class="card"><div class="form">
        <label>S.O 넘버<input id="shipReqSoNo" list="shipReqSoList" placeholder="S.O 번호 검색" oninput="fillShippingRequestFromSo()"></label><datalist id="shipReqSoList"></datalist>
        <label>출하대기 요청자<input id="shipReqRequester" placeholder="요청자 이름"></label>
        <label>강종 검색<input id="shipReqGrade" list="shipReqGradeList" placeholder="완료·포장·검수재고 강종" oninput="clearShippingPreview()"></label><datalist id="shipReqGradeList"></datalist>
        <label>요청 중량(kg)<input id="shipReqWeight" type="number" inputmode="decimal" step="0.001" oninput="clearShippingPreview()"></label>
      </div><div class="actions"><button class="btn warn" style="width:100%" onclick="previewShippingRequest()">출하예상 확인</button></div><div id="shipReqPreview"></div><button id="shipReqSave" class="btn primary" style="width:100%;margin-top:14px;min-height:66px;font-size:21px" onclick="confirmShippingRequest()" disabled>출하요청 확정</button><div id="shipReqMsg" class="msg"></div></div>`;
    return section;
  }

  function buildStatusSection() {
    const section = document.createElement('section');
    section.id = 'shippingRequestStatus';
    section.className = 'view';
    section.innerHTML = '<p class="eyebrow">검수·작업·포장 상태 자동반영</p><h1>출하요청 진행현황</h1><div class="actions"><button class="btn" onclick="show(\'home\')">← 업무수행</button><button class="btn primary" onclick="show(\'shippingRequestWrite\')">+ 출하대기 요청</button></div><div class="card"><label>준비재고 강종 검색<input id="shipStockGrade" list="shipReqGradeList" placeholder="비우면 전체 재고 · 입력하면 해당 강종" oninput="shippingAvailabilityGradeChanged()"></label></div><div id="shipReqAvailability"></div><div class="card"><label>S.O·요청자·강종 검색<input id="shipReqSearch" placeholder="검색어 입력" oninput="renderShippingRequests()"></label></div><div id="shipReqList"></div>';
    return section;
  }

  function ensureUi() {
    ensureArray();
    const main = document.querySelector('main.wrap');
    if (!E('shippingRequestWrite')) main.appendChild(buildWriteSection());
    if (!E('shippingRequestStatus')) main.appendChild(buildStatusSection());

    if (!E('shippingRequestManagementButton')) {
      const button = document.createElement('button');
      button.id = 'shippingRequestManagementButton';
      button.className = 'homebtn blue';
      button.setAttribute('onclick', "show('shippingRequestWrite')");
      button.innerHTML = '<span>출하 준비</span><strong>출하대기 요청</strong>';
      E('management').querySelector('.grid').appendChild(button);
    }

    if (!E('shippingRequestHomeButton')) {
      const button = document.createElement('button');
      button.id = 'shippingRequestHomeButton';
      button.className = 'dash-card ship-request-home';
      button.setAttribute('onclick', "show('shippingRequestStatus')");
      button.innerHTML = '<small>출하요청 진행현황 · 클릭하여 S.O별 확인</small><b id="shippingRequestHomeCount">0건</b>';
      const stock = E('homeStockTotal')?.closest('button');
      if (stock) stock.insertAdjacentElement('afterend', button);
      else E('home').appendChild(button);
    }

    if (!E('openShippingRequestFromSo')) {
      const button = document.createElement('button');
      button.id = 'openShippingRequestFromSo';
      button.className = 'btn warn';
      button.textContent = '출하대기 요청 작성';
      button.setAttribute('onclick', "show('shippingRequestWrite')");
      E('so')?.querySelector('h1')?.insertAdjacentElement('afterend', button);
    }
    if (E('soWrite') && !E('openShippingRequestFromSoWrite')) {
      const button = document.createElement('button');
      button.id = 'openShippingRequestFromSoWrite';
      button.className = 'btn warn';
      button.textContent = '출하대기 요청 작성';
      button.setAttribute('onclick', "show('shippingRequestWrite')");
      E('soWrite').querySelector('.actions')?.appendChild(button);
    }
  }

  function gradeOptions() {
    return [...new Set([
      ...activeStockBags().map(bag => bag.grade),
      ...state.splits.filter(split => split.status !== 'CANCELLED').map(split => split.grade),
      ...state.pos.flatMap(p => [p.grade, p.mainGrade, p.subGrade, p.detailGrade]),
      ...state.salesOrders.filter(order => order.status !== 'CANCELLED').map(order => order.grade)
    ].filter(Boolean))].sort();
  }

  function renderRequestInputs() {
    if (!E('shipReqSoList')) return;
    E('shipReqSoList').innerHTML = [...new Set(state.salesOrders.filter(order => order.status !== 'CANCELLED').map(order => order.soNo).filter(Boolean))].map(value => `<option value="${esc(value)}"></option>`).join('');
    E('shipReqGradeList').innerHTML = gradeOptions().map(value => `<option value="${esc(value)}"></option>`).join('');
  }

  function fillShippingRequestFromSo() {
    const soNo = E('shipReqSoNo').value.trim();
    const order = state.salesOrders.find(item => item.soNo === soNo && item.status !== 'CANCELLED');
    if (!order) return;
    E('shipReqGrade').value = order.grade || '';
    E('shipReqWeight').value = order.weight || '';
    preview = null;
    E('shipReqPreview').innerHTML = '';
    E('shipReqSave').disabled = true;
  }

  function clearShippingPreview() {
    preview = null;
    if (E('shipReqPreview')) E('shipReqPreview').innerHTML = '';
    if (E('shipReqSave')) E('shipReqSave').disabled = true;
  }

  function shippingAvailabilityGradeChanged() {
    availabilityRequestId = '';
    availabilitySelected.clear();
    renderAvailabilityBrowser();
  }

  function filterShippingAvailabilityByRequest(id) {
    const request = state.shippingRequests.find(item => item.id === id && item.status !== 'CANCELLED');
    if (!request || !E('shipStockGrade')) return;
    availabilityRequestId = request.id;
    E('shipStockGrade').value = request.grade || '';
    availabilitySelected.clear();
    renderAvailabilityBrowser();
    E('shipReqAvailability')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function previewShippingRequest() {
    const soNo = E('shipReqSoNo').value.trim(), requester = E('shipReqRequester').value.trim(), grade = E('shipReqGrade').value.trim(), weight = num(E('shipReqWeight').value);
    if (!soNo || !requester || !grade || weight <= 0) return msg('shipReqMsg', 'S.O 넘버·요청자·강종·요청 중량을 모두 입력하세요.', true);
    preview = { soNo, requester, grade, weight, forecast: requestForecast(grade, weight, soNo) };
    E('shipReqPreview').innerHTML = forecastHtml(preview.forecast, `${grade} 출하가능율`);
    E('shipReqSave').disabled = false;
    msg('shipReqMsg', '현재 공용자료를 기준으로 계산했습니다. 출하요청 확정을 누르면 업무수행에 표시됩니다.');
  }

  async function confirmShippingRequest() {
    if (!preview) return msg('shipReqMsg', '먼저 출하예상 확인을 눌러 주세요.', true);
    if (state.shippingRequests.some(item => item.status !== 'CANCELLED' && item.soNo === preview.soNo && item.grade === preview.grade)) return msg('shipReqMsg', '같은 S.O와 강종의 출하요청이 이미 있습니다.', true);
    const backup = JSON.parse(JSON.stringify(state));
    const item = { id: crypto.randomUUID(), soNo: preview.soNo, requester: preview.requester, grade: preview.grade, weight: preview.weight, status: 'REQUESTED', createdAt: new Date().toISOString() };
    state.shippingRequests.push(item);
    state.auditLogs.push({ id: crypto.randomUUID(), action: 'SHIPPING_REQUEST_CREATE', target: item.id, soNo: item.soNo, requester: item.requester, at: item.createdAt });
    msg('shipReqMsg', '⏳ 출하요청을 공용 서버에 저장 중입니다.');
    E('shipReqSave').disabled = true;
    try {
      await saveState();
      msg('shipReqMsg', `${item.soNo} 출하요청 확정 완료 · 업무수행의 출하요청 건수에 반영되었습니다.`);
      preview = null;
      renderShippingRequests();
    } catch (error) {
      state = defaults(backup); renderAll();
      E('shipReqSave').disabled = false;
      msg('shipReqMsg', `출하요청 저장 실패: ${error.message}`, true);
    }
  }

  function renderShippingRequests() {
    ensureArray();
    const active = state.shippingRequests.filter(item => item.status !== 'CANCELLED');
    if (E('shippingRequestHomeCount')) E('shippingRequestHomeCount').textContent = `${active.length}건`;
    if (!E('shipReqList')) return;
    const query = String(E('shipReqSearch')?.value || '').trim().toLowerCase();
    const list = active.filter(item => !query || [item.soNo, item.requester, item.grade].some(value => String(value || '').toLowerCase().includes(query))).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    E('shipReqList').innerHTML = list.length ? list.map(item => {
      const data = requestForecast(item.grade, item.weight, item.soNo);
      return `<article class="donecard ship-request-card ${data.progress < 100 ? 'low' : ''}" role="button" tabindex="0" title="이 출하요청 강종의 준비재고 보기" onclick="filterShippingAvailabilityByRequest('${esc(item.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();filterShippingAvailabilityByRequest('${esc(item.id)}')}"><div class="actions" style="justify-content:space-between"><span class="status-chip ${data.progress < 100 ? 'warn' : ''}">${data.progress >= 100 ? '출하준비 100%' : `준비 진행 ${pct(data.progress)}`}</span><span>요청자 ${esc(item.requester)}</span></div><h2>${esc(item.soNo)} · ${esc(item.grade)}</h2><p><b>요청 ${kg(item.weight)} · 즉시 가능 ${kg(data.ready)}</b></p>${forecastHtml(data, `${item.soNo} 진행율`)}</article>`;
    }).join('') : '<div class="card">등록된 출하대기 요청이 없습니다.</div>';
  }

  ensureUi();
  const priorShow = show;
  show = function showWithShippingRequests(id) {
    priorShow(id);
    if (id === 'shippingRequestWrite' || id === 'shippingRequestStatus') {
      document.querySelectorAll('.bottom button').forEach(button => button.classList.toggle('on', button.dataset.v === (id === 'shippingRequestWrite' ? 'management' : 'home')));
      renderRequestInputs();
      renderShippingRequests();
      renderAvailabilityBrowser();
    }
  };

  const priorRenderAll = renderAll;
  renderAll = function renderAllWithShippingRequests() {
    ensureArray();
    priorRenderAll();
    renderRequestInputs();
    renderShippingRequests();
    renderAvailabilityBrowser();
  };

  window.fillShippingRequestFromSo = fillShippingRequestFromSo;
  window.clearShippingPreview = clearShippingPreview;
  window.shippingAvailabilityGradeChanged = shippingAvailabilityGradeChanged;
  window.filterShippingAvailabilityByRequest = filterShippingAvailabilityByRequest;
  window.previewShippingRequest = previewShippingRequest;
  window.confirmShippingRequest = confirmShippingRequest;
  window.renderShippingRequests = renderShippingRequests;
  window.openShippingAvailability = openShippingAvailability;
  window.toggleShippingAvailability = toggleShippingAvailability;
  window.selectShippingAvailability = selectShippingAvailability;
  window.printShippingAvailability = printShippingAvailability;
  window.ShippingRequestForecast = { requestForecast, percent, availabilityItems, similar, normalizeShippingGrade, packageMatches, recordMatches, workTaskMatches, reservedBagWeight, completedWeight };
})();
