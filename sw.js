// Service Worker handling background Web Push Notifications
self.addEventListener('push', function(event) {
let data = { title: "สรุปรายการบัญชี", body: "มีการแจ้งเตือนใหม่จากระบบ" };
if (event.data) {
try {
data = event.data.json();
} catch (e) {
data.body = event.data.text();
}
}
const title = data.title || "สรุปรายรับ-รายจ่าย";
const options = {
body: data.body,
icon: "/icon-192.png",
badge: "/icon-192.png",
vibrate: [100, 50, 100],
data: {
url: data.url || "/"
}
};
event.waitUntil(
self.registration.showNotification(title, options)
);
});
self.addEventListener('notificationclick', function(event) {
event.notification.close();
event.waitUntil(
clients.openWindow(event.notification.data.url)
);
});
