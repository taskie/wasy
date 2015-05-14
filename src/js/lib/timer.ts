import SingleEventEmitter from "./single-event-emitter";

export class TimeStamp {
	tick: number;
	oldTick: number;
	currentTime: number;
	delayInSeconds: number;
	ticksPerSecond: number;
	
	accurateTime(tick: number) {
		let diff = (tick - this.oldTick) / this.ticksPerSecond;
		return this.currentTime + this.delayInSeconds + diff;
	}
}

export class Timer {
	tick: number;
	oldTick: number;
	currentTime: number;
	delayInSeconds: number;
	secondsPerBeat: number;
	
	timerId: any;
	_emitter: SingleEventEmitter<TimeStamp>;
	get ticksPerSecond() { return this.resolution / this.secondsPerBeat; }
	set ticksPerSecond(tps: number) { this.secondsPerBeat = this.resolution / tps; } 
	get beatsPerMinute() { return 60 / this.secondsPerBeat; }
	set beatsPerMinute(bpm: number) { this.secondsPerBeat = 60 / bpm; }
	constructor(public audioContext: AudioContext, public resolution: number = 480, public durationInSeconds: number = 0.2) {
		this.beatsPerMinute = 120;
		this.delayInSeconds = 0.2;
		this._emitter = new SingleEventEmitter<TimeStamp>();
	}
	start() {
		this.currentTime = this.audioContext.currentTime;
		this.oldTick = 0;
		this.tick = 0;
		setInterval(this.timing.bind(this), this.durationInSeconds * 1000);
	}
	onTiming(listener: (timeStamp: TimeStamp) => void) {
		this._emitter.on(listener);
	}
	offTiming(listener: (timeStamp: TimeStamp) => void) {
		this._emitter.off(listener);
	}
	timing() {
		this.oldTick = this.tick;
		this.tick += this.ticksPerSecond * this.durationInSeconds;
		this.currentTime = this.audioContext.currentTime;
		this._emitter.emit(this.createTimeStamp());
	}
	createTimeStamp() {
		let timeStamp = new TimeStamp();
		timeStamp.tick = this.tick;
		timeStamp.oldTick = this.oldTick;
		timeStamp.currentTime = this.currentTime;
		timeStamp.delayInSeconds = this.delayInSeconds;
		timeStamp.ticksPerSecond = this.ticksPerSecond;	
		return timeStamp;
	}
	pause() {
		clearInterval(this.timerId);
	}
	restart() {
		setInterval(this.timing.bind(this), this.durationInSeconds * 1000);
	}
}