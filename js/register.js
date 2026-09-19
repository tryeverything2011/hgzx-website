/* ==========================================================================
   register.js — 注册页逻辑（黄冈中学校园网）
   角色动态表单 / 头像压缩预览 / 文明用词检查 /
   唯一性逐项校验（姓名 / 昵称 / 学号 / QQ号）/ 申请码校验
   v1.5：不再采集身份证号；昵称为登录凭证，全站唯一。
   说明：申请码仅做输入比对（Perm.verifyCode），页面任何位置不展示明文。
   ========================================================================== */
(function () {
  Common.nav();
  Common.footer();

  var msg = document.getElementById('msg');
  function show(text, cls) { msg.className = 'msg ' + cls; msg.textContent = text; }
  function clearMsg() { msg.className = 'msg'; msg.textContent = ''; }

  /* ---- 角色切换：动态展开对应资料区块 ---- */
  var blocks = document.querySelectorAll('.role-block');
  function curRole() {
    var r = document.querySelector('input[name="role"]:checked');
    return r ? r.value : '';
  }
  var radios = document.querySelectorAll('input[name="role"]');
  for (var i = 0; i < radios.length; i++) {
    radios[i].addEventListener('change', function () {
      for (var j = 0; j < blocks.length; j++) {
        blocks[j].className = 'role-block' +
          (blocks[j].getAttribute('data-role') === curRole() ? ' active' : '');
      }
    });
  }

  /* ---- 头像：压缩为 160px JPEG dataURL 后预览（防存储超容） ---- */
  var avatarData = '';
  document.getElementById('avatar').addEventListener('change', function () {
    var f = this.files && this.files[0];
    if (!f) return;
    Common.compressImage(f, 160, function (dataURL) {
      if (!dataURL) { show('头像读取失败，请换一张图片（不影响注册）。', 'error'); return; }
      avatarData = dataURL;
      var box = document.getElementById('avatarPreview');
      box.innerHTML = '';
      var img = document.createElement('img');
      img.src = dataURL;
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
      box.appendChild(img);
    });
  });

  function val(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  /* ---- 各角色必填项检查，返回完整提示文案数组 ---- */
  function roleErrs(role) {
    var errs = [];
    if (role === 'student') {
      if (!val('studentNo')) errs.push('请填写学号');
      if (!val('classNameStu')) errs.push('请填写班级');
      if (!val('cohort')) errs.push('请填写届别');
    } else if (role === 'teacher') {
      if (!val('subjectDept')) errs.push('请填写学科部门');
      if (!val('officeSubject')) errs.push('请填写办公学科');
    } else if (role === 'leader') {
      if (!val('managedGrade')) errs.push('请选择分管年级');
      if (!val('dept')) errs.push('请填写部门');
    } else if (role === 'union') {
      if (!val('uniCode')) errs.push('请填写申请码');
      if (!val('classNameUni')) errs.push('请填写班级');
    } else if (role === 'admin') {
      if (!val('admCode')) errs.push('请填写申请码');
    } else {
      errs.push('请先选择角色');
    }
    return errs;
  }

  document.getElementById('regForm').addEventListener('submit', function (e) {
    e.preventDefault();
    clearMsg();

    var role = curRole();
    var name = val('name'), gender = val('gender'), qq = val('qq');
    var nickname = val('nickname');
    var pass = document.getElementById('pass').value;

    /* 公共字段逐项校验（一次性收集全部问题后统一提示；v1.5 起无身份证项） */
    var errs = [];
    if (!name) errs.push('请填写姓名');
    if (!gender) errs.push('请选择性别');
    if (!/^\d{5,11}$/.test(qq)) errs.push('QQ号应为5-11位数字');
    if (!nickname) errs.push('请填写昵称');
    if (!pass || pass.length < 6) errs.push('密码至少6位');
    Array.prototype.push.apply(errs, roleErrs(role));

    /* 昵称文明用词检查（注册时尚无账户归属，纯检查不写留痕） */
    if (nickname && !Civility.check(nickname)) errs.push('昵称包含不文明用语，请修改');

    if (errs.length) { show(errs.join('；') + '。', 'error'); return; }

    /* 申请码校验（输入比对，不展示、不记录明文） */
    var code = role === 'admin' ? val('admCode') : val('uniCode');
    if ((role === 'admin' || role === 'union') && !Perm.verifyCode(role, code)) {
      show('申请码不正确，请联系管理员获取。', 'error');
      return;
    }

    /* 唯一性校验：姓名 / 昵称 / 学号 / QQ号 逐项查重，逐项提示（v1.5：昵称替代身份证号） */
    var dup = Common.checkDup(DB.list('users'), {
      name: name, nickname: nickname, qq: qq,
      studentNo: role === 'student' ? val('studentNo') : ''
    });
    if (dup.length) {
      show('以下信息已被注册，请核实后修改：' + dup.join('、') + '。', 'error');
      return;
    }

    /* 组装账户并写入 users 表（密码只存哈希；v1.5 起不采集身份证号） */
    var user = {
      name: name, gender: gender, role: role, qq: qq, nickname: nickname,
      avatar: avatarData || null,
      pass: Auth.hash(pass)
    };
    if (role === 'student') {
      user.studentNo = val('studentNo'); user.className = val('classNameStu'); user.cohort = val('cohort');
    }
    if (role === 'teacher') { user.subjectDept = val('subjectDept'); user.officeSubject = val('officeSubject'); }
    if (role === 'leader')  { user.managedGrade = val('managedGrade'); user.dept = val('dept'); }
    if (role === 'union')   { user.className = val('classNameUni'); }

    if (!DB.insert('users', user)) { show('注册失败：浏览器存储空间不足。', 'error'); return; }
    show('注册成功，正在跳转到登录页…', 'ok');
    setTimeout(function () { location.href = 'login.html'; }, 1000);
  });
})();
