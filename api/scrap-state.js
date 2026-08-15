const SUPABASE_URL = 'https://orpeybiqikrdydkhsjjs.supabase.co';
const SUPABASE_KEY = 'sb_publishable_TerLvPZo7e5_X91A-P4qlQ_DaqBly0Q';
const LEGACY_TABLE = 'sales_state';
const META_TABLE = 'scrap_app_state';
const LEGACY_ROW_ID = 'main';
const META_ROW_IDS = ['state-head-v3', 'main'];
const SYSTEM_ID = '__SCRAP_SHARED_STATE_V1__';
const STATE_BUCKET = 'scrap-photos';
const V2_PREFIX = '_shared-state-v2';
const V3_PREFIX = '_shared-state-v3';
const CHANGE_PREFIX = '_state-changes-v4/';
const headers = { apikey: SUPABASE_KEY, 'content-type': 'application/json' };
const emptyState = {
  pos: [], splits: [], inputs: [], bags: [], gradeMasters: [],
  gradeTypes: {}, mainGrades: [], subGrades: [], locations: [], movements: [],
  waitingLocations: [], waitingMoves: [], workWaitLocations: [], inspectors: [],
  samples: [], analysisRecords: [], preSettlements: [], expectedSalesOrders: [],
  inventoryGradeMappings: [], systemSettings: {}
};
const allowedKeys = [
  'pos', 'splits', 'inputs', 'bags', 'companies', 'gradeMasters', 'gradeTypes',
  'mainGrades', 'subGrades', 'locations', 'movements', 'waitingLocations',
  'waitingMoves', 'workWaitLocations', 'losses', 'inspectionDrafts',
  'inspectionHandovers', 'workWaits', 'salesOrders', 'shippingAreaMoves',
  'packingLists', 'shipments', 'shipmentAllocations', 'returnReceipts',
  'claims', 'domesticReceipts', 'packagingMaterials', 'selectionGuides',
  'receiptWorks', 'shippingWorks', 'orderPhotos', 'workflowDrafts',
  'workflowDraftDeletions', 'inspectors', 'auditLogs', 'samples',
  'analysisRecords', 'preSettlements', 'expectedSalesOrders',
  'inventoryGradeMappings', 'systemSettings'
];

const publicObjectUrl = path =>
  `${SUPABASE_URL}/storage/v1/object/public/${STATE_BUCKET}/${String(path).split('/').map(encodeURIComponent).join('/')}`;

async function responseJson(response, label) {
  const text = await response.text();
  if (!response.ok) throw new Error(`${label} HTTP ${response.status}: ${text}`);
  try { return JSON.parse(text || 'null'); }
  catch (_) { throw new Error(`${label} 응답을 읽지 못했습니다.`); }
}

async function readObject(path) {
  const response = await fetch(`${publicObjectUrl(path)}?v=${Date.now()}`, { cache: 'no-store' });
  if (response.status === 404) return null;
  if (response.status === 400) {
    const text = await response.text();
    try {
      const problem = JSON.parse(text || '{}');
      if (problem.code === 'NoSuchKey' || problem.error === 'not_found') return null;
    } catch (_) {}
    throw new Error(`Supabase state object HTTP 400: ${text}`);
  }
  return responseJson(response, 'Supabase state object');
}

async function uploadObject(path, payload) {
  const encoded = String(path).split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${STATE_BUCKET}/${encoded}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(payload || emptyState)
  });
  if (!response.ok) throw new Error(`Supabase state object HTTP ${response.status}: ${await response.text()}`);
}

async function readMetaRows() {
  const ids = META_ROW_IDS.map(encodeURIComponent).join(',');
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${META_TABLE}?id=in.(${ids})&select=id,payload,revision,updated_at`,
    { headers, cache: 'no-store' }
  );
  const rows = await responseJson(response, 'Supabase state head');
  return Array.isArray(rows) ? rows : [];
}

function validHead(row) {
  return row && row.payload?.version === 3 && row.payload?.objectPath;
}

async function readHead() {
  const rows = await readMetaRows();
  return rows.find(row => row.id === META_ROW_IDS[0] && validHead(row))
    || rows.find(row => row.id === META_ROW_IDS[1] && validHead(row))
    || null;
}

async function readLegacyRow(select = 'items,revision') {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${LEGACY_TABLE}?id=eq.${LEGACY_ROW_ID}&select=${select}`,
    { headers, cache: 'no-store' }
  );
  const rows = await responseJson(response, 'Supabase legacy state');
  if (!Array.isArray(rows) || !rows.length) throw new Error('legacy state row is missing');
  return rows[0];
}

async function readLegacyState() {
  const meta = await readLegacyRow('revision');
  const revision = Number(meta.revision) || 0;
  const v2 = await readObject(`${V2_PREFIX}/revision-${revision}.json`);
  if (v2) return { payload: v2, revision };
  const legacy = await readLegacyRow('items,revision');
  const items = Array.isArray(legacy.items) ? legacy.items : [];
  const system = items.find(item => item?.id === SYSTEM_ID);
  return { payload: system?.scrapPayload || emptyState, revision: Number(legacy.revision) || 0 };
}

async function readCurrent() {
  const head = await readHead();
  if (head) {
    const payload = await readObject(head.payload.objectPath);
    if (!payload) throw new Error('공용 상태 파일을 찾지 못했습니다.');
    return { payload, revision: Number(head.revision) || 0, head };
  }
  return { ...(await readLegacyState()), head: null };
}

async function upsertHead(id, revision, objectPath) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${META_TABLE}?on_conflict=id`,
    {
      method: 'POST',
      headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({
        id,
        payload: { version: 3, objectPath, updatedAt: new Date().toISOString() },
        revision,
        updated_at: new Date().toISOString()
      })
    }
  );
  if (!response.ok) return { ok: false, status: response.status, text: await response.text() };
  const rows = await response.json();
  return { ok: true, row: Array.isArray(rows) ? rows[0] : rows };
}

async function ensureHead(current) {
  if (current.head) return current.head;
  const path = `${V3_PREFIX}/bootstrap-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  await uploadObject(path, current.payload);
  for (const id of META_ROW_IDS) {
    const result = await upsertHead(id, current.revision, path);
    if (result.ok) return { ...result.row, id, revision: current.revision, payload: { version: 3, objectPath: path } };
  }
  throw new Error('공용 상태 포인터를 생성하지 못했습니다.');
}

async function claimHead(headId, baseRevision, nextRevision, objectPath) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${META_TABLE}?id=eq.${encodeURIComponent(headId)}&revision=eq.${baseRevision}&select=id,revision`,
    {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({
        payload: { version: 3, objectPath, updatedAt: new Date().toISOString() },
        revision: nextRevision,
        updated_at: new Date().toISOString()
      })
    }
  );
  const rows = await responseJson(response, 'Supabase state head update');
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function writePayload(payload, baseRevision, current) {
  const head = await ensureHead(current);
  const nextRevision = baseRevision + 1;
  const objectPath = `${V3_PREFIX}/revision-${nextRevision}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  await uploadObject(objectPath, payload);
  return await claimHead(head.id, baseRevision, nextRevision, objectPath);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  try {
    if (req.method === 'GET') {
      if (String(req.query?.revision || '') === '1') {
        const head = await readHead();
        if (head) return res.status(200).json({ revision: Number(head.revision) || 0 });
        const legacy = await readLegacyRow('revision');
        return res.status(200).json({ revision: Number(legacy.revision) || 0 });
      }
      if (String(req.query?.manifest || '') === '1') {
        const head = await readHead();
        if (head) {
          return res.status(200).json({
            revision: Number(head.revision) || 0,
            objectUrl: publicObjectUrl(head.payload.objectPath)
          });
        }
        const legacy = await readLegacyRow('revision');
        const revision = Number(legacy.revision) || 0;
        return res.status(200).json({
          revision,
          objectUrl: publicObjectUrl(`${V2_PREFIX}/revision-${revision}.json`)
        });
      }
      const current = await readCurrent();
      return res.status(200).json({ payload: current.payload, revision: current.revision });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const baseRevision = Number(req.body?.baseRevision) || 0;
      const current = await readCurrent();
      if (Number(current.revision) !== baseRevision) {
        return res.status(409).json({
          error: '다른 사용자가 먼저 저장했습니다.',
          payload: current.payload,
          revision: current.revision
        });
      }

      let payload = req.body?.payload || emptyState;
      if (req.method === 'PATCH') {
        let changes = req.body?.changes && typeof req.body.changes === 'object' ? req.body.changes : {};
        const changesObjectPath = String(req.body?.changesObjectPath || '').trim();
        if (changesObjectPath) {
          if (!changesObjectPath.startsWith(CHANGE_PREFIX)) {
            return res.status(400).json({ error: '허용되지 않은 변경자료 경로입니다.' });
          }
          const storedChanges = await readObject(changesObjectPath);
          if (!storedChanges || typeof storedChanges !== 'object' || Array.isArray(storedChanges)) {
            return res.status(400).json({ error: '저장된 변경자료를 읽지 못했습니다.' });
          }
          changes = storedChanges;
        }
        payload = { ...current.payload };
        for (const key of allowedKeys) {
          if (Object.prototype.hasOwnProperty.call(changes, key)) payload[key] = changes[key];
        }
        const guide = req.body?.selectionGuide;
        if (guide && typeof guide === 'object' && String(guide.id || '').trim()) {
          const currentGuides = Array.isArray(payload.selectionGuides) ? payload.selectionGuides : [];
          payload.selectionGuides = [...currentGuides.filter(item => item?.id !== guide.id), guide];
        }
      }

      const claimed = await writePayload(payload, baseRevision, current);
      if (!claimed) {
        const latest = await readCurrent();
        return res.status(409).json({
          error: '다른 사용자가 먼저 저장했습니다.',
          payload: latest.payload,
          revision: latest.revision
        });
      }
      return res.status(200).json({ revision: Number(claimed.revision) || baseRevision + 1 });
    }

    res.setHeader('Allow', 'GET, PUT, PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message || String(error) });
  }
}
