export interface Config {
    recursive?: string[];
    bigEndian?: boolean;
    allowOddOffset?: boolean;
}
export declare class Chunk {
    dataView: DataView;
    name: string;
    formType: string | null;
    config: Config;
    children: Chunk[];
    constructor(dataView: DataView, name: string, formType: string | null, config: Config);
    load(): void;
}
export declare let configs: {
    [key: string]: Config;
};
export declare let load: (buffer: ArrayBuffer, config: Config) => Chunk;
