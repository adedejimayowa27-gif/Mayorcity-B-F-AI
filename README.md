# Mayorcity B&F AI

## Project structure

```
├── netlify.toml              # tells Netlify where the site and functions live
├── netlify/
│   └── functions/
│       └── chat.js           # backend proxy that calls the Anthropic API (keeps your key secret)
└── site/                     # this is what gets published
    ├── index.html            # markup only
    ├── css/
    │   └── style.css         # all styling
    └── js/
        ├── kb.js             # your embedded study-pack knowledge base (unchanged content)
        └── app.js            # retrieval logic + chat UI logic
```

## What changed from the single-file version

1. **New subjects**: added *Mathematics of Finance* and *Monetary Policy* to the header chips, the
   empty-state suggestions, and the system prompt's subject list. There isn't a study pack for
   either of these in `kb.js` yet, so answers on those topics come from general knowledge — the
   system prompt tells the assistant to say so explicitly rather than pretend it's grounded in a
   document. If you have a study pack (PDF/text) for either subject, send it over and it can be
   chunked and added to `kb.js` the same way the other four packs were, which will make those
   answers grounded and sourced too.

2. **Redesign**: dropped the purple/magenta gradient, glossy buttons, and serif "old-school" look
   for a flatter, single-accent (deep emerald) fintech look with Inter as the typeface — closer to
   what a modern banking product looks like.

3. **Split into real files**: previously everything (HTML/CSS/JS/data) was in one `.html` file.
   It's now a proper static site (`site/`) plus a serverless function
   (`netlify/functions/chat.js`) that actually calls the Anthropic API — the original file
   referenced `/.netlify/functions/chat` but that function wasn't included, so the app wouldn't
   have worked when deployed. This version includes it.

## Deploying

1. Push this whole folder to a Git repo (or drag-and-drop the folder into Netlify's dashboard).
2. In Netlify: **Site settings → Environment variables** → add `ANTHROPIC_API_KEY` with your key.
3. Netlify will read `netlify.toml` automatically: it publishes `site/` and deploys
   `netlify/functions/chat.js` as `/.netlify/functions/chat`.
4. No build step is required — it's plain HTML/CSS/JS.

## Local testing

If you have the [Netlify CLI](https://docs.netlify.com/cli/get-started/) installed:

```bash
netlify dev
```

This serves `site/` and runs the function locally (with your `ANTHROPIC_API_KEY` set in a local
`.env` file), so `/.netlify/functions/chat` works exactly like in production.
