const SUPABASE_URL = 'https://orpeybiqikrdydkhsjjs.supabase.co';
const SUPABASE_KEY = 'sb_publishable_TerLvPZo7e5_X91A-P4qlQ_DaqBly0Q';
const LEGACY_TABLE = 'sales_state';
const LEGACY_ROW_ID = 'main';
const SYSTEM_ID = '__SCRAP_SHARED_STATE_V1__';
const STATE_BUCKET = 'scrap-photos';
const V2_PREFIX = '_shared-state-v2';
const V3_PREFIX = '_shared-state-v3';
const V3_HEAD_PATH = `${V3_PREFIX}/head.json`;
const headers = { apikey: SUPABASE_KEY, 'content-type': 'application/json' };
const emptyState = {
  pos: [], splits: [], inputs: [], bags: [], gradeMasters: [],
  gradeTypes: {}, mainGrades: [], subGrades: [], locations: [], movements: [],
  waitingLocations: [], waitingMoves: [], workWaitLocations: [], inspectors: []
};
const allowedKeys = [
  'pos', 'splits', 'inputs', 'bags', 'companies', 'gradeMasters', 'gradeTypes',
  'mainGrades', 'subGrades', 'locations', 'movements', 'waitingLocations',
  'waitingMoves', 'workWaitLocations', 'losses', 'inspectionDrafts',
  'inspectionHandovers', 'workWaits', 'salesOrders', 'shippingAreaMoves',
  'packingLists', 'shipments', 'shipmentAllocations', 'returnReceipts',
  'claims', 'domesticReceipts', 'packagingMaterials', 'selectionGuides',
  'receiptWorks', 'shippingWorks', 'orderPhotos', 'workflowDrafts',
  'workflowDraftDeletions', 'inspectors', 'auditLogs'
];

const encodePath = path =>
  String(path).split('/').map(encodeURIComponent).join('/');
const publicObjectUrl = path =>
  `${SUPABASE_URL}/storage/v1/object/public/${STATE_BUCKET}/${encodePath(path)}`;

async function responseJson(response, label) {
  const text = await response.text();
  if (!response.ok) throw new Error(`${label} HTTP ${response.status}: ${text}`);
  try { return JSON.parse(text || 'null'); }
  catch (_) { throw new Error(`${label} 응답을 읽지 못했습니다.`); }
}

async function readObject(path) {
  const response = await fetch(`${publicObjectUrl(path)}?v=${Date.now()}-${Math.random()}`, { cache: 'no-store' });
  if (response.status === 404) return null;
  return responseJson(response, 'Supabase state object');
}

async function uploadObject(path, payload, upsert = false) {
  const response = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${STATE_BUCKET}/${encodePath(path)}`,
    {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'x-upsert': upsert ? 'true' : 'false'
      },
      body: JSON.stringify(payload)
    }
  );
  if (!response.ok) {
    throw new Error(`Supabase state object HTTP ${response.status}: ${await response.text()}`);
  }
}

function validHead(head) {
  return head && head.version === 3 && head.objectPath && Number.isFinite(Number(head.revision));
}

async function readHead() {
  const head = await readObject(V3_HEAD_PATH);
  return validHead(head) ? head : null;
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
  return {
    payload: system?.scrapPayload || emptyState,
    revision: Number(legacy.revision) || 0
  };
}

async function readCurrent() {
  const head = await readHead();
  if (head) {
    const payload = await readObject(head.objectPath);
    if (!payload) throw new Error('공용 상태 파일을 찾지 못했습니다.');
    return { payload, revision: Number(head.revision) || 0, head };
  }
  return { ...(await readLegacyState()), head: null };
}

async function ensureHead(current) {
  if (current.head) return current.head;
  const objectPath = `${V3_PREFIX}/bootstrap-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  await uploadObject(objectPath, current.payload);
  const head = {
    version: 3,
    revision: Number(current.revision) || 0,
    objectPath,
    updatedAt: new Date().toISOString()
  };
  await uploadObject(V3_HEAD_PATH, head, true);
  return head;
}

async function writePayload(payload, baseRevision, current) {
  await ensureHead(current);
  const latestBeforeWrite = await readHead();
  if (!latestBeforeWrite || Number(latestBeforeWrite.revision) !== baseRevision) return null;

  const nextRevision = baseRevision + 1;
  const objectPath =
    `${V3_PREFIX}/revision-${nextRevision}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`;
  await uploadObject(objectPath, payload);

  const latestBeforePublish = await readHead();
  if (!latestBeforePublish || Number(latestBeforePublish.revision) !== baseRevision) return null;

  const nextHead = {
    version: 3,
    revision: nextRevision,
    objectPath,
    updatedAt: new Date().toISOString()
  };
  await uploadObject(V3_HEAD_PATH, nextHead, true);

  const confirmed = await readHead();
  return confirmed &&
    Number(confirmed.revision) === nextRevision &&
    confirmed.objectPath === objectPath
    ? nextHead
    : null;
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
        const changes =
          req.body?.changes && typeof req.body.changes === 'object' ? req.body.changes : {};
        payload = { ...current.payload };
        for (const key of allowedKeys) {
          if (Object.prototype.hasOwnProperty.call(changes, key)) payload[key] = changes[key];
        }
        const guide = req.body?.selectionGuide;
        if (guide && typeof guide === 'object' && String(guide.id || '').trim()) {
          const currentGuides = Array.isArray(payload.selectionGuides) ? payload.selectionGuides : [];
          payload.selectionGuides = [
            ...currentGuides.filter(item => item?.id !== guide.id),
            guide
          ];
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
