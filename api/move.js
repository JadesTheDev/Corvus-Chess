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

function strengthGuide(elo) {
  if (elo <= 700) return 'Play like a beginner: favor obvious legal moves, miss many tactics, and occasionally make harmless strategic mistakes. Do not intentionally hang the queen every game.';
  if (elo <= 1000) return 'Play like a developing casual player: know basic development and captures, but miss tactics and positional ideas fairly often.';
  if (elo <= 1300) return 'Play like an improving club player: use basic opening principles and simple tactics, but make noticeable inaccuracies.';
  if (elo <= 1600) return 'Play like a competent club player: calculate short tactics, value king safety and development, but still make occasional positional or tactical errors.';
  if (elo <= 1900) return 'Play strong club chess: calculate carefully, punish obvious mistakes, and make relatively few unforced errors.';
  if (elo <= 2200) return 'Play expert-strength chess: be tactically sharp, positionally sound, and difficult to beat.';
  return 'Play as strongly as you reasonably can: calculate deeply, choose principled moves, and punish inaccuracies.';
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

    const { fen, history = [], humanName = 'Lastivka', targetElo = 1000 } = req.body || {};
    if (typeof fen !== 'string') {
      return res.status(400).json({ error: 'Missing FEN.' });
    }

    const chess = new Chess(fen);
    if (chess.isGameOver()) {
      return res.status(400).json({ error: 'The game is already over.' });
    }

    const requestedElo = Math.max(600, Math.min(2400, Number(targetElo) || 1000));
    const legal = legalUciMoves(chess);
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL || 'gpt-6-luna';
    let lastRaw = '';

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await client.responses.create({
        model,
        instructions: [
          `You are Corvus, playing a friendly chess game against ${humanName}.`,
          `Your target playing strength is approximately ${requestedElo} Elo. ${strengthGuide(requestedElo)}`,
          'Choose exactly one move from the supplied legal move list.',
          'Do not claim the rating is official or precisely calibrated; it is an in-app approximation.',
          'Return ONLY compact JSON with exactly two keys: move and quip.',
          'move must be UCI notation such as e7e5 or e7e8q and MUST appear verbatim in the legal list.',
          'quip is one short natural sentence reacting to the position or the opponent move. Keep it playful, dry, and never mean.',
          'Never invent a move outside the legal list.'
        ].join(' '),
        input: JSON.stringify({
          opponent: humanName,
          target_elo: requestedElo,
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
        fen: chess.fen(),
        targetElo: requestedElo
      });
    }

    return res.status(502).json({ error: 'Corvus failed to choose a legal move. Tap retry.' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error?.message || 'Unexpected server error.' });
  }
}
