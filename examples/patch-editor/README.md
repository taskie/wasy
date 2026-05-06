# wasy-patch-editor

A Vite + TypeScript demo for [`wasy`](../../README.md). An interactive designer for wasy's oscillator-based synthesis patches. Edit source / envelope parameters through a form UI, audition the result in real time, and copy the JSON definition for use in your own application.

## Run

From the repo root:

```sh
npm install                        # workspace install (root + examples/*)
npm run -w examples/patch-editor dev
```

Then open the URL Vite prints (default `http://localhost:5173`).

```sh
npm run -w examples/patch-editor build    # production build → dist/
npm run -w examples/patch-editor preview  # serve the build
```

## Modes

### Melody

Edits a single `ToneDefinition` fed to `compileTone`. Parameters:

- **Source**: `oscillator` (sine / square / triangle / sawtooth) or `noise`, with optional fixed-Hz pitch and filter frequency
- **Envelope**: `adsr` (Attack / Hold / Decay / Sustain / Fade / Release) or `ramp` (begin → end over a fixed duration, optionally one-shot)

### Drum

Edits a `DrumKitDefinition` fed to `compileDrumKit`. The bus gain applies to the entire kit. Each voice is keyed to a GM percussion note (35–81) and carries:

- Routing (center / left / right), optional exclude group for hi-hat-style muting
- Source (oscillator or noise) and envelope — same options as Melody mode

Voices are listed by GM note name; select one to edit, or click **Add voice at selected key** to create a new entry for the key currently highlighted on the keyboard.

## Auditioning

The interactive piano keyboard at the bottom of the page triggers NoteOn / NoteOff events against the currently compiled patch. In Melody mode every key plays the note at the selected velocity. In Drum mode each key triggers its registered voice (unregistered keys are silent).

Web MIDI input is also supported: select an input port from the **MIDI In** dropdown and play from a controller.

## JSON export

The **JSON** panel on the left shows a live serialization of the current definition. Edit the JSON directly and click **Apply** to recompile, or click **Copy** to put the text on the clipboard and paste it into your project as a `ToneDefinition` / `DrumKitDefinition` literal.

## Files

- `src/main.ts` — `Application` class, all form ↔ patch wiring, JSON export, Web MIDI setup
- `src/piano-keyboard.ts` — interactive piano keyboard canvas
- `src/style.css` — layout
- `index.html` — single page
- `vite.config.ts` — defaults
