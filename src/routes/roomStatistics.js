'use strict';
const express=require('express');
const ExcelJS=require('exceljs');
const {db}=require('../config/firebase');
const {bangkokDate,minutes}=require('../services/roomCheckinService');
const router=express.Router();
const clean=x=>String(x==null?'':x);
const rows=s=>s.docs.map(d=>({id:d.id,...d.data()}));
function access(req,res,next){
 if(!req.session.user)return res.redirect('/login');
 if(!['admin','staff'].includes(req.session.user.role))return res.status(403).send('ไม่มีสิทธิ์เข้าถึงสถิติ');
 next();
}
function validDate(x){return /^\d{4}-\d{2}-\d{2}$/.test(clean(x));}
function normalYear(x){
 const v=clean(x).trim();
 const n=v.match(/(?:^|\D)([1-6])(?:\D|$)/);
 return n?`ปี ${n[1]}`:'ไม่ระบุชั้นปี';
}
async function getReport(req){
 const now=bangkokDate();
 const semesters=rows(await db.collection('semesters').get());
 const semesterId=clean(req.query.semesterId||'all');
 const semester=semesterId==='all'?null:semesters.find(s=>s.semesterId===semesterId);
 let startDate=validDate(req.query.startDate)?req.query.startDate:(semester?.startDate||`${now.slice(0,4)}-01-01`);
 let endDate=validDate(req.query.endDate)?req.query.endDate:(semester?.endDate||now);
 if(semester){
   if(semester.startDate && semester.startDate>startDate)startDate=semester.startDate;
   if(semester.endDate && semester.endDate<endDate)endDate=semester.endDate;
   // Switching terms may leave a date range from the previous term in the form.
   if(startDate>endDate){
     startDate=semester.startDate||startDate;
     endDate=semester.endDate||endDate;
   }
 }
 if(startDate>endDate)throw new Error('วันเริ่มต้นต้องไม่เกินวันสิ้นสุด');
 const roomId=clean(req.query.roomId||'');
 const yearLevel=clean(req.query.yearLevel||'');
 const [bookingSnap,roomSnap,studentSnap,userSnap]=await Promise.all([
   db.collection('bookings').where('bookingDate','>=',startDate).where('bookingDate','<=',endDate).get(),
   db.collection('rooms').get(),
   db.collection('students').get(),
   db.collection('users').where('role','==','student').get()
 ]);
 const rooms=rows(roomSnap);
 const studentMap=new Map();
 rows(userSnap).forEach(s=>studentMap.set(clean(s.studentId||s.id),s));
 rows(studentSnap).forEach(s=>studentMap.set(clean(s.studentId||s.id),{
   ...(studentMap.get(clean(s.studentId||s.id))||{}),...s}));
 const roomName=new Map(rooms.map(r=>[r.id,r.roomName||r.id]));
 let bookings=rows(bookingSnap).filter(b=>!roomId||b.roomId===roomId);
 const findYear=b=>{
   const sid=clean(b.studentId||b.bookerId);
   const d=studentMap.get(sid)||{};
   return normalYear(d.yearLevel||d.year||d.studyYear||'');
 };
 if(yearLevel)bookings=bookings.filter(b=>findYear(b)===yearLevel);
 const isStudent=b=>b.bookerRole==='student'||!!b.studentId;
 const successful=b=>b.status==='approved';
 const used=b=>successful(b) && (b.usageStatus==='checked_in'||!!b.checkedInAt);
 const hours=b=>{
   const a=minutes(b.startTime),z=minutes(b.endTime);
   return Number.isFinite(a)&&Number.isFinite(z)&&z>=a?(z-a)/60:0;
 };
 const roomTotals=new Map();
 const studentTotals=new Map();
 const monthTotals=new Map();
 const yearTotals=new Map();
 for(const b of bookings){
   const rId=clean(b.roomId)||'unknown';
   if(!roomTotals.has(rId))roomTotals.set(rId,{roomId:rId,name:b.roomName||roomName.get(rId)||'ไม่ระบุ',reserved:0,used:0,hours:0});
   const r=roomTotals.get(rId);
   if(successful(b))r.reserved++;
   if(used(b)){r.used++;r.hours+=hours(b);}
   const month=clean(b.bookingDate).slice(0,7);
   if(/^\d{4}-\d{2}$/.test(month)){
     if(!monthTotals.has(month))monthTotals.set(month,{month,reserved:0,used:0});
     const m=monthTotals.get(month);
     if(successful(b))m.reserved++;
     if(used(b))m.used++;
   }
   if(isStudent(b)){
     const sid=clean(b.studentId||b.bookerId),d=studentMap.get(sid)||{};
     if(!studentTotals.has(sid))studentTotals.set(sid,{studentId:sid,
       studentName:d.fullName||d.name||b.studentName||b.bookerName||sid,
       yearLevel:findYear(b),reserved:0,used:0});
     const st=studentTotals.get(sid);
     if(successful(b))st.reserved++;
     if(used(b))st.used++;
     const year=st.yearLevel;
     if(!yearTotals.has(year))yearTotals.set(year,{yearLevel:year,reserved:0,used:0});
     const y=yearTotals.get(year);
     if(successful(b))y.reserved++;
     if(used(b))y.used++;
   }
 }
 const roomRanking=[...roomTotals.values()].sort((a,b)=>b.used-a.used||b.reserved-a.reserved);
 const studentRanking=[...studentTotals.values()].filter(s=>s.reserved>0).sort((a,b)=>b.reserved-a.reserved||b.used-a.used);
 const monthRanking=[...monthTotals.values()].sort((a,b)=>b.used-a.used||b.reserved-a.reserved);
 const yearRanking=[...yearTotals.values()].sort((a,b)=>b.reserved-a.reserved);
 return {filters:{startDate,endDate,semesterId,roomId,yearLevel},semesters,rooms,
   summary:{totalBookings:bookings.length,approved:bookings.filter(successful).length,
     checkedIn:bookings.filter(used).length,cancelled:bookings.filter(b=>b.status==='cancelled').length},
   topRooms:roomRanking.filter(x=>x.used>0).slice(0,3),
   topStudents:studentRanking.slice(0,10),
   topMonths:monthRanking.filter(x=>x.used>0).slice(0,3),
   byYear:yearRanking,allMonths:[...monthTotals.values()].sort((a,b)=>a.month.localeCompare(b.month)),
   bookings:bookings.sort((a,b)=>clean(b.bookingDate).localeCompare(clean(a.bookingDate)))
 };
}
router.get('/',access,async(req,res)=>{
 try {res.render('pages/admin/roomStatistics',{title:'สถิติห้องซ้อม',user:req.session.user,...await getReport(req)});}
 catch(e){console.error('room stats',e);res.status(500).send(e.message||'สรุปสถิติไม่สำเร็จ');}
});
router.get('/export.xlsx',access,async(req,res)=>{
 try {
   const report=await getReport(req);const book=new ExcelJS.Workbook();
   book.creator='LINE Music Class Manager';
   function sheet(name,headers,data){
     const sh=book.addWorksheet(name);sh.addRow(headers);
     sh.getRow(1).font={bold:true};sh.views=[{state:'frozen',ySplit:1}];
     sh.columns=headers.map(()=>({width:24}));data.forEach(a=>sh.addRow(a));return sh;
   }
   sheet('สรุป', ['รายการ','จำนวน'],[
     ['การจองทั้งหมด',report.summary.totalBookings],['การจองอนุมัติ',report.summary.approved],
     ['เข้าใช้จริง',report.summary.checkedIn],['ยกเลิก',report.summary.cancelled]
   ]);
   sheet('Top3 ห้อง',['ห้อง','จองอนุมัติ','เข้าใช้จริง','ชั่วโมงช่วงที่จอง'],
     report.topRooms.map(x=>[x.name,x.reserved,x.used,Number(x.hours.toFixed(2))]));
   sheet('Top10 นิสิต',['รหัสนิสิต','ชื่อ','ชั้นปี','จองอนุมัติ','เข้าใช้จริง'],
     report.topStudents.map(x=>[x.studentId,x.studentName,x.yearLevel,x.reserved,x.used]));
   sheet('แยกชั้นปี',['ชั้นปี','จองอนุมัติ','เข้าใช้จริง'],
     report.byYear.map(x=>[x.yearLevel,x.reserved,x.used]));
   sheet('รายเดือน',['เดือน','จองอนุมัติ','เข้าใช้จริง'],
     report.allMonths.map(x=>[x.month,x.reserved,x.used]));
   sheet('รายการจอง',['Booking ID','วันที่','ห้อง','ผู้จอง','รหัสนิสิต','สถานะจอง','สถานะเข้าใช้','เริ่ม','สิ้นสุด'],
     report.bookings.map(b=>[b.id,b.bookingDate,b.roomName,b.bookerName||b.studentName,
       b.studentId||b.bookerId,b.status,b.usageStatus||'',b.startTime,b.endTime]));
   res.set('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
   res.set('Content-Disposition','attachment; filename="room-statistics.xlsx"');
   await book.xlsx.write(res);res.end();
 }catch(e){console.error('room stats export',e);if(!res.headersSent)res.status(500).send('ส่งออก Excel ไม่สำเร็จ');}
});
module.exports=router;
