import * as midi from "./midi/event.js";
import * as inst from "./midi/instrument.js";
import { generatePatch } from "./synth.js";
import { Monophony } from "./synth/patch.js";

// GM2 / GS bank convention:
//   Bank MSB 0x78 → rhythm part (drum kit) on any channel
//   Bank MSB 0x79 → melody part (normal instrument), overrides ch 9 default
// Otherwise channel 9 is the drum part by GM convention.
export const isDrumChannel = (channel: number, bankMSB: number) => {
    if (bankMSB === 0x78) return true;
    if (bankMSB === 0x79) return false;
    return channel === 9;
};

// GS Reset (Roland SC-55 / SC-88 family).
//   F0 41 10 42 12 40 00 7F 00 41 F7
// Bytes after the 0xF0 status: manufacturer 0x41 (Roland), device 0x10,
// model 0x42 (GS), command 0x12 (DT1 / data set), address 0x40 0x00 0x7F,
// data 0x00, checksum 0x41, end-of-exclusive 0xF7.
const GS_RESET = [0x41, 0x10, 0x42, 0x12, 0x40, 0x00, 0x7f, 0x00, 0x41, 0xf7] as const;
// XG System On (Yamaha MU series).
//   F0 43 10 4C 00 00 7E 00 F7
// Manufacturer 0x43 (Yamaha), device 0x10, model 0x4C (XG), address
// 0x00 0x00 0x7E, data 0x00, end-of-exclusive 0xF7.
const XG_RESET = [0x43, 0x10, 0x4c, 0x00, 0x00, 0x7e, 0x00, 0xf7] as const;

// SystemExclusiveEvent.dataView contents differ by source:
//   - SMF parser:    [varlen-length, ...body...]   (status 0xF0 already consumed)
//   - Web MIDI:      [...body...]                  (event.data.slice(1) effectively)
// Both reset patterns are < 128 bytes so the SMF varlen prefix is exactly
// one byte. We try matching at offset 0 (Web MIDI) and offset 1 (SMF) and
// accept whichever lines up.
export const matchSysEx = (dataView: DataView, pattern: readonly number[]): boolean => {
    for (const offset of [0, 1]) {
        if (dataView.byteLength - offset < pattern.length) continue;
        let match = true;
        for (let i = 0; i < pattern.length; ++i) {
            if (dataView.getUint8(offset + i) !== pattern[i]) {
                match = false;
                break;
            }
        }
        if (match) return true;
    }
    return false;
};

export const isGsReset = (event: midi.SystemExclusiveEvent) => matchSysEx(event.dataView, GS_RESET);
export const isXgReset = (event: midi.SystemExclusiveEvent) => matchSysEx(event.dataView, XG_RESET);

// Synthesize a `duration`-second exponentially-decaying stereo noise IR.
// `decay` shapes the tail (higher = faster fall-off; 2 = roughly natural
// hall, 4 = small room). Cheap to generate (one allocation, one pass) and
// gives a "湿った" reverb without shipping a real IR sample.
const buildImpulseResponse = (
    ctx: BaseAudioContext,
    duration: number,
    decay: number,
): AudioBuffer => {
    const length = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ++ch) {
        const data = buf.getChannelData(ch);
        for (let i = 0; i < length; ++i) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
        }
    }
    return buf;
};

// `input` is the bus each channel's CC 91 send gain feeds; `output` is the
// post-convolved signal that mixes back into master. Wet level is fixed
// at the output gain; per-channel CC 91 controls how much dry feeds in.
class Reverb {
    input: GainNode;
    output: GainNode;
    private convolver: ConvolverNode;
    constructor(ctx: AudioContext) {
        this.input = ctx.createGain();
        this.output = ctx.createGain();
        this.output.gain.value = 0.5;
        this.convolver = ctx.createConvolver();
        this.convolver.buffer = buildImpulseResponse(ctx, 1.5, 2.0);
        this.input.connect(this.convolver);
        this.convolver.connect(this.output);
    }
    destroy() {
        this.input.disconnect();
        this.convolver.disconnect();
        this.output.disconnect();
    }
}

// LFO-modulated delay with a small feedback loop. One delay line is enough
// for the "wide / shimmery" feel; multi-tap chorus can come later if needed.
// LFO frequency (0.5 Hz) and depth (±5 ms around 25 ms base) match common
// rack-chorus defaults.
class Chorus {
    input: GainNode;
    output: GainNode;
    private delay: DelayNode;
    private lfo: OscillatorNode;
    private lfoGain: GainNode;
    private feedback: GainNode;
    constructor(ctx: AudioContext) {
        this.input = ctx.createGain();
        this.output = ctx.createGain();
        this.output.gain.value = 0.5;
        this.delay = ctx.createDelay(0.05);
        this.delay.delayTime.value = 0.025;
        this.lfo = ctx.createOscillator();
        this.lfo.type = "sine";
        this.lfo.frequency.value = 0.5;
        this.lfoGain = ctx.createGain();
        this.lfoGain.gain.value = 0.005;
        this.lfo.connect(this.lfoGain);
        this.lfoGain.connect(this.delay.delayTime);
        this.lfo.start();
        this.feedback = ctx.createGain();
        this.feedback.gain.value = 0.2;
        this.input.connect(this.delay);
        this.delay.connect(this.output);
        this.delay.connect(this.feedback);
        this.feedback.connect(this.delay);
    }
    destroy() {
        try {
            this.lfo.stop();
        } catch {
            /* already stopped */
        }
        this.input.disconnect();
        this.delay.disconnect();
        this.lfo.disconnect();
        this.lfoGain.disconnect();
        this.feedback.disconnect();
        this.output.disconnect();
    }
}

export class SynthEngine {
    instruments: inst.Instrument<Monophony>[];
    // Per-channel user-gain bus that sits between each Instrument and the
    // master `gain`. Apps can write to `channelGains[i].gain` for mute /
    // solo / per-channel volume without fighting MIDI-driven CC 7 / CC 11
    // (those are still handled inside Instrument and remain authoritative
    // for MIDI playback semantics).
    channelGains: GainNode[];
    gain: GainNode;
    dynamicsCompressor: DynamicsCompressorNode;
    private _reverb: Reverb;
    private _chorus: Chorus;

    constructor(
        public audioContext: AudioContext,
        destination: AudioNode,
    ) {
        this.instruments = [];
        this.channelGains = [];
        this.gain = audioContext.createGain();
        this.gain.gain.value = 0.1;
        this.dynamicsCompressor = audioContext.createDynamicsCompressor();
        this.gain.connect(this.dynamicsCompressor);
        this.dynamicsCompressor.connect(destination);

        // Effect buses. Both fan into `gain` (master) so dry and wet share
        // the same compressor afterwards. Per-channel CC 91 / CC 93 control
        // how much each channel sends in (default 0 = dry only).
        this._reverb = new Reverb(audioContext);
        this._chorus = new Chorus(audioContext);
        this._reverb.output.connect(this.gain);
        this._chorus.output.connect(this.gain);

        for (let i = 0; i < 16; ++i) {
            const channelGain = audioContext.createGain();
            channelGain.connect(this.gain);
            this.channelGains[i] = channelGain;
            const instrument = new inst.Instrument<Monophony>(audioContext, channelGain);
            // Wet sends tap the post-channelGain signal so the user-gain layer
            // (mute / solo / fader) and MIDI volume / expression both apply
            // to wet as well as dry. Send levels are the Instrument's own
            // `_reverbSend` / `_chorusSend` gains, driven by CC 91 / CC 93.
            channelGain.connect(instrument.reverbSend);
            channelGain.connect(instrument.chorusSend);
            instrument.reverbSend.connect(this._reverb.input);
            instrument.chorusSend.connect(this._chorus.input);
            instrument.patch = generatePatch(instrument, 0, isDrumChannel(i, instrument.bankMSB));
            this.instruments[i] = instrument;
            instrument.onExpired((data: inst.ExpiredMessage<Monophony>) => {
                data.data.parentPatch.onExpired(data.data, data.time);
            });
            instrument.onProgramChange((event: midi.ProgramChangeEvent) => {
                instrument.patch = generatePatch(
                    instrument,
                    event.program,
                    isDrumChannel(i, instrument.bankMSB),
                );
            });
        }
    }

    receiveEvent(event: midi.Event, time: number) {
        if (event instanceof midi.ChannelEvent) {
            this.instruments[event.channel].receiveEvent(event, time);
        } else if (event instanceof midi.SystemExclusiveEvent) {
            // GS Reset / XG System On both reset every part to GM defaults.
            // Detect at the engine level (not per-Instrument) so the 16-way
            // SysEx broadcast doesn't trigger 16 independent resets.
            if (isGsReset(event) || isXgReset(event)) {
                for (const instrument of this.instruments) {
                    instrument.applyReset(time);
                }
                return;
            }
            for (const instrument of this.instruments) {
                instrument.receiveEvent(event, time);
            }
        } else {
            for (const instrument of this.instruments) {
                instrument.receiveEvent(event, time);
            }
        }
    }

    // Pay the Web Audio cold-start cost up front by firing a velocity-1
    // NoteOn / NoteOff pair on every channel at `time`. velocity 1 squared
    // (= (1/127)²) sits ~ -84 dB below peak before the master gain (0.1)
    // and dynamics compressor; it's well below audibility for any sane
    // monitoring chain. The pair allocates and connects per-note Web Audio
    // nodes (oscillator / filter / gain / buffer source) so the first real
    // attack at playback time doesn't pay for graph construction inside
    // the audio thread, which surfaces as a hitch at the top of the song.
    //
    // Why this rather than `seek(0)`: `SmfPlayer.seek(tick)` drops NoteOn
    // / NoteOff from the skipped range, so a tick-0 NoteOn would be
    // silently eaten by `seek(0)` and the song would start a beat short.
    // Constructing the events here avoids the seek path entirely.
    prewarm(time: number = this.audioContext.currentTime) {
        const noteNumber = 60; // C4; harmless on melodic and drum patches
        const onData = new DataView(Uint8Array.of(noteNumber, 1).buffer);
        const offData = new DataView(Uint8Array.of(noteNumber, 0x40).buffer);
        for (let ch = 0; ch < 16; ++ch) {
            const noteOn = new midi.NoteOnEvent(onData, 0, 0x90 | ch);
            const noteOff = new midi.NoteOffEvent(offData, 0, 0x80 | ch);
            this.instruments[ch].receiveEvent(noteOn, time);
            this.instruments[ch].receiveEvent(noteOff, time);
        }
    }

    pause() {
        for (const instrument of this.instruments) {
            instrument.pause();
        }
    }

    destroy() {
        for (const instrument of this.instruments) {
            instrument.destroy();
        }
        this._reverb.destroy();
        this._chorus.destroy();
    }
}
