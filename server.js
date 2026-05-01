const express = require('express');
const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
	credential: admin.credential.cert(serviceAccount),
	databaseURL: 'https://notifybox-c4f4c-default-rtdb.firebaseio.com',
});

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

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
		// Data-only — no `notification` field.
		// Including `notification` causes FCM to auto-display in background AND
		// call onBackgroundMessage, producing double notifications or suppression.
		await admin.messaging().send({
			topic,
			data: { title, body },
		});

		await admin.database().ref(`notifications/${topic}`).push({
			title,
			body,
			receivedAt: Date.now(),
		});

		console.log(`[send] Notification sent & stored for topic: ${topic}`);
		res.json({ success: true });
	} catch (err) {
		console.error('Send error:', err.message);
		res.status(500).json({ error: err.message });
	}
});

// process.env.PORT is injected by Railway — hardcoding 3000 breaks the binding
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
	console.log(`Server running at http://localhost:${PORT}`);
});