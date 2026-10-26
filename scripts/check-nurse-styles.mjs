import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve(process.argv[2] ?? 'nurse/src/styles.css');
if (!fs.existsSync(file)) {
  console.error(`Nurse stylesheet not found: ${file}`);
  process.exit(2);
}
const source = fs.readFileSync(file, 'utf8');
const literalColour = /#[\da-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\s*\(/i;
if (literalColour.test(source)) {
  console.error('Nurse stylesheet contains a literal colour. Use the shared design tokens instead.');
  process.exit(1);
}
if (!source.includes("@import '../../design/tokens.css'") || !source.includes('var(--')) {
  console.error('Nurse stylesheet must import the shared design tokens and use token variables.');
  process.exit(1);
}
if (!source.includes('@media (prefers-reduced-motion: reduce)')) {
  console.error('Nurse stylesheet must respect prefers-reduced-motion.');
  process.exit(1);
}
console.log('Nurse stylesheet uses design-token colours and reduced-motion support.');
