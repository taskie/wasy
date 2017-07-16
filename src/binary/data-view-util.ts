export function dataViewGetSubDataView(dataView: DataView, byteOffset: number, byteLength?: number) {
	if (typeof byteLength === "undefined") {
		byteLength = dataView.byteLength - byteOffset;
	}
	return new DataView(dataView.buffer, dataView.byteOffset + byteOffset, byteLength);
}

export function dataViewGetUint(dataView: DataView, byteOffset: number, isLittleEndian: boolean, byteLength?: number) {
	var value = 0;
	if (typeof byteLength === "undefined") {
		byteLength = dataView.byteLength - byteOffset;
	}
	if (isLittleEndian) {
		for (var i = byteLength - 1; i >= 0; --i) {
			value = (value << 8) + dataView.getUint8(byteOffset + i);
		}
	} else {
		for (var i = 0; i < byteLength; ++i) {
			value = (value << 8) + dataView.getUint8(byteOffset + i);
		}
	}
	return value;
}

export function dataViewGetUintVariable(dataView: DataView, byteOffset: number) {
	var value = 0;
	var pos = 0;
	for (; ;) {
		let byte = dataView.getUint8(byteOffset + pos);
		++pos;
		let msb = byte & 0b10000000;
		let val = byte & 0b01111111;
		value = (value << 7) + val;
		if (!msb) { break; }
	}
	return { value, byteLength: pos };
}

export function dataViewGetString(dataView: DataView, byteOffset: number, length: number): string {
	let bytes = new Uint8Array(
		dataView.buffer,
		dataView.byteOffset + byteOffset,
		length);
	return String.fromCharCode.apply(null, bytes);
};
