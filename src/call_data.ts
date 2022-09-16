enum CallDataFlag {
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

export default class CallData {
    public mid: string;
    public argc: number;
    public flag: number;

    constructor(mid: string, argc: number, flag: number) {
        this.mid = mid;
        this.argc = argc;
        this.flag = flag;
    }

    private flags(): CallDataFlag[] {
        let result: CallDataFlag[] = [];

        Object.keys(CallDataFlag).forEach( (value: string, index: number) => {
            if ((this.flag & (1 << index)) != 0) {
                result.push(CallDataFlag[value as keyof typeof CallDataFlag]);
            }
        });

        return result;
    }
}