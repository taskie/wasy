import { describe, expect, it } from "vitest";
import {
    dataViewGetString,
    dataViewGetSubDataView,
    dataViewGetUint,
    dataViewGetUintVariable,
} from "../../src/binary/data-view-util.js";

const dv = (...bytes: number[]) => new DataView(Uint8Array.from(bytes).buffer);

describe("dataViewGetUint", () => {
    it("reads big-endian multi-byte values", () => {
        expect(dataViewGetUint(dv(0x12, 0x34), 0, false, 2)).toBe(0x1234);
        expect(dataViewGetUint(dv(0x00, 0x12, 0x34, 0x56), 1, false, 3)).toBe(0x123456);
    });

    it("reads little-endian multi-byte values", () => {
        expect(dataViewGetUint(dv(0x34, 0x12), 0, true, 2)).toBe(0x1234);
        expect(dataViewGetUint(dv(0x56, 0x34, 0x12), 0, true, 3)).toBe(0x123456);
    });

    it("defaults byteLength to remaining bytes", () => {
        expect(dataViewGetUint(dv(0x01, 0x02, 0x03), 0, false)).toBe(0x010203);
    });

    it("treats single byte the same in either endianness", () => {
        expect(dataViewGetUint(dv(0xab), 0, false, 1)).toBe(0xab);
        expect(dataViewGetUint(dv(0xab), 0, true, 1)).toBe(0xab);
    });
});

describe("dataViewGetUintVariable", () => {
    it("reads a single-byte VLQ", () => {
        expect(dataViewGetUintVariable(dv(0x00), 0)).toEqual({ value: 0, byteLength: 1 });
        expect(dataViewGetUintVariable(dv(0x40), 0)).toEqual({ value: 0x40, byteLength: 1 });
        expect(dataViewGetUintVariable(dv(0x7f), 0)).toEqual({ value: 0x7f, byteLength: 1 });
    });

    it("reads multi-byte VLQs", () => {
        // 0x80 0x00 -> 0x80 (128)
        expect(dataViewGetUintVariable(dv(0x81, 0x00), 0)).toEqual({ value: 0x80, byteLength: 2 });
        // 0xff 0x7f -> 0x3fff (16383, max 2-byte VLQ)
        expect(dataViewGetUintVariable(dv(0xff, 0x7f), 0)).toEqual({ value: 0x3fff, byteLength: 2 });
        // 0x81 0x80 0x00 -> 0x4000 (16384)
        expect(dataViewGetUintVariable(dv(0x81, 0x80, 0x00), 0)).toEqual({ value: 0x4000, byteLength: 3 });
        // 0xff 0xff 0xff 0x7f -> 0x0fffffff (max 4-byte SMF VLQ)
        expect(dataViewGetUintVariable(dv(0xff, 0xff, 0xff, 0x7f), 0)).toEqual({
            value: 0x0fffffff,
            byteLength: 4,
        });
    });

    it("respects byteOffset", () => {
        expect(dataViewGetUintVariable(dv(0xaa, 0x81, 0x00), 1)).toEqual({ value: 0x80, byteLength: 2 });
    });
});

describe("dataViewGetString", () => {
    it("decodes ASCII bytes", () => {
        const bytes = Uint8Array.from([0x4d, 0x54, 0x68, 0x64]);
        const view = new DataView(bytes.buffer);
        expect(dataViewGetString(view, 0, 4)).toBe("MThd");
    });

    it("respects offset and length", () => {
        const bytes = Uint8Array.from([0x00, 0x00, 0x4d, 0x54, 0x72, 0x6b, 0x00]);
        const view = new DataView(bytes.buffer);
        expect(dataViewGetString(view, 2, 4)).toBe("MTrk");
    });
});

describe("dataViewGetSubDataView", () => {
    it("creates a sub-view with provided length", () => {
        const view = dv(0x01, 0x02, 0x03, 0x04, 0x05);
        const sub = dataViewGetSubDataView(view, 1, 3);
        expect(sub.byteLength).toBe(3);
        expect(sub.getUint8(0)).toBe(0x02);
        expect(sub.getUint8(2)).toBe(0x04);
    });

    it("defaults length to remaining bytes", () => {
        const view = dv(0x01, 0x02, 0x03, 0x04);
        const sub = dataViewGetSubDataView(view, 2);
        expect(sub.byteLength).toBe(2);
        expect(sub.getUint8(0)).toBe(0x03);
    });

    it("shares the same underlying buffer", () => {
        const view = dv(0x01, 0x02, 0x03);
        const sub = dataViewGetSubDataView(view, 0, 3);
        expect(sub.buffer).toBe(view.buffer);
    });
});
