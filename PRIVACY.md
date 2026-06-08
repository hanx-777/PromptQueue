# PromptQueue Privacy Policy

PromptQueue 隐私权政策

Last updated: 2026-06-08

最后更新：2026-06-08

## English

PromptQueue is a local Chrome/Edge extension for queueing prompts, reusing workflows, and steering the next message on supported AI chat pages.

### Data Collection

PromptQueue does not collect, sell, transmit, or share personal information.

PromptQueue does not:

- upload prompts, queue data, workflows, or settings to any server
- read cookies
- collect account information
- scrape authentication tokens
- call private ChatGPT, Gemini, Claude, or other provider APIs
- use analytics, telemetry, tracking pixels, or remote logging

### Local Storage

PromptQueue stores the following data only in `chrome.storage.local` on your device:

- current queue tasks
- saved workflows
- extension settings
- language preference
- panel collapsed state and panel width
- provider model preferences
- recent error or reload warning state
- local run log entries with task status, provider, timestamps, attempt counts, errors, and prompt previews
- temporary pending right-click context actions, containing only the action type, user-selected text, page title, page URL, and creation time

Text Compare input is session-only. The original and revised text you paste into the Compare tab is kept only in the current page session state and is not written to `chrome.storage.local`.

Workflow variable values are also session-only. They are used to create ordinary queue messages when you run a workflow and are not stored as separate variable history.

Right-click context actions are created only when you choose a PromptQueue browser context-menu item. If the action starts from a non-supported webpage, it is stored briefly until a supported AI page opens and consumes it into the queue; consumed actions are cleared immediately.

You can remove this data by clearing the extension storage, uninstalling the extension, or using the extension's queue/workflow clear controls.

### Permissions

PromptQueue requests only:

- `storage`, used to save queue, workflow, and settings data locally
- `contextMenus`, used to show user-initiated right-click actions for selected text and page context
- host permissions for supported AI chat pages:
  - `https://chatgpt.com/*`
  - `https://chat.openai.com/*`
  - `https://gemini.google.com/*`
  - `https://claude.ai/*`

PromptQueue does not request `tabs`, `cookies`, `webRequest`, `scripting`, `activeTab`, or other sensitive permissions.

### How PromptQueue Works

PromptQueue works only through visible page interactions. It fills the visible composer, clicks visible send/stop/model controls, and observes visible DOM changes to determine when a reply appears complete.

PromptQueue does not bypass login, platform limits, provider rules, or account restrictions.

### Third-Party Sites

PromptQueue runs on supported AI chat websites that you open and log into yourself. Your use of ChatGPT, Gemini, Claude, GitHub, Ko-fi, or WeChat Pay is governed by those services' own privacy policies.

The GitHub Star and Ko-fi buttons open external websites in your browser. PromptQueue does not receive data from those services and does not request OAuth permission.

### Donations

The WeChat Pay QR code is a static local image bundled with the extension. PromptQueue does not track whether you view, scan, or use it.

### Changes

This privacy policy may be updated when PromptQueue changes. Updates will be published in this repository.

### Contact

For privacy questions, open an issue at:

https://github.com/hanx-777/PromptQueue/issues

## 中文

PromptQueue 是一个本地运行的 Chrome / Edge 扩展，用于在支持的 AI 对话网页中排队发送提示词、复用工作流并控制下一步输入。

### 数据收集

PromptQueue 不收集、不出售、不传输、不分享任何个人信息。

PromptQueue 不会：

- 上传提示词、队列数据、工作流或设置到任何服务器
- 读取 Cookie
- 收集账号信息
- 抓取认证 Token
- 调用 ChatGPT、Gemini、Claude 或其他服务商的私有 API
- 使用分析、遥测、跟踪像素或远程日志

### 本地存储

PromptQueue 只会在你设备上的 `chrome.storage.local` 中保存以下数据：

- 当前队列任务
- 已保存工作流
- 扩展设置
- 语言偏好
- 面板折叠状态和面板宽度
- 各 AI 页面的默认模型偏好
- 最近一次错误或刷新中断提示
- 本地运行记录，包括任务状态、服务商、时间、尝试次数、错误和 prompt 预览
- 临时待处理右键上下文 action，只包含 action 类型、用户选中的文本、页面标题、页面 URL 和创建时间

文本对比输入只保存在当前页面会话中。你粘贴到“对比”标签页的原文和新版文本不会写入 `chrome.storage.local`。

工作流变量值也只在当前会话中使用。它们会在运行工作流时生成普通队列消息，不会作为单独的变量历史保存。

右键上下文 action 只会在你主动选择 PromptQueue 浏览器右键菜单项时创建。如果 action 来自非支持网页，它会被短暂保存，直到支持的 AI 页面打开并消费进队列；消费完成后会立即清除。

你可以通过清空扩展存储、卸载扩展，或使用扩展内的队列/工作流清理功能删除这些数据。

### 权限

PromptQueue 只请求：

- `storage`：用于在本地保存队列、工作流和设置
- `contextMenus`：用于显示由用户主动触发的选中文本和页面上下文右键菜单
- 支持的 AI 对话网页 host permissions：
  - `https://chatgpt.com/*`
  - `https://chat.openai.com/*`
  - `https://gemini.google.com/*`
  - `https://claude.ai/*`

PromptQueue 不申请 `tabs`、`cookies`、`webRequest`、`scripting`、`activeTab` 或其他敏感权限。

### 工作方式

PromptQueue 只通过可见网页交互工作。它会填入可见输入框、点击可见发送/停止/模型控件，并观察可见 DOM 变化来判断回复是否完成。

PromptQueue 不绕过登录、不绕过平台限制、不绕过服务商规则，也不绕过账号权限。

### 第三方网站

PromptQueue 运行在你自己打开并登录的 AI 对话网站上。你使用 ChatGPT、Gemini、Claude、GitHub、Ko-fi 或微信支付时，受这些服务各自的隐私政策约束。

GitHub Star 和 Ko-fi 按钮只会在浏览器中打开外部网站。PromptQueue 不会从这些服务接收数据，也不会申请 OAuth 权限。

### 打赏

微信支付收款码是随扩展打包的本地静态图片。PromptQueue 不追踪你是否查看、扫码或使用该图片。

### 政策更新

如果 PromptQueue 的功能发生变化，本隐私权政策可能会更新。更新会发布在本仓库中。

### 联系方式

如有隐私相关问题，请在 GitHub 仓库提交 issue：

https://github.com/hanx-777/PromptQueue/issues
