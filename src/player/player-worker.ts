import * as player from "../player.js";
import * as timer from "../player/timer.js";
import { buildSongInfo } from "../smf-analyze.js";

interface WorkerScope {
    postMessage(message: unknown): void;
    addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

const ctx = self as unknown as WorkerScope;

class PlayerWorker {
    player!: player.Player;
    messageListener(event: MessageEvent) {
        switch (event.data.type) {
            case "init": {
                this.player = player.createPlayer(event.data.buffer);
                // Compute analysis (notes / metadata / duration) here on the
                // worker thread so the main thread never has to re-parse the
                // SMF for piano-roll / metadata UI. SongInfo is plain data
                // (no class instances), so structured-clone through postMessage
                // is sufficient — no Event prototype reconstruction needed
                // on the receiving side.
                const songInfo = buildSongInfo(this.player.song);
                ctx.postMessage({ type: "songInfo", songInfo });
                break;
            }
            case "read": {
                const timeStamp: timer.TimeStamp = event.data.timeStamp;
                const newEventsStore = this.player.read(timeStamp.tick);
                ctx.postMessage({ type: "read", newEventsStore, timeStamp });
                break;
            }
            case "seek": {
                const tick: number = event.data.tick;
                for (let i = 0; i < this.player.numberOfTracks; ++i) {
                    this.player.cursors[i] = 0;
                }
                const newEventsStore = this.player.read(tick);
                ctx.postMessage({ type: "seek", newEventsStore, tick });
                break;
            }
            case "resolution":
                ctx.postMessage({ type: "resolution", resolution: this.player.resolution });
                break;
        }
    }
}

const playerWorker = new PlayerWorker();
ctx.addEventListener("message", playerWorker.messageListener.bind(playerWorker));
