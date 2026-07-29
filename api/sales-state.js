Exit code: 0
Wall time: 1.8 seconds
Output:
const SUPABASE_URL = 'https://orpeybiqikrdydkhsjjs.supabase.co';
const SUPABASE_KEY = 'sb_publishable_TerLvPZo7e5_X91A-P4qlQ_DaqBly0Q';
const TABLE = 'sales_state';
const ROW_ID = 'main';
const SCRAP_SYSTEM_ID = '__SCRAP_SHARED_STATE_V1__';
const headers = { apikey: SUPABASE_KEY, 'content-type': 'application/json' };

function isPreservedSystemItem(item) {
  return item?.id === SCRAP_SYSTEM_ID || item?.hiddenSystemItem === true;
}

function salesItems(items) {
  return (Array.isArray(items) ? items : []).filter(item => !isPreservedSystemItem(item));
}

async function readRow() {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${ROW_ID}&select=items,revision`,
    { headers, cache: 'no-store' }
  );
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase HTTP ${response.status}: ${text}`);
  const rows = JSON.parse(text || '[]');
  if (!rows.length) throw new Error('sales_state main row is missing');
  return {
    items: Array.isArray(rows[0].items) ? rows[0].items : [],
    revision: Number(rows[0].revision) || 0
  };
}

async function writeSalesItems(current, incomingItems, baseRevision) {
  const nextRevision = baseRevision + 1;
  const preserved = current.items.filter(isPreservedSystemItem);
  const mergedItems = [...preserved, ...salesItems(incomingItems)];
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${ROW_ID}&revision=eq.${baseRevision}`,
    {
      method: 'PATCH',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({
        items: mergedItems,
        revision: nextRevision,
        updated_at: new Date().toISOString()
      })
    }
  );
  if (!response.ok) {
    throw new Error(`Supabase save HTTP ${response.status}: ${await response.text()}`);
  }
  return nextRevision;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  try {
    if (req.method === 'GET') {
      const current = await readRow();
      return res.status(200).json({
        items: salesItems(current.items),
        revision: current.revision
      });
    }
    if (req.method === 'PUT') {
      const baseRevision = Number(req.body?.baseRevision) || 0;
      const current = await readRow();
      if (current.revision !== baseRevision) {
        return res.status(409).json({
          error: '다른 사용자가 먼저 저장했습니다.',
          items: salesItems(current.items),
          revision: current.revision
        });
      }
      const nextRevision = await writeSalesItems(
        current,
        Array.isArray(req.body?.items) ? req.body.items : [],
        baseRevision
      );
      return res.status(200).json({ revision: nextRevision });
    }
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ error: error.message || String(error) });
  }
}

