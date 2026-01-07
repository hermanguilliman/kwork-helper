// ==UserScript==
// @name Kwork Helper
// @namespace http://tampermonkey.net/
// @version 1.1
// @description Optimization of the Kwork exchange: stats replacement, spam filter, auto-refresh.
// @author Herman Guilliman
// @match https://kwork.ru/projects*
// @icon https://www.google.com/s2/favicons?sz=64&domain=kwork.ru
// @grant GM_notification
// @grant GM_setClipboard
// @copyright 2026, Herman Guilliman (hermanguilliman@proton.me)
// @updateURL https://raw.githubusercontent.com/hermanguilliman/kwork-helper/main/kwork-helper.user.js
// @downloadURL https://raw.githubusercontent.com/hermanguilliman/kwork-helper/main/kwork-helper.user.js
// ==/UserScript==

(function () {
    "use strict";

    const DEFAULTS = {
        goodPrice: 3000,
        badPrice: 500,
        goodHireRate: 40,
        badHireRate: 20,
        refreshTime: 60,
        soundEnabled: true,
        stopWords: [
            "за отзыв",
            "ради отзыва",
            "для отзыва",
            "за процент",
            "на процент",
            "% от продаж",
            "бюджет 0",
            "бесплатно",
            "бартер",
            "нет бюджета",
        ],
        urgentWords: [
            "срочно",
            "asap",
            "сегодня",
            "сейчас",
            "вчера",
            "быстро",
            "горит",
        ],
    };

    const CSS = `
    #kw_panel {
        position: fixed; top: 40%; left: 0;
        z-index: 999990; font-family: 'Roboto', sans-serif;
        display: flex; flex-direction: row; align-items: flex-start;
        pointer-events: none; transform: translateY(-50%);
    }
    .kw-fab {
        width: 24px; height: 40px; 
        border-radius: 0 8px 8px 0;
        background: #87B448;
        box-shadow: 2px 2px 8px rgba(0,0,0,0.15);
        cursor: pointer; display: flex; align-items: center; justify-content: center;
        color: #fff; font-weight: 700; font-size: 11px; user-select: none;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); 
        pointer-events: auto; position: relative;
        opacity: 0.6; transform: translateX(-2px);
    }
    .kw-fab:hover, #kw_panel.open .kw-fab { 
        width: 45px; opacity: 1; transform: translateX(0);
        background: linear-gradient(135deg, #87B448 0%, #609438 100%);
        font-size: 13px;
    }
    .kw-fab:active { opacity: 0.9; }
    
    .kw-menu {
        background: #fff; width: 240px; border-radius: 8px;
        box-shadow: 4px 4px 20px rgba(0,0,0,0.15); 
        margin-left: 10px;
        border: 1px solid #eee; overflow: hidden;
        opacity: 0; transform: translateX(-20px) scale(0.95);
        transition: all 0.2s cubic-bezier(0.165, 0.84, 0.44, 1);
        pointer-events: none; visibility: hidden;
    }
    #kw_panel.open .kw-menu { opacity: 1; transform: translateX(0) scale(1); pointer-events: auto; visibility: visible; }
    
    .kw-head { padding: 12px 15px; background: #f8f9fa; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
    .kw-title { font-weight: 700; font-size: 13px; color: #333; }
    .kw-btn-icon { cursor: pointer; color: #888; font-size: 16px; transition: color 0.2s; }
    .kw-btn-icon:hover { color: #333; }
    .kw-body { padding: 15px; }
    .kw-opt-row { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #555; margin-bottom: 12px; }
    .kw-opt-row:last-child { margin-bottom: 0; }
    .kw-switch { position: relative; width: 36px; height: 20px; }
    .kw-switch input { opacity: 0; width: 0; height: 0; }
    .kw-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #e0e0e0; transition: .3s; border-radius: 34px; }
    .kw-slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: white; transition: .3s; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
    input:checked + .kw-slider { background-color: #87B448; }
    input:checked + .kw-slider:before { transform: translateX(16px); }
    .kw-timer-status { font-size: 11px; color: #87B448; text-align: center; margin-top: 10px; font-weight: 600; background: #f0f7e6; padding: 4px; border-radius: 4px; }
    .kw-badge { display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 6px; font-size: 12px; font-weight: 700; line-height: 1.4; vertical-align: middle; margin: 0 4px; }
    .kw-badge-good { background: #e6f9ed; color: #27ae60; border: 1px solid #c3e6cb; }
    .kw-badge-bad { background: #fdeaea; color: #e74c3c; border: 1px solid #f5c6cb; }
    .kw-badge-mid { background: #fff8e1; color: #f39c12; border: 1px solid #ffeeba; }
    .kw-badge-neutral { background: #f8f9fa; color: #6c757d; border: 1px solid #dee2e6; }
    .kw-badge-spam { background: #f2f2f2; color: #999; border: 1px solid #e0e0e0; margin-bottom: 5px; display:inline-block; font-size: 10px; border-radius: 12px; text-transform: uppercase; font-weight: 600; padding: 2px 8px; }
    .kw-border-good { border-left: 5px solid #87B448 !important; }
    .kw-bg-bad { background-color: rgba(255, 0, 0, 0.03) !important; }
    .kw-spam-card { opacity: 0.4; filter: grayscale(100%); transition: all 0.3s; }
    .kw-spam-card:hover { opacity: 0.9; filter: grayscale(0%); }
    .kw-hidden { display: none !important; }
    .kw-urgent-fire { font-size: 14px; margin-right: 5px; animation: pulse 1.5s infinite; cursor: help; }
    .kw-new-dot { width: 8px; height: 8px; background: #ff4757; border-radius: 50%; display: inline-block; margin-right: 8px; animation: pulse 1s infinite; }
    .kw-copy-btn { cursor: pointer; margin-left: 8px; opacity: 0.3; font-size: 14px; background: none; border: none; padding: 0; }
    .kw-copy-btn:hover { opacity: 1; color: #007bff; }
    .kw-note-icon { cursor: pointer; margin-left: 5px; font-size: 12px; opacity: 0.3; transition: opacity 0.2s; }
    .kw-note-icon:hover, .kw-note-icon.has-note { opacity: 1; }
    .kw-note-text { display: block; font-size: 11px; color: #666; background: #fff8dc; padding: 3px 8px; border-radius: 6px; margin-top: 4px; border: 1px solid #eee; }
    .kw-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 999995; display: flex; align-items: center; justify-content: center; opacity: 0; visibility: hidden; transition: 0.2s; }
    .kw-overlay.open { opacity: 1; visibility: visible; }
    .kw-modal { background: #fff; width: 450px; border-radius: 12px; padding: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.2); transform: translateY(20px); transition: 0.3s; }
    .kw-overlay.open .kw-modal { transform: translateY(0); }
    .kw-modal-title { font-size: 18px; font-weight: bold; margin-bottom: 15px; color: #333; display:flex; justify-content:space-between; }
    .kw-modal-close { cursor: pointer; color: #999; }
    .kw-input-group { display: flex; gap: 10px; margin-bottom: 15px; }
    .kw-input { flex: 1; padding: 10px 12px; border: 1px solid #ddd; border-radius: 8px; outline: none; transition: 0.2s; }
    .kw-input:focus { border-color: #87B448; }
    .kw-btn { background: #87B448; color: #fff; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: 600; transition: 0.2s; }
    .kw-btn:hover { background: #76a03e; }
    .kw-tags { display: flex; flex-wrap: wrap; gap: 6px; max-height: 250px; overflow-y: auto; padding: 10px; background: #f9f9f9; border-radius: 8px; border: 1px solid #eee; margin-top: 15px; }
    .kw-tag { background: #fff; border: 1px solid #ddd; padding: 5px 12px; border-radius: 20px; font-size: 12px; color: #555; display: flex; align-items: center; gap: 6px; }
    .kw-tag-rm { cursor: pointer; color: #ff4757; font-weight: bold; }
    
    /* Animation for the button */
    .kw-pulse-ring::after {
        content: ''; position: absolute; top: -3px; left: 0; right: -3px; bottom: -3px;
        border-radius: 0 8px 8px 0; border: 2px solid #87B448; animation: pulse-ring 2s infinite; pointer-events: none;
    }
    @keyframes pulse-ring { 0% { transform: scale(1); opacity: 1; } 100% { transform: scaleX(1.1) scaleY(1.3); opacity: 0; } }
    @keyframes pulse { 0% { transform: scale(0.95); opacity: 0.7; } 50% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(0.95); opacity: 0.7; } }
`;

    class ConfigManager {
        constructor() {
            this.keys = {
                stopWords: "kw_stop_words",
                userNotes: "kw_user_notes",
                autoRefresh: "kw_autorefresh",
                hideSpam: "kw_hide_spam",
            };
        }
        getStopWords() {
            return (
                JSON.parse(localStorage.getItem(this.keys.stopWords)) ||
                DEFAULTS.stopWords
            );
        }
        setStopWords(words) {
            localStorage.setItem(this.keys.stopWords, JSON.stringify(words));
        }
        getUserNote(username) {
            return (
                JSON.parse(localStorage.getItem(this.keys.userNotes) || "{}")[
                    username
                ] || null
            );
        }
        setUserNote(username, text) {
            const notes = JSON.parse(
                localStorage.getItem(this.keys.userNotes) || "{}"
            );
            text ? (notes[username] = text) : delete notes[username];
            localStorage.setItem(this.keys.userNotes, JSON.stringify(notes));
        }
        get(key) {
            return localStorage.getItem(key) === "true";
        }
        set(key, val) {
            localStorage.setItem(key, val);
        }
    }

    class UIManager {
        constructor(app) {
            this.app = app;
            this.panel = null;
            this.timeLeft = DEFAULTS.refreshTime;
            this.injectStyles();
        }
        injectStyles() {
            const style = document.createElement("style");
            style.textContent = CSS;
            document.head.appendChild(style);
        }
        renderPanel() {
            if (document.getElementById("kw_panel")) {
                return;
            }
            const div = document.createElement("div");
            div.id = "kw_panel";
            const isAuto = this.app.config.get(
                this.app.config.keys.autoRefresh
            );
            const isHide = this.app.config.get(this.app.config.keys.hideSpam);

            div.innerHTML = `
            <div class="kw-fab" id="kw_fab_btn">KH</div>
            <div class="kw-menu">
                <div class="kw-head">
                    <span class="kw-title">Kwork Helper</span>
                    <span class="kw-btn-icon" id="kw_btn_settings">⚙️</span>
                </div>
                <div class="kw-body">
                    <div class="kw-opt-row">
                        <span>Авто-обновление</span>
                        <label class="kw-switch"><input type="checkbox" id="kw_inp_auto" ${
                            isAuto ? "checked" : ""
                        }><span class="kw-slider"></span></label>
                    </div>
                    <div class="kw-opt-row">
                        <span>Скрывать спам</span>
                        <label class="kw-switch"><input type="checkbox" id="kw_inp_spam" ${
                            isHide ? "checked" : ""
                        }><span class="kw-slider"></span></label>
                    </div>
                    <div id="kw_timer_txt" class="kw-timer-status" style="display: ${
                        isAuto ? "block" : "none"
                    }">Обновление: ${this.timeLeft}с</div>
                </div>
            </div>
        `;
            document.body.appendChild(div);
            this.panel = div;
            this.bindEvents();
            this.updateTimerUI();
        }
        bindEvents() {
            const fab = document.getElementById("kw_fab_btn");
            fab.addEventListener("click", () => {
                this.panel.classList.toggle("open");
            });
            document.addEventListener("click", (e) => {
                if (!this.panel.contains(e.target)) {
                    this.panel.classList.remove("open");
                }
            });
            document
                .getElementById("kw_inp_auto")
                .addEventListener("change", (e) => {
                    this.app.config.set(
                        this.app.config.keys.autoRefresh,
                        e.target.checked
                    );
                    this.timeLeft = DEFAULTS.refreshTime;
                    this.updateTimerUI();
                    if (e.target.checked) {
                        window.location.reload();
                    }
                });
            document
                .getElementById("kw_inp_spam")
                .addEventListener("change", (e) => {
                    this.app.config.set(
                        this.app.config.keys.hideSpam,
                        e.target.checked
                    );
                    this.app.processor.toggleSpam(e.target.checked);
                });
            document
                .getElementById("kw_btn_settings")
                .addEventListener("click", () => {
                    this.panel.classList.remove("open");
                    this.openSettings();
                });
        }
        updateTimerUI() {
            const isAuto = this.app.config.get(
                this.app.config.keys.autoRefresh
            );
            const txt = document.getElementById("kw_timer_txt");
            const fab = document.getElementById("kw_fab_btn");
            if (isAuto) {
                fab.classList.add("kw-pulse-ring");
                if (txt) {
                    txt.style.display = "block";
                    txt.innerText = `Обновление: ${this.timeLeft}с`;
                }
            } else {
                fab.classList.remove("kw-pulse-ring");
                if (txt) {
                    txt.style.display = "none";
                }
            }
        }
        openSettings() {
            const old = document.querySelector(".kw-overlay");
            if (old) {
                old.remove();
            }
            const modalHtml = `<div class="kw-overlay open" id="kw_settings"><div class="kw-modal"><div class="kw-modal-title"><span>Фильтр стоп-слов</span><span class="kw-modal-close" id="kw_modal_close">✕</span></div><div class="kw-input-group"><input type="text" class="kw-input" id="kw_word_inp" placeholder="Фраза (Enter)..."><button class="kw-btn" id="kw_word_add">+</button></div><div class="kw-tags" id="kw_tags_container"></div></div></div>`;
            document.body.insertAdjacentHTML("beforeend", modalHtml);
            const render = () => {
                const words = this.app.config.getStopWords();
                document.getElementById("kw_tags_container").innerHTML = words
                    .map(
                        (w) =>
                            `<div class="kw-tag">${w} <span class="kw-tag-rm" data-w="${w}">×</span></div>`
                    )
                    .join("");
                document.querySelectorAll(".kw-tag-rm").forEach((btn) => {
                    btn.onclick = () => {
                        this.app.config.setStopWords(
                            this.app.config
                                .getStopWords()
                                .filter((x) => x !== btn.dataset.w)
                        );
                        this.app.reprocessAll();
                        render();
                    };
                });
            };
            const add = () => {
                const val = document
                    .getElementById("kw_word_inp")
                    .value.trim()
                    .toLowerCase();
                if (!val) {
                    return;
                }
                const words = this.app.config.getStopWords();
                if (!words.includes(val)) {
                    words.push(val);
                    this.app.config.setStopWords(words);
                    this.app.reprocessAll();
                    render();
                }
                document.getElementById("kw_word_inp").value = "";
            };
            document.getElementById("kw_modal_close").onclick = () =>
                document.querySelector(".kw-overlay").remove();
            document.getElementById("kw_word_add").onclick = add;
            document.getElementById("kw_word_inp").onkeypress = (e) => {
                if (e.key === "Enter") {
                    add();
                }
            };
            render();
            document.getElementById("kw_word_inp").focus();
        }
    }

    class CardProcessor {
        constructor(app) {
            this.app = app;
        }
        process(card) {
            const processed = card.getAttribute("data-kw-state");
            const textContent = (card.innerText || "").toLowerCase();
            const stopWords = this.app.config.getStopWords();
            let isSpam = false;
            if (stopWords.some((w) => textContent.includes(w))) {
                isSpam = true;
                if (processed !== "spam") {
                    this.markAsSpam(card);
                }
            }
            if (
                !processed &&
                DEFAULTS.urgentWords.some((w) => textContent.includes(w))
            ) {
                const title = card.querySelector(".wants-card__header-title");
                if (title && !title.querySelector(".kw-urgent-fire")) {
                    title.insertAdjacentHTML(
                        "afterbegin",
                        '<span class="kw-urgent-fire" title="Срочно!">🔥</span>'
                    );
                }
            }
            this.forceReplaceStats(card);
            if (!processed) {
                this.highlightPrice(card);
                this.addCopyBtn(card);
                this.setupUserNotes(card);
                if (!isSpam) {
                    card.setAttribute("data-kw-state", "active");
                }
            }
        }
        markAsSpam(card) {
            card.classList.add("kw-spam-card");
            const header = card.querySelector(
                ".wants-card__header-right-block"
            );
            if (header && !card.querySelector(".kw-badge-spam")) {
                header.insertAdjacentHTML(
                    "afterbegin",
                    '<div class="kw-badge kw-badge-spam">spam</div>'
                );
            }
            if (this.app.config.get(this.app.config.keys.hideSpam)) {
                card.classList.add("kw-hidden");
            }
            card.setAttribute("data-kw-state", "spam");
        }
        toggleSpam(hide) {
            document
                .querySelectorAll(".kw-spam-card")
                .forEach((c) =>
                    hide
                        ? c.classList.add("kw-hidden")
                        : c.classList.remove("kw-hidden")
                );
        }
        forceReplaceStats(card) {
            const statsBlock = card.querySelector(".want-payer-statistic");
            if (!statsBlock || statsBlock.querySelector(".kw-badge")) {
                return;
            }
            let textNode = null;
            const walker = document.createTreeWalker(
                statsBlock,
                NodeFilter.SHOW_TEXT
            );
            while (walker.nextNode()) {
                if (walker.currentNode.nodeValue.includes("Нанято")) {
                    textNode = walker.currentNode;
                    break;
                }
            }
            const hireMatch = statsBlock.textContent.match(/Нанято:\s*(\d+)%/);
            let badgeHTML = "",
                badgeClass = "";
            if (hireMatch) {
                const p = parseInt(hireMatch[1]);
                const type =
                    p < DEFAULTS.badHireRate
                        ? "bad"
                        : p >= DEFAULTS.goodHireRate
                        ? "good"
                        : "mid";
                const label =
                    type === "bad"
                        ? "Риск"
                        : type === "good"
                        ? "Надежный"
                        : "Средне";
                const icon =
                    type === "bad" ? "⚠️" : type === "good" ? "🛡️" : "⚖️";
                badgeHTML = `<span class="kw-badge kw-badge-${type}">${icon} ${label} (${p}%)</span>`;
            } else {
                badgeHTML = `<span class="kw-badge kw-badge-neutral">❓ Нет данных</span>`;
            }
            if (textNode) {
                const parent = textNode.parentNode;
                const span = document.createElement("span");
                span.innerHTML = badgeHTML;
                parent.replaceChild(span, textNode);
                let next = span.nextSibling;
                if (
                    next &&
                    next.textContent &&
                    next.textContent.includes("%")
                ) {
                    next.remove();
                }
            } else {
                const container = statsBlock.querySelector(
                    ".dib.v-align-t:last-child"
                );
                if (container && !container.querySelector(".kw-badge")) {
                    const div = document.createElement("div");
                    div.innerHTML = badgeHTML;
                    div.style.marginTop = "4px";
                    container.appendChild(div);
                }
            }
        }
        highlightPrice(card) {
            const el = card.querySelector(".wants-card__price");
            if (!el) {
                return;
            }
            const p = parseInt(el.textContent.replace(/\D/g, ""));
            if (p >= DEFAULTS.goodPrice) {
                card.classList.add("kw-border-good");
            } else if (p <= DEFAULTS.badPrice && p > 0) {
                card.classList.add("kw-bg-bad");
            }
        }
        addCopyBtn(card) {
            const link = card.querySelector(".wants-card__header-title a");
            if (!link) {
                return;
            }
            const btn = document.createElement("button");
            btn.className = "kw-copy-btn";
            btn.innerHTML = "❐";
            btn.title = "Скопировать заголовок";
            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                navigator.clipboard.writeText(link.innerText);
                btn.style.color = "#28a745";
                setTimeout(() => (btn.style.color = ""), 600);
            };
            link.parentNode.appendChild(btn);
        }
        setupUserNotes(card) {
            const link = card.querySelector(
                '.want-payer-statistic a[href*="/user/"]'
            );
            if (!link) {
                return;
            }
            const username = link.textContent.trim();
            const note = this.app.config.getUserNote(username);
            const icon = document.createElement("span");
            icon.className = `kw-note-icon ${note ? "has-note" : ""}`;
            icon.innerHTML = note ? "📝" : "✏️";
            icon.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                const text = prompt(`Заметка для ${username}:`, note || "");
                if (text !== null) {
                    this.app.config.setUserNote(username, text);
                    this.app.reprocessAll(true);
                }
            };
            if (note) {
                const div = document.createElement("div");
                div.className = "kw-note-text";
                div.innerText = note;
                link.parentNode.appendChild(div);
            }
            link.after(icon);
        }
    }

    class KworkAssistant {
        constructor() {
            this.config = new ConfigManager();
            this.processor = new CardProcessor(this);
            this.ui = new UIManager(this);
            this.lastTopId = localStorage.getItem("kw_last_top_id");
            this.sound = new Audio(
                "data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq"
            );
        }
        init() {
            this.ui.renderPanel();
            this.runLoop();
            new MutationObserver((ms) => {
                if (ms.some((m) => m.addedNodes.length)) {
                    this.runLoop();
                }
            }).observe(
                document.querySelector(".wants-content") || document.body,
                { childList: true, subtree: true }
            );
            setInterval(() => this.tick(), 1000);
            setInterval(() => this.runLoop(), 500);
        }
        runLoop() {
            document
                .querySelectorAll(".want-card")
                .forEach((card) => this.processor.process(card));
            this.checkNewOrders();
        }
        reprocessAll(force = false) {
            if (force) {
                document
                    .querySelectorAll(".want-card")
                    .forEach((c) => c.removeAttribute("data-kw-state"));
            }
            document
                .querySelectorAll(".kw-note-icon, .kw-note-text")
                .forEach((n) => n.remove());
            this.runLoop();
        }
        checkNewOrders() {
            const link = document.querySelector(".want-card h1 a");
            if (!link) {
                return;
            }
            const id = link.getAttribute("href");
            if (this.lastTopId && this.lastTopId !== id) {
                if (performance.now() > 2000) {
                    this.notify("🔔 Новый заказ!");
                }
                const title = link.parentNode;
                if (title && !title.querySelector(".kw-new-dot")) {
                    title.insertAdjacentHTML(
                        "afterbegin",
                        '<span class="kw-new-dot"></span>'
                    );
                }
            }
            this.lastTopId = id;
            localStorage.setItem("kw_last_top_id", id);
        }
        notify(msg) {
            if (DEFAULTS.soundEnabled) {
                this.sound.play().catch(() => {});
            }
            if (typeof GM_notification === "function") {
                GM_notification({ text: msg, title: "Kwork", timeout: 4000 });
            }
        }
        tick() {
            if (!this.config.get(this.config.keys.autoRefresh)) {
                return;
            }
            this.ui.timeLeft--;
            this.ui.updateTimerUI();
            if (this.ui.timeLeft <= 0) {
                window.location.reload();
            }
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () =>
            new KworkAssistant().init()
        );
    } else {
        new KworkAssistant().init();
    }
})();
