// ==UserScript==
// @name         Kwork Helper
// @namespace    http://tampermonkey.net/
// @version      2.0.7
// @description  Optimization of Kwork: stats, spam filter, infinite scroll, and AI integration for fast order analysis.
// @author       Herman Guilliman
// @updateURL    https://raw.githubusercontent.com/hermanguilliman/kwork-helper/main/kwork-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/hermanguilliman/kwork-helper/main/kwork-helper.user.js
// @match        https://kwork.ru/projects*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=kwork.ru
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @connect      *
// @copyright    2026, Herman Guilliman (hermanguilliman@proton.me)
// ==/UserScript==

(function () {
    "use strict";

    const DEFAULTS = {
        goodPrice: 3000,
        badPrice: 500,
        goodHireRate: 40,
        badHireRate: 20,
        refreshTime: 60,

        aiBaseUrl: "https://api.openai.com/v1",
        aiApiKey: "",
        aiModel: "gpt-4o-mini",
        aiMaxTokens: 500,
        aiPrompt:
            "Ты опытный фрилансер. Проанализируй этот заказ. 1. Насколько адекватна цена за такой объем? 2. Есть ли подводные камни? 3. Стоит ли откликаться? Ответь кратко.",
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

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    // Критичные селекторы для диагностики: если Kwork переименует классы,
    // checkDomHealth() один раз предупредит в консоли.
    const CORE_SELECTORS = {
        ".want-card": "карточки заказов",
        ".wants-card__header-title": "заголовок карточки",
        ".wants-card__price": "блок цены",
        ".wants-card__description-text": "описание заказа",
        ".want-payer-statistic": "статистика заказчика",
    };
    const seenSelectors = new Set();
    const reportedDomBreaks = new Set();
    const reportedSafeErrors = new Set();

    // Изолирует шаг обработки: сбой одной функции не роняет остальные
    // и не засоряет консоль каждые 500 мс — ошибка логируется один раз.
    function safe(label, fn) {
        try {
            fn();
        } catch (err) {
            const key = label + ": " + (err && err.message ? err.message : err);
            if (!reportedSafeErrors.has(key)) {
                reportedSafeErrors.add(key);
                console.error(`[Kwork Helper] Сбой шага «${label}»:`, err);
            }
        }
    }

    // Ранняя диагностика вёрстки Kwork (вызывается из runLoop с троттлингом).
    function checkDomHealth() {
        if (!document.querySelector(".want-card")) return;
        for (const sel of Object.keys(CORE_SELECTORS)) {
            if (sel === ".want-card") continue;
            if (document.querySelector(sel)) {
                seenSelectors.add(sel);
            } else if (seenSelectors.has(sel) && !reportedDomBreaks.has(sel)) {
                reportedDomBreaks.add(sel);
                console.warn(
                    `[Kwork Helper] Селектор «${sel}» (${CORE_SELECTORS[sel]}) больше не найден — похоже, Kwork изменил вёрстку.`,
                );
            }
        }
    }

    const CSS = `
    /* CORE PANEL & UI */
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
    
    /* SWITCHES & SLIDERS */
    .kw-switch { position: relative; width: 36px; height: 20px; }
    .kw-switch input { opacity: 0; width: 0; height: 0; }
    .kw-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #e0e0e0; transition: .3s; border-radius: 34px; }
    .kw-slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: white; transition: .3s; border-radius: 50%; box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
    input:checked + .kw-slider { background-color: #87B448; }
    input:checked + .kw-slider:before { transform: translateX(16px); }
    .kw-timer-status { font-size: 11px; color: #87B448; text-align: center; margin-top: 10px; font-weight: 600; background: #f0f7e6; padding: 4px; border-radius: 4px; }
    
    /* BADGES & STRIPS */
    .kw-badge { display: inline-flex; align-items: center; padding: 2px 10px; border-radius: 6px; font-size: 12px; font-weight: 700; margin: 0 4px; }
    .kw-badge-good { background: #e6f9ed; color: #27ae60; border: 1px solid #c3e6cb; }
    .kw-badge-bad { background: #fdeaea; color: #e74c3c; border: 1px solid #f5c6cb; }
    .kw-badge-mid { background: #fff8e1; color: #f39c12; border: 1px solid #ffeeba; }
    .kw-badge-neutral { background: #f8f9fa; color: #6c757d; border: 1px solid #dee2e6; }
    .kw-badge-spam { background: #f2f2f2; color: #999; border: 1px solid #e0e0e0; margin-bottom: 5px; display:inline-block; font-size: 10px; border-radius: 12px; text-transform: uppercase; padding: 2px 8px; }
    .kw-strip-good { border-left: 2px solid #58cf7e !important; background: linear-gradient(90deg, rgba(88, 207, 126, 0.03) 0%, #fff 15%) !important; }
    .kw-strip-bad { border-left: 2px solid #ff6b6b !important; background: linear-gradient(90deg, rgba(255, 107, 107, 0.03) 0%, #fff 15%) !important; }
    .kw-spam-card { opacity: 0.4; filter: grayscale(100%); transition: all 0.3s; }
    .kw-spam-card:hover { opacity: 0.9; filter: grayscale(0%); }
    .kw-hidden { display: none !important; }
    
    /* ICONS & UTILS */
    .kw-urgent-fire { font-size: 14px; margin-right: 5px; animation: pulse 1.5s infinite; cursor: help; }
    
    /* MODAL SETTINGS */
    .kw-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 999995; display: flex; align-items: center; justify-content: center; opacity: 0; visibility: hidden; transition: 0.2s; }
    .kw-overlay.open { opacity: 1; visibility: visible; }
    .kw-modal { background: #fff; width: 500px; max-height: 90vh; overflow-y: auto; border-radius: 12px; padding: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.2); transform: translateY(20px); transition: 0.3s; }
    .kw-overlay.open .kw-modal { transform: translateY(0); }
    .kw-modal-title { font-size: 18px; font-weight: bold; margin-bottom: 20px; color: #333; display:flex; justify-content:space-between; border-bottom: 1px solid #eee; padding-bottom: 10px;}
    .kw-modal-close { cursor: pointer; color: #999; }
    .kw-section-title { font-size: 14px; font-weight: 700; color: #555; margin: 15px 0 10px; display: block; }
    .kw-input-group { display: flex; gap: 10px; margin-bottom: 10px; }
    .kw-input { flex: 1; padding: 8px 12px; border: 1px solid #ddd; border-radius: 8px; outline: none; transition: 0.2s; font-size: 13px; width: 100%; box-sizing: border-box; }
    .kw-input:focus { border-color: #87B448; }
    .kw-textarea { width: 100%; height: 80px; resize: vertical; font-family: sans-serif; }
    .kw-btn { background: #87B448; color: #fff; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: 600; transition: 0.2s; font-size: 13px; }
    .kw-btn:hover { background: #609438; }
    .kw-btn-save { width: 100%; margin-top: 20px; padding: 12px; font-size: 14px; }
    .kw-tags { display: flex; flex-wrap: wrap; gap: 6px; max-height: 100px; overflow-y: auto; padding: 10px; background: #f9f9f9; border-radius: 8px; border: 1px solid #eee; }
    .kw-tag { background: #fff; border: 1px solid #ddd; padding: 5px 12px; border-radius: 20px; font-size: 12px; color: #555; display: flex; align-items: center; gap: 6px; }
    .kw-tag-rm { cursor: pointer; color: #ff4757; font-weight: bold; }
    
    /* AI & BUTTONS */
    .kw-ai-btn { 
        cursor: pointer; margin-left: 8px; font-size: 16px; background: none; border: none; padding: 0; 
        transition: transform 0.2s; filter: grayscale(100%); opacity: 0.6;
    }
    .kw-ai-btn:hover { transform: scale(1.2); filter: grayscale(0%); opacity: 1; }
    .kw-ai-btn.loading { animation: kw-ai-pulse 1.2s ease-in-out infinite; pointer-events: none; }
    .kw-ai-response-box {
        margin-top: 12px; padding: 12px; border-radius: 8px; 
        background: #f4f8fb; border: 1px solid #dcebf7; color: #2c3e50; font-size: 13px;
        line-height: 1.5; white-space: pre-wrap; position: relative;
    }
    .kw-ai-response-box::before { content: "🤖 Нейросеть:"; display: block; font-weight: bold; color: #3498db; margin-bottom: 6px; }
    .kw-ai-error { background: #fff5f5; border-color: #ffcccc; color: #c0392b; }
    .kw-ai-error::before { content: "❌ Ошибка:"; color: #c0392b; }

    /* LOADERS & ANIMATIONS */
    .kw-pulse-ring::after {
        content: ''; position: absolute; top: -3px; left: 0; right: -3px; bottom: -3px;
        border-radius: 0 8px 8px 0; border: 2px solid #87B448; animation: pulse-ring 2s infinite; pointer-events: none;
    }
    .kw-loader { text-align: center; padding: 20px; font-size: 14px; color: #888; font-weight: bold; display: none; width: 100%; clear: both; background: #fafafa; border: 1px dashed #ccc; margin-top: 20px; }
    .kw-loader.active { display: block; }

    @keyframes pulse-ring { 0% { transform: scale(1); opacity: 1; } 100% { transform: scaleX(1.1) scaleY(1.3); opacity: 0; } }
    @keyframes pulse { 0% { transform: scale(0.95); opacity: 0.7; } 50% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(0.95); opacity: 0.7; } }
    @keyframes kw-ai-pulse { 0%, 100% { transform: scale(1); filter: blur(0); opacity: 0.65; } 50% { transform: scale(1.4); filter: blur(2.5px); opacity: 1; } }
    `;

    class ConfigManager {
        constructor() {
            this.keys = {
                stopWords: "kw_stop_words",
                autoRefresh: "kw_autorefresh",
                hideSpam: "kw_hide_spam",
                infiniteScroll: "kw_infinite_scroll",
                aiBaseUrl: "kw_ai_base_url",
                aiApiKey: "kw_ai_api_key",
                aiModel: "kw_ai_model",
                aiMaxTokens: "kw_ai_max_tokens",
                aiPrompt: "kw_ai_prompt",
            };
        }
        get(key) {
            return localStorage.getItem(key) === "true";
        }
        set(key, val) {
            localStorage.setItem(key, val);
        }
        getString(key, defaultVal) {
            return localStorage.getItem(key) || defaultVal;
        }
        setString(key, val) {
            localStorage.setItem(key, val);
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

        getAiConfig() {
            return {
                baseUrl: this.getString(
                    this.keys.aiBaseUrl,
                    DEFAULTS.aiBaseUrl,
                ),
                apiKey: this.getString(this.keys.aiApiKey, DEFAULTS.aiApiKey),
                model: this.getString(this.keys.aiModel, DEFAULTS.aiModel),
                maxTokens: parseInt(
                    this.getString(this.keys.aiMaxTokens, DEFAULTS.aiMaxTokens),
                ),
                prompt: this.getString(this.keys.aiPrompt, DEFAULTS.aiPrompt),
            };
        }
        setAiConfig(cfg) {
            this.setString(this.keys.aiBaseUrl, cfg.baseUrl);
            this.setString(this.keys.aiApiKey, cfg.apiKey);
            this.setString(this.keys.aiModel, cfg.model);
            this.setString(this.keys.aiMaxTokens, cfg.maxTokens);
            this.setString(this.keys.aiPrompt, cfg.prompt);
        }
    }

    class AiClient {
        constructor(configManager) {
            this.config = configManager;
        }

        analyze(jobText) {
            return new Promise((resolve, reject) => {
                const cfg = this.config.getAiConfig();
                if (!cfg.apiKey) {
                    reject(new Error("Не задан API Key в настройках!"));
                    return;
                }

                const messages = [
                    { role: "system", content: cfg.prompt },
                    { role: "user", content: `ДЕТАЛИ ЗАКАЗА:\n${jobText}` },
                ];

                const payload = {
                    model: cfg.model,
                    messages: messages,
                    max_tokens: cfg.maxTokens,
                    temperature: 0.7,
                };

                GM_xmlhttpRequest({
                    method: "POST",
                    url:
                        cfg.baseUrl +
                        (cfg.baseUrl.endsWith("/") ? "" : "/") +
                        "chat/completions",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${cfg.apiKey}`,
                    },
                    data: JSON.stringify(payload),
                    timeout: 30000,
                    onload: (response) => {
                        try {
                            let data;
                            try {
                                data = JSON.parse(response.responseText);
                            } catch (e) {
                                if (response.status !== 200) {
                                    throw new Error(
                                        `HTTP ${response.status} (Not JSON)`,
                                    );
                                }
                                throw new Error("Некорректный JSON ответ");
                            }

                            if (response.status !== 200) {
                                let errorMsg = `Ошибка API (${response.status})`;

                                if (data.error && data.error.message) {
                                    errorMsg = `API: ${data.error.message}`;
                                } else if (data.message) {
                                    errorMsg = `API: ${data.message}`;
                                }

                                if (response.status === 401)
                                    errorMsg = "Ошибка 401: Неверный API Key";
                                if (response.status === 429)
                                    errorMsg =
                                        "Ошибка 429: Лимит запросов исчерпан";
                                if (response.status >= 500)
                                    errorMsg = `Ошибка ${response.status}: Проблема на сервере ИИ`;

                                throw new Error(errorMsg);
                            }

                            const content =
                                data.choices?.[0]?.message?.content ||
                                "Пустой ответ от нейросети.";
                            resolve(content);
                        } catch (e) {
                            reject(e);
                        }
                    },
                    onerror: (err) => {
                        reject(new Error("Ошибка сети / Connection Error"));
                    },
                    ontimeout: () => {
                        reject(new Error("Таймаут соединения (30с)"));
                    },
                });
            });
        }
    }

    class InfiniteScrollManager {
        constructor(app) {
            this.app = app;
            this.isEnabled = this.app.config.get(
                this.app.config.keys.infiniteScroll,
            );
            this.isLoading = false;
            this.isFinished = false;
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
                if (this.container.parentNode)
                    this.container.parentNode.insertBefore(
                        this.loader,
                        this.container.nextSibling,
                    );
            }

            window.addEventListener(
                "scroll",
                () => {
                    if (this.isEnabled) this.onScroll();
                },
                { passive: true },
            );
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
            // Loader visibility is managed by loadNextPage()/onIframeLoad()/finishFeed()
            if (this.loader) this.loader.style.display = "none";
        }
        onScroll() {
            if (this.isLoading || this.isFinished) return;
            const scrollHeight = document.documentElement.scrollHeight;
            const scrollTop =
                window.scrollY || document.documentElement.scrollTop;
            const clientHeight = document.documentElement.clientHeight;
            if (scrollTop + clientHeight >= scrollHeight - 600)
                this.loadNextPage();
        }
        loadNextPage() {
            this.isLoading = true;
            this.loader.classList.add("active");
            this.loader.style.display = "block";
            this.page++;
            const url = new URL(window.location.href);
            url.searchParams.set("page", this.page);
            if (this.iframe) this.iframe.remove();
            this.iframe = document.createElement("iframe");
            this.iframe.style.display = "none";
            this.iframe.src = url.toString();
            document.body.appendChild(this.iframe);
            this.iframe.onload = () => {
                this.onIframeLoad();
            };
            setTimeout(() => {
                if (this.isLoading) {
                    this.isLoading = false;
                    this.loader.classList.remove("active");
                }
            }, 10000);
        }
        getCardSignature(card) {
            if (!card) return "";
            const id = card.getAttribute("data-id");
            if (id) return "ID:" + id;
            const title = card.querySelector(".wants-card__header-title");
            const price = card.querySelector(".wants-card__price");
            return (
                (title ? title.textContent.trim() : "") +
                "|" +
                (price ? price.textContent.trim() : "")
            );
        }
        onIframeLoad() {
            try {
                const doc =
                    this.iframe.contentDocument ||
                    this.iframe.contentWindow.document;
                setTimeout(() => {
                    const newCards = doc.querySelectorAll(".want-card");
                    if (newCards.length === 0) {
                        this.finishFeed();
                        return;
                    }
                    if (this.container) {
                        const currentCards =
                            this.container.querySelectorAll(".want-card");
                        if (currentCards.length > 0 && newCards.length > 0) {
                            const lastCurrent =
                                currentCards[currentCards.length - 1];
                            const lastNew = newCards[newCards.length - 1];
                            if (
                                this.getCardSignature(lastCurrent) ===
                                this.getCardSignature(lastNew)
                            ) {
                                this.finishFeed();
                                return;
                            }
                        }
                        newCards.forEach((card) => {
                            const importedCard = document.adoptNode(card);
                            importedCard.removeAttribute("data-kw-state");
                            const oldAi =
                                importedCard.querySelector(".kw-ai-btn");
                            if (oldAi) oldAi.remove();
                            this.container.appendChild(importedCard);
                        });
                        this.app.processor.processBatch(
                            document.querySelectorAll(".want-card"),
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
                console.error(err);
                this.isLoading = false;
                this.loader.classList.remove("active");
            }
        }
        finishFeed() {
            this.loader.innerHTML = "🏁 Заказов больше нет";
            this.loader.classList.add("active");
            this.loader.style.display = "block";
            this.isFinished = true;
            this.isLoading = false;
            if (this.iframe) {
                this.iframe.remove();
                this.iframe = null;
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
                this.app.config.keys.infiniteScroll,
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
                <div class="kw-head"><span class="kw-title">Kwork Helper 2.0</span><span class="kw-btn-icon" id="kw_btn_settings">⚙️</span></div>
                <div class="kw-body">
                    <div class="kw-opt-row"><span>Авто-обновление</span><label class="kw-switch"><input type="checkbox" id="kw_inp_auto" ${isAuto ? "checked" : ""}><span class="kw-slider"></span></label></div>
                    <div class="kw-opt-row"><span>Скрывать спам</span><label class="kw-switch"><input type="checkbox" id="kw_inp_spam" ${isHide ? "checked" : ""}><span class="kw-slider"></span></label></div>
                    <div class="kw-opt-row"><span>Бесконечная лента</span><label class="kw-switch"><input type="checkbox" id="kw_inp_inf" ${isInf ? "checked" : ""}><span class="kw-slider"></span></label></div>
                    <div id="kw_timer_txt" class="kw-timer-status" style="display: ${isAuto ? "block" : "none"}">Обновление: ${this.timeLeft}с</div>
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
                this.panel.classList.toggle("open"),
            );
            document.addEventListener("click", (e) => {
                if (!this.panel.contains(e.target))
                    this.panel.classList.remove("open");
            });
            autoInp.addEventListener("change", (e) => {
                const isEnabled = e.target.checked;
                this.app.config.set(
                    this.app.config.keys.autoRefresh,
                    isEnabled,
                );
                if (isEnabled) {
                    infInp.checked = false;
                    this.app.config.set(
                        this.app.config.keys.infiniteScroll,
                        false,
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
                    isEnabled,
                );
                this.app.infinite.toggle(isEnabled);
                if (isEnabled) {
                    autoInp.checked = false;
                    this.app.config.set(
                        this.app.config.keys.autoRefresh,
                        false,
                    );
                    this.updateTimerUI();
                }
            });
            spamInp.addEventListener("change", (e) => {
                this.app.config.set(
                    this.app.config.keys.hideSpam,
                    e.target.checked,
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
                this.app.config.keys.autoRefresh,
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

            const aiConfig = this.app.config.getAiConfig();

            const modalHtml = `
            <div class="kw-overlay open" id="kw_settings">
                <div class="kw-modal">
                    <div class="kw-modal-title"><span>⚙️ Настройки Kwork Helper</span><span class="kw-modal-close" id="kw_modal_close">✕</span></div>
                    
                    <span class="kw-section-title">Фильтр стоп-слов</span>
                    <div class="kw-input-group">
                        <input type="text" class="kw-input" id="kw_word_inp" placeholder="Фраза (Enter)...">
                        <button class="kw-btn" id="kw_word_add">+</button>
                    </div>
                    <div class="kw-tags" id="kw_tags_container"></div>

                    <form onsubmit="return false;" autocomplete="off">
                        <span class="kw-section-title">Настройки нейросети (OpenAI / OpenRouter)</span>
                        <div class="kw-input-group"><input type="text" class="kw-input" id="kw_ai_base" placeholder="Base URL" value="${escapeHtml(aiConfig.baseUrl)}" autocomplete="url" name="ai_base_url"></div>
                        <div class="kw-input-group"><input type="password" class="kw-input" id="kw_ai_key" placeholder="API Key" value="${escapeHtml(aiConfig.apiKey)}" autocomplete="new-password" name="ai_api_key"></div>
                        <div class="kw-input-group">
                            <input type="text" class="kw-input" id="kw_ai_model" placeholder="Model (e.g. gpt-4o-mini)" value="${escapeHtml(aiConfig.model)}" autocomplete="off" name="ai_model">
                            <input type="number" class="kw-input" id="kw_ai_tokens" placeholder="Max Tokens" value="${escapeHtml(aiConfig.maxTokens)}" title="Лимит токенов" style="max-width: 100px;" autocomplete="off" name="ai_tokens">
                        </div>
                        <span class="kw-section-title">Системный промпт</span>
                        <textarea class="kw-input kw-textarea" id="kw_ai_prompt" placeholder="Инструкция для нейросети...">${escapeHtml(aiConfig.prompt)}</textarea>
                    </form>

                    <button class="kw-btn kw-btn-save" type="button" id="kw_save_all">💾 Сохранить настройки</button>
                </div>
            </div>`;

            document.body.insertAdjacentHTML("beforeend", modalHtml);

            const overlay = document.querySelector(".kw-overlay");
            overlay.addEventListener("click", (e) => {
                if (e.target === overlay) overlay.remove();
            });

            const renderWords = () => {
                const words = this.app.config.getStopWords();
                document.getElementById("kw_tags_container").innerHTML = words
                    .map(
                        (w) =>
                            `<div class="kw-tag">${escapeHtml(w)} <span class="kw-tag-rm" data-w="${escapeHtml(w)}">×</span></div>`,
                    )
                    .join("");
                document.querySelectorAll(".kw-tag-rm").forEach((btn) => {
                    btn.onclick = () => {
                        this.app.config.setStopWords(
                            this.app.config
                                .getStopWords()
                                .filter((x) => x !== btn.dataset.w),
                        );
                        this.app.reprocessAll();
                        renderWords();
                    };
                });
            };
            const addWord = () => {
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
                    renderWords();
                }
                document.getElementById("kw_word_inp").value = "";
            };

            document.getElementById("kw_word_add").onclick = addWord;
            document.getElementById("kw_word_inp").onkeypress = (e) => {
                if (e.key === "Enter") addWord();
            };

            document.getElementById("kw_modal_close").onclick = () =>
                document.querySelector(".kw-overlay").remove();
            document.getElementById("kw_save_all").onclick = () => {
                const newAiConfig = {
                    baseUrl: document.getElementById("kw_ai_base").value.trim(),
                    apiKey: document.getElementById("kw_ai_key").value.trim(),
                    model: document.getElementById("kw_ai_model").value.trim(),
                    maxTokens: document
                        .getElementById("kw_ai_tokens")
                        .value.trim(),
                    prompt: document
                        .getElementById("kw_ai_prompt")
                        .value.trim(),
                };
                this.app.config.setAiConfig(newAiConfig);
                GM_notification({
                    text: "Настройки успешно сохранены",
                    title: "Kwork Helper",
                    timeout: 2000,
                });
                document.querySelector(".kw-overlay").remove();
            };

            renderWords();
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
            let processed = card.getAttribute("data-kw-state");
            const textContent = (card.innerText || "").toLowerCase();
            let isSpam = false;

            safe("спам-фильтр", () => {
                const stopWords = this.app.config.getStopWords();
                if (stopWords.some((w) => textContent.includes(w))) {
                    isSpam = true;
                    if (processed !== "spam") this.markAsSpam(card);
                } else if (processed === "spam") {
                    // Стоп-слово убрали в настройках — возвращаем карточку
                    // и обрабатываем её заново, как новую.
                    this.unmarkSpam(card);
                    processed = null;
                }
            });

            if (
                !processed &&
                DEFAULTS.urgentWords.some((w) => textContent.includes(w))
            ) {
                safe("срочность", () => {
                    const title = card.querySelector(
                        ".wants-card__header-title",
                    );
                    if (title && !title.querySelector(".kw-urgent-fire"))
                        title.insertAdjacentHTML(
                            "afterbegin",
                            '<span class="kw-urgent-fire" title="Срочно!">🔥</span>',
                        );
                });
            }
            safe("статистика", () => this.forceReplaceStats(card));
            if (!processed) {
                safe("цена", () => this.highlightPrice(card));
                safe("AI-кнопка", () => this.addAiBtn(card));
                if (!isSpam) card.setAttribute("data-kw-state", "active");
            }
        }
        markAsSpam(card) {
            card.classList.add("kw-spam-card");
            const header = card.querySelector(
                ".wants-card__header-right-block",
            );
            if (header && !card.querySelector(".kw-badge-spam"))
                header.insertAdjacentHTML(
                    "afterbegin",
                    '<div class="kw-badge kw-badge-spam">spam</div>',
                );
            if (this.app.config.get(this.app.config.keys.hideSpam))
                card.classList.add("kw-hidden");
            card.setAttribute("data-kw-state", "spam");
        }
        unmarkSpam(card) {
            card.classList.remove("kw-spam-card", "kw-hidden");
            const badge = card.querySelector(".kw-badge-spam");
            if (badge) badge.remove();
            const aiBtn = card.querySelector(".kw-ai-btn");
            if (aiBtn) aiBtn.remove();
            card.removeAttribute("data-kw-state");
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
                NodeFilter.SHOW_TEXT,
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
                    ".dib.v-align-t:last-child",
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
            const isLowPriceLabel = card.querySelector(
                ".wants-card__review--low-price",
            );
            if (isLowPriceLabel) {
                card.classList.add("kw-strip-bad");
                return;
            }

            const priceEl = card.querySelector(".wants-card__price");
            const higherPriceEl = card.querySelector(
                ".wants-card__description-higher-price",
            );

            let price = 0;
            let higherPrice = 0;

            if (priceEl) {
                price =
                    parseInt(
                        priceEl.textContent
                            .replace(/\s/g, "")
                            .replace(/\D/g, ""),
                    ) || 0;
            }
            if (higherPriceEl) {
                higherPrice =
                    parseInt(
                        higherPriceEl.textContent
                            .replace(/\s/g, "")
                            .replace(/\D/g, ""),
                    ) || 0;
            }
            const effectivePrice = Math.max(price, higherPrice);

            if (effectivePrice >= DEFAULTS.goodPrice)
                card.classList.add("kw-strip-good");
            else if (effectivePrice <= DEFAULTS.badPrice && effectivePrice > 0)
                card.classList.add("kw-strip-bad");
        }
        addAiBtn(card) {
            const link = card.querySelector(".wants-card__header-title a");
            if (!link) return;
            if (link.parentNode.querySelector(".kw-ai-btn")) return;

            const btn = document.createElement("button");
            btn.className = "kw-ai-btn";
            btn.innerHTML = "🤖";
            btn.title = "Анализ нейросетью";

            btn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();

                const existing = card.querySelector(".kw-ai-response-box");
                if (existing) {
                    existing.remove();
                    return;
                }

                btn.classList.add("loading");

                const descBlock = card.querySelector(
                    ".wants-card__description-text",
                );
                const fullTextEl =
                    descBlock.querySelector(".overflow-hidden")
                        ?.nextElementSibling || descBlock;
                const fullText = fullTextEl.innerText;
                const title = link.innerText;

                let priceText = "Бюджет не указан";
                const priceBlock = card.querySelector(".wants-card__right");
                if (priceBlock) {
                    priceText = priceBlock.innerText
                        .replace(/\s+/g, " ")
                        .trim();
                }

                const fullPrompt = `Заголовок: ${title}\n\nБюджет (инфо): ${priceText}\n\nОписание:\n${fullText}`;

                // Кэш ответов на сессию: повторный клик по той же карточке
                // не тратит токены и не ждёт сеть.
                const cacheKey =
                    (card.getAttribute("data-id") || "") +
                    "|" +
                    title +
                    "|" +
                    priceText;
                const cached = this.app.aiCache.get(cacheKey);
                if (cached) {
                    btn.classList.remove("loading");
                    this.showAiResponse(card, cached);
                    return;
                }

                try {
                    const response = await this.app.ai.analyze(fullPrompt);
                    btn.classList.remove("loading");
                    this.app.cacheAiResponse(cacheKey, response);
                    this.showAiResponse(card, response);
                } catch (error) {
                    btn.classList.remove("loading");
                    const box = document.createElement("div");
                    box.className = "kw-ai-response-box kw-ai-error";
                    box.innerText = ` ${error.message}`;
                    card.querySelector(
                        ".wants-card__description-text",
                    ).appendChild(box);
                }
            };
            link.parentNode.appendChild(btn);
        }
        showAiResponse(card, text) {
            const box = document.createElement("div");
            box.className = "kw-ai-response-box";
            box.innerText = text;
            card
                .querySelector(".wants-card__description-text")
                .appendChild(box);
        }
    }

    class KworkAssistant {
        constructor() {
            this.config = new ConfigManager();
            this.ai = new AiClient(this.config);
            this.processor = new CardProcessor(this);
            this.infinite = new InfiniteScrollManager(this);
            this.ui = new UIManager(this);
            // Сессионный кэш AI-ответов по карточкам (в памяти, не localStorage)
            this.aiCache = new Map();
        }
        cacheAiResponse(key, response) {
            if (!key) return;
            this.aiCache.set(key, response);
            if (this.aiCache.size > 200) {
                const oldest = this.aiCache.keys().next().value;
                if (oldest !== undefined) this.aiCache.delete(oldest);
            }
        }
        restoreScroll() {
            const raw = sessionStorage.getItem("kw_scroll_pos");
            if (raw === null) return;
            sessionStorage.removeItem("kw_scroll_pos");
            const y = parseInt(raw, 10);
            // У самого верха оставляем топ — там появляются новые заказы.
            if (!Number.isFinite(y) || y < 800) return;
            window.scrollTo(0, y);
        }
        init() {
            safe("панель управления", () => this.ui.renderPanel());
            safe("раскрытие описаний", () => this.fixExpandButtons());
            safe("восстановление скролла", () => this.restoreScroll());
            this.runLoop();
            new MutationObserver((ms) => {
                if (ms.some((m) => m.addedNodes.length)) this.runLoop();
            }).observe(
                document.querySelector(".wants-content") || document.body,
                { childList: true, subtree: true },
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
                    ".wants-card__description-text",
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
            // Диагностика вёрстки ~каждые 10 секунд (20 проходов по 500 мс)
            this.loopCount = (this.loopCount || 0) + 1;
            if (this.loopCount % 20 === 1) checkDomHealth();
            safe("обработка карточек", () => {
                document.querySelectorAll(".want-card").forEach((card) => {
                    this.processor.process(card);
                });
            });
        }
        reprocessAll(force = false) {
            if (force) {
                document.querySelectorAll(".want-card").forEach((c) => {
                    c.removeAttribute("data-kw-state");
                    c.classList.remove("kw-strip-good", "kw-strip-bad");
                    const aiBox = c.querySelector(".kw-ai-response-box");
                    if (aiBox) aiBox.remove();
                    const aiBtn = c.querySelector(".kw-ai-btn");
                    if (aiBtn) aiBtn.remove();
                });
            }
            this.runLoop();
        }
        tick() {
            if (!this.config.get(this.config.keys.autoRefresh)) return;
            this.ui.timeLeft--;
            this.ui.updateTimerUI();
            if (this.ui.timeLeft <= 0) {
                // Позиция скролла — временное значение в sessionStorage, не настройка.
                sessionStorage.setItem("kw_scroll_pos", String(window.scrollY));
                window.location.reload();
            }
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () =>
            new KworkAssistant().init(),
        );
    } else {
        new KworkAssistant().init();
    }
})();
