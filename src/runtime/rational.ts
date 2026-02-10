import { ArgumentError, NameError, ZeroDivisionError } from "../errors";
import { Class, RValue, Runtime } from "../runtime";
import { RubyString } from "../runtime/string";
import { Float } from "./float";
import { Integer } from "./integer";
import { Numeric } from "./numeric";
import { Object } from "./object";

let inited = false;

export class Rational {
    static async from_float(p1: number): Promise<RValue> {
        let n = 0, d = 1, s = 1;
        let z = 1;

        let A = 0, B = 1;
        let C = 1, D = 1;

        const N = 10000000;
        let M;

        if (p1 < 0) {
            s = p1;
            p1 = -p1;
        }

        if (p1 % 1 === 0) {
            n = p1;
        } else if (p1 > 0) { // check for != 0, scale would become NaN (log(0)), which converges really slow
            if (p1 >= 1) {
                z = Math.pow(10, Math.floor(1 + Math.log(p1) / Math.LN10));
                p1 /= z;
            }

            // Using Farey Sequences
            // http://www.johndcook.com/blog/2010/10/20/best-rational-approximation/

            while (B <= N && D <= N) {
                M = (A + C) / (B + D);

                if (p1 === M) {
                    if (B + D <= N) {
                        n = A + C;
                        d = B + D;
                    } else if (D > B) {
                        n = C;
                        d = D;
                    } else {
                        n = A;
                        d = B;
                    }

                    break;
                } else {
                    if (p1 > M) {
                        A += C;
                        B += D;
                    } else {
                        C += A;
                        D += B;
                    }

                    if (B > N) {
                        n = C;
                        d = D;
                    } else {
                        n = A;
                        d = B;
                    }
                }
            }
            n *= z;
        } else if (isNaN(p1)) {
            d = n = NaN;
        }

        if (d === 0) {
            throw new ZeroDivisionError("divided by 0");
        }

        return new RValue(await this.klass(), new Rational(n, d, s < 0));
    }

    static async from_string(p1: string): Promise<RValue> {
        let n = 0, d = 1, s = 1;
        var v = 0, w = 0, x = 0, y = 1, z = 1;

        let A = 0;
        const B = p1.match(/\d+|./g);

        if (B === null) {
          throw new ArgumentError(`invalid value for convert(): ${RubyString.inspect(p1)}`);
        }

        if (B[A] === '-') { // Check for minus sign at the beginning
            s = -1;
            A ++;
        } else if (B[A] === '+') { // Check for plus sign at the beginning
            A ++;
        }

        if (B.length === A + 1) { // Check if it's just a simple number "1234"
            w = this.assign(B[A ++], s, p1);
        } else if (B[A + 1] === '.' || B[A] === '.') { // Check if it's a decimal number
            if (B[A] !== '.') { // Handle 0.5 and .5
                v = this.assign(B[A ++], s, p1);
            }
            A ++;

            // Check for decimal places
            if (A + 1 === B.length || B[A + 1] === '(' && B[A + 3] === ')' || B[A + 1] === "'" && B[A + 3] === "'") {
                w = this.assign(B[A], s, p1);
                y = Math.pow(10, B[A].length);
                A ++;
            }

            // Check for repeating places
            if (B[A] === '(' && B[A + 2] === ')' || B[A] === "'" && B[A + 2] === "'") {
                x = this.assign(B[A + 1], s, p1);
                z = Math.pow(10, B[A + 1].length) - 1;
                A += 3;
            }
        } else if (B[A + 1] === '/' || B[A + 1] === ':') { // Check for a simple fraction "123/456" or "123:456"
            w = this.assign(B[A], s, p1);
            y = this.assign(B[A + 2], 1, p1);
            A += 3;
        } else if (B[A + 3] === '/' && B[A + 1] === ' ') { // Check for a complex fraction "123 1/2"
            v = this.assign(B[A], s, p1);
            w = this.assign(B[A + 2], s, p1);
            y = this.assign(B[A + 4], 1, p1);
            A += 5;
        }

        if (B.length <= A) { // Check for more tokens on the stack
            d = y * z;
            s = /* void */
            n = x + d * v + z * w;
        }

        if (d === 0) {
            throw new ZeroDivisionError("divided by 0");
        }

        return new RValue(await this.klass(), new Rational(n, d, s < 0));
    }

    private static assign(n: string, s: number, p1: string): number {
        let n_prime = parseInt(n, 10);

        if (isNaN(n_prime)) {
            throw new ArgumentError(`invalid value for convert(): ${RubyString.inspect(p1)}`);
        }

        return n_prime * s;
    }

    private static klass_: RValue;

    static async klass(): Promise<RValue> {
        const klass = await Object.find_constant("Rational");

        if (klass) {
            this.klass_ = klass;
        } else {
            throw new NameError(`missing constant Rational`);
        }

        return this.klass_;
    }

    static async new(n: number, d: number): Promise<RValue> {
        return new RValue(await this.klass(), new Rational(Math.abs(n), Math.abs(d), (n < 0) !== (d < 0)));
    }

    public n: number;
    public d: number;
    public negative: boolean;

    constructor(n: number, d: number, negative: boolean) {
        const a = this.gcd(n, d);
        this.n = n / a;
        this.d = d / a;
        this.negative = negative;
    }

    private gcd(a: number, b: number): number {
        if (!a) return b;
        if (!b) return a;

        while (true) {
            a %= b;
            if (!a) return b;

            b %= a;
            if (!b) return a;
        }
    }

    get s() {
        return this.negative ? -1 : 1;
    }

    to_f(): number {
        return this.n / this.d;
    }
}

export const init = async () => {
    if (inited) return;

    Runtime.define_class("Rational", await Numeric.klass(), (klass: Class) => {
        klass.define_native_singleton_method("new", async (self: RValue, args: RValue[]): Promise<RValue> => {
            let rational;

            if (args.length === 1) {
                switch (args[0].klass) {
                    case await RubyString.klass():
                        rational = Rational.from_string(args[0].get_data<string>());
                        break;

                    case await Integer.klass():
                        const n = args[0].get_data<number>();
                        rational = Rational.new(n, 1);
                        break;

                    case await Float.klass():
                        rational = Rational.from_float(args[0].get_data<number>());
                        break;

                    default:
                        throw new ArgumentError(`can't convert ${args[0].klass.get_data<Class>().name} into Rational`)
                }
            } else {
                // @TODO: support float arguments
                await Runtime.assert_type(args[0], await Integer.klass());
                await Runtime.assert_type(args[1], await Integer.klass());

                const n = args[0].get_data<number>();
                const d = args[1].get_data<number>();

                rational = Rational.new(n, d);
            }

            return rational;
        });

        klass.define_native_method("inspect", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const rational = self.get_data<Rational>();
            return await RubyString.new(`(${rational.negative ? "-" : ""}${rational.n}/${rational.d})`);
        });

        klass.define_native_method("<=>", async (self: RValue, args: RValue[]): Promise<RValue> => {
            const rational = self.get_data<Rational>();
            let n: number, other_n: number;

            switch (args[0].klass) {
                case await Integer.klass():
                case await Float.klass():
                    n = rational.n;
                    other_n = args[0].get_data<number>() * rational.d;

                    if (n > other_n) {
                        return await Integer.get(1);
                    } else if (n < other_n) {
                        return await Integer.get(-1);
                    } else {
                        return await Integer.get(0);
                    }

                case await Rational.klass():
                    const other_rational = args[0].get_data<Rational>();
                    n = rational.n * other_rational.d;
                    other_n = other_rational.n * rational.d;
                    break;

                default:
                    throw new ArgumentError("Unreachable");
            }

            if (n > other_n) {
                return Integer.get(1);
            } else if (n < other_n) {
                return Integer.get(-1);
            } else {
                return Integer.get(0);
            }
        });

        klass.define_native_method("to_f", async (self: RValue, args: RValue[]): Promise<RValue> => {
            return await Float.new(self.get_data<Rational>().to_f());
        });
    });

    inited = true;
}
