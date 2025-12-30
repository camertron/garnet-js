import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { VMCore } from "../runtime";

export enum SpecialObjectType {
    VMCORE = 1,
    CBASE = 2,
    CONST_BASE = 3
}

export default class PutSpecialObject extends Instruction {
    public type: SpecialObjectType;

    constructor(type: SpecialObjectType) {
        super();

        this.type = type;
    }

    async call(context: ExecutionContext): Promise<ExecutionResult> {
        switch (this.type) {
            case SpecialObjectType.VMCORE:
                context.push(VMCore);
                break;

            case SpecialObjectType.CBASE:
                // CBASE pushes the constant base for the current lexical scope,
                // which is the last element in the nesting array.
                // This is used for operations like alias that need to know
                // which class/module they're being defined in.
                context.push(context.const_base);
                break;

            case SpecialObjectType.CONST_BASE:
                // CONST_BASE is the same as CBASE but may skip eval frames.
                // For now, we treat them the same.
                context.push(context.const_base);
                break;
        }

        return null;
    }

    pops(): number {
        return 0;
    }

    pushes(): number {
        return 1;
    }
}
