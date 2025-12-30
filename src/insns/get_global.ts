import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Qnil } from "../runtime";

const frame_locals = ["$~"];

export default class GetGlobal extends Instruction {
    public name: string;

    constructor(name: string) {
        super();

        this.name = name;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        if (frame_locals.indexOf(this.name) > -1) {
            const frame_local = context.frame_svar()!.svars[this.name] || Qnil;
            context.push(frame_local);
        } else {
            // Resolve any aliases to get the canonical global variable name
            const canonical_name = context.resolve_global_alias(this.name);
            context.push(context.globals[canonical_name] || Qnil);
        }

        return null;
    }

    length(): number {
        return 2;
    }

    pushes(): number {
        return 1;
    }
}
