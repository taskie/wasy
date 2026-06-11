import { describe, expect, it } from "vitest";
import { SmfPlayer } from "../src/smf-player.js";

const fakeAudioContext = () => ({ currentTime: 0 }) as unknown as AudioContext;

describe("SmfPlayer.unload", () => {
    it("resets the timer tempo to the SMF default (120 BPM)", () => {
        const player = new SmfPlayer(fakeAudioContext());
        // Simulate a previous song that ended on a slow tempo event.
        player.timer.beatsPerMinute = 60;

        player.unload();

        // A new file with no tempo event must play at the SMF default,
        // not at the previous song's last tempo.
        expect(player.timer.beatsPerMinute).toBeCloseTo(120);
        expect(player.timer.tick).toBe(0);
    });
});
