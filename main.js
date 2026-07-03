// ==UserScript==
// @name         X批量取消非回关
// @namespace    http://tampermonkey.net/
// @version      1.3
// @author       Leo66
// @match        https://x.com/*/following
// @match        https://twitter.com/*/following
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG = {
        minDelay: 2000,
        maxDelay: 5000
    };

    let isRunning = false;
    let unfollowedList = []; // 本次成功取关的清单
    let processedUsers = new Set(); // 核心：用来记忆已经处理过（不论是取关了还是留着）的用户ID，防止网页虚拟列表滚动时漏人
    let startBtn, stopBtn;

    function createUI() {
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.top = '70px';
        container.style.right = '20px';
        container.style.zIndex = '9999';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '10px';

        startBtn = document.createElement('button');
        startBtn.innerText = '▶️ 开始守株待兔';
        styleButton(startBtn, '#1d9bf0');

        stopBtn = document.createElement('button');
        stopBtn.innerText = '🛑 停止清理';
        styleButton(stopBtn, '#e0245e');
        stopBtn.style.display = 'none';

        startBtn.onclick = async () => {
            isRunning = true;
            unfollowedList = [];
            processedUsers.clear(); // 清空历史记忆
            startBtn.disabled = true;
            startBtn.style.backgroundColor = '#ccc';
            startBtn.innerText = '⏳ 正在监控屏幕中...';
            stopBtn.style.display = 'block';
            stopBtn.innerText = '🛑 停止清理';

            try {
                await startUnfollowProcess();
            } catch (e) {
                if (e.message !== "USER_INTERRUPT") console.error(e);
            }

            finishProcess();
        };

        stopBtn.onclick = () => {
            isRunning = false;
            stopBtn.innerText = '⏳ 正在结算...';
        };

        container.appendChild(startBtn);
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
        btn.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
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

    async function startUnfollowProcess() {
        // 完全死循环，除非用户点停止，否则永远在监控屏幕
        while (isRunning) {
            checkInterrupt();

            const userCells = document.querySelectorAll('[data-testid="UserCell"]');

            for (const cell of userCells) {
                checkInterrupt();

                const textContent = cell.innerText || "";

                // 提取唯一标识 @用户名
                const matchHandle = textContent.match(/@\w+/);
                const userHandle = matchHandle ? matchHandle[0] : null;

                // 如果没抓到用户名，或者这个用户在本次运行中已经处理过了，直接跳过
                if (!userHandle || processedUsers.has(userHandle)) {
                    continue;
                }

                // 标记该用户已被扫描处理（无论他回没回关，都不再重复看他）
                processedUsers.add(userHandle);

                const isFollowingMe = textContent.includes("Follows you") || textContent.includes("关注了你");

                if (!isFollowingMe) {
                    const followingBtn = cell.querySelector('[data-testid$="-unfollow"]');

                    if (followingBtn) {
                        cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        await interruptibleSleep(500);

                        console.log(`发现非回关账户 ${userHandle}，正在取消关注...`);
                        followingBtn.click();

                        await interruptibleSleep(1000);

                        const confirmBtn = document.querySelector('[data-testid="confirmationSheetConfirm"]');
                        if (confirmBtn) {
                            confirmBtn.click();
                            unfollowedList.push(userHandle);

                            const delay = Math.floor(Math.random() * (CONFIG.maxDelay - CONFIG.minDelay + 1)) + CONFIG.minDelay;
                            console.log(`已取关 ${userHandle}，等待 ${delay / 1000} 秒...`);
                            await interruptibleSleep(delay);
                        }
                    }
                }
            }

            // 屏幕上当前的几个人处理完后，稍微歇 0.5 秒继续下一轮扫描（等待用户滚动鼠标）
            await interruptibleSleep(500);
        }
    }

    function finishProcess() {
        isRunning = false;
        startBtn.disabled = false;
        startBtn.style.backgroundColor = '#1d9bf0';
        startBtn.innerText = '▶️ 开始守株待兔';
        stopBtn.style.display = 'none';

        setTimeout(() => {
            if (unfollowedList.length > 0) {
                const report = `🎉 清理暂停\n\n本次共取消关注了 ${unfollowedList.length} 个非回关账户：\n\n${unfollowedList.join('\n')}`;
                alert(report);
            } else {
                alert('操作结束，期间未取消关注任何账户。');
            }
        }, 200);
    }

    window.addEventListener('load', () => {
        setTimeout(createUI, 2000);
    });
})();
