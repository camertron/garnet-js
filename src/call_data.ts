import { Kwargs, RValue } from "./runtime";

export enum CallDataFlag {
    ARGS_SPLAT    = 2 ** 0,  // m(*args)
    ARGS_BLOCKARG = 2 ** 1,  // m(&block)
    FCALL         = 2 ** 2,  // m(...)
    VCALL         = 2 ** 3,  // m
    ARGS_SIMPLE   = 2 ** 4,  // (ci->flag & (SPLAT|BLOCKARG)) && blockiseq == NULL && ci->kw_arg == NULL
    BLOCKISEQ     = 2 ** 5,  // has blockiseq
    KWARG         = 2 ** 6,  // has kwarg
    KW_SPLAT      = 2 ** 7,  // m(**opts)
    TAILCALL      = 2 ** 8,  // located at tail position
    SUPER         = 2 ** 9,  // super
    ZSUPER        = 2 ** 10, // zsuper
    OPT_SEND      = 2 ** 11, // internal flag
    KW_SPLAT_MUT  = 2 ** 12  // kw splat hash can be modified (to avoid allocating a new one)
}

export abstract class CallData {
    public argc: number;
    public flag: number;
    public kw_arg: string[] | null;

    has_flag(flag: CallDataFlag): boolean {
        return (this.flag & flag) != 0;
    }
}

export class MethodCallData extends CallData {
    public mid: string;
    public argc: number;
    public flag: number;
    public kw_arg: string[] | null;

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

    static from_args(method: string, args: RValue[], kwargs?: Kwargs, block?: RValue) {
        let flag = CallDataFlag.FCALL;
        if (block) flag |= CallDataFlag.ARGS_BLOCKARG;
        if (kwargs) flag |= CallDataFlag.KWARG;

        return MethodCallData.create(
            method,
            args.length,
            flag,
            kwargs ? Array.from(kwargs.keys()) : null
        );
    }
}

export class BlockCallData extends CallData {
    public argc: number;
    public flag: number;
    public kw_arg: string[] | null;

    private static _empty: BlockCallData;

    static empty(): BlockCallData {
        if (!this._empty) {
            this._empty = BlockCallData.create(0);
        }

        return this._empty;
    }

    constructor(argc: number, flag: number, kw_arg: string[] | null) {
        super();

        this.argc = argc;
        this.flag = flag;
        this.kw_arg = kw_arg;
    }

    static create(argc: number = 0, flags: number = CallDataFlag.ARGS_SIMPLE, kw_arg: string[] | null = null) {
        return new BlockCallData(argc, flags, kw_arg);
    }
}
