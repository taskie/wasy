import { instrumentPatchs } from "../../midi/gm.js";
import type { ToneDefinition } from "../types.js";

// Per-program oscillator type. Programs not listed fall back to
// `categoryDefaults[program >> 3]` (one default per GM 8-program
// category). Verbatim from the previous in-line table in `synth.ts`.
const oscillatorTypeMap: ReadonlyMap<number, OscillatorType> = new Map([
    [0x00, "sine"],
    [0x01, "triangle"],
    [0x02, "triangle"],
    [0x03, "triangle"],
    [0x04, "triangle"],
    [0x05, "triangle"],

    [0x10, "sine"],
    [0x11, "sine"],
    [0x12, "sine"],
    [0x13, "sine"],
    [0x14, "triangle"],

    [0x1d, "sawtooth"],
    [0x1e, "sawtooth"],

    [0x30, "triangle"],
    [0x31, "triangle"],
    [0x32, "triangle"],
    [0x33, "triangle"],

    [0x51, "sawtooth"],
]);

// Per-category fallback (8 programs per GM category, 16 categories).
// Used when `oscillatorTypeMap` has no entry for the program.
const categoryDefaults: ReadonlyArray<OscillatorType> = [
    "triangle", // 0x00 Piano
    "sine", // 0x08 Chromatic Percussion
    "sine", // 0x10 Organ
    "sawtooth", // 0x18 Guitar
    "triangle", // 0x20 Bass
    "sawtooth", // 0x28 Strings
    "sawtooth", // 0x30 Ensemble
    "sawtooth", // 0x38 Brass
    "square", // 0x40 Reed
    "triangle", // 0x48 Pipe
    "sawtooth", // 0x50 Synth Lead
    "triangle", // 0x58 Synth Pad
    "sawtooth", // 0x60 Synth Effects
    "square", // 0x68 Ethnic
    "square", // 0x70 Percussive
    "sine", // 0x78 SFX
];

const defaultPatchFor = (program: number): ToneDefinition => {
    const name = instrumentPatchs[program];
    if (program === 0x77) {
        // Reverse Cymbal — slow swell of filtered noise.
        return {
            name,
            source: { kind: "noise" },
            envelope: { type: "ramp", begin: 0, end: 1, duration: 1 },
        };
    }
    if (program === 0x7e) {
        // Applause — sustained noise burst.
        return {
            name,
            source: { kind: "noise" },
            envelope: { type: "adsr", attack: 0.005, release: 0.05 },
        };
    }
    const oscillatorType = oscillatorTypeMap.get(program) ?? categoryDefaults[program >> 3];
    if (program <= 0x05) {
        // Piano family: overshoot+decay envelope (1.2 → 0.1 over 0.7 s)
        // approximates a struck-string transient + slow decay.
        return {
            name,
            source: { kind: "oscillator", oscillatorType },
            envelope: { type: "ramp", begin: 1.2, end: 0.1, duration: 0.7 },
        };
    }
    return {
        name,
        source: { kind: "oscillator", oscillatorType },
        envelope: { type: "adsr", attack: 0.005, release: 0.05 },
    };
};

export const gmPatches: ToneDefinition[] = Array.from({ length: 128 }, (_, i) =>
    defaultPatchFor(i),
);
