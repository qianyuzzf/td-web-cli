# 项目名称

一个基于 Node.js 和 TypeScript 的高效 CLI 工具，用于提升工作效率。

---

## 目录

- [环境要求](#环境要求)
- [安装](#安装)
- [开发](#开发)
- [使用](#使用)
- [构建](#构建)
- [发布](#发布)
- [项目结构](#项目结构)

---

## 环境要求

- Node.js >= 20.x（推荐使用 22.x 或更高版本）
- npm >= 10.x
- TypeScript >= 5.x

> **注意**：部分依赖可能要求 Node.js 20 及以上版本，请根据实际情况调整。

---

## 安装

1. 克隆仓库

```bash
git clone https://github.com/qianyuzzf/td-web-cli.git
cd td-web-cli
```

2. 安装依赖

```bash
npm install
```

---

## 开发

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

## 使用

### 命令行执行

执行 CLI 工具：

```bash
td-web-cli
```

### 功能说明

- 多语言 Excel 转 JSON 工具。[详细功能说明请点击这里](https://github.com/qianyuzzf/td-web-cli/blob/master/docs/i18n/excel2json.md)

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
├── src/                  # TypeScript 源代码
│   └── index.ts          # 入口文件
├── dist/                 # 编译输出目录
├── release.js            # 发布脚本
├── setting.json          # 配置文件
├── package.json          # 项目配置
├── tsconfig.json         # TypeScript 配置
├── README.md             # 项目说明文件
├── .gitignore            # Git 忽略文件
├── .prettierignore       # Prettier 忽略文件
├── .prettierrc           # Prettier 配置文件
└── package-lock.json     # 依赖锁定文件
```

---

感谢您使用本项目！如有任何问题或建议，欢迎反馈与贡献。
