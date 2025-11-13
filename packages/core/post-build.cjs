const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, '../../dist/packages/core');
const srcPath = path.join(distPath, 'src');
const targetDistPath = path.join(distPath, 'dist');

// Create dist directory
if (!fs.existsSync(targetDistPath)) {
  fs.mkdirSync(targetDistPath, { recursive: true });
}

// Copy files from src to dist, maintaining structure
function copyRecursive(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (fs.existsSync(srcPath)) {
  copyRecursive(srcPath, targetDistPath);
  console.log('✅ Created dist folder from src');
} else {
  console.error('❌ src folder not found');
  process.exit(1);
}
