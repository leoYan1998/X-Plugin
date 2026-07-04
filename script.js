// ==UserScript==
// @name         X批量取消非回关 (海王管理大师版)
// @namespace    http://tampermonkey.net/
// @version      4.0
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
    let currentMode = "";
    let unfollowedList = [];
    let processedUsers = new Set();
    let startManualBtn, startAutoBtn, stopBtn;
    let delayValLabel, speedValLabel, limitInput, logBox, autoExecCheck;
    let noActionCount = 0;

    let lastLockedHandle = null;
    let lastLockedCell = null;

    function injectStyles() {
        const style = document.createElement('style');
        style.innerHTML = `
            .x-helper-tooltip {
                position: relative;
                display: inline-block;
                cursor: help;
                margin-left: 4px;
                color: #888;
                font-size: 11px;
                user-select: none;
            }
            .x-helper-tooltip::after {
                content: attr(data-tip);
                position: absolute;
                bottom: 125%;
                left: 50%;
                transform: translateX(-50%);
                background-color: rgba(20, 20, 20, 0.95);
                color: #fff;
                padding: 6px 10px;
                border-radius: 6px;
                font-size: 11px;
                line-height: 1.4;
                white-space: normal;
                width: 160px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.5);
                border: 1px solid #444;
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.15s ease;
                z-index: 10000;
                font-family: sans-serif;
            }
            .x-helper-tooltip:hover::after {
                opacity: 1;
            }
            .x-highlight-user {
                outline: 2px solid #1d9bf0 !important;
                background-color: rgba(29, 155, 240, 0.1) !important;
                transition: all 0.3s ease;
            }
            /* 模式切换页签样式 */
            .x-tab-container {
                display: flex;
                background: #111;
                border-radius: 8px;
                padding: 2px;
                border: 1px solid #333;
            }
            .x-tab-btn {
                flex: 1;
                padding: 6px 0;
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
            }
            .x-tab-disabled {
                color: #555;
                cursor: not-allowed;
                opacity: 0.5;
            }
        `;
        document.head.appendChild(style);
    }

    function createLabelWithTooltip(labelText, tooltipText) {
        const container = document.createElement('span');
        container.innerText = labelText;
        const qMark = document.createElement('span');
        qMark.className = 'x-helper-tooltip';
        qMark.setAttribute('data-tip', tooltipText);
        qMark.innerText = '❓';
        container.appendChild(qMark);
        return container;
    }

    function createUI() {
        injectStyles();

        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.top = '70px';
        container.style.right = '20px';
        container.style.zIndex = '9999';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '12px';
        container.style.backgroundColor = 'rgba(0, 0, 0, 0.88)';
        container.style.padding = '15px';
        container.style.borderRadius = '15px';
        container.style.boxShadow = '0 4px 15px rgba(0,0,0,0.5)';
        container.style.color = '#fff';
        container.style.fontFamily = 'monospace, sans-serif';
        container.style.fontSize = '13px';
        container.style.width = '240px';

        // 🌟 新增：顶部大标题与赛博功德箱（左右分栏结构）
        const headerRow = document.createElement('div');
        headerRow.style.display = 'flex';
        headerRow.style.justifyContent = 'space-between';
        headerRow.style.alignItems = 'center';

        const titleSpan = document.createElement('span');
        titleSpan.innerText = '𝕏-海王管理大师';
        titleSpan.style.fontWeight = 'bold';
        titleSpan.style.fontSize = '14px';
        titleSpan.style.color = '#1d9bf0';

        const sponsorSpan = document.createElement('span');
        sponsorSpan.className = 'x-helper-tooltip';
        sponsorSpan.setAttribute('data-tip', '点击注入一丝免封玄学，赞助一两碎银，功德+1且有效降低风控概率（接口预留）');
        sponsorSpan.innerText = '💸 功德箱';
        sponsorSpan.style.fontSize = '11px';
        sponsorSpan.style.color = '#e1a100';
        sponsorSpan.style.cursor = 'pointer';
        sponsorSpan.style.opacity = '0.8';
        sponsorSpan.onmouseover = () => sponsorSpan.style.opacity = '1';
        sponsorSpan.onmouseout = () => sponsorSpan.style.opacity = '0.8';
        sponsorSpan.onclick = () => {
            console.log('[海王管理大师] 赞助通道触发，期待后续打赏接入');
        };

        headerRow.appendChild(titleSpan);
        headerRow.appendChild(sponsorSpan);
        container.appendChild(headerRow);

        const hrTop = document.createElement('hr');
        hrTop.style.border = '0';
        hrTop.style.borderTop = '1px solid #333';
        hrTop.style.margin = '0';
        container.appendChild(hrTop);

        // --- 组件 1：取关间隔上限 ---
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
        delaySlider.value = (CONFIG.maxDelay / 1000).toString();
        delaySlider.oninput = (e) => {
            CONFIG.maxDelay = parseInt(e.target.value) * 1000;
            delayValLabel.innerText = `${e.target.value}秒`;
        };
        delayGroup.appendChild(delayLabelContainer);
        delayGroup.appendChild(delaySlider);

        // --- 组件 2：滚屏刷新速度 ---
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
        speedSlider.value = CONFIG.scanInterval.toString();
        speedSlider.oninput = (e) => {
            CONFIG.scanInterval = parseInt(e.target.value);
            speedValLabel.innerText = CONFIG.scanInterval === 0 ? "⚡ 极限极速" : `${e.target.value}ms`;
        };
        speedGroup.appendChild(speedLabelContainer);
        speedGroup.appendChild(speedSlider);

        // --- 组件 3：安全阀门输入框 ---
        const limitGroup = document.createElement('div');
        limitGroup.style.display = 'flex';
        limitGroup.style.justifyContent = 'space-between';
        limitGroup.style.alignItems = 'center';

        const limitLabel = createLabelWithTooltip('🎯 本次清理上限', '强行防封熔断器。单次累计取关达到此数量脚本将自动自杀停止。强烈建议每日不超过100人。');
        limitGroup.appendChild(limitLabel);

        limitInput = document.createElement('input');
        limitInput.type = 'number';
        limitInput.value = CONFIG.maxUnfollowLimit.toString();
        limitInput.style.width = '55px';
        limitInput.style.background = '#333';
        limitInput.style.border = '1px solid #555';
        limitInput.style.borderRadius = '5px';
        limitInput.style.color = '#fff';
        limitInput.style.padding = '3px 5px';
        limitInput.style.textAlign = 'center';
        limitInput.onchange = (e) => {
            let val = parseInt(e.target.value);
            CONFIG.maxUnfollowLimit = isNaN(val) || val <= 0 ? 1 : val;
            limitInput.value = CONFIG.maxUnfollowLimit;
        };
        limitGroup.appendChild(limitInput);

        // --- 组件：自动执行开关 ---
        const autoExecGroup = document.createElement('div');
        autoExecGroup.style.display = 'flex';
        autoExecGroup.style.justifyContent = 'space-between';
        autoExecGroup.style.alignItems = 'center';

        const autoExecLabel = createLabelWithTooltip('⚡ 发现目标自动取关', '开启：自动点击取关。关闭：发现目标时暂停滚动并锁定目标，由您手动决定是否取关。');
        autoExecGroup.appendChild(autoExecLabel);

        autoExecCheck = document.createElement('input');
        autoExecCheck.type = 'checkbox';
        autoExecCheck.checked = CONFIG.autoExecute;
        autoExecCheck.style.cursor = 'pointer';
        autoExecCheck.style.width = '16px';
        autoExecCheck.style.height = '16px';
        autoExecCheck.onchange = (e) => {
            CONFIG.autoExecute = e.target.checked;
        };
        autoExecGroup.appendChild(autoExecCheck);

        // 🌟 新增：双向模式切换 Tab 栏（回关模式预留灰掉）
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
        hr.style.borderTop = '1px solid #444';
        hr.style.margin = '2px 0';

        // --- 组件 4：实时日志区 ---
        const logLabel = document.createElement('div');
        logLabel.innerHTML = '<span>📋 运行日志:</span>';
        logLabel.style.fontSize = '12px';
        logLabel.style.color = '#aaa';

        logBox = document.createElement('div');
        logBox.style.height = '120px';
        logBox.style.backgroundColor = '#111';
        logBox.style.border = '1px solid #333';
        logBox.style.borderRadius = '8px';
        logBox.style.padding = '8px';
        logBox.style.overflowY = 'auto';
        logBox.style.fontSize = '11px';
        logBox.style.lineHeight = '1.5';
        logBox.style.color = '#00ff66';
        logBox.innerHTML = '<div style="color:#888;">[就绪] 海王雷达已部署，等待启动...</div>';

        startManualBtn = document.createElement('button');
        startManualBtn.innerText = '▶️ 半自动';
        styleButton(startManualBtn, '#1d9bf0');

        startAutoBtn = document.createElement('button');
        startAutoBtn.innerText = '🚀 全自动';
        styleButton(startAutoBtn, '#00ba7c');

        stopBtn = document.createElement('button');
        stopBtn.innerText = '🛑 停止清理';
        styleButton(stopBtn, '#e0245e');
        stopBtn.style.display = 'none';

        startManualBtn.onclick = async () => {
            lockUI("manual", '⏳ 半自动监控中...');
            try { await startUnfollowProcess(false); } catch (e) { if (e.message !== "USER_INTERRUPT" && e.message !== "MANUAL_PAUSE") console.error(e); }
            finishProcess();
        };

        startAutoBtn.onclick = async () => {
            lockUI("auto", '🤖 全自动运行中...');
            try { await startUnfollowProcess(true); } catch (e) { if (e.message !== "USER_INTERRUPT" && e.message !== "MANUAL_PAUSE") console.error(e); }
            finishProcess();
        };

        stopBtn.onclick = () => {
            if (isPausedForManual) {
                checkAndRecordManualAction();
                isPausedForManual = false;
                isRunning = false;
                addRealtimeLog(`[系统] 用户选择终止，正在结算...`, '#ff3333');
                finishProcess();
            } else {
                isRunning = false;
                stopBtn.innerText = '⏳ 正在安全收尾...';
            }
        };

        container.appendChild(delayGroup);
        container.appendChild(speedGroup);
        container.appendChild(limitGroup);
        container.appendChild(autoExecGroup);
        container.appendChild(modeTabContainer); // 塞入模式页签
        container.appendChild(hr);
        container.appendChild(logLabel);
        container.appendChild(logBox);
        container.appendChild(startManualBtn);
        container.appendChild(startAutoBtn);
        container.appendChild(stopBtn);
        document.body.appendChild(container);
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

    function lockUI(mode, text) {
        isRunning = true;

        if (isPausedForManual) {
            checkAndRecordManualAction();
        }

        isPausedForManual = false;
        currentMode = mode;

        if (unfollowedList.length === 0) {
            logBox.innerHTML = `<div style="color:#e1a100;">[系统] 开始扫描非回关账户...</div>`;
        } else {
            addRealtimeLog(`[系统] 接收指令，继续向下清理...`, '#e1a100');
        }

        startManualBtn.disabled = true;
        startAutoBtn.disabled = true;
        limitInput.disabled = true;
        autoExecCheck.disabled = true;
        startManualBtn.style.backgroundColor = '#ccc';
        startAutoBtn.style.backgroundColor = '#ccc';

        if(mode === "manual") startManualBtn.innerText = text;
        if(mode === "auto") startAutoBtn.innerText = text;

        stopBtn.style.display = 'block';
        stopBtn.style.backgroundColor = '#e0245e';
        stopBtn.innerText = '🛑 停止清理';
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

    async function startUnfollowProcess(autoScroll) {
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
                if (autoScroll) {
                    noActionCount++;
                    window.scrollBy({ top: CONFIG.scrollStep, behavior: 'auto' });
                    await interruptibleSleep(CONFIG.scanInterval);
                    if (noActionCount >= CONFIG.maxNoActionRetries) {
                        addRealtimeLog(`[系统] 已经到达列表底部。`, '#888');
                        break;
                    }
                } else {
                    await interruptibleSleep(200);
                }
            }
        }
    }

    function finishProcess() {
        if (isPausedForManual) {
            startManualBtn.disabled = false;
            startAutoBtn.disabled = false;
            limitInput.disabled = false;
            autoExecCheck.disabled = false;

            startManualBtn.style.backgroundColor = '#1d9bf0';
            startAutoBtn.style.backgroundColor = '#00ba7c';
            startManualBtn.innerText = '▶️ 继续(半自动)';
            startAutoBtn.innerText = '🚀 继续(全自动)';

            stopBtn.style.display = 'block';
            stopBtn.style.backgroundColor = '#ff6b00';
            stopBtn.innerText = '🏁 结束并结算';
            return;
        }

        isRunning = false;
        isPausedForManual = false;

        startManualBtn.disabled = false;
        startAutoBtn.disabled = false;
        limitInput.disabled = false;
        autoExecCheck.disabled = false;

        startManualBtn.style.backgroundColor = '#1d9bf0';
        startAutoBtn.style.backgroundColor = '#00ba7c';
        startManualBtn.innerText = '▶️ 半自动';
        startAutoBtn.innerText = '🚀 全自动';
        stopBtn.style.display = 'none';

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
