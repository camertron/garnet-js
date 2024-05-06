import { LocalJumpError, NotImplementedError } from "../errors";
import { BreakError, ExecutionContext, ExecutionResult, NextError, ReturnError } from "../execution_context";
import { NilClass } from "../runtime";
import Instruction from "../instruction";
import { Object } from "../runtime/object";

export enum ThrowType {
    NONE = 0x0,
    RETURN = 0x1,
    BREAK = 0x2,
    NEXT = 0x3,
    RETRY = 0x4,
    REDO = 0x5,
    RAISE = 0x6,
    THROW = 0x7,
    FATAL = 0x8
}

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
            case ThrowType.NONE:
                if (value.klass == NilClass) {
                    // do nothing
                } else if ((await Object.send(value, "is_a?", [(await Object.find_constant("Exception"))!])).is_truthy()) {
                    throw value;
                } else {
                    throw new NotImplementedError("unexpected throw type and value combination");
                }

                break;

            case ThrowType.RETURN:
                const frame = context.topmost_method_frame_matching_current_lexical_scope();

                if (!frame) {
                    throw new LocalJumpError("unexpected return");
                }

                throw new ReturnError(value, frame);

            case ThrowType.BREAK:
                throw new BreakError(value);

            case ThrowType.NEXT:
                throw new NextError(value);

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
