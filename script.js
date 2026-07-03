// ==UserScript==
// @name         X批量取消非回关
// @namespace    http://tampermonkey.net/
// @version      2.0
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
        maxUnfollowLimit: 80
    };

    let isRunning = false;
    let currentMode = "";
    let unfollowedList = [];
    let processedUsers = new Set();
    let startManualBtn, startAutoBtn, stopBtn;
    let delayValLabel, speedValLabel, limitInput, logBox;
    let noActionCount = 0;

    // 插入悬浮提示所需的全局 CSS 样式
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
        `;
        document.head.appendChild(style);
    }

    // 创建带提示的标签组合
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

        // --- 组件 1：取关间隔上限 ---
        const delayGroup = document.createElement('div');
        delayGroup.style.display = 'flex';
        delayGroup.style.flexDirection = 'column';
        delayGroup.style.gap = '4px';

        const delayLabelContainer = document.createElement('div');
        delayLabelContainer.style.display = 'flex';
        delayLabelContainer.style.justifyContent = 'space-between';

        // 🌟 注入问号提示
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

        // 🌟 注入问号提示
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

        // 🌟 注入问号提示
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

        const hr = document.createElement('hr');
        hr.style.border = '0';
        hr.style.borderTop = '1px solid #444';
        hr.style.margin = '2px 0';

        // --- 组件 4：实时日志区 ---
        const logLabel = document.createElement('div');
        logLabel.innerHTML = '<span>📋 实时取关日志:</span>';
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
        logBox.innerHTML = '<div style="color:#888;">[就绪] 等待点击开始...</div>';

        // --- 按钮组件 ---
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
            try { await startUnfollowProcess(false); } catch (e) { if (e.message !== "USER_INTERRUPT") console.error(e); }
            finishProcess();
        };

        startAutoBtn.onclick = async () => {
            lockUI("auto", '🤖 全自动运行中...');
            try { await startUnfollowProcess(true); } catch (e) { if (e.message !== "USER_INTERRUPT") console.error(e); }
            finishProcess();
        };

        stopBtn.onclick = () => {
            isRunning = false;
            stopBtn.innerText = '⏳ 正在安全收尾...';
        };

        container.appendChild(delayGroup);
        container.appendChild(speedGroup);
        container.appendChild(limitGroup);
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
        currentMode = mode;
        unfollowedList = [];
        processedUsers.clear();
        noActionCount = 0;

        logBox.innerHTML = `<div style="color:#e1a100;">[系统] 模式切换，开始扫描...</div>`;

        startManualBtn.disabled = true;
        startAutoBtn.disabled = true;
        limitInput.disabled = true;
        startManualBtn.style.backgroundColor = '#ccc';
        startAutoBtn.style.backgroundColor = '#ccc';

        if(mode === "manual") startManualBtn.innerText = text;
        if(mode === "auto") startAutoBtn.innerText = text;
        stopBtn.style.display = 'block';
        stopBtn.innerText = '🛑 停止清理';
    }

    function checkInterrupt() {
        if (!isRunning) throw new Error("USER_INTERRUPT");

        if (unfollowedList.length >= CONFIG.maxUnfollowLimit) {
            addRealtimeLog(`🚨 已触及设定的上限阀门！`, '#ff3333');
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

                processedUsers.add(userHandle);
                noActionCount = 0;
                itemProcessedThisLoop = true;

                const isFollowingMe = textContent.includes("Follows you") || textContent.includes("关注了你");

                if (!isFollowingMe) {
                    const followingBtn = cell.querySelector('[data-testid$="-unfollow"]');

                    if (followingBtn) {
                        cell.scrollIntoView({ block: 'center' });
                        await interruptibleSleep(100);

                        followingBtn.click();
                        await interruptibleSleep(250);

                        const confirmBtn = document.querySelector('[data-testid="confirmationSheetConfirm"]');
                        if (confirmBtn) {
                            confirmBtn.click();
                            unfollowedList.push(userHandle);
                            addRealtimeLog(`[${unfollowedList.length}] ✅ 已取关 ${userHandle}`);

                            const min = CONFIG.minDelay;
                            const max = Math.max(min + 100, CONFIG.maxDelay);
                            const delay = Math.floor(Math.random() * (max - min + 1)) + min;

                            await interruptibleSleep(delay);
                        }
                    }
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
        isRunning = false;
        startManualBtn.disabled = false;
        startAutoBtn.disabled = false;
        limitInput.disabled = false;
        startManualBtn.style.backgroundColor = '#1d9bf0';
        startAutoBtn.style.backgroundColor = '#00ba7c';
        startManualBtn.innerText = '▶️ 半自动';
        startAutoBtn.innerText = '🚀 全自动';
        stopBtn.style.display = 'none';

        addRealtimeLog(`[系统] 清理结束。总计取关: ${unfollowedList.length}人`, '#ffff00');

        setTimeout(() => {
            const isHitLimit = unfollowedList.length >= CONFIG.maxUnfollowLimit;
            const titleText = isHitLimit ? "🛑 已触及安全阀门自动熔断" : "🎉 清理结束";

            if (unfollowedList.length > 0) {
                alert(`${titleText}！\n\n本次共成功取关了 ${unfollowedList.length} 个非回关账户。\n（详细名单已留在右侧面板日志区）`);
            } else {
                alert(`🎉 检查结束，未取关任何账户。`);
            }
        }, 200);
    }

    window.addEventListener('load', () => {
        setTimeout(createUI, 2000);
    });
})();
