# wasy

A Web Audio synthesizer that plays Standard MIDI Files and Web MIDI input in the browser. ESM-only TypeScript, no runtime dependencies.

## Documentation

- [README.md](./README.md) — install, minimal usage, features, browser support, development commands.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — module layout, data flow (SMF → player → engine → Web Audio), worker boundary.
- [CHANGELOG.md](./CHANGELOG.md) — version history.
- [TODO.md](./TODO.md) — planned work and open issues.

## Layout

- `src/` — library source. Entry `index.ts`; `wasy.ts` is the high-level façade; `smf-player.ts` / `synth-engine.ts` are the lower-level pieces; subdirs `smf/`, `midi/`, `synth/`, `player/`, `webmidi/`, `binary/`.
- `tests/` — Vitest suites mirroring `src/`.
- `examples/simple-player/`, `examples/seekable-player/` — Vite demo apps.
- `scripts/hooks/pre-commit` — runs `oxlint` + `oxfmt --check`; activated by `npm install` (the `prepare` script points `core.hooksPath` at `scripts/hooks`).
