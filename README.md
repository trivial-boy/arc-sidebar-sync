# Arc Sidebar Sync

一个自托管的 Arc 侧边栏同步工具，目标是替代失效的 Arc Sync。

现在包含两部分：

- `helper`
  - 本地命令行程序，负责读写 Arc 数据文件、备份、和 OSS 通信
- `extension`
  - 可加载到 Arc 的 Chrome 扩展，负责 UI、配置、状态展示和触发同步

当前版本是一个可运行的 MVP：

- 客户端读取本机 Arc 数据文件
- 直接推送快照到你的 OSS / S3 兼容对象存储
- 直接从对象存储拉取最新快照
- 在本地回写前自动备份
- 支持定时循环同步

## 当前同步范围

默认同步这两个文件：

- `StorableSidebar.json`
- `StorableArchiveItems.json`

对应 macOS 默认目录：

```bash
~/Library/Application Support/Arc
```

## 同步策略

当前采用简单、稳妥的策略：

- 每台机器上传自己的完整快照
- 对象存储保存每台机器最近一次上传的数据
- 同时维护一个全局 `latest.json` 快照
- 客户端按 `updatedAt` 做 last-write-wins
- 如果远端更新且本地 Arc 正在运行，默认不覆盖本地文件

这意味着它更像“单份共享状态同步”，不是复杂的三方合并器。

如果两台机器同时频繁修改 Arc 数据，最后一次修改时间更新的那台会获胜。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 用阿里云 OSS 做一次同步

```bash
node ./src/index.js sync \
  --backend s3 \
  --machine-id macbook-home \
  --bucket your-bucket \
  --endpoint https://oss-cn-hangzhou.aliyuncs.com \
  --region oss-cn-hangzhou \
  --access-key-id your-access-key-id \
  --secret-access-key your-secret-access-key
```

### 3. 开启定时同步

每 60 秒同步一次：

```bash
node ./src/index.js sync \
  --backend s3 \
  --machine-id macbook-home \
  --bucket your-bucket \
  --endpoint https://oss-cn-hangzhou.aliyuncs.com \
  --region oss-cn-hangzhou \
  --access-key-id your-access-key-id \
  --secret-access-key your-secret-access-key \
  --interval 60
```

### 4. 查看当前对象存储状态

```bash
node ./src/index.js status \
  --backend s3 \
  --machine-id macbook-home \
  --bucket your-bucket \
  --endpoint https://oss-cn-hangzhou.aliyuncs.com \
  --region oss-cn-hangzhou \
  --access-key-id your-access-key-id \
  --secret-access-key your-secret-access-key
```

## 也支持本地文件后端

如果你想先在本机联调，不接 OSS，也可以先用文件系统模拟对象存储：

```bash
node ./src/index.js sync \
  --backend file \
  --machine-id macbook-home \
  --store-dir ./work/object-store
```

## 客户端参数

- `--machine-id`
  - 必填，建议每台机器固定唯一，比如 `macbook-home`、`macbook-work`
- `--backend`
  - 可选，`s3` 或 `file`，默认 `s3`
- `--bucket`
  - `s3` 后端必填，OSS bucket 名称
- `--endpoint`
  - `s3` 后端必填，例如 `https://oss-cn-hangzhou.aliyuncs.com`
- `--region`
  - `s3` 后端可选，默认 `oss-cn-hangzhou`
- `--access-key-id`
  - `s3` 后端必填
- `--secret-access-key`
  - `s3` 后端必填
- `--prefix`
  - 可选，对象存储中的目录前缀，默认 `arc-sync`
- `--store-dir`
  - `file` 后端必填，本地存储目录
- `--arc-dir`
  - 可选，Arc 数据目录
- `--backup-dir`
  - 可选，本地备份目录，默认 `./work/backups`
- `--include-archive false`
  - 可选，不同步归档标签文件
- `--dry-run`
  - 可选，只打印动作，不真正写入
- `--force-write`
  - 可选，即使 Arc 正在运行也允许写本地文件
- `--interval 60`
  - 可选，循环同步间隔，单位秒

## OSS 中的对象结构

默认会写入这些对象：

```text
arc-sync/
├── latest.json
└── machines/
    ├── macbook-home.json
    └── macbook-work.json
```

## 推荐部署方式

### 客户端

macOS 推荐用 `launchd` 或 `crontab` 定时启动。

如果你想持续运行一个守护进程，用 `--interval 60` 最简单。

如果你用阿里云 OSS，建议：

- 单独建一个 bucket 用于 Arc 同步
- 给这个工具创建专用 RAM 子账号
- 只授予该 bucket 的读写权限
- bucket 开启版本控制，这样误同步后还能回滚对象历史

## 风险和限制

当前版本有这些限制：

- 不做字段级合并，只做整文件快照同步
- 没有冲突队列，也没有人工确认流程
- 默认只考虑 macOS Arc 数据目录
- Arc 运行中可能继续改写文件，所以默认避免热覆盖
- 目前还没有对象锁或分布式锁，极端情况下仍可能发生近同时写入覆盖

## 插件化使用

最接近“一键使用”的方式是：

1. 在 Arc 中加载扩展目录 `extension/`
2. 安装 helper
3. 注册 Native Messaging host
4. 打开扩展，自动探测 helper
5. 填写 OSS 配置并点击同步

### 1. 加载扩展

当前仓库提供了一个可本地加载的 MV3 扩展：

```text
extension/
```

在 Arc 中打开扩展开发者模式后，加载这个目录即可。

### 2. 安装 helper

当前这个仓库里，最直接的本地开发安装方式是：

```bash
cd /Users/gemengying/Documents/Codex/2026-06-23/arc-github
npm install
```

未来发布到你自己的 Homebrew tap 后，社区安装可以变成：

```bash
brew install your-org/tap/arc-sidebar-sync
```

对应骨架已经放在：

[`packaging/homebrew/arc-sidebar-sync.rb`](/Users/gemengying/Documents/Codex/2026-06-23/arc-github/packaging/homebrew/arc-sidebar-sync.rb)

### 3. 注册 Native Messaging host

扩展安装后会显示当前扩展 ID。拿到它以后执行：

```bash
arc-sync install-native-host --extension-id YOUR_EXTENSION_ID --browser arc
```

这个命令会：

- 安装本地 wrapper
- 写入 Native Messaging manifest
- 允许扩展通过 `net.arc.sidebar_sync` 与 helper 通信

目前会尝试写入以下浏览器目录之一：

- `~/Library/Application Support/Arc/NativeMessagingHosts`
- `~/Library/Application Support/Google/Chrome/NativeMessagingHosts`
- `~/Library/Application Support/Chromium/NativeMessagingHosts`
- `~/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts`
- `~/Library/Application Support/Microsoft Edge/NativeMessagingHosts`

### 4. 在扩展中配置 OSS

扩展弹窗目前支持：

- 检测 helper 是否可达
- 展示 `brew install` 命令
- 展示 `install-native-host` 命令
- 保存 OSS 参数到本地 helper 配置
- 查看状态
- 触发一次同步

Helper 配置文件默认保存在：

```bash
~/Library/Application Support/arc-sidebar-sync/config.json
```

## 后续最值得补的能力

如果你准备长期自用，下一步最值得做的是：

1. 增加“远端比本地新，但 Arc 正在运行”时的延迟应用队列
2. 针对 `StorableSidebar.json` 做结构化 diff，而不是整文件覆盖
3. 增加基于 ETag/版本号 的乐观并发控制
4. 为客户端加 launchd plist 生成器
5. 支持 WebDAV / Git 仓库作为额外后端存储

## 本地自检

```bash
npm run test:smoke
npm run test:native-host
```

这个测试会：

- 用文件后端模拟对象存储
- 用你当前机器的 Arc 数据执行一次真实同步
- 再读取存储状态确认写入成功

Native host 测试会：

- 向 helper 发送一个 `ping`
- 验证 Native Messaging 二进制协议
- 确认 helper 能正确返回状态
