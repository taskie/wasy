# wasy-seekable-player

A Vite + TypeScript demo for [`wasy`](../../README.md). Wires `SmfPlayer` and `SynthEngine` directly (without the `Wasy` façade) to expose fine-grained playback control and a rich set of visualizations.

## Run

From the repo root:

```sh
npm install                           # workspace install (root + examples/*)
npm run -w examples/seekable-player dev
```

Then open the URL Vite prints (default `http://localhost:5173`).

```sh
npm run -w examples/seekable-player build    # production build → dist/
npm run -w examples/seekable-player preview  # serve the build
```

The app uses `wasy` via the workspace link (`"wasy": "file:../.."` in this package's `package.json`), so it always picks up the latest `dist/` output of the root project. Run `npm run build` at the root if you have changed library source.

## Loading songs

Two sources are supported, selectable from the SMF loader panel:

- **User file**: drag-and-drop or file-picker for any `.mid` file from disk.
- **Sample songs**: pick from `public/midi/songs.json`. Add files to `public/midi/` and register them as `{ "name": "...", "artist": "...", "file": "song.mid" }` entries. Ships as `[]` — drop in your own MIDI files and register them there.

## Web MIDI input

The Web MIDI panel lets you enable `navigator.requestMIDIAccess()` and route one or more physical input ports into the synthesizer in real time. WebMidiLink (`window.message` events shaped like `"midi,90,3c,40"`) is always active.

## Panels

The workspace is a set of floating, draggable panels toggled from the view bar at the top:

| Panel               | Contents                                                                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SMF / transport     | File loader, play / pause / stop, seek bar with tick / time / bar:beat readouts, current BPM                                                                   |
| Waveform / Spectrum | Oscilloscope and FFT view tapped from an `AnalyserNode`                                                                                                        |
| Piano Roll          | Scrolling note display; auto-fits pitch range; beat + octave grid; channel-9 drums in grey                                                                     |
| Keyboard            | 16-row × 128-key activity strip driven by NoteOn / NoteOff events                                                                                              |
| Metadata            | SMF header (format / tracks / resolution / duration) plus title, copyright, track names, instrument names, markers, and lyrics extracted from text Meta events |
| Mixer               | Master fader + per-channel solo / mute / volume (writes to `SynthEngine.channelGains`)                                                                         |
| Channel Status      | Per-channel active-note count and last program number                                                                                                          |
| Event Log           | Scrolling ring buffer of MIDI events with channel-color coding and per-category filters                                                                        |
| Web MIDI            | Device list and real-time MIDI input controls                                                                                                                  |

## Theme

A three-way toggle in the view bar switches between **Dark** (Solarized Dark), **Light** (Solarized Light), and **System** (follows `prefers-color-scheme`). Selection is persisted to `localStorage`.

## Files

- `src/main.ts` — `Application` class, audio graph construction, playback control, file loading, seek logic
- `src/piano-roll-view.ts` — scrolling piano-roll canvas
- `src/keyboard-view.ts` — 16-row keyboard activity canvas
- `src/analyser-view.ts` — waveform / FFT canvas
- `src/mixer-view.ts` — 16-channel mixer UI
- `src/event-log-view.ts` — event log with ring buffer
- `src/channel-status-view.ts` — per-channel status strip
- `src/web-midi-view.ts` — Web MIDI device list and controls
- `src/panels.ts` — draggable floating-panel system
- `src/palette.ts` — Solarized color constants and canvas palette helpers
- `src/theme.ts` — dark/light/system theme logic
- `src/style.css` — layout and CSS custom properties for Solarized dark/light themes
- `index.html` — single page, no template engine
- `vite.config.ts` — defaults; the worker chunk is emitted automatically
