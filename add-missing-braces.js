const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'backend', 'routes', 'auth.js');
let content = fs.readFileSync(file, 'utf8');

console.log('Adding missing closing braces...\n');

// The file needs 24 closing braces at the end
// Let's add them before the module.exports line

const exportLine = 'module.exports = router;';
const exportIndex = content.lastIndexOf(exportLine);

if (exportIndex > -1) {
  // Add 24 closing braces before module.exports
  const closingBraces = '\n' + '}'.repeat(24) + '\n\n';
  content = content.substring(0, exportIndex) + closingBraces + content.substring(exportIndex);
  
  fs.writeFileSync(file, content, 'utf8');
  console.log('✅ Added 24 closing braces before module.exports');
  console.log('Checking syntax...');
  
  // Check syntax
  const { execSync } = require('child_process');
  try {
    execSync('node -c backend/routes/auth.js', { encoding: 'utf8' });
    console.log('✅ No syntax errors!');
  } catch (err) {
    console.log('❌ Still has syntax errors:');
    console.log(err.stderr || err.stdout);
  }
} else {
  console.log('❌ Could not find module.exports line');
}
