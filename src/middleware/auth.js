function requireLogin(req,res,next){
  if(req.session && req.session.user) return next();
  req.flash('error','กรุณาเข้าสู่ระบบ');
  return res.redirect('/login');
}
function requireRole(...roles){
  return (req,res,next)=>{
    if(!req.session?.user) return res.redirect('/login');
    if(roles.includes(req.session.user.role)) return next();
    return res.status(403).render('pages/error',{title:'403',message:'ไม่มีสิทธิ์ใช้งานหน้านี้',user:req.session.user});
  };
}
module.exports = { requireLogin, requireRole };
