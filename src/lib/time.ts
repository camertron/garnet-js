import { NameError, NotImplementedError, TypeError } from "../errors";
import { Class, ObjectClass, RValue, Runtime } from "../runtime";
import { Args } from "../runtime/arg-scanner";
import { Float } from "../runtime/float";
import { Kernel } from "../runtime/kernel";
import { Numeric } from "../runtime/numeric";
import { Object } from "../runtime/object";

// JS:   1711152226.702
// Ruby: 1711152191.542349
class Time {
    private static klass_: RValue;

    static async klass(): Promise<RValue> {
        const klass = await Object.find_constant("Time");

        if (klass) {
            this.klass_ = klass;
        } else {
            throw new NameError(`missing constant Time`);
        }

        return this.klass_;
    }

    public date: Date;

    static async new(date: Date) {
        return new RValue(await Time.klass(), new Time(date));
    }

    constructor(date: Date) {
        this.date = date;
    }
}

export const init = async () => {
    await Runtime.define_class("Time", ObjectClass, async (klass: Class) => {
        klass.include((await Object.find_constant("Comparable"))!);

        klass.define_native_singleton_method("now", async (self: RValue, args: RValue[]): Promise<RValue> => {
            return await Time.new(new Date());
        });

        klass.define_native_method("-", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const [other] = await Args.scan("1", args);

            if (await Kernel.is_a(other, await Numeric.klass())) {
                throw new NotImplementedError("Time#- with a numeric argument is not yet implemented");
            } else if (other.klass === self.klass) {
                const millis = self.get_data<Time>().date.getTime() - other.get_data<Time>().date.getTime();
                return await Float.new(millis / 1000);
            } else {
                throw new TypeError(`can't convert ${other.klass.get_data<Class>().name} into exact number`);
            }
        });

        klass.define_native_method("to_f", async (self: RValue): Promise<RValue> => {
            return await Float.new(self.get_data<Time>().date.getTime() / 1000);
        });
    });
};
