// see: https://stackoverflow.com/a/27952689/498080
export const hash_combine = (hash1: number, hash2: number): number => {
    return hash1 ^ hash2 + 0x517cc1b727220a95 + (hash1 << 6) + (hash1 >> 2);
}
