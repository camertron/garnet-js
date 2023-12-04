import { RuntimeError } from "../errors";
import { RValue, RegexpClass } from "../runtime";

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
            onig_memory.setUint32(start_addr + (i * 4), in_order[i], true);
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
            onig_memory.setUint32(start_addr + (i * 4), in_order[i], true);
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
        return onig_memory.getUint32(this.address, true);
    }

    get num_regs(): number {
        return onig_memory.getUint32(this.address + 4, true);
    }

    get beg(): Address {
        return onig_memory.getUint32(this.address + 8, true);
    }

    get end(): Address {
        return onig_memory.getUint32(this.address + 12, true);
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
            onig_memory.setUint32(start_addr + (i * 4), in_order[i], true);
        }

        return new Region(start_addr);
    }

    beg_at(index: number): number {
        const addr = this.beg + (index * 4);
        return onig_memory.getUint32(addr, true);
    }

    end_at(index: number): number {
        const addr = this.end + (index * 4);
        return onig_memory.getUint32(addr, true);
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
        return onig_memory.getUint32(this.address, true);
    }

    static create() {
        const start_addr = onigmo.exports.malloc(this.size);
        onig_memory.setUint32(start_addr, 0, true);
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
    exports: OnigmoExports
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

let onigmo: Onigmo, onig_memory: DataView;

export const init = (onigmoWasm: Onigmo) => {
    onigmo = onigmoWasm;
    onig_memory = new DataView(onigmoWasm.exports.memory.buffer);
};

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

            return new Regexp(regexp);
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

    private regexp: Address;

    constructor(regexp: Address) {
        this.regexp = regexp;
    }

    search(str: string, pos: number = 0): number | null {
        if (pos >= str.length) {
            return null;
        }

        const str_ptr = UTF16String.create(str);
        const region_ptr = onigmo.exports.onig_region_new();

        const exit_code_or_position = onigmo.exports.onig_search(
            this.regexp, str_ptr.start, str_ptr.end, str_ptr.start + (pos * 2), str_ptr.end, region_ptr, ONIG_OPTION_NONE
        );

        onigmo.exports.free(str_ptr.start);
        onigmo.exports.onig_region_free(region_ptr, RegionFreeScheme.CONTENTS_ONLY);

        if (exit_code_or_position <= -2) {
            const error_msg = Regexp.error_code_to_string(exit_code_or_position);
            throw new RuntimeError(error_msg);
        } else if (exit_code_or_position == ONIG_MISMATCH) {
            return null;
        } else {
            return exit_code_or_position;
        }
    }

    scan(str: string, callback: (matches: [number, number][]) => boolean): void {
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

            const regs: [number, number][] = [];

            for (let i = 0; i < region.num_regs; i ++) {
                regs.push([region.beg_at(i) / 2, region.end_at(i) / 2]);
            }

            if (!callback(regs)) {
                break;
            }

            last_pos = region.end_at(0);
        }

        onigmo.exports.free(str_ptr.start);
        onigmo.exports.onig_region_free(region.address, RegionFreeScheme.CONTENTS_ONLY);
    }
}
