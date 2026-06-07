import { RValue } from "./runtime";
import { Hash } from "./runtime/hash";

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
    KW_SPLAT_MUT  = 2 ** 12, // kw splat hash can be modified (to avoid allocating a new one)
    KW_SPLAT_FWD  = 2 ** 13  // kw splat hash is forwarded at end of positional args
}

export abstract class CallData {
    public argc: number;
    public flag: number;
    public kw_arg: string[] | null;

    has_flag(flag: CallDataFlag): boolean {
        return (this.flag & flag) != 0;
    }

    includes_block(): boolean {
        return this.has_flag(CallDataFlag.ARGS_BLOCKARG) || this.has_flag(CallDataFlag.BLOCKISEQ);
    }

    to_s() {
        const names = this.names();
        const parts = [];

        parts.push(`argc:${this.argc}`);

        if (this.kw_arg) parts.push(`kw:[${this.kw_arg.join(", ")}]`);
        if (names.length > 0) parts.push(names.join("|"));

        return `<calldata!${parts.join(", ")}>`
    }

    names(): string[] {
        const names = [];
        if (this.has_flag(CallDataFlag.ARGS_SPLAT)) names.push("ARGS_SPLAT");
        if (this.has_flag(CallDataFlag.ARGS_BLOCKARG)) names.push("ARGS_BLOCKARG");
        if (this.has_flag(CallDataFlag.FCALL)) names.push("FCALL");
        if (this.has_flag(CallDataFlag.VCALL)) names.push("VCALL");
        if (this.has_flag(CallDataFlag.ARGS_SIMPLE)) names.push("ARGS_SIMPLE");
        if (this.has_flag(CallDataFlag.KWARG)) names.push("KWARG");
        if (this.has_flag(CallDataFlag.KW_SPLAT)) names.push("KW_SPLAT");
        if (this.has_flag(CallDataFlag.TAILCALL)) names.push("TAILCALL");
        if (this.has_flag(CallDataFlag.SUPER)) names.push("SUPER");
        if (this.has_flag(CallDataFlag.ZSUPER)) names.push("ZSUPER");
        if (this.has_flag(CallDataFlag.OPT_SEND)) names.push("OPT_SEND");
        if (this.has_flag(CallDataFlag.KW_SPLAT_MUT)) names.push("KW_SPLAT_MUT");

        return names;
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

    to_s() {
        const names = this.names();
        const parts = [];

        parts.push(`mid:${this.mid}`);
        parts.push(`argc:${this.argc}`);

        if (this.kw_arg && this.kw_arg.length > 0) parts.push(`kw:[${this.kw_arg.join(", ")}]`);
        if (names.length > 0) parts.push(names.join("|"));

        return `<calldata!${parts.join(", ")}>`
    }

    static create(method: string, argc: number = 0, flags: number = CallDataFlag.ARGS_SIMPLE, kw_arg: string[] | null = null) {
        return new MethodCallData(method, argc, flags, kw_arg);
    }

    static from_args(method: string, args: RValue[], kwargs?: Hash, block?: RValue) {
        let flag = CallDataFlag.FCALL;
        if (block) flag |= CallDataFlag.ARGS_BLOCKARG;
        if (kwargs) flag |= CallDataFlag.KWARG;

        return MethodCallData.create(
            method,
            args.length,
            flag,
            kwargs ? Array.from(kwargs.keys.values()).map(elem => elem.get_data<string>()) : null
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
