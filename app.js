// ... existing code ...
function removeMessage(id) {
if (!id) return;
const el = document.getElementById(id);
if (el) el.remove();
}
// Push Notification Logic & Service Worker Registration
async function registerServiceWorker() {
if ('serviceWorker' in navigator && 'PushManager' in window) {
try {
const reg = await navigator.serviceWorker.register('/sw.js');
updateNotifyButton();
} catch (err) {
console.error('Service Worker registration failed:', err);
}
}
}
async function toggleNotifications() {
if (!('Notification' in window)) {
alert('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน');
return;
}
const permission = await Notification.requestPermission();
if (permission === 'granted') {
const reg = await navigator.serviceWorker.ready;
let sub = await reg.pushManager.getSubscription();
if (!sub) {
// Note: In actual production with VAPID keys, you would pass applicationServerKey here
console.log('Notification permission granted.');
}
updateNotifyButton();
// Show test local confirmation
reg.showNotification("เปิดการแจ้งเตือนสำเร็จ", {
body: "ระบบจะแจ้งเตือนสรุปรายวัน รายสัปดาห์ (7 วัน) และรายเดือน (30 วัน) ตามกำหนดเวลา",
icon: "/icon-192.png"
});
}
}
function updateNotifyButton() {
const btn = document.getElementById('notify-btn');
if (!btn) return;
if (Notification.permission === 'granted') {
btn.textContent = 'เปิดใช้งานแล้ว';
btn.className = 'px-3 py-1 rounded-md bg-emerald-950/60 border border-emerald-800 text-emerald-400 font-medium text-xs';
} else {
btn.textContent = 'เปิดแจ้งเตือน';
btn.className = 'px-3 py-1 rounded-md bg-[#0c0d0e] border border-[#272a2e] text-[#9ca3af] hover:text-[#f0f2f5] transition';
}
}
// Function to update the Online/Offline status badge
function updateNetworkStatus() {
// ... existing code ...
document.addEventListener('DOMContentLoaded', () => {
setDefaultDate();
render();
registerServiceWorker();
// Check initial network status & bind event listeners
updateNetworkStatus();
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
});
