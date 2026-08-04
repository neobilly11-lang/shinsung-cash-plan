const SUPABASE_URL = 'https://orpeybiqikrdydkhsjjs.supabase.co';
const SUPABASE_KEY = 'sb_publishable_TerLvPZo7e5_X91A-P4qlQ_DaqBly0Q';
const TABLE = 'sales_state';
const ROW_ID = 'main';
const SYSTEM_ID = '__CASHCOW_PO_SYSTEM_V1__';
const headers = { apikey: SUPABASE_KEY, 'content-type': 'application/json' };

async function readRow() {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${ROW_ID}&select=items,revision`, { headers, cache: 'no-store' });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase HTTP ${response.status}: ${text}`);
  const rows = JSON.parse(text || '[]');
  if (!rows.length) throw new Error('sales_state main row is missing');
  const items = Array.isArray(rows[0].items) ? rows[0].items : [];
  const system = items.find(item => item?.id === SYSTEM_ID);
  return { payload: system?.cashcowPoPayload || null, revision: rows[0].revision || 0, items };
}

async function writeRow(current, payload, baseRevision) {
  const nextRevision = baseRevision + 1;
  const nextItems = current.items.filter(item => item?.id !== SYSTEM_ID);
  nextItems.push({ id: SYSTEM_ID, hiddenSystemItem: true, sold: true, company: '', grade: '', cashcowPoPayload: payload });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${ROW_ID}&revision=eq.${baseRevision}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ items: nextItems, revision: nextRevision, updated_at: new Date().toISOString() })
  });
  if (!response.ok) throw new Error(`Supabase save HTTP ${response.status}: ${await response.text()}`);
  return nextRevision;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  try {
    if (req.method === 'GET') {
      const row = await readRow();
      return res.status(200).json({ payload: row.payload, revision: row.revision });
    }
    if (req.method === 'PUT') {
      const baseRevision = Number(req.body?.baseRevision) || 0;
      const current = await readRow();
      if (Number(current.revision) !== baseRevision) {
        return res.status(409).json({ error: '다른 사용자가 먼저 저장했습니다.', payload: current.payload, revision: current.revision });
      }
      const nextRevision = await writeRow(current, req.body?.payload || null, baseRevision);
      return res.status(200).json({ revision: nextRevision });
    }
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message || String(error) });
  }
}
