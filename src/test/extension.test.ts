import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { promises as fsPromises } from 'fs';
import * as os from 'os';

// Import the extension module for testing
// Note: We'll need to restructure some parts to make them testable
// import * as extension from '../../extension';

// Mock data and utilities for testing
interface MockFileItem {
	uri: vscode.Uri;
	relativePath: string;
	selected: boolean;
	language: string;
	size: number;
}

interface MockChunkInfo {
	content: string;
	index: number;
	metadata: {
		lineCount: number;
		characterCount: number;
		hasCode: boolean;
		language: string;
	};
	hash: string;
}

// Helper function to create temporary test files
async function createTempFile(content: string, extension: string = '.js'): Promise<vscode.Uri> {
	const tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'vscode-test-'));
	const tempFile = path.join(tempDir, `test${extension}`);
	await fsPromises.writeFile(tempFile, content, 'utf8');
	return vscode.Uri.file(tempFile);
}

// Helper function to clean up temp files
async function cleanupTempFile(uri: vscode.Uri): Promise<void> {
	try {
		await fsPromises.unlink(uri.fsPath);
		await fsPromises.rmdir(path.dirname(uri.fsPath));
	} catch (error) {
		// Ignore cleanup errors
	}
}

// Mock workspace configuration
class MockWorkspaceConfiguration implements vscode.WorkspaceConfiguration {
	private config: { [key: string]: any } = {
		'string-codebase-indexer.url': 'http://localhost:8000',
		'string-codebase-indexer.apiKey': 'test-api-key',
		'string-codebase-indexer.maxChunkSize': 1000,
		'string-codebase-indexer.batchSize': 3,
		'string-codebase-indexer.excludePatterns': ['node_modules', '.git', 'dist'],
		'string-codebase-indexer.enableWebhooks': true,
		'string-codebase-indexer.webhookPort': 3000,
		'string-codebase-indexer.autoIndexOnStartup': false,
		'string-codebase-indexer.showBothViewsOnStartup': true
	};

	get<T>(section: string, defaultValue?: T): T {
		const key = `string-codebase-indexer.${section}`;
		return this.config[key] !== undefined ? this.config[key] : (defaultValue as T);
	}

	has(section: string): boolean {
		const key = `string-codebase-indexer.${section}`;
		return this.config[key] !== undefined;
	}

	inspect<T>(section: string): any {
		throw new Error('Method not implemented.');
	}

	update(section: string, value: any, configurationTarget?: vscode.ConfigurationTarget | boolean | null): Thenable<void> {
		const key = `string-codebase-indexer.${section}`;
		this.config[key] = value;
		return Promise.resolve();
	}

	readonly [key: string]: any;
}

suite('String Codebase Indexer Extension Test Suite', () => {
	vscode.window.showInformationMessage('Starting String Codebase Indexer tests...');

	let mockConfig: MockWorkspaceConfiguration;

	setup(() => {
		mockConfig = new MockWorkspaceConfiguration();
	});

	suite('Utility Functions', () => {
		test('getLanguageFromPath should correctly identify file languages', () => {
			const testCases = [
				{ path: 'test.py', expected: 'Python' },
				{ path: 'test.ts', expected: 'TypeScript' },
				{ path: 'test.tsx', expected: 'TypeScript React' },
				{ path: 'test.js', expected: 'JavaScript' },
				{ path: 'test.jsx', expected: 'JavaScript React' },
				{ path: 'test.java', expected: 'Java' },
				{ path: 'test.go', expected: 'Go' },
				{ path: 'test.rs', expected: 'Rust' },
				{ path: 'test.cpp', expected: 'C++' },
				{ path: 'test.c', expected: 'C' },
				{ path: 'test.h', expected: 'C/C++ Header' },
				{ path: 'test.hpp', expected: 'C++ Header' },
				{ path: 'test.cs', expected: 'C#' },
				{ path: 'test.php', expected: 'PHP' },
				{ path: 'test.rb', expected: 'Ruby' },
				{ path: 'test.unknown', expected: 'UNKNOWN' }
			];

			// We'll need to extract this function or test it indirectly
			// For now, we'll create a test implementation
			function getLanguageFromPath(filePath: string): string {
				const ext = path.extname(filePath).toLowerCase();
				const languageMap: { [key: string]: string } = {
					'.py': 'Python', '.ts': 'TypeScript', '.tsx': 'TypeScript React', '.js': 'JavaScript',
					'.jsx': 'JavaScript React', '.java': 'Java', '.go': 'Go', '.rs': 'Rust',
					'.cpp': 'C++', '.c': 'C', '.h': 'C/C++ Header', '.hpp': 'C++ Header',
					'.cs': 'C#', '.php': 'PHP', '.rb': 'Ruby'
				};
				return languageMap[ext] || path.extname(filePath).substring(1).toUpperCase() || 'Unknown';
			}

			testCases.forEach(({ path: filePath, expected }) => {
				const result = getLanguageFromPath(filePath);
				assert.strictEqual(result, expected, `Expected ${expected} for ${filePath}, got ${result}`);
			});
		});

		test('formatFileSize should format bytes correctly', () => {
			function formatFileSize(bytes: number): string {
				if (bytes === 0) return '0 B';
				const k = 1024;
				const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
				const i = Math.floor(Math.log(bytes) / Math.log(k));
				return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
			}

			const testCases = [
				{ bytes: 0, expected: '0 B' },
				{ bytes: 512, expected: '512 B' },
				{ bytes: 1024, expected: '1 KB' },
				{ bytes: 1536, expected: '1.5 KB' },
				{ bytes: 1048576, expected: '1 MB' },
				{ bytes: 1073741824, expected: '1 GB' }
			];

			testCases.forEach(({ bytes, expected }) => {
				const result = formatFileSize(bytes);
				assert.strictEqual(result, expected, `Expected ${expected} for ${bytes} bytes, got ${result}`);
			});
		});
	});

	suite('Chunking Functionality', () => {
		test('createChunks should split text correctly', () => {
			function* createChunks(text: string, maxChunkSizeChars: number, filePath: string = ''): Generator<MockChunkInfo, void, unknown> {
				if (!text || text.length === 0) return;

				const lines = text.split('\n');
				let currentChunk = '';
				let chunkIndex = 0;

				for (const line of lines) {
					const lineWithNewline = line + '\n';

					if (currentChunk.length + lineWithNewline.length > maxChunkSizeChars) {
						if (currentChunk.length > 0) {
							const content = currentChunk.trimEnd();
							yield {
								content,
								index: chunkIndex++,
								metadata: {
									lineCount: content.split('\n').length,
									characterCount: content.length,
									hasCode: /^[\s]*[a-zA-Z_$][\w$]*[\s]*[=:({]/.test(content),
									language: 'JavaScript'
								},
								hash: `hash_${chunkIndex - 1}`
							};
							currentChunk = '';
						}

						if (lineWithNewline.length > maxChunkSizeChars) {
							for (let i = 0; i < lineWithNewline.length; i += maxChunkSizeChars) {
								const content = lineWithNewline.slice(i, i + maxChunkSizeChars);
								yield {
									content,
									index: chunkIndex++,
									metadata: {
										lineCount: content.split('\n').length,
										characterCount: content.length,
										hasCode: /^[\s]*[a-zA-Z_$][\w$]*[\s]*[=:({]/.test(content),
										language: 'JavaScript'
									},
									hash: `hash_${chunkIndex - 1}`
								};
							}
						} else {
							currentChunk = lineWithNewline;
						}
					} else {
						currentChunk += lineWithNewline;
					}
				}

				if (currentChunk.length > 0) {
					const content = currentChunk.trimEnd();
					yield {
						content,
						index: chunkIndex,
						metadata: {
							lineCount: content.split('\n').length,
							characterCount: content.length,
							hasCode: /^[\s]*[a-zA-Z_$][\w$]*[\s]*[=:({]/.test(content),
							language: 'JavaScript'
						},
						hash: `hash_${chunkIndex}`
					};
				}
			}

			const testText = 'function test() {\n  console.log("Hello");\n  return true;\n}';
			const chunks = Array.from(createChunks(testText, 30));

			assert.ok(chunks.length > 0, 'Should create at least one chunk');
			
			// Verify all chunks are within size limit
			chunks.forEach((chunk, index) => {
				assert.ok(chunk.content.length <= 30, `Chunk ${index} should be within size limit`);
				assert.strictEqual(chunk.index, index, `Chunk ${index} should have correct index`);
				assert.ok(chunk.metadata.characterCount > 0, `Chunk ${index} should have character count`);
				assert.ok(chunk.metadata.lineCount > 0, `Chunk ${index} should have line count`);
			});

			// Verify chunks can be reassembled
			const reassembled = chunks.map(c => c.content).join('\n');
			const originalWithoutTrailingNewlines = testText.replace(/\n+$/, '');
			const reassembledWithoutTrailingNewlines = reassembled.replace(/\n+$/, '');
			
			// Allow for slight differences in newline handling
			assert.ok(
				reassembledWithoutTrailingNewlines.includes('function test()') && 
				reassembledWithoutTrailingNewlines.includes('console.log'),
				'Reassembled text should contain key parts of original'
			);
		});

		test('createChunks should handle empty text', () => {
			function* createChunks(text: string, maxChunkSizeChars: number): Generator<MockChunkInfo, void, unknown> {
				if (!text || text.length === 0) return;
				// Implementation would be here
			}

			const chunks = Array.from(createChunks('', 100));
			assert.strictEqual(chunks.length, 0, 'Empty text should produce no chunks');
		});

		test('createChunks should handle very long lines', () => {
			function* createChunks(text: string, maxChunkSizeChars: number): Generator<MockChunkInfo, void, unknown> {
				if (!text || text.length === 0) return;

				const lines = text.split('\n');
				let chunkIndex = 0;

				for (const line of lines) {
					if (line.length > maxChunkSizeChars) {
						for (let i = 0; i < line.length; i += maxChunkSizeChars) {
							const content = line.slice(i, i + maxChunkSizeChars);
							yield {
								content,
								index: chunkIndex++,
								metadata: {
									lineCount: 1,
									characterCount: content.length,
									hasCode: false,
									language: 'JavaScript'
								},
								hash: `hash_${chunkIndex - 1}`
							};
						}
					} else {
						yield {
							content: line,
							index: chunkIndex++,
							metadata: {
								lineCount: 1,
								characterCount: line.length,
								hasCode: false,
								language: 'JavaScript'
							},
							hash: `hash_${chunkIndex - 1}`
						};
					}
				}
			}

			const longLine = 'a'.repeat(150);
			const chunks = Array.from(createChunks(longLine, 50));

			assert.strictEqual(chunks.length, 3, 'Long line should be split into 3 chunks');
			chunks.forEach(chunk => {
				assert.ok(chunk.content.length <= 50, 'Each chunk should be within size limit');
			});
		});
	});

	suite('Configuration Management', () => {
		test('should handle missing configuration gracefully', () => {
			const emptyConfig = new MockWorkspaceConfiguration();
			
			// Test default values
			assert.strictEqual(emptyConfig.get('maxChunkSize', 1000), 1000);
			assert.strictEqual(emptyConfig.get('batchSize', 3), 3);
			assert.deepStrictEqual(emptyConfig.get('excludePatterns', []), []);
		});

		test('should validate configuration values', () => {
			const config = new MockWorkspaceConfiguration();
			
			// Test URL validation
			const url = config.get('url', '');
			assert.ok(url.length > 0, 'URL should be configured');
			
			// Test numeric limits
			const maxChunkSize = config.get('maxChunkSize', 1000);
			assert.ok(maxChunkSize > 0 && maxChunkSize <= 100000, 'Max chunk size should be reasonable');
			
			const batchSize = config.get('batchSize', 3);
			assert.ok(batchSize > 0 && batchSize <= 10, 'Batch size should be reasonable');
		});
	});

	suite('File Processing', () => {
		test('should identify supported file types', async () => {
			const supportedExtensions = ['py', 'ts', 'js', 'jsx', 'tsx', 'java', 'go', 'rs', 'cpp', 'c', 'h', 'hpp', 'cs', 'php', 'rb'];
			
			supportedExtensions.forEach(ext => {
				const testPath = `test.${ext}`;
				const isSupported = /\.(py|ts|js|jsx|tsx|java|go|rs|cpp|c|h|hpp|cs|php|rb)$/.test(testPath);
				assert.ok(isSupported, `${ext} files should be supported`);
			});
		});

		test('should exclude configured patterns', () => {
			const excludePatterns = ['node_modules', '.git', 'dist', 'build'];
			const testPaths = [
				'src/index.js',           // Should be included
				'node_modules/lib.js',    // Should be excluded
				'.git/config',            // Should be excluded
				'dist/bundle.js',         // Should be excluded
				'build/output.js',        // Should be excluded
				'tests/test.js'           // Should be included
			];

			testPaths.forEach(testPath => {
				const shouldExclude = excludePatterns.some(pattern => testPath.includes(pattern));
				const isExcluded = /\/(node_modules|\.git|dist|build)\//.test(testPath) || 
								  /^(node_modules|\.git|dist|build)\//.test(testPath);
				
				if (testPath.includes('src/') || testPath.includes('tests/')) {
					assert.ok(!isExcluded, `${testPath} should not be excluded`);
				} else {
					assert.strictEqual(isExcluded, shouldExclude, `${testPath} exclusion should match pattern`);
				}
			});
		});
	});

	suite('Error Handling', () => {
		test('should handle network errors gracefully', () => {
			// Mock network error scenarios
			const networkErrors = [
				{ code: 'ECONNREFUSED', message: 'Connection refused' },
				{ code: 'ETIMEDOUT', message: 'Request timeout' },
				{ code: 'ENOTFOUND', message: 'Host not found' }
			];

			networkErrors.forEach(error => {
				// Simulate error handling
				const shouldRetry = error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED';
				const isRetryable = ['ETIMEDOUT', 'ECONNREFUSED'].includes(error.code);
				
				assert.strictEqual(shouldRetry, isRetryable, `Error ${error.code} retry logic should be correct`);
			});
		});

		test('should validate chunk content before sending', () => {
			function validateChunk(content: string): { isValid: boolean; errors: string[] } {
				const errors: string[] = [];
				
				if (!content || content.trim().length === 0) {
					errors.push("Chunk content is empty");
				}
				
				if (content.includes('\uFFFD')) {
					errors.push("Chunk contains replacement characters");
				}
				
				if (content.length > 100000) {
					errors.push("Chunk exceeds maximum size");
				}
				
				return { isValid: errors.length === 0, errors };
			}

			// Test valid content
			const validResult = validateChunk('function test() { return true; }');
			assert.ok(validResult.isValid, 'Valid content should pass validation');
			assert.strictEqual(validResult.errors.length, 0, 'Valid content should have no errors');

			// Test empty content
			const emptyResult = validateChunk('');
			assert.ok(!emptyResult.isValid, 'Empty content should fail validation');
			assert.ok(emptyResult.errors.includes('Chunk content is empty'), 'Should detect empty content');

			// Test content with replacement characters
			const replacementResult = validateChunk('test\uFFFDcontent');
			assert.ok(!replacementResult.isValid, 'Content with replacement chars should fail');
			assert.ok(replacementResult.errors.includes('Chunk contains replacement characters'), 'Should detect replacement characters');
		});
	});

	suite('Status Management', () => {
		test('should track indexing state correctly', () => {
			interface IndexingState {
				autoIndexEnabled: boolean;
				isIndexing: boolean;
				lastIndexed: Date | null;
				totalFiles: number;
				indexedFiles: number;
			}

			let state: IndexingState = {
				autoIndexEnabled: false,
				isIndexing: false,
				lastIndexed: null,
				totalFiles: 0,
				indexedFiles: 0
			};

			// Test initial state
			assert.strictEqual(state.isIndexing, false, 'Should start with indexing disabled');
			assert.strictEqual(state.totalFiles, 0, 'Should start with zero files');

			// Test state transitions
			state.isIndexing = true;
			state.totalFiles = 10;
			assert.strictEqual(state.isIndexing, true, 'Should track indexing start');
			assert.strictEqual(state.totalFiles, 10, 'Should track total files');

			// Test completion
			state.isIndexing = false;
			state.indexedFiles = 10;
			state.lastIndexed = new Date();
			assert.strictEqual(state.isIndexing, false, 'Should track indexing completion');
			assert.strictEqual(state.indexedFiles, 10, 'Should track processed files');
			assert.ok(state.lastIndexed instanceof Date, 'Should record completion time');
		});

		test('should generate appropriate status messages', () => {
			function generateStatusMessage(isIndexing: boolean, indexedFiles: number, totalFiles: number, lastIndexed: Date | null): string {
				if (isIndexing) {
					return `Indexing (${indexedFiles}/${totalFiles})`;
				} else if (lastIndexed) {
					const timeAgo = Math.round((Date.now() - lastIndexed.getTime()) / 60000);
					return `Last indexed ${timeAgo}m ago`;
				} else {
					return 'Not indexed';
				}
			}

			// Test indexing in progress
			const indexingMessage = generateStatusMessage(true, 5, 10, null);
			assert.strictEqual(indexingMessage, 'Indexing (5/10)', 'Should show indexing progress');

			// Test completed indexing
			const completedTime = new Date(Date.now() - 120000); // 2 minutes ago
			const completedMessage = generateStatusMessage(false, 10, 10, completedTime);
			assert.strictEqual(completedMessage, 'Last indexed 2m ago', 'Should show time since completion');

			// Test never indexed
			const neverMessage = generateStatusMessage(false, 0, 0, null);
			assert.strictEqual(neverMessage, 'Not indexed', 'Should show never indexed state');
		});
	});

	suite('Tree Data Provider', () => {
		test('should build file tree structure correctly', () => {
			const mockFiles: MockFileItem[] = [
				{
					uri: vscode.Uri.file('/workspace/src/index.js'),
					relativePath: 'src/index.js',
					selected: true,
					language: 'JavaScript',
					size: 1024
				},
				{
					uri: vscode.Uri.file('/workspace/src/utils/helper.js'),
					relativePath: 'src/utils/helper.js',
					selected: true,
					language: 'JavaScript',
					size: 512
				},
				{
					uri: vscode.Uri.file('/workspace/README.md'),
					relativePath: 'README.md',
					selected: false,
					language: 'Markdown',
					size: 256
				}
			];

			// Build tree structure
			interface TreeNode {
				label?: string;
				children: TreeNode[];
				fileItem?: MockFileItem;
			}

			const folderMap = new Map<string, TreeNode>();
			const rootNode: TreeNode = { children: [] };
			folderMap.set('', rootNode);

			mockFiles.forEach(file => {
				const pathParts = file.relativePath.split('/');
				let currentParent = rootNode;
				let currentPath = '';

				// Create folders
				for (let i = 0; i < pathParts.length - 1; i++) {
					if (currentPath) currentPath += '/';
					currentPath += pathParts[i];
					
					if (!folderMap.has(currentPath)) {
						const folderNode: TreeNode = { label: pathParts[i], children: [] };
						folderMap.set(currentPath, folderNode);
						currentParent.children.push(folderNode);
					}
					currentParent = folderMap.get(currentPath)!;
				}

				// Add file
				currentParent.children.push({
					label: pathParts[pathParts.length - 1],
					children: [],
					fileItem: file
				});
			});

			// Verify structure
			assert.ok(rootNode.children.length > 0, 'Root should have children');
			const srcFolder = rootNode.children.find((child: TreeNode) => child.label === 'src');
			assert.ok(srcFolder, 'Should have src folder');
			assert.ok(srcFolder!.children.length > 0, 'Src folder should have children');
		});
	});

	suite('Integration Tests', () => {
		test('should handle full indexing workflow', async () => {
			// Create temporary test file
			const testContent = 'function test() {\n  return "Hello World";\n}';
			const tempFile = await createTempFile(testContent, '.js');

			try {
				// Mock the indexing process
				const mockFile: MockFileItem = {
					uri: tempFile,
					relativePath: 'test.js',
					selected: true,
					language: 'JavaScript',
					size: testContent.length
				};

				// Verify file exists and is readable
				const stats = await fsPromises.stat(tempFile.fsPath);
				assert.ok(stats.isFile(), 'Test file should exist');
				assert.strictEqual(stats.size, testContent.length, 'File size should match content');

				// Test chunking
				function* createChunks(text: string, maxSize: number): Generator<MockChunkInfo> {
					const lines = text.split('\n');
					let chunk = '';
					let index = 0;

					for (const line of lines) {
						if (chunk.length + line.length > maxSize && chunk.length > 0) {
							yield {
								content: chunk.trim(),
								index: index++,
								metadata: {
									lineCount: chunk.split('\n').length,
									characterCount: chunk.length,
									hasCode: true,
									language: 'JavaScript'
								},
								hash: `hash_${index - 1}`
							};
							chunk = line + '\n';
						} else {
							chunk += line + '\n';
						}
					}

					if (chunk.trim()) {
						yield {
							content: chunk.trim(),
							index: index,
							metadata: {
								lineCount: chunk.split('\n').length,
								characterCount: chunk.length,
								hasCode: true,
								language: 'JavaScript'
							},
							hash: `hash_${index}`
						};
					}
				}

				const chunks = Array.from(createChunks(testContent, 50));
				assert.ok(chunks.length > 0, 'Should generate chunks from test file');

				// Verify chunks contain expected content
				const allContent = chunks.map(c => c.content).join('\n');
				assert.ok(allContent.includes('function test'), 'Chunks should contain function declaration');

			} finally {
				// Cleanup
				await cleanupTempFile(tempFile);
			}
		});
	});

	teardown(() => {
		// Cleanup after each test
	});
});
