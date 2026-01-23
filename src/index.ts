#!/usr/bin/env node

/**
 * CLI入口脚本
 * 通过交互式选择执行不同模块功能
 */

import { Command } from 'commander';
import { select, Separator } from '@inquirer/prompts';
import { i18n } from './modules/i18n/index.js';

const program = new Command();

async function main() {
  try {
    // 解析命令行参数
    program.parse(process.argv);

    // 交互式选择模块
    const answer = await select({
      message: '请选择要执行的模块：',
      choices: [
        {
          name: '国际化',
          value: 'i18n',
          description: '国际化相关功能',
        },
        new Separator(), // 分割线，便于扩展更多模块
      ],
      default: 'i18n', // 默认选项
      pageSize: 10, // 最大显示选项数
      loop: true, // 选项循环滚动
    });

    // 根据选择执行对应模块
    switch (answer) {
      case 'i18n':
        await i18n(program);
        break;
      default:
        console.log('未选择任何模块，程序已退出');
        process.exit(0);
    }
  } catch {
    // 生产环境不打印详细错误信息，避免泄露内部细节
    console.error('程序执行出错，程序已退出');
    process.exit(1);
  }
}

// 启动主程序
main();
