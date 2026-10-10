const json = (res, status, body) => res.status(status).json(body);

function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url: url.replace(/\/$/, ''), key } : null;
}

async function sb(path, options = {}) {
  const cfg = config();
  if (!cfg) throw new Error('DATABASE_NOT_CONFIGURED');
  const response = await fetch(`${cfg.url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: cfg.key,
      Authorization: `Bearer ${cfg.key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.hint || `Database error ${response.status}`);
  return data;
}

export default async function handler(req, res) {
  try {
    if (!config()) return json(res, 503, { configured: false, error: 'Game archive database is not configured yet.' });

    if (req.method === 'GET') {
      const installationId = String(req.query?.installationId || '').trim();
      const gameId = String(req.query?.gameId || '').trim();
      if (!installationId) return json(res, 400, { error: 'Missing installationId.' });

      let query = `games?installation_id=eq.${encodeURIComponent(installationId)}&order=started_at.desc&limit=30`;
      if (gameId) query = `games?installation_id=eq.${encodeURIComponent(installationId)}&game_id=eq.${encodeURIComponent(gameId)}&limit=1`;
      const games = await sb(query, { method: 'GET' });
      return json(res, 200, { configured: true, games });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const required = ['gameId', 'installationId', 'humanColor', 'opponentElo'];
      if (required.some((key) => !body[key] && body[key] !== 0)) return json(res, 400, { error: 'Missing game fields.' });

      const record = {
        game_id: String(body.gameId),
        installation_id: String(body.installationId),
        human_name: String(body.humanName || 'Lastivka'),
        human_color: String(body.humanColor),
        opponent_elo: Number(body.opponentElo),
        estimated_elo: Number.isFinite(body.estimatedElo) ? Number(body.estimatedElo) : null,
        placement_game: Boolean(body.placementGame),
        status: String(body.status || 'active'),
        result: body.result ? String(body.result) : null,
        result_label: body.resultLabel ? String(body.resultLabel) : null,
        final_fen: body.fen ? String(body.fen) : null,
        pgn: body.pgn ? String(body.pgn) : null,
        san_moves: Array.isArray(body.sanMoves) ? body.sanMoves : [],
        uci_moves: Array.isArray(body.uciMoves) ? body.uciMoves : [],
        updated_at: new Date().toISOString(),
        completed_at: body.status === 'complete' ? new Date().toISOString() : null
      };

      const data = await sb('games?on_conflict=game_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(record)
      });
      return json(res, 200, { configured: true, game: data?.[0] || null });
    }

    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'GET or POST only.' });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: error?.message || 'Unexpected archive error.' });
  }
}
