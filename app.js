firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();
const db = firebase.database();

let currentToken = null;
let currentTopic = null;
let dbListenerRef = null;
let messagingSwRegistration = null;

function normalizeUsername(raw) {
	return 'user_' + raw.trim().toLowerCase().replace(/\s+/g, '_');
}

function normalizeTimestampToSeconds(value) {
	const numeric = Number(value);

	if (!Number.isFinite(numeric) || numeric <= 0) {
		return Math.floor(Date.now() / 1000);
	}

	return numeric > 1e11 ? Math.floor(numeric / 1000) : Math.floor(numeric);
}

function getNotificationTimestampSeconds(notification) {
	return normalizeTimestampToSeconds(
		notification?.receivedAt ??
			notification?.timestamp ??
			notification?.createdAt,
	);
}

function formatTimestamp(rawTimestamp) {
	const unixSeconds = normalizeTimestampToSeconds(rawTimestamp);
	return new Date(unixSeconds * 1000).toLocaleString();
}

function escapeHtml(str) {
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function showScreen(name) {
	document
		.querySelectorAll('.screen')
		.forEach((s) => s.classList.remove('active'));
	document.getElementById(`${name}-screen`).classList.add('active');
}

function setLoginStatus(msg, type = '') {
	const el = document.getElementById('login-status');
	el.textContent = msg;
	el.className = 'status-msg' + (type ? ' ' + type : '');
}

if ('serviceWorker' in navigator) {
	console.log('[app.js:serviceWorker] Registering firebase-messaging-sw.js');
	messagingSwRegistration = navigator.serviceWorker
		.register('/firebase-messaging-sw.js')
		.then((reg) => {
			console.log('[SW] Registered:', reg.scope);
			return reg;
		})
		.catch((err) => {
			console.log('[app.js:serviceWorker] Registration failed', err);
			console.error('[SW] Error:', err);
			return null;
		});

	navigator.serviceWorker.addEventListener('message', (event) => {
		if (event.data?.type === 'bg-notification' && currentTopic) {
			const { title, body } = event.data;
			console.log('[app.js:sw-message] Background notification relayed', {
				title,
			});
			console.log(
				'[app.js:sw-message] Notification stored from 1 message',
			);
			storeNotification(currentTopic, title, body);
		}
	});
}

async function getFcmToken() {
	const tokenOptions = { vapidKey: VAPID_KEY };

	if (messagingSwRegistration) {
		const reg = await messagingSwRegistration;
		if (reg) {
			tokenOptions.serviceWorkerRegistration = reg;
			console.log(
				'[app.js:getFcmToken] Reusing existing service worker registration for token',
			);
		}
	}

	return messaging.getToken(tokenOptions);
}

window.addEventListener('load', async () => {
	const savedUsername = localStorage.getItem('fcm_username');
	const savedTopic = localStorage.getItem('fcm_topic');

	if (savedUsername && savedTopic) {
		try {
			if (Notification.permission === 'granted') {
				console.log(
					'[app.js:restoreSession] Permission already granted, requesting FCM token',
				);
				currentToken = await getFcmToken();
			} else {
				console.log(
					'[app.js:restoreSession] Skipping permission prompt on load; waiting for user login click',
					{ permission: Notification.permission },
				);
			}
		} catch (e) {
			console.log('[app.js:restoreSession] Failed to restore token', e);
			console.warn('[FCM] Restore token failed:', e);
		}

		console.log(
			'[app.js:restoreSession] Initializing inbox from saved session',
			{
				savedUsername,
				savedTopic,
			},
		);
		await initInbox(savedUsername, savedTopic);
	}
});

async function handleLogin() {
	console.log('[app.js:handleLogin] Login flow started');
	const inputEl = document.getElementById('username-input');
	const btn = document.getElementById('login-btn');

	const rawUsername = inputEl.value.trim();
	if (!rawUsername) {
		setLoginStatus('Enter username', 'error');
		return;
	}

	btn.disabled = true;
	setLoginStatus('Requesting permission...');

	console.log('[app.js:handleLogin] Requesting notification permission');
	const permission = await Notification.requestPermission();

	console.log('Permission result:', permission);
	if (permission !== 'granted') {
		setLoginStatus('Permission denied', 'error');
		btn.disabled = false;
		return;
	}

	try {
		console.log(
			'[app.js:handleLogin] Permission granted, requesting FCM token',
		);
		currentToken = await getFcmToken();
		if (!currentToken) {
			throw new Error('No FCM token retrieved');
		}
		console.log('[FCM] Token:', currentToken);

		if (!currentToken) throw new Error('No FCM token');

		const topic = normalizeUsername(rawUsername);

		console.log('[app.js:handleLogin] Calling /subscribe', { topic });
		await fetch('notifybox-production-dd28.up.railway.app/subscribe', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ token: currentToken, topic }),
		});

		console.log('[app.js:handleLogin] Writing user record in Realtime DB');
		await db.ref('users/' + rawUsername.toLowerCase()).set({
			username: rawUsername,
			token: currentToken,
			createdAt: Date.now(),
		});

		localStorage.setItem('fcm_username', rawUsername);
		localStorage.setItem('fcm_topic', topic);
		localStorage.setItem('fcm_token', currentToken);

		setLoginStatus('Success!', 'success');

		await new Promise((r) => setTimeout(r, 500));
		console.log('[app.js:handleLogin] Initializing inbox after login', {
			topic,
		});
		await initInbox(rawUsername, topic);
	} catch (err) {
		console.log('[app.js:handleLogin] Login flow failed', err);
		console.error(err);
		setLoginStatus(err.message, 'error');
		btn.disabled = false;
	}
}

async function initInbox(username, topic) {
	currentTopic = topic;

	document.getElementById('display-username').textContent = username;
	document.getElementById('topic-badge').textContent = topic;

	showScreen('inbox');

	listenToNotifications(currentTopic);
}

function storeNotification(topic, title, body) {
	const newRef = db.ref(`notifications/${topic}`).push();
	newRef.set({
		title,
		body,
		receivedAt: Date.now(),
	});
}

messaging.onMessage((payload) => {
	console.log('[app.js:foregroundMessage] Received message', payload);

	const title =
		payload.data?.title || payload.notification?.title || 'No title';

	const body = payload.data?.body || payload.notification?.body || '';

	if (title) {
		console.log('[app.js] Notification stored from 2 message');
		storeNotification(currentTopic, title, body);
	}
});

function listenToNotifications(topic) {
	if (dbListenerRef) {
		dbListenerRef.off();
		dbListenerRef = null;
	}

	dbListenerRef = db.ref(`notifications/${topic}`);
	dbListenerRef.on('value', (snapshot) => {
		renderInbox(snapshot.val());
	});
}

function renderInbox(data) {
	const listEl = document.getElementById('notifications-list');
	const countEl = document.getElementById('inbox-count');

	if (!data) {
		countEl.textContent = '0 notifications';
		listEl.innerHTML = `<p>No notifications yet</p>`;
		return;
	}

	const items = Object.values(data).sort(
		(a, b) =>
			getNotificationTimestampSeconds(b) -
			getNotificationTimestampSeconds(a),
	);

	countEl.textContent = `${items.length} notifications`;

	listEl.innerHTML = items
		.map(
			(n, i) => `
				<div class="notif-card ${i === 0 ? 'newest' : ''}">
					<div class="notif-row">
						<span class="notif-title">${escapeHtml(n.title || 'No title')}</span>
						<span class="notif-time">${formatTimestamp(getNotificationTimestampSeconds(n))}</span>
					</div>
					<div class="notif-body">${escapeHtml(n.body || '')}</div>
				</div>`,
		)
		.join('');
}

async function handleLogout() {
	const token = localStorage.getItem('fcm_token');
	const topic = localStorage.getItem('fcm_topic');

	if (dbListenerRef) {
		dbListenerRef.off();
		dbListenerRef = null;
	}

	if (token && topic) {
		console.log('[app.js:handleLogout] Calling /unsubscribe', { topic });
		await fetch('notifybox-production-dd28.up.railway.app/unsubscribe', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ token, topic }),
		});
	}

	localStorage.clear();

	currentToken = null;
	currentTopic = null;

	document.getElementById('username-input').value = '';
	document.getElementById('login-btn').disabled = false;
	document.getElementById('login-status').textContent = '';

	showScreen('login');
}
