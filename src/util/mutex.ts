// See: https://github.com/jagi/mutex

export class Mutex {
    private mutex: Promise<any> = Promise.resolve();

    public async run<T>(fn: () => Promise<T>): Promise<T> {
        // Wait for the previous operation to complete
        try {
            await this.mutex;
        } catch (err) {
            // Ignore errors from previous operations
        }

        // Update the mutex to point to this operation
        this.mutex = (async () => {
            try {
                return await fn();
            } catch (err) {
                // Re-throw the error so it propagates to the caller
                throw err;
            }
        })();

        // Wait for this operation to complete before returning
        // This ensures that any errors are properly propagated to the caller
        return await this.mutex;
    }
}
