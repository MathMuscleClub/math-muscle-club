// ==========================================
// Googleスプレッドシートとのやりとり
//   読む: ホームページのデータ（部員・日記・目標・予定など）はすべてスプレッドシートから読む
//   書く: 「日記を書く」「目標を書く」の入力画面と、目標の状態の切り替え
//   書くときは合言葉が必要（ログインやアカウントは不要）
// ==========================================
const SHEET_API_URL = window.SHEET_API_URL || '';
const PASSPHRASE_KEY = 'mmc-passphrase';
const AUTHOR_KEY = 'mmc-author';
// 「種目」シートがまだ空のときに使う種目（記録のしかた: weight=重さと回数, reps=回数, time=時間）
const DEFAULT_LIFTS = [
    { name: 'ベンチプレス', measure: 'weight' },
    { name: 'スクワット', measure: 'weight' },
    { name: 'デッドリフト', measure: 'weight' },
    { name: 'ショルダープレス', measure: 'weight' },
    { name: '懸垂', measure: 'reps' },
    { name: 'プランク', measure: 'time' }
];
let liftCatalog = DEFAULT_LIFTS;
const STATUS_ORDER = ['pending', 'achieved', 'failed'];

function isSheetEnabled() {
    return Boolean(SHEET_API_URL);
}

function readLocal(key) {
    try {
        return localStorage.getItem(key) || '';
    } catch (_error) {
        return '';
    }
}

function writeLocal(key, value) {
    try {
        if (value) {
            localStorage.setItem(key, value);
        } else {
            localStorage.removeItem(key);
        }
    } catch (_error) {
        // 保存できない環境では毎回入力してもらう
    }
}

// ---------- 読む ----------
async function fetchSheetData() {
    if (!isSheetEnabled()) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
        const response = await fetch(`${SHEET_API_URL}?t=${Date.now()}`, { signal: controller.signal });
        const data = await response.json();
        return data && data.ok ? data : null;
    } catch (error) {
        console.warn('スプレッドシートを読めませんでした', error);
        return null;
    } finally {
        clearTimeout(timer);
    }
}

// "2026-11" → "2026年11月"
function monthKeyToPeriod(key) {
    const [year, month] = String(key).split('-').map(Number);
    return `${year}年${month}月`;
}

const WEEKDAY_CHARS = ['日', '月', '火', '水', '木', '金', '土'];
const METER_KEYS = ['メーターの名前', 'メーターの種目', 'メーターの目標(kg)'];

// "水,金" や "水曜日・金曜日" → [3, 5]
function parseWeekdays(text) {
    const days = [];
    Array.from(String(text || '')).forEach(char => {
        const index = WEEKDAY_CHARS.indexOf(char);
        if (index >= 0 && !days.includes(index)) days.push(index);
    });
    return days;
}

// スプレッドシートの部員・予定・トレーニングなどを、ページで使う形にする（空のシートは初期値のまま）
function applySheetData(json, sheet) {
    const result = { ...json, goals: { ...json.goals }, info: [], lifts: DEFAULT_LIFTS };
    liftCatalog = result.lifts;
    if (!sheet) return result;

    if (Array.isArray(sheet.lifts) && sheet.lifts.length) {
        result.lifts = sheet.lifts;
        liftCatalog = sheet.lifts;
    }
    if (Array.isArray(sheet.members) && sheet.members.length) result.members = sheet.members;
    if (Array.isArray(sheet.trainings) && sheet.trainings.length) result.trainings = sheet.trainings;
    if (Array.isArray(sheet.schedule) && sheet.schedule.length) result.schedules = sheet.schedule;
    if (Array.isArray(sheet.weekly) && sheet.weekly.length) {
        result.recurring = sheet.weekly
            .map(e => ({
                daysOfWeek: parseWeekdays(e.days),
                title: e.title,
                time: e.time,
                location: e.location,
                description: e.description,
                startDate: e.startDate || undefined,
                endDate: e.endDate || undefined
            }))
            .filter(e => e.daysOfWeek.length > 0);
    }
    if (Array.isArray(sheet.yearly) && sheet.yearly.length) {
        result.goals.yearlyGoals = sheet.yearly.filter(i => i.kind !== '実績').map(i => i.text);
        result.goals.achievements = sheet.yearly.filter(i => i.kind === '実績').map(i => i.text);
    }
    if (Array.isArray(sheet.info) && sheet.info.length) {
        const value = key => (sheet.info.find(i => i.key === key) || {}).value || '';
        result.info = sheet.info.filter(i => !METER_KEYS.includes(i.key) && i.value);
        if (value('メーターの種目') && Number(value('メーターの目標(kg)')) > 0) {
            result.goals.teamTarget = {
                label: value('メーターの名前'),
                lift: value('メーターの種目'),
                weight: Number(value('メーターの目標(kg)'))
            };
        }
    }
    return result;
}

// スプレッドシートの日記と目標を、ページで使う diary と goals の形にする
function mergeSheetData(diary, goals, sheet, directory) {
    const mergedDiary = Array.isArray(diary) ? diary.slice() : [];
    const mergedGoals = {
        ...goals,
        monthlyGoals: (goals.monthlyGoals || []).map(m => ({ ...m, items: (m.items || []).slice() })),
        personalGoals: (goals.personalGoals || []).map(p => ({
            ...p,
            months: (p.months || []).map(m => ({ ...m, items: (m.items || []).slice() }))
        }))
    };
    if (!sheet) return { diary: mergedDiary, goals: mergedGoals };

    (sheet.diary || []).forEach(post => {
        const entry = {
            id: post.id,
            source: 'sheet',
            date: post.date,
            author: post.author,
            title: post.title,
            content: post.content
        };
        if (post.lift && (post.weight > 0 || post.reps > 0 || post.seconds > 0)) {
            entry.record = { lift: post.lift, weight: post.weight, reps: post.reps, seconds: post.seconds };
            if (post.recordName) entry.record.name = post.recordName;
        }
        mergedDiary.push(entry);
    });

    const addToMonths = (months, period, item) => {
        let month = months.find(m => periodToNumber(m.period) === periodToNumber(period));
        if (!month) {
            month = { period, items: [] };
            months.push(month);
        }
        month.items.push(item);
    };

    (sheet.goals || []).forEach(goal => {
        const period = monthKeyToPeriod(goal.period);
        const item = { id: goal.id, source: 'sheet', text: goal.text, status: goal.status };
        const owner = String(goal.owner || '').trim();
        if (!owner || owner === '部') {
            addToMonths(mergedGoals.monthlyGoals, period, item);
            return;
        }
        const name = directory.resolve(owner);
        let member = mergedGoals.personalGoals.find(p => normalizeName(p.name) === normalizeName(name));
        if (!member) {
            member = { name, months: [] };
            mergedGoals.personalGoals.push(member);
        }
        addToMonths(member.months, period, item);
    });

    return { diary: mergedDiary, goals: mergedGoals };
}

// ---------- 書く ----------
async function postToSheet(action, data, passphrase) {
    // text/plain で送ると、Apps Script でも余計な確認なしで届く
    const response = await fetch(SHEET_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, data, passphrase })
    });
    const result = await response.json();
    if (!result.ok && result.code === 'bad_passphrase') writeLocal(PASSPHRASE_KEY, '');
    return result;
}

function showSiteToast(text, isError = false) {
    const toast = document.createElement('div');
    toast.className = 'site-toast' + (isError ? ' is-error' : '');
    toast.setAttribute('role', 'status');
    toast.textContent = text;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
}

// 目標の状態バッジ。スプレッドシートの目標なら押して切り替えられる
function createGoalStatus(item) {
    const status = item.status || 'pending';
    if (!isSheetEnabled() || item.source !== 'sheet' || !item.id) return createBadge(status);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `badge badge-${status} badge-button`;
    button.textContent = createBadge(status).textContent;
    button.title = '押すと「進行中 → 達成 → 未達成」と切り替わります';
    button.addEventListener('click', async () => {
        let passphrase = readLocal(PASSPHRASE_KEY);
        if (!passphrase) {
            passphrase = (window.prompt('合言葉を入れてください') || '').trim();
            if (!passphrase) return;
        }
        const next = STATUS_ORDER[(STATUS_ORDER.indexOf(item.status || 'pending') + 1) % STATUS_ORDER.length];
        button.disabled = true;
        try {
            const result = await postToSheet('setGoalStatus', { id: item.id, status: next }, passphrase);
            if (!result.ok) {
                showSiteToast(result.error || '保存できませんでした', true);
                return;
            }
            writeLocal(PASSPHRASE_KEY, passphrase);
            item.status = next;
            button.className = `badge badge-${next} badge-button`;
            button.textContent = createBadge(next).textContent;
            showSiteToast(`「${createBadge(next).textContent}」にしました`);
            reloadSiteData();
        } catch (error) {
            showSiteToast('通信できませんでした。少し待ってからもう一度試してください。', true);
        } finally {
            button.disabled = false;
        }
    });
    return button;
}

// ---------- 入力画面 ----------
let writeDialog = null;

function getMemberNames() {
    return memberDirectory ? memberDirectory.members.map(m => m.name) : [];
}

function memberOptions(selected, extra = []) {
    const names = [...extra, ...getMemberNames()];
    return names.map(name => `<option value="${escapeAttribute(name)}"${name === selected ? ' selected' : ''}>${escapeHTML(name)}</option>`).join('');
}

function passphraseFieldHTML() {
    const saved = readLocal(PASSPHRASE_KEY);
    return `
        <label class="write-field">
            <span>合言葉</span>
            <input name="passphrase" type="password" autocomplete="off" required value="${escapeAttribute(saved)}">
        </label>
        <label class="write-check">
            <input name="remember" type="checkbox" checked>
            このブラウザに合言葉を覚えておく
        </label>
    `;
}

function diaryFormHTML() {
    const author = readLocal(AUTHOR_KEY);
    return `
        <h3>日記を書く</h3>
        <div class="write-row">
            <label class="write-field">
                <span>日付</span>
                <input name="date" type="date" required value="${getTodayKey()}">
            </label>
            <label class="write-field">
                <span>書いた人</span>
                <select name="author" required>
                    <option value="">選んでください</option>
                    ${memberOptions(author)}
                </select>
            </label>
        </div>
        <label class="write-field">
            <span>タイトル</span>
            <input name="title" type="text" maxlength="200" required placeholder="例: ベンチプレス60kg達成！">
        </label>
        <label class="write-field">
            <span>本文</span>
            <textarea name="content" rows="5" maxlength="2000" placeholder="今日やったこと、感想など"></textarea>
        </label>
        <details class="write-record">
            <summary>🏆 自己ベストを更新した（記録に残す）</summary>
            <div class="write-row">
                <label class="write-field">
                    <span>種目</span>
                    <select name="lift">
                        <option value="">選んでください</option>
                        ${liftCatalog.map(l => `<option value="${escapeAttribute(l.name)}">${escapeHTML(l.name)}</option>`).join('')}
                    </select>
                </label>
                <label class="write-field write-field-small" data-measure="weight">
                    <span>重さ (kg)</span>
                    <input name="weight" type="number" min="0" max="500" step="0.5" inputmode="decimal">
                </label>
                <label class="write-field write-field-small" data-measure="weight reps">
                    <span>回数</span>
                    <input name="reps" type="number" min="1" max="1000" step="1" inputmode="numeric">
                </label>
                <label class="write-field write-field-small" data-measure="time" hidden>
                    <span>時間 (秒)</span>
                    <input name="seconds" type="number" min="1" max="36000" step="1" inputmode="numeric">
                </label>
            </div>
            <label class="write-field">
                <span>記録した人（書いた人と同じなら空のまま）</span>
                <select name="recordName">
                    <option value="">書いた人と同じ</option>
                    ${memberOptions('')}
                </select>
            </label>
        </details>
        ${passphraseFieldHTML()}
    `;
}

function goalFormHTML() {
    const today = new Date();
    const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    return `
        <h3>目標を書く</h3>
        <div class="write-row">
            <label class="write-field">
                <span>月</span>
                <input name="period" type="month" required value="${month}">
            </label>
            <label class="write-field">
                <span>誰の目標</span>
                <select name="owner" required>
                    <option value="部">部の目標（月間目標）</option>
                    ${memberOptions('')}
                </select>
            </label>
        </div>
        <label class="write-field">
            <span>目標（1行に1つ）</span>
            <textarea name="items" rows="4" required placeholder="ベンチプレス+5kg&#10;週2回ぜんぶ出る"></textarea>
        </label>
        <p class="write-hint">達成したら、目標の「進行中」のバッジを押すと切り替えられます。</p>
        ${passphraseFieldHTML()}
    `;
}

function ensureWriteDialog() {
    if (writeDialog) return writeDialog;
    writeDialog = document.createElement('dialog');
    writeDialog.className = 'write-dialog';
    writeDialog.innerHTML = `
        <form method="dialog" class="write-form">
            <div class="write-body"></div>
            <p class="write-message" role="status"></p>
            <div class="write-actions">
                <button type="button" class="write-cancel">やめる</button>
                <button type="submit" class="write-submit">保存する</button>
            </div>
        </form>
    `;
    writeDialog.querySelector('.write-cancel').addEventListener('click', () => writeDialog.close());
    writeDialog.addEventListener('click', event => {
        if (event.target === writeDialog) writeDialog.close();
    });
    document.body.appendChild(writeDialog);
    return writeDialog;
}

function openWriteDialog(kind) {
    const dialog = ensureWriteDialog();
    const form = dialog.querySelector('form');
    const body = dialog.querySelector('.write-body');
    const message = dialog.querySelector('.write-message');
    body.innerHTML = kind === 'diary' ? diaryFormHTML() : goalFormHTML();
    message.textContent = '';
    form.onsubmit = event => {
        event.preventDefault();
        submitWriteForm(kind, form, message);
    };
    // 種目を選ぶと、その種目の記録のしかた（重さ・回数・時間）に合わせて入力欄が変わる
    const liftSelect = body.querySelector('[name="lift"]');
    if (liftSelect) {
        const update = () => {
            const lift = liftCatalog.find(l => l.name === liftSelect.value);
            const measure = lift ? lift.measure : 'weight';
            body.querySelectorAll('[data-measure]').forEach(field => {
                const show = field.dataset.measure.split(' ').includes(measure);
                field.hidden = !show;
                if (!show) field.querySelector('input').value = '';
            });
        };
        liftSelect.addEventListener('change', update);
        update();
    }
    dialog.showModal();
    const first = body.querySelector(kind === 'diary' ? '[name="title"]' : '[name="items"]');
    if (first) first.focus();
}

async function submitWriteForm(kind, form, message) {
    const values = Object.fromEntries(new FormData(form).entries());
    const passphrase = String(values.passphrase || '').trim();
    const submit = form.querySelector('.write-submit');

    let action;
    let data;
    if (kind === 'diary') {
        action = 'addDiary';
        data = {
            date: values.date,
            author: values.author,
            title: values.title,
            content: values.content,
            lift: values.lift,
            weight: values.weight,
            reps: values.reps,
            seconds: values.seconds,
            recordName: values.recordName
        };
        const hasValue = Number(values.weight) > 0 || Number(values.reps) > 0 || Number(values.seconds) > 0;
        if (hasValue && !values.lift) {
            message.textContent = '記録を残すときは種目も選んでください。';
            return;
        }
        if (values.lift && !hasValue) {
            message.textContent = '記録の数字（重さ・回数・時間）を入れてください。';
            return;
        }
    } else {
        action = 'addGoals';
        data = {
            period: values.period,
            owner: values.owner,
            items: String(values.items || '').split('\n').map(t => t.trim()).filter(Boolean)
        };
    }

    submit.disabled = true;
    message.textContent = '保存しています...';
    try {
        const result = await postToSheet(action, data, passphrase);
        if (!result.ok) {
            message.textContent = result.error || '保存できませんでした。';
            return;
        }
        writeLocal(PASSPHRASE_KEY, values.remember ? passphrase : '');
        if (kind === 'diary') writeLocal(AUTHOR_KEY, values.author);
        writeDialog.close();
        showSiteToast('保存しました');
        reloadSiteData();
    } catch (error) {
        message.textContent = '通信できませんでした。少し待ってからもう一度試してください。';
    } finally {
        submit.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.body.classList.toggle('sheet-enabled', isSheetEnabled());
    document.querySelectorAll('[data-write]').forEach(button => {
        button.addEventListener('click', () => openWriteDialog(button.dataset.write));
    });
});
