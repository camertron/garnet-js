import { MethodCallData, CallDataFlag } from "../call_data";
import { extract_kwargs_from_forwarded_args } from "../util/kwargs_utils";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Object } from "../runtime/object"
import { Hash } from "../runtime/hash";

export default class OptSendWithoutBlock extends Instruction {
    public call_data: MethodCallData;

    constructor(call_data: MethodCallData) {
        super();
        this.call_data = call_data;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        const argc = this.call_data.argc + 1;
        let [receiver, ...args] = context.popn(argc);

        // Extract kwargs from the last positional arg if KW_SPLAT_FWD is set.
        // This happens when arguments are forwarded with `...`.
        let kwargs: Hash | undefined = undefined;
        if (this.call_data.has_flag(CallDataFlag.KW_SPLAT_FWD)) {
            [args, kwargs] = await extract_kwargs_from_forwarded_args(args);
        }

        const result = await Object.send(receiver, this.call_data, args, kwargs);
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