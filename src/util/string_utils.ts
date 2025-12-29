// Adapted from: https://stackoverflow.com/a/52171480
export const hash_string = (str: string, seed: number = 0): number => {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for(let i = 0, ch; i < str.length; i++) {
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1  = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2  = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
};

// Returns the number of characters in the string, accounting for surrogate pairs.
export const strlen = (input: string): number => {
    let length = 0;

    for (let i = 0; i < input.length; i++) {
        const codepoint = input.charCodeAt(i);

        // Check if the current code unit is a high surrogate.
        if (codepoint >= 0xD800 && codepoint <= 0xDBFF) {
            // If it is, check if it's followed by a low surrogate.
            const nextCodeUnit = input.charCodeAt(i + 1);

            if (nextCodeUnit && nextCodeUnit >= 0xDC00 && nextCodeUnit <= 0xDFFF) {
                // This is a valid surrogate pair, so we count it as one character.
                length ++;
                // Skip the next code unit as it's part of the surrogate pair.
                i ++;
            } else {
                // It's a lone high surrogate, count as one character.
                length ++;
            }
        } else {
            // Regular character or lone low surrogate, count as one character.
            length ++;
        }
    }
    return length;
};

export const is_alpha_num = (code: number) => {
    return (
        (code > 47 && code < 58) ||  // numeric (0-9)
        (code > 64 && code < 91) ||  // upper alpha (A-Z)
        (code > 96 && code < 123)    // lower alpha (a-z)
    );
};
