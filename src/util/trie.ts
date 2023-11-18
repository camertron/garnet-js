class TrieNode<K, V> {
    public prefixes: Map<K, TrieNode<K, V>>;
    public value: V;

    constructor() {
        this.prefixes = new Map();
    }
}

export class Trie<K, V> {
    private root: TrieNode<K, V>;

    constructor() {
        this.root = new TrieNode<K, V>();
    }

    set(key: Iterable<K>, value: V) {
        const node = this.find_or_make_node(key);
        node.value = value;
    }

    get(key: Iterable<K>): V | null {
        const node = this.find_node(key);

        if (!node) {
            return null;
        }

        if (!node.value) {
            return null;
        }

        return node.value;
    }

    has(key: Iterable<K>): boolean {
        const node = this.find_node(key);

        if (node && node.value) {
            return true;
        }

        return false;
    }

    has_path(key: Iterable<K>): boolean {
        const node = this.find_node(key);

        if (node) {
            return true;
        }

        return false;
    }

    private find_node(key: Iterable<K>): TrieNode<K, V> | null {
        let current = this.root;

        for(let prefix of key) {
            if (current.prefixes.has(prefix)) {
                current = current.prefixes.get(prefix)!;
            } else {
                return null;
            }
        }

        return current;
    }

    private find_or_make_node(key: Iterable<K>): TrieNode<K, V> {
        let current = this.root;

        for(let prefix of key) {
            if (current.prefixes.has(prefix)) {
                current = current.prefixes.get(prefix)!;
            } else {
                const new_node = new TrieNode<K, V>();
                current.prefixes.set(prefix, new_node);
                current = new_node;
            }
        }

        return current;
    }
}
