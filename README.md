# FCM Notification Inbox (Notify)

A small local demo for Firebase Cloud Messaging (FCM) that lets users log in, subscribe to a topic, view an inbox, and see a global notification history.

## Features

- Topic-based login and subscription
- Real-time inbox powered by Firebase Realtime Database
- History page showing all notifications across topics
- Background message handling via a service worker

## Prerequisites

- Node.js 18+ (or any recent LTS)
- A Firebase project with Realtime Database and FCM enabled
- A Firebase service account key JSON file

## Setup

1. Add your service account key at `serviceAccountKey.json`.
2. Update `config.js` with your Firebase web config and Web Push VAPID key.

## Install

npm install

## Run

npm start

Open the app in your browser:

- http://localhost:3000/index.html
- http://localhost:3000/history.html

## Send a test notification

You can send a notification to a topic from the local server:

curl -X POST http://localhost:3000/send \
 -H "Content-Type: application/json" \
 -d "{\"topic\":\"user_ashraf\",\"title\":\"Hello\",\"body\":\"Test message\"}"

## Notes

- The server exposes `/subscribe`, `/unsubscribe`, and `/send` endpoints.
- Firebase Hosting config lives in `firebase.json` and already ignores the service account key.
