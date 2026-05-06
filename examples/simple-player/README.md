# wasy-simple-player

A Vite + TypeScript demo for [`wasy`](../../README.md). Plays SMF files, accepts Web MIDI input, and draws a keyboard / FFT visualizer.

## Run

From the repo root:

```sh
npm install                        # workspace install (root + examples/*)
npm run -w examples/simple-player dev
```

Then open the URL Vite prints (default `http://localhost:5173`).

```sh
npm run -w examples/simple-player build    # production build → dist/
npm run -w examples/simple-player preview  # serve the build
```

The app uses `wasy` via the workspace link (`"wasy": "file:../.."` in this package's `package.json`), so it always picks up the latest `dist/` output of the root project. Run `npm run build` at the root if you've changed library source.

## MIDI input sources

Three radio buttons select which input drives the synthesizer:

- **userFile**: drag-and-drop or pick a `.mid` file. Loaded via `FileReader` as an `ArrayBuffer`.
- **serverFile**: pick from `public/midi/songs.json`. Add files to `public/midi/` and entries like `{ "name": "...", "artist": "...", "file": "song.mid" }` to that JSON.
- **(Web MIDI / WebMidiLink)**: realtime input. Web MIDI is wired up via `navigator.requestMIDIAccess()`; WebMidiLink listens to `window.message` events.

`public/midi/songs.json` ships as `[]` — drop your own MIDI files in `public/midi/` and register them there.

## Files

- `src/main.ts` — `Application` class, all DOM wiring, the `KeyboardView` and `AnalyserView` canvas drawers.
- `src/style.css` — minimal layout.
- `index.html` — single page, no template engine.
- `vite.config.ts` — defaults; the `new Worker(new URL(...))` pattern in `wasy` produces a separate `assets/player-worker-*.js` chunk automatically.
