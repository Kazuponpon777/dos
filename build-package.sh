#!/bin/bash
# =============================================================================
# Smart Capture Tool - 配布パッケージ作成スクリプト
# =============================================================================

set -e

VERSION="1.1.0"
PACKAGE_NAME="smart-capture-${VERSION}"
DIST_DIR="dist"

echo "Smart Capture Tool v${VERSION} - 配布パッケージを作成します"
echo ""

# distディレクトリ作成
rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}/${PACKAGE_NAME}"

# 必要なファイルをコピー
echo "▶ ファイルをコピー中..."

cp -r lib "${DIST_DIR}/${PACKAGE_NAME}/"
cp -r public "${DIST_DIR}/${PACKAGE_NAME}/"
cp package.json "${DIST_DIR}/${PACKAGE_NAME}/"
cp package-lock.json "${DIST_DIR}/${PACKAGE_NAME}/" 2>/dev/null || true
cp server.js "${DIST_DIR}/${PACKAGE_NAME}/"
cp config.js "${DIST_DIR}/${PACKAGE_NAME}/"
cp install.sh "${DIST_DIR}/${PACKAGE_NAME}/"
cp uninstall.sh "${DIST_DIR}/${PACKAGE_NAME}/"
cp README.md "${DIST_DIR}/${PACKAGE_NAME}/"

# 実行権限を付与
chmod +x "${DIST_DIR}/${PACKAGE_NAME}/install.sh"
chmod +x "${DIST_DIR}/${PACKAGE_NAME}/uninstall.sh"

# tarball作成
echo "▶ tarball を作成中..."
cd "${DIST_DIR}"
tar -czvf "${PACKAGE_NAME}.tar.gz" "${PACKAGE_NAME}"
cd ..

# 完了
echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║         パッケージ作成完了！              ║"
echo "╚═══════════════════════════════════════════╝"
echo ""
echo "出力ファイル:"
echo "  ${DIST_DIR}/${PACKAGE_NAME}.tar.gz"
echo ""
echo "サイズ:"
ls -lh "${DIST_DIR}/${PACKAGE_NAME}.tar.gz" | awk '{print "  " $5}'
echo ""
echo "配布方法:"
echo "  1. ${PACKAGE_NAME}.tar.gz を配布"
echo "  2. 受信者: tar -xzvf ${PACKAGE_NAME}.tar.gz"
echo "  3. 受信者: cd ${PACKAGE_NAME} && ./install.sh"
echo ""
