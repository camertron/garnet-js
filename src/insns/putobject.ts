import ExecutionContext from "../execution_context";
import Instruction from "../instruction";
import { Qfalse, Qtrue, String } from "../runtime";

export default class PutObject extends Instruction {
    public object: any;

    constructor(object: any) {
        super();
        this.object = object;
    }

    call(context: ExecutionContext) {
        if (this.object === true) {
            context.stack.push(Qtrue);
        } else if (this.object === false) {
            context.stack.push(Qfalse);
        } else {
            const type = typeof this.object;
            switch (type) {
                case "string":
                    context.stack.push(String.new(this.object));
                    break;
                default:
                    throw new TypeError(`no implicit conversion of ${type} into Ruby object`);
            }
        }
    }

    reads(): number {
        return 0;
    }

    writes(): number {
        return 1;
    }

    override has_side_effects(): boolean {
        return false;
    }
}
