import type { DrumKitDefinition } from "../types.js";

// GM Standard Kit. Voices 35..81 cover the full GM percussion key map.
// Hi-hats (42 / 44 / 46), samba whistles (71 / 72), guiros (73 / 74),
// cuicas (78 / 79) and triangles (80 / 81) share SF2-style exclude
// groups so the closed / muted variant cuts off the open / sustained
// one (matching the SF2 "exclusive class" convention).
//
// Pitched percussion uses `pitch: { fixed }` on a one-shot oscillator;
// `OneShotOscillatorPatch` sweeps the fixed frequency linearly to 0 Hz
// over the envelope duration, which gives the canonical chiptune
// "boom" / "ping" shape (the sweep, not the waveform, dominates short
// transients). Noise voices use a fixed bandpass filter to color the
// noise (cymbals high, snares mid, kicks would be low if any).
export const gmDrumKit: DrumKitDefinition = {
    kind: "drumKit",
    name: "Standard Kit",
    busGain: 2,
    defaultVoice: {
        // Generic short noise burst for unmapped drum keys.
        source: { kind: "noise" },
        envelope: { type: "ramp", begin: 1, end: 0, duration: 0.05 },
        oneShot: true,
    },
    voices: {
        35: {
            name: "Bass Drum 2",
            source: { kind: "oscillator", oscillatorType: "sine", pitch: { fixed: 140 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.2 },
            oneShot: true,
            routing: "center",
        },
        36: {
            name: "Bass Drum 1",
            source: { kind: "oscillator", oscillatorType: "square", pitch: { fixed: 150 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.2 },
            oneShot: true,
            routing: "center",
        },
        37: {
            name: "Side Stick",
            source: { kind: "noise", filterFrequency: { fixed: 2000 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.1 },
            oneShot: true,
            routing: "center",
        },
        38: {
            name: "Snare Drum 1",
            source: { kind: "noise", filterFrequency: { fixed: 1000 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.3 },
            oneShot: true,
            routing: "center",
        },
        39: {
            name: "Hand Clap",
            source: { kind: "noise", filterFrequency: { fixed: 2000 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.25 },
            oneShot: true,
            routing: "center",
        },
        40: {
            name: "Snare Drum 2",
            source: { kind: "noise", filterFrequency: { fixed: 1500 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.5 },
            oneShot: true,
            routing: "center",
        },
        41: {
            name: "Low Tom 2",
            source: { kind: "oscillator", oscillatorType: "sine", pitch: { fixed: 200 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.3 },
            oneShot: true,
            routing: "right",
        },
        42: {
            name: "Closed Hi-hat",
            source: { kind: "noise", filterFrequency: { fixed: 6000 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.1 },
            oneShot: true,
            routing: "left",
            excludeGroup: 1,
        },
        43: {
            name: "Low Tom 1",
            source: { kind: "oscillator", oscillatorType: "sine", pitch: { fixed: 250 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.3 },
            oneShot: true,
            routing: "right",
        },
        44: {
            name: "Pedal Hi-hat",
            source: { kind: "noise", filterFrequency: { fixed: 5000 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.1 },
            oneShot: true,
            routing: "left",
            excludeGroup: 1,
        },
        45: {
            name: "Mid Tom 2",
            source: { kind: "oscillator", oscillatorType: "sine", pitch: { fixed: 350 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.3 },
            oneShot: true,
            routing: "right",
        },
        46: {
            name: "Open Hi-hat",
            source: { kind: "noise", filterFrequency: { fixed: 6000 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.3 },
            oneShot: true,
            routing: "left",
            excludeGroup: 1,
        },
        47: {
            name: "Mid Tom 1",
            source: { kind: "oscillator", oscillatorType: "sine", pitch: { fixed: 400 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.3 },
            oneShot: true,
            routing: "right",
        },
        48: {
            name: "High Tom 2",
            source: { kind: "oscillator", oscillatorType: "sine", pitch: { fixed: 500 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.3 },
            oneShot: true,
            routing: "right",
        },
        49: {
            name: "Crash Cymbal 1",
            source: { kind: "noise", filterFrequency: { fixed: 8000 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 1.5 },
            oneShot: true,
            routing: "center",
        },
        50: {
            name: "High Tom 1",
            source: { kind: "oscillator", oscillatorType: "sine", pitch: { fixed: 550 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.3 },
            oneShot: true,
            routing: "right",
        },
        51: {
            name: "Ride Cymbal 1",
            source: { kind: "noise", filterFrequency: { fixed: 16000 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.5 },
            oneShot: true,
            routing: "center",
        },

        // 52..59: cymbals + Latin metals.
        52: {
            // China-type cymbal: trashier, shorter than the main crash.
            name: "Chinese Cymbal",
            source: { kind: "noise", filterFrequency: { fixed: 5000 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.8 },
            oneShot: true,
            routing: "left",
        },
        53: {
            // Bell of the ride — clear pitched ping rather than wash.
            name: "Ride Bell",
            source: { kind: "oscillator", oscillatorType: "triangle", pitch: { fixed: 1500 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.4 },
            oneShot: true,
            routing: "center",
        },
        54: {
            name: "Tambourine",
            source: { kind: "noise", filterFrequency: { fixed: 8000 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.2 },
            oneShot: true,
            routing: "right",
        },
        55: {
            // Smaller, splashier than crash 1.
            name: "Splash Cymbal",
            source: { kind: "noise", filterFrequency: { fixed: 9000 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.4 },
            oneShot: true,
            routing: "left",
        },
        56: {
            // Cowbell: hard metallic clank, square + sweep gives the right edge.
            name: "Cowbell",
            source: { kind: "oscillator", oscillatorType: "square", pitch: { fixed: 800 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.15 },
            oneShot: true,
            routing: "center",
        },
        57: {
            // Mirror of crash 1, panned to the opposite side.
            name: "Crash Cymbal 2",
            source: { kind: "noise", filterFrequency: { fixed: 7000 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 1.2 },
            oneShot: true,
            routing: "right",
        },
        58: {
            // Wood-and-spring rattle: noisy mid-frequency burst.
            name: "Vibra Slap",
            source: { kind: "noise", filterFrequency: { fixed: 3000 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.3 },
            oneShot: true,
            routing: "right",
        },
        59: {
            // Mirror of ride 1 panned right.
            name: "Ride Cymbal 2",
            source: { kind: "noise", filterFrequency: { fixed: 14000 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.5 },
            oneShot: true,
            routing: "right",
        },

        // 60..66: hand drums (bongos / congas / timbales).
        60: {
            name: "High Bongo",
            source: { kind: "oscillator", oscillatorType: "triangle", pitch: { fixed: 250 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.15 },
            oneShot: true,
            routing: "right",
        },
        61: {
            name: "Low Bongo",
            source: { kind: "oscillator", oscillatorType: "triangle", pitch: { fixed: 180 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.15 },
            oneShot: true,
            routing: "right",
        },
        62: {
            // Muted slap on the high conga: very short.
            name: "Mute High Conga",
            source: { kind: "oscillator", oscillatorType: "triangle", pitch: { fixed: 320 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.1 },
            oneShot: true,
            routing: "right",
        },
        63: {
            // Open hit on the high conga: longer ring than mute.
            name: "Open High Conga",
            source: { kind: "oscillator", oscillatorType: "triangle", pitch: { fixed: 280 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.2 },
            oneShot: true,
            routing: "right",
        },
        64: {
            name: "Low Conga",
            source: { kind: "oscillator", oscillatorType: "triangle", pitch: { fixed: 180 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.2 },
            oneShot: true,
            routing: "right",
        },
        65: {
            // Timbale: metallic shell, brighter than congas; sine carries the pitch cleanly.
            name: "High Timbale",
            source: { kind: "oscillator", oscillatorType: "sine", pitch: { fixed: 400 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.15 },
            oneShot: true,
            routing: "right",
        },
        66: {
            name: "Low Timbale",
            source: { kind: "oscillator", oscillatorType: "sine", pitch: { fixed: 280 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.2 },
            oneShot: true,
            routing: "right",
        },

        // 67..70: small Latin metal / shakers.
        67: {
            // Agogo bells: bright metallic ping.
            name: "High Agogo",
            source: { kind: "oscillator", oscillatorType: "sine", pitch: { fixed: 1200 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.15 },
            oneShot: true,
            routing: "center",
        },
        68: {
            name: "Low Agogo",
            source: { kind: "oscillator", oscillatorType: "sine", pitch: { fixed: 1000 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.15 },
            oneShot: true,
            routing: "center",
        },
        69: {
            // Cabasa: dry beaded shaker.
            name: "Cabasa",
            source: { kind: "noise", filterFrequency: { fixed: 6000 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.1 },
            oneShot: true,
            routing: "right",
        },
        70: {
            // Maracas: slightly softer / lower than cabasa.
            name: "Maracas",
            source: { kind: "noise", filterFrequency: { fixed: 5000 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.1 },
            oneShot: true,
            routing: "right",
        },

        // 71..72: samba whistle pair — sweep-down sine reads as a tonal whistle.
        // Short cuts off long (group 2).
        71: {
            name: "Short Whistle",
            source: { kind: "oscillator", oscillatorType: "sine", pitch: { fixed: 2500 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.2 },
            oneShot: true,
            routing: "center",
            excludeGroup: 2,
        },
        72: {
            name: "Long Whistle",
            source: { kind: "oscillator", oscillatorType: "sine", pitch: { fixed: 2500 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.6 },
            oneShot: true,
            routing: "center",
            excludeGroup: 2,
        },

        // 73..74: guiro pair — scraped wood, noise burst.
        // Short cuts off long (group 3).
        73: {
            name: "Short Guiro",
            source: { kind: "noise", filterFrequency: { fixed: 4000 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.15 },
            oneShot: true,
            routing: "right",
            excludeGroup: 3,
        },
        74: {
            name: "Long Guiro",
            source: { kind: "noise", filterFrequency: { fixed: 4000 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.4 },
            oneShot: true,
            routing: "right",
            excludeGroup: 3,
        },

        // 75..77: wooden percussion (claves, wood blocks).
        75: {
            // Claves: hard wood click.
            name: "Claves",
            source: { kind: "oscillator", oscillatorType: "square", pitch: { fixed: 2500 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.05 },
            oneShot: true,
            routing: "center",
        },
        76: {
            name: "High Wood Block",
            source: { kind: "oscillator", oscillatorType: "square", pitch: { fixed: 1200 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.08 },
            oneShot: true,
            routing: "center",
        },
        77: {
            name: "Low Wood Block",
            source: { kind: "oscillator", oscillatorType: "square", pitch: { fixed: 900 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.08 },
            oneShot: true,
            routing: "center",
        },

        // 78..79: cuica friction drum — pitch sweep approximates the talking-drum bend.
        // Mute cuts off open (group 4).
        78: {
            name: "Mute Cuica",
            source: { kind: "oscillator", oscillatorType: "triangle", pitch: { fixed: 700 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.1 },
            oneShot: true,
            routing: "right",
            excludeGroup: 4,
        },
        79: {
            name: "Open Cuica",
            source: { kind: "oscillator", oscillatorType: "triangle", pitch: { fixed: 500 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.25 },
            oneShot: true,
            routing: "right",
            excludeGroup: 4,
        },

        // 80..81: orchestral triangle — high sine ping with a tail.
        // Mute cuts off open (group 5).
        80: {
            name: "Mute Triangle",
            source: { kind: "oscillator", oscillatorType: "sine", pitch: { fixed: 5000 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.1 },
            oneShot: true,
            routing: "center",
            excludeGroup: 5,
        },
        81: {
            name: "Open Triangle",
            source: { kind: "oscillator", oscillatorType: "sine", pitch: { fixed: 5000 } },
            envelope: { type: "ramp", begin: 1, end: 0, duration: 0.4 },
            oneShot: true,
            routing: "center",
            excludeGroup: 5,
        },
    },
};
