import { ArgumentError, NameError, RubyError, TypeError } from "../errors";
import { Class, ObjectClass, Qnil, RValue, Runtime } from "../runtime";
import { Float } from "../runtime/float";
import { Integer } from "../runtime/integer";
import { Object } from "../runtime/object";
import { String } from "../runtime/string";

class RubyDate {
    private static klass_: RValue;

    static async klass(): Promise<RValue> {
        const klass = await Object.find_constant("Date");

        if (klass) {
            this.klass_ = klass;
        } else {
            throw new NameError(`missing constant Date`);
        }

        return this.klass_;
    }

    static async new(date: Date) {
        return new RValue(await RubyDate.klass(), date);
    }
}

export class DateError extends RubyError {
    private static ruby_class: RValue | null;

    constructor(message: string) {
        super(message);
        this.name = "Error";
    }

    async ruby_class() {
        return DateError.ruby_class ||= (await RubyDate.klass()).get_data<Class>().constants["Error"];
    }
}

const pattern_re = /%((?:[0_^#-:]|::)?)((?:[1-9]+)?)([YyCmMBbhdejHkIlPpSsLNnzZAaUuWwGgVvTtcDFXxRr%+])/g;

interface DateFormat {
    string_for(date: Date): string;
}

class DateFormatSpecifier implements DateFormat {
    private specifier: string;
    private flags: string;
    private width: number;

    constructor(specifier: string, flags: string, width: number) {
        this.specifier = specifier;
        this.flags = flags;
        this.width = width;
    }

    string_for(date: Date): string {
        switch (this.specifier) {
            case 'd':
                return date.getDate().toString().padStart(2, "0");
            case 'm':
                return (date.getMonth() + 1).toString().padStart(2, "0");
            case 'y':
                const full_year = date.getFullYear().toString()
                return full_year.slice(full_year.length - 2);
            case 'Y':
                return date.getFullYear().toString();
            default:
                throw new ArgumentError(`date format specifier ${this.specifier} is not currently supported`);
        }
    }
}

class Literal implements DateFormat {
    private text: string;

    constructor(text: string) {
        this.text = text;
    }

    string_for(_date: Date): string {
        return this.text;
    }
}

class DatePattern {
    private formats: DateFormat[];

    constructor(formats: DateFormat[]) {
        this.formats = formats;
    }

    format(date: Date): string {
        const parts = [];

        for (const format of this.formats) {
            parts.push(format.string_for(date));
        }

        return parts.join("");
    }
}

const parse_pattern = (pattern: string) => {
    const formats: DateFormat[] = [];
    let match, last_pos = 0;

    for (match of pattern.matchAll(pattern_re)) {
        const [, flags, width, specifier] = match;

        if (match.index! > last_pos) {
            formats.push(new Literal(pattern.slice(last_pos, match.index!)));
        }

        formats.push(new DateFormatSpecifier(specifier, flags, isNaN(+width) ? -1 : +width));
        last_pos = match.index! + match[0].length;
    }

    if (match && match.index! > last_pos) {
        formats.push(new Literal(pattern.slice(last_pos, match.index!)));
    }

    return new DatePattern(formats);
}

export const init = async () => {
    Runtime.define_class("Date", ObjectClass, (klass: Class) => {
        klass.define_native_singleton_method("today", async (self: RValue): Promise<RValue> => {
            return await RubyDate.new(new Date());
        });

        klass.define_native_method("initialize", async (self: RValue, args: RValue[]): Promise<RValue> => {
            let year, month, mday;

            if (args.length > 0) {
                switch (args[0].klass) {
                    case await Integer.klass():
                    case await Float.klass():
                        year = Math.floor(args[0].get_data<number>());
                        break;

                    default:
                        throw new TypeError("invalid year (not numeric)");
                }
            } else {
                // default year (Julian calendar day zero)
                year = -4712;
            }

            if (args.length > 1) {
                switch (args[1].klass) {
                    case await Integer.klass():
                    case await Float.klass():
                        month = Math.floor(args[1].get_data<number>());
                        break;

                    default:
                        throw new TypeError("invalid month (not numeric)");
                }
            } else {
                // default month
                month = 1;
            }

            if (month === 0 || month > 12) {
                throw new DateError("invalid date");
            } else if (month < 0) {
                month = 12 - (Math.abs(month) - 1) % 12
            }

            if (args.length > 2) {
                switch (args[2].klass) {
                    case await Integer.klass():
                    case await Float.klass():
                        mday = Math.floor(args[2].get_data<number>());
                        break;

                    default:
                        throw new TypeError("invalid day (not numeric)");
                }
            } else {
                // default day of month
                mday = 1;
            }

            const days_in_month = new Date(year, month, 0).getDate();

            if (mday === 0 || mday > days_in_month) {
                throw new DateError("invalid date");
            } else if (mday < 0) {
                mday = days_in_month - (Math.abs(mday) - 1) % days_in_month
            }

            self.data = new Date(year, month - 1, mday);
            return Qnil;
        });

        klass.define_native_method("strftime", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const pattern_str = (await Runtime.coerce_to_string(args[0])).get_data<string>();
            const pattern = parse_pattern(pattern_str);

            return String.new(pattern.format(self.get_data<Date>()));
        });

        const inspect_pattern = parse_pattern("%Y-%m-%d")

        klass.define_native_method("inspect", async (self: RValue): Promise<RValue> => {
            const date_str = inspect_pattern.format(self.get_data<Date>());
            return await String.new(`#<Date ${date_str}>`);
        });

        klass.define_native_method("to_s", async (self: RValue): Promise<RValue> => {
            return await String.new(inspect_pattern.format(self.get_data<Date>()));
        });
    });

    Runtime.define_class_under(await RubyDate.klass(), "Error", (await Object.find_constant("ArgumentError"))!);
};
