"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const data_view_util_1 = require("./binary/data-view-util");
class Chunk {
    constructor(dataView, name, formType, config) {
        this.dataView = dataView;
        this.name = name;
        this.formType = formType;
        this.config = config;
    }
    load() {
        this.children = [];
        var pos = 0;
        while (pos < this.dataView.byteLength) {
            let name = data_view_util_1.dataViewGetString(this.dataView, pos, 4);
            pos += 4;
            let length = this.dataView.getUint32(pos, !this.config.bigEndian);
            pos += 4;
            let childDataView = new DataView(this.dataView.buffer, this.dataView.byteOffset + pos, length);
            let child;
            if (this.config.recursive && this.config.recursive.indexOf(name) != -1) {
                let formType = data_view_util_1.dataViewGetString(childDataView, 0, 4);
                let newDataView = new DataView(this.dataView.buffer, this.dataView.byteOffset + pos + 4, length - 4);
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
exports.Chunk = Chunk;
exports.configs = {
    riff: { recursive: ["RIFF", "LIST"] },
    iff: { bigEndian: true, recursive: ["FORM", "LIST", "CAT "] },
    smf: { bigEndian: true, allowOddOffset: true },
};
exports.load = (buffer, config) => {
    let dataView = new DataView(buffer);
    let rootChunk = new Chunk(dataView, null, null, config);
    rootChunk.load();
    return rootChunk;
};
//# sourceMappingURL=xiff.js.map