import { Command } from 'commander';
import { input, select, confirm, Separator } from '@inquirer/prompts';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import {
  logger,
  loggerError,
  normalizeGitBashPath,
} from '../../../utils/index.js';

// 支持处理的图片格式
const SUPPORTED_FORMATS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.avif',
  '.tiff',
  '.gif',
];

/**
 * 生成6位随机字符串（用于文件名后缀）
 */
function generateShortSuffix(): string {
  return Math.random().toString(36).substring(2, 8);
}

/**
 * 获取文件的输出路径（同目录，原文件名+6位随机字符串+扩展名）
 */
function getOutputPath(inputPath: string): string {
  const dir = path.dirname(inputPath);
  const ext = path.extname(inputPath);
  const baseName = path.basename(inputPath, ext);
  const suffix = generateShortSuffix();
  return path.join(dir, `${baseName}_${suffix}${ext}`);
}

/** 创建保留动画帧和多页内容的 Sharp 处理管线。 */
export function createImageProcessor(input: string | Buffer) {
  return sharp(input, { animated: true });
}

/**
 * 图片压缩主功能
 * - 交互式输入图片路径
 * - 选择压缩级别（无损/视觉无损/有损/高损）
 * - 询问是否自动缩放超大图片
 * - 自动识别格式并使用对应压缩参数
 * - 输出文件添加6位随机后缀，保存在原目录
 */
export async function compressImage(program: Command) {
  // 交互式输入图片路径并校验
  const answer = await input({
    message: '请输入图片文件路径：',
    validate: (value) => {
      const cleaned = value.trim().replace(/^['"]|['"]$/g, '');
      if (cleaned.length === 0) {
        return '路径不能为空';
      }

      const normalizedPath = normalizeGitBashPath(cleaned);

      if (!fs.existsSync(normalizedPath)) {
        return '文件不存在，请输入有效路径';
      }

      const ext = path.extname(normalizedPath).toLowerCase();
      if (!SUPPORTED_FORMATS.includes(ext)) {
        return `不支持的文件格式，支持的格式：${SUPPORTED_FORMATS.join(', ')}`;
      }

      return true;
    },
  });

  const imagePath = normalizeGitBashPath(answer);

  const moduleChoices = [
    {
      name: '无损压缩',
      description: '完全保留原始画质，体积减小极少（5%~15%）',
      value: 'lossless',
    },
    {
      name: '视觉无损压缩',
      description: '肉眼几乎无法察觉差异，体积减小明显（20%~50%）',
      value: 'visually_lossless',
    },
    {
      name: '有损压缩',
      description: '画质轻微下降，体积大幅减小（40%~70%）',
      value: 'lossy',
    },
    {
      name: '高损压缩',
      description: '画质明显下降，体积最小（60%~90%）',
      value: 'high_lossy',
    },
  ];

  // 选择压缩类型（四种级别，带详细描述）
  const compressType = await select({
    message: '请选择压缩级别：',
    choices: [
      ...moduleChoices,
      new Separator(), // 分割线，方便未来扩展更多功能
    ],
    default: 'visually_lossless', // 默认选项
    loop: true, // 是否循环滚动选项
  });

  // 询问是否自动缩放超大图片
  const shouldResize = await confirm({
    message: '是否自动缩放超大图片（宽度超过 2560px 时缩小至 2560px）？',
    default: true,
  });

  try {
    logger.info(
      `开始处理图片：${imagePath}，压缩级别：${moduleChoices.find((item) => item.value === compressType)?.name}`,
      true
    );

    // 读取图片元数据，获取格式信息
    // animated=true 确保 GIF、WebP 和多页 TIFF 不会被静默截成第一帧。
    const image = createImageProcessor(imagePath);
    const metadata = await image.metadata();
    const format = metadata.format;

    if (!format) {
      throw new Error('无法识别图片格式');
    }

    logger.info(
      `图片格式：${format}，原始尺寸：${metadata.width}x${metadata.height}`,
      true
    );

    // 初始化处理管道
    let pipeline = image;

    // 自动缩放逻辑（用户同意且图片宽度超出阈值）
    const MAX_WIDTH = 2560;
    if (shouldResize && metadata.width && metadata.width > MAX_WIDTH) {
      // 防御性检查：确保 width 是有效正数
      if (metadata.width > 0 && metadata.width < 100000) {
        pipeline = pipeline.resize(MAX_WIDTH, null, {
          withoutEnlargement: true,
          fit: 'inside',
        });
        logger.info(
          `图片尺寸已从 ${metadata.width}px 缩小至 ${MAX_WIDTH}px`,
          true
        );
      } else {
        logger.warn(`图片宽度异常 (${metadata.width})，跳过尺寸调整`, true);
      }
    } else if (shouldResize) {
      logger.info(`图片宽度未超过 ${MAX_WIDTH}px，无需缩放`, true);
    } else {
      logger.info('已跳过自动缩放', true);
    }

    // 根据格式和压缩类型构建处理管道
    switch (format) {
      case 'jpeg':
      case 'jpg':
        if (compressType === 'lossless') {
          // 无损：最高质量，关闭色度抽样
          pipeline = pipeline.jpeg({
            quality: 100,
            chromaSubsampling: '4:4:4',
          });
        } else if (compressType === 'visually_lossless') {
          // 视觉无损：高品质有损，轻微色度抽样
          pipeline = pipeline.jpeg({
            quality: 90,
            progressive: true,
            chromaSubsampling: '4:2:0',
          });
        } else if (compressType === 'lossy') {
          // 有损：标准有损参数
          pipeline = pipeline.jpeg({
            quality: 75,
            progressive: true,
            chromaSubsampling: '4:2:0',
          });
        } else {
          // 高损：低质量，最大化压缩
          pipeline = pipeline.jpeg({
            quality: 55,
            progressive: true,
            chromaSubsampling: '4:2:0',
          });
        }
        break;

      case 'png':
        if (compressType === 'lossless') {
          // 无损：最高压缩级别
          pipeline = pipeline.png({
            compressionLevel: 9,
            adaptiveFiltering: true,
          });
        } else if (compressType === 'visually_lossless') {
          // 视觉无损：高质量调色板模式
          pipeline = pipeline.png({
            compressionLevel: 9,
            palette: true,
            quality: 90,
            effort: 10,
          });
        } else if (compressType === 'lossy') {
          // 有损：中等质量调色板
          pipeline = pipeline.png({
            compressionLevel: 9,
            palette: true,
            quality: 70,
            effort: 10,
          });
        } else {
          // 高损：低质量调色板，大幅减少颜色
          pipeline = pipeline.png({
            compressionLevel: 9,
            palette: true,
            quality: 45,
            effort: 10,
          });
        }
        break;

      case 'webp':
        if (compressType === 'lossless') {
          // 无损：启用 lossless 模式
          pipeline = pipeline.webp({
            lossless: true,
            quality: 100,
          });
        } else if (compressType === 'visually_lossless') {
          // 视觉无损：高质量有损 WebP
          pipeline = pipeline.webp({
            lossless: false,
            quality: 85,
            effort: 6,
          });
        } else if (compressType === 'lossy') {
          // 有损：中等质量
          pipeline = pipeline.webp({
            lossless: false,
            quality: 65,
            effort: 6,
          });
        } else {
          // 高损：低质量
          pipeline = pipeline.webp({
            lossless: false,
            quality: 45,
            effort: 6,
          });
        }
        break;

      case 'avif':
        if (compressType === 'lossless') {
          // 无损：启用 lossless 模式
          pipeline = pipeline.avif({
            lossless: true,
          });
        } else if (compressType === 'visually_lossless') {
          // 视觉无损：高质量有损 AVIF
          pipeline = pipeline.avif({
            lossless: false,
            quality: 60,
            effort: 9,
          });
        } else if (compressType === 'lossy') {
          // 有损：中等质量
          pipeline = pipeline.avif({
            lossless: false,
            quality: 45,
            effort: 9,
          });
        } else {
          // 高损：极低质量
          pipeline = pipeline.avif({
            lossless: false,
            quality: 30,
            effort: 9,
          });
        }
        break;

      case 'tiff':
        // TIFF 支持 LZW 无损压缩或 JPEG 有损压缩
        if (compressType === 'lossless') {
          pipeline = pipeline.tiff({
            compression: 'lzw',
          });
        } else if (compressType === 'visually_lossless') {
          // 视觉无损：轻微有损
          pipeline = pipeline.tiff({
            compression: 'jpeg',
            quality: 90,
          });
        } else if (compressType === 'lossy') {
          pipeline = pipeline.tiff({
            compression: 'jpeg',
            quality: 75,
          });
        } else {
          pipeline = pipeline.tiff({
            compression: 'jpeg',
            quality: 55,
          });
        }
        break;

      case 'gif':
        if (compressType === 'lossless') {
          pipeline = pipeline.gif({
            effort: 10,
            interFrameMaxError: 0,
            interPaletteMaxError: 0,
          });
        } else if (compressType === 'visually_lossless') {
          pipeline = pipeline.gif({
            effort: 10,
            interFrameMaxError: 2,
            interPaletteMaxError: 3,
          });
        } else if (compressType === 'lossy') {
          pipeline = pipeline.gif({
            effort: 10,
            colours: 128,
            interFrameMaxError: 8,
          });
        } else {
          pipeline = pipeline.gif({
            effort: 10,
            colours: 64,
            interFrameMaxError: 16,
          });
        }
        break;

      default:
        throw new Error(`暂不支持的格式：${format}`);
    }

    // Sharp 默认不保留 EXIF、XMP、IPTC 等输入元数据。

    const outputPath = getOutputPath(imagePath);

    // 执行压缩并输出文件
    await pipeline.toFile(outputPath);

    // 获取压缩后文件大小，计算压缩率
    const originalSize = fs.statSync(imagePath).size;
    const compressedSize = fs.statSync(outputPath).size;
    const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(2);

    logger.info(
      `压缩完成！\n输出文件：${outputPath}\n原始大小：${(originalSize / 1024).toFixed(2)} KB\n压缩后大小：${(
        compressedSize / 1024
      ).toFixed(2)} KB\n压缩率：${ratio}%`,
      true
    );

    logger.info(`图片压缩成功！文件已保存至：${outputPath}`, true);
  } catch (error: unknown) {
    loggerError(error, logger);
    console.error('程序执行时发生异常，已记录日志，程序已退出');
    process.exit(1);
  }
}
