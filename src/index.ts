#!/usr/bin/env node

/**
 * CLI入口脚本
 * 通过交互式选择执行不同模块功能
 */

import { Command } from 'commander';
import fs from 'fs';
import { select, Separator } from '@inquirer/prompts';
import { logger, loggerError } from './utils/index.js';
import { i18n } from './modules/i18n/index.js';
import { tools } from './modules/tools/index.js';

// 读取 package.json 中的版本号
const { version } = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf-8')
);

const program = new Command();

/**
 * 设置基础命令行选项
 */
function setupBasicOptions() {
  program
    .version(version, '-v, --version', '显示版本号')
    .description('td-web-cli 命令行工具')
    .usage('[options]')
    .helpOption('-h, --help', '显示帮助信息')
    .addHelpText(
      'after',
      `
      示例：
        $ td-web-cli               # 进入交互式选择模块
        $ td-web-cli -v            # 显示版本号
        $ td-web-cli -h            # 显示帮助信息
      `.trim()
    );
}

/**
 * 交互式选择模块并执行
 */
async function runInteractiveMode() {
  // 定义可用模块选项
  const moduleChoices = [
    {
      name: '国际化',
      value: 'i18n',
      description: '国际化相关功能',
    },
    {
      name: '小工具',
      value: 'tools',
      description: '小工具相关功能',
    },
  ];

  // 交互式选择模块
  const answer = await select({
    message: '请选择要执行的模块：',
    choices: [
      ...moduleChoices,
      new Separator(), // 分割线，便于未来扩展更多模块
    ],
    default: 'i18n', // 默认选项
    loop: true, // 选项循环滚动
  });

  // 查找选择模块的名称，方便日志输出
  const selectedModule = moduleChoices.find((item) => item.value === answer);

  if (!selectedModule) {
    logger.warn('未选择有效模块，程序已退出');
    process.exit(0);
  }

  logger.info(`用户选择模块：${selectedModule.name}`);

  // 根据选择执行对应模块
  switch (answer) {
    case 'i18n':
      logger.info(`${selectedModule.name}模块开始执行`);
      await i18n(program);
      logger.info(`${selectedModule.name}模块执行完成`);
      break;
    case 'tools':
      logger.info(`${selectedModule.name}模块开始执行`);
      await tools(program);
      logger.info(`${selectedModule.name}模块执行完成`);
      break;
    default:
      logger.warn(`${selectedModule.name}模块暂未实现，程序已退出`);
      process.exit(0);
  }
}

/**
 * 主程序入口函数
 * 解析命令行参数，若未提供任何选项则进入交互式选择
 */
async function main() {
  try {
    logger.info('td-web-cli程序启动');

    // 设置基础命令行选项
    setupBasicOptions();

    // 解析命令行参数（如果用户提供了 -v 或 -h，commander 会自动退出）
    program.parse(process.argv);
    logger.info(`命令行参数解析完成：${process.argv.slice(2).join(' ')}`);

    // 如果没有其他参数（如 -v、-h 等），则进入交互模式
    // 注意：program.args 包含未被选项消费的参数，若无额外参数则执行交互
    if (program.args.length === 0) {
      logger.info('未检测到额外参数，进入交互式选择模式');
      await runInteractiveMode();
    } else {
      // 如果有额外参数，可能用户直接传入了子命令，但当前未实现子命令，提示帮助
      logger.warn(
        `未知参数：${program.args.join(' ')}，请使用 --help 查看用法`,
        true
      );
      program.help(); // 显示帮助并退出
    }
  } catch (error: unknown) {
    // 记录错误日志，方便排查
    loggerError(error, logger);
    console.error('程序执行时发生异常，已记录日志，程序已退出');
    process.exit(1);
  }
}

// 启动主程序
main();
