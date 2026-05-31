# Watermarker

Watermarker 是一个用于给 PDF 批量添加文字水印的桌面应用。项目基于 Tauri、React、TypeScript 和 Rust 构建，当前主要面向本地文件处理场景。

## 主要功能

- 批量选择或拖拽导入 PDF 文件。
- 使用配置模板生成水印文本，支持 `{}` 占位符。
- 管理多个水印配置，包括新增、修改、导入、保存为新配置和删除。
- 设置水印字体、字号、颜色、透明度、旋转角度、位置和重复铺满。
- 配置导出目录和导出文件后缀。

## 使用方法

1. 启动应用。
2. 将 PDF 文件拖入主区域，或点击上传区域选择文件。
3. 在底部配置栏选择水印配置。
4. 在右侧输入需要插入到 `{}` 占位符中的文本。
5. 点击开始处理，应用会生成带水印的新 PDF 文件。

如果配置中的导出目录为空，处理结果会默认输出到源 PDF 所在目录。文件名会使用配置中的后缀，例如 `example_marked.pdf`。

## 水印配置说明

配置文件为 JSON 格式，应用会在本地 `configs` 目录中读取和保存配置。首次运行时会自动创建默认配置。

常用配置字段：

- `name`：配置名称。
- `text`：水印文本模板，使用 `{}` 插入用户输入内容。
- `font_size`：字号。
- `font_family`：字体，目前主要使用 PDF 标准字体，如 `Helvetica`、`Times-Roman`、`Courier`。
- `color`：十六进制颜色，例如 `#808080`。
- `opacity`：透明度，范围通常为 `0.1` 到 `1`。
- `position`：水印位置，例如 `Center`、`TopLeft`、`BottomRight`。
- `rotation`：旋转角度。
- `is_repeated`：是否重复铺满页面。
- `spacing`：重复水印间距，可选 `Loose`、`Normal`、`Tight`。
- `export_path`：自定义导出目录，空字符串表示源文件目录。
- `export_suffix`：导出文件后缀，可使用 `{}` 占位符。

## 本地运行

### 环境要求

- Node.js
- Rust
- Microsoft C++ Build Tools（Windows 上构建 Tauri/Rust 项目需要）

如果使用 Scoop 管理 Windows 开发环境，可以安装：

```shell
scoop install nodejs
scoop install rustup
```

安装 Rust 后，请确认已安装 Microsoft C++ Build Tools，并至少选择：

- MSVC - VS C++ x64/x86 build tools
- Windows SDK

验证环境：

```shell
rustc --version
node -v
```

### 开发模式

```shell
npm install
npm run tauri dev
```

### 构建前端

```shell
npm run build
```

### 打包桌面应用

```shell
npm run tauri build
```

## 近期待办

更完整的开发记录、决策和路线图请见 `.codx/project.md`。

- 修复默认状态下文件选择框相关 UI 问题。
- 继续确认部分 PDF 中水印位置偏右的问题。
- 优化重复铺满水印的尺寸和间距计算。
- 后续评估并添加更多字体支持；当前先保留 PDF 标准字体，更多字体可考虑读取系统字体或嵌入可商用开源字体。
- 增加预览功能。
- 改进处理进度、完成提示和任务队列管理。
