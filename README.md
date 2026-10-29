# POL@RIS

A browser game about an independent privateer. Trade cargo between locations, build a ship from a hull and modules, hunt pirates or become a pirate. A career has 730 game days and ends with a score and a title. The visuals are animated text mode (Code Page 437 characters).

**Status:** M1 (foundation) is built. See [PROGRESS.md](PROGRESS.md).

## Documents

| Document | Content |
|---|---|
| [docs/design-brief.md](docs/design-brief.md) | Design brief v2.4. The authority for the MVP. |
| [docs/requirements/](docs/requirements/README.md) | MVP requirements for each milestone (M1–M8), open questions, risks, and acceptance check traceability. |
| [PROGRESS.md](PROGRESS.md) | Status of each milestone. |
| [DECISIONS.md](DECISIONS.md) | Decisions that the brief does not give, with one line of reason. |
| [data/art/README.md](data/art/README.md) | Art and style files from Claude Design, and how to change them. |

## Technology

TypeScript (`strict`), Vite, rot.js, Vitest. Hosting on GitHub Pages with GitHub Actions. See §4 of the brief.

## Development

Node 22 or later.

```sh
npm ci                 # install
npm run dev            # game in the browser (debug panel: F12 or `)
npm test               # unit tests
npm run typecheck      # TypeScript check
npm run build          # production build in dist/
npm run world-report   # headless report on generated worlds
npm run import-art     # convert data/art/ships.yaml to ships.json
```

Pushes to `main` deploy to GitHub Pages. In the repository settings, set Pages "Source" to "GitHub Actions".
