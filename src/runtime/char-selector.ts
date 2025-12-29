import { ArgumentError } from "../errors";

interface IPattern {
    length: number;
    index_of(search: string): number | null;
    matches(search: string, offset: number): boolean
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

        while (!this.eos()) {
            patterns.push(this.handle_pattern());
        }

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
            const index = pattern.index_of(search);
            if (index != null) return index;
        }

        return null;
    }

    match_all(search: string): [number, number][] {
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

class RangeSet {
    public ranges: [number, number][];

    constructor(ranges: [number, number][]) {
        this.ranges = ranges;
    }

    intersect(their_ranges: [number, number][]) {
        const new_ranges = [];

        for (const their_range of their_ranges) {
            for (const our_range of this.ranges) {
                if (this.overlap(their_range, our_range)) {
                    const intrsc = this.find_intersection(our_range, their_range);
                    if (intrsc) {
                        new_ranges.push(intrsc);
                    }
                }
            }
        }

        this.ranges = new_ranges;
    }

    private find_intersection(range1: [number, number], range2: [number, number]): [number, number] | null {
        // range2 entirely contains range1
        if (this.fully_overlapped_by(range1, range2)) {
            return range1;
        } else if (this.front_overlap(range1, range2)) {
            return [range2[0], range1[1]];
        } else if (this.rear_overlap(range1, range2)) {
            return [range1[0], range2[1]]
        } else if (this.full_overlap(range1, range2)) {
            return [Math.max(range1[0], range2[0]), Math.min(range1[1], range2[1])];
        } else {
            return null;
        }
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

export class CharSelectors {
    static from(pattern_strs: string[]): CharSelectors {
        const patterns = pattern_strs.map(pattern_str => CharSelector.from(pattern_str));
        return new CharSelectors(patterns);
    }

    private patterns: CharSelector[];

    constructor(patterns: CharSelector[]) {
        this.patterns = patterns;
    }

    match_all(search: string): [number, number][] {
        const range_groups = this.patterns.map(pattern => pattern.match_all(search));
        if (range_groups.length === 0) return [];

        const range_set = new RangeSet(range_groups[0]);

        for (let i = 1; i < range_groups.length; i ++) {
            range_set.intersect(range_groups[i]);
        }

        return range_set.ranges;
    }
}
