#!/bin/bash
# =============================================================================
# Smart Capture Tool - アンインストールスクリプト
# =============================================================================

echo ""
echo "Smart Capture Tool をアンインストールします"
echo ""

read -p "node_modules を削除しますか? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf node_modules
    echo "✓ node_modules を削除しました"
fi

read -p "output フォルダ (キャプチャしたPDF) を削除しますか? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf output
    echo "✓ output を削除しました"
fi

read -p "設定ファイルを削除しますか? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -f runtime-config.json auth-config.json
    echo "✓ 設定ファイルを削除しました"
fi

echo ""
echo "アンインストール完了"
echo "このフォルダ自体を削除するには: rm -rf $(pwd)"
