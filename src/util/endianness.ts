let endianness_: "BE" | "LE" | undefined = undefined;

export const endianness = (): "BE" | "LE" => {
    if (!endianness_) {
        // platform-agnostic implementation of Node's os.endianness()
        const arr = new Uint8Array(4);
        new Uint32Array(arr.buffer)[0] = 0xffcc0011;
        endianness_ = arr[0] === 0xff ? "BE" : "LE";
    }

    return endianness_;
}

export const isLittlEndian = (): boolean => {
    return endianness() === "LE";
}

export const isBigEndian = (): boolean => {
    return endianness() === "BE";
}
