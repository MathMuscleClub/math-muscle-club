// ==========================================
// 活動ヒートマップ（記録タブ）
//   「活動した日」（スプレッドシートの「活動した日」シート）を、1マス1日のマス目で並べる
//   「今日活動した」ボタンか、マスを押して付ける。日記を書いた日とは別に数える
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

// days: 活動した日（"2026-11-04" の配列）
// onToggle(date, active): マスを押したとき。active は押したあとの状態
function renderActivityHeatmap(days, { onToggle = null } = {}) {
    const container = document.getElementById('activity-heatmap');
    if (!container) return;

    const active = new Set(days);

    // 別のタブを開いているあいだは幅が0なので、ページの幅で考える
    const width = container.clientWidth || (container.closest('main') || document.body).clientWidth;
    const room = width - 64; // 枠の余白と曜日の列
    const weekCount = Math.min(HEATMAP_MAX_WEEKS, Math.max(HEATMAP_MIN_WEEKS, Math.floor(room / HEATMAP_COLUMN_PX)));
    const span = `${Math.round(weekCount / 4.35)}か月`;

    const today = new Date();
    const todayKey = heatmapDateKey(today);
    const monthPrefix = todayKey.slice(0, 7);
    const start = heatmapWeekStart(today);
    start.setDate(start.getDate() - (weekCount - 1) * 7);

    let activeDays = 0;
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
            const done = active.has(key);
            if (done) activeDays++;
            const label = `${date.getMonth() + 1}月${date.getDate()}日 ${done ? '活動した' : '活動なし'}`;
            const classes = ['heatmap-cell', done ? 'level-4' : 'level-0'];
            if (key === todayKey) classes.push('is-today');
            // 押すと「活動した日」を付けたり外したりできる（合言葉が要る）
            cells.push(onToggle
                ? `<button type="button" class="${classes.join(' ')}" data-date="${key}" data-active="${done}" title="${label}（押して切り替え）" aria-label="${label}"></button>`
                : `<span class="${classes.join(' ')}" title="${label}"></span>`);
        }
    }
    // 月の名前は、前の名前と重ならないものだけ出す
    const monthLabels = months
        .filter((m, i) => i === 0 || m.week - months[i - 1].week >= 3)
        .map(m => `<span style="grid-column:${m.week + 1}">${m.label}</span>`)
        .join('');

    const streak = heatmapWeekStreaks(active);
    const thisMonth = [...active].filter(key => key.startsWith(monthPrefix)).length;

    container.innerHTML = `
        <div class="heatmap-stats">
            <div><strong>${thisMonth}</strong><span>日 今月の活動</span></div>
            <div><strong>${streak.current}</strong><span>週 連続中</span></div>
            <div><strong>${streak.longest}</strong><span>週 最長連続</span></div>
            <div><strong>${activeDays}</strong><span>日 活動（${span}）</span></div>
        </div>
        <div class="heatmap-scroll">
            <div class="heatmap" style="--weeks:${weekCount}">
                <div class="heatmap-months">${monthLabels}</div>
                <div class="heatmap-weekdays" aria-hidden="true"><span></span><span>月</span><span></span><span>水</span><span></span><span>金</span><span></span></div>
                <div class="heatmap-grid" role="group" aria-label="活動ヒートマップ">${cells.join('')}</div>
            </div>
        </div>
        <div class="heatmap-legend" aria-hidden="true">
            <span>${active.size ? '色の付いた日が「活動した日」。マスを押すと付けたり外したりできます' : 'まだ活動した日がありません。「今日活動した」を押してみよう'}</span>
            <span class="heatmap-legend-scale">なし<i class="level-0"></i><i class="level-4"></i>活動</span>
        </div>
    `;

    if (onToggle) {
        container.querySelectorAll('button[data-date]').forEach(button => {
            button.addEventListener('click', () => onToggle(button.dataset.date, button.dataset.active !== 'true'));
        });
    }
    // 最初は今日（右端）が見えるようにする
    const scroll = container.querySelector('.heatmap-scroll');
    if (scroll) scroll.scrollLeft = scroll.scrollWidth;
}
