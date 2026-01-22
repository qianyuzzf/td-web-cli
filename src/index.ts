#!/usr/bin/env node

import { select, Separator } from '@inquirer/prompts';

async function main() {
  const answer = await select({
    message: 'Select a package manager',
    choices: [
      {
        name: 'npm',
        value: 'npm',
        description: 'npm is the most popular package manager',
      },
      {
        name: 'yarn',
        value: 'yarn',
        description: 'yarn is an awesome package manager',
      },
      new Separator(),
      {
        name: 'jspm',
        value: 'jspm',
        disabled: true,
      },
      {
        name: 'pnpm',
        value: 'pnpm',
        disabled: '(pnpm is not available)',
      },
    ],
  });
  console.log('You selected: ', answer);
}

main();
