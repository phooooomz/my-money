// ... existing code ...
function removeMessage(id) {
    if (!id) return;
    const el = document.getElementById(id);
    if (el) el.remove();
}

// Service Worker Registration & Notification Toggle Flow
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('/sw.js');
        } catch (err) {
            console.log('SW registration bypassed:', err);
        }
    }
    updateNotifyButton();
}

// Safe Notification Handler with direct permission trigger
async function toggleNotifications() {
    if (!('Notification' in window)) {
        alert('เบราว์เซอร์หรืออุปกรณ์นี้ยังไม่รองรับ Web Push Notification ครับ');
        return;
    }

    try {
        // Trigger browser's native permission popup
        const permission = await Notification.requestPermission();

        if (permission === 'granted') {
            // Update button UI & hide test controls smoothly
            updateNotifyButton();
            // Fire a quick test notification to confirm setup
            triggerTestNotification();
        } else if (permission === 'denied') {
            alert('เบราว์เซอร์ถูกตั้งค่าบล็อกการแจ้งเตือนไว้ โปรดเข้าไปกดอนุญาต (Allow) ในการตั้งค่าเว็บไซต์ของเบราว์เซอร์');
            updateNotifyButton();
        }
    } catch (e) {
        console.error("Notification permission error:", e);
        alert('ไม่สามารถเปิดแจ้งเตือนได้: ' + (e.message || 'เกิดข้อผิดพลาด'));
    }
}

function triggerTestNotification() {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
        return;
    }

    const title = "🔔 ระบบบันทึกบัญชี";
    const options = {
        body: "เปิดใช้งานระบบแจ้งเตือนสรุปประจำวัน (18:00 น.) เรียบร้อยแล้ว!",
        icon: "/icon-192.png"
    };

    try {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(reg => {
                reg.showNotification(title, options);
            }).catch(() => {
                new Notification(title, options);
            });
        } else {
            new Notification(title, options);
        }
    } catch (e) {
        console.error("Trigger notification fail:", e);
    }
}

function updateNotifyButton() {
    const btn = getEl('notify-btn');
    const testBtn = getEl('test-notify-btn');
    if (!btn) return;

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        btn.textContent = 'เปิดใช้งานแล้ว';
        btn.onclick = null; // Disable button re-trigger when already granted
        btn.className = 'px-3 py-1 rounded-md bg-emerald-950/60 border border-emerald-800 text-emerald-400 font-medium text-xs cursor-default';
        if (testBtn) testBtn.classList.remove('hidden');
    } else {
        btn.textContent = 'เปิดแจ้งเตือน';
        btn.onclick = toggleNotifications;
        btn.className = 'px-3 py-1 rounded-md bg-[#0c0d0e] border border-[#272a2e] text-[#9ca3af] hover:text-[#f0f2f5] transition cursor-pointer';
        if (testBtn) testBtn.classList.add('hidden');
    }
}

// Function to update the Online/Offline status badge
// ... existing code ...
