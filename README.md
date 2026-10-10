# Corvus Chess

A phone-first chess app for **Lastivka vs. Corvus**.

The browser handles the board and chess rules with `chess.js`. A Vercel serverless function sends the current legal position to the OpenAI Responses API so Corvus can choose a move and make a short comment. The returned move is checked against the legal move list before the app accepts it.

## Deploy on Vercel

1. Import this GitHub repository into Vercel.
2. Add the environment variable `OPENAI_API_KEY` in the Vercel project settings.
3. Optional: add `OPENAI_MODEL=gpt-6-luna` to override the default model.
4. Deploy.
5. Open the Vercel URL on your phone and optionally choose **Add to Home screen**.

## Cloud game archive with Supabase

The app can sync every move and retain completed games in a Past Games archive.

1. Create a Supabase project.
2. Open its SQL editor and run the contents of `supabase-schema.sql` once.
3. In Vercel, add `SUPABASE_URL` using the project URL.
4. In Vercel, add `SUPABASE_SERVICE_ROLE_KEY` using the Supabase service-role secret.
5. Redeploy the Vercel project.

The service-role key must stay server-side. Never put it in `public/app.js`, `public/index.html`, or any other client-side file.

The archive stores a per-device installation ID, game ID, player color, opponent Elo, estimated Elo, result, FEN, PGN, SAN move list, UCI move list, and timestamps. The browser only talks to `/api/games`; it does not receive the Supabase service-role key.

## Important

An OpenAI API key is separate from a ChatGPT subscription, and API usage is billed separately. Never put the API key in client-side files.

## Features

- Touch-first chess board
- Legal move highlighting
- Last-move highlighting
- Captures, castling, en passant, promotion, check, checkmate, and draw handling through `chess.js`
- Corvus move selection through the OpenAI Responses API
- Server-side validation of Corvus's move
- Short Corvus commentary after each AI move
- 5-game provisional Elo placement mode
- Cloud synchronization of moves while a game is in progress
- Past Games archive for completed games
- Stored PGN, SAN, UCI, result, Elo context, and timestamps
- Swap colors
- Undo the previous human/Corvus move pair outside placement mode
- Retry button if the AI request fails
- Collapsible move history for small screens
