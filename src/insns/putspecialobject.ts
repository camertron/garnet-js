import ExecutionContext from "../execution_context";
import Instruction from "../instruction";
import { ConstBase, Qnil } from "../runtime";

enum SpecialObjectType {
    VMCORE = 1,
    CBASE = 2,
    CONST_BASE = 3
}

export default class PutSpecialObject extends Instruction {
    public special_object_type: SpecialObjectType;

    constructor(val: number) {
        super();

        this.special_object_type = ( () => {
            switch (val) {
                case 1: return SpecialObjectType.VMCORE;
                case 2: return SpecialObjectType.CBASE;
                case 3: return SpecialObjectType.CONST_BASE;
                default:
                    throw `putspecialobject insn: unknown value_type ${val}`;
            }
        })();
    }

    call(context: ExecutionContext) {
        switch (this.special_object_type) {
            case SpecialObjectType.CONST_BASE:
                context.stack.push(ConstBase);
                break;
            default:
                context.stack.push(Qnil);
        }
    }

    reads(): number {
        return 0;
    }

    writes(): number {
        return 1;
    }
}
