/**
 * LaTeX Typing Game "Tex-Da" (Tex打)
 * Core Game Logic, Parser, and Equivalence Engine
 */

// --- 1. LaTeX Parser & NFA Equivalence Engine ---

/**
 * LaTeX Tokenizer
 */
function tokenizeLaTeX(str) {
    const tokens = [];
    let i = 0;
    while (i < str.length) {
        const char = str[i];
        if (char === '\\') {
            let name = '\\';
            i++;
            if (i < str.length && /[a-zA-Z]/.test(str[i])) {
                while (i < str.length && /[a-zA-Z]/.test(str[i])) {
                    name += str[i];
                    i++;
                }
            } else if (i < str.length) {
                name += str[i];
                i++;
            }
            tokens.push({ type: 'COMMAND', value: name });
        } else if (char === '{' || char === '}') {
            tokens.push({ type: char === '{' ? 'LBRACE' : 'RBRACE', value: char });
            i++;
        } else if (char === '^' || char === '_') {
            tokens.push({ type: char === '^' ? 'SUPER' : 'SUB', value: char });
            i++;
        } else if (/\s/.test(char)) {
            tokens.push({ type: 'SPACE', value: char });
            i++;
        } else {
            tokens.push({ type: 'CHAR', value: char });
            i++;
        }
    }
    return tokens;
}

/**
 * LaTeX AST Parser
 */
function parseLaTeX(tokens) {
    let index = 0;

    function parseExpression() {
        const nodes = [];
        while (index < tokens.length) {
            const token = tokens[index];
            if (token.type === 'RBRACE') {
                break;
            }
            const node = parsePrimary();
            if (node) {
                nodes.push(node);
            }
        }
        return nodes;
    }

    function parsePrimary() {
        if (index >= tokens.length) return null;
        const token = tokens[index];

        if (token.type === 'SPACE') {
            index++;
            return { type: 'SpaceNode' };
        }

        if (token.type === 'LBRACE') {
            index++; // consume '{'
            const children = parseExpression();
            if (index < tokens.length && tokens[index].type === 'RBRACE') {
                index++; // consume '}'
            }
            const node = { type: 'GroupNode', children };
            return parseSuffix(node);
        }

        if (token.type === 'COMMAND') {
            index++;
            let node = { type: 'CommandNode', name: token.value };
            if (token.value === '\\frac') {
                skipSpaces();
                const num = parseArg();
                skipSpaces();
                const den = parseArg();
                node = { type: 'FracNode', num, den };
            } else if (token.value === '\\sqrt') {
                skipSpaces();
                const arg = parseArg();
                node = { type: 'SqrtNode', arg };
            }
            return parseSuffix(node);
        }

        if (token.type === 'CHAR') {
            index++;
            const node = { type: 'CharNode', value: token.value };
            return parseSuffix(node);
        }

        if (token.type === 'SUPER' || token.type === 'SUB') {
            index++;
            const script = parseArg();
            return {
                type: token.type === 'SUPER' ? 'SuperNode' : 'SubNode',
                base: null,
                script
            };
        }

        index++;
        return null;
    }

    function skipSpaces() {
        while (index < tokens.length && tokens[index].type === 'SPACE') {
            index++;
        }
    }

    function parseArg() {
        if (index >= tokens.length) return null;
        const token = tokens[index];
        if (token.type === 'LBRACE') {
            index++; // consume '{'
            const children = parseExpression();
            if (index < tokens.length && tokens[index].type === 'RBRACE') {
                index++; // consume '}'
            }
            return { type: 'GroupNode', children };
        }
        return parsePrimary();
    }

    function parseSuffix(baseNode) {
        skipSpaces();
        if (index < tokens.length) {
            const nextToken = tokens[index];
            if (nextToken.type === 'SUPER') {
                index++;
                const script = parseArg();
                const newNode = { type: 'SuperNode', base: baseNode, script };
                return parseSuffix(newNode);
            }
            if (nextToken.type === 'SUB') {
                index++;
                const script = parseArg();
                const newNode = { type: 'SubNode', base: baseNode, script };
                return parseSuffix(newNode);
            }
        }
        return baseNode;
    }

    return parseExpression();
}

// LaTeX Command Aliases for equivalence
const LATEX_COMMAND_ALIASES = {
    '\\ge': ['\\ge', '\\geq'],
    '\\geq': ['\\ge', '\\geq'],
    '\\le': ['\\le', '\\leq'],
    '\\leq': ['\\le', '\\leq'],
    '\\to': ['\\to', '\\rightarrow'],
    '\\rightarrow': ['\\to', '\\rightarrow'],
    '\\gets': ['\\gets', '\\leftarrow'],
    '\\leftarrow': ['\\gets', '\\leftarrow'],
    '\\neq': ['\\neq', '\\ne'],
    '\\ne': ['\\neq', '\\ne'],
    '\\land': ['\\land', '\\wedge'],
    '\\wedge': ['\\land', '\\wedge'],
    '\\lor': ['\\lor', '\\vee'],
    '\\vee': ['\\lor', '\\vee'],
    '\\epsilon': ['\\epsilon', '\\varepsilon'],
    '\\varepsilon': ['\\epsilon', '\\varepsilon'],
    '\\phi': ['\\phi', '\\varphi'],
    '\\varphi': ['\\phi', '\\varphi'],
    '\\emptyset': ['\\emptyset', '\\varnothing'],
    '\\varnothing': ['\\emptyset', '\\varnothing'],
};

/**
 * Checks if a GroupNode can have its braces omitted.
 * Braces can be omitted in LaTeX if the content is a single character or a single command.
 */
function canOmitBraces(node) {
    if (!node) return false;
    if (node.type !== 'GroupNode') return false;
    // Filter out spaces
    const activeChildren = node.children.filter(c => c.type !== 'SpaceNode');
    if (activeChildren.length === 1) {
        const child = activeChildren[0];
        return child.type === 'CharNode' || child.type === 'CommandNode';
    }
    return false;
}

/**
 * Builds the NFA state transition graph from LaTeX AST
 */
class LaTeXGraphBuilder {
    constructor() {
        this.graph = {};
        this.nodeIdCounter = 0;
    }

    createNode() {
        const id = this.nodeIdCounter++;
        this.graph[id] = { id, transitions: {} };
        return id;
    }

    addTransition(from, to, char) {
        if (!this.graph[from].transitions[char]) {
            this.graph[from].transitions[char] = [];
        }
        if (!this.graph[from].transitions[char].includes(to)) {
            this.graph[from].transitions[char].push(to);
        }
    }

    addStringPath(from, to, str) {
        let current = from;
        for (let i = 0; i < str.length; i++) {
            const next = (i === str.length - 1) ? to : this.createNode();
            this.addTransition(current, next, str[i]);
            current = next;
        }
    }

    addCommandPath(from, to, commandName) {
        const aliases = LATEX_COMMAND_ALIASES[commandName] || [commandName];
        aliases.forEach(alias => {
            this.addStringPath(from, to, alias);
        });
    }

    buildGraph(astNodes) {
        this.graph = {};
        this.nodeIdCounter = 0;
        const start = this.createNode();
        const end = this.processList(astNodes, start);
        
        // Add self-loop for space in all states so users can type extra spaces anywhere
        // except when typing a command name (though that is simplified here as well)
        Object.keys(this.graph).forEach(id => {
            this.addTransition(id, id, ' ');
        });

        return { graph: this.graph, start, end };
    }

    processList(nodes, fromNodeId) {
        let current = fromNodeId;
        const activeNodes = nodes.filter(n => n.type !== 'SpaceNode');
        for (const node of activeNodes) {
            current = this.processNode(node, current);
        }
        return current;
    }

    processFlexibleArgument(node, fromNodeId) {
        if (!node) return fromNodeId;

        const to = this.createNode();
        let children = [];
        let canOmit = false;

        if (node.type === 'GroupNode') {
            children = node.children;
            canOmit = canOmitBraces(node);
        } else {
            children = [node];
            canOmit = true; // Single character or command, braces can be freely added
        }

        if (canOmit) {
            // Path A: With braces
            const braceStart = this.createNode();
            this.addTransition(fromNodeId, braceStart, '{');
            const braceEnd = this.processList(children, braceStart);
            this.addTransition(braceEnd, to, '}');

            // Path B: Without braces
            const noBraceEnd = this.processList(children, fromNodeId);
            this.addTransition(noBraceEnd, to, ''); // Epsilon transition
        } else {
            // Braces are strictly required
            const braceStart = this.createNode();
            this.addTransition(fromNodeId, braceStart, '{');
            const braceEnd = this.processList(children, braceStart);
            this.addTransition(braceEnd, to, '}');
        }

        return to;
    }

    processNode(node, fromNodeId) {
        if (!node) return fromNodeId;

        switch (node.type) {
            case 'CharNode': {
                const to = this.createNode();
                this.addTransition(fromNodeId, to, node.value);
                return to;
            }
            case 'CommandNode': {
                const to = this.createNode();
                this.addCommandPath(fromNodeId, to, node.name);
                return to;
            }
            case 'GroupNode': {
                const to = this.createNode();
                if (canOmitBraces(node)) {
                    // Path A: With braces
                    const braceStart = this.createNode();
                    this.addTransition(fromNodeId, braceStart, '{');
                    const braceEnd = this.processList(node.children, braceStart);
                    this.addTransition(braceEnd, to, '}');

                    // Path B: Without braces
                    const noBraceEnd = this.processList(node.children, fromNodeId);
                    this.addTransition(noBraceEnd, to, ''); // Epsilon transition
                } else {
                    // Braces are required
                    const braceStart = this.createNode();
                    this.addTransition(fromNodeId, braceStart, '{');
                    const braceEnd = this.processList(node.children, braceStart);
                    this.addTransition(braceEnd, to, '}');
                }
                return to;
            }
            case 'SuperNode':
            case 'SubNode': {
                const isSuper = node.type === 'SuperNode';
                const baseEnd = node.base ? this.processNode(node.base, fromNodeId) : fromNodeId;
                const scriptStart = this.createNode();
                this.addTransition(baseEnd, scriptStart, isSuper ? '^' : '_');
                return this.processFlexibleArgument(node.script, scriptStart);
            }
            case 'FracNode': {
                const fracEnd = this.createNode();
                this.addCommandPath(fromNodeId, fracEnd, '\\frac');
                const numEnd = this.processFlexibleArgument(node.num, fracEnd);
                return this.processFlexibleArgument(node.den, numEnd);
            }
            case 'SqrtNode': {
                const sqrtEnd = this.createNode();
                this.addCommandPath(fromNodeId, sqrtEnd, '\\sqrt');
                return this.processFlexibleArgument(node.arg, sqrtEnd);
            }
            default:
                return fromNodeId;
        }
    }
}

/**
 * LaTeX Typing Engine using NFA
 */
class LaTeXTypingEngine {
    constructor(texString) {
        this.tex = texString;
        const tokens = tokenizeLaTeX(texString);
        const ast = parseLaTeX(tokens);
        const builder = new LaTeXGraphBuilder();
        const buildResult = builder.buildGraph(ast);
        
        this.graph = buildResult.graph;
        this.startNode = buildResult.start;
        this.endNode = buildResult.end;
        
        // Active states in the NFA (represented by node IDs)
        this.activeStates = this.getEpsilonClosure([this.startNode]);
        this.typedBuffer = "";
    }

    /**
     * Compute Epsilon Closure of given states
     */
    getEpsilonClosure(states) {
        const closure = new Set(states);
        const queue = [...states];
        while (queue.length > 0) {
            const current = queue.shift();
            const epsTransitions = this.graph[current]?.transitions[""] || [];
            for (const nextId of epsTransitions) {
                if (!closure.has(nextId)) {
                    closure.add(nextId);
                    queue.push(nextId);
                }
            }
        }
        return Array.from(closure);
    }

    /**
     * Test character match (handling backslash / yen key equality)
     */
    isCharMatch(input, target) {
        if (target === '\\' || target === '¥') {
            return input === '\\' || input === '¥';
        }
        if (/\s/.test(target) && /\s/.test(input)) {
            return true;
        }
        return input === target;
    }

    /**
     * Process user keyboard input
     * Returns true if input was accepted (correct type), false if rejected (mistype)
     */
    inputChar(char) {
        // Space normalization
        if (/\s/.test(char)) char = ' ';

        const currentStates = this.getEpsilonClosure(this.activeStates);
        const nextStates = new Set();
        let accepted = false;

        // Try to transition with the input char
        for (const stateId of currentStates) {
            const transitions = this.graph[stateId]?.transitions || {};
            for (const edgeChar in transitions) {
                if (edgeChar !== "" && this.isCharMatch(char, edgeChar)) {
                    const targets = transitions[edgeChar] || [];
                    for (const targetId of targets) {
                        nextStates.add(targetId);
                    }
                    accepted = true;
                }
            }
        }

        if (accepted && nextStates.size > 0) {
            this.activeStates = this.getEpsilonClosure(Array.from(nextStates));
            this.typedBuffer += char;
            return true;
        }

        // If not accepted, check if it's a redundant space
        // (if active states have a transition to themselves on space, it's accepted as redundant)
        let isRedundantSpace = false;
        if (char === ' ') {
            for (const stateId of currentStates) {
                const transitions = this.graph[stateId]?.transitions || {};
                if (transitions[' ']?.includes(stateId)) {
                    isRedundantSpace = true;
                    break;
                }
            }
        }
        if (isRedundantSpace) {
            // Keep current states, do not mark as typo, don't append to buffer
            return true;
        }

        return false;
    }

    /**
     * Check if typing is complete
     */
    isComplete() {
        const closure = this.getEpsilonClosure(this.activeStates);
        return closure.includes(this.endNode);
    }

    /**
     * Get the next character suggestions for guidance
     */
    getNextExpectedChars() {
        const currentStates = this.getEpsilonClosure(this.activeStates);
        const chars = new Set();
        for (const stateId of currentStates) {
            const transitions = this.graph[stateId]?.transitions || {};
            for (const edgeChar in transitions) {
                if (edgeChar !== "" && edgeChar !== ' ') {
                    chars.add(edgeChar);
                }
            }
        }
        return Array.from(chars);
    }

    /**
     * Returns the closest matching text progression for display.
     * We reconstruct the path from start to the first active state to show typed/untyped text.
     */
    getGuideTexts() {
        // Simple heuristic: display the original TeX with characters marked as typed.
        // For a more accurate guidance:
        // We find the path in the graph that matches typedBuffer.
        // Since it's a DAG, we can find a path.
        let typedPart = this.typedBuffer;
        
        // Find what remains from the original TeX
        // Since we allow equivalent typing, we can't just slice the original TeX.
        // We find a path from the active states to the endNode using DFS, and reconstruct the remaining characters.
        const remainingChars = this.findShortestPathToEnd();
        
        return {
            typed: typedPart,
            current: remainingChars[0] || "",
            untyped: remainingChars.slice(1)
        };
    }

    findShortestPathToEnd() {
        const closure = this.getEpsilonClosure(this.activeStates);
        const queue = closure.map(id => ({ id, path: [] }));
        const visited = new Set();
        
        while (queue.length > 0) {
            const { id, path } = queue.shift();
            if (id === this.endNode) {
                return path;
            }
            if (visited.has(id)) continue;
            visited.add(id);

            const transitions = this.graph[id]?.transitions || {};
            
            // Prioritize non-space, non-epsilon transitions
            // Also prioritize shorter paths
            for (const edgeChar in transitions) {
                const nextIds = transitions[edgeChar] || [];
                for (const nextId of nextIds) {
                    const nextPath = [...path];
                    if (edgeChar !== "") {
                        nextPath.push(edgeChar);
                    }
                    queue.push({ id: nextId, path: nextPath });
                }
            }
        }
        return [];
    }
}


// --- 2. HTML5 Web Audio API Sound Generator ---

class LaTeXSoundEffects {
    constructor() {
        this.ctx = null;
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    playSuccess() {
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1200, this.ctx.currentTime); // Crisp high pitch
        gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.05);
    }

    playMiss() {
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(130, this.ctx.currentTime); // Dull low pitch
        gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.12);
    }

    playPlateClear() {
        this.init();
        const now = this.ctx.currentTime;
        const notes = [1046.50, 1318.51, 1567.98, 2093.00]; // C6, E6, G6, C7 chord
        
        notes.forEach((freq, index) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + index * 0.04);
            
            gain.gain.setValueAtTime(0.0, now);
            gain.gain.setValueAtTime(0.05, now + index * 0.04);
            gain.gain.exponentialRampToValueAtTime(0.001, now + index * 0.04 + 0.25);

            osc.start(now + index * 0.04);
            osc.stop(now + index * 0.04 + 0.25);
        });
    }

    playComboUp() {
        this.init();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1760, this.ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.15);
    }

    playGameOver() {
        this.init();
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(330, now);
        osc.frequency.linearRampToValueAtTime(110, now + 0.6);
        
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.6);

        osc.start();
        osc.stop(now + 0.6);
    }
}


// --- 3. Game Management & UI ---

const LATEX_QUESTIONS = {
    easy: [
        { tex: "\\alpha", label: "アルファ (α)" },
        { tex: "\\beta", label: "ベータ (β)" },
        { tex: "\\gamma", label: "ガンマ (γ)" },
        { tex: "\\delta", label: "デルタ (δ)" },
        { tex: "\\epsilon", label: "イプシロン (ε)" },
        { tex: "\\theta", label: "シータ (θ)" },
        { tex: "\\lambda", label: "ラムダ (λ)" },
        { tex: "\\mu", label: "ミュー (μ)" },
        { tex: "\\pi", label: "パイ (π)" },
        { tex: "\\sigma", label: "シグマ (σ)" },
        { tex: "\\phi", label: "ファイ (φ)" },
        { tex: "\\omega", label: "オメガ (ω)" },
        { tex: "x \\in X", label: "集合の所属関係 (x ∈ X)" },
        { tex: "A \\cup B", label: "和集合 (A ∪ B)" },
        { tex: "A \\cap B", label: "積集合 (A ∩ B)" },
        { tex: "A \\subset B", label: "部分集合 (A ⊂ B)" },
        { tex: "A \\supset B", label: "部分集合 (A ⊃ B)" },
        { tex: "\\emptyset", label: "空集合 (∅)" },
        { tex: "\\forall x", label: "全称記号 (任意のxについて)" },
        { tex: "\\exists y", label: "存在記号 (yが存在する)" },
        { tex: "\\mathbb{R}", label: "実数全体の集合 (R)" },
        { tex: "\\mathbb{C}", label: "複素数全体の集合 (C)" },
        { tex: "\\mathbb{Z}", label: "整数全体の集合 (Z)" },
        { tex: "\\mathbb{N}", label: "自然数全体の集合 (N)" },
        { tex: "\\mathbb{Q}", label: "有理数全体の集合 (Q)" },
        { tex: "a \\equiv b", label: "合同式 (a ≡ b)" },
        { tex: "\\infty", label: "無限大 (∞)" },
        { tex: "\\sum", label: "総和記号 (∑)" },
        { tex: "\\int", label: "積分記号 (∫)" },
        { tex: "\\to", label: "右矢印 (→)" },
        { tex: "\\le", label: "以下 (≤)" },
        { tex: "\\ge", label: "以上 (≥)" },
        { tex: "\\neq", label: "不等号 (≠)" },
        { tex: "\\pm", label: "プラスマイナス (±)" },
        { tex: "\\mp", label: "マイナスプラス (∓)" },
        { tex: "x \\approx y", label: "近似 (x ≒ y)" },
        { tex: "\\propto", label: "比例 (∝)" },
        { tex: "\\times", label: "乗算記号 (×)" },
        { tex: "\\div", label: "除算記号 (÷)" },
        { tex: "x^2", label: "xの2乗" },
        { tex: "x_n", label: "数列の項 x_n" },
        { tex: "f(x)", label: "関数 f(x)" },
        { tex: "\\sqrt{x}", label: "xの平方根 (√x)" },
        { tex: "\\sin x", label: "正弦関数 (sin x)" },
        { tex: "\\cos x", label: "余弦関数 (cos x)" },
        { tex: "\\tan x", label: "正接関数 (tan x)" },
        { tex: "\\log x", label: "常用対数 (log x)" },
        { tex: "\\ln x", label: "自然対数 (ln x)" },
        { tex: "\\partial", label: "偏微分記号 (∂)" },
        { tex: "\\nabla", label: "ナブラ記号 (∇)" },
        { tex: "A \\setminus B", label: "差集合 (A \\ B)" },
        { tex: "\\eta", label: "エータ (η)" },
        { tex: "\\rho", label: "ロー (ρ)" },
        { tex: "\\tau", label: "タウ (τ)" },
        { tex: "\\psi", label: "プサイ (ψ)" },
        { tex: "x \\neq y", label: "不等関係 (x ≠ y)" },
        { tex: "x \\ge y", label: "大小関係 (x ≥ y)" },
        { tex: "\\angle A", label: "角A (∠A)" },
        { tex: "\\triangle ABC", label: "三角形ABC (△ABC)" },
        { tex: "\\vec{v}", label: "ベクトルv" },
        { tex: "\\bar{x}", label: "xバー (平均値など)" },
        { tex: "\\hat{y}", label: "yハット" }
    ],
    normal: [
        { tex: "\\sin^2 \\theta + \\cos^2 \\theta = 1", label: "三角関数の相互関係" },
        { tex: "\\tan \\theta = \\frac{\\sin \\theta}{\\cos \\theta}", label: "正接の定義" },
        { tex: "\\cos 2\\theta = \\cos^2 \\theta - \\sin^2 \\theta", label: "三角関数の二倍角公式" },
        { tex: "\\log(ab) = \\log a + \\log b", label: "対数の基本公式" },
        { tex: "\\frac{d}{dx}(x^n) = n x^{n-1}", label: "整関数の微分公式" },
        { tex: "\\int x^n dx = \\frac{x^{n+1}}{n+1} + C", label: "不定積分公式" },
        { tex: "\\int_a^b f(x) dx = F(b) - F(a)", label: "微積分学の基本定理" },
        { tex: "\\lim_{n \\to \\infty} a_n = L", label: "数列の極限" },
        { tex: "\\lim_{x \\to a} f(x) = \\alpha", label: "関数の極限" },
        { tex: "\\sum_{k=1}^n k = \\frac{1}{2}n(n+1)", label: "自然数の和の公式" },
        { tex: "\\det A = ad - bc", label: "2x2行列の行列式" },
        { tex: "A^{-1}", label: "逆行列 A^-1" },
        { tex: "\\lambda v = A v", label: "固有値方程式" },
        { tex: "\\vec{a} \\cdot \\vec{b} = |\\vec{a}| |\\vec{b}| \\cos \\theta", label: "ベクトルの内積" },
        { tex: "\\vec{a} \\times \\vec{b}", label: "ベクトルの外積" },
        { tex: "a^2 + b^2 = c^2", label: "ピタゴラスの定理" },
        { tex: "x^2 + y^2 = r^2", label: "円の方程式" },
        { tex: "e^{i \\pi} + 1 = 0", label: "オイラーの等式" },
        { tex: "f(x) = x^2", label: "二次関数の基本形" },
        { tex: "\\bar{x} = \\frac{1}{n}\\sum_{i=1}^n x_i", label: "データの平均値 (相加平均)" },
        { tex: "s^2 = \\frac{1}{n}\\sum_{i=1}^n (x_i - \\bar{x})^2", label: "標本分散の計算式" },
        { tex: "\\sin(x+y) = \\sin x \\cos y + \\cos x \\sin y", label: "正弦の加法定理" },
        { tex: "\\cos(x+y) = \\cos x \\cos y - \\sin x \\sin y", label: "余弦の加法定理" },
        { tex: "\\tan(x+y) = \\frac{\\tan x + \\tan y}{1 - \\tan x \\tan y}", label: "正接の加法定理" },
        { tex: "\\log_a b = \\frac{\\log_c b}{\\log_c a}", label: "対数の底の変換公式" },
        { tex: "\\sum_{k=1}^n k^2 = \\frac{1}{6}n(n+1)(2n+1)", label: "平方数の和の公式" },
        { tex: "\\sum_{k=1}^n k^3 = \\left(\\frac{1}{2}n(n+1)\\right)^2", label: "立方数の和の公式" },
        { tex: "ax^2 + bx + c = 0", label: "二次方程式の一般形" },
        { tex: "\\vec{a} \\cdot \\vec{b} = a_x b_x + a_y b_y", label: "成分表示によるベクトルの内積" },
        { tex: "x^2 - y^2 = (x-y)(x+y)", label: "因数分解の公式" },
        { tex: "n! = n(n-1) \\cdots 1", label: "階乗の定義" },
        { tex: "\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1", label: "三角関数の極限" },
        { tex: "\\binom{n}{k} = \\frac{n!}{k!(n-k)!}", label: "二項係数" }
    ],
    hard: [
        { tex: "\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}", label: "二次方程式の解の公式" },
        { tex: "\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}", label: "ガウス積分" },
        { tex: "\\sum_{k=0}^{\\infty} \\frac{x^k}{k!} = e^x", label: "指数関数のマクローリン展開" },
        { tex: "\\int_0^{\\infty} \\frac{\\sin x}{x} dx = \\frac{\\pi}{2}", label: "ディリクレ積分" },
        { tex: "\\Gamma(z) = \\int_0^{\\infty} t^{z-1} e^{-t} dt", label: "ガンマ関数の定義" },
        { tex: "\\zeta(2) = \\frac{\\pi^2}{6}", label: "バーゼル問題の解" },
        { tex: "\\zeta(s) = \\sum_{n=1}^{\\infty} \\frac{1}{n^s}", label: "リーマン・ゼータ関数" },
        { tex: "\\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h} = f'(x)", label: "微分の定義式" },
        { tex: "\\hat{f}(\\xi) = \\int_{-\\infty}^{\\infty} f(x) e^{-2\\pi i x \\xi} dx", label: "フーリエ変換" },
        { tex: "f(x) = \\sum_{n=-\\infty}^{\\infty} c_n e^{i n x}", label: "フーリエ級数展開" },
        { tex: "\\oint_{\\partial D} f(z) dz = 2\\pi i \\sum \\mathrm{Res}(f, a)", label: "複素解析の留数定理" },
        { tex: "a_n = \\frac{1}{\\pi} \\int_{-\\pi}^{\\pi} f(x) \\cos(nx) dx", label: "フーリエ余弦係数" },
        { tex: "\\begin{matrix} a & b \\\\ c & d \\end{matrix}", label: "2x2 行列" },
        { tex: "\\det(A - \\lambda I) = 0", label: "行列の特性方程式 (固有多項式)" },
        { tex: "\\ker f = \\{ x \\in G \\mid f(x) = e_H \\}", label: "群準同型の核 (Kernel)" },
        { tex: "G/N = \\{ gN \\mid g \\in G \\}", label: "剰余群の定義 (商群)" },
        { tex: "d\\omega = 0 \\iff \\omega \\text{ is closed}", label: "閉形式の定義" },
        { tex: "\\int_{\\partial M} \\omega = \\int_M d\\omega", label: "一般化されたストークスの定理" },
        { tex: "f(x) = \\begin{cases} x & (x \\ge 0) \\\\ -x & (x < 0) \\end{cases}", label: "絶対値関数の定義" },
        { tex: "E[X] = \\int_{-\\infty}^{\\infty} x f(x) dx", label: "連続確率変数の期待値" },
        { tex: "V[X] = E[X^2] - (E[X])^2", label: "分散の計算公式" },
        { tex: "\\int_0^{\\infty} x^{n-1} e^{-x} dx = (n-1)!", label: "ガンマ関数の整数値" },
        { tex: "\\det(A) = \\sum_{\\sigma \\in S_n} \\operatorname{sgn}(\\sigma) \\prod_{i=1}^n a_{i,\\sigma(i)}", label: "行列式の定義" },
        { tex: "f(z) = \\sum_{n=0}^{\\infty} a_n (z-a)^n", label: "テイラー展開" },
        { tex: "\\sigma^2 = E[(X-\\mu)^2]", label: "分散の定義" },
        { tex: "\\rho(X,Y) = \\frac{\\operatorname{Cov}(X,Y)}{\\sigma_X \\sigma_Y}", label: "相関係数" },
        { tex: "\\frac{\\partial^2 u}{\\partial t^2} = c^2 \\nabla^2 u", label: "波動方程式" },
        { tex: "\\frac{\\partial u}{\\partial t} = \\alpha \\nabla^2 u", label: "熱伝導方程式" },
        { tex: "i \\hbar \\frac{\\partial}{\\partial t} |\\psi\\rangle = H |\\psi\\rangle", label: "シュレーディンガー方程式" },
        { tex: "\\nabla \\times \\vec{E} = -\\frac{\\partial \\vec{B}}{\\partial t}", label: "ファラデーの電磁誘導の法則" },
        { tex: "e^x = 1 + x + \\frac{x^2}{2} + \\frac{x^3}{6} + \\cdots", label: "指数関数のテイラー展開" },
        { tex: "\\int_0^1 \\frac{1}{1+x^2} dx = \\frac{\\pi}{4}", label: "定積分" },
        { tex: "A \\vec{x} = \\lambda \\vec{x}", label: "固有値と固有ベクトル" },
        { tex: "H^n(X; G)", label: "コホモロジー群" },
        { tex: "d^n \\circ d^{n-1} = 0", label: "コバウンダリ作用素の合成 (d^2 = 0)" },
        { tex: "a \\smile b", label: "カップ積 (cup product)" },
        { tex: "H^n_{dR}(M)", label: "ド・ラームコホモロジー群" },
        { tex: "\\check{H}^p(\\mathcal{U}, \\mathcal{F})", label: "チェフコホモロジー群" },
        { tex: "H^*(X; R)", label: "コホモロジー環" },
        { tex: "H^n(X, A) \\to H^{n+1}(A)", label: "コホモロジー長完全系列の連結準同型" }
    ]
};

class LaTeXSushidaGame {
    constructor() {
        this.se = new LaTeXSoundEffects();
        this.currentCourse = 'normal';
        this.score = 0;
        this.timeRemaining = 90;
        this.combo = 0;
        this.correctKeys = 0;
        this.missKeys = 0;
        
        this.isPlaying = false;
        this.gameTimer = null;
        this.lastTime = 0;
        
        this.questions = [];
        this.currentQuestion = null;
        this.engine = null;
        this.typedSinceLastQuestion = 0;
        
        // Sushi lane animation properties
        this.platePosition = 0; // percentage from left to right (0 to 100)
        this.plateSpeed = 0.12; // speed factor (increment per frame)
        this.animationFrameId = null;

        this.keyHandler = this.handleKeyDown.bind(this);
    }

    start(courseType) {
        this.se.init();
        this.currentCourse = courseType;
        this.score = 0;
        this.combo = 0;
        this.correctKeys = 0;
        this.missKeys = 0;
        this.isPlaying = true;
        
        // Course config
        if (courseType === 'easy') {
            this.timeRemaining = 60.0;
            this.plateSpeed = 0.08;
        } else if (courseType === 'normal') {
            this.timeRemaining = 90.0;
            this.plateSpeed = 0.12;
        } else {
            this.timeRemaining = 120.0;
            this.plateSpeed = 0.075;
        }

        // Shuffle questions
        this.questions = [...LATEX_QUESTIONS[courseType]];
        this.shuffle(this.questions);
        
        // Update UI panels
        document.getElementById('lt-lobby').style.display = 'none';
        document.getElementById('lt-result').style.display = 'none';
        document.getElementById('lt-game').style.display = 'block';
        document.getElementById('lt-score').textContent = this.score;
        document.getElementById('lt-combo').textContent = this.combo;

        this.nextQuestion();
        
        // Set up keyboard listener
        window.addEventListener('keydown', this.keyHandler);
        
        // Start timers
        this.lastTime = performance.now();
        this.gameTimer = setInterval(() => this.tick(), 100);
        this.gameLoop();
    }

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    tick() {
        if (!this.isPlaying) return;
        const now = performance.now();
        const delta = (now - this.lastTime) / 1000;
        this.lastTime = now;
        
        this.timeRemaining = Math.max(0, this.timeRemaining - delta);
        document.getElementById('lt-time').textContent = this.timeRemaining.toFixed(1);
        
        if (this.timeRemaining <= 0) {
            this.endGame();
        }
    }

    gameLoop() {
        if (!this.isPlaying) return;
        
        // Move the sushi plate
        this.platePosition += this.plateSpeed;
        const plate = document.getElementById('lt-sushi-plate');
        if (plate) {
            plate.style.left = `${this.platePosition}%`;
        }
        
        // If the plate goes off screen (failed to complete)
        if (this.platePosition >= 100) {
            this.se.playMiss();
            this.missKeys += 5; // Penalty miss count
            this.combo = 0;
            document.getElementById('lt-combo').textContent = this.combo;
            this.nextQuestion();
        }
        
        this.animationFrameId = requestAnimationFrame(() => this.gameLoop());
    }

    getPlateInfo(tex) {
        // バックスラッシュ等を除外した実質的な文字数に近いものを計算
        const cleanTex = tex.replace(/[\\]/g, '');
        const len = cleanTex.length;
        
        if (len < 6) {
            return { price: 100, colorClass: 'plate-blue' };
        } else if (len < 12) {
            return { price: 180, colorClass: 'plate-red' };
        } else if (len < 20) {
            return { price: 240, colorClass: 'plate-gold' };
        } else if (len < 35) {
            return { price: 380, colorClass: 'plate-purple' };
        } else {
            return { price: 500, colorClass: 'plate-black' };
        }
    }

    nextQuestion() {
        if (this.questions.length === 0) {
            // Re-fill and shuffle if ran out
            this.questions = [...LATEX_QUESTIONS[this.currentCourse]];
            this.shuffle(this.questions);
        }

        this.currentQuestion = this.questions.pop();
        this.engine = new LaTeXTypingEngine(this.currentQuestion.tex);
        this.platePosition = -10; // Start slightly off-screen left
        this.typedSinceLastQuestion = 0;

        // Ensure background buffer div exists for MathJax rendering to prevent DOM interference
        let buffer = document.getElementById('lt-math-buffer');
        if (!buffer) {
            buffer = document.createElement('div');
            buffer.id = 'lt-math-buffer';
            buffer.style.position = 'absolute';
            buffer.style.left = '-9999px';
            buffer.style.top = '-9999px';
            buffer.style.visibility = 'hidden';
            document.body.appendChild(buffer);
        }

        const plateInfo = this.getPlateInfo(this.currentQuestion.tex);

        // Render sushi plate inside lane
        const plateArea = document.getElementById('lt-plate-area');
        if (plateArea) {
            plateArea.innerHTML = `
                <div id="lt-sushi-plate" class="lt-sushi-plate" style="left: -10%">
                    <div class="lt-sushi-dish ${plateInfo.colorClass}">
                        <span class="lt-plate-price">¥${plateInfo.price}</span>
                        <div class="lt-sushi-math" id="lt-sushi-math-text">\\(${this.currentQuestion.tex}\\)</div>
                    </div>
                </div>
            `;
            
            // Render MathJax to the buffer, then copy results to the plate
            // This prevents MathJax from locking or replacing the lt-sushi-plate element during animation
            buffer.innerHTML = `\\(${this.currentQuestion.tex}\\)`;
            if (window.MathJax && window.MathJax.typesetPromise) {
                window.MathJax.typesetPromise([buffer]).then(() => {
                    const plateMath = document.getElementById('lt-sushi-math-text');
                    if (plateMath && buffer.innerHTML) {
                        plateMath.innerHTML = buffer.innerHTML;
                    }
                }).catch(err => console.error(err));
            }
        }

        // Render static labels and guide text
        document.getElementById('lt-math-label').textContent = this.currentQuestion.label;
        
        const previewArea = document.getElementById('lt-math-preview');
        previewArea.innerHTML = `\\(${this.currentQuestion.tex}\\)`;
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([previewArea]).catch(err => console.error(err));
        }

        this.updateTypingGuide();
    }

    updateTypingGuide() {
        const guides = this.engine.getGuideTexts();
        document.getElementById('lt-text-typed').textContent = guides.typed;
        
        const currentElem = document.getElementById('lt-text-current');
        currentElem.textContent = ""; // Hide next expected character
        
        const untypedElem = document.getElementById('lt-text-untyped');
        untypedElem.textContent = ""; // Hide untyped formula code template
        
        // Hide hints for next characters
        const hintElem = document.getElementById('lt-keyboard-hint');
        hintElem.textContent = '';
    }

    handleKeyDown(event) {
        if (!this.isPlaying) return;
        
        // Prevent default browser shortcuts except reload, devtools, etc.
        if (event.key.length === 1 || event.key === 'Backspace' || event.key === ' ') {
            if (event.key !== 'r' || (!event.metaKey && !event.ctrlKey)) {
                event.preventDefault();
            }
        } else {
            return; // Ignore control keys
        }

        const inputKey = event.key;
        
        // Process input through engine
        const isCorrect = this.engine.inputChar(inputKey);

        if (isCorrect) {
            this.correctKeys++;
            this.se.playSuccess();
            
            if (this.engine.isComplete()) {
                this.se.playPlateClear();
                
                // Calculate score based on plate price
                const plateInfo = this.getPlateInfo(this.currentQuestion.tex);
                const comboBonus = this.combo * 10;
                const earned = plateInfo.price + comboBonus;
                
                this.score += earned;
                document.getElementById('lt-score').textContent = this.score;

                // Combo increment & recovery time
                this.combo++;
                document.getElementById('lt-combo').textContent = this.combo;

                // Add bonus seconds depending on combo (similar to Sushida)
                if (this.combo % 3 === 0) {
                    this.se.playComboUp();
                    const timeBonus = Math.min(5, this.combo * 0.5); // Add time
                    this.timeRemaining += timeBonus;
                    // Flash timer green
                    const timerElem = document.getElementById('lt-time');
                    timerElem.classList.add('time-bonus');
                    setTimeout(() => timerElem.classList.remove('time-bonus'), 500);
                }

                // Next question
                this.nextQuestion();
            } else {
                this.updateTypingGuide();
            }
        } else {
            // Mistype
            this.missKeys++;
            this.combo = 0;
            document.getElementById('lt-combo').textContent = this.combo;
            this.se.playMiss();
            
            // Flash screen or typing wrapper red
            const wrapper = document.querySelector('.lt-typing-text-wrapper');
            wrapper.classList.add('typo-flash');
            setTimeout(() => wrapper.classList.remove('typo-flash'), 150);
        }
    }

    endGame() {
        this.isPlaying = false;
        clearInterval(this.gameTimer);
        cancelAnimationFrame(this.animationFrameId);
        window.removeEventListener('keydown', this.keyHandler);

        this.se.playGameOver();

        // Calculate statistics
        const totalInputs = this.correctKeys + this.missKeys;
        const accuracy = totalInputs > 0 ? (this.correctKeys / totalInputs) * 100 : 0;
        
        let secondsPlayed = 90;
        if (this.currentCourse === 'easy') secondsPlayed = 60;
        else if (this.currentCourse === 'hard') secondsPlayed = 120;
        // Total active game time might have changed due to bonuses. Real speed = correctKeys / (initial_time_spent + changes)
        // Simply measure rate per second
        const speed = secondsPlayed > 0 ? (this.correctKeys / secondsPlayed) : 0;

        document.getElementById('lt-res-score').textContent = this.score;
        document.getElementById('lt-res-correct').textContent = this.correctKeys;
        document.getElementById('lt-res-speed').textContent = speed.toFixed(1);
        document.getElementById('lt-res-miss').textContent = this.missKeys;
        document.getElementById('lt-res-accuracy').textContent = accuracy.toFixed(1);

        // Evaluation text
        const targetGoal = this.currentCourse === 'easy' ? 3000 : (this.currentCourse === 'normal' ? 5000 : 10000);
        const diff = this.score - targetGoal;
        const evalElem = document.getElementById('lt-res-eval');
        
        if (diff > 0) {
            evalElem.textContent = `${diff}円のお得でした！筋肉も数式も完璧！`;
            evalElem.className = 'lt-result-eval profit';
        } else if (diff < 0) {
            evalElem.textContent = `${Math.abs(diff)}円の赤字でした... もっと筋トレとLaTeXを練習しましょう！`;
            evalElem.className = 'lt-result-eval loss';
        } else {
            evalElem.textContent = 'ぴったり目標達成です！素晴らしい！';
            evalElem.className = 'lt-result-eval';
        }

        // Twitter Share link
        const courseName = this.currentCourse === 'easy' ? 'お手軽' : (this.currentCourse === 'normal' ? 'お勧め' : '高級');
        const shareText = encodeURIComponent(`【Tex打】LaTeXタイピングゲーム(${courseName}コース)をプレイしました！\n売上: ${this.score}円\n正確キー: ${this.correctKeys}回 / ミス: ${this.missKeys}回\n正解率: ${accuracy.toFixed(1)}%\n#数学科筋トレ部 #LaTeXタイピング\n`);
        const shareUrl = encodeURIComponent(window.location.href);
        document.getElementById('lt-share-btn').href = `https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`;

        // mixi2 Share link (clipboard copy & redirect)
        const mixi2ShareBtn = document.getElementById('lt-mixi2-share-btn');
        if (mixi2ShareBtn) {
            const plainShareText = `【Tex打】LaTeXタイピングゲーム(${courseName}コース)をプレイしました！\n売上: ${this.score}円\n正確キー: ${this.correctKeys}回 / ミス: ${this.missKeys}回\n正解率: ${accuracy.toFixed(1)}%\n#数学科筋トレ部 #LaTeXタイピング\n${window.location.href}`;
            mixi2ShareBtn.onclick = (e) => {
                e.preventDefault();
                navigator.clipboard.writeText(plainShareText).then(() => {
                    alert('結果をクリップボードにコピーしました！\nmixi2を開きますので、投稿画面で貼り付けてください。');
                    window.open('https://mixi.social/', '_blank');
                }).catch(err => {
                    console.error('クリップボードのコピーに失敗しました: ', err);
                    window.open('https://mixi.social/', '_blank');
                });
            };
        }

        // Switch panels
        document.getElementById('lt-game').style.display = 'none';
        document.getElementById('lt-result').style.display = 'block';
    }

    quit() {
        this.isPlaying = false;
        clearInterval(this.gameTimer);
        cancelAnimationFrame(this.animationFrameId);
        window.removeEventListener('keydown', this.keyHandler);

        document.getElementById('lt-game').style.display = 'none';
        document.getElementById('lt-result').style.display = 'none';
        document.getElementById('lt-lobby').style.display = 'block';
    }
}

// Global singletons
let latexGame = null;

function startLaTeXGame(courseType) {
    if (!latexGame) {
        latexGame = new LaTeXSushidaGame();
    }
    latexGame.start(courseType);
}

function quitLaTeXGame() {
    if (latexGame) {
        latexGame.quit();
    }
}

function restartLaTeXGame() {
    if (latexGame) {
        latexGame.start(latexGame.currentCourse);
    }
}
