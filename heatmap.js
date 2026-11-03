// ==========================================
// 活動ヒートマップ（活動日記のタブ）
//   日記を書いた日を、1マス1日のマス目で色の濃さにして並べる
//   書いた人で絞り込むと、その人の分だけになる。マスを押すとその日の日記だけ出る
// ==========================================
// 何週分出すか。幅に入るだけ出すが、少なくとも半年・多くても1年
const HEATMAP_MIN_WEEKS = 26;
const HEATMAP_MAX_WEEKS = 53;
const HEATMAP_COLUMN_PX = 17; // マス14px + すき間3px
const HEATMAP_DAY_MS = 86400000;

function heatmapDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// その日の週の日曜日
function heatmapWeekStart(date) {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    start.setDate(start.getDate() - start.getDay());
    return start;
}

function heatmapLevel(count) {
    if (count >= 4) return 4;
    if (count >= 3) return 3;
    if (count >= 2) return 2;
    return count > 0 ? 1 : 0;
}

// 日記のある週が、今週（まだなら先週）から何週続いているか・いちばん長く続いたのは何週か
function heatmapWeekStreaks(dateKeys) {
    const weeks = new Set([...dateKeys].map(key => heatmapWeekStart(parseDateKey(key)).getTime()));
    const sorted = [...weeks].sort((a, b) => a - b);
    let longest = 0;
    let run = 0;
    sorted.forEach((week, i) => {
        // 夏時間はないが、念のため半日の余裕を持たせて「ちょうど1週あと」を見る
        run = i > 0 && Math.abs(week - sorted[i - 1] - 7 * HEATMAP_DAY_MS) < HEATMAP_DAY_MS / 2 ? run + 1 : 1;
        longest = Math.max(longest, run);
    });

    let cursor = heatmapWeekStart(new Date());
    if (!weeks.has(cursor.getTime())) cursor.setDate(cursor.getDate() - 7);
    let current = 0;
    while (weeks.has(cursor.getTime())) {
        current++;
        cursor.setDate(cursor.getDate() - 7);
    }
    return { current, longest };
}

function renderActivityHeatmap(posts, { author = 'all', selectedDate = '', onSelect = () => {} } = {}) {
    const container = document.getElementById('activity-heatmap');
    if (!container) return;

    const counts = new Map();
    posts
        .filter(post => author === 'all' || (post.author || '不明') === author)
        .forEach(post => counts.set(post.date, (counts.get(post.date) || 0) + 1));

    // 別のタブを開いているあいだは幅が0なので、ページの幅で考える
    const width = container.clientWidth || (container.closest('main') || document.body).clientWidth;
    const room = width - 64; // 枠の余白と曜日の列
    const weekCount = Math.min(HEATMAP_MAX_WEEKS, Math.max(HEATMAP_MIN_WEEKS, Math.floor(room / HEATMAP_COLUMN_PX)));
    const span = `${Math.round(weekCount / 4.35)}か月`;

    const today = new Date();
    const todayKey = heatmapDateKey(today);
    const start = heatmapWeekStart(today);
    start.setDate(start.getDate() - (weekCount - 1) * 7);
    const startKey = heatmapDateKey(start);

    let activeDays = 0;
    let total = 0;
    const cells = [];
    const months = [];
    for (let week = 0; week < weekCount; week++) {
        for (let day = 0; day < 7; day++) {
            const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + week * 7 + day);
            const key = heatmapDateKey(date);
            if (date.getDate() === 1 || (week === 0 && day === 0)) months.push({ week, label: `${date.getMonth() + 1}月` });
            if (key > todayKey) {
                cells.push('<span class="heatmap-cell is-future" aria-hidden="true"></span>');
                continue;
            }
            const count = counts.get(key) || 0;
            if (count) {
                activeDays++;
                total += count;
            }
            const label = `${date.getMonth() + 1}月${date.getDate()}日 ${count ? `日記${count}件` : '日記なし'}`;
            const classes = ['heatmap-cell', `level-${heatmapLevel(count)}`];
            if (key === todayKey) classes.push('is-today');
            if (key === selectedDate) classes.push('is-selected');
            cells.push(count
                ? `<button type="button" class="${classes.join(' ')}" data-date="${key}" title="${label}" aria-label="${label}"></button>`
                : `<span class="${classes.join(' ')}" title="${label}"></span>`);
        }
    }
    // 月の名前は、前の名前と重ならないものだけ出す
    const monthLabels = months
        .filter((m, i) => i === 0 || m.week - months[i - 1].week >= 3)
        .map(m => `<span style="grid-column:${m.week + 1}">${m.label}</span>`)
        .join('');

    const inRange = new Set([...counts.keys()].filter(key => key >= startKey && key <= todayKey));
    const streak = heatmapWeekStreaks(counts.keys());
    const who = author === 'all' ? '部' : author;

    container.innerHTML = `
        <div class="heatmap-stats">
            <div><strong>${activeDays}</strong><span>日 活動（${span}）</span></div>
            <div><strong>${streak.current}</strong><span>週 連続中</span></div>
            <div><strong>${streak.longest}</strong><span>週 最長連続</span></div>
            <div><strong>${total}</strong><span>件 日記（${span}）</span></div>
        </div>
        <div class="heatmap-scroll">
            <div class="heatmap" style="--weeks:${weekCount}">
                <div class="heatmap-months">${monthLabels}</div>
                <div class="heatmap-weekdays" aria-hidden="true"><span></span><span>月</span><span></span><span>水</span><span></span><span>金</span><span></span></div>
                <div class="heatmap-grid" role="group" aria-label="${escapeAttribute(who)}の活動ヒートマップ">${cells.join('')}</div>
            </div>
        </div>
        <div class="heatmap-legend" aria-hidden="true">
            <span>${inRange.size ? `${escapeHTML(who)}の日記を書いた日` : `${escapeHTML(who)}はこの${span}、日記がありません`}</span>
            <span class="heatmap-legend-scale">少<i class="level-0"></i><i class="level-1"></i><i class="level-2"></i><i class="level-3"></i><i class="level-4"></i>多</span>
        </div>
    `;

    container.querySelectorAll('button[data-date]').forEach(button => {
        button.addEventListener('click', () => onSelect(button.dataset.date === selectedDate ? '' : button.dataset.date));
    });
    // 最初は今日（右端）が見えるようにする
    const scroll = container.querySelector('.heatmap-scroll');
    if (scroll) scroll.scrollLeft = scroll.scrollWidth;
}
