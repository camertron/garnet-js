import { ArgumentError } from "../errors";
import { Module, Qfalse, Qnil, Qtrue, RValue, Runtime } from "../runtime"
import { Args } from "./arg-scanner";
import { Object } from "./object";

export async function spaceship_compare(x: RValue, y: RValue, raise: true): Promise<number>;
export async function spaceship_compare(x: RValue, y: RValue, raise: false): Promise<number | null>;
export async function spaceship_compare(x: RValue, y: RValue, raise: boolean): Promise<number | null> {
    if (await Object.respond_to(x, "<=>")) {
        const spaceship_result = await Object.send(x, "<=>", [y]);

        if (spaceship_result !== Qnil) {
            return spaceship_result.get_data<number>();
        }
    }

    if (raise) {
        const self_class_name = x.klass.get_data<Module>().name;
        const other_class_name = y.klass.get_data<Module>().name;
        throw new ArgumentError(`comparison of ${self_class_name} with ${other_class_name} failed`);
    } else {
        return null;
    }
}

async function compare(x: RValue, y: RValue, raise: true, callback: (result: number) => boolean): Promise<RValue>;
async function compare(x: RValue, y: RValue, raise: false, callback: (result: number | null) => boolean): Promise<RValue>;
async function compare(x: RValue, y: RValue, raise: boolean, callback: ((result: number) => boolean) | ((result: number | null) => boolean)): Promise<RValue> {
    const result = await spaceship_compare(x, y, raise as any);
    return callback(result) ? Qtrue : Qfalse;
};

let inited = false;

export const init = async () => {
    if (inited) return;

    await Runtime.define_module("Comparable", async (mod: Module) => {
        mod.define_native_method("<", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [other] = await Args.scan("1", args);
            return await compare(self, other, true, result => result < 0);
        });

        mod.define_native_method("<=", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [other] = await Args.scan("1", args);
            return await compare(self, other, true, result => result <= 0);
        });

        mod.define_native_method(">", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [other] = await Args.scan("1", args);
            return await compare(self, other, true, result => result > 0)
        });

        mod.define_native_method(">=", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [other] = await Args.scan("1", args);
            return await compare(self, other, true, result => result >= 0)
        });

        mod.define_native_method("==", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [other] = await Args.scan("1", args);

            return await compare(self, other, false, result => {
                if (!result) return false;
                return result == 0;
            })
        });

        mod.define_native_method("between?", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [first, last] = await Args.scan("2", args);
            const min_comp = await compare(self, first, true, result => result < 0);
            const max_comp = await compare(self, last, true, result => result > 0);

            return min_comp.is_truthy() || max_comp.is_truthy() ? Qfalse : Qtrue;
        });

        // @TODO: clamp method
    });

    inited = true;
};
