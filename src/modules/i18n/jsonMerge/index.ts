import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { input, select, Separator } from '@inquirer/prompts';
import {
  logger,
  loggerError,
  normalizeError,
  normalizeGitBashPath,
} from '../../../utils/index.js';

/**
 * 读取JSON文件内容，返回对象，文件不存在返回空对象
 * @param filePath JSON文件路径
 * @returns 解析后的对象，出错或不存在返回空对象
 */
function readJsonFile(filePath: string): Record<string, any> {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    logger.error(
      `读取JSON文件失败: ${filePath}，错误: ${normalizeError(error).message}`
    );
    return {};
  }
}

/**
 * 写入JSON文件，格式化缩进2格
 * @param filePath 写入文件路径
 * @param data 写入的对象数据
 */
function writeJsonFile(filePath: string, data: Record<string, any>) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * 合并两个JSON对象，检测重复key，重复时通过交互让用户选择保留哪个值
 * @param baseObj 源JSON对象（被合并到此对象）
 * @param mergeObj 待合并JSON对象
 * @param langKey 当前语言标识，用于日志提示
 * @returns 合并后的JSON对象
 */
async function mergeJsonObjects(
  baseObj: Record<string, any>,
  mergeObj: Record<string, any>,
  langKey: string
): Promise<Record<string, any>> {
  const entries = Object.entries(mergeObj);

  for (const [key, val] of entries) {
    if (key in baseObj) {
      if (baseObj[key] === val) {
        // 值相同，无需处理，继续下一个键
        continue;
      }

      // 值不同，需要用户交互选择保留哪个值
      logger.info(`发现冲突: 键【${key}】`, true);
      const choice = await select({
        message: `请选择要保留的值：`,
        choices: [
          { name: `源文件值: ${baseObj[key]}`, value: 'base' },
          { name: `合并文件值: ${val}`, value: 'merge' },
          new Separator(),
        ],
        default: 'base',
        pageSize: 10,
        loop: true,
      });

      if (choice === 'merge') {
        baseObj[key] = val;
      }
      // 如果选择保留base，则保持不变
    } else {
      // 新键，直接添加
      baseObj[key] = val;
    }
  }

  return baseObj;
}

/**
 * 获取指定语言文件夹下的所有JSON文件名列表
 * @param dirPath 语言文件夹路径
 * @returns JSON文件名数组
 */
function getJsonFilesInLangDir(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs.readdirSync(dirPath).filter((fileName) => {
    const fullPath = path.join(dirPath, fileName);
    return fs.statSync(fullPath).isFile() && fileName.endsWith('.json');
  });
}

/**
 * 主函数：合并两个目录下相同语言文件夹的JSON文件
 * @param program commander命令行实例（暂未使用，可扩展）
 */
export async function jsonMerge(program: Command) {
  try {
    // 交互输入源目录路径
    const srcDir = await input({
      message:
        '请输入源JSON文件夹路径（含语言子文件夹，如cn/translate.json）：',
      validate: (value) => {
        const cleaned = value.trim().replace(/^['"]|['"]$/g, '');
        if (cleaned.length === 0) {
          return '路径不能为空';
        }

        const normalizedPath = normalizeGitBashPath(cleaned);

        if (!fs.existsSync(normalizedPath)) {
          return '文件不存在，请输入有效路径';
        }

        return true;
      },
    });

    // 交互输入待合并目录路径
    const mergeDir = await input({
      message:
        '请输入待合并JSON文件夹路径（含语言子文件夹，如cn/translate.json）：',
      validate: (value) => {
        const cleaned = value.trim().replace(/^['"]|['"]$/g, '');
        if (cleaned.length === 0) {
          return '路径不能为空';
        }

        const normalizedPath = normalizeGitBashPath(cleaned);

        if (!fs.existsSync(normalizedPath)) {
          return '文件不存在，请输入有效路径';
        }

        return true;
      },
    });

    const srcPath = normalizeGitBashPath(srcDir);
    const mergePath = normalizeGitBashPath(mergeDir);

    logger.info(`源目录: ${srcPath}`);
    logger.info(`合并目录: ${mergePath}`);

    // 获取两个目录下的一级语言子文件夹列表
    const srcLangDirs = fs.readdirSync(srcPath).filter((f) => {
      const fullPath = path.join(srcPath, f);
      return fs.statSync(fullPath).isDirectory();
    });

    const mergeLangDirs = fs.readdirSync(mergePath).filter((f) => {
      const fullPath = path.join(mergePath, f);
      return fs.statSync(fullPath).isDirectory();
    });

    // 找出两个目录下都存在的语言文件夹
    const commonLangDirs = srcLangDirs.filter((lang) =>
      mergeLangDirs.includes(lang)
    );

    if (commonLangDirs.length === 0) {
      logger.info('没有发现相同语言文件夹，无需合并');
      return;
    }

    logger.info(
      `发现 ${commonLangDirs.length} 个共同语言文件夹: ${commonLangDirs.join(
        ', '
      )}`,
      true
    );

    // 遍历每个共同语言文件夹进行合并
    for (const langKey of commonLangDirs) {
      logger.info(`${'='.repeat(60)}`, true);
      logger.info(`处理语言: ${langKey}`, true);

      const srcLangPath = path.join(srcPath, langKey);
      const mergeLangPath = path.join(mergePath, langKey);

      const srcJsonFiles = getJsonFilesInLangDir(srcLangPath);
      const mergeJsonFiles = getJsonFilesInLangDir(mergeLangPath);

      // 找出两个语言文件夹中共同存在的JSON文件
      const commonJsonFiles = srcJsonFiles.filter((file) =>
        mergeJsonFiles.includes(file)
      );

      if (commonJsonFiles.length === 0) {
        logger.info(`语言【${langKey}】下没有共同的JSON文件，跳过`);
        continue;
      }

      logger.info(
        `发现 ${commonJsonFiles.length} 个共同JSON文件: ${commonJsonFiles.join(
          ', '
        )}`
      );

      // 逐个文件合并
      for (const jsonFile of commonJsonFiles) {
        logger.info(`处理文件: ${jsonFile}`);

        const srcFile = path.join(srcLangPath, jsonFile);
        const mergeFile = path.join(mergeLangPath, jsonFile);

        if (!fs.existsSync(srcFile)) {
          logger.warn(`源目录语言文件缺失: ${srcFile}，跳过`, true);
          continue;
        }
        if (!fs.existsSync(mergeFile)) {
          logger.warn(`合并目录语言文件缺失: ${mergeFile}，跳过`, true);
          continue;
        }

        logger.info(`开始合并文件 ${jsonFile}...`, true);

        const srcJson = readJsonFile(srcFile);
        const mergeJson = readJsonFile(mergeFile);

        const merged = await mergeJsonObjects(srcJson, mergeJson, langKey);

        writeJsonFile(srcFile, merged);

        logger.info(`文件 ${jsonFile} 合并完成`);
      }

      logger.info(`语言【${langKey}】全部处理完成`, true);
    }

    logger.info(`${'='.repeat(60)}`, true);
    logger.info(`所有合并操作完成!`, true);
    logger.info(`源目录: ${srcPath}`, true);
    logger.info(`合并目录: ${mergePath}`, true);
    logger.info(`所有修改已写回源目录`, true);
  } catch (error: unknown) {
    loggerError(error, logger);
    console.error('程序执行时发生异常，已记录日志，程序已退出');
    process.exit(1);
  }
}
