import * as midi from "./midi/event";
export declare class Header {
    dataView: DataView;
    format: number;
    numberOfTracks: number;
    resolution: number;
    constructor(dataView: DataView);
    load(): void;
}
export declare class EventBuilder {
    dataView: DataView;
    constructor(dataView: DataView);
    build(tick: number, status: number, byteOffset: number): midi.Event;
}
export declare class Track {
    dataView: DataView;
    events: midi.Event[];
    constructor(dataView: DataView);
    load(): void;
}
export declare class Song {
    buffer: ArrayBuffer;
    header: Header;
    tracks: Track[];
    constructor(buffer: ArrayBuffer);
    load(): void;
}
