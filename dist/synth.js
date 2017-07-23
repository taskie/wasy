"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const patch_1 = require("./synth/patch");
class SimpleOscillatorMonophony extends patch_1.Monophony {
}
exports.SimpleOscillatorMonophony = SimpleOscillatorMonophony;
class SimpleOscillatorPatch extends patch_1.Patch {
    constructor(instrument, oscillatorType = "square", destination) {
        super(instrument, destination);
        this.oscillatorType = oscillatorType;
    }
    onNoteOn(event, time) {
        // initialize
        let monophony = new SimpleOscillatorMonophony();
        let oscillator = this.audioContext.createOscillator();
        let gain = this.audioContext.createGain();
        monophony.oscillator = oscillator;
        monophony.gain = gain;
        monophony.managedNodes = [oscillator, gain];
        monophony.detunableNodes = [oscillator];
        // settings
        oscillator.type = this.oscillatorType;
        oscillator.frequency.value = this.tuning.frequency(event.noteNumber);
        oscillator.detune.value = this.detune;
        gain.gain.value = event.velocity / 127;
        // connect
        oscillator.connect(gain);
        gain.connect(this.destination);
        // start
        oscillator.start(time);
        return monophony;
    }
    onNoteOff(monophony, time) {
        monophony.oscillator.stop(time);
        monophony.gain.gain.cancelScheduledValues(time);
        monophony.gain.gain.setValueAtTime(0, time);
    }
    onExpired(monophony, time) {
        this.onNoteOff(monophony, time);
    }
}
exports.SimpleOscillatorPatch = SimpleOscillatorPatch;
class NoiseMonophony extends patch_1.Monophony {
}
exports.NoiseMonophony = NoiseMonophony;
class NoisePatch extends patch_1.Patch {
    constructor(instrument, destination) {
        super(instrument, destination);
        if (NoisePatch.noiseBuffer == null) {
            var frame = 44100 * 2;
            let buf = this.audioContext.createBuffer(2, frame, this.audioContext.sampleRate);
            let data0 = buf.getChannelData(0);
            let data1 = buf.getChannelData(1);
            for (var i = 0; i < data0.length; ++i) {
                data0[i] = (Math.random() * 2 - 1);
                data1[i] = (Math.random() * 2 - 1);
            }
            NoisePatch.noiseBuffer = buf;
        }
    }
    onNoteOn(event, time) {
        // initialize
        let monophony = new NoiseMonophony();
        let source = this.audioContext.createBufferSource();
        let filter = this.audioContext.createBiquadFilter();
        let gain = this.audioContext.createGain();
        monophony.source = source;
        monophony.filter = filter;
        monophony.gain = gain;
        monophony.managedNodes = [source, filter, gain];
        monophony.detunableNodes = [filter];
        // settings
        source.buffer = NoisePatch.noiseBuffer;
        source.loop = true;
        filter.type = "bandpass";
        filter.frequency.value = this.tuning.frequency(event.noteNumber + 24);
        filter.detune.value = this.detune;
        filter.Q.value = 1;
        gain.gain.value = event.velocity / 127;
        // connect
        source.connect(filter);
        filter.connect(gain);
        gain.connect(this.destination);
        // start
        source.start(time);
        return monophony;
    }
    onNoteOff(monophony, time) {
        monophony.source.stop(time);
        monophony.gain.gain.cancelScheduledValues(time);
        monophony.gain.gain.setValueAtTime(0, time);
    }
    onExpired(monophony, time) {
        this.onNoteOff(monophony, time);
    }
}
exports.NoisePatch = NoisePatch;
class GainedNoisePatch extends NoisePatch {
    constructor(instrument, valueAtBegin, valueAtEnd, duration, fixedFrequency, destination) {
        super(instrument, destination);
        this.valueAtBegin = valueAtBegin;
        this.valueAtEnd = valueAtEnd;
        this.duration = duration;
        this.fixedFrequency = fixedFrequency;
    }
    onNoteOn(event, time) {
        let monophony = super.onNoteOn(event, time);
        let filter = monophony.filter;
        let gain = monophony.gain;
        if (this.fixedFrequency != null) {
            filter.frequency.value = this.fixedFrequency;
        }
        else {
            filter.frequency.value = this.tuning.frequency(event.noteNumber + 24);
        }
        let baseGain = gain.gain.value;
        gain.gain.setValueAtTime(this.valueAtBegin * baseGain, time);
        gain.gain.linearRampToValueAtTime(this.valueAtEnd * baseGain, time + this.duration);
        return monophony;
    }
}
exports.GainedNoisePatch = GainedNoisePatch;
class OneShotNoisePatch extends GainedNoisePatch {
    onNoteOff(monophony, time) {
    }
    onExpired(monophony, time) {
        super.onExpired(monophony, time);
        monophony.source.stop(time);
        monophony.gain.gain.cancelScheduledValues(time);
        monophony.gain.gain.setValueAtTime(0, time);
    }
}
exports.OneShotNoisePatch = OneShotNoisePatch;
class GainedOscillatorPatch extends SimpleOscillatorPatch {
    constructor(instrument, valueAtBegin, valueAtEnd, duration, oscillatorType, destination) {
        super(instrument, oscillatorType, destination);
        this.valueAtBegin = valueAtBegin;
        this.valueAtEnd = valueAtEnd;
        this.duration = duration;
    }
    onNoteOn(event, time) {
        let monophony = super.onNoteOn(event, time);
        let gain = monophony.gain;
        let baseGain = gain.gain.value;
        gain.gain.setValueAtTime(this.valueAtBegin * baseGain, time);
        gain.gain.linearRampToValueAtTime(this.valueAtEnd * baseGain, time + this.duration);
        return monophony;
    }
}
exports.GainedOscillatorPatch = GainedOscillatorPatch;
class OneShotOscillatorPatch extends GainedOscillatorPatch {
    constructor(instrument, duration, fixedFrequency, oscillatorType, destination) {
        super(instrument, 1, 0, duration, oscillatorType, destination);
        this.fixedFrequency = fixedFrequency;
    }
    onNoteOn(event, time) {
        let monophony = super.onNoteOn(event, time);
        let oscillator = monophony.oscillator;
        let frequency;
        if (this.fixedFrequency != null) {
            frequency = this.fixedFrequency;
        }
        else {
            frequency = this.tuning.frequency(event.noteNumber + 24);
        }
        oscillator.frequency.setValueAtTime(frequency, time);
        oscillator.frequency.linearRampToValueAtTime(0, time + this.duration);
        return monophony;
    }
    onNoteOff(monophony, time) {
    }
    onExpired(monophony, time) {
        super.onExpired(monophony, time);
        monophony.oscillator.stop(time);
        monophony.gain.gain.cancelScheduledValues(time);
        monophony.gain.gain.setValueAtTime(0, time);
    }
}
exports.OneShotOscillatorPatch = OneShotOscillatorPatch;
class DrumKitPatch extends patch_1.Patch {
    constructor(instrument, destination) {
        let is = instrument;
        let ds = destination;
        super(is, ds);
        ds = this.destination;
        // gain
        let ga = this.audioContext.createGain();
        this.gain = ga;
        this.gain.gain.value = 2;
        ga.connect(ds);
        // panner
        let lp = this.audioContext.createPanner();
        this.leftPanpot = lp;
        let lpValue = (32 - 64) * Math.PI / (64 * 2);
        lp.setPosition(Math.sin(lpValue), 0, -Math.cos(lpValue));
        lp.connect(ga);
        let rp = this.audioContext.createPanner();
        this.rightPanpot = rp;
        let rpValue = (96 - 64) * Math.PI / (64 * 2);
        rp.setPosition(Math.sin(rpValue), 0, -Math.cos(rpValue));
        rp.connect(ga);
        // assign
        this.patchMap = {
            0: new OneShotNoisePatch(is, 1, 0, 0.05, null, ga),
            35: new OneShotOscillatorPatch(is, 0.2, 140, "sine", ga),
            36: new OneShotOscillatorPatch(is, 0.2, 150, "square", ga),
            37: new OneShotNoisePatch(is, 1, 0, 0.1, 2000, ga),
            38: new OneShotNoisePatch(is, 1, 0, 0.3, 1000, ga),
            39: new OneShotNoisePatch(is, 1, 0, 0.4, 3000, ga),
            40: new OneShotNoisePatch(is, 1, 0, 0.5, 1500, ga),
            41: new OneShotOscillatorPatch(is, 0.3, 200, "sine", rp),
            42: new OneShotNoisePatch(is, 1, 0, 0.1, 6000, lp),
            43: new OneShotOscillatorPatch(is, 0.3, 250, "sine", rp),
            44: new OneShotNoisePatch(is, 1, 0, 0.1, 5000, lp),
            45: new OneShotOscillatorPatch(is, 0.3, 350, "sine", rp),
            46: new OneShotNoisePatch(is, 1, 0, 0.3, 6000, lp),
            47: new OneShotOscillatorPatch(is, 0.3, 400, "sine", rp),
            48: new OneShotOscillatorPatch(is, 0.3, 500, "sine", rp),
            49: new OneShotNoisePatch(is, 1, 0, 1.5, 8000, ga),
            50: new OneShotOscillatorPatch(is, 0.3, 550, "sine", rp),
            51: new OneShotNoisePatch(is, 1, 0, 0.5, 16000, ga),
        };
    }
    onNoteOn(event, time) {
        let index = event.noteNumber;
        if (!(index in this.patchMap)) {
            index = 0;
        }
        const patch = this.patchMap[index];
        const hiHats = [42, 44, 46];
        if (hiHats.indexOf(index) != -1) {
            for (const hiHat of hiHats) {
                if (hiHat === index)
                    continue;
                this.instrument.expireNote(hiHat, time);
            }
        }
        const monophony = patch.onNoteOn(event, time);
        monophony.parentPatch = patch;
        return monophony;
    }
    onNoteOff(monophony, time) {
        monophony.parentPatch.onNoteOff(monophony, time);
    }
    onExpired(monophony, time) {
        monophony.parentPatch.onExpired(monophony, time);
    }
}
exports.DrumKitPatch = DrumKitPatch;
class PatchGenerator {
    generate(instrument, program, isDrum = false) {
        const simpleMap = {
            0x00: "sine",
            0x01: "triangle",
            0x02: "triangle",
            0x03: "triangle",
            0x04: "triangle",
            0x05: "triangle",
            0x10: "sine",
            0x11: "sine",
            0x12: "sine",
            0x13: "sine",
            0x14: "triangle",
            0x1D: "sawtooth",
            0x1E: "sawtooth",
            0x30: "triangle",
            0x31: "triangle",
            0x32: "triangle",
            0x33: "triangle",
            0x51: "sawtooth",
        };
        if (isDrum) {
            return new DrumKitPatch(instrument);
        }
        else {
            if (program === 0x77) {
                return new GainedNoisePatch(instrument, 0, 1, 1);
            }
            else if (program === 0x7E) {
                return new NoisePatch(instrument);
            }
            else if (program in simpleMap) {
                let oscillatorType = simpleMap[program];
                if (program <= 0x05) {
                    return new GainedOscillatorPatch(instrument, 1.2, 0.1, 0.7, oscillatorType);
                }
                else {
                    return new SimpleOscillatorPatch(instrument, oscillatorType);
                }
            }
            else {
                return new SimpleOscillatorPatch(instrument, "square");
            }
        }
    }
}
exports.PatchGenerator = PatchGenerator;
//# sourceMappingURL=synth.js.map