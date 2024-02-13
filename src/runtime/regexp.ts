import { IndexError, RuntimeError } from "../errors";
import { ExecutionContext } from "../execution_context";
import { Array, Class, IntegerClass, ObjectClass, Qnil, RValue, RegexpClass, Runtime } from "../runtime";
import { String as RubyString } from "../runtime/string";
import * as WASM from "../wasm";
import { Integer } from "./integer";
import { Object } from "./object";

let onigmo: Onigmo;
let inited = false;

class OnigmoExportsWrapper {
    private original_exports: OnigmoExports;

    public memory: DataView;
    public OnigEncodingUTF_16LE: number;
    public OnigSyntaxRuby: number;
    public OnigDefaultCaseFoldFlag: number;

    constructor(original_exports: OnigmoExports) {
        this.original_exports = original_exports;
        this.memory = new DataView(this.original_exports.memory.buffer);
        this.OnigEncodingUTF_16LE = original_exports.OnigEncodingUTF_16LE;
        this.OnigSyntaxRuby = original_exports.OnigSyntaxRuby;
        this.OnigDefaultCaseFoldFlag = original_exports.OnigDefaultCaseFoldFlag;
    }

    private ensure_enough_memory<R extends ReturnType<any>>(cb: () => R) {
        try {
            return cb();
        } catch (e) {
            if (e instanceof Error && e.name === "RuntimeError") {
                // hopefully increasing by an entire page is always enough :/
                this.original_exports.memory.grow(1);
                this.memory = new DataView(this.original_exports.memory.buffer);
                return cb();
            }

            throw e;
        }
    }

    onig_new_deluxe(...params: Parameters<OnigmoExports["onig_new_deluxe"]>): ReturnType<OnigmoExports["onig_new_deluxe"]> {
        return this.ensure_enough_memory(() => {
            return this.original_exports.onig_new_deluxe(...params);
        });
    }

    onig_search(...params: Parameters<OnigmoExports["onig_search"]>): ReturnType<OnigmoExports["onig_search"]> {
        return this.ensure_enough_memory(() => {
            return this.original_exports.onig_search(...params);
        });
    }

    onig_free(...params: Parameters<OnigmoExports["onig_free"]>): ReturnType<OnigmoExports["onig_free"]> {
        return this.original_exports.onig_free(...params);
    }

    onig_region_new(...params: Parameters<OnigmoExports["onig_region_new"]>): ReturnType<OnigmoExports["onig_region_new"]> {
        return this.ensure_enough_memory(() => {
            return this.original_exports.onig_region_new(...params);
        });
    }

    onig_region_free(...params: Parameters<OnigmoExports["onig_region_free"]>): ReturnType<OnigmoExports["onig_region_free"]> {
        return this.original_exports.onig_region_free(...params);
    }

    onig_error_code_to_str(...params: Parameters<OnigmoExports["onig_error_code_to_str"]>): ReturnType<OnigmoExports["onig_error_code_to_str"]> {
        return this.ensure_enough_memory(() => {
            return this.original_exports.onig_error_code_to_str(...params);
        });
    }

    malloc(...params: Parameters<OnigmoExports["malloc"]>): ReturnType<OnigmoExports["malloc"]> {
        return this.ensure_enough_memory(() => {
            return this.original_exports.malloc(...params);
        });
    }

    free(...params: Parameters<OnigmoExports["free"]>): ReturnType<OnigmoExports["free"]> {
        return this.original_exports.free(...params);
    }
}

export const init = async () => {
    if (inited) return;

    const onigmo_instance = await WASM.load_module("onigmo");
    onigmo = { exports: new OnigmoExportsWrapper(onigmo_instance.exports as unknown as OnigmoExports) };

    const regexp = RegexpClass.get_data<Class>();

    regexp.define_native_method("=~", (self: RValue, args: RValue[]): RValue => {
        const str = Runtime.coerce_to_string(args[0]);
        const str_data = str.get_data<string>();
        const regexp = self.get_data<Regexp>();
        const result = regexp.search(str_data);

        if (result) {
            Regexp.set_svars(result);
            return Integer.get(result.captures[0][0]);
        } else {
            return Qnil;
        }
    });

    Runtime.define_class("MatchData", ObjectClass, (klass: Class) => {
        klass.define_native_method("captures", (self: RValue): RValue => {
            const match_data = self.get_data<MatchData>();
            const captures = [];

            for (let i = 1; i < match_data.captures.length; i ++) {
                const [begin, end] = match_data.captures[i];
                captures.push(RubyString.new(match_data.str.slice(begin, end)));
            }

            return Array.new(captures);
        });

        klass.define_native_method("begin", (self: RValue, args: RValue[]): RValue => {
            const match_data = self.get_data<MatchData>();
            Runtime.assert_type(args[0], IntegerClass);
            const index = args[0].get_data<number>();
            return Integer.get(match_data.begin(index));
        });

        klass.define_native_method("end", (self: RValue, args: RValue[]): RValue => {
            const match_data = self.get_data<MatchData>();
            Runtime.assert_type(args[0], IntegerClass);
            const index = args[0].get_data<number>();
            return Integer.get(match_data.end(index));
        });

        klass.define_native_method("match", (self: RValue, args: RValue[]): RValue => {
            const match_data = self.get_data<MatchData>();
            Runtime.assert_type(args[0], IntegerClass);
            const index = args[0].get_data<number>();
            return RubyString.new(match_data.match(index));
        });

        klass.define_native_method("inspect", (self: RValue, args: RValue[]): RValue => {
            const match_data = self.get_data<MatchData>();
            const fragments = [`#<MatchData ${RubyString.inspect(match_data.match(0))}`];

            for (let i = 1; i < match_data.captures.length; i ++) {
                fragments.push(`${i}:${RubyString.inspect(match_data.match(i))}`);
            }

            return RubyString.new(`${fragments.join(" ")}>`);
        });
    });

    inited = true;
};

type Address = number;

type CompileInfoFields = {
    num_of_elements: number;
    pattern_enc: Address;
    target_enc: Address;
    syntax: Address;
    option: number;
    case_fold_flag: number;
}

class CompileInfo {
    private static size = 24;
    public address: Address;

    constructor(address: Address) {
        this.address = address;
    }

    static create(fields: CompileInfoFields): CompileInfo {
        const start_addr = onigmo.exports.malloc(this.size);
        const in_order = [
            fields.num_of_elements,
            fields.pattern_enc,
            fields.target_enc,
            fields.syntax,
            fields.option,
            fields.case_fold_flag
        ];

        for (let i = 0; i < in_order.length; i ++) {
            onigmo.exports.memory.setUint32(start_addr + (i * 4), in_order[i], true);
        }

        return new CompileInfo(start_addr);
    }
}

type ErrorInfoFields = {
    enc: Address;
    par: Address;
    par_end: Address;
}

class ErrorInfo {
    private static size = 12;
    public address: Address;

    constructor(address: Address) {
        this.address = address;
    }

    static create(fields: ErrorInfoFields): ErrorInfo {
        const start_addr = onigmo.exports.malloc(this.size);
        const in_order = [
            fields.enc,
            fields.par,
            fields.par_end
        ]

        for (let i = 0; i < in_order.length; i ++) {
            onigmo.exports.memory.setUint32(start_addr + (i * 4), in_order[i], true);
        }

        return new ErrorInfo(start_addr);
    }
}

type RegionFields = {
    allocated: number;
    num_regs: number;
    beg: Address;
    end: Address;
}

class Region {
    private static size = 16;
    public address: Address;

    constructor(address: Address) {
        this.address = address;
    }

    get allocated(): number {
        return onigmo.exports.memory.getUint32(this.address, true);
    }

    get num_regs(): number {
        return onigmo.exports.memory.getUint32(this.address + 4, true);
    }

    get beg(): Address {
        return onigmo.exports.memory.getUint32(this.address + 8, true);
    }

    get end(): Address {
        return onigmo.exports.memory.getUint32(this.address + 12, true);
    }

    static create(fields: RegionFields): Region {
        const start_addr = onigmo.exports.malloc(this.size);
        const in_order = [
            fields.allocated,
            fields.num_regs,
            fields.beg,
            fields.end
        ]

        for (let i = 0; i < in_order.length; i ++) {
            onigmo.exports.memory.setUint32(start_addr + (i * 4), in_order[i], true);
        }

        return new Region(start_addr);
    }

    beg_at(index: number): number {
        const addr = this.beg + (index * 4);
        return onigmo.exports.memory.getUint32(addr, true);
    }

    end_at(index: number): number {
        const addr = this.end + (index * 4);
        return onigmo.exports.memory.getUint32(addr, true);
    }
}

// Pointer to a pointer to a regexp_t
class RegexpPtr {
    private static size = 4;
    public address: Address;

    constructor(address: Address) {
        this.address = address;
    }

    deref(): Address {
        return onigmo.exports.memory.getUint32(this.address, true);
    }

    static create() {
        const start_addr = onigmo.exports.malloc(this.size);
        onigmo.exports.memory.setUint32(start_addr, 0, true);
        return new RegexpPtr(start_addr);
    }
}

class UTF16String {
    public start: Address;
    public end: Address;

    constructor(start: Address, end?: Address) {
        this.start = start;

        if (end) {
            this.end = end;
        } else {
            const mem = new Uint8Array(onigmo.exports.memory.buffer);
            let end = start;

            // increment until null byte (0) encountered
            while (mem[end]) {
                end ++;
            }

            this.end = end;
        }
    }

    to_string(): string {
        const mem = new Uint8Array(onigmo.exports.memory.buffer);
        const pts = []

        for (let i = this.start; i < this.end; i += 2) {
            pts.push(mem[i] + mem[i + 1] << 8);
        }

        return String.fromCharCode(...pts);
    }

    static create(str: string): UTF16String {
        const bytes: number[] = [];

        for (let i = 0; i < str.length; i++) {
            const charCode = str.charCodeAt(i);
            bytes.push(charCode & 0x00ff);
            bytes.push((charCode & 0xff00) >> 8);
        }

        bytes.push(0);

        const start_addr = onigmo.exports.malloc(bytes.length);
        const mem = new Uint8Array(onigmo.exports.memory.buffer);
        mem.set(bytes, start_addr);
        return new UTF16String(start_addr, start_addr + bytes.length - 1);
    }
}

class ASCIIString {
    private start: number;
    private end: number;

    constructor(start: number, end: number) {
        this.start = start;
        this.end = end;
    }

    to_string(): string {
        const pts = onigmo.exports.memory.buffer.slice(this.start, this.end);
        return String.fromCharCode(...new Uint8Array(pts));
    }
}

type ErrorCode = number;
type Position = number;

enum RegionFreeScheme {
    CONTENTS_ONLY = 0,
    SELF = 1
}

export interface Onigmo {
    exports: OnigmoExportsWrapper
}

interface OnigmoExports {
    onig_new_deluxe(regexp_ptr: Address, pattern: Address, pattern_end: Address, compile_info: Address, error_info: Address): ErrorCode;
    onig_search(regexp: Address, str: Address, str_end: Address, str_start: Address, range: Address, region: Address, options: number): ErrorCode | Position;
    onig_free(regexp: Address): void;

    onig_region_new(): Address;
    onig_region_free(region: Address, free_type: RegionFreeScheme): void;

    onig_error_code_to_str(out_str: Address, error_code: ErrorCode, error_info: Address): number;

    OnigEncodingUTF_16LE: Address;
    OnigSyntaxRuby: Address;
    OnigDefaultCaseFoldFlag: number;

    memory: WebAssembly.Memory;

    // libc
    malloc(size: number): number;
    free(ptr: number): void;
}

// compile options
const ONIG_OPTION_NONE = 0;
const ONIG_OPTION_IGNORECASE = 1;
const ONIG_OPTION_EXTEND = ONIG_OPTION_IGNORECASE << 1;
const ONIG_OPTION_MULTILINE = ONIG_OPTION_EXTEND << 1;

// exit codes
const ONIG_NORMAL = 0;
const ONIG_MISMATCH = -1;
const ONIG_NO_SUPPORT_CONFIG = -2;

// general constants
const ONIG_MAX_ERROR_MESSAGE_LEN = 90

export class MatchData {
    static from_region(str: string, region: Region) {
        const captures: [number, number][] = [];

        for (let i = 0; i < region.num_regs; i ++) {
            captures.push([region.beg_at(i) / 2, region.end_at(i) / 2]);
        }

        return new MatchData(str, captures);
    }

    private static constant_: RValue | null = null;

    static get constant(): RValue {
        if (!this.constant_) {
            this.constant_ = Object.find_constant("MatchData")!
        }

        return this.constant_;
    }

    public str: string;
    public captures: [number, number][];
    private rval: RValue | null = null;

    constructor(str: string, captures: [number, number][]) {
        this.str = str;
        this.captures = captures;
    }

    to_rval() {
        if (!this.rval) {
            this.rval = new RValue(MatchData.constant, this);
        }

        return this.rval;
    }

    begin(index: number): number {
        if (index >= this.captures.length) {
            throw new IndexError(`index ${index} out of matches`);
        }

        return this.captures[index][0];
    }

    end(index: number): number {
        if (index >= this.captures.length) {
            throw new IndexError(`index ${index} out of matches`);
        }

        return this.captures[index][1];
    }

    match(index: number): string {
        if (index >= this.captures.length) {
            throw new IndexError(`index ${index} out of matches`);
        }

        const [begin, end] = this.captures[index];
        return this.str.slice(begin, end);
    }
}

export class Regexp {
    static new(pattern: string, options: string): RValue {
        return new RValue(RegexpClass, this.compile(pattern, options));
    }

    static make_compile_info(): CompileInfoFields {
        return {
            num_of_elements: 5,
            pattern_enc: onigmo.exports.OnigEncodingUTF_16LE,
            target_enc: onigmo.exports.OnigEncodingUTF_16LE,
            syntax: onigmo.exports.OnigSyntaxRuby,
            option: ONIG_OPTION_NONE,
            case_fold_flag: onigmo.exports.OnigDefaultCaseFoldFlag
        };
    }

    static compile(pat: string, options: string): Regexp {
        if (pat.includes("[object Object]")) {
            debugger;
        }
        const compile_info = CompileInfo.create(Regexp.make_compile_info());

        const regexp_ptr = RegexpPtr.create();
        const errorinfo = ErrorInfo.create({enc: 0, par: 0, par_end: 0});
        const pattern = UTF16String.create(pat);

        const error_code: ErrorCode = onigmo.exports.onig_new_deluxe(
            regexp_ptr.address, pattern.start, pattern.end, compile_info.address, errorinfo.address
        );

        if (error_code == ONIG_NORMAL) {
            const regexp: Address = regexp_ptr.deref();

            onigmo.exports.free(compile_info.address);
            onigmo.exports.free(regexp_ptr.address);
            onigmo.exports.free(errorinfo.address);

            return new Regexp(pat, regexp);
        } else {
            const err_msg = Regexp.error_code_to_string(error_code, errorinfo);

            onigmo.exports.free(compile_info.address);
            onigmo.exports.free(regexp_ptr.address);
            onigmo.exports.free(errorinfo.address);

            throw new RuntimeError(err_msg);
        }
    }

    static error_code_to_string(error_code: ErrorCode, errorinfo?: ErrorInfo): string {
        const err_msg_ptr = onigmo.exports.malloc(ONIG_MAX_ERROR_MESSAGE_LEN);
        const err_msg_len = onigmo.exports.onig_error_code_to_str(err_msg_ptr, error_code, errorinfo?.address || 0);
        const err_msg = new ASCIIString(err_msg_ptr, err_msg_ptr + err_msg_len);
        onigmo.exports.free(err_msg_ptr);
        return err_msg.to_string();
    }

    static set_svars(match_data: MatchData) {
        const ec = ExecutionContext.current;
        ec.frame_svar()!.svars["$~"] = match_data.to_rval();
        ec.frame_svar()!.svars["$&"] = RubyString.new(match_data.match(0));
    }

    public pattern: string;
    private regexp: Address;

    constructor(pattern: string, regexp: Address) {
        this.pattern = pattern;
        this.regexp = regexp;
    }

    search(str: string, pos: number = 0): MatchData | null {
        if (pos >= str.length) {
            return null;
        }

        const str_ptr = UTF16String.create(str);
        const region = new Region(onigmo.exports.onig_region_new());

        const exit_code_or_position = onigmo.exports.onig_search(
            this.regexp, str_ptr.start, str_ptr.end, str_ptr.start + (pos * 2), str_ptr.end, region.address, ONIG_OPTION_NONE
        );

        let result: MatchData | null = null;

        if (exit_code_or_position <= -2) {
            const error_msg = Regexp.error_code_to_string(exit_code_or_position);
            throw new RuntimeError(error_msg);
        } else if (exit_code_or_position == ONIG_MISMATCH) {
            result = null;
        } else {
            result = MatchData.from_region(str, region);
        }

        onigmo.exports.free(str_ptr.start);
        onigmo.exports.onig_region_free(region.address, RegionFreeScheme.CONTENTS_ONLY);

        return result;
    }

    scan(str: string, callback: (match_data: MatchData) => boolean): void {
        const str_ptr = UTF16String.create(str);
        const region = new Region(onigmo.exports.onig_region_new());
        let last_pos = 0;

        while (true) {
            const exit_code_or_position = onigmo.exports.onig_search(
                this.regexp, str_ptr.start, str_ptr.end, str_ptr.start + last_pos, str_ptr.end, region.address, ONIG_OPTION_NONE
            );

            if (exit_code_or_position <= -2) {
                const error_msg = Regexp.error_code_to_string(exit_code_or_position);
                throw new RuntimeError(error_msg);
            } else if (exit_code_or_position == ONIG_MISMATCH) {
                break;
            }

            if (!callback(MatchData.from_region(str, region))) {
                break;
            }

            last_pos = region.end_at(0);
        }

        onigmo.exports.free(str_ptr.start);
        onigmo.exports.onig_region_free(region.address, RegionFreeScheme.CONTENTS_ONLY);
    }
}
