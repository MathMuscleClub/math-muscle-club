# 数学科筋トレ部 ホームページ

数学を愛し、筋肉を愛する「数学科筋トレ部」の公式ホームページです。

## 🌐 公開URL
https://mathmuscleclub.github.io/math-muscle-club/

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
   - `https://mathmuscleclub.github.io`
   - `http://localhost:8000`
   - `http://localhost:8010`（8010番で確認する場合）
6. Authorized redirect URIsに、SupabaseのGoogle provider画面に出ているCallback URLを追加します。
7. 作成したClient IDとClient SecretをSupabaseのGoogle provider画面に入力して保存します。

### Redirect URLを設定する

Supabaseで `Authentication` → `URL Configuration` を開きます。

Site URL:

```text
https://mathmuscleclub.github.io/math-muscle-club/
```

Redirect URLs:

```text
https://mathmuscleclub.github.io/math-muscle-club/
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

---

## 過去問TeX提出・PDF出力機能

過去問解答タブでは、ログイン済みユーザーだけがTeXを提出できます。
初回ログイン後にログインタブでユーザー名を保存し、その名前が提出者名として使われます。
ブラウザにはGitHubの書き込みトークンを置かず、Supabase Edge Functionがログイン確認をしてGitHubへ保存します。

### 基本方針

- 編集画面はファイル単位ではなく、問題単位で扱います。利用者は「2004年度 B 第1問の問題文」「自分の解答」を編集し、保存先のファイル構造はシステム側が決めます。
- 問題文は共有データです。同じ年度・問題区分・問題番号につき `problem.tex` は1つだけ持ちます。
- 解答は投稿者ごとのデータです。同じ問題に複数人が解答を出すと、1つの問題カードの中にタブで並びます。
- PDFはGitHubへ保存しません。サイト上で年度や問題区分を選んだ時だけ、一時生成してダウンロードします。

### 画面での使い方

1. ログインタブでログインし、ユーザー名を保存します。
2. 過去問解答タブを開きます。
3. 問題文を新規登録・更新する場合は、問題カードの「問題文を登録」または「問題文を編集」を押します。
4. 自分の解答を更新する場合は、解答タブ内の「解答を編集」を押します。他人の解答は編集・削除できません。
5. PDFは「PDF出力」パネルを開いて細かく選べます。通常表示で選んでいる年度・問題区分をまとめて出すだけなら、折り畳み見出しの `PDF生成` ボタンでワンクリック生成できます。

### 保存されるもの

- `exam-submissions.json`: 問題文・解答の一覧、提出者名、年度、問題区分などのメタデータ
- `exams/{年度}/{問題区分}/{問題番号}/problem.tex`: 共有の問題文TeX
- `exams/{年度}/{問題区分}/{問題番号}/submissions/{提出ID}/answer.tex`: 投稿者ごとの解答TeX

問題文は削除ではなく編集で更新します。解答は投稿者本人だけが編集・削除できます。

### TeXメタ情報マクロ

年度・分野・問題区分・問題番号はフォーム入力ではなく、TeX内のマクロから読み取ります。

| マクロ | 必須 | 使う場所 | 説明 |
| --- | --- | --- | --- |
| `\examyear{2004}` | 必須 | 問題文・解答 | 西暦の年度 |
| `\examgroup{B}` | 必須 | 問題文・解答 | A/Bなどの問題区分。互換名は `\examproblemgroup` |
| `\examnumber{1}` | 必須 | 問題文・解答 | 問題番号。互換名は `\examproblemnumber` |
| `\examfield{代数}` | 必須 | 問題文のみ | 分野。互換名は `\examsubject` |
| `\examtag{線形代数}` | 任意 | 問題文のみ | 検索用タグ。複数行書けます |
| `\examera{平成16年}` | 任意 | 問題文・解答 | 和暦などの補助表示 |
| `\examtitle{平成16年 B 第1問}` | 任意 | 問題文・解答 | 表示タイトル |
| `\examsummary{行列の標準形}` | 任意 | 問題文・解答 | 短い要約 |
| `\examrelated{id}{表示名}` | 任意 | 主に問題文 | 関連問題への参照 |

解答TeXには `\examfield`、`\examsubject`、`\examtag` を入れないでください。分野とタグは問題文にだけ持たせます。解答側に入れると、提出時にエラーになります。

### 問題文TeXの例

```tex
\examyear{2004}
\examera{平成16年}
\examfield{代数}
\examgroup{B}
\examnumber{1}
\examtitle{平成16年 B 第1問}
\examtag{線形代数}
\examtag{行列}

本文...
```

### 解答TeXの例

```tex
\examyear{2004}
\examgroup{B}
\examnumber{1}
\examtitle{平成16年 B 第1問 解答}

解答本文...
```

### 1ファイルに複数問を書く場合

1つのTeXに複数の問題文や解答を入れる場合は、各ブロックの先頭にメタ情報マクロを置きます。アップロード時にブロックごとに分割されます。

```tex
\examyear{2004}
\examfield{代数}
\examgroup{B}
\examnumber{1}
第1問の本文...

\examyear{2004}
\examfield{幾何}
\examgroup{B}
\examnumber{2}
第2問の本文...
```

同じアップロード内に、同じ年度・同じ問題区分・同じ問題番号の問題文を複数入れることはできません。どれを共有の `problem.tex` にするか曖昧になるためです。

### 共通マクロのコピー

複数問入りTeXを分割保存するとき、ファイル先頭の共通マクロは、許可リストに載っているものだけ各 `problem.tex` / `answer.tex` の先頭へコピーされます。

コピー元として見る場所は次の2つです。

- `\begin{document}` より前のプリアンブル部分
- `\begin{document}` の中で、最初の `\examyear` や `\examnumber` より前に書かれた共通部分

例えば次のTeXを送ると、`\newcommand{\R}{\mathbb{R}}` と `\DeclareMathOperator{\rank}{rank}` は第1問と第2問の両方にコピーされます。

```tex
\documentclass{jsarticle}
\usepackage{amsmath}
\newcommand{\R}{\mathbb{R}}
\DeclareMathOperator{\rank}{rank}

\begin{document}

\examyear{2004}
\examfield{代数}
\examgroup{B}
\examnumber{1}
$\R^2$ 上の線形写像を考える。

\examyear{2004}
\examfield{代数}
\examgroup{B}
\examnumber{2}
$\rank A$ を求める。

\end{document}
```

保存後の各ファイルは、概ね次の形になります。

```tex
\newcommand{\R}{\mathbb{R}}
\DeclareMathOperator{\rank}{rank}

\examyear{2004}
\examfield{代数}
\examgroup{B}
\examnumber{1}
$\R^2$ 上の線形写像を考える。
```

`\documentclass` や `\usepackage` はコピーされません。PDF全体の文書クラスやパッケージは、PDFレンダラー側の共通テンプレートで管理します。

### 共通マクロ許可リスト

コピーしてよい共通マクロは、GitHub上の `exam-macro-allowlist.json` で管理します。READMEやコードを変更せず、このJSONを編集してコミットすれば、次回アップロードからEdge Functionがそのリストを読みます。

現在の許可リストは次の通りです。

| コマンド | 用途 | 例 |
| --- | --- | --- |
| `\DeclareMathOperator` | 数学演算子名 | `\DeclareMathOperator{\rank}{rank}` |
| `\DeclareMathOperator*` | limits付き演算子名 | `\DeclareMathOperator*{\argmax}{arg\,max}` |
| `\newcommand` | 短い独自マクロ | `\newcommand{\R}{\mathbb{R}}` |
| `\newcommand*` | 段落を含まない独自マクロ | `\newcommand*{\C}{\mathbb{C}}` |
| `\providecommand` | 未定義なら追加するマクロ | `\providecommand{\N}{\mathbb{N}}` |
| `\providecommand*` | 未定義なら追加する短いマクロ | `\providecommand*{\Z}{\mathbb{Z}}` |

`exam-macro-allowlist.json` の形式は次の通りです。

```json
{
  "copyCommands": [
    {
      "name": "newcommand",
      "requiredArgs": 2,
      "optionalArgs": true,
      "maxOptionalArgs": 2
    }
  ]
}
```

- `name`: バックスラッシュなしのコマンド名
- `requiredArgs`: `{...}` で読む必須引数の数
- `optionalArgs`: `[1]` や `[default]` のような任意引数を読むか
- `maxOptionalArgs`: コピー時に読む任意引数の最大数

許可リストには、安全に各ファイルへコピーできる短いマクロだけを入れてください。次のような文書全体に影響するコマンドは入れません。

- `\documentclass`
- `\usepackage`
- `\renewcommand`
- `\newenvironment`
- `\renewenvironment`
- `\input`
- `\include`

### 本文で使える表示用マクロ

サイト上のHTMLプレビューでは、次の簡易マクロを読み取ります。

- `\fold{見出し}{本文}`: 折り畳み表示
- `\hint{本文}`: ヒント枠
- `\strategy{本文}`: 方針枠
- `\begin{enumerate} ... \item ... \end{enumerate}`: 番号付きリスト
- `\begin{itemize} ... \item ... \end{itemize}`: 箇条書き
- `\section*{見出し}`、`\subsection*{見出し}`: 本文内見出し
- `\DeclareMathOperator{\rank}{rank}`: MathJax向けに `\operatorname{rank}` へ変換

通常の数式は `\(...\)` または `\[...\]` で書きます。サイトのプレビューは完全なLaTeXコンパイラではないため、独自パッケージ前提の記法はPDFレンダラー側でしか再現できない場合があります。

### LaTeX/PDF結合時のルール

複数人のTeXを1つの大きなTeXにそのまま連結すると、`\newcommand`、`\newenvironment`、`\usepackage`、カウンタ設定などが衝突する可能性があります。そのためPDF生成では次の方針を取ります。

- ユーザー提出TeXからは本文部分を取り出し、共通テンプレート側で `documentclass` とパッケージを管理します。
- 共有マクロのうち、`exam-macro-allowlist.json` に載っている安全な宣言だけを分割後の各TeXにコピーします。
- よく使うパッケージや全体設定はPDFレンダラーのテンプレート、または共通マクロファイルに集約します。
- 投稿TeX内では `\documentclass`、`\usepackage`、`\newenvironment`、グローバルな `\renewcommand` を使わない運用にします。
- 衝突しそうなTeXが混ざる場合は、問題ごとまたは解答ごとに個別PDFを作ってから最後にPDF結合します。この方法ならLaTeX環境の衝突をファイル単位に閉じ込められます。

PDFレンダラーをまだ用意しない場合、サイト側はHTML化済み内容から印刷用ページを一時生成します。ブラウザの印刷画面で保存先にPDFを選べます。

### Edge Functionの環境変数

このリポジトリには `supabase/functions/upload-exam-tex` と `supabase/functions/render-exam-pdf` のソースがあります。
Supabase DashboardのEdge Functions Editorに貼り付けてデプロイできます。CLIでデプロイしても構いません。

```sh
supabase login
supabase link --project-ref tqaebckdmdmhwylluzsf
supabase functions deploy upload-exam-tex
supabase functions deploy render-exam-pdf
```

`upload-exam-tex` はFunction内でSupabaseのアクセストークンを検証します。DashboardでJWT検証をONにしてもよいですが、CORSやOPTIONSで詰まる場合はOFFにし、Function内検証に任せてください。

`upload-exam-tex` に設定します。

```text
SUPABASE_URL=https://xxxx.supabase.co
GITHUB_TOKEN=GitHub fine-grained token
GITHUB_REPOSITORY=MathMuscleClub/math-muscle-club
GITHUB_BRANCH=main
ALLOWED_EMAIL_DOMAINS=g.ecc.u-tokyo.ac.jp
ALLOWED_ORIGIN=https://mathmuscleclub.github.io
EXAM_MACRO_ALLOWLIST_PATH=exam-macro-allowlist.json
```

`GITHUB_TOKEN` は Contents の読み書きができる fine-grained token にします。GitHub token は絶対に `supabase-config.js` に入れないでください。

`EXAM_MACRO_ALLOWLIST_PATH` は省略できます。省略時は `exam-macro-allowlist.json` を読みます。

Supabaseの新しいAPI keys環境では、Edge Functionsに `SUPABASE_SECRET_KEYS` が自動で渡されます。`upload-exam-tex` はその `default` secret key を使ってログインユーザーを確認します。古いプロジェクトでは互換用に `SUPABASE_SERVICE_ROLE_KEY` も読めますが、新しく設定する必要はありません。

`render-exam-pdf` に設定します。

```text
PDF_RENDERER_URL=https://your-pdf-renderer.example.com/render
PDF_RENDERER_TOKEN=任意の共有トークン
GITHUB_REPOSITORY=MathMuscleClub/math-muscle-club
GITHUB_BRANCH=main
ALLOWED_ORIGIN=https://mathmuscleclub.github.io
```

Supabase Edge Function単体ではLaTeXエンジンを実行できないため、完全なワンクリックPDF生成には `latexmk` や `tectonic` を実行できる小さなPDFレンダラーを別に置きます。`PDF_RENDERER_URL` が未設定の場合でも、サイト側の印刷フォールバックは動きます。
