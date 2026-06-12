// Patch definition schema. Tones and drum kits are described as plain
// JSON-serializable objects so that the GM 128 melodic set and Standard
// Drum Kit are inspectable and editable as data, and so library users
// can supply their own patches without subclassing.
//
// Compile-time consumers (`compileTone` / `compileDrumKit`) translate
// these into the existing `Patch` class hierarchy; the audio path is
// unchanged.

// AHDSFR envelope (Attack / Hold / Decay / Sustain / Fade / Release).
// All times are in seconds; `sustain` is a 0..1 multiplier applied to the
// velocity-derived peak gain. Hold and Fade are optional extensions over
// classic ADSR:
//   - `hold` keeps the gain pinned at peak for `hold` seconds between
//     the end of attack and the start of decay (mallet-style articulation).
//   - `fade` linearly ramps the gain from the sustain level down to 0
//     over `fade` seconds while the key is still held — useful for pads
//     and long tones that should slowly diminish even before NoteOff.
// Setting `hold` / `fade` to 0 (or omitting them) reduces the envelope
// to plain ADSR, so existing patches stay backward-compatible. The type
// alias and discriminator tag keep the legacy `Adsr` / `"adsr"` names
// for the same reason — JSON literals authored against the older schema
// continue to deserialize unchanged.
export type AdsrEnvelope = {
    type: "adsr";
    attack: number;
    hold?: number;
    decay?: number;
    sustain?: number;
    fade?: number;
    release: number;
};

// Linear gain ramp from `peak * begin` to `peak * end` over `duration`
// seconds, where peak is the velocity-to-gain mapping currently used by
// the synth (`(v / 127)^2`).
export type RampEnvelope = {
    type: "ramp";
    begin: number;
    end: number;
    duration: number;
};

export type Envelope = AdsrEnvelope | RampEnvelope;

// "tracking" → frequency follows the played note via the Patch's tuning.
// `{ fixed }` → frequency is held at a fixed Hz value. For one-shot
// oscillators this fixed value sweeps linearly to 0 Hz over the
// envelope duration (preserves the existing percussion behavior).
export type FrequencySpec = "tracking" | { fixed: number };

export type OscillatorSource = {
    kind: "oscillator";
    oscillatorType: OscillatorType;
    // Pulse duty cycle in (0, 1), only meaningful with
    // `oscillatorType: "square"`. When set, the oscillator plays a
    // band-limited rectangular wave of that duty via `PeriodicWave`
    // (NES-style 0.125 / 0.25 thin pulses) instead of the built-in 50%
    // square. Omit for the plain 50% square. `d` and `1 − d` have the
    // same magnitude spectrum, so 0.75 sounds identical to 0.25.
    duty?: number;
    pitch?: FrequencySpec;
};

// `filterFrequency` "tracking" maps to `tuning.frequency(noteNumber + 24)`,
// matching the current `NoisePatch` / `GainedNoisePatch` behavior.
export type NoiseSource = {
    kind: "noise";
    filterType?: BiquadFilterType;
    filterFrequency?: FrequencySpec;
    filterQ?: number;
};

export type ToneSource = OscillatorSource | NoiseSource;

export type ToneDefinition = {
    // Human-readable name (e.g. "Acoustic Grand Piano", "Bass Drum 1").
    // Carried purely as metadata for UI / debugging — the audio compile
    // pipeline ignores it.
    name?: string;
    source: ToneSource;
    envelope: Envelope;
    // If true, NoteOff is a no-op. The note ends only when expired by
    // NotePool LRU eviction or same-note re-attack.
    oneShot?: boolean;
};

export type DrumRouting = "left" | "right" | "center";

export type DrumVoiceDefinition = ToneDefinition & {
    // Routing target inside `DrumKitPatch`: "left" / "right" go through the
    // fixed -0.5 / +0.5 panners; "center" goes straight to the bus gain.
    routing?: DrumRouting;
    // SF2 exclusive class. Voices in the same group expire each other on
    // attack (a struck voice does not kill itself). 0 / undefined = no group.
    excludeGroup?: number;
};

export type DrumKitDefinition = {
    kind: "drumKit";
    name?: string;
    // Voice map keyed by drum note number (35..81 in GM). The compile
    // path normalizes string keys (from JSON round-trip) back to numbers.
    voices: Partial<Record<number, DrumVoiceDefinition>>;
    // Used for unmapped notes. If absent, the compiler falls back to a
    // short generic noise burst (matching the previous default voice).
    defaultVoice?: DrumVoiceDefinition;
    // Bus gain on the drum-kit aggregate. Default 2 matches the previous
    // hard-coded value in `DrumKitPatch`.
    busGain?: number;
};

export type PatchDefinition = ToneDefinition | DrumKitDefinition;
