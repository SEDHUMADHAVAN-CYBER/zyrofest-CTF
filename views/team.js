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
    <h2>TEAM</h2>

    <% if (messages.error) { %>
        <p class="msg error"><%= messages.error %></p>
    <% } %>
    <% if (messages.success) { %>
        <p class="msg success"><%= messages.success %></p>
    <% } %>

    <% if (user.team_name) { %>
        <div class="profile-box">
            <h3>YOUR TEAM</h3>
            <p><%= user.team_name %></p>
        </div>
    <% } else { %>
        <div class="card">
            <h3>SET TEAM NAME</h3>
            <form method="POST" action="/team">
                <input type="text" name="team_name" placeholder="ENTER TEAM NAME" required>
                <button type="submit">SET TEAM</button>
            </form>
        </div>
    <% } %>
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
