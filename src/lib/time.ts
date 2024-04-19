import { NameError, NotImplementedError } from "../errors";
import { Class, ObjectClass, RValue, Runtime } from "../runtime";
import { Float } from "../runtime/float";
import { Kernel } from "../runtime/kernel";
import { Numeric } from "../runtime/numeric";
import { Object } from "../runtime/object";

// JS:   1711152226.702
// Ruby: 1711152191.542349
class Time {
    private static klass_: RValue;

    static get klass(): RValue {
        const klass = Object.find_constant("Time");

        if (klass) {
            this.klass_ = klass;
        } else {
            throw new NameError(`missing constant Time`);
        }

        return this.klass_;
    }

    public date: Date;

    static new(date: Date) {
        return new RValue(Time.klass, new Time(date));
    }

    constructor(date: Date) {
        this.date = date;
    }
}

export const init = () => {
    Runtime.define_class("Time", ObjectClass, (klass: Class) => {
        klass.include(Object.find_constant("Comparable")!);

        klass.define_native_singleton_method("now", (self: RValue, args: RValue[]): RValue => {
            return Time.new(new Date());
        });

        klass.define_native_method("-", (self: RValue, args: RValue[]): RValue => {
            if (Kernel.is_a(args[0], Numeric.klass)) {
                throw new NotImplementedError("Time#- with a numeric argument is not yet implemented");
            } else if (args[0].klass === self.klass) {
                const millis = self.get_data<Time>().date.getMilliseconds() - args[0].get_data<Time>().date.getMilliseconds();
                return Float.new(millis / 1000);
            } else {
                throw new TypeError(`can't convert ${args[0].klass.get_data<Class>().name} into exact number`);
            }
        });

        klass.define_native_method("to_f", (self: RValue): RValue => {
            return Float.new(self.get_data<Time>().date.getTime() / 1000);
        });
    });
};
