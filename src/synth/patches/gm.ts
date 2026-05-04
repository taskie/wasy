import type { ToneDefinition } from "../types.js";

// Chiptune-flavored GM 128 melodic patches. The oscillator palette
// (sine / square / triangle / sawtooth / noise) and envelope shapes
// are tuned by ear toward an NES / Game Boy aesthetic rather than
// literal acoustic emulation. All envelopes use the AHDSFR-extended
// `"adsr"` schema (the tag is kept for backward compat); `sustain=0`
// with a positive `decay` produces a percussive pluck, while omitting
// all of `hold` / `decay` / `sustain` / `fade` keeps the `Patch`
// defaults (hold=0, decay=0, sustain=1, fade=0) for plain held tones.
// `hold` pins the gain at peak between attack and decay (mallet
// articulation); `fade` lets a held key gradually diminish toward 0
// over the given duration so pads / long voices feel less static.
export const gmPatches: ToneDefinition[] = [
    // 0..7: Piano family — chiptune "piano" reads as a fast pluck.
    {
        name: "Acoustic Grand Piano",
        source: { kind: "oscillator", oscillatorType: "triangle" },
        envelope: { type: "adsr", attack: 0.002, decay: 0.4, sustain: 0, release: 0.08 },
    },
    {
        name: "Bright Piano",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.002, decay: 0.35, sustain: 0, release: 0.08 },
    },
    {
        name: "Electric Grand Piano",
        source: { kind: "oscillator", oscillatorType: "triangle" },
        envelope: { type: "adsr", attack: 0.002, decay: 0.5, sustain: 0, release: 0.08 },
    },
    {
        name: "Honky-tonk Piano",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.002, decay: 0.3, sustain: 0, release: 0.05 },
    },
    {
        name: "Electric Piano",
        source: { kind: "oscillator", oscillatorType: "triangle" },
        envelope: { type: "adsr", attack: 0.005, decay: 0.6, sustain: 0.2, release: 0.1 },
    },
    {
        // EP2 = brighter / more synthetic than EP1; square gives the FM-piano edge.
        name: "Electric Piano 2",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.005, decay: 0.6, sustain: 0.2, release: 0.1 },
    },
    {
        name: "Harpsichord",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.002, decay: 0.4, sustain: 0, release: 0.05 },
    },
    {
        name: "Clavi",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.002, decay: 0.25, sustain: 0, release: 0.05 },
    },

    // 8..15: Chromatic Percussion — sine bells with sharp attack and decay to silence.
    {
        name: "Celesta",
        source: { kind: "oscillator", oscillatorType: "sine" },
        envelope: { type: "adsr", attack: 0.001, decay: 0.3, sustain: 0, release: 0.1 },
    },
    {
        // Brief hold at peak before the decay → mallet "ping" articulation.
        name: "Glockenspiel",
        source: { kind: "oscillator", oscillatorType: "sine" },
        envelope: {
            type: "adsr",
            attack: 0.001,
            hold: 0.01,
            decay: 0.6,
            sustain: 0,
            release: 0.2,
        },
    },
    {
        name: "Musical box",
        source: { kind: "oscillator", oscillatorType: "sine" },
        envelope: { type: "adsr", attack: 0.001, decay: 0.4, sustain: 0, release: 0.15 },
    },
    {
        // Mallet hits the bar, sustains briefly, then resonates out.
        name: "Vibraphone",
        source: { kind: "oscillator", oscillatorType: "sine" },
        envelope: {
            type: "adsr",
            attack: 0.005,
            hold: 0.02,
            decay: 0.8,
            sustain: 0.1,
            fade: 4.0,
            release: 0.3,
        },
    },
    {
        name: "Marimba",
        source: { kind: "oscillator", oscillatorType: "triangle" },
        envelope: { type: "adsr", attack: 0.001, decay: 0.25, sustain: 0, release: 0.05 },
    },
    {
        name: "Xylophone",
        source: { kind: "oscillator", oscillatorType: "triangle" },
        envelope: { type: "adsr", attack: 0.001, decay: 0.15, sustain: 0, release: 0.04 },
    },
    {
        // Strike the tube, ring at peak briefly, then long decay to silence.
        name: "Tubular Bell",
        source: { kind: "oscillator", oscillatorType: "sine" },
        envelope: {
            type: "adsr",
            attack: 0.001,
            hold: 0.03,
            decay: 1.5,
            sustain: 0,
            release: 0.5,
        },
    },
    {
        name: "Dulcimer",
        source: { kind: "oscillator", oscillatorType: "triangle" },
        envelope: { type: "adsr", attack: 0.002, decay: 0.5, sustain: 0, release: 0.1 },
    },

    // 16..23: Organ — sustained tones (omit decay/sustain for default 0/1).
    {
        // Drawbar (Hammond) is harmonically rich; sawtooth carries that better than sine.
        name: "Drawbar Organ",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.05, release: 0.1 },
    },
    {
        // Percussive organ has the pipey edge of a tonewheel; square reads more "organy" than sine.
        name: "Percussive Organ",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.005, release: 0.05 },
    },
    {
        name: "Rock Organ",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.005, release: 0.08 },
    },
    {
        name: "Church organ",
        source: { kind: "oscillator", oscillatorType: "sine" },
        envelope: { type: "adsr", attack: 0.1, release: 0.3 },
    },
    {
        name: "Reed organ",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.05, release: 0.1 },
    },
    {
        name: "Accordion",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.02, release: 0.08 },
    },
    {
        name: "Harmonica",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.02, release: 0.08 },
    },
    {
        name: "Tango Accordion",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.02, release: 0.08 },
    },

    // 24..31: Guitar — plucked, decay to silence (overdriven/distortion sustain longer).
    {
        name: "Acoustic Guitar (nylon)",
        source: { kind: "oscillator", oscillatorType: "triangle" },
        envelope: { type: "adsr", attack: 0.002, decay: 0.5, sustain: 0, release: 0.1 },
    },
    {
        name: "Acoustic Guitar (steel)",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.002, decay: 0.5, sustain: 0, release: 0.1 },
    },
    {
        name: "Electric Guitar (jazz)",
        source: { kind: "oscillator", oscillatorType: "triangle" },
        envelope: { type: "adsr", attack: 0.002, decay: 0.6, sustain: 0.1, release: 0.1 },
    },
    {
        name: "Electric Guitar (clean)",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.002, decay: 0.5, sustain: 0.1, release: 0.1 },
    },
    {
        name: "Electric Guitar (muted)",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.002, decay: 0.1, sustain: 0, release: 0.04 },
    },
    {
        name: "Overdriven Guitar",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.005, decay: 0.1, sustain: 0.7, release: 0.1 },
    },
    {
        name: "Distortion Guitar",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.003, decay: 0.05, sustain: 0.8, release: 0.1 },
    },
    {
        name: "Guitar harmonics",
        source: { kind: "oscillator", oscillatorType: "sine" },
        envelope: { type: "adsr", attack: 0.001, decay: 0.7, sustain: 0, release: 0.2 },
    },

    // 32..39: Bass — triangle is the canonical NES bass channel.
    {
        name: "Acoustic Bass",
        source: { kind: "oscillator", oscillatorType: "triangle" },
        envelope: { type: "adsr", attack: 0.002, decay: 0.4, sustain: 0.2, release: 0.08 },
    },
    {
        name: "Electric Bass (finger)",
        source: { kind: "oscillator", oscillatorType: "triangle" },
        envelope: { type: "adsr", attack: 0.005, decay: 0.1, sustain: 0.7, release: 0.05 },
    },
    {
        name: "Electric Bass (pick)",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.002, decay: 0.15, sustain: 0.5, release: 0.05 },
    },
    {
        name: "Fretless Bass",
        source: { kind: "oscillator", oscillatorType: "triangle" },
        envelope: { type: "adsr", attack: 0.02, decay: 0.1, sustain: 0.6, release: 0.1 },
    },
    {
        name: "Slap Bass 1",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.001, decay: 0.2, sustain: 0.3, release: 0.05 },
    },
    {
        // Differentiate from Slap Bass 1; sawtooth gives the buzzier thumb-pop tone.
        name: "Slap Bass 2",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.001, decay: 0.2, sustain: 0.3, release: 0.05 },
    },
    {
        name: "Synth Bass 1",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.005, release: 0.05 },
    },
    {
        name: "Synth Bass 2",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.005, release: 0.05 },
    },

    // 40..47: Strings — sawtooth bows with slow attack; pizzicato/harp pluck.
    {
        name: "Violin",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.1, decay: 0.1, sustain: 0.8, release: 0.2 },
    },
    {
        name: "Viola",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.12, decay: 0.1, sustain: 0.8, release: 0.2 },
    },
    {
        name: "Cello",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.15, decay: 0.1, sustain: 0.8, release: 0.25 },
    },
    {
        name: "Double bass",
        source: { kind: "oscillator", oscillatorType: "triangle" },
        envelope: { type: "adsr", attack: 0.05, decay: 0.1, sustain: 0.7, release: 0.1 },
    },
    {
        // Long bow stroke: gentle fade as the stroke runs out of energy.
        name: "Tremolo Strings",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: {
            type: "adsr",
            attack: 0.15,
            decay: 0.1,
            sustain: 0.8,
            fade: 6.0,
            release: 0.3,
        },
    },
    {
        name: "Pizzicato Strings",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.002, decay: 0.2, sustain: 0, release: 0.05 },
    },
    {
        name: "Orchestral Harp",
        source: { kind: "oscillator", oscillatorType: "triangle" },
        envelope: { type: "adsr", attack: 0.002, decay: 0.6, sustain: 0, release: 0.15 },
    },
    {
        // Tuned drum boom: sine for the deep fundamental, longer decay than other percussion.
        name: "Timpani",
        source: { kind: "oscillator", oscillatorType: "sine" },
        envelope: { type: "adsr", attack: 0.001, decay: 0.8, sustain: 0, release: 0.2 },
    },

    // 48..55: Ensemble — slow string/voice pads; orchestra hit is a sharp stab.
    {
        name: "String Ensemble 1",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.2, decay: 0.1, sustain: 0.8, release: 0.4 },
    },
    {
        name: "String Ensemble 2",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.25, decay: 0.1, sustain: 0.8, release: 0.4 },
    },
    {
        name: "Synth Strings 1",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.15, decay: 0.1, sustain: 0.8, release: 0.3 },
    },
    {
        name: "Synth Strings 2",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.2, decay: 0.1, sustain: 0.8, release: 0.3 },
    },
    {
        // Fade lets a sustained chord sound like a breath running out
        // instead of holding indefinitely at constant level.
        name: "Voice Aahs",
        source: { kind: "oscillator", oscillatorType: "sine" },
        envelope: {
            type: "adsr",
            attack: 0.2,
            decay: 0.1,
            sustain: 0.85,
            fade: 12.0,
            release: 0.3,
        },
    },
    {
        name: "Voice Oohs",
        source: { kind: "oscillator", oscillatorType: "sine" },
        envelope: {
            type: "adsr",
            attack: 0.15,
            decay: 0.1,
            sustain: 0.85,
            fade: 12.0,
            release: 0.25,
        },
    },
    {
        name: "Synth Voice",
        source: { kind: "oscillator", oscillatorType: "triangle" },
        envelope: { type: "adsr", attack: 0.1, decay: 0.1, sustain: 0.85, release: 0.2 },
    },
    {
        name: "Orchestra Hit",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 },
    },

    // 56..63: Brass — square/sawtooth with a perceptible attack and full sustain.
    {
        name: "Trumpet",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.01, decay: 0.05, sustain: 0.85, release: 0.1 },
    },
    {
        name: "Trombone",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.02, decay: 0.05, sustain: 0.85, release: 0.1 },
    },
    {
        name: "Tuba",
        source: { kind: "oscillator", oscillatorType: "triangle" },
        envelope: { type: "adsr", attack: 0.02, decay: 0.05, sustain: 0.85, release: 0.1 },
    },
    {
        name: "Muted Trumpet",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.005, decay: 0.05, sustain: 0.7, release: 0.05 },
    },
    {
        name: "French horn",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.05, decay: 0.05, sustain: 0.85, release: 0.15 },
    },
    {
        name: "Brass Section",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.02, decay: 0.05, sustain: 0.85, release: 0.1 },
    },
    {
        name: "Synth Brass 1",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.01, release: 0.08 },
    },
    {
        name: "Synth Brass 2",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.02, release: 0.08 },
    },

    // 64..71: Reed — square reads as nasal reed in chiptune; bassoon uses triangle.
    {
        name: "Soprano Sax",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.03, decay: 0.05, sustain: 0.85, release: 0.1 },
    },
    {
        name: "Alto Sax",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.03, decay: 0.05, sustain: 0.85, release: 0.1 },
    },
    {
        name: "Tenor Sax",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.03, decay: 0.05, sustain: 0.85, release: 0.1 },
    },
    {
        name: "Baritone Sax",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.04, decay: 0.05, sustain: 0.85, release: 0.12 },
    },
    {
        name: "Oboe",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.02, release: 0.08 },
    },
    {
        name: "English Horn",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.02, release: 0.08 },
    },
    {
        name: "Bassoon",
        source: { kind: "oscillator", oscillatorType: "triangle" },
        envelope: { type: "adsr", attack: 0.03, release: 0.1 },
    },
    {
        name: "Clarinet",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.02, release: 0.08 },
    },

    // 72..79: Pipe — soft sustained tones; sine for pure breath, triangle for flutey.
    {
        name: "Piccolo",
        source: { kind: "oscillator", oscillatorType: "triangle" },
        envelope: { type: "adsr", attack: 0.02, release: 0.08 },
    },
    {
        name: "Flute",
        source: { kind: "oscillator", oscillatorType: "triangle" },
        envelope: { type: "adsr", attack: 0.03, release: 0.1 },
    },
    {
        name: "Recorder",
        source: { kind: "oscillator", oscillatorType: "sine" },
        envelope: { type: "adsr", attack: 0.03, release: 0.1 },
    },
    {
        name: "Pan Flute",
        source: { kind: "oscillator", oscillatorType: "sine" },
        envelope: { type: "adsr", attack: 0.05, release: 0.15 },
    },
    {
        name: "Blown Bottle",
        source: { kind: "oscillator", oscillatorType: "sine" },
        envelope: { type: "adsr", attack: 0.08, release: 0.15 },
    },
    {
        name: "Shakuhachi",
        source: { kind: "oscillator", oscillatorType: "sine" },
        envelope: { type: "adsr", attack: 0.08, release: 0.15 },
    },
    {
        name: "Whistle",
        source: { kind: "oscillator", oscillatorType: "sine" },
        envelope: { type: "adsr", attack: 0.02, release: 0.08 },
    },
    {
        name: "Ocarina",
        source: { kind: "oscillator", oscillatorType: "sine" },
        envelope: { type: "adsr", attack: 0.02, release: 0.08 },
    },

    // 80..87: Synth Lead — fast leads with full sustain.
    {
        name: "Lead 1 (square)",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.005, release: 0.05 },
    },
    {
        name: "Lead 2 (sawtooth)",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.005, release: 0.05 },
    },
    {
        name: "Lead 3 (calliope)",
        source: { kind: "oscillator", oscillatorType: "triangle" },
        envelope: { type: "adsr", attack: 0.05, release: 0.1 },
    },
    {
        name: "Lead 4 (chiff)",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.001, decay: 0.05, sustain: 0.7, release: 0.05 },
    },
    {
        name: "Lead 5 (charang)",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.005, release: 0.05 },
    },
    {
        name: "Lead 6 (voice)",
        source: { kind: "oscillator", oscillatorType: "sine" },
        envelope: { type: "adsr", attack: 0.05, release: 0.15 },
    },
    {
        name: "Lead 7 (fifths)",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.005, release: 0.05 },
    },
    {
        name: "Lead 8 (bass + lead)",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.005, release: 0.05 },
    },

    // 88..95: Synth Pad — long attack/release washes. `fade` slowly
    // dims the held key so the pad evolves rather than droning at a flat
    // level for the whole note.
    {
        name: "Pad 1 (Fantasia)",
        source: { kind: "oscillator", oscillatorType: "triangle" },
        envelope: { type: "adsr", attack: 0.5, fade: 8.0, release: 0.8 },
    },
    {
        name: "Pad 2 (warm)",
        source: { kind: "oscillator", oscillatorType: "triangle" },
        envelope: { type: "adsr", attack: 0.4, fade: 10.0, release: 0.7 },
    },
    {
        name: "Pad 3 (polysynth)",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.3, fade: 8.0, release: 0.6 },
    },
    {
        name: "Pad 4 (choir)",
        source: { kind: "oscillator", oscillatorType: "sine" },
        envelope: { type: "adsr", attack: 0.5, fade: 12.0, release: 1.0 },
    },
    {
        name: "Pad 5 (bowed)",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.6, fade: 10.0, release: 0.8 },
    },
    {
        name: "Pad 6 (metallic)",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.4, fade: 6.0, release: 0.6 },
    },
    {
        name: "Pad 7 (halo)",
        source: { kind: "oscillator", oscillatorType: "sine" },
        envelope: { type: "adsr", attack: 0.7, fade: 12.0, release: 1.0 },
    },
    {
        // Sweep: shorter fade gives the characteristic "dies out" arc.
        name: "Pad 8 (sweep)",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.5, fade: 5.0, release: 1.2 },
    },

    // 96..103: FX — atmospheric textures; FX 1 is a noise-based rain wash, FX 3 is a bell pluck.
    {
        // Rain literally is filtered noise; tracking filter gives per-key
        // timbre variation, fade lets the shower naturally subside.
        name: "FX 1 (rain)",
        source: { kind: "noise" },
        envelope: { type: "adsr", attack: 0.3, fade: 8.0, release: 0.5 },
    },
    {
        name: "FX 2 (soundtrack)",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.4, fade: 10.0, release: 0.8 },
    },
    {
        name: "FX 3 (crystal)",
        source: { kind: "oscillator", oscillatorType: "sine" },
        envelope: { type: "adsr", attack: 0.001, decay: 1.2, sustain: 0, release: 0.4 },
    },
    {
        name: "FX 4 (atmosphere)",
        source: { kind: "oscillator", oscillatorType: "triangle" },
        envelope: { type: "adsr", attack: 0.4, fade: 12.0, release: 0.8 },
    },
    {
        name: "FX 5 (brightness)",
        source: { kind: "oscillator", oscillatorType: "sine" },
        envelope: { type: "adsr", attack: 0.3, fade: 8.0, release: 0.6 },
    },
    {
        name: "FX 6 (goblins)",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.2, release: 0.5 },
    },
    {
        name: "FX 7 (echoes)",
        source: { kind: "oscillator", oscillatorType: "sine" },
        envelope: { type: "adsr", attack: 0.4, fade: 10.0, release: 0.8 },
    },
    {
        name: "FX 8 (sci-fi)",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.3, fade: 8.0, release: 0.6 },
    },

    // 104..111: Ethnic — plucks (sitar/banjo/shamisen/koto/kalimba) plus sustained reeds.
    {
        name: "Sitar",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.005, decay: 0.6, sustain: 0.1, release: 0.2 },
    },
    {
        name: "Banjo",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.001, decay: 0.3, sustain: 0, release: 0.05 },
    },
    {
        name: "Shamisen",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.001, decay: 0.4, sustain: 0, release: 0.08 },
    },
    {
        name: "Koto",
        source: { kind: "oscillator", oscillatorType: "triangle" },
        envelope: { type: "adsr", attack: 0.001, decay: 0.6, sustain: 0, release: 0.15 },
    },
    {
        name: "Kalimba",
        source: { kind: "oscillator", oscillatorType: "sine" },
        envelope: { type: "adsr", attack: 0.001, decay: 0.3, sustain: 0, release: 0.08 },
    },
    {
        name: "Bagpipe",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.05, release: 0.1 },
    },
    {
        name: "Fiddle",
        source: { kind: "oscillator", oscillatorType: "sawtooth" },
        envelope: { type: "adsr", attack: 0.08, decay: 0.1, sustain: 0.85, release: 0.15 },
    },
    {
        name: "Shanai",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.03, release: 0.1 },
    },

    // 112..119: Percussive — pitched percussion + reverse cymbal swell on noise.
    {
        // Brief hold reinforces the bell-strike attack.
        name: "Tinkle Bell",
        source: { kind: "oscillator", oscillatorType: "sine" },
        envelope: {
            type: "adsr",
            attack: 0.001,
            hold: 0.015,
            decay: 0.8,
            sustain: 0,
            release: 0.3,
        },
    },
    {
        // Agogo is metallic Latin percussion; triangle reads brighter than a pure sine ping.
        name: "Agogo",
        source: { kind: "oscillator", oscillatorType: "triangle" },
        envelope: { type: "adsr", attack: 0.001, decay: 0.3, sustain: 0, release: 0.08 },
    },
    {
        name: "Steel Drums",
        source: { kind: "oscillator", oscillatorType: "triangle" },
        envelope: { type: "adsr", attack: 0.001, decay: 0.5, sustain: 0, release: 0.1 },
    },
    {
        name: "Woodblock",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.001, decay: 0.05, sustain: 0, release: 0.02 },
    },
    {
        // Taiko is a deep boom; sine carries the low fundamental better than triangle.
        name: "Taiko Drum",
        source: { kind: "oscillator", oscillatorType: "sine" },
        envelope: { type: "adsr", attack: 0.001, decay: 0.3, sustain: 0, release: 0.08 },
    },
    {
        name: "Melodic Tom",
        source: { kind: "oscillator", oscillatorType: "triangle" },
        envelope: { type: "adsr", attack: 0.001, decay: 0.4, sustain: 0, release: 0.1 },
    },
    {
        name: "Synth Drum",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.001, decay: 0.25, sustain: 0, release: 0.05 },
    },
    {
        // Reverse Cymbal: long-attack noise swell. Brief hold at peak so
        // the swell lands deliberately before NoteOff cuts it.
        name: "Reverse Cymbal",
        source: { kind: "noise" },
        envelope: { type: "adsr", attack: 1.0, hold: 0.1, release: 0.05 },
    },

    // 120..127: SFX — mostly noise; Bird Tweet and Telephone Ring stay tonal.
    {
        name: "Guitar Fret Noise",
        source: { kind: "noise" },
        envelope: { type: "adsr", attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 },
    },
    {
        name: "Breath Noise",
        source: { kind: "noise" },
        envelope: { type: "adsr", attack: 0.05, release: 0.1 },
    },
    {
        // Tide swells in over half a second, then slowly recedes while held.
        name: "Seashore",
        source: { kind: "noise" },
        envelope: { type: "adsr", attack: 0.5, fade: 15.0, release: 0.5 },
    },
    {
        name: "Bird Tweet",
        source: { kind: "oscillator", oscillatorType: "sine" },
        envelope: { type: "adsr", attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 },
    },
    {
        name: "Telephone Ring",
        source: { kind: "oscillator", oscillatorType: "square" },
        envelope: { type: "adsr", attack: 0.001, release: 0.05 },
    },
    {
        name: "Helicopter",
        source: { kind: "noise" },
        envelope: { type: "adsr", attack: 0.1, release: 0.2 },
    },
    {
        name: "Applause",
        source: { kind: "noise" },
        envelope: { type: "adsr", attack: 0.005, release: 0.05 },
    },
    {
        name: "Gunshot",
        source: { kind: "noise" },
        envelope: { type: "adsr", attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 },
    },
];
