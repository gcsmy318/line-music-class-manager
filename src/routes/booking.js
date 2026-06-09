const express = require('express');
const { db } = require('../config/firebase');
const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

router.get('/', requireLogin, async (req, res) => {
  const roomsSnap = await db.collection('rooms').get();
  const rooms = roomsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const bookingSnap = await db.collection('bookings')
    .where('studentId', '==', req.session.user.id)
    .get();

  const bookings = bookingSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  res.render('pages/booking/index', {
    title: 'จองห้อง',
    user: req.session.user,
    rooms,
    bookings
  });
});

router.post('/', requireLogin, async (req, res) => {
  const { roomId, bookingDate, startTime, endTime, note } = req.body;

  if (!roomId || !bookingDate || !startTime || !endTime) {
    req.flash('error', 'กรุณากรอกข้อมูลให้ครบ');
    return res.redirect('/booking');
  }

  const roomDoc = await db.collection('rooms').doc(roomId).get();
  const room = roomDoc.exists ? roomDoc.data() : {};

  await db.collection('bookings').add({
    studentId: req.session.user.id,
    studentName: req.session.user.name || '',
    roomId,
    roomName: room.roomName || room.name || '',
    bookingDate,
    startTime,
    endTime,
    note: note || '',
    status: 'pending',
    createdAt: new Date().toISOString()
  });

  req.flash('success', 'ส่งคำขอจองห้องแล้ว รอเจ้าหน้าที่อนุมัติ');
  res.redirect('/booking');
});

router.post('/:id/cancel', requireLogin, async (req, res) => {
  await db.collection('bookings').doc(req.params.id).set({
    status: 'cancelled',
    cancelledAt: new Date().toISOString()
  }, { merge: true });

  req.flash('success', 'ยกเลิกการจองแล้ว');
  res.redirect('/booking');
});

module.exports = router;