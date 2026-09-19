/* ==========================================================================
   login.js — 登录页逻辑（黄冈中学校园网）
   昵称 + 密码登录（v1.5）；管理员账户额外校验申请码（比对逻辑在 Perm/Auth）。
   已保持登录（会话保持）时访问本页自动跳回首页；退出登录由顶部导航完成。
   ========================================================================== */
(function () {
  Common.nav();
  Common.footer();

  /* 会话保持：已登录则无需再次登录 */
  if (Auth.currentUser()) {
    location.replace('index.html');
    return;
  }

  var msg = document.getElementById('msg');
  function show(text, cls) { msg.className = 'msg ' + cls; msg.textContent = text; }

  document.getElementById('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var nickname = document.getElementById('nickname').value.trim();
    var pass = document.getElementById('pass').value;
    var code = document.getElementById('code').value;

    var r = Auth.login(nickname, pass, code);
    if (!r.ok) { show(r.msg, 'error'); return; }

    show('登录成功，正在进入首页…', 'ok');
    setTimeout(function () { location.href = 'index.html'; }, 600);
  });
})();
