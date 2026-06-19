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
        <div class="logo">MANAGE USERS</div>
        <a href="/admin/dashboard">DASHBOARD</a>
    </div>
</div>

<div class="container">
    <div class="admin-nav">
        <a href="/admin/users"><button style="background:var(--text-color); color:black;">👥 USERS</button></a>
        <a href="/admin/teams"><button>🛡️ TEAMS</button></a>
        <a href="/admin/challenges"><button>🎯 CHALLENGES</button></a>
        <a href="/admin/settings"><button>⚙️ SETTINGS</button></a>
    </div>

    <% if (messages.success) { %><p class="msg success"><%= messages.success %></p><% } %>

    <div class="card" style="margin-top: 20px;">
        <h3>ALL REGISTERED USERS</h3>
        <table style="font-size: 14px;">
            <tr>
                <th>USERNAME</th>
                <th>TEAM NAME</th>
                <th>SCORE</th>
                <th>ACTION</th>
            </tr>
            <% users.forEach(function(u) { %>
            <tr>
                <td><%= u.username %></td>
                <form method="POST" action="/admin/edit-user/<%= u.id %>">
                    <td><input type="text" name="team_name" value="<%= u.team_name || '' %>" placeholder="No Team" style="margin:0; padding:5px; font-size:14px;"></td>
                    <td><input type="number" name="score" value="<%= u.score %>" style="margin:0; padding:5px; font-size:14px; width:80px;"></td>
                    <td><button type="submit" style="margin:0; padding:5px 10px; font-size:12px;">SAVE</button></td>
                </form>
            </tr>
            <% }); %>
        </table>
    </div>
</div>

<script src="/static/ajax.js"></script>
</body>
</html>
