<!DOCTYPE html>
<html>
<head>
    <title>ZYROFEST-{CTF}</title>
    <link rel="stylesheet" href="/static/style.css">
</head>
<body>

<!-- 🔥 NAVBAR -->
<div class="nav">
    <div class="left">
        <div class="logo">ZYROFEST-{CTF}</div>
    </div>
    <div class="right">
        <button onclick="toggleTheme()" id="themeBtn" class="theme-btn">🌙</button>
    </div>
</div>

<!-- 🔥 CONTENT -->
<div class="container">
    <div class="login-box">
        <h2>LOGIN</h2>

        <% if (messages.error) { %>
            <p class="msg error"><%= messages.error %></p>
        <% } %>
        <% if (messages.success) { %>
            <p class="msg success"><%= messages.success %></p>
        <% } %>

        <form class="form-box" method="POST" action="/">
            <input type="text" name="username" placeholder="USERNAME" required>
            <input type="password" name="password" placeholder="PASSWORD" required>
            <button type="submit">LOGIN</button>
        </form>

        <div class="extra">
            <p>NEW USER?</p>
            <a href="/register"><button>REGISTER</button></a>
        </div>
    </div>
</div>

<!-- 🔥 FOOTER -->
<footer class="footer">
    <p>Developed by <b>sedhu madhavan</b></p>
</footer>

<!-- 🔥 THEME SCRIPT -->
<script>
function toggleTheme() {
    let body = document.body;
    if (body.classList.contains("dark")) {
        body.classList.remove("dark");
        localStorage.setItem("theme", "light");
        document.getElementById("themeBtn").innerText = "🌙";
    } else {
        body.classList.add("dark");
        localStorage.setItem("theme", "dark");
        document.getElementById("themeBtn").innerText = "☀️";
    }
}
window.onload = function() {
    let theme = localStorage.getItem("theme");
    if (theme === "dark") {
        document.body.classList.add("dark");
        document.getElementById("themeBtn").innerText = "☀️";
    }
}
</script>

<script src="/static/ajax.js"></script>
</body>
</html>
