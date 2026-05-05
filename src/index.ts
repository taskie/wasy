import * as wasy from "./wasy.js";
import * as midiIn from "./webmidi/midi-in.js";
import * as midi from "./midi/event.js";
import * as smf from "./smf.js";
import * as smfAnalyze from "./smf-analyze.js";

export { wasy, midiIn, midi, smf, smfAnalyze };

export { Wasy } from "./wasy.js";
export type { TimedEvent } from "./wasy.js";
export { SmfPlayer } from "./smf-player.js";
export { SynthEngine, isDrumChannel } from "./synth-engine.js";
export { Instrument } from "./midi/instrument.js";
export { instrumentPatchs, percussionKeyMap } from "./midi/gm.js";
export type { Monophony, Patch } from "./synth/patch.js";
export { compileTone, compileDrumKit } from "./synth/compile.js";
export type {
    AdsrEnvelope,
    DrumKitDefinition,
    DrumRouting,
    DrumVoiceDefinition,
    Envelope,
    FrequencySpec,
    NoiseSource,
    OscillatorSource,
    PatchDefinition,
    RampEnvelope,
    ToneDefinition,
    ToneSource,
} from "./synth/types.js";
export type {
    Note,
    SongMetadata,
    SongInfo,
    TempoChange,
    TimeSignatureChange,
} from "./smf-analyze.js";
