/* ==========================================================================
   say.js — 我有话对你说（黄冈中学校园网）
   学生：匿名留言给指定老师（Civility 检测后入库，作者对所有人隐藏）；
   老师：发留言给选定学生（仅选定学生可见）。
   可见性专项规则（优先于教职工 viewAll 通用口径）：仅 发送者、接收者、
   管理员 可见；留言为私密定向内容，不参与点赞/分享/热门评选，仅统计接收方
   看过次数。
   ========================================================================== */
(function () {
  if (!Auth.ensureLogin()) return;
  Common.nav();
  Common.footer();
  PostUI.pageHead('say');

  var me = Auth.currentUser();
  var list = document.getElementById('list');

  /* ---- 可见性判定（专项规则） ---- */
  function canSee(p, u) {
    if (!u) return false;
    if (p.authorId === u.id || p.targetId === u.id) return true;
    return u.role === 'admin';   // 管理员监管可见全部
  }

  /* ---- 发留言表单 ---- */
  var composer = document.getElementById('composer');
  var role = me.role;
  var sel = document.getElementById('sayTarget');
  var hint = document.getElementById('composerTip');

  function fillTargets() {
    var targetRole = role === 'student' ? 'teacher' : 'student';
    var rows = DB.find('users', function (u) { return u.role === targetRole; });
    sel.innerHTML = rows.length
      ? rows.map(function (u) { return '<option value="' + u.id + '">' + Common.esc(u.nickname || u.name) + '（' + Common.roleLabel(u.role) + '）</option>'; }).join('')
      : '<option value="">（暂无可选对象）</option>';
  }

  if (role === 'student' && Perm.can(role, 'say.toTeacher')) {
    composer.hidden = false;
    hint.textContent = '留言将以匿名方式发送给你选定的老师，仅你、对方老师与管理员可见。';
    fillTargets();
    document.getElementById('btnSend').addEventListener('click', function () {
      var text = document.getElementById('sayInput').value.trim();
      if (!text) { alert('写下想说的话再发送吧。'); return; }
      if (!sel.value) { alert('请选择要留言的老师。'); return; }
      var g = Civility.guard(text, { module: 'say', authorId: me.id });
      if (!g.ok) { alert(g.msg); return; }
      var att = ChatUI.take(composer);   /* QQ 对标：图片 + 附件随留言发送（向后兼容增量） */
      if (!DB.insert('posts', {
        module: 'say', authorId: me.id, targetId: sel.value, anonymous: true,
        visibility: 'private', content: text, images: att.images, files: att.files,
        likes: [], views: 0
      })) { alert('发送失败：浏览器存储空间可能已满。'); return; }
      document.getElementById('sayInput').value = '';
      render();
    });
  } else if (role === 'teacher' && Perm.can(role, 'say.toStudent')) {
    composer.hidden = false;
    hint.textContent = '你的留言将定向发送给选定的学生，仅该学生本人、你与管理员可见。';
    fillTargets();
    document.getElementById('btnSend').addEventListener('click', function () {
      var text = document.getElementById('sayInput').value.trim();
      if (!text) { alert('写下想说的话再发送吧。'); return; }
      if (!sel.value) { alert('请选择要留言的学生。'); return; }
      var g = Civility.guard(text, { module: 'say', authorId: me.id });
      if (!g.ok) { alert(g.msg); return; }
      var att = ChatUI.take(composer);   /* QQ 对标：图片 + 附件随留言发送（向后兼容增量） */
      if (!DB.insert('posts', {
        module: 'say', authorId: me.id, targetId: sel.value, anonymous: false,
        visibility: 'private', content: text, images: att.images, files: att.files,
        likes: [], views: 0
      })) { alert('发送失败：浏览器存储空间可能已满。'); return; }
      document.getElementById('sayInput').value = '';
      render();
    });
  } else if (role !== 'admin') {
    hint.textContent = '本模块仅学生与老师可发送定向留言。';
  } else {
    hint.textContent = '管理员可查看全部定向留言（监管口径），但不能代发。';
  }

  /* ---- 留言卡片（私密样式：无点赞/分享/上报，仅看过与删除） ---- */
  function cardHtml(p) {
    var mine = p.authorId === me.id;
    var fromName;
    if (p.anonymous) fromName = mine ? '匿名同学（我）' : '匿名同学';
    else {
      var au = DB.findOne('users', function (u) { return u.id === p.authorId; });
      fromName = au ? (au.nickname || au.name) : '示例用户';
    }
    var tu = DB.findOne('users', function (u) { return u.id === p.targetId; });
    var toName = tu ? (tu.nickname || tu.name) : '示例用户';
    var dir = p.anonymous ? '学生 → 老师' : '老师 → 学生';
    var canDel = Perm.can(me.role, 'post.delete') || mine;

    /* 接收方看过的留言，每浏览器计数一次 */
    if (me.id === p.targetId) {
      var seen = DB.get('viewed', {});
      if (!seen[p.id]) { seen[p.id] = 1; DB.set('viewed', seen); DB.update('posts', p.id, { views: (p.views || 0) + 1 }); p.views = (p.views || 0) + 1; }
    }

    return '<article class="post card say-card" id="post-' + p.id + '">' +
      '<div class="p-head"><span class="avatar" style="background:#8aa0b5">✉</span>' +
        '<div class="p-who"><b>' + Common.esc(fromName) + '</b>' +
        '<span class="chip">' + dir + '</span>' +
        '<span class="chip">致 ' + Common.esc(toName) + '</span>' +
        '<time>' + Common.fmtTime(p.createdAt) + '</time></div>' +
        '<span class="chip chip-pin">🔒 私密</span>' +
      '</div>' +
      '<div class="p-content">' + Common.esc(p.content) + '</div>' +
      ((p.images && p.images.length)
        ? '<div class="p-imgs">' + p.images.map(function (s) { return '<img src="' + s + '" alt="留言配图">'; }).join('') + '</div>' : '') +
      ((p.files && p.files.length)
        ? '<div class="p-files">' + p.files.map(function (f) {
            return '<div class="b-file"><span class="b-fi">📎</span>' +
              '<span class="b-fmain"><span class="b-fn">' + Common.esc(f.name || '附件') + '</span>' +
              '<span class="b-fs">' + ChatUI.fmtSize(f.size) + '</span></span>' +
              '<a href="' + f.url + '" download="' + Common.esc(f.name || '附件') + '">下载</a></div>';
          }).join('') + '</div>' : '') +
      '<div class="p-meta">👁 看过 ' + (p.views || 0) + ' · 私密定向内容不参与点赞/分享/热门评选</div>' +
      (canDel ? '<div class="p-actions"><button type="button" class="pact pact-danger" data-act="del" data-pid="' + p.id + '">🗑 删除</button></div>' : '') +
      '</article>';
  }

  function render() {
    var rows = DB.find('posts', function (p) { return p.module === 'say' && canSee(p, me); })
      .sort(function (a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
    list.innerHTML = rows.length
      ? rows.map(cardHtml).join('')
      : '<div class="card empty-card">暂无与你相关的留言。</div>';
    if (me.role === 'leader' || me.role === 'union') {
      list.innerHTML = '<div class="card empty-card">本模块为私密定向留言，仅发送方、接收方与管理员可见。</div>';
    }
  }

  list.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-act="del"]') : null;
    if (!btn) return;
    var pid = btn.getAttribute('data-pid');
    var p = DB.findOne('posts', function (x) { return x.id === pid; });
    if (!p) return;
    if (!(Perm.can(me.role, 'post.delete') || p.authorId === me.id)) return;
    if (!confirm('确定删除该条留言吗？')) return;
    DB.remove('posts', pid);
    render();
  });

  render();
})();
