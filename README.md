# Smart Capture Tool v1.1

Webページを自動でスクリーンショット撮影し、PDFに変換するツールです。
**OCR対応で文字検索可能なPDFを生成できます。**

## 動作環境

- **OS**: Linux (Ubuntu/Debian推奨)
- **Node.js**: v16以上
- **ブラウザ**: Chromium (自動ダウンロード)

## インストール

```bash
# 1. 展開
tar -xzvf smart-capture.tar.gz
cd smart-capture

# 2. インストール
chmod +x install.sh
./install.sh
```

## 使い方

### 起動

```bash
./start.sh
# または
npm start
```

### ダッシュボード

ブラウザで開く: **http://localhost:3000/controller.html**

### 基本操作

1. **ブラウザ起動** - Puppeteerブラウザを起動
2. ブラウザで対象ページに移動
3. **範囲設定** - トリミング範囲を設定（オプション）
4. **総ページ数**を入力
5. **開始** - キャプチャ開始
6. **停止して保存** - PDFとして保存

### OCR（文字検索可能PDF）

1. 設定パネルで「**OCR（文字検索可）**」にチェック
2. 「**保存**」をクリック
3. キャプチャを実行
4. 生成されたPDFは `Ctrl+F` で文字検索可能

**注意**: OCR処理には時間がかかります

## 設定

| 設定 | 説明 |
|------|------|
| 待機時間 | ページ読み込み待ち秒数 |
| ページ送り方向 | 矢印キーの方向 |
| 画像形式 | PNG（高品質）/ JPEG（軽量） |
| OCR | 文字検索可能PDFを生成 |

## API

| エンドポイント | 機能 |
|--------------|------|
| `POST /api/browser/launch` | ブラウザ起動 |
| `POST /api/capture/start` | キャプチャ開始 |
| `POST /api/capture/stop` | 停止＆保存 |
| `GET /api/history` | PDF履歴 |
| `DELETE /api/history/:file` | 履歴削除 |
| `GET /api/config` | 設定取得 |
| `POST /api/config` | 設定更新 |

## トラブルシューティング

### Puppeteerが起動しない
```bash
sudo apt-get install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
  libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2
```

### ポート3000が使用中
```bash
lsof -i :3000
kill -9 <PID>
```

### OCRが遅い
- ページ数が多いと時間がかかります
- 初回はTesseractの言語モデルダウンロードが発生します

## 変更履歴

### v1.1 (2026-01-03)
- OCR機能追加（日本語+英語対応）
- 履歴削除機能追加
- 操作説明パネル追加
- ブラウザ再起動バグ修正
- 日本時間対応

### v1.0
- 初回リリース

## ライセンス

MIT License
