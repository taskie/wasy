import * as player from "./player";
import * as smf from "./smf";
import { EventEmitter } from "events";

var midiPlayer: player.Player;

document.addEventListener("DOMContentLoaded", (e) => {
    document.querySelector("#playButton").addEventListener("click", (e) => {
		let req = new XMLHttpRequest();
		req.open("GET", "./midi/test.mid", true);
		req.responseType = "arraybuffer";
		req.onload = (e) => {
			console.log(e);
			var buffer = req.response;
			if (buffer) {
				midiPlayer = new player.Player(buffer);
				(<any>window).midiPlayer = midiPlayer;
				midiPlayer.channels[9].on("all", (e: smf.Event) => {
					if (e instanceof smf.TempoMetaEvent) {
						console.log("Tempo:", e.beatsPerMinute, e.rawTempo, e);
					}
					console.log(e.tick, e.toWebMidiLinkString());
				});
				midiPlayer.play();
			}
		};
		req.send(null);
	});	
});