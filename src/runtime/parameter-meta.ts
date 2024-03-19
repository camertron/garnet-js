export enum ParameterType {
    REQ,
    OPT,
    REST,
    KEYREQ,
    KEY,
    KEYREST,
    BLOCK
}

const type_map = new Map([
    [ParameterType.REQ, "req"],
    [ParameterType.OPT, "opt"],
    [ParameterType.REST, "rest"],
    [ParameterType.KEYREQ, "keyreq"],
    [ParameterType.KEY, "key"],
    [ParameterType.KEYREST, "keyrest"],
    [ParameterType.BLOCK, "block"]
]);

export class ParameterMetadata {
    public name: string;
    public position: number;
    public type: ParameterType

    constructor(name: string, position: number, type: ParameterType) {
        this.name = name;
        this.position = position;
        this.type = type;
    }

    get type_str(): string {
        return type_map.get(this.type)!;
    }
}


export class ParametersMetadataBuilder {
    public parameters: ParameterMetadata[];

    constructor() {
        this.parameters = [];
    }

    req(name: string, position: number) {
        this.parameters.push(new ParameterMetadata(name, position, ParameterType.REQ));
    }

    opt(name: string, position: number) {
        this.parameters.push(new ParameterMetadata(name, position, ParameterType.OPT));
    }

    rest(name: string, position: number) {
        this.parameters.push(new ParameterMetadata(name, position, ParameterType.REST));
    }

    keyreq(name: string, position: number) {
        this.parameters.push(new ParameterMetadata(name, position, ParameterType.KEYREQ));
    }

    key(name: string, position: number) {
        this.parameters.push(new ParameterMetadata(name, position, ParameterType.KEY));
    }

    keyrest(name: string, position: number) {
        this.parameters.push(new ParameterMetadata(name, position, ParameterType.KEYREST));
    }

    block(name: string, position: number) {
        this.parameters.push(new ParameterMetadata(name, position, ParameterType.BLOCK));
    }
}