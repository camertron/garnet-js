import { Frame } from "../frame";
import { ObjectClass, RValue, Runtime } from "../runtime"
import { Object } from "../runtime/object";

export class Binding {
    public self: RValue;
    public nesting: RValue[];
    public stack: RValue[];
    public parent_frame: Frame;
    public stack_index: number;

    static new(self: RValue, nesting: RValue[], stack: RValue[], parent_frame: Frame, stack_index: number = 0): RValue {
        return new RValue(Object.find_constant("Binding")!, new Binding(self, nesting, stack, parent_frame, stack_index));
    }

    constructor(self: RValue, nesting: RValue[], stack: RValue[], parent_frame: Frame, stack_index: number) {
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

    Runtime.define_class("Binding", ObjectClass);

    inited = true;
};
