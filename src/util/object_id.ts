// See: https://github.com/ruby/ruby/blob/6e46bf1e54e7fe83dc80e49394d980b71321b6f0/hash.c#L239

const big32 = BigInt(32);
const prime1 = (BigInt(0x2e0bb864) << big32) | BigInt(0xe9ea7df5);
const prime2 = BigInt(0x830fcab9);

const mult_and_mix = (m1: bigint, m2: bigint): bigint => {
    const hm1 = m1 >> big32, hm2 = m2 >> big32;
    const lm1 = m1, lm2 = m2;
    const v64_128 = hm1 * hm2;
    const v32_96 = hm1 * lm2 + lm1 * hm2;
    const v1_32 = lm1 * lm2;

    return (v64_128 + (v32_96 >> big32)) ^ ((v32_96 << big32) + v1_32);
}

// static inline uint64_t
const key64_hash = (key: bigint, seed: bigint) => {
    return mult_and_mix(key + seed, prime1);
}

export const obj_id_hash = (id: number): number => {
    return Number(BigInt.asUintN(53, key64_hash(BigInt(id), prime2)));
}
