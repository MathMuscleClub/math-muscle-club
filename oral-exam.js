/**
 * ==========================================
 * Oral Exam Prep Page Logic
 * ==========================================
 */

// 口頭試問のステート管理
const OralExamState = {
    sessionActive: false,
    apiKey: '',
    subject: 'algebra',
    character: 'euler',
    chatHistory: [], // Gemini形式の対話履歴 [{role: "user"|"model", parts: [{text: "..."}]}]
    turnsCount: 0,
    hintsCount: 0,
    isAILoading: false,
    // デモモード（モック）の進行状況
    isDemoMode: false,
    demoStep: 0,
    // 現在選択された問題オブジェクト
    currentProblem: null
};

// 試験官キャラクターの設定
const EXAM_CHARACTERS = {
    euler: {
        name: "オイラー先生",
        avatar: "👴",
        persona: "温和で優しく、数学の美しさや歴史的背景、直感を重んじる教育的な試験官。解答が不完全でも部分的な良さを見つけて褒め、ステップバイステップで導く。「〜ですね」「〜を考えてみましょう」といった親しみやすい口調。",
    },
    cauchy: {
        name: "コーシー先生",
        avatar: "🧐",
        persona: "厳密で緻密、定義や極限の厳密性を何よりも重視する試験官。曖昧な表現や直感に頼った説明に対しては、「その概念の厳密な定義は何ですか？」「〜を論理的なギャップなく証明してください」と厳しく突っ込む。冷静かつ論理的な口調。",
    },
    gauss: {
        name: "ガウス先生",
        avatar: "👑",
        persona: "静かで厳か、非常に鋭い洞察力を持つ『数学の王』。余計な喋りはせず、核心を突く短い問いかけを受験者に投げかけ、受験者の深い洞察力を引き出そうとする。「…では、〜の場合はどうか？」「本質を簡潔に述べよ」といった寡黙で威厳ある口調。",
    }
};

// 各分野（代数・解析・幾何）にそれぞれ3問の良問と、モック用のヒント・模範解答を定義
const ORAL_EXAM_PROBLEMS = {
    algebra: [
        {
            id: "alg_1",
            title: "実対称行列の直交対角化と固有値の実数性",
            problem: "実対称行列 $A$ が直交行列によって対角化可能であることの証明、およびその固有値がすべて実数であることの証明について説明してください。",
            hints: [
                "ヒント1：まずは固有値が実数であることを示すために、複素共役をとる標準的な議論を思い出してみましょう。エルミート内積の性質を利用します。固有ベクトル $x$ に対して $Ax = \\lambda x$ としたとき、両辺のエルミート内積 $\\langle Ax, x \\rangle$ を二通りで計算するとどうなりますか？",
                "ヒント2：対角化可能性についてですが、実対称行列は自己随伴作用素（対称行列）です。次元 $n$ に関する帰納法（induction）を用います。ある固有値に対する固有空間の直交補空間も、再び $A$ の作用で不変（invariant）になることを示しましょう。"
            ],
            modelAnswer: `【実対称行列の対角化と固有値の性質】

1. **固有値がすべて実数であることの証明**
   $n$ 次実対称行列 $A$ ($A^T = A$) の固有値を $\\lambda$、対応する（複素数体 $\\mathbb{C}$ 上の）固有ベクトルを $x \\neq 0$ とします。
   すなわち、$Ax = \\lambda x$ が成り立ちます。
   $x$ の複素共役転置を $x^*$ とし、両辺に左から $x^*$ を掛けます。
   $$x^* A x = x^* (\\lambda x) = \\lambda x^* x$$
   ここで、$x^* x = \\|x\\|^2$ は正の実数です。また、左辺の共役転置をとると、
   $$(x^* A x)^* = x^* A^* (x^*)^* = x^* A^T x = x^* A x$$
   (∵ $A$ は実対称行列なので $A^* = A^T = A$)
   したがって、$x^* A x$ は実数です。よって、
   $$\\lambda = \\frac{x^* A x}{\\ |x\\|^2}$$
   は「実数 / 実数」となるため、$\\lambda$ は実数であることが証明されました。

2. **直交行列による対角化可能性の証明 (次元 $n$ に関する帰納法)**
   - $n=1$ のときは自明です。
   - $n-1$ 次の実対称行列が直交対角化可能であると仮定します。
   - $n$ 次対称行列 $A$ の固有値 $\\lambda_1$ (これは実数) に対する実固有ベクトル $u_1$ をとり、$\\|u_1\\| = 1$ と正規化します。
   - $u_1$ を含む $\\mathbb{R}^n$ の正規直交基底 $\\{u_1, u_2, \\dots, u_n\\}$ を構成し、これらを並べた直交行列 $U_1 = [u_1, U']$ を作ります。
   - このとき、
     $$U_1^T A U_1 = \\begin{pmatrix} u_1^T A u_1 & u_1^T A U' \\\\ (U')^T A u_1 & (U')^T A U' \\end{pmatrix} = \\begin{pmatrix} \\lambda_1 & 0 \\\\ 0 & A_1 \\end{pmatrix}$$
     となります（$u_1^T A U' = (A u_1)^T U' = \\lambda_1 u_1^T U' = 0$ に注意）。
   - $U_1^T A U_1$ は対称行列なので、右下の $(n-1)$ 次行列 $A_1$ も対称行列です。
   - 帰納法の仮定より、$(n-1)$ 次直交行列 $V$ が存在して $V^T A_1 V$ を対角行列にできます。
   - $U = U_1 \\begin{pmatrix} 1 & 0 \\\\ 0 & V \\end{pmatrix}$ とおくと、これは直交行列であり、$U^T A U$ は対角行列となります。
   これにより、実対称行列が直交行列で対角化可能であることが示されました。`,
            strengths: "実対称行列の固有値が実数になる証明において、複素共役をとってエルミート内積（転置と複素共役）を適切に定義して計算を進める方針が理解できています。",
            weaknesses: "直交対角化の証明において、次元に関する帰納法を用いる際、固有ベクトルの直交補空間が再び $A$ の作用で不変になることの議論を厳密に詰める必要があります。",
            advice: "線形代数の基本中の基本であり、院試でも頻出のテーマです。スペクトル分解は幾何学（2次曲線の分類）や量子力学（エルミート作用素の観測可能量）にも繋がる重要概念ですので、証明の各ステップ（特に帰納法と補空間の不変性）を淀みなく書き下せるよう復習しておきましょう！"
        },
        {
            id: "alg_2",
            title: "群の準同型定理と $\\text{Aut}(\\mathbb{Z}/n\\mathbb{Z})$ の構造",
            problem: "群の準同型定理（Isomorphism Theorem）についてその主張を説明し、それを用いて $\\mathbb{Z}/n\\mathbb{Z}$ の自己同型群 $\\text{Aut}(\\mathbb{Z}/n\\mathbb{Z})$ がどのような群と同型になるか述べてください。",
            hints: [
                "ヒント1：まず群の第1準同型定理は、群の準同型写像 $f: G \\to H$ があるとき、自己同値関係を与える商群 $G/\\text{Ker}(f)$ と像 $\\text{Im}(f)$ の同型を主張します。自己同型群の元 $g \\in \\text{Aut}(\\mathbb{Z}/n\\mathbb{Z})$ は、加法群としての生成元である $1$ の行き先 $g(1)$ によって完全に決定されることに着目しましょう。",
                "ヒント2：$g(1) = d \\pmod n$ とおいたとき、$g$ が自己同型（特に全単射）であるためには、$d$ は $n$ と互いに素である必要があります。すなわち $d \\in (\\mathbb{Z}/n\\mathbb{Z})^\\times$（乗法群）です。ここから写像 $\\Phi: \\text{Aut}(\\mathbb{Z}/n\\mathbb{Z}) \\to (\\mathbb{Z}/n\\mathbb{Z})^\\times$ を構成し、これが群の同型写像になることを証明します。"
            ],
            modelAnswer: `【群の準同型定理と $\\text{Aut}(\\mathbb{Z}/n\\mathbb{Z})$ の構造】

1. **群の第1準同型定理の主張**
   群 $G, H$ と、群準同型写像 $f: G \\to H$ に対し、以下が成り立ちます：
   - $f$ の核 $\\text{Ker}(f) = \\{g \\in G \\mid f(g) = e_H\\}$ は $G$ の正規部分群である。
   - 自然な写像 $\\bar{f}: G/\\text{Ker}(f) \\to \\text{Im}(f)$（$g\\text{Ker}(f) \\mapsto f(g)$）はウェルディファインドであり、群の同型写像である。
   すなわち、 $G/\\text{Ker}(f) \\cong \\text{Im}(f)$ が成立します。

2. **$\\text{Aut}(\\mathbb{Z}/n\\mathbb{Z})$ の決定**
   - 加法群 $\\mathbb{Z}/n\\mathbb{Z}$ は単項生成群であり、その生成元の1つは $1 \\pmod n$ です。任意の自己同型 $g \\in \\text{Aut}(\\mathbb{Z}/n\\mathbb{Z})$ は、生成元の行き先 $g(1) = d \\pmod n$ によって一意に決定されます（$g(k) = kd \\pmod n$）。
   - $g$ が同型写像であるためには、$g$ が全単射であることが必要です。$g(k) = kd \\equiv 1 \\pmod n$ を満たす $k$ が存在することと同値であるため、$d \\pmod n$ は $\\mathbb{Z}/n\\mathbb{Z}$ の乗法逆元を持つ必要があります。すなわち、$d$ は $n$ と互いに素であり、乗法群 $(\\mathbb{Z}/n\\mathbb{Z})^\\times$（または既約剰余類群 $U(\\mathbb{Z}/n\\mathbb{Z})$）の元でなければなりません。
   - 写像 $\\Phi: \\text{Aut}(\\mathbb{Z}/n\\mathbb{Z}) \\to (\\mathbb{Z}/n\\mathbb{Z})^\\times$ を $\\Phi(g) = g(1)$ で定義します。
     - **準同型性**：自己同型の積について、$\\Phi(g_1 \\circ g_2) = (g_1 \\circ g_2)(1) = g_1(g_2(1)) = g_1(d_2 \\cdot 1) = d_2 g_1(1) = d_2 d_1 \\equiv d_1 d_2 \\pmod n$。これは乗法群における積 $\\Phi(g_1)\\Phi(g_2)$ と一致するため、準同型です。
     - **単射性**：$\\Phi(g) = 1 \\implies g(1) = 1 \\implies g$ は恒等写像。よって核は恒等写像のみなので単射です。
     - **全射性**：任意の $d \\in (\\mathbb{Z}/n\\mathbb{Z})^\\times$ に対し、$g(k) = kd \\pmod n$ で定義される写像は自己同型であり、$\\Phi(g) = d$ となります。
   - 以上より、$\\Phi$ は同型写像であり、
     $$\\text{Aut}(\\mathbb{Z}/n\\mathbb{Z}) \\cong (\\mathbb{Z}/n\\mathbb{Z})^\\times$$
     が成り立ちます。この群の位数はオイラーのファイ関数 $\\varphi(n)$ です。`,
            strengths: "準同型写像の決定が生成元の行き先によって行われる点、自己同型群の元が全単射となる条件と乗法逆元の存在（互いに素）の関連を正しく理解できています。",
            weaknesses: "自己同型群の積（合成写像）と、剰余類の乗法群における積が同型写像を介してどのように対応するかを示す「準同型性」の計算について、丁寧に示す必要があります。",
            advice: "代数におけるもっとも基本的な「商（剰余）」による群の同値関係の扱いと、自己同型写像の構造を掴む良い問題です。同様に $\\text{Aut}(\\mathbb{Z})$ の構造や、一般の巡回群の自己同型群についても考えておくと視野が広がりますよ。"
        },
        {
            id: "alg_3",
            title: "ガロア理論の基本定理と $x^3-2$ の最小分解体における具体例",
            problem: "ガロアの基本定理（Galois Correspondence）の主張について述べ、具体例として $x^3 - 2$ の有理数体 $\\mathbb{Q}$ 上の最小分解体を考え、その中間体とガロア群の部分群の対応関係を具体的に説明してください。",
            hints: [
                "ヒント1：ガロアの基本定理は、ガロア拡大 $L/K$ において、中間体 $M$ （$K \\subset M \\subset L$）全体の集合と、ガロア群 $G = \\text{Gal}(L/K)$ の部分群 $H$ 全体の集合の間に、包含関係を反転させる1対1の対応（ガロア対応）が存在することを主張します。まずは $x^3 - 2$ の $\\mathbb{Q}$ 上の最小分解体 $L$ がどのような体になるか書き下してみましょう。複素数 $\\sqrt[3]{2}$ と 1 の原始3乗根 $\\omega$ を使って表現できます。",
                "ヒント2：最小分解体は $L = \\mathbb{Q}(\\sqrt[3]{2}, \\omega)$ であり、拡大次数は $[L : \\mathbb{Q}] = 6$ です。このガロア群 $\\text{Gal}(L/Q)$ は3次対称群 $S_3$ と同型になります。$S_3$ にはどのような部分群（位数1, 2, 3, 6）がありますか？それぞれの部分群の「固定体」として対応する中間体を決定してください。"
            ],
            modelAnswer: `【ガロア理論の基本定理と $x^3-2$ の例】

1. **ガロアの基本定理の主張**
   有限次ガロア拡大 $L/K$ に対し、ガロア群 $G = \\text{Gal}(L/K)$ とします。このとき、
   - 中間体 $M$ ($K \\subset M \\subset L$) の集合と、$G$ の部分群 $H$ の集合の間には、以下の1対1の対応関係（包含関係を逆転する全単射）が存在します：
     - 中間体 $M$ に対し、部分群 $H = \\text{Gal}(L/M)$ を対応させる。
     - 部分群 $H$ に対し、固定体 $M = L^H = \\{x \\in L \\mid \\sigma(x) = x, \\forall \\sigma \\in H\\}$ を対応させる。
   - 特に、中間体の拡大次数 $[L : M]$ は部分群の位数 $|H|$ に等しく、$[M : K]$ は指数 $[G : H]$ に等しい。
   - $M/K$ が正規拡大（ガロア拡大）であることと、$H = \\text{Gal}(L/M)$ が $G$ の正規部分群であることは同値であり、このとき $\\text{Gal}(M/K) \\cong G/H$ が成り立ちます。

2. **$x^3 - 2$ の有理数体 $\\mathbb{Q}$ 上の最小分解体とガロア群**
   - $x^3 - 2$ の複素数根は $\\alpha_1 = \\theta, \\alpha_2 = \\theta\\omega, \\alpha_3 = \\theta\\omega^2$ です（ここで $\\theta = \\sqrt[3]{2}$ は実根、$\\omega = \\frac{-1+\\sqrt{3}i}{2}$）。
   - 最小分解体は $L = \\mathbb{Q}(\\theta, \\omega)$ であり、$[L : \\mathbb{Q}] = 6$ です。
   - ガロア群 $G = \\text{Gal}(L/\\mathbb{Q})$ は3次の対称群 $S_3$ と同型で、生成元 $\\sigma, \\tau$ によって以下のように記述されます：
     - $\\sigma$: $\\theta \\mapsto \\theta\\omega, \\omega \\mapsto \\omega$ （位数3：根の巡回置換 $(1\\ 2\\ 3)$ に対応）
     - $\\tau$: $\\theta \\mapsto \\theta, \\omega \\mapsto \\omega^2$ （位数2：複素共役、置換 $(2\\ 3)$ に対応）
     - 関係式：$\\sigma^3 = id, \\tau^2 = id, \\tau\\sigma\\tau = \\sigma^{-1}$。

3. **中間体と部分群の具体的な対応関係**
   ガロア群 $G = \\langle \\sigma, \\tau \\rangle \\cong S_3$ の部分群と中間体（固定体 $L^H$）の対応は以下の通りです：
   - **位数 6 の部分群**: $G$ 全体 $\\implies$ 固定体 $L^G = \\mathbb{Q}$
   - **位数 3 の部分群**: $\\langle \\sigma \\rangle = \\{id, \\sigma, \\sigma^2\\}$ （正規部分群） $\\implies$ 固定体 $L^{\\langle \\sigma \\rangle} = \\mathbb{Q}(\\omega)$
     - ※ $[L^{\\langle \\sigma \\rangle} : \\mathbb{Q}] = 2$。正規部分群に対応するため $\\mathbb{Q}(\\omega)/\\mathbb{Q}$ はガロア拡大です。
   - **位数 2 の部分群**（3個存在、非正規部分群）：
     1. $\\langle \\tau \\rangle = \\{id, \\tau\\}$ $\\implies$ 固定体 $L^{\\langle \\tau \\rangle} = \\mathbb{Q}(\\theta)$ (有理実数体)
     2. $\\langle \\sigma\\tau \\rangle = \\{id, \\sigma\\tau\\}$ $\\implies$ 固定体 $L^{\\langle \\sigma\\tau \\rangle} = \\mathbb{Q}(\\theta\\omega^2)$
     3. $\\langle \\sigma^2\\tau \\rangle = \\{id, \\sigma^2\\tau\\}$ $\\implies$ 固定体 $L^{\\langle \\sigma^2\\tau \\rangle} = \\mathbb{Q}(\\theta\\omega)$
   - **位数 1 の部分群**: $\\{id\\}$ $\\implies$ 固定体 $L^{\\{id\\}} = L = \\mathbb{Q}(\\theta, \\omega)$

   このように、部分群の包含関係（例： $\\langle \\tau \\rangle \\subset G$）が、中間体の逆向きの包含関係（例： $\\mathbb{Q} \\subset \\mathbb{Q}(\\theta)$）と完全に対応しています。`,
            strengths: "分解体の生成元の決定と拡大次数 $[L : \\mathbb{Q}] = 6$ の算出が正しくできています。ガロア群が $S_3$ になることを示し、位数2および3の部分群と中間体の代数的な対応関係を理解できています。",
            weaknesses: "ガロア群の作用（$\\sigma, \\tau$ が $\\theta$ と $\\omega$ をどこに写すか）の定義と、それによって各中間体の元がどのように固定されるかという具体的な計算の議論を明瞭に示すと完璧です。",
            advice: "ガロア理論の恩恵をもっとも美しく実感できる極めて重要かつ標準的な例題です。正規部分群と正規拡大の対応（正規部分群に対応する中間体 $\\mathbb{Q}(\\omega)$ は $\\mathbb{Q}$ 上ガロア拡大だが、非正規部分群に対応する $\\mathbb{Q}(\\theta)$ はガロア拡大ではないこと）についても併せて再確認しておきましょう。"
        }
    ],
    analysis: [
        {
            id: "ana_1",
            title: "連続かつ至る所微分不可能な関数の存在（ワイエルシュタイン関数）",
            problem: "実数全体で定義された関数 $f(x) = |x|$ は $x=0$ で連続ですが、微分不可能です。では、『実数全体で連続であるが、どの点でも微分不可能な関数』は存在しますか？存在するならその具体例や構成のアイデアを述べてください。",
            hints: [
                "ヒント1：はい、そのような関数は存在します。有名な例として、19世紀の数学者カール・ワイエルシュタインが提示した「ワイエルシュタイン関数 (Weierstrass function)」があります。どのような形式の関数（無限級数）だったか覚えていますか？",
                "ヒント2：ワイエルシュタイン関数は、三角関数を用いて以下のように定義されます：\n$$f(x) = \\sum_{n=0}^{\\infty} a^n \\cos(b^n \\pi x)$$\nここで、$0 < a < 1$ は収束を保証し、$b$ は奇数の整数で、$ab$ がある一定以上の大きさになるように設定されます。この級数が一様収束することによる「連続性の証明」と、各点での「ギザギザ（自己相似）」による「微分不可能性」の直感的イメージを説明してみましょう。"
            ],
            modelAnswer: `【各点連続かつ至る所微分不可能な関数（ワイエルシュタイン関数）】

1. **歴史的背景と存在**
   かつて「連続関数は高々いくつかの点を除いて微分可能だろう」と信じられていましたが、1872年にワイエルシュタインが「至る所連続かつ至る所微分不可能」な関数の具体例を公表し、数学界に大きな衝撃を与えました。現在では、このような関数は珍しいものではなく、連続関数全体の空間（C[a, b]に一様収束の距離を入れたもの）において、至る所微分不可能な関数全体は「至る所稠密（Baireのカテゴリー定理の意味で大部分を占める）」であることが知られています。

2. **具体例（ワイエルシュタイン関数）の定義**
   $$f(x) = \\sum_{n=0}^{\\infty} a^n \\cos(b^n \\pi x)$$
   ここで、パラメータ $a, b$ は以下の条件を満たす実数です：
   - $0 < a < 1$
   - $b$ は奇数の整数
   - $ab > 1 + \\frac{3}{2}\\pi$

3. **証明のアイデアと直感的理解**
   - **連続性**：各項は $|a^n \\cos(b^n \\pi x)| \\le a^n$ であり、$\\sum_{n=0}^{\\infty} a^n$ は $0 < a < 1$ より収束します。ワイエルシュタインのMテスト（一様収束判定法）より、この級数は実数全体で一様収束します。各項は連続関数なので、一様極限である $f(x)$ も実数全体で連続です。
   - **至る所微分不可能**：微分商 $\\frac{f(x+h) - f(x)}{h}$ を計算した際、$h \\to 0$ とするときにこの値が有限の極限に収束せず、振動して発散することを示します。直感的には、$n$ が大きくなるにつれて周期が極めて短く（$b^n$ 倍）、振幅がそこそこ大きい（$a^n$ 倍）波が重ね合わせられるため、細部を拡大しても常に激しい「ギザギザ（自己相似的なフラクタル構造）」が現れ、どの点でも接線を引くことができません。`,
            strengths: "ワイエルシュタイン関数の存在を正しく指摘し、一様収束（Mテスト）を用いた連続性の証明の流れを理解できています。また、直感的なフラクタル的構造のイメージも持てています。",
            weaknesses: "微分不可能性の証明は非常にテクニカルであり、微分商の評価において適切な $h_m$ の列を構成して無限大に発散することを示す厳密な不等式評価のステップについて理解を深めると良いでしょう。",
            advice: "解析学における反例（モンスター関数）の代表例です。実解析や測度論に進むと、ブラウン運動の軌跡（確率1で至る所連続・至る所微分不可能）など、自然界にもこの性質を持つ構造が溢れていることを学びます。一様収束と各点収束の違い、項別微分の条件を再確認する良い教材ですので、テキストを再読しておきましょう！"
        },
        {
            id: "ana_2",
            title: "留数定理と複素積分の応用",
            problem: "留数定理（Residue Theorem）の主張を述べ、それを利用して実数全体の広義積分 $\\int_{-\\infty}^{\\infty} \\frac{1}{x^4 + 1} dx$ を計算する手順と複素積分路（等高線）の取り方について説明してください。",
            hints: [
                "ヒント1：留数定理は、孤立特異点を除いて正則な関数 $f(z)$ を閉曲線 $C$ に沿って反時計回りに積分したとき、その値が $2\\pi i \\times$ (閉曲線内部にある特異点における留数の総和) になることを主張します。まずは被積分関数 $f(z) = \\frac{1}{z^4 + 1}$ の上半平面（虚部が正の領域）にある特異点（極）を求めてみましょう。$z^4 = -1$ の根です。",
                "ヒント2：積分路 $C$ として、実軸上の $[-R, R]$ と、上半平面の原点中心半径 $R$ の半円弧 $\\Gamma_R$ からなる半円形の閉曲線（反時計回り）をとります。$R \\to \\infty$ としたとき、半円弧部分の積分 $\\int_{\\Gamma_R} f(z) dz$ が $0$ に収束することを大弧の補題（または不等式評価）を用いて示し、実軸上の積分を上半平面内の極の留数計算に帰着させます。"
            ],
            modelAnswer: `【留数定理を用いた複素積分 $\\int_{-\\infty}^{\\infty} \\frac{1}{x^4+1} dx$ の計算】

1. **留数定理の主張**
   単連結領域 $D$ 内の単純閉曲線 $C$ の内部および周上で、有限個の点 $z_1, z_2, \\dots, z_k$ を除いて正則な関数 $f(z)$ に対し、
   $$\\oint_C f(z) dz = 2\\pi i \\sum_{j=1}^k \\text{Res}(f, z_j)$$
   が成り立ちます。ここで $\\text{Res}(f, z_j)$ は $z_j$ における $f(z)$ の留数です。

2. **特異点（極）の決定**
   $f(z) = \\frac{1}{z^4 + 1}$ の特異点は分母 $z^4 + 1 = 0 \\iff z^4 = -1 = e^{i\\pi}$ の根であり、以下の4つの1位の極です：
   $$z_k = e^{i\\frac{\\pi + 2k\\pi}{4}} \\quad (k=0, 1, 2, 3)$$
   このうち、複素上半平面 ($\\text{Im}(z) > 0$) に存在するのは以下の2点です：
   $$z_0 = e^{i\\pi/4} = \\frac{1+i}{\\sqrt{2}}, \\quad z_1 = e^{i3\\pi/4} = \\frac{-1+i}{\\sqrt{2}}$$

3. **積分路の構成**
   実軸上の線分 $[-R, R]$ と、上半平面上の半円 $\\Gamma_R: z = R e^{i\\theta}$ ($0 \\le \\theta \\le \\pi$) を合わせた半円形閉曲線 $C_R = [-R, R] + \\Gamma_R$（反時計回り）をとります（$R > 1$ とする）。
   このとき、留数定理より、
   $$\\int_{-R}^R \\frac{1}{x^4 + 1} dx + \\int_{\\Gamma_R} f(z) dz = 2\\pi i (\\text{Res}(f, z_0) + \\text{Res}(f, z_1))$$
   となります。

4. **半円弧上の積分の極限評価**
   $|z| = R > 1$ のとき、$|z^4 + 1| \\ge |z|^4 - 1 = R^4 - 1$ より、
   $$\\left| \\int_{\\Gamma_R} \\frac{1}{z^4 + 1} dz \\right| \\le \\int_0^{\\pi} \\frac{1}{R^4 - 1} R d\\theta = \\frac{\\pi R}{R^4 - 1}$$
   ここで $R \\to \\infty$ とすると、右辺は $0$ に収束するため、$\\lim_{R \\to \\infty} \\int_{\\Gamma_R} f(z) dz = 0$ となります。

5. **留数の計算と結果**
   1位の極 $z_j$ における留数は $\\text{Res}(f, z_j) = \\frac{1}{\\frac{d}{dz}(z^4 + 1)} \\Big|_{z=z_j} = \\frac{1}{4 z_j^3} = -\\frac{z_j}{4}$ (∵ $z_j^4 = -1$) です。
   よって、
   $$\\text{Res}(f, z_0) + \\text{Res}(f, z_1) = -\\frac{1}{4}(z_0 + z_1) = -\\frac{1}{4} \\left( \\frac{1+i}{\\sqrt{2}} + \\frac{-1+i}{\\sqrt{2}} \\right) = -\\frac{i}{2\\sqrt{2}}$$
   したがって、$R \\to \\infty$ とすることで求める積分値は：
   $$\\int_{-\\infty}^{\\infty} \\frac{1}{x^4 + 1} dx = 2\\pi i \\left( -\\frac{i}{2\\sqrt{2}} \\right) = \\frac{\\pi}{\\sqrt{2}}$$
   となります。`,
            strengths: "複素関数 $f(z)$ の特異点の位置を複素平面上に正しく特定し、上半平面内の特異点のみを抽出できています。また半円形の積分路の設定と、円弧部分の極限評価（大弧の補題）の必要性を理解しています。",
            weaknesses: "1位の極における留数計算の公式 $\\lim_{z \\to z_0} (z-z_0)f(z)$ または $\\frac{1}{g'(z_0)}$ の適用ステップにおいて、計算ミスを避けるための丁寧な導出を意識すると良いでしょう。",
            advice: "複素解析（関数論）の応用として最も強力な実積分の計算手法です。半円のほかに扇形や長方形の積分路をとるべき関数など、バリエーションが存在しますので、被積分関数の特異点の分布に合わせて適切な積分路を選択する訓練を重ねましょう。"
        },
        {
            id: "ana_3",
            title: "ルベーグの優収束定理と極限・積分の順序交換",
            problem: "ルベーグの優収束定理（Dominated Convergence Theorem）の主張を述べ、リーマン積分における収束定理（一様収束など）と比較して、ルベーグ積分における優収束定理の数学的な利点や重要性について説明してください。",
            hints: [
                "ヒント1：優収束定理は、可測関数の列 $f_n$ が各点収束し、あるルベーグ可積分な関数 $g$ によって一様に支配されている（すべての $n$ に対して $|f_n| \\le g$）とき、極限と積分の順序交換 $\\lim_{n \\to \\infty} \\int f_n d\\mu = \\int \\lim_{n \\to \\infty} f_n d\\mu$ が成り立つという定理です。リーマン積分で同様の順序交換を行うには、どのような強い条件が必要だったか考えてみましょう。",
                "ヒント2：リーマン積分では、関数列が「一様収束」することが順序交換の十分条件ですが、これは非常に強い制約です。ルベーグ積分では、「各点収束」と「可積分な支配関数 $g$ の存在」という極めて緩い条件だけで順序交換が保証されます。これが関数空間（例： $L^1$ 空間）の完備性や解析学での議論をどれほど容易にするかを説明してください。"
            ],
            modelAnswer: `【ルベーグの優収束定理と極限・積分の順序交換】

1. **ルベーグの優収束定理の主張**
   可測空間 $(X, \\mathcal{M}, \\mu)$ 上の可測関数列 $\\{f_n\\}$ が $X$ の各点（またはほとんど至る所）で関数 $f$ に収束するとします（$\\lim_{n \\to \\infty} f_n(x) = f(x)$ a.e.）。
   もし、すべての $n \\ge 1$ に対して
   $$|f_n(x)| \\le g(x) \\quad \\text{a.e. } x \\in X$$
   を満たすようなルベーグ可積分関数 $g \\in L^1(X, \\mu)$ （支配関数、優関数）が存在するならば、$f$ も可積分であり、極限と積分の順序交換が成り立ちます：
   $$\\lim_{n \\to \\infty} \\int_X f_n d\\mu = \\int_X f d\\mu$$

2. **リーマン積分における順序交換条件との比較**
   - **リーマン積分における制約**：リーマン積分において極限と積分の順序交換 $\\lim_{n \\to \\infty} \\int_a^b f_n(x) dx = \\int_a^b f(x) dx$ を示すための代表的な十分条件は、関数列 $\\{f_n\\}$ が区間 $[a, b]$ 上で $f$ に「一様収束」することです。
   - **一様収束の厳しさ**：一様収束は非常に強い条件であり、定義域が無限区間のとき（例： $\\mathbb{R}$ 全体）や、特異性がある場合には満たされないことが多くあります。また、リーマン積分の各点極限関数 $f$ は、必ずしもリーマン可積分になるとは限りません（例：ディリクレ関数）。

3. **ルベーグ積分における利点と重要性**
   - **条件の緩和**：優収束定理は、「一様収束」を必要とせず、「各点収束」と可積分な「優関数 $g$ の存在」のみで順序交換を認めます。これにより、特異積分や無限領域での積分極限の取り扱いが圧倒的に容易になります。
   - **関数空間の完備性**：ルベーグ積分を導入することで、関数空間 $L^p$ が完備（バナッハ空間・ヒルベルト空間）になります。この完備性の証明（Riesz-Fischerの定理）において、収束定理（優収束定理や単調収束定理）は決定的な役割を果たします。リーマン積分では完備にならないため、関数解析学の展開が困難です。
   - **応用上の利点**：確率論における期待値の極限や、偏微分方程式の弱解の構成、フーリエ解析など、現代解析学のほぼすべての領域で、優収束定理は計算の正当化のために日常的に使用されます。`,
            strengths: "優収束定理の主張（各点収束、支配関数の可積分性）を正確に記述できています。リーマン積分における一様収束条件の制約（ディリクレ関数のような可積分性の喪失や無限区間での不便さ）を正しく対比して説明できています。",
            weaknesses: "優収束定理が適用できない具体例（例えば $f_n(x) = n \\chi_{(0, 1/n)}(x)$ は各点 $0$ に収束するが積分値は常に $1$ で順序交換が成り立たない例など）を示すことで、支配関数 $g$ の必要性をより具体的に浮き彫りにするとさらに良いでしょう。",
            advice: "実解析・測度論の根幹をなす最重要定理の1つです。単調収束定理（Monotone Convergence Theorem）やファトゥの補題（Fatou's Lemma）との論理的な関係や、それらを用いた優収束定理の証明の流れについても整理しておきましょう。"
        }
    ],
    geometry: [
        {
            id: "geo_1",
            title: "距離空間におけるコンパクト性と有界閉集合の関係",
            problem: "コンパクトな距離空間において、任意の開被覆から有限部分被覆が選べるという性質（コンパクト性）と、有界閉集合であることの関係について説明してください。特に対象とする空間が $\\mathbb{R}^n$ の場合（Heine-Borelの定理）と一般の距離空間の場合の違いに触れてください。",
            hints: [
                "ヒント1：$\\mathbb{R}^n$ においては、「コンパクト」であることと「有界閉集合」であることは完全に同値です（Heine-Borel の定理）。しかし、一般の距離空間ではこの同値性は崩れます。片方の含意は常に成り立ちますが、どちらでしょうか？またその反例は考えられますか？",
                "ヒント2：一般の距離空間 $X$ において、「コンパクト部分集合 $K$」は常に「有界かつ閉集合」になります。しかし逆は成り立ちません。反例として、無限集合上の離散距離空間や、無限次元ヒルベルト空間（$\\ell^2$）の閉単位球面を考えてみましょう。一般の距離空間でコンパクト性と同値になる「有界閉」より強い条件は何でしょうか？（完備性と全有界性）"
            ],
            modelAnswer: `【距離空間におけるコンパクト性と有界閉集合（Heine-Borelの定理とその一般化）】

1. **$\\mathbb{R}^n$ における Heine-Borel の定理**
   有限次元ユークリッド空間 $\\mathbb{R}^n$ の部分集合 $K$ について、以下は同値です。
   - $K$ はコンパクトである（任意の開被覆から有限部分被覆を取り出せる）。
   - $K$ は有界かつ閉集合である。
   - $K$ は列コンパクトである（$K$ 内の任意の点列は、$K$ 内に収束する部分列を持つ）。

2. **一般の距離空間における関係**
   一般の距離空間 $(X, d)$ の部分集合 $K$ については、以下の関係が成り立ちます：
   - **コンパクト $\\implies$ 有界かつ閉集合**（これは常に成立）
     - *閉集合であることの証明*：$x \\notin K$ とすると、任意の $y \\in K$ に対して $x$ と $y$ の近傍を分離でき（$T_2$空間の性質）、それらの被覆から有限被覆を選ぶことで $x$ の開近傍で $K$ と交わらないものが作れる。よって補集合が開集合となり $K$ は閉集合。
     - *有界であることの証明*：ある点 $p$ を中心とする半径 $n$ の開球 $B(p, n)$ 全体による被覆 $\\{B(p, n)\\}_{n=1}^{\\infty}$ は $K$ の開被覆。コンパクト性より有限被覆が存在するため、十分大きな $N$ で $K \\subset B(p, N)$ となり有界。
   - **有界かつ閉集合 $\\not\\implies$ コンパクト**（一般には反例あり）
     - *反例1（離散距離空間）*：無限集合 $X$ に離散距離（$x \\neq y$ なら $d(x,y)=1$）を入れた空間。このとき $X$ 自体は直径1なので「有界」かつ、全体集合なので「閉集合」ですが、各点を単元集合とする開被覆 $\\{\\{x\\}\\}_{x \\in X}$ からは有限部分被覆を選べないため、コンパクトではありません。
     - *反例2（無限次元ヒルベルト空間）*：平方和可能無限数列の空間 $\\ell^2$ における閉単位球 $B = \\{x \\in \\ell^2 \\mid \\|x\\| \\le 1\\}$。これは有界閉集合ですが、正規直交基底の列 $e_1, e_2, \\dots$ ($d(e_i, e_j) = \\sqrt{2}$ for $i \\neq j$) は収束する部分列を持たない（列コンパクトでない）ため、コンパクトではありません。

3. **一般の距離空間での同値条件**
   一般の距離空間において、部分集合 $K$ がコンパクトであるための同値条件は：
   $$K \\text{ がコンパクト } \\iff K \\text{ が完備 (complete) かつ 全有界 (totally bounded)}$$
   - 「全有界」とは、任意の $\\epsilon > 0$ に対し、有限個の $\\epsilon$ 球で $K$ を被覆できるという「有界」より強い性質です。$\\mathbb{R}^n$ においては、有界であれば全有界になります。`,
            strengths: "$\\mathbb{R}^n$ における Heine-Borel の同値性と、一般の距離空間において反例が存在すること（無限次元空間や離散空間）を正しく区別して説明できています。また、コンパクトから有界閉の証明の道筋も理解されています。",
            weaknesses: "一般の距離空間におけるコンパクト性の必要十分条件が「完備かつ全有界（totally bounded）」である点について、全有界の厳密な定義と、単なる有界との違いをよりクリアに述べられると完璧です。",
            advice: "位相空間論・幾何学の基礎となる非常に重要な概念です。「開被覆によるコンパクト性」と「点列による列コンパクト性」が距離空間においては同値になることの証明や、実数の連続性公理との関係を含めて、教科書で再度しっかりと証明を追っておくことを推奨します。"
        },
        {
            id: "geo_2",
            title: "多様体における接空間の定義方法",
            problem: "多様体（manifold）におけるある点での接空間（tangent space）の定義方法にはいくつかのアプローチ（曲線による定義、微分作用素としての定義など）があります。そのうちの1つについて説明し、なぜユークリッド空間のように単に『接する平面』として周囲の空間を用いて定義できないのか理由を述べてください。",
            hints: [
                "ヒント1：ユークリッド空間 $\\mathbb{R}^N$ に埋め込まれた曲面であれば、周囲の空間を用いて接平面を定義できますが、一般の抽象多様体は「周囲の空間（外海）」を仮定せず、多様体自身の「内部の情報（局所座標など）」だけで定義されなければなりません。これが『接する平面』を直接使えない理由です。微分作用素（方向微分）による接ベクトルの定義について考えてみましょう。",
                "ヒント2：多様体 $M$ 上の点 $p$ における方向微分（derivations）は、点 $p$ の近傍で定義された無限回微分可能関数全体のなす環 $C^\\infty(p)$ から $\\mathbb{R}$ への線形写像 $v$ で、積の微分公式（Leibniz則） $v(fg) = v(f)g(p) + f(p)v(g)$ を満たすものです。これらのなす線形空間が接空間 $T_pM$ を定義します。局所座標 $(x^1, \\dots, x^n)$ を使って、この接空間の基底が $\\left\\{\\frac{\\partial}{\\partial x^i}\\Big|_p\\right\\}$ となる流れを説明してください。"
            ],
            modelAnswer: `【多様体における接空間の定義と『内在的』定義の必要性】

1. **なぜ周囲の空間を用いた定義（外在的定義）が使えないのか**
   ユークリッド空間 $\\mathbb{R}^N$ の部分多様体であれば、外側の空間 $\\mathbb{R}^N$ の幾何学（例：曲面に直交する法ベクトルなど）を用いて「接平面」を定義できます。
   しかし、一般の微分可能多様体は、ユークリッド空間に埋め込まれているとは限らない「抽象的な空間」として（局所座標近傍系とその貼り合わせによって）定義されます。多様体に「外側」を仮定せず、多様体それ自体の情報だけで幾何学を展開する（＝内在的 / intrinsic なアプローチ）ためには、接空間も外側の空間に依存しない方法で定義する必要があります。

2. **微分作用素（方向微分 / derivation）による接空間の定義**
   もっとも広く使われる内在的な定義の1つは、点 $p \\in M$ における「方向微分（関数を実数に写す作用素）」として接ベクトルを定義する方法です。
   - $C^\\infty_p(M)$ を、点 $p$ の近傍で定義された $C^\\infty$ 級関数を、点 $p$ で値が一致する同値関係で割った芽（germ）のなす環（実代数）とします。
   - 点 $p$ における**接ベクトル**とは、写像 $v: C^\\infty_p(M) \\to \\mathbb{R}$ であって、以下の2つの性質を満たすものです：
     1. **線形性**： $v(a f + b g) = a v(f) + b v(g) \\quad (a, b \\in \\mathbb{R}, \\ f, g \\in C^\\infty_p(M))$
     2. **ライプニッツ則（積の微分）**： $v(fg) = v(f)g(p) + f(p)v(g) \\quad (f, g \\in C^\\infty_p(M))$
   - このような写像 $v$ 全体のなす実線形空間を、点 $p$ における $M$ の**接空間**（tangent space）と呼び、$T_pM$ と表します。

3. **局所座標基底**
   点 $p$ のまわりの局所座標近傍 $(U, \\varphi)$（座標関数 $x^1, x^2, \\dots, x^n$）をとると、各座標方向の偏微分
   $$D_i (f) = \\frac{\\partial (f \\circ \\varphi^{-1})}{\\partial r^i} (\\varphi(p))$$
   （ここで $r^i$ は $\\mathbb{R}^n$ の標準座標）は上記の条件を満たすため、接ベクトルになります。これを $\\frac{\\partial}{\\partial x^i}\\Big|_p$ と書きます。
   これら $\\left\\{\\frac{\\partial}{\\partial x^1}\\Big|_p, \\dots, \\frac{\\partial}{\\partial x^n}\\Big|_p\\right\\}$ は $T_pM$ の基底をなし、接空間の次元は多様体の次元 $n$ に一致します。`,
            strengths: "多様体の定義が『内在的』であるべき理由（外側の空間を仮定しない）を正しく理解し説明できています。方向微分（ライプニッツ則）を用いた接空間の代数的定義の流れを正確に把握できています。",
            weaknesses: "「曲線を用いた定義（速度ベクトルとしての定義）」との同値性について、曲線の同値類 $[\\gamma]$ がどのように方向微分作用素 $f \\mapsto (f \\circ \\gamma)'(0)$ と一対一に対応するかを軽く補足できると、幾何的なイメージと代数的な定義の結びつきがより明瞭になります。",
            advice: "微分幾何学の最初の障壁となる抽象概念です。座標変換に際して、接ベクトルがヤコビ行列を用いてどのように変換されるか（反変ベクトルの変換性）についても数式で導出できるようにしておくと、接バンドル（tangent bundle）への理解が非常にスムーズになります。"
        },
        {
            id: "geo_3",
            title: "基本群の定義と円周 $S^1$ の基本群の決定",
            problem: "位相空間 $X$ における基本群（Fundamental Group） $\\pi_1(X, x_0)$ の定義について説明し、円周 $S^1$ の基本群が加法群 $\\mathbb{Z}$ と同型になることを、被覆空間（universal cover） $\\mathbb{R}$ から $S^1$ への被覆写像と『リフト（lift）』の概念を用いて直感的に説明してください。",
            hints: [
                "ヒント1：基本群 $\\pi_1(X, x_0)$ は、基点 $x_0$ を始点・終点とする連続な閉曲線（ループ）全体の集合を、連続変形（ホモトピー）による同値関係で割った集合に、ループの結合（つなぎ合わせ）を積として群構造を入れたものです。円周 $S^1$ を複素平面の単位円 $\\{e^{i\\theta}\\}$ と考えたとき、実数直線 $\\mathbb{R}$ から $S^1$ への写像 $p(t) = e^{2\\pi i t}$ は被覆写像（らせん階段から床への投影のようなイメージ）になります。",
                "ヒント2：$S^1$ 上のループ $\\gamma$（始点・終点は $1 = e^0$）を考えると、被覆写像の重要な性質である「道の持ち上げ定理（path lifting theorem）」より、$\\mathbb{R}$ 上の道 $\\tilde{\\gamma}$ （始点 $\\tilde{\\gamma}(0) = 0$）が一意に存在し、$p \\circ \\tilde{\\gamma} = \\gamma$ となります。ループは終点が $1$ に戻るため、リフトの終点 $\\tilde{\\gamma}(1)$ は $p(t)=1$ の原像である整数 $n \\in \\mathbb{Z}$ になります。この整数 $n$ はループが円周を何周したか（巻き付き数 / winding number）を表し、これが基本群と $\\mathbb{Z}$ の同型を与えます。"
            ],
            modelAnswer: `【基本群の定義と円周 $S^1$ の基本群 $\\pi_1(S^1) \\cong \\mathbb{Z}$ の証明】

1. **基本群の定義**
   位相空間 $X$ とその点 $x_0 \\in X$ に対し、
   - **ループ**： 連続写像 $\\gamma: [0, 1] \\to X$ であって、$\\gamma(0) = \\gamma(1) = x_0$ を満たすもの。
   - **ループのホモトピー**：2つのループ $\\gamma_0, \\gamma_1$ に対し、連続写像 $H: [0, 1] \\times [0, 1] \\to X$ が存在して、任意の $s, t \\in [0, 1]$ に対し $H(s, 0) = \\gamma_0(s)$, $H(s, 1) = \\gamma_1(s)$ かつ $H(0, t) = H(1, t) = x_0$ を満たすとき、$\\gamma_0$ と $\\gamma_1$ は（基点を固定して）ホモトピー同値であるといい、$\\gamma_0 \\simeq \\gamma_1$ と書きます。
   - **群構造**：ホモトピー同値類全体の集合 $\\pi_1(X, x_0) = \\{[\\gamma]\\}$ に対し、ループの結合 $\\gamma_1 * \\gamma_2$（前半で $\\gamma_1$、後半で $\\gamma_2$ を辿るループ）を積と定義することで、基本群が構成されます。

2. **被覆空間 $\\mathbb{R} \\to S^1$ とリフトの概念**
   - 円周を複素単位円 $S^1 = \\{z \\in \\mathbb{C} \\mid |z| = 1\\}$ とし、基点を $1$ とします。
   - 実数直線 $\\mathbb{R}$ から $S^1$ への写像 $p: \\mathbb{R} \\to S^1$ を $p(t) = e^{2\\pi i t}$ で定義します。これは無限のらせん階段（$\\mathbb{R}$）から真下の円周（$S^1$）への投影であり、普遍被覆（universal cover）を構成します。
   - **道の持ち上げ（Path Lifting）**：$S^1$ 上の任意のループ $\\gamma: [0, 1] \\to S^1$ ($\\gamma(0)=\\gamma(1)=1$) に対し、$\\mathbb{R}$ 上の連続曲線 $\\tilde{\\gamma}: [0, 1] \\to \\mathbb{R}$ であって、$\\tilde{\\gamma}(0) = 0$ かつ $p \\circ \\tilde{\\gamma} = \\gamma$ を満たすものが一意に存在します。

3. **$\\pi_1(S^1, 1) \\cong \\mathbb{Z}$ の直感的説明**
   - ループ $\\gamma$ の終点は基点 $1$ なので、持ち上げた道 $\\tilde{\\gamma}$ の終点 $\\tilde{\\gamma}(1)$ は、$p$ によって $1$ に写る点でなければなりません。
   - $p(t) = e^{2\\pi i t} = 1 \\iff t \\in \\mathbb{Z}$。したがって、$\\tilde{\\gamma}(1)$ はある整数 $n \\in \\mathbb{Z}$ になります。
   - この整数 $n$ は、ループ $\\gamma$ が円周を反時計回りに何周回ったか（時計回りの場合は負）という「巻き付き数 (winding number)」を表します。
   - ホモトピー同値なループは同じ整数 $n$ に持ち上がり、ループの結合（積）は巻き付き数の和（加法）に対応します。これにより、対応 $[\\gamma] \\mapsto \\tilde{\\gamma}(1)$ はウェルディファインドな群の同型写像 $\\pi_1(S^1, 1) \\cong \\mathbb{Z}$ を与えます。`,
            strengths: "基本群の定義（ループ、ホモトピー、積）を数学的に正確に表現できています。$\\mathbb{R} \\to S^1$ の被覆写像とリフト（持ち上げ定理）を用いて、基本群が整数群 $\\mathbb{Z}$ と同型になる（巻き付き数）イメージを論理的に説明できています。",
            weaknesses: "リフトの一意性定理（Path Lifting と Homotopy Lifting）が、ホモトピー同値なループが同じ終点 $n$ に写ることを保証する（すなわちウェルディファインド性）という、証明の数学的なコアについて言及するとさらに厳密になります。",
            advice: "代数的位相幾何学（トポロジー）の出発点となる最重要定理です。この被覆空間の議論は、複素関数論における対数関数の多価性と枝切り、あるいは留数計算の周回積分などとも深く結びついています。より高次元の球面 $S^n$ ($n \\ge 2$) の基本群がどうなるかについても調べてみましょう。"
        }
    ]
};

// ----------------------------------------------------
// イベントリスナと初期化
// ----------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    initOralExam();
});

function initOralExam() {
    // APIキーの読み込み
    const savedApiKey = localStorage.getItem('oe_gemini_api_key');
    const apiKeyInput = document.getElementById('oe-api-key');
    if (savedApiKey && apiKeyInput) {
        apiKeyInput.value = savedApiKey;
        OralExamState.apiKey = savedApiKey;
    }

    // APIキー入力時の保存イベント
    if (apiKeyInput) {
        apiKeyInput.addEventListener('change', (e) => {
            const val = e.target.value.trim();
            localStorage.setItem('oe_gemini_api_key', val);
            OralExamState.apiKey = val;
        });
    }

    // 各種ボタンのイベント登録
    const startBtn = document.getElementById('oe-start-btn');
    if (startBtn) startBtn.addEventListener('click', startOralExamSession);

    const resetBtn = document.getElementById('oe-reset-btn');
    if (resetBtn) resetBtn.addEventListener('click', resetOralExamSession);

    const sendBtn = document.getElementById('oe-send-btn');
    if (sendBtn) sendBtn.addEventListener('click', sendUserMessage);

    const hintBtn = document.getElementById('oe-hint-btn');
    if (hintBtn) hintBtn.addEventListener('click', requestHint);

    const finishBtn = document.getElementById('oe-finish-btn');
    if (finishBtn) finishBtn.addEventListener('click', finishAndEvaluate);

    // テキストエリアのキーバインド（Ctrl+Enter / Cmd+Enter で送信）
    const textarea = document.getElementById('oe-user-input');
    if (textarea) {
        textarea.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                sendUserMessage();
            }
        });
        
        // テキストエリアの高さを自動微調整
        textarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
            if (this.scrollHeight > 120) {
                this.style.overflowY = 'auto';
            } else {
                this.style.overflowY = 'hidden';
            }
        });
    }
}

// 他のタブに移動した際のフック
function handleOralExamTabLeave() {
    if (OralExamState.sessionActive) {
        const confirmLeave = confirm("現在、口頭試問セッションが進行中です。他のタブに移動すると、現在のセッション状況がリセットされます。移動しますか？");
        if (confirmLeave) {
            resetOralExamSession();
        }
    }
}

// セッション開始
async function startOralExamSession() {
    if (OralExamState.sessionActive) return;

    // 設定値の取得
    const subjectSelect = document.getElementById('oe-subject');
    const characterSelect = document.getElementById('oe-character');
    
    OralExamState.subject = subjectSelect ? subjectSelect.value : 'algebra';
    OralExamState.character = characterSelect ? characterSelect.value : 'euler';
    OralExamState.turnsCount = 0;
    OralExamState.hintsCount = 0;
    OralExamState.chatHistory = [];
    OralExamState.sessionActive = true;

    // 分野に対応する複数の問題リストからランダムに1問選択する
    const problemsList = ORAL_EXAM_PROBLEMS[OralExamState.subject];
    const randomIndex = Math.floor(Math.random() * problemsList.length);
    OralExamState.currentProblem = problemsList[randomIndex];

    // APIキーがない場合は、まずSupabase Edge Functionを試す。それもダメならデモ（モック）モードにする。
    // Edge Functionが使えるかどうかは、後続の通信時に判定します。
    OralExamState.isDemoMode = !OralExamState.apiKey;

    // UIの切り替え
    document.getElementById('oe-chat-placeholder').style.display = 'none';
    document.getElementById('oe-chat-messages').style.display = 'flex';
    document.getElementById('oe-chat-input-container').style.display = 'flex';
    document.getElementById('oe-evaluation-screen').style.display = 'none';
    
    // 設定変更UIを無効化
    if (subjectSelect) subjectSelect.disabled = true;
    if (characterSelect) characterSelect.disabled = true;
    const apiKeyInput = document.getElementById('oe-api-key');
    if (apiKeyInput) apiKeyInput.disabled = true;
    document.getElementById('oe-start-btn').style.display = 'none';
    document.getElementById('oe-reset-btn').style.display = 'block';

    // 状況パネルの更新
    const charData = EXAM_CHARACTERS[OralExamState.character];
    const subjectLabel = subjectSelect ? subjectSelect.options[subjectSelect.selectedIndex].text : '';
    document.getElementById('oe-status-char-name').textContent = charData.name;
    document.getElementById('oe-status-subject').textContent = subjectLabel;
    document.getElementById('oe-status-turns').textContent = '0';
    document.getElementById('oe-status-hints').textContent = '0';
    document.getElementById('oe-status-card').style.display = 'block';

    // メッセージコンテナのクリア
    const messagesContainer = document.getElementById('oe-chat-messages');
    messagesContainer.innerHTML = '';

    addSystemMessage("口頭試問セッションを開始しました。");
    
    if (OralExamState.isDemoMode) {
        // APIキー入力がない場合、Supabase Edge Functions の有無をテストするために一度空リクエストしてみる
        // または、直接AI応答処理を呼び出し、失敗したらデモモードとして処理する設計にします。
        // ここでは、読み込みを表示して通信を試みます。
        await fetchAIResponse(true);
    } else {
        // APIキーがある場合は直接呼び出し
        await fetchAIResponse(true);
    }
}

// セッションリセット
function resetOralExamSession() {
    OralExamState.sessionActive = false;
    OralExamState.chatHistory = [];
    OralExamState.turnsCount = 0;
    OralExamState.hintsCount = 0;
    OralExamState.isAILoading = false;
    OralExamState.isDemoMode = false;
    OralExamState.demoStep = 0;
    OralExamState.currentProblem = null;

    // UIの差し戻し
    document.getElementById('oe-chat-placeholder').style.display = 'flex';
    document.getElementById('oe-chat-messages').style.display = 'none';
    document.getElementById('oe-chat-input-container').style.display = 'none';
    document.getElementById('oe-evaluation-screen').style.display = 'none';
    
    // 設定変更UIの有効化
    const subjectSelect = document.getElementById('oe-subject');
    const characterSelect = document.getElementById('oe-character');
    if (subjectSelect) subjectSelect.disabled = false;
    if (characterSelect) characterSelect.disabled = false;
    const apiKeyInput = document.getElementById('oe-api-key');
    if (apiKeyInput) apiKeyInput.disabled = false;
    
    document.getElementById('oe-start-btn').style.display = 'block';
    document.getElementById('oe-reset-btn').style.display = 'none';
    document.getElementById('oe-status-card').style.display = 'none';

    // 入力エリアクリア
    const textarea = document.getElementById('oe-user-input');
    if (textarea) {
        textarea.value = '';
        textarea.style.height = '42px';
    }
}

// ユーザーメッセージ送信
async function sendUserMessage() {
    if (!OralExamState.sessionActive || OralExamState.isAILoading) return;

    const textarea = document.getElementById('oe-user-input');
    if (!textarea) return;

    const text = textarea.value.trim();
    if (!text) return;

    textarea.value = '';
    textarea.style.height = '42px';

    addChatMessage(text, 'user');
    
    OralExamState.turnsCount++;
    document.getElementById('oe-status-turns').textContent = OralExamState.turnsCount;

    if (OralExamState.isDemoMode) {
        // 完全デモモード（モック）の応答シーケンス
        showLoadingBubble();
        OralExamState.isAILoading = true;

        setTimeout(() => {
            removeLoadingBubble();
            OralExamState.isAILoading = false;
            
            const char = EXAM_CHARACTERS[OralExamState.character];
            const prob = OralExamState.currentProblem;
            let reply = '';
            
            if (OralExamState.demoStep === 0) {
                // 1回目の回答への突っ込み
                if (prob.id.startsWith('alg')) {
                    reply = `${char.avatar} **${char.name}**: 「なるほど、回答方針についてはその方向で間違いありません。では、より詳細に踏み込んでみましょう。実対称行列の固有値が実数であることを示す際、定義に立ち返って複素共役と内積の対称性をどう組み合わせるか、等式の各ステップを厳密に説明してください。」`;
                } else if (prob.id.startsWith('ana')) {
                    reply = `${char.avatar} **${char.name}**: 「ご説明ありがとうございます。連続性については一様収束の議論が必要ですね。では、各点での微分不可能性、つまり極限値が存在せずに発散する点について、極限操作と級数の重ね合わせの観点からどう説明しますか？」`;
                } else {
                    reply = `${char.avatar} **${char.name}**: 「ありがとうございます。定義をしっかりと意識されていますね。では、Heine-Borelの同値性が崩れる『一般の距離空間での反例』について、どのような具体例が頭に浮かびますか？何か1つ構成してみてください。」`;
                }
                OralExamState.demoStep = 1;
            } else {
                // 2回目以降の回答（キーワード検出）
                const lowercaseText = text.toLowerCase();
                const keywords = ['ワイエルシュタイン', 'weierstrass', '対角', '直交', '共役', '内積', 'エルミート', '帰納', '離散', 'ヒルベルト', '球', '完備', '全有界', 'bounded', 'complete', '同型', '生成元', 'ガロア', '固定体', '分解体', '留数', '極', '収束', '優収束', 'ライプニッツ', '接空間', '基本群', '被覆', 'リフト'];
                const hasKeyword = keywords.some(kw => lowercaseText.includes(kw));

                if (hasKeyword) {
                    reply = `${char.avatar} **${char.name}**: 「素晴らしい！極めて本質的な議論やキーワードがしっかりと出てきました。理解の深さが伺えます。他にも補足したいことや、アピールしたいディテールがあれば述べてください。特になければ『🏁 終了して評価』ボタンを押して全体の採点に進みましょう。」`;
                } else {
                    reply = `${char.avatar} **${char.name}**: 「ふむ、なるほど。しかし、定理の厳密な証明や定義に照らし合わせると、もう少しギャップを埋める説明が必要です。行き詰まった場合は、チャット下の『💡 ヒントをもらう』ボタンを押していただくか、あるいはこれで十分でしたら『🏁 終了して評価』に進んでください。」`;
                }
            }

            addChatMessage(reply, 'ai');
        }, 1500);
    } else {
        // AIモード
        OralExamState.chatHistory.push({
            role: "user",
            parts: [{ text: text }]
        });
        
        await fetchAIResponse(false);
    }
}

// ヒントを求める
async function requestHint() {
    if (!OralExamState.sessionActive || OralExamState.isAILoading) return;

    OralExamState.hintsCount++;
    document.getElementById('oe-status-hints').textContent = OralExamState.hintsCount;

    addSystemMessage("ヒントを要求しました。");

    if (OralExamState.isDemoMode) {
        showLoadingBubble();
        OralExamState.isAILoading = true;
        
        setTimeout(() => {
            removeLoadingBubble();
            OralExamState.isAILoading = false;
            
            const prob = OralExamState.currentProblem;
            const char = EXAM_CHARACTERS[OralExamState.character];
            
            const hintIndex = Math.min(OralExamState.hintsCount - 1, prob.hints.length - 1);
            const hintText = prob.hints[hintIndex];
            
            addChatMessage(`${char.avatar} **${char.name}**: 「（ヒントを差し上げましょう）\n\n${hintText}」`, 'ai');
        }, 1000);
    } else {
        // AIモード
        const promptText = "【受験者よりシステム的要請：現在、私は回答に行き詰まっており、ヒントを求めています。解答そのものは絶対に教えず、次に私が考えるべき方向性を指し示すような『教育的なヒント』を1〜2文程度で優しく提示してください。】";
        
        OralExamState.chatHistory.push({
            role: "user",
            parts: [{ text: promptText }]
        });

        await fetchAIResponse(false);
    }
}

// Gemini API または Supabase Edge Function 経由で応答を取得する
async function fetchAIResponse(isInitial = false) {
    OralExamState.isAILoading = true;
    showLoadingBubble();

    const char = EXAM_CHARACTERS[OralExamState.character];
    const prob = OralExamState.currentProblem;
    const subjectLabel = document.getElementById('oe-subject').options[document.getElementById('oe-subject').selectedIndex].text;

    // システムプロンプトの構築
    const systemPrompt = `あなたは大学数学科の口頭試問を担当する大学教授（試験官）です。
名前は ${char.name} であり、あなたのキャラクター設定は以下の通りです：
---
${char.persona}
---
受験者であるユーザーに対して、対話型で口頭試問を行います。

【動作ルール】：
1. 今回出題する問題は以下の通りです。他の問題を出題したり脱線したりしないでください。
------------------
分野: ${subjectLabel}
問題: ${prob.problem}
------------------
2. ${isInitial ? `最初の応答として、この問題を受験者に提示し、キャラクターらしい挨拶と試験開始の宣言を行ってください。` : `ユーザーの回答に対して、論理の飛躍や間違いがないかを確認し、深く理解しているかを確かめるための追加の問いかけを行ってください。`}
3. 受験者が回答に詰まったり「ヒント」を求めてきた場合は、解答そのものを教えるのではなく、ソクラテス式メソッドのように「〜について考えるとどうですか？」などのように、次に踏み出すべきヒントを一歩ずつ与えてください。
4. 数式を記述する際は、標準的なLaTeX表記（インラインは $...$ 、ディスプレイは $$...$$）を使用してください。
5. 親しみやすい日本語で対話を行ってください。あなたのキャラクター口調を絶対に崩さないでください。`;

    if (isInitial) {
        OralExamState.chatHistory.push({
            role: "user",
            parts: [{ text: "口頭試問を始めてください。" }]
        });
    }

    // 1. フロントエンドにAPIキーがある場合：直接Gemini APIを叩く
    if (OralExamState.apiKey) {
        try {
            const model = 'gemini-2.5-flash';
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${OralExamState.apiKey}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: OralExamState.chatHistory,
                    systemInstruction: { parts: [{ text: systemPrompt }] },
                    generationConfig: { temperature: 0.7, maxOutputTokens: 1500 }
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error?.message || `HTTP ${response.status}`);
            }

            const data = await response.json();
            const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!replyText) throw new Error("応答データが空でした。");

            handleSuccessfulAIResponse(replyText);
            return;
        } catch (error) {
            console.error("Direct API Call Failed, trying Supabase Edge Function fallback...", error);
            // 直接呼び出しが失敗した場合は、Supabase呼び出しにフォールバック
        }
    }

    // 2. フロントにAPIキーがない、または直接呼び出しが失敗した場合：Supabase Edge Functionの呼び出しを試みる
    try {
        const config = window.SUPABASE_CONFIG;
        const baseUrl = config?.functionsBaseUrl 
            || (config?.url ? `${String(config.url).replace(/\/$/, '')}/functions/v1` : '');
        
        if (!baseUrl) {
            throw new Error("Supabase config is not initialized.");
        }

        const url = `${baseUrl}/oral-exam-chat`;
        const headers = { 'Content-Type': 'application/json' };

        // Supabase Authセッションがあれば authorization ヘッダーを付与
        const sbSession = getSupabaseSession();
        if (sbSession?.access_token) {
            headers['Authorization'] = `Bearer ${sbSession.access_token}`;
        }
        // supabase keyをapikeyヘッダーに付与
        if (config?.anonKey) {
            headers['apikey'] = config.anonKey;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                chatHistory: OralExamState.chatHistory,
                systemPrompt: systemPrompt,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const errText = await response.text().catch(() => "");
            throw new Error(`Edge Function error (${response.status}): ${errText}`);
        }

        const data = await response.json();
        if (!data.text) throw new Error("Edge Function から有効なテキストが返されませんでした。");

        handleSuccessfulAIResponse(data.text);

    } catch (error) {
        console.warn("Supabase Edge Function Call Failed. Falling back to Demo Mode...", error);
        switchToDemoMode(isInitial);
    }
}

// AIの応答に成功したときの共通処理
function handleSuccessfulAIResponse(replyText) {
    removeLoadingBubble();
    OralExamState.isAILoading = false;
    OralExamState.isDemoMode = false;

    const char = EXAM_CHARACTERS[OralExamState.character];
    addChatMessage(`${char.avatar} **${char.name}**: ${replyText}`, 'ai');

    // 履歴にAIの応答を記録
    OralExamState.chatHistory.push({
        role: "model",
        parts: [{ text: replyText }]
    });
}

// デモモード（モック）への移行処理
function switchToDemoMode(isInitial) {
    removeLoadingBubble();
    OralExamState.isAILoading = false;
    OralExamState.isDemoMode = true;

    addSystemMessage("⚠️ API通信に接続できませんでした。このまま「デモモード（シミュレーション）」で継続します。");
    
    const char = EXAM_CHARACTERS[OralExamState.character];
    const prob = OralExamState.currentProblem;

    if (isInitial) {
        OralExamState.demoStep = 0;
        const welcomeText = `${char.avatar} **${char.name}**: 「こんにちは。これより口頭試問を始めます。私の担当は ${document.getElementById('oe-subject').options[document.getElementById('oe-subject').selectedIndex].text} です。\n\nそれでは、さっそくですが以下の問題について説明してください。」\n\n$$\\quad$$\n**【問題】**\n${prob.problem}`;
        addChatMessage(welcomeText, 'ai');
    } else {
        OralExamState.demoStep = 1;
        addChatMessage("🤖 「デモモードに切り替わりました。引き続き回答を入力するか、ヒントボタンをご利用ください。」", 'ai');
    }
}

// Supabase セッション取得用ヘルパー (auth.js 等の環境から読み込みを試みる)
function getSupabaseSession() {
    try {
        // ローカルストレージに保存されている Supabase セッションキーを探す
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
                const sessionStr = localStorage.getItem(key);
                if (sessionStr) {
                    return JSON.parse(sessionStr);
                }
            }
        }
    } catch (_e) {
        // ignore
    }
    return null;
}

// 終了して評価
async function finishAndEvaluate() {
    if (!OralExamState.sessionActive || OralExamState.isAILoading) return;

    const confirmFinish = confirm("口頭試問を終了し、これまでの対話から最終評価を出力します。よろしいですか？");
    if (!confirmFinish) return;

    addSystemMessage("口頭試問を終了しました。評価を生成しています...");
    
    // UIを評価ロード中に
    const messagesContainer = document.getElementById('oe-chat-messages');
    messagesContainer.style.display = 'none';
    document.getElementById('oe-chat-input-container').style.display = 'none';
    
    const evalScreen = document.getElementById('oe-evaluation-screen');
    evalScreen.innerHTML = `
        <div style="text-align: center; padding: 50px 0;">
            <div class="oe-loading-bubble" style="display: inline-flex; align-self: center; margin-bottom: 20px;">
                <div class="oe-loading-dot"></div>
                <div class="oe-loading-dot"></div>
                <div class="oe-loading-dot"></div>
            </div>
            <h3>📋 評価レポートを作成中...</h3>
            <p style="color: var(--text-muted); font-size: 0.9rem;">試験官がこれまでの対話履歴を分析し、採点を行っています。しばらくお待ちください。</p>
        </div>
    `;
    evalScreen.style.display = 'block';

    if (OralExamState.isDemoMode) {
        // デモモード（モック）の評価出力
        setTimeout(() => {
            const prob = OralExamState.currentProblem;
            
            // ターン数やヒント数に応じた演出スコアリング
            let score = 92;
            let grade = 'A';
            if (OralExamState.hintsCount === 1) { score = 81; grade = 'B'; }
            else if (OralExamState.hintsCount >= 2) { score = 68; grade = 'C'; }
            if (OralExamState.turnsCount <= 1 && OralExamState.hintsCount === 0) { score = 55; grade = 'D'; }

            const report = {
                score: score,
                grade: grade,
                problemTitle: prob.title,
                strengths: prob.strengths,
                weaknesses: prob.weaknesses,
                modelAnswer: prob.modelAnswer,
                advice: prob.advice
            };

            renderEvaluationReport(report);
        }, 1800);
    } else {
        // AIモード
        try {
            const char = EXAM_CHARACTERS[OralExamState.character];
            
            // 評価プロンプトの構築
            const evalPromptText = `【システム指示：口頭試問は終了しました。これまでのすべての対話履歴を慎重に読み込んで、受験者の理解度を総合評価してください。
以下のキーを持つ「有効なJSONオブジェクトのみ」を出力してください（JSON以外の余計な挨拶や説明の文章は出力に含めないでください）。

JSON構造：
{
  "score": 得点 (0〜100の整数),
  "grade": 評価ランク ("S" | "A" | "B" | "C" | "D"),
  "problemTitle": "出題した問題の簡潔なタイトル",
  "strengths": "受験者の回答の良かった点、優れていた論理や洞察",
  "weaknesses": "受験者の回答で不十分だった点、論理の飛躍、誤解していた点",
  "modelAnswer": "本問題に対する数学的に厳密で綺麗な模範解答と解説（LaTeX数式を使用し、詳しく論じてください）",
  "advice": "今後の数学の学習へ向けた具体的なアドバイス（${char.name} の口調で記述してください）"
}

評価基準：
- S: 85点以上（核心を完全に理解し、問いかけに対して論理的かつ厳密に答えられた）
- A: 80〜84点（基本は完璧に理解しており、軽微なギャップに対する指摘で修正できた）
- B: 70〜79点（大枠は理解できているが、定義の厳密性や詳細の証明にいくつかの課題が残る）
- C: 60〜69点（ヒントを多く必要とし、部分的な理解にとどまる）
- D: 59点以下（理解が不十分、またはほとんど回答できなかった）】`;

            OralExamState.chatHistory.push({
                role: "user",
                parts: [{ text: evalPromptText }]
            });

            let responseJsonText = "";

            if (OralExamState.apiKey) {
                // 1. APIキーがある場合は直接
                const model = 'gemini-2.5-flash';
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${OralExamState.apiKey}`;
                
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: OralExamState.chatHistory,
                        generationConfig: {
                            temperature: 0.2,
                            responseMimeType: "application/json"
                        }
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    responseJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
                }
            }

            // 2. 直接呼び出しがない、または失敗した場合は Edge Function を経由
            if (!responseJsonText) {
                const config = window.SUPABASE_CONFIG;
                const baseUrl = config?.functionsBaseUrl 
                    || (config?.url ? `${String(config.url).replace(/\/$/, '')}/functions/v1` : '');
                
                if (!baseUrl) throw new Error("Supabase config is not loaded.");

                const url = `${baseUrl}/oral-exam-chat`;
                const headers = { 'Content-Type': 'application/json' };

                const sbSession = getSupabaseSession();
                if (sbSession?.access_token) {
                    headers['Authorization'] = `Bearer ${sbSession.access_token}`;
                }
                if (config?.anonKey) {
                    headers['apikey'] = config.anonKey;
                }

                const response = await fetch(url, {
                    method: 'POST',
                    headers: headers,
                    body: JSON.stringify({
                        chatHistory: OralExamState.chatHistory,
                        temperature: 0.2,
                        responseMimeType: "application/json"
                    })
                });

                if (!response.ok) {
                    const err = await response.text().catch(() => "");
                    throw new Error(`Edge Function Eval Error: ${err}`);
                }

                const data = await response.json();
                responseJsonText = data.text || "";
            }

            if (!responseJsonText) {
                throw new Error("評価レスポンスが空でした。");
            }

            // JSONテキストのクレンジング
            let cleanedJson = responseJsonText.trim();
            if (cleanedJson.startsWith("```")) {
                cleanedJson = cleanedJson.replace(/^```json/, "").replace(/^```/, "").replace(/```$/, "").trim();
            }

            const report = JSON.parse(cleanedJson);
            renderEvaluationReport(report);

        } catch (error) {
            console.error("Evaluation generation failed:", error);
            evalScreen.innerHTML = `
                <div style="text-align: center; padding: 40px; border: 1px dashed #ffa39e; border-radius: 12px; background-color: #fff1f0;">
                    <span style="font-size: 2.5rem;">⚠️</span>
                    <h3>評価レポートの生成に失敗しました</h3>
                    <p style="color: #cf1322;">エラー：${error.message}</p>
                    <p>接続環境をご確認いただくか、あるいはデモ用の評価レポートを表示して終了することができます。</p>
                    <button class="oe-btn oe-primary-btn" onclick="useDemoEvaluationFallback()" style="width: auto; margin-top: 12px;">📊 デモ用評価を表示する</button>
                    <button class="oe-btn oe-secondary-btn" onclick="resetOralExamSession()" style="width: auto; margin-top: 12px; margin-left: 8px;">ロビーへ戻る</button>
                </div>
            `;
        }
    }
}

// 評価失敗時のデモフォールバック
function useDemoEvaluationFallback() {
    const prob = OralExamState.currentProblem;
    const report = {
        score: 78,
        grade: "B",
        problemTitle: prob.title,
        strengths: prob.strengths,
        weaknesses: prob.weaknesses,
        modelAnswer: prob.modelAnswer,
        advice: prob.advice
    };
    renderEvaluationReport(report);
}

// 評価レポートをDOMに描画する
function renderEvaluationReport(report) {
    const evalScreen = document.getElementById('oe-evaluation-screen');
    if (!evalScreen) return;

    const strokeDasharray = 301.6;
    const strokeDashoffset = strokeDasharray - (strokeDasharray * (report.score || 0)) / 100;
    
    const char = EXAM_CHARACTERS[OralExamState.character];
    
    let rankColor = '#2f6f4e'; // S, A, B: green
    if (report.grade === 'C') rankColor = '#d46b08'; // orange
    if (report.grade === 'D') rankColor = '#cf1322'; // red

    evalScreen.innerHTML = `
        <div class="oe-eval-header">
            <!-- 得点サークル -->
            <div class="oe-eval-score-container">
                <svg width="110" height="110" class="oe-score-ring">
                    <circle class="oe-score-ring-circle-bg" cx="55" cy="55" r="48" />
                    <circle class="oe-score-ring-circle" cx="55" cy="55" r="48" 
                            style="stroke-dasharray: ${strokeDasharray}; stroke-dashoffset: ${strokeDasharray};" />
                </svg>
                <div class="oe-eval-score-text">
                    <div class="oe-eval-score-num"><span id="oe-score-counter">0</span></div>
                    <div class="oe-eval-score-lbl">点</div>
                </div>
            </div>

            <!-- 評価要約 -->
            <div class="oe-eval-rank-container">
                <h3 class="oe-eval-title">口頭試問結果</h3>
                <div class="oe-eval-rank-badge" style="color: ${rankColor}; background-color: ${rankColor}12; border-color: ${rankColor}40;">
                    <span>試験官判定:</span>
                    <strong class="oe-rank-letter" style="color: ${rankColor};">${escapeHTML(report.grade || 'A')}</strong>
                </div>
                <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 8px;">
                    出題：<strong>${escapeHTML(report.problemTitle || '口頭試問課題')}</strong>
                </div>
            </div>
        </div>

        <!-- 良かった点 -->
        <div class="oe-eval-section">
            <h4>🟢 優れている点</h4>
            <p>${formatMathText(report.strengths || '論理の基本的な流れは理解できています。')}</p>
        </div>

        <!-- 改善点 -->
        <div class="oe-eval-section">
            <h4>🔴 改善・指摘事項</h4>
            <p>${formatMathText(report.weaknesses || '特になし。細かい論理ギャップに注意しましょう。')}</p>
        </div>

        <!-- 模範解答 -->
        <div class="oe-eval-section">
            <h4>📝 模範解答・解説</h4>
            <div class="oe-model-answer">
                ${formatMathText(report.modelAnswer || '解答準備中。')}
            </div>
        </div>

        <!-- アドバイス -->
        <div class="oe-eval-section" style="background-color: var(--accent-soft); border-color: #cbe0d3;">
            <h4>👨‍🏫 試験官からのアドバイス (${escapeHTML(char.name)})</h4>
            <p style="font-style: italic; color: #2d553f;">
                ${formatMathText(report.advice || '今後も精進してください。')}
            </p>
        </div>

        <!-- 操作ボタン -->
        <div class="oe-eval-actions">
            <button class="oe-btn oe-primary-btn" onclick="resetOralExamSession()" style="width: auto;">もう一度挑戦する</button>
        </div>
    `;

    // 数式表示の実行
    typesetMath(evalScreen);

    // スコアメーターのアニメーション起動
    setTimeout(() => {
        const progressCircle = evalScreen.querySelector('.oe-score-ring-circle');
        if (progressCircle) {
            progressCircle.style.strokeDashoffset = strokeDashoffset;
        }
        
        // 得点カウンターのアニメーション
        const counter = document.getElementById('oe-score-counter');
        if (counter) {
            let start = 0;
            const end = report.score || 0;
            if (end === 0) return;
            const duration = 1000; // ms
            const stepTime = Math.abs(Math.floor(duration / end));
            const timer = setInterval(() => {
                start++;
                counter.textContent = start;
                if (start >= end) {
                    clearInterval(timer);
                }
            }, stepTime);
        }
    }, 100);
}

// ----------------------------------------------------
// UIヘルパー関数
// ----------------------------------------------------

// システムメッセージをチャットに追加
function addSystemMessage(text) {
    const container = document.getElementById('oe-chat-messages');
    if (!container) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = 'oe-message oe-system-msg';
    msgDiv.innerHTML = `
        <div class="oe-message-bubble">${escapeHTML(text)}</div>
    `;
    container.appendChild(msgDiv);
    scrollChatToBottom();
}

// チャットメッセージを画面に追加
function addChatMessage(text, sender) {
    const container = document.getElementById('oe-chat-messages');
    if (!container) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = `oe-message oe-${sender}-msg`;

    const char = EXAM_CHARACTERS[OralExamState.character];
    const senderName = sender === 'ai' ? char.name : 'あなた';
    
    let formattedText = formatMathText(text);

    msgDiv.innerHTML = `
        <div class="oe-message-avatar">${escapeHTML(senderName)}</div>
        <div class="oe-message-bubble">${formattedText}</div>
    `;
    
    container.appendChild(msgDiv);
    
    // 数式のレンダリング
    typesetMath(msgDiv);
    
    scrollChatToBottom();
}

// ロード中バブルを表示
function showLoadingBubble() {
    const container = document.getElementById('oe-chat-messages');
    if (!container) return;

    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'oe-loading-bubble';
    loadingDiv.id = 'oe-loading-bubble';
    loadingDiv.innerHTML = `
        <div class="oe-loading-dot"></div>
        <div class="oe-loading-dot"></div>
        <div class="oe-loading-dot"></div>
    `;
    container.appendChild(loadingDiv);
    scrollChatToBottom();
}

// ロード中バブルを削除
function removeLoadingBubble() {
    const bubble = document.getElementById('oe-loading-bubble');
    if (bubble) {
        bubble.remove();
    }
}

// チャットの下部スクロール
function scrollChatToBottom() {
    const container = document.getElementById('oe-chat-messages');
    if (container) {
        container.scrollTo({
            top: container.scrollHeight,
            behavior: 'smooth'
        });
    }
}

// 数式テキスト（$ や $$）を MathJax 向けにフォーマット
function formatMathText(text) {
    if (!text) return "";

    let escaped = escapeHTML(text);

    escaped = escaped.replace(/&lt;/g, "<")
                     .replace(/&gt;/g, ">")
                     .replace(/&amp;/g, "&")
                     .replace(/&quot;/g, '"');

    escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    escaped = escaped.replace(/(?<!\\)\n/g, '<br>');

    // $$...$$ -> \[...\]
    escaped = escaped.replace(/\$\$(.*?)\$\$/gs, '\\[$1\\]');
    // $...$ -> \(...\)
    escaped = escaped.replace(/\$(.*?)\$/g, '\\($1\\)');

    return escaped;
}

// エスケープ関数
function escapeHTML(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
