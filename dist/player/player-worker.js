import * as player from "../player.js";
const ctx = self;
class PlayerWorker {
    player;
    messageListener(event) {
        switch (event.data.type) {
            case "init":
                this.player = new player.Player(event.data.buffer);
                break;
            case "read": {
                const timeStamp = event.data.timeStamp;
                const newEventsStore = this.player.read(timeStamp.tick);
                ctx.postMessage({ type: "read", newEventsStore, timeStamp });
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
//# sourceMappingURL=player-worker.js.map