# 前端项目中文词条提取工具

该工具用于从前端项目源码中自动提取包含中文的词条，支持多种文件格式（JS/TS/JSX/TSX/Vue/HTML），并生成包含文件路径和对应中文词条的 Excel 文件，方便国际化管理和翻译工作。

---

## 主要功能

1. **多文件格式支持**
   - 支持 `.js`、`.jsx`、`.ts`、`.tsx`、`.vue`、`.html` 和 `.htm` 文件格式。
2. **中文词条提取**
   - 通过 AST 解析 JavaScript/TypeScript 代码，提取字符串字面量和模板字符串中的中文。
   - 解析 Vue 单文件组件，提取 script 和 template 中的中文文本及属性值。
   - 解析 HTML 文件，提取文本节点及属性中的中文内容，忽略注释。
   - 支持提取动态绑定表达式中的字符串字面量。

3. **路径和忽略规则配置**
   - 通过命令行交互输入项目根目录。
   - 支持默认和自定义的忽略路径模式（支持 glob 通配符），过滤无关目录和文件。

4. **递归扫描目录**
   - 递归扫描指定目录下所有符合扩展名和忽略规则的文件。

5. **生成 Excel 词条文件**
   - 将提取的词条按文件路径分组，生成包含“文件路径”和“简体中文”两列的 Excel 文件。
   - 对连续相同文件路径的单元格进行合并，提升可读性。

6. **日志与异常处理**
   - 详细日志输出扫描进度、警告和错误信息。
   - 读取或解析失败的文件会跳过并记录警告。
   - 程序异常时记录日志并安全退出。

---

## 使用说明

1. 运行程序后，输入需要扫描的项目根目录路径。
2. 选择是否使用默认忽略规则，或自定义忽略路径模式。
3. 程序开始递归扫描符合条件的文件，提取所有包含中文的词条。
4. 生成的 Excel 文件保存在项目根目录，文件名格式为 `i18n_terms_时间戳.xlsx`。
5. Excel 文件中包含文件路径和对应的中文词条，方便后续国际化处理。

---

## 代码结构简述

- **containsChinese(text: string): boolean**  
  判断字符串中是否包含汉字。

- **extractStringsFromExpression(expr: string): Set<string>**  
  从表达式中提取字符串字面量，支持单引号、双引号和模板字符串。

- **extractFromJS(code: string): Set<string>**  
  使用 Babel 解析 JS/TS/JSX 代码，提取包含中文的字符串。

- **extractFromVue(content: string): Set<string>**  
  解析 Vue 单文件组件，提取 script 和 template 部分的中文。

- **extractFromHTML(html: string): Set<string>**  
  解析 HTML 文件，提取文本和属性中的中文。

- **extractEntryFromFile(filePath: string, content: string): Set<string>**  
  根据文件扩展名选择对应的提取方法。

- **getFiles(dir: string, extensions: string[], ignorePatterns: string[], rootDir: string): string[]**  
  递归获取目录下所有符合扩展名且未被忽略的文件路径。

- **isValidGlobPattern(pattern: string): boolean**  
  校验 glob 模式的有效性。

- **extractEntry(program: Command)**  
  主流程函数，交互输入路径和忽略规则，扫描文件，提取中文词条，生成 Excel 文件。

---

## 备注

- 工具重点提取简体中文词条，便于后续翻译和国际化处理。
- 支持灵活配置忽略规则，避免扫描无关文件夹，提高效率。
- 生成的 Excel 文件方便翻译人员查看和整理词条。
- 解析过程对异常文件容错，保证整体流程稳定。

---

欢迎使用和反馈！
