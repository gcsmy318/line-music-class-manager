const line = require('@line/bot-sdk');
const crypto = require('crypto');

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || 'dummy'
});

/**
 * เก็บ raw body สำหรับตรวจสอบ LINE signature
 */
function verifySignature(req, res, buf) {
  req.rawBody = buf;
}

/**
 * ตรวจสอบว่า request มาจาก LINE จริงหรือไม่
 */
function isValidLineSignature(req) {
  const secret = process.env.LINE_CHANNEL_SECRET;

  if (!secret || !req.rawBody) {
    return false;
  }

  const signature = crypto
    .createHmac('sha256', secret)
    .update(req.rawBody)
    .digest('base64');

  const receivedSignature = req.headers['x-line-signature'];

  if (!receivedSignature) {
    return false;
  }

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(receivedSignature)
    );
  } catch (error) {
    return false;
  }
}

/**
 * แบ่งข้อความยาวเป็นหลายข้อความ
 * LINE จำกัดประมาณ 5,000 ตัวอักษรต่อข้อความ
 */
function splitText(text, maxLength = 4500) {
  const value = String(text || '');

  if (value.length <= maxLength) {
    return [value];
  }

  const lines = value.split('\n');
  const chunks = [];
  let currentChunk = '';

  for (const line of lines) {
    const nextValue = currentChunk
      ? `${currentChunk}\n${line}`
      : line;

    if (nextValue.length <= maxLength) {
      currentChunk = nextValue;
      continue;
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    if (line.length <= maxLength) {
      currentChunk = line;
      continue;
    }

    for (let index = 0; index < line.length; index += maxLength) {
      chunks.push(line.slice(index, index + maxLength));
    }

    currentChunk = '';
  }

  if (currentChunk) {
    chunks.push(currentChunk);
  }

  // LINE ส่งได้สูงสุด 5 messages ต่อ request
  return chunks.slice(0, 5);
}

/**
 * ตอบกลับข้อความ
 */
async function replyText(replyToken, text) {
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN || !replyToken) {
    console.log('[LINE reply skipped]', text);
    return null;
  }

  const messages = splitText(text).map((messageText) => ({
    type: 'text',
    text: messageText
  }));

  return client.replyMessage({
    replyToken,
    messages
  });
}

/**
 * ส่งข้อความไปหา User, Group หรือ Room
 *
 * destinationId สามารถเป็น:
 * - LINE userId
 * - LINE groupId
 * - LINE roomId
 */
async function pushText(destinationId, text) {
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN || !destinationId) {
    console.log('[LINE push skipped]', {
      destinationId,
      text
    });

    return null;
  }

  const messages = splitText(text).map((messageText) => ({
    type: 'text',
    text: messageText
  }));

  return client.pushMessage({
    to: destinationId,
    messages
  });
}

module.exports = {
  verifySignature,
  isValidLineSignature,
  replyText,
  pushText,
  splitText
};