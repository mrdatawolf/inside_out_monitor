const fs = require('fs');
const path = require('path');

// Copy dist directory recursively
function copyRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Prepare pkg build directory
const pkgDir = path.join(__dirname, 'pkg-build');
const distSrc = path.join(__dirname, 'dist');
const distDest = path.join(pkgDir, 'dist');
const bundleSrc = path.join(__dirname, 'dashboard-bundle.cjs');
const bundleDest = path.join(pkgDir, 'dashboard-bundle.cjs');

// Clean and create pkg-build directory
if (fs.existsSync(pkgDir)) {
  fs.rmSync(pkgDir, { recursive: true });
}
fs.mkdirSync(pkgDir);

// Copy dist files
console.log('Copying dist files...');
copyRecursive(distSrc, distDest);

// Copy bundle
console.log('Copying bundle...');
fs.copyFileSync(bundleSrc, bundleDest);

// Create package.json for pkg
const pkgJson = {
  name: 'inside-out-monitor-dashboard-server',
  version: '1.0.0',
  bin: 'dashboard-bundle.cjs',
  pkg: {
    assets: ['dist/*', 'dist/assets/*']
  }
};

fs.writeFileSync(
  path.join(pkgDir, 'package.json'),
  JSON.stringify(pkgJson, null, 2)
);

console.log('Pkg build directory prepared!');
