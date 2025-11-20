import { readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';

const distRoot = join(process.cwd(), 'dist/packages');

async function findDtsFiles(dir, files = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return files;
    }
    throw error;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      await findDtsFiles(fullPath, files);
    } else if (entry.name.endsWith('.d.ts') && fullPath.includes('/dist/')) {
      files.push(fullPath);
    }
  }

  return files;
}

try {
  const files = await findDtsFiles(distRoot);

  if (files.length === 0) {
    console.log('No stray .d.ts files found in dist/');
    process.exit(0);
  }

  console.log(`Removing ${files.length} stray .d.ts files from dist/...`);

  await Promise.all(files.map((file) => unlink(file)));

  console.log(`Cleaned ${files.length} declaration files`);
} catch (error) {
  console.error('Failed to clean dist declarations:', error);
  process.exit(1);
}
