import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Class, ClassClass, ConstBase, Qnil } from "../runtime";

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

    call(context: ExecutionContext): ExecutionResult {
        switch (this.type) {
            case SpecialObjectType.VMCORE:
                throw new Error("Special object type VMCORE is not currently supported");

            case SpecialObjectType.CBASE:
                let value = context.frame!.self;

                if (value.klass != ClassClass) {
                    value = value.get_data<Class>().get_singleton_class();
                }

                context.stack.push(value);
                break;

            case SpecialObjectType.CONST_BASE:
                context.stack.push(ConstBase);
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
