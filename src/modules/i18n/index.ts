import { Command } from 'commander';
import { select, Separator } from '@inquirer/prompts';
import { excel2json } from './excel2json/index.js';

/**
 * 国际化模块主入口
 * 提供多个国际化相关功能的交互式选择
 * @param program Commander命令行实例，用于传递参数和配置
 */
export async function i18n(program: Command) {
  try {
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

    // 根据选择执行对应功能
    switch (answer) {
      case 'excel2json':
        await excel2json(program);
        break;
      default:
        // 其他功能暂未实现，提示并退出
        console.log(`功能【${answer}】暂未实现或未选择，程序已退出`);
        process.exit(0);
    }
  } catch {
    // 生产环境不打印详细错误信息，避免泄露内部细节
    console.error('执行国际化模块时发生错误，程序已退出');
    process.exit(1);
  }
}
