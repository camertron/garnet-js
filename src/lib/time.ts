import { NotImplementedError } from "../errors";
import { Class, ObjectClass, RValue, Runtime } from "../runtime";
import { Float } from "../runtime/float";
import { Kernel } from "../runtime/kernel";
import { Numeric } from "../runtime/numeric";
import { Object } from "../runtime/object";

class Time {
    public date: Date;

    static new(date: Date) {
        return new RValue(Object.find_constant("Time")!, new Time(date));
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
    });
};
