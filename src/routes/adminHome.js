const express = require('express');
const router = express.Router();

function requireLogin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (!['admin', 'staff', 'teacher'].includes(req.session.user.role)) {
    return res.redirect('/dashboard');
  }
  next();
}

router.get('/', requireLogin, (req, res) => {
  const menus = [
    { title: 'ผู้ใช้งาน', desc: 'จัดการบัญชีผู้ใช้และสิทธิ์', icon: '👤', url: '/admin/crud/users' },
    { title: 'นิสิต', desc: 'จัดการข้อมูลนิสิต', icon: '👨‍🎓', url: '/admin/crud/students' },
    { title: 'อาจารย์', desc: 'จัดการข้อมูลอาจารย์', icon: '👨‍🏫', url: '/admin/crud/teachers' },
    { title: 'เจ้าหน้าที่', desc: 'จัดการข้อมูลเจ้าหน้าที่', icon: '🧑‍💼', url: '/admin/crud/staff' },
    { title: 'ภาคการศึกษา', desc: 'จัดการเทอมและสถานะใช้งาน', icon: '📅', url: '/admin/crud/semesters' },
    { title: 'รายวิชา', desc: 'จัดการรายวิชาและผู้สอน', icon: '📚', url: '/admin/crud/courses' },
    { title: 'ลงทะเบียนรายวิชา', desc: 'ผูกนิสิตเข้ากับรายวิชา', icon: '📝', url: '/admin/crud/enrollments' },
    { title: 'ห้องและทรัพยากร', desc: 'จัดการห้องซ้อม ห้องคอม ห้องสมุด', icon: '🎹', url: '/admin/crud/rooms' },
    { title: 'การจองห้อง', desc: 'อนุมัติ/ไม่อนุมัติการจอง', icon: '📋', url: '/admin/bookings' },
    { title: 'การเข้าเรียน', desc: 'ดูข้อมูลเช็คชื่อ', icon: '✅', url: '/admin/crud/attendance' },
    { title: 'การลาเรียน', desc: 'ดูข้อมูลการลา', icon: '🏥', url: '/admin/crud/leave_requests' },
    { title: 'งานที่ส่ง', desc: 'ดูงานและคลิปที่นิสิตส่ง', icon: '🎬', url: '/admin/crud/submissions' },
    { title: 'QR เช็คชื่อ', desc: 'ดูรอบ QR Code ที่สร้าง', icon: '🔳', url: '/admin/crud/qr_sessions' },
    { title: 'ประวัติใช้ห้อง', desc: 'บันทึกสแกนเข้าใช้ห้อง', icon: '🏫', url: '/admin/crud/room_usage_logs' },
    { title: 'รายงาน', desc: 'Export Excel / CSV', icon: '📊', url: '/reports' }
  ];

  res.render('pages/admin/home', {
    title: 'จัดการข้อมูลระบบ',
    user: req.session.user,
    menus
  });
});

module.exports = router;