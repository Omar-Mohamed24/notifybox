importScripts(
	'https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js',
);
importScripts(
	'https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js',
);
importScripts('./config.js');

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
	const title = payload?.data?.title || payload?.notification?.title || '';
	const body = payload?.data?.body || payload?.notification?.body || '';

	self.clients
		.matchAll({ type: 'window', includeUncontrolled: true })
		.then((windowClients) => {
			const isForeground = windowClients.some((c) => c.focused);

			if (title) {
				windowClients.forEach((client) => {
					client.postMessage({
						type: 'bg-notification',
						title,
						body,
					});
				});
				return self.registration.showNotification(title, {
					body,
					data: payload.data,
				});
			}
		});
});
