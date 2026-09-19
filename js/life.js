/* ==========================================================================
   life.js — 生活分享（黄冈中学校园网）
   所有成员可发布；发布者自主设置可见权限（公开 / 仅某年级 / 仅某角色 /
   仅自己）。教职工按 GOAL 权限口径可见全部；判定逻辑见 PostUI.canSeeLife。
   ========================================================================== */
(function () {
  if (!Auth.ensureLogin()) return;
  Common.nav();
  Common.footer();
  PostUI.pageHead('life');

  var me = Auth.currentUser();
  var list = document.getElementById('list');
  var sortMode = 'new';

  var GRADES = ['丘班', '高一', '高二', '高三'];
  var ROLES = ['student', 'teacher', 'leader', 'union', 'admin'];

  /* 所有角色均可发布生活分享 */
  document.getElementById('composer').hidden = false;

  /* ---- 发布表单：可见权限联动 ---- */
  var modeSel = document.getElementById('visMode');
  var scopeWrap = document.getElementById('visScopeWrap');
  var scopeSel = document.getElementById('visScope');
  function drawScope() {
    var mode = modeSel.value;
    if (mode !== 'grade' && mode !== 'role') { scopeWrap.hidden = true; return; }
    scopeWrap.hidden = false;
    scopeSel.innerHTML = mode === 'grade'
      ? GRADES.map(function (g) { return '<option value="' + g + '">' + g + '</option>'; }).join('')
      : ROLES.map(function (r) { return '<option value="' + r + '">仅' + Common.roleLabel(r) + '可见</option>'; }).join('');
  }
  modeSel.addEventListener('change', drawScope);
  drawScope();

  document.getElementById('btnPost').addEventListener('click', function () {
    var title = document.getElementById('lifeTitle').value.trim();
    var text = document.getElementById('lifeInput').value.trim();
    if (!title || !text) { alert('请填写标题与内容。'); return; }
    var g = Civility.guard(title + '\n' + text, { module: 'life', authorId: me.id });
    if (!g.ok) { alert(g.msg); return; }
    var mode = modeSel.value;
    var att = ChatUI.take(document.getElementById('composer'));   /* QQ 对标：图片 + 附件随帖发布（向后兼容增量） */
    var p = {
      module: 'life', authorId: me.id, title: title, content: text,
      images: att.images, files: att.files,
      visMode: mode, likes: [], views: 0, shares: 0
    };
    if (mode === 'grade') p.visGrade = scopeSel.value;
    if (mode === 'role') p.visRole = scopeSel.value;
    if (!DB.insert('posts', p)) { alert('发布失败：浏览器存储空间可能已满。'); return; }
    document.getElementById('lifeTitle').value = '';
    document.getElementById('lifeInput').value = '';
    render();
  });

  /* ---- 排序切换 ---- */
  var sortBar = document.getElementById('sortBar');
  sortBar.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('[data-sort]') : null;
    if (!b) return;
    sortMode = b.getAttribute('data-sort');
    sortBar.querySelectorAll('.fbtn').forEach(function (x) { x.classList.toggle('on', x === b); });
    render();
  });

  function chips(p) {
    return '<span class="chip chip-vis">🔒 ' + PostUI.visLabel(p) + '</span>';
  }

  function render() {
    var me2 = Auth.currentUser();
    var rows = DB.find('posts', function (p) { return p.module === 'life'; })
      .filter(function (p) { return PostUI.canSeeLife(p, me2); });
    rows = PostUI.sortPosts(rows, sortMode);
    PostUI.render(list, rows, {
      comments: true, chips: chips,
      empty: '还没有生活分享，来记录今天的校园日常吧～',
      rerender: render
    });
  }

  render();
})();
