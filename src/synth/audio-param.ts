// Compat layer for `AudioParam.cancelAndHoldAtTime`, which Firefox does
// not implement (Bugzilla 1308431). The naive fallback —
// `cancelScheduledValues(time)` + `setValueAtTime(param.value, time)` —
// anchors at the value at `currentTime`, not at `time`; with the player's
// ~200 ms lookahead that can anchor a release at 0 while the attack is
// still pending, silencing short notes entirely.
//
// Instead, params without native support get a shadow list of their
// scheduled events, so `cancelAndHold` can compute the exact automation
// value at `time` by linear interpolation. This works because the whole
// codebase schedules only `setValueAtTime` and `linearRampToValueAtTime`;
// all scheduling must go through the helpers below to keep the shadow
// list in sync. Params with native support skip tracking entirely.

interface ShadowEvent {
    type: "set" | "ramp";
    value: number;
    time: number;
}

const shadowEvents = new WeakMap<AudioParam, ShadowEvent[]>();

const hasNativeCancelAndHold = (param: AudioParam) =>
    typeof param.cancelAndHoldAtTime === "function";

function track(param: AudioParam, event: ShadowEvent) {
    let events = shadowEvents.get(param);
    if (events == null) {
        events = [];
        shadowEvents.set(param, events);
    }
    // Keep the list sorted by time; scheduling is normally monotonic so
    // this scans at most a step or two from the tail.
    let i = events.length;
    while (i > 0 && events[i - 1].time > event.time) {
        i--;
    }
    events.splice(i, 0, event);
    // Audio time only moves forward, so values before the new event are
    // never queried again — except the segment still in flight, which
    // needs a ramp plus its anchor. Keep the last two earlier events and
    // drop the rest so long-lived channel params (gain / pan / detune
    // offset) don't accumulate events forever.
    if (i > 2) {
        events.splice(0, i - 2);
    }
}

function truncate(param: AudioParam, time: number) {
    const events = shadowEvents.get(param);
    if (events == null) return;
    // Mirror `cancelScheduledValues`: drop events whose time is >= `time`.
    // An in-flight ramp has its event time at the ramp *end*, so it is
    // removed entirely — same as the native behavior.
    let end = events.length;
    while (end > 0 && events[end - 1].time >= time) {
        end--;
    }
    events.length = end;
}

// The value the tracked automation would have at audio time `time`.
// Falls back to `param.value` when nothing is tracked (native-support
// params, or a param whose first scheduled event lies after `time`) —
// the same best-effort answer the old fallback gave.
export function valueAtTime(param: AudioParam, time: number): number {
    const events = shadowEvents.get(param);
    if (events == null || events.length === 0) return param.value;
    let i = events.length - 1;
    while (i >= 0 && events[i].time > time) {
        i--;
    }
    if (i < 0) return param.value;
    const prev = events[i];
    const next = events[i + 1];
    if (next != null && next.type === "ramp") {
        const span = next.time - prev.time;
        if (span <= 0) return next.value;
        return prev.value + ((next.value - prev.value) * (time - prev.time)) / span;
    }
    return prev.value;
}

export function scheduleValueAtTime(param: AudioParam, value: number, time: number) {
    param.setValueAtTime(value, time);
    if (!hasNativeCancelAndHold(param)) {
        track(param, { type: "set", value, time });
    }
}

export function scheduleLinearRamp(param: AudioParam, value: number, time: number) {
    param.linearRampToValueAtTime(value, time);
    if (!hasNativeCancelAndHold(param)) {
        track(param, { type: "ramp", value, time });
    }
}

export function cancelScheduled(param: AudioParam, time: number) {
    param.cancelScheduledValues(time);
    truncate(param, time);
}

export function cancelAndHold(param: AudioParam, time: number) {
    if (hasNativeCancelAndHold(param)) {
        param.cancelAndHoldAtTime(time);
        return;
    }
    const value = valueAtTime(param, time);
    param.cancelScheduledValues(time);
    truncate(param, time);
    param.setValueAtTime(value, time);
    track(param, { type: "set", value, time });
}
