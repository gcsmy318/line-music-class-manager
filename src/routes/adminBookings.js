const express = require('express');
const { db } = require('../config/firebase');
const router = express.Router();

function requireAdminOrStaff(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (!['admin', 'staff'].includes(req.session.user.role)) return res.redirect('/dashboard');
  next();
}

router.get('/', requireAdminOrStaff, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const date = req.query.date || today;
  const status = req.query.status || '';
  const mode = req.query.mode || '';
  const overdue = req.query.overdue || '';

  let query = db.collection('bookings');


   if (mode === 'overdue') {
     query = query.where('status', '==', 'pending');
   } else if (mode === 'all-pending' || status === 'pending') {
    query = query.where('status', '==', 'pending');
  } else {
    query = query.where('bookingDate', '==', date);

    if (status) {
      query = query.where('status', '==', status);
    }
  }

  const snap = await query.get();

  let bookings = snap.docs.map(d => ({ id: d.id, ...d.data() }));


   if (mode === 'overdue') {
     bookings = bookings.filter(
       b => b.bookingDate && b.bookingDate <= today
     );
   }
    
  bookings = bookings.sort((a, b) => {
    if ((a.bookingDate || '') !== (b.bookingDate || '')) {
      return (a.bookingDate || '').localeCompare(b.bookingDate || '');
    }

    if ((a.startTime || '') !== (b.startTime || '')) {
      return (a.startTime || '').localeCompare(b.startTime || '');
    }

    return (a.roomName || '').localeCompare(b.roomName || '', 'th');
  });

  const summarySnap = await db.collection('bookings').get();
  const allBookings = summarySnap.docs.map(d => d.data());

  const allPendingCount = allBookings.filter(
    b => b.status === 'pending'
  ).length;

  const overduePendingCount = allBookings.filter(
    b => b.status === 'pending' && b.bookingDate <= today
  ).length;

  const summary = {
    total: bookings.length,
    pending: bookings.filter(b => b.status === 'pending').length,
    approved: bookings.filter(b => b.status === 'approved').length,
    rejected: bookings.filter(b => b.status === 'rejected').length,
    cancelled: bookings.filter(b => b.status === 'cancelled').length,

    allPending: allPendingCount,
    overduePending: overduePendingCount
  };



  res.render('pages/admin/bookings', {
    title: 'จัดการการจองห้อง',
    user: req.session.user,
    bookings,
    date,
    status,
    mode,
    overdue,
    summary
  });
});

router.post('/:id/approve', requireAdminOrStaff, async (req, res) => {
  await db.collection('bookings').doc(req.params.id).set({
    status: 'approved',
    approvedBy: req.session.user.id,
    approvedByName: req.session.user.name || '',
    approvedAt: new Date().toISOString()
  }, { merge: true });

  req.flash('success', 'อนุมัติการจองแล้ว');
  res.redirect('/admin/bookings');
});

router.post('/:id/reject', requireAdminOrStaff, async (req, res) => {
  await db.collection('bookings').doc(req.params.id).set({
    status: 'rejected',
    rejectedBy: req.session.user.id,
    rejectedByName: req.session.user.name || '',
    rejectedAt: new Date().toISOString()
  }, { merge: true });

  req.flash('success', 'ไม่อนุมัติการจองแล้ว');
  res.redirect('/admin/bookings');
});

router.post('/:id/cancel', requireAdminOrStaff, async (req, res) => {
  await db.collection('bookings').doc(req.params.id).set({
    status: 'cancelled',
    cancelledBy: req.session.user.id,
    cancelledByName: req.session.user.name || '',
    cancelledAt: new Date().toISOString()
  }, { merge: true });

  req.flash('success', 'ยกเลิกการจองแล้ว');
  res.redirect('/admin/bookings');
});

module.exports = router;