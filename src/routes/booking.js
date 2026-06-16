const express = require('express');
const { db } = require('../config/firebase');

const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

const timeSlots = [
  '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'
];

function addOneHour(time) {
  const [h] = time.split(':').map(Number);
  return `${String(h + 1).padStart(2, '0')}:00`;
}

router.get('/', requireLogin, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const selectedDate = req.query.date || today;

  const roomsSnap = await db.collection('rooms')
    .where('status', '==', 'active')
    .get();

  let rooms = roomsSnap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));

  rooms = rooms
    .filter(room => !room.qrOnly)
    .sort((a, b) => {
      const order = {
        piano: 1,
        vocal: 2
      };

      const typeA = order[a.roomType] || 99;
      const typeB = order[b.roomType] || 99;

      if (typeA !== typeB) return typeA - typeB;

      return Number(a.roomNo || 999) - Number(b.roomNo || 999);
    });

  const bookingSnap = await db.collection('bookings')
    .where('bookingDate', '==', selectedDate)
    .where('status', 'in', ['pending', 'approved'])
    .get();

  const bookings = bookingSnap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));

  const studentId = req.session.user.studentId || req.session.user.id;

  const mySnap = await db.collection('bookings')
    .where('studentId', '==', studentId)
    .get();

  const myBookings = mySnap.docs
    .map(d => ({
      id: d.id,
      ...d.data()
    }))
    .sort((a, b) => {
      if ((b.bookingDate || '') !== (a.bookingDate || '')) {
        return (b.bookingDate || '').localeCompare(a.bookingDate || '');
      }

      return (b.startTime || '').localeCompare(a.startTime || '');
    });

  const pendingSnap = await db.collection('bookings')
    .where('status', '==', 'pending')
    .get();

  const pendingBookings = pendingSnap.docs
    .map(d => ({
      id: d.id,
      ...d.data()
    }))
    .sort((a, b) => {
      if ((a.bookingDate || '') !== (b.bookingDate || '')) {
        return (a.bookingDate || '').localeCompare(b.bookingDate || '');
      }

      return (a.startTime || '').localeCompare(b.startTime || '');
    });

  const pastPendingBookings = pendingBookings.filter(
    b => b.bookingDate && b.bookingDate < today
  );

  const todayPendingBookings = pendingBookings.filter(
    b => b.bookingDate === today
  );

  const futurePendingBookings = pendingBookings.filter(
    b => b.bookingDate && b.bookingDate > today
  );

  res.render('pages/booking/index', {
    title: 'จองห้อง',
    user: req.session.user,

    rooms,
    bookings,
    myBookings,

    pendingBookings,
    pastPendingBookings,
    todayPendingBookings,
    futurePendingBookings,

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
  const userId = req.session.user.id;
  const studentId = req.session.user.studentId || req.session.user.id;

  await db.collection('bookings').add({
    userId,
    studentId,
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
  const bookingRef = db.collection('bookings').doc(req.params.id);
  const bookingDoc = await bookingRef.get();

  if (!bookingDoc.exists) {
    req.flash('error', 'ไม่พบรายการจอง');
    return res.redirect('/booking');
  }

  const booking = bookingDoc.data();
  const userId = req.session.user.studentId || req.session.user.id;

  if (booking.studentId !== userId && booking.userId !== userId) {
    req.flash('error', 'คุณไม่มีสิทธิ์จัดการรายการนี้');
    return res.redirect('/booking');
  }

  if (booking.status === 'pending') {
    await bookingRef.delete();
    req.flash('success', 'ลบรายการจองเรียบร้อยแล้ว');
    return res.redirect('/booking');
  }

  await bookingRef.set({
    status: 'cancelled',
    cancelledAt: new Date().toISOString(),
    cancelledBy: userId
  }, { merge: true });

  req.flash('success', 'ยกเลิกการจองแล้ว');
  res.redirect('/booking');
});

router.post('/:id/approve', requireLogin, async (req, res) => {
  if (!['admin', 'staff'].includes(req.session.user.role)) {
    return res.redirect('/dashboard');
  }

  await db.collection('bookings').doc(req.params.id).set({
    status: 'approved',
    approvedBy: req.session.user.id,
    approvedByName: req.session.user.name || '',
    approvedAt: new Date().toISOString()
  }, { merge: true });

  req.flash('success', 'อนุมัติการจองแล้ว');
  res.redirect('/admin/bookings');
});

router.post('/:id/reject', requireLogin, async (req, res) => {
  if (!['admin', 'staff'].includes(req.session.user.role)) {
    return res.redirect('/dashboard');
  }

  await db.collection('bookings').doc(req.params.id).set({
    status: 'rejected',
    rejectedBy: req.session.user.id,
    rejectedByName: req.session.user.name || '',
    rejectedAt: new Date().toISOString()
  }, { merge: true });

  req.flash('success', 'ไม่อนุมัติการจองแล้ว');
  res.redirect('/admin/bookings');
});

module.exports = router;