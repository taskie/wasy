import { describe, expect, it } from "vitest";
import { NotePool, type ExpiredMessage } from "../../src/midi/instrument.js";

const collectExpired = <T>(pool: NotePool<T>) => {
    const expired: Array<ExpiredMessage<T>> = [];
    pool.onExpired((m) => expired.push(m));
    return expired;
};

describe("NotePool", () => {
    it("registers a note and returns it via find", () => {
        const pool = new NotePool<string>();
        pool.register(60, "C4", 0);
        expect(pool.find(60)).toBe("C4");
        expect(pool.noteNumberQueue).toEqual([60]);
    });

    it("expires the existing entry when the same note is re-registered", () => {
        const pool = new NotePool<string>();
        const expired = collectExpired(pool);
        pool.register(60, "first", 1);
        pool.register(60, "second", 2);
        expect(expired).toEqual([{ data: "first", time: 2 }]);
        expect(pool.find(60)).toBe("second");
        expect(pool.noteNumberQueue).toEqual([60]);
    });

    it("expires the oldest entry when polyphony is exceeded", () => {
        const pool = new NotePool<number>(3);
        const expired = collectExpired(pool);
        pool.register(60, 1, 0);
        pool.register(62, 2, 0);
        pool.register(64, 3, 0);
        pool.register(65, 4, 5);
        expect(expired).toEqual([{ data: 1, time: 5 }]);
        expect(pool.noteNumberQueue).toEqual([62, 64, 65]);
        expect(pool.find(60)).toBeUndefined();
    });

    it("unregister removes the entry and emits expired", () => {
        const pool = new NotePool<string>();
        const expired = collectExpired(pool);
        pool.register(60, "C4", 0);
        pool.unregister(60, 7);
        expect(expired).toEqual([{ data: "C4", time: 7 }]);
        expect(pool.noteNumberQueue).toEqual([]);
    });

    it("unregisterAll emits each active entry and clears the queue", () => {
        const pool = new NotePool<string>();
        const expired = collectExpired(pool);
        pool.register(60, "C4", 0);
        pool.register(64, "E4", 0);
        pool.unregisterAll(9);
        expect(expired).toEqual([
            { data: "C4", time: 9 },
            { data: "E4", time: 9 },
        ]);
        expect(pool.noteNumberQueue).toEqual([]);
        expect(pool.find(60)).toBeUndefined();
        expect(pool.find(64)).toBeUndefined();
    });
});
