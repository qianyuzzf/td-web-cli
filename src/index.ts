#!/usr/bin/env node

import { select, Separator } from '@inquirer/prompts';
import { i18n } from './modules/i18n/index.js';

const main = async () => {
  try {
    const answer = await select({
      message: '请选择要执行的模块:',
      choices: [
        {
          name: '国际化',
          value: 'i18n',
          description: '国际化相关功能',
        },
        new Separator(),
      ],
      default: 'i18n',
      pageSize: 10,
      loop: true,
    });
    switch (answer) {
      case 'i18n':
        await i18n();
        break;
      default:
        console.log('未选择任何模块，退出程序。');
        break;
    }
  } catch (error) {
    process.exit(0);
  }
};

main();
