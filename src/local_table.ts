export interface Local {
    name: string
}

// A local representing a block passed into the current instruction
// sequence.
class BlockLocal implements Local {
    public name: string;

    constructor(name: string) {
        this.name = name;
    }
}

// A regular local variable.
class PlainLocal implements Local {
    public name: string;

    constructor(name: string) {
        this.name = name;
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

    has(name: string): boolean {
        for (let i = 0; i < this.locals.length; i ++) {
            if (this.locals[i].name == name) {
                return true;
            }
        }

        return false;
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

    // Add a BlockLocal to the local table.
    block(name: string) {
        if (!this.has(name)) {
            this.locals.push(new BlockLocal(name));
        }
    }

    // Add a PlainLocal to the local table.
    plain(name: string) {
        if (!this.has(name)) {
            this.locals.push(new PlainLocal(name))
        }
    }

    // This is the offset from the top of the stack where this local variable
    // lives.
    offset(index: number) {
        this.size() - (index - 3) - 1;
    }
}
