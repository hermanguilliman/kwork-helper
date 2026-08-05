# AGENTS.md

Kwork Helper — a single-file Tampermonkey userscript that enhances the Kwork.ru freelance marketplace: AI order analysis, spam filter, price/hire-rate badges, infinite scroll, auto-refresh.

## Toolchain (important: there is none)

- The entire product is `kwork-helper.user.js` — plain browser JS in an IIFE. No package.json, no build step, no tests, no lint, no CI. Do not run `npm`/`npx` commands here.
- "Verification" is manual: install the file into Tampermonkey and test live on `https://kwork.ru/projects` (the `@match` only allows that URL), watching the browser console (F12).
- The `// ==UserScript==` metadata block at the top is mandatory and parsed by Tampermonkey (`@match`, `@grant`, `@version`, `@updateURL`/`@downloadURL`). Never remove or reorder it.
- Release flow: bump `@version` in the header and push to `main` — users auto-update from the raw `main` URL. The README badge version drifts from the header (README says 2.0.0, script is 2.0.3); trust the header, not the README.
- Commit style in this repo: short, lowercase, emoji-prefixed messages (e.g. `🦍💨 async`, `add AI integration`) — not conventional commits.

## Code layout (one file, five classes)

- `KworkAssistant` — entrypoint; `init()` wires everything and starts a MutationObserver plus a 500 ms `runLoop()` that reprocesses all cards continuously.
- `ConfigManager` — settings persisted in browser `localStorage` under `kw_*` keys (never in the repo). Booleans are stored as the literal string `"true"` and read via `get() === "true"`; strings via `getString`/`setString`.
- `CardProcessor` — per-card logic: spam marking, price strips, hire-rate badges, AI button.
- `UIManager` — floating "KH" panel + settings modal; all CSS is injected as the `CSS` template string using `kw-` prefixed classes.
- `AiClient` — OpenAI-compatible `chat/completions` via `GM_xmlhttpRequest`; `InfiniteScrollManager` — infinite scroll.

## Conventions & gotchas

- **DOM coupling:** the script lives or dies with Kwork's live markup. Core selectors: `.want-card` (card container), `.wants-card__header-title`, `.wants-card__price`, `.wants-card__review--low-price`, `.wants-card__description-higher-price`, `.wants-card__description-text`, `.want-payer-statistic`, `.wants-content`, `.project-list`. Note the singular/plural split — outer cards are `.want-card`, inner elements are `.wants-card__*`. Easy to typo.
- **Defensive processing:** per-card steps run inside the module-level `safe("label", fn)` wrapper (each distinct failure is logged to console once, not every 500 ms) so one broken selector can't kill the whole loop. New per-card work must be wrapped in `safe()` too. Critical selectors are registered in `CORE_SELECTORS`; the throttled `checkDomHealth()` (in `runLoop`) warns once per selector when Kwork renames markup — keep new critical selectors in that map.
- **Idempotency is mandatory:** processed cards get `data-kw-state` (`"active"` or `"spam"`), and `process()` skips tagged cards. Since the MutationObserver + runLoop reprocess everything, any new per-card work must be idempotent or it will duplicate (AI buttons, badges, fire emoji). Spam state is un-stuck automatically when a stop word is removed from settings (`unmarkSpam()`), and re-applied if the word comes back.
- **All user-facing strings are Russian** — UI labels, default prompt, error messages, README. Keep new strings Russian.
- **Auto-refresh and infinite scroll are mutually exclusive by design**; enabling one disables the other, and auto-refresh literally calls `window.location.reload()`.
- **Infinite scroll fetches `?page=N` in a hidden iframe** and imports cards with `document.adoptNode`. Loader visibility is managed only by `loadNextPage()`/`onIframeLoad()`/`finishFeed()`; `updateState()` deliberately sets the loader to `display: none` and must not start showing it (it would stay visible permanently).
- **Keep AI calls on `GM_xmlhttpRequest` and keep `@connect *`** — base URL is user-configurable to any OpenAI-compatible endpoint, so switching to `fetch` or narrowing `@connect` breaks custom setups.
- Threshold defaults live in `DEFAULTS` (goodPrice 3000₽, badPrice 500₽, hire rates 40/20). New settings should follow the `kw_` localStorage key pattern and `ConfigManager` accessor style.
- Manual test checklist after changes: spam marking/hiding, price strips, hire badges, AI button (needs an API key set in settings), and infinite scroll to the end of the feed ("Заказов больше нет").
