import * as path from 'path';
import * as Mocha from 'mocha';
import { glob } from 'glob';

export function run(): Promise<void> {
  // Create the mocha test runner
  const mocha = new (Mocha as any)({
    ui: 'tdd', // Use the TDD interface (suite/test)
    color: true, // Enable colors in terminal output
    timeout: 10000, // Set timeout to 10 seconds for async tests
    reporter: 'spec', // Use the spec reporter for detailed output
    bail: false, // Continue running tests even if some fail
  });

  const testsRoot = path.resolve(__dirname, '..');

  return new Promise((resolve, reject) => {
    // Find all test files
    const testPattern = '**/**.test.js';
    
    console.log(`🔍 Looking for test files in: ${testsRoot}`);
    console.log(`📋 Using pattern: ${testPattern}`);

    glob(testPattern, { cwd: testsRoot })
      .then((files) => {
        console.log(`📁 Found ${files.length} test files:`);
        
        // Add files to the test suite
        files.forEach(f => {
          const testFile = path.resolve(testsRoot, f);
          console.log(`  📄 ${f}`);
          mocha.addFile(testFile);
        });

        console.log('\n🚀 Starting test execution...\n');

        try {
          // Run the mocha test
          mocha.run((failures: number) => {
            if (failures > 0) {
              console.log(`\n❌ ${failures} test(s) failed.`);
              reject(new Error(`${failures} tests failed.`));
            } else {
              console.log('\n✅ All tests passed!');
              resolve();
            }
          });
        } catch (err) {
          console.error('💥 Error running tests:', err);
          reject(err);
        }
      })
      .catch(err => {
        console.error('🔥 Error finding test files:', err);
        reject(err);
      });
  });
} 