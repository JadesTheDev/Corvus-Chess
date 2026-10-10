import OpenAI from 'openai';
import { Chess } from 'chess.js';

function parseModelMove(text = '') {
  const clean = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try {
    const parsed = JSON.parse(clean);
    if (typeof parsed.move === 'string') {
      return {
        move: parsed.move.trim().toLowerCase(),
        quip: typeof parsed.quip === 'string' ? parsed.quip.trim() : ''
      };
    }
  } catch {}

  const match = clean.match(/\b([a-h][1-8][a-h][1-8][qrbn]?)\b/i);
  return match ? { move: match[1].toLowerCase(), quip: '' } : null;
}

function legalUciMoves(chess) {
  return chess.moves({ verbose: true }).map((move) => `${move.from}${move.to}${move.promotion || ''}`);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only.' });
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({ error: 'OPENAI_API_KEY is not configured on the server.' });
    }

    const { fen, history = [], humanName = 'Lastivka' } = req.body || {};
    if (typeof fen !== 'string') {
      return res.status(400).json({ error: 'Missing FEN.' });
    }

    const chess = new Chess(fen);
    if (chess.isGameOver()) {
      return res.status(400).json({ error: 'The game is already over.' });
    }

    const legal = legalUciMoves(chess);
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL || 'gpt-6-luna';
    let lastRaw = '';

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await client.responses.create({
        model,
        instructions: [
          'You are Corvus, playing a friendly but genuinely competitive chess game against Lastivka.',
          'Choose exactly one move from the supplied legal move list.',
          'Play to win using sensible chess strategy, tactics, development, king safety, and endgame principles.',
          'Return ONLY compact JSON with exactly two keys: move and quip.',
          'move must be UCI notation such as e7e5 or e7e8q and MUST appear verbatim in the legal list.',
          'quip is one short natural sentence reacting to the position or the opponent move. Keep it playful, dry, and never mean.',
          'Never invent a move outside the legal list.'
        ].join(' '),
        input: JSON.stringify({
          opponent: humanName,
          position_fen: chess.fen(),
          side_to_move: chess.turn() === 'w' ? 'white' : 'black',
          recent_san_history: history.slice(-40),
          legal_moves_uci: legal,
          retry_note: attempt ? `Previous response was invalid: ${lastRaw}` : undefined
        })
      });

      lastRaw = response.output_text || '';
      const candidate = parseModelMove(lastRaw);
      if (!candidate || !legal.includes(candidate.move)) continue;

      const made = chess.move({
        from: candidate.move.slice(0, 2),
        to: candidate.move.slice(2, 4),
        promotion: candidate.move[4]
      });

      if (!made) continue;

      return res.status(200).json({
        move: candidate.move,
        san: made.san,
        quip: candidate.quip,
        fen: chess.fen()
      });
    }

    return res.status(502).json({ error: 'Corvus failed to choose a legal move. Tap retry.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error?.message || 'Unexpected server error.' });
  }
}
