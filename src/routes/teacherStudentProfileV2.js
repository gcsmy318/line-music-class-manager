'use strict';
const express=require('express');
const { db }=require('../config/firebase');
const { bangkokDate }=require('../services/roomCheckinService');
const router=express.Router();
const val=x=>String(x==null?'':x);
const group=d=>val(d.courseGroupCode || (d.courseCode&&d.groupCode ? `${d.courseCode}-${d.groupCode}` : ''));
const key=d=>`${val(d.semesterId)}|${group(d)}`;
const snapRows=s=>s.docs.map(d=>({id:d.id,...d.data()}));
function canAccess(req,res,next){
  if(!req.session.user)return res.redirect('/login');
  if(!['teacher','admin'].includes(req.session.user.role))return res.status(403).send('ไม่มีสิทธิ์');
  next();
}
function datePart(value){
  if(!value)return '';
  const str=val(value);
  if(/^\d{4}-\d{2}-\d{2}/.test(str))return str.slice(0,10);
  return bangkokDate(str);
}
function latestDate(d){return datePart(d.checkDate||d.attendanceDate||d.leaveDate||d.submitDate||d.createdAt||'');}
function approvedAt(enrollment){return datePart(enrollment.approvedAt||enrollment.requestedAt||enrollment.createdAt||'');}
function sorted(rows,sort){
  const ret=[...rows];
  ret.sort((a,b)=>{
    if(sort==='date_asc')return a.date.localeCompare(b.date)||a.type.localeCompare(b.type);
    if(sort==='score_desc')return Number(b.score||0)-Number(a.score||0)||b.date.localeCompare(a.date);
    if(sort==='score_asc')return Number(a.score||0)-Number(b.score||0)||b.date.localeCompare(a.date);
    if(sort==='status')return a.status.localeCompare(b.status,'th')||b.date.localeCompare(a.date);
    if(sort==='course')return a.courseLabel.localeCompare(b.courseLabel,'th')||b.date.localeCompare(a.date);
    if(sort==='type')return a.type.localeCompare(b.type,'th')||b.date.localeCompare(a.date);
    return b.date.localeCompare(a.date)||a.type.localeCompare(b.type);
  });
  return ret;
}
router.get('/student-profile',canAccess,async(req,res)=>{
  try {
    const teacherIds=new Set([req.session.user.id,req.session.user.teacherId].filter(Boolean).map(String));
    const [enrollSnap,semSnap]=await Promise.all([
      db.collection('enrollments').where('status','==','approved').get(),
      db.collection('semesters').get()
    ]);
    const enrollments=snapRows(enrollSnap).filter(e=>
      req.session.user.role==='admin'||teacherIds.has(val(e.teacherId)));
    const semesters=snapRows(semSnap).sort((a,b)=>val(b.semesterId).localeCompare(val(a.semesterId)));
    const activeSemester=semesters.find(s=>s.isActive===true)?.semesterId || '';
    const requestedSemester=val(req.query.semesterId||'');
    const semesterId=requestedSemester || activeSemester || 'all';
    const chosenSemester=semesterId==='all'?null:semesters.find(s=>s.semesterId===semesterId);
    const selectedStudentId=val(req.query.studentId).trim();
    const studentMap=new Map();
    enrollments.forEach(e=>{
      const id=val(e.studentId);
      if(id&&!studentMap.has(id))studentMap.set(id,{studentId:id,studentName:e.studentName||e.fullName||id});
    });
    const students=[...studentMap.values()].sort((a,b)=>a.studentName.localeCompare(b.studentName,'th'));
    const base={title:'พฤติกรรมการเรียนรายบุคคล',user:req.session.user,students,semesters,
      selectedStudentId,semesterId,courseKey:val(req.query.courseKey),
      filters:{startDate:val(req.query.startDate),endDate:val(req.query.endDate),
        type:val(req.query.type),sort:val(req.query.sort||'date_desc')},
      profile:null,studentEnrollments:[],courseOptions:[],perCourseStats:[],records:[]};
    if(!selectedStudentId)return res.render('pages/teacher/studentProfileV2',base);
    if(!studentMap.has(selectedStudentId))return res.status(403).send('นิสิตไม่ได้อยู่ในรายวิชาที่คุณดูแล');
    const allStudentCourses=enrollments.filter(e=>val(e.studentId)===selectedStudentId);
    const semesterCourses=allStudentCourses.filter(e=>semesterId==='all'||val(e.semesterId)===semesterId);
    const allowed=new Set(allStudentCourses.map(key));
    const courseOptions=[...new Map(semesterCourses.map(e=>[key(e),{
      key:key(e), courseCode:e.courseCode||'', courseName:e.courseName||'',groupCode:e.groupCode||'',semesterId:e.semesterId||''
    }])).values()].sort((a,b)=>a.key.localeCompare(b.key));
    const courseKey=courseOptions.some(c=>c.key===base.courseKey)?base.courseKey:'';
    const eligibleCourse=(d)=>{
      if(!allowed.has(key(d)))return false;
      if(semesterId!=='all' && val(d.semesterId)!==semesterId)return false;
      if(courseKey && key(d)!==courseKey)return false;
      return true;
    };
    const [studentDoc,userDoc,aSnap,lSnap,sSnap,b1,b2,b3,sessionSnap]=await Promise.all([
      db.collection('students').doc(selectedStudentId).get(),
      db.collection('users').doc(selectedStudentId).get(),
      db.collection('attendance').where('studentId','==',selectedStudentId).get(),
      db.collection('leave_requests').where('studentId','==',selectedStudentId).get(),
      db.collection('submissions').where('studentId','==',selectedStudentId).get(),
      db.collection('bookings').where('studentId','==',selectedStudentId).get(),
      db.collection('bookings').where('bookerId','==',selectedStudentId).get(),
      db.collection('bookings').where('userId','==',selectedStudentId).get(),
      semesterId==='all' ? db.collection('qr_sessions').get()
        :db.collection('qr_sessions').where('semesterId','==',semesterId).get()
    ]);
    const studentData=studentDoc.exists?studentDoc.data():{};
    const userData=userDoc.exists?userDoc.data():{};
    const filterDate=d=>(!base.filters.startDate||d>=base.filters.startDate)&&
      (!base.filters.endDate||d<=base.filters.endDate);
    const visible=(rows,fnDate=latestDate)=>rows.filter(d=>eligibleCourse(d)&&filterDate(fnDate(d)));
    const attendance=visible(snapRows(aSnap));
    const leaves=visible(snapRows(lSnap),d=>datePart(d.leaveDate));
    const submissions=visible(snapRows(sSnap),d=>datePart(d.submitDate||d.createdAt));
    const bookingsAll=[...new Map([...snapRows(b1),...snapRows(b2),...snapRows(b3)].map(b=>[b.id,b])).values()]
      .filter(b=>val(b.studentId)===selectedStudentId || val(b.bookerId)===selectedStudentId || val(b.userId)===selectedStudentId);
    // Room bookings have no semesterId/courseId; infer ONLY a term's date range.
    const bookingDateOk=b=>{
      const d=val(b.bookingDate);
      if(!filterDate(d))return false;
      if(chosenSemester){
        if(chosenSemester.startDate && d<val(chosenSemester.startDate))return false;
        if(chosenSemester.endDate && d>val(chosenSemester.endDate))return false;
      }
      return true;
    };
    const bookings=bookingsAll.filter(bookingDateOk);
    const records=[];
    const push=(type,d,date,status,extra={})=>records.push({
      id:d.id,type,date:date||'',status:val(status),semesterId:d.semesterId||'',
      courseCode:d.courseCode||'',courseName:d.courseName||'',groupCode:d.groupCode||'',
      courseLabel:`${d.courseCode||''} ${d.courseName||''} ${d.groupCode||''}`.trim(),
      note:d.note||'',score:d.score==null?'':d.score,link:'',attachmentDataUrl:'',...extra
    });
    attendance.forEach(a=>push('เข้าเรียน',a,datePart(a.checkDate||a.attendanceDate),
      a.attendanceStatus||a.status||'มาเรียน',{note:a.note||a.locationStatus||''}));
    leaves.forEach(l=>push('ลาเรียน',l,datePart(l.leaveDate),l.leaveType||'ลาเรียน',{
      note:l.reason||'',attachmentDataUrl:l.attachmentDataUrl||''}));
    submissions.forEach(s=>push('ส่งงาน',s,datePart(s.submitDate||s.createdAt),s.status||'ยังไม่ตรวจ',{
      note:[s.assignmentType,s.assignmentTitle,s.feedback||s.suggestion||s.note].filter(Boolean).join(' · '),
      link:/^https?:\/\//i.test(s.youtubeUrl||'')?s.youtubeUrl:'',score:s.score==null?'':s.score}));
    bookings.forEach(b=>push('จองห้อง',b,b.bookingDate||'',b.usageStatus==='checked_in'?'เข้าใช้จริง':b.status||'ไม่ระบุ',{
      courseCode:'',courseName:'',groupCode:'',courseLabel:b.roomName||b.roomId||'ห้องซ้อม',
      semesterId:'',note:`${b.roomName||b.roomId||''} ${b.startTime||''}–${b.endTime||''}`.trim()}));
    // Missing check-ins are inferred from completed QR sessions, per course+date.
    const checkedKeys=new Set(attendance.map(a=>`${key(a)}|${datePart(a.checkDate||a.attendanceDate)}`));
    const leaveKeys=new Set(leaves.map(l=>`${key(l)}|${datePart(l.leaveDate)}`));
    const lessons=new Map();
    const now=Date.now();
    const studentCourseMap=new Map(allStudentCourses.map(e=>[key(e),e]));
    snapRows(sessionSnap).forEach(s=>{
      if(!eligibleCourse(s))return;
      if(s.status==='cancelled'||s.status==='inactive')return;
      const timestamp=Date.parse(s.startTime||s.createdAt||'');
      if(!Number.isFinite(timestamp)||timestamp>now)return;
      const day=bangkokDate(new Date(timestamp));
      if(!filterDate(day))return;
      const enrollment=studentCourseMap.get(key(s));
      if(enrollment && approvedAt(enrollment) && day<approvedAt(enrollment))return;
      const lessonKey=`${key(s)}|${day}`;
      if(!lessons.has(lessonKey))lessons.set(lessonKey,{...s,lessonDate:day});
    });
    lessons.forEach((s,lessonKey)=>{
      if(checkedKeys.has(lessonKey)||leaveKeys.has(lessonKey))return;
      push('ไม่พบเช็คชื่อ',s,s.lessonDate,'รอตรวจสอบ',{note:'มีรอบ QR ในวันนั้น แต่ไม่พบเช็คชื่อหรือข้อมูลลา'});
    });
    const visibleCourses=semesterCourses.filter(e=>!courseKey||key(e)===courseKey);
    const stats=new Map();
    for(const e of visibleCourses){
      if(!stats.has(key(e)))stats.set(key(e),{
        key:key(e),semesterId:e.semesterId||'',courseCode:e.courseCode||'',
        courseName:e.courseName||'',groupCode:e.groupCode||'',present:0,late:0,absent:0,leave:0,missing:0
      });
    }
    // Aggregate once per course/day to avoid counting duplicate QR scans twice.
    const dayTypes=new Map();
    const priority={'มาเรียน':5,'มาสาย':6,'ขาดเรียน':7,'ลาเรียน':4,'ไม่พบเช็คชื่อ':1};
    records.forEach(r=>{
      if(!['เข้าเรียน','ลาเรียน','ไม่พบเช็คชื่อ'].includes(r.type))return;
      const k=`${val(r.semesterId)}|${r.courseCode}-${r.groupCode}`;
      if(!stats.has(k)||!r.date)return;
      const dayKey=`${k}|${r.date}`;
      const status=r.type==='เข้าเรียน' ?
        (['มาเรียน','มาสาย','ขาดเรียน'].includes(r.status)?r.status:'มาเรียน') :
        (r.type==='ลาเรียน'?'ลาเรียน':'ไม่พบเช็คชื่อ');
      const existing=dayTypes.get(dayKey);
      if(!existing || priority[status]>priority[existing])dayTypes.set(dayKey,status);
    });
    dayTypes.forEach((status,k)=>{
      // key contains course-group plus date; find by matching prefix.
      const row=stats.get(k.slice(0,k.lastIndexOf('|')));
      if(!row)return;
      if(status==='มาเรียน')row.present++;
      else if(status==='มาสาย')row.late++;
      else if(status==='ขาดเรียน')row.absent++;
      else if(status==='ลาเรียน')row.leave++;
      else row.missing++;
    });
    const perCourseStats=[...stats.values()].map(x=>{
      const total=x.present+x.late+x.absent+x.leave+x.missing;
      return {...x,total,rate:total?Math.round((x.present+x.late)*100/total):null};
    });
    const filteredRecords=records.filter(r=>!base.filters.type||r.type===base.filters.type);
    const summary={
      courses:perCourseStats.length,present:perCourseStats.reduce((s,x)=>s+x.present,0),
      late:perCourseStats.reduce((s,x)=>s+x.late,0),
      absent:perCourseStats.reduce((s,x)=>s+x.absent,0),
      leaves:perCourseStats.reduce((s,x)=>s+x.leave,0),
      missing:perCourseStats.reduce((s,x)=>s+x.missing,0),
      submissions:submissions.length,bookings:bookings.length,
      checkedInBookings:bookings.filter(b=>b.checkedInAt||b.usageStatus==='checked_in').length
    };
    res.render('pages/teacher/studentProfileV2',{
      ...base,courseKey,courseOptions,perCourseStats,records:sorted(filteredRecords,base.filters.sort),
      studentEnrollments:visibleCourses,profile:{
        studentId:selectedStudentId,name:studentData.fullName||userData.name||'',
        email:studentData.email||userData.email||'',major:studentData.major||userData.major||'',
        year:studentData.year||studentData.yearLevel||userData.year||'',summary
      }
    });
  }catch(e){console.error('studentProfileV2',e);res.status(500).send('ไม่สามารถโหลดโปรไฟล์นิสิต');}
});
module.exports=router;
