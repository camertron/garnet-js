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

    call(context: ExecutionContext): ExecutionResult {
        if (frame_locals.indexOf(this.name) > -1) {
            const frame_local = context.frame_svar()!.svars[this.name] || Qnil;
            context.push(frame_local);
        } else {
            context.push(context.globals[this.name] || Qnil);
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
