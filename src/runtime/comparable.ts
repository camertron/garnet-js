import { ArgumentError, NoMethodError } from "../errors";
import { Module, Object, Qfalse, Qnil, Qtrue, RValue, Runtime } from "../runtime"

export const spaceship_compare = (x: RValue, y: RValue): number | null => {
    try {
        const result = Object.send(x, "<=>", [y])
        if (result == Qnil) return null;
        return result.get_data<number>();
    } catch (e) {
        if (e instanceof NoMethodError) {
            const self_class_name = x.klass.get_data<Module>().name;
            const other_class_name = y.klass.get_data<Module>().name;
            throw new ArgumentError(`comparison of ${self_class_name} with ${other_class_name} failed`);
        }

        throw e;
    }
};

const compare = (x: RValue, y: RValue, callback: (result: number) => boolean): RValue => {
    const result = spaceship_compare(x, y)
    if (result === null) return Qnil;
    return callback(result) ? Qtrue : Qfalse;
};

let inited = false;

export const init = () => {
    if (inited) return;

    Runtime.define_module("Comparable", (mod: Module) => {
        mod.define_native_method("<", (self: RValue, args: RValue[]): RValue => {
            return compare(self, args[0], result => result < 0);
        });

        mod.define_native_method("<=", (self: RValue, args: RValue[]): RValue => {
            return compare(self, args[0], result => result <= 0);
        });

        mod.define_native_method(">", (self: RValue, args: RValue[]): RValue => {
            return compare(self, args[0], result => result > 0)
        });

        mod.define_native_method(">=", (self: RValue, args: RValue[]): RValue => {
            return compare(self, args[0], result => result >= 0)
        });

        mod.define_native_method("==", (self: RValue, args: RValue[]): RValue => {
            return compare(self, args[0], result => result == 0)
        });

        mod.define_native_method("between?", (self: RValue, args: RValue[]): RValue => {
            const min_comp = compare(self, args[0], result => result < 0);
            const max_comp = compare(self, args[1], result => result > 0);

            return min_comp.is_truthy() || max_comp.is_truthy() ? Qfalse : Qtrue;
        });

        // @TODO: clamp method
    });

    inited = true;
};
