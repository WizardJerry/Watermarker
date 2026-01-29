# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

# How to bulid

as a beginer, I'd like to record environment setup for myself

Using Scoop as your Windows package management tool:
install environment using scoop:

``` shell
scoop install nodejs
scoop install rustup
```

When rustup was installed, there will be a note to construct you to install microsoft C++ tool:
```
Notes
-----
This package defaults to using the MSVC toolchain in new installs; use "rustup set default-host" to configure it
(existing installs may be using the GNU toolchain by default)
According to https://doc.rust-lang.org/book/ch01-01-installation.html#installing-rustup-on-windows
Microsoft C++ Build Tools is needed and can be downloaded here:
https://visualstudio.microsoft.com/visual-cpp-build-tools/
When installing build tools, these two components should be selected:
- MSVC - VS C++ x64/x86 build tools
- Windows SDK
```

Verify your environment by:
``` shell
rustc --version
node -v
```
<!-- How to verify MSVC installation? -->


# How to run

Make sure you have finished environment configuration, and enter directory of this repositery, run command below for debug

``` shell
npm install
npm run tauri dev
```


# TODO list
## FIX
- [x] 水印位置需要根据字号计算长度，来保证在选择的位置上可以保持居中
    - [x] 该功能只需要在上下左右中实现，四角左边使用句首，右边使用句尾
- [ ] 铺满功能需要经过计算，来保证铺满后水印的大小合适
- [ ] 界面UI默认情况下文件选择框bug
- [ ] Media Box 信息获取的方法更新，参考注释
- [ ] 目前在PDF中看到有偏右的情况，需要再确认

## Features
- [x] 配置 - 设置默认配置
- [ ] 预览功能
- [ ] 字体格式选择 添加Arial等免费商用字体
- [ ] 字体透明度功能
- [ ] 配色更改去AI化
- [ ] 水印进度条，完成消息弹窗更改为界面上动画，或触发windows消息接口
- [ ] 队列中任务全部删除按钮
- [ ] 配置中选择文件下载位置（源文件同目录或是指定目录，默认download）
- [ ] 后缀自定义
- [ ] gemini 中构建绿色软件的建议
- [ ] 点击开始按钮后将按钮无效化，防止连续点击
