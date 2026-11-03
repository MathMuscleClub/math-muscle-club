// ==========================================
// フッターを歩くネコ（部とは関係ない）
//   ページのいちばん下をうろうろしている。押すとなでられる
//   なでた回数はこのブラウザに覚えておく。10回ごとにちょっといいことがある
// ==========================================
(() => {
    const PET_KEY = 'mmc-cat-pets';
    const SPEED = 38; // 1秒に進む px
    const LINES = ['にゃー', 'にゃ？', 'ごろごろ…', 'にゃっ', 'ふみふみ', '…（見てる）', 'にゃーん'];
    const RARE_LINES = ['筋トレの話はしないにゃ', 'ここは数学も関係ないにゃ', 'プロテインより煮干し'];

    function readPets() {
        try {
            return Number(localStorage.getItem(PET_KEY)) || 0;
        } catch (_error) {
            return 0;
        }
    }

    function writePets(count) {
        try {
            localStorage.setItem(PET_KEY, String(count));
        } catch (_error) {
            // 覚えられなくても、ページを開いている間は数える
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const footer = document.querySelector('footer');
        if (!footer) return;

        const track = document.createElement('div');
        track.className = 'footer-cat-track';
        track.innerHTML = `
            <button type="button" class="footer-cat" aria-label="ネコをなでる">
                <span class="footer-cat-body" aria-hidden="true">🐈</span>
            </button>
            <span class="footer-cat-count" aria-live="polite"></span>
        `;
        footer.prepend(track);

        const cat = track.querySelector('.footer-cat');
        const body = track.querySelector('.footer-cat-body');
        const countLabel = track.querySelector('.footer-cat-count');
        const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        let pets = readPets();
        let x = Math.random() * 200;
        let direction = Math.random() < 0.5 ? 1 : -1;
        let restUntil = 0;
        let last = performance.now();

        const showCount = () => {
            countLabel.textContent = pets ? `なでた回数 ${pets}` : '';
        };
        showCount();

        const say = text => {
            const bubble = document.createElement('span');
            bubble.className = 'footer-cat-bubble';
            bubble.textContent = text;
            cat.appendChild(bubble);
            setTimeout(() => bubble.remove(), 1600);
        };

        const heart = () => {
            const h = document.createElement('span');
            h.className = 'footer-cat-heart';
            h.textContent = '♥';
            h.style.left = `${8 + Math.random() * 16}px`;
            cat.appendChild(h);
            setTimeout(() => h.remove(), 1000);
        };

        cat.addEventListener('click', () => {
            pets++;
            writePets(pets);
            showCount();
            restUntil = performance.now() + 2500;
            heart();
            if (pets % 10 === 0) {
                say(`${pets}回目！ ありがとにゃ`);
                cat.classList.remove('is-rolling');
                void cat.offsetWidth; // 続けて押してもアニメーションをやり直す
                cat.classList.add('is-rolling');
            } else {
                const pool = Math.random() < 0.08 ? RARE_LINES : LINES;
                say(pool[Math.floor(Math.random() * pool.length)]);
            }
        });
        cat.addEventListener('animationend', () => cat.classList.remove('is-rolling'));

        if (still) {
            cat.style.transform = `translateX(${x}px)`;
            return;
        }

        const step = now => {
            const dt = Math.min((now - last) / 1000, 0.1);
            last = now;
            const max = Math.max(track.clientWidth - cat.offsetWidth, 0);
            const resting = now < restUntil;
            cat.classList.toggle('is-walking', !resting);
            if (!resting) {
                x += direction * SPEED * dt;
                if (x <= 0 || x >= max) {
                    x = Math.min(Math.max(x, 0), max);
                    direction *= -1;
                }
                // ときどき立ち止まる・向きを変える
                if (Math.random() < dt * 0.15) restUntil = now + 1500 + Math.random() * 3000;
                else if (Math.random() < dt * 0.05) direction *= -1;
            }
            cat.style.transform = `translateX(${x}px)`;
            // 絵文字のネコは左向きなので、右へ行くときは反転する
            body.style.transform = direction > 0 ? 'scaleX(-1)' : '';
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    });
})();
