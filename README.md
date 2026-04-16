# 项目名称

一个基于 Node.js 和 TypeScript 的高效 CLI 工具，用于提升工作效率。

---

## 目录

- [环境要求](#环境要求)
- [安装](#安装)
- [使用](#使用)
- [开发](#开发)
- [构建](#构建)
- [发布](#发布)
- [项目结构](#项目结构)

---

## 环境要求

- Node.js >= 20.18.2（推荐使用 22.x 或更高版本）
- npm >= 10.8.2

> **注意**：部分依赖可能要求更高版本，请根据实际情况调整。

---

## 安装

```bash
npm i -g td-web-cli
```

---

## 使用

### 命令行执行

```bash
td-web-cli
```

### 功能说明

- 前端项目中文词条提取工具。[详细功能说明请点击这里](https://github.com/qianyuzzf/td-web-cli/blob/master/docs/i18n/extractEntry.md)
- 多语言 JSON 转 Excel 工具。[详细功能说明请点击这里](https://github.com/qianyuzzf/td-web-cli/blob/master/docs/i18n/json2excel.md)
- 多语言 Excel 转 JSON 及语言检测工具。[详细功能说明请点击这里](https://github.com/qianyuzzf/td-web-cli/blob/master/docs/i18n/excel2json.md)
- 多语言 JSON 文件合并工具。[详细功能说明请点击这里](https://github.com/qianyuzzf/td-web-cli/blob/master/docs/i18n/jsonMerge.md)
- 图片压缩工具。[详细功能说明请点击这里](https://github.com/qianyuzzf/td-web-cli/blob/master/docs/i18n/compressImage.md)
- 节假日查询与提醒工具。[详细功能说明请点击这里](https://github.com/qianyuzzf/td-web-cli/blob/master/docs/tools/getHolidayTime.md)

---

## 开发

1. 克隆仓库

```bash
git clone https://github.com/qianyuzzf/td-web-cli.git
cd td-web-cli
```

2. 安装依赖

```bash
npm install
```

### 代码结构

- `src/` - TypeScript 源代码目录
- `dist/` - 编译后的 JavaScript 输出目录
- `release.js` - 发布脚本（可直接运行或编译后运行）

### 运行开发环境

```bash
npm run build
npm link
td-web-cli  # 确保本机未全局安装该工具
```

通过 `npm link`，本地调试 CLI 命令 `td-web-cli`。

---

## 构建

使用 TypeScript 编译项目：

```bash
npm run build
```

编译后的代码默认输出到 `dist/` 目录。

---

## 发布

通过自动化脚本完成发布流程：

```bash
npm run release
```

该命令将依次执行：

- 版本号更新
- 依赖安装
- 项目构建
- 发布到 npm
- 提交并推送 Git 代码

---

## 项目结构

```
.
├── src/                  # TypeScript 源代码目录，存放项目的核心业务代码
│   │── api               # 接口代码
│   │── modules           # 模块代码
│   └── utils             # 工具代码
├── dist/                 # 编译输出目录，存放 TypeScript 编译后的 JavaScript 文件
├── docs/                 # 项目文档目录，包含功能说明、使用手册、设计文档等
├── release.js            # 发布脚本，自动化完成版本发布相关操作
├── setting.json          # 配置文件，存放项目运行所需的配置信息
├── package.json          # npm 项目配置文件，定义依赖、脚本和元信息
├── tsconfig.json         # TypeScript 配置文件，指定编译选项和项目结构
├── README.md             # 项目说明文件，提供项目简介、安装使用等基础信息
├── .gitignore            # Git 忽略文件，指定不纳入版本控制的文件或目录
├── .prettierignore       # Prettier 忽略文件，指定格式化工具忽略的文件或目录
├── .prettierrc           # Prettier 配置文件，定义代码格式化规则
└── package-lock.json     # 依赖锁定文件，确保安装依赖版本一致
```

---

感谢您使用本项目！如有任何问题或建议，欢迎反馈与贡献。
