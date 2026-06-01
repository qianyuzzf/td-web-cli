import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { input } from '@inquirer/prompts';
import {
  logger,
  loggerError,
  normalizeGitBashPath,
  readJsonFile,
  writeJsonFile,
  mergeJsonObjects,
  getJsonFilesInLangDir,
  validatePathInput,
} from '../../../utils/index.js';

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
      validate: validatePathInput,
    });

    // 交互输入待合并目录路径
    const mergeDir = await input({
      message:
        '请输入待合并JSON文件夹路径（含语言子文件夹，如cn/translate.json）：',
      validate: validatePathInput,
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
        logger.info(`语言【${langKey}】下没有共同的JSON文件，跳过`, true);
        continue;
      }

      logger.info(
        `发现 ${commonJsonFiles.length} 个共同JSON文件: ${commonJsonFiles.join(
          ', '
        )}`,
        true
      );

      // 逐个文件合并
      for (const jsonFile of commonJsonFiles) {
        logger.info(`处理文件: ${jsonFile}`, true);

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

        // 打印合并前后键数量
        const srcKeyCount = Object.keys(srcJson).length;
        const mergeKeyCount = Object.keys(mergeJson).length;
        logger.info(
          `源文件键数: ${srcKeyCount}, 合并文件键数: ${mergeKeyCount}`,
          true
        );

        const merged = await mergeJsonObjects(srcJson, mergeJson, langKey);

        const finalKeyCount = Object.keys(merged).length;
        logger.info(`合并后键数: ${finalKeyCount}`, true);

        writeJsonFile(srcFile, merged);

        logger.info(`文件 ${jsonFile} 合并完成`, true);
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
