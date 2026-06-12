import * as inst from "../midi/instrument.js";
import {
    DrumKitPatch,
    GainedNoisePatch,
    GainedOscillatorPatch,
    NoisePatch,
    OneShotNoisePatch,
    OneShotOscillatorPatch,
    SimpleOscillatorPatch,
} from "../synth.js";
import { Monophony, Patch } from "./patch.js";
import type {
    DrumKitDefinition,
    DrumVoiceDefinition,
    NoiseSource,
    OscillatorSource,
    ToneDefinition,
} from "./types.js";

const fixedFrequencyOf = (spec: { fixed: number } | "tracking" | undefined): number | undefined => {
    if (spec == null || spec === "tracking") return undefined;
    return spec.fixed;
};

// Apply non-default AHDSFR fields onto a patch so callers can leave
// `hold` / `decay` / `sustain` / `fade` undefined and inherit `Patch`'s
// defaults (5 ms / 0 / 0 / 1 / 0 / 50 ms — see `synth/patch.ts`). The
// type alias / discriminator stay named "adsr" for backward compat;
// hold / fade are optional extensions over the classic envelope.
const applyAdsrOverrides = (
    patch: Patch<Monophony>,
    envelope: {
        attack: number;
        hold?: number;
        decay?: number;
        sustain?: number;
        fade?: number;
        release: number;
    },
) => {
    patch.attackTime = envelope.attack;
    patch.releaseTime = envelope.release;
    if (envelope.hold !== undefined) patch.holdTime = envelope.hold;
    if (envelope.decay !== undefined) patch.decayTime = envelope.decay;
    if (envelope.sustain !== undefined) patch.sustainLevel = envelope.sustain;
    if (envelope.fade !== undefined) patch.fadeTime = envelope.fade;
};

const compileOscillatorTone = (
    instrument: inst.Instrument<Monophony>,
    source: OscillatorSource,
    def: ToneDefinition,
    destination?: AudioNode,
): Patch<Monophony> => {
    const oscillatorType = source.oscillatorType;
    const env = def.envelope;
    const fixed =
        source.pitch != null && source.pitch !== "tracking" ? source.pitch.fixed : undefined;
    if (env.type === "adsr") {
        if (def.oneShot) {
            throw new Error("compileTone: ADSR + oneShot is not supported");
        }
        const patch = new SimpleOscillatorPatch(instrument, oscillatorType, destination);
        patch.duty = source.duty;
        applyAdsrOverrides(patch, env);
        return patch;
    }
    if (def.oneShot) {
        const patch = new OneShotOscillatorPatch(
            instrument,
            env.duration,
            fixed,
            oscillatorType,
            destination,
            env.begin,
            env.end,
        );
        patch.duty = source.duty;
        return patch;
    }
    const patch = new GainedOscillatorPatch(
        instrument,
        env.begin,
        env.end,
        env.duration,
        oscillatorType,
        destination,
    );
    patch.duty = source.duty;
    return patch;
};

const compileNoiseTone = (
    instrument: inst.Instrument<Monophony>,
    source: NoiseSource,
    def: ToneDefinition,
    destination?: AudioNode,
): Patch<Monophony> => {
    const env = def.envelope;
    const fixedFreq = fixedFrequencyOf(source.filterFrequency);
    if (env.type === "adsr") {
        if (def.oneShot) {
            throw new Error("compileTone: ADSR + oneShot is not supported");
        }
        // `NoisePatch` doesn't support `fixedFrequency`; the ramp envelope
        // path through `GainedNoisePatch` is the only way to set one today.
        const patch = new NoisePatch(instrument, destination);
        applyAdsrOverrides(patch, env);
        return patch;
    }
    if (def.oneShot) {
        return new OneShotNoisePatch(
            instrument,
            env.begin,
            env.end,
            env.duration,
            fixedFreq,
            destination,
        );
    }
    return new GainedNoisePatch(
        instrument,
        env.begin,
        env.end,
        env.duration,
        fixedFreq,
        destination,
    );
};

export const compileTone = (
    instrument: inst.Instrument<Monophony>,
    def: ToneDefinition,
    destination?: AudioNode,
): Patch<Monophony> => {
    if (def.source.kind === "oscillator") {
        return compileOscillatorTone(instrument, def.source, def, destination);
    }
    return compileNoiseTone(instrument, def.source, def, destination);
};

const isValidDrumNote = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= 127;

export const compileDrumKit = (
    instrument: inst.Instrument<Monophony>,
    def: DrumKitDefinition,
    destination?: AudioNode,
): DrumKitPatch => {
    const kit = new DrumKitPatch(instrument, destination);
    if (def.busGain !== undefined) {
        kit.gain.gain.value = def.busGain;
    }
    const routingDestination = (voice: DrumVoiceDefinition): AudioNode => {
        switch (voice.routing) {
            case "left":
                return kit.leftPanpot;
            case "right":
                return kit.rightPanpot;
            case "center":
            default:
                return kit.gain;
        }
    };
    for (const [rawKey, voice] of Object.entries(def.voices)) {
        if (voice == null) continue;
        const key = Number(rawKey);
        if (!isValidDrumNote(key)) continue;
        kit.patchMap[key] = compileTone(instrument, voice, routingDestination(voice));
        if (voice.excludeGroup != null && voice.excludeGroup !== 0) {
            let members = kit.excludeGroups.get(voice.excludeGroup);
            if (members == null) {
                members = new Set();
                kit.excludeGroups.set(voice.excludeGroup, members);
            }
            members.add(key);
        }
    }
    if (def.defaultVoice != null) {
        kit.patchMap[0] = compileTone(
            instrument,
            def.defaultVoice,
            routingDestination(def.defaultVoice),
        );
    } else if (kit.patchMap[0] == null) {
        // Backwards-compatible default voice (matches the previous
        // hard-coded fallback in `DrumKitPatch`).
        kit.patchMap[0] = new OneShotNoisePatch(instrument, 1, 0, 0.05, undefined, kit.gain);
    }
    return kit;
};
