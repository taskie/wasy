import { dataViewGetString } from "./binary/data-view-util.js";
export class Chunk {
    dataView;
    name;
    formType;
    config;
    children;
    constructor(dataView, name, formType, config) {
        this.dataView = dataView;
        this.name = name;
        this.formType = formType;
        this.config = config;
    }
    load() {
        this.children = [];
        let pos = 0;
        while (pos < this.dataView.byteLength) {
            const name = dataViewGetString(this.dataView, pos, 4);
            pos += 4;
            const length = this.dataView.getUint32(pos, !this.config.bigEndian);
            pos += 4;
            const childDataView = new DataView(this.dataView.buffer, this.dataView.byteOffset + pos, length);
            let child;
            if (this.config.recursive && this.config.recursive.indexOf(name) != -1) {
                const formType = dataViewGetString(childDataView, 0, 4);
                const newDataView = new DataView(this.dataView.buffer, this.dataView.byteOffset + pos + 4, length - 4);
                child = new Chunk(newDataView, name, formType, this.config);
                child.load();
            }
            else {
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
export const configs = {
    riff: { recursive: ["RIFF", "LIST"] },
    iff: { bigEndian: true, recursive: ["FORM", "LIST", "CAT "] },
    smf: { bigEndian: true, allowOddOffset: true },
};
export const load = (buffer, config) => {
    const dataView = new DataView(buffer);
    const rootChunk = new Chunk(dataView, null, null, config);
    rootChunk.load();
    return rootChunk;
};
//# sourceMappingURL=xiff.js.map