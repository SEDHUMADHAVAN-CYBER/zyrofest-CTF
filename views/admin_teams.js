<!DOCTYPE html>
<html>
<head>
    <title>ZYROFEST-{CTF} ADMIN</title>
    <link rel="stylesheet" href="/static/style.css">
    <style>
        .admin-nav { display: flex; gap: 15px; margin-bottom: 25px; flex-wrap: wrap; }
        .admin-nav a button { width: auto; font-size: 14px; }
    </style>
</head>
<body>

<div class="nav">
    <div class="left">
        <div class="logo">MANAGE TEAMS</div>
        <a href="/admin/dashboard">DASHBOARD</a>
    </div>
</div>

<div class="container">
    <div class="admin-nav">
        <a href="/admin/users"><button>👥 USERS</button></a>
        <a href="/admin/teams"><button style="background:var(--text-color); color:black;">🛡️ TEAMS</button></a>
        <a href="/admin/challenges"><button>🎯 CHALLENGES</button></a>
        <a href="/admin/settings"><button>⚙️ SETTINGS</button></a>
    </div>

    <% if (messages.success) { %><p class="msg success"><%= messages.success %></p><% } %>

    <div class="card" style="margin-top: 20px;">
        <h3>RENAME TEAM GLOBALLY</h3>
        <p style="margin-bottom:15px; opacity:0.8;">Use this to fix typos and merge users into the same team.</p>
        <form method="POST" action="/admin/rename-team" style="display:flex; gap:10px;">
            <input type="text" name="old_name" placeholder="CURRENT TEAM NAME" required style="margin:0;">
            <input type="text" name="new_name" placeholder="NEW TEAM NAME" required style="margin:0;">
            <button type="submit" style="margin:0; min-width: 150px;">RENAME</button>
        </form>
    </div>

    <div class="card" style="margin-top: 20px;">
        <h3>TEAM STATISTICS</h3>
        <table>
            <tr>
                <th>TEAM NAME</th>
                <th>MEMBERS</th>
                <th>TOTAL SCORE</th>
            </tr>
            <% teams.forEach(function(t) { %>
            <tr>
                <td style="font-weight:bold; color:var(--text-color);"><%= t.team_name %></td>
                <td><%= t.members %></td>
                <td style="color: lime;"><%= t.total_score %></td>
            </tr>
            <% }); %>
        </table>
    </div>
</div>

<script src="/static/ajax.js"></script>
</body>
</html>
