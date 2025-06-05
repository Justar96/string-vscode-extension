import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
  try {
    // The folder containing the Extension Manifest package.json
    // Passed to `--extensionDevelopmentPath`
    const extensionDevelopmentPath = path.resolve(__dirname, '../../');

    // The path to the extension test script
    // Passed to --extensionTestsPath
    const extensionTestsPath = path.resolve(__dirname, './suite/index');

    // Download VS Code, unzip it and run the integration test
    console.log('Starting String Codebase Indexer extension tests...');
    
    await runTests({ 
      extensionDevelopmentPath, 
      extensionTestsPath,
      launchArgs: [
        '--disable-extensions', // Disable other extensions during test
        '--disable-workspace-trust', // Disable workspace trust prompts
      ]
    });

    console.log('✅ All tests completed successfully!');
  } catch (err) {
    console.error('❌ Failed to run tests:', err);
    process.exit(1);
  }
}

main(); 