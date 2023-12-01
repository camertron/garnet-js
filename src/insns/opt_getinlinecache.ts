import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Label } from "../instruction_sequence";
import { Qnil } from "../runtime";

// `opt_getinlinecache` is a wrapper around a series of `putobject` and
// `getconstant` instructions that allows skipping past them if the inline
// cache is currently set. It pushes the value of the cache onto the stack
// if it is set, otherwise it pushes `nil`.
//
// This instruction is no longer used since in Ruby 3.2 it was replaced by
// the consolidated `opt_getconstant_path` instruction.
//
export default class OptGetInlineCache extends Instruction {
    public label: Label;
    public cache: number;

    constructor(label: Label, cache: number) {
        super();

        this.label = label;
        this.cache = cache;
    }

    call(context: ExecutionContext): ExecutionResult {
        // In CRuby, this is going to check if the cache is populated and then
        // potentially jump forward to the label. We're not going to track inline
        // caches in YARV, so we'll just always push nil onto the stack as if the
        // cache weren't yet populated.
        context.stack.push(Qnil);
        return null;
    }

    number(): number {
        return 3;
    }

    pushes(): number {
        return 1;
    }
}
