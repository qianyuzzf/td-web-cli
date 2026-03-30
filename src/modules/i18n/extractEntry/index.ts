import { Command } from 'commander';
import { input, select, confirm, Separator } from '@inquirer/prompts';
import XLSX from 'xlsx';
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { minimatch } from 'minimatch';
import {
  getTimestamp,
  logger,
  loggerError,
  normalizeError,
  normalizeGitBashPath,
} from '../../../utils/index.js';

// AST 解析相关
import babelParser from '@babel/parser';
import traverse from '@babel/traverse';
import { parse as vueParse } from '@vue/compiler-sfc';
import { parse as htmlParse } from 'node-html-parser';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 支持的文件扩展名
const SUPPORTED_EXTENSIONS = [
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.vue',
  '.html',
  '.htm',
];

// 国际化配置接口
interface I18nConfig {
  defaultKey: string;
  langs: Record<string, string[]>;
}

/**
 * 检查字符串是否包含汉字（使用 Unicode 属性转义，匹配所有汉字）
 */
function containsChinese(text: string): boolean {
  const hanRegex = /\p{Script=Han}/u;
  return hanRegex.test(text);
}

/**
 * 读取并解析配置文件
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
  return json.i18n;
}

/**
 * 从表达式中提取字符串字面量（支持单引号、双引号、模板字符串）
 */
function extractStringsFromExpression(expr: string): Set<string> {
  const strings = new Set<string>();
  const stringRegex = /(["'])(?:(?=(\\?))\2.)*?\1|`([^`\\]*(?:\\.[^`\\]*)*)`/g;
  let match: any;
  while ((match = stringRegex.exec(expr)) !== null) {
    let str = match[0];
    if (str.startsWith('"') || str.startsWith("'")) {
      str = str.slice(1, -1);
    } else if (str.startsWith('`')) {
      str = str.slice(1, -1);
    }
    str = str.replace(/\\(.)/g, '$1');
    if (str && containsChinese(str)) {
      strings.add(str.trim());
    }
  }
  return strings;
}

/**
 * 使用 Babel AST 从 JavaScript/TypeScript/JSX 代码中提取包含中文的字符串
 * 注意：Babel 解析时会自动忽略注释，因此注释中的中文不会被提取
 */
function extractFromJS(code: string): Set<string> {
  const strings = new Set<string>();
  const ast = babelParser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  });

  traverse.default(ast, {
    StringLiteral(path: any) {
      const text = path.node.value;
      if (text && containsChinese(text)) {
        strings.add(text.trim());
      }
    },
    TemplateLiteral(path: any) {
      const text = path.node.quasis.map((elem: any) => elem.value.raw).join('');
      if (text && containsChinese(text)) {
        strings.add(text.trim());
      }
    },
    JSXText(path: any) {
      const text = path.node.value;
      if (text && containsChinese(text)) {
        strings.add(text.trim());
      }
    },
    JSXAttribute(path: any) {
      const value = path.node.value;
      if (
        value &&
        value.type === 'StringLiteral' &&
        containsChinese(value.value)
      ) {
        strings.add(value.value.trim());
      }
    },
  });
  return strings;
}

/**
 * 使用 @vue/compiler-sfc 解析 Vue 单文件组件
 */
function extractFromVue(content: string): Set<string> {
  const strings = new Set<string>();
  const { descriptor } = vueParse(content);

  // 处理 script 部分（注释已被 Babel 解析忽略）
  if (descriptor.script || descriptor.scriptSetup) {
    const scriptContent =
      descriptor.script?.content || descriptor.scriptSetup?.content || '';
    if (scriptContent) {
      try {
        const scriptStrings = extractFromJS(scriptContent);
        scriptStrings.forEach((s) => strings.add(s));
      } catch (err) {
        logger.warn(
          `解析 Vue script 失败，跳过该脚本内容: ${normalizeError(err).message}`
        );
      }
    }
  }

  // 处理 template 部分
  if (descriptor.template) {
    // 移除 HTML 注释，避免提取注释中的中文
    let templateContent = descriptor.template.content;
    templateContent = templateContent.replace(/<!--[\s\S]*?-->/g, '');

    // 1. 提取文本节点中的中文
    const textRegex = />([^<]+)</g;
    let match: any;
    while ((match = textRegex.exec(templateContent)) !== null) {
      let text = match[1].trim();
      if (text && containsChinese(text)) {
        if (!text.startsWith('{{') && !text.endsWith('}}')) {
          strings.add(text);
        } else {
          const expr = text.slice(2, -2).trim();
          const exprStrings = extractStringsFromExpression(expr);
          exprStrings.forEach((s) => strings.add(s));
        }
      }
    }

    // 2. 提取静态属性值中的中文
    const attrRegex = /\w+\s*=\s*["']([^"']*)["']/g;
    while ((match = attrRegex.exec(templateContent)) !== null) {
      const text = match[1].trim();
      if (text && containsChinese(text)) {
        strings.add(text);
      }
    }

    // 3. 匹配动态绑定中的字符串字面量
    const dynamicBindRegex =
      /:(?:[a-zA-Z_][a-zA-Z0-9_-]*)\s*=\s*["']([^"']*)["']|v-bind:[a-zA-Z_][a-zA-Z0-9_-]*\s*=\s*["']([^"']*)["']/g;
    while ((match = dynamicBindRegex.exec(templateContent)) !== null) {
      const value = match[1] || match[2];
      if (value) {
        const exprStrings = extractStringsFromExpression(value);
        exprStrings.forEach((s) => strings.add(s));
      }
    }

    // 4. 处理插值表达式
    const interpolationRegex = /{{([^}]+)}}/g;
    while ((match = interpolationRegex.exec(templateContent)) !== null) {
      const expr = match[1].trim();
      const exprStrings = extractStringsFromExpression(expr);
      exprStrings.forEach((s) => strings.add(s));
    }
  }
  return strings;
}

/**
 * 使用 node-html-parser 解析 HTML 文件
 * 注意：HTML 注释节点（nodeType 8）会被自动忽略，因此注释中的中文不会被提取
 */
function extractFromHTML(html: string): Set<string> {
  const strings = new Set<string>();
  const root = htmlParse(html);

  function walk(node: any) {
    if (node.nodeType === 3) {
      // 文本节点
      const text = node.text;
      if (text && typeof text === 'string') {
        const trimmed = text.trim();
        if (trimmed && containsChinese(trimmed)) {
          strings.add(trimmed);
        }
      }
    } else if (node.nodeType === 1) {
      // 元素节点
      const tagName = node.tagName;
      if (tagName && typeof tagName === 'string') {
        const lowerTag = tagName.toLowerCase();
        if (lowerTag === 'script') {
          const scriptContent = node.text;
          if (scriptContent && typeof scriptContent === 'string') {
            try {
              const scriptStrings = extractFromJS(scriptContent);
              scriptStrings.forEach((s) => strings.add(s));
            } catch (err) {
              logger.warn(`解析内联脚本失败: ${normalizeError(err).message}`);
            }
          }
          return;
        }
        if (lowerTag === 'style') {
          return;
        }
      }

      if (node.attributes) {
        for (const [attrName, attrValue] of Object.entries(node.attributes)) {
          if (
            attrValue &&
            typeof attrValue === 'string' &&
            containsChinese(attrValue)
          ) {
            strings.add(attrValue.trim());
          }
        }
      }

      if (node.childNodes) {
        node.childNodes.forEach((child: any) => walk(child));
      }
    }
    // 注释节点（nodeType 8）不处理，直接忽略
  }

  walk(root);
  return strings;
}

/**
 * 根据文件扩展名选择合适的提取方法
 */
function extractEntryFromFile(filePath: string, content: string): Set<string> {
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) {
      return extractFromJS(content);
    } else if (ext === '.vue') {
      return extractFromVue(content);
    } else if (['.html', '.htm'].includes(ext)) {
      return extractFromHTML(content);
    }
  } catch (err) {
    logger.warn(
      `解析文件失败（已跳过）: ${filePath} - ${normalizeError(err).message}`
    );
  }
  return new Set();
}

/**
 * 递归获取目录下所有匹配的文件路径
 * @param dir 当前扫描目录
 * @param extensions 要匹配的文件扩展名
 * @param ignorePatterns 要忽略的路径模式（支持 glob 通配符，可匹配目录和文件）
 * @param rootDir 项目根目录，用于计算相对路径
 */
function getFiles(
  dir: string,
  extensions: string[],
  ignorePatterns: string[],
  rootDir: string
): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const item of list) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    // 计算相对于根目录的路径，用于匹配忽略模式
    const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

    if (stat.isDirectory()) {
      // 检查目录是否匹配任何忽略模式
      const shouldIgnore = ignorePatterns.some((pattern) =>
        minimatch(relativePath, pattern, { dot: true, matchBase: true })
      );
      if (shouldIgnore) {
        continue;
      }
      // 递归扫描子目录
      results = results.concat(
        getFiles(fullPath, extensions, ignorePatterns, rootDir)
      );
    } else {
      const ext = path.extname(item).toLowerCase();
      if (extensions.includes(ext)) {
        // 检查文件是否匹配任何忽略模式
        const shouldIgnore = ignorePatterns.some((pattern) =>
          minimatch(relativePath, pattern, { dot: true, matchBase: true })
        );
        if (!shouldIgnore) {
          results.push(fullPath);
        }
      }
    }
  }
  return results;
}

/**
 * 验证 glob 模式是否有效
 */
function isValidGlobPattern(pattern: string): boolean {
  try {
    // 使用 minimatch 尝试创建正则表达式，如果模式无效会抛出异常
    minimatch.makeRe(pattern, { dot: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * 提取前端项目词条主函数
 */
export async function extractEntry(program: Command) {
  const configPath = path.join(__dirname, '../../../../setting.json');
  let i18nConfig: I18nConfig;

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

  // 1. 输入项目根目录
  const answer = await input({
    message: '请输入项目根目录：',
    validate: (value) => {
      const cleaned = value.trim().replace(/^['"]|['"]$/g, '');
      if (cleaned.length === 0) {
        return '路径不能为空';
      }
      const normalizedPath = normalizeGitBashPath(cleaned);
      if (!fs.existsSync(normalizedPath)) {
        return '目录不存在，请输入有效路径';
      }
      if (!fs.statSync(normalizedPath).isDirectory()) {
        return '请输入一个目录路径';
      }
      return true;
    },
  });
  const rootDir = normalizeGitBashPath(answer);

  // 2. 交互式配置忽略模式（支持目录和文件，使用 glob 通配符）
  const defaultPatterns = [
    'node_modules',
    '.git',
    'dist',
    'build',
    'public',
    'src/components/protocol',
    'src/phone-repeater',
    'src/phone/src/plugins',
    'src/assets/lang',
    'build-all.js',
  ];
  const useDefault = await confirm({
    message:
      '是否使用默认忽略模式？默认模式会忽略 node_modules, .git, dist, build, public, src/components/protocol, src/phone-repeater, src/phone/src/plugins, src/assets/lang, build-all.js 及其所有子目录',
    default: true,
  });

  let ignorePatterns: string[] = defaultPatterns;
  if (!useDefault) {
    const customInput = await input({
      message:
        '请输入自定义忽略模式，多个模式用英文逗号分隔。支持 glob 通配符，可忽略目录或文件。\n（直接回车表示不忽略任何内容）\n示例：node_modules,dist/**,build/**,*.log,config.js',
      validate: (value) => {
        // 将输入中的反斜杠统一替换为正斜杠
        const normalizedValue = value.replace(/\\/g, '/');
        const trimmed = normalizedValue.trim();
        // 空字符串表示不忽略，直接通过
        if (!trimmed) {
          return true;
        }
        // 分割并过滤空字符串
        const patterns = trimmed
          .split(',')
          .map((p) => p.trim())
          .filter((p) => p);
        if (patterns.length === 0) {
          return true; // 实际上已经过滤，但保留空处理
        }
        // 校验每个模式的有效性
        for (const pattern of patterns) {
          if (!isValidGlobPattern(pattern)) {
            return `无效的 glob 模式："${pattern}"，请使用正确的通配符格式。`;
          }
        }
        return true;
      },
    });
    // 将用户输入中的反斜杠统一替换为正斜杠，确保模式统一
    const normalizedCustomInput = customInput.replace(/\\/g, '/');
    if (normalizedCustomInput.trim()) {
      const patterns = normalizedCustomInput
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p);
      ignorePatterns = patterns;
      logger.info(`自定义忽略模式：${ignorePatterns.join(', ')}`, true);
    } else {
      ignorePatterns = [];
      logger.info('未设置任何忽略模式，将扫描所有文件', true);
    }
  } else {
    logger.info(`使用默认忽略模式：${defaultPatterns.join(', ')}`, true);
  }

  // 3. 选择目标语言
  const langChoices = Object.entries(i18nConfig.langs).map(([key, names]) => ({
    name: names[0],
    value: key,
  }));

  const selectedLangKey = await select({
    message: '请选择需要提取的目标语言（将生成该语言对应的翻译列）',
    choices: [
      ...langChoices,
      new Separator(), // 分割线，方便未来扩展更多功能
    ],
    default: i18nConfig.defaultKey,
    loop: true, // 是否循环滚动选项
  });
  const targetLangName =
    i18nConfig.langs[selectedLangKey]?.[0] || selectedLangKey;

  try {
    logger.info(`开始扫描目录：${rootDir}`, true);
    const files = getFiles(
      rootDir,
      SUPPORTED_EXTENSIONS,
      ignorePatterns,
      rootDir
    );
    logger.info(`共找到 ${files.length} 个待扫描文件`, true);

    // 记录每个文件路径下的所有词条
    const fileToTermsMap = new Map<string, string[]>();
    let fileCount = 0;
    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        const strings = extractEntryFromFile(file, content);
        if (strings.size > 0) {
          const relativePath = path.relative(rootDir, file).replace(/\\/g, '/');
          const terms = Array.from(strings).sort();
          fileToTermsMap.set(relativePath, terms);
        }
        fileCount++;
        if (fileCount % 100 === 0) {
          logger.info(
            `已处理 ${fileCount} 个文件，当前累计有词条的文件数：${fileToTermsMap.size}`,
            true
          );
        }
      } catch (err) {
        logger.warn(`读取文件失败（已跳过）：${file}`, true);
      }
    }

    if (fileToTermsMap.size === 0) {
      logger.warn('未提取到任何词条，程序退出', true);
      process.exit(0);
    }

    // 构建 Excel 数据
    const sortedFiles = Array.from(fileToTermsMap.keys()).sort();
    const rows: (string | null)[][] = [];
    const merges: {
      s: { r: number; c: number };
      e: { r: number; c: number };
    }[] = [];

    rows.push(['文件路径', targetLangName]);

    let currentRow = 1;
    for (const filePath of sortedFiles) {
      const terms = fileToTermsMap.get(filePath)!;
      const startRow = currentRow;
      for (let i = 0; i < terms.length; i++) {
        rows.push([filePath, terms[i]]);
        currentRow++;
      }
      const endRow = currentRow - 1;
      if (endRow > startRow) {
        merges.push({
          s: { r: startRow, c: 0 },
          e: { r: endRow, c: 0 },
        });
      }
    }

    const timestamp = getTimestamp();
    const outputFileName = `i18n_terms_${timestamp}.xlsx`;
    const outputPath = path.join(rootDir, outputFileName);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    if (merges.length > 0) {
      ws['!merges'] = merges;
    }
    XLSX.utils.book_append_sheet(wb, ws, 'I18nTerms');
    XLSX.writeFile(wb, outputPath);

    const totalTerms = rows.length - 1;
    logger.info(`Excel 文件已生成：${outputPath}`, true);
    logger.info(
      `总计导出 ${totalTerms} 条词条，分布在 ${sortedFiles.length} 个文件中`,
      true
    );
    logger.info(`目标语言：${targetLangName}`, true);
    logger.info('提取完成', true);
  } catch (error: unknown) {
    loggerError(error, logger);
    console.error('程序执行时发生异常，已记录日志，程序已退出');
    process.exit(1);
  }
}
