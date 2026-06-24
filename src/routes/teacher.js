const express = require('express');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const { db } = require('../config/firebase');
const router = express.Router();

function requireTeacher(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (!['teacher', 'admin'].includes(req.session.user.role)) return res.redirect('/dashboard');
  next();
}

router.get('/', requireTeacher, async (req, res) => {
  res.render('pages/teacher/index', {
    title: 'หน้าครู',
    user: req.session.user
  });
});

router.get('/qr', requireTeacher, async (req, res) => {
  const teacherId = req.session.user.id;

  const coursesSnap = req.session.user.role === 'admin'
    ? await db.collection('courses').where('status', '==', 'active').get()
    : await db.collection('courses').where('teacherId', '==', teacherId).where('status', '==', 'active').get();

  res.render('pages/teacher/qr', {
    title: 'สร้าง QR เช็คชื่อ',
    user: req.session.user,
    courses: coursesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    qrData: null
  });
});

router.post('/qr', requireTeacher, async (req, res) => {
  const { courseId, classLatitude, classLongitude } = req.body;

  const courseDoc = await db.collection('courses').doc(courseId).get();
  if (!courseDoc.exists) {
    req.flash('error', 'ไม่พบรายวิชา');
    return res.redirect('/teacher/qr');
  }

  const course = courseDoc.data();
  const token = uuidv4();
  const url = `${process.env.WEB_BASE_URL}/checkin/${token}`;
  const qrImage = await QRCode.toDataURL(url);

  await db.collection('qr_sessions').add({
    courseId,
    courseCode: course.courseCode || '',
    courseName: course.courseName || '',
    groupCode: course.groupCode || '',
    courseGroupCode: course.courseGroupCode || '',
    teacherId: course.teacherId || req.session.user.id,
    teacherName: course.teacherName || req.session.user.name || '',
    semesterId: course.semesterId || '',

    classLatitude: Number(classLatitude),
    classLongitude: Number(classLongitude),

    qrToken: token,
    startTime: new Date().toISOString(),
    expireTime: new Date(Date.now() + 30 * 60000).toISOString(),
    status: 'active',
    createdAt: new Date().toISOString()
  });

  const coursesSnap = await db.collection('courses').where('status', '==', 'active').get();

  res.render('pages/teacher/qr', {
    title: 'สร้าง QR เช็คชื่อ',
    user: req.session.user,
    courses: coursesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    qrData: {
      url,
      qrImage,
      course
    }
  });
});

router.get('/enrollments', requireTeacher, async (req, res) => {
  const teacherId = req.session.user.id;

  const snap = req.session.user.role === 'admin'
    ? await db.collection('enrollments').where('status', '==', 'pending').get()
    : await db.collection('enrollments').where('teacherId', '==', teacherId).where('status', '==', 'pending').get();

  res.render('pages/teacher/enrollments', {
    title: 'อนุมัติลงทะเบียนรายวิชา',
    user: req.session.user,
    enrollments: snap.docs.map(d => ({ id: d.id, ...d.data() }))
  });
});

router.post('/enrollments/:id/approve', requireTeacher, async (req, res) => {
  await db.collection('enrollments').doc(req.params.id).set({
    status: 'approved',
    approvedBy: req.session.user.id,
    approvedByName: req.session.user.name || '',
    approvedAt: new Date().toISOString()
  }, { merge: true });

  req.flash('success', 'อนุมัติรายวิชาแล้ว');
  res.redirect('/teacher/enrollments');
});

router.post('/enrollments/:id/reject', requireTeacher, async (req, res) => {
  await db.collection('enrollments').doc(req.params.id).set({
    status: 'rejected',
    rejectedBy: req.session.user.id,
    rejectedByName: req.session.user.name || '',
    rejectedAt: new Date().toISOString()
  }, { merge: true });

  req.flash('success', 'ไม่อนุมัติรายวิชาแล้ว');
  res.redirect('/teacher/enrollments');
});

router.get('/submissions', requireTeacher, async (req, res) => {
  const teacherId = req.session.user.id;

  const {
    semesterId = '',
    courseCode = '',
    groupCode = '',
    status = ''
  } = req.query;

  const semestersSnap = await db.collection('semesters').get();

  const coursesSnap = req.session.user.role === 'admin'
    ? await db.collection('courses').where('status', '==', 'active').get()
    : await db.collection('courses')
        .where('teacherId', '==', teacherId)
        .where('status', '==', 'active')
        .get();

  let query = db.collection('submissions');

  if (req.session.user.role !== 'admin') {
    query = query.where('teacherId', '==', teacherId);
  }

  if (semesterId) query = query.where('semesterId', '==', semesterId);
  if (courseCode) query = query.where('courseCode', '==', courseCode);
  if (groupCode) query = query.where('groupCode', '==', groupCode);
  if (status) query = query.where('status', '==', status);

  const submissionsSnap = await query.get();

  const semesters = semestersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const courses = coursesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const submissions = submissionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const courseCodes = [...new Set(courses.map(c => c.courseCode).filter(Boolean))];
  const groupCodes = [...new Set(
    courses
      .filter(c => !courseCode || c.courseCode === courseCode)
      .map(c => c.groupCode)
      .filter(Boolean)
  )];

res.render('pages/teacher/submissions', {
  title: 'ตรวจงาน',
  user: req.session.user,
  semesters: semesters || [],
  courses: courses || [],
  courseCodes: courseCodes || [],
  groupCodes: groupCodes || [],
  submissions: submissions || [],
  filters: {
    semesterId,
    courseCode,
    groupCode,
    status
  }
});
});

router.post('/submissions/:id/review', requireTeacher, async (req, res) => {
  const { score, feedback, suggestion, status } = req.body;

  await db.collection('submissions').doc(req.params.id).set({
    score: Number(score),
    feedback,
    suggestion,
    status,
    checkedBy: req.session.user.id,
    checkedByName: req.session.user.name || '',
    checkedAt: new Date().toISOString()
  }, { merge: true });

  req.flash('success', 'บันทึกผลการตรวจแล้ว');
  res.redirect('/teacher/submissions');
});

router.get('/leaves', requireTeacher, async (req, res) => {
  const teacherId = req.session.user.id;

  const {
    semesterId = '',
    courseCode = '',
    groupCode = '',
    leaveType = ''
  } = req.query;

  const semestersSnap = await db.collection('semesters').get();

  const coursesSnap = req.session.user.role === 'admin'
    ? await db.collection('courses').where('status', '==', 'active').get()
    : await db.collection('courses')
        .where('teacherId', '==', teacherId)
        .where('status', '==', 'active')
        .get();

  let query = db.collection('leave_requests');

  if (req.session.user.role !== 'admin') {
    query = query.where('teacherId', '==', req.session.user.teacherId || req.session.user.id);
  }

  if (semesterId) query = query.where('semesterId', '==', semesterId);
  if (courseCode) query = query.where('courseCode', '==', courseCode);
  if (groupCode) query = query.where('groupCode', '==', groupCode);
  if (leaveType) query = query.where('leaveType', '==', leaveType);

  const leavesSnap = await query.get();

  const courses = coursesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const courseCodes = [...new Set(courses.map(c => c.courseCode).filter(Boolean))];
  const groupCodes = [...new Set(
    courses
      .filter(c => !courseCode || c.courseCode === courseCode)
      .map(c => c.groupCode)
      .filter(Boolean)
  )];

  res.render('pages/teacher/leaves', {
    title: 'ตรวจสอบการลาเรียน',
    user: req.session.user,
    semesters: semestersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    courseCodes,
    groupCodes,
    leaves: leavesSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    filters: { semesterId, courseCode, groupCode, leaveType }
  });
});

router.get('/attendance', requireTeacher, async (req, res) => {
  const teacherId = req.session.user.teacherId || req.session.user.id;

  const {
    semesterId = '',
    courseCode = '',
    groupCode = '',
    status = ''
  } = req.query;

  const semestersSnap = await db.collection('semesters').get();

  const coursesSnap = req.session.user.role === 'admin'
    ? await db.collection('courses').where('status', '==', 'active').get()
    : await db.collection('courses')
        .where('teacherId', '==', teacherId)
        .where('status', '==', 'active')
        .get();

  let attendanceQuery = db.collection('attendance');
  let leaveQuery = db.collection('leave_requests');

  if (req.session.user.role !== 'admin') {
    attendanceQuery = attendanceQuery.where('teacherId', '==', teacherId);
    leaveQuery = leaveQuery.where('teacherId', '==', teacherId);
  }

  if (semesterId) {
    attendanceQuery = attendanceQuery.where('semesterId', '==', semesterId);
    leaveQuery = leaveQuery.where('semesterId', '==', semesterId);
  }

  if (courseCode) {
    attendanceQuery = attendanceQuery.where('courseCode', '==', courseCode);
    leaveQuery = leaveQuery.where('courseCode', '==', courseCode);
  }

  if (groupCode) {
    attendanceQuery = attendanceQuery.where('groupCode', '==', groupCode);
    leaveQuery = leaveQuery.where('groupCode', '==', groupCode);
  }

  const [attendanceSnap, leaveSnap] = await Promise.all([
    attendanceQuery.get(),
    leaveQuery.get()
  ]);

  let records = [];

  attendanceSnap.docs.forEach(doc => {
    const d = doc.data();
    const recordStatus = d.status || d.attendanceStatus || 'มาเรียน';

    if (status && recordStatus !== status) return;

    records.push({
      id: doc.id,
      type: 'attendance',
      date: d.checkDate || d.attendanceDate || '',
      studentId: d.studentId || '',
      studentName: d.studentName || '',
      courseCode: d.courseCode || '',
      courseName: d.courseName || '',
      groupCode: d.groupCode || '',
      status: recordStatus,
      note: d.note || d.locationStatus || ''
    });
  });

  leaveSnap.docs.forEach(doc => {
    const d = doc.data();
    const recordStatus = d.leaveType || 'ลาเรียน';

    if (status && recordStatus !== status) return;

    records.push({
      id: doc.id,
      type: 'leave',
      date: d.leaveDate || '',
      studentId: d.studentId || '',
      studentName: d.studentName || '',
      courseCode: d.courseCode || '',
      courseName: d.courseName || '',
      groupCode: d.groupCode || '',
      status: recordStatus,
      note: d.reason || ''
    });
  });

  records.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const courses = coursesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const courseCodes = [...new Set(
    courses.map(c => c.courseCode).filter(Boolean)
  )];

  const groupCodes = [...new Set(
    courses
      .filter(c => !courseCode || c.courseCode === courseCode)
      .map(c => c.groupCode)
      .filter(Boolean)
  )];

  const summary = {
    present: records.filter(r => r.type === 'attendance' && r.status === 'มาเรียน').length,
    late: records.filter(r => r.type === 'attendance' && r.status === 'มาสาย').length,
    absent: records.filter(r => r.type === 'attendance' && r.status === 'ขาดเรียน').length,
    leave: records.filter(r => r.type === 'leave').length,
    total: records.length
  };

  res.render('pages/teacher/attendance', {
    title: 'ตรวจสอบการเข้าเรียน',
    user: req.session.user,
    semesters: semestersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    courseCodes,
    groupCodes,
    records,
    summary,
    filters: { semesterId, courseCode, groupCode, status }
  });
});


router.get('/course-records', requireTeacher, async (req, res) => {
  const teacherId = req.session.user.teacherId || req.session.user.id;

  const {
    semesterId = '',
    courseGroupCode = ''
  } = req.query;

  const semestersSnap = await db.collection('semesters').get();

  const coursesSnap = req.session.user.role === 'admin'
    ? await db.collection('courses').where('status', '==', 'active').get()
    : await db.collection('courses')
        .where('teacherId', '==', teacherId)
        .where('status', '==', 'active')
        .get();

  const courses = coursesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  let attendanceQuery = db.collection('attendance');
  let leaveQuery = db.collection('leave_requests');

  if (req.session.user.role !== 'admin') {
    attendanceQuery = attendanceQuery.where('teacherId', '==', teacherId);
    leaveQuery = leaveQuery.where('teacherId', '==', teacherId);
  }

  if (semesterId) {
    attendanceQuery = attendanceQuery.where('semesterId', '==', semesterId);
    leaveQuery = leaveQuery.where('semesterId', '==', semesterId);
  }

  const [attendanceSnap, leaveSnap] = await Promise.all([
    attendanceQuery.get(),
    leaveQuery.get()
  ]);

  const studentMap = {};
  const dateSet = new Set();
  const cellMap = {};

  function ensureStudent(studentId, studentName) {
    if (!studentId) return;

    if (!studentMap[studentId]) {
      studentMap[studentId] = {
        studentId,
        studentName: studentName || studentId
      };
    }
  }

  function ensureCell(studentId, date) {
    const key = `${studentId}_${date}`;

    if (!cellMap[key]) {
      cellMap[key] = {
        attendance: '',
        leave: '',
        note: '',
        attachmentDataUrl: '',
        attachmentType: ''
      };
    }

    return cellMap[key];
  }

  attendanceSnap.docs.forEach(doc => {
    const d = doc.data();

    if (courseGroupCode && d.courseGroupCode !== courseGroupCode) return;

    const date = d.checkDate || d.attendanceDate || '';
    const studentId = d.studentId || '';
    const studentName = d.studentName || '';

    if (!date || !studentId) return;

    dateSet.add(date);
    ensureStudent(studentId, studentName);

    const cell = ensureCell(studentId, date);
    cell.attendance = d.attendanceStatus || d.status || 'มาเรียน';
    cell.note = d.note || d.locationStatus || '';
  });

  leaveSnap.docs.forEach(doc => {
    const d = doc.data();

    if (courseGroupCode && d.courseGroupCode !== courseGroupCode) return;

    const date = d.leaveDate || '';
    const studentId = d.studentId || '';
    const studentName = d.studentName || '';

    if (!date || !studentId) return;

    dateSet.add(date);
    ensureStudent(studentId, studentName);

    const cell = ensureCell(studentId, date);
    cell.leave = d.leaveType || 'ลาเรียน';
    cell.note = d.reason || cell.note || '';
    cell.attachmentDataUrl = d.attachmentDataUrl || '';
    cell.attachmentType = d.attachmentType || '';
  });

  const dates = Array.from(dateSet).sort();

  const students = Object.values(studentMap).sort((a, b) =>
    (a.studentName || '').localeCompare(b.studentName || '', 'th')
  );

  const tableRows = students.map(student => {
    const cells = dates.map(date => {
      const cell = cellMap[`${student.studentId}_${date}`] || {};

      let display = '-';

      if (cell.attendance && cell.leave) {
        display = `${cell.attendance} + ${cell.leave}`;
      } else if (cell.attendance) {
        display = cell.attendance;
      } else if (cell.leave) {
        display = cell.leave;
      }

      return {
        date,
        display,
        attendance: cell.attendance || '',
        leave: cell.leave || '',
        note: cell.note || '',
        attachmentDataUrl: cell.attachmentDataUrl || '',
        attachmentType: cell.attachmentType || ''
      };
    });

    return {
      ...student,
      cells
    };
  });

  res.render('pages/teacher/courseRecords', {
    title: 'ตารางสรุปรายวิชา',
    user: req.session.user,
    semesters: semestersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    courses,
    dates,
    tableRows,
    filters: {
      semesterId,
      courseGroupCode
    }
  });
});

router.get('/students-summary', requireTeacher, async (req, res) => {
  const teacherId = req.session.user.teacherId || req.session.user.id;

  const {
    semesterId = '',
    courseGroupCode = ''
  } = req.query;

  const semestersSnap = await db.collection('semesters').get();

  let coursesQuery = db.collection('courses').where('status', '==', 'active');

  if (req.session.user.role !== 'admin') {
    coursesQuery = coursesQuery.where('teacherId', '==', teacherId);
  }

  if (semesterId) {
    coursesQuery = coursesQuery.where('semesterId', '==', semesterId);
  }

  const coursesSnap = await coursesQuery.get();
  const courses = coursesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const allowedCourseGroups = courses.map(c => c.courseGroupCode).filter(Boolean);

  let enrollSnap;

  if (req.session.user.role === 'admin') {
    enrollSnap = await db.collection('enrollments')
      .where('status', '==', 'approved')
      .get();
  } else {
    enrollSnap = await db.collection('enrollments')
      .where('teacherId', '==', teacherId)
      .where('status', '==', 'approved')
      .get();
  }

  let enrollments = enrollSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (semesterId) {
    enrollments = enrollments.filter(e => e.semesterId === semesterId);
  }

  if (courseGroupCode) {
    enrollments = enrollments.filter(e => e.courseGroupCode === courseGroupCode);
  } else if (allowedCourseGroups.length > 0) {
    enrollments = enrollments.filter(e =>
      allowedCourseGroups.includes(e.courseGroupCode)
    );
  }

  const attendanceSnap = await db.collection('attendance').get();
  const leaveSnap = await db.collection('leave_requests').get();
  const submissionSnap = await db.collection('submissions').get();

  const attendance = attendanceSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const leaves = leaveSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const submissions = submissionSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const rows = enrollments.map(e => {
    const courseKey = e.courseGroupCode || `${e.courseCode}-${e.groupCode}`;
    const studentId = e.studentId;

    const myAttendance = attendance.filter(a =>
      a.studentId === studentId &&
      (a.courseGroupCode === courseKey || a.courseId === e.courseId)
    );

    const myLeaves = leaves.filter(l =>
      l.studentId === studentId &&
      (l.courseGroupCode === courseKey || l.courseId === e.courseId)
    );

    const mySubmissions = submissions.filter(s =>
      s.studentId === studentId &&
      (s.courseGroupCode === courseKey || s.courseId === e.courseId)
    );

    return {
      studentId,
      studentName: e.studentName || '',
      courseCode: e.courseCode || '',
      courseName: e.courseName || '',
      groupCode: e.groupCode || '',
      courseGroupCode: e.courseGroupCode || '',
      teacherName: e.teacherName || '',
      semesterId: e.semesterId || '',

      attendanceCount: myAttendance.length,
      presentCount: myAttendance.filter(a => (a.attendanceStatus || a.status) === 'มาเรียน').length,
      lateCount: myAttendance.filter(a => (a.attendanceStatus || a.status) === 'มาสาย').length,
      absentCount: myAttendance.filter(a => (a.attendanceStatus || a.status) === 'ขาดเรียน').length,
      leaveCount: myLeaves.length,
      submissionCount: mySubmissions.length,
      uncheckedSubmissionCount: mySubmissions.filter(s => s.status === 'ยังไม่ตรวจ').length,
      checkedSubmissionCount: mySubmissions.filter(s => s.status && s.status !== 'ยังไม่ตรวจ').length
    };
  });

  rows.sort((a, b) => {
    if ((a.courseCode || '') !== (b.courseCode || '')) {
      return (a.courseCode || '').localeCompare(b.courseCode || '');
    }
    if ((a.groupCode || '') !== (b.groupCode || '')) {
      return (a.groupCode || '').localeCompare(b.groupCode || '');
    }
    return (a.studentName || '').localeCompare(b.studentName || '', 'th');
  });

  const summary = {
    totalStudents: new Set(rows.map(r => r.studentId)).size,
    totalRows: rows.length,
    totalAttendance: rows.reduce((sum, r) => sum + r.attendanceCount, 0),
    totalLeaves: rows.reduce((sum, r) => sum + r.leaveCount, 0),
    totalSubmissions: rows.reduce((sum, r) => sum + r.submissionCount, 0),
    uncheckedSubmissions: rows.reduce((sum, r) => sum + r.uncheckedSubmissionCount, 0)
  };

  res.render('pages/teacher/studentsSummary', {
    title: 'สรุปข้อมูลนิสิต',
    user: req.session.user,
    semesters: semestersSnap.docs.map(d => ({ id: d.id, ...d.data() })),
    courses,
    rows,
    summary,
    filters: {
      semesterId,
      courseGroupCode
    }
  });
});



router.get('/student-profile', requireTeacher, async (req, res) => {
  const teacherId = req.session.user.teacherId || req.session.user.id;
  const selectedStudentId = req.query.studentId || '';

  let enrollSnap;

  if (req.session.user.role === 'admin') {
    enrollSnap = await db.collection('enrollments')
      .where('status', '==', 'approved')
      .get();
  } else {
    enrollSnap = await db.collection('enrollments')
      .where('teacherId', '==', teacherId)
      .where('status', '==', 'approved')
      .get();
  }

  const enrollments = enrollSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const studentMap = {};

  enrollments.forEach(e => {
    if (!e.studentId) return;

    studentMap[e.studentId] = {
      studentId: e.studentId,
      studentName: e.studentName || e.fullName || e.studentId
    };
  });

  const students = Object.values(studentMap).sort((a, b) =>
    (a.studentName || '').localeCompare(b.studentName || '', 'th')
  );

  let profile = null;
  let studentEnrollments = [];
  let attendance = [];
  let leaves = [];
  let submissions = [];
  let bookings = [];

  if (selectedStudentId) {
    const studentDoc = await db.collection('students').doc(selectedStudentId).get();
    const userDoc = await db.collection('users').doc(selectedStudentId).get();

    const studentData = studentDoc.exists ? studentDoc.data() : {};
    const userData = userDoc.exists ? userDoc.data() : {};

    studentEnrollments = enrollments.filter(e => e.studentId === selectedStudentId);

    const allowedCourseGroups = studentEnrollments
      .map(e => e.courseGroupCode)
      .filter(Boolean);

    const [
      attendanceSnap,
      leaveSnap,
      submissionSnap,
      bookingSnap
    ] = await Promise.all([
      db.collection('attendance').where('studentId', '==', selectedStudentId).get(),
      db.collection('leave_requests').where('studentId', '==', selectedStudentId).get(),
      db.collection('submissions').where('studentId', '==', selectedStudentId).get(),
      db.collection('bookings').where('studentId', '==', selectedStudentId).get()
    ]);

    attendance = attendanceSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    leaves = leaveSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    submissions = submissionSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    bookings = bookingSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (req.session.user.role !== 'admin') {
      attendance = attendance.filter(a => allowedCourseGroups.includes(a.courseGroupCode));
      leaves = leaves.filter(l => allowedCourseGroups.includes(l.courseGroupCode));
      submissions = submissions.filter(s => allowedCourseGroups.includes(s.courseGroupCode));
    }

    const records = [];

    attendance.forEach(a => {
      records.push({
        date: a.checkDate || a.attendanceDate || '',
        type: 'เข้าเรียน',
        courseCode: a.courseCode || '',
        courseName: a.courseName || '',
        groupCode: a.groupCode || '',
        status: a.attendanceStatus || a.status || 'มาเรียน',
        note: a.note || a.locationStatus || ''
      });
    });

    leaves.forEach(l => {
      records.push({
        date: l.leaveDate || '',
        type: 'ลาเรียน',
        courseCode: l.courseCode || '',
        courseName: l.courseName || '',
        groupCode: l.groupCode || '',
        status: l.leaveType || 'ลาเรียน',
        note: l.reason || '',
        attachmentDataUrl: l.attachmentDataUrl || ''
      });
    });

    submissions.forEach(s => {
      records.push({
        date: s.submitDate || '',
        type: 'ส่งงาน',
        courseCode: s.courseCode || '',
        courseName: s.courseName || '',
        groupCode: s.groupCode || '',
        status: s.status || 'ยังไม่ตรวจ',
        note: s.feedback || s.suggestion || s.note || '',
        youtubeUrl: s.youtubeUrl || '',
        score: s.score || ''
      });
    });

    records.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    profile = {
      ...userData,
      ...studentData,
      studentId: selectedStudentId,
      name: studentData.fullName || userData.name || userData.fullName || '',
      email: studentData.email || userData.email || '',
      phone: studentData.phone || userData.phone || '',
      records,
      summary: {
        courses: studentEnrollments.length,
        attendance: attendance.length,
        present: attendance.filter(a => (a.attendanceStatus || a.status) === 'มาเรียน').length,
        late: attendance.filter(a => (a.attendanceStatus || a.status) === 'มาสาย').length,
        absent: attendance.filter(a => (a.attendanceStatus || a.status) === 'ขาดเรียน').length,
        leaves: leaves.length,
        submissions: submissions.length,
        uncheckedSubmissions: submissions.filter(s => s.status === 'ยังไม่ตรวจ').length,
        bookings: bookings.length,
        checkedInBookings: bookings.filter(b => b.usageStatus === 'checked_in').length
      }
    };
  }

  res.render('pages/teacher/studentProfile', {
    title: 'สรุปความประพฤตินิสิต',
    user: req.session.user,
    students,
    selectedStudentId,
    profile,
    studentEnrollments
  });
});
module.exports = router;