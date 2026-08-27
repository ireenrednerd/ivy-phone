import { extension_settings, getContext, saveMetadataDebounced } from '../../../extensions.js';
import { saveSettingsDebounced, eventSource, event_types, chat_metadata } from '../../../../script.js';

const MODULE = 'ivy_phone';

// ---------------------------------------------------------------- стили
// Стили вшиты прямо в код и вставляются тегом <style>, а не подключаются
// отдельным файлом через manifest.json → так надёжнее: некоторые сборки
// таверны отдают .css с неверным Content-Type, и браузер отказывается
// подключать внешний файл, хотя сам файл на диске в порядке.

const CSS_TEXT = `/* IVY Phone — интерфейс телефона для ролевого чата */

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

/* ---------------------------------------------------------- visibility */
/* Атрибут hidden обязан побеждать display:flex ниже по файлу.
   Без !important правило автора перекрывает встроенное [hidden]
   и телефон невозможно закрыть. */

.ivyph-overlay[hidden],
.ivyph-launcher[hidden],
.ivyph-badge[hidden] {
    display: none !important;
}

/* ---------------------------------------------------------- launcher */

.ivyph-launcher {
    position: fixed !important;
    top: 64px;
    right: 14px;
    z-index: 99999;
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
    position: fixed !important;
    inset: 0 !important;
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    z-index: 100000;
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

.ivyph-head-tools { display: flex; align-items: center; gap: 2px; }

.ivyph-head-tools [data-wipe] { color: #a3655a; }
.ivyph-head-tools [data-wipe]:hover { color: #c9695b; }

.ivyph-row [data-del-group] { flex: none; color: #a3655a; }

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
    position: relative;
    overflow: hidden;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--tint, #3d4a55);
    color: #fff;
    font: 600 15px/1 var(--ph-face);
}

.ivyph-avatar-group .ivyph-i { width: 22px; height: 22px; }
.ivyph-call-avatar.ivyph-avatar-group .ivyph-i { width: 48px; height: 48px; }

.ivyph-avatar img,
.ivyph-call-avatar img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
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
    min-width: 21px;
    height: 21px;
    padding: 0 6px;
    border-radius: 11px;
    background: #c0453a;
    color: #fff;
    font: 700 12px/21px var(--ph-face);
    text-align: center;
    box-shadow: 0 1px 3px rgba(0, 0, 0, .35);
}

/* непрочитанная ветка выделяется и текстом, а не только кружком */
.ivyph-row-unread .ivyph-row-top b { color: var(--ph-text); }
.ivyph-row-unread .ivyph-row-sub { color: var(--ph-text); opacity: .85; font-weight: 500; }

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

.ivyph-dstate {
    font-size: 9.5px;
    letter-spacing: .04em;
    opacity: .85;
}

.ivyph-typing {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 11px 13px;
    min-width: 52px;
}

.ivyph-typing i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    opacity: .35;
    animation: ivyph-dots 1.25s ease-in-out infinite;
}

.ivyph-typing i:nth-child(2) { animation-delay: .18s; }
.ivyph-typing i:nth-child(3) { animation-delay: .36s; }

@keyframes ivyph-dots {
    30% { opacity: 1; transform: translateY(-3px); }
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

.ivyph-subhead {
    padding: 12px 14px 6px;
    font: 600 10.5px var(--ph-mono);
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--ph-dim);
    background: var(--ph-bg);
}

.ivyph-attach {
    flex: none;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--ph-dim);
    cursor: pointer;
}

.ivyph-attach:hover { color: var(--ph-text); }
.ivyph-attach .ivyph-i { width: 19px; height: 19px; vertical-align: 0; }

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

/* Подсказка в пустом поле: приглушённая и курсивом, чтобы её нельзя было
   спутать с реально введённым значением. */
.ivyph-form input::placeholder,
.ivyph-form textarea::placeholder,
.ivyph-compose textarea::placeholder,
.ivyph-edit-box::placeholder {
    color: var(--ph-dim);
    opacity: .55;
    font-style: italic;
}

.ivyph-avatar-pick {
    display: flex;
    align-items: center;
    gap: 10px;
}

.ivyph-avatar-lg { width: 52px; height: 52px; font-size: 20px; }

.ivyph-mini {
    padding: 6px 10px;
    border: 1px solid var(--ph-line);
    border-radius: 7px;
    background: #1a2026;
    color: var(--ph-text);
    font: 500 12px var(--ph-face);
    text-transform: none;
    letter-spacing: 0;
    cursor: pointer;
}

.ivyph-mini:hover { background: #222a31; }
.ivyph-mini-off { color: #c9695b; }

.ivyph-quick {
    display: flex;
    gap: 10px;
    margin-top: 6px;
}

.ivyph-quick-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 11px;
    border: 1px solid var(--ph-line);
    border-radius: 9px;
    background: var(--ph-chrome);
    color: var(--ph-text);
    font: 600 13px var(--ph-face);
    cursor: pointer;
}

.ivyph-quick-btn:hover { background: #222a31; }
.ivyph-quick-btn .ivyph-i { width: 16px; height: 16px; vertical-align: 0; }
.ivyph-quick-btn[data-place-call] { color: #9ed8a8; }

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
    position: relative;
    overflow: hidden;
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

[data-skin] .ivyph-callscreen .ivyph-call-avatar { animation-duration: 1.8s; }

.ivyph-overlay.ivyph-ringing .ivyph-callscreen .ivyph-call-label { animation: ivyph-pulse 2s ease-in-out infinite; }

@keyframes ivyph-pulse { 50% { opacity: .45; } }

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

@media (max-width: 900px) {
    .ivyph-device {
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100vh;
        height: 100dvh;
        max-width: none;
        max-height: none;
        border-radius: 0;
        border: 0;
        box-shadow: none;
    }

    .ivyph-status { padding-top: max(7px, env(safe-area-inset-top)); }
    .ivyph-dock { padding-bottom: env(safe-area-inset-bottom); }
    .ivyph-launcher {
        top: auto;
        bottom: 76px;
        right: 12px;
        width: 46px;
        height: 46px;
        border-color: #4a5763;
        box-shadow: 0 4px 18px rgba(0, 0, 0, .6);
    }
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

/* ============================================================ */
/* SKINS                                                        */
/* Каждая оболочка переопределяет переменные и точечно правит    */
/* форму. Разметка одна и та же — меняется только внешний вид.   */
/* ============================================================ */

/* ---- новые элементы: реакции, группы, палочка ---- */

.ivyph-who {
    display: block;
    margin-bottom: 3px;
    font: 600 11px var(--ph-face);
    color: var(--ph-accent, #8fb0a0);
    letter-spacing: .02em;
}

.ivyph-react {
    position: absolute;
    right: 6px;
    bottom: -9px;
    padding: 1px 5px;
    border-radius: 10px;
    background: var(--ph-chrome);
    border: 1px solid var(--ph-line);
    font-size: 11px;
    line-height: 1.4;
}

.ivyph-bub { position: relative; }

/* Три точки в углу пузыря: действия должны быть видны, а не прятаться
   за тапом по всему сообщению. */
.ivyph-more {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: currentColor;
    opacity: .3;
    cursor: pointer;
    transition: opacity .15s, background .15s;
}

/* На тач-экране наведения нет, поэтому кнопка видна всегда. */
.ivyph-more { opacity: .45; }
.ivyph-bub:hover .ivyph-more { opacity: .8; }
.ivyph-more:hover { opacity: 1 !important; background: rgba(127, 139, 149, .18); }

@media (hover: none) {
    .ivyph-more { opacity: .55; background: transparent; }
}
.ivyph-more .ivyph-i { width: 14px; height: 14px; vertical-align: 0; }

.ivyph-bub { padding-right: 28px; }
.ivyph-bub time { padding-right: 2px; }

.ivyph-msgtools {
    flex-wrap: wrap;
    justify-content: center;
    max-width: 92%;
}

.ivyph-msgtools button {
    display: inline-flex;
    align-items: center;
    gap: 5px;
}

.ivyph-msgtools .ivyph-i { width: 13px; height: 13px; vertical-align: 0; }

/* ---------------------------------------------------------- viewer */

.ivyph-viewer {
    position: fixed;
    inset: 0;
    z-index: 200000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px 14px 80px;
    background: rgba(5, 7, 9, .93);
    animation: ivyph-fade .16s ease-out;
}

@keyframes ivyph-fade { from { opacity: 0; } }

.ivyph-viewer img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 8px;
}

.ivyph-viewer-bar {
    position: absolute;
    left: 50%;
    bottom: 22px;
    transform: translateX(-50%);
    display: flex;
    gap: 8px;
}

.ivyph-viewer-bar button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 9px 15px;
    border: 1px solid #3a444d;
    border-radius: 999px;
    background: rgba(28, 34, 39, .92);
    color: #e4e8eb;
    font: 600 12.5px -apple-system, "Segoe UI", Roboto, sans-serif;
    cursor: pointer;
}

.ivyph-viewer-bar button:hover { background: rgba(40, 48, 55, .96); }
.ivyph-viewer-bar .ivyph-i { width: 14px; height: 14px; vertical-align: 0; }

.ivyph-photo { cursor: zoom-in; }

/* Над картинкой кнопка нуждается в подложке, иначе теряется на снимке. */
.ivyph-bub:has(.ivyph-photo) .ivyph-more,
.ivyph-bub:has(.ivyph-shot) .ivyph-more {
    background: rgba(10, 14, 18, .5);
    color: #fff;
    opacity: .85;
}

.ivyph-shot-desc i { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

.ivyph-picker {
    align-self: center;
    display: flex;
    gap: 2px;
    margin: 2px 0 6px;
    padding: 4px 6px;
    border-radius: 18px;
    background: var(--ph-chrome);
    border: 1px solid var(--ph-line);
    box-shadow: 0 4px 14px rgba(0, 0, 0, .4);
}

.ivyph-picker button {
    border: 0;
    background: transparent;
    font-size: 17px;
    line-height: 1;
    padding: 3px 4px;
    cursor: pointer;
    transition: transform .12s;
}

.ivyph-picker button:hover { transform: scale(1.25); }

.ivyph-msgtools {
    align-self: center;
    display: flex;
    gap: 4px;
    margin: 0 0 8px;
}

.ivyph-msgtools button {
    padding: 5px 10px;
    border: 1px solid var(--ph-line);
    border-radius: 13px;
    background: var(--ph-chrome);
    color: var(--ph-dim);
    font: 500 11.5px var(--ph-face);
    cursor: pointer;
}

.ivyph-msgtools button:hover { color: var(--ph-text); }
.ivyph-msgtools .ivyph-danger-text { color: #c9695b; }

.ivyph-editing { width: 78%; }

.ivyph-edit-box {
    width: 100%;
    resize: none;
    padding: 7px 9px;
    border-radius: 9px;
    border: 1px solid var(--ph-line);
    background: #10151a;
    color: var(--ph-text);
    font: 400 14px/1.4 var(--ph-face);
}

.ivyph-editing .ivyph-msgtools { margin-top: 7px; }

.ivyph-check {
    flex-direction: row !important;
    align-items: center;
    gap: 9px !important;
    text-transform: none !important;
    letter-spacing: 0 !important;
    font-size: 12.5px !important;
    color: var(--ph-text) !important;
}

.ivyph-check input { width: 17px; height: 17px; flex: none; }

.ivyph-pick { width: 20px; height: 20px; flex: none; }
.ivyph-group-name { text-transform: none; }

.ivyph-scam { opacity: .82; border: 1px dashed #6b5340; }

.ivyph-spacer { width: 26px; flex: none; }

/* ============================================================ */
/* 1. СОВРЕМЕННЫЙ — крупные радиусы, полупрозрачные панели       */
/* ============================================================ */

[data-skin="modern"] {
    --ph-bg: #0d0f12;
    --ph-chrome: #16191e;
    --ph-line: #262b33;
    --ph-text: #f2f4f6;
    --ph-dim: #8a929c;
    --ph-in: #23272e;
    --ph-out: #2f6b4f;
    --ph-accent: #7fd1a5;
    border-radius: 34px;
}

[data-skin="modern"] .ivyph-status {
    background: var(--ph-bg);
    border-bottom: 0;
    padding-top: 12px;
    font-weight: 600;
}

[data-skin="modern"] .ivyph-head {
    background: rgba(22, 25, 30, .82);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid rgba(255, 255, 255, .06);
    font-size: 16px;
}

[data-skin="modern"] .ivyph-bub {
    border-radius: 20px;
    font-size: 15px;
}

[data-skin="modern"] .ivyph-in { border-bottom-left-radius: 7px; }
[data-skin="modern"] .ivyph-out { border-bottom-right-radius: 7px; }

[data-skin="modern"] .ivyph-compose textarea { border-radius: 20px; }
[data-skin="modern"] .ivyph-dock { background: rgba(22, 25, 30, .9); backdrop-filter: blur(12px); }
[data-skin="modern"] .ivyph-avatar { width: 42px; height: 42px; }

/* ============================================================ */
/* 2. СКЕВОМОРФНЫЙ — глянец, градиенты, светлые панели           */
/* ============================================================ */

[data-skin="iphone4"] {
    --ph-bg: #1b1d21;
    --ph-chrome: #3d4650;
    --ph-line: #20242a;
    --ph-text: #ffffff;
    --ph-dim: #b9c2cb;
    --ph-in: #e6e8ea;
    --ph-out: #86d15b;
    --ph-accent: #2f6fb5;
    --ph-face: "Helvetica Neue", Helvetica, Arial, sans-serif;
    border-radius: 6px;
}

[data-skin="iphone4"] .ivyph-status {
    background: linear-gradient(180deg, #6f7c88 0%, #414a54 48%, #2f363d 52%, #1f242a 100%);
    color: #fff;
    text-shadow: 0 -1px 0 rgba(0, 0, 0, .6);
    border-bottom: 1px solid #12151a;
}

[data-skin="iphone4"] .ivyph-clock { color: #fff; font-weight: 700; }

[data-skin="iphone4"] .ivyph-head {
    background: linear-gradient(180deg, #8b96a2 0%, #566370 50%, #45505b 51%, #333c46 100%);
    border-bottom: 1px solid #1d2228;
    color: #fff;
    text-shadow: 0 -1px 0 rgba(0, 0, 0, .5);
    font-weight: 700;
}

[data-skin="iphone4"] .ivyph-screen,
[data-skin="iphone4"] .ivyph-thread {
    background: repeating-linear-gradient(
        180deg, #eef0f2 0 22px, #e6e8ea 22px 44px
    );
}

[data-skin="iphone4"] .ivyph-list { background: #eef0f2; }
[data-skin="iphone4"] .ivyph-row { border-bottom: 1px solid #c9cdd2; }
[data-skin="iphone4"] .ivyph-row:hover { background: #e2e5e8; }
[data-skin="iphone4"] .ivyph-row-top b { color: #1a1d21; }
[data-skin="iphone4"] .ivyph-row-sub { color: #5c636b; }
[data-skin="iphone4"] .ivyph-row-top time { color: #6d747c; }

[data-skin="iphone4"] .ivyph-bub {
    border-radius: 15px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .7), 0 1px 2px rgba(0, 0, 0, .25);
    font-size: 14.5px;
}

[data-skin="iphone4"] .ivyph-in {
    background: linear-gradient(180deg, #ffffff, #dcdfe2);
    color: #16181b;
}

[data-skin="iphone4"] .ivyph-out {
    background: linear-gradient(180deg, #a6e77f, #5cb135);
    color: #10240a;
}

[data-skin="iphone4"] .ivyph-bub time { opacity: .5; }
[data-skin="iphone4"] .ivyph-more { color: #3a3f45; }
[data-skin="iphone4"] .ivyph-out .ivyph-more { color: #1c3d10; }

[data-skin="iphone4"] .ivyph-compose {
    background: linear-gradient(180deg, #b6bcc3, #8d959e);
    border-top: 1px solid #6d747c;
}

[data-skin="iphone4"] .ivyph-compose textarea {
    background: #fff;
    color: #16181b;
    border: 1px solid #6d747c;
    border-radius: 15px;
}

[data-skin="iphone4"] .ivyph-send {
    background: linear-gradient(180deg, #a6e77f, #4f9f2c);
    border: 1px solid #3d7d22;
}

[data-skin="iphone4"] .ivyph-dock {
    background: linear-gradient(180deg, #4c555f, #232a31);
    border-top: 1px solid #12151a;
}

[data-skin="iphone4"] .ivyph-empty { color: #5c636b; }
[data-skin="iphone4"] .ivyph-empty p { color: #1a1d21; }
[data-skin="iphone4"] .ivyph-title small { color: #d6dbe0; }

[data-skin="iphone4"] .ivyph-form input,
[data-skin="iphone4"] .ivyph-form textarea,
[data-skin="iphone4"] .ivyph-edit-box {
    background: #fff;
    color: #16181b;
    border: 1px solid #b9bdc2;
}

[data-skin="iphone4"] .ivyph-form label { color: #5c636b; }

[data-skin="iphone4"] .ivyph-form input::placeholder,
[data-skin="iphone4"] .ivyph-form textarea::placeholder,
[data-skin="iphone4"] .ivyph-compose textarea::placeholder {
    color: #8a929b;
    opacity: .75;
}
[data-skin="iphone4"] .ivyph-check { color: #1a1d21 !important; }
[data-skin="iphone4"] .ivyph-shot { background: #e2e5e8; border-color: #b9bdc2; }
[data-skin="iphone4"] .ivyph-shot-desc { color: #5c636b; }
[data-skin="iphone4"] .ivyph-mini { background: #fff; color: #16181b; border-color: #b9bdc2; }
[data-skin="iphone4"] .ivyph-subhead { background: #e6e8ea; color: #5c636b; }
[data-skin="iphone4"] .ivyph-msgtools button { background: #fff; color: #3a3f45; border-color: #b9bdc2; }
[data-skin="iphone4"] .ivyph-react,
[data-skin="iphone4"] .ivyph-picker { background: #fff; border-color: #b9bdc2; }
[data-skin="iphone4"] .ivyph-callscreen {
    background: radial-gradient(90% 55% at 50% 22%, #e6e8ea, #cdd1d5);
}
[data-skin="iphone4"] .ivyph-call-name { color: #16181b; }
[data-skin="iphone4"] .ivyph-call-number { color: #5c636b; }
[data-skin="iphone4"] .ivyph-call-label { color: #5c636b; }
[data-skin="iphone4"] .ivyph-call-btn { color: #3a3f45; }

/* ============================================================ */
/* 3. ANDROID — Material: плоско, прямые углы, акцентный синий   */
/* ============================================================ */

[data-skin="android"] {
    --ph-bg: #121417;
    --ph-chrome: #1f2226;
    --ph-line: #2e3339;
    --ph-text: #e8eaed;
    --ph-dim: #9aa0a6;
    --ph-in: #2a2f35;
    --ph-out: #1a5b8f;
    --ph-accent: #8ab4f8;
    --ph-face: Roboto, "Segoe UI", system-ui, sans-serif;
    border-radius: 14px;
}

[data-skin="android"] .ivyph-status {
    background: var(--ph-chrome);
    border-bottom: 0;
    font-size: 12px;
}

[data-skin="android"] .ivyph-head {
    background: var(--ph-chrome);
    border-bottom: 0;
    box-shadow: 0 2px 6px rgba(0, 0, 0, .35);
    justify-content: flex-start;
    padding-left: 18px;
    font-weight: 500;
    font-size: 17px;
}

[data-skin="android"] .ivyph-title { align-items: flex-start; }

[data-skin="android"] .ivyph-bub {
    border-radius: 17px;
    font-size: 14.5px;
}

[data-skin="android"] .ivyph-in { border-bottom-left-radius: 4px; }
[data-skin="android"] .ivyph-out { border-bottom-right-radius: 4px; }

[data-skin="android"] .ivyph-send {
    background: var(--ph-accent);
    color: #0b1a2b;
    border-radius: 50%;
}

[data-skin="android"] .ivyph-dock {
    background: var(--ph-chrome);
    border-top: 1px solid var(--ph-line);
}

[data-skin="android"] .ivyph-dock-btn { text-transform: none; letter-spacing: .02em; }
[data-skin="android"] .ivyph-avatar { border-radius: 50%; }
[data-skin="android"] .ivyph-primary { background: var(--ph-accent); color: #0b1a2b; }

/* ============================================================ */
/* 4. КНОПОЧНЫЙ — монохромный ЖК, моноширинный шрифт, без пузырей */
/* ============================================================ */

[data-skin="nokia"] {
    --ph-bg: #16210f;
    --ph-chrome: #1e2c14;
    --ph-line: #3a5227;
    --ph-text: #b6d98a;
    --ph-dim: #6f8a4c;
    --ph-in: transparent;
    --ph-out: transparent;
    --ph-accent: #b6d98a;
    --ph-face: ui-monospace, "Courier New", monospace;
    --ph-mono: ui-monospace, "Courier New", monospace;
    border-radius: 10px;
    box-shadow: 0 0 0 8px #2b2b2b, 0 24px 60px rgba(0, 0, 0, .6);
}

[data-skin="nokia"] .ivyph-status {
    background: var(--ph-chrome);
    border-bottom: 2px solid var(--ph-line);
    color: var(--ph-text);
    font-size: 10px;
    text-transform: uppercase;
}

[data-skin="nokia"] .ivyph-head {
    background: var(--ph-chrome);
    color: var(--ph-text);
    border-bottom: 2px solid var(--ph-line);
    font: 700 13px/1 var(--ph-mono);
    text-transform: uppercase;
    letter-spacing: .12em;
    padding: 9px 12px;
}

[data-skin="nokia"] .ivyph-title small { color: var(--ph-dim); }
[data-skin="nokia"] .ivyph-thread { background: var(--ph-bg); gap: 2px; padding: 8px; }

[data-skin="nokia"] .ivyph-bub {
    max-width: 100%;
    border-radius: 0;
    padding: 5px 6px;
    border-bottom: 1px dotted var(--ph-line);
    font-size: 13px;
    box-shadow: none;
}

[data-skin="nokia"] .ivyph-in::before { content: "< "; opacity: .6; }
[data-skin="nokia"] .ivyph-out::before { content: "> "; opacity: .6; }
[data-skin="nokia"] .ivyph-out { align-self: stretch; text-align: left; }
[data-skin="nokia"] .ivyph-in { align-self: stretch; }
[data-skin="nokia"] .ivyph-bub time { text-align: left; opacity: .55; }

[data-skin="nokia"] .ivyph-avatar,
[data-skin="nokia"] .ivyph-call-avatar {
    border-radius: 0;
    background: var(--ph-line);
    color: var(--ph-text);
}

[data-skin="nokia"] .ivyph-avatar img,
[data-skin="nokia"] .ivyph-call-avatar img { filter: grayscale(1) contrast(1.6); }

[data-skin="nokia"] .ivyph-row { border-bottom: 1px dotted var(--ph-line); }
[data-skin="nokia"] .ivyph-row:hover { background: var(--ph-chrome); }
[data-skin="nokia"] .ivyph-dot { border-radius: 0; background: var(--ph-accent); color: var(--ph-bg); }

[data-skin="nokia"] .ivyph-compose {
    background: var(--ph-chrome);
    border-top: 2px solid var(--ph-line);
}

[data-skin="nokia"] .ivyph-compose textarea {
    background: var(--ph-bg);
    color: var(--ph-text);
    border: 1px solid var(--ph-line);
    border-radius: 0;
    font-family: var(--ph-mono);
}

[data-skin="nokia"] .ivyph-send {
    border-radius: 0;
    background: var(--ph-line);
    color: var(--ph-text);
}

[data-skin="nokia"] .ivyph-dock {
    background: var(--ph-chrome);
    border-top: 2px solid var(--ph-line);
}

[data-skin="nokia"] .ivyph-dock-btn { color: var(--ph-dim); }
[data-skin="nokia"] .ivyph-dock-btn:hover { color: var(--ph-text); }
[data-skin="nokia"] .ivyph-picker { border-radius: 0; background: var(--ph-chrome); }
[data-skin="nokia"] .ivyph-react { border-radius: 0; background: var(--ph-chrome); }
[data-skin="nokia"] .ivyph-shot { border-color: var(--ph-line); background: var(--ph-chrome); }
[data-skin="nokia"] .ivyph-shot-btn { background: var(--ph-line); color: var(--ph-text); border-radius: 0; }
[data-skin="nokia"] .ivyph-form input,
[data-skin="nokia"] .ivyph-form textarea,
[data-skin="nokia"] .ivyph-edit-box {
    background: var(--ph-bg);
    color: var(--ph-text);
    border: 1px solid var(--ph-line);
    border-radius: 0;
    font-family: var(--ph-mono);
}
[data-skin="nokia"] .ivyph-primary { background: var(--ph-line); color: var(--ph-text); border-radius: 0; }

/* ---------------------------------------------------------- wand menu */

#ivyph_menu_item { cursor: pointer; }
#ivyph_menu_item .ivyph-i { width: 16px; height: 16px; }

/* ---------------------------------------------------------- send-form button */
/* Кнопка внутри панели таверны: подстраивается под её иконки. */

.ivyph-sendbtn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    flex: none;
    cursor: pointer;
    color: inherit;
    opacity: .75;
    transition: opacity .15s;
}

.ivyph-sendbtn:hover { opacity: 1; }
.ivyph-sendbtn .ivyph-i { width: 20px; height: 20px; }
.ivyph-sendbtn.ivyph-has-unread { opacity: 1; color: #d98b6f; }

.ivyph-sendbtn .ivyph-badge {
    top: -4px;
    right: -4px;
    min-width: 16px;
    height: 16px;
    font-size: 10px;
    line-height: 16px;
    box-shadow: 0 0 0 2px rgba(0, 0, 0, .55);
}

/* если кнопка встала в панель — плавающую прячем, чтобы не двоилось */
body.ivyph-mounted .ivyph-launcher { display: none !important; }

@media (prefers-reduced-motion: reduce) {
    .ivyph-typing i { animation: none; opacity: .6; }
}

/* ---------------------------------------------------------- chat mark */
/* Плашка в ленте таверны: телефон что-то принял в этом сообщении.
   Живёт вне корпуса, поэтому переменные задаём явно. */

.ivyph-chatmark {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    margin: 10px 0 2px;
    padding: 5px 11px 5px 9px;
    border-radius: 999px;
    border: 1px solid #3a444d;
    background: rgba(30, 37, 43, .75);
    color: #9fb0bd;
    font: 600 11.5px/1 -apple-system, "Segoe UI", Roboto, sans-serif;
    letter-spacing: .02em;
    cursor: pointer;
    transition: color .15s, border-color .15s, background .15s;
    vertical-align: middle;
}

.ivyph-chatmark:hover {
    color: #e4e8eb;
    border-color: #55636f;
    background: rgba(38, 47, 54, .9);
}

.ivyph-chatmark > .ivyph-i {
    width: 15px;
    height: 15px;
    opacity: .85;
    vertical-align: 0;
}

.ivyph-chatmark span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.ivyph-chatmark span .ivyph-i {
    width: 13px;
    height: 13px;
    vertical-align: 0;
    opacity: .7;
}

.ivyph-chatmark span + span {
    padding-left: 9px;
    border-left: 1px solid #3a444d;
}
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
    replyMode: 'phone',
    autoPhotos: false,
    imageMode: 'tag',
    imageCommand: '/sd quiet=true {{prompt}}',
    imageTag: `<img data-iig-instruction='{"prompt":"{{prompt}}","aspect_ratio":"3:4"}' src="[IMG:GEN]">`,
    timeMacro: '{{getvar::clock}}',
    dateMacro: '{{getvar::date}}',
    profile: '',
    injectDepth: 4,
    autoInject: true,
    contextMode: 'full',
    replyLength: 320,
    compact: false,
    prefill: '',
    skin: 'modern',
    camera: 'iphone4',
    selfieBias: 55,
    scams: false,
    chatBadge: true,
    proseScan: true,
    proactive: true,
    proactiveChance: 12,
    strangerChance: 15,
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
        chat_metadata[MODULE] = { version: 1, contacts: {}, groups: {}, events: [], time: '', date: '' };
    }
    const s = chat_metadata[MODULE];
    if (!s.contacts) s.contacts = {};
    if (!s.groups) s.groups = {};
    if (!s.events) s.events = [];
    return s;
}

const save = () => saveMetadataDebounced();

function keyOf(name) {
    return String(name || '').trim().toLowerCase();
}

// Короткое имя из смс и полное из карточки — один и тот же человек.
// Ищем уже заведённый контакт по первому слову имени, иначе плодятся дубли.
function looksLikeNumber(s) {
    return /^\+?[\d\s()\-]+$/.test(String(s || '').trim());
}

function resolveKey(name) {
    const k = keyOf(name);
    if (!k) return k;
    const cs = store().contacts;
    if (cs[k]) return k;
    if (looksLikeNumber(name)) return k;

    const first = k.split(/\s+/)[0];
    for (const key of Object.keys(cs)) {
        if (looksLikeNumber(key)) continue;
        const keyFirst = key.split(/\s+/)[0];
        if (keyFirst === first && (key.startsWith(k) || k.startsWith(key))) return key;
    }
    return k;
}

// Слияние уже накопившихся дублей: данные объединяем, переписку переносим.
function mergeDuplicates() {
    const s = store();
    let changed = false;

    // выметаем контакты, попавшие из нераскрытых макросов
    for (const key of Object.keys(s.contacts)) {
        if (/\{\{|\}\}/.test(key) || /\{\{|\}\}/.test(s.contacts[key].name || '')) {
            delete s.contacts[key];
            s.events = s.events.filter(e => !/\{\{|\}\}/.test(e.from || ''));
            changed = true;
        }
    }

    for (const key of Object.keys(s.contacts)) {
        const target = resolveKey(s.contacts[key].name);
        if (target === key || !s.contacts[target]) continue;

        const from = s.contacts[key];
        const into = s.contacts[target];
        ['number', 'handle', 'anchor', 'style', 'avatar', 'color'].forEach(f => {
            if (!into[f] && from[f]) into[f] = from[f];
        });
        if (from.name.length > into.name.length) into.name = from.name;

        s.events.forEach(e => { if (keyOf(e.from) === key) e.from = into.name; });
        delete s.contacts[key];
        changed = true;
    }

    if (changed) { save(); render(); }
}

function contact(name, patch) {
    // {{char}}, {{user}} и прочие нераскрытые макросы контактами не становятся
    if (/\{\{|\}\}/.test(String(name || ''))) return null;

    const s = store();
    const k = resolveKey(name);
    if (!k) return null;

    // пришло более полное имя — обновляем, ключ оставляем прежним
    if (s.contacts[k] && String(name).trim().length > s.contacts[k].name.length) {
        s.contacts[k].name = String(name).trim();
    }

    if (!s.contacts[k]) {
        s.contacts[k] = {
            key: k, name: String(name).trim(), label: '', lore: '',
            number: '', handle: '', anchor: '', clothes: '', place: '', style: '', color: '', avatar: '',
        };
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
        group: '',
        reaction: '',
        text: '',
        prompt: '',
        image: '',
        state: '',
        status: '',
        dur: '',
        ts: Date.now(),
        stamp: gameClock(),
        dstate: '',
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
//   SMS|Имя|текст сообщения
//   SMS|Имя|текст|out            — от лица владельца телефона
//   PHOTO|Имя|english image prompt|подпись
//   CALL|Имя|incoming            — также missed, declined, answered, ended|4:12
//   VOICE|Имя|0:23
//   CONTACT|Полное Имя|+1 555 0100|@ник
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

    let from = parts.shift() || '';
    if (!from) return null;

    // «Имя@Группа» — сообщение от этого человека в групповой чат
    let group = '';
    if (from.includes('@')) {
        const [who, where] = from.split('@');
        from = who.trim();
        group = where.trim();
    }

    switch (verb) {
        case 'SMS':
        case 'MSG':
            if (store().contacts[resolveKey(from)]?.blocked) {
                logDebug(`${from} заблокирован, сообщение отброшено`);
                return null;
            }
            return addEvent({ mesId, type: 'sms', dir, from, group, text: parts.join('|') });

        case 'PHOTO':
        case 'IMG': {
            // Телефон уже мог отправить фото по просьбе. Если модель следом
            // прислала свой маркер, это дубль того же снимка — пропускаем.
            const recent = store().events.some(e =>
                e.type === 'photo'
                && resolveKey(e.from) === resolveKey(from)
                && Date.now() - e.ts < 90000);
            if (recent && dir === 'in') {
                logDebug(`дубль фото от ${from} пропущен`);
                return null;
            }
            return addEvent({
                mesId, type: 'photo', dir, from, group,
                prompt: parts.shift() || '',
                text: parts.join('|'),
                state: 'idle',
            });
        }

        case 'VOICE':
            return addEvent({ mesId, type: 'voice', dir, from, dur: parts.shift() || '0:07' });

        case 'CALL': {
            const raw = (parts.shift() || 'incoming').toLowerCase().trim();
            const map = {
                ring: 'incoming', ringing: 'incoming', calling: 'incoming', in: 'incoming',
                входящий: 'incoming', звонит: 'incoming',
                miss: 'missed', missed: 'missed', пропущенный: 'missed',
                decline: 'declined', declined: 'declined', rejected: 'declined', сброшен: 'declined',
                answer: 'answered', answered: 'answered', picked: 'answered', отвечен: 'answered',
                out: 'outgoing', outgoing: 'outgoing', исходящий: 'outgoing',
                end: 'ended', ended: 'ended', завершён: 'ended',
                noanswer: 'noanswer', 'no answer': 'noanswer',
            };
            const status = map[raw] || (dir === 'out' ? 'outgoing' : 'incoming');
            return addEvent({ mesId, type: 'call', dir, from, status, dur: parts.shift() || '' });
        }

        case 'GROUP': {
            const s = store();
            const key = keyOf(from);
            s.groups[key] = {
                key,
                name: from,
                members: (parts.shift() || '').split(',').map(x => x.trim()).filter(Boolean),
            };
            s.groups[key].members.forEach(m => contact(m));
            save();
            return null;
        }

        case 'SCAM':
            return addEvent({ mesId, type: 'sms', dir: 'in', from, text: parts.join('|'), scam: true });

        case 'TIME': {
            const s = store();
            if (!looksUnfilled(from)) s.time = from;
            const d = parts.shift();
            if (d && !looksUnfilled(d)) s.date = d;
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

// sillyimages не имеет слэш-команды: она ловит тег в сообщении чата,
// генерирует картинку, заливает её на сервер таверны и подменяет src на
// реальный путь. Поэтому кладём служебное сообщение с тегом, ждём подмены,
// забираем путь и прячем это сообщение из сцены.
async function generateViaTag(ev, prompt) {
    const ctx = getContext();
    const safe = prompt.replace(/"/g, "'").replace(/[\r\n]+/g, ' ').trim();
    const tag = settings().imageTag.replace('{{prompt}}', () => safe);
    const token = `c${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Носитель тега — ОБЫЧНОЕ сообщение персонажа. sillyimages сканирует
    // только видимые ответы, поэтому не помечаем его системным и не прячем
    // визуально, пока картинка не готова: иначе расширение его пропустит.
    const carrier = {
        name: ctx.name2 || 'Phone',
        is_user: false,
        is_system: false,
        send_date: typeof ctx.getMessageTimeStamp === 'function' ? ctx.getMessageTimeStamp() : new Date().toISOString(),
        mes: tag,
        extra: { ivyph_carrier: token },
    };
    ctx.chat.push(carrier);
    const idx = ctx.chat.length - 1;
    ctx.addOneMessage(carrier);
    await ctx.saveChat();

    // sillyimages подключается к реальному потоку сообщений. Даём ей тот же
    // сигнал, что и настоящий ответ модели, и ждём — событие может быть
    // асинхронным, поэтому шлём и await, и обычный emit.
    try { await eventSource.emit(event_types.MESSAGE_RECEIVED, idx); } catch { /* ignore */ }
    try { await eventSource.emit(event_types.CHARACTER_MESSAGE_RENDERED, idx); } catch { /* ignore */ }
    try { await eventSource.emit(event_types.MESSAGE_UPDATED, idx); } catch { /* ignore */ }

    // ждём подмены [IMG:GEN] на реальный путь — до 3 минут
    for (let i = 0; i < 180; i++) {
        await wait(1000);
        // перечитываем именно из живого chat — sillyimages пишет туда же
        const body = String(getContext().chat?.[idx]?.mes || '');
        const src = body.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1];

        if (src && !/IMG:GEN/i.test(src) && !/error\.svg/i.test(src)) {
            ev.image = src;
            ev.state = 'done';
            removeCarrier(token);
            return true;
        }
        if (/error\.svg/i.test(body)) {
            const why = body.match(/title=["']([^"']+)["']/i)?.[1] || 'unknown';
            logDebug(`sillyimages: ${why}`);
            break;
        }
    }

    removeCarrier(token);
    return false;
}

// Убираем носитель из чата целиком после того, как картинка забрана
// (или не пришла). Именно удаляем, а не оставляем пустой системный след.
// Ищем носитель по метке, а не по индексу: за время генерации в чат могло
// прийти новое сообщение, и индекс уехал бы на чужое.
async function removeCarrier(token) {
    try {
        const ctx = getContext();
        const i = (ctx.chat || []).findIndex(m => m?.extra?.ivyph_carrier === token);
        if (i < 0) return;
        ctx.chat.splice(i, 1);
        await ctx.saveChat();
        // перерисовываем ленту, иначе съедут mesid у следующих сообщений
        if (typeof ctx.reloadCurrentChat === 'function') await ctx.reloadCurrentChat();
        else document.querySelector(`#chat .mes[mesid="${i}"]`)?.remove();
    } catch { /* не критично */ }
}

async function generatePhoto(ev) {
    if (!ev || ev.state === 'pending') return;
    const s = settings();
    const c = contact(ev.from);
    const cleanPrompt = stripPanels(ev.prompt).split('\n')[0].trim();
    // Имя обязано быть в промпте: по нему срабатывает режим «Send on match»
    // в sillyimages и подставляется референс внешности. Без имени модель
    // рисует случайное лицо.
    // Референс подтягивается только если имя встретилось в промпте, причём
    // расширения генерации требуют его с заглавной буквы. Приводим к такому виду.
    const capitalize = s => String(s || '')
        .split(/\s+/)
        .map(w => w ? w[0].toUpperCase() + w.slice(1) : w)
        .join(' ')
        .trim();

    const who = ev.dir === 'in' ? capitalize(c?.name || ev.from) : '';
    // Качество упоминаем дважды — в начале и в конце. Модели генерации тянут
    // к красивой картинке, и одного упоминания в середине они не слышат.
    const cam = CAMERAS[s.camera] || CAMERAS.none;
    const prompt = [cam.tech, who, c?.anchor, c?.clothes, cleanPrompt, cam.tail]
        .filter(Boolean).join(', ');

    ev.state = 'pending';
    render();

    let ok = false;
    if (s.imageMode === 'tag') {
        ok = await generateViaTag(ev, prompt);
    } else {
        const url = extractUrl(await runSlash(s.imageCommand.replace('{{prompt}}', prompt)));
        if (url) { ev.image = url; ev.state = 'done'; ok = true; }
    }

    if (!ok) { ev.state = 'error'; logDebug(`картинка не пришла: ${prompt.slice(0, 50)}`); }
    save();
    render();
}

// ---------------------------------------------------------------- generation
// Телефон умеет генерировать ответ сам, отдельным запросом. Это позволяет
// второстепенному персонажу отвечать своим голосом, а не устами активной
// карточки. Профиль подключения берётся из настроек: можно поставить
// модель дешевле основной.

// Профили камеры. Задача — чтобы фото выглядело снятым самим персонажем
// на его телефон, а не студийным кадром со стороны.
const CAMERAS = {
    none: { label: 'Без обработки', tech: '', tail: '' },
    modern: {
        label: 'Современный смартфон',
        tech: 'candid smartphone snapshot',
        tail: 'ordinary available light, slightly careless framing, no professional lighting, '
            + 'no colour grading',
    },
    iphone4: {
        label: 'Телефон 2010-х',
        tech: 'low quality amateur snapshot taken on a cheap 2011 phone camera',
        tail: 'tiny 5MP sensor, flat washed-out colours, crushed murky shadows, blown-out highlights, '
            + 'soft unsharp mushy detail, visible compression, harsh direct on-camera flash, '
            + 'crooked handheld framing, mediocre exposure, '
            + 'NOT a professional photo, NOT a DSLR, no HDR, no bokeh, no studio lighting, '
            + 'no colour grading, no retouching, unflattering and ordinary',
    },
    oldphone: {
        label: 'Старый кнопочный',
        tech: 'very low quality photo from a mid-2000s VGA camera phone',
        tail: 'extremely low resolution, smeared mushy detail, heavy compression artifacts, '
            + 'dull greyish colours, dim underexposed, motion blur, crooked framing, '
            + 'NOT a professional photo, NOT a DSLR, no HDR, no bokeh, no retouching, '
            + 'looks like a bad phone picture from 2006',
    },
    film: {
        label: 'Плёночная мыльница',
        tech: 'snapshot from a cheap point-and-shoot film camera',
        tail: 'direct flash, warm faded colours, soft focus, slight vignetting, crooked framing, '
            + 'no HDR, no colour grading, amateur',
    },
};

const SHOT_RULE = 'It must look taken BY this person on their own phone — never a posed studio '
    + 'portrait, never a third-person shot of them from across the room unless someone else '
    + 'is holding the camera.';

const SHOT_KINDS = {
    selfie: 'A selfie held at arm\'s length: their face fills most of the frame, '
        + 'looking into the lens, arm visible at the edge.',
    mirror: 'A mirror selfie: they are reflected in a mirror with the phone visible in frame.',
    subject: 'A photo of the specific thing the owner asked about, held up or lying in front of them, '
        + 'filling the frame. The person may appear only as a hand.',
    around: 'A photo of what is in front of them right now — the room, the street, the view — '
        + 'taken from where they are standing or sitting. No face.',
    object: 'A close-up of a single object near them, shot from above or held in one hand.',
};

// Просьба может прямо называть предмет — тогда снимаем его, а не лицо.
function pickShot(request, selfieBias) {
    const r = String(request || '').toLowerCase().trim();

    // Просьба про них самих: строго по отдельным словам, иначе «your garden»
    // ловилось как «you» и всё превращалось в селфи.
    const aboutThem = /\b(you|yourself|selfie|себя|тебя|селфи)\b/.test(r)
        || /\byour\s+(face|hair|outfit|smile|eyes)\b/.test(r)
        || /(сво[её]\s+лицо|как\s+ты\s+выглядишь)/.test(r);

    // Просьба про конкретный предмет или место: «show me your shoes», «фото сада»
    const thing = r.match(/\b(?:show me|send me|see)\s+(?:your\s+|the\s+|a\s+)?([a-z][a-z\s]{2,30})/)
        || r.match(/(?:покажи|пришли|скинь)\s+(?:мне\s+)?(?:сво[йюяё]\s+)?([а-яё][а-яё\s]{2,30})/);

    const named = thing && !/^(you|yourself|себя|тебя)\b/.test(thing[1].trim());

    if (named && !aboutThem) return 'subject';
    if (aboutThem) return Math.random() < 0.7 ? 'selfie' : 'mirror';

    const roll = Math.random() * 100;
    const bias = Number(selfieBias) || 55;
    if (roll < bias * 0.75) return 'selfie';
    if (roll < bias) return 'mirror';
    if (roll < bias + (100 - bias) * 0.5) return 'around';
    return 'object';
}

const DSTATE = { sent: ' · sent', delivered: ' · delivered', read: ' · read' };

const REACTIONS = ['\u2764\uFE0F', '\uD83D\uDE02', '\uD83D\uDC4D', '\uD83D\uDE2E', '\uD83D\uDE22', '\uD83D\uDD25'];

const SCAM_POOL = [
    'FINAL NOTICE: your vehicle warranty is about to expire. Reply YES to renew.',
    'Your package could not be delivered. Update your address: bit.ly/2pkgfix',
    'Congratulations! You have been selected for a $1,000 gift card. Claim within 24h.',
    'Bank alert: unusual sign-in detected. Verify your identity to avoid suspension.',
    'Hey, is this still your number? I got it from an old friend :)',
];

// За один ход телефон не должен слать больше одного фонового запроса:
// разбор прозы и «контакт пишет сам» вместе давали двойной расход токенов.
let busyTurn = false;

const debugLog = [];

function logDebug(msg) {
    debugLog.push(`${new Date().toLocaleTimeString()} — ${msg}`);
    if (debugLog.length > 40) debugLog.shift();
}

// UI-панели пресета (HEADER, CROSSROADS, COMMENTS, PSYCHE и т.п.) — это не
// проза сцены. Вырезаем их, иначе они попадают в промпт картинки и в ответы.
function stripPanels(text) {
    return String(text || '')
        .replace(BLOCK_RE, '')
        .replace(/[⟦\[]{1,2}[^⟧\]\n]*[⟧\]]{1,2}/g, '')
        .replace(/^\s*(HEADER|CROSSROADS|COMMENTS|PSYCHE|BODY|VITALITY|RELATIONS|BACKSTAGE|STATE|VARS|GOAL|PLAN)\b.*$/gim, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function sceneContext(limit = 6) {
    try {
        const ctx = getContext();
        return (ctx.chat || [])
            .slice(-limit)
            .map(m => `${m.name}: ${stripPanels(m.mes)}`)
            .filter(l => l.replace(/^[^:]+:\s*/, '').trim())
            .join('\n');
    } catch { return ''; }
}

function cardContext() {
    try {
        const ctx = getContext();
        const chars = ctx.characters || [];
        const bits = [];

        // все персонажи чата: в группе — каждый участник
        const cast = [];
        const gid = ctx.groupId ?? ctx.group_id;
        if (gid && Array.isArray(ctx.groups)) {
            const g = ctx.groups.find(x => String(x.id) === String(gid));
            (g?.members || []).forEach(f => {
                const ch = chars.find(c => c.avatar === f);
                if (ch) cast.push(ch);
            });
        } else {
            const cid = ctx.characterId ?? ctx.this_chid;
            if (chars[cid]) cast.push(chars[cid]);
        }

        cast.forEach(ch => {
            const card = [ch.description, ch.personality, ch.scenario]
                .filter(Boolean).join('\n');
            if (card) bits.push(`### ${ch.name}\n${card}`);
        });

        // персона игрока
        const persona = ctx.powerUserSettings?.persona_description
            || ctx.power_user?.persona_description || '';
        if (ctx.name1) {
            bits.push(`### Phone owner\nThe owner of this phone is ${ctx.name1}.` +
                (persona ? `\n${persona}` : ''));
        }

        // точные имена и номера, чтобы модель не выдумывала фамилии
        const known = Object.values(store().contacts).map(c => {
            const parts = [c.name];
            if (c.number) parts.push(`(${c.number})`);
            if (c.lore) parts.push(`— ${c.lore}`);
            return parts.join(' ');
        }).join('\n');

        if (known) {
            bits.push(`### Contacts in this phone\n${known}\n`
                + `Use these exact names and these relationships. Do not invent surnames or relatives.`);
        }

        return bits.join('\n\n');
    } catch { return ''; }
}

// Лорбук: подтягиваем записи, чьи ключи встречаются в переписке или сцене.
// Именно это чинит путаницу с фамилиями и родственными связями.
async function lorebookContext(needle) {
    try {
        const wi = await import('../../../world-info.js');
        if (typeof wi.getSortedEntries !== 'function') return '';
        const entries = await wi.getSortedEntries();
        const hay = String(needle || '').toLowerCase();

        const hits = entries.filter(e => {
            if (e.disable) return false;
            return (e.key || []).some(k => k && hay.includes(String(k).toLowerCase()));
        }).slice(0, 8);

        return hits.length
            ? `### Lore\n${hits.map(e => String(e.content || '').trim()).filter(Boolean).join('\n\n')}`
            : '';
    } catch { return ''; }
}

async function buildReplyPrompt(c, outgoing) {
    const s = settings();
    const thread = store().events
        .filter(e => keyOf(e.from) === c.key && e.type === 'sms')
        .slice(-12)
        .map(e => `${e.dir === 'out' ? 'OWNER' : c.name}: ${e.text}`)
        .join('\n');

    const scene = sceneContext(s.contextMode === 'full' ? 8 : 4);
    const parts = [];

    if (s.contextMode === 'full') {
        const card = cardContext();
        if (card) parts.push(card);
        const lore = await lorebookContext(
            `${scene}\n${thread}\n${c.name} ${c.lore || ''} ${outgoing || ''}`);
        if (lore) parts.push(lore);
    }
    parts.push(`Current scene:\n${scene}`);

    const era = gameDate();
    if (era) {
        parts.push(`In-world date: ${era}. Match the messaging conventions of that time — `
            + `what abbreviations, punctuation and emoji would plausibly exist then.`);
    }
    if (c.anchor) parts.push(`${c.name}: ${c.anchor}`);
    parts.push(`Text conversation so far:\n${thread}`);
    if (c.lore) parts.push(`### Who ${c.name} is\n${c.lore}`);
    if (c.style) parts.push(`### How ${c.name} texts\n${c.style}`);

    parts.push([
        `Write the next text message from ${c.name} only.`,
        `Their texting voice must come from who they are, not from a generic texting register.`,
        `Derive it from their age, era, schooling, work, temperament and mood right now:`,
        `punctuation and capitalisation, sentence length, slang or formality, abbreviations,`,
        `whether they use emoji at all, whether they double-text or send one careful block,`,
        `typos or none. A guarded person writes differently from a warm one; someone raised on`,
        `letters writes differently from someone raised on a keypad. Two contacts must never sound alike.`,
        `Keep it consistent with how ${c.name} already texted earlier in this thread.`,
        `Output ONLY the body of the text message. Under ${s.replyLength} characters.`,
        `No quotation marks, no name prefix, no narration, no asterisks, no dashes for speech,`,
        `no scene description, no UI panels, no headers, no choices, no commentary.`,
        `This is a phone message, not a roleplay reply — one short block of text and nothing else.`,
        `This phone can send photos and the character knows how to use it. Never write that you`,
        `cannot send pictures, do not know how, will send it later, or will show it in person.`,
        `If the owner asks to see something or someone, that request is handled elsewhere —`,
        `just answer the human part of the message naturally and leave the photo alone.`,
        `Default behaviour is to REPLY. People answer their phone messages, especially people who`,
        `care about the owner. Answer with exactly [silence] ONLY in a genuinely strong case:`,
        `they are in an active fight with the owner and have said they are done talking, they are`,
        `asleep at this hour, or the scene shows they physically cannot look at the phone right now.`,
        `Warmth, worry, irritation, being busy or being at work are NOT reasons to stay silent —`,
        `a short or curt reply is what happens instead. Never go silent on a plea for help.`,
    ].join(' '));
    return parts.filter(Boolean).join('\n\n');
}

// Модель иногда всё равно скатывается в полноценный ответ по сцене:
// с панелями, прозой и репликами через тире. В смс это недопустимо —
// оставляем только сам текст сообщения.
function sanitizeReply(raw) {
    let t = stripPanels(String(raw || ''));

    // выкидываем строки-панели и служебные пометки
    t = t.split('\n')
        .filter(l => !/^\s*(\[|⟦|#|\*\*|HEADER|CROSSROADS|COMMENTS|PSYCHE|BODY|STATE|VARS|GOAL|PLAN)/i.test(l))
        .join('\n')
        .trim();

    // абзац прозы: берём только первый блок до пустой строки
    if (/\n\s*\n/.test(t)) t = t.split(/\n\s*\n/)[0].trim();

    // строки-действия через тире — это уже сцена, а не сообщение
    t = t.split('\n').filter(l => !/^\s*[—–-]\s/.test(l)).join(' ').trim();

    // курсив-ремарки вида *он усмехнулся*
    t = t.replace(/\*[^*]{3,}\*/g, '').replace(/\s{2,}/g, ' ').trim();

    // подпись имени в начале
    t = t.replace(/^[A-Za-zА-Яа-яЁё .'-]{2,20}:\s*/, '').trim();

    return t;
}

async function askModel(prompt) {
    const s = settings();
    let previous = '';
    try {
        if (s.profile) {
            const cur = await runSlash('/profile');
            previous = String(cur?.pipe || '').trim();
            await runSlash(`/profile ${s.profile}`);
        }
        const ctx = getContext();
        if (typeof ctx.generateQuietPrompt === 'function') {
            let out;
            // Новая сигнатура — объектом. skipWIAN обязателен: иначе в запрос
            // уезжают лорбук и авторские заметки пресета, и модель пишет
            // полноценный пост со всеми панелями вместо короткой смс.
            try {
                out = await ctx.generateQuietPrompt({
                    quietPrompt: prompt,
                    quietToLoud: false,
                    skipWIAN: true,
                    quietName: 'Phone',
                    // параметр в токенах: даём запас, иначе модель обрывается на полуслове
                    responseLength: Math.max(200, Math.ceil((Number(s.replyLength) || 320) / 2)),
                });
            } catch {
                out = await ctx.generateQuietPrompt(prompt, false, true);
            }
            return sanitizeReply(out);
        }
        const flat = prompt.replace(/\|/g, '\\|').replace(/\n/g, ' ');
        return sanitizeReply(String((await runSlash(`/genraw ${flat}`))?.pipe || ''));
    } catch (err) {
        logDebug(`ошибка запроса: ${err?.message || err}`);
        return '';
    } finally {
        if (previous) await runSlash(`/profile ${previous}`);
    }
}

const wait = ms => new Promise(r => setTimeout(r, ms));

async function generateReply(c, outgoing, sentEvent, opts = {}) {
    try {
        // доставка занимает время, как в жизни
        if (sentEvent) {
            await wait(700 + Math.random() * 900);
            sentEvent.dstate = 'delivered';
            render();
            await wait(900 + Math.random() * 2200);
            sentEvent.dstate = 'read';
            render();
        }

        live.typing = c.key;
        render();

        let prompt = await buildReplyPrompt(c, outgoing);
        if (opts.photoPending) {
            prompt += `\n\nThe owner asked to see something and the photo is already being taken —`
                + ` it will arrive right after this message. Reply only to the human part in one short line.`
                + ` Do not mention sending, not sending, or postponing a picture. Never answer [silence] here.`;
        }

        let text = await askModel(prompt);
        text = String(text || '').trim().replace(/^["']|["']$/g, '');

        // Рубим только явный лонгрид и строго по концу предложения:
        // обрывать смс на полуслове хуже, чем показать её длиннее нормы.
        const cap = Math.max(240, Number(settings().replyLength) || 320);
        if (text.length > cap * 3) {
            const room = text.slice(0, cap * 2);
            const end = Math.max(
                room.lastIndexOf('. '), room.lastIndexOf('! '), room.lastIndexOf('? '),
                room.lastIndexOf('.\n'), room.lastIndexOf('…'),
            );
            text = (end > cap * 0.4 ? room.slice(0, end + 1) : room).trim();
            logDebug('ответ был длиной с пост, обрезан по концу фразы');
        }

        // персонаж может прочитать и не ответить — это тоже ответ
        if (!text || /^\[?silence\]?$/i.test(text)) {
            if (!opts.photoPending) logDebug(`${c.name} прочитал и промолчал`);
            return;
        }

        // печатать длинное сообщение дольше
        await wait(Math.min(600 + text.length * 22, 5200));

        addEvent({ mesId: null, type: 'sms', dir: 'in', from: c.name, text });
        save();
        render();
        pushInjection();
        logDebug(`ответ от ${c.name}: ${text.slice(0, 40)}…`);
    } catch (err) {
        logDebug(`ошибка генерации: ${err?.message || err}`);
        console.error('[IVY Phone]', err);
    } finally {
        live.typing = '';
        render();
    }
}

// Персонажи иногда пишут первыми. Раз в несколько ходов, с шансом из настроек.
// Изредка это незнакомый номер — потерянный человек из прошлого, ошибка номером.
async function maybeProactive() {
    const s = settings();
    if (!s.proactive || s.replyMode === 'none') return;
    if (Math.random() * 100 > (s.proactiveChance || 0)) return;

    const cs = Object.values(store().contacts)
        .filter(c => c.name && !c.blocked && !/^\+?[\d\s()-]+$/.test(c.name));
    const stranger = Math.random() * 100 < (s.strangerChance || 0);
    if (!cs.length && !stranger) return;

    const scene = sceneContext(6);
    let who;
    let brief;

    if (stranger) {
        who = `+1 ${200 + Math.floor(Math.random() * 700)} 555 0${100 + Math.floor(Math.random() * 899)}`;
        brief = `Write a single text message to the phone owner from an unknown number: `
            + `someone from their past, a wrong number, or a stranger who has the wrong idea. `
            + `It should fit the world and quietly raise a question. No signature, no name.`;
    } else {
        const c = cs[Math.floor(Math.random() * cs.length)];
        who = c.name;
        brief = (c.lore ? `Who ${c.name} is: ${c.lore}\n` : '')
            + (c.style ? `How ${c.name} texts: ${c.style}\n` : '')
            + `Write a single unprompted text message from ${c.name} to the phone owner. `
            + `Their punctuation, slang, emoji use and length must follow their character, not a generic texting voice. `
            + `Something they would send on their own right now — a question, a worry, a small piece of news. `
            + `It must fit the scene and their voice. Do not reference anything that has not happened.`;
    }

    const text = await askModel([
        cardContext(),
        await lorebookContext(`${scene} ${who}`),
        `Current scene:\n${scene}`,
        brief,
        `Plain text only, under 200 characters, no quotes, no narration, no name prefix.`,
    ].filter(Boolean).join('\n\n'));

    const clean = String(text || '').trim().replace(/^["']|["']$/g, '');
    if (!clean) return;
    if (clean.length > 400) { logDebug('инициативное смс пришло постом, отброшено'); return; }

    addEvent({ mesId: null, type: 'sms', dir: 'in', from: who, text: clean });
    save();
    render();
    pushInjection();
    logDebug(`${who} написал сам: ${clean.slice(0, 40)}…`);
}

// Мошенники: локальный пул, без запросов к модели и без трат токенов.
function maybeScam() {
    if (!settings().scams || Math.random() > 0.12) return;
    const number = `+1 ${800 + Math.floor(Math.random() * 99)} 555 0${100 + Math.floor(Math.random() * 899)}`;
    addEvent({
        mesId: null, type: 'sms', dir: 'in', from: number,
        text: SCAM_POOL[Math.floor(Math.random() * SCAM_POOL.length)], scam: true,
    });
    save();
    render();
}

// ---------------------------------------------------------------- injection
// Инструкция уходит инжектом на заданную глубину, а не правкой пресета.

function instructionText() {
    const s = settings();
    if (s.compact) {
        return '[Phone] To send texts, calls or photos, emit: [PHONE] SMS|Name|text / PHOTO|Name|english image prompt|caption / CALL|Name|incoming|missed / TIME|HH:MM|date [/PHONE]';
    }
    return [
        '[Phone system]',
        'When a character texts, calls, or sends a photo, put it in a [PHONE] block at the end of your reply.',
        'One event per line, fields separated by |:',
        'SMS|Name|message text',
        'PHOTO|Name|english prompt describing the shot|caption',
        'VOICE|Name|0:23',
        'CALL|Name|incoming     (also: missed, declined, answered, ended|4:12)',
        'CONTACT|Full Name|+1 555 0100|@handle',
        'TIME|HH:MM|weekday, month DD, YYYY',
        'Rules: never repeat the text of a message in the prose — describe only the reaction.',
        'Any texting or calling that happens in the scene must also appear in the block — including',
        'messages the phone owner sends and calls the owner makes. If the prose says someone texted,',
        'called, hung up or missed a call, the matching line is mandatory in the same reply.',
        'When the owner asks for a picture, you MUST answer with a PHOTO line inside the block.',
        'Never refuse a photo, never say you cannot send images, never describe the photo in prose instead.',
        'Photo prompts in English, framing only: place, light, angle. Max 4 lines per block.',
    ].join('\n');
}

// Сводка последних событий телефона. Уходит в контекст вместе с инструкцией,
// поэтому персонаж помнит переписку и она влияет на сцену — даже те смс,
// что были сгенерированы отдельным запросом и в чат не попадали.
function phoneLog(limit = 10) {
    const evs = store().events.slice(-limit);
    if (!evs.length) return '';

    const lines = evs.map(e => {
        const who = e.dir === 'out' ? 'owner' : e.from;
        const to = e.dir === 'out' ? `to ${e.from}` : '';
        if (e.type === 'call') return `[call] ${e.from} — ${e.status}${e.dur ? ` ${e.dur}` : ''}`;
        if (e.type === 'photo') return `[photo] ${who} ${to} sent a photo${e.text ? `: ${e.text}` : ''}`;
        if (e.type === 'voice') return `[voice] ${who} ${to} — ${e.dur}`;
        return `[text] ${who} ${to}: ${e.text}`;
    });

    return `Recent phone activity (already happened, do not repeat it): ${lines.join(' / ')}`;
}

async function pushInjection() {
    const s = settings();
    if (!s.autoInject || !s.enabled) return;
    const body = [instructionText(), phoneLog()].filter(Boolean).join('\n\n');
    const flat = body.replace(/\|/g, '\\|').replace(/\n/g, ' / ');
    await runSlash(`/inject id=ivyphone position=chat depth=${s.injectDepth} scan=false ${flat}`);
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

// Метка прямо в ленте: маркер вырезан, и без неё непонятно, что телефон
// вообще что-то получил в этом сообщении.
function markMessage(mesId) {
    if (!settings().chatBadge) return;
    const el = document.querySelector(`#chat .mes[mesid="${mesId}"]`);
    if (!el || el.querySelector('.ivyph-chatmark')) return;

    const evs = store().events.filter(e => e.mesId === mesId);
    if (!evs.length) return;

    const sms = evs.filter(e => e.type === 'sms' || e.type === 'voice').length;
    const photos = evs.filter(e => e.type === 'photo').length;
    const calls = evs.filter(e => e.type === 'call').length;

    const bits = [];
    if (sms) bits.push(`${icon('message')}${sms}`);
    if (photos) bits.push(`${icon('image')}${photos}`);
    if (calls) bits.push(`${icon('phone')}${calls}`);
    if (!bits.length) return;

    const mark = el.querySelector('.mes_text') || el;
    const chip = el.ownerDocument.createElement('div');
    chip.className = 'ivyph-chatmark';
    chip.title = 'Открыть телефон';
    chip.innerHTML = `${icon('device')}<span>${bits.join('</span><span>')}</span>`;
    chip.addEventListener('click', () => togglePhone(true));
    mark.appendChild(chip);
}

function markAll() {
    if (!settings().chatBadge) return;
    const seen = new Set(store().events.map(e => e.mesId).filter(v => v != null));
    seen.forEach(markMessage);
}

function scrubAll() {
    // служебные сообщения генерации прячем всегда, независимо от настройки
    try {
        const ctx = getContext();
        (ctx.chat || []).forEach((m, i) => {
            if (m?.extra?.ivyph_carrier) {  // метка носителя — строка-токен
                document.querySelector(`#chat .mes[mesid="${i}"]`)
                    ?.style.setProperty('display', 'none', 'important');
            }
        });
    } catch { /* чат может быть ещё не готов */ }

    if (settings().hideMarkers) {
        document.querySelectorAll('#chat .mes').forEach(scrubMessage);
    }
    markAll();
}

// ---------------------------------------------------------------- icons
// Встроенные SVG вместо Font Awesome: не зависят от версии FA в таверне
// и от того, платная иконка или бесплатная.

const ICONS = {
    device: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.4"/><line x1="10.2" y1="18.6" x2="13.8" y2="18.6"/>',
    wifi: '<path d="M1.8 8.4a15.5 15.5 0 0 1 20.4 0" stroke-width="2"/><path d="M5.4 12.2a10.3 10.3 0 0 1 13.2 0" stroke-width="2"/><path d="M8.9 15.9a5.2 5.2 0 0 1 6.2 0" stroke-width="2"/><circle cx="12" cy="19.6" r="1.3" fill="currentColor" stroke="none"/>',
    battery: '<rect x="1.5" y="7.5" width="17.5" height="9" rx="2.6" stroke-width="1.6"/><path d="M21.3 10.6v2.8" stroke-width="2.2"/><rect x="3.4" y="9.4" width="10.5" height="5.2" rx="1.4" fill="currentColor" stroke="none"/>',
    camera: '<path d="M3 8.4h3.6L8.2 6h7.6l1.6 2.4H21v10H3Z"/><circle cx="12" cy="13.2" r="3.4"/>',
    dots: '<circle cx="12" cy="5.2" r="1.8" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none"/><circle cx="12" cy="18.8" r="1.8" fill="currentColor" stroke="none"/>',
    expand: '<polyline points="9,3.8 3.8,3.8 3.8,9"/><polyline points="15,3.8 20.2,3.8 20.2,9"/><polyline points="9,20.2 3.8,20.2 3.8,15"/><polyline points="15,20.2 20.2,20.2 20.2,15"/>',
    save: '<path d="M12 3.8v11.4"/><polyline points="7.6,10.8 12,15.3 16.4,10.8"/><path d="M4.6 17.6v2h14.8v-2"/>',
    image: '<rect x="3" y="4.5" width="18" height="15" rx="2.4"/><circle cx="8.6" cy="9.8" r="1.7"/><path d="M3.4 17.2 8.9 12l4 3.6 3.2-2.6 4.5 4.2"/>',
    refresh: '<path d="M20.2 11.4a8.3 8.3 0 1 1-2.4-5.6"/><polyline points="20.6,3.6 20.6,9 15.2,9"/>',
    trash: '<path d="M4.5 6.5h15"/><path d="M9.5 6.5V4.8h5v1.7"/><path d="M6.4 6.5 7.3 20h9.4l.9-13.5"/><path d="M10.3 10v6M13.7 10v6"/>',
    wand: '<path d="M4.5 19.5 15 9"/><path d="M14 5.5 15.4 7 17 5.6 15.6 4.2Z"/><path d="M18.5 9.5v2.6M17.2 10.8h2.6M6.5 3.4v2M5.2 4.4h2.6"/>',
    chevronLeft: '<polyline points="14.5,4.8 8,12 14.5,19.2"/>',
    info: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11.2" x2="12" y2="16.6"/><circle cx="12" cy="7.7" r="1" fill="currentColor" stroke="none"/>',
    plus: '<line x1="12" y1="5.2" x2="12" y2="18.8"/><line x1="5.2" y1="12" x2="18.8" y2="12"/>',
    close: '<line x1="6.2" y1="6.2" x2="17.8" y2="17.8"/><line x1="17.8" y1="6.2" x2="6.2" y2="17.8"/>',
    message: '<path d="M20.6 12.2c0 3.9-3.8 7.1-8.5 7.1-1 0-2-.15-2.9-.42L4.2 20.6l1.4-3.6c-1.3-1.3-2.1-3-2.1-4.8 0-3.9 3.8-7.1 8.5-7.1s8.6 3.2 8.6 7.1Z"/>',
    messageOff: '<path d="M20.6 12.2c0 3.9-3.8 7.1-8.5 7.1-1 0-2-.15-2.9-.42L4.2 20.6l1.4-3.6c-1.3-1.3-2.1-3-2.1-4.8 0-3.9 3.8-7.1 8.5-7.1s8.6 3.2 8.6 7.1Z"/><line x1="3.4" y1="20.8" x2="20.6" y2="3.6"/>',
    user: '<circle cx="12" cy="8.4" r="3.7"/><path d="M4.9 20c.9-3.5 3.6-5.5 7.1-5.5s6.2 2 7.1 5.5"/>',
    group: '<circle cx="9" cy="9" r="3.1"/><path d="M3.4 19.4c.7-2.9 2.9-4.6 5.6-4.6s4.9 1.7 5.6 4.6"/><path d="M15.6 6.2a3.1 3.1 0 0 1 0 5.9"/><path d="M17 14.9c2.2.3 3.9 1.9 4.5 4.4"/>',
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

// ---------------------------------------------------------------- ST data
// Тянем имена и аватарки из карточки персонажа, персоны и группового чата.
// Всё в try/catch: поля контекста отличаются между версиями таверны,
// и лучше остаться без аватарки, чем уронить расширение.

function charAvatarUrl(file) {
    if (!file || file === 'none') return '';
    return `/thumbnail?type=avatar&file=${encodeURIComponent(file)}`;
}

function personaAvatarUrl(file) {
    if (!file) return '';
    return `/User Avatars/${encodeURIComponent(file)}`;
}

function syncFromContext() {
    try {
        const ctx = getContext();
        const chars = ctx.characters || [];

        const add = (ch) => {
            if (!ch?.name || /\{\{|\}\}/.test(ch.name)) return;
            const c = contact(ch.name);
            if (c && !c.avatar) c.avatar = charAvatarUrl(ch.avatar);
        };

        // групповой чат: заводим карточку на каждого участника
        const gid = ctx.groupId ?? ctx.group_id;
        if (gid && Array.isArray(ctx.groups)) {
            const g = ctx.groups.find(x => String(x.id) === String(gid));
            (g?.members || []).forEach(file => add(chars.find(c => c.avatar === file)));
        }

        // одиночный чат
        const cid = ctx.characterId ?? ctx.this_chid;
        if (cid !== undefined && cid !== null && chars[cid]) add(chars[cid]);

        // персона — владелец телефона
        const s = store();
        s.owner = {
            name: ctx.name1 || 'Me',
            avatar: personaAvatarUrl(ctx.userAvatar || ctx.user_avatar || ''),
        };

        save();
    } catch (err) {
        console.warn('[IVY Phone] не удалось прочитать контекст:', err);
    }
}

// Номера из лорбука: ищем телефон рядом с именем уже известного контакта.
async function syncFromLorebook() {
    try {
        const wi = await import('../../../world-info.js');
        if (typeof wi.getSortedEntries !== 'function') return;
        const entries = await wi.getSortedEntries();
        const numberRe = /(\+?\d[\d\s\-()]{7,}\d)/;
        let touched = false;

        for (const c of Object.values(store().contacts)) {
            if (c.number) continue;
            const hit = entries.find(e => {
                const text = `${(e.key || []).join(' ')} ${e.content || ''}`;
                return text.toLowerCase().includes(c.name.toLowerCase()) && numberRe.test(text);
            });
            if (hit) {
                c.number = (`${hit.content}`.match(numberRe) || [])[1]?.trim() || '';
                touched = true;
            }
        }
        if (touched) { save(); render(); }
    } catch { /* лорбука может не быть, это нормально */ }
}

// ---------------------------------------------------------------- UI shell

let ui = null;
let screen = { name: 'home', arg: null };

// Живое состояние: индикатор набора и черновики. Держим в памяти, а не в
// метаданных чата — иначе «печатает…» залипает навсегда после перезагрузки,
// а недописанные черновики копятся в сохранённом файле.
const live = { typing: '', drafts: {} };

function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
}

// Как контакт подписан в телефоне. Видно только тебе: в запросы к модели
// и в сводку для контекста всегда уходит настоящее имя из поля name.
function shown(c) {
    return (c?.label || '').trim() || c?.name || '';
}

function groupAvatar(name, cls = 'ivyph-avatar') {
    return `<span class="${cls} ivyph-avatar-group" style="--tint:#4a6355">${icon('group')}</span>`;
}

// Дубль shown(): оставлен для совместимости, читает то же поле label.
function shownName(c) {
    return shown(c);
}

function avatarHtml(c, cls = 'ivyph-avatar') {
    const name = shownName(c) || '?';
    const tint = c?.color || '#3d4a55';
    const inner = c?.avatar
        ? `<img src="${esc(c.avatar)}" alt="" onerror="this.remove()">`
        : esc(name[0].toUpperCase());
    return `<span class="${cls}" style="--tint:${esc(tint)}">${inner}</span>`;
}

function esc(s) {
    return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function clock(ts) {
    const d = new Date(ts || Date.now());
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Читаем переменную таверны напрямую: substituteParams в части сборок
// не раскрывает getvar и возвращает {{...}} как есть.
function readVar(name) {
    try {
        const ctx = getContext();
        const scope = ctx.chatMetadata?.variables || chat_metadata?.variables || {};
        if (scope[name] != null && String(scope[name]).trim()) return String(scope[name]).trim();
        const globals = ctx.extensionSettings?.variables?.global
            || extension_settings?.variables?.global || {};
        if (globals[name] != null && String(globals[name]).trim()) return String(globals[name]).trim();
    } catch { /* нет доступа */ }
    return '';
}

// Макрос из поля настроек. Сначала вытаскиваем getvar напрямую, потом,
// если осталось что-то другое, отдаём на общий substituteParams.
// Переменная может существовать, но содержать незаполненный плейсхолдер
// («HH:MM», «WEEKDAY, MON DD, YYYY»). Такое значение надо отбросить,
// иначе часы честно покажут мусор.
function looksUnfilled(v) {
    return !v
        || /\{\{/.test(v)
        || /^(hh|чч)[:.]?(mm|мм)$/i.test(v.trim())
        || /\b(HH|MM|YYYY|WEEKDAY|MON|DD|ЧЧ|ММ|ГГГГ)\b/.test(v);
}

function fromMacro(tpl, kind) {
    if (!tpl || !tpl.trim()) return '';
    let out = tpl.replace(/\{\{getvar::([^}]+)\}\}/g, (_, n) => readVar(n.trim()));
    if (out.includes('{{')) {
        try { out = String(getContext().substituteParams(out) || ''); } catch { /* ignore */ }
    }
    out = out.trim();
    if (looksUnfilled(out)) return '';
    if (kind === 'time' && !/^\d{1,2}:\d{2}/.test(out)) return '';
    return out;
}

// Многие пресеты (IVY в том числе) не пишут время в переменную, а печатают
// его в первую строку ответа — ⟦HEADER|#hex|место|погода|15:15|дата⟧.
// Читаем оттуда: берём последний хедер в чате и парсим поля.
// Время и дата из хедера пресета. Ищем не по слову HEADER (его мог вырезать
// регекс "прятать маркеры"), а по самой форме: строка с несколькими полями
// через | , где есть время HH:MM и год. Читаем оригинал сообщения, а не
// почищенный DOM.
function fromHeader() {
    try {
        const ctx = getContext();
        for (let i = (ctx.chat || []).length - 1; i >= 0; i--) {
            const m = ctx.chat[i];
            if (!m || m.is_user) continue;
            const raw = String(m.mes || '');

            // все строки-кандидаты: с HEADER или просто с несколькими | и временем
            const cand = raw.split('\n').filter(l =>
                /HEADER/i.test(l) || (l.split('|').length >= 3 && /\d{1,2}:\d{2}/.test(l))
            );

            for (const line of cand) {
                const fields = line
                    .replace(/[⟦⟧\[\]『』【】]/g, '')
                    .replace(/^\s*HEADER\s*\|?/i, '')
                    .split('|')
                    .map(f => f.trim());

                const time = (fields.find(f => /^\d{1,2}:\d{2}$/.test(f))
                    || (line.match(/\b(\d{1,2}:\d{2})\b/) || [])[1] || '');
                const date = fields.find(f => /\d{4}/.test(f) && /[a-zA-Zа-яА-Яёіїєґ]/i.test(f)) || '';

                if (time || date) return { time, date };
            }
        }

        // запасной путь: последнее HH:MM где угодно в свежих сообщениях
        for (let i = (ctx.chat || []).length - 1, seen = 0; i >= 0 && seen < 6; i--) {
            const m = ctx.chat[i];
            if (!m || m.is_user) continue;
            seen++;
            const t = (String(m.mes || '').match(/\b(\d{1,2}:\d{2})\b/) || [])[1];
            if (t) return { time: t, date: '' };
        }
    } catch { /* ignore */ }
    return { time: '', date: '' };
}

// Приоритет: макрос из настроек → хедер в чате → сохранённый маркер → часы.
function gameClock() {
    const t = fromMacro(settings().timeMacro, 'time')
        || fromHeader().time
        || (looksUnfilled(store().time) ? '' : store().time);
    return t || clock();
}

function gameDate() {
    const d = fromMacro(settings().dateMacro, 'date')
        || fromHeader().date
        || (looksUnfilled(store().date) ? '' : store().date);
    return d || '';
}

function stampOf(e) {
    return e.stamp || clock(e.ts);
}

function buildShell() {
    if (ui) return;

    // Кнопку вешаем в саму панель отправки таверны — там её невозможно
    // потерять. Плавающая кнопка остаётся запасным вариантом, если
    // разметка сборки отличается и панель не нашлась.
    const launcher = el('div', 'ivyph-launcher');
    launcher.title = 'Phone';
    launcher.innerHTML = `<div class="ivyph-launcher-glyph">${icon('device')}</div><span class="ivyph-badge" hidden>0</span>`;
    launcher.addEventListener('click', () => togglePhone());
    document.body.appendChild(launcher);
    mountInSendForm();

    const overlay = el('div', 'ivyph-overlay');
    overlay.hidden = true;
    overlay.style.display = 'none';
    overlay.innerHTML = `
        <div class="ivyph-scrim"></div>
        <div class="ivyph-device" data-skin="modern" role="dialog" aria-label="Phone">
            <div class="ivyph-status">
                <span class="ivyph-carrier"></span>
                <span class="ivyph-clock"></span>
                <span class="ivyph-meta">${icon('wifi')}${icon('battery')}<button class="ivyph-close" title="Close">${icon('close')}</button></span>
            </div>
            <div class="ivyph-screen"></div>
            <div class="ivyph-dock">
                <button class="ivyph-dock-btn" data-go="home">${icon('message')}<span>Messages</span></button>
                <button class="ivyph-dock-btn" data-go="contacts">${icon('user')}<span>Contacts</span></button>
                <button class="ivyph-dock-btn" data-go="log">${icon('phone')}<span>Calls</span></button>
            </div>
        </div>`;
    (document.documentElement || document.body).appendChild(overlay);

    overlay.querySelector('.ivyph-scrim').addEventListener('click', () => togglePhone(false));
    overlay.querySelector('.ivyph-close').addEventListener('click', () => togglePhone(false));
    overlay.querySelectorAll('.ivyph-dock-btn').forEach(b => {
        b.addEventListener('click', () => go(b.dataset.go));
    });

    ui = { launcher, overlay, screen: overlay.querySelector('.ivyph-screen') };
}

// Ищем панель рядом с полем ввода и ставим туда кнопку телефона.
// Разметка у сборок отличается, поэтому перебираем варианты и повторяем
// попытку несколько раз: панель может появиться позже нашей загрузки.
let mountTries = 0;

function mountInSendForm() {
    if (document.getElementById('ivyph_send_btn')) return true;

    const host = document.getElementById('rightSendForm')
        || document.getElementById('leftSendForm')
        || document.querySelector('#send_form .send_form_buttons')
        || document.querySelector('#send_form');

    if (!host) {
        if (mountTries++ < 20) setTimeout(mountInSendForm, 500);
        return false;
    }

    const btn = el('div', 'ivyph-sendbtn interactable');
    btn.id = 'ivyph_send_btn';
    btn.title = 'Phone';
    btn.tabIndex = 0;
    btn.innerHTML = `${icon('device')}<span class="ivyph-badge" hidden>0</span>`;
    btn.addEventListener('click', () => togglePhone());

    if (host.id === 'leftSendForm') host.appendChild(btn);
    else host.prepend(btn);

    document.body.classList.add('ivyph-mounted');
    render();
    return true;
}

function togglePhone(force) {
    buildShell();
    const open = force === undefined ? ui.overlay.hidden : force;
    ui.overlay.hidden = !open;
    ui.overlay.style.display = open ? 'flex' : 'none';
    document.body.classList.toggle('ivyph-open', open);
    if (open) render();
}

function go(name, arg) {
    screen = { name, arg: arg ?? null };
    render();
}

// ---------------------------------------------------------------- screens

function threadKey(e) {
    return e.group ? `g:${keyOf(e.group)}` : resolveKey(e.from);
}

function threadHead(k, list) {
    if (k.startsWith('g:')) {
        const g = store().groups[k.slice(2)];
        return {
            name: g?.name || k.slice(2),
            group: true,
            members: g?.members || [],
            color: '#4a5a63',
        };
    }
    return contact(list[0].from) || { name: list[0].from };
}

function threads() {
    const map = new Map();
    for (const e of store().events) {
        if (e.type === 'call') continue;
        const k = threadKey(e);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(e);
    }
    return [...map.entries()]
        .map(([k, list]) => ({ k, c: threadHead(k, list), list, last: list[list.length - 1] }))
        .sort((a, b) => b.last.ts - a.last.ts);
}

function preview(e) {
    if (e.type === 'photo') return 'Photo';
    if (e.type === 'voice') return `Voice message ${e.dur}`;
    return e.text;
}

function renderHome() {
    const list = threads();
    const started = new Set(list.map(t => t.k));
    const rest = Object.values(store().contacts).filter(c => !started.has(c.key));

    const restRows = rest.length ? `
        <div class="ivyph-subhead">Start a new conversation</div>
        <ul class="ivyph-list">${rest.map(c => `
            <li class="ivyph-row" data-thread="${esc(c.key)}">
                ${avatarHtml(c)}
                <span class="ivyph-row-body">
                    <span class="ivyph-row-top"><b>${esc(shown(c))}</b></span>
                    <span class="ivyph-row-sub">${esc(c.number || c.handle || 'tap to write')}</span>
                </span>
            </li>`).join('')}</ul>` : '';

    if (!list.length && !rest.length) {
        return headTitle('Messages') + `<div class="ivyph-empty">
            ${icon('messageOff')}
            <p>No conversations yet.</p>
            <small>Add a contact to start writing, or wait for a text.</small>
        </div>`;
    }

    if (!list.length) {
        return headTitle('Messages', `<button class="ivyph-icon-btn" data-wand>${icon('wand')}</button>`) + restRows;
    }
    return headTitle('Messages', `<button class="ivyph-icon-btn" data-wand>${icon('wand')}</button>`) + `<ul class="ivyph-list">` + list.map(t => {
        const un = t.list.filter(e => !e.read && e.dir === 'in').length;
        return `<li class="ivyph-row ${un ? 'ivyph-row-unread' : ''}" data-thread="${esc(t.k)}">
            ${t.c.group ? groupAvatar(t.c.name) : avatarHtml(t.c)}
            <span class="ivyph-row-body">
                <span class="ivyph-row-top"><b>${esc(shown(t.c) || t.k)}</b><time>${esc(stampOf(t.last))}</time></span>
                <span class="ivyph-row-sub">${esc(preview(t.last))}</span>
            </span>
            ${un ? `<span class="ivyph-dot">${un}</span>` : ''}
        </li>`;
    }).join('') + `</ul>` + restRows;
}

function renderThread(k) {
    const all = store().events.filter(e => e.type !== 'call');
    const list = all.filter(e => threadKey(e) === k);

    // Пустая групповая ветка: контакт заводить нельзя, иначе в списке
    // появляется фантом с именем вида «g:crew».
    let c;
    if (list.length) c = threadHead(k, list);
    else if (k.startsWith('g:')) {
        const g = store().groups[k.slice(2)];
        c = { name: g?.name || k.slice(2), group: true, members: g?.members || [] };
    } else c = contact(k) || { name: k };
    list.forEach(e => { e.read = true; });
    save();

    const bubbles = list.map(e => {
        if (screen.edit === e.id) {
            return `<div class="ivyph-bub ivyph-${e.dir} ivyph-editing">
                <textarea class="ivyph-edit-box" rows="3">${esc(e.text)}</textarea>
                <span class="ivyph-msgtools">
                    <button data-save-msg="${esc(e.id)}">Сохранить</button>
                    <button data-cancel-msg>Cancel</button>
                </span>
            </div>`;
        }

        let inner = '';
        if (e.type === 'photo') {
            if (e.image) {
                inner = `<img class="ivyph-photo" src="${esc(e.image)}" alt="${esc(e.text || 'фото')}">`;
            } else if (e.state === 'pending') {
                inner = `<span class="ivyph-shot ivyph-shot-busy">${icon('spinner', 'ivyph-spin')} Generating…</span>`;
            } else {
                // Показываем короткую подпись, а не весь технический промпт:
                // раньше в пузырь вываливалось описание внешности целиком.
                const short = String(e.prompt || '')
                    .replace(/^[^,]*(?:snapshot|camera phone|photo)[^,]*,\s*/i, '')
                    .split(',').slice(0, 3).join(',').trim();
                inner = `<span class="ivyph-shot">
                    <span class="ivyph-shot-desc">${icon('image')}<i>${esc(short || 'фото')}</i></span>
                    <button class="ivyph-shot-btn" data-gen="${esc(e.id)}">
                        ${e.state === 'error' ? icon('refresh') + ' Retry' : icon('image') + ' Generate'}
                    </button>
                    ${e.state === 'error' ? '<span class="ivyph-shot-err">Command returned no image</span>' : ''}
                </span>`;
            }
            if (e.text) inner += `<span class="ivyph-cap">${esc(e.text)}</span>`;
        } else if (e.type === 'voice') {
            inner = `<span class="ivyph-voice">${icon('play')}<span class="ivyph-wave"></span><time>${esc(e.dur)}</time></span>`;
        } else {
            inner = esc(e.text);
        }
        const who = c.group && e.dir === 'in'
            ? `<span class="ivyph-who">${esc(e.from)}</span>` : '';
        const react = e.reaction ? `<span class="ivyph-react">${esc(e.reaction)}</span>` : '';
        const dstate = e.dir === 'out' && e.dstate
            ? `<span class="ivyph-dstate">${esc(DSTATE[e.dstate] || e.dstate)}</span>` : '';
        const isPhoto = e.type === 'photo';
        const tools = [];

        if (isPhoto) {
            if (e.image) {
                tools.push(`<button data-open-img="${esc(e.id)}">${icon('expand')} Открыть</button>`);
                tools.push(`<button data-save-img="${esc(e.id)}">${icon('save')} Сохранить</button>`);
            }
            tools.push(`<button data-gen="${esc(e.id)}">${icon('refresh')} Ещё раз</button>`);
        } else {
            if (e.dir === 'in') tools.push(`<button data-regen="${esc(e.id)}">${icon('refresh')} Переписать</button>`);
            tools.push(`<button data-edit-msg="${esc(e.id)}">Изменить</button>`);
            tools.push(`<button data-copy-msg="${esc(e.id)}">Копировать</button>`);
        }
        tools.push(`<button class="ivyph-danger-text" data-del-msg="${esc(e.id)}">${icon('trash')} Удалить</button>`);

        const menu = screen.menu === e.id ? `
            <span class="ivyph-picker">
                ${REACTIONS.map(r => `<button data-react="${esc(e.id)}" data-emoji="${r}">${r}</button>`).join('')}
            </span>
            <span class="ivyph-msgtools">${tools.join('')}</span>` : '';

        return `<div class="ivyph-bub ivyph-${e.dir}${e.scam ? ' ivyph-scam' : ''}" data-ev="${esc(e.id)}">
            ${who}${inner}<time>${esc(stampOf(e))}${dstate}</time>${react}
            <button class="ivyph-more" data-menu="${esc(e.id)}" title="Действия">${icon('dots')}</button>
        </div>${menu}`;
    }).join('');

    const typing = live.typing === k
        ? `<div class="ivyph-bub ivyph-in ivyph-typing"><i></i><i></i><i></i></div>` : '';

    return `<div class="ivyph-head ivyph-head-nav">
            <button class="ivyph-back" data-go="home">${icon('chevronLeft')}</button>
            <span class="ivyph-title">${esc(shown(c))}${c.group ? `<small>${esc(c.members.join(', '))}</small>` : ''}</span>
            <span class="ivyph-head-tools">
                <button class="ivyph-icon-btn" data-wipe="${esc(k)}">${icon('trash')}</button>
                ${c.group ? '' : `<button class="ivyph-icon-btn" data-card="${esc(keyOf(k))}">${icon('info')}</button>`}
            </span>
        </div>
        <div class="ivyph-thread">${bubbles}${typing}</div>
        <div class="ivyph-compose">
            <button class="ivyph-attach" data-attach="${esc(k)}">${icon('image')}</button>
            <button class="ivyph-attach" data-askphoto="${esc(k)}" title="Ask for a photo">${icon('camera')}</button>
            <textarea rows="1" placeholder="Message ${esc(shown(c))}…"></textarea>
            <button class="ivyph-send" data-send="${esc(keyOf(k))}">${icon('arrowUp')}</button>
        </div>`;
}

function renderContacts() {
    const cs = Object.values(store().contacts);
    const rows = cs.length ? cs.map(c => `<li class="ivyph-row" data-card="${esc(c.key)}">
            ${avatarHtml(c)}
            <span class="ivyph-row-body">
                <span class="ivyph-row-top"><b>${esc(shown(c))}</b></span>
                <span class="ivyph-row-sub">${esc(c.number || c.handle || 'no number saved')}</span>
            </span>
        </li>`).join('') : `<li class="ivyph-empty-row">No contacts yet.</li>`;

    const groupRows = Object.values(store().groups).map(g => `
        <li class="ivyph-row">
            ${groupAvatar(g.name)}
            <span class="ivyph-row-body">
                <span class="ivyph-row-top"><b>${esc(g.name)}</b></span>
                <span class="ivyph-row-sub">${esc(g.members.join(', ') || 'group')}</span>
            </span>
            <button class="ivyph-icon-btn" data-del-group="${esc(g.key)}">${icon('trash')}</button>
        </li>`).join('');

    return `<div class="ivyph-head ivyph-head-nav">
            <span>Contacts</span>
            <span class="ivyph-head-tools">
                <button class="ivyph-icon-btn" data-go="newgroup" title="New group">${icon('user')}+</button>
                <button class="ivyph-icon-btn" data-card="__new__">${icon('plus')}</button>
            </span>
        </div>
        <ul class="ivyph-list">${rows}${groupRows}</ul>`;
}

function renderNewGroup() {
    const cs = Object.values(store().contacts).filter(c => !c.blocked);
    return `<div class="ivyph-head ivyph-head-nav">
            <button class="ivyph-back" data-go="contacts">${icon('chevronLeft')}</button>
            <span class="ivyph-title">New group<small>pick who is in it</small></span>
            <span class="ivyph-spacer"></span>
        </div>
        <div class="ivyph-form">
            <label>Group name<input class="ivyph-group-name" placeholder="название группы"></label>
        </div>
        <ul class="ivyph-list">${cs.map(c => `
            <li class="ivyph-row">
                ${avatarHtml(c)}
                <span class="ivyph-row-body"><span class="ivyph-row-top"><b>${esc(shownName(c))}</b></span></span>
                <input type="checkbox" class="ivyph-pick" value="${esc(c.name)}">
            </li>`).join('')}</ul>
        <div class="ivyph-form">
            <button class="ivyph-primary" data-make-group>Create group</button>
        </div>`;
}

function renderCard(k) {
    const isNew = k === '__new__';
    const blank = { name: '', label: '', lore: '', number: '', handle: '', anchor: '', clothes: '', place: '', style: '', color: '#3d4a55', avatar: '', blocked: false };
    // читаем напрямую из хранилища: contact() создал бы пустой контакт
    const c = isNew ? blank : (store().contacts[resolveKey(k)] || blank);
    return `<div class="ivyph-head ivyph-head-nav">
            <button class="ivyph-back" data-go="contacts">${icon('chevronLeft')}</button>
            <span>${isNew ? 'Новый контакт' : esc(shown(c))}</span>
        </div>
        <div class="ivyph-form" data-key="${esc(isNew ? '' : c.key)}">
            <label>Имя — его видит модель<input data-f="name" value="${esc(c.name)}" placeholder="John Doe"></label>
            <label>Как подписать — видишь только ты<input data-f="label" value="${esc(c.label || '')}" placeholder="как подписан у тебя"></label>
            <label>Кто это в твоём мире<textarea data-f="lore" rows="3" placeholder="кем приходится, чем занят, что знает">${esc(c.lore || '')}</textarea></label>
            <label>Номер<input data-f="number" value="${esc(c.number)}" placeholder="+1 555 0100"></label>
            <label>Ник<input data-f="handle" value="${esc(c.handle)}" placeholder="@handle"></label>
            <label>Внешность — для генерации фото<textarea data-f="anchor" rows="3" placeholder="рост, лицо, волосы, одежда">${esc(c.anchor)}</textarea></label>
            <label>Во что одет сейчас<textarea data-f="clothes" rows="2" placeholder="фланель, потёртые джинсы, ботинки">${esc(c.clothes || '')}</textarea></label>
            <label>Где живёт, как выглядит его дом<textarea data-f="place" rows="3" placeholder="съёмная квартира над мастерской, бардак, лампа у кровати">${esc(c.place || '')}</textarea></label>
            <label>Манера переписки<textarea data-f="style" rows="3" placeholder="строчными, без точек, без смайлов, коротко">${esc(c.style || '')}</textarea></label>
            <label class="ivyph-check">
                <input type="checkbox" data-f="blocked" ${c.blocked ? 'checked' : ''}>
                <span>Заблокирован — сообщения не приходят</span>
            </label>
            <label>Цвет<input type="color" data-f="color" value="${esc(c.color || '#3d4a55')}"></label>
            <label>Фото
                <span class="ivyph-avatar-pick">
                    ${avatarHtml(c, 'ivyph-avatar ivyph-avatar-lg')}
                    <button class="ivyph-mini" data-pick-photo>Выбрать…</button>
                    ${c.avatar ? '<button class="ivyph-mini ivyph-mini-off" data-drop-photo>Убрать</button>' : ''}
                </span>
                <input type="hidden" data-f="avatar" value="${esc(c.avatar || '')}">
            </label>
            ${isNew ? '' : `<div class="ivyph-quick">
                <button class="ivyph-quick-btn" data-open-thread="${esc(c.key)}">${icon('message')}<span>Написать</span></button>
                <button class="ivyph-quick-btn" data-place-call="${esc(c.key)}">${icon('phone')}<span>Позвонить</span></button>
            </div>`}
            <div class="ivyph-form-actions">
                <button class="ivyph-primary" data-save-card>Сохранить</button>
                ${isNew ? '' : '<button class="ivyph-danger" data-del-card>Удалить</button>'}
            </div>
        </div>`;
}

function renderDialing(id) {
    const ev = store().events.find(e => e.id === id);
    const c = contact(ev?.from) || { name: ev?.from || '' };
    return `<div class="ivyph-callscreen">
            <div class="ivyph-call-label">calling…</div>
            ${avatarHtml(c, 'ivyph-call-avatar')}
            <div class="ivyph-call-name">${esc(shown(c))}</div>
            <div class="ivyph-call-number">${esc(c.number || 'number withheld')}</div>
            <div class="ivyph-call-actions">
                <button class="ivyph-call-btn ivyph-decline" data-hangup="${esc(id)}"><span class="ivyph-call-circle">${icon('phoneOff')}</span><span>Hang up</span></button>
            </div>
        </div>`;
}

function renderConjure() {
    const cs = Object.values(store().contacts);
    const rows = cs.length
        ? cs.map(c => `<li class="ivyph-row" data-conjure="${esc(c.key)}">
            ${avatarHtml(c)}
            <span class="ivyph-row-body"><span class="ivyph-row-top"><b>${esc(shown(c))}</b></span>
            <span class="ivyph-row-sub">write a conversation with them</span></span>
        </li>`).join('')
        : `<li class="ivyph-empty-row">Add a contact first.</li>`;

    return `<div class="ivyph-head ivyph-head-nav">
            <button class="ivyph-back" data-go="home">${icon('chevronLeft')}</button>
            <span class="ivyph-title">Conjure a thread<small>the model writes both sides</small></span>
            <span class="ivyph-spacer"></span>
        </div>
        <ul class="ivyph-list">${rows}</ul>`;
}

// Палочка: модель пишет готовую переписку целиком, обе стороны.
async function conjureThread(key) {
    const c = contact(key);
    if (!c) return;
    go('thread', key);
    logDebug(`сочиняю переписку с ${c.name}`);

    const scene = sceneContext(6);
    const prompt = [
        cardContext(),
        await lorebookContext(`${scene} ${c.name}`),
        `Current scene:\n${scene}`,
        c.lore ? `Who ${c.name} is: ${c.lore}` : '',
        c.anchor ? `${c.name}: ${c.anchor}` : '',
        c.style ? `How ${c.name} texts: ${c.style}` : '',
        `Write a short text conversation between the phone owner and ${c.name} that fits the scene above.`,
        `${c.name} must sound like themselves — punctuation, slang, emoji use and message length all follow their character, not a generic texting voice.`,
        `Six to ten messages. One per line. Prefix each line with "IN:" for ${c.name} and "OUT:" for the owner.`,
        `No narration, no quotes, no timestamps. Casual texting voice.`,
    ].filter(Boolean).join('\n\n');

    const raw = await askModel(prompt);
    if (!raw) { logDebug('палочка вернула пусто'); return; }

    raw.split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
        const m = line.match(/^(IN|OUT)\s*:\s*(.+)$/i);
        if (!m) return;
        addEvent({
            mesId: null, type: 'sms',
            dir: m[1].toUpperCase() === 'IN' ? 'in' : 'out',
            from: c.name, text: m[2].trim(),
        });
    });
    save();
    render();
}

function renderLog() {
    const calls = store().events.filter(e => e.type === 'call').slice().reverse();
    if (!calls.length) return `<div class="ivyph-empty">${icon('phoneOff')}<p>No calls yet.</p></div>`;
    const glyph = {
        missed: 'phoneOff', declined: 'phoneOff', noanswer: 'phoneOff',
        incoming: 'arrowDown', outgoing: 'arrowUp', dialing: 'arrowUp',
    };
    return headTitle('Calls') + `<ul class="ivyph-list">` + calls.map(e => `
        <li class="ivyph-row ivyph-call-row ${e.status === 'missed' || e.status === 'declined' ? 'ivyph-missed' : ''}">
            ${avatarHtml(contact(e.from) || { name: e.from })}
            <span class="ivyph-row-body">
                <span class="ivyph-row-top"><b>${esc(shown(contact(e.from)) || e.from)}</b><time>${esc(stampOf(e))}</time></span>
                <span class="ivyph-row-sub">${icon(glyph[e.status] || 'phone')} ${esc(statusWord(e))}</span>
            </span>
        </li>`).join('') + `</ul>`;
}

function headTitle(title, extra = '') {
    const d = gameDate();
    const body = `<span class="ivyph-title">${esc(title)}${d ? `<small>${esc(d)}</small>` : ''}</span>`;
    return extra
        ? `<div class="ivyph-head ivyph-head-nav"><span class="ivyph-spacer"></span>${body}${extra}</div>`
        : `<div class="ivyph-head">${body}</div>`;
}

function statusWord(e) {
    const map = {
        incoming: 'Incoming', outgoing: 'Outgoing', missed: 'Missed', declined: 'Declined',
        answered: 'Answered', ended: 'Ended', dialing: 'Dialing', noanswer: 'No answer',
    };
    return (map[e.status] || e.status) + (e.dur ? ` · ${e.dur}` : '');
}

function renderCall(ev) {
    const c = contact(ev.from) || { name: ev.from };
    return `<div class="ivyph-callscreen">
            <div class="ivyph-call-label">incoming call</div>
            ${avatarHtml(c, 'ivyph-call-avatar')}
            <div class="ivyph-call-name">${esc(shown(c))}</div>
            <div class="ivyph-call-number">${esc(c.number || 'number withheld')}</div>
            <div class="ivyph-call-actions">
                <button class="ivyph-call-btn ivyph-decline" data-call="declined"><span class="ivyph-call-circle">${icon('phoneOff')}</span><span>Decline</span></button>
                <button class="ivyph-call-btn ivyph-accept" data-call="answered"><span class="ivyph-call-circle">${icon('phone')}</span><span>Answer</span></button>
            </div>
        </div>`;
}

// ---------------------------------------------------------------- render

function render() {
    if (!ui) return;

    const n = unreadCount();
    document.querySelectorAll('.ivyph-badge').forEach(badge => {
        badge.hidden = n === 0;
        badge.textContent = n > 99 ? '99+' : String(n);
    });
    ui.launcher.classList.toggle('ivyph-has-unread', n > 0);
    document.getElementById('ivyph_send_btn')?.classList.toggle('ivyph-has-unread', n > 0);

    if (ui.overlay.hidden) return;

    ui.overlay.querySelector('.ivyph-device').dataset.skin = settings().skin || 'modern';
    ui.overlay.querySelector('.ivyph-carrier').textContent = settings().carrier;
    ui.overlay.querySelector('.ivyph-clock').textContent = gameClock();

    // Экран входящего показываем, пока звонок не обработан. Любой другой
    // экран, выбранный вручную, имеет приоритет — иначе телефон залипает.
    const ringing = store().events.find(e => e.type === 'call' && e.status === 'incoming' && !e.read);
    const stuckOnCall = ringing && !['log', 'contacts', 'card', 'thread', 'newgroup'].includes(screen.name);

    let html;
    if (stuckOnCall) { html = renderCall(ringing); screen.arg = ringing.id; }
    else if (screen.name === 'thread') html = renderThread(screen.arg);
    else if (screen.name === 'contacts') html = renderContacts();
    else if (screen.name === 'card') html = renderCard(screen.arg);
    else if (screen.name === 'log') html = renderLog();
    else if (screen.name === 'conjure') html = renderConjure();
    else if (screen.name === 'dialing') html = renderDialing(screen.arg);
    else if (screen.name === 'newgroup') html = renderNewGroup();
    else html = renderHome();

    ui.overlay.classList.toggle('ivyph-ringing', !!stuckOnCall || screen.name === 'dialing');
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
        if (ev) {
            ev.read = true;
            ev.status = n.dataset.call;
            if (n.dataset.call === 'answered') {
                ev.dur = `${Math.floor(1 + Math.random() * 7)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`;
            }
        }
        save();
        pushInjection();
        go('log');
        // отвечен — пусть разговор продолжится в сцене
        if (n.dataset.call === 'answered' && settings().replyMode !== 'none') runSlash('/trigger');
    }));

    s.querySelectorAll('[data-gen]').forEach(n => n.addEventListener('click', e => {
        e.stopPropagation();
        generatePhoto(store().events.find(x => x.id === n.dataset.gen));
    }));

    const send = s.querySelector('[data-send]');
    if (send) {
        const box = s.querySelector('.ivyph-compose textarea');
        const key = send.dataset.send;
        box.value = live.drafts[key] || '';
        box.addEventListener('input', () => { live.drafts[key] = box.value; });

        const fire = () => {
            const text = box.value.trim();
            if (!text) return;
            box.value = '';
            delete live.drafts[key];
            sendFromPhone(key, text);
        };
        send.addEventListener('click', fire);
        box.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); fire(); }
        });
    }

    s.querySelectorAll('[data-menu]').forEach(n => n.addEventListener('click', ev => {
        ev.stopPropagation();
        screen.menu = screen.menu === n.dataset.menu ? null : n.dataset.menu;
        render();
    }));

    s.querySelectorAll('.ivyph-photo').forEach(n => n.addEventListener('click', ev => {
        ev.stopPropagation();
        openViewer(n.getAttribute('src'));
    }));

    s.querySelectorAll('[data-open-img]').forEach(n => n.addEventListener('click', ev => {
        ev.stopPropagation();
        const e = store().events.find(x => x.id === n.dataset.openImg);
        if (e?.image) openViewer(e.image);
        screen.menu = null;
        render();
    }));

    s.querySelectorAll('[data-save-img]').forEach(n => n.addEventListener('click', ev => {
        ev.stopPropagation();
        const e = store().events.find(x => x.id === n.dataset.saveImg);
        if (e?.image) saveImage(e.image);
        screen.menu = null;
        render();
    }));

    s.querySelectorAll('[data-regen]').forEach(n => n.addEventListener('click', ev => {
        ev.stopPropagation();
        regenerateMessage(n.dataset.regen);
    }));

    s.querySelectorAll('[data-edit-msg]').forEach(n => n.addEventListener('click', ev => {
        ev.stopPropagation();
        screen.edit = n.dataset.editMsg;
        screen.menu = null;
        render();
    }));

    s.querySelectorAll('[data-save-msg]').forEach(n => n.addEventListener('click', ev => {
        ev.stopPropagation();
        const box = s.querySelector('.ivyph-edit-box');
        const e = store().events.find(x => x.id === n.dataset.saveMsg);
        if (e && box) e.text = box.value.trim();
        screen.edit = null;
        save();
        pushInjection();
        render();
    }));

    s.querySelectorAll('[data-cancel-msg]').forEach(n => n.addEventListener('click', ev => {
        ev.stopPropagation();
        screen.edit = null;
        render();
    }));

    s.querySelectorAll('[data-copy-msg]').forEach(n => n.addEventListener('click', async ev => {
        ev.stopPropagation();
        const e = store().events.find(x => x.id === n.dataset.copyMsg);
        try { await navigator.clipboard.writeText(e?.text || ''); } catch { /* нет доступа */ }
        screen.menu = null;
        render();
    }));

    s.querySelectorAll('[data-del-msg]').forEach(n => n.addEventListener('click', ev => {
        ev.stopPropagation();
        const st = store();
        st.events = st.events.filter(x => x.id !== n.dataset.delMsg);
        screen.menu = null;
        save();
        pushInjection();
        render();
    }));

    s.querySelectorAll('[data-react]').forEach(n => n.addEventListener('click', ev => {
        ev.stopPropagation();
        const e = store().events.find(x => x.id === n.dataset.react);
        if (e) e.reaction = e.reaction === n.dataset.emoji ? '' : n.dataset.emoji;
        screen.menu = null;
        save();
        render();
    }));

    s.querySelectorAll('[data-del-group]').forEach(n => n.addEventListener('click', ev => {
        ev.stopPropagation();
        const key = n.dataset.delGroup;
        const st = store();
        if (!confirm(`Удалить групповой чат «${st.groups[key]?.name || key}»?`)) return;
        st.events = st.events.filter(e => keyOf(e.group) !== key);
        delete st.groups[key];
        save();
        pushInjection();
        go('contacts');
    }));

    s.querySelectorAll('[data-wipe]').forEach(n => n.addEventListener('click', () => {
        const key = n.dataset.wipe;
        const st = store();
        const gone = st.events.filter(e => threadKey(e) === key && e.type !== 'call').length;
        if (!gone || !confirm(`Удалить переписку? Сообщений: ${gone}`)) return;
        st.events = st.events.filter(e => !(threadKey(e) === key && e.type !== 'call'));
        save();
        pushInjection();
        go('home');
    }));

    s.querySelectorAll('[data-hangup]').forEach(n => n.addEventListener('click', () => {
        const ev = store().events.find(x => x.id === n.dataset.hangup);
        if (ev && ev.status === 'dialing') ev.status = 'ended';
        save();
        go('log');
    }));

    const make = s.querySelector('[data-make-group]');
    if (make) make.addEventListener('click', () => {
        const name = s.querySelector('.ivyph-group-name')?.value.trim();
        const members = [...s.querySelectorAll('.ivyph-pick:checked')].map(x => x.value);
        if (!name || members.length < 2) {
            alert('Нужно название и хотя бы двое участников.');
            return;
        }
        const st = store();
        st.groups[keyOf(name)] = { key: keyOf(name), name, members };
        save();
        pushInjection();
        go('thread', `g:${keyOf(name)}`);
    });

    const wand = s.querySelector('[data-wand]');
    if (wand) wand.addEventListener('click', () => go('conjure'));

    s.querySelectorAll('[data-conjure]').forEach(n => n.addEventListener('click', () => {
        conjureThread(n.dataset.conjure);
    }));

    const ask = s.querySelector('[data-askphoto]');
    if (ask) ask.addEventListener('click', () => askForPhoto(ask.dataset.askphoto));

    const attach = s.querySelector('[data-attach]');
    if (attach) attach.addEventListener('click', () => {
        const file = document.createElement('input');
        file.type = 'file';
        file.accept = 'image/*';
        file.addEventListener('change', async () => {
            const f = file.files?.[0];
            if (f) await sendPhotoFromPhone(attach.dataset.attach, f);
        });
        file.click();
    });

    s.querySelectorAll('[data-open-thread]').forEach(n =>
        n.addEventListener('click', () => go('thread', n.dataset.openThread)));

    s.querySelectorAll('[data-place-call]').forEach(n =>
        n.addEventListener('click', () => placeCall(n.dataset.placeCall)));

    const pick = s.querySelector('[data-pick-photo]');
    if (pick) pick.addEventListener('click', () => {
        const file = document.createElement('input');
        file.type = 'file';
        file.accept = 'image/*';
        file.addEventListener('change', async () => {
            const f = file.files?.[0];
            if (!f) return;
            try {
                const url = await shrinkImage(f);
                s.querySelector('[data-f="avatar"]').value = url;
                const box = s.querySelector('.ivyph-avatar-pick .ivyph-avatar');
                if (box) box.innerHTML = `<img src="${url}" alt="">`;
            } catch (err) { logDebug(`фото не загрузилось: ${err?.message || err}`); }
        });
        file.click();
    });

    const drop = s.querySelector('[data-drop-photo]');
    if (drop) drop.addEventListener('click', () => {
        s.querySelector('[data-f="avatar"]').value = '';
        const box = s.querySelector('.ivyph-avatar-pick .ivyph-avatar');
        if (box) box.textContent = (s.querySelector('[data-f="name"]').value || '?')[0].toUpperCase();
    });

    const saveBtn = s.querySelector('[data-save-card]');
    if (saveBtn) saveBtn.addEventListener('click', () => {
        const form = s.querySelector('.ivyph-form');
        const patch = {};
        form.querySelectorAll('[data-f]').forEach(f => {
            patch[f.dataset.f] = f.type === 'checkbox' ? f.checked : f.value.trim();
        });
        if (!patch.name) return;
        const existing = form.dataset.key;
        if (existing && keyOf(patch.name) !== existing) delete store().contacts[existing];
        contact(patch.name, patch);
        save();
        go('contacts');
    });

    const delBtn = s.querySelector('[data-del-card]');
    if (delBtn) delBtn.addEventListener('click', () => {
        const key = s.querySelector('.ivyph-form').dataset.key;
        const st = store();
        const name = st.contacts[key]?.name || key;
        const n = st.events.filter(e => resolveKey(e.from) === key).length;

        if (!confirm(`Удалить ${name}? Вместе с ним удалится переписка и звонки: ${n}`)) return;

        st.events = st.events.filter(e => resolveKey(e.from) !== key);
        delete st.contacts[key];
        save();
        pushInjection();
        go('contacts');
    });
}

// Аватарку ужимаем до 160px и кладём как data-url: метаданные чата
// имеют лимит, полноразмерное фото туда пихать нельзя.
function shrinkImage(file, size = 160) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('read failed'));
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error('decode failed'));
            img.onload = () => {
                const side = Math.min(img.width, img.height);
                const cv = document.createElement('canvas');
                cv.width = cv.height = size;
                cv.getContext('2d').drawImage(
                    img,
                    (img.width - side) / 2, (img.height - side) / 2, side, side,
                    0, 0, size, size,
                );
                resolve(cv.toDataURL('image/jpeg', 0.82));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

// Картинка на весь экран поверх телефона.
function openViewer(src) {
    if (!src) return;
    const old = document.getElementById('ivyph-viewer');
    if (old) old.remove();

    const box = el('div', 'ivyph-viewer');
    box.id = 'ivyph-viewer';
    box.innerHTML = `<img src="${esc(src)}" alt="">
        <div class="ivyph-viewer-bar">
            <button data-viewer-save>${icon('save')} Сохранить</button>
            <button data-viewer-close>${icon('close')} Закрыть</button>
        </div>`;
    box.addEventListener('click', ev => {
        if (ev.target.closest('[data-viewer-save]')) { saveImage(src); return; }
        if (ev.target.tagName !== 'IMG' || ev.target.closest('[data-viewer-close]')) box.remove();
    });
    (document.documentElement || document.body).appendChild(box);
}

// Сохранение: у картинки может быть и обычный путь, и data-url.
async function saveImage(src) {
    try {
        const a = document.createElement('a');
        a.href = src;
        a.download = `phone_${Date.now()}.jpg`;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        a.remove();
    } catch (err) {
        logDebug(`не удалось сохранить: ${err?.message || err}`);
    }
}

// Переписать ответ заново: старое сообщение уходит, приходит новое.
async function regenerateMessage(id) {
    const st = store();
    const idx = st.events.findIndex(e => e.id === id);
    if (idx < 0) return;

    const old = st.events[idx];
    const c = contact(old.from);
    if (!c) return;

    // на что отвечали — последнее исходящее перед этим сообщением
    const prior = st.events.slice(0, idx).reverse()
        .find(e => e.dir === 'out' && e.type === 'sms');

    st.events.splice(idx, 1);
    screen.menu = null;
    save();
    render();

    await generateReply(c, prior?.text || '', null);
}

// ---------------------------------------------------------------- outgoing

async function pushToChat(marker) {
    const ctx = getContext();
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
    setTimeout(scrubAll, 0);
    return ctx.chat.length - 1;
}

// Своя картинка из галереи: ужимаем до 512px и кладём в переписку.
// В чат уходит маркер с подписью, чтобы персонаж знал, что ему прислали фото.
// Просьба прислать фото. Модель здесь не решает, соглашаться ли — её просят
// только описать кадр. Поэтому персонаж не может «отказаться» или ответить
// прозой вместо картинки.
// Персонаж делает снимок по конкретной просьбе. Модель не решает,
// соглашаться ли — её просят только описать кадр, поэтому отказ невозможен.
async function deliverPhoto(c, request, sentEvent) {
    try {
        if (sentEvent) {
            await wait(600 + Math.random() * 700);
            sentEvent.dstate = 'delivered';
            render();
            await wait(700 + Math.random() * 1500);
            sentEvent.dstate = 'read';
            render();
        }

        live.typing = resolveKey(c.name);
        render();

        const scene = sceneContext(6);
        const shot = pickShot(request, settings().selfieBias);
        logDebug(`кадр: ${shot}`);

        const asked = (String(request || '').match(
            /(?:show me|send me|покажи|пришли|скинь)\s+(?:your\s+|мне\s+|сво[йюяё]\s+)?([^.,!?\n]{2,40})/i
        ) || [])[1];

        const описание = await askModel([
        `Scene right now:\n${scene}`,
        c.place ? `${c.name} is at: ${c.place}` : '',
        `Shot type: ${SHOT_KINDS[shot]}`,
        `Answer with ONE line describing what is visible in that photo:`,
        `the subject, the room or place around it, the time of day, the angle.`,
        `Under 25 words. No camera settings, no lighting jargon, no quality words,`,
        `no names, no quotes, no explanation. Just what is in the picture.`,
    ].filter(Boolean).join('\n\n'));

        live.typing = '';

        const prompt = stripPanels(shot).replace(/^["']|["']$/g, '').split('\n')[0].trim();
        if (!prompt || /HEADER|CROSSROADS|COMMENTS/i.test(prompt)) {
            logDebug('модель не описала кадр');
            render();
            return;
        }

        const ev = addEvent({
            mesId: null, type: 'photo', dir: 'in', from: c.name,
            prompt, text: '', state: 'idle',
        });
        save();
        render();
        pushInjection();
        if (settings().autoPhotos) generatePhoto(ev);
    } finally {
        live.typing = '';
        render();
    }
}

async function askForPhoto(k) {
    const c = contact(k.replace(/^g:/, ''));
    if (!c) return;

    const mesId = await pushToChat(`[PHONE]\nSMS|${c.name}|send me a picture|out\n[/PHONE]`);
    addEvent({ mesId, type: 'sms', dir: 'out', from: c.name, text: 'send me a picture', dstate: 'sent' });
    save();

    live.typing = resolveKey(c.name);
    render();

    const scene = sceneContext(6);
    const shot = pickShot('', settings().selfieBias);
    logDebug(`кадр (кнопка камеры): ${shot}`);

    const описание = await askModel([
        cardContext(),
        await lorebookContext(`${scene} ${c.name}`),
        `Current scene:\n${scene}`,
        c.lore ? `Who ${c.name} is: ${c.lore}` : '',
        c.place ? `Where they live: ${c.place}` : '',
        c.clothes ? `What they are wearing: ${c.clothes}` : '',
        `The phone owner just asked ${c.name} to send a picture.`,
        `Describe the photo ${c.name} would actually take right now, in English, as an image prompt.`,
        `Shot type for this photo: ${SHOT_KINDS[shot]}`,
        SHOT_RULE,
        `Only the framing: place, light, time of day, angle, what is in frame.`,
        `Keep it plain and ordinary. Do not add artistic words like cinematic, dramatic,`,
        `moody, golden hour, bokeh, professional, high detail — this is a throwaway phone snap.`,
        `Do not describe how anyone looks — appearance is attached separately.`,
        `One line, under 200 characters, no quotes, no explanation.`,
        `Do NOT include any HEADER, CROSSROADS, COMMENTS or other UI panel. Just the plain image description.`,
    ].filter(Boolean).join('\n\n'));

    live.typing = '';

    let prompt = stripPanels(описание).replace(/^["']|["']$/g, '').split('\n')[0].trim();
    if (!prompt || /HEADER|CROSSROADS|COMMENTS/i.test(prompt)) {
        logDebug('модель вернула панель вместо кадра');
        render();
        return;
    }

    const ev = addEvent({
        mesId: null, type: 'photo', dir: 'in', from: c.name,
        prompt, text: '', state: 'idle',
    });
    save();
    render();
    pushInjection();

    if (settings().autoPhotos) generatePhoto(ev);
}

async function sendPhotoFromPhone(k, file) {
    const c = contact(k.replace(/^g:/, '')) || { name: k };
    let url = '';
    try {
        url = await shrinkImage(file, 512);
    } catch (err) {
        logDebug(`картинка не загрузилась: ${err?.message || err}`);
        return;
    }

    const mesId = await pushToChat(`[PHONE]\nPHOTO|${c.name}|a photo the owner took|sent a photo|out\n[/PHONE]`);
    addEvent({ mesId, type: 'photo', dir: 'out', from: c.name, image: url, state: 'done', text: '' });
    save();
    render();
}

async function sendFromPhone(k, text) {
    const isGroup = k.startsWith('g:');
    const group = isGroup ? store().groups[keyOf(k.slice(2))] : null;
    const c = isGroup
        ? { key: k, name: group?.name || k.slice(2) }
        : (contact(k) || { name: k });
    const target = group ? `${settings().ownerLabel}@${group.name}` : c.name;
    const mesId = await pushToChat(`[PHONE]\nSMS|${target}|${text}|out\n[/PHONE]`);

    const sent = addEvent({
        mesId, type: 'sms', dir: 'out', from: c.name,
        group: group?.name || '', text, dstate: 'sent',
    });
    save();
    render();

    const mode = settings().replyMode;

    // «пришли фото цветка», «сфоткай», «покажи» — это просьба о картинке,
    // а не обычная реплика. Иначе модель отвечает прозой «пришлю позже».
    // Просьба о картинке формулируется как угодно: «пришли фото», «покажи себя»,
    // «send me yourself», «wanna see you». Ловим смысл, а не одно слово.
    const asksPhoto =
        /\b(pic|pics|picture|photo|photos|selfie|snap|shot)\b/i.test(text)
        || /\b(send|show|gimme|give)\s+(me\s+)?(a\s+|the\s+)?(you|yourself|your\s+face|us)\b/i.test(text)
        || /\b(wanna|want\s+to|let\s+me)\s+(see|look\s+at)\b/i.test(text)
        || /\bshow\s+me\b/i.test(text)
        || /(фотк|фото|сфотк|снимок|сними|селфи|покажи|скинь)/i.test(text)
        || /(пришли|кинь|скинь)\s+(мне\s+)?(себя|своё|свое|фот)/i.test(text)
        || /(хочу|дай)\s+(тебя\s+)?(увидеть|посмотреть|глянуть)/i.test(text);

    if (mode === 'phone' && asksPhoto) {
        // в просьбе почти всегда есть и человеческая часть — на неё отвечаем словами,
        // а снимок присылаем следом, как в жизни
        await generateReply(c, text, sent, { photoPending: true });
        await deliverPhoto(c, text, null);
        return;
    }
    if (mode === 'phone') await generateReply(c, text, sent);
    else if (mode === 'chat') await runSlash('/trigger');
}

// Звонок от игрока: событие в журнал + маркер в чат, чтобы модель знала
// о звонке и могла отыграть разговор в сцене.
async function placeCall(key) {
    const c = contact(key);
    if (!c) return;

    const ev = addEvent({
        mesId: null, type: 'call', dir: 'out', from: c.name,
        status: 'dialing', read: true,
    });
    save();
    go('dialing', ev.id);

    await pushToChat(`[PHONE]\nCALL|${c.name}|outgoing\n[/PHONE]`);

    // сколько гудков — тоже часть сцены
    await wait(2600 + Math.random() * 3400);

    let verdict = 'answered';
    if (settings().replyMode !== 'none') {
        const scene = sceneContext(6);
        const answer = await askModel([
            cardContext(),
            await lorebookContext(`${scene} ${c.name}`),
            `Current scene:\n${scene}`,
            `The phone owner is calling ${c.name} right now.`,
            `Decide what ${c.name} does. Answer with exactly one word: answered, declined, or noanswer.`,
            `People normally pick up when someone they know calls, so "answered" is the default.`,
            `Choose declined or noanswer only if the scene gives a real reason — they are asleep,`,
            `driving, in the middle of something they cannot leave, or actively refusing contact.`,
        ].filter(Boolean).join('\n\n'));

        const word = String(answer || '').toLowerCase();
        if (/no\s*answer|noanswer|voicemail|не\s*отвеч/.test(word)) verdict = 'noanswer';
        else if (/declin|reject|сброс|отклон/.test(word)) verdict = 'declined';
        else verdict = 'answered';
    }

    ev.status = verdict;
    if (verdict === 'answered') ev.dur = `${Math.floor(1 + Math.random() * 8)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`;
    save();
    go('log');
    pushInjection();

    if (verdict === 'answered' && settings().replyMode !== 'none') await runSlash('/trigger');
}

// Если смс или звонок описали прозой, а маркер не поставили — вытаскиваем.
// Сначала дешёвая проверка по словам, чтобы не дёргать модель каждый ход.
const PHONE_WORDS = /\b(text|texts|texted|texting|message|messaged|sms|call|calls|called|calling|phone|dial(?:s|ed)?|voicemail|hung up|picked up|rang|ring)\b|\b(смс|сообщени\w*|звон\w*|позвон\w*|набрал\w*|трубк\w*|телефон\w*)\b/i;

async function scanProse(mesId, text) {
    const s = settings();
    if (!s.proseScan || !s.enabled) return;

    const clean = String(text || '').replace(BLOCK_RE, '').trim();
    if (!clean || !PHONE_WORDS.test(clean)) return;

    const names = Object.values(store().contacts).map(c => c.name).join(', ');

    const out = await askModel([
        `Read this passage from a roleplay scene and extract only real phone activity that happens in it.`,
        names ? `Known contacts: ${names}. Use these exact names when they match.` : '',
        `Passage:\n${clean}`,
        ``,
        `Output one line per event, nothing else:`,
        `SMS|Name|the message text          (add |out at the end if the phone owner sent it)`,
        `CALL|Name|incoming                 (or: missed, declined, answered, ended, outgoing)`,
        `PHOTO|Name|english image prompt|caption`,
        ``,
        `Only include something that actually happened in this passage. Do not invent wording:`,
        `if the exact message text is not written out, skip it. If nothing phone-related happened,`,
        `answer with exactly NONE.`,
    ].filter(Boolean).join('\n'));

    const body = String(out || '').trim();
    if (!body || /^none$/i.test(body)) return;

    let added = 0;
    body.split('\n').map(l => l.trim()).filter(Boolean).forEach(line => {
        if (!/^(SMS|CALL|PHOTO|VOICE)\|/i.test(line)) return;
        if (parseLine(line, mesId)) added++;
    });

    if (added) {
        save();
        render();
        pushInjection();
        logDebug(`из прозы вытащено событий: ${added}`);
    }
}

// Один фоновый запрос за ход, с приоритетом: сначала вытащить реально
// произошедшее из прозы, и только если там пусто — дать шанс инициативе.
async function backgroundWork(mesId, text) {
    if (busyTurn) return;
    busyTurn = true;
    try {
        const before = store().events.length;
        await scanProse(mesId, text);
        if (store().events.length === before) await maybeProactive();
    } finally {
        busyTurn = false;
    }
}

// ---------------------------------------------------------------- events

// Сообщения игрока: маркеры разбираем всегда, прозу — если включён подхват.
function ingestUser(mesId) {
    if (!settings().enabled) return;
    const ctx = getContext();
    const msg = ctx.chat?.[mesId];
    if (!msg || !msg.is_user || msg.extra?.ivyph_carrier) return;

    purgeMessage(mesId);
    const made = parseBlocks(msg.mes, mesId);

    if (made.length) {
        save();
        render();
        pushInjection();
        setTimeout(scrubAll, 0);
        made.filter(e => e.type === 'photo' && settings().autoPhotos).forEach(generatePhoto);
        return;
    }

    scanProse(mesId, msg.mes);
}

function ingest(mesId) {
    if (!settings().enabled) return;
    const ctx = getContext();
    const msg = ctx.chat?.[mesId];
    if (!msg || msg.is_user) return;

    purgeMessage(mesId);
    const made = parseBlocks(msg.mes, mesId);

    if (!made.length) {
        maybeScam();
        backgroundWork(mesId, msg.mes);
        return;
    }

    save();
    render();
    setTimeout(() => { scrubAll(); markMessage(mesId); }, 0);

    if (settings().autoPhotos) made.filter(e => e.type === 'photo').forEach(generatePhoto);

    maybeScam();
    backgroundWork(mesId, msg.mes);

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
    eventSource.on(event_types.MESSAGE_SENT, ingestUser);
    eventSource.on(event_types.MESSAGE_UPDATED, ingest);
    eventSource.on(event_types.MESSAGE_SWIPED, id => purgeMessage(id));
    eventSource.on(event_types.MESSAGE_DELETED, id => purgeMessage(id, true));

    eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, () => setTimeout(scrubAll, 0));
    eventSource.on(event_types.USER_MESSAGE_RENDERED, () => setTimeout(scrubAll, 0));

    eventSource.on(event_types.CHAT_CHANGED, () => {
        screen = { name: 'home', arg: null };
        rebuildFromChat();
        syncFromContext();
        mergeDuplicates();
        syncFromLorebook();
        pushInjection();
        render();
        setTimeout(scrubAll, 100);
    });

    try {
        getContext().registerSlashCommand?.('phone', () => { togglePhone(true); return ''; }, [], 'open the phone', true, true);
    } catch { /* необязательно */ }

    buildSettingsPanel();
    buildMenuEntry();
    setInterval(() => { if (ui && !ui.overlay.hidden) ui.overlay.querySelector('.ivyph-clock').textContent = gameClock(); }, 20000);
    setTimeout(() => {
        rebuildFromChat(); syncFromContext(); mergeDuplicates();
        syncFromLorebook(); pushInjection(); render(); scrubAll();
    }, 800);
}

// Запасной вход: пункт в меню волшебной палочки рядом с полем ввода.
// Нужен на случай, если плавающая кнопка окажется за краем экрана
// или под интерфейсом конкретной сборки таверны.
function buildMenuEntry() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu || document.getElementById('ivyph_menu_item')) return;

    const item = el('div', 'list-group-item flex-container flexGap5 interactable');
    item.id = 'ivyph_menu_item';
    item.tabIndex = 0;
    item.innerHTML = `${icon('device')}<span>Телефон</span>`;
    item.addEventListener('click', () => togglePhone(true));
    menu.appendChild(item);
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
                <label class="checkbox_label"><input type="checkbox" data-s="autoOpenOnCall"> Открывать телефон при звонке</label>
                <label class="checkbox_label"><input type="checkbox" data-s="autoPhotos"> Генерировать фото сразу, без кнопки</label>

                <label>Оформление
                    <select class="text_pole" data-s="skin">
                        <option value="modern">Современный смартфон</option>
                        <option value="iphone4">iPhone 4S</option>
                        <option value="android">Android</option>
                        <option value="nokia">Старая Nokia</option>
                    </select>
                </label>
                <label>Чем снято фото
                    <select class="text_pole" data-s="camera">
                        ${Object.entries(CAMERAS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
                    </select>
                </label>
                <label class="checkbox_label"><input type="checkbox" data-s="scams"> Спам и мошенники</label>
                <label class="checkbox_label"><input type="checkbox" data-s="chatBadge"> Показывать метку в чате, когда телефон что-то получил</label>
                <label class="checkbox_label"><input type="checkbox" data-s="proseScan"> Подхватывать смс и звонки из текста ролевой</label>
                <label class="checkbox_label"><input type="checkbox" data-s="proactive"> Контакты пишут сами</label>
                <label>Шанс, что напишут (%)<input class="text_pole" type="number" data-s="proactiveChance"></label>
                <label>Из них незнакомый номер (%)<input class="text_pole" type="number" data-s="strangerChance"></label>

                <hr>
                <b>Ответы</b>
                <label>Когда я пишу из телефона
                    <select class="text_pole" data-s="replyMode">
                        <option value="phone">Контакт отвечает сам (отдельный запрос)</option>
                        <option value="chat">Продолжить ролевую обычным ходом</option>
                        <option value="none">Ничего не делать</option>
                    </select>
                </label>
                <label>Профиль подключения<input class="text_pole" data-s="profile" placeholder="пусто — текущий профиль"></label>
                <label>Контекст для телефона
                    <select class="text_pole" data-s="contextMode">
                        <option value="full">Карточка, персона и сцена</option>
                        <option value="slice">Только последние сообщения</option>
                    </select>
                </label>
                <label>Максимальная длина ответа<input class="text_pole" type="number" data-s="replyLength"></label>
                <label>Префил<input class="text_pole" data-s="prefill"></label>

                <hr>
                <b>Инструкция</b>
                <label class="checkbox_label"><input type="checkbox" data-s="autoInject"> Инжектить автоматически (не править пресет)</label>
                <label class="checkbox_label"><input type="checkbox" data-s="compact"> Компактная инструкция</label>
                <label>Глубина инжекта<input class="text_pole" type="number" data-s="injectDepth"></label>

                <hr>
                <b>Картинки и часы</b>
                <label>Способ генерации
                    <select class="text_pole" data-s="imageMode">
                        <option value="tag">Тег в сообщении (sillyimages)</option>
                        <option value="slash">Слэш-команда</option>
                    </select>
                </label>
                <label>Тег для картинки<input class="text_pole" data-s="imageTag"></label>
                <label>Слэш-команда<input class="text_pole" data-s="imageCommand" placeholder="/sd quiet=true {{prompt}}"></label>
                <label>Время в игре<input class="text_pole" data-s="timeMacro" placeholder="{{getvar::time}}"></label>
                <label>Дата в игре<input class="text_pole" data-s="dateMacro" placeholder="{{getvar::date}}"></label>
                <label>Оператор<input class="text_pole" data-s="carrier"></label>

                <hr>
                <button class="menu_button" data-report>Показать отчёт</button>
            </div>
        </div>`;
    host.appendChild(box);

    box.querySelector('[data-report]')?.addEventListener('click', () => {
        const text = debugLog.length ? debugLog.join('\n') : 'Ошибок не было.';
        alert(text);
    });

    box.querySelectorAll('[data-s]').forEach(f => {
        const key = f.dataset.s;
        if (f.type === 'checkbox') f.checked = !!s[key]; else f.value = s[key];
        f.addEventListener('change', () => {
            if (f.type === 'checkbox') s[key] = f.checked;
            else if (f.type === 'number') s[key] = Number(f.value) || 0;
            else s[key] = f.value;
            saveSettingsDebounced();
            if (key === 'hideMarkers' || key === 'chatBadge') scrubAll();
            if (key === 'skin') render();
            if (['autoInject', 'compact', 'injectDepth'].includes(key)) pushInjection();
        });
    });
}

jQuery(() => init());
