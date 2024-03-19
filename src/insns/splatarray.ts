import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Class, Qnil, RValue } from "../runtime";
import { Object } from "../runtime/object";
import { TypeError } from "../errors";
import { RubyArray } from "../runtime/array";

// `splatarray` coerces the array object at the top of the stack into Array
// by calling `to_a`. It pushes a duplicate of the array if there is a flag,
// and the original array if there isn't one.
//
export default class SplatArray extends Instruction {
    private flag: boolean;

    constructor(flag: boolean) {
        super();
        this.flag = flag;
    }

    call(context: ExecutionContext): ExecutionResult {
        const value = context.pop()!;

        if (value.klass === RubyArray.klass) {
            if (this.flag) {
                context.push(RubyArray.new([...value.get_data<RubyArray>().elements]))
            } else {
                context.push(value);
            }
        } else {
            if (Object.respond_to(value, "to_a")) {
                const arr = Object.send(value, "to_a");

                if (arr.klass === RubyArray.klass) {
                    context.push(arr);
                } else {
                    const class_name = value.klass.get_data<Class>().name;
                    throw new TypeError(`can't convert ${class_name} to Array (${class_name}#to_a gives ${arr.klass.get_data<Class>().name})`);
                }
            } else {
                context.push(RubyArray.new([value]));
            }
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
