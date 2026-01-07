// ==UserScript==
// @name Kwork Helper
// @namespace http://tampermonkey.net/
// @version 1.3.2
// @description Optimization of the Kwork exchange: stats replacement, spam filter, auto-refresh, infinite scroll.
// @grant GM_notification
// @grant GM_setClipboard
// @author Herman Guilliman
// @updateURL https://raw.githubusercontent.com/hermanguilliman/kwork-helper/main/kwork-helper.user.js
// @downloadURL https://raw.githubusercontent.com/hermanguilliman/kwork-helper/main/kwork-helper.user.js
// @match https://kwork.ru/projects*
// @icon https://www.google.com/s2/favicons?sz=64&domain=kwork.ru
// @copyright 2026, Herman Guilliman (hermanguilliman@proton.me)
// ==/UserScript==

(function () {
    "use strict";

    const DEFAULTS = {
        goodPrice: 3000,
        badPrice: 500,
        goodHireRate: 40,
        badHireRate: 20,
        refreshTime: 60,
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
        border-radius: 0 8px 8px 0; background: #87B448;
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
    .kw-menu {
        background: #fff; width: 240px; border-radius: 8px;
        box-shadow: 4px 4px 20px rgba(0,0,0,0.15); margin-left: 10px;
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
    .kw-switch { position: relative; width: 36px; height: 20px; }
    .kw-switch input { opacity: 0; width: 0; height: 0; }
    .kw-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #e0e0e0; transition: .3s; border-radius: 34px; }
    .kw-slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: white; transition: .3s; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
    input:checked + .kw-slider { background-color: #87B448; }
    input:checked + .kw-slider:before { transform: translateX(16px); }
    .kw-timer-status { font-size: 11px; color: #87B448; text-align: center; margin-top: 10px; font-weight: 600; background: #f0f7e6; padding: 4px; border-radius: 4px; }
    
    .kw-badge { display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 6px; font-size: 12px; font-weight: 700; margin: 0 4px; }
    .kw-badge-good { background: #e6f9ed; color: #27ae60; border: 1px solid #c3e6cb; }
    .kw-badge-bad { background: #fdeaea; color: #e74c3c; border: 1px solid #f5c6cb; }
    .kw-badge-mid { background: #fff8e1; color: #f39c12; border: 1px solid #ffeeba; }
    .kw-badge-neutral { background: #f8f9fa; color: #6c757d; border: 1px solid #dee2e6; }
    .kw-badge-spam { background: #f2f2f2; color: #999; border: 1px solid #e0e0e0; margin-bottom: 5px; display:inline-block; font-size: 10px; border-radius: 12px; text-transform: uppercase; padding: 2px 8px; }
    
    /* MODERN STRIPS DESIGN */
    .kw-strip-good { 
        border-left: 2px solid #58cf7e !important; /* Soft Mint Green */
        background: linear-gradient(90deg, rgba(88, 207, 126, 0.08) 0%, #fff 15%) !important;
    }
    .kw-strip-bad { 
        border-left: 2px solid #ff6b6b !important; /* Soft Coral Red */
        background: linear-gradient(90deg, rgba(255, 107, 107, 0.08) 0%, #fff 15%) !important;
    }

    .kw-spam-card { opacity: 0.4; filter: grayscale(100%); transition: all 0.3s; }
    .kw-spam-card:hover { opacity: 0.9; filter: grayscale(0%); }
    .kw-hidden { display: none !important; }
    .kw-urgent-fire { font-size: 14px; margin-right: 5px; animation: pulse 1.5s infinite; cursor: help; }
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
    .kw-tags { display: flex; flex-wrap: wrap; gap: 6px; max-height: 250px; overflow-y: auto; padding: 10px; background: #f9f9f9; border-radius: 8px; border: 1px solid #eee; margin-top: 15px; }
    .kw-tag { background: #fff; border: 1px solid #ddd; padding: 5px 12px; border-radius: 20px; font-size: 12px; color: #555; display: flex; align-items: center; gap: 6px; }
    .kw-tag-rm { cursor: pointer; color: #ff4757; font-weight: bold; }
    
    .kw-pulse-ring::after {
        content: ''; position: absolute; top: -3px; left: 0; right: -3px; bottom: -3px;
        border-radius: 0 8px 8px 0; border: 2px solid #87B448; animation: pulse-ring 2s infinite; pointer-events: none;
    }
    .kw-loader { text-align: center; padding: 20px; font-size: 14px; color: #888; font-weight: bold; display: none; width: 100%; clear: both; background: #fafafa; border: 1px dashed #ccc; margin-top: 20px; }
    .kw-loader.active { display: block; }

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
                infiniteScroll: "kw_infinite_scroll",
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
            if (text) notes[username] = text;
            else delete notes[username];
            localStorage.setItem(this.keys.userNotes, JSON.stringify(notes));
        }
        get(key) {
            return localStorage.getItem(key) === "true";
        }
        set(key, val) {
            localStorage.setItem(key, val);
        }
    }

    class InfiniteScrollManager {
        constructor(app) {
            this.app = app;
            this.isEnabled = this.app.config.get(
                this.app.config.keys.infiniteScroll
            );
            this.isLoading = false;
            this.page = 1;
            this.loader = null;
            this.container = null;
            this.iframe = null;

            setTimeout(() => this.init(), 1000);
        }

        init() {
            const params = new URLSearchParams(window.location.search);
            this.page = parseInt(params.get("page")) || 1;

            this.loader = document.createElement("div");
            this.loader.className = "kw-loader";
            this.loader.innerHTML = "⏳ Загрузка заказов...";

            this.container =
                document.querySelector(".project-list") ||
                document.querySelector(".wants-content");
            if (this.container) {
                const innerList = this.container.querySelector(".project-list");
                if (innerList) this.container = innerList;
                if (this.container.parentNode) {
                    this.container.parentNode.insertBefore(
                        this.loader,
                        this.container.nextSibling
                    );
                }
            }

            window.addEventListener("scroll", () => {
                if (this.isEnabled) this.onScroll();
            });

            this.updateState();
        }

        toggle(state) {
            this.isEnabled = state;
            this.updateState();
        }

        updateState() {
            const pags = document.querySelectorAll(".pagination, .paging");
            pags.forEach((el) => {
                el.style.display = this.isEnabled ? "none" : "";
            });
            if (this.loader) {
                this.loader.style.display = this.isEnabled ? "none" : "none";
            }
        }

        onScroll() {
            if (this.isLoading) return;
            const scrollHeight = document.documentElement.scrollHeight;
            const scrollTop =
                window.scrollY || document.documentElement.scrollTop;
            const clientHeight = document.documentElement.clientHeight;
            if (scrollTop + clientHeight >= scrollHeight - 600) {
                this.loadNextPage();
            }
        }

        loadNextPage() {
            this.isLoading = true;
            this.loader.classList.add("active");
            this.loader.style.display = "block";

            this.page++;
            const url = new URL(window.location.href);
            url.searchParams.set("page", this.page);

            console.log("KW Helper: Iframe Loading:", url.toString());

            if (this.iframe) this.iframe.remove();

            this.iframe = document.createElement("iframe");
            this.iframe.style.display = "none";
            this.iframe.style.width = "0";
            this.iframe.style.height = "0";
            this.iframe.src = url.toString();

            document.body.appendChild(this.iframe);

            this.iframe.onload = () => {
                this.onIframeLoad();
            };

            setTimeout(() => {
                if (this.isLoading) {
                    console.log("KW Helper: Iframe timeout");
                    this.isLoading = false;
                    this.loader.classList.remove("active");
                }
            }, 10000);
        }

        onIframeLoad() {
            try {
                const doc =
                    this.iframe.contentDocument ||
                    this.iframe.contentWindow.document;

                setTimeout(() => {
                    const newCards = doc.querySelectorAll(".want-card");
                    console.log(
                        "KW Helper: Iframe loaded. Found cards:",
                        newCards.length
                    );

                    if (newCards.length === 0) {
                        this.loader.innerHTML = "🏁 Заказов больше нет";
                        return;
                    }

                    if (this.container) {
                        newCards.forEach((card) => {
                            const importedCard = document.adoptNode(card);
                            this.container.appendChild(importedCard);
                        });

                        this.app.processor.processBatch(
                            document.querySelectorAll(".want-card")
                        );
                        this.loader.innerHTML = "⏳ Загрузка заказов...";
                    }

                    this.iframe.remove();
                    this.iframe = null;
                    this.isLoading = false;
                    this.loader.classList.remove("active");
                    this.loader.style.display = "none";
                }, 1500);
            } catch (err) {
                console.error("KW Helper: Iframe error", err);
                this.loader.innerHTML = "❌ Ошибка доступа к Iframe";
                this.isLoading = false;
                this.loader.classList.remove("active");
            }
        }
    }

    class UIManager {
        constructor(app) {
            this.app = app;
            this.panel = null;
            this.timeLeft = DEFAULTS.refreshTime;
            const style = document.createElement("style");
            style.textContent = CSS;
            document.head.appendChild(style);
        }
        renderPanel() {
            if (document.getElementById("kw_panel")) return;
            const div = document.createElement("div");
            div.id = "kw_panel";

            let isAuto = this.app.config.get(this.app.config.keys.autoRefresh);
            let isInf = this.app.config.get(
                this.app.config.keys.infiniteScroll
            );

            if (isAuto && isInf) {
                isInf = false;
                this.app.config.set(this.app.config.keys.infiniteScroll, false);
                this.app.infinite.toggle(false);
            }

            const isHide = this.app.config.get(this.app.config.keys.hideSpam);

            div.innerHTML = `
            <div class="kw-fab" id="kw_fab_btn">KH</div>
            <div class="kw-menu">
                <div class="kw-head"><span class="kw-title">Kwork Helper</span><span class="kw-btn-icon" id="kw_btn_settings">⚙️</span></div>
                <div class="kw-body">
                    <div class="kw-opt-row"><span>Авто-обновление</span><label class="kw-switch"><input type="checkbox" id="kw_inp_auto" ${
                        isAuto ? "checked" : ""
                    }><span class="kw-slider"></span></label></div>
                    <div class="kw-opt-row"><span>Скрывать спам</span><label class="kw-switch"><input type="checkbox" id="kw_inp_spam" ${
                        isHide ? "checked" : ""
                    }><span class="kw-slider"></span></label></div>
                    <div class="kw-opt-row"><span>Бесконечная лента</span><label class="kw-switch"><input type="checkbox" id="kw_inp_inf" ${
                        isInf ? "checked" : ""
                    }><span class="kw-slider"></span></label></div>
                    <div id="kw_timer_txt" class="kw-timer-status" style="display: ${
                        isAuto ? "block" : "none"
                    }">Обновление: ${this.timeLeft}с</div>
                </div>
            </div>`;
            document.body.appendChild(div);
            this.panel = div;
            this.bindEvents();
            this.updateTimerUI();
        }

        bindEvents() {
            const fab = document.getElementById("kw_fab_btn");
            const autoInp = document.getElementById("kw_inp_auto");
            const infInp = document.getElementById("kw_inp_inf");
            const spamInp = document.getElementById("kw_inp_spam");

            fab.addEventListener("click", () =>
                this.panel.classList.toggle("open")
            );
            document.addEventListener("click", (e) => {
                if (!this.panel.contains(e.target))
                    this.panel.classList.remove("open");
            });

            autoInp.addEventListener("change", (e) => {
                const isEnabled = e.target.checked;
                this.app.config.set(
                    this.app.config.keys.autoRefresh,
                    isEnabled
                );

                if (isEnabled) {
                    infInp.checked = false;
                    this.app.config.set(
                        this.app.config.keys.infiniteScroll,
                        false
                    );
                    this.app.infinite.toggle(false);

                    this.timeLeft = DEFAULTS.refreshTime;
                    window.location.reload();
                } else {
                    this.updateTimerUI();
                }
            });

            infInp.addEventListener("change", (e) => {
                const isEnabled = e.target.checked;
                this.app.config.set(
                    this.app.config.keys.infiniteScroll,
                    isEnabled
                );
                this.app.infinite.toggle(isEnabled);

                if (isEnabled) {
                    autoInp.checked = false;
                    this.app.config.set(
                        this.app.config.keys.autoRefresh,
                        false
                    );
                    this.updateTimerUI();
                }
            });

            spamInp.addEventListener("change", (e) => {
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
                if (txt) txt.style.display = "none";
            }
        }
        openSettings() {
            if (document.querySelector(".kw-overlay"))
                document.querySelector(".kw-overlay").remove();
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
                if (!val) return;
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
                if (e.key === "Enter") add();
            };
            render();
            document.getElementById("kw_word_inp").focus();
        }
    }

    class CardProcessor {
        constructor(app) {
            this.app = app;
        }
        processBatch(nodeList) {
            nodeList.forEach((card) => this.process(card));
        }
        process(card) {
            const processed = card.getAttribute("data-kw-state");
            const textContent = (card.innerText || "").toLowerCase();
            const stopWords = this.app.config.getStopWords();
            let isSpam = false;
            if (stopWords.some((w) => textContent.includes(w))) {
                isSpam = true;
                if (processed !== "spam") this.markAsSpam(card);
            }
            if (
                !processed &&
                DEFAULTS.urgentWords.some((w) => textContent.includes(w))
            ) {
                const title = card.querySelector(".wants-card__header-title");
                if (title && !title.querySelector(".kw-urgent-fire"))
                    title.insertAdjacentHTML(
                        "afterbegin",
                        '<span class="kw-urgent-fire" title="Срочно!">🔥</span>'
                    );
            }
            this.forceReplaceStats(card);
            if (!processed) {
                this.highlightPrice(card);
                this.addCopyBtn(card);
                this.setupUserNotes(card);
                if (!isSpam) card.setAttribute("data-kw-state", "active");
            }
        }
        markAsSpam(card) {
            card.classList.add("kw-spam-card");
            const header = card.querySelector(
                ".wants-card__header-right-block"
            );
            if (header && !card.querySelector(".kw-badge-spam"))
                header.insertAdjacentHTML(
                    "afterbegin",
                    '<div class="kw-badge kw-badge-spam">spam</div>'
                );
            if (this.app.config.get(this.app.config.keys.hideSpam))
                card.classList.add("kw-hidden");
            card.setAttribute("data-kw-state", "spam");
        }
        toggleSpam(hide) {
            document.querySelectorAll(".kw-spam-card").forEach((c) => {
                if (hide) c.classList.add("kw-hidden");
                else c.classList.remove("kw-hidden");
            });
        }
        forceReplaceStats(card) {
            const statsBlock = card.querySelector(".want-payer-statistic");
            if (!statsBlock || statsBlock.querySelector(".kw-badge")) return;
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
            let badgeHTML = "";
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
                const span = document.createElement("span");
                span.innerHTML = badgeHTML;
                textNode.parentNode.replaceChild(span, textNode);
                let next = span.nextSibling;
                if (next && next.textContent && next.textContent.includes("%"))
                    next.remove();
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
            if (!el) return;
            const p = parseInt(el.textContent.replace(/\D/g, ""));

            if (p >= DEFAULTS.goodPrice) card.classList.add("kw-strip-good");
            else if (p <= DEFAULTS.badPrice && p > 0)
                card.classList.add("kw-strip-bad");
        }
        addCopyBtn(card) {
            const link = card.querySelector(".wants-card__header-title a");
            if (!link) return;
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
            if (!link) return;
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
            this.infinite = new InfiniteScrollManager(this);
            this.ui = new UIManager(this);
        }
        init() {
            this.ui.renderPanel();
            this.fixExpandButtons();
            this.runLoop();
            new MutationObserver((ms) => {
                if (ms.some((m) => m.addedNodes.length)) this.runLoop();
            }).observe(
                document.querySelector(".wants-content") || document.body,
                { childList: true, subtree: true }
            );
            setInterval(() => this.tick(), 1000);
            setInterval(() => this.runLoop(), 500);
        }
        fixExpandButtons() {
            document.addEventListener("click", (e) => {
                if (!e.target.classList.contains("kw-link-dashed")) return;

                const btn = e.target;
                const text = btn.innerText.toLowerCase();

                if (
                    !text.includes("показать полностью") &&
                    !text.includes("скрыть")
                )
                    return;

                const descContainer = btn.closest(
                    ".wants-card__description-text"
                );
                if (!descContainer) return;

                const shortBlock =
                    descContainer.querySelector(".overflow-hidden");
                const fullBlock = shortBlock
                    ? shortBlock.nextElementSibling
                    : null;

                if (shortBlock && fullBlock) {
                    if (text.includes("показать полностью")) {
                        shortBlock.style.display = "none";
                        fullBlock.style.display = "block";
                    } else {
                        fullBlock.style.display = "none";
                        shortBlock.style.display = "block";
                    }
                }
            });
        }
        runLoop() {
            document.querySelectorAll(".want-card").forEach((card) => {
                this.processor.process(card);
            });
        }
        reprocessAll(force = false) {
            if (force) {
                document.querySelectorAll(".want-card").forEach((c) => {
                    c.removeAttribute("data-kw-state");
                    c.classList.remove("kw-strip-good", "kw-strip-bad");
                });
            }
            document
                .querySelectorAll(".kw-note-icon, .kw-note-text")
                .forEach((n) => n.remove());
            this.runLoop();
        }
        tick() {
            if (!this.config.get(this.config.keys.autoRefresh)) return;
            this.ui.timeLeft--;
            this.ui.updateTimerUI();
            if (this.ui.timeLeft <= 0) window.location.reload();
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
