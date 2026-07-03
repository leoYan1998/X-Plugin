// ==UserScript==
// @name         X批量取消非回关 (半自/全自双模式版)
// @namespace    http://tampermonkey.net/
// @version      1.5
// @description  集成半自动（手动刷屏）与全自动（自动滚屏）双入口，不占用物理鼠标，支持秒停与结算。
// @author       Leo66
// @match        https://x.com/*/following
// @match        https://twitter.com/*/following
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG = {
        minDelay: 2500,
        maxDelay: 5500,
        scrollStep: 400,
        scanInterval: 800,
        maxNoActionRetries: 8
    };

    let isRunning = false;
    let currentMode = ""; // "manual" 或 "auto"
    let unfollowedList = [];
    let processedUsers = new Set();
    let startManualBtn, startAutoBtn, stopBtn;
    let noActionCount = 0;

    function createUI() {
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.top = '70px';
        container.style.right = '20px';
        container.style.zIndex = '9999';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '10px';
        container.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        container.style.padding = '15px';
        container.style.borderRadius = '15px';
        container.style.boxShadow = '0 4px 10px rgba(0,0,0,0.3)';

        // 1. 半自动入口
        startManualBtn = document.createElement('button');
        startManualBtn.innerText = '▶️ 半自动守株待兔';
        styleButton(startManualBtn, '#1d9bf0');

        // 2. 全自动入口
        startAutoBtn = document.createElement('button');
        startAutoBtn.innerText = '🚀 开启全自动清理';
        styleButton(startAutoBtn, '#00ba7c'); // 绿色区分

        // 3. 通用停止键
        stopBtn = document.createElement('button');
        stopBtn.innerText = '🛑 停止清理';
        styleButton(stopBtn, '#e0245e');
        stopBtn.style.display = 'none';

        // 半自动点击事件
        startManualBtn.onclick = async () => {
            lockUI("manual", '⏳ 半自动监控中...');
            try { await startUnfollowProcess(false); } catch (e) { if (e.message !== "USER_INTERRUPT") console.error(e); }
            finishProcess();
        };

        // 全自动点击事件
        startAutoBtn.onclick = async () => {
            lockUI("auto", '🤖 全自动运行中...');
            try { await startUnfollowProcess(true); } catch (e) { if (e.message !== "USER_INTERRUPT") console.error(e); }
            finishProcess();
        };

        stopBtn.onclick = () => {
            isRunning = false;
            stopBtn.innerText = '⏳ 正在安全收尾...';
        };

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
    }

    // 锁定界面
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

    async function interruptibleSleep(ms) {
        const startTime = Date.now();
        while (Date.now() - startTime < ms) {
            checkInterrupt();
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    // 核心流（接收 autoScroll 参数判断是否自动滚屏）
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
                        cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        await interruptibleSleep(600);

                        console.log(`[${autoScroll?'全自动':'半自动'}] 发现非回关： ${userHandle}...`);
                        followingBtn.click(); // 代码触发，不抢物理鼠标焦点

                        await interruptibleSleep(1000);

                        const confirmBtn = document.querySelector('[data-testid="confirmationSheetConfirm"]');
                        if (confirmBtn) {
                            confirmBtn.click();
                            unfollowedList.push(userHandle);

                            const delay = Math.floor(Math.random() * (CONFIG.maxDelay - CONFIG.minDelay + 1)) + CONFIG.minDelay;
                            console.log(`✅ 已取关 ${userHandle}，等待 ${delay / 1000} 秒...`);
                            await interruptibleSleep(delay);
                        }
                    }
                }
            }

            // 无论哪种模式，屏幕上的人处理完了都歇一下
            await interruptibleSleep(500);

            // 判定滚屏逻辑
            if (!itemProcessedThisLoop) {
                if (autoScroll) {
                    // 全自动模式：脚本自己控制网页下滚
                    noActionCount++;
                    window.scrollBy({ top: CONFIG.scrollStep, behavior: 'smooth' });
                    await interruptibleSleep(CONFIG.scanInterval);

                    if (noActionCount >= CONFIG.maxNoActionRetries) {
                        console.log('检测到已到达列表底部，全自动结束。');
                        break;
                    }
                } else {
                    // 半自动模式：不做任何动作，纯等待用户手动滚轮刷新
                    continue;
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
                alert(`🎉 [${modeText}] 检查结束，未取消关注任何账户。`);
            }
        }, 200);
    }

    window.addEventListener('load', () => {
        setTimeout(createUI, 2000);
    });
})();
