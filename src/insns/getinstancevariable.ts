import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

export default class GetInstanceVariable extends Instruction {
    public name: string;
    public cache: number;

    constructor(name: string, cache: number) {
        super();
        this.name = name;
        this.cache = cache;
    }

    call(context: ExecutionContext): ExecutionResult {
        context.push(
            context.frame!.self.iv_get(this.name)
        );

        return null;
    }

    reads(): number {
        return 0;
    }

    writes(): number {
        return 1;
    }
}
