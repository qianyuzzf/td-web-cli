import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getData, postData } from '../api/index.js';
import api from '../api/interface.js';

/**
 * 获取当前时间戳字符串，格式为：YYYYMMDDHHMMSS
 * 例如：20260123135500 表示 2026年01月23日 13点55分00秒
 *
 * @returns {string} 格式化后的时间戳字符串
 */
export function getTimestamp(): string {
  const now = new Date();

  /**
   * 辅助函数：将数字转换为长度为2的字符串，不足时左侧补0
   * @param n 需要格式化的数字
   * @returns {string} 补零后的字符串
   */
  const pad = (n: number): string => n.toString().padStart(2, '0');

  const year = now.getFullYear(); // 获取四位年份
  const month = pad(now.getMonth() + 1); // 获取月份（0-11），需+1，补零
  const day = pad(now.getDate()); // 获取日期，补零
  const hour = pad(now.getHours()); // 获取小时，补零
  const minute = pad(now.getMinutes()); // 获取分钟，补零
  const second = pad(now.getSeconds()); // 获取秒钟，补零

  // 拼接成完整时间戳字符串
  return `${year}${month}${day}${hour}${minute}${second}`;
}

/**
 * 日志级别类型
 */
type LogLevel = 'INFO' | 'WARN' | 'ERROR';

/**
 * 日志配置接口
 */
interface LoggerOptions {
  /**
   * 日志目录，默认根目录下的 logs 文件夹
   */
  logsDir?: string;

  /**
   * 日志文件名格式函数，接收当前日期，返回文件名字符串
   * 默认格式为 YYYYMMDD.txt
   */
  filenameFormatter?: (date: Date) => string;

  /**
   * 当前环境，默认 process.env.NODE_ENV
   */
  env?: string;
}

/**
 * 获取项目根目录路径，兼容 ESM
 * @returns 根目录绝对路径
 */
function getRootDir(): string {
  // 当前模块文件路径
  const __filename = fileURLToPath(import.meta.url);
  // 当前模块目录
  const __dirname = path.dirname(__filename);
  // 根目录为当前模块目录的上两级，视项目结构调整
  return path.resolve(__dirname, '../../');
}

/**
 * 默认日志配置
 * logsDir 默认设置为项目根目录的 logs 文件夹
 */
const defaultOptions: LoggerOptions = {
  logsDir: path.resolve(getRootDir(), 'logs'),
  filenameFormatter: (date: Date) => {
    // 使用本地时间格式化，格式 YYYYMMDD.txt
    const pad = (n: number) => n.toString().padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    return `${year}${month}${day}.txt`;
  },
  env: process.env.NODE_ENV || 'production',
};

/**
 * 格式化日志内容，支持字符串或对象
 * @param level 日志级别
 * @param message 日志内容，字符串或对象
 * @param date 当前时间
 * @returns 格式化后的日志字符串
 */
function formatLogLine(level: LogLevel, message: unknown, date: Date): string {
  // 使用本地时间格式化为 ISO-like 字符串（带时区偏移）
  // 格式示例：2026-01-23T13:55:00+08:00
  function formatLocalISO(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');

    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hour = pad(date.getHours());
    const minute = pad(date.getMinutes());
    const second = pad(date.getSeconds());

    // 计算时区偏移，单位分钟
    const tzOffset = -date.getTimezoneOffset();
    const sign = tzOffset >= 0 ? '+' : '-';
    const tzHour = pad(Math.floor(Math.abs(tzOffset) / 60));
    const tzMinute = pad(Math.abs(tzOffset) % 60);

    return `${year}-${month}-${day}T${hour}:${minute}:${second}${sign}${tzHour}:${tzMinute}`;
  }

  const timeStr = formatLocalISO(date);

  let msgStr: string;

  if (typeof message === 'string') {
    msgStr = message;
  } else {
    try {
      msgStr = JSON.stringify(message, null, 2);
    } catch {
      msgStr = String(message);
    }
  }

  return `[${timeStr}] [${level}] ${msgStr}\n`;
}

/**
 * 统一日志处理类
 * 支持写入日志文件和控制台打印
 */
export class Logger {
  private logsDir: string;
  private filenameFormatter: (date: Date) => string;
  private env: string;

  /**
   * 构造函数，初始化日志配置
   * @param options 配置项，可选
   */
  constructor(options?: LoggerOptions) {
    const opts = { ...defaultOptions, ...options };

    // 如果未传 logsDir，则默认设置为根目录的 logs 文件夹
    this.logsDir = opts.logsDir!;
    this.filenameFormatter =
      opts.filenameFormatter ?? defaultOptions.filenameFormatter!;
    this.env = opts.env ?? defaultOptions.env!;
  }

  /**
   * 写日志主函数
   * @param level 日志级别
   * @param message 日志内容，支持字符串或对象
   * @param printConsole 是否打印到控制台，默认 false
   */
  log(level: LogLevel, message: unknown, printConsole = false): void {
    const now = new Date();
    const logLine = formatLogLine(level, message, now);

    // 根据调用时是否指定打印控制台，决定是否打印
    if (printConsole) {
      switch (level) {
        case 'INFO':
          console.info(logLine.trim());
          break;
        case 'WARN':
          console.warn(logLine.trim());
          break;
        case 'ERROR':
          console.error(logLine.trim());
          break;
      }
    }

    try {
      // 确保日志目录存在
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true });
      }

      const filename = this.filenameFormatter(now);
      const logFilePath = path.join(this.logsDir, filename);

      // 追加写入日志文件
      fs.appendFileSync(logFilePath, logLine, { encoding: 'utf8' });
    } catch (error: unknown) {
      // 仅在开发环境打印写日志异常堆栈，生产环境静默失败，避免影响主程序
      if (this.env === 'development') {
        console.error('日志写入异常：', normalizeError(error).stack);
      }
    }
  }

  /**
   * 记录信息级别日志
   * @param message 日志内容
   * @param printConsole 是否打印到控制台，默认 false
   */
  info(message: unknown, printConsole = false): void {
    this.log('INFO', message, printConsole);
  }

  /**
   * 记录警告级别日志
   * @param message 日志内容
   * @param printConsole 是否打印到控制台，默认 false
   */
  warn(message: unknown, printConsole = false): void {
    this.log('WARN', message, printConsole);
  }

  /**
   * 记录错误级别日志
   * @param message 日志内容
   * @param printConsole 是否打印到控制台，默认 false
   */
  error(message: unknown, printConsole = false): void {
    this.log('ERROR', message, printConsole);
  }
}

/**
 * 默认导出单例 logger，方便直接使用
 * 默认不打印控制台日志
 */
export const logger = new Logger({
  env: process.env.NODE_ENV || 'development',
});

/**
 * 通用错误日志记录函数
 * @param error 捕获的错误对象
 * @param logger 日志对象，需包含 error 方法
 * @param prefix 日志前缀，方便区分来源，默认值为 '程序执行时发生错误'
 * @param printConsole 是否打印错误日志到控制台，默认 false
 */
export function loggerError(
  error: unknown,
  logger: { error: (msg: string, printConsole?: boolean) => void },
  prefix = '程序执行时发生错误',
  printConsole = false
): void {
  logger.error(`${prefix}：${normalizeError(error).stack}`, printConsole);
}

/**
 * 将任意错误对象规范化为 Error 类型。
 * @param err - 可能是 Error、字符串或其他任意类型
 * @returns 标准的 Error 对象
 */
export const normalizeError = (err: unknown): Error => {
  if (err instanceof Error) {
    // 已经是 Error 类型，直接返回
    return err;
  } else if (typeof err === 'string') {
    // 如果是字符串，创建新的 Error
    return new Error(err);
  } else {
    // 其他情况，返回通用错误
    return new Error('未知错误');
  }
};

/**
 * 语言工具接口返回的语言列表类型
 * 数组中每个元素包含语言名称、简写代码和长代码
 */
export type LanguageTool = {
  name: string; // 语言名称，如 "English"
  code: string; // 语言简写代码，如 "en"
  longCode: string; // 语言长代码，如 "en-US"
}[];

/**
 * 获取支持的语言列表
 * 调用语言工具接口，返回所有支持的语言信息数组
 * @returns Promise<LanguageTool> 返回语言列表的 Promise
 * @throws 接口请求失败时抛出错误，错误信息包含接口地址和异常堆栈
 */
export async function getLanguageTool(): Promise<LanguageTool> {
  const url = api.LANGUAGE_TOOL_V2_LANGUAGES;
  try {
    const res = await getData<LanguageTool>(url);
    return res;
  } catch (error) {
    // 捕获异常并包装错误信息，包含接口地址和堆栈信息
    throw new Error(`${url}接口报错：${normalizeError(error).stack}`);
  }
}

/**
 * 替换建议类型
 */
export interface Replacement {
  value: string; // 建议替换的字符串
}

/**
 * 语言检测结果中的单条匹配错误信息
 */
export interface Match {
  message: string; // 错误描述信息
  shortMessage: string; // 简短错误信息
  offset: number; // 错误在文本中的起始位置
  length: number; // 错误长度
  replacements: Replacement[]; // 建议的替换项数组
  sentence: string; // 出错的句子
  rule: {
    // 触发的规则信息
    id: string; // 规则ID
    description: string; // 规则描述
  };
}

/**
 * 语言检测接口返回的完整结果类型
 */
export interface CheckResult {
  matches: Match[]; // 检测到的所有错误匹配项
  language: {
    // 语言信息
    name: string; // 语言名称
    code: string; // 语言代码
  };
  software: {
    // 使用的检测软件信息
    name: string; // 软件名称
    version: string; // 版本号
    premium: boolean; // 是否为付费版
  };
}

/**
 * 调用语言检测接口，检测文本中的语言错误
 * @param text 待检测文本
 * @param language 语言代码，默认 'en-US'
 * @returns Promise<CheckResult> 返回检测结果的 Promise
 * @throws 接口请求失败时抛出错误，错误信息包含接口地址和异常堆栈
 */
export async function languageToolCheck(
  text: string,
  language = 'en-US'
): Promise<CheckResult> {
  const url = api.LANGUAGE_TOOL_V2_CHECK;
  const params = new URLSearchParams();
  params.append('text', text);
  params.append('language', language);

  try {
    const res = await postData<string, CheckResult>(url, params.toString(), {
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    return res;
  } catch (error) {
    // 捕获异常并包装错误信息，包含接口地址和堆栈信息
    throw new Error(`${url}接口报错：${normalizeError(error).stack}`);
  }
}

/**
 * 对字符串重新编码，字符串前面加上6位的特殊编码（格式：字母#三个字母#）
 * 例如：a#BCD#yourString
 * @param key 需要进行重新编码的字符串
 * @returns 带有特殊编码前缀的字符串
 */
export function formatKey(key: string): string {
  const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const codeTemplate = '{0}#{1}{2}{3}#';

  // 先解码，防止重复添加前缀
  const decodedKey = decodeKey(key);

  // 随机选取4个字母替换模板中的占位符
  const getRandomLetter = () =>
    letters[Math.floor(Math.random() * letters.length)];
  const code = codeTemplate
    .replace('{0}', getRandomLetter())
    .replace('{1}', getRandomLetter())
    .replace('{2}', getRandomLetter())
    .replace('{3}', getRandomLetter());

  return code + decodedKey;
}

/**
 * 对重新编码的字符串进行解码，去除前面6位特殊编码部分
 * @param key 需要解码的字符串
 * @returns 去除特殊编码前缀后的字符串
 */
export function decodeKey(key: string): string {
  if (!key) {
    return '';
  }

  // 匹配开头格式：字母#三个字母#
  // ^ 开头， [a-zA-Z] 一个字母， \# 字符 #， [a-zA-Z]{3} 三个字母， \# 字符 #
  const prefixRegex = /^[a-zA-Z]\#[a-zA-Z]{3}\#/;

  // 去除前缀
  return key.replace(prefixRegex, '');
}

/**
 * 将Git Bash风格的路径（如 /d/...）转换成Windows风格路径（D:/...）
 * @param inputPath 用户输入的路径
 * @returns 转换后的绝对路径
 */
export function normalizeGitBashPath(inputPath: string): string {
  let cleaned = inputPath.trim().replace(/^['"]|['"]$/g, '');

  // 如果路径是 /d/... 格式，转换成 D:/...
  if (/^\/[a-zA-Z]\//.test(cleaned)) {
    cleaned = cleaned.replace(/^\/([a-zA-Z])\//, '$1:/');
  }

  // 使用 path.resolve 转成绝对路径（相对于当前工作目录）
  const absolutePath = path.resolve(process.cwd(), cleaned);

  return absolutePath;
}

/**
 * 去除字符串首尾的单引号或双引号
 * @param str 输入字符串
 * @returns 去除引号后的字符串
 */
export function trimQuotes(str: string): string {
  if (
    (str.startsWith('"') && str.endsWith('"')) ||
    (str.startsWith("'") && str.endsWith("'"))
  ) {
    return str.slice(1, -1);
  }
  return str;
}
