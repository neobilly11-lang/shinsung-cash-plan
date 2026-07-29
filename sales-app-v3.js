Exit code: 0
Wall time: 3.2 seconds
Total output lines: 1109
Output:
(() => {
  'use strict';
  window.SALES_APP_V3 = true;

  const SUPABASE_URL = 'https://orpeybiqikrdydkhsjjs.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_TerLvPZo7e5_X91A-P4qlQ_DaqBly0Q';
  const HEAD = { apikey: SUPABASE_KEY };
  const TABLE = 'sales_state';
  const META_ID = '__SALES_META_V3__';
  const META_KIND = 'SALES_META_V3';
  const SCRAP_SYSTEM_ID = '__SCRAP_SHARED_STATE_V1__';
  const LOCAL_KEY = 'shinsung-sales-v1';
  const $ = id => document.getElementById(id);
  const BASE_IDS = ['contract', 'contractDate', 'buyCompany'];
  const LINE_IDS = [
    'gradeName', 'subGrade', 'weight', 'buyUsd', 'buyFx', 'destination',
    'freight', 'workCost', 'shinsungProfit', 'sellUsd', 'sellFx',
    'sellCompany', 'status', 'soldDate', 'turnDays'
  ];
  const NUMERIC_LINE_IDS = [
    'weight', 'buyUsd', 'buyFx', 'freight', 'workCost',
    'shinsungProfit', 'sellUsd', 'sellFx', 'turnDays'
  ];
  const EXCEL_HEADERS = [
    '계약번호', '계약일', '매입 회사명', '강종 이름', '소강종', '중량(kg)',
    '매입 USD 단가', '매입 예상환율', '도착지', '예상 운임(USD/kg)',
    '예상 작업비(USD/kg)', '신성금속 수익(USD/kg)', '판매 USD 단가',
    '판매 예상환율', '판매처', '판매 상태', '판매완료일', '자금회전일',
    '클레임비(원)', '메모', '최근 송금일', '누적 송금액(USD)', '송금 메모',
    '매입 원화금액', '판매 예상매출', '예상 총이익', '이익률', '환차익',
    '신성금속 귀속수익', '연환산 수익률', '미송금 잔액(USD)', '미송금 원화환산'
  ];
  const EXCEL_WIDTHS = [
    16, 12, 19, 17, 16, 12, 15, 15, 16, 19, 20, 22, 15, 15, 19, 12,
    12, 13, 15, 28, 13, 18, 24, 17, 17, 17, 12, 17, 20, 17, 18, 19
  ];

  let state = { items: [], revision: 0 };
  let editId = null;
  let currentExtraContract = '';
  let localMode = false;
  let serverTransport = '';

  const n = value => Number(value) || 0;
  const normalized = value => String(value ?? '').trim().toLowerCase();
  const contractKey = value => String(value ?? '').trim();
  const fmt = value => `${Math.round(n(value)).toLocaleString('ko-KR')}원`;
  const pct = value => `${(n(value) * 100).toFixed(1)}%`;
  const kg = value => `${n(value).toLocaleString('ko-KR', { maximumFractionDigits: 2 })} kg`;
  const usd = value => `$${n(value).toLocaleString('ko-KR', { maximumFractionDigits: 2 })}`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const today = () => {
    const date = new Date();
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')
    ].join('-');
  };

  function businessItems() {
    return state.items.filter(item => (
      item &&
      item._kind !== META_KIND &&
      item.id !== SCRAP_SYSTEM_ID &&
      item.hiddenSystemItem !== true
    ));
  }

  function meta(create = true) {
    let record = state.items.find(item => item && item._kind === META_KIND);
    if (!record && create) {
      record = {
        id: META_ID,
        _kind: META_KIND,
        freightMasters: [],
        workMasters: [],
        contractExtras: {}
      };
      state.items.push(record);
    }
    if (!record) return null;
    if (!Array.isArray(record.freightMasters)) record.freightMasters = [];
    if (!Array.isArray(record.workMasters)) record.workMasters = [];
    if (!record.contractExtras || typeof record.contractExtras !== 'object') {
      record.contractExtras = {};
    }
    return record;
  }

  function contractRows(contract) {
    const key = contractKey(contract);
    return businessItems()
      .filter(item => contractKey(item.contract) === key)
      .sort((a, b) => n(a.created) - n(b.created));
  }

  function legacyExtra(contract) {
    const rows = contractRows(contract);
    const unique = key => [...new Set(rows.map(row => String(row[key] || '').trim()).filter(Boolean))].join(' / ');
    const dates = rows.map(row => String(row.remittanceDate || '').slice(0, 10)).filter(Boolean).sort();
    return {
      remittanceDate: dates.at(-1) || '',
      remittedUsd: rows.reduce((sum, row) => sum + n(row.remittedUsd), 0),
      remittanceMemo: unique('remittanceMemo'),
      claim: rows.reduce((sum, row) => sum + n(row.claim), 0),
      memo: unique('memo')
    };
  }

  function contractExtra(contract) {
    const key = contractKey(contract);
    const record = meta(false);
    const saved = record && record.contractExtras[key];
    const source = saved && typeof saved === 'object' ? saved : legacyExtra(key);
    return {
      remittanceDate: String(source.remittanceDate || '').slice(0, 10),
      remittedUsd: n(source.remittedUsd),
      remittanceMemo: String(source.remittanceMemo || ''),
      claim: n(source.claim),
      memo: String(source.memo || '')
    };
  }

  function contractBuyUsd(contract) {
    return contractRows(contract).reduce((sum, item) => sum + n(item.weight) * n(item.buyUsd), 0);
  }

  function itemPayment(item) {
    const rows = contractRows(item.contract);
    let remaining = contractExtra(item.contract).remittedUsd;
    for (const row of rows) {
      const rowTotal = n(row.weight) * n(row.buyUsd);
      const allocated = Math.max(0, Math.min(rowTotal, remaining));
      if (row.id === item.id) return allocated;
      remaining = Math.max(0, remaining - rowTotal);
    }
    return 0;
  }

  function itemClaim(item) {
    const first = contractRows(item.contract)[0];
    return first && first.id === item.id ? contractExtra(item.contract).claim : 0;
  }

  function metrics(item, preview = false) {
    const weight = n(item.weight);
    const buyUsdTotal = weight * n(item.buyUsd);
    const buyTotal = buyUsdTotal * n(item.buyFx);
    const salesUsd = weight * n(item.sellUsd);
    const sales = salesUsd * n(item.sellFx);
    const incomeFx = n(item.sellFx) || n(item.buyFx);
    const freightKrw = weight * n(item.freight) * incomeFx;
    const workKrw = weight * n(item.workCost) * incomeFx;
    const claim = preview ? n(item.claim) : itemClaim(item);
    const remittedUsd = preview ? n(item.remittedUsd) : itemPayment(item);
    const shinsung = weight * (
      n(item.freight) + n(item.workCost) + n(item.shinsungProfit)
    ) * incomeFx + claim;
    const fxGain = salesUsd * (n(item.sellFx) - n(item.buyFx));
    const profit = sales - buyTotal - freightKrw - workKrw - shinsung;
    const margin = sales ? profit / sales : 0;
    const annual = n(item.turnDays) ? margin * 365 / n(item.turnDays) : 0;
    const unpaidUsd = Math.max(0, buyUsdTotal - remittedUsd);
    const unpaidKrw = unpaidUsd * n(item.buyFx);
    return {
      buyUsdTotal, buyTotal, sales, freightKrw, workKrw, shinsung,
      fxGain, profit, margin, annual, salesUsd, unpaidUsd, unpaidKrw,
      remittedUsd
    };
  }

  function toast(message) {
    $('toast').textContent = message;
    $('toast').classList.add('show');
    setTimeout(() => $('toast').classList.remove('show'), 2200);
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function readDirectRow() {
    const response = await fetchWithTimeout(
      `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.main&select=items,revision`,
      { headers: HEAD, cache: 'no-store' },
      20000
    );
    if (!response.ok) throw new Error(`Supabase HTTP ${response.status}`);
    const rows = await response.json();
    if (!rows.length) throw new Error('영업 데이터 서버가 준비되지 않았습니다.');
    return {
      items: Array.isArray(rows[0].items) ? rows[0].items : [],
      revision: n(rows[0].revision)
    };
  }

  async function fetchRemote() {
    let apiError = '';
    try {
      const response = await fetchWithTimeout('/api/sales-state', { cache: 'no-store' });
      const text = await response.text();
      const result = JSON.parse(text || '{}');
      if (!response.ok) throw new Error(result.error || `Vercel HTTP ${response.status}`);
      serverTransport = 'vercel';
      return {
        items: Array.isArray(result.items) ? result.items : [],
        revision: n(result.revision)
      };
    } catch (error) {
      apiError = error.name === 'AbortError' ? 'Vercel 응답 시간 초과' : error.message;
    }
    try {
      const direct = await readDirectRow();
      serverTransport = 'supabase';
      return {
        items: direct.items.filter(item => (
          item?.id !== SCRAP_SYSTEM_ID && item?.hiddenSystemItem !== true
        )),
        revision: direct.revision
      };
    } catch (error) {
      serverTransport = '';
      throw new Error(`${apiError} / ${error.message}`);
    }
  }

  async function load() {
    try {
      state = await fetchRemote();
      localMode = false;
      const serverName = serverTransport === 'vercel' ? 'Vercel 공용 서버' : 'Supabase 공용 서버';
      $('syncStatus').textContent = `${serverName} 연결됨 · ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;
      render();
    } catch (error) {
      localMode = true;
      try {
        const saved = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
        state = { items: Array.isArray(saved.items) ? saved.items : [], revision: 0 };
      } catch (_) {
        state = { items: [], revision: 0 };
      }
      $('syncStatus').textContent = '이 기기에 임시 저장 중 · 공용 서버 연결 필요';
      render();
      toast('서버 연결 전까지 이 기기에 안전하게 저장합니다.');
    }
  }

  async function persist() {
    if (localMode) {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({ items: state.items }));
      $('syncStatus').textContent = `이 기기에 저장됨 · ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;
      return;
    }
    const cleanItems = state.items.filter(item => (
      item?.id !== SCRAP_SYSTEM_ID && item?.hiddenSystemItem !== true
    ));
    if (serverTransport === 'vercel') {
      try {
        const response = await fetchWithTimeout('/api/sales-state', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ items: cleanItems, baseRevision: state.revision })
        }, 20000);
        const text = await response.text();
        const result = JSON.parse(text || '{}');
        if (response.status === 409) {
          state = {
            items: Array.isArray(result.items) ? result.items : cleanItems,
            revision: n(result.revision)
          };
          render();
          throw new Error(result.error || '다른 사용자의 변경사항을 불러왔습니다. 다시 저장해 주세요.');
        }
        if (!response.ok) throw new Error(result.error || `Vercel HTTP ${response.status}`);
        state.revision = n(result.revision);
        $('syncStatus').textContent = `Vercel 공용 서버 저장됨 · ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;
        return;
      } catch (error) {
        if (error.message.includes('다른 사용자가')) throw error;
        serverTransport = 'supabase';
      }
    }
    const current = await readDirectRow();
    if (current.revision !== state.revision) {
      await load();
      throw new Error('다른 사용자의 변경사항을 불러왔습니다. 다시 저장해 주세요.');
    }
    const nextRevision = state.revision + 1;
    const preserved = current.items.filter(item => (
      item?.id === SCRAP_SYSTEM_ID || item?.hiddenSystemItem === true
    ));
    const response = await fetchWithTimeout(
      `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.main&revision=eq.${state.revision}`,
      {
        method: 'PATCH',
        headers: { ...HEAD, 'content-type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({
          items: [...preserved, ...cleanItems],
          revision: nextRevision,
          updated_at: new Date().toISOString()
        })
      },
      20000
    );
    if (!response.ok) throw new Error('공용 서버에 저장하지 못했습니다.');
    const rows = await response.json();
    if (!rows.length) {
      await load();
      throw new Error('다른 사용자의 변경사항을 불러왔습니다. 다시 저장해 주세요.');
    }
    state.revision = nextRevision;
    $('syncStatus').textContent = `Supabase 공용 서버 저장됨 · ${new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  function lineFormObject() {
    const item = {};
    BASE_IDS.concat(LINE_IDS).forEach(id => {
      item[id] = $(id).value;
    });
    NUMERIC_LINE_IDS.forEach(id => {
      item[id] = n(item[id]);
    });
    return item;
  }

  function lockContractBase(locked) {
    BASE_IDS.forEach(id => {
      $(id).readOnly = locked;
      $(id).classList.toggle('contract-lock', locked);
    });
    $('contractBaseMsg').textContent = locked
      ? '이 계약의 기본정보가 고정되었습니다. 새 계약은 “새 계약 시작”을 누르세요.'
      : '계약 기본정보를 입력한 뒤 아래에서 첫 품목을 추가하세요.';
  }

  function resetLineForm(carry = {}) {
    editId = null;
    LINE_IDS.forEach(id => {
      $(id).value = '';
    });
    $('status').value = '미판매';
    ['buyFx', 'sellFx', 'turnDays'].forEach(id => {
      if (carry[id] !== undefined && carry[id] !== '') $(id).value = carry[id];
    });
    $('formTitle').textContent = '2. 계약 품목 추가';
    $('saveBtn').textContent = '이 계약에 품목 추가';
    $('cancelBtn').hidden = true;
    const inherited = ['buyFx', 'sellFx', 'turnDays'].some(id => carry[id] !== undefined && carry[id] !== '');
    $('inheritNotice').hidden = !inherited;
    renderContractLineList();
    updateCalc();
  }

  function resetForm() {
    BASE_IDS.forEach(id => {
      $(id).value = '';
    });
    $('contractDate').value = today();
    lockContractBase(false);
    resetLineForm();
    $('contract').focus();
  }

  function updateCalc() {
    const preview = lineFormObject();
    preview.claim = 0;
    preview.remittedUsd = 0;
    const result = metrics(preview, true);
    $('cBuy').textContent = fmt(result.buyTotal);
    $('cSales').textContent = fmt(result.sales);
    $('cProfit').textContent = fmt(result.profit);
    $('cProfit').classList.toggle('negative', result.profit < 0);
    $('cMargin').textContent = pct(result.margin);
    $('cAnnual').textContent = pct(result.annual);
    $('cShinsung').textContent = fmt(result.shinsung);
  }

  function aggregate(key) {
    const map = new Map();
    for (const item of businessItems()) {
      const groupKey = item[key] || '미입력';
      const result = metrics(item);
      if (!map.has(groupKey)) {
        map.set(groupKey, {
          name: groupKey, count: 0, weight: 0, sales: 0, profit: 0,
          days: 0, dayCount: 0, shinsung: 0, unsoldWeight: 0, unsoldValue: 0
        });
      }
      const group = map.get(groupKey);
      group.count += 1;
      group.weight += n(item.weight);
      group.sales += result.sales;
      group.profit += result.profit;
      group.shinsung += result.shinsung;
      if (n(item.turnDays)) {
        group.days += n(item.turnDays);
        group.dayCount += 1;
      }
      if (item.status !== '판매완료') {
        group.unsoldWeight += n(item.weight);
        group.unsoldValue += result.buyTotal;
      }
    }
    return [...map.values()].sort((a, b) => b.profit - a.profit);
  }

  function render() {
    const all = businessItems();
    const totals = all.reduce((sum, item) => {
      const result = metrics(item);
      sum.sales += result.sales;
      sum.profit += result.profit;
      sum.shinsung += result.shinsung;
      sum.fx += result.fxGain;
      sum.unpaidUsd += result.unpaidUsd;
      sum.unpaidKrw += result.unpaidKrw;
      if (item.status === '판매완료') sum.sold += 1;
      else {
        sum.weight += n(item.weight);
        sum.unsold += result.buyTotal;
      }
      if (n(item.turnDays)) {
        sum.days += n(item.turnDays);
        sum.dayCount += 1;
      }
      return sum;
    }, {
      sales: 0, profit: 0, shinsung: 0, fx: 0, sold: 0, weight: 0,
      unsold: 0, days: 0, dayCount: 0, unpaidUsd: 0, unpaidKrw: 0
    });
    const margin = totals.sales ? totals.profit / totals.sales : 0;
    const averageDays = totals.dayCount ? totals.days / totals.dayCount : 0;
    const annual = averageDays ? margin * 365 / averageDays : 0;
    $('kSales').textContent = fmt(totals.sales);
    $('kProfit').textContent = fmt(totals.profit);
    $('kMargin').textContent = pct(margin);
    $('kShinsung').textContent = fmt(totals.shinsung);
    $('kFx').textContent = fmt(totals.fx);
    $('kWeight').textContent = kg(totals.weight);
    $('kUnsold').textContent = fmt(totals.unsold);
    $('kDays').textContent = `${averageDays.toFixed(1)}일`;
    $('kAnnual').textContent = pct(annual);
    $('kCount').textContent = `${totals.sold} / ${all.length}`;
    $('kUnpaidUsd').textContent = usd(totals.unpaidUsd);
    $('kUnpaidKrw').textContent = fmt(totals.unpaidKrw);
    renderList();
    renderGroups();
    renderUnsold();
    renderRemittance();
    renderMasters();
    renderContractLineList();
    drawCharts();
  }

  function filtered() {
    const query = $('search').value.trim().toLowerCase();
    const status = $('filterStatus').value;
    const from = $('filterFrom').value;
    const to = $('filterTo').value;
    return businessItems()
      .filter(item => (
        !query ||
        `${item.contract} ${item.buyCompany} ${item.sellCompany} ${item.gradeName} ${item.subGrade} ${item.destination}`
          .toLowerCase().includes(query)
      ) && (!status || item.status === status)
        && (!from || item.contractDate >= from)
        && (!to || item.contractDate <= to))
      .sort((a, b) => (b.contractDate || '').localeCompare(a.contractDate || ''));
  }

  function renderList() {
    const rows = filtered().map(item => {
      const result = metrics(item);
      return `<tr>
        <td>${item.contractDate || ''}</td><td>${esc(item.contract)}</td>
        <td>${esc(item.buyCompany)}</td>
        <td>${esc(item.gradeName)}${item.subGrade ? `<br><small>${esc(item.subGrade)}</small>` : ''}</td>
        <td class="num">${kg(item.weight)}</td><td class="num">${n(item.buyUsd).toLocaleString()}</td>
        <td class="num">${n(item.buyFx).toLocaleString()}</td><td class="num">${n(item.sellUsd).toLocaleString()}</td>
        <td class="num">${n(item.sellFx).toLocaleString()}</td><td>${esc(item.sellCompany)}</td>
        <td class="center"><span class="badge ${item.status === '판매완료' ? 'sold' : 'pending'}">${esc(item.status || '미판매')}</span></td>
        <td class="num">${fmt(result.sales)}</td><td class="num ${result.profit < 0 ? 'negative' : ''}">${fmt(result.profit)}</td>
        <td class="num">${pct(result.margin)}</td><td class="num">${n(item.turnDays)}일</td>
        <td class="num">${pct(result.annual)}</td><td class="num">${fmt(result.shinsung)}</td>
        <td class="num">${usd(result.remittedUsd)}</td><td class="num">${usd(result.unpaidUsd)}</td>
        <td class="row-buttons"><button data-edit="${item.id}">수정</button><button class="extra" data-extra="${esc(item.contract)}">추가정보</button><button class="danger" data-del="${item.id}">삭제</button></td>
      </tr>`;
    }).join('');
    $('tbody').innerHTML = rows || '<tr><td colspan="20" class="empty">등록된 영업 내역이 없습니다.</td></tr>';
  }

  function renderContractLineList() {
    const contract = $('contract').value.trim();
    const ro…1790 tokens truncated…eight ? 'masterFreight' : 'masterWorkCost');
    const name = nameInput.value.trim();
    const rate = n(rateInput.value);
    if (!name) return toast(freight ? '도착지를 입력하세요.' : '소강종을 입력하세요.');
    if (rate < 0 || rateInput.value === '') return toast('USD/kg 금액을 입력하세요.');
    const list = freight ? meta().freightMasters : meta().workMasters;
    const existing = findMaster(list, name);
    if (existing) {
      existing.name = name;
      existing.rate = rate;
    } else {
      list.push({ name, rate });
    }
    try {
      await persist();
      nameInput.value = '';
      rateInput.value = '';
      renderMasters();
      toast(existing ? '기준 금액을 수정했습니다.' : '기준정보를 저장했습니다.');
    } catch (error) {
      toast(error.message);
    }
  }

  async function deleteMaster(kind, name) {
    if (!confirm(`${name} 기준정보를 삭제할까요?`)) return;
    const record = meta();
    const key = kind === 'freight' ? 'freightMasters' : 'workMasters';
    record[key] = record[key].filter(item => normalized(item.name) !== normalized(name));
    try {
      await persist();
      renderMasters();
      toast('기준정보를 삭제했습니다.');
    } catch (error) {
      toast(error.message);
    }
  }

  function showView(viewId) {
    document.querySelectorAll('.tab,.view').forEach(node => node.classList.remove('active'));
    const tab = document.querySelector(`.tab[data-view="${viewId}"]`);
    if (tab) tab.classList.add('active');
    $(viewId).classList.add('active');
    if (viewId === 'dashboard') setTimeout(drawCharts, 30);
  }

  function editItem(id) {
    const item = businessItems().find(value => value.id === id);
    if (!item) return;
    editId = id;
    BASE_IDS.concat(LINE_IDS).forEach(key => {
      $(key).value = item[key] ?? '';
    });
    lockContractBase(true);
    $('formTitle').textContent = '2. 계약 품목 수정';
    $('saveBtn').textContent = '품목 수정 저장';
    $('cancelBtn').hidden = false;
    $('inheritNotice').hidden = true;
    renderContractLineList();
    showView('entry');
    updateCalc();
  }

  function openExtra(contract) {
    const key = contractKey(contract);
    if (!key || !contractRows(key).length) {
      return toast('먼저 계약 품목을 한 건 이상 저장하세요.');
    }
    currentExtraContract = key;
    const extra = contractExtra(key);
    $('extraContractTitle').textContent = `계약번호 ${key} · 매입 USD 총액 ${usd(contractBuyUsd(key))}`;
    $('extraRemittanceDate').value = extra.remittanceDate;
    $('extraRemittedUsd').value = extra.remittedUsd || '';
    $('extraRemittanceMemo').value = extra.remittanceMemo;
    $('extraClaim').value = extra.claim || '';
    $('extraMemo').value = extra.memo;
    $('extraModal').classList.add('open');
  }

  function closeExtra() {
    currentExtraContract = '';
    $('extraModal').classList.remove('open');
  }

  async function saveExtra() {
    if (!currentExtraContract) return;
    const remittedUsd = n($('extraRemittedUsd').value);
    const total = contractBuyUsd(currentExtraContract);
    if (remittedUsd < 0) return toast('누적 송금액은 0 이상이어야 합니다.');
    if (remittedUsd > total) {
      return toast(`누적 송금액은 매입 USD 총액 ${usd(total)}을 초과할 수 없습니다.`);
    }
    meta().contractExtras[currentExtraContract] = {
      remittanceDate: $('extraRemittanceDate').value,
      remittedUsd,
      remittanceMemo: $('extraRemittanceMemo').value.trim(),
      claim: n($('extraClaim').value),
      memo: $('extraMemo').value.trim(),
      updatedAt: new Date().toISOString()
    };
    try {
      await persist();
      closeExtra();
      render();
      toast('계약 추가정보를 저장했습니다.');
    } catch (error) {
      toast(error.message);
    }
  }

  async function saveItem() {
    const item = lineFormObject();
    item.contract = item.contract.trim();
    item.buyCompany = item.buyCompany.trim();
    item.gradeName = item.gradeName.trim();
    if (!item.contract || !item.contractDate || !item.buyCompany) {
      return toast('계약번호·계약일·매입회사를 입력하세요.');
    }
    if (!item.gradeName || !item.weight || !item.buyUsd || !item.buyFx) {
      return toast('강종·중량·매입 USD 단가·매입 예상환율을 입력하세요.');
    }
    if (item.status === '판매완료' && !item.soldDate) {
      return toast('판매완료일을 입력하세요.');
    }
    const sameContract = contractRows(item.contract);
    const baseMismatch = sameContract.find(row => row.id !== editId && (
      row.contractDate !== item.contractDate ||
      String(row.buyCompany || '').trim() !== item.buyCompany
    ));
    if (baseMismatch) {
      return toast('같은 계약번호의 계약일·매입회사는 기존 계약과 같아야 합니다.');
    }
    const existingIndex = state.items.findIndex(value => value.id === editId);
    item.id = editId || crypto.randomUUID();
    item.created = existingIndex >= 0 ? state.items[existingIndex].created : Date.now();
    if (existingIndex >= 0) state.items[existingIndex] = item;
    else state.items.push(item);
    const wasEdit = existingIndex >= 0;
    const carry = {
      buyFx: item.buyFx || '',
      sellFx: item.sellFx || '',
      turnDays: item.turnDays || ''
    };
    try {
      await persist();
      lockContractBase(true);
      resetLineForm(wasEdit ? {} : carry);
      render();
      toast(wasEdit ? '품목을 수정했습니다.' : '품목을 저장했습니다. 다음 품목을 입력하세요.');
    } catch (error) {
      toast(error.message);
    }
  }

  async function deleteItem(id) {
    const item = businessItems().find(value => value.id === id);
    if (!item || !confirm(`${item.contract} · ${item.gradeName} 품목을 삭제할까요?`)) return;
    state.items = state.items.filter(value => value.id !== id);
    try {
      await persist();
      render();
      if (!contractRows(item.contract).length && $('contract').value === item.contract) {
        lockContractBase(false);
      }
      toast('품목을 삭제했습니다.');
    } catch (error) {
      toast(error.message);
    }
  }

  function drawBar(canvasId, items, title, valueKey, color, formatter) {
    const canvas = $(canvasId);
    const box = canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(300, box.width * dpr);
    canvas.height = Math.max(250, box.height * dpr);
    const context = canvas.getContext('2d');
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    context.scale(dpr, dpr);
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#17324d';
    context.font = 'bold 14px Malgun Gothic';
    context.fillText(title, 12, 20);
    const data = items.slice(0, 7);
    const max = Math.max(1, ...data.map(item => Math.abs(item[valueKey])));
    const left = 100;
    const top = 38;
    const rowHeight = (height - top - 18) / Math.max(data.length, 1);
    context.font = '11px Malgun Gothic';
    data.forEach((item, index) => {
      const y = top + index * rowHeight + 4;
      const barWidth = (width - left - 80) * Math.abs(item[valueKey]) / max;
      context.fillStyle = '#607487';
      context.textAlign = 'right';
      context.fillText(String(item.name).slice(0, 13), left - 8, y + 13);
      context.fillStyle = color;
      context.fillRect(left, y, barWidth, 17);
      context.fillStyle = '#31465a';
      context.textAlign = 'left';
      context.fillText(formatter(item[valueKey]), left + barWidth + 6, y + 13);
    });
    if (!data.length) {
      context.textAlign = 'center';
      context.fillStyle = '#8290a0';
      context.fillText('표시할 자료가 없습니다.', width / 2, height / 2);
    }
  }

  function drawCharts() {
    drawBar('profitChart', aggregate('sellCompany'), '판매처별 예상이익', 'profit', '#16847d', value => `${(value / 100000000).toFixed(1)}억`);
    drawBar('stockChart', aggregate('gradeName').filter(item => item.unsoldValue), '강종별 미판매 원화액', 'unsoldValue', '#d18a21', value => `${(value / 100000000).toFixed(1)}억`);
  }

  function workbook() {
    const rows = businessItems().map(item => {
      const result = metrics(item);
      const extra = contractExtra(item.contract);
      return [
        item.contract, item.contractDate, item.buyCompany, item.gradeName, item.subGrade || '',
        item.weight, item.buyUsd, item.buyFx, item.destination || '', item.freight,
        item.workCost, item.shinsungProfit, item.sellUsd, item.sellFx, item.sellCompany,
        item.status, item.soldDate, item.turnDays, extra.claim, extra.memo,
        extra.remittanceDate, extra.remittedUsd, extra.remittanceMemo, result.buyTotal,
        result.sales, result.profit, result.margin, result.fxGain, result.shinsung,
        result.annual, result.unpaidUsd, result.unpaidKrw
      ];
    });
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([EXCEL_HEADERS, ...rows]);
    sheet['!cols'] = EXCEL_HEADERS.map((header, index) => ({ wch: EXCEL_WIDTHS[index] }));
    sheet['!autofilter'] = { ref: `A1:AF${rows.length + 1}` };
    for (let row = 2; row <= rows.length + 1; row += 1) {
      ['X', 'Y', 'Z', 'AB', 'AC', 'AE', 'AF'].forEach(column => {
        if (sheet[`${column}${row}`]) sheet[`${column}${row}`].z = '#,##0';
      });
      ['AA', 'AD'].forEach(column => {
        if (sheet[`${column}${row}`]) sheet[`${column}${row}`].z = '0.0%';
      });
    }
    XLSX.utils.book_append_sheet(book, sheet, '영업 수익성');
    return book;
  }

  function templateWorkbook() {
    const sample = [
      'SS-2607-001', today(), '매입회사 예시', 'INCONEL 718', 'TURNING',
      1000, 12.5, 1400, '부산항', 0.5, 0.3, 1, 15, 1410,
      '판매처 예시', '미판매', '', 45, 0, '계약 저장 후 추가정보에서 입력',
      '', 0, '', '', '', '', '', '', '', '', '', ''
    ];
    const book = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([EXCEL_HEADERS, sample]);
    sheet['!cols'] = EXCEL_HEADERS.map((header, index) => ({ wch: EXCEL_WIDTHS[index] }));
    sheet['!autofilter'] = { ref: 'A1:AF2' };
    const guide = XLSX.utils.aoa_to_sheet([
      ['신성금속 영업 수익성 업로드 안내'],
      [],
      ['계약 공통정보', '같은 계약번호의 계약일과 매입 회사명은 동일하게 입력합니다.'],
      ['품목 여러 건', '계약번호를 반복하여 강종·중량 등 품목을 행별로 입력합니다.'],
      ['도착지·운임', '기준정보에 등록한 도착지를 선택하면 예상 운임이 자동 입력되며 직접 수정할 수 있습니다.'],
      ['소강종·작업비', '기준정보에 등록한 소강종을 선택하면 작업비가 자동 입력되며 직접 수정할 수 있습니다.'],
      ['계약 추가정보', '클레임·메모·송금정보는 같은 계약의 각 행에 같은 값으로 반복해도 계약별 한 번만 반영됩니다.'],
      ['자동 계산 열', 'X열부터 AF열까지는 프로그램에서 자동 계산하므로 비워도 됩니다.'],
      ['날짜 형식', 'YYYY-MM-DD']
    ]);
    guide['!cols'] = [{ wch: 22 }, { wch: 78 }];
    XLSX.utils.book_append_sheet(book, sheet, '영업 수익성');
    XLSX.utils.book_append_sheet(book, guide, '작성 안내');
    return book;
  }

  function sheetDate(value) {
    if (typeof value === 'number') {
      const date = XLSX.SSF.parse_date_code(value);
      return date ? `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}` : '';
    }
    return String(value || '').slice(0, 10);
  }

  async function importWorkbook(file) {
    const book = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
    const rows = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], {
      header: 1, defval: '', raw: true
    });
    const headerRow = rows.findIndex(row => row.map(value => String(value).trim()).includes('계약번호'));
    if (headerRow < 0) throw new Error('영업 수익성 엑셀 양식이 아닙니다.');
    const headers = rows[headerRow].map(value => String(value).trim());
    const at = name => headers.indexOf(name);
    const value = (row, name) => at(name) >= 0 ? row[at(name)] : '';
    const first = (row, ...names) => {
      for (const name of names) {
        const found = value(row, name);
        if (found !== '' && found != null) return found;
      }
      return '';
    };
    const imported = rows.slice(headerRow + 1)
      .filter(row => row.some(Boolean))
      .map((row, index) => ({
        id: crypto.randomUUID(),
        contract: String(value(row, '계약번호') || '').trim(),
        contractDate: sheetDate(value(row, '계약일')),
        buyCompany: String(value(row, '매입 회사명') || '').trim(),
        gradeName: String(value(row, '강종 이름') || '').trim(),
        subGrade: String(value(row, '소강종') || '').trim(),
        weight: n(value(row, '중량(kg)')),
        buyUsd: n(value(row, '매입 USD 단가')),
        buyFx: n(value(row, '매입 예상환율')),
        destination: String(value(row, '도착지') || '').trim(),
        freight: n(first(row, '예상 운임(USD/kg)', '예상 운임')),
        workCost: n(first(row, '예상 작업비(USD/kg)', '예상 작업비')),
        shinsungProfit: n(first(row, '신성금속 수익(USD/kg)', '신성금속 수익')),
        sellUsd: n(value(row, '판매 USD 단가')),
        sellFx: n(value(row, '판매 예상환율')),
        sellCompany: String(value(row, '판매처') || '').trim(),
        status: ['미판매', '판매예정', '판매완료'].includes(String(value(row, '판매 상태')))
          ? String(value(row, '판매 상태')) : '미판매',
        soldDate: sheetDate(value(row, '판매완료일')),
        turnDays: n(value(row, '자금회전일')),
        _extra: {
          claim: n(first(row, '클레임비(원)', '클레임비')),
          memo: String(value(row, '메모') || ''),
          remittanceDate: sheetDate(value(row, '최근 송금일')),
          remittedUsd: n(value(row, '누적 송금액(USD)')),
          remittanceMemo: String(value(row, '송금 메모') || '')
        },
        created: Date.now() + index
      }))
      .filter(item => item.contract || item.gradeName || item.weight);
    if (!imported.length) throw new Error('등록할 영업 내역이 없습니다.');
    const invalid = imported.find(item => !item.contract || !item.contractDate || !item.buyCompany || !item.gradeName);
    if (invalid) throw new Error('계약번호·계약일·매입회사·강종이 비어 있는 행이 있습니다.');
    if (!confirm(`${imported.length}건을 공용 서버에 추가할까요?`)) return;
    const groupedExtras = new Map();
    imported.forEach(item => {
      const key = contractKey(item.contract);
      const current = groupedExtras.get(key) || {
        claim: 0, memo: '', remittanceDate: '', remittedUsd: 0, remittanceMemo: ''
      };
      const extra = item._extra;
      current.claim = Math.max(current.claim, n(extra.claim));
      current.remittedUsd = Math.max(current.remittedUsd, n(extra.remittedUsd));
      if (extra.memo) current.memo = extra.memo;
      if (extra.remittanceMemo) current.remittanceMemo = extra.remittanceMemo;
      if (extra.remittanceDate > current.remittanceDate) current.remittanceDate = extra.remittanceDate;
      groupedExtras.set(key, current);
      delete item._extra;
    });
    groupedExtras.forEach((extra, key) => {
      if (extra.claim || extra.memo || extra.remittanceDate || extra.remittedUsd || extra.remittanceMemo) {
        meta().contractExtras[key] = extra;
      }
    });
    state.items.push(...imported);
    await persist();
    render();
    toast('엑셀 영업 내역을 등록했습니다.');
  }

  document.querySelectorAll('.tab').forEach(button => {
    button.onclick = () => showView(button.dataset.view);
  });
  document.querySelectorAll('#entry input,#entry select').forEach(input => {
    input.addEventListener('input', updateCalc);
  });
  $('destination').addEventListener('change', applyFreightMaster);
  $('subGrade').addEventListener('change', applyWorkMaster);
  $('contract').addEventListener('input', renderContractLineList);
  $('saveBtn').onclick = saveItem;
  $('cancelBtn').onclick = () => {
    const current = businessItems().find(item => item.id === editId);
    const carry = current ? {
      buyFx: current.buyFx || '',
      sellFx: current.sellFx || '',
      turnDays: current.turnDays || ''
    } : {};
    resetLineForm(carry);
  };
  $('newContractBtn').onclick = resetForm;
  $('openExtraBtn').onclick = () => openExtra($('contract').value);
  $('closeExtraModal').onclick = closeExtra;
  $('cancelExtraBtn').onclick = closeExtra;
  $('saveExtraBtn').onclick = saveExtra;
  $('extraModal').onclick = event => {
    if (event.target === $('extraModal')) closeExtra();
  };
  $('saveFreightMaster').onclick = () => saveMaster('freight');
  $('saveWorkMaster').onclick = () => saveMaster('work');
  $('freightMasterList').onclick = event => {
    if (event.target.dataset.deleteFreight) deleteMaster('freight', event.target.dataset.deleteFreight);
  };
  $('workMasterList').onclick = event => {
    if (event.target.dataset.deleteWork) deleteMaster('work', event.target.dataset.deleteWork);
  };
  $('contractLineList').onclick = event => {
    if (event.target.dataset.entryEdit) editItem(event.target.dataset.entryEdit);
  };
  $('tbody').onclick = event => {
    if (event.target.dataset.edit) editItem(event.target.dataset.edit);
    else if (event.target.dataset.del) deleteItem(event.target.dataset.del);
    else if (event.target.dataset.extra) openExtra(event.target.dataset.extra);
  };
  ['search', 'filterStatus', 'filterFrom', 'filterTo'].forEach(id => {
    $(id).addEventListener('input', renderList);
  });
  $('resetFilter').onclick = () => {
    ['search', 'filterStatus', 'filterFrom', 'filterTo'].forEach(id => {
      $(id).value = '';
    });
    renderList();
  };
  $('syncBtn').onclick = load;
  $('xlsxOut').onclick = () => {
    try {
      XLSX.writeFile(workbook(), `신성금속_영업수익성_${today()}.xlsx`, { compression: true });
      toast('엑셀 파일을 다운로드했습니다.');
    } catch (_) {
      toast('엑셀 다운로드에 실패했습니다.');
    }
  };
  $('templateOut').onclick = () => {
    try {
      XLSX.writeFile(templateWorkbook(), '신성금속_영업수익성_업로드양식.xlsx', { compression: true });
      toast('업로드 양식을 다운로드했습니다.');
    } catch (_) {
      toast('양식 다운로드에 실패했습니다.');
    }
  };
  $('xlsxIn').onchange = async event => {
    try {
      const file = event.target.files[0];
      if (file) await importWorkbook(file);
    } catch (error) {
      alert(error.message || '엑셀 업로드에 실패했습니다.');
    }
    event.target.value = '';
  };
  $('serverReset').onclick = async () => {
    if (!confirm('주의: 현재 저장된 모든 영업·송금·기준정보가 삭제됩니다.\n\n엑셀로 백업했다면 확인을 누르세요.')) return;
    if (!confirm('정말 서버를 초기화할까요? 이 작업은 되돌릴 수 없습니다.')) return;
    state.items = [];
    try {
      await persist();
      render();
      resetForm();
      toast('서버 자료를 초기화했습니다.');
    } catch (error) {
      toast(error.message || '초기화하지 못했습니다.');
    }
  };
  addEventListener('resize', () => {
    clearTimeout(window.__salesResizeTimer);
    window.__salesResizeTimer = setTimeout(drawCharts, 120);
  });

  resetForm();
  load();
  setInterval(() => {
    if (!editId && !$('extraModal').classList.contains('open')) load();
  }, 30000);
})();

