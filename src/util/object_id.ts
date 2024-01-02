// See: https://github.com/ruby/ruby/blob/6e46bf1e54e7fe83dc80e49394d980b71321b6f0/hash.c#L239

const prime1 = (0x2e0bb864 << 32) | 0xe9ea7df5;
const prime2 = 0x830fcab9;

const mult_and_mix = (m1: number, m2: number) => {
    const r = m1 * m2;
    return (r >> 64) ^ r;
}

// static inline uint64_t
const key64_hash = (key: number, seed: number) => {
    return mult_and_mix(key + seed, prime1);
}

export const obj_id_hash = (id: number) => {
    return key64_hash(id, prime2);
}
