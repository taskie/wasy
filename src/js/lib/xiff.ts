interface Config {
	recursive?: string[];
	bigEndian?: boolean;
	allowOddOffset?: boolean;
}

function dataViewGetString(
	dataView: DataView, byteOffset: number, length: number): string {
	let bytes = new Uint8Array(
		dataView.buffer,
		dataView.byteOffset + byteOffset,
		length);
	return String.fromCharCode.apply(null, bytes);
};

export class Chunk {
	public children: Chunk[];

	constructor(
		public dataView: DataView,
		public name: string,
		public formType: string,
		public config: Config) {
	}

	load() {
		this.children = [];
		var pos = 0;
		while (pos < this.dataView.byteLength) {
			let name = dataViewGetString(this.dataView, pos, 4);
			pos += 4;
			let length = this.dataView.getUint32(pos, !this.config.bigEndian);
			pos += 4;
			let childDataView = new DataView(this.dataView.buffer, this.dataView.byteOffset + pos, length);
			let child: Chunk;
			if (this.config.recursive && this.config.recursive.indexOf(name) != -1) {
				let formType = dataViewGetString(childDataView, 0, 4);
				let newDataView = new DataView(this.dataView.buffer, this.dataView.byteOffset + pos + 4, length - 4);
				child = new Chunk(newDataView, name, formType, this.config);
				child.load();
			} else {
				child = new Chunk(childDataView, name, null, this.config);
			}
			this.children.push(child);
			pos += length;
			if (!this.config.allowOddOffset && pos % 2 == 1) {
				++pos;
			}
		}
	}
}

export let RIFF: Config = { recursive: ["RIFF", "LIST"] }
export let IFF: Config = { bigEndian: true, recursive: ["FORM", "LIST", "CAT "] }
export let SMF: Config = { bigEndian: true, allowOddOffset: true }

export let load = (buffer: ArrayBuffer, config: Config) => {
	let dataView = new DataView(buffer);
	let rootChunk = new Chunk(dataView, null, null, config);
	rootChunk.load();
	return rootChunk;
};
