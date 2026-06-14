const express = require('express');
const { db } = require('../config/firebase');
const router = express.Router();

router.get('/:roomId', async (req, res) => {
  const roomId = req.params.roomId;
  const roomDoc = await db.collection('rooms').doc(roomId).get();
  const room = roomDoc.exists ? roomDoc.data() : {};

  res.render('pages/roomUsage/scan', {
    title: 'บันทึกเข้าใช้ห้อง',
    user: req.session.user || null,
    roomId,
    room
  });
});

router.post('/:roomId', async (req, res) => {
  const { studentId } = req.body;
  const roomId = req.params.roomId;

  if (!studentId) return res.send('กรุณากรอกรหัสนิสิต');

  const roomDoc = await db.collection('rooms').doc(roomId).get();
  const room = roomDoc.exists ? roomDoc.data() : {};

  const studentDoc = await db.collection('students').doc(studentId).get();
  const student = studentDoc.exists ? studentDoc.data() : {};

  await db.collection('room_usage_logs').add({
    roomId,
    roomName: room.roomName || roomId,
    roomType: room.roomType || '',
    studentId,
    studentName: student.fullName || '',
    scanType: 'in',
    scanTime: new Date().toISOString(),
    usageDate: new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString()
  });

  res.send('บันทึกการเข้าใช้ห้องเรียบร้อย');
});

module.exports = router;