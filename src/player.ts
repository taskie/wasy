import * as midi from "./midi/event.js";
import * as smf from "./smf.js";

export interface Player {
    song: smf.Song;
    cursors: number[];
    resolution: number;
    numberOfTracks: number;
    read(tick: number): midi.Event[][];
}

export const createPlayer = (buffer: ArrayBuffer): Player => {
    const song = smf.parseSong(buffer);
    const numberOfTracks = song.header.numberOfTracks;
    const resolution = song.header.resolution;
    const cursors = Array.from({ length: numberOfTracks }, () => 0);

    const read = (tick: number): midi.Event[][] => {
        const newEventsStore: midi.Event[][] = [];
        for (let i = 0; i < 16; ++i) {
            newEventsStore[i] = [];
        }
        song.tracks.forEach((track, trackNumber) => {
            for (let i = cursors[trackNumber]; i < track.events.length; ++i) {
                const event = track.events[i];
                if (event.tick > tick) break;
                if (event instanceof midi.ChannelEvent) {
                    newEventsStore[event.channel].push(event);
                } else {
                    for (const events of newEventsStore) {
                        events.push(event);
                    }
                }
                cursors[trackNumber] = i + 1;
            }
        });
        return newEventsStore;
    };

    return { song, cursors, resolution, numberOfTracks, read };
};
