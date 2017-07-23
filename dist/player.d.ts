import * as midi from "./midi/event";
import * as smf from "./smf";
export declare class Player {
    song: smf.Song;
    cursors: number[];
    constructor(buffer: ArrayBuffer);
    readonly resolution: number;
    readonly numberOfTracks: number;
    read(tick: number): midi.Event[][];
}
