import * as midi from "../midi/event.js";
import * as tuning from "../player/tuning.js";
export class Monophony {
    parentPatch;
    managedNodes;
    detunableNodes;
}
export class Patch {
    instrument;
    destination;
    tuning;
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
            const monophony = this.onNoteOn(event, time);
            if (monophony != null) {
                if (monophony.parentPatch == null) {
                    monophony.parentPatch = this;
                }
                this.instrument.registerNote(event.noteNumber, monophony, time);
            }
        }
        else if (event instanceof midi.NoteOffEvent) {
            const monophony = this.instrument.findNote(event.noteNumber);
            if (monophony != null) {
                this.onNoteOff(monophony, time);
            }
        }
        else if (event instanceof midi.PitchBendEvent) {
            for (const key in this.instrument.noteStore) {
                const monophony = this.instrument.noteStore[key];
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
            for (const node of monophony.managedNodes) {
                node.disconnect();
            }
        }, 1000);
    }
    onPitchBend(event, monophony, time) {
        if (monophony.detunableNodes != null) {
            for (const node of monophony.detunableNodes) {
                const oscillator = node;
                this.instrument.pitchBend = event.value;
                oscillator.detune.setValueAtTime(this.detune, time);
            }
        }
    }
}
//# sourceMappingURL=patch.js.map