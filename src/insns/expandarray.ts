import { MethodCallData } from "../call_data";
import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Array, ArrayClass, Qnil, Qtrue, RValue, Runtime } from "../runtime";

export enum ExpandArrayFlag {
    SPLAT_FLAG = 0x01,
    POSTARG_FLAG = 0x02
}

export default class ExpandArray extends Instruction {
    public size: number;
    public flags: number;

    constructor(size: number, flags: number) {
        super();

        this.size = size;
        this.flags = flags;
    }

    call(context: ExecutionContext): ExecutionResult {
        let object = context.pop()!;

        object = (() => {
            if (object.klass == ArrayClass) {
                // dup
                return new RValue(ArrayClass, new Array([...object.get_data<Array>().elements]));
            } else if (context.call_method(MethodCallData.create("respond_to?", 1), object, [Runtime.intern("to_ary"), Qtrue]).is_truthy()) {
                return context.call_method(MethodCallData.create("to_ary", 0), object, []);
            } else {
                return Array.new([object]);
            }
        })();

        const splat_flag = (this.flags & ExpandArrayFlag.SPLAT_FLAG) > 0;
        const postarg_flag = (this.flags & ExpandArrayFlag.POSTARG_FLAG) > 0;
        const obj_data = object.get_data<Array>().elements;

        if (this.size == 0 && !splat_flag) {
            // no space left on stack
        } else if (postarg_flag) {
            const values: RValue[] = [];

            if (this.size > obj_data.length) {
                for (let i = 0; i < this.size - obj_data.length; i ++) {
                    values.push(Qnil);
                }
            }

            for (let i = 0; i < Math.min(this.size, obj_data.length); i ++) {
                values.push(obj_data.pop()!);
            }

            if (splat_flag) {
                values.push(object);
            }

            values.forEach((item) => context.push(item));
        } else {
            const values = [];

            for (let i = 0; i < Math.min(this.size, obj_data.length); i ++) {
                values.push(obj_data.shift());
            }

            if (this.size > values.length) {
                for (let i = 0; i < this.size - values.length; i ++) {
                    values.push(Qnil);
                }
            }

            if (splat_flag) {
                values.push(object)
            }

            for (let i = values.length - 1; i >= 0; i --) {
                context.push(values[i]!);
            }
        }

        return null;
    }

    length(): number {
        return 3;
    }

    pushes(): number {
        return this.size;
    }

    pops(): number {
        return 1;
    }
}
