import fs from 'fs/promises';
import path from 'path';

export async function atomicWriteText(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, filePath);
}

export async function atomicWriteJson(filePath, value) {
  await atomicWriteText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

