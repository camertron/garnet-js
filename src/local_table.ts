export abstract class Local {
    public name: string;

    constructor(name: string) {
        this.name = name;
    }
}

// A local representing a block passed into the current instruction
// sequence.
class BlockLocal extends Local {
}

// A regular local variable.
class PlainLocal extends Local {
}

class KeywordBitsLocal extends Local {
    constructor() {
        super("keyword_bits");
    }
}

// The result of looking up a local variable in the current local table.
export class Lookup {
    public local: Local;
    public index: number;
    public depth: number;

    constructor(local: Local, index: number, depth: number) {
        this.local = local;
        this.index = index;
        this.depth = depth;
    }
}

// This represents every local variable associated with an instruction
// sequence. There are two kinds of locals: plain locals that are what you
// expect, and block proxy locals, which represent local variables
// associated with blocks that were passed into the current instruction
// sequence.
export class LocalTable {
    public locals: Local[];

    constructor() {
        this.locals = [];
    }

    is_empty() {
        return this.locals.length == 0;
    }

    find(name: string, depth: number = 0): Lookup | null {
        const index = (() => {
            for (let i = 0; i < this.locals.length; i ++) {
                if (this.locals[i].name == name) {
                    return i;
                }
            }

            return null;
        })();

        if (index != null) {
            return new Lookup(this.locals[index], index, depth);
        }

        return null;
    }

    find_or_throw(name: string, depth: number = 0): Lookup {
        const found = this.find(name, depth);

        if (found) {
            return found;
        } else {
            throw new Error(`Local variable '${name}' not found`);
        }
    }

    indexOf(name: string): number | null {
        for (let i = 0; i < this.locals.length; i ++) {
            if (this.locals[i].name == name) {
                return i;
            }
        }

        return null;
    }

    names(): string[] {
        return this.locals.map(local => local.name);
    }

    name_at(index: number) {
        return this.locals[index].name;
    }

    size() {
        return this.locals.length;
    }

    // Add a BlockLocal to the local table. Returns the index.
    block(name: string): number {
        let idx = this.indexOf(name);

        if (idx === null) {
            this.locals.push(new BlockLocal(name));
            idx = this.locals.length - 1;
        }

        return idx;
    }

    // Add a PlainLocal to the local table. Returns the index.
    plain(name: string): number {
        let idx = this.indexOf(name);

        if (idx === null) {
            this.locals.push(new PlainLocal(name))
            idx = this.locals.length - 1;
        }

        return idx;
    }

    // Add a KeywordBitsLocal to the local table. Returns the index.
    keyword_bits(): number {
        let idx = this.indexOf("keyword_bits");

        if (idx === null) {
            this.locals.push(new KeywordBitsLocal());
            idx = this.locals.length - 1;
        }

        return idx;
    }

    // This is the offset from the top of the stack where this local variable
    // lives.
    offset(index: number) {
        this.size() - (index - 3) - 1;
    }
}
