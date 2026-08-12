const SUPABASE_URL = 'https://orpeybiqikrdydkhsjjs.supabase.co';
const SUPABASE_KEY = 'sb_publishable_TerLvPZo7e5_X91A-P4qlQ_DaqBly0Q';
const TABLE = 'sales_state';
const ROW_ID = 'main';
const SYSTEM_ID = '__SCRAP_SHARED_STATE_V1__';
const STATE_BUCKET = 'scrap-photos';
const STATE_PREFIX = '_shared-state-v2';
const headers = { apikey: SUPABASE_KEY, 'content-type': 'application/json' };
const emptyState = {
  pos: [], splits: [], inputs: [], bags: [], gradeMasters: [],
  gradeTypes: {}, mainGrades: [], subGrades: [], locations: [], movements: [],
  waitingLocations: [], waitingMoves: [], workWaitLocations: [], inspectors: []
};

const stateObjectPath = revision => `${STATE_PREFIX}/revision-${Number(revision) || 0}.json`;
const publicStateUrl = revision => `${SUPABASE_URL}/storage/v1/object/public/${STATE_BUCKET}/${stateObjectPath(revision)}`;

async function readLegacyRow(select = 'items,revision') {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${ROW_ID}&select=${select}`, {
    headers,
    cache: 'no-store'
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase HTTP ${response.status}: ${text}`);
  const rows = JSON.parse(text || '[]');
  if (!rows.length) throw new Error('sales_state main row is missing');
  return rows[0];
}

async function readStateObject(revision) {
  if (!Number(revision)) return null;
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(`${publicStateUrl(revision)}?v=${Date.now()}`, { cache: 'no-store' });
      if (response.ok) return await response.json();
      if (response.status !== 404) lastError = new Error(`state object HTTP ${response.status}: ${await response.text()}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 120 * (attempt + 1)));
  }
  if (lastError) throw lastError;
  return null;
}

async function readRow() {
  const meta = await readLegacyRow('revision');
  const revision = Number(meta.revision) || 0;
  const objectPayload = await readStateObject(revision);
  if (objectPayload) return { payload: objectPayload, revision };

  // First request after this deployment migrates transparently from the former large JSONB row.
  const legacy = await readLegacyRow('items,revision');
  const items = Array.isArray(legacy.items) ? legacy.items : [];
  const system = items.find(item => item?.id === SYSTEM_ID);
  return { payload: system?.scrapPayload || emptyState, revision: Number(legacy.revision) || 0 };
}

async function readRevision() {
  const row = await readLegacyRow('revision');
  return Number(row.revision) || 0;
}

async function claimRevision(baseRevision) {
  const nextRevision = baseRevision + 1;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${ROW_ID}&revision=eq.${baseRevision}&select=revision`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=representation' },
    body: JSON.stringify({ revision: nextRevision, updated_at: new Date().toISOString() })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase revision claim HTTP ${response.status}: ${text}`);
  const rows = JSON.parse(text || '[]');
  if (!rows.length) return null;
  return nextRevision;
}

async function rollbackRevision(claimedRevision, baseRevision) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${ROW_ID}&revision=eq.${claimedRevision}`, {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ revision: baseRevision, updated_at: new Date().toISOString() })
    });
  } catch (_) {}
}

async function uploadStateObject(revision, payload) {
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${STATE_BUCKET}/${stateObjectPath(revision)}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json; charset=utf-8',
      'x-upsert': 'true',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(payload || emptyState)
  });
  if (!response.ok) throw new Error(`Supabase state object HTTP ${response.status}: ${await response.text()}`);
}

async function writePayload(payload, baseRevision) {
  const claimedRevision = await claimRevision(baseRevision);
  if (claimedRevision == null) return null;
  try {
    await uploadStateObject(claimedRevision, payload);
    return claimedRevision;
  } catch (error) {
    await rollbackRevision(claimedRevision, baseRevision);
    throw error;
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  try {
    if (req.method === 'GET') {
      if (String(req.query?.revision || '') === '1') {
        return res.status(200).json({ revision: await readRevision() });
      }
      const row = await readRow();
      return res.status(200).json(row);
    }
    if (req.method === 'PUT' || req.method === 'PATCH') {
      const baseRevision = Number(req.body?.baseRevision) || 0;
      const current = await readRow();
      if (Number(current.revision) !== baseRevision) {
        return res.status(409).json({ error: '다른 사용자가 먼저 저장했습니다.', payload: current.payload, revision: current.revision });
      }
      let payload = req.body?.payload || emptyState;
      if (req.method === 'PATCH') {
        const allowed = [
          'pos', 'splits', 'inputs', 'bags', 'companies', 'gradeMasters', 'gradeTypes',
          'mainGrades', 'subGrades', 'locations', 'movements', 'waitingLocations',
          'waitingMoves', 'workWaitLocations', 'losses', 'inspectionDrafts',
          'inspectionHandovers', 'workWaits', 'salesOrders', 'shippingAreaMoves',
          'packingLists', 'shipments', 'shipmentAllocations', 'returnReceipts',
          'claims', 'domesticReceipts', 'packagingMaterials', 'selectionGuides',
          'receiptWorks', 'shippingWorks', 'orderPhotos', 'workflowDrafts',
          'workflowDraftDeletions', 'inspectors', 'auditLogs'
        ];
        const changes = req.body?.changes && typeof req.body.changes === 'object' ? req.body.changes : {};
        payload = { ...current.payload };
        for (const key of allowed) {
          if (Object.prototype.hasOwnProperty.call(changes, key)) payload[key] = changes[key];
        }
        const guide = req.body?.selectionGuide;
        if (guide && typeof guide === 'object' && String(guide.id || '').trim()) {
          const currentGuides = Array.isArray(payload.selectionGuides) ? payload.selectionGuides : [];
          payload.selectionGuides = [...currentGuides.filter(item => item?.id !== guide.id), guide];
        }
      }
      const nextRevision = await writePayload(payload, baseRevision);
      if (nextRevision == null) {
        const latest = await readRow();
        return res.status(409).json({ error: '다른 사용자가 먼저 저장했습니다.', payload: latest.payload, revision: latest.revision });
      }
      return res.status(200).json({ revision: nextRevision });
    }
    res.setHeader('Allow', 'GET, PUT, PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message || String(error) });
  }
}
