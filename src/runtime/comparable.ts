import { ArgumentError } from "../errors";
import { Module, Qfalse, Qnil, Qtrue, RValue, Runtime } from "../runtime"
import { Object } from "./object";

export const spaceship_compare = async (x: RValue, y: RValue): Promise<number> => {
    if (await Object.respond_to(x, "<=>")) {
        const spaceship_result = await Object.send(x, "<=>", [y]);

        if (spaceship_result !== Qnil) {
            return spaceship_result.get_data<number>();
        }
    }

    const self_class_name = x.klass.get_data<Module>().name;
    const other_class_name = y.klass.get_data<Module>().name;
    throw new ArgumentError(`comparison of ${self_class_name} with ${other_class_name} failed`);
};

const compare = async (x: RValue, y: RValue, callback: (result: number) => boolean): Promise<RValue> => {
    const result = await spaceship_compare(x, y);
    return callback(result) ? Qtrue : Qfalse;
};

let inited = false;

export const init = () => {
    if (inited) return;

    Runtime.define_module("Comparable", (mod: Module) => {
        mod.define_native_method("<", async (self: RValue, args: RValue[]): Promise<RValue> => {
            return await compare(self, args[0], result => result < 0);
        });

        mod.define_native_method("<=", async (self: RValue, args: RValue[]): Promise<RValue> => {
            return await compare(self, args[0], result => result <= 0);
        });

        mod.define_native_method(">", async (self: RValue, args: RValue[]): Promise<RValue> => {
            return await compare(self, args[0], result => result > 0)
        });

        mod.define_native_method(">=", async (self: RValue, args: RValue[]): Promise<RValue> => {
            return await compare(self, args[0], result => result >= 0)
        });

        mod.define_native_method("==", async (self: RValue, args: RValue[]): Promise<RValue> => {
            return await compare(self, args[0], result => result == 0)
        });

        mod.define_native_method("between?", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const min_comp = await compare(self, args[0], result => result < 0);
            const max_comp = await compare(self, args[1], result => result > 0);

            return min_comp.is_truthy() || max_comp.is_truthy() ? Qfalse : Qtrue;
        });

        // @TODO: clamp method
    });

    inited = true;
};
