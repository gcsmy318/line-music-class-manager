const express = require('express');
const ExcelJS = require('exceljs');
const { db } = require('../config/firebase');
const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}

const reportMenus = [
  {
    key: 'attendance',
    title: 'รายงานการเข้าเรียน',
    desc: 'ดูข้อมูลมาเรียน สาย ขาด ลา แยกตามรายวิชา',
    icon: '✅'
  },
  {
    key: 'submissions',
    title: 'รายงานการส่งงาน',
    desc: 'ดูงานที่ส่ง คะแนน และ Feedback',
    icon: '🎬'
  },
  {
    key: 'bookings',
    title: 'รายงานการจองห้อง',
    desc: 'ดูประวัติการจองห้องและสถานะอนุมัติ',
    icon: '📋'
  },
  {
    key: 'leave_requests',
    title: 'รายงานการลาเรียน',
    desc: 'ดูประวัติการลาเรียนของนิสิต',
    icon: '🏥'
  },
  {
    key: 'room_usage_logs',
    title: 'รายงานการใช้ห้อง',
    desc: 'ดูประวัติการสแกนเข้าใช้ห้อง',
    icon: '🏫'
  },
  {
    key: 'students',
    title: 'รายงานรายชื่อนิสิต',
    desc: 'Export รายชื่อนิสิตทั้งหมด',
    icon: '👨‍🎓'
  }
];

router.get('/', requireLogin, async (req, res) => {
  res.render('pages/reports/index', {
    title: 'รายงาน',
    user: req.session.user,
    reportMenus
  });
});

router.get('/:collection', requireLogin, async (req, res) => {
  const collection = req.params.collection;
  const date = req.query.date || '';
  const status = req.query.status || '';

  let query = db.collection(collection);

  if (collection === 'bookings' && date) {
    query = query.where('bookingDate', '==', date);
  }

  if (collection === 'bookings' && status) {
    query = query.where('status', '==', status);
  }

  const snap = await query.limit(300).get();
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const fields = rows.length
    ? Object.keys(rows[0]).filter(k => typeof rows[0][k] !== 'object')
    : [];

  res.render('pages/reports/detail', {
    title: 'รายงาน',
    user: req.session.user,
    collection,
    rows,
    fields,
    date,
    status
  });
});

router.get('/:collection/export/excel', requireLogin, async (req, res) => {
  const collection = req.params.collection;

  const snap = await db.collection(collection).limit(1000).get();
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(collection);

  const fields = rows.length
    ? Object.keys(rows[0]).filter(k => typeof rows[0][k] !== 'object')
    : ['id'];

  sheet.columns = fields.map(f => ({
    header: f,
    key: f,
    width: 25
  }));

  rows.forEach(row => sheet.addRow(row));

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${collection}.xlsx"`
  );

  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;