import { Class, Integer, IntegerClass, RValue, String } from "../runtime";

export const defineIntegerBehaviorOn = (klass: Class) => {
    klass.define_native_method("inspect", (self: RValue): RValue => {
        return String.new(self.get_data<number>().toString());
    });

    klass.define_native_method("hash", (self: RValue): RValue => {
        // Ruby hashes the object ID for fixnums. We should eventually do the same.
        // https://github.com/ruby/ruby/blob/6e46bf1e54e7fe83dc80e49394d980b71321b6f0/hash.c#L171
        return self;
    });

    // Normally multiplication of two ints/floats is handled by the opt_mult instruction. This
    // definition is here for the sake of completeness.
    klass.define_native_method("*", (self: RValue, args: RValue[]): RValue => {
        const multiplier = args[0];
        multiplier.assert_type(IntegerClass)  // @TODO: handle floats, maybe Numeric?

        return Integer.new(self.get_data<number>() * multiplier.get_data<number>());
    });
};
