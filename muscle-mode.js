// ==========================================
// 隠し筋肉モード
//   PC: キーボードで「muscle」と打つ
//   スマホ: タイトル「数学科筋トレ部」を5回連続でタップ
//   もう一度同じ操作をするか、右下のボタンで元に戻る
// ==========================================
(() => {
    const SECRET_WORD = 'muscle';
    const TAP_COUNT = 5;
    const TAP_WINDOW_MS = 1500;
    const SYMBOLS = ['∫', 'Σ', '∂', 'π', '∞', '∇', '√', 'λ', 'ε', 'ℝ', '∮', '💪', '💪', '🏋️', '🔥'];
    const POP_TEXTS = ['+1 rep', '+∫', '+Σ', '+∂', 'PUMP!', '+π', 'ナイスバルク', 'キレてる！', '+∞'];
    const QUOTES = [
        '∫ 筋肉 dx = ∞',
        '筋肉は単調増加する',
        'lim<sub>n→∞</sub> (ベンチ) = ∞',
        '∀ε > 0, ∃ 筋肉',
        'e<sup>iπ</sup> + 1 = 0 kg 追加'
    ];

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let active = false;
    let keyBuffer = '';
    let tapTimes = [];
    let reps = 0;

    let canvas, ctx, particles = [], rafId = 0, lastTime = 0, ambientTimer = 0;
    let badge, repsEl, audioCtx;

    // ---------- 起動の判定 ----------
    function isTypingTarget(target) {
        if (!target) return false;
        const tag = target.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
    }

    function isLaTeXGamePlaying() {
        const game = document.getElementById('lt-game');
        return game && game.style.display !== 'none' && game.offsetParent !== null;
    }

    document.addEventListener('keydown', event => {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (isTypingTarget(event.target) || isLaTeXGamePlaying()) return;
        if (event.key.length !== 1) return;

        keyBuffer = (keyBuffer + event.key.toLowerCase()).slice(-SECRET_WORD.length);
        if (keyBuffer === SECRET_WORD) {
            keyBuffer = '';
            toggle();
        }
    });

    function setupTitleTap() {
        const title = document.querySelector('.site-header h1');
        if (!title) return;
        title.classList.add('muscle-trigger');
        title.addEventListener('click', () => {
            const now = Date.now();
            tapTimes = tapTimes.filter(t => now - t < TAP_WINDOW_MS);
            tapTimes.push(now);
            if (tapTimes.length >= TAP_COUNT) {
                tapTimes = [];
                toggle();
            }
        });
    }

    function toggle() {
        if (active) {
            deactivate();
        } else {
            activate();
        }
    }

    // ---------- ON / OFF ----------
    function activate() {
        active = true;
        reps = 0;
        document.documentElement.classList.add('muscle-mode');
        playImpact();
        if (navigator.vibrate) navigator.vibrate([60, 40, 120]);

        showBanner();
        ensureBadge();
        updateReps();
        badge.hidden = false;

        if (!reducedMotion) {
            document.body.classList.remove('muscle-shake');
            void document.body.offsetWidth;
            document.body.classList.add('muscle-shake');
            ensureCanvas();
            burst(window.innerWidth / 2, window.innerHeight / 2, window.innerWidth < 640 ? 70 : 130);
            startLoop();
        }
    }

    function deactivate() {
        active = false;
        document.documentElement.classList.remove('muscle-mode');
        document.body.classList.remove('muscle-shake');
        if (badge) badge.hidden = true;
        showToast('通常モードに戻りました');
        // 降っている記号はそのまま落ち切らせ、新しく降らせない
    }

    // ---------- 演出: 登場バナー ----------
    function showBanner() {
        const quote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
        const overlay = document.createElement('div');
        overlay.className = 'muscle-banner';
        overlay.setAttribute('role', 'status');
        overlay.innerHTML = `
            <div class="muscle-banner-flash"></div>
            <div class="muscle-banner-rays"></div>
            <div class="muscle-banner-inner">
                <div class="muscle-banner-arms"><span>💪</span><span>💪</span></div>
                <div class="muscle-banner-title">MUSCLE<br>MODE</div>
                <div class="muscle-banner-sub">${quote}</div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', () => overlay.remove());
        setTimeout(() => overlay.classList.add('is-leaving'), reducedMotion ? 1200 : 1900);
        setTimeout(() => overlay.remove(), reducedMotion ? 1600 : 2500);
    }

    function showToast(text) {
        const toast = document.createElement('div');
        toast.className = 'muscle-toast';
        toast.setAttribute('role', 'status');
        toast.textContent = text;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 1800);
    }

    // ---------- 右下のバッジ（回数と解除ボタン） ----------
    function ensureBadge() {
        if (badge) return;
        badge = document.createElement('div');
        badge.className = 'muscle-badge';
        badge.hidden = true;
        badge.innerHTML = `
            <span class="muscle-badge-label">💪 MUSCLE MODE</span>
            <span class="muscle-badge-reps">REPS <strong>0</strong></span>
            <button type="button" class="muscle-badge-close" aria-label="筋肉モードを終える">×</button>
        `;
        repsEl = badge.querySelector('strong');
        badge.querySelector('button').addEventListener('click', event => {
            event.stopPropagation();
            deactivate();
        });
        document.body.appendChild(badge);
    }

    function isPrime(n) {
        if (n < 2) return false;
        for (let i = 2; i * i <= n; i++) {
            if (n % i === 0) return false;
        }
        return true;
    }

    function updateReps() {
        if (!repsEl) return;
        repsEl.textContent = reps;
        badge.classList.toggle('is-prime', isPrime(reps));
    }

    // ---------- タップ/クリックで「+1 rep」 ----------
    document.addEventListener('pointerdown', event => {
        if (!active || event.target.closest('.muscle-badge')) return;
        reps += 1;
        updateReps();

        const prime = isPrime(reps);
        const pop = document.createElement('span');
        pop.className = 'muscle-pop' + (prime ? ' is-prime' : '');
        pop.textContent = prime ? `${reps} は素数！` : POP_TEXTS[Math.floor(Math.random() * POP_TEXTS.length)];
        pop.style.left = `${event.clientX}px`;
        pop.style.top = `${event.clientY}px`;
        document.body.appendChild(pop);
        setTimeout(() => pop.remove(), 900);

        if (!reducedMotion) {
            ensureCanvas();
            burst(event.clientX, event.clientY, prime ? 24 : 8, prime ? 1 : 0.6);
            startLoop();
        }
    }, { passive: true });

    // ---------- 記号が舞うキャンバス ----------
    function ensureCanvas() {
        if (canvas) return;
        canvas = document.createElement('canvas');
        canvas.className = 'muscle-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        document.body.appendChild(canvas);
        ctx = canvas.getContext('2d');
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
    }

    function resizeCanvas() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = window.innerWidth * dpr;
        canvas.height = window.innerHeight * dpr;
        canvas.style.width = `${window.innerWidth}px`;
        canvas.style.height = `${window.innerHeight}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function randomSymbol() {
        return SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
    }

    function burst(x, y, count, power = 1) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = (180 + Math.random() * 520) * power;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 220 * power,
                rot: Math.random() * Math.PI,
                vr: (Math.random() - 0.5) * 8,
                size: 16 + Math.random() * 26,
                life: 1.6 + Math.random() * 1.2,
                age: 0,
                gravity: 900,
                symbol: randomSymbol(),
                hue: Math.random() < 0.5 ? '#c9971c' : '#2f6f4e'
            });
        }
    }

    function spawnAmbient() {
        particles.push({
            x: Math.random() * window.innerWidth,
            y: -30,
            vx: (Math.random() - 0.5) * 30,
            vy: 40 + Math.random() * 60,
            rot: Math.random() * Math.PI,
            vr: (Math.random() - 0.5) * 1.2,
            size: 14 + Math.random() * 18,
            life: 30,
            age: 0,
            gravity: 0,
            ambient: true,
            symbol: randomSymbol(),
            hue: Math.random() < 0.5 ? '#c9971c' : '#2f6f4e'
        });
    }

    function startLoop() {
        if (rafId) return;
        lastTime = performance.now();
        rafId = requestAnimationFrame(tick);
    }

    function tick(now) {
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;

        if (active && !document.hidden) {
            ambientTimer += dt;
            const interval = window.innerWidth < 640 ? 0.55 : 0.32;
            while (ambientTimer > interval) {
                ambientTimer -= interval;
                spawnAmbient();
            }
        }

        const w = window.innerWidth;
        const h = window.innerHeight;
        ctx.clearRect(0, 0, w, h);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        particles = particles.filter(p => {
            p.age += dt;
            p.vy += p.gravity * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.rot += p.vr * dt;
            if (p.age > p.life || p.y > h + 60) return false;

            const fade = p.ambient ? 0.28 : Math.max(0, 1 - p.age / p.life);
            ctx.save();
            ctx.globalAlpha = fade;
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.font = `700 ${p.size}px "Times New Roman", serif`;
            ctx.fillStyle = p.hue;
            ctx.fillText(p.symbol, 0, 0);
            ctx.restore();
            return true;
        });

        if (active || particles.length > 0) {
            rafId = requestAnimationFrame(tick);
        } else {
            rafId = 0;
            ctx.clearRect(0, 0, w, h);
        }
    }

    // ---------- 効果音（その場で合成するので音声ファイルは不要） ----------
    function playImpact() {
        try {
            audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            const t = audioCtx.currentTime;

            // 低い「ドン」
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(140, t);
            osc.frequency.exponentialRampToValueAtTime(38, t + 0.45);
            gain.gain.setValueAtTime(0.0001, t);
            gain.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
            osc.connect(gain).connect(audioCtx.destination);
            osc.start(t);
            osc.stop(t + 0.65);

            // 上がっていく和音
            [261.6, 329.6, 392, 523.3].forEach((freq, i) => {
                const o = audioCtx.createOscillator();
                const g = audioCtx.createGain();
                const start = t + 0.08 + i * 0.07;
                o.type = 'triangle';
                o.frequency.setValueAtTime(freq, start);
                g.gain.setValueAtTime(0.0001, start);
                g.gain.exponentialRampToValueAtTime(0.09, start + 0.03);
                g.gain.exponentialRampToValueAtTime(0.0001, start + 0.7);
                o.connect(g).connect(audioCtx.destination);
                o.start(start);
                o.stop(start + 0.75);
            });
        } catch (_error) {
            // 音が出せない環境では無音のまま続ける
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupTitleTap);
    } else {
        setupTitleTap();
    }
})();
