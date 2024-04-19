import { ArgumentError, EncodingConverterNotFoundError, IndexError, NameError, NotImplementedError, RangeError } from "../errors";
import { Class, Qnil, RValue, Runtime, Qtrue, Qfalse, ObjectClass } from "../runtime";
import { hash_string } from "../util/string_utils";
import { Integer } from "./integer";
import { MatchData, Regexp } from "./regexp";
import { Range } from "./range";
import { Object } from "./object";
import { ExecutionContext } from "../execution_context";
import { Encoding } from "./encoding";
import { String as RubyString } from "../runtime/string";
import { CharSelector } from "./char-selector";
import { Hash } from "./hash";
import { RubyArray } from "../runtime/array";
import { Numeric } from "./numeric";
import { Float } from "./float";
import { mix_shared_string_methods_into } from "./string-shared";
import { left_pad, sprintf } from "./printf";

// 7-bit strings are implicitly valid.
// If both the valid _and_ 7bit bits are set, the string is broken.e
export const CR_7BIT = 16;
export const CR_VALID = 32;
export const CR_UNKNOWN = 0;
export const CR_BROKEN = CR_7BIT | CR_VALID;
export const CR_MASK = CR_7BIT | CR_VALID;

type StringContext = {
    encoding_rval?: RValue;
    flags?: number;
}

export class String {
    private static klass_: RValue;

    static new(str: string): RValue {
        return new RValue(this.klass, str);
    }

    static get klass(): RValue {
        const klass = Object.find_constant("String");

        if (klass) {
            this.klass_ = klass;
        } else {
            throw new NameError(`missing constant String`);
        }

        return this.klass_;
    }

    static get_encoding(str: RValue): Encoding {
        return this.get_encoding_rval(str).get_data<Encoding>();
    }

    static get_encoding_rval(str: RValue): RValue {
        const context = this.get_context(str);

        if (!context.encoding_rval) {
            context.encoding_rval = Encoding.default;
        }

        return context.encoding_rval;
    }

    static set_encoding(str: RValue, encoding: RValue): void {
        this.get_context(str).encoding_rval = encoding;
    }

    static get_code_range(str: RValue): number {
        const context = this.get_context(str);

        if (!context.flags) {
            context.flags = CR_UNKNOWN;
        }

        return context.flags & CR_MASK;
    }

    static set_code_range(str: RValue, code_range: number) {
        const context = this.get_context(str);
        this.clear_code_range(str);
        this.set_flags(str, this.get_flags(str) | (code_range & CR_MASK));
    }

    static clear_code_range(str: RValue) {
        this.set_flags(str, this.get_flags(str) & ~CR_MASK);
    }

    static get_context(str: RValue): StringContext {
        return str.get_context<StringContext>();
    }

    static scan_for_code_range(str: RValue): number {
        const cr = this.get_code_range(str);

        if (cr == CR_UNKNOWN) {
            const new_cr = this.code_range_scan(str, 0, str.get_data<string>().length);
            this.set_code_range(str, cr);
        }

        return cr;
    }

    static inspect(str: string) {
        const escaped_str = str
            .replace(/\"/g, "\\\"")
            .replace(/\r/g, "\\r")
            .replace(/\n/g, "\\n");

        return `"${escaped_str}"`;
    }

    static ascii_only(str: RValue): boolean {
        const encoding = this.get_encoding(str);
        const code_range = this.get_code_range(str);
        return encoding.ascii_compatible && code_range == CR_7BIT;
    }

    private static code_range_scan(str: RValue, p: number, len: number): number {
        return this.search_non_ascii(str, p, p + len) != -1 ? CR_VALID : CR_7BIT;
    }

    private static search_non_ascii(str: RValue, p: number, end: number): number {
        const data = str.get_data<string>();

        while (p < end) {
            if (!Encoding.is_ascii(data.codePointAt(p)!)) return p;
            p ++;
        }

        return -1;
    }

    private static get_flags(str: RValue): number {
        const context = this.get_context(str);

        if (!context.flags) {
            context.flags = CR_UNKNOWN;
        }

        return context.flags;
    }

    private static set_flags(str: RValue, flags: number) {
        const context = str.get_context<StringContext>();
        context.flags = flags;
    }
}

let inited = false;

export const init = () => {
    if (inited) return;

    Runtime.define_class("String", ObjectClass, (klass: Class) => {
        mix_shared_string_methods_into(klass);

        klass.define_native_method("initialize", (self: RValue, args: RValue[]): RValue => {
            const str = args[0];

            if (str) {
                Runtime.assert_type(str, String.klass);
                self.data = str.data;
            } else {
                self.data = "";
            }

            return Qnil;
        });

        klass.define_native_method("+@", (self: RValue): RValue => {
            // return unfrozen string
            return String.new(self.get_data<string>());
        });

        klass.define_native_method("hash", (self: RValue): RValue => {
            return Integer.new(hash_string(self.get_data<string>()));
        });

        klass.define_native_method("to_s", (self: RValue): RValue => {
            return self;
        });

        klass.alias_method("to_str", "to_s");

        klass.define_native_method("inspect", (self: RValue): RValue => {
            const str = self.get_data<string>();
            return RubyString.new(String.inspect(str));
        });

        klass.define_native_method("*", (self: RValue, args: RValue[]): RValue => {
            const multiplier = args[0];
            Runtime.assert_type(multiplier, Numeric.klass);  // @TODO: handle floats (yes, you can multiply strings by floats, oh ruby)
            return RubyString.new(self.get_data<string>().repeat(multiplier.get_data<number>()));
        });

        klass.define_native_method("split", (self: RValue, args: RValue[]): RValue => {
            let delim;

            if (args.length > 0) {
                delim = args[0].get_data<string>();
            } else {
                delim = " ";
            }

            const str = self.get_data<string>();

            return RubyArray.new(str.split(delim).map((elem) => RubyString.new(elem)));
        });

        const gsub = (str: string, pattern: Regexp | string, replacements: RValue): string => {
            if (pattern instanceof Regexp) {
                const matches: MatchData[] = [];

                pattern.scan(str, (match_data: MatchData): boolean => {
                    matches.push(match_data);
                    Regexp.set_svars(match_data);
                    return true;
                });

                const chunks = [];
                let last_pos = 0;

                if (replacements.klass === Hash.klass) {
                    const replacement_hash = replacements.get_data<Hash>();

                    for (let i = 0; i < matches.length; i ++) {
                        chunks.push(str.slice(last_pos, matches[i].begin(0)));
                        chunks.push(replacement_hash.get(String.new(matches[i].match(0))).get_data<string>());
                        last_pos = matches[i].end(0);
                    }
                } else {
                    const replacement = replacements.get_data<string>();

                    for (let i = 0; i < matches.length; i ++) {
                        chunks.push(str.slice(last_pos, matches[i].begin(0)));
                        chunks.push(replacement);
                        last_pos = matches[i].end(0);
                    }
                }

                chunks.push(str.slice(last_pos, str.length));

                return chunks.join("");
            } else {
                throw new Error("gsub cannot handle string patterns yet");
            }
        }

        klass.define_native_method("gsub", (self: RValue, args: RValue[]): RValue => {
            const str = self.get_data<string>();
            const pattern = args[0].get_data<Regexp | string>();
            const replacements = args[1];

            return RubyString.new(gsub(str, pattern, replacements));
        });

        klass.define_native_method("gsub!", (self: RValue, args: RValue[]): RValue => {
            const str = self.get_data<string>();
            const pattern = args[0].get_data<Regexp | string>();
            const replacements = args[1];
            const new_str = gsub(str, pattern, replacements);

            if (new_str === str) {
                return Qnil;
            } else {
                self.data = new_str;
                return self;
            }
        });

        klass.define_native_method("match?", (self: RValue, args: RValue[]): RValue => {
            let pattern: Regexp;

            if (args[0].klass === Regexp.klass) {
                pattern = args[0].get_data<Regexp>();
            } else {
                const re_str = Runtime.coerce_to_string(args[0]).get_data<string>();
                pattern = Regexp.compile(re_str);
            }

            if (pattern.search(self.get_data<string>()) === null) {
                return Qfalse;
            }

            return Qtrue;
        });

        // @TODO: scan should yield results to the block
        klass.define_native_method("scan", (self: RValue, args: RValue[]): RValue => {
            const data = self.get_data<string>();
            const pattern = args[0];

            if (pattern.klass === String.klass) {
                // @TODO: data should be passed through Regexp.quote() for some reason,
                // but we don't have an impl yet
                const pattern_str = pattern.get_data<string>();
                const results: RValue[] = [];
                let last_pos = -pattern_str.length - 1;

                do {
                    last_pos = data.indexOf(pattern_str, last_pos + pattern_str.length + 1);

                    if (last_pos > -1) {
                        const str = data.slice(last_pos, last_pos + pattern_str.length);
                        results.push(String.new(str));
                        last_pos += pattern_str.length;
                    }
                } while (last_pos > -1);

                return RubyArray.new(results);
            } else if (pattern.klass === Regexp.klass) {
                const results: RValue[] = [];

                pattern.get_data<Regexp>().scan(data, (match_data: MatchData): boolean => {
                    if (match_data.captures.length === 1) {
                        const capture = match_data.captures[0]
                        const str = data.slice(capture[0], capture[1]);
                        results.push(String.new(str));
                    } else {
                        const captures = [];

                        for (let i = 1; i < match_data.captures.length; i ++) {
                            const capture = match_data.captures[i];
                            const str = data.slice(capture[0], capture[1]);
                            captures.push(String.new(str));
                        }

                        results.push(RubyArray.new(captures));
                    }

                    return true;
                });

                return RubyArray.new(results);
            } else {
                throw new TypeError(`wrong argument type ${pattern.klass.get_data<Class>().name} (expected Regexp)`);
            }
        });

        klass.define_native_method("to_i", (self: RValue): RValue => {
            const str = self.get_data<string>();

            if (str.indexOf(".") > 0) {
                return Float.new(parseFloat(str));
            } else {
                return Integer.get(parseInt(str));
            }
        });

        klass.define_native_method("to_sym", (self: RValue, args: RValue[]): RValue => {
            return Runtime.intern(self.get_data<string>());
        });

        klass.define_native_method("%", (self: RValue, args: RValue[]): RValue => {
            args = Object.send(self, "Array", args).get_data<RubyArray>().elements;
            return sprintf(self, args);
        });

        klass.define_native_method("==", (self: RValue, args: RValue[]): RValue => {
            if (args[0].klass != String.klass) {
                return Qfalse;
            }

            if (self.get_data<string>() === args[0].get_data<string>()) {
                return Qtrue;
            } else {
                return Qfalse;
            }
        });

        klass.define_native_method("!=", (self: RValue, args: RValue[]): RValue => {
            if (args[0].klass != String.klass) {
                return Qtrue;
            }

            if (self.get_data<string>() !== args[0].get_data<string>()) {
                return Qtrue;
            } else {
                return Qfalse;
            }
        });

        klass.define_native_method("+", (self: RValue, args: RValue[]): RValue => {
            Runtime.assert_type(args[0], String.klass);
            return RubyString.new(self.get_data<string>() + args[0].get_data<string>());
        });

        klass.define_native_method("empty?", (self: RValue): RValue => {
            return self.get_data<string>().length === 0 ? Qtrue : Qfalse;
        });

        klass.define_native_method("size", (self: RValue): RValue => {
            return Integer.get(self.get_data<string>().length);
        });

        klass.alias_method("length", "size");

        klass.define_native_method("bytesize", (self: RValue): RValue => {
            const encoding = RubyString.get_encoding_rval(self).get_data<Encoding>();
            return Integer.get(encoding.bytesize(self.get_data<string>()));
        });

        klass.define_native_method("[]=", (self: RValue, args: RValue[]): RValue => {
            const data = self.get_data<string>();
            let replacement_pos = 1;
            let start_pos, end_pos

            if (args[0].klass == Object.find_constant("Range")!) {
                const range = args[0].get_data<Range>();

                Runtime.assert_type(range.begin, Integer.klass);
                Runtime.assert_type(range.end, Integer.klass);

                start_pos = range.begin.get_data<number>();

                if (start_pos < 0) {
                    start_pos = data.length + start_pos;
                }

                end_pos = range.end.get_data<number>();

                if (end_pos < 0) {
                    end_pos = data.length + end_pos;
                }

                if (start_pos > end_pos) {
                    return Qnil;
                }

                if (!range.exclude_end) {
                    end_pos += 1
                }
            } else if (args[0].klass === String.klass) {
                const substring = args[0].get_data<string>();
                const idx = data.indexOf(substring);

                if (idx > -1) {
                    start_pos = idx;
                    end_pos = start_pos + args[0].get_data<string>().length;
                } else {
                    throw new IndexError("string not matched");
                }
            } else if (args[0].klass === Regexp.klass) {
                throw new NotImplementedError("String#[]=(Regexp) is not yet implemented");
            } else {
                Runtime.assert_type(args[0], Integer.klass);
                start_pos = args[0].get_data<number>();

                if (args.length > 2) {
                    Runtime.assert_type(args[1], Integer.klass);
                    end_pos = args[1].get_data<number>();
                    replacement_pos = 2;
                } else {
                    if (start_pos >= data.length) {
                        return Qnil;
                    }

                    end_pos = data.length - 1;
                }
            }

            Runtime.assert_type(args[replacement_pos], String.klass);
            const replacement = args[replacement_pos].get_data<string>();

            self.data = `${data.slice(0, start_pos)}${replacement}${data.slice(end_pos)}`;
            return args[replacement_pos];
        });

        klass.define_native_method("ljust", (self: RValue, args: RValue[]): RValue => {
            const data = self.get_data<string>();
            Runtime.assert_type(args[0], Integer.klass);
            const size = args[0].get_data<number>();

            let pad_str;

            if (args.length > 1) {
                Runtime.assert_type(String.klass, args[1]);
                pad_str = args[1].get_data<string>();
            } else {
                pad_str = " ";
            }

            return RubyString.new(left_pad(data, pad_str, size));
        });

        klass.define_native_method("dup", (self: RValue): RValue => {
            return RubyString.new(self.get_data<string>());
        });

        klass.define_native_method("replace", (self: RValue, args: RValue[]): RValue => {
            Runtime.assert_type(args[0], String.klass);
            self.data = args[0].get_data<string>();
            return self;
        });

        klass.alias_method("initialize_copy", "replace");

        klass.define_native_method("start_with?", (self: RValue, args: RValue[]): RValue => {
            const data = self.get_data<string>();

            if (args[0]?.klass === Regexp.klass) {
                const match = args[0].get_data<Regexp>().search(data);
                return match && match.begin(0) === 0 ? Qtrue : Qfalse;
            } else {
                Runtime.assert_type(args[0] || Qnil, String.klass);
                const search_str = args[0].get_data<string>();
                return data.startsWith(search_str) ? Qtrue : Qfalse;
            }
        });

        klass.define_native_method("=~", (self: RValue, args: RValue[]): RValue => {
            if (args[0].klass === Regexp.klass) {
                const regexp = args[0].get_data<Regexp>();
                const result = regexp.search(self.get_data<string>());

                if (result) {
                    Regexp.set_svars(result);
                    return Integer.get(result.begin(0));
                } else {
                    return Qnil;
                }
            } else {
                return Object.send(args[0], "=~", [self]);
            }
        });

        // this is designed to be used only by << and concat below
        const append_to = (str: RValue, val: RValue): void => {
            const encoding = RubyString.get_encoding(str);

            if (val.klass === Integer.klass) {
                const num = val.get_data<number>();

                if (!encoding.codepoint_valid(num)) {
                    throw new RangeError(`${num} out of char range`);
                }

                if (num >= 128 && num <= 255 && encoding.name === "US-ASCII") {
                    RubyString.set_encoding(str, Encoding.binary);
                }

                str.data = str.get_data<string>() + encoding.codepoint_to_utf16(num);
            } else {
                Encoding.enc_cr_str_buf_cat(str, Runtime.coerce_to_string(val));
            }
        }

        klass.define_native_method("<<", (self: RValue, args: RValue[]): RValue => {
            Object.check_frozen(self);
            append_to(self, args[0]);
            return self;
        });

        klass.define_native_method("concat", (self: RValue, args: RValue[]): RValue => {
            Object.check_frozen(self);

            const self_data = self.get_data<string>();

            for (const arg of args) {
                if (arg.object_id === self.object_id) {
                    // concating self uses the previous value of self
                    self.data = self.get_data<string>() + self_data;
                } else {
                    append_to(self, arg);
                }
            }

            return self;
        });

        klass.define_native_method("include?", (self: RValue, args: RValue[]): RValue => {
            Runtime.assert_type(args[0], String.klass);
            return self.get_data<string>().indexOf(args[0].get_data<string>()) > -1 ? Qtrue : Qfalse;
        });

        const chomp_re_map: {[key: string]: RegExp} = {
            /* When line_sep is "\n", removes the last one or two characters if they are "\r", "\n",
            * or "\r\n" (but not "\n\r")
            */
            "\n": /\r?\n?$/,

            /* When line_sep is '' (an empty string), removes multiple trailing occurrences of "\n"
            * or "\r\n" (but not "\r" or "\n\r")
            */
            "": /(?:\n|\r\n)*$/
        };

        klass.define_native_method("chomp", (self: RValue, args: RValue[]): RValue => {
            const data = self.get_data<string>();
            const line_sep = args[0] || ExecutionContext.current.globals["$/"];
            const line_sep_str = line_sep.get_data<string>();
            const remove_re = chomp_re_map[line_sep_str];

            if (remove_re) {
                return RubyString.new(data.replace(remove_re, ""));
            } else {
                if (data.endsWith(line_sep_str)) {
                    return RubyString.new(data.slice(0, data.length - line_sep_str.length));
                } else {
                    return RubyString.new(data);
                }
            }
        });

        // Returns a new string copied from self, with trailing characters possibly removed.
        // Removes "\r\n" if those are the last two characters. Otherwise removes the last
        // character if it exists.
        klass.define_native_method("chop", (self: RValue): RValue => {
            const data = self.get_data<string>();
            const remove_chars = data.endsWith("\r\n") ? 2 : 1;

            if (remove_chars > data.length) {
                return RubyString.new("");
            } else {
                return RubyString.new(data.slice(0, data.length - remove_chars));
            }
        });

        // Like String#chop, but modifies self in place; returns nil if self is empty, self
        // otherwise.
        klass.define_native_method("chomp!", (self: RValue): RValue => {
            const data = self.get_data<string>();
            const remove_chars = data.endsWith("\r\n") ? 2 : 1;

            if (remove_chars > data.length) {
                self.data = "";
                return Qnil;
            } else {
                const new_str = data.slice(0, data.length - remove_chars);
                self.data = new_str;
                return new_str.length === 0 ? Qnil : self;
            }
        });

        const leading_whitespace_re = /^[\0\t\n\v\f\r ]+/;
        const trailing_whitespace_re = /[\0\t\n\v\f\r ]+$/;

        const strip = (str: string): string => {
            return str
                .replace(leading_whitespace_re, "")
                .replace(trailing_whitespace_re, "");
        }

        klass.define_native_method("strip", (self: RValue): RValue => {
            return String.new(strip(self.get_data<string>()));
        });

        klass.define_native_method("strip!", (self: RValue): RValue => {
            const old_str = self.get_data<string>();
            const new_str = strip(old_str);

            if (new_str === old_str) {
                return Qnil;
            } else {
                self.data = new_str;
                return self;
            }
        });

        klass.define_native_method("upcase", (self: RValue): RValue => {
            return RubyString.new(self.get_data<string>().toUpperCase());
        });

        klass.define_native_method("downcase", (self: RValue): RValue => {
            return RubyString.new(self.get_data<string>().toLowerCase());
        });

        klass.define_native_method("encoding", (self: RValue): RValue => {
            return RubyString.get_encoding_rval(self);
        });

        klass.define_native_method("encode!", (self: RValue, args: RValue[]): RValue => {
            const encoding_arg = Encoding.coerce(args[0]);

            if (encoding_arg) {
                const target_encoding = Encoding.supported_conversion(self, encoding_arg);

                if (target_encoding) {
                    RubyString.set_encoding(self, target_encoding);
                    return self;
                }
            }

            const self_encoding = RubyString.get_encoding_rval(self);

            throw new EncodingConverterNotFoundError(
                `code converter not found (${self_encoding.get_data<Encoding>().name} to ${args[0].get_data<string>()})`
            );
        });

        klass.define_native_method("encode", (self: RValue, args: RValue[]): RValue => {
            const encoding_arg = Encoding.coerce(args[0]);

            if (encoding_arg) {
                const target_encoding = Encoding.supported_conversion(self, encoding_arg);

                if (target_encoding) {
                    const new_str = RubyString.new(self.get_data<string>());
                    RubyString.set_encoding(new_str, target_encoding);
                    return new_str;
                }
            }

            const self_encoding = RubyString.get_encoding_rval(self);

            throw new EncodingConverterNotFoundError(
                `code converter not found (${self_encoding.get_data<Encoding>().name} to ${args[0].get_data<string>()})`
            );
        });

        klass.define_native_method("tr", (self: RValue, args: RValue[]): RValue => {
            const selector_str = Runtime.coerce_to_string(args[0]).get_data<string>();
            const replacements = Runtime.coerce_to_string(args[1]).get_data<string>();
            const selector = CharSelector.from(selector_str);
            const data = self.get_data<string>();
            const chars = [];

            for (let i = 0; i < data.length; i ++) {
                const char = data.charAt(i);
                const idx = selector.indexOf(char);

                if (idx != null) {
                    if (idx === -1 || idx >= replacements.length) {
                        chars.push(replacements.charAt(replacements.length - 1));
                    } else {
                        chars.push(replacements.charAt(idx));
                    }
                } else {
                    chars.push(char);
                }
            }

            return String.new(chars.join(""));
        });

        klass.define_native_method("clear", (self: RValue): RValue => {
            self.data = "";
            return self;
        });
    });

    inited = true;
};
