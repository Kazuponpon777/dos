# Smart Capture Tool v1.1

Webページを自動でスクリーンショット撮影し、PDFに変換するツールです。
OCR対応で文字検索可能なPDFを生成できます。

---

## ダウンロード＆インストール手順

### 必要環境

- Linux (Ubuntu/Debian推奨)
- Node.js v16以上
- Git

### 手順

```bash
# 1. リポジトリをクローン
git clone https://github.com/Kazuponpon777/dos.git

# 2. ディレクトリに移動
cd dos

# 3. インストール実行
chmod +x install.sh
./install.sh
```

---

## 起動方法

```bash
# start.shで起動
./start.sh

# または
npm start
```

起動後、ブラウザで開く:
**http://localhost:3000/controller.html**

---

## 基本操作

1. **ブラウザ起動** をクリック
2. 起動したブラウザで対象ページに移動
3. **総ページ数**を入力
4. **開始** をクリック → 自動キャプチャ
5. **停止して保存** → PDF生成

### OCR（文字検索可能PDF）

1. 設定パネルで「OCR（文字検索可）」にチェック
2. 「保存」をクリック
3. キャプチャを実行

---

## 設定項目

| 設定 | 説明 |
|------|------|
| 待機時間 | ページ読み込み待ち秒数 |
| ページ送り方向 | →右/←左/↓下/↑上 |
| 画像形式 | PNG（高品質）/JPEG（軽量） |
| OCR | 文字検索可能PDFを生成 |

---

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

---

## ライセンス

MIT License
