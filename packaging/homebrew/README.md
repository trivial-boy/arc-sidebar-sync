# Homebrew Publishing Notes

当前仓库还没有正式发布到 Homebrew，所以这条命令现在不会成功：

```bash
brew install arc-sidebar-sync
```

要让社区真的能安装，需要两件事：

1. 创建一个 Homebrew tap 仓库
2. 把 `arc-sidebar-sync.rb` 发布到那个 tap

推荐流程：

## 1. 创建 tap 仓库

仓库名建议：

```text
homebrew-tap
```

发布后用户安装方式会是：

```bash
brew install your-org/tap/arc-sidebar-sync
```

## 2. 发布 release tarball

给当前项目打 tag，例如：

```bash
git tag v0.1.0
git push origin v0.1.0
```

然后拿到 GitHub 自动生成的源码 tarball URL。

## 3. 计算 sha256

```bash
curl -L https://github.com/your-org/arc-sidebar-sync/archive/refs/tags/v0.1.0.tar.gz -o arc-sidebar-sync-v0.1.0.tar.gz
shasum -a 256 arc-sidebar-sync-v0.1.0.tar.gz
```

把结果填进：

```text
packaging/homebrew/arc-sidebar-sync.rb
```

## 4. 提交 formula 到 tap

把 `arc-sidebar-sync.rb` 放到 tap 仓库的 `Formula/` 目录下：

```text
Formula/arc-sidebar-sync.rb
```

## 5. 验证安装

```bash
brew install your-org/tap/arc-sidebar-sync
arc-sync help
```
