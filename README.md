# PromptQueue: Chat Workflow Queue

PromptQueue：AI 对话工作流队列

Queue prompts, reuse workflows, and steer your next message across major AI chat pages.

在主流 AI 对话网页中排队发送提示词、复用工作流并控制下一步输入。

[Privacy Policy](./PRIVACY.md) / [Release Notes](./CHANGELOG.md) / [Contributing](./CONTRIBUTING.md) / [隐私权政策](./PRIVACY.md)

## English

PromptQueue is a local Chrome/Edge Manifest V3 extension for ChatGPT, Gemini, and Claude web apps. It works only through visible page DOM interactions: filling the composer, clicking send, and watching the page for reply completion.

This is not an OpenAI API project. It does not use an API key, backend service, cookies, tokens, private provider endpoints, or internal network calls.

### Features

- Shadow DOM sidebar on `chatgpt.com`, `chat.openai.com`, `gemini.google.com`, and `claude.ai`
- Prompt queue for sending multiple messages in order
- Named workflow library for reusable multi-message queues
- Workflow variables with run-time fill-in for `{{topic}}` style placeholders
- Built-in workflow examples for polishing, review, translation, product copy, and long-form summaries
- Workflow search, tags, duplication, drag-and-drop ordering, and workflow message editing
- Text Compare tab with two inputs, real-time visual diff, manual row/column result views, line/word/character precision, ignore whitespace/case options, context-aware change-only view, and Markdown change summaries
- Page Check status for composer, send button, stop button, and provider busy state before queue runs
- Steer Next and Stop & Steer for next-message direction changes
- Local run log with prompt previews, attempts, status, and copyable Markdown output
- Optional auto-retry for pre-send failures
- Browser right-click context tools for queueing selected text, summarizing/translating/rewriting/explaining a selection, or queueing the current page title and URL
- Conservative reply completion detection for long replies and image generation
- Per-provider default model preferences, using visible model menus only
- Clickable task status chips for pending, running, failed, and skipped tasks
- Chinese / English UI toggle
- Support tab with GitHub Star, Ko-fi, and local WeChat Pay donation QR code
- Persistent queue, workflows, settings, collapsed state, language, and panel width via `chrome.storage.local`
- Dark, light, and follow-page theme modes
- Keyboard shortcuts:
  - `Alt + Q`: collapse or expand the sidebar
  - `Alt + Shift + Enter`: add the current sidebar textarea content to the queue

### Installation

```bash
npm install
npm run build
```

Then load the extension:

1. Open Chrome or Edge extensions management.
2. Enable Developer mode.
3. Choose Load unpacked.
4. Select the generated `dist` directory.
5. Open or refresh `https://chatgpt.com/`, `https://chat.openai.com/`, `https://gemini.google.com/`, or `https://claude.ai/`.

### Usage

- Run: add queue messages, insert steer prompts, start/pause the queue, clear the queue, save the current queue as a named workflow, check whether the visible provider page is ready, broadcast the current draft to every other open supported AI tab at once ("Ask All Providers") and send any two replies straight to Compare, and (if reply capture is enabled) review and export completed tasks' replies.
- Compare: paste original and revised text to see real-time additions, deletions, changed-line highlights, switch row/column result views, choose line/word/character precision, filter to changed lines with context, ignore whitespace/case differences, copy revised text, and copy a Markdown summary.
- Workflow: search saved workflows, filter by tag, duplicate workflows, add built-in examples, fill workflow variables with a preview at run time, drag to reorder workflows, edit messages, delete, import, and export workflow JSON.
- Settings: timing, optional pre-send auto-retry, language, theme, separators, panel width, and advanced default model preferences.
- Support: GitHub Star, Ko-fi, and optional donation QR code.

PromptQueue sends the first pending message, waits until the provider reply appears complete, then sends the next pending message if auto-start is enabled. Pausing does not stop the current provider response; it only prevents the next queue message from being sent.

### Privacy Model

- Stores queue data only in local browser extension storage.
- Does not upload prompts, workflows, settings, or account data to any server.
- Does not read cookies.
- Does not collect account information.
- Does not scrape authentication tokens.
- Does not request `tabs`, `cookies`, `webRequest`, `scripting`, `activeTab`, or other sensitive permissions by default.
- Right-click context actions only use text or page metadata you explicitly choose from the browser context menu; temporary pending actions are cleared after being added to the queue.
- Page Check reads only visible DOM availability and busy state on the current supported AI page; it does not upload or persist page contents.
- Reply capture is a separate, off-by-default Settings toggle. When enabled, it stores the visible reply text locally on the completed task for export; it is never uploaded and can be disabled or cleared at any time.
- "Ask All Providers" broadcasts your current draft only to AI page tabs you already have open, using existing host permissions; results travel only between your own tabs and are never uploaded.
- The `notifications` permission is used only to show a local "queue finished" system notification (Settings, on by default); it sends nothing anywhere.
- The GitHub and Ko-fi buttons open external pages; PromptQueue does not request OAuth permission for these.
- The optional, experimental Google Drive backup feature (Settings) requests the `identity` permission only when you turn it on, and only accesses its own private `appDataFolder` on your Drive — never your other files. See [PRIVACY.md](./PRIVACY.md) for details.

See [PRIVACY.md](./PRIVACY.md) for the full privacy policy.

### Known Limitations

- ChatGPT, Gemini, or Claude DOM changes can break selectors. These pages are not public automation APIs.
- PromptQueue cannot control a provider's internal queue or model state.
- Model switching is best-effort because model menus, model names, and account availability differ by provider, subscription, region, and UI version.
- Reply completion is inferred from visible DOM state and may need timing adjustment for unusually dynamic replies.
- PromptQueue should not be used to bypass platform limits, rate limits, or product rules.

### Development Notes

- Repository: `https://github.com/hanx-777/PromptQueue`
- Source entry: `src/content/index.tsx`
- Content script output: `dist/assets/content.js`
- Background service worker output: `dist/assets/background.js`
- Manifest source: `manifest.json`
- Manifest build copy: `dist/manifest.json`
- Icons: `public/icons`
- The Vite build disables content-script code splitting and emits stable content/background filenames for Manifest V3 loading.
- Quality checks: `npm run test`, `npm run build`, or `npm run check` for both tests and build.

## 中文

PromptQueue 是一个本地运行的 Chrome / Edge Manifest V3 浏览器扩展，支持 ChatGPT、Gemini 和 Claude 网页版。它只通过可见页面 DOM 交互工作：填入输入框、点击发送按钮，并观察页面回复是否完成。

这不是 OpenAI API 项目。它不需要 API Key、不使用后端服务、不读取 Cookie、不抓取 Token、不调用任何私有接口或内部网络请求。

### 功能

- 在 `chatgpt.com`、`chat.openai.com`、`gemini.google.com`、`claude.ai` 注入 Shadow DOM 侧边栏
- 多条提示词排队，按顺序自动发送
- 命名工作流库，可保存和复用多消息队列
- 工作流变量：运行时填写 `{{topic}}` 这类占位符
- 内置工作流示例：论文润色、代码审查、翻译、产品文案、长文总结
- 工作流支持搜索、标签、复制、拖拽排序，工作流内部消息可编辑
- 文本对比标签页：两个输入框、实时可视化 diff、手动切换横栏/竖列结果视图，支持行/词/字符精度、忽略空白/大小写、带上下文的只看修改处，并可复制 Markdown 变更摘要
- 页面检测：显示输入框、发送按钮、停止按钮和服务商页面忙闲状态
- Steer Next 和 Stop & Steer，用于控制下一轮输入方向
- 本地运行记录：保存 prompt 预览、尝试次数、状态，并可复制 Markdown 日志
- 可选的发送前失败自动重试
- 浏览器右键菜单：可将选中文本直接入队，或生成总结、翻译、改写、解释 prompt，也可把当前页面标题和 URL 加入队列
- 更保守的回复完成判定，降低长回复和图片生成时误插入下一条的风险
- 支持为不同 AI 页面配置默认模型偏好，只通过可见模型菜单尽力切换
- 支持待处理、运行中、失败、已跳过等任务状态
- 中英文界面切换
- 支持页包含 GitHub Star、Ko-fi 和本地微信打赏码
- 队列、工作流、设置、折叠状态、语言和面板宽度都保存在 `chrome.storage.local`
- 支持浅色、深色、跟随网页主题
- 快捷键：
  - `Alt + Q`：折叠或展开侧边栏
  - `Alt + Shift + Enter`：将当前侧边栏输入框内容加入队列

### 安装

```bash
npm install
npm run build
```

然后加载扩展：

1. 打开 Chrome 或 Edge 扩展管理页面。
2. 开启开发者模式。
3. 选择“加载已解压的扩展程序”。
4. 选择生成的 `dist` 目录。
5. 打开或刷新 `https://chatgpt.com/`、`https://chat.openai.com/`、`https://gemini.google.com/` 或 `https://claude.ai/`。

### 使用

- 运行：添加队列消息、插入 Steer、开始/暂停队列、清空队列、把当前队列保存为命名工作流、查看当前 AI 页面是否可发送、一键把当前草稿"同时问三家"（广播给已打开的其他受支持 AI 标签页）并把任意两条回复直接送入对比，以及（开启回复采集后）查看并导出已完成任务的回复。
- 对比：粘贴原文和新版文本，实时查看新增、删除和修改行高亮，可切换横栏/竖列、行/词/字符精度、带上下文只看修改处、忽略空白/大小写、复制新版文本，并复制 Markdown 摘要。
- 工作流：搜索和筛选已保存工作流，添加标签，复制工作流，添加内置示例，运行前填写变量并预览生成任务，拖拽排序，编辑名称和消息，支持删除、导入和导出 JSON。
- 设置：调整等待时间、可选发送前自动重试、语言、主题、分隔符、面板宽度，以及高级默认模型偏好。
- 支持：GitHub Star、Ko-fi 和可选打赏码。

PromptQueue 会发送第一条待处理消息，等待当前 AI 网页回复看起来完成后，再根据设置自动发送下一条。暂停不会停止当前回复，只会阻止继续发送下一条。

### 隐私模型

- 队列数据只保存在本地浏览器扩展存储中。
- 不上传提示词、工作流、设置或账号数据到任何服务器。
- 不读取 Cookie。
- 不收集账号信息。
- 不抓取认证 Token。
- 默认不申请 `tabs`、`cookies`、`webRequest`、`scripting`、`activeTab` 或其他敏感权限。
- 右键菜单只处理你主动选择的文本或页面元数据；临时待处理上下文在加入队列后会立即清除。
- 页面检测只读取当前支持 AI 网页的可见 DOM 状态，不上传或持久化页面内容。
- 回复采集是设置中一个独立的、默认关闭的开关。开启后会把回复的可见文本保存在本地对应的已完成任务上以便导出，不会上传，可随时关闭或清除。
- "同时问三家"只会广播给你已经打开的 AI 页面标签，使用的是已有的 host permissions；结果只在你自己的标签页之间传递，不会上传。
- `notifications` 权限只用于显示本地"队列已完成"系统通知（设置中默认开启），不会发送任何数据。
- GitHub 和 Ko-fi 按钮只会打开外部页面，PromptQueue 不为此申请 OAuth 权限。
- 设置中的 Google Drive 备份是可选的实验性功能，只有在你主动开启时才会申请 `identity` 权限，且只会访问你 Drive 中专属的 `appDataFolder`，不会读取你的其他文件。详见 [PRIVACY.md](./PRIVACY.md)。

完整隐私权政策见 [PRIVACY.md](./PRIVACY.md)。

### 已知限制

- ChatGPT、Gemini 或 Claude 的 DOM 改版可能导致选择器失效，因为这些网页不是公开自动化 API。
- PromptQueue 无法控制模型服务商内部队列或模型内部状态。
- 默认模型切换是尽力而为，因为模型菜单、模型名称和账号可用模型会因服务商、订阅、地区和 UI 版本不同而变化。
- 回复完成依赖可见 DOM 状态推断，特别动态的回复可能需要调整等待时间。
- PromptQueue 不应用于绕过平台限制、速率限制或产品规则。

### 开发说明

- 仓库：`https://github.com/hanx-777/PromptQueue`
- 源码入口：`src/content/index.tsx`
- 内容脚本输出：`dist/assets/content.js`
- 后台 Service Worker 输出：`dist/assets/background.js`
- Manifest 源文件：`manifest.json`
- Manifest 构建产物：`dist/manifest.json`
- 图标目录：`public/icons`
- Vite 构建关闭 content script 代码分割，并为 Manifest V3 输出稳定的 content/background 文件名。
- 质量检查：`npm run test`、`npm run build`，或使用 `npm run check` 同时运行测试和构建。
