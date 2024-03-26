import { ExecutionContext, ExecutionResult } from "../execution_context";
import Instruction from "../instruction";
import { Class } from "../runtime";
import { Object } from "../runtime/object";
import { String } from "../runtime/string";

export default class AnyToString extends Instruction {
    call(context: ExecutionContext): ExecutionResult {
        const value = context.pop()!;
        const original = context.pop()!;

        if (value.klass == String.klass) {
            context.push(value);
        } else {
            const name = original.klass.get_data<Class>().full_name;
            context.push(String.new(`#<${name}:${Object.object_id_to_str(original.object_id)}>`));
        }

        return null;
    }

    pops(): number {
        return 2;
    }

    pushes(): number {
        return 1;
    }
}
