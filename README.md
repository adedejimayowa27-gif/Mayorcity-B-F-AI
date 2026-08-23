# Mayorcity B&F AI

## Project structure

```
├── netlify.toml              # tells Netlify where the site/functions live, security headers, 404 routing
├── netlify/
│   └── functions/
│       ├── chat.js           # backend proxy that calls the Groq API (keeps your key secret)
│       └── feedback.js       # logs thumbs up/down votes on answers to the function logs
└── site/                     # this is what gets published
    ├── index.html            # markup only
    ├── css/
    │   └── style.css         # all styling (dark/light themes as CSS variables)
    ├── js/
    │   ├── kb-parts/         # your embedded study-pack knowledge base, split into chunks
    │   └── app.js            # retrieval logic + chat UI logic + conversation history
    ├── icons/                # PWA/app icons
    ├── manifest.json         # PWA manifest
    ├── sw.js                 # service worker (offline fallback only, no aggressive caching)
    ├── offline.html          # shown when the service worker detects no connection
    ├── 404.html              # custom not-found page
    ├── robots.txt / sitemap.xml   # replace REPLACE_WITH_YOUR_DOMAIN once you have a real domain
    └── favicon.ico
```

## Notable features

- **Dark/light mode** — toggle in the header, remembers your choice, defaults to OS preference.
- **Conversation history** — the hamburger icon (top-left) opens a sidebar of saved
  conversations (stored in `localStorage`, per-browser — there's no account system, so history
  doesn't sync across devices). "Export this chat" downloads the active conversation as a `.txt` file.
- **About & founder** — in the sidebar footer; also baked into the assistant's system prompt so it
  can answer "who built this?" accurately without volunteering it unprompted.
- **Answer feedback** — thumbs up/down on each answer POST to `/.netlify/functions/feedback`,
  which logs the vote (Netlify dashboard → your site → **Logs → Functions → feedback**). This is
  a lightweight, no-database way to spot-check quality — swap the `console.log` in that file for a
  real datastore if you want a proper dashboard later.
- **Formulas** — rendered with [KaTeX](https://katex.org) (loaded from a CDN) for real math
  typesetting, with a plain-text fallback if the CDN is unreachable.
- **Keyboard shortcuts** — `Ctrl`/`Cmd`+`K` starts a new chat, `Esc` closes the sidebar or About modal.

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
   (`netlify/functions/chat.js`) that actually calls the Groq API — the original file
   referenced `/.netlify/functions/chat` but that function wasn't included, so the app wouldn't
   have worked when deployed. This version includes it.

## Deploying

1. Push this whole folder to a Git repo (or drag-and-drop the folder into Netlify's dashboard).
2. In Netlify: **Site settings → Environment variables** → add `GROQ_API_KEY` with a key from
   [console.groq.com/keys](https://console.groq.com/keys). Set the "Secret" checkbox, and use
   "Same value for all deploy contexts" unless you specifically want different keys per context.
3. Netlify will read `netlify.toml` automatically: it publishes `site/` and deploys
   `netlify/functions/chat.js` as `/.netlify/functions/chat`.
4. No build step is required — it's plain HTML/CSS/JS.
5. Optional: set `GROQ_MODEL` too if you want a model other than the default
   (`openai/gpt-oss-120b`).
6. `feedback.js` needs no environment variables — it just logs to the function's own logs.
7. Once you have a real deployed URL, replace `REPLACE_WITH_YOUR_DOMAIN` in
   `site/robots.txt` and `site/sitemap.xml` with it (search-engine files, not required for the
   app to work, but worth doing before you rely on organic search).

## Local testing

If you have the [Netlify CLI](https://docs.netlify.com/cli/get-started/) installed:

```bash
netlify dev
```

This serves `site/` and runs the function locally (with your `GROQ_API_KEY` set in a local
`.env` file), so `/.netlify/functions/chat` works exactly like in production.
