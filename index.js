import { extension_settings, getContext, saveMetadataDebounced } from '../../../extensions.js';
import { saveSettingsDebounced, eventSource, event_types, chat_metadata } from '../../../../script.js';

const MODULE = 'ivy_phone';

// ---------------------------------------------------------------- стили
// Стили вшиты прямо в код и вставляются тегом <style>, а не подключаются
// отдельным файлом через manifest.json → так надёжнее: некоторые сборки
// таверны отдают .css с неверным Content-Type, и браузер отказывается
// подключать внешний файл, хотя сам файл на диске в порядке.

const CSS_TEXT = `/* IVY Phone — 2011-era handset, rainy-Seattle palette */

.ivyph-overlay,
.ivyph-launcher {
    --ph-bg: #14181c;
    --ph-chrome: #1c2227;
    --ph-line: #2b343c;
    --ph-text: #e4e8eb;
    --ph-dim: #7f8b95;
    --ph-in: #242c33;
    --ph-out: #3e5f4a;
    --ph-brick: #b04a3b;
    --ph-green: #4f7c58;
    --ph-face: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
    --ph-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}

/* ---------------------------------------------------------- launcher */

.ivyph-launcher {
    position: fixed;
    top: 64px;
    right: 14px;
    z-index: 3000;
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    cursor: pointer;
    border-radius: 12px;
    background: linear-gradient(180deg, #232b32, #171c21);
    border: 1px solid var(--ph-line);
    box-shadow: 0 4px 14px rgba(0, 0, 0, .45);
    color: var(--ph-dim);
    transition: color .18s, transform .18s;
}

.ivyph-launcher:hover { color: var(--ph-text); transform: translateY(-1px); }
.ivyph-launcher-glyph { display: grid; place-items: center; }
.ivyph-launcher-glyph .ivyph-i { width: 21px; height: 21px; }
.ivyph-launcher.ivyph-has-unread { color: var(--ph-text); }

.ivyph-badge {
    position: absolute;
    top: -6px;
    right: -6px;
    min-width: 19px;
    height: 19px;
    padding: 0 5px;
    border-radius: 10px;
    background: var(--ph-brick);
    color: #fff;
    font: 600 11px/19px var(--ph-mono);
    text-align: center;
    box-shadow: 0 0 0 2px var(--ph-bg);
}

.ivyph-launcher.ivyph-has-unread .ivyph-badge { animation: ivyph-pop .35s ease-out; }

@keyframes ivyph-pop {
    0% { transform: scale(0); }
    70% { transform: scale(1.25); }
    100% { transform: scale(1); }
}

/* ---------------------------------------------------------- icons */

.ivyph-i {
    display: inline-block;
    width: 17px;
    height: 17px;
    flex: none;
    vertical-align: -3px;
}

.ivyph-spin { animation: ivyph-spin 1s linear infinite; }

@keyframes ivyph-spin { to { transform: rotate(360deg); } }

/* ---------------------------------------------------------- shell */

.ivyph-overlay {
    position: fixed;
    inset: 0;
    z-index: 3100;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--ph-face);
}

.ivyph-scrim {
    position: absolute;
    inset: 0;
    background: rgba(6, 9, 12, .62);
    backdrop-filter: blur(2px);
}

.ivyph-device {
    position: relative;
    z-index: 1;
    width: min(360px, 94vw);
    height: min(680px, 88vh);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 26px;
    background: var(--ph-bg);
    color: var(--ph-text);
    border: 1px solid #333c44;
    box-shadow: 0 0 0 6px #0d1114, 0 24px 60px rgba(0, 0, 0, .6);
    animation: ivyph-rise .22s ease-out;
}

@keyframes ivyph-rise {
    from { transform: translateY(14px); opacity: 0; }
}

.ivyph-close {
    margin-left: 3px;
    padding: 2px;
    border-left: 1px solid var(--ph-line);
    padding-left: 8px;
}

.ivyph-close:hover { color: var(--ph-text); }

/* ---------------------------------------------------------- status bar */

.ivyph-status {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 7px 10px 7px 14px;
    background: linear-gradient(180deg, #262e35, #1a2026);
    border-bottom: 1px solid #0e1215;
    font: 500 11px/1 var(--ph-mono);
    letter-spacing: .04em;
    color: var(--ph-dim);
}

.ivyph-clock { color: var(--ph-text); justify-self: center; letter-spacing: .06em; }
.ivyph-meta {
    display: flex;
    align-items: center;
    justify-self: end;
    gap: 7px;
}

.ivyph-meta .ivyph-i { width: 15px; height: 15px; }
.ivyph-meta .ivyph-close .ivyph-i { width: 14px; height: 14px; }

/* ---------------------------------------------------------- screen */

.ivyph-screen {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
}

.ivyph-head {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 12px;
    font: 600 15px/1 var(--ph-face);
    letter-spacing: .01em;
    background: var(--ph-chrome);
    border-bottom: 1px solid var(--ph-line);
    position: sticky;
    top: 0;
    z-index: 2;
}

.ivyph-head-nav { justify-content: space-between; }

.ivyph-title {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
}

.ivyph-title small {
    font: 400 10.5px/1 var(--ph-mono);
    letter-spacing: .05em;
    color: var(--ph-dim);
    text-transform: lowercase;
}

.ivyph-back,
.ivyph-icon-btn,
.ivyph-close {
    display: grid;
    place-items: center;
    border: 0;
    background: transparent;
    color: var(--ph-dim);
    cursor: pointer;
    padding: 2px 4px;
}

.ivyph-back .ivyph-i,
.ivyph-icon-btn .ivyph-i { width: 18px; height: 18px; }

.ivyph-close .ivyph-i { width: 15px; height: 15px; }

.ivyph-back:hover, .ivyph-icon-btn:hover { color: var(--ph-text); }

/* ---------------------------------------------------------- lists */

.ivyph-list { list-style: none; margin: 0; padding: 0; }

.ivyph-row {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 11px 14px;
    border-bottom: 1px solid var(--ph-line);
    cursor: pointer;
}

.ivyph-row:hover { background: #1a2026; }

.ivyph-avatar {
    flex: none;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--tint, #3d4a55);
    color: #fff;
    font: 600 15px/1 var(--ph-face);
}

.ivyph-row-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }

.ivyph-row-top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
}

.ivyph-row-top b { font-weight: 600; font-size: 14px; }
.ivyph-row-top time { font: 400 11px var(--ph-mono); color: var(--ph-dim); }

.ivyph-row-sub .ivyph-i { width: 12px; height: 12px; vertical-align: -2px; margin-right: 2px; }

.ivyph-row-sub {
    font-size: 12.5px;
    color: var(--ph-dim);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.ivyph-dot {
    flex: none;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--ph-brick);
    color: #fff;
    font: 600 11px/18px var(--ph-mono);
    text-align: center;
}

.ivyph-call-row.ivyph-missed .ivyph-row-top b,
.ivyph-call-row.ivyph-missed .ivyph-row-sub { color: #c9695b; }

.ivyph-empty-row { padding: 18px 14px; color: var(--ph-dim); font-size: 13px; }

.ivyph-empty {
    margin: auto;
    padding: 30px 24px;
    text-align: center;
    color: var(--ph-dim);
}

.ivyph-empty .ivyph-i { width: 30px; height: 30px; opacity: .35; }
.ivyph-empty p { margin: 12px 0 4px; font-size: 14px; color: var(--ph-text); }
.ivyph-empty small { font-size: 12px; line-height: 1.5; display: block; }

/* ---------------------------------------------------------- thread */

.ivyph-thread {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 14px 12px 6px;
    display: flex;
    flex-direction: column;
    gap: 7px;
    background:
        radial-gradient(120% 60% at 50% 0%, #1a2127 0%, var(--ph-bg) 70%);
}

.ivyph-bub {
    max-width: 78%;
    padding: 8px 11px 6px;
    border-radius: 15px;
    font-size: 14px;
    line-height: 1.42;
    word-wrap: break-word;
    animation: ivyph-bub-in .18s ease-out;
}

@keyframes ivyph-bub-in {
    from { transform: translateY(5px); opacity: 0; }
}

.ivyph-bub time {
    display: block;
    margin-top: 3px;
    font: 400 10px var(--ph-mono);
    opacity: .55;
    text-align: right;
}

.ivyph-in {
    align-self: flex-start;
    background: var(--ph-in);
    border-bottom-left-radius: 5px;
}

.ivyph-out {
    align-self: flex-end;
    background: var(--ph-out);
    border-bottom-right-radius: 5px;
}

.ivyph-photo {
    display: block;
    width: 100%;
    max-width: 230px;
    border-radius: 10px;
}

.ivyph-shot {
    display: flex;
    flex-direction: column;
    gap: 9px;
    width: 210px;
    padding: 11px;
    border-radius: 10px;
    border: 1px dashed #3a454e;
    background: #1a2026;
}

.ivyph-shot-desc {
    display: flex;
    gap: 7px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--ph-dim);
}

.ivyph-shot-desc .ivyph-i { width: 14px; height: 14px; margin-top: 2px; opacity: .7; }
.ivyph-shot-desc i { font-style: italic; }

.ivyph-shot-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 7px;
    border: 0;
    border-radius: 7px;
    background: #2f4a3a;
    color: #dfe8e2;
    font: 500 12px var(--ph-face);
    cursor: pointer;
}

.ivyph-shot-btn:hover { background: #3a5a46; }
.ivyph-shot-btn .ivyph-i { width: 14px; height: 14px; vertical-align: 0; }

.ivyph-shot-err { font: 400 11px var(--ph-mono); color: #c9695b; }

.ivyph-shot-busy {
    flex-direction: row;
    align-items: center;
    justify-content: center;
    height: 92px;
    gap: 7px;
    color: var(--ph-dim);
    font-size: 12px;
    border-style: solid;
}

.ivyph-cap { display: block; margin-top: 6px; font-size: 13.5px; }

.ivyph-voice { display: flex; align-items: center; gap: 8px; min-width: 130px; }
.ivyph-voice .ivyph-i { width: 15px; height: 15px; }
.ivyph-voice time { margin: 0; font-size: 11px; }

.ivyph-wave {
    flex: 1;
    height: 14px;
    background: repeating-linear-gradient(90deg, currentColor 0 2px, transparent 2px 5px);
    opacity: .35;
    mask-image: linear-gradient(90deg, #000 60%, transparent);
}

/* ---------------------------------------------------------- compose */

.ivyph-compose {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 9px 10px;
    background: var(--ph-chrome);
    border-top: 1px solid var(--ph-line);
}

.ivyph-compose textarea {
    flex: 1;
    resize: none;
    max-height: 90px;
    padding: 8px 11px;
    border-radius: 16px;
    border: 1px solid var(--ph-line);
    background: #10151a;
    color: var(--ph-text);
    font: 400 14px/1.4 var(--ph-face);
}

.ivyph-compose textarea:focus { outline: 2px solid #46606f; outline-offset: 1px; }

.ivyph-send {
    flex: none;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 50%;
    background: var(--ph-out);
    color: #fff;
    cursor: pointer;
}

.ivyph-send .ivyph-i { width: 16px; height: 16px; vertical-align: 0; }

/* ---------------------------------------------------------- contact form */

.ivyph-form { padding: 14px; display: flex; flex-direction: column; gap: 12px; }

.ivyph-form label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font: 500 11px/1 var(--ph-mono);
    letter-spacing: .07em;
    text-transform: uppercase;
    color: var(--ph-dim);
}

.ivyph-form input,
.ivyph-form textarea {
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--ph-line);
    background: #10151a;
    color: var(--ph-text);
    font: 400 14px var(--ph-face);
    text-transform: none;
    letter-spacing: 0;
}

.ivyph-form input[type="color"] { padding: 2px; height: 34px; width: 60px; }

.ivyph-form-actions { display: flex; gap: 10px; margin-top: 4px; }

.ivyph-primary,
.ivyph-danger {
    flex: 1;
    padding: 9px;
    border: 0;
    border-radius: 8px;
    font: 600 13px var(--ph-face);
    color: #fff;
    cursor: pointer;
}

.ivyph-primary { background: var(--ph-green); }
.ivyph-danger { background: #6b3a33; }

/* ---------------------------------------------------------- call screen */

.ivyph-callscreen {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 30px 22px 34px;
    background: radial-gradient(90% 55% at 50% 22%, #232c33, #0f1418);
    text-align: center;
}

.ivyph-call-label {
    font: 500 11px var(--ph-mono);
    letter-spacing: .18em;
    text-transform: uppercase;
    color: var(--ph-dim);
}

.ivyph-call-avatar {
    width: 96px;
    height: 96px;
    margin: 16px 0 10px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--tint, #3d4a55);
    color: #fff;
    font: 600 36px/1 var(--ph-face);
    box-shadow: 0 0 0 0 rgba(176, 74, 59, .5);
    animation: ivyph-ring 1.8s ease-out infinite;
}

@keyframes ivyph-ring {
    70% { box-shadow: 0 0 0 22px rgba(176, 74, 59, 0); }
    100% { box-shadow: 0 0 0 0 rgba(176, 74, 59, 0); }
}

.ivyph-call-name { font-size: 22px; font-weight: 600; }
.ivyph-call-number { font: 400 12px var(--ph-mono); color: var(--ph-dim); }

.ivyph-call-actions {
    display: flex;
    gap: 34px;
    margin-top: auto;
}

.ivyph-call-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    border: 0;
    background: transparent;
    color: var(--ph-dim);
    font: 500 11px var(--ph-face);
    cursor: pointer;
}

.ivyph-call-circle {
    width: 58px;
    height: 58px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    color: #fff;
}

.ivyph-call-circle .ivyph-i { width: 23px; height: 23px; vertical-align: 0; }

.ivyph-accept .ivyph-call-circle { background: var(--ph-green); }
.ivyph-decline .ivyph-call-circle { background: var(--ph-brick); }

/* ---------------------------------------------------------- dock */

.ivyph-dock {
    display: flex;
    background: linear-gradient(180deg, #212930, #161b20);
    border-top: 1px solid #0e1215;
}

.ivyph-dock-btn {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 9px 0 11px;
    border: 0;
    background: transparent;
    color: var(--ph-dim);
    font: 500 10px var(--ph-face);
    cursor: pointer;
}

.ivyph-dock-btn .ivyph-i { width: 17px; height: 17px; vertical-align: 0; }
.ivyph-dock-btn:hover { color: var(--ph-text); }

.ivyph-overlay.ivyph-ringing .ivyph-dock { display: none; }

/* ---------------------------------------------------------- mobile */

@media (max-width: 520px) {
    .ivyph-device {
        width: 100vw;
        height: 100dvh;
        border-radius: 0;
        border: 0;
        box-shadow: none;
    }

    .ivyph-status { padding-top: max(7px, env(safe-area-inset-top)); }
    .ivyph-dock { padding-bottom: env(safe-area-inset-bottom); }
    .ivyph-launcher { top: auto; bottom: 92px; right: 10px; }
}

@media (prefers-reduced-motion: reduce) {
    .ivyph-device,
    .ivyph-bub,
    .ivyph-badge,
    .ivyph-call-avatar { animation: none !important; }
    .ivyph-spin { animation-duration: 2.4s; }
}

/* ---------------------------------------------------------- settings */

.ivyph-settings label { display: block; margin-top: 8px; font-size: 12px; }
.ivyph-settings .text_pole { width: 100%; }
`;

function injectStyles() {
    if (document.getElementById('ivyph-styles')) return;
    const tag = document.createElement('style');
    tag.id = 'ivyph-styles';
    tag.textContent = CSS_TEXT;
    document.head.appendChild(tag);
}


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
    injectStyles();
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
