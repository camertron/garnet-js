import { MethodCallData, CallDataFlag } from "../call_data";
import { NoMethodError } from "../errors";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import { MethodFrame } from "../frame";
import Instruction from "../instruction";
import { InstructionSequence } from "../instruction_sequence";
import { Class } from "../runtime";
import { Object } from "../runtime/object";
import { Proc } from "../runtime/proc";

export default class InvokeSuper extends Instruction {
    public call_data: MethodCallData;
    public block_iseq: InstructionSequence | null;

    constructor(call_data: MethodCallData, block_iseq: InstructionSequence | null) {
        super();

        this.call_data = call_data;
        this.block_iseq = block_iseq;
    }

    call(context: ExecutionContext): ExecutionResult {
        const self = context.pop()!;
        const superclass = self.klass.get_data<Class>().superclass;
        const method_frame = (context.frame! as MethodFrame);

        if (superclass) {
            const method = Object.find_method_under(superclass, method_frame.name);
            let block = undefined;

            if (this.block_iseq) {
                block = Proc.from_iseq(context, this.block_iseq);
            } else if (this.call_data.has_flag(CallDataFlag.ARGS_BLOCKARG)) {
                block = context.pop();
            }

            if (method) {
                const result = method.call(context, self, method_frame.args, block);
                context.push(result);
                return null;
            }
        }

        const inspect_str = Object.send(self, "inspect").get_data<string>();
        throw new NoMethodError(`super: no superclass method \`${method_frame.name}' for ${inspect_str}`)
    }

    length(): number {
        return 3;
    }

    pops(): number {
        const argb = (this.call_data.has_flag(CallDataFlag.ARGS_BLOCKARG) ? 1 : 0);
        return argb + this.call_data.argc + 1;
    }

    pushes(): number {
        return 1;
    }
}
