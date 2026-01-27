import { Command } from 'commander';
import { input } from '@inquirer/prompts';
import XLSX from 'xlsx';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import {
  getTimestamp,
  logger,
  loggerError,
  normalizeError,
  CheckResult,
  languageToolCheck,
  getLanguageTool,
} from '../../../utils/index.js';

// 获取当前文件目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Row = (string | number | null | undefined)[];

/**
 * 国际化配置类型定义
 * defaultKey: 默认语言key
 * langs: 语言映射，key为语言标识，value为语言名称数组（支持多名称匹配）
 * longCodes: 语言长代码映射，key为语言标识，value为语言长代码
 */
interface I18nConfig {
  defaultKey: string;
  langs: Record<string, string[]>;
  longCodes: Record<string, string>;
}

/**
 * 读取并解析配置文件
 * @param configPath 配置文件路径
 * @returns I18nConfig 配置对象
 * @throws 配置文件不存在或格式错误时抛出异常
 */
function loadConfig(configPath: string): I18nConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(`配置文件不存在：${configPath}`);
  }
  const content = fs.readFileSync(configPath, { encoding: 'utf-8' });
  const json = JSON.parse(content);
  if (!json.i18n) {
    throw new Error('配置文件格式错误，缺少i18n');
  }
  if (!json.i18n.defaultKey) {
    throw new Error('配置文件格式错误，缺少i18n.defaultKey');
  }
  if (!json.i18n.langs) {
    throw new Error('配置文件格式错误，缺少i18n.langs');
  }
  if (!json.i18n.longCodes) {
    throw new Error('配置文件格式错误，缺少i18n.longCodes');
  }
  return json.i18n;
}

/**
 * 匹配excel表头列名对应的语言key，支持大小写不敏感匹配
 * 先匹配语言key本身，再匹配语言名称数组（包含关系）
 * @param colName 表头列名
 * @param langs 语言映射
 * @returns 匹配到的语言key，未匹配返回null
 */
function matchLangKey(
  colName: string,
  langs: Record<string, string[]>
): string | null {
  if (!colName) return null;
  const colNameLower = colName.toLowerCase();

  // 先尝试匹配语言key
  for (const langKey of Object.keys(langs)) {
    if (langKey.toLowerCase() === colNameLower) {
      return langKey;
    }
  }

  // 再尝试匹配语言名称（包含关系）
  for (const [langKey, names] of Object.entries(langs)) {
    if (
      names.some((name) => name && colNameLower.includes(name.toLowerCase()))
    ) {
      return langKey;
    }
  }

  return null;
}

/**
 * 去除字符串首尾的单引号或双引号
 * @param str 输入字符串
 * @returns 去除引号后的字符串
 */
function trimQuotes(str: string): string {
  if (
    (str.startsWith('"') && str.endsWith('"')) ||
    (str.startsWith("'") && str.endsWith("'"))
  ) {
    return str.slice(1, -1);
  }
  return str;
}

/**
 * 批量检测词条文本，返回所有检测结果
 * @param texts 词条数组
 * @param language 语言代码
 * @returns 检测结果数组，顺序对应输入texts
 *
 * 说明：
 * 这里将所有词条用换行符拼接成一个字符串，一次性调用语言检测接口，
 * 以减少请求次数和提升性能。
 * 返回结果数组中只包含一个元素，即合并检测的结果。
 */
async function batchCheckTexts(
  texts: string[],
  language: string
): Promise<(CheckResult | null)[]> {
  const results: (CheckResult | null)[] = [];
  try {
    // 将词条用换行符拼接，避免词条间干扰，推荐换行分隔
    const joinedText = texts.join('\n');
    const res = await languageToolCheck(joinedText, language);
    results.push(res);
  } catch (error) {
    loggerError(error, logger);
    results.push(null);
  }
  return results;
}

/**
 * excel转json功能主函数
 * 读取用户输入的excel路径，解析内容，根据配置生成多语言json文件
 * 并对配置文件中所有语言对应的词条进行语言检测
 * @param program Commander命令行实例
 */
export async function excel2json(program: Command) {
  // 配置文件默认路径
  const configPath = path.join(__dirname, '../../../../setting.json');
  let i18nConfig: I18nConfig;

  // 加载配置文件
  try {
    logger.info(`开始加载配置文件：${configPath}`);
    i18nConfig = loadConfig(configPath);
    logger.info('配置文件加载成功');
  } catch (error: unknown) {
    const msg = `读取配置文件失败：${normalizeError(error).stack}，程序已退出`;
    logger.error(msg);
    console.error('程序执行时发生异常，已记录日志，程序已退出');
    process.exit(1);
  }

  // 尝试调用接口获取支持的语言列表，更新 longCodes
  try {
    logger.info('尝试获取在线支持的语言列表...');
    const languageTools = await getLanguageTool();
    logger.info(`成功获取语言列表，覆盖配置文件中的 longCodes`);

    // 构建新的 longCodes 映射
    const newLongCodes: Record<string, string> = {};
    // 语言标识对应语言名称列表，方便匹配
    const langNameToKey: Record<string, string> = {};
    for (const [key, names] of Object.entries(i18nConfig.langs)) {
      names.forEach((name) => {
        langNameToKey[name.toLowerCase()] = key;
      });
    }

    for (const lang of languageTools) {
      // 尝试根据语言名称匹配配置中的语言key
      const lowerName = lang.name.toLowerCase();
      const matchedKey =
        langNameToKey[lowerName] ||
        Object.keys(i18nConfig.langs).find(
          (k) => k.toLowerCase() === lowerName
        );
      if (matchedKey) {
        newLongCodes[matchedKey] = lang.longCode;
      }
    }

    // 替换旧的 longCodes，保留未匹配的旧值
    i18nConfig.longCodes = { ...i18nConfig.longCodes, ...newLongCodes };
  } catch (error) {
    logger.warn(
      `获取在线语言列表失败，使用本地配置 longCodes，错误：${normalizeError(error).stack}`
    );
  }

  // 交互式输入excel文件路径并校验
  const answer = await input({
    message: '请输入excel文件路径：',
    validate: (value) => {
      const cleaned = value.trim().replace(/^['"]|['"]$/g, '');
      if (cleaned.length === 0) return '路径不能为空';
      if (!fs.existsSync(cleaned)) return '文件不存在，请输入有效路径';
      if (!/\.(xls|xlsx)$/i.test(cleaned))
        return '请输入有效的excel文件路径（.xls或.xlsx）';
      return true;
    },
  });

  // 规范化路径，支持相对路径转绝对路径，去除首尾引号
  const excelPath = path.resolve(
    process.cwd(),
    answer.trim().replace(/^['"]|['"]$/g, '')
  );

  try {
    logger.info(`开始读取excel文件：${excelPath}`);

    // 读取excel文件
    const workbook = XLSX.readFile(excelPath);
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      logger.error('excel文件没有任何工作表，程序已退出');
      console.error('程序执行时发生异常，已记录日志，程序已退出');
      process.exit(1);
    }

    // 读取第一个工作表的数据，按行读取，header=1表示返回二维数组
    const sheet = workbook.Sheets[firstSheetName];
    const rows: Row[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (rows.length < 2) {
      logger.error('工作表数据不足，至少需要两行（表头+数据），程序已退出');
      console.error('程序执行时发生异常，已记录日志，程序已退出');
      process.exit(1);
    }

    logger.info('开始解析表头');
    // 处理表头行，去除空格，转成字符串
    const headerRow = rows[0].map((cell) => (cell ? String(cell).trim() : ''));

    // 根据表头匹配语言列，建立列索引到语言key的映射
    const colIndexToLangKey: Record<number, string> = {};
    headerRow.forEach((colName, idx) => {
      const langKey = matchLangKey(colName, i18nConfig.langs);
      if (langKey) {
        colIndexToLangKey[idx] = langKey;
      }
    });

    // 获取默认语言列索引
    const defaultLang = i18nConfig.defaultKey;
    const defaultColIndex = Object.entries(colIndexToLangKey).find(
      ([, langKey]) => langKey === defaultLang
    )?.[0];

    if (defaultColIndex === undefined) {
      logger.error(`找不到默认语言列：${defaultLang}，程序已退出`);
      console.error('程序执行时发生异常，已记录日志，程序已退出');
      process.exit(1);
    }
    const defaultColNum = Number(defaultColIndex);

    // 初始化所有语言词条对象（包括默认语言）
    const langTranslations: Record<string, Record<string, string>> = {};
    Object.values(colIndexToLangKey).forEach((langKey) => {
      langTranslations[langKey] = {};
    });

    logger.info('开始解析数据行');
    // 遍历数据行，提取所有语言词条
    // key统一用默认语言列的值，其他语言对应的列为翻译内容
    const langKeysMap: Record<string, string[]> = {}; // 语言key => 词条数组
    Object.keys(langTranslations).forEach((langKey) => {
      langKeysMap[langKey] = [];
    });

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const keyCell = row[defaultColNum];
      if (keyCell === undefined || keyCell === null || keyCell === '') continue;

      let key = String(keyCell).trim();
      key = trimQuotes(key); // 去除引号

      // 跳过空key，避免写入无效数据
      if (key.length === 0) continue;

      // 默认语言的词条即key本身
      langTranslations[defaultLang][key] = key;
      langKeysMap[defaultLang].push(key);

      // 其他语言词条
      for (const [colIdxStr, langKey] of Object.entries(colIndexToLangKey)) {
        const colIdx = Number(colIdxStr);
        if (langKey === defaultLang) continue;
        const valCell = row[colIdx];
        if (valCell !== undefined && valCell !== null && valCell !== '') {
          const valStr = String(valCell);
          langTranslations[langKey][key] = valStr;
          langKeysMap[langKey].push(valStr);
        }
      }
    }

    // 对所有语言词条批量进行语言检测（包括默认语言）
    for (const [langKey, texts] of Object.entries(langKeysMap)) {
      const longCode = i18nConfig.longCodes[langKey];
      if (!longCode) {
        logger.warn(`语言(${langKey})未配置 longCode，跳过检测`);
        continue;
      }
      if (texts.length === 0) {
        logger.info(`语言(${langKey})无词条，跳过检测`);
        continue;
      }

      logger.info(
        `开始对语言(${langKey})词条进行语言检测，词条数量：${texts.length}`
      );

      const checkResults = await batchCheckTexts(texts, longCode);

      if (!checkResults || checkResults.length === 0 || !checkResults[0]) {
        logger.error(`语言(${langKey})词条检测失败`);
        continue;
      }

      const result = checkResults[0];
      if (result.matches.length === 0) {
        logger.info(`语言(${langKey})词条检测无错误`);
      } else {
        logger.info(
          `语言(${langKey})词条检测发现问题，词条数量: ${result.matches.length}`
        );
        for (const match of result.matches) {
          logger.info(
            `- 错误: ${match.message}\n  出错句子: ${match.sentence}\n  建议替换: ${match.replacements
              .map((r) => r.value)
              .join(', ')}`
          );
        }
      }
    }

    // 输出目录：excel文件所在目录下的“lang_时间戳”文件夹
    const excelDir = path.dirname(excelPath);
    const timestamp = getTimestamp();
    const outputRoot = path.join(excelDir, `lang_${timestamp}`);
    if (!fs.existsSync(outputRoot)) {
      fs.mkdirSync(outputRoot, { recursive: true });
    }

    logger.info(`开始生成语言文件，输出目录：${outputRoot}`);

    // 按语言生成对应的json文件，默认语言的key=value不生成文件
    for (const [langKey, translations] of Object.entries(langTranslations)) {
      if (Object.keys(translations).length === 0) continue;

      if (langKey === defaultLang) {
        logger.info(`跳过默认语言(${langKey})的json文件生成`);
        continue; // 跳过默认语言文件生成
      }

      const langDir = path.join(outputRoot, langKey);
      if (!fs.existsSync(langDir)) {
        fs.mkdirSync(langDir, { recursive: true });
      }

      const filePath = path.join(langDir, 'translate.json');
      fs.writeFileSync(filePath, JSON.stringify(translations, null, 2), {
        encoding: 'utf-8',
      });
      logger.info(`已生成语言文件：${filePath}`);
    }

    logger.info('全部转换完成', true);
  } catch (error: unknown) {
    // 记录错误日志，方便排查
    loggerError(error, logger);
    console.error('程序执行时发生异常，已记录日志，程序已退出');
    process.exit(1);
  }
}
