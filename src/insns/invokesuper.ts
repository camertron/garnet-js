import { MethodCallData, CallDataFlag } from "../call_data";
import { extract_kwargs_from_forwarded_args } from "../util/kwargs_utils";
import { NoMethodError } from "../errors";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import { BlockFrame, MethodFrame } from "../frame";
import { Module } from "../garnet";
import Instruction from "../instruction";
import { InstructionSequence } from "../instruction_sequence";
import { Hash } from "../runtime/hash";
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

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        const self = context.pop()!;

        let owning_frame: BlockFrame | MethodFrame | null;
        let owner: Module | undefined;
        let mid: string | undefined;

        // Block frames with MethodCallData are possible because of define_method. We have to
        // handle this special case by using the owner that's explicitly attached to the frame.
        // Otherwise we look for the topmost method frame that matches our lexical scope.
        if (context.frame instanceof BlockFrame && context.frame.call_data instanceof MethodCallData) {
            owning_frame = context.frame;
            owner = owning_frame.owner;
            mid = (owning_frame.call_data as MethodCallData).mid;
        } else {
            owning_frame = context.closest_method_frame_matching_current_lexical_scope();
            owner = owning_frame ? owning_frame.owner : undefined;
            mid = owning_frame ? owning_frame.iseq.name : undefined;
        }

        if (owning_frame && owner && mid) {
            const method = await Object.find_super_method_under(self, owner.rval, mid);
            let block = undefined;

            if (this.block_iseq) {
                block = await Proc.from_iseq(context, this.block_iseq);
            } else if (this.call_data.has_flag(CallDataFlag.ARGS_BLOCKARG)) {
                block = context.pop();
            }

            if (method) {
                let result;

                // bare super call, meaning use same call_data as origial callsite to forward args
                if (this.call_data.has_flag(CallDataFlag.ZSUPER)) {
                    // Methods can call yield instead of invoking block.call, meaning the block can be
                    // implicitly passed. Since zsuper forwards all args, we grab the block attached to
                    // the current frame and pass it explicitly.
                    if (!block && context.frame instanceof MethodFrame) {
                        block = context.frame!.block;
                    }

                    const call_data = (context.frame as MethodFrame).call_data;
                    result = method.call(context, self, owning_frame.args, owning_frame.kwargs, block, call_data);
                } else {
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

                    result = method.call(context, self, args, kwargs, block, this.call_data);
                }

                context.push(await result);
                return null;
            }
        }

        const inspect_str = (await Object.send(self, "inspect")).get_data<string>();

        if (mid) {
            throw new NoMethodError(`super: no superclass method \`${mid}' for ${inspect_str}`)
        } else {
            throw new NoMethodError("super called outside of method");
        }
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
