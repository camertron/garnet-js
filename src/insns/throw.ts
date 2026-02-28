import { LocalJumpError, NotImplementedError } from "../errors";
import { BreakError, ExecutionContext, ExecutionResult, NextError, RetryError, ReturnError, ThrowNoneError, ThrowType } from "../execution_context";
import { NilClass, Qnil } from "../runtime";
import Instruction from "../instruction";
import { Object } from "../runtime/object";

const THROW_STATE_MASK = 0xff;

export default class Throw extends Instruction {
    public type: ThrowType;

    constructor(type: ThrowType) {
        super();

        this.type = type;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        const state = this.type & THROW_STATE_MASK;
        const value = context.pop()!;

        switch (state) {
            // Used to signal the end of a rescue or ensure block
            case ThrowType.NONE:
                if (value.klass == NilClass) {
                    throw new ThrowNoneError(Qnil);
                } else if ((await Object.send(value, "is_a?", [(await Object.find_constant("Exception"))!])).is_truthy()) {
                    throw value;
                } else {
                    throw new NotImplementedError("unexpected throw type and value combination");
                }

            case ThrowType.RETURN:
                const frame = context.closest_method_frame_matching_current_lexical_scope();

                if (!frame) {
                    throw new LocalJumpError("unexpected return");
                }

                throw new ReturnError(value, frame);

            case ThrowType.BREAK:
                throw new BreakError(value);

            case ThrowType.NEXT:
                throw new NextError(value);

            case ThrowType.RETRY:
                throw new RetryError(value);

            case ThrowType.RAISE:
                throw value;

            default:
                throw new NotImplementedError(`Unknown throw kind ${state}`);
        }

        return null;
    }

    pops(): number {
        return 1;
    }

    pushes(): number {
        return 1;
    }

    length(): number {
        return 2;
    }
}
