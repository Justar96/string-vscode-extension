import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Test Data Generator for Performance Testing
 * Generates realistic codebases with various file types and sizes
 */

export interface TestDataConfig {
  baseDir: string;
  fileCount: number;
  minFileSize: number;
  maxFileSize: number;
  duplicateContentRatio: number; // 0-1, percentage of files with duplicate content
  languages: string[];
  projectStructure: boolean; // Whether to create realistic project structure
}

export interface GeneratedTestData {
  files: TestFile[];
  totalSize: number;
  duplicateFiles: TestFile[];
  projectPath: string;
}

export interface TestFile {
  path: string;
  size: number;
  language: string;
  content: string;
  hash: string;
  isDuplicate: boolean;
  duplicateOf?: string;
}

export class TestDataGenerator {
  private static readonly CODE_TEMPLATES = {
    typescript: {
      class: `export class {className} {
  private {property}: {type};
  
  constructor({property}: {type}) {
    this.{property} = {property};
  }
  
  public {method}(): {returnType} {
    // Implementation here
    return this.{property};
  }
  
  private {privateMethod}(): void {
    console.log('Processing {property}');
  }
}`,
      function: `export function {functionName}({params}): {returnType} {
  // Function implementation
  const result = {params}.map(item => {
    return item.toString().toUpperCase();
  });
  
  return result{returnSuffix};
}`,
      interface: `export interface {interfaceName} {
  {property1}: {type1};
  {property2}: {type2};
  {property3}?: {type3};
  {method}({param}: {paramType}): {returnType};
}`,
      component: `import React from 'react';

interface {componentName}Props {
  {prop1}: {type1};
  {prop2}?: {type2};
}

export const {componentName}: React.FC<{componentName}Props> = ({ {prop1}, {prop2} }) => {
  const [state, setState] = React.useState<{stateType}>({defaultValue});
  
  const handle{action} = () => {
    setState(prev => ({ ...prev, {property}: {value} }));
  };
  
  return (
    <div className="{className}">
      <h1>{title}</h1>
      <button onClick={handle{action}}>
        {buttonText}
      </button>
    </div>
  );
};`
    },
    javascript: {
      class: `class {className} {
  constructor({property}) {
    this.{property} = {property};
  }
  
  {method}() {
    return this.{property};
  }
  
  {privateMethod}() {
    console.log('Processing', this.{property});
  }
}

module.exports = {className};`,
      function: `function {functionName}({params}) {
  const result = {params}.map(item => {
    return item.toString().toUpperCase();
  });
  
  return result{returnSuffix};
}

module.exports = { {functionName} };`,
      async: `async function {functionName}({params}) {
  try {
    const response = await fetch('{url}');
    const data = await response.json();
    
    return data.{property};
  } catch (error) {
    console.error('Error in {functionName}:', error);
    throw error;
  }
}`
    },
    python: {
      class: `class {ClassName}:
    def __init__(self, {property}: {type}):
        self.{property} = {property}
        self._{private_property} = None
    
    def {method}(self) -> {return_type}:
        """Method implementation"""
        return self.{property}
    
    def _{private_method}(self) -> None:
        """Private method implementation"""
        print(f"Processing {self.{property}}")
    
    @property
    def {property_name}(self) -> {type}:
        return self._{private_property}`,
      function: `def {function_name}({params}) -> {return_type}:
    """Function documentation"""
    result = []
    for item in {params}:
        processed = item.upper() if isinstance(item, str) else str(item)
        result.append(processed)
    
    return result{return_suffix}`,
      async: `import asyncio
import aiohttp

async def {function_name}({params}) -> {return_type}:
    """Async function implementation"""
    async with aiohttp.ClientSession() as session:
        async with session.get('{url}') as response:
            data = await response.json()
            return data.get('{property}', {default_value})`
    },
    java: {
      class: `public class {ClassName} {
    private {type} {property};
    
    public {ClassName}({type} {property}) {
        this.{property} = {property};
    }
    
    public {returnType} {method}() {
        return this.{property};
    }
    
    private void {privateMethod}() {
        System.out.println("Processing: " + this.{property});
    }
}`,
      interface: `public interface {InterfaceName} {
    {returnType} {method}({paramType} {param});
    void {voidMethod}();
    {type} get{Property}();
}`
    }
  };

  private static readonly VARIABLE_POOLS = {
    classNames: ['DataProcessor', 'FileManager', 'ConfigHandler', 'ServiceClient', 'ResponseParser', 'ValidationEngine'],
    functionNames: ['processData', 'handleRequest', 'validateInput', 'parseResponse', 'generateReport', 'calculateMetrics'],
    properties: ['data', 'config', 'options', 'settings', 'parameters', 'metadata'],
    types: ['string', 'number', 'boolean', 'object', 'array', 'Date'],
    methods: ['process', 'handle', 'validate', 'parse', 'generate', 'calculate']
  };

  /**
   * Generate test data based on configuration
   */
  public static async generateTestData(config: TestDataConfig): Promise<GeneratedTestData> {
    const files: TestFile[] = [];
    const duplicateFiles: TestFile[] = [];
    let totalSize = 0;

    // Ensure base directory exists
    await this.ensureDirectory(config.baseDir);

    // Generate base content templates
    const baseContents = await this.generateBaseContents(config);

    // Calculate how many files should be duplicates
    const duplicateCount = Math.floor(config.fileCount * config.duplicateContentRatio);
    const uniqueCount = config.fileCount - duplicateCount;

    // Generate unique files
    for (let i = 0; i < uniqueCount; i++) {
      const file = await this.generateFile(config, i, false);
      files.push(file);
      totalSize += file.size;
    }

    // Generate duplicate files
    for (let i = 0; i < duplicateCount; i++) {
      const originalFile = files[i % uniqueCount];
      const duplicateFile = await this.generateFile(config, uniqueCount + i, true, originalFile);
      files.push(duplicateFile);
      duplicateFiles.push(duplicateFile);
      totalSize += duplicateFile.size;
    }

    // Write files to disk if project structure is enabled
    if (config.projectStructure) {
      await this.writeFilesToDisk(config.baseDir, files);
    }

    return {
      files,
      totalSize,
      duplicateFiles,
      projectPath: config.baseDir
    };
  }

  /**
   * Generate a single test file
   */
  private static async generateFile(
    config: TestDataConfig,
    index: number,
    isDuplicate: boolean,
    originalFile?: TestFile
  ): Promise<TestFile> {
    const language = config.languages[index % config.languages.length];
    const extension = this.getFileExtension(language);

    let content: string;
    let duplicateOf: string | undefined;

    if (isDuplicate && originalFile) {
      content = originalFile.content;
      duplicateOf = originalFile.path;
    } else {
      const targetSize = Math.floor(
        Math.random() * (config.maxFileSize - config.minFileSize) + config.minFileSize
      );
      content = await this.generateContent(language, targetSize);
    }

    const fileName = config.projectStructure
      ? this.generateRealisticPath(language, index)
      : `test-file-${index}.${extension}`;

    const filePath = path.join(config.baseDir, fileName);
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    return {
      path: filePath,
      size: Buffer.byteLength(content, 'utf8'),
      language,
      content,
      hash,
      isDuplicate,
      duplicateOf
    };
  }

  /**
   * Generate realistic file content based on language and target size
   */
  private static async generateContent(language: string, targetSize: number): Promise<string> {
    const templates = this.CODE_TEMPLATES[language as keyof typeof this.CODE_TEMPLATES] || this.CODE_TEMPLATES.typescript;
    let content = '';

    // Add file header
    content += this.generateFileHeader(language);

    // Generate content until we reach target size
    while (Buffer.byteLength(content, 'utf8') < targetSize) {
      const templateKeys = Object.keys(templates);
      const templateKey = templateKeys[Math.floor(Math.random() * templateKeys.length)];
      const template = templates[templateKey as keyof typeof templates];

      const generatedCode = this.fillTemplate(template, language);
      content += `\n\n${generatedCode}`;

      // Add some realistic spacing and comments
      if (Math.random() > 0.7) {
        content += `\n\n${this.generateComment(language)}`;
      }
    }

    return content;
  }

  /**
   * Fill template with realistic variable names
   */
  private static fillTemplate(template: string, language: string): string {
    let filled = template;

    // Replace placeholders with random values from pools
    const replacements = {
      '{className}': this.randomFromPool('classNames'),
      '{ClassName}': this.randomFromPool('classNames'),
      '{functionName}': this.randomFromPool('functionNames'),
      '{function_name}': this.randomFromPool('functionNames').toLowerCase(),
      '{property}': this.randomFromPool('properties'),
      '{method}': this.randomFromPool('methods'),
      '{type}': this.randomFromPool('types'),
      '{returnType}': this.randomFromPool('types'),
      '{params}': this.randomFromPool('properties'),
      '{url}': 'https://api.example.com/data',
      '{title}': 'Dynamic Title',
      '{buttonText}': 'Click Me'
    };

    for (const [placeholder, value] of Object.entries(replacements)) {
      filled = filled.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    }

    return filled;
  }

  /**
   * Generate file header with imports and comments
   */
  private static generateFileHeader(language: string): string {
    const headers = {
      typescript: `/**
 * Generated test file for performance testing
 * Language: TypeScript
 */

import { EventEmitter } from 'events';
import * as path from 'path';`,
      javascript: `/**
 * Generated test file for performance testing
 * Language: JavaScript
 */

const EventEmitter = require('events');
const path = require('path');`,
      python: `"""
Generated test file for performance testing
Language: Python
"""

import os
import sys
from typing import List, Dict, Optional`,
      java: `/**
 * Generated test file for performance testing
 * Language: Java
 */

import java.util.*;
import java.io.*;`
    };

    return headers[language as keyof typeof headers] || headers.typescript;
  }

  /**
   * Generate realistic project structure path
   */
  private static generateRealisticPath(language: string, index: number): string {
    const structures = {
      typescript: [
        `src/components/Component${index}.tsx`,
        `src/services/Service${index}.ts`,
        `src/utils/Utils${index}.ts`,
        `src/types/Types${index}.ts`,
        `src/hooks/useHook${index}.ts`
      ],
      javascript: [
        `src/components/Component${index}.js`,
        `src/services/Service${index}.js`,
        `src/utils/Utils${index}.js`,
        `lib/Library${index}.js`
      ],
      python: [
        `src/modules/module_${index}.py`,
        `src/services/service_${index}.py`,
        `src/utils/utils_${index}.py`,
        `tests/test_${index}.py`
      ],
      java: [
        `src/main/java/com/example/Component${index}.java`,
        `src/main/java/com/example/Service${index}.java`,
        `src/test/java/com/example/Test${index}.java`
      ]
    };

    const paths = structures[language as keyof typeof structures] || structures.typescript;
    return paths[index % paths.length];
  }

  /**
   * Generate base contents for duplication
   */
  private static async generateBaseContents(config: TestDataConfig): Promise<string[]> {
    const contents: string[] = [];
    const baseCount = Math.min(10, Math.floor(config.fileCount * 0.1));

    for (let i = 0; i < baseCount; i++) {
      const language = config.languages[i % config.languages.length];
      const size = Math.floor(config.maxFileSize * 0.5); // Medium-sized base content
      contents.push(await this.generateContent(language, size));
    }

    return contents;
  }

  /**
   * Write generated files to disk
   */
  private static async writeFilesToDisk(baseDir: string, files: TestFile[]): Promise<void> {
    for (const file of files) {
      const dir = path.dirname(file.path);
      await this.ensureDirectory(dir);
      await fs.promises.writeFile(file.path, file.content, 'utf8');
    }
  }

  /**
   * Utility methods
   */
  private static async ensureDirectory(dir: string): Promise<void> {
    try {
      await fs.promises.access(dir);
    } catch {
      await fs.promises.mkdir(dir, { recursive: true });
    }
  }

  private static getFileExtension(language: string): string {
    const extensions = {
      typescript: 'ts',
      javascript: 'js',
      python: 'py',
      java: 'java',
      csharp: 'cs',
      cpp: 'cpp',
      go: 'go'
    };
    return extensions[language as keyof typeof extensions] || 'txt';
  }

  private static randomFromPool(poolName: keyof typeof TestDataGenerator.VARIABLE_POOLS): string {
    const pool = this.VARIABLE_POOLS[poolName];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private static generateComment(language: string): string {
    const comments = {
      typescript: '// TODO: Implement additional functionality',
      javascript: '// TODO: Implement additional functionality',
      python: '# TODO: Implement additional functionality',
      java: '// TODO: Implement additional functionality'
    };
    return comments[language as keyof typeof comments] || '// TODO: Implement additional functionality';
  }

  /**
   * Clean up generated test data
   */
  public static async cleanupTestData(projectPath: string): Promise<void> {
    try {
      await fs.promises.rm(projectPath, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Failed to cleanup test data at ${projectPath}:`, error);
    }
  }

  /**
   * Generate specific test scenarios
   */
  public static async generateScenarioData(scenario: 'small' | 'medium' | 'large' | 'mixed'): Promise<TestDataConfig> {
    const baseDir = path.join(__dirname, '..', '..', '..', 'test-data', scenario);

    const scenarios = {
      small: {
        baseDir,
        fileCount: 50,
        minFileSize: 1024, // 1KB
        maxFileSize: 10240, // 10KB
        duplicateContentRatio: 0.2,
        languages: ['typescript', 'javascript'],
        projectStructure: true
      },
      medium: {
        baseDir,
        fileCount: 200,
        minFileSize: 10240, // 10KB
        maxFileSize: 1048576, // 1MB
        duplicateContentRatio: 0.3,
        languages: ['typescript', 'javascript', 'python'],
        projectStructure: true
      },
      large: {
        baseDir,
        fileCount: 1000,
        minFileSize: 1048576, // 1MB
        maxFileSize: 52428800, // 50MB
        duplicateContentRatio: 0.4,
        languages: ['typescript', 'javascript', 'python', 'java'],
        projectStructure: true
      },
      mixed: {
        baseDir,
        fileCount: 500,
        minFileSize: 1024, // 1KB
        maxFileSize: 10485760, // 10MB
        duplicateContentRatio: 0.35,
        languages: ['typescript', 'javascript', 'python', 'java'],
        projectStructure: true
      }
    };

    return scenarios[scenario];
  }
}
