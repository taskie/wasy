export interface Config {
    recursive?: string[];
    bigEndian?: boolean;
    allowOddOffset?: boolean;
}
export declare class Chunk {
    dataView: DataView;
    name: string | null;
    formType: string | null;
    config: Config;
    children: Chunk[];
    constructor(dataView: DataView, name: string | null, formType: string | null, config: Config);
    load(): void;
}
export declare const configs: {
    [key: string]: Config;
};
export declare const load: (buffer: ArrayBuffer, config: Config) => Chunk;
//# sourceMappingURL=xiff.d.ts.map