/**
 * Runs one task at a time, in the order they were asked for. Everything that reads or replaces the key in
 * memory, or writes a secret under it, goes through one of these, so a rotation can never run between "take the
 * key" and "write the secret" of another request and leave a value wrapped under a key that no longer exists.
 * The vault lives in one process (the key is in its memory), so this is enough; the database transaction adds
 * the check that nothing else wrote meanwhile.
 */
export class Serial {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
