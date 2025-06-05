import * as zlib from 'zlib';
import { promisify } from 'util';
import { CompressionResult } from './types';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export class CompressionManager {
  private compressionThreshold: number;

  constructor(compressionThreshold: number = 1024) {
    this.compressionThreshold = compressionThreshold;
  }

  /**
   * Compresses content if it exceeds the threshold
   */
  async compressIfBeneficial(content: string): Promise<CompressionResult | null> {
    const originalBuffer = Buffer.from(content, 'utf8');
    const originalSize = originalBuffer.length;

    // Don't compress if below threshold
    if (originalSize < this.compressionThreshold) {
      return null;
    }

    try {
      const compressed = await gzip(originalBuffer);
      const compressedSize = compressed.length;
      const compressionRatio = compressedSize / originalSize;

      // Only use compression if it saves at least 10%
      if (compressionRatio > 0.9) {
        return null;
      }

      return {
        compressed,
        originalSize,
        compressedSize,
        compressionRatio
      };
    } catch (error) {
      console.warn('Compression failed:', error);
      return null;
    }
  }

  /**
   * Decompresses content
   */
  async decompress(compressedBuffer: Buffer): Promise<string> {
    try {
      const decompressed = await gunzip(compressedBuffer);
      return decompressed.toString('utf8');
    } catch (error) {
      throw new Error(`Decompression failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Checks if compression would be beneficial for given content size
   */
  shouldCompress(contentSize: number): boolean {
    return contentSize >= this.compressionThreshold;
  }

  /**
   * Estimates compression ratio for content
   */
  estimateCompressionRatio(content: string): number {
    // Simple heuristic based on content characteristics
    const uniqueChars = new Set(content).size;
    const totalChars = content.length;
    const repetitionRatio = 1 - (uniqueChars / totalChars);

    // More repetitive content compresses better
    return Math.max(0.3, 1 - (repetitionRatio * 0.7));
  }
}

export class StreamingCompressor {
  private compressor: zlib.Gzip;
  private chunks: Buffer[] = [];

  constructor() {
    this.compressor = zlib.createGzip();
    this.compressor.on('data', (chunk: Buffer) => {
      this.chunks.push(chunk);
    });
  }

  write(data: string | Buffer): void {
    this.compressor.write(data);
  }

  async finish(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      this.compressor.on('end', () => {
        resolve(Buffer.concat(this.chunks));
      });
      this.compressor.on('error', reject);
      this.compressor.end();
    });
  }
}
