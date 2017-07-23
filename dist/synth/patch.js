"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const midi = require("../midi/event");
const tuning = require("../player/tuning");
class Monophony {
}
exports.Monophony = Monophony;
class Patch {
    constructor(instrument, destination = instrument.source) {
        this.instrument = instrument;
        this.destination = destination;
        this.tuning = new tuning.EqualTemperamentTuning();
    }
    get detune() { return this.instrument.detune; }
    set detune(detune) { this.instrument.detune = detune; }
    get audioContext() { return this.instrument.audioContext; }
    receiveEvent(event, time) {
        if (event instanceof midi.NoteOnEvent) {
            let monophony = this.onNoteOn(event, time);
            if (monophony != null) {
                if (monophony.parentPatch == null) {
                    monophony.parentPatch = this;
                }
                this.instrument.registerNote(event.noteNumber, monophony, time);
            }
        }
        else if (event instanceof midi.NoteOffEvent) {
            let monophony = this.instrument.findNote(event.noteNumber);
            if (monophony != null) {
                this.onNoteOff(monophony, time);
            }
        }
        else if (event instanceof midi.PitchBendEvent) {
            for (let key in this.instrument.noteStore) {
                let monophony = this.instrument.noteStore[key];
                if (monophony != null && monophony.parentPatch === this) {
                    this.onPitchBend(event, monophony, time);
                }
            }
        }
    }
    onNoteOn(event, time) {
        return null;
    }
    onNoteOff(data, time) {
    }
    onExpired(monophony, time) {
        setTimeout(() => {
            for (let node of monophony.managedNodes) {
                node.disconnect();
            }
        }, 1000);
    }
    onPitchBend(event, monophony, time) {
        if (monophony.detunableNodes != null) {
            for (let node of monophony.detunableNodes) {
                let oscillator = node;
                this.instrument.pitchBend = event.value;
                oscillator.detune.setValueAtTime(this.detune, time);
            }
        }
    }
}
exports.Patch = Patch;
//# sourceMappingURL=patch.js.map