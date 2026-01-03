module.exports = {
  // 対象のURL
  url: "https://magazine.rakuten.co.jp/read/C8A0B4CD227432A3F4F056A3429AD757",

  // モード選択: 'scroll' (縦スクロール) または 'slide' (矢印キー遷移)
  mode: "slide",

  // 保存先ディレクトリ
  outputDir: "./output",

  // 出力ファイル名 (拡張子なし)
  outputFilename: "result",

  // ブラウザ設定
  browser: {
    headless: false, // ヘッドレスモード (画面を表示しない場合は 'new' or true, 表示する場合は false)
    defaultViewport: {
      width: 1280,
      height: 800,
    },
  },

  // Scrollモードの設定
  scroll: {
    // スクロールごとの待機時間 (ミリ秒) - Lazy Load対策
    delay: 1000,
    // PDFにするか画像にするか: 'pdf' or 'image'
    outputType: "pdf",
  },

  // Slideモードの設定
  slide: {
    // 次のページに進むキー: 'ArrowRight' (左開き/横書き), 'ArrowLeft' (右開き/縦書き), 'Space', etc.
    nextKey: "ArrowRight",
    // ページ遷移後の待機時間 (ミリ秒) - 遅延対策で5秒に設定
    delay: 5000,
    // 最大ページ数 (デフォルト値。実行時に入力がない場合に使用)
    maxPages: 100,
    // トリミング設定 (必要な場合のみ数値を設定。不要な場合は null)
    // 例: { x: 0, y: 0, width: 1280, height: 800 }
    clip: null,
  },
};
