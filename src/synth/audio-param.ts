// Cancel-and-hold scheduling for AudioParams, implemented with a shadow
// event list instead of the native `cancelAndHoldAtTime`.
//
// Why not the native method (Chrome / Safari)? Per spec it only inserts a
// hold event when it actually truncates something that spans the cancel
// time. In the common "release a sustained note" case every scheduled
// event (the attack ramp) lies *before* the hold time, so nothing is
// inserted — and a subsequent `linearRampToValueAtTime` then anchors at
// the previous event (the attack end). The gain audibly starts falling
// the moment the ramp is inserted, i.e. at dispatch time, a full
// lookahead before the musical NoteOff (clearly audible at 500 ms).
// Firefox lacks `cancelAndHoldAtTime` entirely (Bugzilla 1308431).
// The portable fix for both problems is the same: compute the value the
// automation would have at the hold time and pin it with an explicit
// anchor event, so later ramps start exactly there. The anchor is a
// linear ramp (see `cancelAndHold`) so that cancelling an in-flight
// decay also *reconstructs* the segment between the previous event and
// the hold time instead of snapping back to the previous event's value.
//
// The shadow list makes that value computable: this codebase schedules
// only `setValueAtTime` and `linearRampToValueAtTime`, so all scheduling
// must go through the helpers below to keep the list in sync, and
// `valueAtTime` can interpolate linearly.

interface ShadowEvent {
    type: "set" | "ramp";
    value: number;
    time: number;
}

const shadowEvents = new WeakMap<AudioParam, ShadowEvent[]>();

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
    // Bound growth on long-lived channel params (gain / pan / detune
    // offset) by dropping the oldest events. The keep-count must cover a
    // full AHDSFR note envelope (up to ~6 events): `cancelAndHold` may be
    // asked for a value *earlier* than already-inserted future events
    // (NoteOff lands mid-attack while decay / fade are already scheduled),
    // so pruning too aggressively would push the query off the front of
    // the list and fall back to the stale `param.value`.
    if (i > 8) {
        events.splice(0, i - 8);
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
// Falls back to `param.value` when nothing is tracked — correct for a
// param nothing was ever scheduled on, and the best available answer for
// a param whose first scheduled event lies after `time`.
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
    track(param, { type: "set", value, time });
}

export function scheduleLinearRamp(param: AudioParam, value: number, time: number) {
    param.linearRampToValueAtTime(value, time);
    track(param, { type: "ramp", value, time });
}

export function cancelScheduled(param: AudioParam, time: number) {
    param.cancelScheduledValues(time);
    truncate(param, time);
}

// Cancel everything scheduled at or after `time` and pin the param at the
// value the automation would have reached at `time`. The anchor is a
// *ramp*, not a `setValueAtTime`, and that is load-bearing twice over:
//   1. It guarantees a following ramp starts at `time`, never at some
//      stale earlier event (the sustained-release bug).
//   2. `cancelScheduledValues(time)` removes an in-flight ramp that spans
//      `time` *entirely* (its event time is the ramp end), which would
//      snap the value back to the previous event for the whole lookahead
//      window — audible as an expired cymbal swelling back to peak before
//      the next hit. Ramping from the previous event to `(time, value)`
//      reconstructs the truncated segment exactly, because `value` lies
//      on the original line.
export function cancelAndHold(param: AudioParam, time: number) {
    const value = valueAtTime(param, time);
    param.cancelScheduledValues(time);
    truncate(param, time);
    param.linearRampToValueAtTime(value, time);
    track(param, { type: "ramp", value, time });
}
