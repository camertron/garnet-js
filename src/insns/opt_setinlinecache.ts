import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

export default class OptSetInlineCache extends Instruction {
    public cache: number;

    constructor(cache: number) {
        super();

        this.cache = cache;
    }

    async call(_context: ExecutionContext): Promise<ExecutionResult> {
        // Since we're not actually populating inline caches in YARV, we don't need
        // to do anything in this instruction.
        return null;
    }
}
