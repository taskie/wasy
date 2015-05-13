import * as player from "./lib/player";
import * as timer from "./lib/timer";

class PlayerWorker
{
	player: player.Player;
	messageListener (event: MessageEvent) {
		switch (event.data.type) {
			case "init":
				this.player = new player.Player(event.data.buffer);
				break;
			case "read":
				let timeStamp: timer.TimeStamp = event.data.timeStamp;
				let newEventsStore = this.player.read(timeStamp.tick);
				self.postMessage({type: "read", newEventsStore: newEventsStore, timeStamp}, null);
				break;
			case "resolution":
				self.postMessage({type: "resolution", resolution: this.player.resolution}, null);
				break;
		}
	}
}

let playerWorker = new PlayerWorker();
self.addEventListener("message", playerWorker.messageListener.bind(playerWorker));
