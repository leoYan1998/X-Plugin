// ==UserScript==
// @name         X批量取消非回关 (极致超速版)
// @namespace    http://tampermonkey.net/
// @version      1.7
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
        scrollStep: 800,      // 加大滚屏跨度，一滚到底
        scanInterval: 400,
        maxNoActionRetries: 6
    };

    let isRunning = false;
    let currentMode = "";
    let unfollowedList = [];
    let processedUsers = new Set();
    let startManualBtn, startAutoBtn, stopBtn;
    let delayValLabel, speedValLabel;
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
        speedSlider.min = '0';  // 解锁 0ms 极限极速模式
        speedSlider.max = '2000';
        speedSlider.step = '50';
        speedSlider.value = CONFIG.scanInterval.toString();
        speedSlider.oninput = (e) => {
            CONFIG.scanInterval = parseInt(e.target.value);
            speedValLabel.innerText = CONFIG.scanInterval === 0 ? "⚡ 极限极速" : `${e.target.value}ms`;
        };
        speedGroup.appendChild(speedLabelContainer);
        speedGroup.appendChild(speedSlider);

        const hr = document.createElement('hr');
        hr.style.border = '0';
        hr.style.borderTop = '1px solid #444';
        hr.style.margin = '4px 0';

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
        startManualBtn.style.backgroundColor = '#ccc';
        startAutoBtn.style.backgroundColor = '#ccc';
        if(mode === "manual") startManualBtn.innerText = text;
        if(mode === "auto") startAutoBtn.innerText = text;
        stopBtn.style.display = 'block';
        stopBtn.innerText = '🛑 停止清理';
    }

    function checkInterrupt() {
        if (!isRunning) throw new Error("USER_INTERRUPT");
    }

    // 优化的可中断等待：如果传入的等待时间小于等于 100ms，直接走最快通道
    async function interruptibleSleep(ms) {
        checkInterrupt();
        if (ms <= 100) {
            await new Promise(resolve => setTimeout(resolve, ms));
            return;
        }
        const startTime = Date.now();
        while (Date.now() - startTime < ms) {
            checkInterrupt();
            await new Promise(resolve => setTimeout(resolve, 50)); // 切碎颗粒度缩短到50ms，响应更快
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
                        // 极速模式下不再强行平滑滚动，直接闪现到视野，提高速度
                        cell.scrollIntoView({ block: 'center' });
                        await interruptibleSleep(100);

                        followingBtn.click();

                        await interruptibleSleep(250); // 压缩等待弹窗出现的时间

                        const confirmBtn = document.querySelector('[data-testid="confirmationSheetConfirm"]');
                        if (confirmBtn) {
                            confirmBtn.click();
                            unfollowedList.push(userHandle);

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
                    window.scrollBy({ top: CONFIG.scrollStep, behavior: 'auto' }); // 闪现式滚屏

                    await interruptibleSleep(CONFIG.scanInterval);

                    if (noActionCount >= CONFIG.maxNoActionRetries) {
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
        startManualBtn.style.backgroundColor = '#1d9bf0';
        startAutoBtn.style.backgroundColor = '#00ba7c';
        startManualBtn.innerText = '▶️ 半自动守株待兔';
        startAutoBtn.innerText = '🚀 开启全自动清理';
        stopBtn.style.display = 'none';

        setTimeout(() => {
            const modeText = currentMode === "auto" ? "全自动" : "半自动";
            if (unfollowedList.length > 0) {
                alert(`🎉 [${modeText}] 清理结束！\n\n本次共取消关注了 ${unfollowedList.length} 个账户：\n\n${unfollowedList.join('\n')}`);
            } else {
                alert(`🎉 [${modeText}] 检查结束。`);
            }
        }, 200);
    }

    window.addEventListener('load', () => {
        setTimeout(createUI, 2000);
    });
})();
