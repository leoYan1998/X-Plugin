// ==UserScript==
// @name         X批量取消非回关
// @namespace    http://tampermonkey.net/
// @version      7.0
// @author       Leo66
// @match        https://x.com/*/following
// @match        https://twitter.com/*/following
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG = {
        minDelay: 1000,
        maxDelay: 4000,
        scrollStep: 800,
        scanInterval: 400,
        maxNoActionRetries: 6,
        maxUnfollowLimit: 80,
        autoExecute: false
    };

    let isRunning = false;
    let isPausedForManual = false;
    let unfollowedList = [];
    let processedUsers = new Set();
    let mainActionBtn, stopAndSettleBtn;
    let delayValLabel, speedValLabel, limitInput, logBox, autoExecCheck;
    let noActionCount = 0;

    let lastLockedHandle = null;
    let lastLockedCell = null;

    let isModalOpen = false;
    let refreshWhitelistUI = null; // 用于同步快捷按钮到配置窗口的刷新函数引用

    function injectStyles() {
        const style = document.createElement('style');
        style.innerHTML = `
            @keyframes aurora-flow {
                0% { background-position: 0% 50%; }
                50% { background-position: 100% 50%; }
                100% { background-position: 0% 50%; }
            }

            .x-aurora-panel {
                position: fixed;
                top: 70px;
                right: 20px;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                gap: 10px;
                width: 240px;
                padding: 14px;
                border-radius: 16px;
                color: #fff;
                font-family: monospace, sans-serif;
                font-size: 13px;
                transition: opacity 0.2s, transform 0.2s;

                border: 1.5px solid transparent;
                background-image: linear-gradient(rgba(15, 15, 15, 0.75), rgba(15, 15, 15, 0.75)),
                                  linear-gradient(135deg, #1d9bf0, #a855f7, #00ba7c, #1d9bf0);
                background-origin: border-box;
                background-clip: padding-box, border-box;
                background-size: 100% 100%, 400% 400%;
                animation: aurora-flow 6s ease infinite;

                backdrop-filter: blur(12px);
                -webkit-backdrop-filter: blur(12px);
                box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1);
            }

            .x-modal-mask {
                position: fixed;
                top: 0; left: 0; width: 0; height: 0;
                background: transparent;
                z-index: 10000;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.25s ease;
            }
            .x-modal-window {
                position: fixed;
                top: 120px;
                left: calc(50vw - 180px);
                width: 360px;
                padding: 20px;
                border-radius: 16px;
                color: #fff;
                font-family: monospace, sans-serif;
                background-image: linear-gradient(rgba(20, 20, 20, 0.95), rgba(20, 20, 20, 0.95)),
                                  linear-gradient(135deg, #a855f7, #1d9bf0);
                background-origin: border-box;
                background-clip: padding-box, border-box;
                border: 1.5px solid transparent;
                box-shadow: 0 20px 50px rgba(0, 0, 0, 0.9);
                transform: scale(0.9);
                transition: transform 0.25s ease;
                display: flex;
                flex-direction: column;
                gap: 12px;
                pointer-events: auto;
            }
            .x-modal-mask.active { opacity: 1; }
            .x-modal-mask.active .x-modal-window { transform: scale(1); }

            .x-helper-tooltip {
                position: relative;
                display: inline-block;
                cursor: help;
                margin-left: 4px;
                color: #aaa;
                font-size: 11px;
                user-select: none;
            }
            .x-helper-tooltip::after {
                content: attr(data-tip);
                position: absolute;
                bottom: 125%;
                left: 50%;
                transform: translateX(-50%);
                background-color: rgba(15, 15, 15, 0.95);
                color: #fff;
                padding: 8px 12px;
                border-radius: 8px;
                font-size: 11px;
                line-height: 1.4;
                white-space: normal;
                width: 170px;
                box-shadow: 0 6px 20px rgba(0,0,0,0.6);
                border: 1px solid rgba(255, 255, 255, 0.15);
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.15s ease, transform 0.15s ease;
                transform: translateX(-50%) translateY(4px);
                z-index: 10001;
                font-family: sans-serif;
            }
            .x-helper-tooltip:hover::after {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }
            .x-highlight-user {
                outline: 2px solid #1d9bf0 !important;
                background-color: rgba(29, 155, 240, 0.15) !important;
                transition: all 0.3s ease;
            }
            .x-tab-container {
                display: flex;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 8px;
                padding: 2px;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }
            .x-tab-btn {
                flex: 1;
                padding: 5px 0;
                text-align: center;
                border-radius: 6px;
                cursor: pointer;
                font-size: 11px;
                font-weight: bold;
                transition: all 0.2s ease;
            }
            .x-tab-active {
                background: #1d9bf0;
                color: #fff;
                box-shadow: 0 2px 6px rgba(29, 155, 240, 0.3);
            }
            .x-tab-disabled {
                color: #666;
                cursor: not-allowed;
                opacity: 0.5;
            }
            .x-input-style {
                background: rgba(255, 255, 255, 0.08) !important;
                border: 1px solid rgba(255, 255, 255, 0.15) !important;
                transition: all 0.2s;
            }
            .x-input-style:focus {
                border-color: #1d9bf0 !important;
                background: rgba(255, 255, 255, 0.12) !important;
                outline: none;
            }

            /* 🌟 快捷白名单按钮的基础原生样式匹配 */
            .x-whitelist-quick-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 0 12px;
                height: 32px;
                border-radius: 9999px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                font-size: 14px;
                font-weight: 700;
                cursor: pointer;
                transition: background-color 0.2s, border-color 0.2s;
                user-select: none;
                margin-right: 8px;
            }
            .x-whitelist-quick-btn.add {
                background-color: transparent;
                color: #a855f7;
                border: 1px solid rgba(168, 85, 247, 0.5);
            }
            .x-whitelist-quick-btn.add:hover {
                background-color: rgba(168, 85, 247, 0.1);
                border-color: #a855f7;
            }
            .x-whitelist-quick-btn.remove {
                background-color: #a855f7;
                color: #fff;
                border: 1px solid transparent;
            }
            .x-whitelist-quick-btn.remove:hover {
                background-color: #9333ea;
            }
        `;
        document.head.appendChild(style);
    }

    // 获取当前有效的白名单数组
    function getWhitelistArray() {
        const whitelistRaw = GM_getValue('x_whitelist', '');
        return whitelistRaw.split(/[\n,]/).map(v => v.trim()).filter(v => v.startsWith('@'));
    }

    // 更新白名单存储数据
    function updateWhitelistArray(arr) {
        const text = arr.join('\n');
        GM_setValue('x_whitelist', text);
        if (refreshWhitelistUI) {
            refreshWhitelistUI();
        }
    }

    function createLabelWithTooltip(labelText, tooltipText) {
        const container = document.createElement('span');
        container.innerText = labelText;
        if (tooltipText) {
            const qMark = document.createElement('span');
            qMark.className = 'x-helper-tooltip';
            qMark.setAttribute('data-tip', tooltipText);
            qMark.innerText = '❓';
            container.appendChild(qMark);
        }
        return container;
    }

    function enableDrag(dragEl, targetEl) {
        let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
        let isDragging = false;

        dragEl.style.cursor = 'move';
        dragEl.style.userSelect = 'none';
        dragEl.onmousedown = dragMouseDown;

        function dragMouseDown(e) {
            e.preventDefault();
            isDragging = false;
            pos3 = e.clientX;
            pos4 = e.clientY;
            document.onmouseup = closeDragElement;
            document.onmousemove = elementDrag;
        }

        function elementDrag(e) {
            e.preventDefault();
            if (Math.abs(e.clientX - pos3) > 2 || Math.abs(e.clientY - pos4) > 2) {
                isDragging = true;
            }
            pos1 = pos3 - e.clientX;
            pos2 = pos4 - e.clientY;
            pos3 = e.clientX;
            pos4 = e.clientY;
            targetEl.style.top = (targetEl.offsetTop - pos2) + "px";
            targetEl.style.left = (targetEl.offsetLeft - pos1) + "px";
            targetEl.style.right = 'auto';
            targetEl.style.bottom = 'auto';
        }

        function closeDragElement() {
            document.onmouseup = null;
            document.onmousemove = null;
            if (targetEl.setAttribute) {
                targetEl.setAttribute('data-dragged', isDragging ? 'true' : 'false');
            }
        }
    }

    function createListSection(win, labelText, tooltipText, storageKey, tagThemeColor, tagBorderColor) {
        const label = createLabelWithTooltip(labelText, tooltipText);
        label.style.fontSize = '12px';
        label.style.color = '#ccc';
        label.style.display = 'block';
        win.appendChild(label);

        let rawValue = GM_getValue(storageKey, '');
        let items = rawValue.split(/[\n,]/).map(v => v.trim()).filter(v => v.startsWith('@'));
        items = Array.from(new Set(items));

        const saveItems = () => {
            GM_setValue(storageKey, items.join('\n'));
        };

        const container = document.createElement('div');
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '8px';

        const controlRow = document.createElement('div');
        controlRow.style.display = 'flex';
        controlRow.style.gap = '8px';
        controlRow.style.alignItems = 'center';

        const addInput = document.createElement('input');
        addInput.type = 'text';
        addInput.className = 'x-input-style';
        addInput.placeholder = '➕ 输入并回车 (支持批量)';
        addInput.style.flex = '1';
        addInput.style.borderRadius = '6px';
        addInput.style.color = '#fff';
        addInput.style.padding = '6px 8px';
        addInput.style.fontSize = '11px';
        addInput.style.boxSizing = 'border-box';
        addInput.style.height = '28px';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'x-input-style';
        searchInput.placeholder = '🔍 搜索...';
        searchInput.style.width = '80px';
        searchInput.style.borderRadius = '6px';
        searchInput.style.color = '#fff';
        searchInput.style.padding = '6px 8px';
        searchInput.style.fontSize = '11px';
        searchInput.style.boxSizing = 'border-box';
        searchInput.style.height = '28px';

        const clearBtn = document.createElement('button');
        clearBtn.className = 'x-input-style';
        clearBtn.innerText = '🗑️';
        clearBtn.title = '清空列表';
        clearBtn.style.width = '28px';
        clearBtn.style.height = '28px';
        clearBtn.style.borderRadius = '6px';
        clearBtn.style.color = '#fff';
        clearBtn.style.border = 'none';
        clearBtn.style.cursor = 'pointer';
        clearBtn.style.fontSize = '12px';
        clearBtn.style.display = 'flex';
        clearBtn.style.alignItems = 'center';
        clearBtn.style.justifyContent = 'center';
        clearBtn.style.boxSizing = 'border-box';
        clearBtn.style.padding = '0';
        clearBtn.onmouseover = () => {
            clearBtn.style.borderColor = 'rgba(255,255,255,0.3)';
            clearBtn.style.background = 'rgba(255,255,255,0.12)';
        };
        clearBtn.onmouseout = () => {
            clearBtn.style.borderColor = 'rgba(255,255,255,0.15)';
            clearBtn.style.background = 'rgba(255,255,255,0.08)';
        };

        let confirmClearMode = false;
        let confirmTimeout = null;

        clearBtn.onclick = () => {
            if (items.length === 0) {
                return;
            }
            if (!confirmClearMode) {
                confirmClearMode = true;
                clearBtn.innerText = '⚠️';
                clearBtn.title = '再次点击以确认清空';
                clearBtn.style.backgroundColor = 'rgba(244, 63, 94, 0.2)';
                clearBtn.style.borderColor = '#f43f5e';

                confirmTimeout = setTimeout(() => {
                    confirmClearMode = false;
                    clearBtn.innerText = '🗑️';
                    clearBtn.title = '清空列表';
                    clearBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                    clearBtn.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                }, 3000);
            } else {
                clearTimeout(confirmTimeout);
                confirmClearMode = false;
                items = [];
                saveItems();
                refreshAllQuickButtons(); // 同步高亮变化
                renderTags();
                const listName = storageKey === 'x_whitelist' ? '白名单' : '黑名单';
                addRealtimeLog(`[名单] ${listName}列表已清空`, '#aaa');

                clearBtn.innerText = '🗑️';
                clearBtn.title = '清空列表';
                clearBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.08)';
                clearBtn.style.borderColor = 'rgba(255, 255, 255, 0.15)';
            }
        };

        controlRow.appendChild(addInput);
        controlRow.appendChild(searchInput);
        controlRow.appendChild(clearBtn);
        container.appendChild(controlRow);

        const tagsContainer = document.createElement('div');
        tagsContainer.className = 'x-input-style';
        tagsContainer.style.width = '100%';
        tagsContainer.style.height = '80px';
        tagsContainer.style.borderRadius = '8px';
        tagsContainer.style.padding = '6px';
        tagsContainer.style.fontSize = '11px';
        tagsContainer.style.boxSizing = 'border-box';
        tagsContainer.style.overflowY = 'auto';
        tagsContainer.style.display = 'flex';
        tagsContainer.style.flexWrap = 'wrap';
        tagsContainer.style.gap = '6px';
        tagsContainer.style.alignContent = 'flex-start';

        container.appendChild(tagsContainer);
        win.appendChild(container);

        const renderTags = () => {
            tagsContainer.innerHTML = '';
            const query = searchInput.value.trim().toLowerCase();
            const filtered = items.filter(item => item.toLowerCase().includes(query));

            if (filtered.length === 0) {
                const emptyTip = document.createElement('div');
                emptyTip.innerText = query ? '未找到匹配项' : '白名单为空';
                emptyTip.style.color = '#555';
                emptyTip.style.fontStyle = 'italic';
                emptyTip.style.width = '100%';
                emptyTip.style.padding = '4px 6px';
                tagsContainer.appendChild(emptyTip);
                return;
            }

            filtered.forEach(username => {
                const chip = document.createElement('span');
                chip.style.display = 'inline-flex';
                chip.style.alignItems = 'center';
                chip.style.gap = '4px';
                chip.style.padding = '2px 8px';
                chip.style.borderRadius = '12px';
                chip.style.fontSize = '11px';
                chip.style.backgroundColor = tagThemeColor;
                chip.style.border = `1px solid ${tagBorderColor}`;
                chip.style.color = '#fff';
                chip.style.whiteSpace = 'nowrap';

                const nameSpan = document.createElement('span');
                nameSpan.innerText = username;
                chip.appendChild(nameSpan);

                const deleteBtn = document.createElement('span');
                deleteBtn.innerText = '×';
                deleteBtn.style.cursor = 'pointer';
                deleteBtn.style.fontWeight = 'bold';
                deleteBtn.style.fontSize = '14px';
                deleteBtn.style.lineHeight = '1';
                deleteBtn.style.color = 'rgba(255,255,255,0.6)';
                deleteBtn.style.transition = 'color 0.2s';
                deleteBtn.onmouseover = () => deleteBtn.style.color = '#ff4d4f';
                deleteBtn.onmouseout = () => deleteBtn.style.color = 'rgba(255,255,255,0.6)';
                deleteBtn.onclick = (e) => {
                    e.stopPropagation();
                    items = items.filter(v => v !== username);
                    saveItems();
                    refreshAllQuickButtons(); // 同步高亮变化
                    const listName = storageKey === 'x_whitelist' ? '白名单' : '黑名单';
                    addRealtimeLog(`[名单] ${username} 已移出${listName}`, '#aaa');
                    renderTags();
                };
                chip.appendChild(deleteBtn);

                tagsContainer.appendChild(chip);
            });
        };

        const handleAdd = () => {
            const val = addInput.value;
            if (!val) return;

            const rawParts = val.split(/[\n,\s]+/);
            let addedCount = 0;
            const newAddedItems = [];

            rawParts.forEach(p => {
                let part = p.trim();
                if (!part) return;
                if (!part.startsWith('@')) {
                    part = '@' + part;
                }
                if (part.length > 1) {
                    if (!items.includes(part)) {
                        items.push(part);
                        newAddedItems.push(part);
                        addedCount++;
                    }
                }
            });

            if (addedCount > 0) {
                saveItems();
                refreshAllQuickButtons(); // 同步高亮变化
                const listName = storageKey === 'x_whitelist' ? '白名单' : '黑名单';
                newAddedItems.forEach(item => {
                    addRealtimeLog(`[名单] ${item} 已加入${listName}`, '#a855f7');
                });
                addInput.value = '';
                renderTags();
            }
        };

        addInput.onkeydown = (e) => {
            if (e.key === 'Enter') {
                handleAdd();
            }
        };
        addInput.onblur = () => {
            handleAdd();
        };

        searchInput.oninput = () => {
            renderTags();
        };

        // 注册刷新函数
        activeRefreshFunctions = () => {
            rawValue = GM_getValue(storageKey, '');
            items = rawValue.split(/[\n,]/).map(v => v.trim()).filter(v => v.startsWith('@'));
            items = Array.from(new Set(items));
            renderTags();
        };

        renderTags();
    }

    function createListModal() {
        let mask = document.querySelector('.x-modal-mask');
        if (mask) {
            isModalOpen = true;
            mask.classList.add('active');
            return;
        }

        isModalOpen = true;
        mask = document.createElement('div');
        mask.className = 'x-modal-mask';

        const win = document.createElement('div');
        win.className = 'x-modal-window';
        win.onclick = (e) => e.stopPropagation();

        const hRow = document.createElement('div');
        hRow.style.display = 'flex';
        hRow.style.justifyContent = 'space-between';
        hRow.style.alignItems = 'center';

        const title = document.createElement('span');
        title.innerText = '⚙️ 黑白名单高级配置';
        title.style.fontWeight = 'bold';
        title.style.fontSize = '14px';
        title.style.color = '#a855f7';
        title.style.flex = '1';
        title.style.padding = '4px 0';

        const closeBtn = document.createElement('div');
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.display = 'flex';
        closeBtn.style.alignItems = 'center';
        closeBtn.style.justifyContent = 'center';
        closeBtn.style.width = '24px';
        closeBtn.style.height = '24px';
        const closeLine = document.createElement('span');
        closeLine.style.width = '12px';
        closeLine.style.height = '2.5px';
        closeLine.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
        closeLine.style.borderRadius = '2px';
        closeBtn.appendChild(closeLine);
        closeBtn.onmouseover = () => closeLine.style.backgroundColor = '#a855f7';
        closeBtn.onmouseout = () => closeLine.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';

        hRow.appendChild(title);
        hRow.appendChild(closeBtn);
        win.appendChild(hRow);

        enableDrag(title, win);

        // 1. 黑名单 (保留原样)
        const bLabel = createLabelWithTooltip('💀 黑名单 (暂未实装/结合自动回关使用)', '研发中：自动回关功能研发成功后，永远不会给这里面的人回关（防老赖）。');
        bLabel.style.fontSize = '12px';
        bLabel.style.color = '#555';
        const bInput = document.createElement('textarea');
        bInput.className = 'x-input-style';
        bInput.style.width = '100%'; bInput.style.height = '60px'; bInput.style.borderRadius = '8px';
        bInput.style.color = '#666'; bInput.style.padding = '8px'; bInput.style.fontSize = '12px';
        bInput.style.resize = 'none'; bInput.style.boxSizing = 'border-box'; bInput.disabled = true;
        bInput.placeholder = '功能暂未开放...';

        win.appendChild(bLabel);
        win.appendChild(bInput);

        // 2. 白名单 (更新为 Chips + Search)
        createListSection(win, '🛡️ 白名单 (@用户ID，支持逗号或换行分隔)', '批量清粉时，即使对方没有回关你，也绝对不会取关他们。', 'x_whitelist', 'rgba(29, 155, 240, 0.15)', 'rgba(29, 155, 240, 0.4)');

        // 绑定刷新映射关系
        refreshWhitelistUI = () => {
            if (activeRefreshFunctions) {
                activeRefreshFunctions();
            }
        };

        const tip = document.createElement('div');
        tip.innerText = '💡 修改将实时写入缓存。点击右上角横杠最小化窗口。';
        tip.style.fontSize = '11px'; tip.style.color = '#666'; tip.style.textAlign = 'center';
        win.appendChild(tip);

        mask.appendChild(win);
        document.body.appendChild(mask);

        const destroyModal = () => {
            isModalOpen = false;
            mask.classList.remove('active');
            refreshWhitelistUI = null;
            activeRefreshFunctions = null;
        };

        closeBtn.onclick = destroyModal;

        setTimeout(() => mask.classList.add('active'), 10);
    }

    // 🌟 新增：独立刷新当前视口内所有快捷白名单按钮的状态
    function refreshAllQuickButtons() {
        const userCells = document.querySelectorAll('[data-testid="UserCell"]');
        const currentWhitelist = getWhitelistArray();

        userCells.forEach(cell => {
            const textContent = cell.innerText || "";
            const matchHandle = textContent.match(/@\w+/);
            const userHandle = matchHandle ? matchHandle[0] : null;

            if (!userHandle) return;

            const qBtn = cell.querySelector('.x-whitelist-quick-btn');
            if (qBtn) {
                const isSaved = currentWhitelist.includes(userHandle);
                if (isSaved) {
                    qBtn.className = 'x-whitelist-quick-btn remove';
                    qBtn.innerText = '🛡️ 已加白';
                } else {
                    qBtn.className = 'x-whitelist-quick-btn add';
                    qBtn.innerText = '➕ 白名单';
                }
            }
        });
    }

    // 🌟 新增：注入白名单快捷操作按键的核心拦截逻辑
    function injectQuickWhitelistButton(cell, userHandle) {
        if (cell.querySelector('.x-whitelist-quick-btn')) return;

        // 定位𝕏原生的“Following”动作按钮所在的外部容器
        const actionContainer = cell.querySelector('[data-testid$="-unfollow"]')?.parentElement?.parentElement;
        if (!actionContainer) return;

        const qBtn = document.createElement('div');
        const currentWhitelist = getWhitelistArray();
        const isSaved = currentWhitelist.includes(userHandle);

        if (isSaved) {
            qBtn.className = 'x-whitelist-quick-btn remove';
            qBtn.innerText = '🛡️ 已加白';
        } else {
            qBtn.className = 'x-whitelist-quick-btn add';
            qBtn.innerText = '➕ 白名单';
        }

        qBtn.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();

            let activeList = getWhitelistArray();
            if (activeList.includes(userHandle)) {
                // 取消白名单
                activeList = activeList.filter(item => item !== userHandle);
                updateWhitelistArray(activeList);
                qBtn.className = 'x-whitelist-quick-btn add';
                qBtn.innerText = '➕ 白名单';
                addRealtimeLog(`[名单] ${userHandle} 已移出白名单`, '#aaa');
            } else {
                // 添加白名单
                activeList.push(userHandle);
                updateWhitelistArray(activeList);
                qBtn.className = 'x-whitelist-quick-btn remove';
                qBtn.innerText = '🛡️ 已加白';
                addRealtimeLog(`[名单] ${userHandle} 已加入白名单`, '#a855f7');
            }
        };

        // 塞入原生按钮左侧
        actionContainer.insertBefore(qBtn, actionContainer.firstChild);
    }

    function createUI() {
        injectStyles();

        const container = document.createElement('div');
        container.className = 'x-aurora-panel';

        const miniBtn = document.createElement('div');
        miniBtn.style.position = 'fixed';
        miniBtn.style.top = '70px';
        miniBtn.style.right = '20px';
        miniBtn.style.zIndex = '9999';
        miniBtn.style.display = 'none';
        miniBtn.style.alignItems = 'center';
        miniBtn.style.padding = '8px 14px';
        miniBtn.style.borderRadius = '20px';
        miniBtn.style.color = '#fff';
        miniBtn.style.fontSize = '12px';
        miniBtn.style.fontWeight = 'bold';
        miniBtn.style.whiteSpace = 'nowrap';
        miniBtn.style.backgroundColor = 'rgba(15, 15, 15, 0.75)';
        miniBtn.style.backdropFilter = 'blur(12px)';
        miniBtn.style.webkitBackdropFilter = 'blur(12px)';
        miniBtn.style.border = '1px solid rgba(29, 155, 240, 0.4)';
        miniBtn.style.boxShadow = '0 4px 16px rgba(0,0,0,0.3)';
        miniBtn.innerHTML = '𝕏 展开大师 ➕';
        miniBtn.style.transition = 'opacity 0.2s, transform 0.2s';
        miniBtn.onmouseover = () => { miniBtn.style.opacity = '0.95'; };
        miniBtn.onmouseout = () => { miniBtn.style.opacity = '1'; };

        enableDrag(miniBtn, miniBtn);

        const headerRow = document.createElement('div');
        headerRow.style.display = 'flex';
        headerRow.style.justifyContent = 'space-between';
        headerRow.style.alignItems = 'center';
        headerRow.style.userSelect = 'none';

        const titleSpan = document.createElement('span');
        titleSpan.innerText = '𝕏-海王管理大师';
        titleSpan.style.fontWeight = 'bold';
        titleSpan.style.fontSize = '14px';
        titleSpan.style.color = '#1d9bf0';
        titleSpan.style.textShadow = '0 0 8px rgba(29, 155, 240, 0.3)';
        titleSpan.style.flex = '1';

        const hideBtn = document.createElement('div');
        hideBtn.style.cursor = 'pointer';
        hideBtn.style.display = 'flex';
        hideBtn.style.alignItems = 'center';
        hideBtn.style.justifyContent = 'center';
        hideBtn.style.width = '24px';
        hideBtn.style.height = '24px';
        hideBtn.style.marginRight = '-4px';

        const hideLine = document.createElement('span');
        hideLine.style.width = '12px';
        hideLine.style.height = '2.5px';
        hideLine.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
        hideLine.style.borderRadius = '2px';
        hideLine.style.transition = 'background-color 0.2s, transform 0.2s';
        hideBtn.appendChild(hideLine);

        hideBtn.onmouseover = () => {
            hideLine.style.backgroundColor = '#1d9bf0';
            hideLine.style.transform = 'scaleY(1.3)';
        };
        hideBtn.onmouseout = () => {
            hideLine.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
            hideLine.style.transform = 'scaleY(1)';
        };

        headerRow.appendChild(titleSpan);
        headerRow.appendChild(hideBtn);
        container.appendChild(headerRow);

        enableDrag(titleSpan, container);

        hideBtn.onclick = () => {
            container.style.opacity = '0';
            container.style.transform = 'scale(0.9)';

            const mask = document.querySelector('.x-modal-mask');
            if (mask) {
                mask.classList.remove('active');
            }

            miniBtn.style.top = container.style.top || (container.offsetTop + 'px');
            miniBtn.style.left = container.style.left || (container.offsetLeft + 'px');
            miniBtn.style.right = 'auto';
            miniBtn.style.bottom = 'auto';

            setTimeout(() => {
                container.style.display = 'none';
                miniBtn.style.display = 'flex';
            }, 200);
        };

        miniBtn.onclick = () => {
            if (miniBtn.getAttribute('data-dragged') === 'true') {
                return;
            }

            miniBtn.style.display = 'none';
            container.style.display = 'flex';

            container.style.top = miniBtn.style.top || (miniBtn.offsetTop + 'px');
            container.style.left = miniBtn.style.left || (miniBtn.offsetLeft + 'px');
            container.style.right = 'auto';
            container.style.bottom = 'auto';

            const mask = document.querySelector('.x-modal-mask');
            if (mask && isModalOpen) {
                mask.classList.add('active');
            }

            setTimeout(() => {
                container.style.opacity = '1';
                container.style.transform = 'scale(1)';
            }, 20);
        };

        const hrTop = document.createElement('hr');
        hrTop.style.border = '0';
        hrTop.style.borderTop = '1px solid rgba(255, 255, 255, 0.1)';
        hrTop.style.margin = '0';
        container.appendChild(hrTop);

        const delayGroup = document.createElement('div');
        delayGroup.style.display = 'flex';
        delayGroup.style.flexDirection = 'column';
        delayGroup.style.gap = '4px';

        const delayLabelContainer = document.createElement('div');
        delayLabelContainer.style.display = 'flex';
        delayLabelContainer.style.justifyContent = 'space-between';

        const delayLabel = createLabelWithTooltip('⏳ 取关间隔上限', '单次取关后的安全等待时间最大值。拉低可极大提升速度，但容易触发人机验证。');
        delayLabelContainer.appendChild(delayLabel);

        delayValLabel = document.createElement('span');
        delayValLabel.innerText = `${CONFIG.maxDelay / 1000}秒`;
        delayValLabel.style.color = '#1d9bf0';
        delayLabelContainer.appendChild(delayValLabel);

        const delaySlider = document.createElement('input');
        delaySlider.type = 'range';
        delaySlider.min = '1';
        delaySlider.max = '8';
        delaySlider.style.cursor = 'pointer';
        delaySlider.value = (CONFIG.maxDelay / 1000).toString();
        delaySlider.oninput = (e) => {
            CONFIG.maxDelay = parseInt(e.target.value) * 1000;
            delayValLabel.innerText = `${e.target.value}秒`;
        };
        delayGroup.appendChild(delayLabelContainer);
        delayGroup.appendChild(delaySlider);

        const speedGroup = document.createElement('div');
        speedGroup.style.display = 'flex';
        speedGroup.style.flexDirection = 'column';
        speedGroup.style.gap = '4px';

        const speedLabelContainer = document.createElement('div');
        speedLabelContainer.style.display = 'flex';
        speedLabelContainer.style.justifyContent = 'space-between';

        const speedLabel = createLabelWithTooltip('🚀 滚屏刷新速度', '当前页面扫描完后，向下滚屏的停顿间隔。若设为 0ms 为极限速度，但若网络卡顿可能导致触底误判。');
        speedLabelContainer.appendChild(speedLabel);

        speedValLabel = document.createElement('span');
        speedValLabel.innerText = `${CONFIG.scanInterval}ms`;
        speedValLabel.style.color = '#00ba7c';
        speedLabelContainer.appendChild(speedValLabel);

        const speedSlider = document.createElement('input');
        speedSlider.type = 'range';
        speedSlider.min = '0';
        speedSlider.max = '2000';
        speedSlider.step = '50';
        speedSlider.style.cursor = 'pointer';
        speedSlider.value = CONFIG.scanInterval.toString();
        speedSlider.oninput = (e) => {
            CONFIG.scanInterval = parseInt(e.target.value);
            speedValLabel.innerText = CONFIG.scanInterval === 0 ? "⚡ 极限极速" : `${e.target.value}ms`;
        };
        speedGroup.appendChild(speedLabelContainer);
        speedGroup.appendChild(speedSlider);

        const limitGroup = document.createElement('div');
        limitGroup.style.display = 'flex';
        limitGroup.style.justifyContent = 'space-between';
        limitGroup.style.alignItems = 'center';

        const limitLabel = createLabelWithTooltip('🎯 本次清理上限', '强行防封熔断器。单次累计取关达到此数量脚本将自动自杀停止。强烈建议每日不超过100人。');
        limitGroup.appendChild(limitLabel);

        limitInput = document.createElement('input');
        limitInput.type = 'number';
        limitInput.className = 'x-input-style';
        limitInput.value = CONFIG.maxUnfollowLimit.toString();
        limitInput.style.width = '55px';
        limitInput.style.borderRadius = '6px';
        limitInput.style.color = '#fff';
        limitInput.style.padding = '4px 6px';
        limitInput.style.textAlign = 'center';
        limitInput.onchange = (e) => {
            let val = parseInt(e.target.value);
            CONFIG.maxUnfollowLimit = isNaN(val) || val <= 0 ? 1 : val;
            limitInput.value = CONFIG.maxUnfollowLimit;
        };
        limitGroup.appendChild(limitInput);

        const autoExecGroup = document.createElement('div');
        autoExecGroup.style.display = 'flex';
        autoExecGroup.style.justifyContent = 'space-between';
        autoExecGroup.style.alignItems = 'center';

        const autoExecLabelContainer = document.createElement('div');
        autoExecLabelContainer.style.display = 'flex';
        autoExecLabelContainer.style.flexDirection = 'column';
        autoExecLabelContainer.style.gap = '2px';

        const autoExecLabel = createLabelWithTooltip('⚡ 发现目标自动取关', '开启：自动点击取关。关闭：发现目标时暂停滚动并锁定目标，由您手动决定是否取关。');

        const subListBtn = document.createElement('span');
        subListBtn.innerText = '[编辑黑/白名单]';
        subListBtn.style.fontSize = '11px';
        subListBtn.style.color = '#a855f7';
        subListBtn.style.cursor = 'pointer';
        subListBtn.style.fontWeight = 'bold';
        subListBtn.style.width = 'fit-content';
        subListBtn.style.transition = 'color 0.2s';
        subListBtn.onmouseover = () => subListBtn.style.color = '#b975ff';
        subListBtn.onmouseout = () => subListBtn.style.color = '#a855f7';
        subListBtn.onclick = createListModal;

        autoExecLabelContainer.appendChild(autoExecLabel);
        autoExecLabelContainer.appendChild(subListBtn);

        autoExecCheck = document.createElement('input');
        autoExecCheck.type = 'checkbox';
        autoExecCheck.checked = CONFIG.autoExecute;
        autoExecCheck.style.cursor = 'pointer';
        autoExecCheck.style.width = '16px';
        autoExecCheck.style.height = '16px';
        autoExecCheck.onchange = (e) => {
            CONFIG.autoExecute = e.target.checked;
        };

        autoExecGroup.appendChild(autoExecLabelContainer);
        autoExecGroup.appendChild(autoExecCheck);

        const modeTabContainer = document.createElement('div');
        modeTabContainer.className = 'x-tab-container';

        const purgeTab = document.createElement('div');
        purgeTab.className = 'x-tab-btn x-tab-active';
        purgeTab.innerText = '❌ 批量清粉';

        const followTab = document.createElement('div');
        followTab.className = 'x-tab-btn x-tab-disabled x-helper-tooltip';
        followTab.setAttribute('data-tip', '🤝 自动回关模式正在高强度研发中，解放双手拒绝冷漠，敬请期待！');
        followTab.innerText = '🤝 自动回关';

        modeTabContainer.appendChild(purgeTab);
        modeTabContainer.appendChild(followTab);

        const hr = document.createElement('hr');
        hr.style.border = '0';
        hr.style.borderTop = '1px solid rgba(255, 255, 255, 0.1)';
        hr.style.margin = '2px 0';

        const logLabel = document.createElement('div');
        logLabel.innerHTML = '<span>📋 运行日志:</span>';
        logLabel.style.fontSize = '12px';
        logLabel.style.color = '#aaa';

        logBox = document.createElement('div');
        logBox.style.height = '110px';
        logBox.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
        logBox.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        logBox.style.borderRadius = '8px';
        logBox.style.padding = '8px';
        logBox.style.overflowY = 'auto';
        logBox.style.fontSize = '11px';
        logBox.style.lineHeight = '1.5';
        logBox.style.color = '#00ff66';
        logBox.innerHTML = '<div style="color:#888;">[就绪] 海王雷达已部署，等待启动...</div>';

        mainActionBtn = document.createElement('button');
        mainActionBtn.innerText = '🚀 启动程序';
        styleButton(mainActionBtn, '#00ba7c');

        stopAndSettleBtn = document.createElement('button');
        stopAndSettleBtn.innerText = '🏁 结束并结算';
        styleButton(stopAndSettleBtn, '#ff6b00');
        stopAndSettleBtn.style.display = 'none';

        const footerRow = document.createElement('div');
        footerRow.style.display = 'flex';
        footerRow.style.justifyContent = 'space-between';
        footerRow.style.alignItems = 'center';
        footerRow.style.marginTop = '4px';
        footerRow.style.fontSize = '11px';
        footerRow.style.color = '#666';

        const versionSpan = document.createElement('span');
        versionSpan.innerText = 'v7.0';

        const sponsorSpan = document.createElement('span');
        sponsorSpan.className = 'x-helper-tooltip';
        sponsorSpan.setAttribute('data-tip', '点击注入一丝免封玄学，赞助一两碎银，功德+1且有效降低风控概率（接口预留）');
        sponsorSpan.innerText = '💸 功德箱';
        sponsorSpan.style.color = '#e1a100';
        sponsorSpan.style.cursor = 'pointer';
        sponsorSpan.style.opacity = '0.7';
        sponsorSpan.style.userSelect = 'none';
        sponsorSpan.onmouseover = () => { sponsorSpan.style.opacity = '1'; };
        sponsorSpan.onmouseout = () => { sponsorSpan.style.opacity = '0.7'; };
        sponsorSpan.onclick = () => console.log('[海王管理大师] 赞助通道触发，期待后续打赏接入');

        footerRow.appendChild(versionSpan);
        footerRow.appendChild(sponsorSpan);

        mainActionBtn.onclick = async () => {
            if (!isRunning && !isPausedForManual) {
                lockUI('🤖 运行中...');
                try { await startUnfollowProcess(); } catch (e) { if (e.message !== "USER_INTERRUPT" && e.message !== "MANUAL_PAUSE") console.error(e); }
                finishProcess();
            } else if (isRunning && !isPausedForManual) {
                isRunning = false;
                mainActionBtn.innerText = '⏳ 正在安全收尾...';
            } else if (isPausedForManual) {
                lockUI('🤖 继续运行中...');
                try { await startUnfollowProcess(); } catch (e) { if (e.message !== "USER_INTERRUPT" && e.message !== "MANUAL_PAUSE") console.error(e); }
                finishProcess();
            }
        };

        stopAndSettleBtn.onclick = () => {
            if (isPausedForManual) {
                checkAndRecordManualAction();
                isPausedForManual = false;
                isRunning = false;
                addRealtimeLog(`[系统] 用户选择终止，正在结算...`, '#ff3333');
                finishProcess();
            }
        };

        container.appendChild(delayGroup);
        container.appendChild(speedGroup);
        container.appendChild(limitGroup);
        container.appendChild(autoExecGroup);
        container.appendChild(modeTabContainer);
        container.appendChild(hr);
        container.appendChild(logLabel);
        container.appendChild(logBox);
        container.appendChild(mainActionBtn);
        container.appendChild(stopAndSettleBtn);
        container.appendChild(footerRow);

        document.body.appendChild(container);
        document.body.appendChild(miniBtn);

        // 🌟 开启常驻后台观察者：用于动态给页面中滑动出现的元素注入快捷白名单按钮
        startMutationObserver();
    }

    // 🌟 新增：DOM观察者，时刻监听页面滚动，为新出现的 UserCell 插入按钮
    function startMutationObserver() {
        const observer = new MutationObserver(() => {
            const userCells = document.querySelectorAll('[data-testid="UserCell"]');
            userCells.forEach(cell => {
                const textContent = cell.innerText || "";
                const matchHandle = textContent.match(/@\w+/);
                const userHandle = matchHandle ? matchHandle[0] : null;
                if (userHandle) {
                    injectQuickWhitelistButton(cell, userHandle);
                }
            });
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function styleButton(btn, bgColor) {
        btn.style.padding = '10px 15px';
        btn.style.backgroundColor = bgColor;
        btn.style.color = '#fff';
        btn.style.border = 'none';
        btn.style.borderRadius = '20px';
        btn.style.cursor = 'pointer';
        btn.style.fontWeight = 'bold';
        btn.style.whiteSpace = 'nowrap';
        btn.style.width = '100%';
        btn.style.textAlign = 'center';
        btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
        btn.style.transition = 'all 0.2s ease';
        btn.style.marginBottom = '4px';

        btn.onmouseover = () => {
            btn.style.opacity = '0.9';
            btn.style.transform = 'scale(1.02)';
        };
        btn.onmouseout = () => {
            btn.style.opacity = '1';
            btn.style.transform = 'scale(1)';
        };
    }

    function addRealtimeLog(text, color = '#00ff66') {
        if(logBox) {
            const logItem = document.createElement('div');
            logItem.style.color = color;
            logItem.innerText = text;
            logBox.appendChild(logItem);
            logBox.scrollTop = logBox.scrollHeight;
        }
    }

    function lockUI(text) {
        if (isPausedForManual) {
            checkAndRecordManualAction();
        }

        isRunning = true;
        isPausedForManual = false;

        if (unfollowedList.length === 0) {
            logBox.innerHTML = `<div style="color:#e1a100;">[系统] 开始扫描非回关账户...</div>`;
        } else {
            addRealtimeLog(`[系统] 接收指令，继续向下清理...`, '#e1a100');
        }

        limitInput.disabled = true;
        autoExecCheck.disabled = true;

        mainActionBtn.innerText = text ? text : '🛑 停止清理';
        mainActionBtn.style.backgroundColor = '#e0245e';
        stopAndSettleBtn.style.display = 'none';
    }

    function checkAndRecordManualAction() {
        if (!lastLockedHandle) return;

        let hasUnfollowed = false;

        if (lastLockedCell && document.body.contains(lastLockedCell)) {
            const followingBtn = lastLockedCell.querySelector('[data-testid$="-unfollow"]');
            if (!followingBtn) {
                hasUnfollowed = true;
            }
            lastLockedCell.classList.remove('x-highlight-user');
        } else {
            hasUnfollowed = true;
        }

        if (hasUnfollowed) {
            unfollowedList.push(lastLockedHandle);
            addRealtimeLog(`[${unfollowedList.length}] 👤 手动介入: 已确认取关 ${lastLockedHandle}`, '#00ba7c');
        } else {
            addRealtimeLog(`[系统] 👤 手动介入: 保留并跳过账户 ${lastLockedHandle}`, '#aaa');
        }

        processedUsers.add(lastLockedHandle);

        lastLockedHandle = null;
        lastLockedCell = null;
    }

    function checkInterrupt() {
        if (!isRunning) throw new Error("USER_INTERRUPT");

        if (unfollowedList.length >= CONFIG.maxUnfollowLimit) {
            addRealtimeLog(`🚨 [熔断] 已触及设定的单次安全上限阀门！`, '#ff3333');
            isRunning = false;
            throw new Error("USER_INTERRUPT");
        }
    }

    async function interruptibleSleep(ms) {
        checkInterrupt();
        if (ms <= 100) {
            await new Promise(resolve => setTimeout(resolve, ms));
            return;
        }
        const startTime = Date.now();
        while (Date.now() - startTime < ms) {
            checkInterrupt();
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }

    async function startUnfollowProcess() {
        while (isRunning) {
            checkInterrupt();

            const userCells = document.querySelectorAll('[data-testid="UserCell"]');
            let itemProcessedThisLoop = false;

            for (const cell of userCells) {
                checkInterrupt();

                const textContent = cell.innerText || "";
                const matchHandle = textContent.match(/@\w+/);
                const userHandle = matchHandle ? matchHandle[0] : null;

                if (!userHandle || processedUsers.has(userHandle)) {
                    continue;
                }

                // 🌟 修改：扫描过滤时读取最新的动态白名单，匹配直接拦截跳过
                const currentWhitelist = getWhitelistArray();
                if (currentWhitelist.includes(userHandle)) {
                    processedUsers.add(userHandle);
                    addRealtimeLog(`🛡️ [白名单跳过] 自动跳过重要账户: ${userHandle}`, '#a855f7');
                    continue;
                }

                const isFollowingMe = textContent.includes("Follows you") || textContent.includes("关注了你");

                if (!isFollowingMe) {
                    const followingBtn = cell.querySelector('[data-testid$="-unfollow"]');

                    if (followingBtn) {
                        cell.scrollIntoView({ block: 'center' });
                        await interruptibleSleep(200);

                        if (!CONFIG.autoExecute) {
                            cell.classList.add('x-highlight-user');
                            addRealtimeLog(`🔍 锁定非回关: ${userHandle}，等待您人工处理`, '#ffff00');

                            lastLockedHandle = userHandle;
                            lastLockedCell = cell;

                            isRunning = false;
                            isPausedForManual = true;

                            throw new Error("MANUAL_PAUSE");
                        }

                        processedUsers.add(userHandle);
                        noActionCount = 0;
                        itemProcessedThisLoop = true;

                        followingBtn.click();
                        await interruptibleSleep(250);

                        const confirmBtn = document.querySelector('[data-testid="confirmationSheetConfirm"]');
                        if (confirmBtn) {
                            confirmBtn.click();
                            unfollowedList.push(userHandle);
                            addRealtimeLog(`[${unfollowedList.length}] ✅ 已自动取关 ${userHandle}`);

                            const min = CONFIG.minDelay;
                            const max = Math.max(min + 100, CONFIG.maxDelay);
                            const delay = Math.floor(Math.random() * (max - min + 1)) + min;

                            await interruptibleSleep(delay);
                        }
                    } else {
                        processedUsers.add(userHandle);
                    }
                } else {
                    processedUsers.add(userHandle);
                    noActionCount = 0;
                    itemProcessedThisLoop = true;
                }
            }

            if (!itemProcessedThisLoop) {
                noActionCount++;
                window.scrollBy({ top: CONFIG.scrollStep, behavior: 'auto' });
                await interruptibleSleep(CONFIG.scanInterval);
                if (noActionCount >= CONFIG.maxNoActionRetries) {
                    addRealtimeLog(`[系统] 已经到达列表底部。`, '#888');
                    break;
                }
            }
        }
    }

    function finishProcess() {
        if (isPausedForManual) {
            limitInput.disabled = false;
            autoExecCheck.disabled = false;

            mainActionBtn.innerText = '▶️ 继续清理';
            mainActionBtn.style.backgroundColor = '#1d9bf0';
            stopAndSettleBtn.style.display = 'block';
            return;
        }

        isRunning = false;
        isPausedForManual = false;

        limitInput.disabled = false;
        autoExecCheck.disabled = false;

        mainActionBtn.innerText = '🚀 启动程序';
        mainActionBtn.style.backgroundColor = '#00ba7c';
        stopAndSettleBtn.style.display = 'none';

        addRealtimeLog(`=================================`, '#ffff00');
        addRealtimeLog(`🎉 运行结算：清理工作已安全结束。`, '#ffff00');
        addRealtimeLog(`📊 本次累计成功取关: ${unfollowedList.length} 人。`, '#ffff00');
        addRealtimeLog(`=================================`, '#ffff00');

        unfollowedList = [];
        processedUsers.clear();
    }

    window.addEventListener('load', () => {
        setTimeout(createUI, 2000);
    });
})();
