#!/usr/bin/env node

/**
 * CLI入口脚本
 * 通过交互式选择执行不同模块功能
 */

import { Command } from 'commander';
import { select, Separator } from '@inquirer/prompts';
import { i18n } from './modules/i18n/index.js';
import { logger, loggerError } from './utils/index.js';

const program = new Command();

/**
 * 主程序入口函数
 * 解析命令行参数，交互式选择模块并执行对应功能
 */
async function main() {
  try {
    logger.info('【td-web-cli】程序启动');

    // 解析命令行参数
    program.parse(process.argv);
    logger.info(`命令行参数解析完成：${process.argv.slice(2).join(' ')}`);

    // 定义可用模块选项
    const moduleChoices = [
      {
        name: '国际化',
        value: 'i18n',
        description: '国际化相关功能',
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
      pageSize: 10, // 最大显示选项数
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
        logger.info(`【${selectedModule.name}】模块开始执行`);
        await i18n(program);
        logger.info(`【${selectedModule.name}】模块执行完成`);
        break;
      default:
        logger.warn(`【${selectedModule.name}】模块暂未实现，程序已退出`);
        process.exit(0);
    }
  } catch (error: unknown) {
    // 记录错误日志，方便排查
    loggerError(error, logger);
    process.exit(1);
  }
}

// 启动主程序
main();
