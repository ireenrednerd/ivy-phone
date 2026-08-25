import { extension_settings, getContext, saveMetadataDebounced } from '../../../extensions.js';
import { saveSettingsDebounced, eventSource, event_types, chat_metadata } from '../../../../script.js';

const MODULE = 'ivy_phone';

const DEFAULTS = {
    enabled: true,
    hideMarkers: true,
    autoOpenOnCall: true,
    autoTrigger: false,
    autoPhotos: false,
    imageCommand: '/sd quiet=true {{prompt}}',
    timeMacro: '',
    dateMacro: '',
    carrier: 'AT&T',
    ownerLabel: 'Я',
};

// ---------------------------------------------------------------- settings

function settings() {
    if (!extension_settings[MODULE]) extension_settings[MODULE] = {};
    for (const [k, v] of Object.entries(DEFAULTS)) {
        if (extension_settings[MODULE][k] === undefined) extension_settings[MODULE][k] = v;
    }
    return extension_settings[MODULE];
}

// ---------------------------------------------------------------- storage
// Всё состояние телефона живёт в chat_metadata → своя история у каждого чата,
// переживает перезагрузку, уезжает вместе с экспортом чата.

function store() {
    if (!chat_metadata[MODULE]) {
        chat_metadata[MODULE] = { version: 1, contacts: {}, events: [], time: '', date: '' };
    }
    const s = chat_metadata[MODULE];
    if (!s.contacts) s.contacts = {};
    if (!s.events) s.events = [];
    return s;
}

const save = () => saveMetadataDebounced();

function keyOf(name) {
    return String(name || '').trim().toLowerCase();
}

function contact(name, patch) {
    const s = store();
    const k = keyOf(name);
    if (!k) return null;
    if (!s.contacts[k]) {
        s.contacts[k] = { key: k, name: String(name).trim(), number: '', handle: '', anchor: '', color: '' };
    }
    if (patch) Object.assign(s.contacts[k], patch);
    return s.contacts[k];
}

let uid = 0;
function addEvent(data) {
    const s = store();
    const ev = Object.assign({
        id: `${Date.now()}_${uid++}`,
        mesId: null,
        type: 'sms',
        dir: 'in',
        from: '',
        text: '',
        prompt: '',
        image: '',
        state: '',
        status: '',
        dur: '',
        ts: Date.now(),
        stamp: gameClock(),
        read: false,
    }, data);
    if (ev.dir === 'out') ev.read = true;
    contact(ev.from);
    s.events.push(ev);
    return ev;
}

function purgeMessage(mesId, andAfter = false) {
    const s = store();
    const before = s.events.length;
    s.events = s.events.filter(e => (andAfter ? !(e.mesId >= mesId) : e.mesId !== mesId));
    if (s.events.length !== before) { save(); render(); }
}

function unreadCount() {
    return store().events.filter(e => !e.read && e.dir === 'in').length;
}

// ---------------------------------------------------------------- parser
//
//   [PHONE]
//   SMS|Cody|Ты где?
//   SMS|Cody|Уже еду|out
//   PHOTO|Cody|wet neon street at night|Дождь опять
//   CALL|Arthur|incoming
//   CALL|Arthur|missed
//   CALL|Arthur|ended|4:12
//   VOICE|Cody|0:23
//   CONTACT|Cody Johnson|+1 206 555 0114|@codyj
//   [/PHONE]

const BLOCK_RE = /\[PHONE\]([\s\S]*?)\[\/PHONE\]/gi;

function parseBlocks(text, mesId) {
    if (!text) return [];
    const made = [];
    let m;
    BLOCK_RE.lastIndex = 0;
    while ((m = BLOCK_RE.exec(text)) !== null) {
        const raw = m[1].split('\n').map(l => l.trim()).filter(Boolean);
        // TIME и CONTACT первыми: остальные события должны получить уже новое время
        const lines = [
            ...raw.filter(l => /^(TIME|CONTACT)\b/i.test(l)),
            ...raw.filter(l => !/^(TIME|CONTACT)\b/i.test(l)),
        ];
        for (const line of lines) {
            const ev = parseLine(line, mesId);
            if (ev) made.push(ev);
        }
    }
    return made;
}

function parseLine(line, mesId) {
    const parts = line.split('|').map(p => p.trim());
    const verb = (parts.shift() || '').toUpperCase();

    let dir = 'in';
    if (parts.length && ['out', 'in'].includes(parts[parts.length - 1].toLowerCase())) {
        dir = parts.pop().toLowerCase();
    }

    const from = parts.shift() || '';
    if (!from) return null;

    switch (verb) {
        case 'SMS':
        case 'MSG':
            return addEvent({ mesId, type: 'sms', dir, from, text: parts.join('|') });

        case 'PHOTO':
        case 'IMG':
            return addEvent({
                mesId, type: 'photo', dir, from,
                prompt: parts.shift() || '',
                text: parts.join('|'),
                state: 'idle',
            });

        case 'VOICE':
            return addEvent({ mesId, type: 'voice', dir, from, dur: parts.shift() || '0:07' });

        case 'CALL': {
            const status = (parts.shift() || 'incoming').toLowerCase();
            return addEvent({ mesId, type: 'call', dir, from, status, dur: parts.shift() || '' });
        }

        case 'TIME': {
            const s = store();
            s.time = from;
            const d = parts.shift();
            if (d) s.date = d;
            save();
            return null;
        }

        case 'CONTACT':
            contact(from, { number: parts.shift() || '', handle: parts.shift() || '' });
            save();
            return null;

        case 'READ': {
            const k = keyOf(from);
            store().events.forEach(e => { if (keyOf(e.from) === k) e.read = true; });
            return null;
        }

        default:
            return null;
    }
}

// ---------------------------------------------------------------- images

async function runSlash(cmd) {
    const ctx = getContext();
    try {
        if (typeof ctx.executeSlashCommandsWithOptions === 'function') {
            return await ctx.executeSlashCommandsWithOptions(cmd, { showOutput: false, handleParserErrors: true });
        }
        if (typeof ctx.executeSlashCommands === 'function') {
            return await ctx.executeSlashCommands(cmd);
        }
    } catch (err) {
        console.error('[IVY Phone] slash failed:', cmd, err);
    }
    return null;
}

function extractUrl(result) {
    const pipe = result?.pipe ?? result;
    if (typeof pipe !== 'string') return '';
    const hit = pipe.match(/(https?:\/\/\S+|\/?user\/images\/\S+|\/?scripts\/extensions\/\S+\.(?:png|jpe?g|webp))/i);
    return hit ? hit[0].replace(/["')\]]+$/, '') : '';
}

async function generatePhoto(ev) {
    if (!ev || ev.state === 'pending') return;
    const c = contact(ev.from);
    const prompt = [c?.anchor, ev.prompt].filter(Boolean).join(', ');
    const cmd = settings().imageCommand.replace('{{prompt}}', prompt);

    ev.state = 'pending';
    render();

    const url = extractUrl(await runSlash(cmd));
    if (url) { ev.image = url; ev.state = 'done'; }
    else { ev.state = 'error'; }
    save();
    render();
}

// ---------------------------------------------------------------- hiding

function scrubText(html) {
    return html.replace(BLOCK_RE, '').replace(/<p>\s*<\/p>/g, '');
}

function scrubMessage(el) {
    if (!settings().hideMarkers || !el) return;
    const body = el.querySelector('.mes_text');
    if (!body || !/\[PHONE\]/i.test(body.innerHTML)) return;
    body.innerHTML = scrubText(body.innerHTML);
}

function scrubAll() {
    if (!settings().hideMarkers) return;
    document.querySelectorAll('#chat .mes').forEach(scrubMessage);
}

// ---------------------------------------------------------------- icons
// Встроенные SVG вместо Font Awesome: не зависят от версии FA в таверне
// и от того, платная иконка или бесплатная.

const ICONS = {
    device: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.4"/><line x1="10.2" y1="18.6" x2="13.8" y2="18.6"/>',
    wifi: '<path d="M1.8 8.4a15.5 15.5 0 0 1 20.4 0" stroke-width="2"/><path d="M5.4 12.2a10.3 10.3 0 0 1 13.2 0" stroke-width="2"/><path d="M8.9 15.9a5.2 5.2 0 0 1 6.2 0" stroke-width="2"/><circle cx="12" cy="19.6" r="1.3" fill="currentColor" stroke="none"/>',
    battery: '<rect x="1.5" y="7.5" width="17.5" height="9" rx="2.6" stroke-width="1.6"/><path d="M21.3 10.6v2.8" stroke-width="2.2"/><rect x="3.4" y="9.4" width="10.5" height="5.2" rx="1.4" fill="currentColor" stroke="none"/>',
    image: '<rect x="3" y="4.5" width="18" height="15" rx="2.4"/><circle cx="8.6" cy="9.8" r="1.7"/><path d="M3.4 17.2 8.9 12l4 3.6 3.2-2.6 4.5 4.2"/>',
    refresh: '<path d="M20.2 11.4a8.3 8.3 0 1 1-2.4-5.6"/><polyline points="20.6,3.6 20.6,9 15.2,9"/>',
    chevronLeft: '<polyline points="14.5,4.8 8,12 14.5,19.2"/>',
    info: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11.2" x2="12" y2="16.6"/><circle cx="12" cy="7.7" r="1" fill="currentColor" stroke="none"/>',
    plus: '<line x1="12" y1="5.2" x2="12" y2="18.8"/><line x1="5.2" y1="12" x2="18.8" y2="12"/>',
    close: '<line x1="6.2" y1="6.2" x2="17.8" y2="17.8"/><line x1="17.8" y1="6.2" x2="6.2" y2="17.8"/>',
    message: '<path d="M20.6 12.2c0 3.9-3.8 7.1-8.5 7.1-1 0-2-.15-2.9-.42L4.2 20.6l1.4-3.6c-1.3-1.3-2.1-3-2.1-4.8 0-3.9 3.8-7.1 8.5-7.1s8.6 3.2 8.6 7.1Z"/>',
    messageOff: '<path d="M20.6 12.2c0 3.9-3.8 7.1-8.5 7.1-1 0-2-.15-2.9-.42L4.2 20.6l1.4-3.6c-1.3-1.3-2.1-3-2.1-4.8 0-3.9 3.8-7.1 8.5-7.1s8.6 3.2 8.6 7.1Z"/><line x1="3.4" y1="20.8" x2="20.6" y2="3.6"/>',
    user: '<circle cx="12" cy="8.4" r="3.7"/><path d="M4.9 20c.9-3.5 3.6-5.5 7.1-5.5s6.2 2 7.1 5.5"/>',
    phone: '<path d="M7 3.6h3l1.5 4-2 1.5a12 12 0 0 0 5.4 5.4l1.5-2 4 1.5v3a1.6 1.6 0 0 1-1.8 1.6C11.3 18 6 12.7 5.4 5.4A1.6 1.6 0 0 1 7 3.6Z"/>',
    phoneOff: '<path d="M7 3.6h3l1.5 4-2 1.5a12 12 0 0 0 5.4 5.4l1.5-2 4 1.5v3a1.6 1.6 0 0 1-1.8 1.6C11.3 18 6 12.7 5.4 5.4A1.6 1.6 0 0 1 7 3.6Z"/><line x1="3.2" y1="20.8" x2="20.8" y2="3.2"/>',
    arrowUp: '<line x1="12" y1="19" x2="12" y2="5.4"/><polyline points="6.4,10.9 12,5.3 17.6,10.9"/>',
    arrowDown: '<line x1="12" y1="5" x2="12" y2="18.6"/><polyline points="6.4,13.1 12,18.7 17.6,13.1"/>',
    play: '<polygon points="8,5.6 18.6,12 8,18.4" fill="currentColor" stroke="none"/>',
    spinner: '<path d="M12 3.4a8.6 8.6 0 1 0 8.6 8.6"/>',
};

function icon(name, extra = '') {
    return `<svg class="ivyph-i ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

// ---------------------------------------------------------------- UI shell

let ui = null;
let screen = { name: 'home', arg: null };

function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
}

function esc(s) {
    return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function clock(ts) {
    const d = new Date(ts || Date.now());
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Время внутри игры. Приоритет: маркер TIME → макрос из настроек → реальные часы.
function fromMacro(tpl) {
    if (!tpl || !tpl.trim()) return '';
    try {
        const out = String(getContext().substituteParams(tpl) || '').trim();
        return out && !out.includes('{{') ? out : '';
    } catch { return ''; }
}

function gameClock() {
    return store().time || fromMacro(settings().timeMacro) || clock();
}

function gameDate() {
    return store().date || fromMacro(settings().dateMacro) || '';
}

function stampOf(e) {
    return e.stamp || clock(e.ts);
}

function buildShell() {
    if (ui) return;

    const launcher = el('div', 'ivyph-launcher');
    launcher.title = 'Телефон';
    launcher.innerHTML = `<div class="ivyph-launcher-glyph">${icon('device')}</div><span class="ivyph-badge" hidden>0</span>`;
    launcher.addEventListener('click', () => togglePhone());
    document.body.appendChild(launcher);

    const overlay = el('div', 'ivyph-overlay');
    overlay.hidden = true;
    overlay.innerHTML = `
        <div class="ivyph-scrim"></div>
        <div class="ivyph-device" role="dialog" aria-label="Телефон">
            <div class="ivyph-status">
                <span class="ivyph-carrier"></span>
                <span class="ivyph-clock"></span>
                <span class="ivyph-meta">${icon('wifi')}${icon('battery')}<button class="ivyph-close" title="Закрыть">${icon('close')}</button></span>
            </div>
            <div class="ivyph-screen"></div>
            <div class="ivyph-dock">
                <button class="ivyph-dock-btn" data-go="home">${icon('message')}<span>Сообщения</span></button>
                <button class="ivyph-dock-btn" data-go="contacts">${icon('user')}<span>Контакты</span></button>
                <button class="ivyph-dock-btn" data-go="log">${icon('phone')}<span>Звонки</span></button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('.ivyph-scrim').addEventListener('click', () => togglePhone(false));
    overlay.querySelector('.ivyph-close').addEventListener('click', () => togglePhone(false));
    overlay.querySelectorAll('.ivyph-dock-btn').forEach(b => {
        b.addEventListener('click', () => go(b.dataset.go));
    });

    ui = { launcher, overlay, screen: overlay.querySelector('.ivyph-screen') };
}

function togglePhone(force) {
    buildShell();
    const open = force === undefined ? ui.overlay.hidden : force;
    ui.overlay.hidden = !open;
    document.body.classList.toggle('ivyph-open', open);
    if (open) render();
}

function go(name, arg) {
    screen = { name, arg: arg ?? null };
    render();
}

// ---------------------------------------------------------------- screens

function threads() {
    const map = new Map();
    for (const e of store().events) {
        if (e.type === 'call') continue;
        const k = keyOf(e.from);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(e);
    }
    return [...map.entries()]
        .map(([k, list]) => ({ k, c: contact(list[0].from), list, last: list[list.length - 1] }))
        .sort((a, b) => b.last.ts - a.last.ts);
}

function preview(e) {
    if (e.type === 'photo') return '📷 Фото';
    if (e.type === 'voice') return `🎤 Голосовое ${e.dur}`;
    return e.text;
}

function renderHome() {
    const list = threads();
    if (!list.length) {
        return headTitle('Сообщения') + `<div class="ivyph-empty">
            ${icon('messageOff')}
            <p>Пока ни одной переписки.</p>
            <small>Сообщения появятся, когда персонаж напишет в чате.</small>
        </div>`;
    }
    return headTitle('Сообщения') + `<ul class="ivyph-list">` + list.map(t => {
        const un = t.list.filter(e => !e.read && e.dir === 'in').length;
        return `<li class="ivyph-row" data-thread="${esc(t.k)}">
            <span class="ivyph-avatar" style="--tint:${esc(t.c?.color || '#3d4a55')}">${esc((t.c?.name || '?')[0].toUpperCase())}</span>
            <span class="ivyph-row-body">
                <span class="ivyph-row-top"><b>${esc(t.c?.name || t.k)}</b><time>${esc(stampOf(t.last))}</time></span>
                <span class="ivyph-row-sub">${esc(preview(t.last))}</span>
            </span>
            ${un ? `<span class="ivyph-dot">${un}</span>` : ''}
        </li>`;
    }).join('') + `</ul>`;
}

function renderThread(k) {
    const c = contact(k) || { name: k };
    const list = store().events.filter(e => keyOf(e.from) === keyOf(k) && e.type !== 'call');
    list.forEach(e => { e.read = true; });
    save();

    const bubbles = list.map(e => {
        let inner = '';
        if (e.type === 'photo') {
            if (e.image) {
                inner = `<img class="ivyph-photo" src="${esc(e.image)}" alt="${esc(e.text || 'фото')}">`;
            } else if (e.state === 'pending') {
                inner = `<span class="ivyph-shot ivyph-shot-busy">${icon('spinner', 'ivyph-spin')} Генерирую…</span>`;
            } else {
                inner = `<span class="ivyph-shot">
                    <span class="ivyph-shot-desc">${icon('image')}<i>${esc(e.prompt || 'фото без описания')}</i></span>
                    <button class="ivyph-shot-btn" data-gen="${esc(e.id)}">
                        ${e.state === 'error' ? icon('refresh') + ' Ещё раз' : icon('image') + ' Сгенерировать'}
                    </button>
                    ${e.state === 'error' ? '<span class="ivyph-shot-err">Команда не вернула картинку</span>' : ''}
                </span>`;
            }
            if (e.text) inner += `<span class="ivyph-cap">${esc(e.text)}</span>`;
        } else if (e.type === 'voice') {
            inner = `<span class="ivyph-voice">${icon('play')}<span class="ivyph-wave"></span><time>${esc(e.dur)}</time></span>`;
        } else {
            inner = esc(e.text);
        }
        return `<div class="ivyph-bub ivyph-${e.dir}">${inner}<time>${esc(stampOf(e))}</time></div>`;
    }).join('');

    return `<div class="ivyph-head ivyph-head-nav">
            <button class="ivyph-back" data-go="home">${icon('chevronLeft')}</button>
            <span>${esc(c.name)}</span>
            <button class="ivyph-icon-btn" data-card="${esc(keyOf(k))}">${icon('info')}</button>
        </div>
        <div class="ivyph-thread">${bubbles}</div>
        <div class="ivyph-compose">
            <textarea rows="1" placeholder="Написать ${esc(c.name)}…"></textarea>
            <button class="ivyph-send" data-send="${esc(keyOf(k))}">${icon('arrowUp')}</button>
        </div>`;
}

function renderContacts() {
    const cs = Object.values(store().contacts);
    const rows = cs.length ? cs.map(c => `<li class="ivyph-row" data-card="${esc(c.key)}">
            <span class="ivyph-avatar" style="--tint:${esc(c.color || '#3d4a55')}">${esc(c.name[0].toUpperCase())}</span>
            <span class="ivyph-row-body">
                <span class="ivyph-row-top"><b>${esc(c.name)}</b></span>
                <span class="ivyph-row-sub">${esc(c.number || c.handle || 'номер не записан')}</span>
            </span>
        </li>`).join('') : `<li class="ivyph-empty-row">Контактов пока нет.</li>`;

    return `<div class="ivyph-head ivyph-head-nav">
            <span>Контакты</span>
            <button class="ivyph-icon-btn" data-card="__new__">${icon('plus')}</button>
        </div>
        <ul class="ivyph-list">${rows}</ul>`;
}

function renderCard(k) {
    const isNew = k === '__new__';
    const c = isNew ? { name: '', number: '', handle: '', anchor: '', color: '#3d4a55' } : (contact(k) || {});
    return `<div class="ivyph-head ivyph-head-nav">
            <button class="ivyph-back" data-go="contacts">${icon('chevronLeft')}</button>
            <span>${isNew ? 'Новый контакт' : esc(c.name)}</span>
        </div>
        <div class="ivyph-form" data-key="${esc(isNew ? '' : c.key)}">
            <label>Имя<input data-f="name" value="${esc(c.name)}" placeholder="Cody Johnson"></label>
            <label>Номер<input data-f="number" value="${esc(c.number)}" placeholder="+1 206 555 0114"></label>
            <label>Ник<input data-f="handle" value="${esc(c.handle)}" placeholder="@codyj"></label>
            <label>Якорь внешности<textarea data-f="anchor" rows="3" placeholder="Описание для генерации фото">${esc(c.anchor)}</textarea></label>
            <label>Цвет<input type="color" data-f="color" value="${esc(c.color || '#3d4a55')}"></label>
            <div class="ivyph-form-actions">
                <button class="ivyph-primary" data-save-card>Сохранить</button>
                ${isNew ? '' : '<button class="ivyph-danger" data-del-card>Удалить</button>'}
            </div>
        </div>`;
}

function renderLog() {
    const calls = store().events.filter(e => e.type === 'call').slice().reverse();
    if (!calls.length) return `<div class="ivyph-empty">${icon('phoneOff')}<p>Звонков не было.</p></div>`;
    const glyph = { missed: 'phoneOff', declined: 'phoneOff', incoming: 'arrowDown', outgoing: 'arrowUp' };
    return headTitle('Звонки') + `<ul class="ivyph-list">` + calls.map(e => `
        <li class="ivyph-row ivyph-call-row ${e.status === 'missed' || e.status === 'declined' ? 'ivyph-missed' : ''}">
            <span class="ivyph-avatar" style="--tint:${esc(contact(e.from)?.color || '#3d4a55')}">${esc((e.from || '?')[0].toUpperCase())}</span>
            <span class="ivyph-row-body">
                <span class="ivyph-row-top"><b>${esc(e.from)}</b><time>${esc(stampOf(e))}</time></span>
                <span class="ivyph-row-sub">${icon(glyph[e.status] || 'phone')} ${esc(statusWord(e))}</span>
            </span>
        </li>`).join('') + `</ul>`;
}

function headTitle(title) {
    const d = gameDate();
    return `<div class="ivyph-head"><span class="ivyph-title">${esc(title)}${d ? `<small>${esc(d)}</small>` : ''}</span></div>`;
}

function statusWord(e) {
    const map = { incoming: 'Входящий', outgoing: 'Исходящий', missed: 'Пропущенный', declined: 'Сброшен', answered: 'Отвечен', ended: 'Завершён' };
    return (map[e.status] || e.status) + (e.dur ? ` · ${e.dur}` : '');
}

function renderCall(ev) {
    const c = contact(ev.from) || { name: ev.from };
    return `<div class="ivyph-callscreen">
            <div class="ivyph-call-label">входящий вызов</div>
            <div class="ivyph-call-avatar" style="--tint:${esc(c.color || '#3d4a55')}">${esc((c.name || '?')[0].toUpperCase())}</div>
            <div class="ivyph-call-name">${esc(c.name)}</div>
            <div class="ivyph-call-number">${esc(c.number || 'номер скрыт')}</div>
            <div class="ivyph-call-actions">
                <button class="ivyph-call-btn ivyph-decline" data-call="declined"><span class="ivyph-call-circle">${icon('phoneOff')}</span><span>Сбросить</span></button>
                <button class="ivyph-call-btn ivyph-accept" data-call="answered"><span class="ivyph-call-circle">${icon('phone')}</span><span>Ответить</span></button>
            </div>
        </div>`;
}

// ---------------------------------------------------------------- render

function render() {
    if (!ui) return;

    const n = unreadCount();
    const badge = ui.launcher.querySelector('.ivyph-badge');
    badge.hidden = n === 0;
    badge.textContent = n > 99 ? '99+' : String(n);
    ui.launcher.classList.toggle('ivyph-has-unread', n > 0);

    if (ui.overlay.hidden) return;

    ui.overlay.querySelector('.ivyph-carrier').textContent = settings().carrier;
    ui.overlay.querySelector('.ivyph-clock').textContent = gameClock();

    const ringing = store().events.find(e => e.type === 'call' && e.status === 'incoming' && !e.read);
    let html;
    if (ringing && screen.name !== 'silenced') { html = renderCall(ringing); screen.arg = ringing.id; }
    else if (screen.name === 'thread') html = renderThread(screen.arg);
    else if (screen.name === 'contacts') html = renderContacts();
    else if (screen.name === 'card') html = renderCard(screen.arg);
    else if (screen.name === 'log') html = renderLog();
    else html = renderHome();

    ui.overlay.classList.toggle('ivyph-ringing', !!ringing);
    ui.screen.innerHTML = html;
    wire();

    const thread = ui.screen.querySelector('.ivyph-thread');
    if (thread) thread.scrollTop = thread.scrollHeight;
}

function wire() {
    const s = ui.screen;

    s.querySelectorAll('[data-thread]').forEach(n => n.addEventListener('click', () => go('thread', n.dataset.thread)));
    s.querySelectorAll('[data-card]').forEach(n => n.addEventListener('click', () => go('card', n.dataset.card)));
    s.querySelectorAll('[data-go]').forEach(n => n.addEventListener('click', () => go(n.dataset.go)));

    s.querySelectorAll('[data-call]').forEach(n => n.addEventListener('click', () => {
        const ev = store().events.find(e => e.id === screen.arg);
        if (ev) { ev.read = true; ev.status = n.dataset.call; }
        save();
        go('log');
    }));

    s.querySelectorAll('[data-gen]').forEach(n => n.addEventListener('click', e => {
        e.stopPropagation();
        generatePhoto(store().events.find(x => x.id === n.dataset.gen));
    }));

    const send = s.querySelector('[data-send]');
    if (send) {
        const box = s.querySelector('.ivyph-compose textarea');
        const fire = () => {
            const text = box.value.trim();
            if (!text) return;
            box.value = '';
            sendFromPhone(send.dataset.send, text);
        };
        send.addEventListener('click', fire);
        box.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); fire(); }
        });
    }

    const saveBtn = s.querySelector('[data-save-card]');
    if (saveBtn) saveBtn.addEventListener('click', () => {
        const form = s.querySelector('.ivyph-form');
        const patch = {};
        form.querySelectorAll('[data-f]').forEach(f => { patch[f.dataset.f] = f.value.trim(); });
        if (!patch.name) return;
        const existing = form.dataset.key;
        if (existing && keyOf(patch.name) !== existing) delete store().contacts[existing];
        contact(patch.name, patch);
        save();
        go('contacts');
    });

    const delBtn = s.querySelector('[data-del-card]');
    if (delBtn) delBtn.addEventListener('click', () => {
        delete store().contacts[s.querySelector('.ivyph-form').dataset.key];
        save();
        go('contacts');
    });
}

// ---------------------------------------------------------------- outgoing

async function sendFromPhone(k, text) {
    const ctx = getContext();
    const c = contact(k) || { name: k };
    const marker = `[PHONE]\nSMS|${c.name}|${text}|out\n[/PHONE]`;

    const message = {
        name: ctx.name1,
        is_user: true,
        is_system: false,
        send_date: typeof ctx.getMessageTimeStamp === 'function' ? ctx.getMessageTimeStamp() : new Date().toISOString(),
        mes: marker,
        extra: {},
    };

    ctx.chat.push(message);
    ctx.addOneMessage(message);
    await ctx.saveChat();

    addEvent({ mesId: ctx.chat.length - 1, type: 'sms', dir: 'out', from: c.name, text });
    save();
    render();
    scrubAll();

    if (settings().autoTrigger) await runSlash('/trigger');
}

// ---------------------------------------------------------------- events

function ingest(mesId) {
    if (!settings().enabled) return;
    const ctx = getContext();
    const msg = ctx.chat?.[mesId];
    if (!msg || msg.is_user) return;

    purgeMessage(mesId);
    const made = parseBlocks(msg.mes, mesId);
    if (!made.length) return;

    save();
    render();
    setTimeout(scrubAll, 0);

    if (settings().autoPhotos) made.filter(e => e.type === 'photo').forEach(generatePhoto);

    const call = made.find(e => e.type === 'call' && e.status === 'incoming');
    if (call && settings().autoOpenOnCall) togglePhone(true);
}

function rebuildFromChat() {
    const ctx = getContext();
    const s = store();
    if (s.events.length || !ctx.chat) return;
    ctx.chat.forEach((m, i) => { if (!m.is_user) parseBlocks(m.mes, i); });
    if (s.events.length) { s.events.forEach(e => { e.read = true; }); save(); }
}

function init() {
    settings();
    buildShell();

    eventSource.on(event_types.MESSAGE_RECEIVED, ingest);
    eventSource.on(event_types.MESSAGE_UPDATED, ingest);
    eventSource.on(event_types.MESSAGE_SWIPED, id => purgeMessage(id));
    eventSource.on(event_types.MESSAGE_DELETED, id => purgeMessage(id, true));

    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, () => setTimeout(scrubAll, 0));
    eventSource.on(event_types.USER_MESSAGE_RENDERED, () => setTimeout(scrubAll, 0));

    eventSource.on(event_types.CHAT_CHANGED, () => {
        screen = { name: 'home', arg: null };
        rebuildFromChat();
        render();
        setTimeout(scrubAll, 100);
    });

    try {
        getContext().registerSlashCommand?.('phone', () => { togglePhone(true); return ''; }, [], 'открыть телефон', true, true);
    } catch { /* необязательно */ }

    buildSettingsPanel();
    setInterval(() => { if (ui && !ui.overlay.hidden) ui.overlay.querySelector('.ivyph-clock').textContent = gameClock(); }, 20000);
    setTimeout(() => { rebuildFromChat(); render(); scrubAll(); }, 800);
}

// ---------------------------------------------------------------- config UI

function buildSettingsPanel() {
    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host) return;
    const s = settings();

    const box = el('div', 'ivyph-settings');
    box.innerHTML = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>IVY Phone</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <label class="checkbox_label"><input type="checkbox" data-s="enabled"> Включено</label>
                <label class="checkbox_label"><input type="checkbox" data-s="hideMarkers"> Прятать маркеры в чате</label>
                <label class="checkbox_label"><input type="checkbox" data-s="autoOpenOnCall"> Открывать телефон при входящем звонке</label>
                <label class="checkbox_label"><input type="checkbox" data-s="autoPhotos"> Генерировать фото сразу, без кнопки</label>
                <label class="checkbox_label"><input type="checkbox" data-s="autoTrigger"> Запускать ответ после смс из телефона</label>
                <label>Команда генерации<input class="text_pole" data-s="imageCommand" placeholder="/sd quiet=true {{prompt}}"></label>
                <label>Время в игре<input class="text_pole" data-s="timeMacro" placeholder="{{getvar::time}}"></label>
                <label>Дата в игре<input class="text_pole" data-s="dateMacro" placeholder="{{getvar::date}}"></label>
                <label>Оператор<input class="text_pole" data-s="carrier"></label>
            </div>
        </div>`;
    host.appendChild(box);

    box.querySelectorAll('[data-s]').forEach(f => {
        const key = f.dataset.s;
        if (f.type === 'checkbox') f.checked = !!s[key]; else f.value = s[key];
        f.addEventListener('change', () => {
            s[key] = f.type === 'checkbox' ? f.checked : f.value;
            saveSettingsDebounced();
            if (key === 'hideMarkers') scrubAll();
        });
    });
}

jQuery(() => init());
