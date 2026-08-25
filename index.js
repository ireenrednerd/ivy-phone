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
        height: 100vh;
        height: 100dvh;
        max-height: none;
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

.ivyph-scam { opacity: .82; border: 1px dashed #6b5340; }

.ivyph-spacer { width: 26px; flex: none; }

/* ============================================================ */
/* 1. MODERN — крупные радиусы, вырез, плавающая полоса          */
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
/* 2. IPHONE 4S — скевоморфизм 2011: глянец, засечки, полосы     */
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
        180deg, #d9dbde 0 22px, #d2d5d8 22px 44px
    );
}

[data-skin="iphone4"] .ivyph-list { background: #d9dbde; }
[data-skin="iphone4"] .ivyph-row { border-bottom: 1px solid #b9bdc2; }
[data-skin="iphone4"] .ivyph-row:hover { background: #cfd2d6; }
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
/* 4. NOKIA — монохромный ЖК, пиксельный шрифт, без пузырей      */
/* ============================================================ */

[data-skin="nokia"] {
    --ph-bg: #9ead6b;
    --ph-chrome: #8d9d5d;
    --ph-line: #6f7d47;
    --ph-text: #1c2410;
    --ph-dim: #46532b;
    --ph-in: transparent;
    --ph-out: transparent;
    --ph-accent: #1c2410;
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
    background: var(--ph-text);
    color: var(--ph-bg);
    border-bottom: 0;
    font: 700 13px/1 var(--ph-mono);
    text-transform: uppercase;
    letter-spacing: .12em;
    padding: 9px 12px;
}

[data-skin="nokia"] .ivyph-title small { color: var(--ph-bg); opacity: .7; }
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
    background: var(--ph-text);
    color: var(--ph-bg);
}

[data-skin="nokia"] .ivyph-avatar img,
[data-skin="nokia"] .ivyph-call-avatar img { filter: grayscale(1) contrast(1.6); }

[data-skin="nokia"] .ivyph-row { border-bottom: 1px dotted var(--ph-line); }
[data-skin="nokia"] .ivyph-row:hover { background: var(--ph-chrome); }
[data-skin="nokia"] .ivyph-dot { border-radius: 0; background: var(--ph-text); }

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
    background: var(--ph-text);
    color: var(--ph-bg);
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
[data-skin="nokia"] .ivyph-shot-btn { background: var(--ph-text); color: var(--ph-bg); border-radius: 0; }
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
    imageCommand: '/sd quiet=true {{prompt}}',
    timeMacro: '',
    dateMacro: '',
    profile: '',
    injectDepth: 4,
    autoInject: true,
    contextMode: 'full',
    replyLength: 320,
    compact: false,
    prefill: '',
    skin: 'modern',
    scams: false,
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

    let from = parts.shift() || '';
    if (!from) return null;

    // «Arthur@Crew» — сообщение от Артура в групповой чат Crew
    let group = '';
    if (from.includes('@')) {
        const [who, where] = from.split('@');
        from = who.trim();
        group = where.trim();
    }

    switch (verb) {
        case 'SMS':
        case 'MSG':
            return addEvent({ mesId, type: 'sms', dir, from, group, text: parts.join('|') });

        case 'PHOTO':
        case 'IMG':
            return addEvent({
                mesId, type: 'photo', dir, from, group,
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

// ---------------------------------------------------------------- generation
// Телефон умеет генерировать ответ сам, отдельным запросом. Это позволяет
// второстепенному персонажу отвечать своим голосом, а не устами активной
// карточки. Профиль подключения берётся из настроек: можно поставить
// модель дешевле основной.

const REACTIONS = ['\u2764\uFE0F', '\uD83D\uDE02', '\uD83D\uDC4D', '\uD83D\uDE2E', '\uD83D\uDE22', '\uD83D\uDD25'];

const SCAM_POOL = [
    'FINAL NOTICE: your vehicle warranty is about to expire. Reply YES to renew.',
    'Your package could not be delivered. Update your address: bit.ly/2pkgfix',
    'Congratulations! You have been selected for a $1,000 gift card. Claim within 24h.',
    'Bank alert: unusual sign-in detected. Verify your identity to avoid suspension.',
    'Hey, is this still your number? I got it from an old friend :)',
];

const debugLog = [];

function logDebug(msg) {
    debugLog.push(`${new Date().toLocaleTimeString()} — ${msg}`);
    if (debugLog.length > 40) debugLog.shift();
}

function sceneContext(limit = 6) {
    try {
        const ctx = getContext();
        return (ctx.chat || [])
            .slice(-limit)
            .map(m => `${m.name}: ${String(m.mes).replace(BLOCK_RE, '').trim()}`)
            .filter(Boolean)
            .join('\n');
    } catch { return ''; }
}

function cardContext() {
    try {
        const ctx = getContext();
        const cid = ctx.characterId ?? ctx.this_chid;
        const ch = (ctx.characters || [])[cid];
        const bits = [];
        if (ch?.description) bits.push(`Setting and cast:\n${ch.description}`);
        if (ctx.name1) bits.push(`The phone owner is ${ctx.name1}.`);
        return bits.join('\n\n');
    } catch { return ''; }
}

function buildReplyPrompt(c, outgoing) {
    const s = settings();
    const thread = store().events
        .filter(e => keyOf(e.from) === c.key && e.type === 'sms')
        .slice(-12)
        .map(e => `${e.dir === 'out' ? 'OWNER' : c.name}: ${e.text}`)
        .join('\n');

    const parts = [];
    if (s.contextMode === 'full') {
        const card = cardContext();
        if (card) parts.push(card);
    }
    parts.push(`Current scene:\n${sceneContext(s.contextMode === 'full' ? 8 : 4)}`);
    if (c.anchor) parts.push(`${c.name}: ${c.anchor}`);
    parts.push(`Text conversation so far:\n${thread}`);
    parts.push(
        `Write the next text message from ${c.name} only. ` +
        `Stay in character, match how they speak out loud. ` +
        `Plain text under ${s.replyLength} characters, no quotation marks, no narration, no name prefix. ` +
        `Texting style: short, casual, contractions, occasional typos are fine.`
    );
    return parts.filter(Boolean).join('\n\n');
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
            return await ctx.generateQuietPrompt(prompt, false, false, s.prefill || '');
        }
        const flat = prompt.replace(/\|/g, '\\|').replace(/\n/g, ' ');
        return String((await runSlash(`/genraw ${flat}`))?.pipe || '');
    } catch (err) {
        logDebug(`ошибка запроса: ${err?.message || err}`);
        return '';
    } finally {
        if (previous) await runSlash(`/profile ${previous}`);
    }
}

async function generateReply(c, outgoing) {
    try {
        let text = await askModel(buildReplyPrompt(c, outgoing));
        text = String(text || '').trim().replace(/^["']|["']$/g, '');
        if (!text) { logDebug(`пустой ответ от ${c.name}`); return; }

        addEvent({ mesId: null, type: 'sms', dir: 'in', from: c.name, text });
        save();
        render();
        logDebug(`ответ от ${c.name}: ${text.slice(0, 40)}…`);
    } catch (err) {
        logDebug(`ошибка генерации: ${err?.message || err}`);
        console.error('[IVY Phone]', err);
    }
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
        'CONTACT|Full Name|+1 206 555 0114|@handle',
        'TIME|21:47|friday, august 12 2011',
        'Rules: never repeat the text of a message in the prose — describe only the reaction.',
        'Photo prompts in English, framing only: place, light, angle. Max 4 lines per block.',
    ].join('\n');
}

async function pushInjection() {
    const s = settings();
    if (!s.autoInject || !s.enabled) return;
    const flat = instructionText().replace(/\|/g, '\\|').replace(/\n/g, ' / ');
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
    wand: '<path d="M4.5 19.5 15 9"/><path d="M14 5.5 15.4 7 17 5.6 15.6 4.2Z"/><path d="M18.5 9.5v2.6M17.2 10.8h2.6M6.5 3.4v2M5.2 4.4h2.6"/>',
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
            if (!ch?.name) return;
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

function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
}

function avatarHtml(c, cls = 'ivyph-avatar') {
    const name = c?.name || '?';
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
    launcher.title = 'Phone';
    launcher.innerHTML = `<div class="ivyph-launcher-glyph">${icon('device')}</div><span class="ivyph-badge" hidden>0</span>`;
    launcher.addEventListener('click', () => togglePhone());
    document.body.appendChild(launcher);

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
    return e.group ? `g:${keyOf(e.group)}` : keyOf(e.from);
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
    if (!list.length) {
        return headTitle('Messages') + `<div class="ivyph-empty">
            ${icon('messageOff')}
            <p>No conversations yet.</p>
            <small>Messages appear when a character texts you.</small>
        </div>`;
    }
    return headTitle('Messages', `<button class="ivyph-icon-btn" data-wand>${icon('wand')}</button>`) + `<ul class="ivyph-list">` + list.map(t => {
        const un = t.list.filter(e => !e.read && e.dir === 'in').length;
        return `<li class="ivyph-row" data-thread="${esc(t.k)}">
            ${avatarHtml(t.c)}
            <span class="ivyph-row-body">
                <span class="ivyph-row-top"><b>${esc(t.c?.name || t.k)}</b><time>${esc(stampOf(t.last))}</time></span>
                <span class="ivyph-row-sub">${esc(preview(t.last))}</span>
            </span>
            ${un ? `<span class="ivyph-dot">${un}</span>` : ''}
        </li>`;
    }).join('') + `</ul>`;
}

function renderThread(k) {
    const all = store().events.filter(e => e.type !== 'call');
    const list = all.filter(e => threadKey(e) === k);
    const c = list.length ? threadHead(k, list) : (contact(k) || { name: k });
    list.forEach(e => { e.read = true; });
    save();

    const bubbles = list.map(e => {
        let inner = '';
        if (e.type === 'photo') {
            if (e.image) {
                inner = `<img class="ivyph-photo" src="${esc(e.image)}" alt="${esc(e.text || 'фото')}">`;
            } else if (e.state === 'pending') {
                inner = `<span class="ivyph-shot ivyph-shot-busy">${icon('spinner', 'ivyph-spin')} Generating…</span>`;
            } else {
                inner = `<span class="ivyph-shot">
                    <span class="ivyph-shot-desc">${icon('image')}<i>${esc(e.prompt || 'no description')}</i></span>
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
        const picker = screen.react === e.id
            ? `<span class="ivyph-picker">${REACTIONS.map(r => `<button data-react="${esc(e.id)}" data-emoji="${r}">${r}</button>`).join('')}</span>`
            : '';
        return `<div class="ivyph-bub ivyph-${e.dir}${e.scam ? ' ivyph-scam' : ''}" data-ev="${esc(e.id)}">${who}${inner}<time>${esc(stampOf(e))}</time>${react}</div>${picker}`;
    }).join('');

    return `<div class="ivyph-head ivyph-head-nav">
            <button class="ivyph-back" data-go="home">${icon('chevronLeft')}</button>
            <span class="ivyph-title">${esc(c.name)}${c.group ? `<small>${esc(c.members.join(', '))}</small>` : ''}</span>
            <button class="ivyph-icon-btn" data-card="${esc(keyOf(k))}">${icon('info')}</button>
        </div>
        <div class="ivyph-thread">${bubbles}</div>
        <div class="ivyph-compose">
            <textarea rows="1" placeholder="Message ${esc(c.name)}…"></textarea>
            <button class="ivyph-send" data-send="${esc(keyOf(k))}">${icon('arrowUp')}</button>
        </div>`;
}

function renderContacts() {
    const cs = Object.values(store().contacts);
    const rows = cs.length ? cs.map(c => `<li class="ivyph-row" data-card="${esc(c.key)}">
            ${avatarHtml(c)}
            <span class="ivyph-row-body">
                <span class="ivyph-row-top"><b>${esc(c.name)}</b></span>
                <span class="ivyph-row-sub">${esc(c.number || c.handle || 'no number saved')}</span>
            </span>
        </li>`).join('') : `<li class="ivyph-empty-row">No contacts yet.</li>`;

    return `<div class="ivyph-head ivyph-head-nav">
            <span>Contacts</span>
            <button class="ivyph-icon-btn" data-card="__new__">${icon('plus')}</button>
        </div>
        <ul class="ivyph-list">${rows}</ul>`;
}

function renderCard(k) {
    const isNew = k === '__new__';
    const c = isNew ? { name: '', number: '', handle: '', anchor: '', color: '#3d4a55' } : (contact(k) || {});
    return `<div class="ivyph-head ivyph-head-nav">
            <button class="ivyph-back" data-go="contacts">${icon('chevronLeft')}</button>
            <span>${isNew ? 'New contact' : esc(c.name)}</span>
        </div>
        <div class="ivyph-form" data-key="${esc(isNew ? '' : c.key)}">
            <label>Name<input data-f="name" value="${esc(c.name)}" placeholder="Cody Johnson"></label>
            <label>Number<input data-f="number" value="${esc(c.number)}" placeholder="+1 206 555 0114"></label>
            <label>Handle<input data-f="handle" value="${esc(c.handle)}" placeholder="@codyj"></label>
            <label>Appearance anchor<textarea data-f="anchor" rows="3" placeholder="Used when generating photos">${esc(c.anchor)}</textarea></label>
            <label>Color<input type="color" data-f="color" value="${esc(c.color || '#3d4a55')}"></label>
            <div class="ivyph-form-actions">
                <button class="ivyph-primary" data-save-card>Save</button>
                ${isNew ? '' : '<button class="ivyph-danger" data-del-card>Delete</button>'}
            </div>
        </div>`;
}

function renderConjure() {
    const cs = Object.values(store().contacts);
    const rows = cs.length
        ? cs.map(c => `<li class="ivyph-row" data-conjure="${esc(c.key)}">
            ${avatarHtml(c)}
            <span class="ivyph-row-body"><span class="ivyph-row-top"><b>${esc(c.name)}</b></span>
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

    const prompt = [
        cardContext(),
        `Current scene:\n${sceneContext(6)}`,
        c.anchor ? `${c.name}: ${c.anchor}` : '',
        `Write a short text conversation between the phone owner and ${c.name} that fits the scene above.`,
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
    const glyph = { missed: 'phoneOff', declined: 'phoneOff', incoming: 'arrowDown', outgoing: 'arrowUp' };
    return headTitle('Calls') + `<ul class="ivyph-list">` + calls.map(e => `
        <li class="ivyph-row ivyph-call-row ${e.status === 'missed' || e.status === 'declined' ? 'ivyph-missed' : ''}">
            ${avatarHtml(contact(e.from) || { name: e.from })}
            <span class="ivyph-row-body">
                <span class="ivyph-row-top"><b>${esc(e.from)}</b><time>${esc(stampOf(e))}</time></span>
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
    const map = { incoming: 'Incoming', outgoing: 'Outgoing', missed: 'Missed', declined: 'Declined', answered: 'Answered', ended: 'Ended' };
    return (map[e.status] || e.status) + (e.dur ? ` · ${e.dur}` : '');
}

function renderCall(ev) {
    const c = contact(ev.from) || { name: ev.from };
    return `<div class="ivyph-callscreen">
            <div class="ivyph-call-label">incoming call</div>
            ${avatarHtml(c, 'ivyph-call-avatar')}
            <div class="ivyph-call-name">${esc(c.name)}</div>
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
    const badge = ui.launcher.querySelector('.ivyph-badge');
    badge.hidden = n === 0;
    badge.textContent = n > 99 ? '99+' : String(n);
    ui.launcher.classList.toggle('ivyph-has-unread', n > 0);

    if (ui.overlay.hidden) return;

    ui.overlay.querySelector('.ivyph-device').dataset.skin = settings().skin || 'modern';
    ui.overlay.querySelector('.ivyph-carrier').textContent = settings().carrier;
    ui.overlay.querySelector('.ivyph-clock').textContent = gameClock();

    const ringing = store().events.find(e => e.type === 'call' && e.status === 'incoming' && !e.read);
    let html;
    if (ringing && screen.name !== 'silenced') { html = renderCall(ringing); screen.arg = ringing.id; }
    else if (screen.name === 'thread') html = renderThread(screen.arg);
    else if (screen.name === 'contacts') html = renderContacts();
    else if (screen.name === 'card') html = renderCard(screen.arg);
    else if (screen.name === 'log') html = renderLog();
    else if (screen.name === 'conjure') html = renderConjure();
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

    s.querySelectorAll('[data-ev]').forEach(n => n.addEventListener('click', ev => {
        if (ev.target.closest('[data-react]') || ev.target.closest('img')) return;
        screen.react = screen.react === n.dataset.ev ? null : n.dataset.ev;
        render();
    }));

    s.querySelectorAll('[data-react]').forEach(n => n.addEventListener('click', ev => {
        ev.stopPropagation();
        const e = store().events.find(x => x.id === n.dataset.react);
        if (e) e.reaction = e.reaction === n.dataset.emoji ? '' : n.dataset.emoji;
        screen.react = null;
        save();
        render();
    }));

    const wand = s.querySelector('[data-wand]');
    if (wand) wand.addEventListener('click', () => go('conjure'));

    s.querySelectorAll('[data-conjure]').forEach(n => n.addEventListener('click', () => {
        conjureThread(n.dataset.conjure);
    }));

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

    const mode = settings().replyMode;
    if (mode === 'phone') await generateReply(c, text);
    else if (mode === 'chat') await runSlash('/trigger');
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

    maybeScam();

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
        syncFromContext();
        syncFromLorebook();
        pushInjection();
        render();
        setTimeout(scrubAll, 100);
    });

    try {
        getContext().registerSlashCommand?.('phone', () => { togglePhone(true); return ''; }, [], 'open the phone', true, true);
    } catch { /* необязательно */ }

    buildSettingsPanel();
    setInterval(() => { if (ui && !ui.overlay.hidden) ui.overlay.querySelector('.ivyph-clock').textContent = gameClock(); }, 20000);
    setTimeout(() => {
        rebuildFromChat(); syncFromContext(); syncFromLorebook(); pushInjection(); render(); scrubAll();
    }, 800);
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
                <label class="checkbox_label"><input type="checkbox" data-s="enabled"> Enabled</label>
                <label class="checkbox_label"><input type="checkbox" data-s="hideMarkers"> Hide markers in chat</label>
                <label class="checkbox_label"><input type="checkbox" data-s="autoOpenOnCall"> Open phone on incoming call</label>
                <label class="checkbox_label"><input type="checkbox" data-s="autoPhotos"> Generate photos automatically</label>

                <label>Look
                    <select class="text_pole" data-s="skin">
                        <option value="modern">Modern smartphone</option>
                        <option value="iphone4">iPhone 4S (2011)</option>
                        <option value="android">Android</option>
                        <option value="nokia">Old Nokia</option>
                    </select>
                </label>
                <label class="checkbox_label"><input type="checkbox" data-s="scams"> Spam and scam texts</label>

                <hr>
                <b>Replies</b>
                <label>When I send a text from the phone
                    <select class="text_pole" data-s="replyMode">
                        <option value="phone">Contact answers (separate request)</option>
                        <option value="chat">Continue the roleplay instead</option>
                        <option value="none">Do nothing</option>
                    </select>
                </label>
                <label>Connection profile<input class="text_pole" data-s="profile" placeholder="empty = current profile"></label>
                <label>Context sent to the phone
                    <select class="text_pole" data-s="contextMode">
                        <option value="full">Card, persona and scene</option>
                        <option value="slice">Recent messages only</option>
                    </select>
                </label>
                <label>Max reply length<input class="text_pole" type="number" data-s="replyLength"></label>
                <label>Prefill<input class="text_pole" data-s="prefill"></label>

                <hr>
                <b>Instruction</b>
                <label class="checkbox_label"><input type="checkbox" data-s="autoInject"> Inject automatically (no preset editing)</label>
                <label class="checkbox_label"><input type="checkbox" data-s="compact"> Compact instruction</label>
                <label>Injection depth<input class="text_pole" type="number" data-s="injectDepth"></label>

                <hr>
                <b>Images and clock</b>
                <label>Image command<input class="text_pole" data-s="imageCommand" placeholder="/sd quiet=true {{prompt}}"></label>
                <label>In-game time<input class="text_pole" data-s="timeMacro" placeholder="{{getvar::time}}"></label>
                <label>In-game date<input class="text_pole" data-s="dateMacro" placeholder="{{getvar::date}}"></label>
                <label>Carrier<input class="text_pole" data-s="carrier"></label>

                <hr>
                <button class="menu_button" data-report>Show report</button>
            </div>
        </div>`;
    host.appendChild(box);

    box.querySelector('[data-report]')?.addEventListener('click', () => {
        const text = debugLog.length ? debugLog.join('\n') : 'No errors logged.';
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
            if (key === 'hideMarkers') scrubAll();
            if (key === 'skin') render();
            if (['autoInject', 'compact', 'injectDepth'].includes(key)) pushInjection();
        });
    });
}

jQuery(() => init());
