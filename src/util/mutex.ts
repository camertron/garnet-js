// See: https://github.com/jagi/mutex

export class Mutex {
    private mutex = Promise.resolve();

    public async run<T>(fn: () => Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            this.mutex = this.mutex.then(async () => {
                try {
                    resolve(await fn());
                } catch (err) {
                    reject(err);
                }
            });
        });
    }
}
