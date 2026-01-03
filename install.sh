#!/bin/bash
# =============================================================================
# Smart Capture Tool - インストールスクリプト
# =============================================================================

set -e

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║   Smart Capture Tool - Installer v1.0     ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# 色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ヘルパー関数
success() { echo -e "${GREEN}✓${NC} $1"; }
warning() { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; exit 1; }

# =============================================================================
# 1. Node.js チェック
# =============================================================================
echo "▶ Node.js をチェック中..."

if command -v node &> /dev/null; then
    NODE_VERSION=$(node -v)
    success "Node.js ${NODE_VERSION} が見つかりました"
else
    error "Node.js がインストールされていません。
    
インストール方法:
  Ubuntu/Debian: sudo apt install nodejs npm
  Fedora: sudo dnf install nodejs npm
  Arch: sudo pacman -S nodejs npm
  
または Node.js 公式サイト: https://nodejs.org/"
fi

# Node.js バージョンチェック (v16以上推奨)
NODE_MAJOR=$(node -v | cut -d'.' -f1 | tr -d 'v')
if [ "$NODE_MAJOR" -lt 16 ]; then
    warning "Node.js v16以上を推奨します (現在: $(node -v))"
fi

# =============================================================================
# 2. Puppeteer/Chromium 依存関係
# =============================================================================
echo ""
echo "▶ Chromium 依存関係をチェック中..."

MISSING_DEPS=""

# 主要な依存関係をチェック
for lib in libnss3 libatk1.0-0 libcups2 libasound2; do
    if ! dpkg -l | grep -q "$lib"; then
        MISSING_DEPS="$MISSING_DEPS $lib"
    fi
done

if [ -n "$MISSING_DEPS" ]; then
    warning "一部の依存関係が不足しています"
    echo ""
    echo "以下のコマンドでインストールできます:"
    echo -e "${YELLOW}sudo apt-get install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2${NC}"
    echo ""
    read -p "今すぐインストールしますか? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo apt-get update
        sudo apt-get install -y \
            libnss3 libatk1.0-0 libatk-bridge2.0-0 \
            libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
            libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2
        success "依存関係をインストールしました"
    else
        warning "依存関係がないと Puppeteer が動作しない可能性があります"
    fi
else
    success "必要な依存関係がインストールされています"
fi

# =============================================================================
# 3. npm パッケージインストール
# =============================================================================
echo ""
echo "▶ npm パッケージをインストール中..."

if [ -f "package.json" ]; then
    npm install --production 2>/dev/null || npm install
    success "npm パッケージをインストールしました"
else
    error "package.json が見つかりません。正しいディレクトリで実行してください。"
fi

# =============================================================================
# 4. 出力ディレクトリ作成
# =============================================================================
echo ""
echo "▶ 出力ディレクトリを作成中..."

mkdir -p output
mkdir -p output/batch
success "output ディレクトリを作成しました"

# =============================================================================
# 5. 起動スクリプト作成
# =============================================================================
echo ""
echo "▶ 起動スクリプトを作成中..."

cat > start.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
echo "Smart Capture Tool を起動中..."
echo "ブラウザで http://localhost:3000 を開いてください"
echo "終了するには Ctrl+C を押してください"
echo ""
node server.js
EOF

chmod +x start.sh
success "start.sh を作成しました"

# =============================================================================
# 完了
# =============================================================================
echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║         インストール完了！                ║"
echo "╚═══════════════════════════════════════════╝"
echo ""
echo "起動方法:"
echo "  ./start.sh"
echo ""
echo "または:"
echo "  npm start"
echo ""
echo "ダッシュボードURL:"
echo "  http://localhost:3000/controller.html"
echo ""
