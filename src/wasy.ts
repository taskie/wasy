import * as midi from "./midi/event.js";
import { createSignal, type Signal } from "./signal.js";
import { SmfPlayer, type TimedEvent } from "./smf-player.js";
import { SynthEngine } from "./synth-engine.js";

export type { TimedEvent };

export class Wasy {
    player: SmfPlayer;
    engine: SynthEngine;
    private _emitter: Signal<TimedEvent>;

    constructor(
        public audioContext: AudioContext,
        destination: AudioNode,
        buffer?: ArrayBuffer,
    ) {
        this.engine = new SynthEngine(audioContext, destination);
        this.player = new SmfPlayer(audioContext, buffer);
        this._emitter = createSignal<TimedEvent>();
        this.player.onTimedEvent((timedEvent) => {
            this._emitter.emit(timedEvent);
            const time = timedEvent.timeStamp.accurateTime(timedEvent.midiEvent.tick);
            this.engine.receiveEvent(timedEvent.midiEvent, time);
        });
    }

    get paused() {
        return this.player.paused;
    }
    get instruments() {
        return this.engine.instruments;
    }
    get gain() {
        return this.engine.gain;
    }
    get dynamicsCompressor() {
        return this.engine.dynamicsCompressor;
    }
    get timer() {
        return this.player.timer;
    }
    // See `SmfPlayer.lookaheadSeconds` — change while stopped.
    get lookaheadSeconds() {
        return this.player.lookaheadSeconds;
    }
    set lookaheadSeconds(seconds: number) {
        this.player.lookaheadSeconds = seconds;
    }
    get playerWorker() {
        return this.player.playerWorker;
    }

    play() {
        this.player.play();
    }

    pause() {
        this.player.pause();
        this.engine.pause();
    }

    resume() {
        this.player.resume();
    }

    seek(tick: number) {
        this.engine.pause();
        this.player.seek(tick);
    }

    load(buffer: ArrayBuffer): Promise<void> {
        this.engine.pause();
        // GM power-on state for the incoming song — programs and
        // controllers must not leak from the previous song (e.g. an
        // expression fade-out at the end of song A silencing song B).
        this.engine.applyResetAll();
        return this.player.load(buffer);
    }

    get ready(): Promise<void> {
        return this.player.ready;
    }

    unload() {
        this.player.unload();
        this.engine.pause();
        this.engine.applyResetAll();
    }

    // See `SynthEngine.prewarm` — fires inaudible NoteOn/NoteOff on every
    // channel to pay Web Audio cold-start cost before real playback begins.
    // Typical use: `await wasy.ready; wasy.prewarm(); wasy.play()`.
    prewarm(time?: number) {
        this.engine.prewarm(time);
    }

    destroy() {
        this.player.destroy();
        this.engine.destroy();
        this._emitter.offAll();
    }

    receiveExternalMidiEvent(event: midi.Event) {
        const time = this.audioContext.currentTime;
        this.engine.receiveEvent(event, time);
        const timeStamp = this.player.createTimeStamp();
        timeStamp.currentTime = time;
        this._emitter.emit({ timeStamp, midiEvent: event });
    }

    onTimedEvent(listener: (event: TimedEvent) => void) {
        this._emitter.on(listener);
    }

    offTimedEvent(listener: (event: TimedEvent) => void) {
        this._emitter.off(listener);
    }
}
