import * as xiff from "./xiff.js";
import * as dvu from "./binary/data-view-util.js";
import * as midi from "./midi/event.js";

export interface Header {
	format: number;
	numberOfTracks: number;
	resolution: number;
}

export const parseHeader = (dataView: DataView): Header => ({
	format: dataView.getUint16(0, false),
	numberOfTracks: dataView.getUint16(2, false),
	resolution: dataView.getUint16(4, false),
});

const buildEvent = (dataView: DataView, tick: number, status: number, byteOffset: number): midi.Event => {
	let length = 0;
	switch (status & 0b11110000) {
		case 0x80:
		case 0x90:
		case 0xA0:
		case 0xE0:
			length = 2;
			break;
		case 0xB0:
			length = 2;  // FIXME: OMNI OFF / MONO
			break;
		case 0xC0:
		case 0xD0:
			length = 1;
			break;
		case 0xF0:
			if (status === 0xFF) {
				const { byteLength, value } = dvu.dataViewGetUintVariable(dataView, byteOffset + 1);
				length = 1 + byteLength + value;
			} else {
				const { byteLength, value } = dvu.dataViewGetUintVariable(dataView, byteOffset);
				length = byteLength + value;
			}
			break;
	}
	const eventDataView = new DataView(dataView.buffer, dataView.byteOffset + byteOffset, length);
	return midi.Event.create(eventDataView, tick, status);
};

export interface Track {
	events: midi.Event[];
}

export const parseTrack = (dataView: DataView): Track => {
	let pos = 0;
	let tick = 0;
	let status = 0x00;
	const events: midi.Event[] = [];
	while (pos < dataView.byteLength) {
		{
			const { byteLength, value } = dvu.dataViewGetUintVariable(dataView, pos);
			pos += byteLength;
			tick += value;
		}
		{
			const byte = dataView.getUint8(pos);
			const msb = byte & 0b10000000;
			if (msb) {
				status = byte;
				++pos;
			}
			const event = buildEvent(dataView, tick, status, pos);
			pos += event.dataView.byteLength;
			events.push(event);
		}
	}
	return { events };
};

export interface Song {
	header: Header;
	tracks: Track[];
}

export const parseSong = (buffer: ArrayBuffer): Song => {
	const chunks = xiff.parseChunks(buffer, xiff.configs.smf);
	let header: Header | undefined;
	const tracks: Track[] = [];
	for (const chunk of chunks) {
		switch (chunk.name) {
			case "MThd":
				header = parseHeader(chunk.dataView);
				break;
			case "MTrk":
				tracks.push(parseTrack(chunk.dataView));
				break;
			default:
				break;
		}
	}
	if (header == null) {
		throw new Error("smf: missing MThd chunk");
	}
	if (header.format === 2) {
		console.warn("wasy: SMF Format 2 is not supported; tracks will be played as if Format 1.");
	}
	return { header, tracks };
};
