/**
 * 数学科筋トレ部 ホームページ用 Google Apps Script
 *
 * スプレッドシートに貼り付けて「ウェブアプリ」として公開すると、
 * ホームページがここからデータを読み、日記や目標を書き込めるようになる。
 * 手順は docs/spreadsheet-setup.md を見ること。
 *
 * 合言葉はこのファイルには書かない。
 * 「プロジェクトの設定 → スクリプト プロパティ」に PASSPHRASE として入れる。
 *
 * つながり（一か所直せば他も変わる）
 *   ・人の名前は「部員」シートが正。名前を書き換えると、日記・目標の名前も書き換わる。
 *     表記ゆれ（KsK など）は「別名」に書いて organizeData を実行すると、正しい名前にそろう。
 *   ・種目名は「種目」シートが正。名前を書き換えると、日記の記録と部の目標メーターも書き換わる。
 *   ・日記の「書いた人」「記録の人」、目標の「誰の目標」、日記の「種目」はプルダウンで選べる。
 */

const SHEETS = {
  diary: {
    name: '日記',
    headers: ['日付', '書いた人', 'タイトル', '本文', '種目', '重さ(kg)', '回数', '記録の人', 'ID', '書いた日時', '時間(秒)']
  },
  goals: {
    name: '目標',
    headers: ['月', '誰の目標', '目標', '状態', 'ID', '更新日時']
  },
  info: {
    name: '基本情報',
    headers: ['項目', '内容']
  },
  members: {
    name: '部員',
    headers: ['名前', '役職', '得意な種目', 'リンク', '別名']
  },
  lifts: {
    name: '種目',
    headers: ['種目', '記録のしかた']
  },
  yearly: {
    name: '今年の目標と実績',
    headers: ['種類', '内容']
  },
  schedule: {
    name: '予定',
    headers: ['日付', 'タイトル', '時間', '場所', '説明']
  },
  weekly: {
    name: '毎週の予定',
    headers: ['曜日', 'タイトル', '時間', '場所', '説明', '開始日', '終了日']
  },
  trainings: {
    name: 'トレーニング',
    headers: ['名前', '部位', 'メニュー', 'ポイント']
  }
};

const STATUS_LABELS = { pending: '進行中', achieved: '達成', failed: '未達成' };
const MEASURES = { weight: '重さと回数', reps: '回数', time: '時間(秒)' };
const YEARLY_KINDS = ['今年の目標', '実績'];
const METER_LIFT_KEY = 'メーターの種目';
const MAX_TEXT = 2000;

// ---------- 読み出し（ホームページが表示に使う） ----------
function doGet() {
  ensureSheets_();
  return json_({
    ok: true,
    diary: readRows_(SHEETS.diary).map(row => ({
      id: row['ID'],
      date: formatDate_(row['日付']),
      author: text_(row['書いた人']),
      title: text_(row['タイトル']),
      content: text_(row['本文']),
      lift: text_(row['種目']),
      weight: Number(row['重さ(kg)']) || 0,
      reps: Number(row['回数']) || 0,
      seconds: Number(row['時間(秒)']) || 0,
      recordName: text_(row['記録の人'])
    })).filter(post => post.date && (post.title || post.content)),
    goals: readRows_(SHEETS.goals).map(row => ({
      id: row['ID'],
      period: formatMonth_(row['月']),
      owner: text_(row['誰の目標']),
      text: text_(row['目標']),
      status: statusFromLabel_(row['状態'])
    })).filter(goal => goal.period && goal.text),
    info: readRows_(SHEETS.info)
      .map(row => ({ key: text_(row['項目']), value: text_(row['内容']) }))
      .filter(item => item.key),
    members: readRows_(SHEETS.members).map(row => ({
      name: text_(row['名前']),
      role: text_(row['役職']),
      specialty: text_(row['得意な種目']),
      url: text_(row['リンク']),
      aliases: splitList_(row['別名'])
    })).filter(m => m.name),
    lifts: readRows_(SHEETS.lifts).map(row => ({
      name: text_(row['種目']),
      measure: measureFromLabel_(row['記録のしかた'])
    })).filter(l => l.name),
    yearly: readRows_(SHEETS.yearly).map(row => ({
      kind: text_(row['種類']),
      text: text_(row['内容'])
    })).filter(item => item.text),
    schedule: readRows_(SHEETS.schedule).map(row => ({
      date: formatDate_(row['日付']),
      title: text_(row['タイトル']),
      time: formatTimeRange_(row['時間']),
      location: text_(row['場所']),
      description: text_(row['説明'])
    })).filter(e => e.date && e.title),
    weekly: readRows_(SHEETS.weekly).map(row => ({
      days: text_(row['曜日']),
      title: text_(row['タイトル']),
      time: formatTimeRange_(row['時間']),
      location: text_(row['場所']),
      description: text_(row['説明']),
      startDate: formatDate_(row['開始日']),
      endDate: formatDate_(row['終了日'])
    })).filter(e => e.days && e.title),
    trainings: readRows_(SHEETS.trainings).map(row => ({
      name: text_(row['名前']),
      target: text_(row['部位']),
      menu: String(row['メニュー'] || '').split(/\n/).map(t => t.trim()).filter(Boolean),
      point: text_(row['ポイント'])
    })).filter(t => t.name)
  });
}

// ---------- 書き込み（ホームページの入力画面から） ----------
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (error) {
    return json_({ ok: false, error: '送られてきた内容が読めませんでした。' });
  }

  const passphrase = PropertiesService.getScriptProperties().getProperty('PASSPHRASE');
  if (!passphrase) {
    return json_({ ok: false, error: '合言葉がまだ設定されていません（スクリプト プロパティの PASSPHRASE）。' });
  }
  if (String(body.passphrase || '') !== passphrase) {
    return json_({ ok: false, error: '合言葉が違います。', code: 'bad_passphrase' });
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    ensureSheets_();
    if (body.action === 'check') return json_({ ok: true });
    if (body.action === 'addDiary') return json_(addDiary_(body.data || {}));
    if (body.action === 'addGoals') return json_(addGoals_(body.data || {}));
    if (body.action === 'setGoalStatus') return json_(setGoalStatus_(body.data || {}));
    if (body.action === 'importData') return json_(importData_(body.data || {}));
    return json_({ ok: false, error: '知らない操作です。' });
  } finally {
    lock.releaseLock();
  }
}

function addDiary_(data) {
  const date = clean_(data.date, 10);
  const title = clean_(data.title, 200);
  const content = clean_(data.content, MAX_TEXT);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(title || content)) {
    return { ok: false, error: '日付と、タイトルか本文を入れてください。' };
  }
  const weight = positive_(data.weight);
  const reps = positive_(data.reps);
  const seconds = positive_(data.seconds);
  const hasRecord = Boolean(clean_(data.lift, 50) && (weight || reps || seconds));
  const id = Utilities.getUuid();
  appendObject_(SHEETS.diary, {
    '日付': date,
    '書いた人': clean_(data.author, 50),
    'タイトル': title,
    '本文': content,
    '種目': hasRecord ? clean_(data.lift, 50) : '',
    '重さ(kg)': hasRecord ? weight : '',
    '回数': hasRecord ? reps : '',
    '時間(秒)': hasRecord ? seconds : '',
    '記録の人': hasRecord ? clean_(data.recordName, 50) : '',
    'ID': id,
    '書いた日時': new Date()
  });
  return { ok: true, id };
}

function addGoals_(data) {
  const period = clean_(data.period, 7);
  const owner = clean_(data.owner, 50) || '部';
  const items = (Array.isArray(data.items) ? data.items : [])
    .map(text => clean_(text, 300))
    .filter(Boolean)
    .slice(0, 20);
  if (!/^\d{4}-\d{2}$/.test(period) || items.length === 0) {
    return { ok: false, error: '月と、目標を1つ以上入れてください。' };
  }
  const ids = items.map(text => {
    const id = Utilities.getUuid();
    appendObject_(SHEETS.goals, {
      '月': period, '誰の目標': owner, '目標': text, '状態': STATUS_LABELS.pending, 'ID': id, '更新日時': new Date()
    });
    return id;
  });
  return { ok: true, ids };
}

function setGoalStatus_(data) {
  const label = STATUS_LABELS[data.status];
  if (!label) return { ok: false, error: '状態が正しくありません。' };
  const sheet = sheet_(SHEETS.goals);
  const values = sheet.getDataRange().getValues();
  const idCol = column_(sheet, 'ID');
  const statusCol = column_(sheet, '状態');
  const updatedCol = column_(sheet, '更新日時');
  // 手で足した行（ID が空）は "row-行番号" で届く
  const rowMatch = String(data.id || '').match(/^row-(\d+)$/);
  for (let r = 1; r < values.length; r++) {
    const id = values[r][idCol - 1];
    if (rowMatch ? r + 1 === Number(rowMatch[1]) && !id : id === data.id) {
      sheet.getRange(r + 1, statusCol).setValue(label);
      sheet.getRange(r + 1, updatedCol).setValue(new Date());
      return { ok: true };
    }
  }
  return { ok: false, error: 'その目標が見つかりませんでした。' };
}

// ---------- 最初の取り込み（ホームページの JSON の中身を送ってもらう） ----------
// すでに中身があるシートには何もしない（上書きしない）
function importData_(data) {
  const rows = (key, list, toRow) => fillIfEmpty_(SHEETS[key], (Array.isArray(list) ? list : []).map(toRow));
  const results = [
    rows('info', data.info, i => [i.key, i.value]),
    rows('members', data.members, m => [m.name || '', m.role || '', m.specialty || '', m.url || '', (m.aliases || []).join(', ')]),
    rows('lifts', data.lifts, l => [l.name, MEASURES[l.measure] || MEASURES.weight]),
    rows('yearly', data.yearly, i => [i.kind, i.text]),
    rows('schedule', data.schedule, e => [e.date || '', e.title || '', e.time || '', e.location || '', e.description || '']),
    rows('weekly', data.weekly, e => [e.days || '', e.title || '', e.time || '', e.location || '', e.description || '', e.startDate || '', e.endDate || '']),
    rows('trainings', data.trainings, t => [t.name || '', t.target || '', (t.menu || []).join('\n'), t.point || ''])
  ];
  const organized = organizeData();
  return { ok: true, results, organized };
}

function fillIfEmpty_(def, rows) {
  const sheet = sheet_(def);
  if (sheet.getLastRow() > 1) return `${def.name}: もう中身があるので、そのままにしました`;
  if (rows.length === 0) return `${def.name}: 取り込むものがありませんでした`;
  sheet.getRange(2, 1, rows.length, def.headers.length).setNumberFormat('@').setValues(rows);
  return `${def.name}: ${rows.length}行を取り込みました`;
}

// ---------- 名前をそろえる・プルダウンを付け直す ----------
function organizeData() {
  ensureSheets_();
  const members = readRows_(SHEETS.members)
    .map(row => ({ name: text_(row['名前']), aliases: splitList_(row['別名']) }))
    .filter(m => m.name);
  const lookup = new Map();
  members.forEach(m => [m.name, ...m.aliases].forEach(n => lookup.set(normalize_(n), m.name)));

  const unknown = new Set();
  let changed = 0;
  const fix = (def, header, allowed) => {
    changed += mapColumn_(def, header, value => {
      const text = String(value).trim();
      if (!text || allowed.includes(text)) return value;
      const name = lookup.get(normalize_(text));
      if (!name) {
        unknown.add(text);
        return value;
      }
      return name;
    });
  };
  fix(SHEETS.diary, '書いた人', []);
  fix(SHEETS.diary, '記録の人', []);
  fix(SHEETS.goals, '誰の目標', ['部']);

  refreshDropdowns_();

  const message = [`名前を ${changed} か所そろえました。`];
  if (unknown.size) {
    message.push(`部員にいない名前: ${[...unknown].join('、')}（同じ人なら「部員」シートの「別名」に書いて、もう一度 organizeData を実行）`);
  }
  Logger.log(message.join('\n'));
  return message.join('\n');
}

// 名前・種目の欄をプルダウンにする（違う値も入れられるが、警告の印が付く）
function refreshDropdowns_() {
  const names = readRows_(SHEETS.members).map(row => text_(row['名前'])).filter(Boolean);
  const lifts = readRows_(SHEETS.lifts).map(row => text_(row['種目'])).filter(Boolean);
  const set = (def, header, list) => {
    if (list.length === 0) return;
    const sheet = sheet_(def);
    const rule = SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(true).build();
    sheet.getRange(2, column_(sheet, header), 999, 1).setDataValidation(rule);
  };
  set(SHEETS.diary, '書いた人', names);
  set(SHEETS.diary, '記録の人', names);
  set(SHEETS.goals, '誰の目標', ['部', ...names]);
  set(SHEETS.diary, '種目', lifts);
}

// 「部員」「種目」シートを直したとき
//   ・名前を書き換えた → それを使っている所もまとめて書き換える（一か所直せば全部変わる）
//   ・プルダウンを付け直す
function onEdit(e) {
  if (!e || !e.range) return;
  const sheetName = e.range.getSheet().getName();
  const watched = {
    [SHEETS.members.name]: { header: '名前', targets: [[SHEETS.diary, '書いた人'], [SHEETS.diary, '記録の人'], [SHEETS.goals, '誰の目標']] },
    [SHEETS.lifts.name]: { header: '種目', targets: [[SHEETS.diary, '種目']], meter: true }
  }[sheetName];
  if (!watched) return;

  const sheet = e.range.getSheet();
  const isSingleCell = e.range.getNumRows() === 1 && e.range.getNumColumns() === 1
    && e.range.getColumn() === column_(sheet, watched.header) && e.range.getRow() > 1;
  const oldValue = String(e.oldValue || '').trim();
  const newValue = String(e.value || '').trim();
  if (isSingleCell && oldValue && newValue && oldValue !== newValue) {
    let count = 0;
    const replace = value => (normalize_(value) === normalize_(oldValue) ? newValue : value);
    watched.targets.forEach(([def, header]) => { count += mapColumn_(def, header, replace); });
    if (watched.meter) {
      // 部の目標メーターの種目も合わせる
      const info = sheet_(SHEETS.info);
      const values = info.getDataRange().getValues();
      for (let r = 1; r < values.length; r++) {
        if (text_(values[r][0]) === METER_LIFT_KEY && normalize_(values[r][1]) === normalize_(oldValue)) {
          info.getRange(r + 1, 2).setValue(newValue);
          count++;
        }
      }
    }
    SpreadsheetApp.getActiveSpreadsheet().toast(`「${oldValue}」を「${newValue}」に ${count} か所書き換えました`, '名前の変更');
  }
  refreshDropdowns_();
}

// ある列の値を fn で書き換え、変わった数を返す
function mapColumn_(def, header, fn) {
  const sheet = sheet_(def);
  const last = sheet.getLastRow();
  if (last < 2) return 0;
  const range = sheet.getRange(2, column_(sheet, header), last - 1, 1);
  let changed = 0;
  const values = range.getValues().map(([value]) => {
    const next = fn(value);
    if (next !== value) changed++;
    return [next];
  });
  if (changed) range.setValues(values);
  return changed;
}

// ---------- シートの準備 ----------
// ないシートは作り、足りない見出しは右端に足す。見た目と入力ルールは1回だけ整える。
function ensureSheets_() {
  const props = PropertiesService.getScriptProperties();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(key => {
    const def = SHEETS[key];
    let sheet = ss.getSheetByName(def.name);
    if (!sheet) {
      sheet = ss.insertSheet(def.name);
      sheet.getRange(1, 1, 1, def.headers.length).setValues([def.headers]);
    } else {
      const current = headersOf_(sheet);
      const missing = def.headers.filter(h => !current.includes(h));
      if (missing.length) {
        sheet.getRange(1, current.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
      }
    }

    if (props.getProperty(`formatted_${key}`)) return;
    props.setProperty(`formatted_${key}`, '1');
    sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold');
    sheet.setFrozenRows(1);
    // これから書く日付や月が勝手に日付型に変わらないよう、空いている行を文字として扱う
    sheet.getRange(sheet.getLastRow() + 1, 1, 1000, 1).setNumberFormat('@');

    const list = (header, values) => {
      const rule = SpreadsheetApp.newDataValidation().requireValueInList(values, true).build();
      sheet.getRange(2, column_(sheet, header), 999, 1).setDataValidation(rule);
    };
    if (key === 'goals') list('状態', Object.values(STATUS_LABELS));
    if (key === 'yearly') list('種類', YEARLY_KINDS);
    if (key === 'lifts') list('記録のしかた', Object.values(MEASURES));
    if (key === 'weekly' || key === 'schedule') {
      // 時間（12:00 - 13:00）や日付が勝手に変換されないよう、全部の列を文字として扱う
      sheet.getRange(2, 1, 999, def.headers.length).setNumberFormat('@');
    }
  });
}

function sheet_(def) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(def.name);
}

function headersOf_(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) return [];
  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(h => String(h).trim()).filter(Boolean);
}

// 見出しの列番号（1から）。列の並びが入れ替わっていても見出しで探す
function column_(sheet, header) {
  const index = headersOf_(sheet).indexOf(header);
  if (index < 0) throw new Error(`「${sheet.getName()}」シートに「${header}」の列がありません`);
  return index + 1;
}

// 見出しに合わせて1行足す
function appendObject_(def, obj) {
  const sheet = sheet_(def);
  sheet.appendRow(headersOf_(sheet).map(h => (h in obj ? obj[h] : '')));
}

function readRows_(def) {
  const sheet = sheet_(def);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(h => String(h).trim());
  return values.slice(1)
    .map((row, index) => ({ row, number: index + 2 }))
    .filter(({ row }) => row.some(cell => cell !== ''))
    .map(({ row, number }) => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      // 手で足した行で ID が空でも動くように、行番号から作る
      if (!obj['ID']) obj['ID'] = `row-${number}`;
      return obj;
    });
}

// ---------- 小さな道具 ----------
function text_(value) {
  return String(value == null ? '' : value).trim();
}

function normalize_(name) {
  return text_(name).toLowerCase();
}

function splitList_(value) {
  return String(value || '').split(/[,、，]/).map(t => t.trim()).filter(Boolean);
}

function clean_(value, max) {
  return text_(value).slice(0, max);
}

function positive_(value) {
  const n = Number(value);
  return n > 0 ? n : '';
}

function formatDate_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy-MM-dd');
  const match = String(value).trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` : '';
}

function formatMonth_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy-MM');
  const match = String(value).trim().match(/^(\d{4})\D+(\d{1,2})/);
  return match ? `${match[1]}-${match[2].padStart(2, '0')}` : '';
}

// 時間の欄が時刻型に変わっていても "12:00" の形で返す
function formatTimeRange_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, 'Asia/Tokyo', 'H:mm');
  return text_(value);
}

function statusFromLabel_(label) {
  const text = text_(label);
  if (text === STATUS_LABELS.achieved || text === 'achieved') return 'achieved';
  if (text === STATUS_LABELS.failed || text === 'failed') return 'failed';
  return 'pending';
}

function measureFromLabel_(label) {
  const text = text_(label);
  if (text === MEASURES.reps) return 'reps';
  if (text === MEASURES.time) return 'time';
  return 'weight';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
