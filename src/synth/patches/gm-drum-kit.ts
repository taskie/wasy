import { percussionKeyMap } from "../../midi/gm.js";
import type { DrumKitDefinition, DrumVoiceDefinition } from "../types.js";

// Helper to keep voice literals compact while still attaching the
// canonical GM drum-key name as metadata.
const voice = (note: number, body: Omit<DrumVoiceDefinition, "name">): DrumVoiceDefinition => ({
	name: percussionKeyMap[note],
	...body,
});

// GM Standard Kit. Voices 35..51 reproduce the parameters previously
// hard-coded in `DrumKitPatch.patchMap`. Hi-hats (42 / 44 / 46) share
// `excludeGroup: 1` so they cut each other off, matching SF2 exclusive
// class semantics (and replacing the prior hard-coded `[42, 44, 46]`
// special case).
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
		35: voice(35, { source: { kind: "oscillator", oscillatorType: "sine",   pitch: { fixed: 140 } }, envelope: { type: "ramp", begin: 1, end: 0, duration: 0.2 }, oneShot: true, routing: "center" }),
		36: voice(36, { source: { kind: "oscillator", oscillatorType: "square", pitch: { fixed: 150 } }, envelope: { type: "ramp", begin: 1, end: 0, duration: 0.2 }, oneShot: true, routing: "center" }),
		37: voice(37, { source: { kind: "noise", filterFrequency: { fixed: 2000 } },  envelope: { type: "ramp", begin: 1, end: 0, duration: 0.1  }, oneShot: true, routing: "center" }),
		38: voice(38, { source: { kind: "noise", filterFrequency: { fixed: 1000 } },  envelope: { type: "ramp", begin: 1, end: 0, duration: 0.3  }, oneShot: true, routing: "center" }),
		39: voice(39, { source: { kind: "noise", filterFrequency: { fixed: 2000 } },  envelope: { type: "ramp", begin: 1, end: 0, duration: 0.25 }, oneShot: true, routing: "center" }),
		40: voice(40, { source: { kind: "noise", filterFrequency: { fixed: 1500 } },  envelope: { type: "ramp", begin: 1, end: 0, duration: 0.5  }, oneShot: true, routing: "center" }),
		41: voice(41, { source: { kind: "oscillator", oscillatorType: "sine",   pitch: { fixed: 200 } }, envelope: { type: "ramp", begin: 1, end: 0, duration: 0.3 }, oneShot: true, routing: "right"  }),
		42: voice(42, { source: { kind: "noise", filterFrequency: { fixed: 6000 } },  envelope: { type: "ramp", begin: 1, end: 0, duration: 0.1  }, oneShot: true, routing: "left",   excludeGroup: 1 }),
		43: voice(43, { source: { kind: "oscillator", oscillatorType: "sine",   pitch: { fixed: 250 } }, envelope: { type: "ramp", begin: 1, end: 0, duration: 0.3 }, oneShot: true, routing: "right"  }),
		44: voice(44, { source: { kind: "noise", filterFrequency: { fixed: 5000 } },  envelope: { type: "ramp", begin: 1, end: 0, duration: 0.1  }, oneShot: true, routing: "left",   excludeGroup: 1 }),
		45: voice(45, { source: { kind: "oscillator", oscillatorType: "sine",   pitch: { fixed: 350 } }, envelope: { type: "ramp", begin: 1, end: 0, duration: 0.3 }, oneShot: true, routing: "right"  }),
		46: voice(46, { source: { kind: "noise", filterFrequency: { fixed: 6000 } },  envelope: { type: "ramp", begin: 1, end: 0, duration: 0.3  }, oneShot: true, routing: "left",   excludeGroup: 1 }),
		47: voice(47, { source: { kind: "oscillator", oscillatorType: "sine",   pitch: { fixed: 400 } }, envelope: { type: "ramp", begin: 1, end: 0, duration: 0.3 }, oneShot: true, routing: "right"  }),
		48: voice(48, { source: { kind: "oscillator", oscillatorType: "sine",   pitch: { fixed: 500 } }, envelope: { type: "ramp", begin: 1, end: 0, duration: 0.3 }, oneShot: true, routing: "right"  }),
		49: voice(49, { source: { kind: "noise", filterFrequency: { fixed: 8000 } },  envelope: { type: "ramp", begin: 1, end: 0, duration: 1.5  }, oneShot: true, routing: "center" }),
		50: voice(50, { source: { kind: "oscillator", oscillatorType: "sine",   pitch: { fixed: 550 } }, envelope: { type: "ramp", begin: 1, end: 0, duration: 0.3 }, oneShot: true, routing: "right"  }),
		51: voice(51, { source: { kind: "noise", filterFrequency: { fixed: 16000 } }, envelope: { type: "ramp", begin: 1, end: 0, duration: 0.5  }, oneShot: true, routing: "center" }),
	},
};
