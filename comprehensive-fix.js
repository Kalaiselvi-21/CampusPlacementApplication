const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'backend', 'routes', 'auth.js');
let content = fs.readFileSync(file, 'utf8');

console.log('Running comprehensive syntax fix...\n');

// Count braces to find mismatches
let lines = content.split('\n');
let braceStack = [];
let issues = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const lineNum = i + 1;
  
  // Count opening and closing braces
  const openBraces = (line.match(/\{/g) || []).length;
  const closeBraces = (line.match(/\}/g) || []).length;
  
  for (let j = 0; j < openBraces; j++) {
    braceStack.push({ line: lineNum, type: 'open' });
  }
  
  for (let j = 0; j < closeBraces; j++) {
    if (braceStack.length === 0) {
      issues.push({ line: lineNum, issue: 'Extra closing brace' });
    } else {
      braceStack.pop();
    }
  }
  
  // Check for catch without try
  if (line.trim().startsWith('} catch') && braceStack.length < 2) {
    issues.push({ line: lineNum, issue: 'Possible catch without matching try' });
  }
}

console.log('Brace analysis:');
console.log(`- Unclosed braces: ${braceStack.length}`);
console.log(`- Issues found: ${issues.length}`);

if (issues.length > 0) {
  console.log('\nIssues:');
  issues.slice(0, 10).forEach(issue => {
    console.log(`  Line ${issue.line}: ${issue.issue}`);
  });
}

// Try to load the backup if it exists
const backupFile = path.join(__dirname, 'backend', 'app.js.backup');
if (fs.existsSync(backupFile)) {
  console.log('\n✅ Backup file found at backend/app.js.backup');
}

console.log('\n📝 Recommendation: The file has structural issues from the migration scripts.');
console.log('   Best approach: Restore from backup or manually fix the brace structure.');
