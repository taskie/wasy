"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const player = require("../player");
class PlayerWorker {
    messageListener(event) {
        switch (event.data.type) {
            case "init":
                this.player = new player.Player(event.data.buffer);
                break;
            case "read":
                let timeStamp = event.data.timeStamp;
                let newEventsStore = this.player.read(timeStamp.tick);
                self.postMessage({ type: "read", newEventsStore: newEventsStore, timeStamp }, []);
                break;
            case "resolution":
                self.postMessage({ type: "resolution", resolution: this.player.resolution }, []);
                break;
        }
    }
}
let playerWorker = new PlayerWorker();
self.addEventListener("message", playerWorker.messageListener.bind(playerWorker));
//# sourceMappingURL=player-worker.js.map