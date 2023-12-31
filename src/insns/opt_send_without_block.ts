import { MethodCallData } from "../call_data";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Object } from "../runtime/object"

export default class OptSendWithoutBlock extends Instruction {
    public call_data: MethodCallData;

    constructor(call_data: MethodCallData) {
        super();
        this.call_data = call_data;
    }

    call(context: ExecutionContext): ExecutionResult {
        const argc = this.call_data.argc + 1;
        const [receiver, ...args] = context.popn(argc);
        const result = Object.send(receiver, this.call_data, args);
        context.push(result);
        return null;
    }

    pops(): number {
        return this.call_data.argc + 1;
    }

    pushes(): number {
        return 1;
    }

    length(): number {
        return this.call_data.argc + 1;
    }
}