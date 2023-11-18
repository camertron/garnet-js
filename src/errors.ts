export class NotImplementedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "NotImplementedError";
    }
}

export class NameError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "NameError";
    }
}

export class NoMethodError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "NoMethodError";
    }
}

export class TypeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "TypeError";
    }
}

export class LoadError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "LoadError";
    }
}
