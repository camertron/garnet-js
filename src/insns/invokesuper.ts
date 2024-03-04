import { MethodCallData, CallDataFlag } from "../call_data";
import { NoMethodError } from "../errors";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import { MethodFrame } from "../frame";
import Instruction from "../instruction";
import { InstructionSequence } from "../instruction_sequence";
import { Class, ClassClass, Module, ModuleClass, Qtrue } from "../runtime";
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
        const method_frame = context.frame as MethodFrame;
        const owner = (context.frame as MethodFrame).owner;

        if (owner) {
            const method = Object.find_super_method_under(self, owner, method_frame.call_data.mid);
            let block = undefined;

            if (this.block_iseq) {
                block = Proc.from_iseq(context, this.block_iseq);
            } else if (this.call_data.has_flag(CallDataFlag.ARGS_BLOCKARG)) {
                block = context.pop();
            }

            if (method) {
                let call_data;

                // bare super call, meaning use same call_data as origial callsite to forward args
                if (this.call_data.has_flag(CallDataFlag.ZSUPER)) {
                    call_data = (context.frame as MethodFrame).call_data;
                } else {
                    call_data = this.call_data;
                }

                const result = method.call(context, self, method_frame.args, method_frame.kwargs, block, call_data);
                context.push(result);
                return null;
            }
        }

        const inspect_str = Object.send(self, "inspect").get_data<string>();
        throw new NoMethodError(`super: no superclass method \`${method_frame.call_data.mid}' for ${inspect_str}`)
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
