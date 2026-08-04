(() => {
  'use strict';

  const Parser = window.ScrapDocParser;
  let preview = null;

  const style = document.createElement('style');
  style.textContent = `
    .ship-request-hero{background:linear-gradient(135deg,#173f76,#0d725d);color:#fff;border-radius:22px;padding:20px;margin:14px 0}.ship-request-hero small,.ship-request-hero b{display:block}.ship-request-hero b{font-size:clamp(38px,8vw,68px);margin:4px 0}.ship-request-hero small{color:#dceee8;font-weight:900}
    .ship-request-bar{height:22px;border-radius:999px;background:#ffffff33;overflow:hidden;margin:12px 0}.ship-request-bar span{display:block;height:100%;background:var(--lime);transition:width .35s}
    .ship-request-breakdown{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.ship-request-kind{border:1px solid var(--line);border-radius:14px;background:#fff;padding:13px}.ship-request-kind small,.ship-request-kind b,.ship-request-kind span{display:block}.ship-request-kind b{font-size:23px;margin:5px 0}.ship-request-kind span{font-size:12px;color:var(--muted)}
    .ship-request-ready{border:2px solid var(--green);background:#eff8f4}.ship-request-wait{border:2px solid var(--amber);background:#fffaf0}.ship-request-card{border-left:8px solid var(--green)}.ship-request-card.low{border-left-color:var(--amber)}
    .ship-request-home{width:100%;margin-top:12px;text-align:left;border:3px solid #173f76;background:#eaf2ff;color:#173f76}.ship-request-home b{font-size:29px}
    @media(max-width:820px){.ship-request-breakdown{grid-template-columns:1fr 1fr}}@media(max-width:470px){.ship-request-breakdown{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  function ensureArray() {
    if (!Array.isArray(state.shippingRequests)) state.shippingRequests = [];
    if (!Array.isArray(state.auditLogs)) state.auditLogs = [];
  }

  function similar(a, b) {
    if (!a || !b) return false;
    if (typeof gradesSimilar === 'function' && gradesSimilar(a, b)) return true;
    return Parser ? Parser.similarity(a, b) >= 0.42 : String(a).toLowerCase() === String(b).toLowerCase();
  }

  function packageGradeValues(p) {
    return [p.grade, p.mainGrade, p.subGrade, p.detailGrade, ...state.splits.filter(split => split.packageNo === p.packageNo && split.status !== 'CANCELLED').flatMap(split => [split.grade, split.mainGrade, split.subGrade, split.detailGrade])].filter(Boolean);
  }

  function packageMatches(p, grade) {
    return packageGradeValues(p).some(value => similar(value, grade));
  }

  function reservedBagWeight(bagId) {
    return state.shippingAreaMoves.filter(move => move.bagId === bagId && move.status === 'AT_AREA').reduce((sum, move) => sum + num(move.weight), 0);
  }

  function completedWeight(grade) {
    return activeStockBags().filter(bag => similar(bag.grade, grade)).reduce((sum, bag) => sum + Math.max(0, bagStockWeight(bag.id) - reservedBagWeight(bag.id)), 0);
  }

  function confirmedPackageWeight(p, grade) {
    const confirmed = state.splits.filter(split => split.packageNo === p.packageNo && split.status !== 'CANCELLED' && similar(split.grade || gradeLabel(split.mainGrade, split.subGrade, split.detailGrade, split.productType), grade)).reduce((sum, split) => sum + num(split.weight), 0);
    const used = state.inputs.filter(input => input.packageNo === p.packageNo && input.status !== 'CANCELLED' && similar(input.grade, grade)).reduce((sum, input) => sum + num(input.weight), 0);
    return Math.max(0, confirmed - used);
  }

  function requestForecast(grade, requestedWeight) {
    const requested = Math.max(0, num(requestedWeight));
    const result = { completed: completedWeight(grade), packing: 0, work: 0, inspection: 0, inbound: 0, requested };
    state.pos.filter(p => packageMatches(p, grade)).forEach(p => {
      const remain = packageRemain(p);
      result.packing += confirmedPackageWeight(p, grade);
      const waits = state.workWaits.filter(task => task.packageNo === p.packageNo && similar(task.originalGrade || p.grade, grade));
      const workWaiting = Math.min(remain, waits.filter(task => task.status === 'WAITING').reduce((sum, task) => sum + num(task.weight), 0));
      const roomAfterWait = Math.max(0, remain - workWaiting);
      const workDone = Math.min(roomAfterWait, waits.filter(task => task.status === 'DONE').reduce((sum, task) => sum + num(task.weight), 0));
      result.work += workWaiting;
      result.packing += workDone;
      const unassigned = Math.max(0, remain - workWaiting - workDone);
      const started = state.splits.some(split => split.packageNo === p.packageNo && split.status !== 'CANCELLED') || state.inspectionDrafts.some(draft => draft.packageNo === p.packageNo && draft.status === 'TEMP') || waits.length > 0;
      if (started) result.inspection += unassigned;
      else result.inbound += unassigned;
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
    section.innerHTML = '<p class="eyebrow">검수·작업·포장 상태 자동반영</p><h1>출하요청 진행현황</h1><div class="actions"><button class="btn" onclick="show(\'home\')">← 업무수행</button><button class="btn primary" onclick="show(\'shippingRequestWrite\')">+ 출하대기 요청</button></div><div class="card"><label>S.O·요청자·강종 검색<input id="shipReqSearch" placeholder="검색어 입력" oninput="renderShippingRequests()"></label></div><div id="shipReqList"></div>';
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

  function previewShippingRequest() {
    const soNo = E('shipReqSoNo').value.trim(), requester = E('shipReqRequester').value.trim(), grade = E('shipReqGrade').value.trim(), weight = num(E('shipReqWeight').value);
    if (!soNo || !requester || !grade || weight <= 0) return msg('shipReqMsg', 'S.O 넘버·요청자·강종·요청 중량을 모두 입력하세요.', true);
    preview = { soNo, requester, grade, weight, forecast: requestForecast(grade, weight) };
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
      const data = requestForecast(item.grade, item.weight);
      return `<article class="donecard ship-request-card ${data.progress < 100 ? 'low' : ''}"><div class="actions" style="justify-content:space-between"><span class="status-chip ${data.progress < 100 ? 'warn' : ''}">${data.progress >= 100 ? '출하준비 100%' : `준비 진행 ${pct(data.progress)}`}</span><span>요청자 ${esc(item.requester)}</span></div><h2>${esc(item.soNo)} · ${esc(item.grade)}</h2><p><b>요청 ${kg(item.weight)} · 즉시 가능 ${kg(data.ready)}</b></p>${forecastHtml(data, `${item.soNo} 진행율`)}</article>`;
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
    }
  };

  const priorRenderAll = renderAll;
  renderAll = function renderAllWithShippingRequests() {
    ensureArray();
    priorRenderAll();
    renderRequestInputs();
    renderShippingRequests();
  };

  window.fillShippingRequestFromSo = fillShippingRequestFromSo;
  window.clearShippingPreview = clearShippingPreview;
  window.previewShippingRequest = previewShippingRequest;
  window.confirmShippingRequest = confirmShippingRequest;
  window.renderShippingRequests = renderShippingRequests;
  window.ShippingRequestForecast = { requestForecast, percent };
})();
