Exit code: 0
Wall time: 1.6 seconds
Output:
(() => {
  'use strict';

  const style = document.createElement('style');
  style.textContent = `
    .save-progress-overlay{position:fixed;inset:0;z-index:300;display:none;align-items:center;justify-content:center;background:#07110eb8;padding:20px}
    .save-progress-overlay.on{display:flex}
    .save-progress-card{width:min(92vw,430px);border-radius:24px;background:#fff;padding:28px 22px;text-align:center;box-shadow:0 24px 70px #0007}
    .save-progress-hourglass{display:block;font-size:58px;line-height:1;animation:save-hourglass 1.25s ease-in-out infinite}
    .save-progress-card b{display:block;margin-top:15px;font-size:24px;color:var(--ink)}
    .save-progress-card p{margin:9px 0 0;color:var(--muted);font-size:15px;line-height:1.5}
    .save-progress-dots:after{content:"";animation:save-dots 1.3s steps(4,end) infinite}
    .draft-preview-card{display:grid;grid-template-columns:minmax(0,1fr) 180px;gap:14px;align-items:center}
    .draft-preview-info{min-width:0}
    .draft-preview-photo{width:180px;height:145px;border:2px solid var(--green);border-radius:14px;overflow:hidden;background:#e8eeeb;padding:0;cursor:pointer}
    .draft-preview-photo img{display:block;width:100%;height:100%;object-fit:cover}
    .draft-preview-empty{width:180px;height:145px;border:2px dashed var(--line);border-radius:14px;background:#f5f8f6;display:grid;place-items:center;text-align:center;color:var(--muted);font-size:14px;font-weight:900;padding:8px}
    @keyframes save-hourglass{0%,100%{transform:rotate(0deg) scale(1)}45%{transform:rotate(0deg) scale(1.08)}50%{transform:rotate(180deg) scale(1.08)}95%{transform:rotate(180deg) scale(1)}}
    @keyframes save-dots{0%{content:""}25%{content:"."}50%{content:".."}75%,100%{content:"..."}}
    @media(max-width:600px){
      .draft-preview-card{grid-template-columns:minmax(0,1fr) 118px;gap:9px}
      .draft-preview-photo,.draft-preview-empty{width:118px;height:108px}
      .draft-preview-info h2{font-size:19px}
      .save-progress-card{padding:24px 17px}.save-progress-hourglass{font-size:50px}
    }
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'saveProgressOverlay';
  overlay.className = 'save-progress-overlay';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'assertive');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML = `
    <div class="save-progress-card">
      <span class="save-progress-hourglass" aria-hidden="true">⏳</span>
      <b id="saveProgressTitle">자료 저장 진행 중<span class="save-progress-dots"></span></b>
      <p id="saveProgressDetail">창을 닫거나 뒤로 가지 말고 잠시 기다려 주세요.</p>
    </div>
  `;
  document.body.appendChild(overlay);

  let progressDepth = 0;
  let progressStartedAt = 0;

  function beginSaveProgress(title = '자료 저장 진행 중', detail = '창을 닫거나 뒤로 가지 말고 잠시 기다려 주세요.') {
    progressDepth += 1;
    progressStartedAt = progressStartedAt || Date.now();
    E('saveProgressTitle').innerHTML = `${esc(title)}<span class="save-progress-dots"></span>`;
    E('saveProgressDetail').textContent = detail;
    overlay.classList.add('on');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.setAttribute('aria-busy', 'true');
  }

  function updateSaveProgress(title, detail) {
    if (!progressDepth) beginSaveProgress(title, detail);
    else {
      E('saveProgressTitle').innerHTML = `${esc(title)}<span class="save-progress-dots"></span>`;
      E('saveProgressDetail').textContent = detail;
    }
  }

  function endSaveProgress() {
    progressDepth = Math.max(0, progressDepth - 1);
    if (progressDepth) return;
    const elapsed = Date.now() - progressStartedAt;
    const finish = () => {
      if (progressDepth) return;
      overlay.classList.remove('on');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.removeAttribute('aria-busy');
      progressStartedAt = 0;
    };
    if (elapsed < 450) setTimeout(finish, 450 - elapsed);
    else finish();
  }

  window.beginSaveProgress = beginSaveProgress;
  window.updateSaveProgress = updateSaveProgress;
  window.endSaveProgress = endSaveProgress;

  const originalSaveState = saveState;
  saveState = async function saveStateWithProgress() {
    beginSaveProgress('공용 서버에 저장 중', '다른 기기에서도 보이도록 자료를 안전하게 저장하고 있습니다.');
    try {
      return await originalSaveState.apply(this, arguments);
    } finally {
      endSaveProgress();
    }
  };

  const originalSaveSettings = saveSettings;
  saveSettings = async function saveSettingsWithProgress() {
    beginSaveProgress('기준정보 저장 중', '강종·거래처·장소 기준정보를 공용 서버에 저장하고 있습니다.');
    try {
      return await originalSaveSettings.apply(this, arguments);
    } finally {
      endSaveProgress();
    }
  };

  async function canvasBlob(canvas, quality) {
    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(Error('사진 압축에 실패했습니다.')),
        'image/jpeg',
        quality
      );
    });
  }

  async function compressPhotoForStorage(file) {
    const image = await loadImage(file);
    try {
      const longest = Math.max(image.width, image.height);
      let scale = Math.min(1, 1100 / longest);
      const canvas = document.createElement('canvas');
      const draw = () => {
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw Error('사진 압축 기능을 사용할 수 없습니다.');
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
      };
      draw();
      let blob = await canvasBlob(canvas, 0.62);
      if (blob.size > 430000) {
        scale = Math.min(scale, 850 / longest);
        draw();
        blob = await canvasBlob(canvas, 0.5);
      }
      canvas.width = 1;
      canvas.height = 1;
      return blob;
    } finally {
      if (typeof image.close === 'function') image.close();
    }
  }

  function storagePath(no, kind) {
    const safeNo = String(no || 'unknown').replace(/[^a-zA-Z0-9가-힣_-]/g, '_');
    const safeKind = String(kind || 'photo').replace(/[^a-zA-Z0-9_-]/g, '_');
    const suffix = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `inspection/${safeNo}/${Date.now()}-${safeKind}-${suffix}.jpg`;
  }

  function encodedStoragePath(path) {
    return path.split('/').map(encodeURIComponent).join('/');
  }

  uploadPhoto = async function uploadPhotoToStorage(file, no, kind) {
    if (!file) return '';
    beginSaveProgress('사진 압축·저장 중', `${no} 사진을 용량 축소한 뒤 안전하게 저장하고 있습니다.`);
    try {
      const blob = await compressPhotoForStorage(file);
      const path = storagePath(no, kind);
      try {
        const response = await fetch(`${API}/storage/v1/object/${BUCKET}/${encodedStoragePath(path)}`, {
          method: 'POST',
          headers: {
            apikey: KEY,
            Authorization: `Bearer ${KEY}`,
            'Content-Type': 'image/jpeg',
            'x-upsert': 'true'
          },
          body: blob
        });
        if (response.ok) return path;
        console.warn('사진 저장소 업로드 실패, 축소 사진을 자료에 함께 저장합니다.', response.status);
      } catch (error) {
        console.warn('사진 저장소 연결 실패, 축소 사진을 자료에 함께 저장합니다.', error);
      }
      if (blob.size > 650000) {
        throw Error('사진 용량을 충분히 줄이지 못했습니다. 사진을 다시 촬영해 주세요.');
      }
      return await blobDataUrl(blob);
    } finally {
      endSaveProgress();
    }
  };

  saveInspectionDraft = async function saveInspectionDraftStable() {
    if (saving) return;
    const packageItem = state.pos.find(item => item.packageNo === currentPackage);
    if (!packageItem) return msg('inspectMsg', '사내입고번호를 다시 선택하세요.', true);
    saving = true;
    E('draftSave').disabled = true;
    E('inspectSave').disabled = true;
    beginSaveProgress('검수 임시보관 중', '선택한 사진을 한 장씩 압축하고 있습니다.');
    const backup = JSON.parse(JSON.stringify(state));
    const old = state.inspectionDrafts.find(
      item => item.packageNo === packageItem.packageNo && item.status === 'TEMP'
    );
    const photoInputs = [
      ['shape', 'shape-draft', E('shapePhoto').files[0]],
      ['analyzer', 'analyzer-draft', E('analyzerPhoto').files[0]],
      ['anomaly', 'anomaly-draft', E('anomalyPhoto').files[0]]
    ];
    try {
      const photos = { ...(old?.photos || {}) };
      for (let index = 0; index < photoInputs.length; index += 1) {
        const [key, kind, file] = photoInputs[index];
        if (!file) continue;
        updateSaveProgress(
          '검수 사진 저장 중',
          `${index + 1}/3 사진을 처리하고 있습니다. 사진이 클수록 잠시 시간이 걸릴 수 있습니다.`
        );
        photos[key] = await uploadPhoto(file, packageItem.packageNo, kind);
      }
      const draft = {
        id: old?.id || crypto.randomUUID(),
        packageNo: packageItem.packageNo,
        productType: E('finalType').value,
        mainGrade: E('finalMain').value.trim(),
        subGrade: E('finalSub').value.trim(),
        detailGrade: E('finalDetail').value.trim(),
        weight: E('finalWeight').value ? num(E('finalWeight').value) : '',
        memo: E('memo').value.trim(),
        photos,
        status: 'TEMP',
        createdAt: old?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      state.inspectionDrafts = state.inspectionDrafts.filter(item => item.id !== draft.id);
      state.inspectionDrafts.push(draft);
      updateSaveProgress('임시보관 자료 저장 중', '사진 경로와 검수 내용을 공용 서버에 저장하고 있습니다.');
      await saveState();
      openScanMode('inspect');
      msg(
        'scanMsg',
        `${packageItem.packageNo} 검수 내용을 임시보관했습니다. 저장된 사진은 임시보관 목록 오른쪽에서 바로 확인할 수 있습니다.`
      );
    } catch (error) {
      state = defaults(backup);
      renderAll();
      msg('inspectMsg', `임시보관 실패: ${error.message}`, true);
    } finally {
      saving = false;
      E('draftSave').disabled = false;
      E('inspectSave').disabled = false;
      endSaveProgress();
    }
  };

  renderDrafts = function renderDraftsWithPhotoPreview() {
    const query = String(E('draftSearch')?.value || '').trim().toLowerCase();
    const list = state.inspectionDrafts
      .filter(item => item.status === 'TEMP')
      .filter(item => {
        const packageItem = state.pos.find(value => value.packageNo === item.packageNo);
        return !query || [
          item.packageNo, packageItem?.company, packageItem?.grade,
          item.mainGrade, item.subGrade, item.detailGrade, item.memo
        ].some(value => String(value || '').toLowerCase().includes(query));
      })
      .slice()
      .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));

    E('draftList').innerHTML = list.length
      ? list.map(item => {
        const packageItem = state.pos.find(value => value.packageNo === item.packageNo);
        const grade = gradeLabel(
          item.mainGrade, item.subGrade, item.detailGrade, item.productType
        ) || '강종 미입력';
        const preview = item.photos?.shape || item.photos?.analyzer || item.photos?.anomaly || '';
        const previewHtml = preview
          ? `<button class="draft-preview-photo" data-grade="${esc(grade)}" onclick="openPhoto(this.querySelector('img').src,this.dataset.grade,'임시보관 사진')"><img src="${esc(photoUrl(preview))}" alt="${esc(item.packageNo)} 임시보관 사진" loading="lazy"></button>`
          : '<div class="draft-preview-empty">저장된 사진<br>없음</div>';
        return `<article class="donecard draft-preview-card">
          <div class="draft-preview-info">
            <span class="status-chip warn">임시보관</span>
            <h2>${esc(item.packageNo)} · ${esc(packageItem?.company || '')}</h2>
            <p><b>${esc(grade)} · ${item.weight ? kg(item.weight) : '확정중량 미입력'}</b></p>
            <p>${esc(String(item.updatedAt || item.createdAt).replace('T', ' ').slice(0, 16))}${item.memo ? ` · ${esc(item.memo)}` : ''}</p>
            <button class="btn primary" onclick="openInspection('${esc(item.packageNo)}')">검수 계속하기</button>
          </div>
          ${previewHtml}
        </article>`;
      }).join('')
      : '<div class="card">검수 임시보관 자료가 없습니다.</div>';
  };
})();

