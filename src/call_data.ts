export enum CallDataFlag {
    ARGS_SPLAT,    // m(*args)
    ARGS_BLOCKARG, // m(&block)
    FCALL,         // m(...)
    VCALL,         // m
    ARGS_SIMPLE,   // (ci->flag & (SPLAT|BLOCKARG)) && blockiseq == NULL && ci->kw_arg == NULL
    BLOCKISEQ,     // has blockiseq
    KWARG,         // has kwarg
    KW_SPLAT,      // m(**opts)
    TAILCALL,      // located at tail position
    SUPER,         // super
    ZSUPER,        // zsuper
    OPT_SEND,      // internal flag
    KW_SPLAT_MUT   // kw splat hash can be modified (to avoid allocating a new one)
}

const callDataFlagMap = (() => {
    const map: { [key: string]: number } = {};

    Object.keys(CallDataFlag).forEach((flag, index) => {
        map[flag] = index;
    });

    return map;
})();

export abstract class CallData {
    argc: number;
    flag: number;
    kw_arg: any;

    has_flag(flag: CallDataFlag): boolean {
        const index = callDataFlagMap[flag];
        if (!index) { return false; }

        return ((flag & (1 << index)) != 0);
    }

    protected flags(): CallDataFlag[] {
        let result: CallDataFlag[] = [];

        Object.keys(CallDataFlag).forEach((value: string, index: number) => {
            if ((this.flag & (1 << index)) != 0) {
                result.push(CallDataFlag[value as keyof typeof CallDataFlag]);
            }
        });

        return result;
    }
}

export class MethodCallData extends CallData {
    public mid: string;
    public argc: number;
    public flag: number;
    public kw_arg: any;

    constructor(mid: string, argc: number, flag: number, kw_arg: string[] | null) {
        super();

        this.mid = mid;
        this.argc = argc;
        this.flag = flag;
        this.kw_arg = kw_arg;
    }

    static create(method: string, argc: number = 0, flags: number = CallDataFlag.ARGS_SIMPLE, kw_arg: string[] | null = null) {
        return new MethodCallData(method, argc, flags, kw_arg);
    }
}

export class BlockCallData extends CallData {
    public argc: number;
    public flag: number;
    public kw_arg: any;

    constructor(argc: number, flag: number, kw_arg: string[] | null) {
        super();

        this.argc = argc;
        this.flag = flag;
        this.kw_arg = kw_arg;
    }
}