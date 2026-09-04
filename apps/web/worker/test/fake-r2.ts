/** In-memory R2 bucket stub shared by backup/restore tests. */
export class FakeR2Bucket {
  private readonly store = new Map<string, { body: string; metadata?: Record<string, string> }>();

  async put(key: string, data: string, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }) {
    this.store.set(key, { body: data, metadata: options?.customMetadata ?? {} });
  }

  async get(key: string): Promise<{ text(): Promise<string> } | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    return { text: async () => entry.body };
  }

  async list(opts?: { prefix?: string }): Promise<{ objects: { key: string }[] }> {
    const prefix = opts?.prefix ?? "";
    const objects = Array.from(this.store.keys())
      .filter((k) => k.startsWith(prefix))
      .map((key) => ({ key }));
    return { objects };
  }

  async delete(keys: string[]): Promise<void> {
    for (const key of keys) this.store.delete(key);
  }

  keys(): string[] {
    return Array.from(this.store.keys());
  }
}
