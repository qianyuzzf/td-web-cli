import { Command } from 'commander';
import { select, Separator } from '@inquirer/prompts';
import { excel2json } from './excel2json/index.js';
import { logger } from '../../utils/index.js';

/**
 * 国际化模块主入口
 * 提供多个国际化相关功能的交互式选择
 * @param program Commander命令行实例，用于传递参数和配置
 */
export async function i18n(program: Command) {
  try {
    logger.info('国际化模块启动，等待用户选择功能');

    // 交互式选择需要执行的功能
    const answer = await select({
      message: '请选择要执行的功能：',
      choices: [
        {
          name: '提取词条',
          value: 'extractEntry',
          description: '从所给路径中提取词条信息',
        },
        {
          name: 'json转excel',
          value: 'json2excel',
          description: '将json格式的词条信息转换为excel表格',
        },
        {
          name: 'excel转json',
          value: 'excel2json',
          description: '将excel表格转换为json格式的词条信息',
        },
        {
          name: 'json合并',
          value: 'jsonMerge',
          description: '合并多个json格式的词条信息文件',
        },
        new Separator(), // 分割线，方便未来扩展更多功能
      ],
      default: 'extractEntry', // 默认选项
      pageSize: 10, // 最大显示选项数
      loop: true, // 是否循环滚动选项
    });

    logger.info(`用户选择功能：${answer}`);

    // 根据选择执行对应功能
    switch (answer) {
      case 'excel2json':
        logger.info('开始执行 excel2json 功能');
        await excel2json(program);
        logger.info('excel2json 功能执行完毕');
        break;
      default:
        logger.warn(`功能【${answer}】暂未实现或未选择，程序已退出`);
        process.exit(0);
    }
  } catch (error: unknown) {
    // 捕获并记录错误日志，方便排查问题
    if (error instanceof Error) {
      logger.error(`执行国际化模块时发生错误: ${error.stack ?? error.message}`);
    } else {
      logger.error(`执行国际化模块时发生未知错误: ${String(error)}`);
    }

    process.exit(1);
  }
}
