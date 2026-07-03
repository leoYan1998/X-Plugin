// ==UserScript==
// @name         X批量取消非回关 (带安全阀门终极版)
// @namespace    http://tampermonkey.net/
// @version      1.8
// @description  集成安全阀门输入框，达到设定上限自动熔断停止，全自/半自双模式。
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
        maxUnfollowLimit: 80  // 默认安全阀门：80人
    };

    let isRunning = false;
    let currentMode = "";
    let unfollowedList = [];
    let processedUsers = new Set();
    let startManualBtn, startAutoBtn, stopBtn;
    let delayValLabel, speedValLabel, limitInput;
    let noActionCount = 0;

    function createUI() {
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.top = '70px';
        container.style.right = '20px';
        container.style.zIndex = '9999';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '12px';
        container.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
        container.style.padding = '15px';
        container.style.borderRadius = '15px';
        container.style.boxShadow = '0 4px 15px rgba(0,0,0,0.4)';
        container.style.color = '#fff';
        container.style.fontFamily = 'sans-serif';
        container.style.fontSize = '13px';
        container.style.width = '220px';

        // --- 组件 1：取关间隔上限 ---
        const delayGroup = document.createElement('div');
        delayGroup.style.display = 'flex';
        delayGroup.style.flexDirection = 'column';
        delayGroup.style.gap = '4px';
        const delayLabelContainer = document.createElement('div');
        delayLabelContainer.style.display = 'flex';
        delayLabelContainer.style.justifyContent = 'space-between';
        delayLabelContainer.innerHTML = '<span>⏳ 取关间隔上限:</span>';
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
        speedLabelContainer.innerHTML = '<span>🚀 滚屏刷新速度:</span>';
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

        // --- 🌟 新增组件 3：安全阀门输入框 ---
        const limitGroup = document.createElement('div');
        limitGroup.style.display = 'flex';
        limitGroup.style.justifyContent = 'space-between';
        limitGroup.style.alignItems = 'center';
        limitGroup.innerHTML = '<span>🎯 本次清理上限:</span>';
        limitInput = document.createElement('input');
        limitInput.type = 'number';
        limitInput.value = CONFIG.maxUnfollowLimit.toString();
        limitInput.style.width = '60px';
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
        hr.style.margin = '4px 0';

        // --- 按钮组件 ---
        startManualBtn = document.createElement('button');
        startManualBtn.innerText = '▶️ 半自动守株待兔';
        styleButton(startManualBtn, '#1d9bf0');

        startAutoBtn = document.createElement('button');
        startAutoBtn.innerText = '🚀 开启全自动清理';
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
        container.appendChild(limitGroup); // 塞入界面
        container.appendChild(hr);
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
    }

    function lockUI(mode, text) {
        isRunning = true;
        currentMode = mode;
        unfollowedList = [];
        processedUsers.clear();
        noActionCount = 0;

        startManualBtn.disabled = true;
        startAutoBtn.disabled = true;
        limitInput.disabled = true; // 运行时不允许修改阀门
        startManualBtn.style.backgroundColor = '#ccc';
        startAutoBtn.style.backgroundColor = '#ccc';

        if(mode === "manual") startManualBtn.innerText = text;
        if(mode === "auto") startAutoBtn.innerText = text;
        stopBtn.style.display = 'block';
        stopBtn.innerText = '🛑 停止清理';
    }

    function checkInterrupt() {
        if (!isRunning) throw new Error("USER_INTERRUPT");

        // 🌟 核心安全阀门逻辑：一旦达到设定的数字，直接触发熔断中断
        if (unfollowedList.length >= CONFIG.maxUnfollowLimit) {
            console.log(`🚨 已达到设定的安全阀门上限（${CONFIG.maxUnfollowLimit}人），正在自动熔断停止！`);
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
                            unfollowedList.push(userHandle); // 这里塞入后，下一次 checkInterrupt 就会立刻检测计数

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
                    if (noActionCount >= CONFIG.maxNoActionRetries) break;
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
        limitInput.disabled = false; // 恢复阀门输入框
        startManualBtn.style.backgroundColor = '#1d9bf0';
        startAutoBtn.style.backgroundColor = '#00ba7c';
        startManualBtn.innerText = '▶️ 半自动守株待兔';
        startAutoBtn.innerText = '🚀 开启全自动清理';
        stopBtn.style.display = 'none';

        setTimeout(() => {
            const isHitLimit = unfollowedList.length >= CONFIG.maxUnfollowLimit;
            const titleText = isHitLimit ? "🛑 已触及安全阀门自动熔断" : "🎉 清理结束";

            if (unfollowedList.length > 0) {
                alert(`${titleText}！\n\n本次共成功取关了 ${unfollowedList.length} 个非回关账户：\n\n${unfollowedList.join('\n')}`);
            } else {
                alert(`🎉 检查结束，未取关任何账户。`);
            }
        }, 200);
    }

    window.addEventListener('load', () => {
        setTimeout(createUI, 2000);
    });
})();
