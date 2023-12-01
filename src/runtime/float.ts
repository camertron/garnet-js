import { Class, RValue, String } from "../runtime";

export const defineFloatBehaviorOn = (klass: Class) => {
    klass.define_native_method("inspect", (self: RValue): RValue => {
        return String.new(self.get_data<number>().toString());
    });
};
