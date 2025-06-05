import * as fs from 'fs/promises';
import * as path from 'path';
import { CacheManager, ChunkCacheEntry } from './types';

export class PersistentCacheManager implements CacheManager {
  private cache: Map<string, ChunkCacheEntry> = new Map();
  private cacheFilePath: string;
  private maxCacheSize: number;
  private expiryHours: number;
  private isDirty: boolean = false;
  private saveTimer: NodeJS.Timeout | null = null;

  constructor(cacheDir: string, maxCacheSize: number = 10000, expiryHours: number = 24) {
    this.cacheFilePath = path.join(cacheDir, 'chunk-cache.json');
    this.maxCacheSize = maxCacheSize;
    this.expiryHours = expiryHours;
  }

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.cacheFilePath), { recursive: true });
      await this.loadCache();
    } catch (error) {
      console.warn('Failed to initialize cache:', error);
    }
  }

  private async loadCache(): Promise<void> {
    try {
      const data = await fs.readFile(this.cacheFilePath, 'utf8');
      const cacheData = JSON.parse(data);

      for (const [key, entry] of Object.entries(cacheData)) {
        const cacheEntry = entry as any;
        this.cache.set(key, {
          ...cacheEntry,
          timestamp: new Date(cacheEntry.timestamp)
        });
      }

      await this.cleanup();
    } catch {
      // Cache file doesn't exist or is corrupted, start fresh
      this.cache.clear();
    }
  }

  private async saveCache(): Promise<void> {
    if (!this.isDirty) return;

    try {
      const cacheData: Record<string, any> = {};
      for (const [key, entry] of this.cache.entries()) {
        cacheData[key] = {
          ...entry,
          timestamp: entry.timestamp.toISOString()
        };
      }

      await fs.writeFile(this.cacheFilePath, JSON.stringify(cacheData, null, 2));
      this.isDirty = false;
    } catch (error) {
      console.error('Failed to save cache:', error);
    }
  }

  private scheduleSave(): void {
    const timestamp = Date.now();
    const callId = Math.random().toString(36).substr(2, 9);

    console.log(`[CACHE-DEBUG] scheduleSave() called - ID: ${callId}, timestamp: ${timestamp}, existing timer: ${this.saveTimer ? 'YES' : 'NO'}`);

    if (this.saveTimer) {
      console.log(`[CACHE-DEBUG] Clearing existing timer - ID: ${callId}`);
      clearTimeout(this.saveTimer);
    }

    this.saveTimer = setTimeout(() => {
      console.log(`[CACHE-DEBUG] Timer executing save - ID: ${callId}, delay: ${Date.now() - timestamp}ms`);
      this.saveCache();
    }, 5000); // Save after 5 seconds of inactivity

    console.log(`[CACHE-DEBUG] New timer scheduled - ID: ${callId}, delay: 5000ms`);
  }

  async get(key: string): Promise<ChunkCacheEntry | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if entry has expired
    const now = new Date();
    const expiryTime = new Date(entry.timestamp.getTime() + this.expiryHours * 60 * 60 * 1000);

    if (now > expiryTime) {
      await this.delete(key);
      return null;
    }

    return entry;
  }

  async set(key: string, entry: ChunkCacheEntry): Promise<void> {
    // Enforce cache size limit
    if (this.cache.size >= this.maxCacheSize && !this.cache.has(key)) {
      // Remove oldest entry
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, entry);
    this.isDirty = true;
    this.scheduleSave();
  }

  async has(key: string): Promise<boolean> {
    const entry = await this.get(key);
    return entry !== null;
  }

  async delete(key: string): Promise<void> {
    if (this.cache.delete(key)) {
      this.isDirty = true;
      this.scheduleSave();
    }
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.isDirty = true;
    this.scheduleSave();
  }

  async size(): Promise<number> {
    return this.cache.size;
  }

  async cleanup(): Promise<void> {
    const now = new Date();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      const expiryTime = new Date(entry.timestamp.getTime() + this.expiryHours * 60 * 60 * 1000);
      if (now > expiryTime) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
    }

    if (expiredKeys.length > 0) {
      this.isDirty = true;
      this.scheduleSave();
    }
  }

  async dispose(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    await this.saveCache();
  }
}

export class MemoryCacheManager implements CacheManager {
  private cache: Map<string, ChunkCacheEntry> = new Map();
  private maxCacheSize: number;
  private expiryHours: number;

  constructor(maxCacheSize: number = 5000, expiryHours: number = 1) {
    this.maxCacheSize = maxCacheSize;
    this.expiryHours = expiryHours;
  }

  async get(key: string): Promise<ChunkCacheEntry | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if entry has expired
    const now = new Date();
    const expiryTime = new Date(entry.timestamp.getTime() + this.expiryHours * 60 * 60 * 1000);

    if (now > expiryTime) {
      this.cache.delete(key);
      return null;
    }

    return entry;
  }

  async set(key: string, entry: ChunkCacheEntry): Promise<void> {
    // Enforce cache size limit
    if (this.cache.size >= this.maxCacheSize && !this.cache.has(key)) {
      // Remove oldest entry (first in map)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, entry);
  }

  async has(key: string): Promise<boolean> {
    const entry = await this.get(key);
    return entry !== null;
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async size(): Promise<number> {
    return this.cache.size;
  }

  async cleanup(): Promise<void> {
    const now = new Date();
    const expiredKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      const expiryTime = new Date(entry.timestamp.getTime() + this.expiryHours * 60 * 60 * 1000);
      if (now > expiryTime) {
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.cache.delete(key);
    }
  }
}
