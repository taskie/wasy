import * as inst from "../midi/instrument.js";
import { compileDrumKit, compileTone } from "./compile.js";
import { Monophony, Patch } from "./patch.js";
import { gmDrumKit } from "./patches/gm-drum-kit.js";
import { gmPatches } from "./patches/gm.js";

export const generatePatch = (
    instrument: inst.Instrument<Monophony>,
    program: number,
    isDrum = false,
): Patch<Monophony> => {
    if (isDrum) return compileDrumKit(instrument, gmDrumKit);
    const def = gmPatches[program] ?? gmPatches[0];
    return compileTone(instrument, def);
};
