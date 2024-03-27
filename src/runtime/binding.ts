import { NameError } from "../errors";
import { Frame } from "../frame";
import { RubyArray } from "../garnet";
import { Class, ObjectClass, RValue, RValuePointer, Runtime } from "../runtime"
import { Object } from "../runtime/object";

export class Binding {
    private static klass_: RValue;

    static get klass(): RValue {
        const klass = Object.find_constant("Binding");

        if (klass) {
            this.klass_ = klass;
        } else {
            throw new NameError(`missing constant Binding`);
        }

        return this.klass_;
    }

    public self: RValue;
    public nesting: RValue[];
    public stack: RValuePointer[];
    public parent_frame: Frame;
    public stack_index: number;

    static new(self: RValue, nesting: RValue[], stack: RValuePointer[], parent_frame: Frame, stack_index: number = 0): RValue {
        return new RValue(Binding.klass, new Binding(self, nesting, stack, parent_frame, stack_index));
    }

    static from_binding(binding: Binding) {
        return new RValue(Binding.klass, binding);
    }

    constructor(self: RValue, nesting: RValue[], stack: RValuePointer[], parent_frame: Frame, stack_index: number) {
        this.self = self;
        this.nesting = nesting;
        this.stack = stack;
        this.parent_frame = parent_frame;
        this.stack_index = stack_index;
    }

    with_self(new_self: RValue) {
        return new Binding(new_self, this.nesting, this.stack, this.parent_frame, this.stack_index);
    }
}

let inited = false;

export const init = () => {
    if (inited) return;

    Runtime.define_class("Binding", ObjectClass, (klass: Class) => {
        klass.define_native_method("local_variables", (self: RValue): RValue => {
            const binding = self.get_data<Binding>();
            let current_frame: Frame | null = binding.parent_frame;
            const local_names = [];

            while (current_frame) {
                for (const local of current_frame.iseq.local_table.locals) {
                    if (local.name === "keyword_bits") continue;  // special local for kwargs
                    local_names.push(Runtime.intern(local.name));
                }

                current_frame = current_frame.parent;
            }

            return RubyArray.new(local_names);
        });
    });

    inited = true;
};
