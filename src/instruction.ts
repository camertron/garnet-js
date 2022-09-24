import ExecutionContext from "./execution_context";
import { Qfalse, Qnil, Qtrue, Runtime, RValue, String } from "./runtime";
import { Integer } from "./runtime";

export type ValueType = {
    value: any,
    type: string
}

// Abstract base instruction.
export default abstract class Instruction {
    static to_ruby(object: ValueType): RValue {
        switch (object.type) {
            case "String":
                return String.new(object.value as string);
            case "Symbol":
                return Runtime.intern(object.value as string);
            case "Integer":
                return Integer.new(object.value as number);
            case "TrueClass":
            case "FalseClass":
                return object.value as boolean ? Qtrue : Qfalse;
            case "NilClass":
                return Qnil;
            default:
                throw new TypeError(`no implicit conversion of ${object.type} into Ruby object`);
        }
    }

    abstract call(context: ExecutionContext): void;

    // Whether or not this instruction is a branch instruction.
    does_branch(): boolean {
        return false;
    }

    // Whether or not this instruction leaves the current frame.
    does_leave(): boolean {
        return false;
    }

    // Whether or not this instruction falls through to the next instruction if
    // its branching fails.
    does_fall_through(): boolean {
      return false;
    }

    // How many values are read from the stack.
    abstract reads(): number;

    // How many values are written to the stack.
    abstract writes(): number;

    // Does the instruction have side effects? Control-flow counts as a
    // side-effect, as do some special-case instructions like Leave
    has_side_effects(): boolean {
        return true;
    }
}
