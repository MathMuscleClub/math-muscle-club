# 数学科筋トレ部 ホームページ

数学を愛し、筋肉を愛する「数学科筋トレ部」の公式ホームページです。

## 🌐 公開URL
https://warabimochi23.github.io/math-muscle-club/

---

## 🔐 ログイン機能の設定

ログインはSupabase Authを使います。サイトに置くのは公開してよい接続情報だけです。

1. SupabaseのProject SettingsでProject URLとpublishable/anon keyを確認します。
2. `supabase-config.js` を開き、次のように入れます。

```js
window.SUPABASE_CONFIG = {
    url: "https://xxxx.supabase.co",
    anonKey: "公開用のanonまたはpublishable key",
    allowedEmailDomains: ["example.ac.jp"],
    googleHostedDomain: "example.ac.jp"
};
```

`allowedEmailDomains` は画面側の入力チェックです。`googleHostedDomain` はGoogleログイン画面へのヒントです。どちらもセキュリティ本体ではないので、下のAuth HookとRLSも必ず設定してください。

### Googleログインを有効にする

1. Supabaseで `Authentication` → `Providers` → `Google` を開きます。
2. 表示されているCallback URLを控えます。通常は `https://xxxx.supabase.co/auth/v1/callback` です。
3. Google Cloud ConsoleでOAuth Client IDを作成します。
4. Application typeは `Web application` にします。
5. Authorized JavaScript originsに以下を追加します。
   - `https://warabimochi23.github.io`
   - `http://localhost:8000`
   - `http://localhost:8010`（8010番で確認する場合）
6. Authorized redirect URIsに、SupabaseのGoogle provider画面に出ているCallback URLを追加します。
7. 作成したClient IDとClient SecretをSupabaseのGoogle provider画面に入力して保存します。

### Redirect URLを設定する

Supabaseで `Authentication` → `URL Configuration` を開きます。

Site URL:

```text
https://warabimochi23.github.io/math-muscle-club/
```

Redirect URLs:

```text
https://warabimochi23.github.io/math-muscle-club/
http://localhost:8000/
http://localhost:8010/
```

### ドメイン制限を有効にする

`supabase/auth-domain-restriction.sql` の `example.ac.jp` を許可したいドメインに置き換え、SupabaseのSQL Editorで実行します。

その後、Supabaseで `Authentication` → `Hooks` → `Before User Created` を開き、Postgres functionとして `public.hook_restrict_signup_by_email_domain` を選んで保存します。

書き込みテーブルを作るときは、同じSQLファイル末尾のRLS例をテーブル名に合わせて使います。

---

## ✍️ 部員向け：ホームページの更新マニュアル（データの追加方法）

このホームページは、HTMLやCSSのコードを直接書き換えることなく、**GitHub上でJSONファイルを編集するだけ**で自動的に内容が更新されるようになっています。

共同作業するメンバーは、以下の手順に沿ってデータを追加・更新してください。

### 🔄 更新の手順（ブラウザ上での操作）
1. GitHubの本リポジトリページを開きます。
2. 更新したいJSONファイル（例：`diary.json`）をクリックして開きます。
3. 画面右上にある **鉛筆アイコン（Edit this file）** をクリックします。
4. データを編集・追加します（下記ファイル別の編集方法を参照）。
5. 編集が終わったら、右上の **「Commit changes...（変更をコミット）」** ボタンを押し、変更内容を入力して保存します。
6. 保存後、**数十秒で自動的にホームページへ反映**されます。

---

### 📂 各JSONファイルの編集方法

#### 1. 活動日記を追加する (`diary.json`)
活動日記は、新しい順に上に表示されます。新しい日記を追加する場合は、配列の**先頭（ `[` の直後）**にデータを追加してください。

```json
[
  {
    "date": "2026-05-29",
    "dayOfWeek": "金",
    "author": "高木貞治",
    "title": "日記のタイトル",
    "content": "日記の本文です。改行したい場合はこのように \\n （バックスラッシュまたは円マーク + n）を入れてください。"
  },
  ...（過去の日記データ）
]
```

#### 2. 目標や実績を更新する (`goals.json`)
- **今年の目標 (`yearlyGoals`)**:
  配列の中に目標をテキストで追記します。
- **今月・過去の目標 (`monthlyGoals`)**:
  - 新しい月目標を追加する場合は、配列の最後に新しいオブジェクトを追加します。
  - 各目標項目の `"status"` は、以下の3つのいずれかを指定してください：
    - `"pending"` : 進行中（ホームページ上では「進行中」の黒バッジが表示されます）
    - `"achieved"` : 達成（「達成」のグレーバッジが表示されます）
    - `"failed"` : 未達成（「未達成」の点線バッジが表示されます）
- **これまでの実績 (`achievements`)**:
  達成した実績をテキストで追記します。

#### 3. 部員を追加・変更する (`members.json`)
部員を新しく追加する場合は、配列の最後にデータを追加します。

```json
[
  ...
  {
    "name": "部員名",
    "role": "役職名（例: 部員、マネージャーなど）",
    "specialty": "得意種目と記録",
    "url": "個人のブログやGitHubへのリンクURL（ない場合はこの行を省略できます）"
  }
]
```
- **urlの省略**: ホームページやブログが無い部員の場合は、`"url"` の行をまるごと省略できます。自動的に「なし」と表示されます。
- **roleの省略**: 役職が無い部員の場合は、`"role"` の行を省略できます。その場合はカッコ `()` なしで名前だけが表示されます。

#### 4. 日替わりトレーニングを追加・変更する (`trainings.json`)
トップの「今日のトレーニング」に、登録されているメニューの中から1日1つ表示されます。同じ日なら同じメニューが表示され、日付が変わると別のメニューに切り替わります。

```json
[
  {
    "name": "ベンチプレス基礎",
    "target": "胸・肩・上腕三頭筋",
    "menu": [
      "ベンチプレス 5回 × 5セット",
      "インクラインダンベルプレス 10回 × 3セット"
    ],
    "point": "肩甲骨を寄せて、フォームを崩さず扱える重さで行う。"
  }
]
```

#### 5. 毎週の予定を追加・変更する (`recurring-schedule.json`)
カレンダーに毎週くり返す予定を自動表示できます。`daysOfWeek` は曜日を数字で指定します。

- `0`: 日曜日
- `1`: 月曜日
- `2`: 火曜日
- `3`: 水曜日
- `4`: 木曜日
- `5`: 金曜日
- `6`: 土曜日

```json
[
  {
    "daysOfWeek": [3],
    "title": "合同トレーニング (胸・腕)",
    "time": "13:00 - 14:00",
    "location": "第2体育館トレーニング室",
    "description": "ベンチプレスとアームカールを中心に行います。",
    "startDate": "2026-06-01"
  }
]
```

単発予定を入れる `schedule.json` に同じ日付の予定がある場合は、そちらが優先して表示されます。
