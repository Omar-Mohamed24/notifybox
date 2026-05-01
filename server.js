require('dotenv').config();

process.on('uncaughtException', (err) => {
	console.error('[FATAL] uncaughtException:', err.message, err.stack);
	process.exit(1);
});
process.on('unhandledRejection', (reason) => {
	console.error('[FATAL] unhandledRejection:', reason);
	process.exit(1);
});

const express = require('express');
const admin = require('firebase-admin');
const path = require('path');

console.log('[startup] FIREBASE_SERVICE_ACCOUNT present:', !!process.env.FIREBASE_SERVICE_ACCOUNT);
console.log('[startup] FIREBASE_SERVICE_ACCOUNT length:', (process.env.FIREBASE_SERVICE_ACCOUNT || '').length);

let serviceAccount;
try {
	serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
	console.log('[startup] Service account parsed, project_id:', serviceAccount.project_id);
} catch (err) {
	console.error('[startup] Failed to parse FIREBASE_SERVICE_ACCOUNT:', err.message);
	process.exit(1);
}

admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
	databaseURL: 'https://notifybox-c4f4c-default-rtdb.firebaseio.com',
});
console.log('[startup] Firebase Admin initialized');

const app = express();
app.use((req, res, next) => {
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
	res.header('Access-Control-Allow-Headers', 'Content-Type');
	if (req.method === 'OPTIONS') return res.sendStatus(200);
	next();
});
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/health', (req, res) => res.json({ ok: true }));

app.post('/subscribe', async (req, res) => {
	console.log('[server.js:/subscribe] Request received');
	const { token, topic } = req.body;

	if (!token || !topic) {
		return res.status(400).json({ error: 'token and topic are required' });
	}

	try {
		console.log('[server.js:/subscribe] Subscribing token to topic', { topic });
		await admin.messaging().subscribeToTopic(token, topic);
		res.json({ success: true });
	} catch (err) {
		console.log('[server.js:/subscribe] subscribeToTopic failed', err);
		res.status(500).json({ error: err.message });
	}
});

app.post('/unsubscribe', async (req, res) => {
	console.log('[server.js:/unsubscribe] Request received');
	const { token, topic } = req.body;

	try {
		console.log('[server.js:/unsubscribe] Unsubscribing token from topic', { topic });
		await admin.messaging().unsubscribeFromTopic(token, topic);
		res.json({ success: true });
	} catch (err) {
		console.log('[server.js:/unsubscribe] unsubscribeFromTopic failed', err);
		res.json({ success: true });
	}
});

app.post('/send', async (req, res) => {
	const { topic, title, body } = req.body;
	try {
		await admin.messaging().send({
			topic,
			data: { title, body },
			webpush: { headers: { Urgency: 'high' } },
		});

		// await admin.database().ref(`notifications/${topic}`).push({
		// 	title,
		// 	body,
		// 	receivedAt: Date.now(),
		// });

		console.log(`[send] Notification sent & stored for topic: ${topic}`);
		res.json({ success: true });
	} catch (err) {
		console.error('Send error:', err.message);
		res.status(500).json({ error: err.message });
	}
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
	console.log(`[startup] Server listening on 0.0.0.0:${PORT}`);
});
