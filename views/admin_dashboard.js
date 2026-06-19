<!DOCTYPE html>
<html>
<head>
    <title>ZYROFEST-{CTF} ADMIN</title>
    <link rel="stylesheet" href="/static/style.css">
    <style>
        .admin-nav { display: flex; gap: 15px; margin-bottom: 25px; flex-wrap: wrap; }
        .admin-nav a button { width: auto; font-size: 14px; }
        .live-leaderboard { border: 2px solid var(--accent-color); padding: 15px; background: rgba(255,0,85,0.05); }
        .live-leaderboard h3 { color: var(--accent-color); display: flex; justify-content: space-between;}
    </style>
</head>
<body>

<div class="nav">
    <div class="left">
        <div class="logo">ADMIN DASHBOARD</div>
        <a href="/admin/dashboard">DASHBOARD</a>
        <a href="/dashboard">BACK TO CTF</a>
    </div>
    <div class="right">
        <a href="/admin/projector" target="_blank"><button style="border-color: lime; color: lime;">OPEN PROJECTOR</button></a>
    </div>
</div>

<div class="container">
    <h2>CONTROL CENTER</h2>

    <% if (messages.error) { %><p class="msg error"><%= messages.error %></p><% } %>
    <% if (messages.success) { %><p class="msg success"><%= messages.success %></p><% } %>

    <div class="admin-nav">
        <a href="/admin/users"><button>👥 USERS</button></a>
        <a href="/admin/teams"><button>🛡️ TEAMS</button></a>
        <a href="/admin/challenges"><button>🎯 CHALLENGES</button></a>
        <a href="/admin/settings"><button>⚙️ SETTINGS</button></a>
    </div>

    <div class="grid">
        <!-- CTF CONTROL -->
        <div class="card">
            <h3>EVENT CONTROL</h3>
            <p>Status: <strong style="color: <%= ctf_paused ? 'red' : 'lime' %>"><%= ctf_paused ? 'PAUSED' : 'LIVE' %></strong></p>
            <form method="POST" action="/admin/pause">
                <button type="submit" style="width:100%; border-color:<%= ctf_paused ? 'lime' : 'red' %>; color:<%= ctf_paused ? 'lime' : 'red' %>;">
                    <%= ctf_paused ? '▶ RESUME CTF' : '⏸ PAUSE CTF' %>
                </button>
            </form>
        </div>

        <!-- ANNOUNCEMENTS -->
        <div class="card">
            <h3>ANNOUNCEMENTS</h3>
            <form method="POST" action="/admin/notification">
                <textarea name="message" placeholder="ENTER NOTIFICATION MESSAGE" rows="3" required></textarea>
                <button type="submit" style="width:100%;">POST NOTIFICATION</button>
            </form>
            <hr style="border: 1px solid var(--border-color); margin: 15px 0;">
            <table style="font-size: 14px; width: 100%;">
                <% notificationsList.forEach(function(n) { %>
                    <tr>
                        <td style="text-align: left;"><%= n.message %></td>
                        <td style="width: 80px; padding: 5px;">
                            <form method="POST" action="/admin/notification/<%= n.id %>/delete" style="display:inline;">
                                <button type="submit" style="width:100%; padding:5px; margin:0; font-size:12px; border-color: red; color: red;">DEL</button>
                            </form>
                        </td>
                    </tr>
                <% }); %>
            </table>
        </div>
    </div>

    <!-- MINI LEADERBOARD -->
    <div class="live-leaderboard" style="margin-top: 25px;">
        <h3>LIVE LEADERBOARD (TOP 5) <span style="font-size:12px; color:white;">Auto-refreshing</span></h3>
        <table>
            <tr>
                <th>RANK</th>
                <th>USERNAME</th>
                <th>TEAM</th>
                <th>SCORE</th>
            </tr>
            <% topUsers.forEach(function(u, i) { %>
            <tr>
                <td>#<%= i + 1 %></td>
                <td><%= u.username %></td>
                <td><%= u.team_name || 'No Team' %></td>
                <td style="color: lime; font-weight: bold;"><%= u.score %></td>
            </tr>
            <% }); %>
        </table>
    </div>

</div>

<script>
    // Auto refresh mini leaderboard every 10 seconds, but only if no input is focused
    setInterval(() => {
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (activeTag !== 'input' && activeTag !== 'textarea') {
            window.location.reload();
        }
    }, 10000);
</script>

<script src="/static/ajax.js"></script>
</body>
</html>
