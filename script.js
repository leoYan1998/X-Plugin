// ==UserScript==
// @name         X批量取消非回关 (海王管理大师精修UI版-赞助标签化)
// @namespace    http://tampermonkey.net/
// @version      4.7
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

    function injectStyles() {
        const style = document.createElement('style');
        style.innerHTML = `
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
                z-index: 10000;
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
        container.style.width = '240px';
        container.style.padding = '16px';
        container.style.borderRadius = '16px';
        container.style.color = '#fff';
        container.style.fontFamily = 'monospace, sans-serif';
        container.style.fontSize = '13px';
        container.style.transition = 'opacity 0.2s, transform 0.2s';

        container.style.backgroundColor = 'rgba(15, 15, 15, 0.75)';
        container.style.backdropFilter = 'blur(12px)';
        container.style.webkitBackdropFilter = 'blur(12px)';
        container.style.border = '1px solid rgba(255, 255, 255, 0.14)';
        container.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)';

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
        miniBtn.style.cursor = 'pointer';
        miniBtn.style.whiteSpace = 'nowrap';
        miniBtn.style.backgroundColor = 'rgba(15, 15, 15, 0.75)';
        miniBtn.style.backdropFilter = 'blur(12px)';
        miniBtn.style.webkitBackdropFilter = 'blur(12px)';
        miniBtn.style.border = '1px solid rgba(29, 155, 240, 0.4)';
        miniBtn.style.boxShadow = '0 4px 16px rgba(0,0,0,0.3)';
        miniBtn.innerHTML = '𝕏 展开大师 ➕';
        miniBtn.style.transition = 'transform 0.2s';
        miniBtn.onmouseover = () => miniBtn.style.transform = 'scale(1.05)';
        miniBtn.onmouseout = () => miniBtn.style.transform = 'scale(1)';

        // 🌟 顶部工具栏
        const headerRow = document.createElement('div');
        headerRow.style.display = 'flex';
        headerRow.style.justifyContent = 'space-between';
        headerRow.style.alignItems = 'center';

        const titleSpan = document.createElement('span');
        titleSpan.innerText = '𝕏-海王管理大师';
        titleSpan.style.fontWeight = 'bold';
        titleSpan.style.fontSize = '14px';
        titleSpan.style.color = '#1d9bf0';
        titleSpan.style.textShadow = '0 0 8px rgba(29, 155, 240, 0.3)';

        const hideBtn = document.createElement('span');
        hideBtn.innerText = '➖';
        hideBtn.style.cursor = 'pointer';
        hideBtn.style.fontSize = '12px';
        hideBtn.style.opacity = '0.6';
        hideBtn.onmouseover = () => hideBtn.style.opacity = '1';
        hideBtn.onmouseout = () => hideBtn.style.opacity = '0.6';

        headerRow.appendChild(titleSpan);
        headerRow.appendChild(hideBtn);
        container.appendChild(headerRow);

        hideBtn.onclick = () => {
            container.style.opacity = '0';
            container.style.transform = 'scale(0.9)';
            setTimeout(() => {
                container.style.display = 'none';
                miniBtn.style.display = 'flex';
            }, 200);
        };

        miniBtn.onclick = () => {
            miniBtn.style.display = 'none';
            container.style.display = 'flex';
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
        delaySlider.style.cursor = 'pointer';
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
        speedSlider.style.cursor = 'pointer';
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

        // 选项卡
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

        // --- 组件 4：实时日志区 ---
        const logLabel = document.createElement('div');
        logLabel.innerHTML = '<span>📋 运行日志:</span>';
        logLabel.style.fontSize = '12px';
        logLabel.style.color = '#aaa';

        logBox = document.createElement('div');
        logBox.style.height = '120px';
        logBox.style.backgroundColor = 'rgba(0, 0, 0, 0.4)';
        logBox.style.border = '1px solid rgba(255, 255, 255, 0.1)';
        logBox.style.borderRadius = '8px';
        logBox.style.padding = '8px';
        logBox.style.overflowY = 'auto';
        logBox.style.fontSize = '11px';
        logBox.style.lineHeight = '1.5';
        logBox.style.color = '#00ff66';
        logBox.innerHTML = '<div style="color:#888;">[就绪] 海王雷达已部署，等待启动...</div>';

        // 主操作按钮
        mainActionBtn = document.createElement('button');
        mainActionBtn.innerText = '🚀 启动程序';
        styleButton(mainActionBtn, '#00ba7c');

        // 人工锁定暂停时弹出的“结束并结算”按钮
        stopAndSettleBtn = document.createElement('button');
        stopAndSettleBtn.innerText = '🏁 结束并结算';
        styleButton(stopAndSettleBtn, '#ff6b00');
        stopAndSettleBtn.style.display = 'none';

        // 🌟 底部纯净文本行（Flex 两端对齐，左侧放版本，右侧预留干净点击标签）
        const footerRow = document.createElement('div');
        footerRow.style.display = 'flex';
        footerRow.style.justifyContent = 'space-between';
        footerRow.style.alignItems = 'center';
        footerRow.style.marginTop = '4px';
        footerRow.style.fontSize = '11px';
        footerRow.style.color = '#666';

        const versionSpan = document.createElement('span');
        versionSpan.innerText = 'v4.7';

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
        footerRow.appendChild(sponsorSpan); // 放在右侧

        // 核心整合点击逻辑
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
        container.appendChild(footerRow); // 将整行塞入底部

        document.body.appendChild(container);
        document.body.appendChild(miniBtn);
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
