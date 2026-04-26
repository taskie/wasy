import { describe, expect, it, vi } from "vitest";
import { createSignal } from "../src/signal.js";

describe("createSignal", () => {
    it("emits to all registered listeners", () => {
        const sig = createSignal<number>();
        const a = vi.fn();
        const b = vi.fn();
        sig.on(a);
        sig.on(b);
        sig.emit(42);
        expect(a).toHaveBeenCalledWith(42);
        expect(b).toHaveBeenCalledWith(42);
    });

    it("removes a single listener with off", () => {
        const sig = createSignal<number>();
        const a = vi.fn();
        const b = vi.fn();
        sig.on(a);
        sig.on(b);
        sig.off(a);
        sig.emit(1);
        expect(a).not.toHaveBeenCalled();
        expect(b).toHaveBeenCalledWith(1);
    });

    it("off is a no-op when listener is not registered", () => {
        const sig = createSignal<number>();
        const a = vi.fn();
        sig.off(a);
        sig.on(a);
        sig.emit(7);
        expect(a).toHaveBeenCalledWith(7);
    });

    it("offAll removes every listener", () => {
        const sig = createSignal<string>();
        const a = vi.fn();
        const b = vi.fn();
        sig.on(a);
        sig.on(b);
        sig.offAll();
        sig.emit("x");
        expect(a).not.toHaveBeenCalled();
        expect(b).not.toHaveBeenCalled();
    });

    it("isolates listeners across separate signals", () => {
        const sigA = createSignal<number>();
        const sigB = createSignal<number>();
        const a = vi.fn();
        const b = vi.fn();
        sigA.on(a);
        sigB.on(b);
        sigA.emit(1);
        expect(a).toHaveBeenCalledTimes(1);
        expect(b).not.toHaveBeenCalled();
    });
});
