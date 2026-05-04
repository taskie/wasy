import { dataViewGetString } from "./binary/data-view-util.js";

export interface Config {
    recursive?: string[];
    bigEndian?: boolean;
    allowOddOffset?: boolean;
}

export interface Chunk {
    dataView: DataView;
    name: string | null;
    formType: string | null;
    children: Chunk[];
}

const parseChildren = (dataView: DataView, config: Config): Chunk[] => {
    const children: Chunk[] = [];
    let pos = 0;
    while (pos < dataView.byteLength) {
        const name = dataViewGetString(dataView, pos, 4);
        pos += 4;
        const length = dataView.getUint32(pos, !config.bigEndian);
        pos += 4;
        const childDataView = new DataView(dataView.buffer, dataView.byteOffset + pos, length);
        let child: Chunk;
        if (config.recursive && config.recursive.indexOf(name) !== -1) {
            const formType = dataViewGetString(childDataView, 0, 4);
            const inner = new DataView(dataView.buffer, dataView.byteOffset + pos + 4, length - 4);
            child = { dataView: inner, name, formType, children: parseChildren(inner, config) };
        } else {
            child = { dataView: childDataView, name, formType: null, children: [] };
        }
        children.push(child);
        pos += length;
        if (!config.allowOddOffset && pos % 2 === 1) {
            ++pos;
        }
    }
    return children;
};

export const configs: { [key: string]: Config } = {
    riff: { recursive: ["RIFF", "LIST"] },
    iff: { bigEndian: true, recursive: ["FORM", "LIST", "CAT "] },
    smf: { bigEndian: true, allowOddOffset: true },
};

export const parseChunks = (buffer: ArrayBuffer, config: Config): Chunk[] => {
    return parseChildren(new DataView(buffer), config);
};
