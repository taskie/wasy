import * as player from "../player";
import * as timer from "../player/timer";

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
				(<any> self.postMessage)({type: "read", newEventsStore: newEventsStore, timeStamp}, []);
				break;
			case "resolution":
				(<any> self.postMessage)({type: "resolution", resolution: this.player.resolution}, []);
				break;
		}
	}
}

let playerWorker = new PlayerWorker();
self.addEventListener("message", playerWorker.messageListener.bind(playerWorker));
