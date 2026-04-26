import * as midi from "./midi/event.js";
import * as smf from "./smf.js";
export declare class Player {
    song: smf.Song;
    cursors: number[];
    constructor(buffer: ArrayBuffer);
    get resolution(): number;
    get numberOfTracks(): number;
    read(tick: number): midi.Event[][];
}
//# sourceMappingURL=player.d.ts.map