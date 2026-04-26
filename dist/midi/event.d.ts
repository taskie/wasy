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
    get statusType(): number;
}
export declare class ChannelEvent extends Event {
    get channel(): number;
}
export declare class NoteOffEvent extends ChannelEvent {
    get noteNumber(): number;
    get velocity(): number;
}
export declare class NoteOnEvent extends ChannelEvent {
    get noteNumber(): number;
    get velocity(): number;
}
export declare class PolyphonicKeyPressureEvent extends ChannelEvent {
}
export declare class ControlChangeEvent extends ChannelEvent {
    get controller(): number;
    get value(): number;
}
export declare class ProgramChangeEvent extends ChannelEvent {
    get program(): number;
}
export declare class ChannelPressureEvent extends ChannelEvent {
}
export declare class PitchBendEvent extends ChannelEvent {
    get value(): number;
}
export declare class FxEvent extends Event {
    get statusType(): number;
}
export declare class SystemExclusiveEvent extends FxEvent {
}
export declare class MetaEvent extends FxEvent {
    static typeIndexEventMap: {
        [n: number]: typeof MetaEvent;
    };
    static create(dataView: DataView, tick: number, status: number): MetaEvent;
    get typeIndex(): number;
    get data(): DataView<ArrayBufferLike>;
}
export declare class TempoMetaEvent extends MetaEvent {
    get rawTempo(): number;
    get secondsPerBeat(): number;
    get beatsPerMinute(): number;
}
//# sourceMappingURL=event.d.ts.map