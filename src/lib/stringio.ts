import { Class, IO, IOClass, Qnil, RValue, Runtime } from "../runtime";
import { RubyString } from "../runtime/string"
import { Object } from "../runtime/object"
import { NameError } from "../errors";
import { ExecutionContext } from "../execution_context";
import { Enumerable } from "../runtime/enumerable";

let inited = false;

export class StringIO implements IO {
    static async new() {
        return new RValue(await this.klass(), new StringIO());
    }

    private static klass_: RValue;

    static async klass(): Promise<RValue> {
        const klass = await Object.find_constant("StringIO");

        if (klass) {
            this.klass_ = klass;
        } else {
            throw new NameError(`missing constant StringIO`);
        }

        return this.klass_;
    }

    public string: string;
    public pos_value: number;

    constructor(string: string = "") {
        this.string = string;
        this.pos_value = 0;
    }

    puts(val: string): void {
        this.string += val + "\n";
        this.pos_value += val.length + 1;
    }

    write(val: string): void {
        // write potentially overwrites existing content
        const before = this.string.substring(0, this.pos_value);
        const after = this.string.substring(this.pos_value + val.length);
        this.string = before + val + after;
        this.pos_value += val.length;
    }

    is_tty(): boolean {
        return false;
    }

    close(): void {
        // no-op
    }

    pos(): number {
        return this.pos_value;
    }

    set_pos(pos: number): void {
        this.pos_value = pos;
    }

    seek(offset: number, whence: number): number {
        // IO::SEEK_SET = 0, IO::SEEK_CUR = 1, IO::SEEK_END = 2
        switch (whence) {
            case 0: // SEEK_SET
                this.pos_value = offset;
                break;
            case 1: // SEEK_CUR
                this.pos_value += offset;
                break;
            case 2: // SEEK_END
                this.pos_value = this.string.length + offset;
                break;
        }
        return 0;
    }

    rewind(): void {
        this.pos_value = 0;
    }

    eof(): boolean {
        return this.pos_value >= this.string.length;
    }

    read(length?: number): string | null {
        if (this.eof()) {
            return null;
        }

        let result: string;

        if (length) {
            result = this.string.substring(this.pos_value, this.pos_value + length);
            this.pos_value += result.length;
        } else {
            result = this.string.substring(this.pos_value);
            this.pos_value = this.string.length;
        }

        return result;
    }

    gets(separator: string, limit?: number, chomp?: boolean): string | null {
        if (limit === undefined) limit = -1;
        if (chomp === undefined) chomp = false;

        if (this.eof()) {
            return null;
        }

        const start = this.pos_value;
        const index = this.string.indexOf(separator, start);

        let result: string;

        if (index === -1) {
            // no separator found, read to end
            const end = limit > -1 ? Math.min(limit, this.string.length) : this.string.length;
            result = this.string.substring(start, end);
            this.pos_value = end;
        } else {
            // don't forget to include the separator in the result
            const end = limit > -1 ? Math.min(limit, index + separator.length) : index + separator.length;
            result = this.string.substring(start, end);
            this.pos_value = end;
        }

        if (chomp) result = result.trimEnd();

        return result;
    }

    flush() {
        // no-op
    }
}

export const init = () => {
    if (inited) return;

    Runtime.define_class("StringIO", IOClass, async (klass: Class) => {
        // @TODO: also include IO::generic_readable and IO::generic_writable
        klass.include(await Enumerable.module());

        klass.define_native_method("initialize", (self: RValue, args: RValue[]): RValue => {
            const str = args.length > 0 ? args[0].get_data<string>() : "";
            self.data = new StringIO(str);
            return Qnil;
        });

        klass.define_native_method("string", async (self: RValue): Promise<RValue> => {
            // @TODO: handle string encoding
            return await RubyString.new(self.get_data<StringIO>().string);
        });

        // All other methods (puts, write, read, gets, pos, pos=, seek, rewind, eof?, close, isatty)
        // are inherited from IOClass and use the IO interface methods defined in StringIO
    });

    inited = true;
}
