import { ArgumentError } from "../errors";

interface IPattern {
    length: number;
    indexOf(search: string): number | null;
    matches(search: string, offset: number): boolean
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

    matches(search: string, offset: number): boolean {
        return search.indexOf(this.chars, offset) === offset;
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

    indexOf(search: string): number | null {
        for (const child_pattern of this.child_patterns) {
            if (child_pattern.indexOf(search) !== null) {
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

    matches(search: string, offset: number) {
        const cp = search.codePointAt(offset)!
        return cp >= this.begin_code_point && cp <= this.end_code_point;
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
            const pattern = this.handle_pattern()
            if (pattern) patterns.push(pattern);
        }

        if (this.negated) {
            return [new NegatedPattern(patterns)]
        } else {
            return patterns;
        }
    }

    private handle_pattern(): IPattern | null {
        const first_char = this.next();

        if (first_char === "") {
            return null;
        }

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

        return pattern;
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
        return this.index > this.pattern_str.length;
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

    matchAll(search: string): [number, number][] {
        const matches: [number, number][] = [];
        let start = 0;
        let stop = 0;

        for (let i = 0; i < search.length; i ++) {
            if (this.patterns.some(pattern => pattern.matches(search, i))) {
                stop += 1;
            } else {
                if (stop - start > 0) {
                    matches.push([start, stop]);
                }

                stop = start = i + 1;
            }
        }

        if (stop - start > 0) {
            matches.push([start, stop]);
        }

        return matches;
    }
}

export class CharSelectors {
    static from(pattern_strs: string[]): CharSelectors {
        const patterns = pattern_strs.map(pattern_str => CharSelector.from(pattern_str));
        return new CharSelectors(patterns);
    }

    private patterns: CharSelector[];

    constructor(patterns: CharSelector[]) {
        this.patterns = patterns;
    }

    matchAll(search: string): [number, number][] {
        const ranges = this.patterns.flatMap(pattern => pattern.matchAll(search));
        return this.flatten(ranges);
    }

    private flatten(ranges: [number, number][]): [number, number][] {
        if (ranges.length <= 1) return ranges;

        const sorted_ranges = ranges.sort((a, b) => {
            if (a[0] < b[0]) {
                return -1;
            } else if (a[0] > b[0]) {
                return 1;
            } else {
                return 0;
            }
        });

        const new_ranges = [sorted_ranges[0]];

        for (const range of sorted_ranges) {
            const previous_range = new_ranges.pop()!;

            if (this.adjacent(previous_range, range) || this.overlap(previous_range, range)) {
                new_ranges.push([
                    Math.min(range[0], previous_range[0]), Math.max(range[1], previous_range[1])
                ]);
            } else {
                new_ranges.push(previous_range);
                new_ranges.push(range);
            }
        }

        return new_ranges;
    }

    private overlap(range1: [number, number], range2: [number, number]): boolean {
        return (
            this.front_overlap(range1, range2) ||
            this.rear_overlap(range1, range2) ||
            this.full_overlap(range1, range2)
        );
    }

    private front_overlap(range1: [number, number], range2: [number, number]): boolean {
        return range1[1] >= range2[0] && range1[1] <= range2[1];
    }

    private rear_overlap(range1: [number, number], range2: [number, number]): boolean {
        return range1[0] >= range2[0] && range1[0] <= range2[1];
    }

    // range1 entirely contains range2
    private full_overlap(range1: [number, number], range2: [number, number]): boolean {
        return range1[0] <= range2[0] && range1[1] >= range2[1];
    }

    // range2 entirely contains range1
    private fully_overlapped_by(range1: [number, number], range2: [number, number]): boolean {
        return range2[0] <= range1[0] && range1[1] <= range2[1];
    }

    // returns true if range1 and range2 are within 1 of each other
    private adjacent(range1: [number, number], range2: [number, number]): boolean {
        return range1[1] == range2[0] - 1 || range2[0] == range1[1] + 1;
    }
}
