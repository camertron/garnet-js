import CallData from "../call_data";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";

export default class OptSendWithoutBlock extends Instruction {
    public call_data: CallData;

    constructor(call_data: CallData) {
        super();
        this.call_data = call_data;
    }

    call(context: ExecutionContext): ExecutionResult {
        const argc = this.call_data.argc + 1;
        const [receiver, ...args] = context.stack.splice(context.stack.length - argc, argc);
        const result = context.call_method(this.call_data, receiver, args);
        context.stack.push(result);
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