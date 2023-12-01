import { Array as RubyArray, Class, Integer, Qnil, RValue, StringClass, String, IntegerClass, Runtime } from "../runtime";
import { hash_string } from "../util/string_utils";
import { Regexp } from "./regexp";

export const defineStringBehaviorOn = (klass: Class) => {
    klass.define_native_method("initialize", (self: RValue, args: RValue[]): RValue => {
        const str = args[0];

        if (str) {
            Runtime.assert_type(str, StringClass);
            self.data = str.data;
        }

        return Qnil;
    });

    klass.define_native_method("hash", (self: RValue): RValue => {
        return Integer.new(hash_string(self.get_data<string>()));
    });

    klass.define_native_method("to_s", (self: RValue): RValue => {
        return self;
    });

    klass.define_native_method("inspect", (self: RValue): RValue => {
        const str = self.get_data<string>();
        return String.new(`"${str.replace(/\"/g, "\\\"")}"`);
    });

    klass.define_native_method("*", (self: RValue, args: RValue[]): RValue => {
        const multiplier = args[0];
        Runtime.assert_type(multiplier, IntegerClass);  // @TODO: handle floats (yes, you can multiply strings by floats, oh ruby)
        return String.new(self.get_data<string>().repeat(multiplier.get_data<number>()));
    });

    klass.define_native_method("split", (self: RValue, args: RValue[]): RValue => {
        let delim;

        if (args.length > 0) {
            delim = args[0].get_data<string>();
        } else {
            delim = " ";
        }

        const str = self.get_data<string>();

        return RubyArray.new(str.split(delim).map((elem) => String.new(elem)));
    });

    klass.define_native_method("gsub", (self: RValue, args: RValue[], block?: RValue): RValue => {
        const str = self.get_data<string>();
        const pattern = args[0].get_data<Regexp | string>();
        const replacement = args[1].get_data<string>();

        if (pattern instanceof Regexp) {
            const matches: [number, number][] = [];

            pattern.scan(str, (match: [number, number][]): boolean => {
                matches.push(match[0]);
                return true;
            });

            const chunks = [];
            let last_pos = 0;

            for (let i = 0; i < matches.length; i ++) {
                chunks.push(str.slice(last_pos, matches[i][0]));
                chunks.push(replacement);
                last_pos = matches[i][1];
            }

            chunks.push(str.slice(last_pos, str.length));

            return String.new(chunks.join(""));
        }

        return self;
    });
};
