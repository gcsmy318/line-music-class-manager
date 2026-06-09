const express = require('express');
const { db } = require('../config/firebase');
const router = express.Router();

router.get('/:roomId', async (req, res) => {
  const roomId = req.params.roomId;
  res.render('pages/roomUsage/scan', {
    title: 'บันทึกเข้าใช้ห้อง',
    roomId
  });
});

router.post('/:roomId', async (req, res) => {
  const { studentId } = req.body;
  const roomId = req.params.roomId;

  if (!studentId) {
    return res.send('กรุณากรอกรหัสนิสิต');
  }

  const roomDoc = await db.collection('rooms').doc(roomId).get();
  const room = roomDoc.exists ? roomDoc.data() : {};

  await db.collection('room_usage_logs').add({
    roomId,
    roomName: room.roomName || '',
    studentId,
    scanType: 'in',
    scanTime: new Date().toISOString(),
    createdAt: new Date().toISOString()
  });

  res.send('บันทึกการเข้าใช้ห้องเรียบร้อย');
});

module.exports = router;