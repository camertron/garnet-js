import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

export default class SetGlobal extends Instruction {
    public name: string;

    constructor(name: string) {
        super();

        this.name = name;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        const value = context.pop()!;
        // Resolve any aliases to get the canonical global variable name
        const canonical_name = context.resolve_global_alias(this.name);
        context.globals[canonical_name] = value;
        return null;
    }

    length(): number {
        return 2;
    }

    pops(): number {
        return 1;
    }
}
