import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Class, ClassClass, ModuleClass, VMCore } from "../runtime";

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
                let value = context.frame!.self;

                if (value.klass != ClassClass && value.klass != ModuleClass) {
                    value = value.get_data<Class>().get_singleton_class();
                }

                context.push(value);
                break;

            case SpecialObjectType.CONST_BASE:
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
