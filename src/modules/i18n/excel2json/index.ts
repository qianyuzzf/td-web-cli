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
  formatKey,
} from '../../../utils/index.js';

// 获取当前文件目录
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type Row = (string | number | null | undefined)[];

/**
 * 国际化配置类型定义
 * defaultKey: 默认语言KEY
 * langs: 语言映射，KEY为语言标识，VALUE为语言名称数组（支持多名称匹配）
 * longCodes: 语言长代码映射，KEY为语言标识，VALUE为语言长代码
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
 * 匹配Excel表头列名对应的语言KEY，支持大小写不敏感匹配
 * 先匹配语言KEY本身，再匹配语言名称数组（包含关系）
 * @param colName 表头列名
 * @param langs 语言映射
 * @returns 匹配到的语言KEY，未匹配返回null
 */
function matchLangKey(
  colName: string,
  langs: Record<string, string[]>
): string | null {
  if (!colName) return null;
  const colNameLower = colName.toLowerCase();

  // 先尝试匹配语言KEY
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
 * 将语言检测结果转换成每条词条对应的错误描述数组
 * @param checkResult 语言检测结果
 * @param texts 词条数组（对应检测文本）
 * @returns 按词条分割的检测错误描述数组，顺序对应输入texts
 */
function parseCheckResultPerEntry(
  checkResult: CheckResult,
  texts: string[]
): string[] {
  // 初始化每条词条对应的错误信息数组
  const entryErrors = new Array(texts.length).fill('').map(() => '');

  // 语言检测返回的matches是针对整个拼接文本的，需要拆分到对应词条
  // 计算每条词条在拼接文本中的起始位置和结束位置
  const positions: { start: number; end: number }[] = [];
  let pos = 0;
  for (const text of texts) {
    const len = text.length;
    positions.push({ start: pos, end: pos + len });
    pos += len + 1; // +1是换行符长度
  }

  // 遍历所有错误匹配项，将错误信息分配到对应词条
  for (const match of checkResult.matches) {
    const errorOffset = match.offset;
    // 找出错误所在的词条索引
    const idx = positions.findIndex(
      (range) => errorOffset >= range.start && errorOffset < range.end
    );
    if (idx === -1) continue;

    // 生成错误信息字符串
    const errMsg = `错误: ${match.message}\n出错句子: ${match.sentence}\n建议替换: ${match.replacements
      .map((r) => r.value)
      .join(', ')}`;

    // 多条错误用换行分隔
    if (entryErrors[idx]) {
      entryErrors[idx] += '\n' + errMsg;
    } else {
      entryErrors[idx] = errMsg;
    }
  }

  return entryErrors;
}

/**
 * Excel转JSON功能主函数
 * 读取用户输入的Excel路径，解析内容，根据配置生成多语言JSON文件
 * 并对配置文件中所有语言对应的词条进行语言检测
 * 如果有相同的JSON KEY，则在KEY前面加上6位编码，保证唯一性
 * @param program Commander命令行实例
 */
export async function excel2json(program: Command) {
  // 配置文件默认路径
  const configPath = path.join(__dirname, '../../../../setting.json');
  let i18nConfig: I18nConfig;

  // 加载配置文件
  try {
    logger.info(`开始加载配置文件：${configPath}`, true);
    i18nConfig = loadConfig(configPath);
    logger.info('配置文件加载成功', true);
  } catch (error: unknown) {
    const msg = `读取配置文件失败：${normalizeError(error).stack}，程序已退出`;
    logger.error(msg);
    console.error('程序执行时发生异常，已记录日志，程序已退出');
    process.exit(1);
  }

  // 尝试调用接口获取支持的语言列表，更新 longCodes
  try {
    logger.info('尝试获取在线支持的语言列表...', true);
    const languageTools = await getLanguageTool();
    logger.info(`成功获取语言列表，覆盖配置文件中的 longCodes`, true);

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
      // 尝试根据语言名称匹配配置中的语言KEY
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
    console.warn('获取在线语言列表失败，使用本地配置 longCodes');
  }

  // 交互式输入Excel文件路径并校验
  const answer = await input({
    message: '请输入Excel文件路径：',
    validate: (value) => {
      const cleaned = value.trim().replace(/^['"]|['"]$/g, '');
      if (cleaned.length === 0) return '路径不能为空';
      if (!fs.existsSync(cleaned)) return '文件不存在，请输入有效路径';
      if (!/\.(xls|xlsx)$/i.test(cleaned))
        return '请输入有效的Excel文件路径（.xls或.xlsx）';
      return true;
    },
  });

  // 规范化路径，支持相对路径转绝对路径，去除首尾引号
  const excelPath = path.resolve(
    process.cwd(),
    answer.trim().replace(/^['"]|['"]$/g, '')
  );

  try {
    logger.info(`开始读取Excel文件：${excelPath}`, true);

    // 读取Excel文件
    const workbook = XLSX.readFile(excelPath);
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      logger.error('Excel文件没有任何工作表，程序已退出');
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

    logger.info('开始解析表头', true);
    // 处理表头行，去除空格，转成字符串
    const headerRow = rows[0].map((cell) => (cell ? String(cell).trim() : ''));

    // 根据表头匹配语言列，建立列索引到语言KEY的映射
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
    // 用于存储最终的翻译KEY-VALUE对，KEY可能会被重新编码以避免重复
    const langTranslations: Record<string, Record<string, string>> = {};
    Object.values(colIndexToLangKey).forEach((langKey) => {
      langTranslations[langKey] = {};
    });

    logger.info('开始解析数据行', true);

    // 记录所有出现过的KEY，检测重复，格式：langKey => Set of keys
    const langKeySets: Record<string, Set<string>> = {};
    Object.keys(langTranslations).forEach((langKey) => {
      langKeySets[langKey] = new Set();
    });

    // 遍历数据行，提取所有语言词条
    // KEY统一用默认语言列的值，其他语言对应的列为翻译内容
    const langKeysMap: Record<string, string[]> = {}; // 语言KEY => 词条数组（用于检测）
    Object.keys(langTranslations).forEach((langKey) => {
      langKeysMap[langKey] = [];
    });

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      let keyCell = row[defaultColNum];
      if (keyCell === undefined || keyCell === null || keyCell === '') continue;

      let key = String(keyCell).trim();
      key = trimQuotes(key); // 去除引号

      // 跳过空KEY，避免写入无效数据
      if (key.length === 0) continue;

      // 判断默认语言KEY是否重复，若重复则重新编码
      if (langKeySets[defaultLang].has(key)) {
        key = formatKey(key);
      }
      langKeySets[defaultLang].add(key);

      // 默认语言的词条即KEY本身
      langTranslations[defaultLang][key] = key;
      langKeysMap[defaultLang].push(key);

      // 其他语言词条
      for (const [colIdxStr, langKey] of Object.entries(colIndexToLangKey)) {
        const colIdx = Number(colIdxStr);
        if (langKey === defaultLang) continue;
        const valCell = row[colIdx];
        if (valCell !== undefined && valCell !== null && valCell !== '') {
          const valStr = String(valCell);

          // 判断该语言的KEY是否重复，若重复则重新编码KEY
          let finalKey = key;
          if (langKeySets[langKey].has(finalKey)) {
            finalKey = formatKey(finalKey);
          }
          langKeySets[langKey].add(finalKey);

          langTranslations[langKey][finalKey] = valStr;
          langKeysMap[langKey].push(valStr);
        } else {
          // 确保检测结果数组长度一致，填空字符串
          langKeysMap[langKey].push('');
        }
      }
    }

    // 语言检测结果映射，语言KEY => 每条词条的错误描述数组
    const langCheckErrorsMap: Record<string, string[]> = {};

    // 对所有语言词条批量进行语言检测（包括默认语言）
    const langKeysEntries = Object.entries(langKeysMap);
    for (let idx = 0; idx < langKeysEntries.length; idx++) {
      const [langKey, texts] = langKeysEntries[idx];
      const longCode = i18nConfig.longCodes[langKey];
      if (!longCode) {
        logger.warn(`语言(${langKey})未配置 longCode，跳过检测`, true);
        langCheckErrorsMap[langKey] =
          texts.length > 0 ? texts.map(() => '') : [];
        continue;
      }
      if (texts.length === 0) {
        logger.info(`语言(${langKey})无词条，跳过检测`, true);
        langCheckErrorsMap[langKey] = [];
        continue;
      }

      logger.info(
        `开始对语言(${langKey})词条进行语言检测，词条数量：${texts.length} (${idx + 1}/${
          langKeysEntries.length
        })`,
        true
      );

      const checkResults = await batchCheckTexts(texts, longCode);

      if (!checkResults || checkResults.length === 0 || !checkResults[0]) {
        logger.error(`语言(${langKey})词条检测失败`, true);
        langCheckErrorsMap[langKey] = texts.map(() => '');
        continue;
      }

      const result = checkResults[0];
      if (result.matches.length === 0) {
        logger.info(`语言(${langKey})词条检测无错误`, true);
        langCheckErrorsMap[langKey] = texts.map(() => '');
      } else {
        logger.info(
          `语言(${langKey})词条检测发现问题，词条数量: ${result.matches.length}`,
          true
        );
        // 解析检测结果，拆分到每条词条
        langCheckErrorsMap[langKey] = parseCheckResultPerEntry(result, texts);

        // 详细日志输出
        for (const match of result.matches) {
          logger.info(
            `- 错误: ${match.message}\n  出错句子: ${match.sentence}\n  建议替换: ${match.replacements
              .map((r) => r.value)
              .join(', ')}`
          );
        }
      }
    }

    // 输出目录：Excel文件所在目录下的“lang_时间戳”文件夹
    const excelDir = path.dirname(excelPath);
    const timestamp = getTimestamp();
    const outputRoot = path.join(excelDir, `lang_${timestamp}`);
    if (!fs.existsSync(outputRoot)) {
      fs.mkdirSync(outputRoot, { recursive: true });
    }

    logger.info(`开始生成语言文件，输出目录：${outputRoot}`, true);

    // 按语言生成对应的JSON文件，默认语言的KEY=VALUE不生成文件
    for (const [langKey, translations] of Object.entries(langTranslations)) {
      if (Object.keys(translations).length === 0) continue;

      if (langKey === defaultLang) {
        logger.info(`跳过默认语言(${langKey})的JSON文件生成`, true);
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
      logger.info(`已生成语言文件：${filePath}`, true);
    }

    // 生成语言检测结果Excel文件
    logger.info('开始生成语言检测结果Excel文件', true);

    // 构造检测结果Excel的表头：默认语言列 + 其他语言列（对应原文列名）
    // 这里表头用原Excel的表头中对应语言列的值
    const errorSheetHeader: string[] = [];

    // 按列索引顺序遍历，匹配语言KEY，构造表头
    Object.entries(colIndexToLangKey)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .forEach(([colIdxStr, langKey]) => {
        const colIdx = Number(colIdxStr);
        // 表头为原Excel表头中对应列的文字
        errorSheetHeader.push(headerRow[colIdx]);
      });

    // 构造检测结果Excel的内容，每一列对应语言检测错误描述
    // 每行对应原Excel中一条数据行
    const dataRowCount = rows.length - 1;
    const errorSheetData: (string | null)[][] = [errorSheetHeader];

    for (let i = 0; i < dataRowCount; i++) {
      const rowErrors: (string | null)[] = [];

      // 按列索引顺序遍历，填充对应语言的检测错误
      Object.entries(colIndexToLangKey)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .forEach(([colIdxStr, langKey]) => {
          const errorsArr = langCheckErrorsMap[langKey];
          if (errorsArr && errorsArr.length > i) {
            // 只展示检测错误，空字符串视为空白
            const err = errorsArr[i]?.trim();
            rowErrors.push(err && err.length > 0 ? err : '');
          } else {
            rowErrors.push('');
          }
        });

      errorSheetData.push(rowErrors);
    }

    // 生成Excel工作簿和工作表
    const errorWorkbook = XLSX.utils.book_new();
    const errorSheet = XLSX.utils.aoa_to_sheet(errorSheetData);
    XLSX.utils.book_append_sheet(
      errorWorkbook,
      errorSheet,
      'LanguageCheckResults'
    );

    // 写入检测结果Excel文件，固定文件名 lang_check_results.xlsx
    const errorExcelPath = path.join(outputRoot, `lang_check_results.xlsx`);
    XLSX.writeFile(errorWorkbook, errorExcelPath);

    logger.info(`语言检测结果Excel文件已生成：${errorExcelPath}`, true);

    // 最终完成提示，包含输出目录
    logger.info(`全部转换完成，语言文件输出目录：${outputRoot}`, true);
  } catch (error: unknown) {
    // 记录错误日志，方便排查
    loggerError(error, logger);
    console.error('程序执行时发生异常，已记录日志，程序已退出');
    process.exit(1);
  }
}
