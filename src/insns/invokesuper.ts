import { MethodCallData, CallDataFlag } from "../call_data";
import { NoMethodError } from "../errors";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import { MethodFrame } from "../frame";
import Instruction from "../instruction";
import { InstructionSequence } from "../instruction_sequence";
import { Class, NativeCallable, Object, Proc, RValue, Runtime } from "../runtime";

export default class InvokeSuper extends Instruction {
    public calldata: MethodCallData;
    public block_iseq: InstructionSequence | null;

    constructor(calldata: MethodCallData, block_iseq: InstructionSequence | null) {
        super();

        this.calldata = calldata;
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
                const iseq = this.block_iseq;

                block = Proc.new(new NativeCallable((self: RValue, args: RValue[], block?: RValue): RValue => {
                    return context.run_block_frame(iseq, context.frame!, args);
                }));
            } else if (this.calldata.has_flag(CallDataFlag.ARGS_BLOCKARG)) {
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
        const argb = (this.calldata.has_flag(CallDataFlag.ARGS_BLOCKARG) ? 1 : 0);
        return argb + this.calldata.argc + 1;
    }

    pushes(): number {
        return 1;
    }
}
