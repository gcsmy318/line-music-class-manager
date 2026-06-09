const line = require('@line/bot-sdk');
const crypto = require('crypto');

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || 'dummy'
});

function verifySignature(req, res, buf) {
  req.rawBody = buf;
}

function isValidLineSignature(req) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret || !req.rawBody) return false;
  const signature = crypto.createHmac('sha256', secret).update(req.rawBody).digest('base64');
  return signature === req.headers['x-line-signature'];
}

async function replyText(replyToken, text) {
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) return;
  return client.replyMessage({ replyToken, messages: [{ type: 'text', text: String(text).slice(0, 4500) }] });
}

async function pushText(userId, text) {
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN || !userId) return;
  return client.pushMessage({ to: userId, messages: [{ type: 'text', text: String(text).slice(0, 4500) }] });
}

module.exports = { verifySignature, isValidLineSignature, replyText, pushText };
