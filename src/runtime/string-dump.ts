const dump_map = new Map([
    ['\a', '\\a'],
    ['\b', '\\b'],
    ['\t', '\\t'],
    ['\n', '\\n'],
    ['\v', '\\v'],
    ['\f', '\\f'],
    ['\r', '\\r'],
    ['\x1b', '\\e'],
    ['"', '\\"'],
    ['\\', '\\\\'],
]);

type DumpCursor = {
    str: string;
    offset: number;
    result: string[];
}

export const dump_string = (str: string): string => {
    const cursor = { str, offset: 0, result: [] };

    while (cursor.offset < str.length) {
        dump_char(cursor);
    }

    return cursor.result.join("");
}

const dump_char = (cursor: DumpCursor) => {
    const char = cursor.str[cursor.offset];

    if (dump_map.has(char)) {
        cursor.result.push(dump_map.get(char)!);
        cursor.offset ++;
    } else if (char === "#") {
        // escape # when followed by $, @, or {
        dump_pound(cursor);
    } else {
        const code = cursor.str.charCodeAt(cursor.offset);

        if (code < 0x20 || (code >= 0x7F && code <= 0xFF)) {
            dump_hex(cursor, code);
        } else if (code > 0xFF) {
            dump_unicode(cursor, code, char);
        } else {
            cursor.result.push(char);
            cursor.offset ++;
        }
    }
}

const dump_pound = (cursor: DumpCursor): void => {
    if (cursor.offset + 1 < cursor.str.length) {
        const next = cursor.str[cursor.offset + 1];

        if (next === '$' || next === '{') {
            cursor.result.push('\\#');
            cursor.offset ++;
            return;
        } else if (next === '@') {
            // check for @@ or @
            cursor.result.push('\\#');
            cursor.offset ++;
            return;
        }
    }

    cursor.result.push("#");
    cursor.offset ++;
}

const dump_hex = (cursor: DumpCursor, code: number): void => {
    cursor.result.push('\\x' + code.toString(16).toUpperCase().padStart(2, '0'));
    cursor.offset ++;
}

const dump_unicode = (cursor: DumpCursor, code: number, char: string): void => {
    if (code <= 0xFFFF) {
        cursor.result.push('\\u' + code.toString(16).toUpperCase().padStart(4, '0'));
        cursor.offset ++;
    } else {
        const codePoint = cursor.str.codePointAt(cursor.offset);

        if (codePoint !== undefined && codePoint > 0xFFFF) {
            cursor.result.push('\\u{' + codePoint.toString(16).toUpperCase() + '}');

            // Skip the next character if it's a surrogate pair
            if (codePoint > 0xFFFF) {
                cursor.offset ++;
            }
        } else {
            cursor.result.push(char);
        }

        cursor.offset ++;
    }
}
