class ArcSidebarSync < Formula
  desc "Local helper for syncing Arc sidebar data through OSS"
  homepage "https://github.com/trivial-boy/arc-sidebar-sync"
  url "https://github.com/trivial-boy/arc-sidebar-sync/archive/refs/tags/v0.1.0.tar.gz"
  sha256 "REPLACE_WITH_REAL_TARBALL_SHA256"
  license "MIT"

  depends_on "node"

  def install
    libexec.install Dir["*"]
    (bin/"arc-sync").write <<~EOS
      #!/bin/sh
      exec "#{Formula["node"].opt_bin}/node" "#{libexec}/src/index.js" "$@"
    EOS
    chmod 0755, bin/"arc-sync"
  end

  test do
    assert_match "arc-sync", shell_output("#{bin}/arc-sync help")
  end
end
