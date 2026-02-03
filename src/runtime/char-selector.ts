import { ArgumentError } from "../errors";

interface IPattern {
    length: number;
    index_of(search: string): number | null;
    matches(search: string, offset: number): boolean;
    to_set(): ICharSet;
}

interface ICharSet {
    chars: Set<string>;
    get is_negated(): boolean;
    intersect(other: ICharSet): ICharSet;
    has(char: string): boolean;
}

class CharSet implements ICharSet {
    public chars: Set<string>;

    constructor(chars: Set<string>) {
        this.chars = chars;
    }

    get is_negated(): boolean {
        return false;
    }

    intersect(other: ICharSet): ICharSet {
        const result: Set<string> = new Set();

        if (other.is_negated) {
            for (const char of other.chars) {
                if (!this.chars.has(char)) {
                    result.add(char);
                }
            }
        } else {
            for (const char of other.chars) {
                if (this.chars.has(char)) {
                    result.add(char);
                }
            }
        }

        return new CharSet(result);
    }

    has(char: string): boolean {
        return this.chars.has(char);
    }
}

class NegatedCharSet implements ICharSet {
    public chars: Set<string>;

    constructor(chars: Set<string>) {
        this.chars = chars;
    }

    get is_negated(): boolean {
        return true;
    }

    intersect(other: ICharSet): ICharSet {
        if (other.is_negated) {
            const result: Set<string> = new Set(this.chars);

            // The interesction of two negated sets is the union of their complements
            for (const char of other.chars) {
                if (!this.chars.has(char)) {
                    result.add(char);
                }
            }

            return new NegatedCharSet(result);
        } else {
            const result: Set<string> = new Set(other.chars);

            for (const char of this.chars) {
                if (other.chars.has(char)) {
                    result.delete(char);
                }
            }

            return new CharSet(result);
        }
    }

    has(char: string): boolean {
        return !this.chars.has(char);
    }
}

class Pattern implements IPattern {
    private chars: string[];
    private offset: number;
    public length: number;

    constructor(chars: string, offset: number) {
        // unescape
        this.chars = chars.replace(/\\./, (match) => match.slice(1)).split("");
        this.offset = offset;
        this.length = this.chars.length;
    }

    index_of(search: string): number | null {
        const idx = this.chars.indexOf(search);
        if (idx === -1) return null;
        return idx + this.offset;
    }

    matches(search: string, offset: number): boolean {
        const charAtOffset = search.charAt(offset);
        return this.chars.some(char => char === charAtOffset);
    }

    to_set(): ICharSet {
        return new CharSet(new Set(this.chars));
    }
}

class NegatedPattern implements IPattern {
    private child_patterns: IPattern[];
    public length: number;

    constructor(child_patterns: IPattern[]) {
        this.child_patterns = child_patterns;
        this.length = 0;

        for (const pattern of this.child_patterns) {
            this.length += this.child_patterns.length;
        }
    }

    index_of(search: string): number | null {
        for (const child_pattern of this.child_patterns) {
            if (child_pattern.index_of(search) !== null) {
                return null;  // no match
            }
        }

        return -1;  // replace with last character
    }

    matches(search: string, offset: number): boolean {
        return this.child_patterns.every((child_pattern) => {
            return !child_pattern.matches(search, offset);
        })
    }

    to_set(): ICharSet {
        const char_set = intersect_all(this.child_patterns.map(p => p.to_set()));
        return new NegatedCharSet(char_set.chars);
    }
}

const intersect_all = (char_sets: ICharSet[]): ICharSet => {
    if (char_sets.length === 0) {
        return new CharSet(new Set());
    } else if (char_sets.length === 1) {
        return char_sets[0];
    }

    let result = char_sets[0];

    for (let i = 1; i < char_sets.length; i ++) {
        result = result.intersect(char_sets[i]);
    }

    return result;
}

class RangePattern implements IPattern {
    private begin_code_point: number;
    private end_code_point: number;
    private offset: number;
    public length: number;

    constructor(begin: string, end: string, offset: number) {
        this.begin_code_point = begin.codePointAt(0)!;
        this.end_code_point = end.codePointAt(0)!;
        this.offset = offset;

        if (this.begin_code_point > this.end_code_point) {
            throw new ArgumentError(`invalid range "${begin}-${end}" in string transliteration`)
        }

        this.length = this.end_code_point - this.begin_code_point;
    }

    index_of(search: string): number | null {
        const cp = search.codePointAt(0)!

        if (cp >= this.begin_code_point && cp <= this.end_code_point) {
            return (cp - this.begin_code_point) + this.offset;
        } else {
            return null;
        }
    }

    matches(search: string, offset: number) {
        const cp = search.codePointAt(offset)!
        return cp >= this.begin_code_point && cp <= this.end_code_point;
    }

    to_set(): CharSet {
        const chars = [];

        for (let cp = this.begin_code_point; cp <= this.end_code_point; cp ++) {
            chars.push(String.fromCodePoint(cp));
        }

        return new CharSet(new Set(chars));
    }
}

class PatternParser {
    static parse(pattern_str: string): IPattern[] {
        return new PatternParser(pattern_str).parse();
    }

    private pattern_str: string;
    private index: number;
    private current: string;
    private offset: number;
    private negated: boolean;

    constructor(pattern_str: string) {
        this.pattern_str = pattern_str;
    }

    parse(): IPattern[] {
        this.index = -1;
        this.offset = 0;
        this.negated = false;

        this.next();

        const patterns: IPattern[] = [];

        do {
            patterns.push(this.handle_pattern());
        } while (!this.eos());

        if (this.negated) {
            return [new NegatedPattern(patterns)]
        } else {
            return patterns;
        }
    }

    private handle_pattern(): IPattern {
        let first_char = this.current;

        if (this.eos()) {
            const pattern = new Pattern(first_char, this.offset);
            this.offset += pattern.length;
            return pattern;
        }

        let second_char = this.next();

        if (first_char === "^" && second_char !== "") {
            first_char = second_char;
            second_char = this.next();
            this.negated = true;
        }

        return this.handle_non_negated_pattern(first_char, second_char);
    }

    private handle_non_negated_pattern(first_char: string, second_char: string): IPattern {
        if (second_char === "-") {
            return this.handle_range_pattern(first_char);
        } else {
            this.previous();
            return this.handle_regular_pattern();
        }
    }

    private handle_range_pattern(first_char: string): IPattern {
        this.next();  // consume "-"

        if (this.eos()) {
            const pattern = new Pattern(first_char + "-", this.offset);
            this.offset += pattern.length;
            return pattern;
        }

        const pattern = new RangePattern(first_char, this.current, this.offset);
        this.offset += pattern.length;

        // consume range end char
        this.next();

        return pattern;
    }

    private handle_regular_pattern(): IPattern {
        let start_pos = this.index;

        while (!this.eos()) {
            if (this.current === "-" && this.has_next() && this.index > start_pos) {
                this.previous();
                break;
            }

            this.next();
        }

        const pattern = new Pattern(this.pattern_str.slice(start_pos, this.index), this.offset);
        this.offset += pattern.length;

        return pattern;
    }

    private next(): string {
        this.index ++;
        this.current = this.pattern_str.charAt(this.index);

        if (this.current === "\\") {
            this.index ++;
            this.current += this.pattern_str.charAt(this.index);
        }

        return this.current;
    }

    private previous(): string {
        this.index -= 1;
        this.current = this.pattern_str.charAt(this.index);

        if (this.index > 0 && this.current === "\\") {
            this.current = `\\${this.current}`;
            this.index --;
        }

        return this.current;
    }

    private eos(): boolean {
        return this.index >= this.pattern_str.length;
    }

    private has_next(): boolean {
        return this.index < this.pattern_str.length - 1;
    }
}

export class CharSelectors {
    static from(...pattern_strs: string[]): CharSelectors {
        const char_sets = pattern_strs.flatMap(pattern_str => {
            const patterns = PatternParser.parse(pattern_str);
            const char_sets = patterns.map(p => p.to_set());
            const union = new Set(char_sets.flatMap(p => Array.from(p.chars)));

            if (char_sets[0]?.is_negated) {
                return new NegatedCharSet(union);
            } else {
                return new CharSet(union);
            }
        });

        const char_set = intersect_all(char_sets);
        return new CharSelectors(char_set);
    }

    private char_set: CharSet;

    constructor(char_set: CharSet) {
        this.char_set = char_set;
    }

    index_of(search: string): number | null {
        for (let i = 0; i < search.length; i ++) {
            if (this.char_set.has(search[i])) {
                return i;
            }
        }

        return null;
    }

    match_all(search: string): number[] {
        const offsets: number[] = [];

        for (let i = 0; i < search.length; i ++) {
            if (this.char_set.has(search[i])) {
                offsets.push(i);
            }
        }

        return offsets;
    }

    count(search: string): number {
        let n = 0;

        for (let i = 0; i < search.length; i ++) {
            if (this.char_set.has(search[i])) {
                n ++;
            }
        }

        return n;
    }
}
