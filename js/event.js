/* ==========================================================================
   event.js — 校园大事件（黄冈中学校园网）
   管理员/学生会上传话题（标题+内容+配图），所有人可见；
   全员可在话题下跟帖（文字+图片，图片自动压缩≤300KB）。
   ========================================================================== */
(function () {
  if (!Auth.ensureLogin()) return;
  Common.nav();
  Common.footer();
  PostUI.pageHead('event');

  var me = Auth.currentUser();
  var list = document.getElementById('list');
  var sortMode = 'new';
  var topicImg = '';   /* 话题配图（压缩后 dataURL） */

  /* ---- 发话题（管理员/学生会） ---- */
  var composer = document.getElementById('composer');
  if (Perm.can(me.role, 'event.topic')) {
    composer.hidden = false;
    document.getElementById('evFile').addEventListener('change', function () {
      var f = this.files && this.files[0];
      if (!f) return;
      Common.compressImage(f, 1280, function (durl) {
        if (!durl) { alert('图片读取失败，请换一张试试。'); return; }
        topicImg = durl;
        document.getElementById('evImgPre').innerHTML = '<img src="' + durl + '" alt="配图预览">';
      });
    });
    document.getElementById('btnPost').addEventListener('click', function () {
      var title = document.getElementById('evTitle').value.trim();
      var text = document.getElementById('evInput').value.trim();
      if (!title || !text) { alert('请填写话题标题与内容。'); return; }
      var g = Civility.guard(title + '\n' + text, { module: 'event', authorId: me.id });
      if (!g.ok) { alert(g.msg); return; }
      var att = ChatUI.take(composer);   /* QQ 对标：附件随话题发布（配图仍走上方原有入口） */
      if (!DB.insert('posts', {
        module: 'event', authorId: me.id, title: title, content: text,
        images: topicImg ? [topicImg] : [], files: att.files,
        likes: [], views: 0, shares: 0
      })) { alert('发布失败：浏览器存储空间可能已满。'); return; }
      document.getElementById('evTitle').value = '';
      document.getElementById('evInput').value = '';
      document.getElementById('evImgPre').innerHTML = '';
      topicImg = '';
      render();
    });
  } else {
    document.getElementById('composerTip').textContent = '话题由管理员与学生会发布，所有人可在话题下跟帖（文字+图片）。';
  }

  /* ---- 排序切换 ---- */
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
      DB.find('posts', function (p) { return p.module === 'event'; }), sortMode);
    PostUI.render(list, rows, {
      comments: true, commentImage: true,
      empty: '还没有校园大事件话题，敬请期待。',
      rerender: render
    });
  }

  render();
})();
