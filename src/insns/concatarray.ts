import { ExecutionContext, ExecutionResult } from "../execution_context";
import { Class, Object, RValue, RubyArray } from "../garnet";
import Instruction from "../instruction";

// It coerces the two objects at the top of the stack into Arrays by
// calling `to_a` if necessary, and makes sure to `dup` the first Array if
// it was already an Array, to avoid mutating it when concatenating.
//
export default class ConcatArray extends Instruction {
    call(context: ExecutionContext): ExecutionResult {
        const [left, right] = context.popn(2);
        const result = RubyArray.new();

        this.coerce_and_add(left, result);
        this.coerce_and_add(right, result);

        context.push(result);

        return null;
    }

    private coerce_and_add(from: RValue, to: RValue) {
        const to_elements = to.get_data<RubyArray>().elements;

        switch (from.klass) {
            case RubyArray.klass:
                to_elements.push(...from.get_data<RubyArray>().elements);
                break;

            default:
                if (Object.respond_to(from, "to_a")) {
                    const arr = Object.send(from, "to_a");

                    if (arr.klass === RubyArray.klass) {
                        to_elements.push(...arr.get_data<RubyArray>().elements);
                    } else {
                        const class_name = from.klass.get_data<Class>().name;
                        throw new TypeError(`can't convert ${class_name} to Array (${class_name}#to_a gives ${arr.klass.get_data<Class>().name})`);
                    }
                } else {
                    to_elements.push(from);
                }
        }
    }

    pops(): number {
        return 2;
    }

    pushes(): number {
        return 1;
    }
}
