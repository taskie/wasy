export declare class Event {
    dataView: DataView;
    tick: number;
    status: number;
    constructor(dataView: DataView, tick: number, status: number);
    toWebMidiLinkString(): string;
    static statusEventMap: {
        [n: number]: typeof Event;
    };
    static create(dataView: DataView, tick: number, status: number): Event;
    readonly statusType: number;
}
export declare class ChannelEvent extends Event {
    readonly channel: number;
}
export declare class NoteOffEvent extends ChannelEvent {
    readonly noteNumber: number;
    readonly velocity: number;
}
export declare class NoteOnEvent extends ChannelEvent {
    readonly noteNumber: number;
    readonly velocity: number;
}
export declare class PolyphonicKeyPressureEvent extends ChannelEvent {
}
export declare class ControlChangeEvent extends ChannelEvent {
    readonly controller: number;
    readonly value: number;
}
export declare class ProgramChangeEvent extends ChannelEvent {
    readonly program: number;
}
export declare class ChannelPressureEvent extends ChannelEvent {
}
export declare class PitchBendEvent extends ChannelEvent {
    readonly value: number;
}
export declare class FxEvent extends Event {
    readonly statusType: number;
}
export declare class SystemExclusiveEvent extends FxEvent {
}
export declare class MetaEvent extends FxEvent {
    static typeIndexEventMap: {
        [n: number]: typeof MetaEvent;
    };
    static create(dataView: DataView, tick: number, status: number): MetaEvent;
    readonly typeIndex: number;
    readonly data: DataView;
}
export declare class TempoMetaEvent extends MetaEvent {
    readonly rawTempo: number;
    readonly secondsPerBeat: number;
    readonly beatsPerMinute: number;
}
