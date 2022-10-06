export const each_codepoint = function*(str: string) {
    for (let byteIndex = 0; byteIndex < str.length; byteIndex ++) {
        const code = str.charCodeAt(byteIndex);

        if (0xd800 <= code && code <= 0xdbff) {
            const hi = code;
            byteIndex ++;
            const low = str.charCodeAt(byteIndex);
            yield (hi - 0xd800) * 0x400 + (low - 0xdc00) + 0x10000;
        } else {
            yield code;
        }
    }
};

export const hash_string = (str: string): number => {
    let h = 0;

    for(let cp of each_codepoint(str)) {
        h = Math.imul(31, h) + cp | 0;
    }

    return h;
}
