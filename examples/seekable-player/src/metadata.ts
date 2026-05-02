import { midi, smf } from "wasy";

export interface SongMetadata {
    title?: string;
    copyright: string[];
    text: string[];
    trackNames: { trackIndex: number; name: string }[];
    instrumentNames: { trackIndex: number; name: string }[];
    markers: { tick: number; text: string }[];
    lyrics: { tick: number; text: string }[];
}

// Walks the parsed SMF and pulls out human-readable text meta-events. The
// SMF spec (RP-019) reserves track 0's first SequenceTrackName as the song
// title; later tracks' names belong to their own track. CopyrightNotice and
// MarkerEvent can appear on any track but conventionally land on track 0.
export const extractSongMetadata = (song: smf.Song): SongMetadata => {
    const meta: SongMetadata = {
        copyright: [],
        text: [],
        trackNames: [],
        instrumentNames: [],
        markers: [],
        lyrics: [],
    };
    song.tracks.forEach((track, trackIndex) => {
        let trackNameSeen = false;
        for (const e of track.events) {
            if (e instanceof midi.SequenceTrackNameMetaEvent) {
                const name = e.text();
                if (!trackNameSeen) {
                    if (trackIndex === 0 && meta.title == null) {
                        meta.title = name;
                    } else {
                        meta.trackNames.push({ trackIndex, name });
                    }
                    trackNameSeen = true;
                }
            } else if (e instanceof midi.CopyrightMetaEvent) {
                meta.copyright.push(e.text());
            } else if (e instanceof midi.TextMetaEvent) {
                meta.text.push(e.text());
            } else if (e instanceof midi.InstrumentNameMetaEvent) {
                meta.instrumentNames.push({ trackIndex, name: e.text() });
            } else if (e instanceof midi.MarkerMetaEvent) {
                meta.markers.push({ tick: e.tick, text: e.text() });
            } else if (e instanceof midi.LyricMetaEvent) {
                meta.lyrics.push({ tick: e.tick, text: e.text() });
            }
        }
    });
    return meta;
};
