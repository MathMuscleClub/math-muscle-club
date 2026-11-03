// ==========================================
// 記録（部の目標メーター・伸びのグラフ）
//   記録は日記に付ける（スプレッドシートの「日記」シートの種目・重さ・回数・時間）。
//   自己ベストを更新した日だけ書けばよい。
//   種目ごとに何で比べるか（重さ・回数・時間）は「種目」シートの「記録のしかた」で決まる。
// ==========================================

// 種目ごとの記録のしかた。「種目」シートにない種目は「重さと回数」として扱う
const MEASURE_UNITS = { weight: 'kg', reps: '回', time: '秒' };
let liftMeasures = new Map();

function setLiftCatalog(lifts) {
    liftMeasures = new Map((Array.isArray(lifts) ? lifts : []).map(l => [l.name, l.measure || 'weight']));
}

function measureOf(lift) {
    return liftMeasures.get(lift) || 'weight';
}

// 比べる値（重さの種目は重さ、回数の種目は回数、時間の種目は秒）
function recordValue(record) {
    const measure = measureOf(record.lift);
    if (measure === 'reps') return Number(record.reps) || 0;
    if (measure === 'time') return Number(record.seconds) || 0;
    return Number(record.weight) || 0;
}

function formatRecordValue(record) {
    const measure = measureOf(record.lift);
    const reps = Number(record.reps) || 0;
    if (measure === 'reps') return `${reps}回`;
    if (measure === 'time') return `${Number(record.seconds) || 0}秒`;
    return reps > 1 ? `${record.weight}kg × ${reps}回` : `${record.weight}kg`;
}

// 部員の色（「部員」シートの並び順で固定。並びを変えない限り色は変わらない）
const MEMBER_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];
const OTHER_MEMBER_COLOR = '#8a8a84';

function normalizeName(name) {
    return String(name || '').trim().toLowerCase();
}

// 表記ゆれ（KsK と ksk など）を「部員」シートの名前にそろえる
function createMemberDirectory(members) {
    const list = Array.isArray(members) ? members : [];
    // 名前と別名（スプレッドシートの「別名」）のどちらでも、同じ部員として扱う
    const byKey = new Map();
    list.forEach((m, index) => {
        const entry = { name: m.name, index };
        (Array.isArray(m.aliases) ? m.aliases : []).forEach(alias => byKey.set(normalizeName(alias), entry));
        byKey.set(normalizeName(m.name), entry);
    });
    return {
        members: list,
        resolve(name) {
            const hit = byKey.get(normalizeName(name));
            return hit ? hit.name : String(name || '').trim();
        },
        colorOf(name) {
            const hit = byKey.get(normalizeName(name));
            if (!hit) return OTHER_MEMBER_COLOR;
            return MEMBER_COLORS[hit.index] || OTHER_MEMBER_COLOR;
        }
    };
}

function collectRecords(diary, directory) {
    const records = [];
    (Array.isArray(diary) ? diary : []).forEach(post => {
        const items = Array.isArray(post.records) ? post.records : (post.record ? [post.record] : []);
        items.forEach(item => {
            if (!item.lift) return;
            const record = {
                date: item.date || post.date,
                name: directory.resolve(item.name || post.author),
                lift: String(item.lift).trim(),
                weight: Number(item.weight) || 0,
                reps: Number(item.reps) || 0,
                seconds: Number(item.seconds) || 0,
                title: post.title
            };
            record.value = recordValue(record);
            if (record.value > 0) records.push(record);
        });
    });
    return records.sort((a, b) => a.date.localeCompare(b.date));
}

function bestByMember(records, lift) {
    const best = new Map();
    records.filter(r => r.lift === lift).forEach(r => {
        const current = best.get(r.name);
        if (!current || r.value > current.value) best.set(r.name, r);
    });
    return best;
}

function formatShortDate(dateStr) {
    const [, month, day] = dateStr.split('-').map(Number);
    return `${month}/${day}`;
}

function renderRecords(members, diary, teamTarget, lifts) {
    const meterHost = document.getElementById('team-meter');
    const chartHost = document.getElementById('records-chart');
    if (!meterHost || !chartHost) return;

    setLiftCatalog(lifts);
    const directory = createMemberDirectory(members);
    const records = collectRecords(diary, directory);

    renderTeamMeter(meterHost, records, directory, teamTarget);
    renderRecordsChart(chartHost, records, directory);
}

// ---------- 部の目標メーター ----------
function renderTeamMeter(host, records, directory, target) {
    if (!target || !target.lift || !(target.weight > 0)) {
        host.innerHTML = '';
        host.hidden = true;
        return;
    }

    const best = bestByMember(records, target.lift);
    const rows = directory.members.map(m => ({ name: m.name, record: best.get(m.name) || null }));
    const withRecord = rows.filter(r => r.record);
    const unit = MEASURE_UNITS[measureOf(target.lift)];
    const average = withRecord.length
        ? withRecord.reduce((sum, r) => sum + r.record.value, 0) / withRecord.length
        : 0;
    const ratio = Math.min(average / target.weight, 1);
    const remaining = Math.max(target.weight - average, 0);
    const averageText = Math.round(average * 10) / 10;

    const statusText = !withRecord.length
        ? 'まだ記録がありません'
        : remaining === 0 ? '目標達成！' : `あと ${Math.round(remaining * 10) / 10}${unit}`;

    host.innerHTML = `
        <div class="team-meter-head">
            <div>
                <p class="team-meter-label">${escapeHTML(target.label || `${target.lift}の平均`)}</p>
                <p class="team-meter-value"><strong>${averageText}</strong> / ${target.weight}${unit}</p>
            </div>
            <p class="team-meter-status${remaining === 0 && withRecord.length ? ' is-done' : ''}">${statusText}</p>
        </div>
        <div class="team-meter-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${target.weight}" aria-valuenow="${averageText}" aria-label="${escapeAttribute(target.label || target.lift)}">
            <span style="width: ${ratio * 100}%"></span>
        </div>
        <ul class="team-meter-members">
            ${rows.map(r => `
                <li>
                    <span class="member-dot" style="background:${directory.colorOf(r.name)}"></span>
                    <span class="team-meter-name">${escapeHTML(r.name)}</span>
                    <span class="team-meter-weight">${r.record ? escapeHTML(formatRecordValue(r.record)) : '<span class="muted-cell">記録なし</span>'}</span>
                </li>
            `).join('')}
        </ul>
        <p class="team-meter-note">${withRecord.length}人ぶんの自己ベストの平均です（記録のない人は数えません）。</p>
    `;
}

// ---------- 伸びのグラフ ----------
function renderRecordsChart(host, records, directory) {
    const lifts = [...new Set(records.map(r => r.lift))];
    if (lifts.length === 0) {
        host.innerHTML = '<p class="no-data">まだ記録がありません。日記に「record」を書くと、ここにグラフが出ます。</p>';
        return;
    }

    host.innerHTML = `
        <div class="records-filter" role="tablist" aria-label="種目"></div>
        <div class="records-legend"></div>
        <div class="records-plot"></div>
        <details class="records-table">
            <summary>表で見る</summary>
            <div class="records-table-body"></div>
        </details>
    `;

    const filter = host.querySelector('.records-filter');
    let currentLift = lifts.includes('ベンチプレス') ? 'ベンチプレス' : lifts[0];

    lifts.forEach(lift => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'personal-goals-period-btn';
        button.textContent = lift;
        button.setAttribute('role', 'tab');
        button.addEventListener('click', () => {
            currentLift = lift;
            draw();
        });
        filter.appendChild(button);
    });

    // グラフは表示されている幅で描く（スマホでも文字が小さくならないように）
    const plotHost = host.querySelector('.records-plot');
    let lastWidth = 0;
    if (window.ResizeObserver) {
        new ResizeObserver(() => {
            const w = plotHost.clientWidth;
            if (w > 0 && Math.abs(w - lastWidth) > 4) {
                lastWidth = w;
                draw();
            }
        }).observe(plotHost);
    }

    function draw() {
        filter.querySelectorAll('button').forEach(b => {
            const isActive = b.textContent === currentLift;
            b.classList.toggle('active', isActive);
            b.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        const liftRecords = records.filter(r => r.lift === currentLift);
        drawLegend(host.querySelector('.records-legend'), liftRecords, directory);
        drawPlot(host.querySelector('.records-plot'), liftRecords, directory);
        drawTable(host.querySelector('.records-table-body'), liftRecords);
    }

    draw();
}

function groupByName(records) {
    const groups = new Map();
    records.forEach(r => {
        if (!groups.has(r.name)) groups.set(r.name, []);
        groups.get(r.name).push(r);
    });
    return groups;
}

function drawLegend(host, records, directory) {
    const names = [...groupByName(records).keys()];
    host.innerHTML = names.map(name => `
        <span class="records-legend-item">
            <span class="member-dot" style="background:${directory.colorOf(name)}"></span>${escapeHTML(name)}
        </span>
    `).join('');
}

function drawTable(host, records) {
    host.innerHTML = `
        <table>
            <thead><tr><th>日付</th><th>名前</th><th>記録</th></tr></thead>
            <tbody>
                ${[...records].reverse().map(r => `
                    <tr><td>${escapeHTML(r.date)}</td><td>${escapeHTML(r.name)}</td><td>${escapeHTML(formatRecordValue(r))}</td></tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function drawPlot(host, records, directory) {
    const width = Math.max(300, (host.clientWidth || 656) - 16);
    const height = width < 480 ? 220 : 260;
    const pad = { top: 16, right: 20, bottom: 30, left: 44 };
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;

    const times = records.map(r => parseDateKey(r.date).getTime());
    let minT = Math.min(...times);
    let maxT = Math.max(...times);
    if (minT === maxT) {
        // 1日ぶんしかないときは前後2週間を見せる
        minT -= 14 * 86400000;
        maxT += 14 * 86400000;
    } else {
        // 点がグラフの端に張り付かないよう、左右に少し余白をとる
        const margin = (maxT - minT) * 0.06;
        minT -= margin;
        maxT += margin;
    }
    const maxW = Math.max(...records.map(r => r.value));
    const yMax = Math.ceil((maxW * 1.15) / 10) * 10;
    const step = yMax <= 60 ? 10 : yMax <= 150 ? 20 : 50;

    const x = t => pad.left + ((t - minT) / (maxT - minT)) * innerW;
    const y = w => pad.top + innerH - (w / yMax) * innerH;

    const grid = [];
    for (let w = 0; w <= yMax; w += step) {
        grid.push(`
            <line x1="${pad.left}" x2="${width - pad.right}" y1="${y(w)}" y2="${y(w)}" class="records-grid${w === 0 ? ' is-base' : ''}"/>
            <text x="${pad.left - 8}" y="${y(w)}" class="records-axis" text-anchor="end" dominant-baseline="middle">${w}</text>
        `);
    }

    const tickCount = width < 480 ? 3 : 4;
    const xTicks = [];
    for (let i = 0; i <= tickCount; i++) {
        const t = minT + ((maxT - minT) * i) / tickCount;
        const d = new Date(t);
        const label = `${d.getMonth() + 1}/${d.getDate()}`;
        xTicks.push(`<text x="${x(t)}" y="${height - 8}" class="records-axis" text-anchor="middle">${label}</text>`);
    }

    const series = [];
    const points = [];
    groupByName(records).forEach((list, name) => {
        const color = directory.colorOf(name);
        if (list.length > 1) {
            const d = list.map((r, i) => `${i ? 'L' : 'M'}${x(parseDateKey(r.date).getTime())},${y(r.value)}`).join(' ');
            series.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`);
        }
        list.forEach(r => {
            const cx = x(parseDateKey(r.date).getTime());
            const cy = y(r.value);
            const tip = `${r.name}　${formatShortDate(r.date)}　${formatRecordValue(r)}`;
            points.push(`
                <g class="records-point" tabindex="0" data-tip="${escapeAttribute(tip)}" data-x="${cx}" data-y="${cy}">
                    <circle cx="${cx}" cy="${cy}" r="14" fill="transparent"/>
                    <circle cx="${cx}" cy="${cy}" r="5" fill="${color}" stroke="var(--surface)" stroke-width="2"/>
                </g>
            `);
        });
    });

    host.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="記録の推移">
            ${grid.join('')}
            ${xTicks.join('')}
            <text x="${pad.left}" y="10" class="records-axis">${records.length ? MEASURE_UNITS[measureOf(records[0].lift)] : 'kg'}</text>
            ${series.join('')}
            ${points.join('')}
        </svg>
        <div class="records-tooltip" hidden></div>
    `;

    const svg = host.querySelector('svg');
    const tooltip = host.querySelector('.records-tooltip');
    const show = g => {
        const rect = svg.getBoundingClientRect();
        const scale = rect.width / width;
        tooltip.textContent = g.dataset.tip;
        tooltip.hidden = false;
        tooltip.style.left = `${Number(g.dataset.x) * scale}px`;
        tooltip.style.top = `${Number(g.dataset.y) * scale}px`;
    };
    const hide = () => { tooltip.hidden = true; };
    host.querySelectorAll('.records-point').forEach(g => {
        g.addEventListener('pointerenter', () => show(g));
        g.addEventListener('click', () => show(g));
        g.addEventListener('focus', () => show(g));
        g.addEventListener('pointerleave', hide);
        g.addEventListener('blur', hide);
    });
}
