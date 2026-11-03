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
 *   ・日記の「書いた人」「記録の人」、目標の「誰の目標」、日記と目標の「種目」はプルダウンで選べる。
 *
 * 編集タブ
 *   ホームページの「編集」タブからも、合言葉で全部のシートを直せる（getTable / updateRow など）。
 *   消した行は「削除したもの」シートに残り、編集タブから戻せる。
 *
 * 月のまとめ
 *   setupMonthlyTrigger を一度だけ実行すると、毎月1日の朝に先月のまとめが「月のまとめ」シートに入る。
 *   途中経過を見たいときは summarizeThisMonth を実行する（同じ月の行は上書きされる）。
 */

const SHEETS = {
  diary: {
    name: '日記',
    headers: ['日付', '書いた人', 'タイトル', '本文', '種目', '重さ(kg)', '回数', '記録の人', 'ID', '書いた日時', '時間(秒)']
  },
  goals: {
    name: '目標',
    headers: ['月', '誰の目標', '目標', '状態', 'ID', '更新日時', '種目', '目標値']
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
    headers: ['種目', '記録のしかた', 'グラフに出す']
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
  },
  summary: {
    name: '月のまとめ',
    headers: ['月', '日記の数', '活動した日数', 'いちばん書いた人', '自己ベスト', '部の目標', '個人目標', 'ひとこと', '作った日時']
  },
  activity: {
    name: '活動した日',
    headers: ['日付', 'メモ']
  },
  trash: {
    name: '削除したもの',
    headers: ['削除した日時', 'シート', '内容']
  }
};

// 編集タブで直せるシート（並び順は編集タブのボタンの順）
const EDITABLE = ['diary', 'activity', 'goals', 'members', 'lifts', 'schedule', 'weekly', 'trainings', 'info', 'yearly'];
// 編集タブで見せない（自動で入る）列
const HIDDEN_COLUMNS = ['ID', '書いた日時', '更新日時'];
const DATE_COLUMNS = ['日付', '開始日', '終了日'];
const NUMBER_COLUMNS = ['重さ(kg)', '回数', '時間(秒)', '目標値'];
const TEXTAREA_COLUMNS = ['本文', '説明', 'メニュー', '内容'];
const CHECKBOX_COLUMNS = ['グラフに出す'];
// 名前を変えたら、ほかのシートの同じ名前も書き換える
const REFERENCES = {
  members: { header: '名前', targets: [['diary', '書いた人'], ['diary', '記録の人'], ['goals', '誰の目標']] },
  lifts: { header: '種目', targets: [['diary', '種目'], ['goals', '種目']], meter: true }
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
      status: statusFromLabel_(row['状態']),
      lift: text_(row['種目']),
      target: Number(row['目標値']) || 0
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
      measure: measureFromLabel_(row['記録のしかた']),
      showInChart: row['グラフに出す'] === true || /^(true|✓|はい|1)$/i.test(text_(row['グラフに出す']))
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
    })).filter(t => t.name),
    activityDays: readRows_(SHEETS.activity)
      .map(row => ({ date: formatDate_(row['日付']), memo: text_(row['メモ']) }))
      .filter(day => day.date),
    summaries: readRows_(SHEETS.summary).map(row => ({
      period: formatMonth_(row['月']),
      posts: Number(row['日記の数']) || 0,
      days: Number(row['活動した日数']) || 0,
      topWriter: text_(row['いちばん書いた人']),
      records: text_(row['自己ベスト']),
      teamGoals: text_(row['部の目標']),
      personalGoals: text_(row['個人目標']),
      comment: text_(row['ひとこと'])
    })).filter(s => s.period)
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

  // 読むだけの操作は順番待ちしない（編集タブで切り替えを続けて押しても詰まらないように）
  try {
    if (body.action === 'check') return json_({ ok: true });
    if (body.action === 'getTable') return json_(getTable_(body.data || {}));
  } catch (error) {
    return json_({ ok: false, error: String(error.message || error) });
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return json_({ ok: false, error: 'ほかの人が保存中です。少し待ってからもう一度試してください。' });
  try {
    ensureSheets_();
    if (body.action === 'addDiary') return json_(addDiary_(body.data || {}));
    if (body.action === 'addGoals') return json_(addGoals_(body.data || {}));
    if (body.action === 'setGoalStatus') return json_(setGoalStatus_(body.data || {}));
    if (body.action === 'importData') return json_(importData_(body.data || {}));
    if (body.action === 'setActivity') return json_(setActivity_(body.data || {}));
    if (body.action === 'updateRow') return json_(updateRow_(body.data || {}));
    if (body.action === 'addRow') return json_(addRow_(body.data || {}));
    if (body.action === 'deleteRow') return json_(deleteRow_(body.data || {}));
    if (body.action === 'restoreRow') return json_(restoreRow_(body.data || {}));
    return json_({ ok: false, error: '知らない操作です。' });
  } catch (error) {
    return json_({ ok: false, error: String(error.message || error) });
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
  const target = positive_(data.target);
  const lift = target ? clean_(data.lift, 50) : '';
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
      '月': period, '誰の目標': owner, '目標': text, '状態': STATUS_LABELS.pending, 'ID': id, '更新日時': new Date(),
      '種目': lift, '目標値': lift ? target : ''
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

// 「活動した日」を付ける・外す（active: true で付ける、false で外す）
function setActivity_(data) {
  const date = clean_(data.date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: '日付が正しくありません。' };
  const sheet = sheet_(SHEETS.activity);
  const dateCol = column_(sheet, '日付');
  const last = sheet.getLastRow();
  const rows = [];
  if (last > 1) {
    sheet.getRange(2, dateCol, last - 1, 1).getValues().forEach(([value], i) => {
      if (formatDate_(value) === date) rows.push(i + 2);
    });
  }
  if (data.active === false) {
    rows.reverse().forEach(row => sheet.deleteRow(row));
    return { ok: true, active: false };
  }
  if (rows.length === 0) appendObject_(SHEETS.activity, { '日付': date, 'メモ': clean_(data.memo, 200) });
  return { ok: true, active: true };
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

// ---------- 月のまとめ ----------
// 毎月1日に先月の分を作る（setupMonthlyTrigger で時間のトリガーに登録する）
function monthlySummary() {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return summarizeMonth_(Utilities.formatDate(lastMonth, 'Asia/Tokyo', 'yyyy-MM'));
}

// 今月の途中経過を作る（手で実行する用）
function summarizeThisMonth() {
  return summarizeMonth_(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM'));
}

// 一度だけ実行する。何回実行してもトリガーは1つだけになる
function setupMonthlyTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'monthlySummary')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('monthlySummary').timeBased().onMonthDay(1).atHour(6).inTimezone('Asia/Tokyo').create();
  Logger.log('毎月1日の朝6時ごろに、先月のまとめを作るようにしました。');
}

function summarizeMonth_(monthKey) {
  ensureSheets_();
  const measures = new Map(readRows_(SHEETS.lifts).map(row => [text_(row['種目']), measureFromLabel_(row['記録のしかた'])]));
  const posts = readRows_(SHEETS.diary)
    .map(row => ({ ...row, date: formatDate_(row['日付']) }))
    .filter(row => row.date.slice(0, 7) === monthKey && (text_(row['タイトル']) || text_(row['本文'])));

  const writers = new Map();
  posts.forEach(row => {
    const name = text_(row['書いた人']) || '不明';
    writers.set(name, (writers.get(name) || 0) + 1);
  });
  const top = [...writers.entries()].sort((a, b) => b[1] - a[1])[0];
  const days = new Set(posts.map(row => row.date)).size;

  const records = posts
    .filter(row => text_(row['種目']) && (Number(row['重さ(kg)']) || Number(row['回数']) || Number(row['時間(秒)'])))
    .map(row => {
      const lift = text_(row['種目']);
      const weight = Number(row['重さ(kg)']) || 0;
      const reps = Number(row['回数']) || 0;
      const seconds = Number(row['時間(秒)']) || 0;
      const measure = measures.get(lift) || 'weight';
      const value = measure === 'reps' ? `${reps}回`
        : measure === 'time' ? `${seconds}秒`
          : `${weight}kg${reps > 1 ? `×${reps}回` : ''}`;
      return `${text_(row['記録の人']) || text_(row['書いた人']) || '不明'} ${lift} ${value}`;
    });

  const goals = readRows_(SHEETS.goals).filter(row => formatMonth_(row['月']) === monthKey);
  const isTeam = row => !text_(row['誰の目標']) || text_(row['誰の目標']) === '部';
  const goalText = list => {
    if (list.length === 0) return 'なし';
    const achieved = list.filter(row => statusFromLabel_(row['状態']) === 'achieved').length;
    return `${achieved} / ${list.length} 達成`;
  };
  const teamGoals = goals.filter(isTeam);
  const personalGoals = goals.filter(row => !isTeam(row));

  const row = {
    '月': monthKey,
    '日記の数': posts.length,
    '活動した日数': days,
    'いちばん書いた人': top ? `${top[0]}（${top[1]}件）` : '',
    '自己ベスト': records.join('\n'),
    '部の目標': goalText(teamGoals),
    '個人目標': goalText(personalGoals),
    'ひとこと': summaryComment_(days, records.length, teamGoals),
    '作った日時': new Date()
  };

  // 同じ月の行があれば書き換え、なければ足す
  const sheet = sheet_(SHEETS.summary);
  const headers = headersOf_(sheet);
  const values = sheet.getDataRange().getValues();
  const monthCol = headers.indexOf('月');
  for (let r = 1; r < values.length; r++) {
    if (formatMonth_(values[r][monthCol]) === monthKey) {
      sheet.getRange(r + 1, 1, 1, headers.length).setValues([headers.map(h => (h in row ? row[h] : values[r][headers.indexOf(h)]))]);
      Logger.log(`${monthKey} のまとめを書き換えました`);
      return row;
    }
  }
  appendObject_(SHEETS.summary, row);
  Logger.log(`${monthKey} のまとめを作りました`);
  return row;
}

function summaryComment_(days, recordCount, teamGoals) {
  const allTeamAchieved = teamGoals.length > 0 && teamGoals.every(row => statusFromLabel_(row['状態']) === 'achieved');
  if (allTeamAchieved) return '部の目標を全部達成！ 完全勝利 Q.E.D. 💪';
  if (recordCount >= 3) return `自己ベストが ${recordCount} 回も更新された。単調増加が止まらない 📈`;
  if (days >= 8) return `${days} 日も活動した。筋肉の積分値がすごい ∫💪`;
  if (days === 0) return '日記ゼロ。来月は ε > 0 でいいので書こう ✍️';
  if (recordCount > 0) return '自己ベストあり。成長は確かに正の値 ✨';
  return 'コツコツ継続。lim(継続) = 筋肉 🏋️';
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
  set(SHEETS.goals, '種目', lifts);
}

// 「部員」「種目」シートを直したとき
//   ・名前を書き換えた → それを使っている所もまとめて書き換える（一か所直せば全部変わる）
//   ・プルダウンを付け直す
function onEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  const key = Object.keys(REFERENCES).find(k => SHEETS[k].name === sheet.getName());
  if (!key) return;

  const isSingleCell = e.range.getNumRows() === 1 && e.range.getNumColumns() === 1
    && e.range.getColumn() === column_(sheet, REFERENCES[key].header) && e.range.getRow() > 1;
  const oldValue = String(e.oldValue || '').trim();
  const newValue = String(e.value || '').trim();
  if (isSingleCell && oldValue && newValue && oldValue !== newValue) {
    const count = renameReferences_(key, oldValue, newValue);
    SpreadsheetApp.getActiveSpreadsheet().toast(`「${oldValue}」を「${newValue}」に ${count} か所書き換えました`, '名前の変更');
  }
  refreshDropdowns_();
}

function renameReferences_(key, oldValue, newValue) {
  const ref = REFERENCES[key];
  let count = 0;
  const replace = value => (normalize_(value) === normalize_(oldValue) ? newValue : value);
  ref.targets.forEach(([target, header]) => { count += mapColumn_(SHEETS[target], header, replace); });
  if (ref.meter) {
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
  return count;
}

// ---------- 編集タブ用 ----------
function editableDef_(key) {
  if (!EDITABLE.includes(key) && key !== 'trash') throw new Error('そのシートは編集できません。');
  return SHEETS[key];
}

// 列ごとの入力のしかた（プルダウンの選択肢など）
function columnInfo_(key, headers) {
  const names = readRows_(SHEETS.members).map(row => text_(row['名前'])).filter(Boolean);
  const lifts = readRows_(SHEETS.lifts).map(row => text_(row['種目'])).filter(Boolean);
  const options = {
    diary: { '書いた人': names, '記録の人': names, '種目': lifts },
    goals: { '誰の目標': ['部', ...names], '状態': Object.values(STATUS_LABELS), '種目': lifts },
    lifts: { '記録のしかた': Object.values(MEASURES) },
    yearly: { '種類': YEARLY_KINDS }
  }[key] || {};
  return headers.map(name => {
    let type = 'text';
    if (DATE_COLUMNS.includes(name)) type = 'date';
    else if (name === '月') type = 'month';
    else if (NUMBER_COLUMNS.includes(name)) type = 'number';
    else if (TEXTAREA_COLUMNS.includes(name)) type = 'textarea';
    else if (CHECKBOX_COLUMNS.includes(name)) type = 'checkbox';
    else if (options[name]) type = 'select';
    return { name, type, options: options[name] || null, hidden: HIDDEN_COLUMNS.includes(name) };
  });
}

// セルの値を、編集タブで見せる形（文字か true/false）にする
function displayValue_(header, value) {
  if (value === true || value === false) return value;
  if (value instanceof Date) {
    if (header === '月') return Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy-MM');
    if (header === '時間') return Utilities.formatDate(value, 'Asia/Tokyo', 'H:mm');
    if (DATE_COLUMNS.includes(header)) return Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy-MM-dd');
    return Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  }
  return value == null ? '' : String(value);
}

function rowValues_(sheet, rowNumber, headers) {
  const values = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  const obj = {};
  headers.forEach((h, i) => { obj[h] = displayValue_(h, values[i]); });
  return obj;
}

function getTable_(data) {
  const key = String(data.sheet || '');
  const def = editableDef_(key);
  const sheet = sheet_(def);
  const headers = headersOf_(sheet);
  const last = sheet.getLastRow();
  const values = last > 1 ? sheet.getRange(2, 1, last - 1, headers.length).getValues() : [];
  const rows = values
    .map((row, index) => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = displayValue_(h, row[i]); });
      return { row: index + 2, values: obj };
    })
    .filter(r => headers.some(h => r.values[h] !== '' && r.values[h] !== false));
  return { ok: true, sheet: key, name: def.name, columns: columnInfo_(key, headers), rows };
}

// 編集タブから来た値を、セルに入れる値にする
function cellValue_(column, value) {
  if (column.type === 'checkbox') return value === true || value === 'true';
  const text = clean_(value, MAX_TEXT);
  if (column.type === 'number') return text === '' ? '' : (Number(text) || '');
  return text;
}

// 読み込んだあとに誰かが同じ行を変えていたら、上書きしない
function assertUnchanged_(sheet, rowNumber, headers, before) {
  if (!(rowNumber >= 2) || rowNumber > sheet.getLastRow()) throw new Error('その行が見つかりませんでした。読み込み直してください。');
  const current = rowValues_(sheet, rowNumber, headers);
  const changed = headers.some(h => before && h in before && String(current[h]) !== String(before[h]));
  if (changed) throw new Error('ほかの人が先にこの行を変えました。読み込み直してから、もう一度直してください。');
  return current;
}

function updateRow_(data) {
  const key = String(data.sheet || '');
  const def = editableDef_(key);
  if (key === 'trash') throw new Error('「削除したもの」は直せません。戻してから直してください。');
  const sheet = sheet_(def);
  const headers = headersOf_(sheet);
  const columns = columnInfo_(key, headers);
  const rowNumber = Number(data.row);
  const before = assertUnchanged_(sheet, rowNumber, headers, data.before);
  const original = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  const values = data.values || {};

  const next = headers.map((h, i) => {
    if (columns[i].hidden || !(h in values)) return original[i];
    return cellValue_(columns[i], values[h]);
  });
  if (headers.includes('更新日時')) next[headers.indexOf('更新日時')] = new Date();
  sheet.getRange(rowNumber, 1, 1, headers.length).setValues([next]);

  let renamed = 0;
  const ref = REFERENCES[key];
  if (ref) {
    const oldName = text_(before[ref.header]);
    const newName = text_(next[headers.indexOf(ref.header)]);
    if (oldName && newName && oldName !== newName) renamed = renameReferences_(key, oldName, newName);
    refreshDropdowns_();
  }
  return { ok: true, renamed };
}

function addRow_(data) {
  const key = String(data.sheet || '');
  const def = editableDef_(key);
  if (key === 'trash') throw new Error('「削除したもの」には足せません。');
  const sheet = sheet_(def);
  const headers = headersOf_(sheet);
  const columns = columnInfo_(key, headers);
  const obj = {};
  headers.forEach((h, i) => {
    if (h === 'ID') obj[h] = Utilities.getUuid();
    else if (h === '書いた日時' || h === '更新日時') obj[h] = new Date();
    else if (!columns[i].hidden) obj[h] = cellValue_(columns[i], (data.values || {})[h]);
  });
  if (headers.includes('状態') && !obj['状態']) obj['状態'] = STATUS_LABELS.pending;
  appendObject_(def, obj);
  if (REFERENCES[key]) refreshDropdowns_();
  return { ok: true };
}

// 消した行は「削除したもの」シートに残す
function deleteRow_(data) {
  const key = String(data.sheet || '');
  const def = editableDef_(key);
  if (key === 'trash') throw new Error('「削除したもの」は戻すか、スプレッドシートで消してください。');
  const sheet = sheet_(def);
  const headers = headersOf_(sheet);
  const rowNumber = Number(data.row);
  const current = assertUnchanged_(sheet, rowNumber, headers, data.before);
  appendObject_(SHEETS.trash, { '削除した日時': new Date(), 'シート': def.name, '内容': JSON.stringify(current) });
  sheet.deleteRow(rowNumber);
  if (REFERENCES[key]) refreshDropdowns_();
  return { ok: true };
}

// 「削除したもの」の行を、元のシートに戻す
function restoreRow_(data) {
  const sheet = sheet_(SHEETS.trash);
  const headers = headersOf_(sheet);
  const rowNumber = Number(data.row);
  const current = assertUnchanged_(sheet, rowNumber, headers, data.before);
  const key = Object.keys(SHEETS).find(k => SHEETS[k].name === current['シート']);
  if (!key || !EDITABLE.includes(key)) throw new Error('戻す先のシートが見つかりませんでした。');
  const values = JSON.parse(current['内容']);
  const target = sheet_(SHEETS[key]);
  target.appendRow(headersOf_(target).map(h => {
    const value = h in values ? values[h] : '';
    return CHECKBOX_COLUMNS.includes(h) ? value === true || value === 'true' : value;
  }));
  sheet.deleteRow(rowNumber);
  if (REFERENCES[key]) refreshDropdowns_();
  return { ok: true, sheet: key };
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

    // 「グラフに出す」はチェックボックス。列ができたときは今ある種目を全部チェックしておく
    if (key === 'lifts' && !props.getProperty('checkbox_lifts')) {
      props.setProperty('checkbox_lifts', '1');
      const col = column_(sheet, 'グラフに出す');
      sheet.getRange(2, col, 999, 1).insertCheckboxes();
      const last = sheet.getLastRow();
      if (last > 1) {
        const names = sheet.getRange(2, column_(sheet, '種目'), last - 1, 1).getValues();
        sheet.getRange(2, col, last - 1, 1).setValues(names.map(([name]) => [Boolean(text_(name))]));
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
