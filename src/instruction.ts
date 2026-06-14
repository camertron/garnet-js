import { Disassembler } from "./disassembler";
import { ExecutionContext, ExecutionResult } from "./execution_context";
import { Qfalse, Qnil, Qtrue, Runtime, RValue } from "./runtime";
import { Float } from "./runtime/float";
import { Integer } from "./runtime/integer";
import { RubyString } from "./runtime/string";

export type ValueType = (
    { type: "String" | "Symbol", value: string } |
    { type: "Integer" | "Float", value: number } |
    { type: "TrueClass" | "FalseClass", value: boolean } |
    { type: "NilClass", value: null | undefined } |
    { type: "RValue", value: RValue }
);

// Abstract base instruction.
export default abstract class Instruction {
    // The slot position of this instruction in the containing sequence.
    // Only used in disasm output.
    public pos: number = -1;

    static async to_ruby(object: ValueType): Promise<RValue> {
        switch (object.type) {
            case "String":
                return await RubyString.new(object.value);
            case "Symbol":
                return await Runtime.intern(object.value);
            case "Integer":
                return await Integer.new(object.value);
            case "Float":
                return await Float.new(object.value);
            case "TrueClass":
            case "FalseClass":
                return object.value ? Qtrue : Qfalse;
            case "NilClass":
                return Qnil;
            case "RValue":
                return object.value;
        }
    }

    abstract call(context: ExecutionContext): Promise<ExecutionResult>;
    abstract disasm(fmt: Disassembler): string;

    patch(pos: number) {
        this.pos = pos;
    }

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

    // This returns the number of values that are popped off the stack.
    pops(): number {
        return 0;
    }

    // This returns the number of values that are pushed onto the stack.
    pushes(): number {
        return 0;
    }

    // This returns the size of the instruction in terms of the number of slots
    // it occupies in the instruction sequence. Effectively this is 1 plus the
    // number of operands.
    length() {
        return 1;
    }

    // Does the instruction have side effects? Control-flow counts as a
    // side-effect, as do some special-case instructions like Leave
    has_side_effects(): boolean {
        return true;
    }
}
