const SUPABASE_URL = 'https://orpeybiqikrdydkhsjjs.supabase.co';
const SUPABASE_KEY = 'sb_publishable_TerLvPZo7e5_X91A-P4qlQ_DaqBly0Q';
const TABLE = 'sales_state';
const ROW_ID = 'main';
const SYSTEM_ID = '__SCRAP_SHARED_STATE_V1__';
const headers = { apikey: SUPABASE_KEY, 'content-type': 'application/json' };
const emptyState = {
  pos: [], splits: [], inputs: [], bags: [], gradeMasters: [],
  gradeTypes: {}, mainGrades: [], subGrades: [], locations: [], movements: [],
  waitingLocations: [], waitingMoves: []
};

async function readRow() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${ROW_ID}&select=items,revision`, {
    headers,
    cache: 'no-store'
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase HTTP ${response.status}: ${text}`);
  const rows = JSON.parse(text || '[]');
  if (!rows.length) throw new Error('sales_state main row is missing');
  const items = Array.isArray(rows[0].items) ? rows[0].items : [];
  const system = items.find(item => item?.id === SYSTEM_ID);
  return { payload: system?.scrapPayload || emptyState, revision: rows[0].revision || 0, items };
}

async function writeRow(current, payload, baseRevision) {
  const nextRevision = baseRevision + 1;
  const nextItems = current.items.filter(item => item?.id !== SYSTEM_ID);
  nextItems.push({
    id: SYSTEM_ID,
    hiddenSystemItem: true,
    sold: true,
    company: '',
    grade: '',
    scrapPayload: payload || emptyState
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${ROW_ID}&revision=eq.${baseRevision}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({
      items: nextItems,
      revision: nextRevision,
      updated_at: new Date().toISOString()
    })
  });
  if (!response.ok) throw new Error(`Supabase save HTTP ${response.status}: ${await response.text()}`);
  return nextRevision;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  try {
    if (req.method === 'GET') {
      const row = await readRow();
      return res.status(200).json(row);
    }
    if (req.method === 'PUT' || req.method === 'PATCH') {
      const baseRevision = Number(req.body?.baseRevision) || 0;
      const current = await readRow();
      if (Number(current.revision) !== baseRevision) {
        return res.status(409).json({ error: '?ㅻⅨ ?ъ슜?먭? 癒쇱? ??ν뻽?듬땲??', payload: current.payload, revision: current.revision });
      }
      let payload = req.body?.payload || emptyState;
      if (req.method === 'PATCH') {
        const allowed = [
          'pos', 'splits', 'inputs', 'bags', 'companies', 'gradeMasters', 'gradeTypes',
          'mainGrades', 'subGrades', 'locations', 'movements', 'waitingLocations',
          'waitingMoves', 'workWaitLocations', 'losses', 'inspectionDrafts',
          'inspectionHandovers', 'workWaits', 'salesOrders', 'shippingAreaMoves',
          'packingLists', 'shipments', 'shipmentAllocations', 'returnReceipts',
          'claims', 'domesticReceipts', 'packagingMaterials', 'selectionGuides', 'auditLogs'
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
      const nextRevision = await writeRow(current, payload, baseRevision);
      return res.status(200).json({ revision: nextRevision });
    }
    res.setHeader('Allow', 'GET, PUT, PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message || String(error) });
  }
}