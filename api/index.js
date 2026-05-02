const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const SECRET_KEY = 'whatsapp_bot_secret_2026';

// Database sederhana (akan tersimpan di memory, setiap deploy akan reset)
// Untuk production, gunakan database seperti Upstash Redis atau MongoDB Atlas
let database = {
    users: [
        {
            id: 1,
            username: 'owner',
            password: bcrypt.hashSync('owner123', 10),
            role: 'owner',
            name: 'Owner Bot',
            createdAt: new Date().toISOString()
        }
    ],
    botUsers: [
        {
            id: 1,
            number: '6281234567890',
            status: 'active',
            expiredAt: null,
            addedBy: 'owner',
            addedAt: new Date().toISOString()
        }
    ],
    activityLogs: []
};

// Helper functions
function addLog(action, user, target, status = null) {
    database.activityLogs.unshift({
        action,
        user,
        target,
        status,
        time: new Date().toISOString()
    });
    if (database.activityLogs.length > 100) database.activityLogs.pop();
}

function verifyToken(req) {
    const token = req.headers.authorization;
    if (!token) return null;
    try {
        return jwt.verify(token, SECRET_KEY);
    } catch {
        return null;
    }
}

module.exports = async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    const url = req.url;
    const method = req.method;
    
    // ============ LOGIN ============
    if (url === '/api/login' && method === 'POST') {
        const { username, password } = req.body;
        const user = database.users.find(u => u.username === username);
        
        if (!user || !bcrypt.compareSync(password, user.password)) {
            return res.status(401).json({ error: 'Username atau password salah' });
        }
        
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role, name: user.name },
            SECRET_KEY,
            { expiresIn: '7d' }
        );
        
        return res.json({
            success: true,
            token,
            user: { id: user.id, username: user.username, role: user.role, name: user.name }
        });
    }
    
    // Verifikasi token untuk endpoint lain
    const user = verifyToken(req);
    if (!user && url !== '/api/validate-bot') {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    // ============ GET BOT USERS ============
    if (url === '/api/bot-users' && method === 'GET') {
        return res.json({
            users: database.botUsers,
            userRole: user.role
        });
    }
    
    // ============ ADD BOT USER ============
    if (url === '/api/bot-users' && method === 'POST') {
        if (user.role !== 'owner' && user.role !== 'admin') {
            return res.status(403).json({ error: 'Akses ditolak' });
        }
        
        const { number, status, expiredAt } = req.body;
        const existing = database.botUsers.find(u => u.number === number);
        if (existing) {
            return res.status(400).json({ error: 'Nomor sudah terdaftar' });
        }
        
        const newUser = {
            id: Date.now(),
            number: number.replace(/[^0-9]/g, ''),
            status: status || 'active',
            expiredAt: expiredAt || null,
            addedBy: user.username,
            addedAt: new Date().toISOString()
        };
        
        database.botUsers.push(newUser);
        addLog('ADD', user.username, newUser.number);
        
        return res.json({ success: true, user: newUser });
    }
    
    // ============ UPDATE BOT USER ============
    if (url?.startsWith('/api/bot-users/') && method === 'PUT') {
        const id = parseInt(url.split('/').pop());
        const { status, expiredAt } = req.body;
        
        const index = database.botUsers.findIndex(u => u.id === id);
        if (index === -1) return res.status(404).json({ error: 'User tidak ditemukan' });
        
        if (user.role === 'admin') {
            database.botUsers[index].status = status;
        } else if (user.role === 'owner') {
            database.botUsers[index].status = status;
            if (expiredAt) database.botUsers[index].expiredAt = expiredAt;
        } else {
            return res.status(403).json({ error: 'Akses ditolak' });
        }
        
        addLog('UPDATE', user.username, database.botUsers[index].number, status);
        return res.json({ success: true });
    }
    
    // ============ DELETE BOT USER ============
    if (url?.startsWith('/api/bot-users/') && method === 'DELETE') {
        if (user.role !== 'owner') {
            return res.status(403).json({ error: 'Hanya owner yang bisa menghapus' });
        }
        
        const id = parseInt(url.split('/').pop());
        const deleted = database.botUsers.find(u => u.id === id);
        if (!deleted) return res.status(404).json({ error: 'User tidak ditemukan' });
        
        database.botUsers = database.botUsers.filter(u => u.id !== id);
        addLog('DELETE', user.username, deleted.number);
        
        return res.json({ success: true });
    }
    
    // ============ GET SYSTEM USERS (Owner only) ============
    if (url === '/api/system-users' && method === 'GET') {
        if (user.role !== 'owner') {
            return res.status(403).json({ error: 'Akses ditolak' });
        }
        
        return res.json({
            users: database.users.map(u => ({
                id: u.id,
                username: u.username,
                role: u.role,
                name: u.name,
                createdAt: u.createdAt
            }))
        });
    }
    
    // ============ ADD SYSTEM USER (Owner only) ============
    if (url === '/api/system-users' && method === 'POST') {
        if (user.role !== 'owner') {
            return res.status(403).json({ error: 'Akses ditolak' });
        }
        
        const { username, password, role, name } = req.body;
        
        if (database.users.find(u => u.username === username)) {
            return res.status(400).json({ error: 'Username sudah ada' });
        }
        
        const newUser = {
            id: Date.now(),
            username,
            password: bcrypt.hashSync(password, 10),
            role: role || 'admin',
            name,
            createdAt: new Date().toISOString()
        };
        
        database.users.push(newUser);
        addLog('ADD_USER', user.username, username);
        
        return res.json({ success: true, user: newUser });
    }
    
    // ============ DELETE SYSTEM USER (Owner only) ============
    if (url?.startsWith('/api/system-users/') && method === 'DELETE') {
        if (user.role !== 'owner') {
            return res.status(403).json({ error: 'Akses ditolak' });
        }
        
        const id = parseInt(url.split('/').pop());
        const deleted = database.users.find(u => u.id === id);
        if (!deleted || deleted.role === 'owner') {
            return res.status(403).json({ error: 'Tidak bisa menghapus user ini' });
        }
        
        database.users = database.users.filter(u => u.id !== id);
        addLog('DELETE_USER', user.username, deleted.username);
        
        return res.json({ success: true });
    }
    
    // ============ GET LOGS ============
    if (url === '/api/logs' && method === 'GET') {
        let logs = database.activityLogs;
        if (user.role === 'admin') {
            logs = logs.filter(l => l.action !== 'ADD_USER' && l.action !== 'DELETE_USER');
        }
        return res.json({ logs: logs.slice(0, 100) });
    }
    
    // ============ GET STATS ============
    if (url === '/api/stats' && method === 'GET') {
        return res.json({
            stats: {
                totalBotUsers: database.botUsers.length,
                activeUsers: database.botUsers.filter(u => u.status === 'active').length,
                inactiveUsers: database.botUsers.filter(u => u.status !== 'active').length,
                expiredUsers: database.botUsers.filter(u => u.expiredAt && new Date(u.expiredAt) < new Date()).length,
                totalAdmins: database.users.filter(u => u.role === 'admin').length,
                recentActivity: database.activityLogs.slice(0, 10)
            }
        });
    }
    
    // ============ VALIDATE BOT (Untuk Script Bot) ============
    if (url === '/api/validate-bot' && method === 'POST') {
        const { number } = req.body;
        const botUser = database.botUsers.find(u => u.number === number);
        
        if (!botUser) {
            return res.json({ status: false, message: 'Nomor tidak terdaftar', allowed: false });
        }
        
        if (botUser.status !== 'active') {
            return res.json({ status: false, message: 'Nomor tidak aktif', allowed: false });
        }
        
        if (botUser.expiredAt && new Date(botUser.expiredAt) < new Date()) {
            return res.json({ status: false, message: 'Lisensi kadaluarsa', allowed: false });
        }
        
        return res.json({
            status: true,
            message: 'Akses diizinkan',
            allowed: true,
            user: { number: botUser.number, status: botUser.status, expiredAt: botUser.expiredAt }
        });
    }
    
    return res.status(404).json({ error: 'Endpoint tidak ditemukan' });
};
