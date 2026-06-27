import { NameError } from "../errors";
import { Frame } from "../frame";
import { RubyArray } from "../garnet";
import { Class, ObjectClass, RValue, RValuePointer, Runtime } from "../runtime"
import { Object } from "../runtime/object";

export class Binding {
    private static klass_: RValue;

    static async klass(): Promise<RValue> {
        const klass = await Object.find_constant("Binding");

        if (klass) {
            this.klass_ = klass;
        } else {
            throw new NameError(`missing constant Binding`);
        }

        return this.klass_;
    }

    public receiver: RValue;
    public nesting: RValue[];
    public method_definition_target: RValue;
    public stack: RValuePointer[];
    public parent_frame: Frame | null;
    public stack_index: number;

    static async new(self: RValue, nesting: RValue[], stack: RValuePointer[], stack_index: number = 0, parent_frame: Frame | null, method_definition_target: RValue | null = null): Promise<RValue> {
        return new RValue(await Binding.klass(), new Binding(self, nesting, stack, stack_index, parent_frame, method_definition_target));
    }

    static async from_binding(binding: Binding) {
        return new RValue(await Binding.klass(), binding);
    }

    constructor(receiver: RValue, nesting: RValue[], stack: RValuePointer[], stack_index: number, parent_frame: Frame | null, method_definition_target: RValue | null = null) {
        if (parent_frame && !method_definition_target) {
            method_definition_target = parent_frame.method_definition_target;
        }

        this.receiver = receiver;
        this.nesting = nesting;
        this.stack = stack;
        this.parent_frame = parent_frame;
        this.stack_index = stack_index;
        this.method_definition_target = method_definition_target || ObjectClass;
    }

    with_receiver(new_receiver: RValue): Binding {
        return new Binding(new_receiver, this.nesting, this.stack, this.stack_index, this.parent_frame, this.method_definition_target);
    }

    with_receiver_and_nesting(new_receiver: RValue, new_nesting: RValue[]): Binding {
        return new Binding(new_receiver, new_nesting, this.stack, this.stack_index, this.parent_frame, this.method_definition_target);
    }

    with_receiver_and_method_definition_target(new_receiver: RValue, method_definition_target: RValue): Binding {
        return new Binding(new_receiver, this.nesting, this.stack, this.stack_index, this.parent_frame, method_definition_target);
    }

    with_receiver_nesting_and_method_definition_target(new_receiver: RValue, new_nesting: RValue[], method_definition_target: RValue): Binding {
        return new Binding(new_receiver, new_nesting, this.stack, this.stack_index, this.parent_frame, method_definition_target);
    }

    get const_base(): RValue {
        // if nesting is empty (e.g., in a top-level method), return ObjectClass
        // since top-level methods are defined on Object
        if (this.nesting.length === 0) {
            return ObjectClass;
        }

        return this.nesting[this.nesting.length - 1];
    }

    local_variables(): string[] {
        let current_frame: Frame | null = this.parent_frame;
        const local_names = [];

        while (current_frame) {
            for (const local of current_frame.iseq.local_table.locals) {
                if (local.name === "keyword_bits") continue;  // special local for kwargs
                local_names.push(local.name);
            }

            current_frame = current_frame.parent;
        }

        return local_names;
    }
}

let inited = false;

export const init = async () => {
    if (inited) return;

    await Runtime.define_class("Binding", ObjectClass, async (klass: Class) => {
        klass.define_native_method("local_variables", async (self: RValue): Promise<RValue> => {
            const binding = self.get_data<Binding>();
            const local_names = [];

            for (const local_name of binding.local_variables()) {
                local_names.push(await Runtime.intern(local_name));
            }

            return await RubyArray.new(local_names);
        });

        klass.define_native_method("receiver", (self: RValue): RValue => {
            const binding = self.get_data<Binding>();
            return binding.receiver;
        });
    });

    inited = true;
};
