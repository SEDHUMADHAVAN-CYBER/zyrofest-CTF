<!DOCTYPE html>
<html>
<head>
    <title>ZYROFEST-{CTF}</title>
    <meta http-equiv="refresh" content="5">
    <link rel="stylesheet" href="/static/style.css">
</head>
<body>

<!-- 🔥 NAVBAR -->
<div class="nav">
    <div class="left">
        <div class="logo">ZYROFEST-{CTF}</div>
        <a href="/dashboard">DASHBOARD</a>
        <a href="/scoreboard">SCOREBOARD</a>
        <a href="/team">TEAM</a>
        <a href="/profile">PROFILE</a>
    </div>
    <div class="right">
        <button onclick="toggleTheme()" id="themeBtn" class="theme-btn">🌙</button>
        <% if (user) { %>
            <a href="/logout">LOGOUT</a>
        <% } %>
    </div>
</div>

<!-- 🔥 CONTENT -->
<div class="container">
    <h2>LEADERBOARD</h2>

    <% users.forEach(function(u, i) { %>
        <div class="rank">
            <span>#<%= i + 1 %> <%= u.username %></span>
            <span><%= u.score %> PTS</span>
        </div>
    <% }); %>
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
