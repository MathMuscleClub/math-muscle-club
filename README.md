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

## 過去問閲覧・問題文/解答提出機能

過去問機能では、問題文と解答を別データとして扱います。
問題文は共有データ、解答は投稿者ごとのデータです。
ブラウザにはGitHubの書き込みトークンを置かず、Supabase Edge Functionがログイン確認をしてGitHubへ保存します。

### 基本方針

- 問題文の年度・A/B・問題番号・分野などのメタ情報は、TeX本文ではなくフォーム入力と `exam-submissions.json` で管理します。
- 問題文TeXに `\examyear`、`\examgroup`、`\examnumber`、`\examfield` などの独自メタ情報マクロは保存しません。
- パース後の各問題TeXは、それ単体でコンパイルできる独立した `.tex` ファイルとして保存します。
- 問題文は同じ年度・問題区分・問題番号につき1つだけです。フォルダを深く分けず、ファイル名で識別します。
- 解答の通常提出はPDFです。PDFは投稿者・年度・問題区分・対象問題番号と一緒に管理します。
- Geminiなどで作った問題文TeXは、1問ずつアップロードし、保存後に独立TeXとしてダウンロードできるようにします。
- Edge Functionや外部PDFレンダラーによる自動コンパイルは使いません。

### 保存されるもの

- `exam-submissions.json`: 問題文・解答の一覧、提出者名、年度、問題区分、問題番号、分野などのメタデータ
- `exam-problems/{年度}-{問題区分}-{問題番号}.tex`: 共有の問題文TeX
- `exams/{年度}/{問題区分}/submissions/{提出ID}/answer.pdf`: 投稿者ごとのPDF解答

例:

```text
exam-problems/2013-B-1.tex
exam-problems/2013-B-2.tex
exam-problems/2013-B-4.tex
```

`exam-submissions.json` とファイル名が問題文の識別情報です。保存後のTeXファイル内に、年度や問題番号をコメントとして残す必要はありません。

### 問題文TeXの保存形式

問題文TeXは、各ファイルだけで完結する形にします。

```tex
\documentclass[12pt]{jlreq}
\usepackage{amsmath, amssymb}

\begin{document}

問題文本文...

\end{document}
```

元のTeXにプリアンブル、パッケージ、独自コマンドがある場合は、問題ごとのTeXにもコピーします。
これにより、保存された `2013-B-1.tex` だけをダウンロードしてもコンパイルできます。

コピーしてよいもの:

- `\documentclass`
- `\usepackage`
- `\newcommand`、`\newcommand*`
- `\renewcommand`、`\renewcommand*`
- `\providecommand`、`\providecommand*`
- `\DeclareMathOperator`、`\DeclareMathOperator*`
- `\newenvironment`、`\renewenvironment`
- theorem系の定義など、本文中の記法を成立させるための宣言

コピーしないもの:

- 他の問題本文
- `\examyear`、`\examgroup`、`\examnumber`、`\examfield` などの独自メタ情報マクロ
- `\maketitle` など、問題本文の表示に不要な命令
- `\input`、`\include` など、外部ファイルがないと成立しない命令

外部ファイル依存のあるTeXは、1ファイルで完結しなくなるため避けます。

### 複数問入りTeXの扱い

新しい提出画面では、問題文は1問ずつ登録します。
1つのTeXに複数の問題が入っている場合は、編集欄へ入れる前に問題ごとへ分けてください。

旧形式との互換として、`\examyear`、`\examgroup`、`\examnumber`、`\examfield` が各ブロックに入っている複数問TeXは、Edge Function側で分割できます。
ただし保存後の各問題TeXには、これらのメタ情報マクロを残しません。

元ファイル:

```tex
\documentclass[12pt]{jlreq}
\usepackage{amsmath, amssymb}
\newcommand{\F}{\mathbf{F}}

\begin{document}

% 第1問
\examyear{2013}
\examgroup{B}
\examnumber{1}
\examfield{代数}
$p$ を素数とし，$\F_p$ を考える。

% 第2問
\examyear{2013}
\examgroup{B}
\examnumber{2}
\examfield{代数}
$V$ をベクトル空間とする。

\end{document}
```

保存後の `exam-problems/2013-B-1.tex`:

```tex
\documentclass[12pt]{jlreq}
\usepackage{amsmath, amssymb}
\newcommand{\F}{\mathbf{F}}

\begin{document}

$p$ を素数とし，$\F_p$ を考える。

\end{document}
```

保存後の `exam-problems/2013-B-2.tex`:

```tex
\documentclass[12pt]{jlreq}
\usepackage{amsmath, amssymb}
\newcommand{\F}{\mathbf{F}}

\begin{document}

$V$ をベクトル空間とする。

\end{document}
```

### 問題文編集のルール

- 問題文を編集するときは、対象問題の単体TeXを編集します。
- 年度・A/B・問題番号・分野を変更する場合は、TeX本文ではなくフォーム側のメタ情報を変更します。
- 編集後も、保存されるTeXは単体でコンパイルできる形にします。
- 既存の旧形式 `exams/{年度}/{問題区分}/{問題番号}/problem.tex` は読み取り互換として扱い、次回編集時に新形式へ移行します。

### 解答提出のルール

- 通常の解答提出はPDFファイルで行います。
- 1回の提出で複数画像を選んだ場合は、対象問題に紐づく解答PDFまたは画像群として扱います。
- 解答は年度、問題区分、対象問題番号、投稿者名で一覧表示します。
- 他人の解答は編集・削除できません。
- PDF全体結合ダウンロードは行わず、各解答PDFを個別に開く・ダウンロードする形にします。

### 本文で使える表示用マクロ

サイト上のHTMLプレビューでは、次の簡易マクロを読み取ります。

- `\fold{見出し}{本文}`: 折り畳み表示
- `\hint{本文}`: ヒント枠
- `\strategy{本文}`: 方針枠
- `\begin{enumerate} ... \item ... \end{enumerate}`: 番号付きリスト
- `\begin{itemize} ... \item ... \end{itemize}`: 箇条書き
- `\section*{見出し}`、`\subsection*{見出し}`: 本文内見出し
- `\DeclareMathOperator{\rank}{rank}`: MathJax向けに `\operatorname{rank}` へ変換

通常の数式は `\(...\)`、`$...$`、`\[...\]` で書けます。
サイトのプレビューは完全なLaTeXコンパイラではないため、最終確認はダウンロードしたTeXを手元でコンパイルして行います。

### Edge Functionの環境変数

このリポジトリには `supabase/functions/upload-exam-tex` のソースがあります。
Supabase DashboardのEdge Functions Editorに貼り付けてデプロイできます。CLIでデプロイしても構いません。

```sh
supabase login
supabase link --project-ref tqaebckdmdmhwylluzsf
supabase functions deploy upload-exam-tex
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
```

`GITHUB_TOKEN` は Contents の読み書きができる fine-grained token にします。GitHub token は絶対に `supabase-config.js` に入れないでください。

Supabaseの新しいAPI keys環境では、Edge Functionsに `SUPABASE_SECRET_KEYS` が自動で渡されます。`upload-exam-tex` はその `default` secret key を使ってログインユーザーを確認します。古いプロジェクトでは互換用に `SUPABASE_SERVICE_ROLE_KEY` も読めますが、新しく設定する必要はありません。
