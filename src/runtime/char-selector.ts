import { ArgumentError } from "../errors";

interface IPattern {
    length: number;
    indexOf(search: string): number | null;
}

class Pattern implements IPattern {
    private chars: string;
    private offset: number;
    public length: number;

    constructor(chars: string, offset: number) {
        // unescape
        this.chars = chars.replace(/\\./, (match) => match.slice(1));
        this.offset = offset;
        this.length = this.chars.length;
    }

    indexOf(search: string): number | null {
        const idx = this.chars.indexOf(search);
        if (idx === -1) return null;
        return idx + this.offset;
    }
}

class NegatedPattern implements IPattern {
    private child_pattern: IPattern;
    public length: number;

    constructor(child_pattern: IPattern) {
        this.child_pattern = child_pattern;
        this.length = this.child_pattern.length;
    }

    indexOf(search: string): number | null {
        if (this.child_pattern.indexOf(search) !== null) {
            return null;  // no match
        } else {
            return -1;  // replace with last character
        }
    }
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

    indexOf(search: string): number | null {
        const cp = search.codePointAt(0)!

        if (cp >= this.begin_code_point && cp <= this.end_code_point) {
            return (cp - this.begin_code_point) + this.offset;
        } else {
            return null;
        }
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
        this.index = 0;
        this.offset = 0;
        this.negated = false;

        const patterns: IPattern[] = [];

        while (!this.eos()) {
            patterns.push(this.handle_pattern());
        }

        return patterns;
    }

    private handle_pattern(): IPattern {
        const first_char = this.next();

        if (this.eos()) {
            const pattern = new Pattern(first_char, this.offset);
            this.offset += pattern.length;
            return pattern;
        }

        if (first_char === "^") {
            this.negated = true;
            return this.handle_pattern();
        }

        const second_char = this.next();
        let pattern;

        if (second_char === "-") {
            pattern = this.handle_range_pattern(first_char);
        } else {
            pattern = this.handle_regular_pattern(first_char, second_char);
        }

        if (this.negated) {
            return new NegatedPattern(pattern);
        } else {
            return pattern;
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

        this.next();

        return pattern;
    }

    private handle_regular_pattern(first_char: string, second_char: string): IPattern {
        const start_pos = this.index;

        while (!this.eos()) {
            if (this.current === "-" || this.current === "^") {
                break;
            }

            this.next();
        }

        const pattern = new Pattern(first_char + second_char + this.pattern_str.slice(start_pos, this.index), this.offset);
        this.offset += pattern.length;

        return pattern;
    }

    private next(): string {
        this.current = this.pattern_str.charAt(this.index);
        this.index ++;

        if (this.current === "\\") {
            this.current += this.pattern_str.charAt(this.index);
            this.index ++;
        }

        return this.current;
    }

    private eos(): boolean {
        return this.index >= this.pattern_str.length;
    }
}

export class CharSelector {
    static from(pattern_str: string) {
        return new CharSelector(PatternParser.parse(pattern_str));
    }

    private patterns: IPattern[];

    constructor(patterns: IPattern[]) {
        this.patterns = patterns;
    }

    indexOf(search: string): number | null {
        for (const pattern of this.patterns) {
            const index = pattern.indexOf(search);
            if (index != null) return index;
        }

        return null;
    }
}
