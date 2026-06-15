import { BlockCallData, CallDataFlag } from "../call_data";
import { Disassembler } from "../disassembler";
import { LocalJumpError } from "../errors";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import { extract_kwargs_from_forwarded_args } from "../util/kwargs_utils";
import Instruction from "../instruction";
import { Qnil } from "../runtime";
import { Hash } from "../runtime/hash";
import { Proc } from "../runtime/proc";

export default class InvokeBlock extends Instruction {
    public call_data: BlockCallData;

    constructor(call_data: BlockCallData) {
        super();

        this.call_data = call_data;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        const frame_yield = context.frame_yield()!;
        const block = frame_yield.block;

        let kwargs: Hash | undefined = undefined;
        if (this.call_data.has_flag(CallDataFlag.KW_SPLAT)) {
            kwargs = context.pop()!.get_data<Hash>();
        } else if (this.call_data.has_flag(CallDataFlag.KWARG)) {
            kwargs = new Hash();
            const keyword_values = context.popn(this.call_data.kw_arg!.length);

            for (let i = 0; i < this.call_data.kw_arg!.length; i ++) {
                const keyword = this.call_data.kw_arg![i];
                await kwargs.set_by_symbol(keyword, keyword_values[i]);
            }
        }

        let args = context.popn(this.call_data.argc);

        // Extract kwargs from the last positional arg if KW_SPLAT_FWD is set.
        // This happens when arguments are forwarded with `...`.
        if (this.call_data.has_flag(CallDataFlag.KW_SPLAT_FWD)) {
            [args, kwargs] = await extract_kwargs_from_forwarded_args(args);
        }

        if (block && block !== Qnil) {
            const result = await block.get_data<Proc>().call(context, args, kwargs, undefined, this.call_data);
            context.push(result);
        } else {
            throw new LocalJumpError("no block given (yield)");
        }

        return null;
    }

    length(): number {
        return 2;
    }

    pushes(): number {
        return 1;
    }

    pops(): number {
        return this.call_data.argc;
    }

    disasm(fmt: Disassembler): string {
        return fmt.instruction("invokeblock", [
            fmt.calldata(this.call_data)
        ]);
    }
}
