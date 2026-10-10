# Corvus Chess

A phone-first chess app for **Lastivka vs. Corvus**.

The browser handles the board and chess rules with `chess.js`. A Vercel serverless function sends the current legal position to the OpenAI Responses API so Corvus can choose a move and make a short comment. The returned move is checked against the legal move list before the app accepts it.

## Deploy on Vercel

1. Import this GitHub repository into Vercel.
2. Add the environment variable `OPENAI_API_KEY` in the Vercel project settings.
3. Optional: add `OPENAI_MODEL=gpt-6-luna` to override the default model.
4. Deploy.
5. Open the Vercel URL on your phone and optionally choose **Add to Home screen**.

## Important

An OpenAI API key is separate from a ChatGPT subscription, and API usage is billed separately. Never put the API key in `public/app.js`, `public/index.html`, or any other client-side file.

## Features

- Touch-first chess board
- Legal move highlighting
- Last-move highlighting
- Captures, castling, en passant, promotion, check, checkmate, and draw handling through `chess.js`
- Corvus move selection through the OpenAI Responses API
- Server-side validation of Corvus's move
- Short Corvus commentary after each AI move
- Swap colors
- Undo the previous human/Corvus move pair
- Retry button if the AI request fails
- Collapsible move history for small screens
