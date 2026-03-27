import { Command } from 'commander';
import { select, Separator } from '@inquirer/prompts';
import { logger, loggerError } from '../../utils/index.js';
import { getHolidayTime } from './getHolidayTime/index.js';

/**
 * 小工具模块主入口
 * 提供多个小工具相关功能的交互式选择
 * @param program Commander命令行实例，用于传递参数和配置
 */
export async function tools(program: Command) {
  try {
    logger.info('小工具模块启动，等待用户选择功能');

    // 定义可用功能选项
    const moduleChoices = [
      {
        name: '获取假期时间',
        value: 'getHolidayTime',
        description: '获取今年的假期时间列表',
      },
    ];

    // 交互式选择需要执行的功能
    const answer = await select({
      message: '请选择要执行的功能：',
      choices: [
        ...moduleChoices,
        new Separator(), // 分割线，方便未来扩展更多功能
      ],
      default: 'getHolidayTime', // 默认选项
      loop: true, // 是否循环滚动选项
    });

    // 查找选择功能的名称，方便日志输出
    const selectedModule = moduleChoices.find((item) => item.value === answer);

    if (!selectedModule) {
      logger.warn('未选择有效功能，程序已退出');
      process.exit(0);
    }

    logger.info(`用户选择功能：${selectedModule.name}`);

    // 根据选择执行对应功能
    switch (answer) {
      case 'getHolidayTime':
        logger.info(`${selectedModule.name}功能开始执行`);
        await getHolidayTime();
        logger.info(`${selectedModule.name}功能执行完成`);
        break;
      default:
        logger.warn(`${selectedModule.name}功能暂未实现，程序已退出`);
        process.exit(0);
    }
  } catch (error: unknown) {
    // 记录错误日志，方便排查
    loggerError(error, logger);
    console.error('程序执行时发生异常，已记录日志，程序已退出');
    process.exit(1);
  }
}
