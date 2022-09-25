import CallData from "../call_data";
import { ExecutionContext } from "../execution_context";
import Instruction from "../instruction";

export default class OptSendWithoutBlock extends Instruction {
    public call_data: CallData;

    constructor(call_data: CallData) {
        super();
        this.call_data = call_data;
    }

    call(context: ExecutionContext) {
        const argc = this.call_data.argc + 1;
        const [receiver, ...args] = context.stack.splice(context.stack.length - argc, argc);
        const result = context.call_method(this.call_data, receiver, args);
        context.stack.push(result);
    }

    reads(): number {
        return this.call_data.argc + 1;
    }

    writes(): number {
        return 1;
    }
}