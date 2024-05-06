import { RuntimeError } from "../errors";
import { vmfs } from "../vmfs"
import { FNM_DOTMATCH, FNM_EXTGLOB, FNM_NOESCAPE, FNM_PATHNAME } from "./file";

enum TokenType {
    STAR = 1,
    DOUBLE_STAR = 2,
    OPEN_CURLY = 3,
    CLOSE_CURLY = 4,
    QUESTION_MARK = 5,
    CARET = 6,
    OPEN_BRACKET = 7,
    CLOSE_BRACKET = 8,
    COMMA = 9,
    SEPARATOR = 10,
    PLAIN = 11,
    ESCAPED_PLAIN = 12
}

const token_type_map = new Map([
    ["*", TokenType.STAR],
    ["**", TokenType.DOUBLE_STAR],
    ["{", TokenType.OPEN_CURLY],
    ["}", TokenType.CLOSE_CURLY],
    ["?", TokenType.QUESTION_MARK],
    ["^", TokenType.CARET],
    ["[", TokenType.OPEN_BRACKET],
    ["]", TokenType.CLOSE_BRACKET],
    [",", TokenType.COMMA]
]);

class Token {
    public value: string;
    public type: TokenType;

    constructor(value: string, type: TokenType) {
        this.value = value;
        this.type = type;
    }
}

class ParseContext {
    public tokens: Token[];
    public flags: Flags;
    public index: number;
    public current: Token | undefined;

    constructor(tokens: Token[], flags: Flags) {
        this.tokens = tokens;
        this.flags = flags;
        this.index = 0;
        this.current = tokens[this.index];
    }

    consume(count: number = 1): Token | undefined {
        this.index += count;
        this.current = this.tokens[this.index];
        return this.current;
    }

    peek(): Token | undefined {
        return this.tokens[this.index + 1];
    }

    eol(): boolean {
        return this.current === undefined;
    }
}

interface ISegment {
    each_matching_path_in(path: string, cb: (matching_path: string) => Promise<void>): Promise<void>;
}

class RegExpSegment implements ISegment {
    private matcher: RegExp;

    constructor(matcher: RegExp) {
        this.matcher = matcher;
    }

    async each_matching_path_in(path: string, cb: (matching_path: string) => void): Promise<void> {
        if (vmfs.is_directory(path)) {
            await vmfs.each_child_path(path, async (child_path: string) => {
                if (this.matcher.test(child_path)) {
                    await cb(vmfs.join_paths(path, child_path));
                }
            });
        } else {
            if (this.matcher.test(vmfs.basename(path))) {
                await cb(path);
            }
        }
    }
}

class StaticSegment implements ISegment {
    private segment_text: string;

    constructor(segment_text: string) {
        this.segment_text = segment_text;
    }

    async each_matching_path_in(path: string, cb: (matching_path: string) => Promise<void>): Promise<void> {
        const full_path = vmfs.join_paths(path, this.segment_text);

        if (vmfs.path_exists(full_path)) {
            await cb(full_path);
        }
    }
}

class RecursiveDirSegment implements ISegment {
    private flags: Flags;

    constructor(flags: Flags) {
        this.flags = flags;
    }

    async each_matching_path_in(path: string, cb: (matching_path: string) => Promise<void>): Promise<void> {
        await vmfs.each_child_path(path, async (child_path: string) => {
            if (!this.flags.dot_match && child_path.startsWith(".")) {
                return;
            }

            const full_path = vmfs.join_paths(path, child_path);

            if (vmfs.is_directory(full_path)) {
                await this.each_matching_path_in(full_path, cb);
            } else {
                await cb(full_path);
            }
        });
    }
}

export class GlobPattern {
    private segments: ISegment[];
    private flags: Flags;

    constructor(segments: ISegment[], flags: Flags) {
        this.segments = segments;
        this.flags = flags;
    }

    async each_matching_path(base_path: string, cb: (matching_path: string) => Promise<void>) {
        const base_path_parts = vmfs.split_path(base_path);

        await this.each_matching_path_in(0, base_path, async (matching_path: string): Promise<void> => {
            if (base_path === "") {
                await cb(matching_path);
            } else {
                await cb(vmfs.join_paths(...vmfs.split_path(matching_path).slice(base_path_parts.length)));
            }
        });
    }

    private async each_matching_path_in(segment_index: number, base_path: string, cb: (matching_path: string) => Promise<void>) {
        await this.segments[segment_index].each_matching_path_in(base_path, async (matching_path: string): Promise<void> => {
            if (segment_index === this.segments.length - 1) {
                await cb(matching_path);
            } else {
                await this.each_matching_path_in(segment_index + 1, matching_path, cb);
            }
        });
    }
}

const pattern_splitter_re_map: Map<string, RegExp> = new Map();

const get_pattern_splitter = (separator: string): RegExp => {
    if (!pattern_splitter_re_map.has(separator)) {
        pattern_splitter_re_map.set(
            separator,
            new RegExp(`(${escape_regexp(separator)}|\\*\\*|\\*|\\{|\\}|\\?|\\^|\\[|\\]|\\,|\\\\.)`)
        );
    }

    return pattern_splitter_re_map.get(separator)!;
}

const make_token = (value: string): Token => {
    let token_type = token_type_map.get(value);

    if (!token_type) {
        if (value === vmfs.separator) {
            token_type = TokenType.SEPARATOR;
        } else if (value.startsWith("\\")) {
            token_type = TokenType.ESCAPED_PLAIN;
        } else {
            token_type = TokenType.PLAIN;
        }
    }

    return new Token(value, token_type);
}

const tokenize = (pattern: string): Token[] => {
    const splitter = get_pattern_splitter(vmfs.separator);
    const values = pattern.split(splitter);
    const tokens = [];

    for (const value of values) {
        if (value !== "") {
            tokens.push(make_token(value));
        }
    }

    return tokens;
}

const glob_cache: Map<string, GlobPattern> = new Map();

export const parse_glob = (pattern: string, flags: number): GlobPattern => {
    const key = pattern + flags.toString();

    if (!glob_cache.has(key)) {
        glob_cache.set(key, do_parse_glob(pattern, flags));
    }

    return glob_cache.get(key)!;
}

const do_parse_glob = (pattern: string, flags: number): GlobPattern => {
    const tokens = tokenize(pattern);
    const context = new ParseContext(tokens, parse_flags(flags));
    const segments: ISegment[] = [];

    while (!context.eol()) {
        segments.push(handle_segment(context));

        if (context.current?.type === TokenType.SEPARATOR) {
            context.consume();
        }
    }

    return new GlobPattern(segments, context.flags);
}

type Flags = {
    no_escape: boolean,
    pathname_enabled: boolean,
    dot_match: boolean,
    ext_glob: boolean
}

const parse_flags = (flags: number): Flags => {
    const result: Flags = {
        no_escape: (flags & FNM_NOESCAPE) > 0,
        pathname_enabled: (flags & FNM_PATHNAME) > 0,
        dot_match: (flags & FNM_DOTMATCH) > 0,
        ext_glob: (flags & FNM_EXTGLOB) > 0
    }

    if (result.pathname_enabled) {
        throw new RuntimeError("The File::FNM_PATHNAME flag is on by default");
    }

    if (result.ext_glob) {
        throw new RuntimeError("File::FNM_EXTGLOB is not supported");
    }

    return result;
}

const handle_segment = (context: ParseContext): ISegment => {
    const current = context.current;
    const next = context.peek();

    const is_recursive_dir =
        current &&
        current.type === TokenType.DOUBLE_STAR &&
        next &&
        next.type === TokenType.SEPARATOR;

    if (is_recursive_dir) {
        context.consume();
        return new RecursiveDirSegment(context.flags);
    }

    const chunks: [TokenType, string][] = [];
    let is_plain = true;
    let index = 0;

    while (context.current && context.current.type !== TokenType.SEPARATOR) {
        switch (context.current.type) {
            case TokenType.OPEN_BRACKET:
                chunks.push([context.current.type, handle_char_class(context)]);
                is_plain = false;
                break;

            case TokenType.OPEN_CURLY:
                chunks.push([context.current.type, handle_alternation_or_union(context)]);
                is_plain = false;
                break;

            case TokenType.STAR:
                if (context.flags.dot_match) {
                    chunks.push([context.current.type, ".*"]);
                } else {
                    if (index === 0) {
                        chunks.push([context.current.type, "[^.].*"]);
                    } else {
                        chunks.push([context.current.type, ".*"]);
                    }
                }

                is_plain = false;
                break;

            case TokenType.QUESTION_MARK:
                chunks.push([context.current.type, "."]);
                is_plain = false;
                break;

            case TokenType.PLAIN:
                chunks.push([context.current.type, context.current.value]);
                break;

            case TokenType.ESCAPED_PLAIN:
                if (context.flags.no_escape) {
                    // use value without removing preceding backslash
                    chunks.push([context.current.type, context.current.value]);
                } else {
                    // remove preceding backslash before using value
                    chunks.push([context.current.type, context.current.value.slice(1)]);
                }

                break;
        }

        context.consume();
        index ++;
    }

    if (is_plain) {
        const plain_str = chunks.map(([_, value]) => value).join("");
        return new StaticSegment(plain_str);
    }

    const regexp_chunks = chunks.map(([type, value]) => {
        switch (type) {
            case TokenType.PLAIN:
            case TokenType.ESCAPED_PLAIN:
                return escape_regexp(value)
            default:
                return value;
        }
    });

    return new RegExpSegment(new RegExp(`^${regexp_chunks.join("")}$`));
}

const handle_char_class = (context: ParseContext): string => {
    // consume opening bracket
    context.consume()

    let found_closing_bracket = false;

    for (let i = context.index; i < context.tokens.length; i ++) {
        if (context.tokens[i].type === TokenType.CLOSE_BRACKET) {
            found_closing_bracket = true;
            break;
        }
    }

    if (!found_closing_bracket) {
        const token_values = [context.current!.value];

        while (!context.eol()) {
            token_values.push(context.current!.value);
            context.consume();
        }

        return escape_regexp(token_values.join(""));
    }

    const char_class_values = [];

    while (context.current && context.current.type !== TokenType.CLOSE_BRACKET) {
        char_class_values.push(escape_regexp(context.current.value));
        context.consume();
    }

    // consume closing bracket
    context.consume();

    return `[${char_class_values.join("")}]`;
}

const handle_alternation_or_union = (context: ParseContext): string => {
    // consume opening brace
    context.consume();

    let valid = false;

    for (let i = context.index; i < context.tokens.length; i ++) {
        const type = context.tokens[i].type;

        if (type === TokenType.CLOSE_CURLY) {
            valid = true;
            break;
        } else if (type !== TokenType.PLAIN && type !== TokenType.COMMA) {
            break;
        }
    }

    if (!valid) {
        const token_values = [context.current!.value];

        while (!context.eol()) {
            token_values.push(context.current!.value);
            context.consume();
        }

        return escape_regexp(token_values.join(""));
    }

    const alternation_values = [];

    while (context.current && context.current.type !== TokenType.CLOSE_CURLY) {
        alternation_values.push(escape_regexp(context.current.value));
        context.consume();

        if (context.current?.type === TokenType.COMMA) {
            context.consume();
        }
    }

    // consume closing brace
    context.consume();

    return `(?:${alternation_values.join("|")})`;
}

const regexp_escape_re = /[/\-\\^$*+?.()|[\]{}]/g;

const escape_regexp = (str: string) => {
    return str.replace(regexp_escape_re, '\\$&');
}