import { Command } from 'commander';
import { select, Separator } from '@inquirer/prompts';
import { excel2json } from './excel2json/index.js';

export async function i18n(program: Command) {
  try {
    const answer = await select({
      message: '请选择要执行的功能:',
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
        new Separator(),
      ],
      default: 'extractEntry',
      pageSize: 10,
      loop: true,
    });

    switch (answer) {
      case 'excel2json':
        await excel2json(program);
        break;
      default:
        console.log(`功能【${answer}】暂未实现或未选择，程序退出。`);
        break;
    }
  } catch (error) {
    console.error(
      '执行国际化模块时发生错误:',
      error instanceof Error ? error.stack || error.message : error
    );
  }
}
