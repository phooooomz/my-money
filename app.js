// State Management
let transactions = [];
try {
const saved = localStorage.getItem('ledger_transactions');
if (saved) transactions = JSON.parse(saved);
} catch (e) {
console.error("Failed to load local storage:", e);
transactions = [];
}
let currentType = 'expense';
// Element References Helper
const getEl = (id) => document.getElementById(id);
// Helper: Set current date to input date field
function setDefaultDate() {
const entryDateInput = getEl('entry-date');
if (entryDateInput && !entryDateInput.value) {
const today = new Date().toISOString().split('T')[0];
entryDateInput.value = today;
}
}
// Tab Switcher
function switchTab(tab) {
const tabApp = getEl('tab-app');
const tabAi = getEl('tab-ai');
const btnApp = getEl('tab-app-btn');
const btnAi = getEl('tab-ai-btn');
if (tab === 'app') {
tabApp?.classList.remove('hidden');
tabAi?.classList.add('hidden');
btnApp?.classList.add('tab-active');
btnAi?.classList.remove('tab-active');
} else {
tabApp?.classList.add('hidden');
tabAi?.classList.remove('hidden');
btnAi?.classList.add('tab-active');
btnApp?.classList.remove('tab-active');
}
}
// Set Type Toggle
function setEntryType(type) {
currentType = type;
const typeExpenseBtn = getEl('type-expense');
const typeIncomeBtn = getEl('type-income');
if (type === 'expense') {
typeExpenseBtn?.classList.add('bg-[#272a2e]', 'text-[#f0f2f5]');
typeExpenseBtn?.classList.remove('text-[#9ca3af]');
typeIncomeBtn?.classList.remove('bg-[#272a2e]', 'text-[#f0f2f5]');
typeIncomeBtn?.classList.add('text-[#9ca3af]');
} else {
typeIncomeBtn?.classList.add('bg-[#272a2e]', 'text-[#f0f2f5]');
typeIncomeBtn?.classList.remove('text-[#9ca3af]');
typeExpenseBtn?.classList.remove('bg-[#272a2e]', 'text-[#f0f2f5]');
typeExpenseBtn?.classList.add('text-[#9ca3af]');
}
}
// Add Entry
function addEntry() {
const entryDateInput = getEl('entry-date');
const entryDescInput = getEl('entry-desc');
const entryAmountInput = getEl('entry-amount');
const dateVal = entryDateInput?.value || new Date().toISOString().split('T')[0];
const descVal = entryDescInput?.value ? entryDescInput.value.trim() : '';
const amountVal = parseFloat(entryAmountInput?.value);
if (!descVal || isNaN(amountVal) || amountVal <= 0) {
alert('กรุณากรอกข้อมูลรายการและจำนวนเงินให้ถูกต้อง');
return;
}
const item = {
id: Date.now(),
date: dateVal,
type: currentType,
desc: descVal,
amount: amountVal
};
transactions.unshift(item);
saveAndRender();
if (entryDescInput) entryDescInput.value = '';
if (entryAmountInput) entryAmountInput.value = '';
setDefaultDate();
}
// Delete Entry
function deleteEntry(id) {
transactions = transactions.filter(t => t.id !== id);
saveAndRender();
}
// Clear All Data
function clearAllData() {
if (confirm('คุณต้องการลบข้อมูลทั้งหมดใช่หรือไม่?')) {
transactions = [];
saveAndRender();
}
}
// Save to LocalStorage & Render UI
function saveAndRender() {
try {
localStorage.setItem('ledger_transactions', JSON.stringify(transactions));
} catch (e) {
console.error("Failed to save to local storage:", e);
}
render();
}
// Render Core UI
function render() {
let income = 0;
let expense = 0;
const transactionListEl = getEl('transaction-list');
const totalBalanceEl = getEl('total-balance');
const totalIncomeEl = getEl('total-income');
const totalExpenseEl = getEl('total-expense');
if (transactionListEl) transactionListEl.innerHTML = '';
if (transactions.length === 0 && transactionListEl) {
transactionListEl.innerHTML = <div class="text-center py-8 text-xs text-[#9ca3af] bg-[#16181a] rounded-xl border border-[#272a2e]"> ยังไม่มีข้อมูลการบันทึกรายการ </div>;
}
transactions.forEach(t => {
if (t.type === 'income') income += t.amount;
else expense += t.amount;
const dateDisplay = t.date || 'ไม่ระบุวันที่';
if (transactionListEl) {
const el = document.createElement('div');
el.className = 'flex items-center justify-between p-3.5 bg-[#16181a] rounded-xl border border-[#272a2e] text-sm';
el.innerHTML = <div class="flex flex-col"> <span class="text-[#f0f2f5] font-medium">${escapeHtml(t.desc)}</span> <span class="text-[10px] text-[#9ca3af] font-mono mt-0.5">${dateDisplay}</span> </div> <div class="flex items-center gap-3"> <span class="${t.type === 'income' ? 'text-emerald-400' : 'text-rose-400'} font-mono font-medium"> ${t.type === 'income' ? '+' : '-'}฿${t.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} </span> <button onclick="deleteEntry(${t.id})" class="text-[#9ca3af] hover:text-rose-400 text-xs transition">✕</button> </div>;
transactionListEl.appendChild(el);
}
});
const balance = income - expense;
if (totalBalanceEl) totalBalanceEl.textContent = ฿${balance.toLocaleString('th-TH', { minimumFractionDigits: 2 })};
if (totalIncomeEl) totalIncomeEl.textContent = ฿${income.toLocaleString('th-TH', { minimumFractionDigits: 2 })};
if (totalExpenseEl) totalExpenseEl.textContent = ฿${expense.toLocaleString('th-TH', { minimumFractionDigits: 2 })};
}
// Security Helper
function escapeHtml(text) {
const div = document.createElement('div');
div.textContent = text;
return div.innerHTML;
}
// AI Chat Communication Logic via Cloudflare Pages API
async function sendChatMessage(e) {
if (e && e.preventDefault) e.preventDefault();
const chatInput = getEl('chat-input');
const sendBtn = getEl('chat-send-btn');
if (!chatInput) return;
const prompt = chatInput.value.trim();
if (!prompt) return;
appendMessage('user', prompt);
chatInput.value = '';
if (sendBtn) sendBtn.disabled = true;
const loadingId = appendMessage('bot', 'กำลังประมวลผลคำตอบ...');
try {
const response = await fetch('/api/chat', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
prompt: prompt,
records: transactions
})
});
const data = await response.json();
removeMessage(loadingId);
if (data.reply) {
appendMessage('bot', data.reply);
} else if (data.error) {
appendMessage('bot', ⚠️ เกิดข้อผิดพลาด: ${data.error});
}
} catch (err) {
removeMessage(loadingId);
appendMessage('bot', '⚠️ ไม่สามารถเชื่อมต่อกับ Cloudflare Server API ได้');
} finally {
if (sendBtn) sendBtn.disabled = false;
}
}
function appendMessage(sender, text) {
const chatBox = getEl('chat-box');
if (!chatBox) return null;
const id = 'msg-' + Date.now();
const msgDiv = document.createElement('div');
msgDiv.id = id;
if (sender === 'user') {
msgDiv.className = 'bg-[#f0f2f5] text-[#0c0d0e] p-3 rounded-xl max-w-[85%] self-end font-medium';
} else {
msgDiv.className = 'bg-[#272a2e]/50 text-[#f0f2f5] p-3 rounded-xl max-w-[85%] self-start border border-[#272a2e]';
}
msgDiv.textContent = text;
chatBox.appendChild(msgDiv);
chatBox.scrollTop = chatBox.scrollHeight;
return id;
}
function removeMessage(id) {
if (!id) return;
const el = document.getElementById(id);
if (el) el.remove();
}
// Service Worker Registration
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
// Safe Notification Handler
async function toggleNotifications() {
if (!('Notification' in window)) {
alert('เบราว์เซอร์หรืออุปกรณ์นี้ยังไม่รองรับ Web Push Notification ครับ');
return;
}
try {
let permission = Notification.permission;
if (permission !== 'granted') {
permission = await Notification.requestPermission();
}
if (permission === 'granted') {
alert('เปิดระบบแจ้งเตือนสำเร็จแล้ว!');
updateNotifyButton();
triggerTestNotification();
} else if (permission === 'denied') {
alert('เบราว์เซอร์ถูกตั้งค่าบล็อกการแจ้งเตือนไว้ โปรดเข้าไปอนุญาตที่ตั้งค่าเบราว์เซอร์');
}
} catch (e) {
console.error("Notification permission error:", e);
alert('เกิดข้อผิดพลาดในการขออนุญาตแจ้งเตือน: ' + e.message);
}
}
function triggerTestNotification() {
if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
return;
}
const title = "🔔 สรุปรายรับ-รายจ่าย (18:00 น.)";
const options = {
body: "ระบบพร้อมส่งสรุปยอดของคุณทุกวันเวลา 18:00 น. เรียบร้อยแล้ว!",
icon: "/icon-192.png"
};
try {
if ('serviceWorker' in navigator) {
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
btn.className = 'px-3 py-1 rounded-md bg-emerald-950/60 border border-emerald-800 text-emerald-400 font-medium text-xs';
if (testBtn) testBtn.classList.remove('hidden');
} else {
btn.textContent = 'เปิดแจ้งเตือน';
btn.className = 'px-3 py-1 rounded-md bg-[#0c0d0e] border border-[#272a2e] text-[#9ca3af] hover:text-[#f0f2f5] transition';
if (testBtn) testBtn.classList.add('hidden');
}
}
// Function to update the Online/Offline status badge
function updateNetworkStatus() {
const statusBox = getEl('network-status');
const dot = getEl('network-dot');
const text = getEl('network-text');
if (!statusBox || !dot || !text) return;
if (navigator.onLine) {
statusBox.className = "flex items-center gap-2 px-3 py-1 rounded-full border bg-emerald-950/40 border-emerald-900/60 text-emerald-400 text-xs transition-colors duration-300";
dot.className = "w-2 h-2 rounded-full bg-emerald-500 animate-pulse";
text.textContent = "Online";
} else {
statusBox.className = "flex items-center gap-2 px-3 py-1 rounded-full border bg-rose-950/40 border-rose-900/60 text-rose-400 text-xs transition-colors duration-300";
dot.className = "w-2 h-2 rounded-full bg-rose-500";
text.textContent = "Offline";
}
}
// Initialize App safely
document.addEventListener('DOMContentLoaded', () => {
setDefaultDate();
render();
registerServiceWorker();
// Check initial network status & bind event listeners
updateNetworkStatus();
window.addEventListener('online', updateNetworkStatus);
window.addEventListener('offline', updateNetworkStatus);
});
