import * as player from "../player.js";
import * as timer from "../player/timer.js";

interface WorkerScope {
	postMessage(message: unknown): void;
	addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
}

const ctx = self as unknown as WorkerScope;

class PlayerWorker {
	player: player.Player;
	messageListener(event: MessageEvent) {
		switch (event.data.type) {
			case "init":
				this.player = new player.Player(event.data.buffer);
				break;
			case "read": {
				const timeStamp: timer.TimeStamp = event.data.timeStamp;
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
