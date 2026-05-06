# wasy

A small Web Audio synthesizer that plays Standard MIDI Files (SMF) and Web MIDI input directly in the browser. ESM-only, TypeScript, no runtime dependencies.

## Install

```sh
npm install wasy
```

`wasy` ships ES modules and a separate Web Worker chunk. Use a bundler that understands `new Worker(new URL(..., import.meta.url), { type: "module" })` — Vite, webpack 5, esbuild, and Rolldown all do.

## Minimal example

```ts
import { wasy } from "wasy";

const ctx = new AudioContext();
// Resume on a user gesture if the page hasn't interacted yet.
await ctx.resume();

const buffer = await fetch("/song.mid").then((r) => r.arrayBuffer());
const synth = new wasy.Wasy(ctx, ctx.destination, buffer);
synth.play();

// Later:
synth.pause();
synth.resume();
synth.seek(960); // jump to tick 960; replays state events, drops skipped notes
synth.load(otherBuffer); // swap to a different SMF
synth.unload(); // stop and free the worker (re-loadable)
synth.destroy(); // tear everything down
```

### Web MIDI input

```ts
import { midiIn } from "wasy";

const input = midiIn.createWebMidiInput(); // Signal<midi.Event>
input.on((event) => synth.receiveExternalMidiEvent(event));
```

`createWebMidiLinkInput()` is also available; it consumes `window.message` events shaped like `"midi,90,3c,40"` (WebMidiLink protocol).

## Features

- **SMF Format 0 / 1** with running status and Meta events. Format 2 is parsed but treated as Format 1 with a console warning.
- **16 channels** with polyphony 16 per channel (LRU note stealing).
- **Built-in patches**: oscillator-based GM-ish coverage for ~20 programs, white-noise patches, and a drum kit on channel 10. See `src/synth.ts` for the program → patch mapping.
- **Web MIDI**: realtime input via `requestMIDIAccess`, plus the WebMidiLink `postMessage` protocol.
- **Pitch bend / RPN 0**: pitch bend range follows MSB (semitones) + LSB (cents).

## Browser support

Modern evergreen browsers. Requires `AudioContext`, `StereoPannerNode`, `BiquadFilterNode`, `TextDecoder`, `WeakMap`, and ES module workers (`new Worker(url, { type: "module" })`).

## Development

```sh
npm install
npm run lint        # oxlint
npm run type-check  # tsc --noEmit
npm test            # vitest run
npm run build       # tsc → dist/
```

There are two Vite-based example apps under `examples/`:

- `examples/simple-player/` — SMF playback, drag-and-drop file load, Web MIDI input, keyboard / spectrum visualizer. Uses the `wasy.Wasy` façade.
- `examples/seekable-player/` — wires `SmfPlayer` + `SynthEngine` directly without `Wasy`, exposing a tick-precise seek bar, scrolling piano roll, 16ch keyboard activity strip, waveform / spectrum tap, SMF metadata block (title / copyright / track names / markers / lyrics), and a 16-channel mixer with master / per-channel solo / mute / volume.

```sh
npm run -w examples/simple-player dev
npm run -w examples/seekable-player dev
```

## License

[MIT](./LICENSE-MIT) OR [Apache-2.0](./LICENSE-APACHE)
