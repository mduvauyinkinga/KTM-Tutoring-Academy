import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const template = await readFile(
  path.join(projectRoot, 'legal-pages', 'shell.template.html'),
  'utf8'
);

const pages = [
  {
    output: 'terms.html',
    content: 'terms.content.html',
    title: 'Terms &amp; Conditions - KTM Academy',
    description: 'KTM Academy terms and conditions for lesson and past-paper access.'
  },
  {
    output: 'privacy.html',
    content: 'privacy.content.html',
    title: 'Privacy Policy - KTM Academy',
    description: 'KTM Academy privacy policy: how we collect, use and protect your personal information under POPIA.'
  },
  {
    output: 'popia.html',
    content: 'popia.content.html',
    title: 'POPIA Information - KTM Academy',
    description: 'How to learn about and make requests concerning personal information processed by KTM Academy.'
  }
];

for (const page of pages) {
  const content = await readFile(
    path.join(projectRoot, 'legal-pages', page.content),
    'utf8'
  );
  const footer = await readFile(path.join(projectRoot, 'footer.html'), 'utf8');
  const output = template
    .replace('{{TITLE}}', page.title)
    .replace('{{DESCRIPTION}}', page.description)
    .replace('{{CONTENT}}', content)
    .replace('{{FOOTER}}', footer)
    .replace('<link rel="stylesheet" href="styles.css">', '<link rel="stylesheet" href="assets/css/kids-design.css">');

  if (output.includes('{{')) {
    throw new Error(`Unresolved template placeholder while rendering ${page.output}`);
  }

  await writeFile(path.join(projectRoot, page.output), output, 'utf8');
}

console.log(`Built ${pages.length} legal pages from the shared shell.`);
