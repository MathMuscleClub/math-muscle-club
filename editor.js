// ==========================================
// 編集タブ
//   合言葉を入れると、スプレッドシートの各シートをホームページから直せる。
//   行を押すと編集、「＋ 追加」で新しい行、削除した行は「削除したもの」から戻せる。
//   部員名・種目名を変えると、日記や目標の同じ名前もスクリプト側で書き換わる。
// ==========================================
const EDITOR_SHEETS = [
    { key: 'diary', label: '日記' },
    { key: 'activity', label: '活動した日' },
    { key: 'goals', label: '目標' },
    { key: 'members', label: '部員' },
    { key: 'lifts', label: '種目' },
    { key: 'schedule', label: '予定' },
    { key: 'weekly', label: '毎週の予定' },
    { key: 'trainings', label: 'トレーニング' },
    { key: 'info', label: '基本情報' },
    { key: 'yearly', label: '今年の目標と実績' },
    { key: 'trash', label: '🗑 削除したもの' }
];
// 新しい順に並べるシート（いちばん左の列が日付や月）
const EDITOR_NEWEST_FIRST = ['diary', 'activity', 'goals', 'schedule', 'trash'];

const editorState = { sheet: 'diary', table: null, query: '', loading: false };
let editorDialog = null;

function editorPassphrase() {
    return readLocal(PASSPHRASE_KEY);
}

function openEditor() {
    const host = document.getElementById('editor');
    if (!host) return;
    if (!isSheetEnabled()) {
        host.innerHTML = '<p class="no-data">スプレッドシートがまだつながっていません。</p>';
        return;
    }
    if (!editorPassphrase()) {
        renderEditorLogin(host);
        return;
    }
    if (!host.querySelector('.editor-shell')) renderEditorShell(host);
    if (!editorState.table) loadEditorTable();
}

function renderEditorLogin(host, message = '') {
    host.innerHTML = `
        <form class="editor-login">
            <p>部の合言葉を入れると、日記・目標・部員・予定などをここで直せます。</p>
            <div class="editor-login-row">
                <input name="passphrase" type="password" autocomplete="off" placeholder="合言葉" aria-label="合言葉" required>
                <button type="submit" class="write-button-inline">開く</button>
            </div>
            <p class="write-message" role="status">${escapeHTML(message)}</p>
        </form>
    `;
    const form = host.querySelector('form');
    form.addEventListener('submit', async event => {
        event.preventDefault();
        const passphrase = form.passphrase.value.trim();
        const status = form.querySelector('.write-message');
        status.textContent = '確かめています...';
        try {
            const result = await postToSheet('check', {}, passphrase);
            if (!result.ok) {
                status.textContent = result.error || '開けませんでした。';
                return;
            }
            writeLocal(PASSPHRASE_KEY, passphrase);
            editorState.table = null;
            openEditor();
        } catch (error) {
            status.textContent = '通信できませんでした。少し待ってからもう一度試してください。';
        }
    });
    form.passphrase.focus();
}

function renderEditorShell(host) {
    host.innerHTML = `
        <div class="editor-shell">
            <div class="editor-sheets" role="tablist" aria-label="直すシート">
                ${EDITOR_SHEETS.map(s => `<button type="button" class="personal-goals-period-btn" data-sheet="${s.key}" role="tab">${escapeHTML(s.label)}</button>`).join('')}
            </div>
            <div class="editor-toolbar">
                <input class="diary-search editor-search" type="search" placeholder="このシートを検索" aria-label="このシートを検索">
                <button type="button" class="write-button-inline editor-add">＋ 追加</button>
                <button type="button" class="calendar-today-btn editor-reload">読み込み直す</button>
            </div>
            <p class="editor-status" role="status"></p>
            <div class="editor-list"></div>
            <p class="editor-foot">
                スプレッドシートと同じ内容です。部員名・種目名を変えると、日記や目標の同じ名前も書き換わります。
                <button type="button" class="editor-logout">合言葉を忘れる</button>
            </p>
        </div>
    `;
    host.querySelectorAll('[data-sheet]').forEach(button => {
        button.addEventListener('click', () => {
            editorState.sheet = button.dataset.sheet;
            editorState.query = '';
            host.querySelector('.editor-search').value = '';
            loadEditorTable();
        });
    });
    host.querySelector('.editor-search').addEventListener('input', event => {
        editorState.query = event.target.value.trim().toLowerCase();
        renderEditorList();
    });
    host.querySelector('.editor-add').addEventListener('click', () => openEditorDialog(null));
    host.querySelector('.editor-reload').addEventListener('click', () => loadEditorTable());
    host.querySelector('.editor-logout').addEventListener('click', () => {
        writeLocal(PASSPHRASE_KEY, '');
        editorState.table = null;
        renderEditorLogin(host);
    });
}

async function loadEditorTable() {
    const host = document.getElementById('editor');
    const status = host.querySelector('.editor-status');
    host.querySelectorAll('[data-sheet]').forEach(b => {
        const active = b.dataset.sheet === editorState.sheet;
        b.classList.toggle('active', active);
        b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    host.querySelector('.editor-add').hidden = editorState.sheet === 'trash';
    status.textContent = '読み込んでいます...';
    host.querySelector('.editor-list').innerHTML = '';
    editorState.loading = true;
    try {
        const result = await postToSheet('getTable', { sheet: editorState.sheet }, editorPassphrase());
        if (!result.ok) {
            if (result.code === 'bad_passphrase') {
                renderEditorLogin(host, '合言葉が変わったようです。もう一度入れてください。');
                return;
            }
            status.textContent = result.error || '読み込めませんでした。';
            return;
        }
        if (result.sheet !== editorState.sheet) return; // 読み込み中に別のシートに切り替えた
        editorState.table = result;
        status.textContent = '';
        renderEditorList();
    } catch (error) {
        status.textContent = '通信できませんでした。「読み込み直す」を押してください。';
    } finally {
        editorState.loading = false;
    }
}

function visibleColumns(table) {
    return table.columns.filter(c => !c.hidden);
}

function displayCell(column, value) {
    if (column.type === 'checkbox') return value === true ? '✓' : '';
    return String(value ?? '');
}

function renderEditorList() {
    const host = document.getElementById('editor');
    const list = host.querySelector('.editor-list');
    const table = editorState.table;
    if (!table) return;

    const columns = visibleColumns(table);
    let rows = table.rows.slice();
    if (EDITOR_NEWEST_FIRST.includes(table.sheet)) {
        const first = table.columns[0].name;
        rows.sort((a, b) => String(b.values[first]).localeCompare(String(a.values[first])));
    }
    if (editorState.query) {
        rows = rows.filter(r => columns.some(c => displayCell(c, r.values[c.name]).toLowerCase().includes(editorState.query)));
    }

    host.querySelector('.editor-status').textContent = `${rows.length}件${editorState.query ? `（${table.rows.length}件中）` : ''}`;
    if (rows.length === 0) {
        list.innerHTML = '<p class="no-data">まだありません。</p>';
        return;
    }

    list.innerHTML = '';
    rows.forEach(row => {
        const [a, b, c] = columns.map(col => displayCell(col, row.values[col.name]));
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'editor-row';
        button.innerHTML = `
            <span class="editor-row-main">${escapeHTML(a || '（空）')}${b ? ` <span class="editor-row-meta">${escapeHTML(b)}</span>` : ''}</span>
            ${c ? `<span class="editor-row-sub">${escapeHTML(c.length > 80 ? `${c.slice(0, 80)}…` : c)}</span>` : ''}
        `;
        button.addEventListener('click', () => openEditorDialog(row));
        list.appendChild(button);
    });
}

function fieldHTML(column, value) {
    const name = escapeAttribute(column.name);
    const text = escapeAttribute(value ?? '');
    let input;
    if (column.type === 'textarea') {
        input = `<textarea name="${name}" rows="${column.name === '本文' || column.name === '内容' ? 6 : 3}">${escapeHTML(value ?? '')}</textarea>`;
    } else if (column.type === 'select') {
        const options = column.options.includes(value) || !value ? column.options : [value, ...column.options];
        input = `<select name="${name}"><option value=""></option>${options.map(o => `<option value="${escapeAttribute(o)}"${o === value ? ' selected' : ''}>${escapeHTML(o)}</option>`).join('')}</select>`;
    } else if (column.type === 'checkbox') {
        return `<label class="write-check"><input type="checkbox" name="${name}"${value === true ? ' checked' : ''}> ${escapeHTML(column.name)}</label>`;
    } else {
        const type = { date: 'date', month: 'month', number: 'number' }[column.type] || 'text';
        const extra = column.type === 'number' ? ' step="any" inputmode="decimal"' : '';
        input = `<input name="${name}" type="${type}" value="${text}"${extra}>`;
    }
    const hint = column.name === '曜日' ? '<small>例: 水,金</small>' : '';
    return `<label class="write-field"><span>${escapeHTML(column.name)} ${hint}</span>${input}</label>`;
}

function ensureEditorDialog() {
    if (editorDialog) return editorDialog;
    editorDialog = document.createElement('dialog');
    editorDialog.className = 'write-dialog';
    editorDialog.innerHTML = `
        <form method="dialog" class="write-form">
            <div class="write-body"></div>
            <p class="write-message" role="status"></p>
            <div class="write-actions">
                <button type="button" class="editor-delete">削除</button>
                <span class="editor-actions-space"></span>
                <button type="button" class="write-cancel">やめる</button>
                <button type="submit" class="write-submit">保存する</button>
            </div>
        </form>
    `;
    editorDialog.querySelector('.write-cancel').addEventListener('click', () => editorDialog.close());
    editorDialog.addEventListener('click', event => {
        if (event.target === editorDialog) editorDialog.close();
    });
    document.body.appendChild(editorDialog);
    return editorDialog;
}

function openEditorDialog(row) {
    const table = editorState.table;
    if (!table) return;
    const dialog = ensureEditorDialog();
    const form = dialog.querySelector('form');
    const body = dialog.querySelector('.write-body');
    const message = dialog.querySelector('.write-message');
    const deleteButton = dialog.querySelector('.editor-delete');
    const submit = dialog.querySelector('.write-submit');
    const isTrash = table.sheet === 'trash';
    const sheetLabel = (EDITOR_SHEETS.find(s => s.key === table.sheet) || {}).label || table.name;

    message.textContent = '';
    deleteButton.hidden = !row || isTrash;
    submit.textContent = isTrash ? '元に戻す' : '保存する';

    if (isTrash) {
        let content = {};
        try {
            content = JSON.parse(row.values['内容']);
        } catch (_error) {
            content = {};
        }
        body.innerHTML = `
            <h3>削除したもの（${escapeHTML(row.values['シート'])}）</h3>
            <p class="write-hint">${escapeHTML(row.values['削除した日時'])} に削除</p>
            <dl class="editor-trash">
                ${Object.entries(content).filter(([k, v]) => v !== '' && v !== false && !['ID', '書いた日時', '更新日時'].includes(k))
                    .map(([k, v]) => `<dt>${escapeHTML(k)}</dt><dd>${escapeHTML(v === true ? '✓' : v)}</dd>`).join('')}
            </dl>
        `;
    } else {
        body.innerHTML = `
            <h3>${escapeHTML(sheetLabel)}を${row ? '直す' : '足す'}</h3>
            ${visibleColumns(table).map(c => fieldHTML(c, row ? row.values[c.name] : defaultValue(c))).join('')}
        `;
    }

    form.onsubmit = async event => {
        event.preventDefault();
        if (isTrash) {
            await runEditorAction('restoreRow', { row: row.row, before: row.values }, message, '元に戻しました');
            return;
        }
        const values = {};
        visibleColumns(table).forEach(c => {
            const field = form.elements[c.name];
            if (!field) return;
            values[c.name] = c.type === 'checkbox' ? field.checked : field.value;
        });
        if (row) {
            await runEditorAction('updateRow', { sheet: table.sheet, row: row.row, before: row.values, values }, message, '保存しました');
        } else {
            await runEditorAction('addRow', { sheet: table.sheet, values }, message, '足しました');
        }
    };
    deleteButton.onclick = async () => {
        if (!window.confirm('この行を削除しますか？（「削除したもの」から戻せます）')) return;
        await runEditorAction('deleteRow', { sheet: table.sheet, row: row.row, before: row.values }, message, '削除しました');
    };

    dialog.showModal();
}

function defaultValue(column) {
    if (column.type === 'date') return getTodayKey();
    if (column.type === 'month') return getTodayKey().slice(0, 7);
    if (column.type === 'checkbox') return column.name === 'グラフに出す';
    if (column.name === '状態') return '進行中';
    return '';
}

async function runEditorAction(action, data, message, doneText) {
    const buttons = editorDialog.querySelectorAll('button');
    buttons.forEach(b => { b.disabled = true; });
    message.textContent = '保存しています...';
    try {
        const result = await postToSheet(action, data, editorPassphrase());
        if (!result.ok) {
            message.textContent = result.error || 'できませんでした。';
            return;
        }
        editorDialog.close();
        showSiteToast(result.renamed ? `${doneText}（ほかの ${result.renamed} か所も書き換えました）` : doneText);
        loadEditorTable();
        reloadSiteData();
    } catch (error) {
        message.textContent = '通信できませんでした。少し待ってからもう一度試してください。';
    } finally {
        buttons.forEach(b => { b.disabled = false; });
    }
}
