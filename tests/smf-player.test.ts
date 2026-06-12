import { describe, expect, it } from "vitest";
import { SmfPlayer } from "../src/smf-player.js";

const fakeAudioContext = () => ({ currentTime: 0 }) as unknown as AudioContext;

describe("SmfPlayer.lookaheadSeconds", () => {
    it("defaults to 200 ms and writes through to Timer.delayInSeconds", () => {
        const player = new SmfPlayer(fakeAudioContext());
        expect(player.lookaheadSeconds).toBeCloseTo(0.2);

        player.lookaheadSeconds = 0.1;
        expect(player.lookaheadSeconds).toBeCloseTo(0.1);
        expect(player.timer.delayInSeconds).toBeCloseTo(0.1);
    });

    it("clamps to the safe range", () => {
        const player = new SmfPlayer(fakeAudioContext());
        // Below the floor, events would be scheduled in the past under
        // setInterval jitter (25 ms wake-ups).
        player.lookaheadSeconds = 0.001;
        expect(player.lookaheadSeconds).toBeCloseTo(0.05);
        player.lookaheadSeconds = 5;
        expect(player.lookaheadSeconds).toBeCloseTo(1.0);
    });
});

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
