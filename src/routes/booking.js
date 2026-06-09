const express = require('express');
const { db } = require('../config/firebase');
const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

const timeSlots = [
  '08:00','09:00','10:00','11:00','12:00',
  '13:00','14:00','15:00','16:00','17:00','18:00'
];

function addOneHour(time) {
  const [h] = time.split(':').map(Number);
  return `${String(h + 1).padStart(2, '0')}:00`;
}

router.get('/', requireLogin, async (req, res) => {
  const selectedDate = req.query.date || new Date().toISOString().slice(0, 10);

  const roomsSnap = await db.collection('rooms')
    .where('status', '==', 'active')
    .get();

  const rooms = roomsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const bookingSnap = await db.collection('bookings')
    .where('bookingDate', '==', selectedDate)
    .where('status', 'in', ['pending', 'approved'])
    .get();

  const bookings = bookingSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const mySnap = await db.collection('bookings')
    .where('studentId', '==', req.session.user.id)
    .get();

  const myBookings = mySnap.docs.map(d => ({ id: d.id, ...d.data() }));

  res.render('pages/booking/index', {
    title: 'จองห้อง',
    user: req.session.user,
    rooms,
    bookings,
    myBookings,
    timeSlots,
    selectedDate
  });
});

router.post('/', requireLogin, async (req, res) => {
  const { roomId, bookingDate, startTime, note } = req.body;
  const endTime = addOneHour(startTime);

  if (!roomId || !bookingDate || !startTime) {
    req.flash('error', 'กรุณาเลือกวัน ห้อง และเวลา');
    return res.redirect('/booking');
  }

  if (!timeSlots.includes(startTime)) {
    req.flash('error', 'จองได้เฉพาะช่วงเวลา 08:00 - 19:00 และครั้งละ 1 ชั่วโมง');
    return res.redirect(`/booking?date=${bookingDate}`);
  }

  const duplicateSnap = await db.collection('bookings')
    .where('roomId', '==', roomId)
    .where('bookingDate', '==', bookingDate)
    .where('startTime', '==', startTime)
    .where('status', 'in', ['pending', 'approved'])
    .get();

  if (!duplicateSnap.empty) {
    req.flash('error', 'ช่วงเวลานี้มีคนจองแล้ว กรุณาเลือกเวลาอื่น');
    return res.redirect(`/booking?date=${bookingDate}`);
  }

  const roomDoc = await db.collection('rooms').doc(roomId).get();
  const room = roomDoc.exists ? roomDoc.data() : {};

  await db.collection('bookings').add({
    studentId: req.session.user.id,
    studentName: req.session.user.name || '',
    roomId,
    roomName: room.roomName || '',
    roomType: room.roomType || '',
    bookingDate,
    startTime,
    endTime,
    note: note || '',
    status: 'pending',
    createdAt: new Date().toISOString()
  });

  req.flash('success', 'ส่งคำขอจองแล้ว รอเจ้าหน้าที่อนุมัติ');
  res.redirect(`/booking?date=${bookingDate}`);
});

router.post('/:id/cancel', requireLogin, async (req, res) => {
  await db.collection('bookings').doc(req.params.id).set({
    status: 'cancelled',
    cancelledAt: new Date().toISOString()
  }, { merge: true });

  req.flash('success', 'ยกเลิกการจองแล้ว');
  res.redirect('/booking');
});

router.post('/:id/approve', requireLogin, async (req, res) => {
  if (!['admin', 'staff'].includes(req.session.user.role)) return res.redirect('/dashboard');

  await db.collection('bookings').doc(req.params.id).set({
    status: 'approved',
    approvedBy: req.session.user.id,
    approvedAt: new Date().toISOString()
  }, { merge: true });

  req.flash('success', 'อนุมัติการจองแล้ว');
  res.redirect('/admin/bookings');
});

router.post('/:id/reject', requireLogin, async (req, res) => {
  if (!['admin', 'staff'].includes(req.session.user.role)) return res.redirect('/dashboard');

  await db.collection('bookings').doc(req.params.id).set({
    status: 'rejected',
    rejectedBy: req.session.user.id,
    rejectedAt: new Date().toISOString()
  }, { merge: true });

  req.flash('success', 'ไม่อนุมัติการจองแล้ว');
  res.redirect('/admin/bookings');
});

module.exports = router;