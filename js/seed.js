/* ==========================================================================
   seed.js — 内置演示数据（黄冈中学校园网）
   仅首次访问写入（seedVersion 标记 + users 为空 双重判断，幂等安全）；
   全部为明显虚构的示例占位内容，规模从简以节省 localStorage 容量。
   v1.5：演示账号不再含身份证示例值；登录凭证为「昵称 + 密码」；
   演示账号口令在写入前均经 Auth.hash() 处理，不落明文。
   ========================================================================== */
(function () {
  var now = Date.now(), H = 3600 * 1000;

  /* ---- v1：演示账号 + 示例帖（仅 users 为空时写入，幂等安全） ---- */
  if (DB.get('seedVersion', 0) < 1 && !DB.list('users').length) {
    seedV1();
    DB.set('seedVersion', 1);
  }

  /* ---- v2：增量补充示例评论（已有数据则只补评论，不动用户与帖子） ---- */
  if (DB.get('seedVersion', 0) < 2) {
    seedV2();
    DB.set('seedVersion', 2);
  }

  return;

  /* ============ v1 内容 ============ */
  function seedV1() {

  /* ---- 6 个演示账号（v1.5：不再含身份证示例值，登录凭证为昵称） ---- */
  var users = [
    { id: 'u_czh',     name: '站长czh', gender: '男', role: 'admin',   qq: '100001', nickname: '站长czh', avatar: null,
      pass: Auth.hash('admin123') },
    { id: 'u_union',   name: '王晓华', gender: '女', role: 'union',   qq: '100002', nickname: '晓华', avatar: null, className: '高二（2）班',
      pass: Auth.hash('stu123') },
    { id: 'u_leader',  name: '李文山', gender: '男', role: 'leader',  qq: '100003', nickname: '文山', avatar: null,
      managedGrade: '全校', dept: '校务办公室（示例）',
      pass: Auth.hash('lead123') },
    { id: 'u_teacher', name: '张明华', gender: '男', role: 'teacher', qq: '100004', nickname: '明华老师', avatar: null,
      subjectDept: '教学处（示例）', officeSubject: '数学',
      pass: Auth.hash('teach123') },
    { id: 'u_stu1',    name: '陈一鸣', gender: '男', role: 'student', qq: '100005', nickname: '一鸣', avatar: null,
      studentNo: '20230301', className: '高三（1）班', cohort: '2026届',
      pass: Auth.hash('s123456') },
    { id: 'u_stu2',    name: '刘小雨', gender: '女', role: 'student', qq: '100006', nickname: '小雨', avatar: null,
      studentNo: '20250318', className: '高一（3）班', cohort: '2028届',
      pass: Auth.hash('s123456') }
  ];
  for (var i = 0; i < users.length; i++) DB.insert('users', users[i]);

  /* ---- 各模块示例帖（从简，演示占位文案）
     【硬性】全部使用固定 id：多设备首访各自播种时，云端按 rid 幂等合并
     （upsert merge-duplicates），防止示例内容随设备数量翻倍（联调修复项） ---- */
  var posts = [
    { id: 'p_notice1', module: 'notice', authorId: 'u_leader', title: '【示例】校园网试运行欢迎语',
      content: '本站为演示环境，各栏目内容均为示例占位数据，正式通知以学校发布为准。',
      pinned: true, likes: ['u_teacher'], views: 120, createdAt: now - 30 * H },
    { id: 'p_notice2', module: 'notice', authorId: 'u_union', title: '【示例】近期活动预告（占位）',
      content: '示例占位：活动时间、地点等具体信息以后续正式通知为准。',
      likes: [], views: 66, createdAt: now - 20 * H },
    { id: 'p_wall1', module: 'wall', authorId: 'u_stu2', content: '示例占位：感谢高三（1）班同学分享课堂笔记，祝大家学习进步！',
      likes: ['u_stu1', 'u_union'], views: 88, createdAt: now - 18 * H },
    { id: 'p_event1', module: 'event', authorId: 'u_union', title: '【示例】校园活动话题（占位）',
      content: '示例话题：欢迎大家在话题下跟帖交流（文字与图片）。',
      likes: ['u_stu1'], views: 75, createdAt: now - 16 * H },
    { id: 'p_life1', module: 'life', authorId: 'u_stu1', title: '【示例】我的作息分享',
      content: '示例占位：分享一份适合备考阶段的生活作息安排，欢迎交流。',
      visibility: 'public', likes: ['u_stu2'], views: 41, createdAt: now - 14 * H },
    { id: 'p_qa1', module: 'qa', authorId: 'u_stu2', title: '【示例】函数平移问题求助',
      content: '示例占位：如何理解二次函数顶点式的图象平移？求思路方向。',
      grade: '高一', subject: '数学', likes: [], views: 33, createdAt: now - 12 * H },
    { id: 'p_rant1', module: 'rant', authorId: 'u_stu1', title: '【示例】关于高峰期排队的建议',
      content: '示例占位：建议高峰时段增开窗口或分流引导，供相关部门参考。',
      cat: '后勤服务', likes: [], views: 26, createdAt: now - 10 * H },
    { id: 'p_say1', module: 'say', authorId: 'u_stu1', content: '示例占位留言：希望老师上课节奏能稍微放慢一点，谢谢老师。',
      targetId: 'u_teacher', anonymous: true, visibility: 'private', likes: [], views: 5, createdAt: now - 8 * H },
    { id: 'p_viol1', module: 'violation', authorId: 'u_union', title: '【示例】文明发言提示公示',
      content: '示例占位：发布不文明内容将被拦截并记录上报，请各位用户文明发言。',
      likes: [], views: 90, createdAt: now - 6 * H },
    { id: 'p_mat1', module: 'material', authorId: 'u_teacher', title: '【示例】数学基础知识点梳理（占位）',
      content: '示例占位资料条目：集合与函数基础要点整理，正式文件后续上传。',
      grade: '高一', subject: '数学', downloads: 12, views: 55, createdAt: now - 4 * H }
  ];
  for (var j = 0; j < posts.length; j++) DB.insert('posts', posts[j]);

  /* ---- 闲聊吧示例消息（从简，固定 id，口径同上） ---- */
  DB.insert('chats', { id: 'c_chat1', zone: '总群', authorId: 'u_stu1', content: '示例消息：大家好，欢迎来到校园网闲聊吧！', likes: [], createdAt: now - 3 * H });
  DB.insert('chats', { id: 'c_chat2', zone: '总群', authorId: 'u_stu2', content: '示例消息：一起加油呀！', likes: [], createdAt: now - 2 * H });
  }

  /* ============ v2 内容：示例评论（从简，各取一两条作演示；固定 id，口径同上） ============ */
  function seedV2() {
    function pid(module) {
      var p = DB.findOne('posts', function (x) { return x.module === module; });
      return p ? p.id : null;
    }
    function say(cid, mid, uid, text, t) {
      var id = pid(mid);
      if (id) DB.insert('comments', { id: cid, postId: id, authorId: uid, content: text, images: [], likes: [], createdAt: t });
    }
    say('c_cm1', 'wall',   'u_stu2',   '示例评论：太浪漫啦，祝你们学业顺利、友谊长存！', now - 5 * H);
    say('c_cm2', 'event',  'u_teacher','示例跟帖：请同学们有序报名参加，注意安全。',     now - 6 * H);
    say('c_cm3', 'event',  'u_stu1',   '示例跟帖：已报名，期待运动会！',                 now - 5 * H);
    say('c_cm4', 'qa',     'u_teacher','示例解答：抓住顶点式 y=a(x-h)²+k，平移看 h、k 的变化即可。', now - 5 * H);
    say('c_cm5', 'qa',     'u_stu2',   '示例回答：我也在整理这部分笔记，一起加油！',     now - 4 * H);
  }
})();
