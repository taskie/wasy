"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dvu = require("../binary/data-view-util");
class Event {
    constructor(dataView, tick, status) {
        this.dataView = dataView;
        this.tick = tick;
        this.status = status;
    }
    toWebMidiLinkString() {
        let data = [this.status];
        for (var i = 0; i < this.dataView.byteLength; ++i) {
            data.push(this.dataView.getUint8(i));
        }
        return "midi," + data.map((x) => x.toString(16)).join(",");
    }
    static create(dataView, tick, status) {
        if (!this.statusEventMap) {
            this.statusEventMap = {
                0x80: NoteOffEvent,
                0x90: NoteOnEvent,
                0xA0: PolyphonicKeyPressureEvent,
                0xB0: ControlChangeEvent,
                0xC0: ProgramChangeEvent,
                0xD0: ChannelPressureEvent,
                0xE0: PitchBendEvent,
                0xF0: SystemExclusiveEvent,
                0xFF: MetaEvent,
            };
        }
        let statusType = status & 0xF0;
        if (status === 0xFF) {
            return MetaEvent.create(dataView, tick, status);
        }
        else if (status === 0x90 && dataView.getUint8(1) === 0) {
            return new NoteOffEvent(dataView, tick, 0x80);
        }
        else {
            let EventClass = this.statusEventMap[statusType];
            return new EventClass(dataView, tick, status);
        }
    }
    get statusType() { return this.status & 0xF0; }
}
exports.Event = Event;
class ChannelEvent extends Event {
    get channel() { return this.status & 0x0F; }
}
exports.ChannelEvent = ChannelEvent;
class NoteOffEvent extends ChannelEvent {
    get noteNumber() { return this.dataView.getUint8(0); }
    get velocity() { return this.dataView.getUint8(1); }
}
exports.NoteOffEvent = NoteOffEvent;
class NoteOnEvent extends ChannelEvent {
    get noteNumber() { return this.dataView.getUint8(0); }
    get velocity() { return this.dataView.getUint8(1); }
}
exports.NoteOnEvent = NoteOnEvent;
class PolyphonicKeyPressureEvent extends ChannelEvent {
}
exports.PolyphonicKeyPressureEvent = PolyphonicKeyPressureEvent;
class ControlChangeEvent extends ChannelEvent {
    get controller() { return this.dataView.getUint8(0); }
    get value() { return this.dataView.getUint8(1); }
}
exports.ControlChangeEvent = ControlChangeEvent;
class ProgramChangeEvent extends ChannelEvent {
    get program() { return this.dataView.getUint8(0); }
}
exports.ProgramChangeEvent = ProgramChangeEvent;
class ChannelPressureEvent extends ChannelEvent {
}
exports.ChannelPressureEvent = ChannelPressureEvent;
class PitchBendEvent extends ChannelEvent {
    get value() {
        return this.dataView.getUint8(0) + (this.dataView.getUint8(1) << 7) - 8192;
    }
}
exports.PitchBendEvent = PitchBendEvent;
class FxEvent extends Event {
    get statusType() { return this.status; }
}
exports.FxEvent = FxEvent;
class SystemExclusiveEvent extends FxEvent {
}
exports.SystemExclusiveEvent = SystemExclusiveEvent;
class MetaEvent extends FxEvent {
    static create(dataView, tick, status) {
        if (!this.typeIndexEventMap) {
            this.typeIndexEventMap = {
                0x51: TempoMetaEvent
            };
        }
        let typeIndex = dataView.getUint8(0);
        if (typeIndex in this.typeIndexEventMap) {
            let EventClass = this.typeIndexEventMap[typeIndex];
            return new EventClass(dataView, tick, status);
        }
        else {
            return new MetaEvent(dataView, tick, status);
        }
    }
    get typeIndex() { return this.dataView.getUint8(0); }
    get data() {
        let { value, byteLength } = dvu.dataViewGetUintVariable(this.dataView, 1);
        return dvu.dataViewGetSubDataView(this.dataView, 1 + byteLength, value);
    }
}
exports.MetaEvent = MetaEvent;
class TempoMetaEvent extends MetaEvent {
    get rawTempo() {
        return dvu.dataViewGetUint(this.data, 0, false);
    }
    get secondsPerBeat() {
        return this.rawTempo * 10e-7; // ?
    }
    get beatsPerMinute() {
        return 60 / this.secondsPerBeat;
    }
}
exports.TempoMetaEvent = TempoMetaEvent;
//# sourceMappingURL=event.js.map