import nacl from 'tweetnacl';
import util from 'tweetnacl-util';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { encodeBase64 } = util;

const __dirname = dirname(fileURLToPath(import.meta.url));
const keyPath = join(__dirname, '..', 'secret.key');

// Generate random 32-byte key
const key = nacl.randomBytes(nacl.secretbox.keyLength);
const keyBase64 = encodeBase64(key);

// Save to file
writeFileSync(keyPath, keyBase64, 'utf8');

console.log('\n✓ Pre-shared key generated successfully!');
console.log(`  Location: ${keyPath}`);
console.log(`\n  Key (base64):\n  ${keyBase64}`);
console.log('\n⚠ IMPORTANT: Copy this key to your client devices!');
console.log('  Keep it secret and secure.\n');
