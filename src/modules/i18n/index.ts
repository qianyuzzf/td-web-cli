import { Command } from 'commander';
import { select, Separator } from '@inquirer/prompts';
import { logger, loggerError } from '../../utils/index.js';
import { excel2json } from './excel2json/index.js';
import { json2excel } from './json2excel/index.js';
import { jsonMerge } from './jsonMerge/index.js';

/**
 * 国际化模块主入口
 * 提供多个国际化相关功能的交互式选择
 * @param program Commander命令行实例，用于传递参数和配置
 */
export async function i18n(program: Command) {
  try {
    logger.info('国际化模块启动，等待用户选择功能');

    // 定义可用功能选项
    const moduleChoices = [
      {
        name: '提取词条',
        value: 'extractEntry',
        description: '从所给路径中提取词条信息',
      },
      {
        name: 'JSON转Excel',
        value: 'json2excel',
        description: '将JSON格式的词条信息转换为Excel表格',
      },
      {
        name: 'Excel转JSON',
        value: 'excel2json',
        description: '将Excel表格转换为JSON格式的词条信息',
      },
      {
        name: 'JSON合并',
        value: 'jsonMerge',
        description: '合并多个JSON格式的词条信息文件',
      },
    ];

    // 交互式选择需要执行的功能
    const answer = await select({
      message: '请选择要执行的功能：',
      choices: [
        ...moduleChoices,
        new Separator(), // 分割线，方便未来扩展更多功能
      ],
      default: 'extractEntry', // 默认选项
      pageSize: 10, // 最大显示选项数
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
      case 'excel2json':
        logger.info(`${selectedModule.name}功能开始执行`);
        await excel2json(program);
        logger.info(`${selectedModule.name}功能执行完成`);
        break;
      case 'json2excel':
        logger.info(`${selectedModule.name}功能开始执行`);
        await json2excel(program);
        logger.info(`${selectedModule.name}功能执行完成`);
        break;
      case 'jsonMerge':
        logger.info(`${selectedModule.name}功能开始执行`);
        await jsonMerge(program);
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
