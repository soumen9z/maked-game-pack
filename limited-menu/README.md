
# 今だけメニュー

GitHub Actions が日本時間の 3:17、9:17、15:17、21:17 を目安に、7チェーンの公式サイトから `menu.json` を生成して GitHub Pages に公開します。ページは JSON に記録された販売開始・終了日時と曜日を使い、日本時間で表示対象を判定します。終了日時が分からない商品は、次回の公式情報の取得時に掲載状況を反映します。

リポジトリの Settings → Pages → Build and deployment → Source で **GitHub Actions** を選びます。既定ブランチへの反映後は Actions の **GitHub Pages を更新** から手動実行もできます。既存のゲームページも同じワークフローで公開します。

ソースから直接配信する場合にも一覧が表示されるよう、初期データの `menu.json` を同梱しています。このディレクトリで `node --use-system-ca update.mjs .` を実行すると初期データを更新できます。定期更新時は公開用の一覧を別途生成します。

ローカルでは、このディレクトリから Node.js 22.16 以降と Python で確認できます。

```sh
node --use-system-ca update.mjs
python -m http.server 8787 --bind 127.0.0.1 --directory dist
```

ブラウザーで http://127.0.0.1:8787/ を開きます。
