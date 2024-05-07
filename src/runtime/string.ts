import { EncodingConverterNotFoundError, IndexError, NameError, NotImplementedError, RangeError } from "../errors";
import { Class, Qnil, RValue, Runtime, Qtrue, Qfalse, ObjectClass } from "../runtime";
import { hash_string } from "../util/string_utils";
import { Integer } from "./integer";
import { MatchData, Regexp } from "./regexp";
import { Range } from "./range";
import { Object } from "./object";
import { ExecutionContext } from "../execution_context";
import { Encoding } from "./encoding";
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

    static async new(str: string): Promise<RValue> {
        return new RValue(await this.klass(), str);
    }

    static async klass(): Promise<RValue> {
        const klass = await Object.find_constant("String");

        if (klass) {
            this.klass_ = klass;
        } else {
            throw new NameError(`missing constant String`);
        }

        return this.klass_;
    }

    static async get_encoding(str: RValue): Promise<Encoding> {
        return (await this.get_encoding_rval(str)).get_data<Encoding>();
    }

    static async get_encoding_rval(str: RValue): Promise<RValue> {
        const context = this.get_context(str);

        if (!context.encoding_rval) {
            context.encoding_rval = await Encoding.default();
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

    static async ascii_only(str: RValue): Promise<boolean> {
        const encoding = await this.get_encoding(str);
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

    Runtime.define_class("String", ObjectClass, async (klass: Class) => {
        await mix_shared_string_methods_into(klass);

        klass.define_native_method("initialize", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const str = args[0];

            if (str) {
                Runtime.assert_type(str, await String.klass());
                self.data = str.data;
            } else {
                self.data = "";
            }

            return Qnil;
        });

        klass.define_native_method("+@", async (self: RValue): Promise<RValue> => {
            // return unfrozen string
            return await String.new(self.get_data<string>());
        });

        klass.define_native_method("-@", async (self: RValue): Promise<RValue> => {
            // return frozen string
            const new_str = await String.new(self.get_data<string>());
            new_str.freeze();
            return new_str;
        });

        klass.define_native_method("hash", async (self: RValue): Promise<RValue> => {
            return await Integer.new(hash_string(self.get_data<string>()));
        });

        klass.define_native_method("to_s", (self: RValue): RValue => {
            return self;
        });

        await klass.alias_method("to_str", "to_s");

        klass.define_native_method("inspect", async (self: RValue): Promise<RValue> => {
            const str = self.get_data<string>();
            return await String.new(String.inspect(str));
        });

        klass.define_native_method("*", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const multiplier = args[0];
            Runtime.assert_type(multiplier, await Numeric.klass());  // @TODO: handle floats (yes, you can multiply strings by floats, oh ruby)
            return String.new(self.get_data<string>().repeat(multiplier.get_data<number>()));
        });

        klass.define_native_method("split", async (self: RValue, args: RValue[]): Promise<RValue> => {
            let delim;

            if (args.length > 0) {
                delim = args[0].get_data<string>();
            } else {
                delim = " ";
            }

            const str = self.get_data<string>();
            const chunks = str.split(delim).map((elem) => String.new(elem));
            return await RubyArray.new(await Promise.all(chunks));
        });

        // a count of 0 means replace all matches, > 0 means only replace max n times
        const gsub = async (str: string, pattern: Regexp | string, replacements: RValue, count: number = 0): Promise<string> => {
            const matches: [number, number, string][] = [];

            if (pattern instanceof Regexp) {
                await pattern.scan(str, async (match_data: MatchData): Promise<boolean> => {
                    matches.push([match_data.begin(0), match_data.end(0), match_data.match(0)]);
                    await Regexp.set_svars(match_data);

                    if (count > 0 && matches.length === count) {
                        // exit early
                        return false;
                    } else {
                        // keep going
                        return true;
                    }
                });
            } else {
                let last_pos = 0;
                let current_pos = 0;

                do {
                    current_pos = str.indexOf(pattern, last_pos);

                    if (current_pos > -1) {
                        matches.push([current_pos, current_pos + pattern.length, pattern]);

                        if (count > 0 && matches.length === count) {
                            // exit early
                            break;
                        }
                    }

                    last_pos = current_pos + pattern.length;
                } while (current_pos > -1);
            }

            const chunks = [];
            let last_pos = 0;

            if (replacements.klass === await Hash.klass()) {
                const replacement_hash = replacements.get_data<Hash>();

                for (const [begin, end, match] of matches) {
                    chunks.push(str.slice(last_pos, begin));
                    const replacement = await replacement_hash.get(await String.new(match))
                    chunks.push(replacement.get_data<string>());
                    last_pos = end;
                }
            } else {
                const replacement = replacements.get_data<string>();

                for (const [begin, end, _] of matches) {
                    chunks.push(str.slice(last_pos, begin));
                    chunks.push(replacement);
                    last_pos = end;
                }
            }

            chunks.push(str.slice(last_pos, str.length));

            return chunks.join("");
        }

        klass.define_native_method("gsub", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const str = self.get_data<string>();
            const pattern = args[0].get_data<Regexp | string>();
            const replacements = args[1];

            return String.new(await gsub(str, pattern, replacements));
        });

        klass.define_native_method("gsub!", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const str = self.get_data<string>();
            const pattern = args[0].get_data<Regexp | string>();
            const replacements = args[1];
            const new_str = await gsub(str, pattern, replacements);

            if (new_str === str) {
                return Qnil;
            } else {
                self.data = new_str;
                return self;
            }
        });

        klass.define_native_method("sub", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const str = self.get_data<string>();
            const pattern = args[0].get_data<Regexp | string>();
            const replacements = args[1];

            return String.new(await gsub(str, pattern, replacements, 1));
        });

        klass.define_native_method("sub!", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const str = self.get_data<string>();
            const pattern = args[0].get_data<Regexp | string>();
            const replacements = args[1];
            const new_str = await gsub(str, pattern, replacements, 1);

            if (new_str === str) {
                return Qnil;
            } else {
                self.data = new_str;
                return self;
            }
        });

        klass.define_native_method("match?", async (self: RValue, args: RValue[]): Promise<RValue> => {
            let pattern: Regexp;

            if (args[0].klass === await Regexp.klass()) {
                pattern = args[0].get_data<Regexp>();
            } else {
                const re_str = await Runtime.coerce_to_string(args[0]);
                pattern = Regexp.compile(re_str.get_data<string>());
            }

            if (pattern.search(self.get_data<string>()) === null) {
                return Qfalse;
            }

            return Qtrue;
        });

        // @TODO: scan should yield results to the block
        klass.define_native_method("scan", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const data = self.get_data<string>();
            const pattern = args[0];

            if (pattern.klass === await String.klass()) {
                // @TODO: data should be passed through Regexp.quote() for some reason,
                // but we don't have an impl yet
                const pattern_str = pattern.get_data<string>();
                const results: RValue[] = [];
                let last_pos = -pattern_str.length - 1;

                do {
                    last_pos = data.indexOf(pattern_str, last_pos + pattern_str.length + 1);

                    if (last_pos > -1) {
                        const str = data.slice(last_pos, last_pos + pattern_str.length);
                        results.push(await String.new(str));
                        last_pos += pattern_str.length;
                    }
                } while (last_pos > -1);

                return await RubyArray.new(results);
            } else if (pattern.klass === await Regexp.klass()) {
                const results: RValue[] = [];

                await pattern.get_data<Regexp>().scan(data, async (match_data: MatchData): Promise<boolean> => {
                    if (match_data.captures.length === 1) {
                        const capture = match_data.captures[0]
                        const str = data.slice(capture[0], capture[1]);
                        results.push(await String.new(str));
                    } else {
                        const captures = [];

                        for (let i = 1; i < match_data.captures.length; i ++) {
                            const capture = match_data.captures[i];
                            const str = data.slice(capture[0], capture[1]);
                            captures.push(await String.new(str));
                        }

                        results.push(await RubyArray.new(captures));
                    }

                    return true;
                });

                return RubyArray.new(results);
            } else {
                throw new TypeError(`wrong argument type ${pattern.klass.get_data<Class>().name} (expected Regexp)`);
            }
        });

        klass.define_native_method("to_i", async (self: RValue): Promise<RValue> => {
            const str = self.get_data<string>();

            if (str.indexOf(".") > 0) {
                return await Float.new(parseFloat(str));
            } else {
                return await Integer.get(parseInt(str));
            }
        });

        klass.define_native_method("to_sym", async (self: RValue, args: RValue[]): Promise<RValue> => {
            return await Runtime.intern(self.get_data<string>());
        });

        klass.define_native_method("%", async (self: RValue, args: RValue[]): Promise<RValue> => {
            args = (await Object.send(self, "Array", args)).get_data<RubyArray>().elements;
            return sprintf(self, args);
        });

        klass.define_native_method("==", async (self: RValue, args: RValue[]): Promise<RValue> => {
            if (args[0].klass !== await String.klass()) {
                return Qfalse;
            }

            if (self.get_data<string>() === args[0].get_data<string>()) {
                return Qtrue;
            } else {
                return Qfalse;
            }
        });

        klass.define_native_method("!=", async (self: RValue, args: RValue[]): Promise<RValue> => {
            if (args[0].klass !== await String.klass()) {
                return Qtrue;
            }

            if (self.get_data<string>() !== args[0].get_data<string>()) {
                return Qtrue;
            } else {
                return Qfalse;
            }
        });

        klass.define_native_method("+", async (self: RValue, args: RValue[]): Promise<RValue> => {
            Runtime.assert_type(args[0], await String.klass());
            return String.new(self.get_data<string>() + args[0].get_data<string>());
        });

        klass.define_native_method("empty?", (self: RValue): RValue => {
            return self.get_data<string>().length === 0 ? Qtrue : Qfalse;
        });

        klass.define_native_method("size", async (self: RValue): Promise<RValue> => {
            return await Integer.get(self.get_data<string>().length);
        });

        await klass.alias_method("length", "size");

        klass.define_native_method("bytesize", async (self: RValue): Promise<RValue> => {
            const encoding = (await String.get_encoding_rval(self)).get_data<Encoding>();
            return await Integer.get(encoding.bytesize(self.get_data<string>()));
        });

        klass.define_native_method("[]=", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const data = self.get_data<string>();
            let replacement_pos = 1;
            let start_pos, end_pos

            if (args[0].klass === (await Object.find_constant("Range"))!) {
                const range = args[0].get_data<Range>();

                Runtime.assert_type(range.begin, await Integer.klass());
                Runtime.assert_type(range.end, await Integer.klass());

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
            } else if (args[0].klass === await String.klass()) {
                const substring = args[0].get_data<string>();
                const idx = data.indexOf(substring);

                if (idx > -1) {
                    start_pos = idx;
                    end_pos = start_pos + args[0].get_data<string>().length;
                } else {
                    throw new IndexError("string not matched");
                }
            } else if (args[0].klass === await Regexp.klass()) {
                throw new NotImplementedError("String#[]=(Regexp) is not yet implemented");
            } else {
                Runtime.assert_type(args[0], await Integer.klass());
                start_pos = args[0].get_data<number>();

                if (args.length > 2) {
                    Runtime.assert_type(args[1], await Integer.klass());
                    end_pos = args[1].get_data<number>();
                    replacement_pos = 2;
                } else {
                    if (start_pos >= data.length) {
                        return Qnil;
                    }

                    end_pos = data.length - 1;
                }
            }

            Runtime.assert_type(args[replacement_pos], await String.klass());
            const replacement = args[replacement_pos].get_data<string>();

            self.data = `${data.slice(0, start_pos)}${replacement}${data.slice(end_pos)}`;
            return args[replacement_pos];
        });

        klass.define_native_method("ljust", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const data = self.get_data<string>();
            Runtime.assert_type(args[0], await Integer.klass());
            const size = args[0].get_data<number>();

            let pad_str;

            if (args.length > 1) {
                Runtime.assert_type(await String.klass(), args[1]);
                pad_str = args[1].get_data<string>();
            } else {
                pad_str = " ";
            }

            return String.new(left_pad(data, pad_str, size));
        });

        klass.define_native_method("dup", async (self: RValue): Promise<RValue> => {
            return await String.new(self.get_data<string>());
        });

        klass.define_native_method("replace", async (self: RValue, args: RValue[]): Promise<RValue> => {
            Runtime.assert_type(args[0], await String.klass());
            self.data = args[0].get_data<string>();
            return self;
        });

        await klass.alias_method("initialize_copy", "replace");

        klass.define_native_method("start_with?", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const data = self.get_data<string>();

            if (args[0]?.klass === await Regexp.klass()) {
                const match = args[0].get_data<Regexp>().search(data);
                return match && match.begin(0) === 0 ? Qtrue : Qfalse;
            } else {
                Runtime.assert_type(args[0] || Qnil, await String.klass());
                const search_str = args[0].get_data<string>();
                return data.startsWith(search_str) ? Qtrue : Qfalse;
            }
        });

        klass.define_native_method("=~", async (self: RValue, args: RValue[]): Promise<RValue> => {
            if (args[0].klass === await Regexp.klass()) {
                const regexp = args[0].get_data<Regexp>();
                const result = regexp.search(self.get_data<string>());

                if (result) {
                    await Regexp.set_svars(result);
                    return Integer.get(result.begin(0));
                } else {
                    return Qnil;
                }
            } else {
                return await Object.send(args[0], "=~", [self]);
            }
        });

        // this is designed to be used only by << and concat below
        const append_to = async (str: RValue, val: RValue): Promise<void> => {
            const encoding = await String.get_encoding(str);

            if (val.klass === await Integer.klass()) {
                const num = val.get_data<number>();

                if (!encoding.codepoint_valid(num)) {
                    throw new RangeError(`${num} out of char range`);
                }

                if (num >= 128 && num <= 255 && encoding.name === "US-ASCII") {
                    String.set_encoding(str, Encoding.binary);
                }

                str.data = str.get_data<string>() + encoding.codepoint_to_utf16(num);
            } else {
                await Encoding.enc_cr_str_buf_cat(str, await Runtime.coerce_to_string(val));
            }
        }

        klass.define_native_method("<<", async (self: RValue, args: RValue[]): Promise<RValue> => {
            await Object.check_frozen(self);
            await append_to(self, args[0]);
            return self;
        });

        klass.define_native_method("concat", async (self: RValue, args: RValue[]): Promise<RValue> => {
            await Object.check_frozen(self);

            const self_data = self.get_data<string>();

            for (const arg of args) {
                if (arg.object_id === self.object_id) {
                    // concating self uses the previous value of self
                    self.data = self.get_data<string>() + self_data;
                } else {
                    await append_to(self, arg);
                }
            }

            return self;
        });

        klass.define_native_method("include?", async (self: RValue, args: RValue[]): Promise<RValue> => {
            Runtime.assert_type(args[0], await String.klass());
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

        klass.define_native_method("chomp", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const data = self.get_data<string>();
            const line_sep = args[0] || ExecutionContext.current.globals["$/"];
            const line_sep_str = line_sep.get_data<string>();
            const remove_re = chomp_re_map[line_sep_str];

            if (remove_re) {
                return await String.new(data.replace(remove_re, ""));
            } else {
                if (data.endsWith(line_sep_str)) {
                    return await String.new(data.slice(0, data.length - line_sep_str.length));
                } else {
                    return await String.new(data);
                }
            }
        });

        // Returns a new string copied from self, with trailing characters possibly removed.
        // Removes "\r\n" if those are the last two characters. Otherwise removes the last
        // character if it exists.
        klass.define_native_method("chop", async (self: RValue): Promise<RValue> => {
            const data = self.get_data<string>();
            const remove_chars = data.endsWith("\r\n") ? 2 : 1;

            if (remove_chars > data.length) {
                return await String.new("");
            } else {
                return await String.new(data.slice(0, data.length - remove_chars));
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

        klass.define_native_method("strip", async (self: RValue): Promise<RValue> => {
            return await String.new(strip(self.get_data<string>()));
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

        klass.define_native_method("upcase", async (self: RValue): Promise<RValue> => {
            return await String.new(self.get_data<string>().toUpperCase());
        });

        klass.define_native_method("downcase", async (self: RValue): Promise<RValue> => {
            return await String.new(self.get_data<string>().toLowerCase());
        });

        klass.define_native_method("encoding", async (self: RValue): Promise<RValue> => {
            return await String.get_encoding_rval(self);
        });

        klass.define_native_method("encode!", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const encoding_arg = await Encoding.coerce(args[0]);

            if (encoding_arg) {
                const target_encoding = await Encoding.supported_conversion(self, encoding_arg);

                if (target_encoding) {
                    await String.set_encoding(self, target_encoding);
                    return self;
                }
            }

            const self_encoding = await String.get_encoding_rval(self);

            throw new EncodingConverterNotFoundError(
                `code converter not found (${self_encoding.get_data<Encoding>().name} to ${args[0].get_data<string>()})`
            );
        });

        klass.define_native_method("encode", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const encoding_arg = await Encoding.coerce(args[0]);

            if (encoding_arg) {
                const target_encoding = await Encoding.supported_conversion(self, encoding_arg);

                if (target_encoding) {
                    const new_str = await String.new(self.get_data<string>());
                    String.set_encoding(new_str, target_encoding);
                    return new_str;
                }
            }

            const self_encoding = await String.get_encoding_rval(self);

            throw new EncodingConverterNotFoundError(
                `code converter not found (${self_encoding.get_data<Encoding>().name} to ${args[0].get_data<string>()})`
            );
        });

        klass.define_native_method("tr", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const selector_str = (await Runtime.coerce_to_string(args[0])).get_data<string>();
            const replacements = (await Runtime.coerce_to_string(args[1])).get_data<string>();
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
