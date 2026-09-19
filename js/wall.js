/* ==========================================================================
   wall.js — 表白墙（黄冈中学校园网）
   模块可见性（需求 v1.4）：仅学生与管理员可进入本页（含直链拦截），
   首页入口与热门位同步隐藏；发帖权限 Perm.can 'wall.post'；
   支持评论、点赞、分享（复制文案/链接）、看过、一键上报、置顶、删除。
   ========================================================================== */
(function () {
  Common.nav();      /* 封禁联动在 nav() 内强制下线，须先于权限判定执行 */
  Common.footer();

  var me = Auth.currentUser();
  var allowed = !!me && (me.role === 'student' || me.role === 'admin');
  if (!allowed) { noAccess(me); return; }

  PostUI.pageHead('wall');
  var list = document.getElementById('list');
  var sortMode = 'new';

  /* ---- 发帖（学生/管理员），先过文明检测 ---- */
  var composer = document.getElementById('composer');
  if (Perm.can(me.role, 'wall.post')) {
    composer.hidden = false;
    document.getElementById('btnPost').addEventListener('click', function () {
      var text = document.getElementById('wallInput').value.trim();
      if (!text) { alert('写点什么再发布吧。'); return; }
      var g = Civility.guard(text, { module: 'wall', authorId: me.id });
      if (!g.ok) { alert(g.msg); return; }
      var att = ChatUI.take(composer);   /* QQ 对标：图片 + 附件随帖发布（向后兼容增量） */
      if (!DB.insert('posts', { module: 'wall', authorId: me.id, content: text,
        images: att.images, files: att.files, likes: [], views: 0, shares: 0 })) {
        alert('发布失败：浏览器存储空间可能已满。'); return;
      }
      document.getElementById('wallInput').value = '';
      render();
    });
  } else {
    document.getElementById('composerTip').textContent = '表白墙仅限学生与管理员发布，其他角色可浏览、评论与点赞。';
  }

  /* ---- 排序切换：最新 / 最热 ---- */
  var sortBar = document.getElementById('sortBar');
  sortBar.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-sort]') : null;
    if (!b) return;
    sortMode = b.getAttribute('data-sort');
    sortBar.querySelectorAll('.fbtn').forEach(function (x) { x.classList.toggle('on', x === b); });
    render();
  });

  function render() {
    var rows = PostUI.sortPosts(
      DB.find('posts', function (p) { return p.module === 'wall'; }), sortMode);
    PostUI.render(list, rows, {
      comments: true, sortMode: sortMode,
      empty: '表白墙还没有内容，来写下第一份心意吧～',
      rerender: render
    });
  }

  render();

  /* ---- 需求 v1.4：直链拦截 —— 非学生/管理员（含未登录）渲染友好无权限页 ----
     复用站内 v1.3 青春化样式（.coming/.coming-card/.btn）；
     主体整体替换，不渲染表白墙任何内容；文案不涉及申请码。 */
  function noAccess(u) {
    var main = document.querySelector('main.module-page');
    if (main) {
      main.className = 'coming';
      main.innerHTML =
        '<div class="card coming-card">' +
          '<div class="coming-icon">🔒</div>' +
          '<h1>暂无访问权限</h1>' +
          '<p>' + (u
            ? '表白墙仅对学生与管理员开放，你的账户暂无查看权限。'
            : '表白墙仅对学生与管理员开放。使用学生或管理员账户登录后即可访问。') + '</p>' +
          (u
            ? '<a class="btn btn-primary" href="../index.html">返回首页</a>'
            : '<a class="btn btn-primary" href="../login.html">去登录</a>' +
              '<a class="btn btn-ghost" href="../index.html">返回首页</a>') +
        '</div>';
    }
    document.title = '暂无访问权限 — 黄冈中学校园网';
  }
})();
