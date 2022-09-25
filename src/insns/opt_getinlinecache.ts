import { ExecutionContext } from "../execution_context";
import Instruction from "../instruction";
import { Qnil } from "../runtime";

export default class OptGetInlineCache extends Instruction {
    public label: string;
    public cache: number;

    constructor(label: string, cache: number) {
        super();

        this.label = label;
        this.cache = cache;
    }

    call(context: ExecutionContext) {
        // In CRuby, this is going to check if the cache is populated and then
        // potentially jump forward to the label. We're not going to track inline
        // caches in YARV, so we'll just always push nil onto the stack as if the
        // cache weren't yet populated.
        context.stack.push(Qnil);
    }

    reads(): number {
        return 0;
    }

    writes(): number {
        return 1;
    }
}
