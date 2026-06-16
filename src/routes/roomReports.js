const express = require('express');
const { db } = require('../config/firebase');

const router = express.Router();

function requireAdminOrStaff(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (!['admin', 'staff'].includes(req.session.user.role)) {
    return res.redirect('/dashboard');
  }
  next();
}

router.get('/', requireAdminOrStaff, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const startDate = req.query.startDate || today;
  const endDate = req.query.endDate || today;
  const roomId = req.query.roomId || '';

  const roomsSnap = await db.collection('rooms')
    .where('status', '==', 'active')
    .get();

  const rooms = roomsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const bookingsSnap = await db.collection('bookings').get();

  let bookings = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  bookings = bookings.filter(b => {
    if (!b.bookingDate) return false;
    if (b.bookingDate < startDate || b.bookingDate > endDate) return false;
    if (roomId && b.roomId !== roomId) return false;
    return true;
  });

  const usageLogsSnap = await db.collection('room_usage_logs').get();

  let usageLogs = usageLogsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  usageLogs = usageLogs.filter(l => {
    const d = l.usageDate || l.bookingDate || '';
    if (!d) return false;
    if (d < startDate || d > endDate) return false;
    if (roomId && l.roomId !== roomId) return false;
    return true;
  });

  const summary = {
    totalBookings: bookings.length,
    approvedBookings: bookings.filter(b => b.status === 'approved').length,
    pendingBookings: bookings.filter(b => b.status === 'pending').length,
    rejectedBookings: bookings.filter(b => b.status === 'rejected').length,
    cancelledBookings: bookings.filter(b => b.status === 'cancelled').length,
    checkedIn: bookings.filter(b => b.usageStatus === 'checked_in').length,
    usageLogs: usageLogs.length
  };

  const byRoomMap = {};

  bookings.forEach(b => {
    const key = b.roomId || 'unknown';

    if (!byRoomMap[key]) {
      byRoomMap[key] = {
        roomId: b.roomId || '',
        roomName: b.roomName || 'ไม่ระบุ',
        total: 0,
        approved: 0,
        pending: 0,
        checkedIn: 0
      };
    }

    byRoomMap[key].total++;

    if (b.status === 'approved') byRoomMap[key].approved++;
    if (b.status === 'pending') byRoomMap[key].pending++;
    if (b.usageStatus === 'checked_in') byRoomMap[key].checkedIn++;
  });

  const byRoom = Object.values(byRoomMap).sort((a, b) =>
    (b.total || 0) - (a.total || 0)
  );

  res.render('pages/roomReports/index', {
    title: 'รายงานการใช้ห้อง',
    user: req.session.user,
    rooms,
    bookings,
    usageLogs,
    summary,
    byRoom,
    filters: {
      startDate,
      endDate,
      roomId
    }
  });
});

module.exports = router;