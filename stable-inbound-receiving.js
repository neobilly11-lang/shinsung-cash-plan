(() => {
  'use strict';

  let currentInboundId = '';
  let inboundStream = null;
  let inboundTimer = null;
  let inboundSaving = false;

  function inspectionActivity(p, appState = state) {
    if (!p) return false;
    return appState.splits.some(row => row.packageNo === p.packageNo && row.status !== 'CANCELLED') ||
      appState.inspectionDrafts.some(row => row.packageNo === p.packageNo && row.status === 'TEMP') ||
      appState.workWaits.some(row => row.packageNo === p.packageNo && row.status !== 'CANCELLED');
  }

  function isInboundPending(p, appState = state) {
    return !!p && !['CANCELLED', 'DELETED'].includes(p.status) && p.status !== 'RECEIVED' && !p.receivedAt && !inspectionActivity(p, appState);
  }

  function inboundPending(appState = state) {
    return appState.pos.filter(p => isInboundPending(p, appState));
  }

  function markInboundReceived(p, note = '', completedAt = new Date().toISOString(), appState = state) {
    if (!isInboundPending(p, appState)) return false;
    const cleanNote = String(note || '').trim();
    p.status = 'RECEIVED';
    p.receivedAt = completedAt;
    p.inboundNote = cleanNote;
    if (!Array.isArray(appState.auditLogs)) appState.auditLogs = [];
    appState.auditLogs.push({
      id: crypto.randomUUID(), action: 'INBOUND_COMPLETE', target: p.id,
      packageNo: p.packageNo, poNo: p.poNo || '', weight: num(p.weight),
      note: cleanNote, createdAt: completedAt
    });
    return true;
  }

  function receivingSpecialNotes(appState = state) {
    return appState.pos.filter(p => !!p.receivedAt && String(p.inboundNote || '').trim());
  }

  function ensureInboundUi() {
    if (!E('openInboundReceiving')) {
      const tasks = E('home')?.querySelector('.home-tasks');
      if (tasks) tasks.insertAdjacentHTML('afterbegin', `<button id="openInboundReceiving" class="homebtn green inbound-home" onclick="openInboundReceiving()"><span>입고완료 · 사내입고 QR</span><strong>QR 촬영·입고확정</strong><small id="inboundHomeCount">입고대기 0건</small></button>`);
    }
    if (!E('dashInboundNotes')) {
      E('dashboard')?.querySelector('.dashboard-grid')?.insertAdjacentHTML('beforeend', `<button id="dashInboundNotes" class="dash-card" onclick="showInboundNotes()"><small>입고 특이사항 · 클릭하여 상세조회</small><b id="dashInboundNoteCount">0건</b></button>`);
    }
    if (!E('inboundReceive')) {
      document.querySelector('main')?.insertAdjacentHTML('beforeend', `
        <section id="inboundReceive" class="view">
          <p class="eyebrow">P.O 확정 후 입고처리</p><h1>사내입고 QR 촬영·입고완료</h1>
          <div class="actions"><button class="btn" onclick="show('home')">← 업무수행으로</button><button class="btn primary" onclick="startInboundScan()">카메라 시작</button><button class="btn" onclick="stopInboundScan()">카메라 종료</button></div>
          <div id="inboundScanner" class="scanner"><video id="inboundVideo" playsinline muted></video><div class="scan-target"><span>사내입고번호 QR 1개만 중앙에 맞추세요</span></div><div class="scanline"></div></div>
          <div class="card"><label>사내입고번호·P.O·거래처·강종 검색<input id="inboundSearch" placeholder="입고대기 자료 검색" oninput="renderInboundReceiving()"></label><label>입고대기 검색 결과<select id="inboundPackageSelect"></select></label><button class="btn primary" style="width:100%;margin-top:12px" onclick="handleInboundSelection()">선택 사내입고 확인</button></div>
          <div id="inboundPendingSummary" class="summary"></div><div id="inboundMsg" class="msg"></div>
        </section>
        <section id="inboundReceiveDetail" class="view">
          <p class="eyebrow">QR 확인 결과</p><h1 id="inboundDetailTitle">입고완료 확인</h1>
          <button class="btn" onclick="show('inboundReceive')">← 입고대기 목록으로</button>
          <div id="inboundDetailBody"></div><div id="inboundDetailMsg" class="msg"></div>
        </section>
        <section id="inboundNotes" class="view">
          <p class="eyebrow">입고완료 기록</p><h1>입고 특이사항 상세내역</h1>
          <button class="btn" onclick="show('dashboard')">← 현황판으로</button>
          <div class="card"><label>특이사항 검색<input id="inboundNoteSearch" placeholder="사내입고번호·P.O·거래처·강종·메모 검색" oninput="renderInboundNotes()"></label></div>
          <div id="inboundNoteList"></div>
        </section>`);
    }
    if (!E('inboundReceivingStyle')) {
      const style = document.createElement('style');
      style.id = 'inboundReceivingStyle';
      style.textContent = `
        .inbound-home{background:linear-gradient(135deg,#073f61,#0b8062)!important}.inbound-home small{display:block;color:#d9fff1;font-weight:900;margin-top:8px}
        #inboundScanner{margin:14px 0}.inbound-detail-card{border-left:8px solid var(--green)}.inbound-note{border-left:8px solid var(--amber)}.inbound-note-text{font-size:18px;line-height:1.55;background:#fff7df;border-radius:14px;padding:14px;margin-top:12px;white-space:pre-wrap}.inbound-grade-line{font-weight:900;color:var(--green)}
        #inboundDetailBody textarea{min-height:140px;font-size:18px}.inbound-complete-button{width:100%;min-height:64px;font-size:22px;margin-top:12px}
      `;
      document.head.appendChild(style);
    }
  }

  function renderInboundCounters() {
    ensureInboundUi();
    const pending = inboundPending(), notes = receivingSpecialNotes();
    if (E('inboundHomeCount')) E('inboundHomeCount').textContent = `입고대기 ${pending.length}건`;
    if (E('dashInboundNoteCount')) E('dashInboundNoteCount').textContent = `${notes.length}건`;
  }

  function packageGradeText(p) {
    return [p.mainGrade || p.grade, p.subGrade, p.detailGrade].map(v => String(v || '').trim()).filter(Boolean).join(' · ') || '-';
  }

  function renderInboundReceiving() {
    ensureInboundUi();
    const query = String(E('inboundSearch')?.value || '').trim().toLowerCase();
    const rows = inboundPending().filter(p => !query || [p.packageNo, p.poNo, p.company, p.grade, p.mainGrade, p.subGrade, p.detailGrade].some(value => String(value || '').toLowerCase().includes(query)));
    E('inboundPackageSelect').innerHTML = rows.length ? `<option value="">입고할 사내입고번호 선택</option>${rows.map(p => `<option value="${esc(p.id)}">${esc(p.packageNo)} · ${esc(p.company)} · ${esc(packageGradeText(p))} · ${kg(p.weight)}</option>`).join('')}` : '<option value="">검색된 입고대기 자료 없음</option>';
    const total = rows.reduce((sum, p) => sum + num(p.weight), 0);
    E('inboundPendingSummary').innerHTML = `<div><small>검색된 입고대기</small><b>${rows.length}건</b></div><div><small>입고대기 중량</small><b>${kg(total)}</b></div>`;
  }

  function openInboundReceiving() {
    currentInboundId = '';
    ensureInboundUi();
    if (E('inboundSearch')) E('inboundSearch').value = '';
    renderInboundReceiving();
    show('inboundReceive');
  }

  function openInboundPackage(id) {
    const p = state.pos.find(row => row.id === id);
    if (!p) return msg('inboundMsg', '사내입고 자료를 찾을 수 없습니다.', true);
    if (!isInboundPending(p)) return msg('inboundMsg', `${p.packageNo}는 이미 입고완료 또는 검수 진행 중인 자료입니다.`, true);
    currentInboundId = p.id;
    show('inboundReceiveDetail');
  }

  function renderInboundDetail() {
    const p = state.pos.find(row => row.id === currentInboundId);
    if (!p) {
      E('inboundDetailBody').innerHTML = '<div class="card">확인할 사내입고 자료가 없습니다.</div>';
      return;
    }
    E('inboundDetailTitle').textContent = `${p.packageNo} 입고완료 확인`;
    E('inboundDetailBody').innerHTML = `<article class="card inbound-detail-card"><div class="summary"><div><small>사내입고번호</small><b>${esc(p.packageNo)}</b></div><div><small>P.O</small><b>${esc(p.poNo || '-')}</b></div><div><small>거래처</small><b>${esc(p.company || '-')}</b></div><div><small>입고 중량</small><b>${kg(p.weight)}</b></div></div><p class="inbound-grade-line">강종 ${esc(p.mainGrade || p.grade || '-')} · 소강종 ${esc(p.subGrade || '-')} · 상세강종 ${esc(p.detailGrade || '-')}</p><label>특이사항 메모<textarea id="inboundNote" placeholder="특이사항이 없으면 공란으로 입고완료할 수 있습니다."></textarea></label><button id="inboundCompleteButton" class="btn primary inbound-complete-button" ${inboundSaving ? 'disabled' : ''} onclick="completeInboundReceiving()">${inboundSaving ? '⏳ 저장 진행 중' : '입고완료'}</button></article>`;
  }

  function handleInboundSelection() {
    const id = E('inboundPackageSelect')?.value || '';
    if (!id) return msg('inboundMsg', '입고할 사내입고번호를 선택하세요.', true);
    openInboundPackage(id);
  }

  function inboundCode(raw) {
    const text = String(raw || '').trim();
    try {
      const url = new URL(text, location.href);
      return String(url.searchParams.get('package') || text).trim().toUpperCase();
    } catch (_) {
      return text.toUpperCase();
    }
  }

  function selectInboundCode(raw) {
    const code = inboundCode(raw), p = state.pos.find(row => String(row.packageNo || '').toUpperCase() === code);
    if (!p) return msg('inboundMsg', `${code || '촬영한 QR'} 사내입고번호를 찾을 수 없습니다.`, true);
    if (!isInboundPending(p)) return msg('inboundMsg', `${p.packageNo}는 이미 입고완료 또는 검수 진행 중입니다.`, true);
    stopInboundScan();
    openInboundPackage(p.id);
  }

  async function startInboundScan() {
    stopInboundScan();
    if (!('BarcodeDetector' in window)) return msg('inboundMsg', '이 기기는 자동 QR 촬영을 지원하지 않습니다. 아래 검색·선택 기능을 이용하세요.', true);
    try {
      inboundStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
      E('inboundVideo').srcObject = inboundStream;
      await E('inboundVideo').play();
      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      inboundTimer = setInterval(async () => {
        try {
          const codes = await detector.detect(E('inboundVideo'));
          const selectedCode = typeof pickCenteredQr === 'function' ? pickCenteredQr(codes, E('inboundVideo')) : codes[0];
          if (selectedCode?.rawValue) selectInboundCode(selectedCode.rawValue);
        } catch (_) {}
      }, 450);
      msg('inboundMsg', '입고할 사내입고번호 QR 1개만 중앙칸에 맞추세요.');
    } catch (error) {
      msg('inboundMsg', `카메라를 열 수 없습니다: ${error.message}`, true);
    }
  }

  function stopInboundScan() {
    if (inboundTimer) clearInterval(inboundTimer);
    inboundTimer = null;
    if (inboundStream) inboundStream.getTracks().forEach(track => track.stop());
    inboundStream = null;
    if (E('inboundVideo')) E('inboundVideo').srcObject = null;
  }

  async function completeInboundReceiving() {
    if (inboundSaving) return;
    const p = state.pos.find(row => row.id === currentInboundId);
    if (!p) return msg('inboundDetailMsg', '입고완료할 자료를 찾을 수 없습니다.', true);
    if (!isInboundPending(p)) return msg('inboundDetailMsg', `${p.packageNo}는 이미 입고완료 또는 검수 진행 중입니다.`, true);
    const note = String(E('inboundNote')?.value || '').trim(), backup = JSON.parse(JSON.stringify(state));
    inboundSaving = true;
    renderInboundDetail();
    if (typeof window.beginSaveProgress === 'function') window.beginSaveProgress('입고완료 저장 중', `${p.packageNo}를 검수대기로 이동하고 있습니다.`);
    try {
      if (!markInboundReceived(p, note)) throw Error('이미 입고완료 또는 검수 진행 중인 자료입니다.');
      await saveState();
      currentInboundId = '';
      show('inboundReceive');
      msg('inboundMsg', `${p.packageNo} 입고완료 · 검수대기로 이동했습니다.${note ? ' 특이사항도 현황판에 등록했습니다.' : ''}`);
    } catch (error) {
      state = defaults(backup);
      renderAll();
      msg('inboundDetailMsg', `입고완료 저장 실패: ${error.message}`, true);
    } finally {
      inboundSaving = false;
      if (typeof window.endSaveProgress === 'function') window.endSaveProgress();
      renderInboundCounters();
      if (currentInboundId) renderInboundDetail();
    }
  }

  function renderInboundNotes() {
    ensureInboundUi();
    const query = String(E('inboundNoteSearch')?.value || '').trim().toLowerCase();
    const rows = receivingSpecialNotes().filter(p => !query || [p.packageNo, p.poNo, p.company, p.grade, p.mainGrade, p.subGrade, p.detailGrade, p.inboundNote].some(value => String(value || '').toLowerCase().includes(query))).sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
    E('inboundNoteList').innerHTML = rows.length ? rows.map(p => `<article class="donecard inbound-note"><h2>${esc(p.packageNo)} · ${esc(p.company || '-')}</h2><p><b>P.O ${esc(p.poNo || '-')}</b> · ${esc(packageGradeText(p))} · ${kg(p.weight)}</p><p>${esc(String(p.receivedAt || '').replace('T', ' ').slice(0, 16))}</p><div class="inbound-note-text">${esc(p.inboundNote)}</div></article>`).join('') : '<div class="card">검색된 입고 특이사항이 없습니다.</div>';
  }

  function showInboundNotes() {
    ensureInboundUi();
    if (E('inboundNoteSearch')) E('inboundNoteSearch').value = '';
    renderInboundNotes();
    show('inboundNotes');
  }

  window.InboundReceiving = { inspectionActivity, isInboundPending, inboundPending, markInboundReceived, receivingSpecialNotes, inboundCode };
  window.openInboundReceiving = openInboundReceiving;
  window.openInboundPackage = openInboundPackage;
  window.renderInboundReceiving = renderInboundReceiving;
  window.handleInboundSelection = handleInboundSelection;
  window.startInboundScan = startInboundScan;
  window.stopInboundScan = stopInboundScan;
  window.completeInboundReceiving = completeInboundReceiving;
  window.renderInboundNotes = renderInboundNotes;
  window.showInboundNotes = showInboundNotes;

  if (window.__INBOUND_RECEIVING_NO_BOOT__) return;
  ensureInboundUi();
  const baseRenderAll = renderAll;
  renderAll = function inboundRenderAll() {
    baseRenderAll();
    ensureInboundUi();
    renderInboundCounters();
    if (E('inboundReceive')?.classList.contains('on')) renderInboundReceiving();
    if (E('inboundReceiveDetail')?.classList.contains('on')) renderInboundDetail();
    if (E('inboundNotes')?.classList.contains('on')) renderInboundNotes();
  };
  const baseShow = show;
  show = function inboundShow(id) {
    if (id !== 'inboundReceive') stopInboundScan();
    baseShow(id);
    if (['inboundReceive', 'inboundReceiveDetail', 'inboundNotes'].includes(id)) {
      document.querySelectorAll('.bottom button').forEach(button => button.classList.toggle('on', button.dataset.v === (id === 'inboundNotes' ? 'dashboard' : 'home')));
    }
    if (id === 'inboundReceive') renderInboundReceiving();
    if (id === 'inboundReceiveDetail') renderInboundDetail();
    if (id === 'inboundNotes') renderInboundNotes();
  };
  renderInboundCounters();
})();
