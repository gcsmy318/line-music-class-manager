const express = require('express');
const QRCode = require('qrcode');
const { db } = require('../config/firebase');
const router = express.Router();

function requireStaff(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (!['staff', 'admin'].includes(req.session.user.role)) return res.redirect('/dashboard');
  next();
}

router.get('/', requireStaff, async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  const snap = await db.collection('bookings')
    .where('bookingDate', '==', date)
    .where('status', '==', 'approved')
    .get();

  const bookings = [];

  for (const doc of snap.docs) {
    const b = { id: doc.id, ...doc.data() };
    const url = `${process.env.WEB_BASE_URL}/room-confirm/scan/${doc.id}`;
    b.confirmUrl = url;
    b.qrImage = await QRCode.toDataURL(url);
    bookings.push(b);
  }

  res.render('pages/roomConfirm/index', {
    title: 'QR ยืนยันใช้ห้องซ้อม',
    user: req.session.user,
    date,
    bookings
  });
});

router.get('/scan/:bookingId', async (req, res) => {
  const bookingDoc = await db.collection('bookings').doc(req.params.bookingId).get();

  if (!bookingDoc.exists) return res.send('ไม่พบรายการจอง');

  const booking = { id: bookingDoc.id, ...bookingDoc.data() };

  res.render('pages/roomConfirm/scan', {
    title: 'ยืนยันใช้ห้องซ้อม',
    user: req.session.user || null,
    booking
  });
});

router.post('/scan/:bookingId', async (req, res) => {
  const { studentId } = req.body;

  const bookingRef = db.collection('bookings').doc(req.params.bookingId);
  const bookingDoc = await bookingRef.get();

  if (!bookingDoc.exists) return res.send('ไม่พบรายการจอง');

  const booking = bookingDoc.data();

  if (booking.studentId !== studentId) {
    return res.send('รหัสนิสิตไม่ตรงกับผู้จอง');
  }

  await db.collection('room_usage_logs').add({
    bookingId: req.params.bookingId,
    roomId: booking.roomId || '',
    roomName: booking.roomName || '',
    studentId,
    studentName: booking.studentName || '',
    scanType: 'booking_confirm',
    usageDate: new Date().toISOString().slice(0, 10),
    scanTime: new Date().toISOString(),
    createdAt: new Date().toISOString()
  });

  await bookingRef.set({
    usageStatus: 'confirmed',
    usedAt: new Date().toISOString()
  }, { merge: true });

  res.send('ยืนยันการใช้ห้องซ้อมเรียบร้อยแล้ว');
});

module.exports = router;