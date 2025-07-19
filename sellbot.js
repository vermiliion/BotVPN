const os = require('os');
const sqlite3 = require('sqlite3').verbose();
const express = require('express');
const { Telegraf, session } = require('telegraf');
const app = express();
const axios = require('axios');
const QRISPayment = require('autoft-qris');
const winston = require('winston');
const fetch = require("node-fetch");
const FormData = require("form-data");
const FOLDER_TEMPATDB = "/root/BotVPN/sellvpn.db";
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level.toUpperCase()}]: ${message}`;
    })
  ),
  transports: [
    new winston.transports.File({ filename: 'bot-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'bot-combined.log' }),
  ],
});
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.simple(),
  }));
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const {
  trialssh,
  trialvmess,
  trialvless,
  trialtrojan,
  trialshadowsocks
} = require("./modules/create");

const { 
  createssh, 
  createvmess, 
  createvless, 
  createtrojan, 
  createshadowsocks 
} = require('./modules/create');

const { 
  renewssh, 
  renewvmess, 
  renewvless, 
  renewtrojan, 
  renewshadowsocks 
} = require('./modules/renew');

const fs = require('fs');
const vars = JSON.parse(fs.readFileSync('./.vars.json', 'utf8'));

const SAWERIA_USERNAME = vars.SAWERIA_USERNAME;
const SAWERIA_EMAIL = vars.SAWERIA_EMAIL;

const BOT_TOKEN = vars.BOT_TOKEN;
const port = vars.PORT || 50123;
const ADMIN = vars.USER_ID; 
const NAMA_STORE = vars.NAMA_STORE || 'LITESTORE';
const DATA_QRIS = vars.DATA_QRIS;
const MERCHANT_ID = vars.MERCHANT_ID;
const API_KEY = vars.API_KEY;

const bot = new Telegraf(BOT_TOKEN);
const adminIds = ADMIN;
logger.info('Bot initialized');

const db = new sqlite3.Database('./sellvpn.db', (err) => {
    if (err) {
        logger.error('Kesalahan koneksi SQLite3:', err.message);
    } else {
        logger.info('✅ Terhubung ke SQLite3');

        db.serialize(() => {

            db.run(`
                CREATE TABLE IF NOT EXISTS bonus_config (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    enabled INTEGER DEFAULT 0,
                    min_topup INTEGER DEFAULT 0,
                    bonus_percent INTEGER DEFAULT 0
                )
            `, (err) => {
                if (err) logger.error('❌ Gagal membuat tabel bonus_config:', err.message);
                else logger.info('✅ Tabel bonus_config siap');
            });

            db.run(`
                INSERT OR IGNORE INTO bonus_config (id, enabled, min_topup, bonus_percent)
                VALUES (1, 0, 0, 0)
            `, (err) => {
                if (err) logger.error('❌ Gagal insert default bonus_config:', err.message);
                else logger.info('✅ Default bonus_config dijamin ada');
            });

            
            db.run(`
                CREATE TABLE IF NOT EXISTS bonus_log (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    username TEXT,
                    amount INTEGER,
                    bonus INTEGER,
                    timestamp TEXT
                )
            `, (err) => {
                if (err) logger.error('❌ Gagal membuat tabel bonus_log:', err.message);
                else logger.info('✅ Tabel bonus_log siap');
            });

            db.run(`
                CREATE TABLE IF NOT EXISTS pending_deposits (
                    unique_code TEXT PRIMARY KEY,
                    user_id INTEGER,
                    username TEXT,
                    amount INTEGER,
                    original_amount INTEGER,
                    timestamp INTEGER,
                    status TEXT,
                    qr_message_id INTEGER
                )
            `, (err) => {
                if (err) {
                    logger.error('❌ Gagal membuat tabel pending_deposits:', err.message);
                } else {
                    logger.info('✅ Tabel pending_deposits siap');
                }
            });

            db.run(`
                CREATE TABLE IF NOT EXISTS log_penjualan (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    username TEXT,
                    nama_server TEXT,
                    tipe_akun TEXT,
                    harga INTEGER,
                    masa_aktif_hari INTEGER,
                    waktu_transaksi TEXT,
                    action_type TEXT
                )
            `, (err) => {
                if (err) {
                    logger.error('❌ Gagal membuat tabel log_penjualan:', err.message);
                } else {
                    logger.info('✅ Tabel log_penjualan siap');
                }
            });

        });
    }
});

db.run(`
  CREATE TABLE IF NOT EXISTS topup_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    username TEXT,
    amount INTEGER,
    method TEXT,
    waktu TEXT
  )
`, (err) => {
  if (err) logger.error('❌ Gagal membuat tabel topup_log:', err.message);
  else logger.info('✅ Tabel topup_log siap');
});

db.run(`CREATE TABLE IF NOT EXISTS Server (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT,
  auth TEXT,
  harga INTEGER,
  nama_server TEXT,
  quota INTEGER,
  iplimit INTEGER,
  batas_create_akun INTEGER,
  total_create_akun INTEGER
)`, (err) => {
  if (err) {
    logger.error('Kesalahan membuat tabel Server:', err.message);
  } else {
    logger.info('Server table created or already exists');
  }
});

db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER UNIQUE,
  saldo INTEGER DEFAULT 0,
  CONSTRAINT unique_user_id UNIQUE (user_id)
)`, (err) => {
  if (err) {
    logger.error('Kesalahan membuat tabel users:', err.message);
  } else {
    logger.info('Users table created or already exists');
  }
});

db.run(`
  CREATE TABLE IF NOT EXISTS TrialLog (
    user_id INTEGER,
    date TEXT,
    count INTEGER DEFAULT 0,
    UNIQUE(user_id, date)
)
`);

const lastMenus = {}; 
const userState = {};
logger.info('User state initialized');

bot.command(['start', 'menu'], async (ctx) => {
  logger.info('📥 Perintah /start atau /menu diterima');

  const userId = ctx.from.id;
  const chatId = ctx.chat.id;

  try {
    await ctx.telegram.deleteMessage(chatId, ctx.message.message_id);
    logger.info(`🧹 Pesan command user ${userId} berhasil dihapus`);
  } catch (e) {
    console.warn(`⚠️ Tidak bisa hapus pesan command user ${userId}:`, e.message);
  }

  db.get('SELECT * FROM users WHERE user_id = ?', [userId], (err, row) => {
    if (err) {
      logger.error('❌ Kesalahan saat memeriksa user_id:', err.message);
      return;
    }
    if (!row) {
      db.run('INSERT INTO users (user_id) VALUES (?)', [userId], (err) => {
        if (err) {
          logger.error('❌ Gagal menyimpan user_id:', err.message);
        } else {
          logger.info(`✅ User ID ${userId} berhasil disimpan`);
        }
      });
    } else {
      logger.info(`ℹ️ User ID ${userId} sudah ada`);
    }
  });

  if (lastMenus[userId]) {
    try {
      await ctx.telegram.deleteMessage(chatId, lastMenus[userId]);
      logger.info(`🧹 Menu lama milik ${userId} dihapus`);
    } catch (e) {
      console.warn(`⚠️ Gagal hapus menu lama user ${userId}:`, e.message);
    }
  }

  const sent = await sendMainMenu(ctx);
  if (sent?.message_id) {
    lastMenus[userId] = sent.message_id;
    logger.info(`✅ Menu baru dikirim ke ${userId} dengan message_id ${sent.message_id}`);
  }
});

bot.command('admin', async (ctx) => {
  logger.info('Admin menu requested');
  
  // Hapus pesan command "/admin" user
  try {
    await ctx.telegram.deleteMessage(ctx.chat.id, ctx.message.message_id);
  } catch (e) {}

  if (!adminIds.includes(ctx.from.id)) {
    await ctx.reply('❌ Anda tidak memiliki izin untuk mengakses menu admin.');
    return;
  }

  // Hapus pesan menu admin sebelumnya kalau ada
  if (lastMenus[ctx.from.id]) {
    try {
      await ctx.telegram.deleteMessage(ctx.chat.id, lastMenus[ctx.from.id]);
    } catch (e) {}
    delete lastMenus[ctx.from.id];
  }

  // Kirim menu admin baru
  const sent = await sendAdminMenu(ctx);
  if (sent?.message_id) {
    lastMenus[ctx.from.id] = sent.message_id;
  }
});

async function sendMainMenu(ctx) {
  const keyboard = [
  [{ text: '💠 Trial Akun', callback_data: 'service_trial' }],
  [{ text: '✏️ Buat Akun', callback_data: 'service_create' }, { text: '♻️ Renew Akun', callback_data: 'service_renew' }],
  [{ text: '🛒 Sewa Script', callback_data: 'service_sewascript' }],
  [{ text: '💰 TopUp Saldo', callback_data: 'menu_topup' }]
];

  const uptime = os.uptime();
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  const uptimeFormatted = `${days}d ${hours}h ${minutes}m ${seconds}s`;

  const now = new Date();
  const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const currentDay = dayNames[now.getDay()];
  const currentDate = new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(now);
  const timeNow = now.toTimeString().split(' ')[0];

  const userId = ctx.from.id;
  const username = ctx.from.username ? `@${ctx.from.username}` : 'Tidak tersedia';

  let jumlahServer = 0, jumlahPengguna = 0, saldo = 0;

  try {
    jumlahServer = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) AS count FROM Server', (err, row) => {
        if (err) reject(err); else resolve(row.count);
      });
    });

    jumlahPengguna = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) AS count FROM users', (err, row) => {
        if (err) reject(err); else resolve(row.count);
      });
    });

    saldo = await new Promise((resolve, reject) => {
      db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], (err, row) => {
        if (err) reject(err); else resolve(row ? row.saldo : 0);
      });
    });
  } catch (e) {
    logger.error('Gagal ambil data:', e.message);
  }

  const messageText = `
━━━━━━━━━━━━━━━━━━━━━━
*≡                  ROBOT VPN                 ≡*
━━━━━━━━━━━━━━━━━━━━━━
Selamat datang di *${NAMA_STORE}* 🚀
Bot otomatis untuk membeli
Akun VPN dengan mudah dan cepat.
━━━━━━━━━━━━━━━━━━━━━━
💲 *» Saldo:* \`Rp.${saldo}\`
━━━━━━━━━━━━━━━━━━━━━━
🌀 *» Username:* \`${username}\`
📋 *» Your ID:* \`${userId}\`
♻️ *» Bot Aktif:* \`${uptimeFormatted}\`
✨ *» Trial 2x Sehari *
🥇 *» Support Wildcard & Enhanced*
━━━━━━━━━━━━━━━━━━━━━━
🏷️ *» Jam:* \`${timeNow}\` WIB
🏷️ *» Hari:* \`${currentDay}, ${currentDate}\`
🏷️ *» Server:* \`${jumlahServer}\`
🏷️ *» Total User:* \`${jumlahPengguna}\`
━━━━━━━━━━━━━━━━━━━━━━
♂️ *» Contact:* [@freenet_on](https://t.me/freenet_on)`;

  try {
    const sent = await ctx.reply(messageText, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: keyboard }
    });
    return sent;
  } catch (err) {
    logger.error('Gagal kirim menu utama:', err.message);
  }
}

bot.command('hapuslog', async (ctx) => {
  if (!adminIds.includes(ctx.from.id)) return ctx.reply('Tidak ada izin!');
  try {
    if (fs.existsSync('bot-combined.log')) fs.unlinkSync('bot-combined.log');
    if (fs.existsSync('bot-error.log')) fs.unlinkSync('bot-error.log');
    ctx.reply('Log berhasil dihapus.');
    logger.info('Log file dihapus oleh admin.');
  } catch (e) {
    ctx.reply('Gagal menghapus log: ' + e.message);
    logger.error('Gagal menghapus log: ' + e.message);
  }
});

bot.command('helpadmin', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }
  const helpMessage = `
*📋 Daftar Perintah Admin:*

1. /addserver - Menambahkan server baru.
2. /addsaldo - Menambahkan saldo ke akun pengguna.
3. /editharga - Mengedit harga layanan.
4. /editnama - Mengedit nama server.
5. /editdomain - Mengedit domain server.
6. /editauth - Mengedit auth server.
7. /editlimitquota - Mengedit batas quota server.
8. /editlimitip - Mengedit batas IP server.
9. /editlimitcreate - Mengedit batas pembuatan akun server.
10. /edittotalcreate - Mengedit total pembuatan akun server.
11. /broadcast - Mengirim pesan siaran ke semua pengguna.
12. /hapuslog - Menghapus log bot.

Gunakan perintah ini dengan format yang benar untuk menghindari kesalahan.
`;
  ctx.reply(helpMessage, { parse_mode: 'Markdown' });
});
bot.command('broadcast', async (ctx) => {
  const userId = ctx.message.from.id;

  if (!adminIds.includes(userId)) {
    return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const reply = ctx.message.reply_to_message;
  const inputText = ctx.message.text.split(' ').slice(1).join(' ');

  if (!reply && !inputText) {
    return ctx.reply(
      '📌 *Cara menggunakan perintah broadcast:*\n\n' +
      '1. Balas pesan (teks/gambar/video/dokumen) lalu ketik /broadcast untuk menyiarkan media tersebut\n' +
      '2. Atau langsung kirim `/broadcast Pesanmu` untuk broadcast teks biasa\n\n' +
      'Contoh:\n`/broadcast Hallo semua!`',
      { parse_mode: 'Markdown' }
    );
  }

  db.all("SELECT user_id FROM users", [], async (err, rows) => {
    if (err) {
      logger.error('❌ DB Error saat ambil user untuk broadcast:', err);
      return ctx.reply('⚠️ Gagal mengambil daftar pengguna.');
    }

    let success = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        if (reply && reply.message_id) {
          await bot.telegram.copyMessage(row.user_id, ctx.chat.id, reply.message_id);
        } else if (inputText) {
          await bot.telegram.sendMessage(row.user_id, inputText);
        }

        success++;
        logger.info(`✅ Broadcast sukses ke ${row.user_id}`);
      } catch (error) {
        failed++;

        if (error.response && error.response.error_code === 403) {
          logger.warn(`🚫 User ${row.user_id} blokir bot`);
        } else if (error.response && error.response.error_code === 429) {
          const retryAfter = error.response.parameters?.retry_after || 5;
          logger.warn(`⏳ Telegram rate limit: tunggu ${retryAfter} detik`);
          await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        } else {
          logger.warn(`❌ Gagal broadcast ke ${row.user_id}: ${error.message}`);
        }
      }

      // Delay reguler antar user (aman & cepat)
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    ctx.reply(`📣 Broadcast selesai!\n✅ Berhasil: ${success}\n❌ Gagal: ${failed}`);
  }); 
}); 
function formatRupiah(angka) {
  return `Rp${(angka || 0).toLocaleString('id-ID')}`;
}
bot.action(/^batal_topup_(.+)$/, async (ctx) => {
  const uniqueCode = ctx.match[1];
  const deposit = global.pendingDeposits[uniqueCode];

  if (!deposit) {
    return ctx.answerCbQuery('Transaksi sudah tidak aktif atau telah dibatalkan.', { show_alert: true });
  }

  try {
    // Hapus pesan QR
    if (deposit.qrMessageId) {
      try {
        await bot.telegram.deleteMessage(deposit.userId, deposit.qrMessageId);
      } catch (e) {}
    }

    // Hapus dari pending
    delete global.pendingDeposits[uniqueCode];
    await deletePendingDeposit(uniqueCode);

    await ctx.answerCbQuery('Topup dibatalkan.');

    // ===== Kirim pesan dengan tombol kembali =====
    await ctx.reply('❌ Topup QRIS Orkut telah dibatalkan. Silahkan topup ulang jika ingin mencoba lagi.', {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 Kembali ke Menu Top-up', callback_data: 'menu_topup' }]
        ]
      }
    });
    // =============================================

    // Tambahan: hapus pesan command user (jika diperlukan)
    try {
      const chatId = ctx.chat.id;
      const userId = ctx.from.id;
      // Pastikan ctx.message ada (atau gunakan ctx.update.callback_query.message jika akses via callback)
      const messageId = ctx.update.callback_query.message?.message_id;
      if (messageId) {
        await ctx.telegram.deleteMessage(chatId, messageId);
        logger.info(`🧹 Pesan command user ${userId} berhasil dihapus`);
      }
    } catch (e) {
      const userId = ctx.from.id;
      console.warn(`⚠️ Tidak bisa hapus pesan command user ${userId}:`, e.message);
    }

  } catch (e) {
    logger.error('Gagal batal topup:', e);
    await ctx.answerCbQuery('Gagal batal topup.', { show_alert: true });
  }
});

bot.action('statistik_penjualan', async (ctx) => {
  await ctx.answerCbQuery();

  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
  const startOfWeek = new Date(new Date().setDate(today.getDate() - today.getDay())).toISOString(); // Minggu
  const startOf7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

  db.all(`
    SELECT tipe_akun, COUNT(*) AS jumlah, SUM(harga) AS total_harga
    FROM log_penjualan
    GROUP BY tipe_akun
  `, [], (err, rows) => {
    if (err || rows.length === 0) {
      return ctx.reply('⚠️ Belum ada data penjualan.');
    }

    let totalAkun = 0;
    let totalUang = 0;
    const hasil = rows.map(r => {
      totalAkun += r.jumlah;
      totalUang += r.total_harga;
      return `📦 *${r.tipe_akun.toUpperCase()}*\nJumlah Terjual: ${r.jumlah}\nTotal: ${formatRupiah(r.total_harga)}`;
    }).join('\n\n');

    db.get(`SELECT SUM(harga) AS total FROM log_penjualan WHERE waktu_transaksi >= ?`, [startOfToday], (err1, todayRow) => {
    db.get(`SELECT SUM(harga) AS total FROM log_penjualan WHERE waktu_transaksi >= ?`, [startOf7Days], (err2, week7Row) => {
    db.get(`SELECT SUM(harga) AS total FROM log_penjualan WHERE waktu_transaksi >= ?`, [startOfWeek], (err3, weekRow) => {
    db.get(`SELECT SUM(harga) AS total FROM log_penjualan WHERE waktu_transaksi >= ?`, [startOfMonth], (err4, monthRow) => {

      const totalToday = todayRow?.total || 0;
      const total7Days = week7Row?.total || 0;
      const totalWeek = weekRow?.total || 0;
      const totalMonth = monthRow?.total || 0;

      const message =
        `📊 *Statistik Penjualan per Tipe Akun:*\n\n${hasil}\n\n` +
        `🧾 *Total Semua Akun Terjual:* ${totalAkun}\n` +
        `💰 *Total Uang Masuk:* ${formatRupiah(totalUang)}\n\n` +
        `📅 *Hari Ini:* ${formatRupiah(totalToday)}\n` +
        `📈 *7 Hari Terakhir:* ${formatRupiah(total7Days)}\n` +
        `🗓️ *Minggu Ini:* ${formatRupiah(totalWeek)}\n` +
        `📆 *Bulan Ini:* ${formatRupiah(totalMonth)}`;

      ctx.reply(message, { parse_mode: 'Markdown' });

    }); }); }); });
  });
});
bot.command('addsaldo', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/addsaldo <user_id> <jumlah>`', { parse_mode: 'Markdown' });
  }

  const targetUserId = parseInt(args[1]);
  const amount = parseInt(args[2]);

  if (isNaN(targetUserId) || isNaN(amount)) {
      return ctx.reply('⚠️ `user_id` dan `jumlah` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  if (/\s/.test(args[1]) || /\./.test(args[1]) || /\s/.test(args[2]) || /\./.test(args[2])) {
      return ctx.reply('⚠️ `user_id` dan `jumlah` tidak boleh mengandung spasi atau titik.', { parse_mode: 'Markdown' });
  }

  db.get("SELECT * FROM users WHERE user_id = ?", [targetUserId], (err, row) => {
      if (err) {
          logger.error('⚠️ Kesalahan saat memeriksa `user_id`:', err.message);
          return ctx.reply('⚠️ Kesalahan saat memeriksa `user_id`.', { parse_mode: 'Markdown' });
      }

      if (!row) {
          return ctx.reply('⚠️ `user_id` tidak terdaftar.', { parse_mode: 'Markdown' });
      }

      db.run("UPDATE users SET saldo = saldo + ? WHERE user_id = ?", [amount, targetUserId], function(err) {
          if (err) {
              logger.error('⚠️ Kesalahan saat menambahkan saldo:', err.message);
              return ctx.reply('⚠️ Kesalahan saat menambahkan saldo.', { parse_mode: 'Markdown' });
          }

          if (this.changes === 0) {
              return ctx.reply('⚠️ Pengguna tidak ditemukan.', { parse_mode: 'Markdown' });
          }

          ctx.reply(`✅ Saldo sebesar \`${amount}\` berhasil ditambahkan untuk \`user_id\` \`${targetUserId}\`.`, { parse_mode: 'Markdown' });
      });
  });
});

// ========================= MENU TOPUP PILIHAN ==========================
bot.action('menu_topup', async (ctx) => {
  await ctx.answerCbQuery();

  // Hapus pesan menu topup sebelumnya jika ada
  try {
    if (ctx.callbackQuery?.message?.message_id) {
      await ctx.deleteMessage(ctx.callbackQuery.message.message_id);
    }
  } catch (e) {
    // ignore error
  }

  const config = loadButtonConfig ? loadButtonConfig() : { topup_saldo: true, topup_saweria: true };
  const keyboard = [];
  if (config.topup_saldo)
    keyboard.push([{ text: "💸 Topup QRIS Orkut", callback_data: "topup_saldo" }]);
  if (config.topup_saweria)
    keyboard.push([{ text: "💸 Topup QRIS Saweria", callback_data: "topup_saweria" }]);
  keyboard.push([{ text: "🔙 Kembali", callback_data: "send_main_menu" }]);

  // ...generate messageText sesuai menu_topup lama...
  const messageText = `
━━━━━━━━━━━━━━━━━━━━━━
        🏷️ *≡ BOT PANEL VPN ≡* 🏷️
━━━━━━━━━━━━━━━━━━━━━━
💸 *» Pilih Menu Topup Dibawah Ini:*`;

  const sent = await ctx.reply(messageText, {
    parse_mode: 'Markdown',
    reply_markup: { inline_keyboard: keyboard }
  });

  // Tracking pesan topup yang terakhir (opsional, jika ingin hapus lagi setelahnya)
  if (sent?.message_id) {
    lastMenus[ctx.from.id] = sent.message_id;
  }
});

async function processDepositSaweria(ctx, amount) {
  try {
    const SAWERIA_USERNAME = process.env.SAWERIA_USERNAME || vars.SAWERIA_USERNAME;
    const SAWERIA_EMAIL = process.env.SAWERIA_EMAIL || vars.SAWERIA_EMAIL;

    if (!SAWERIA_USERNAME || !SAWERIA_EMAIL) {
      return ctx.reply('❌ *Konfigurasi Saweria belum lengkap.*', { parse_mode: 'Markdown' });
    }

    const amountInt = parseInt(amount);
    const apiUrl = `https://saweria.autsc.my.id/api/create?username=${encodeURIComponent(SAWERIA_USERNAME)}&amount=${amountInt}&email=${encodeURIComponent(SAWERIA_EMAIL)}`;

    const res = await axios.get(apiUrl);
    const result = res.data;

    if (!result.success || !result.data?.qrImageUrl || !result.data?.transactionId) {
      return ctx.reply('❌ *Gagal membuat QR Saweria.*', { parse_mode: 'Markdown' });
    }

    const { qrImageUrl, transactionId, checkPaymentUrl, timestamp } = result.data;

    // Ambil bonus dari DB
    let bonus = 0;
    let bonus_percent = 0;

    await new Promise((resolve) => {
      db.get('SELECT * FROM bonus_config WHERE id = 1', (err, config) => {
        if (!err && config && config.enabled && amountInt >= config.min_topup) {
          bonus_percent = config.bonus_percent;
          bonus = Math.floor(amountInt * bonus_percent / 100);
        }
        resolve(); // lanjut proses meskipun gagal ambil bonus
      });
    });

    // Simpan ke global
    if (!global.pendingDepositsSaweria) global.pendingDepositsSaweria = {};
    global.pendingDepositsSaweria[transactionId] = {
      userId: ctx.from.id,
      username: ctx.from.username ? `@${ctx.from.username}` : 'Tidak tersedia',
      amount: amountInt,
      bonus,
      bonus_percent,
      created_at: Date.now(),
      checked: false
    };

    const qrMessage = await ctx.replyWithPhoto(qrImageUrl, {
      caption: `❇️ *Informasi Deposit Anda* ❇️

🏷️ *» Kode Transaksi:* \`${transactionId}\`
🏷️ *» Jumlah:* Rp${amountInt.toLocaleString('id-ID')}
🏷️ *» Waktu:* ${timestamp}

🏷️ *» Silahkan scan QR berikut untuk membayar melalui QRIS.*
🏷️ *» Expired:* 5 menit dari sekarang`,
      parse_mode: 'Markdown',
    });

    // Simpan ID pesan
    global.pendingDepositsSaweria[transactionId].qrMessageId = qrMessage.message_id;

  } catch (err) {
    logger.error('❌ Gagal proses QRIS Saweria:', err.stack || err);
    await ctx.reply('❌ *Gagal membuat QRIS Saweria.* Silahkan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
}

setInterval(async () => {
  try {
    const pending = global.pendingDepositsSaweria || {};
    const transactions = Object.entries(pending);

    if (transactions.length === 0) return;

    for (const [idtrx, dep] of transactions) {
      if (dep.checked) continue;

      const depositAge = Date.now() - dep.created_at;

      // ⏳ Jika sudah lebih dari 5 menit = expired
      if (depositAge > 5 * 60 * 1000) {
        try {
          if (dep.qrMessageId) {
            await bot.telegram.deleteMessage(dep.userId, dep.qrMessageId).catch(e =>
              logger.warn(`Gagal hapus pesan QR expired untuk user ${dep.userId}: ${e.message}`)
            );
          }

          await bot.telegram.sendMessage(dep.userId,
            '❌ *Pembayaran Saweria Expired*\n\nWaktu pembayaran telah habis. Silahkan klik Top Up lagi untuk mendapatkan QR baru.',
            { parse_mode: 'Markdown' }
          );

          logger.info(`Transaksi Saweria ${idtrx} expired untuk user ${dep.userId}`);
        } catch (error) {
          logger.error(`Error saat menangani expired ${idtrx}: ${error.message}`);
        } finally {
          delete global.pendingDepositsSaweria[idtrx];
        }
        continue;
      }

      // ✅ Cek status pembayaran
      try {
        const res = await axios.get(`https://saweria.autsc.my.id/check-payment?idtransaksi=${idtrx}`);
        const data = res.data;

        logger.info(`Respons Saweria check-payment untuk ${idtrx}: ${JSON.stringify(data)}`);

        if (data?.success && data.data?.isPaid) {
          dep.checked = true;

          await updateUserBalance(dep.userId, dep.amount);
          logger.info(`SAWERIA QRIS SUKSES user ${dep.userId} nominal Rp${dep.amount}. Saldo diupdate.`);

          await prosesBonusTopUp(dep.userId, dep.username, dep.amount); // ✅ tunggu bonus masuk
          logTopup(dep.userId, dep.username, dep.amount, 'Saweria');

          const saldoTerbaru = await getUserSaldo(dep.userId);

          const depositData = {
            amount: dep.amount,
            originalAmount: dep.amount,
            bonus: dep.bonus || 0,
            bonus_percent: dep.bonus_percent || 0,
            qrMessageId: dep.qrMessageId
          };

          const success = await sendPaymentSuccessNotificationByUserId(
            dep.userId,
            depositData,
            saldoTerbaru,
            dep.username
          );

          if (success && dep.qrMessageId) {
            await bot.telegram.deleteMessage(dep.userId, dep.qrMessageId).catch(e =>
              logger.warn(`Gagal hapus pesan QR berhasil untuk user ${dep.userId}: ${e.message}`)
            );
          }

          delete global.pendingDepositsSaweria[idtrx];
        }

      } catch (e) {
        logger.error(`Cek pembayaran Saweria error untuk ${idtrx}: ${e.message}`);
      }
    }
  } catch (err) {
    logger.error("❌ ERROR FATAL di polling Saweria:", err);
  }
}, 10000);

bot.command('addserver', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 7) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/addserver <domain> <auth> <harga> <nama_server> <quota> <iplimit> <batas_create_account>`', { parse_mode: 'Markdown' });
  }

  const [domain, auth, harga, nama_server, quota, iplimit, batas_create_akun] = args.slice(1);

  const numberOnlyRegex = /^\d+$/;
  if (!numberOnlyRegex.test(harga) || !numberOnlyRegex.test(quota) || !numberOnlyRegex.test(iplimit) || !numberOnlyRegex.test(batas_create_akun)) {
      return ctx.reply('⚠️ `harga`, `quota`, `iplimit`, dan `batas_create_akun` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("INSERT INTO Server (domain, auth, harga, nama_server, quota, iplimit, batas_create_akun) VALUES (?, ?, ?, ?, ?, ?, ?)", 
      [domain, auth, parseInt(harga), nama_server, parseInt(quota), parseInt(iplimit), parseInt(batas_create_akun)], function(err) {
      if (err) {
          logger.error('⚠️ Kesalahan saat menambahkan server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat menambahkan server.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Server \`${nama_server}\` berhasil ditambahkan.`, { parse_mode: 'Markdown' });
  });
});
bot.command('editharga', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editharga <domain> <harga>`', { parse_mode: 'Markdown' });
  }

  const [domain, harga] = args.slice(1);

  if (!/^\d+$/.test(harga)) {
      return ctx.reply('⚠️ `harga` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("UPDATE Server SET harga = ? WHERE domain = ?", [parseInt(harga), domain], function(err) {
      if (err) {
          logger.error('⚠️ Kesalahan saat mengedit harga server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit harga server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Harga server \`${domain}\` berhasil diubah menjadi \`${harga}\`.`, { parse_mode: 'Markdown' });
  });
});

bot.command('editnama', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editnama <domain> <nama_server>`', { parse_mode: 'Markdown' });
  }

  const [domain, nama_server] = args.slice(1);

  db.run("UPDATE Server SET nama_server = ? WHERE domain = ?", [nama_server, domain], function(err) {
      if (err) {
          logger.error('⚠️ Kesalahan saat mengedit nama server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit nama server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Nama server \`${domain}\` berhasil diubah menjadi \`${nama_server}\`.`, { parse_mode: 'Markdown' });
  });
});

bot.command('editdomain', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editdomain <old_domain> <new_domain>`', { parse_mode: 'Markdown' });
  }

  const [old_domain, new_domain] = args.slice(1);

  db.run("UPDATE Server SET domain = ? WHERE domain = ?", [new_domain, old_domain], function(err) {
      if (err) {
          logger.error('⚠️ Kesalahan saat mengedit domain server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit domain server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Domain server \`${old_domain}\` berhasil diubah menjadi \`${new_domain}\`.`, { parse_mode: 'Markdown' });
  });
});

bot.command('editauth', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editauth <domain> <auth>`', { parse_mode: 'Markdown' });
  }

  const [domain, auth] = args.slice(1);

  db.run("UPDATE Server SET auth = ? WHERE domain = ?", [auth, domain], function(err) {
      if (err) {
          logger.error('⚠️ Kesalahan saat mengedit auth server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit auth server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Auth server \`${domain}\` berhasil diubah menjadi \`${auth}\`.`, { parse_mode: 'Markdown' });
  });
});

bot.command('editlimitquota', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editlimitquota <domain> <quota>`', { parse_mode: 'Markdown' });
  }

  const [domain, quota] = args.slice(1);

  if (!/^\d+$/.test(quota)) {
      return ctx.reply('⚠️ `quota` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("UPDATE Server SET quota = ? WHERE domain = ?", [parseInt(quota), domain], function(err) {
      if (err) {
          logger.error('⚠️ Kesalahan saat mengedit quota server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit quota server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Quota server \`${domain}\` berhasil diubah menjadi \`${quota}\`.`, { parse_mode: 'Markdown' });
  });
});

bot.command('editlimitip', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editlimitip <domain> <iplimit>`', { parse_mode: 'Markdown' });
  }

  const [domain, iplimit] = args.slice(1);

  if (!/^\d+$/.test(iplimit)) {
      return ctx.reply('⚠️ `iplimit` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("UPDATE Server SET iplimit = ? WHERE domain = ?", [parseInt(iplimit), domain], function(err) {
      if (err) {
          logger.error('⚠️ Kesalahan saat mengedit iplimit server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit iplimit server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Iplimit server \`${domain}\` berhasil diubah menjadi \`${iplimit}\`.`, { parse_mode: 'Markdown' });
  });
});

bot.command('editlimitcreate', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/editlimitcreate <domain> <batas_create_akun>`', { parse_mode: 'Markdown' });
  }

  const [domain, batas_create_akun] = args.slice(1);

  if (!/^\d+$/.test(batas_create_akun)) {
      return ctx.reply('⚠️ `batas_create_akun` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("UPDATE Server SET batas_create_akun = ? WHERE domain = ?", [parseInt(batas_create_akun), domain], function(err) {
      if (err) {
          logger.error('⚠️ Kesalahan saat mengedit batas_create_akun server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit batas_create_akun server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Batas create akun server \`${domain}\` berhasil diubah menjadi \`${batas_create_akun}\`.`, { parse_mode: 'Markdown' });
  });
});
bot.command('edittotalcreate', async (ctx) => {
  const userId = ctx.message.from.id;
  if (!adminIds.includes(userId)) {
      return ctx.reply('⚠️ Anda tidak memiliki izin untuk menggunakan perintah ini.', { parse_mode: 'Markdown' });
  }

  const args = ctx.message.text.split(' ');
  if (args.length !== 3) {
      return ctx.reply('⚠️ Format salah. Gunakan: `/edittotalcreate <domain> <total_create_akun>`', { parse_mode: 'Markdown' });
  }

  const [domain, total_create_akun] = args.slice(1);

  if (!/^\d+$/.test(total_create_akun)) {
      return ctx.reply('⚠️ `total_create_akun` harus berupa angka.', { parse_mode: 'Markdown' });
  }

  db.run("UPDATE Server SET total_create_akun = ? WHERE domain = ?", [parseInt(total_create_akun), domain], function(err) {
      if (err) {
          logger.error('⚠️ Kesalahan saat mengedit total_create_akun server:', err.message);
          return ctx.reply('⚠️ Kesalahan saat mengedit total_create_akun server.', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
          return ctx.reply('⚠️ Server tidak ditemukan.', { parse_mode: 'Markdown' });
      }

      ctx.reply(`✅ Total create akun server \`${domain}\` berhasil diubah menjadi \`${total_create_akun}\`.`, { parse_mode: 'Markdown' });
  });
});
async function handleServiceAction(ctx, action) {
  let keyboard;
  if (action === 'trial') {
    keyboard = [
      [{ text: '💠 Trial SSH', callback_data: 'trial_ssh' }],
      [{ text: '💠 Trial Vmess', callback_data: 'trial_vmess' }, { text: '💠 Trial Vless', callback_data: 'trial_vless' }],
      [{ text: '💠 Trial Trojan', callback_data: 'trial_trojan' }, { text: '💠 Trial Shadowsocks', callback_data: 'trial_shadowsocks' }],
      [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }]
    ];
  } else if (action === 'create') {
    keyboard = [
      [{ text: '✨ SSH', callback_data: 'create_ssh' }],
      [{ text: '✨ Vmess', callback_data: 'create_vmess' }, { text: '✨ Vless', callback_data: 'create_vless' }],
      [{ text: '✨ Trojan', callback_data: 'create_trojan' }, { text: '✨ Shadowsocks', callback_data: 'create_shadowsocks' }],
      [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }]
    ];
  } else if (action === 'sewascript') {
    keyboard = [
      [{ text: '🥇 Daftar IP', callback_data: 'sewascript_daftar' }, { text: '🥈 Renew IP', callback_data: 'sewascript_perpanjang' }],
      [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }]
    ];
  } else if (action === 'renew') {
    keyboard = [
      [{ text: '♻️ Renew SSH', callback_data: 'renew_ssh' }],
      [{ text: '♻️ Renew Vmess', callback_data: 'renew_vmess' }, { text: '♻️ Renew Vless', callback_data: 'renew_vless' }],
      [{ text: '♻️ Renew Trojan', callback_data: 'renew_trojan' }, { text: '♻️ Renew Shadowsocks', callback_data: 'renew_shadowsocks' }],
      [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }]
    ];
  }
  try {
    await ctx.editMessageReplyMarkup({
      inline_keyboard: keyboard
    });
    logger.info(`${action} service menu sent`);
  } catch (error) {
    if (error.response && error.response.error_code === 400) {
      await ctx.reply(`Pilih jenis layanan yang ingin Anda ${action}:`, {
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
      logger.info(`${action} service menu sent as new message`);
    } else {
      logger.error(`Error saat mengirim menu ${action}:`, error);
    }
  }
}

const BUTTON_CONFIG_FILE = './button_config.json';

function loadButtonConfig() {
  try {
    return JSON.parse(fs.readFileSync(BUTTON_CONFIG_FILE, 'utf8'));
  } catch (e) {
    return { topup_saldo: true, topup_saweria: true };
  }
}

function saveButtonConfig(config) {
  fs.writeFileSync(BUTTON_CONFIG_FILE, JSON.stringify(config, null, 2));
}

bot.action('toggle_topup_saldo', async (ctx) => {
    await ctx.answerCbQuery();
    const config = loadButtonConfig();
    config.topup_saldo = !config.topup_saldo;
    saveButtonConfig(config);
    await sendAdminMenu(ctx);
});

bot.action('toggle_topup_saweria', async (ctx) => {
    await ctx.answerCbQuery();
    const config = loadButtonConfig();
    config.topup_saweria = !config.topup_saweria;
    saveButtonConfig(config);
    await sendAdminMenu(ctx);
});

async function sendAdminMenu(ctx) {
    const config = loadButtonConfig();
    const userId = ctx.from.id;
    const chatId = ctx.chat.id;

    const adminKeyboard = [
        [{ text: '✏️ Tambah Server', callback_data: 'addserver' }, { text: '❌ Hapus Server', callback_data: 'deleteserver' }],
        [{ text: '💲 Edit Harga', callback_data: 'editserver_harga' }, { text: '📝 Edit Nama', callback_data: 'nama_server_edit' }],
        [{ text: '🌐 Edit Domain', callback_data: 'editserver_domain' }, { text: '🔑 Edit Auth', callback_data: 'editserver_auth' }],
        [{ text: '📊 Edit Quota', callback_data: 'editserver_quota' }, { text: '📶 Edit Limit IP', callback_data: 'editserver_limit_ip' }],
        [{ text: '🔢 Edit Batas Create', callback_data: 'editserver_batas_create_akun' }, { text: '🔢 Edit Total Create', callback_data: 'editserver_total_create_akun' }],
        [{ text: '💵 Tambah Saldo', callback_data: 'addsaldo_user' }, { text: '📋 List Server', callback_data: 'listserver' }],
        [{ text: '♻️ Reset Server', callback_data: 'resetdb' }, { text: 'ℹ️ Detail Server', callback_data: 'detailserver' }],
        [{ text: '🎁 Set Bonus TopUp', callback_data: 'bonus_topup_setting' }, { text: '📜 Log Bonus TopUp', callback_data: 'log_bonus_topup' }],
        [{ text: `${config.topup_saldo ? '✅' : '❌'} Topup QRIS Orkut`, callback_data: 'toggle_topup_saldo' },{ text: `${config.topup_saweria ? '✅' : '❌'} Topup QRIS Saweria`, callback_data: 'toggle_topup_saweria' }],
        [{ text: '📈 Hasil Penjualan', callback_data: 'statistik_penjualan' },{ text: '📑 Log Topup', callback_data: 'log_topup' }],
        [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }]
    ];

    const messageText = `
━━━━━━━━━━━━━━━━━━━━━━
      🏷️ *≡ MENU ADMIN VPN ≡* 🏷️
━━━━━━━━━━━━━━━━━━━━━━
💸 *» Pilih Menu Admin Dibawah Ini:*`;

    // Hapus pesan admin sebelumnya (opsional, jika ingin clean)
    if (typeof lastMenus !== 'undefined' && lastMenus[userId]) {
        try { await ctx.telegram.deleteMessage(chatId, lastMenus[userId]); } catch (e) {}
        delete lastMenus[userId];
    }

    // Jika callback, edit pesan, jika gagal kirim baru
    if (ctx.updateType === 'callback_query') {
        try {
            const sent = await ctx.editMessageText(messageText, {
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: adminKeyboard }
            });
            if (sent?.message_id && typeof lastMenus !== 'undefined') lastMenus[userId] = sent.message_id;
            return sent;
        } catch (error) {
            // Kalau gagal edit, lanjut kirim pesan baru
        }
    }

    // Kirim pesan baru jika bukan callback atau edit gagal
    const sent = await ctx.reply(messageText, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: adminKeyboard }
    });
    if (sent?.message_id && typeof lastMenus !== 'undefined') lastMenus[userId] = sent.message_id;
    return sent;
}
bot.action('sewascript_daftar', async (ctx) => {
    try {
        await ctx.deleteMessage();
    } catch (e) {
        console.warn("Gagal menghapus pesan sebelumnya:", e.message);
    }

    userState[ctx.from.id] = { step: 'sewascript_daftar_pilih_bulan' };

    await ctx.reply('📅 Pilih Durasi Sewa Script:', {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '1 Bulan 15K', callback_data: 'daftar_1bln' },
                    { text: '2 Bulan 30K', callback_data: 'daftar_2bln' },
                    { text: '3 Bulan 45K', callback_data: 'daftar_3bln' }
                ],
                [{ text: '🔙 Kembali', callback_data: 'service_sewascript' }]
            ]
        }
    });
});
bot.action('sewascript_perpanjang', async (ctx) => {
    try {
        await ctx.deleteMessage();
    } catch (e) {
        console.warn("Gagal menghapus pesan sebelumnya:", e.message);
    }

    userState[ctx.from.id] = { step: 'sewascript_perpanjang_pilih_bulan' };

    await ctx.reply('📅 Pilih Durasi Perpanjangan Script:', {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '1 Bulan 15K', callback_data: 'perpanjang_1bln' },
                    { text: '2 Bulan 30K', callback_data: 'perpanjang_2bln' },
                    { text: '3 Bulan 45K', callback_data: 'perpanjang_3bln' }
                ],
                [{ text: '🔙 Kembali', callback_data: 'service_sewascript' }]
            ]
        }
    });
});
bot.action(/^daftar_(\d+)bln$/, async (ctx) => {
  try {
    await ctx.deleteMessage();
  } catch (e) {
    console.warn('Gagal hapus pesan tombol:', e.message);
  }

  const bulan = parseInt(ctx.match[1]);
  userState[ctx.from.id] = {
    step: 'sewascript_create_input',
    bulan
  };
  await ctx.reply('♂️ *Masukkan username:*', { parse_mode: 'Markdown' });
});

bot.action(/^perpanjang_(\d+)bln$/, async (ctx) => {
  try {
    await ctx.deleteMessage(); 
  } catch (e) {
    console.warn('Gagal hapus pesan tombol:', e.message);
  }

  const bulan = parseInt(ctx.match[1]);
  userState[ctx.from.id] = {
    step: 'sewascript_perpanjang_ip_manual',
    bulan
  };
  await ctx.reply('🌀 *Masukkan IP yang ingin diperpanjang:*', { parse_mode: 'Markdown' });
});
bot.action('service_sewascript', async (ctx) => {
try {
    await ctx.answerCbQuery();
  } catch (e) {
    // Optional: log warning, jangan crash
    logger.warn('answerCbQuery error:', e.message);
  }
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await handleServiceAction(ctx, 'sewascript');
});
bot.action('service_create', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await handleServiceAction(ctx, 'create');
});
bot.action('trial_ssh', async (ctx) => {
  if (!ctx || !ctx.match) { return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.', { parse_mode: 'Markdown' }); }
  await startSelectServer(ctx, 'trial', 'ssh');
});

bot.action('trial_vmess', async (ctx) => {
  if (!ctx || !ctx.match) { return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.', { parse_mode: 'Markdown' }); }
  await startSelectServer(ctx, 'trial', 'vmess');
});

bot.action('trial_vless', async (ctx) => {
  if (!ctx || !ctx.match) { return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.', { parse_mode: 'Markdown' }); }
  await startSelectServer(ctx, 'trial', 'vless');
});

bot.action('trial_trojan', async (ctx) => {
  if (!ctx || !ctx.match) { return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.', { parse_mode: 'Markdown' }); }
  await startSelectServer(ctx, 'trial', 'trojan');
});

bot.action('trial_shadowsocks', async (ctx) => {
  if (!ctx || !ctx.match) { return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.', { parse_mode: 'Markdown' }); }
  await startSelectServer(ctx, 'trial', 'shadowsocks');
});

bot.action('service_trial', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await handleServiceAction(ctx, 'trial');
});
bot.action('service_renew', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await handleServiceAction(ctx, 'renew');
});

bot.action('send_main_menu', async (ctx) => {
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;

  try {
    await ctx.answerCbQuery();

    if (lastMenus[userId]) {
      try {
        await ctx.telegram.deleteMessage(chatId, lastMenus[userId]);
      } catch (e) {
        console.warn(`⚠️ Gagal hapus menu lama dari ${userId}:`, e.message);
      }
    }

    const sent = await sendMainMenu(ctx);
    if (sent?.message_id) {
      lastMenus[userId] = sent.message_id;
    }

  } catch (error) {
    logger.error('❌ Gagal handle send_main_menu:', error.message);
    await ctx.reply('❌ *Gagal memproses menu utama.*', { parse_mode: 'Markdown' });
  }
});

bot.action('create_vmess', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'create', 'vmess');
});

bot.action('create_vless', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'create', 'vless');
});

bot.action('create_trojan', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'create', 'trojan');
});

bot.action('create_shadowsocks', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'create', 'shadowsocks');
});

bot.action('create_ssh', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'create', 'ssh');
});

bot.action('renew_vmess', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'renew', 'vmess');
});

bot.action('renew_vless', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'renew', 'vless');
});

bot.action('renew_trojan', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'renew', 'trojan');
});

bot.action('renew_shadowsocks', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'renew', 'shadowsocks');
});

bot.action('renew_ssh', async (ctx) => {
  if (!ctx || !ctx.match) {
    return ctx.reply('❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.', { parse_mode: 'Markdown' });
  }
  await startSelectServer(ctx, 'renew', 'ssh');
});
async function startSelectServer(ctx, action, type, page = 0) {
  try {
    logger.info(`Memulai proses ${action} untuk ${type} di halaman ${page + 1}`);

    db.all('SELECT * FROM Server', [], (err, servers) => {
      if (err) {
        logger.error('⚠️ Error fetching servers:', err.message);
        return ctx.reply('⚠️ *PERHATIAN!* Tidak ada server yang tersedia saat ini. Coba lagi nanti!', { parse_mode: 'Markdown' });
      }

      if (servers.length === 0) {
        logger.info('Tidak ada server yang tersedia');
        return ctx.reply('⚠️ *PERHATIAN!* Tidak ada server yang tersedia saat ini. Coba lagi nanti!', { parse_mode: 'Markdown' });
      }

      const serversPerPage = 6;
      const totalPages = Math.ceil(servers.length / serversPerPage);
      const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
      const start = currentPage * serversPerPage;
      const end = start + serversPerPage;
      const currentServers = servers.slice(start, end);

      const keyboard = [];
      for (let i = 0; i < currentServers.length; i += 2) {
        const row = [];
        const server1 = currentServers[i];
        const server2 = currentServers[i + 1];
        const server1Text = `${server1.nama_server}`;
        row.push({ text: server1Text, callback_data: `${action}_username_${type}_${server1.id}` });

        if (server2) {
          const server2Text = `${server2.nama_server}`;
          row.push({ text: server2Text, callback_data: `${action}_username_${type}_${server2.id}` });
        }
        keyboard.push(row);
      }
      
        if (action === 'trial') {
          userState[ctx.chat.id] = { step: `execute_trial_${type}`, page: currentPage, serverId: null }; 
       } else {
          userState[ctx.chat.id] = { step: `${action}_username_${type}`, page: currentPage };
       }      
       
      const navButtons = [];
      if (totalPages > 1) { 
        if (currentPage > 0) {
          navButtons.push({ text: '⬅️ Back', callback_data: `navigate_${action}_${type}_${currentPage - 1}` });
        }
        if (currentPage < totalPages - 1) {
          navButtons.push({ text: '➡️ Next', callback_data: `navigate_${action}_${type}_${currentPage + 1}` });
        }
      }
      if (navButtons.length > 0) {
        keyboard.push(navButtons);
      }
      keyboard.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]);

      const serverList = currentServers.map(server => {
        const hargaPer30Hari = server.harga * 30; 
        const isFull = server.total_create_akun >= server.batas_create_akun;
        return `🌐 *${server.nama_server}*\n` +
               `💰 Harga per hari: Rp${server.harga}\n` +
               `📅 Harga per 30 hari: Rp${hargaPer30Hari}\n` +
               `📊 Quota: ${server.quota}GB\n` +
               `🔢 Limit IP: ${server.iplimit} IP\n` +
               (isFull ? `⚠️ *Server Penuh*` : `👥 Total Create Akun: ${server.total_create_akun}/${server.batas_create_akun}`);
      }).join('\n\n');

      if (ctx.updateType === 'callback_query') {
        ctx.editMessageText(`📋 *List Server (Halaman ${currentPage + 1} dari ${totalPages}):*\n\n${serverList}`, {
          reply_markup: {
            inline_keyboard: keyboard
          },
          parse_mode: 'Markdown'
        });
      } else {
        ctx.reply(`📋 *List Server (Halaman ${currentPage + 1} dari ${totalPages}):*\n\n${serverList}`, {
          reply_markup: {
            inline_keyboard: keyboard
          },
          parse_mode: 'Markdown'
        });
      }
      userState[ctx.chat.id] = { step: `${action}_username_${type}`, page: currentPage };
    });
  } catch (error) {
    logger.error(`❌ Error saat memulai proses ${action} untuk ${type}:`, error);
    await ctx.reply(`❌ *GAGAL!* Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.`, { parse_mode: 'Markdown' });
  }
}

bot.action(/navigate_(\w+)_(\w+)_(\d+)/, async (ctx) => {
  const [, action, type, page] = ctx.match;
  await startSelectServer(ctx, action, type, parseInt(page, 10));
});
bot.action(/^(create|renew|trial)_username_(vmess|vless|trojan|shadowsocks|ssh)_(.+)$/, async (ctx) => {
  await ctx.telegram.answerCbQuery(ctx.callbackQuery.id);

  const match = ctx.match || [];
  const action = match[1];
  const type = match[2];
  const serverId = match[3];

  if (!action || !type || !serverId) {
    return ctx.reply('❌ *Perintah tidak dikenali.*', { parse_mode: 'Markdown' });
  }

  if (action === 'trial') {
  const userId = ctx.from.id;
  const today = new Date().toISOString().split('T')[0];

  if (userId == ADMIN) {
    
    return await handleTrial(ctx, type, serverId);
  }

  db.get('SELECT batas_create_akun, total_create_akun FROM Server WHERE id = ?', [serverId], (err, server) => {
    if (err) {
      logger.error('❌ Error fetching server details:', err.message);
      return ctx.reply('❌ *Terjadi kesalahan saat mengambil detail server.*', { parse_mode: 'Markdown' });
    }

    if (!server) {
      return ctx.reply('❌ *Server tidak ditemukan.*', { parse_mode: 'Markdown' });
    }

    const { batas_create_akun, total_create_akun } = server;

    if (total_create_akun >= batas_create_akun) {
      return ctx.reply('❌ *Server penuh. Trial tidak dapat dibuat di server ini.*', { parse_mode: 'Markdown' });
    }

    db.get('SELECT count FROM TrialLog WHERE user_id = ? AND date = ?', [userId, today], async (err, row) => {
      if (err) {
        logger.error('❌ Error saat cek log trial:', err);
        return ctx.reply('❌ *Terjadi kesalahan saat memproses trial. Silahkan coba lagi nanti.*', { parse_mode: 'Markdown' });
      }

      const trialCount = row?.count || 0;

      if (trialCount >= 2) {
        return ctx.reply('⚠️ *Kamu sudah trial hari ini, Gass Order* 😖', { parse_mode: 'Markdown' });
      }

      await handleTrial(ctx, type, serverId);

      const newCount = trialCount + 1;
      db.run(`
        INSERT INTO TrialLog (user_id, date, count)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, date) DO UPDATE SET count = ?
      `, [userId, today, newCount, newCount]);
    });
  });  

  } else {
  	
    userState[ctx.chat.id] = { step: `username_${action}_${type}`, serverId, type, action };

    db.get('SELECT batas_create_akun, total_create_akun FROM Server WHERE id = ?', [serverId], async (err, server) => {
      if (err) {
        logger.error('⚠️ Error fetching server details:', err.message);
        return ctx.reply('❌ *Terjadi kesalahan saat mengambil detail server.*', { parse_mode: 'Markdown' });
      }

      if (!server) {
        return ctx.reply('❌ *Server tidak ditemukan.*', { parse_mode: 'Markdown' });
      }

      const { batas_create_akun, total_create_akun } = server;

      if (total_create_akun >= batas_create_akun) {
        return ctx.reply('❌ *Server penuh. Tidak dapat membuat akun baru di server ini.*', { parse_mode: 'Markdown' });
      }

      await ctx.reply('👤 *Masukkan username:*', { parse_mode: 'Markdown' });
    });
  }
});
async function handleTrial(ctx, type, serverId) {
  try {
    const username = `trial${Math.floor(Math.random() * 10000)}`;
    const password = Math.random().toString(36).slice(-6);
    const exp = 1;
    const quota = 1;
    const iplimit = 1;

    let msg;
    switch (type) {
      case 'vmess':
        msg = await trialvmess(username, exp, quota, iplimit, serverId);
        break;
      case 'vless':
        msg = await trialvless(username, exp, quota, iplimit, serverId);
        break;
      case 'trojan':
        msg = await trialtrojan(username, exp, quota, iplimit, serverId);
        break;
      case 'shadowsocks':
        msg = await trialshadowsocks(username, exp, quota, iplimit, serverId);
        break;
      case 'ssh':
        msg = await trialssh(username, password, exp, iplimit, serverId);
        break;
      default:
        msg = '❌ *Tipe layanan tidak dikenali.*';
    }

    if (msg) {
      await ctx.reply(msg, { parse_mode: 'Markdown' });
    }

  } catch (error) {
    logger.error(`❌ Error trial ${type}:`, error);
    await ctx.reply('❌ *Gagal membuat akun trial. Silahkan coba lagi nanti.*', { parse_mode: 'Markdown' });
  } finally {
    delete userState[ctx.chat.id];
  }
}
function kaburMark(text) {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

async function showLoading(ctx, durasi = 20000) {
  const waitMsg = await ctx.reply("⏳ Loading");

  const dots = [".", "..", "...", "....", " "];
  let i = 0;

  const interval = setInterval(async () => {
    i = (i + 1) % dots.length;
    try {
      await ctx.telegram.editMessageText(
        ctx.chat.id,
        waitMsg.message_id,
        null,
        `⏳ Loading${dots[i]}`
      );
    } catch (e) {
      clearInterval(interval);
    }
  }, 1000);

  await new Promise(resolve => setTimeout(resolve, durasi));
  clearInterval(interval);

  return waitMsg;
}


bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const state = userState[userId];

  // 🔍 Debug log input teks user
  console.log(`📩 Input dari ${userId}: ${ctx.message.text}`);
  logger.info(`📩 Input teks dari ${userId}: ${ctx.message.text}`);

  // ✅ Tangani input nominal topup Saweria dulu
  if (global.depositState && global.depositState[userId]?.action === 'request_amount_saweria') {
    const input = ctx.message.text.trim();
    const nominal = parseInt(input.replace(/[^\d]/g, ''), 10);

    if (isNaN(nominal) || nominal < 100) {
      return ctx.reply('❌ *Nominal tidak valid. Minimal Rp100.*', { parse_mode: 'Markdown' });
    }

    delete global.depositState[userId]; // hapus state
    await ctx.reply(`⏳ Memproses QRIS Saweria untuk Rp${nominal}...`);
    await processDepositSaweria(ctx, nominal);
    return;
  }

  // 👤 Input username untuk sewa script
  if (state && state.step === 'sewascript_create_input') {
    const username = ctx.message.text.trim();

    if (!/^[a-zA-Z0-9]{3,20}$/.test(username)) {
      return ctx.reply('❌ *Username tidak valid. Harus 3-20 karakter alfanumerik.*', { parse_mode: 'Markdown' });
    }

    userState[userId] = {
      step: 'sewascript_create_input_ip',
      username,
      bulan: state.bulan
    };

    await ctx.reply('🏷️ *Masukkan IP Address:*', { parse_mode: 'Markdown' });
    return;
  }

  // 🌐 Input IP Address untuk daftar script
  if (state && state.step === 'sewascript_create_input_ip') {
    const ip = ctx.message.text.trim();
    const { username, bulan } = state;

    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
      return ctx.reply('❌ *Format IP tidak valid.* Masukkan IP seperti 123.45.67.89', { parse_mode: 'Markdown' });
    }

    const priceharga = 15000 * bulan;

    db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], async (err, user) => {
      if (err || !user) {
        return ctx.reply('❌ Terjadi kesalahan mengambil saldo pengguna.', { parse_mode: 'Markdown' });
      }

      if (user.saldo < priceharga) {
        return ctx.reply('❌ *Saldo Anda tidak cukup.*', { parse_mode: 'Markdown' });
      }

      const { exec } = require('child_process');
      const cmd = `/usr/local/sbin/literegis ${username} ${bulan} ${ip}`;
      const { waitMsg, interval } = await showLoading(ctx);

      exec(cmd, async (error, stdout, stderr) => {
        clearInterval(interval);

        const output = error || /gagal|error/i.test(stdout)
          ? `❌ Gagal daftar script:\n\n${stdout || stderr}`
          : `✅ Pendaftaran IP Berhasil:\n${stdout}`;

        try {
          await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, output, { parse_mode: 'HTML' });
        } catch (e) {
          await ctx.reply(output, { parse_mode: 'HTML' });
        }

        if (!error && !/gagal|error/i.test(stdout)) {
          db.run('UPDATE users SET saldo = saldo - ? WHERE user_id = ?', [priceharga, userId]);
        }
      });
    });

       delete userState[userId];
       return;
    }

    if (state && state.step === 'sewascript_perpanjang_ip_manual') {
    const ip = ctx.message.text.trim();
    const bulan = state.bulan;

    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
        return ctx.reply('❌ *Format IP tidak valid.* Masukkan IP seperti 123.45.67.89', { parse_mode: 'Markdown' });
    }

    const priceharga = 15000 * bulan;

    db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], async (err, user) => {
        if (err || !user) {
            return ctx.reply('❌ Terjadi kesalahan mengambil saldo pengguna.', { parse_mode: 'Markdown' });
        }

        if (user.saldo < priceharga) {
            return ctx.reply('❌ *Saldo Anda tidak cukup untuk memperpanjang.*', { parse_mode: 'Markdown' });
        }

        const { exec } = require('child_process');
        const jumlahHari = bulan * 30;
        const cmd = `/usr/local/sbin/liteextend ${ip} ${jumlahHari}`;

        const { waitMsg, interval } = await showLoading(ctx);

        exec(cmd, async (error, stdout, stderr) => {
            clearInterval(interval);

            const output = error || /gagal|error/i.test(stdout)
            ? `❌ Gagal memperpanjang script:\n\n${stdout || stderr}`
            : `✅ Perpanjangan IP Berhasil:\n${stdout}`;

            try {
                await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, output, { parse_mode: 'HTML' });
            } catch (e) {
                await ctx.reply(output, { parse_mode: 'HTML' });
            }

            if (!error && !/gagal|error/i.test(stdout)) {
                db.run('UPDATE users SET saldo = saldo - ? WHERE user_id = ?', [priceharga, userId]);
            }
        });
    });

        delete userState[userId];
        return;
    }

    if (state && state.step === 'atur_bonus_input') {
        const [status, minStr, persenStr] = ctx.message.text.trim().split(/\s+/); 
        const min = parseInt(minStr, 10);
        const persen = parseInt(persenStr, 10);

        if (!status || isNaN(min) || isNaN(persen)) {
            return ctx.reply('⚠️ Format salah. Gunakan: `on|off <minimal_topup> <persen_bonus>`\nContoh: `on 10000 25`', { parse_mode: 'Markdown' });
        }

        const enabled = status.toLowerCase() === 'on' ? 1 : 0;
        db.run('UPDATE bonus_config SET enabled = ?, min_topup = ?, bonus_percent = ? WHERE id = 1',
            [enabled, min, persen],
            (err) => {
                if (err) {
                    logger.error('❌ Gagal update bonus config:', err.message);
                    return ctx.reply('❌ Gagal menyimpan pengaturan bonus.');
                }
                ctx.reply(`✅ Bonus Top Up *${enabled ? 'Aktif' : 'Nonaktif'}*
📌 Minimal Top Up: Rp${min}
🎁 Bonus: ${persen}%`, {
                    parse_mode: 'Markdown'
                });
                delete userState[userId];
            }
        );
        return;
    }

    if (state && state.step.startsWith('username_')) {
        state.username = ctx.message.text.trim();
        if (!state.username) {
            return ctx.reply('❌ *Username tidak valid. Masukkan username yang valid.*', { parse_mode: 'Markdown' });
        }
        if (state.username.length < 3 || state.username.length > 20) {
            return ctx.reply('❌ *Username harus terdiri dari 3 hingga 20 karakter.*', { parse_mode: 'Markdown' });
        }
        if (/[^a-zA-Z0-9]/.test(state.username)) {
            return ctx.reply('❌ *Username tidak boleh mengandung karakter khusus atau spasi.*', { parse_mode: 'Markdown' });
        }
        const { username, serverId, type, action } = state;
        if (action === 'create') {
            if (type === 'ssh') {
                userState[userId].step = `password_${state.action}_${state.type}`;
                await ctx.reply('🔑 *Masukkan password:*', { parse_mode: 'Markdown' });
            } else {
                userState[userId].step = `exp_${state.action}_${state.type}`;
                await ctx.reply('⏳ *Masukkan masa aktif (hari):*', { parse_mode: 'Markdown' });
            }
        } else if (action === 'renew') {
            userState[userId].step = `exp_${state.action}_${state.type}`;
            await ctx.reply('⏳ *Masukkan masa aktif (hari):*', { parse_mode: 'Markdown' });
        }
        return;
    }

    if (state && state.step.startsWith('password_')) {
        state.password = ctx.message.text.trim();
        if (!state.password) {
            return ctx.reply('❌ *Password tidak valid. Masukkan password yang valid.*', { parse_mode: 'Markdown' });
        }
        if (state.password.length < 1) {
            return ctx.reply('❌ *Password harus terdiri dari minimal 1 karakter.*', { parse_mode: 'Markdown' });
        }
        if (/[^a-zA-Z0-9]/.test(state.password)) {
            return ctx.reply('❌ *Password tidak boleh mengandung karakter khusus atau spasi.*', { parse_mode: 'Markdown' });
        }
        userState[userId].step = `exp_${state.action}_${state.type}`; 
        await ctx.reply('⏳ *Masukkan masa aktif (hari):*', { parse_mode: 'Markdown' });
        return;
    }

    if (state && state.step.startsWith('exp_')) {
        const expInput = ctx.message.text.trim();
        if (!/^\d+$/.test(expInput)) {
            return ctx.reply('❌ *Masa aktif tidak valid. Masukkan angka yang valid.*', { parse_mode: 'Markdown' });
        }
        const exp = parseInt(expInput, 10);
        if (isNaN(exp) || exp <= 0) {
            return ctx.reply('❌ *Masa aktif tidak valid. Masukkan angka yang valid.*', { parse_mode: 'Markdown' });
        }
        if (exp > 365) {
            return ctx.reply('❌ *Masa aktif tidak boleh lebih dari 365 hari.*', { parse_mode: 'Markdown' });
        }
        state.exp = exp;

        db.get('SELECT quota, iplimit, harga FROM Server WHERE id = ?', [state.serverId], async (err, server) => {
            if (err) {
                logger.error('⚠️ Error fetching server details:', err.message);
                return ctx.reply('❌ *Terjadi kesalahan saat mengambil detail server.*', { parse_mode: 'Markdown' });
            }

            if (!server) {
                return ctx.reply('❌ *Server tidak ditemukan.*', { parse_mode: 'Markdown' });
            }

            const harga = server.harga;
            const totalHarga = harga * state.exp;

            db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], async (err, user) => {
                if (err) {
                    logger.error('⚠️ Kesalahan saat mengambil saldo pengguna:', err.message);
                    return ctx.reply('❌ *Terjadi kesalahan saat mengambil saldo pengguna.*', { parse_mode: 'Markdown' });
                }

                if (!user) {
                    return ctx.reply('❌ *Pengguna tidak ditemukan.*', { parse_mode: 'Markdown' });
                }

                const saldo = user.saldo;

                if (saldo < totalHarga) {
                    delete userState[userId];
                    return ctx.reply('❌ *Saldo Anda tidak mencukupi untuk melakukan transaksi ini.*', { parse_mode: 'Markdown' });
                }

                let msg;
                let successAction = false;

                // Pastikan actionTypeLabel dideklarasikan di sini atau di scope yang lebih tinggi
                let actionTypeLabel = ''; 

                if (state.action === 'create') {
                    actionTypeLabel = 'Buat Akun'; // Didefinisikan di sini
                    try { // Menambahkan try...catch di sini
                        switch (state.type) {
                            case 'vmess': msg = await createvmess(state.username, exp, server.quota, server.iplimit, state.serverId); break;
                            case 'vless': msg = await createvless(state.username, exp, server.quota, server.iplimit, state.serverId); break;
                            case 'trojan': msg = await createtrojan(state.username, exp, server.quota, server.iplimit, state.serverId); break;
                            case 'shadowsocks': msg = await createshadowsocks(state.username, exp, server.quota, server.iplimit, state.serverId); break;
                            case 'ssh': msg = await createssh(state.username, state.password, exp, server.iplimit, state.serverId); break;
                        }
                        if (msg && !msg.toLowerCase().includes('gagal') && !msg.toLowerCase().includes('error')) {
                            successAction = true;
                        } else {
                            // Jika msg null/undefined atau mengandung "gagal"/"error", anggap gagal
                            logger.error(`Aksi pembuatan akun ${state.type} mengembalikan pesan gagal: ${msg}`);
                        }
                    } catch (e) {
                        logger.error(`Error saat memanggil fungsi pembuatan akun ${state.type}:`, e.message);
                        msg = 'Terjadi kesalahan internal saat membuat akun.';
                        successAction = false; // Pastikan ini false jika ada exception
                    }
                } else if (state.action === 'renew') {
                    actionTypeLabel = 'Perpanjang Akun'; // Didefinisikan di sini
                    try { // Menambahkan try...catch di sini
                        switch (state.type) {
                            case 'vmess': msg = await renewvmess(state.username, exp, server.quota, server.iplimit, state.serverId); break;
                            case 'vless': msg = await renewvless(state.username, exp, server.quota, server.iplimit, state.serverId); break;
                            case 'trojan': msg = await renewtrojan(state.username, exp, server.quota, server.iplimit, state.serverId); break;
                            case 'shadowsocks': msg = await renewshadowsocks(state.username, exp, server.quota, server.iplimit, state.serverId); break;
                            case 'ssh': msg = await renewssh(state.username, exp, server.iplimit, state.serverId); break;
                        }
                        if (msg && !msg.toLowerCase().includes('gagal') && !msg.toLowerCase().includes('error')) {
                            successAction = true;
                        } else {
                            // Jika msg null/undefined atau mengandung "gagal"/"error", anggap gagal
                            logger.error(`Aksi perpanjangan akun ${state.type} mengembalikan pesan gagal: ${msg}`);
                        }
                    } catch (e) {
                        logger.error(`Error saat memanggil fungsi perpanjangan akun ${state.type}:`, e.message);
                        msg = 'Terjadi kesalahan internal saat memperpanjang akun.';
                        successAction = false; // Pastikan ini false jika ada exception
                    }
                }

                if (!successAction) {
                    delete userState[userId];
                    return ctx.reply('❌ *Pembuatan/Renew akun gagal. Saldo tidak dipotong.*', { parse_mode: 'Markdown' });
                }

                // Saldo dikurangi
                db.run('UPDATE users SET saldo = saldo - ? WHERE user_id = ?', [totalHarga, userId], (err) => {
                    if (err) {
                        logger.error('⚠️ Kesalahan saat mengurangi saldo pengguna:', err.message);
                        // Pertimbangkan apa yang harus dilakukan jika pengurangan saldo gagal setelah successAction = true
                        // Mungkin perlu mekanisme rollback atau notifikasi khusus.
                    }
                });
                    
                // total_create_akun ditambah
                db.run('UPDATE Server SET total_create_akun = total_create_akun + 1 WHERE id = ?', [state.serverId], (err) => {
                    if (err) {
                        logger.error('⚠️ Kesalahan saat menambahkan total_create_akun:', err.message);
                    }
                });

                // Catat log penjualan
                db.run(`INSERT INTO log_penjualan (
                    user_id,
                    username,
                    nama_server,
                    tipe_akun,
                    harga,
                    masa_aktif_hari,
                    waktu_transaksi,
                    action_type
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
                    ctx.from.id,
                    ctx.from.username || '',
                    server.nama_server || 'Unknown',
                    state.type,
                    totalHarga, 
                    state.exp,
                    new Date().toISOString(),
                    state.action 
                ], (err) => {
                    if (err) {
                        logger.warn('⚠️ Gagal mencatat log penjualan:', err.message);
                    } else {
                        logger.info(`✅ Log penjualan dicatat: ${ctx.from.id} - ${state.type} - ${state.action} - Rp${totalHarga}`);
                    }
                });

                // === Panggil afterAccountTransaction di sini ===
                await afterAccountTransaction({
                    userId: userId,
                    username: ctx.from.username, 
                    produk: state.type.toUpperCase(),
                    serverId: state.serverId,
                    jenis: actionTypeLabel,
                    durasi: state.exp
                });

                await ctx.reply(msg, { parse_mode: 'Markdown' });
                delete userState[userId];
             }); 
         }); 
        return; 
    } 

    if (state.step === 'addserver') {
        const domain = ctx.message.text.trim();
        if (!domain) {
            return ctx.reply('⚠️ *Domain tidak boleh kosong.* Silahkan masukkan domain server yang valid.', { parse_mode: 'Markdown' });
        }
        userState[userId].step = 'addserver_auth';
        userState[userId].domain = domain;
        await ctx.reply('🔑 *Silahkan masukkan auth server:*', { parse_mode: 'Markdown' });
        return;
    } else if (state.step === 'addserver_auth') {
        const auth = ctx.message.text.trim();
        if (!auth) {
            return ctx.reply('⚠️ *Auth tidak boleh kosong.* Silahkan masukkan auth server yang valid.', { parse_mode: 'Markdown' });
        }
        userState[userId].step = 'addserver_nama_server';
        userState[userId].auth = auth;
        await ctx.reply('🏷️ *Silahkan masukkan nama server:*', { parse_mode: 'Markdown' });
        return;
    } else if (state.step === 'addserver_nama_server') {
        const nama_server = ctx.message.text.trim();
        if (!nama_server) {
            return ctx.reply('⚠️ *Nama server tidak boleh kosong.* Silahkan masukkan nama server yang valid.', { parse_mode: 'Markdown' });
        }
        userState[userId].step = 'addserver_quota';
        userState[userId].nama_server = nama_server;
        await ctx.reply('📊 *Silahkan masukkan quota server:*', { parse_mode: 'Markdown' });
        return;
    } else if (state.step === 'addserver_quota') {
        const quota = parseInt(ctx.message.text.trim(), 10);
        if (isNaN(quota)) {
            return ctx.reply('⚠️ *Quota tidak valid.* Silahkan masukkan quota server yang valid.', { parse_mode: 'Markdown' });
        }
        userState[userId].step = 'addserver_iplimit';
        userState[userId].quota = quota;
        await ctx.reply('🔢 *Silahkan masukkan limit IP server:*', { parse_mode: 'Markdown' });
        return;
    } else if (state.step === 'addserver_iplimit') {
        const iplimit = parseInt(ctx.message.text.trim(), 10);
        if (isNaN(iplimit)) {
            return ctx.reply('⚠️ *Limit IP tidak valid.* Silahkan masukkan limit IP server yang valid.', { parse_mode: 'Markdown' });
        }
        userState[userId].step = 'addserver_batas_create_akun';
        userState[userId].iplimit = iplimit;
        await ctx.reply('🔢 *Silahkan masukkan batas create akun server:*', { parse_mode: 'Markdown' });
        return;
    } else if (state.step === 'addserver_batas_create_akun') {
        const batas_create_akun = parseInt(ctx.message.text.trim(), 10);
        if (isNaN(batas_create_akun)) {
            return ctx.reply('⚠️ *Batas create akun tidak valid.* Silahkan masukkan batas create akun server yang valid.', { parse_mode: 'Markdown' });
        }
        userState[userId].step = 'addserver_harga';
        userState[userId].batas_create_akun = batas_create_akun;
        await ctx.reply('💰 *Silahkan masukkan harga server:*', { parse_mode: 'Markdown' });
        return;
    } else if (state.step === 'addserver_harga') {
        const harga = parseFloat(ctx.message.text.trim());
        if (isNaN(harga) || harga <= 0) {
            return ctx.reply('⚠️ *Harga tidak valid.* Silahkan masukkan harga server yang valid.', { parse_mode: 'Markdown' });
        }
        const { domain, auth, nama_server, quota, iplimit, batas_create_akun } = state;

        try {
            db.run('INSERT INTO Server (domain, auth, nama_server, quota, iplimit, batas_create_akun, harga, total_create_akun) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [domain, auth, nama_server, quota, iplimit, batas_create_akun, harga, 0], function(err) {
                    if (err) {
                        logger.error('Error saat menambahkan server:', err.message);
                        ctx.reply('❌ *Terjadi kesalahan saat menambahkan server baru.*', { parse_mode: 'Markdown' });
                    } else {
                        ctx.reply(`✅ *Server baru dengan domain ${domain} telah berhasil ditambahkan.*\n\n📄 *Detail Server:*\n- Domain: ${domain}\n- Auth: ${auth}\n- Nama Server: ${nama_server}\n- Quota: ${quota}\n- Limit IP: ${iplimit}\n- Batas Create Akun: ${batas_create_akun}\n- Harga: Rp ${harga}`, { parse_mode: 'Markdown' });
                    }
                });
        } catch (error) {
            logger.error('Error saat menambahkan server:', error);
            await ctx.reply('❌ *Terjadi kesalahan saat menambahkan server baru.*', { parse_mode: 'Markdown' });
        }
        delete userState[userId];
        return;
    }

    if (state.step === 'add_saldo') {
        const amountStr = ctx.message.text.trim();
        const amount = parseInt(amountStr, 10);

        if (isNaN(amount) || amount <= 0) {
            return ctx.reply('⚠️ *Jumlah saldo tidak valid. Masukkan angka positif.*', { parse_mode: 'Markdown' });
        }

        try {
        	
            const targetUserId = state.userId;
            const changes = await new Promise((resolve, reject) => {
                db.run('UPDATE users SET saldo = saldo + ? WHERE user_id = ?', [amount, targetUserId], function(err) {
                    if (err) {
                        logger.error('⚠️ Kesalahan saat menambahkan saldo user:', err.message);
                        reject(err);
                    } else {
                        resolve(this.changes);
                    }
                });
            });

            if (changes > 0) {
                ctx.reply(`✅ *Saldo sebesar \`${amount}\` berhasil ditambahkan ke user ID \`${targetUserId}\`.*`, { parse_mode: 'Markdown' });
            } else {
                ctx.reply('⚠️ *Pengguna tidak ditemukan atau saldo tidak berubah.*', { parse_mode: 'Markdown' });
            }
        } catch (err) {
            logger.error('❌ Terjadi kesalahan saat menambahkan saldo user:', err.message);
            ctx.reply('❌ *Terjadi kesalahan saat menambahkan saldo user.*', { parse_mode: 'Markdown' });
        }
        delete userState[userId];
        return;
    }

    const editSteps = ['edit_batas_create_akun', 'edit_limit_ip', 'edit_quota', 'edit_auth', 'edit_domain', 'edit_nama', 'edit_total_create_akun'];
    if (state && editSteps.includes(state.step)) {
        const newValue = ctx.message.text.trim();
        let query;
        let fieldName;
        let isNumeric = false;

        switch (state.step) {
            case 'edit_batas_create_akun':
                query = 'UPDATE Server SET batas_create_akun = ? WHERE id = ?';
                fieldName = 'batas create akun';
                isNumeric = true;
                break;
            case 'edit_limit_ip':
                query = 'UPDATE Server SET iplimit = ? WHERE id = ?';
                fieldName = 'limit IP';
                isNumeric = true;
                break;
            case 'edit_quota':
                query = 'UPDATE Server SET quota = ? WHERE id = ?';
                fieldName = 'quota';
                isNumeric = true;
                break;
            case 'edit_auth':
                query = 'UPDATE Server SET auth = ? WHERE id = ?';
                fieldName = 'auth';
                break;
            case 'edit_domain':
                query = 'UPDATE Server SET domain = ? WHERE id = ?';
                fieldName = 'domain';
                break;
            case 'edit_nama':
                query = 'UPDATE Server SET nama_server = ? WHERE id = ?';
                fieldName = 'nama server';
                break;
            case 'edit_total_create_akun':
                query = 'UPDATE Server SET total_create_akun = ? WHERE id = ?';
                fieldName = 'total create akun';
                isNumeric = true;
                break;
        }

        if (isNumeric && (isNaN(parseInt(newValue, 10)) || parseInt(newValue, 10) < 0)) {
            return ctx.reply(`⚠️ *${fieldName} tidak valid.* Masukkan angka positif yang valid.`, { parse_mode: 'Markdown' });
        }
        if (!newValue) {
            return ctx.reply(`⚠️ *${fieldName} tidak boleh kosong.*`, { parse_mode: 'Markdown' });
        }

        try {
            const valueToStore = isNumeric ? parseInt(newValue, 10) : newValue;
            const changes = await new Promise((resolve, reject) => {
                db.run(query, [valueToStore, state.serverId], function(err) {
                    if (err) {
                        logger.error(`⚠️ Kesalahan saat mengedit ${fieldName} server:`, err.message);
                        reject(err);
                    } else {
                        resolve(this.changes);
                    }
                });
            });

            if (changes > 0) {
                ctx.reply(`✅ *${fieldName} server berhasil diubah menjadi \`${newValue}\`.*`, { parse_mode: 'Markdown' });
            } else {
                ctx.reply(`⚠️ *Server tidak ditemukan atau ${fieldName} tidak berubah.*`, { parse_mode: 'Markdown' });
            }
        } catch (error) {
            logger.error(`❌ Error saat mengedit ${fieldName} server:`, error.message);
            ctx.reply(`❌ *Terjadi kesalahan saat mengedit ${fieldName} server.*`, { parse_mode: 'Markdown' });
        }
        delete userState[userId];
        return;
    }

    if (state.step === 'edit_harga') {
        const hargaStr = ctx.message.text.trim();
        const hargaBaru = parseFloat(hargaStr);

        if (isNaN(hargaBaru) || hargaBaru <= 0) {
            return ctx.reply('⚠️ *Harga tidak valid. Masukkan angka positif yang valid.*', { parse_mode: 'Markdown' });
        }

        try {
            const changes = await new Promise((resolve, reject) => {
                db.run('UPDATE Server SET harga = ? WHERE id = ?', [hargaBaru, state.serverId], function(err) {
                    if (err) {
                        logger.error('⚠️ Kesalahan saat mengedit harga server:', err.message);
                        reject(err);
                    } else {
                        resolve(this.changes);
                    }
                });
            });

            if (changes > 0) {
                ctx.reply(`✅ *Harga server berhasil diubah menjadi \`Rp${hargaBaru}\`.*`, { parse_mode: 'Markdown' });
            } else {
                ctx.reply('⚠️ *Server tidak ditemukan atau harga tidak berubah.*', { parse_mode: 'Markdown' });
            }
        } catch (error) {
            logger.error('❌ Error saat mengedit harga server:', error.message);
            ctx.reply('❌ *Terjadi kesalahan saat mengedit harga server.*', { parse_mode: 'Markdown' });
        }
        delete userState[userId];
        return;
    }
});

bot.action('addserver', async (ctx) => {
  try {
    logger.info('📥 Proses tambah server dimulai');
    await ctx.answerCbQuery();
    await ctx.reply('🌐 *Silahkan masukkan domain/ip server:*', { parse_mode: 'Markdown' });
    userState[ctx.chat.id] = { step: 'addserver' };
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses tambah server:', error);
    await ctx.reply('❌ *GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.*', { parse_mode: 'Markdown' });
  }
});
bot.action('detailserver', async (ctx) => {
  try {
    logger.info('📋 Proses detail server dimulai');
    await ctx.answerCbQuery();
    
    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('⚠️ Kesalahan saat mengambil detail server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil detail server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      logger.info('⚠️ Tidak ada server yang tersedia');
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia saat ini.*', { parse_mode: 'Markdown' });
    }

    const buttons = [];
    for (let i = 0; i < servers.length; i += 2) {
      const row = [];
      row.push({
        text: `${servers[i].nama_server}`,
        callback_data: `server_detail_${servers[i].id}`
      });
      if (i + 1 < servers.length) {
        row.push({
          text: `${servers[i + 1].nama_server}`,
          callback_data: `server_detail_${servers[i + 1].id}`
        });
      }
      buttons.push(row);
    }

    await ctx.reply('📋 *Silahkan pilih server untuk melihat detail:*', {
      reply_markup: { inline_keyboard: buttons },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('⚠️ Kesalahan saat mengambil detail server:', error);
    await ctx.reply('⚠️ *Terjadi kesalahan saat mengambil detail server.*', { parse_mode: 'Markdown' });
  }
});

bot.action('listserver', async (ctx) => {
  try {
    logger.info('📜 Proses daftar server dimulai');
    await ctx.answerCbQuery();
    
    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('⚠️ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      logger.info('⚠️ Tidak ada server yang tersedia');
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia saat ini.*', { parse_mode: 'Markdown' });
    }

    let serverList = '📜 *Daftar Server* 📜\n\n';
    servers.forEach((server, index) => {
      serverList += `🔹 ${index + 1}. ${server.domain}\n`;
    });

    serverList += `\nTotal Jumlah Server: ${servers.length}`;

    await ctx.reply(serverList, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error('⚠️ Kesalahan saat mengambil daftar server:', error);
    await ctx.reply('⚠️ *Terjadi kesalahan saat mengambil daftar server.*', { parse_mode: 'Markdown' });
  }
});
bot.action('resetdb', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.reply('🚨 *PERHATIAN! Anda akan menghapus semua server yang tersedia. Apakah Anda yakin?*', {
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Ya', callback_data: 'confirm_resetdb' }],
          [{ text: '❌ Tidak', callback_data: 'cancel_resetdb' }]
        ]
      },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Error saat memulai proses reset database:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('confirm_resetdb', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM Server', (err) => {
        if (err) {
          logger.error('❌ Error saat mereset tabel Server:', err.message);
          return reject('❗️ *PERHATIAN! Terjadi KESALAHAN SERIUS saat mereset database. Harap segera hubungi administrator!*');
        }
        resolve();
      });
    });
    await ctx.reply('🚨 *PERHATIAN! Database telah DIRESET SEPENUHNYA. Semua server telah DIHAPUS TOTAL.*', { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error('❌ Error saat mereset database:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('cancel_resetdb', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    await ctx.reply('❌ *Proses reset database dibatalkan.*', { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error('❌ Error saat membatalkan reset database:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('deleteserver', async (ctx) => {
  try {
    logger.info('🗑️ Proses hapus server dimulai');
    await ctx.answerCbQuery();
    
    db.all('SELECT * FROM Server', [], (err, servers) => {
      if (err) {
        logger.error('⚠️ Kesalahan saat mengambil daftar server:', err.message);
        return ctx.reply('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*', { parse_mode: 'Markdown' });
      }

      if (servers.length === 0) {
        logger.info('⚠️ Tidak ada server yang tersedia');
        return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia saat ini.*', { parse_mode: 'Markdown' });
      }

      const keyboard = servers.map(server => {
        return [{ text: server.nama_server, callback_data: `confirm_delete_server_${server.id}` }];
      });
      keyboard.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'kembali_ke_menu' }]);

      ctx.reply('🗑️ *Pilih server yang ingin dihapus:*', {
        reply_markup: {
          inline_keyboard: keyboard
        },
        parse_mode: 'Markdown'
      });
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses hapus server:', error);
    await ctx.reply('❌ *GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.*', { parse_mode: 'Markdown' });
  }
});


bot.action('cek_saldo', async (ctx) => {
  try {
    const userId = ctx.from.id;
    
    const row = await new Promise((resolve, reject) => {
      db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], (err, row) => {
        if (err) {
          logger.error('❌ Kesalahan saat memeriksa saldo:', err.message);
          return reject('❌ *Terjadi kesalahan saat memeriksa saldo Anda. Silahkan coba lagi nanti.*');
        }
        resolve(row);
      });
    });

    if (row) {
      await ctx.reply(`📊 *Cek Saldo*\n\n🆔 ID Telegram: ${userId}\n💰 Sisa Saldo: Rp${row.saldo}`, 
      { 
        parse_mode: 'Markdown', 
        reply_markup: {
          inline_keyboard: [
            [{ text: '💸 Top Up', callback_data: 'menu_topup' }, { text: '📝 Menu Utama', callback_data: 'send_main_menu' }]
          ]
        } 
      });
    } else {
      await ctx.reply('⚠️ *Anda belum memiliki saldo. Silahkan tambahkan saldo terlebih dahulu.*', { parse_mode: 'Markdown' });
    }
    
  } catch (error) {
    logger.error('❌ Kesalahan saat memeriksa saldo:', error);
    await ctx.reply(`❌ *${error.message}*`, { parse_mode: 'Markdown' });
  }
});

const getUsernameById = async (userId) => {
  try {
    const telegramUser = await bot.telegram.getChat(userId);
    return telegramUser.username || telegramUser.first_name;
  } catch (err) {
    logger.error('❌ Kesalahan saat mengambil username dari Telegram:', err.message);
    throw new Error('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil username dari Telegram.*');
  }
};

bot.action('addsaldo_user', async (ctx) => {
  try {
    logger.info('Add saldo user process started');
    await ctx.answerCbQuery();

    const users = await new Promise((resolve, reject) => {
      db.all('SELECT id, user_id FROM Users LIMIT 20', [], (err, users) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar user.*');
        }
        resolve(users);
      });
    });

    const totalUsers = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM Users', [], (err, row) => {
        if (err) {
          logger.error('❌ Kesalahan saat menghitung total user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat menghitung total user.*');
        }
        resolve(row.count);
      });
    });

    const buttons = [];
    for (let i = 0; i < users.length; i += 2) {
      const row = [];
      const username1 = await getUsernameById(users[i].user_id);
      row.push({
        text: username1 || users[i].user_id,
        callback_data: `add_saldo_${users[i].id}`
      });
      if (i + 1 < users.length) {
        const username2 = await getUsernameById(users[i + 1].user_id);
        row.push({
          text: username2 || users[i + 1].user_id,
          callback_data: `add_saldo_${users[i + 1].id}`
        });
      }
      buttons.push(row);
    }

    const currentPage = 0;
    const replyMarkup = {
      inline_keyboard: [...buttons]
    };

    if (totalUsers > 20) {
      replyMarkup.inline_keyboard.push([{
        text: '➡️ Next',
        callback_data: `next_users_${currentPage + 1}`
      }]);
    }

    await ctx.reply('📊 *Silahkan pilih user untuk menambahkan saldo:*', {
      reply_markup: replyMarkup,
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses tambah saldo user:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action(/next_users_(\d+)/, async (ctx) => {
  const currentPage = parseInt(ctx.match[1]);
  const offset = currentPage * 20;

  try {
    logger.info(`Next users process started for page ${currentPage + 1}`);
    await ctx.answerCbQuery();

    const users = await new Promise((resolve, reject) => {
      db.all(`SELECT id, user_id FROM Users LIMIT 20 OFFSET ${offset}`, [], (err, users) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar user.*');
        }
        resolve(users);
      });
    });

    const totalUsers = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM Users', [], (err, row) => {
        if (err) {
          logger.error('❌ Kesalahan saat menghitung total user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat menghitung total user.*');
        }
        resolve(row.count);
      });
    });

    const buttons = [];
    for (let i = 0; i < users.length; i += 2) {
      const row = [];
      const username1 = await getUsernameById(users[i].user_id);
      row.push({
        text: username1 || users[i].user_id,
        callback_data: `add_saldo_${users[i].id}`
      });
      if (i + 1 < users.length) {
        const username2 = await getUsernameById(users[i + 1].user_id);
        row.push({
          text: username2 || users[i + 1].user_id,
          callback_data: `add_saldo_${users[i + 1].id}`
        });
      }
      buttons.push(row);
    }

    const replyMarkup = {
      inline_keyboard: [...buttons]
    };

    const navigationButtons = [];
    if (currentPage > 0) {
      navigationButtons.push([{
        text: '⬅️ Back',
        callback_data: `prev_users_${currentPage - 1}`
      }]);
    }
    if (offset + 20 < totalUsers) {
      navigationButtons.push([{
        text: '➡️ Next',
        callback_data: `next_users_${currentPage + 1}`
      }]);
    }

    replyMarkup.inline_keyboard.push(...navigationButtons);

    await ctx.editMessageReplyMarkup(replyMarkup);
  } catch (error) {
    logger.error('❌ Kesalahan saat memproses next users:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action(/prev_users_(\d+)/, async (ctx) => {
  const currentPage = parseInt(ctx.match[1]);
  const offset = (currentPage - 1) * 20; 

  try {
    logger.info(`Previous users process started for page ${currentPage}`);
    await ctx.answerCbQuery();

    const users = await new Promise((resolve, reject) => {
      db.all(`SELECT id, user_id FROM Users LIMIT 20 OFFSET ${offset}`, [], (err, users) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar user.*');
        }
        resolve(users);
      });
    });

    const totalUsers = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as count FROM Users', [], (err, row) => {
        if (err) {
          logger.error('❌ Kesalahan saat menghitung total user:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat menghitung total user.*');
        }
        resolve(row.count);
      });
    });

    const buttons = [];
    for (let i = 0; i < users.length; i += 2) {
      const row = [];
      const username1 = await getUsernameById(users[i].user_id);
      row.push({
        text: username1 || users[i].user_id,
        callback_data: `add_saldo_${users[i].id}`
      });
      if (i + 1 < users.length) {
        const username2 = await getUsernameById(users[i + 1].user_id);
        row.push({
          text: username2 || users[i + 1].user_id,
          callback_data: `add_saldo_${users[i + 1].id}`
        });
      }
      buttons.push(row);
    }

    const replyMarkup = {
      inline_keyboard: [...buttons]
    };

    const navigationButtons = [];
    if (currentPage > 0) {
      navigationButtons.push([{
        text: '⬅️ Back',
        callback_data: `prev_users_${currentPage - 1}`
      }]);
    }
    if (offset + 20 < totalUsers) {
      navigationButtons.push([{
        text: '➡️ Next',
        callback_data: `next_users_${currentPage}`
      }]);
    }

    replyMarkup.inline_keyboard.push(...navigationButtons);

    await ctx.editMessageReplyMarkup(replyMarkup);
  } catch (error) {
    logger.error('❌ Kesalahan saat memproses previous users:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('editserver_limit_ip', async (ctx) => {
  try {
    logger.info('Edit server limit IP process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_limit_ip_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('📊 *Silahkan pilih server untuk mengedit limit IP:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit limit IP server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('editserver_batas_create_akun', async (ctx) => {
  try {
    logger.info('Edit server batas create akun process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_batas_create_akun_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('📊 *Silahkan pilih server untuk mengedit batas create akun:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit batas create akun server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('editserver_total_create_akun', async (ctx) => {
  try {
    logger.info('Edit server total create akun process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_total_create_akun_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('📊 *Silahkan pilih server untuk mengedit total create akun:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit total create akun server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('editserver_quota', async (ctx) => {
  try {
    logger.info('Edit server quota process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_quota_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('📊 *Silahkan pilih server untuk mengedit quota:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit quota server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});
bot.action('editserver_auth', async (ctx) => {
  try {
    logger.info('Edit server auth process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_auth_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('🌐 *Silahkan pilih server untuk mengedit auth:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit auth server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('editserver_harga', async (ctx) => {
  try {
    logger.info('Edit server harga process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_harga_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('💰 *Silahkan pilih server untuk mengedit harga:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit harga server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('editserver_domain', async (ctx) => {
  try {
    logger.info('Edit server domain process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_domain_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('🌐 *Silahkan pilih server untuk mengedit domain:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit domain server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('nama_server_edit', async (ctx) => {
  try {
    logger.info('Edit server nama process started');
    await ctx.answerCbQuery();

    const servers = await new Promise((resolve, reject) => {
      db.all('SELECT id, nama_server FROM Server', [], (err, servers) => {
        if (err) {
          logger.error('❌ Kesalahan saat mengambil daftar server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil daftar server.*');
        }
        resolve(servers);
      });
    });

    if (servers.length === 0) {
      return ctx.reply('⚠️ *PERHATIAN! Tidak ada server yang tersedia untuk diedit.*', { parse_mode: 'Markdown' });
    }

    const buttons = servers.map(server => ({
      text: server.nama_server,
      callback_data: `edit_nama_${server.id}`
    }));

    const inlineKeyboard = [];
    for (let i = 0; i < buttons.length; i += 2) {
      inlineKeyboard.push(buttons.slice(i, i + 2));
    }

    await ctx.reply('🏷️ *Silahkan pilih server untuk mengedit nama:*', {
      reply_markup: { inline_keyboard: inlineKeyboard },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses edit nama server:', error);
    await ctx.reply(`❌ *${error}*`, { parse_mode: 'Markdown' });
  }
});

bot.action('topup_saldo', async (ctx) => {
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;

  try {
    await ctx.answerCbQuery(); 
    logger.info(`🔍 User ${userId} memulai proses top-up saldo.`);

    if (lastMenus[userId]) {
      try {
        await bot.telegram.deleteMessage(chatId, lastMenus[userId]);
        logger.info(`🧹 Menu lama milik ${userId} berhasil dihapus`);
        delete lastMenus[userId];
      } catch (e) {
        console.warn(`⚠️ Gagal menghapus menu sebelumnya untuk ${userId}:`, e.message);
      }
    }

    if (!global.depositState) global.depositState = {};
    global.depositState[userId] = { action: 'request_amount', amount: '' };

    const keyboard = keyboard_nomor();

        const sent = await ctx.reply(
      '💳 Topup Saldo Otomatis QRIS\n━━━━━━━━━━━━━━━━━━━━━━\nMasukkan nominal topup:\n\nRp 0,00\n\nMinimal topup Rp 100\n━━━━━━━━━━━━━━━━━━━━━━\nGunakan tombol di bawah untuk input nominal.',
      {
        reply_markup: { inline_keyboard: keyboard },
        parse_mode: 'Markdown'
      }
    );

    if (sent && sent.message_id) {
      lastMenus[userId] = sent.message_id;
    }

  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses top-up saldo:', error);
    try {
      await ctx.reply(
        '❌ *GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.*',
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      logger.error('Gagal kirim pesan error:', e.message);
    }
  }
});
// =========== TOPUP QRIS SAWERIA ===========
bot.action('topup_saweria', async (ctx) => {
  const userId = ctx.from.id;
  const chatId = ctx.chat.id;

  try {
    await ctx.answerCbQuery(); 
    logger.info(`🔍 User ${userId} memulai proses top-up saldo.`);

    if (lastMenus[userId]) {
      try {
        await bot.telegram.deleteMessage(chatId, lastMenus[userId]);
        logger.info(`🧹 Menu lama milik ${userId} berhasil dihapus`);
        delete lastMenus[userId];
      } catch (e) {
        console.warn(`⚠️ Gagal menghapus menu sebelumnya untuk ${userId}:`, e.message);
      }
    }

    // ✅ Simpan state bahwa user diminta masukkan nominal
    if (!global.depositState) global.depositState = {};
    global.depositState[userId] = {
      action: 'request_amount_saweria',
      amount: ''
    };

    logger.info(`📝 Menunggu input nominal dari user ${userId}`);

    // Kirim instruksi ke user
    const sent = await ctx.reply(
      '💰 *Silahkan ketik nominal top-up yang ingin Anda bayarkan melalui QRIS Saweria.*\n\nContoh: `1000`',
      { parse_mode: 'Markdown' }
    );

    // Simpan ID pesan agar bisa dihapus nantinya
    if (sent && sent.message_id) {
      lastMenus[userId] = sent.message_id;
    }

  } catch (error) {
    logger.error('❌ Kesalahan saat memulai proses top-up Saweria:', error);
    try {
      await ctx.reply(
        '❌ *GAGAL!* Terjadi kesalahan saat memproses top-up Saweria Anda. Silahkan coba lagi nanti.',
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      logger.error('Gagal kirim pesan error:', e.message);
    }
  }
});


bot.action(/^saweria_nominal_(\d+)$/, async (ctx) => {
  const userId = ctx.from.id;
  const amount = parseInt(ctx.match[1]);

  delete global.depositState[userId];

  await ctx.answerCbQuery();
  await ctx.reply(`🔄 Memproses QRIS Saweria untuk Rp${amount}...`);

  await processDepositSaweria(ctx, amount);
});




bot.action('bonus_topup_setting', async (ctx) => {
    await ctx.answerCbQuery();
    db.get('SELECT * FROM bonus_config WHERE id = 1', (err, row) => {
        if (err || !row) {
            return ctx.reply('❌ Gagal mengambil pengaturan bonus.');
        }

        ctx.reply(`⚙️ *Pengaturan Bonus Top Up*

` +
            `Status: *${row.enabled ? 'Aktif ✅' : 'Nonaktif ❌'}*
` +
            `Minimal TopUp: *Rp${row.min_topup}*
` +
            `Bonus: *${row.bonus_percent}%*

` +
            `Klik tombol di bawah ini untuk mengatur:`, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🔧 Atur Bonus TopUp', callback_data: 'atur_bonus_topup' }]
                ]
            }
        });
    });
});


bot.action('atur_bonus_topup', async (ctx) => {
    await ctx.answerCbQuery();

    userState[ctx.chat.id] = { step: 'atur_bonus_input' };
    await ctx.reply('✍️ Kirim format:\n`on|off <minimal_topup> <persen_bonus>`\n\nContoh:\n`on 10000 25`', {
        parse_mode: 'Markdown'
    });
});

bot.action('log_bonus_topup', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;

  db.all('SELECT * FROM bonus_log ORDER BY id DESC LIMIT 10', [], (err, rows) => {
    if (err || rows.length === 0) {
      return ctx.reply('⚠️ Belum ada data bonus');
    }

    const isi = rows.map((row, i) => {
      const username = row.username ? `\`${row.username}\`` : `\`${row.user_id}\``;
      const formattedTimestamp = new Date(row.timestamp).toLocaleString('id-ID', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      return `*${i + 1}.* ${username}\n🆔 ID: \`${row.user_id}\`\n💸 TopUp: Rp${row.amount}\n🎁 Bonus: Rp${row.bonus}\n🕒 ${formattedTimestamp}`;
    }).join('\n\n');

    ctx.reply(`📋 *Riwayat Bonus Top Up (10 Terbaru)*\n\n${isi}`, {
      parse_mode: 'Markdown'
    });
  });
});

bot.action('log_topup', async (ctx) => {
  await ctx.answerCbQuery();

  db.all('SELECT * FROM topup_log ORDER BY id DESC LIMIT 10', [], (err, rows) => {
    if (err || rows.length === 0) {
      return ctx.reply('⚠️ Belum ada data topup');
    }

    const isi = rows.map((row, i) => {
      const username = row.username ? `\`${row.username}\`` : `\`${row.user_id}\``;
      // Gunakan kolom 'waktu'
      const formattedTimestamp = new Date(row.waktu).toLocaleString('id-ID', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });

      return `*${i + 1}.* ${username}\n🆔 ID: \`${row.user_id}\`\n💸 TopUp: Rp${row.amount}\n🕒 ${formattedTimestamp}`;
    }).join('\n\n');

    ctx.reply(`📋 *Riwayat Top Up (10 Terbaru)*\n\n${isi}`, {
      parse_mode: 'Markdown'
    });
  });
});

function prosesBonusTopUp(user_id, username, original_amount) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM bonus_config WHERE id = 1', (err, config) => {
      if (err || !config) return resolve(); // lanjut aja walaupun gagal

      if (config.enabled && original_amount >= config.min_topup) {
        const bonus = Math.floor(original_amount * config.bonus_percent / 100);

        db.run('UPDATE users SET saldo = saldo + ? WHERE user_id = ?', [bonus, user_id], (err2) => {
          if (err2) return resolve(); // tetap resolve supaya lanjut

          db.run('INSERT INTO bonus_log (user_id, username, amount, bonus, timestamp) VALUES (?, ?, ?, ?, ?)', [
            user_id,
            username || '',
            original_amount,
            bonus,
            new Date().toISOString()
          ], () => {
            // Kirim pesan setelah log bonus
            bot.telegram.sendMessage(user_id, `🎁 *Bonus Top Up!* Kamu dapat saldo tambahan *Rp${bonus}* (${config.bonus_percent}%)`, {
              parse_mode: 'Markdown'
            });
            resolve();
          });
        });
      } else {
        resolve(); 
      }
    });
  });
}

function logTopup(user_id, username, amount, method) {
  db.run(
    'INSERT INTO topup_log (user_id, username, amount, method, waktu) VALUES (?, ?, ?, ?, ?)',
    [
      user_id,
      username || '',
      amount,
      method,
      new Date().toISOString()
    ],
    (err) => {
      if (err) {
        logger.error('❌ Gagal insert ke topup_log:', err.message);
      } else {
        logger.info(`✅ Log Topup: ${user_id} - ${username} - Rp${amount} - ${method}`);
      }
    }
  );
}

bot.action(/edit_harga_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit harga server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_harga', serverId: serverId };

  await ctx.reply('💰 *Silahkan masukkan harga server baru:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/add_saldo_(\d+)/, async (ctx) => {
  const userId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk menambahkan saldo user dengan ID: ${userId}`);
  userState[ctx.chat.id] = { step: 'add_saldo', userId: userId };

  await ctx.reply('📊 *Silahkan masukkan jumlah saldo yang ingin ditambahkan:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_batas_create_akun_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit batas create akun server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_batas_create_akun', serverId: serverId };

  await ctx.reply('📊 *Silahkan masukkan batas create akun server baru:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_total_create_akun_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit total create akun server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_total_create_akun', serverId: serverId };

  await ctx.reply('📊 *Silahkan masukkan total create akun server baru:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_limit_ip_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit limit IP server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_limit_ip', serverId: serverId };

  await ctx.reply('📊 *Silahkan masukkan limit IP server baru:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_quota_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit quota server dengan ID: ${serverId}`);
  userState[ctx.chat.id] = { step: 'edit_quota', serverId: serverId };

  await ctx.reply('📊 *Silahkan masukkan quota server baru:*', {
    reply_markup: { inline_keyboard: keyboard_nomor() },
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_auth_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit auth server dengan ID: ${serverId}`);

  userState[ctx.chat.id] = {
    step: 'edit_auth',
    serverId: serverId
  };

  await ctx.reply('✏️ *Silahkan kirim auth server baru sekarang:*', {
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_domain_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit domain server dengan ID: ${serverId}`);

  userState[ctx.chat.id] = {
    step: 'edit_domain',
    serverId: serverId
  };

  await ctx.reply('🌐 *Silahkan kirim domain server baru sekarang:*', {
    parse_mode: 'Markdown'
  });
});
bot.action(/edit_nama_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  logger.info(`User ${ctx.from.id} memilih untuk mengedit nama server dengan ID: ${serverId}`);

  userState[ctx.chat.id] = {
    step: 'edit_nama',
    serverId: serverId
  };

  await ctx.reply('🏷️ *Silahkan kirim nama server baru sekarang:*', {
    parse_mode: 'Markdown'
  });
});
bot.action(/confirm_delete_server_(\d+)/, async (ctx) => {
  try {
    db.run('DELETE FROM Server WHERE id = ?', [ctx.match[1]], function(err) {
      if (err) {
        logger.error('Error deleting server:', err.message);
        return ctx.reply('⚠️ *PERHATIAN! Terjadi kesalahan saat menghapus server.*', { parse_mode: 'Markdown' });
      }

      if (this.changes === 0) {
        logger.info('Server tidak ditemukan');
        return ctx.reply('⚠️ *PERHATIAN! Server tidak ditemukan.*', { parse_mode: 'Markdown' });
      }

      logger.info(`Server dengan ID ${ctx.match[1]} berhasil dihapus`);
      ctx.reply('✅ *Server berhasil dihapus.*', { parse_mode: 'Markdown' });
    });
  } catch (error) {
    logger.error('Kesalahan saat menghapus server:', error);
    await ctx.reply('❌ *GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silahkan coba lagi nanti.*', { parse_mode: 'Markdown' });
  }
});
bot.action(/server_detail_(\d+)/, async (ctx) => {
  const serverId = ctx.match[1];
  try {
    const server = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM Server WHERE id = ?', [serverId], (err, server) => {
        if (err) {
          logger.error('⚠️ Kesalahan saat mengambil detail server:', err.message);
          return reject('⚠️ *PERHATIAN! Terjadi kesalahan saat mengambil detail server.*');
        }
        resolve(server);
      });
    });

    if (!server) {
      logger.info('⚠️ Server tidak ditemukan');
      return ctx.reply('⚠️ *PERHATIAN! Server tidak ditemukan.*', { parse_mode: 'Markdown' });
    }

    const serverDetails = `📋 *Detail Server* 📋\n\n` +
      `🌐 *Domain:* \`${server.domain}\`\n` +
      `🔑 *Auth:* \`${server.auth}\`\n` +
      `🏷️ *Nama Server:* \`${server.nama_server}\`\n` +
      `📊 *Quota:* \`${server.quota}\`\n` +
      `📶 *Limit IP:* \`${server.iplimit}\`\n` +
      `🔢 *Batas Create Akun:* \`${server.batas_create_akun}\`\n` +
      `📋 *Total Create Akun:* \`${server.total_create_akun}\`\n` +
      `💵 *Harga:* \`Rp ${server.harga}\`\n\n`;

    await ctx.reply(serverDetails, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error('⚠️ Kesalahan saat mengambil detail server:', error);
    await ctx.reply('⚠️ *Terjadi kesalahan saat mengambil detail server.*', { parse_mode: 'Markdown' });
  }
});

bot.on('callback_query', async (ctx) => {
  const userId = ctx.from.id;
  const data = ctx.callbackQuery.data;
  const userStateData = userState[ctx.chat.id];

  if (global.depositState && global.depositState[userId] && global.depositState[userId].action === 'request_amount') {
    await handleDepositState(ctx, userId, data);
  } else if (userStateData) {
    switch (userStateData.step) {
      case 'add_saldo':
        await handleAddSaldo(ctx, userStateData, data);
        break;
      case 'edit_batas_create_akun':
        await handleEditBatasCreateAkun(ctx, userStateData, data);
        break;
      case 'edit_limit_ip':
        await handleEditiplimit(ctx, userStateData, data);
        break;
      case 'edit_quota':
        await handleEditQuota(ctx, userStateData, data);
        break;
      case 'edit_auth':
        await handleEditAuth(ctx, userStateData, data);
        break;
      case 'edit_domain':
        await handleEditDomain(ctx, userStateData, data);
        break;
      case 'edit_harga':
        await handleEditHarga(ctx, userStateData, data);
        break;
      case 'edit_nama':
        await handleEditNama(ctx, userStateData, data);
        break;
      case 'edit_total_create_akun':
        await handleEditTotalCreateAkun(ctx, userStateData, data);
        break;
    }
  }
});

async function handleDepositState(ctx, userId, data) {
  let state = global.depositState[userId];
  if (!state) return;

  let currentAmount = state.amount || '';
  const action = state.action;

  if (data === 'delete') {
    currentAmount = currentAmount.slice(0, -1);
  } else if (data === 'confirm') {
    if (!currentAmount || currentAmount.length === 0) {
      return await ctx.answerCbQuery('⚠️ Jumlah tidak boleh kosong!', { show_alert: true });
    }

    if (parseInt(currentAmount) < 100) {
      return await ctx.answerCbQuery('⚠️ Jumlah minimal top-up adalah 100 Ya Kak...!!!', { show_alert: true });
    }

    // Hapus pesan input nominal
    try {
      await ctx.deleteMessage();
    } catch (e) {
      logger.warn(`⚠️ Gagal menghapus pesan top-up konfirmasi: ${e.message}`);
    }

    // Jalankan proses sesuai jenis topup
    if (action === 'request_amount_saweria') {
      await processDepositSaweria(ctx, currentAmount);
    } else {
      global.depositState[userId].action = 'confirm_amount';
      await processDeposit(ctx, currentAmount);
    }

    // Hapus state
    delete global.depositState[userId];
    return;
  } else {
    const maxDigits = action === 'request_amount_saweria' ? 8 : 12;
    if (currentAmount.length < maxDigits) {
      currentAmount += data;
    } else {
      return await ctx.answerCbQuery(`⚠️ Jumlah maksimal adalah ${maxDigits} digit!`, { show_alert: true });
    }
  }

  global.depositState[userId].amount = currentAmount;

  const newMessage =
    action === 'request_amount_saweria'
      ? `💰 Masukkan nominal topup Saweria QRIS:\n\nNominal saat ini: *Rp${currentAmount}*`
      : `💳 Topup Saldo Otomatis QRIS\n━━━━━━━━━━━━━━━━━━━━━━\nMasukkan nominal topup:\n\nRp ${currentAmount}\n\nMinimal topup Rp 100\n━━━━━━━━━━━━━━━━━━━━━━\nGunakan tombol di bawah untuk input nominal.`;

  try {
    await ctx.editMessageText(newMessage, {
      reply_markup: { inline_keyboard: keyboard_nomor() },
      parse_mode: 'Markdown'
    });
  } catch (error) {
    if (error.description && error.description.includes('message is not modified')) {
      return;
    }
    logger.error('❌ Gagal update pesan nominal top-up:', error);
  }
}



async function handleAddSaldo(ctx, userStateData, data) {
  let currentSaldo = userStateData.saldo || '';

  if (data === 'delete') {
    currentSaldo = currentSaldo.slice(0, -1);
  } else if (data === 'confirm') {
    if (currentSaldo.length === 0) {
      return await ctx.answerCbQuery('⚠️ *Jumlah saldo tidak boleh kosong!*', { show_alert: true });
    }

    try {
      await updateUserSaldo(userStateData.userId, currentSaldo);
      ctx.reply(`✅ *Saldo user berhasil ditambahkan.*\n\n📄 *Detail Saldo:*\n- Jumlah Saldo: *Rp ${currentSaldo}*`, { parse_mode: 'Markdown' });
    } catch (err) {
      ctx.reply('❌ *Terjadi kesalahan saat menambahkan saldo user.*', { parse_mode: 'Markdown' });
    }
    delete userState[ctx.chat.id];
    return;
  } else {
    if (!/^[0-9]+$/.test(data)) {
      return await ctx.answerCbQuery('⚠️ *Jumlah saldo tidak valid!*', { show_alert: true });
    }
    if (currentSaldo.length < 10) {
      currentSaldo += data;
    } else {
      return await ctx.answerCbQuery('⚠️ *Jumlah saldo maksimal adalah 10 karakter!*', { show_alert: true });
    }
  }

  userStateData.saldo = currentSaldo;
  const newMessage = `📊 *Silahkan masukkan jumlah saldo yang ingin ditambahkan:*\n\nJumlah saldo saat ini: *${currentSaldo}*`;
  if (newMessage !== ctx.callbackQuery.message.text) {
    await ctx.editMessageText(newMessage, {
      reply_markup: { inline_keyboard: keyboard_nomor() },
      parse_mode: 'Markdown'
    });
  }
}

async function handleEditBatasCreateAkun(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'batasCreateAkun', 'batas create akun', 'UPDATE Server SET batas_create_akun = ? WHERE id = ?');
}

async function handleEditTotalCreateAkun(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'totalCreateAkun', 'total create akun', 'UPDATE Server SET total_create_akun = ? WHERE id = ?');
}

async function handleEditiplimit(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'iplimit', 'limit IP', 'UPDATE Server SET iplimit = ? WHERE id = ?');
}

async function handleEditQuota(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'quota', 'quota', 'UPDATE Server SET quota = ? WHERE id = ?');
}

async function handleEditAuth(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'auth', 'auth', 'UPDATE Server SET auth = ? WHERE id = ?');
}

async function handleEditDomain(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'domain', 'domain', 'UPDATE Server SET domain = ? WHERE id = ?');
}

async function handleEditHarga(ctx, userStateData, data) {
  let currentAmount = userStateData.amount || '';

  if (data === 'delete') {
    currentAmount = currentAmount.slice(0, -1);
  } else if (data === 'confirm') {
    if (currentAmount.length === 0) {
      return await ctx.answerCbQuery('⚠️ *Jumlah tidak boleh kosong!*', { show_alert: true });
    }
    const hargaBaru = parseFloat(currentAmount);
    if (isNaN(hargaBaru) || hargaBaru <= 0) {
      return ctx.reply('❌ *Harga tidak valid. Masukkan angka yang valid.*', { parse_mode: 'Markdown' });
    }
    try {
      await updateServerField(userStateData.serverId, hargaBaru, 'UPDATE Server SET harga = ? WHERE id = ?');
      ctx.reply(`✅ *Harga server berhasil diupdate.*\n\n📄 *Detail Server:*\n- Harga Baru: *Rp ${hargaBaru}*`, { parse_mode: 'Markdown' });
    } catch (err) {
      ctx.reply('❌ *Terjadi kesalahan saat mengupdate harga server.*', { parse_mode: 'Markdown' });
    }
    delete userState[ctx.chat.id];
    return;
  } else {
    if (!/^\d+$/.test(data)) {
      return await ctx.answerCbQuery('⚠️ *Hanya angka yang diperbolehkan!*', { show_alert: true });
    }
    if (currentAmount.length < 12) {
      currentAmount += data;
    } else {
      return await ctx.answerCbQuery('⚠️ *Jumlah maksimal adalah 12 digit!*', { show_alert: true });
    }
  }

  userStateData.amount = currentAmount;
  const newMessage = `💰 *Silahkan masukkan harga server baru:*\n\nJumlah saat ini: *Rp ${currentAmount}*`;
  if (newMessage !== ctx.callbackQuery.message.text) {
    await ctx.editMessageText(newMessage, {
      reply_markup: { inline_keyboard: keyboard_nomor() },
      parse_mode: 'Markdown'
    });
  }
}

async function handleEditNama(ctx, userStateData, data) {
  await handleEditField(ctx, userStateData, data, 'name', 'nama server', 'UPDATE Server SET nama_server = ? WHERE id = ?');
}

async function handleEditField(ctx, userStateData, data, field, fieldName, query) {
  let currentValue = userStateData[field] || '';

  if (data === 'delete') {
    currentValue = currentValue.slice(0, -1);
  } else if (data === 'confirm') {
    if (currentValue.length === 0) {
      return await ctx.answerCbQuery(`⚠️ *${fieldName} tidak boleh kosong!*`, { show_alert: true });
    }
    try {
      await updateServerField(userStateData.serverId, currentValue, query);
      ctx.reply(`✅ *${fieldName} server berhasil diupdate.*\n\n📄 *Detail Server:*\n- ${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)}: *${currentValue}*`, { parse_mode: 'Markdown' });
    } catch (err) {
      ctx.reply(`❌ *Terjadi kesalahan saat mengupdate ${fieldName} server.*`, { parse_mode: 'Markdown' });
    }
    delete userState[ctx.chat.id];
    return;
  } else {
    if (!/^[a-zA-Z0-9.-]+$/.test(data)) {
      return await ctx.answerCbQuery(`⚠️ *${fieldName} tidak valid!*`, { show_alert: true });
    }
    if (currentValue.length < 253) {
      currentValue += data;
    } else {
      return await ctx.answerCbQuery(`⚠️ *${fieldName} maksimal adalah 253 karakter!*`, { show_alert: true });
    }
  }

  userStateData[field] = currentValue;
  const newMessage = `📊 *Silahkan masukkan ${fieldName} server baru:*\n\n${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} saat ini: *${currentValue}*`;
  if (newMessage !== ctx.callbackQuery.message.text) {
    await ctx.editMessageText(newMessage, {
      reply_markup: { inline_keyboard: keyboard_nomor() },
      parse_mode: 'Markdown'
    });
  }
}
async function updateUserSaldo(userId, saldo) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE Users SET saldo = saldo + ? WHERE id = ?', [saldo, userId], function (err) {
      if (err) {
        logger.error('⚠️ Kesalahan saat menambahkan saldo user:', err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function updateServerField(serverId, value, query) {
  return new Promise((resolve, reject) => {
    db.run(query, [value, serverId], function (err) {
      if (err) {
        logger.error(`⚠️ Kesalahan saat mengupdate ${fieldName} server:`, err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

function generateRandomAmount(baseAmount) {
  const random = Math.floor(Math.random() * 99) + 1;
  return baseAmount + random;
}

global.depositState = {};
global.pendingDeposits = {};
let lastRequestTime = 0;
const requestInterval = 1000; 

db.all('SELECT * FROM pending_deposits WHERE status = "pending"', [], (err, rows) => {
  if (err) {
    logger.error('Gagal load pending_deposits:', err.message);
    return;
  }
  rows.forEach(row => {
    global.pendingDeposits[row.unique_code] = {
      amount: row.amount,
      originalAmount: row.original_amount,
      userId: row.user_id,
      timestamp: row.timestamp,
      status: row.status,
      qrMessageId: row.qr_message_id
    };
  });
  logger.info('Pending deposit loaded:', Object.keys(global.pendingDeposits).length);
});

const config = {
    storeName: NAMA_STORE, 
    auth_username: MERCHANT_ID,
    auth_token: API_KEY,
    baseQrString: DATA_QRIS, 
    logoPath: 'logo.png' 
};

const qris = new QRISPayment(config);

async function processDeposit(ctx, amount) {
  const currentTime = Date.now();
  
  if (currentTime - lastRequestTime < requestInterval) {
    await ctx.reply('⚠️ *Terlalu banyak permintaan. Silahkan tunggu sebentar sebelum mencoba lagi.*', { parse_mode: 'Markdown' });
    return;
  }

  lastRequestTime = currentTime;
  const userId = ctx.from.id;
  const uniqueCode = `user-${userId}-${currentTime}`;
  
  const finalAmount = generateRandomAmount(parseInt(amount));

  if (!global.pendingDeposits) {
    global.pendingDeposits = {};
  }

  try {
  	
let waitMsg = await ctx.reply("⏳ Mohon menunggu.");

const dots = [".", "..", "..."];
let i = 0;
const interval = setInterval(async () => {
  i = (i + 1) % dots.length;
  try {
    await ctx.telegram.editMessageText(ctx.chat.id, waitMsg.message_id, null, `⏳ Mohon menunggu${dots[i]}`);
  } catch (e) {
    clearInterval(interval);
  }
}, 1000);

await new Promise(resolve => setTimeout(resolve, 5000));
clearInterval(interval);

const { qrBuffer } = await qris.generateQR(finalAmount);

const caption = 
  `🧾 *Pembayaran:*\n\n` +
  `💵 Nominal: Rp ${finalAmount}\n` +
  `⏳ Batas: 5 menit\n` +
  `⚠️ Transfer *harus* sesuai\n\n` +
  `✅ Otomatis terverifikasi\n` +
  `📌 Jangan tutup halaman ini`;

const inlineKeyboard = [
  [
    {
      text: "📢 Join Channel",
      url: "https://t.me/freenetlite"
    }
  ],
  [
    {
      text: "❌ Batal Topup",
      callback_data: `batal_topup_${uniqueCode}`
    }
  ]
];

const qrMessage = await ctx.replyWithPhoto(
  { source: qrBuffer },
  {
    caption,
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: inlineKeyboard }
  }
);

await ctx.deleteMessage(waitMsg.message_id);

global.pendingDeposits[uniqueCode] = {
  amount: finalAmount,
  originalAmount: amount,
  userId,
  username: ctx.from.username || `user_${ctx.from.id}`, // <--- TAMBAHKAN INI
  timestamp: Date.now(),
  status: 'pending',
  qrMessageId: qrMessage.message_id
};

await insertPendingDeposit(uniqueCode, userId, finalAmount, amount, qrMessage.message_id);

delete global.depositState[userId];


  } catch (error) {
    logger.error('❌ Kesalahan saat memproses deposit:', error);
    await ctx.reply('❌ *GAGAL! Terjadi kesalahan saat memproses pembayaran. Silahkan coba lagi nanti.*', { parse_mode: 'Markdown' });
    
    delete global.depositState[userId];
    delete global.pendingDeposits[uniqueCode];
    
    await deletePendingDeposit(uniqueCode);
  }
}

function insertPendingDeposit(uniqueCode, userId, finalAmount, originalAmount, qrMessageId) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO pending_deposits (unique_code, user_id, amount, original_amount, timestamp, status, qr_message_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uniqueCode, userId, finalAmount, originalAmount, Date.now(), 'pending', qrMessageId],
      (err) => {
        if (err) {
          logger.error('Gagal insert pending_deposits:', err.message);
          reject(err);
        } else {
          resolve();
        }
      }
    );
  });
}

function deletePendingDeposit(uniqueCode) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode], (err) => {
      if (err) {
        logger.error('Gagal hapus pending_deposits (error):', err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

async function checkQRISStatus() {
  try {
    const pendingDeposits = Object.entries(global.pendingDeposits);

    for (const [uniqueCode, deposit] of pendingDeposits) {
      if (deposit.status !== 'pending') continue;

      const depositAge = Date.now() - deposit.timestamp;
      if (depositAge > 5 * 60 * 1000) {
        try {
          if (deposit.qrMessageId) {
            await bot.telegram.deleteMessage(deposit.userId, deposit.qrMessageId);
          }
          await bot.telegram.sendMessage(deposit.userId,
            '❌ *Pembayaran Expired*\n\n' +
            'Waktu pembayaran telah habis. Silahkan klik Top Up lagi untuk mendapatkan QR baru.',
            { parse_mode: 'Markdown' }
          );
        } catch (error) {
          logger.error('Error deleting expired payment messages:', error);
        }
        delete global.pendingDeposits[uniqueCode];
        db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode], (err) => {
          if (err) logger.error('Gagal hapus pending_deposits (expired):', err.message);
        });
        continue;
      }

      try {
        const url = `https://mutasiv1.vercel.app/check-payment?merchant=${MERCHANT_ID}&key=${API_KEY}`;
        const response = await axios.get(url);
        const paymentList = response.data?.data || [];

        // PATCH: Gunakan Number() untuk expectedAmount agar match tipe data
        const expectedAmount = Number(deposit.amount);
        const matched = paymentList.find(item => Number(item.amount) === expectedAmount);

        if (matched) {
          const success = await processMatchingPayment(deposit, matched, uniqueCode);
          if (success) {
            logger.info(`Payment processed successfully for ${uniqueCode}`);
            delete global.pendingDeposits[uniqueCode];
            db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode], (err) => {
              if (err) logger.error('Gagal hapus pending_deposits (success):', err.message);
            });
          }
        }
      } catch (error) {
        logger.error(`Error checking payment status for ${uniqueCode}:`, error.message);
      }
    }
  } catch (error) {
    logger.error('Error in checkQRISStatus:', error);
  }
}

function keyboard_abc() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  const buttons = [];
  for (let i = 0; i < alphabet.length; i += 3) {
    const row = alphabet.slice(i, i + 3).split('').map(char => ({
      text: char,
      callback_data: char
    }));
    buttons.push(row);
  }
  buttons.push([{ text: '🔙 Hapus', callback_data: 'delete' }, { text: '✅ Konfirmasi', callback_data: 'confirm' }]);
  buttons.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]);
  return buttons;
}

function keyboard_nomor() {
  const alphabet = '1234567890';
  const buttons = [];
  for (let i = 0; i < alphabet.length; i += 3) {
    const row = alphabet.slice(i, i + 3).split('').map(char => ({
      text: char,
      callback_data: char
    }));
    buttons.push(row);
  }
  buttons.push([{ text: '🔙 Hapus', callback_data: 'delete' }, { text: '✅ Konfirmasi', callback_data: 'confirm' }]);
  buttons.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]);
  return buttons;
}

function keyboard_full() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const buttons = [];
  for (let i = 0; i < alphabet.length; i += 3) {
    const row = alphabet.slice(i, i + 3).split('').map(char => ({
      text: char,
      callback_data: char
    }));
    buttons.push(row);
  }
  buttons.push([{ text: '🔙 Hapus', callback_data: 'delete' }, { text: '✅ Konfirmasi', callback_data: 'confirm' }]);
  buttons.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]);
  return buttons;
}

global.processedTransactions = new Set();
async function updateUserBalance(userId, amount) { 
    return new Promise((resolve, reject) => {
        db.run("UPDATE users SET saldo = saldo + ? WHERE user_id = ?",
            [amount, userId],
            function(err) {
                if (err) {
                    logger.error('Kesalahan saat mengupdate saldo pengguna:', err.message); 
                    reject(err);
                    return;
                }
                resolve(this.changes);
            }
        );
    });
}

async function getUserBalance(userId) {
  return new Promise((resolve, reject) => {
    db.get("SELECT saldo FROM users WHERE user_id = ?", [userId],
      (err, row) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(row);
      }
    );
  });
}

// Ambil data grup dari file konfigurasi
function getBotGroupData() {
  try {
    const raw = fs.readFileSync('/etc/bot/.bot.db', 'utf8');
    const line = raw.split('\n').find(line => line.startsWith('#bot# '));
    if (!line) return null;

    const parts = line.trim().split(' ');
    if (parts.length < 3) return null;

    return { keyGroup: parts[1], chatId: parts[2] };
  } catch (err) {
    logger.error('Gagal membaca file .bot.db:', err.message);
    return null;
  }
}

// Kirim log transaksi ke grup
async function sendTransactionLogToGroup({
  trxNumber,
  tgUsername,
  tgUserId,
  serviceName,
  serverName,
  trxType,
  activeDays,
  costValue,
  userSaldoNow,
  dateLabel,
  tololBoy,
  timeLabel
}) {
  const groupData = getBotGroupData();
  if (!groupData || !groupData.chatId || !groupData.keyGroup) {
    logger.warn('❌ Data grup tidak lengkap (chatId atau keyGroup), notifikasi tidak dikirim.');
    return;
  }

  const message = `
<b>━━━━━━━━━━━━━━━━━━</b>
<b>❇️ Transaksi Berhasil ❇️</b>
<b>━━━━━━━━━━━━━━━━━━</b>
📒 <b>» No Trx:</b> #${trxNumber}
🌀 <b>» Username:</b> ${tgUsername}
✨ <b>» ID:</b> <code>${tgUserId}</code>
🥇 <b>» Server:</b> ${serverName}
🥈 <b>» Produk:</b> ${serviceName}
🥉 <b>» Type:</b> ${trxType}
🏷️ <b>» Durasi akun:</b> ${activeDays} Hari Rp.${costValue.toLocaleString('id-ID')}
🏷️ <b>» Harga Perhari:</b> Rp.${tololBoy.toLocaleString('id-ID')}
🏷️ <b>» Saldo di kurangi:</b> Rp.${costValue.toLocaleString('id-ID')}
🏷️ <b>» Saldo saat ini:</b> Rp.${userSaldoNow.toLocaleString('id-ID')}
🏷️ <b>» Tanggal:</b> ${dateLabel}
🏷️ <b>» Waktu:</b> ${timeLabel}
<b>━━━━━━━━━━━━━━━━━━</b>
`;

  try {
    await axios.post(`https://api.telegram.org/bot${groupData.keyGroup}/sendMessage`, {
      chat_id: groupData.chatId,
      text: message,
      parse_mode: 'HTML'
    });

    logger.info(`✅ Log transaksi #${trxNumber} dikirim ke grup ${groupData.chatId}`);
  } catch (err) {
    logger.error(`❌ Gagal kirim log transaksi ke grup: ${err.response?.data?.description || err.message}`);
  }
}

// Dapatkan nomor transaksi terakhir
function getLastTransactionNumber() {
  return new Promise((resolve, reject) => {
    db.get('SELECT id FROM log_penjualan ORDER BY id DESC LIMIT 1', (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.id + 1 : 1000);
    });
  });
}

// Ambil saldo user dari database
function getUserSaldo(userId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.saldo : 0);
    });
  });
}

// Fungsi utama setelah pembuatan/perpanjangan akun
async function afterAccountTransaction({
  userId,
  username,
  produk,
  serverId,
  jenis,
  durasi
}) {
  try {
    const now = new Date();

    // Ambil informasi server dari DB
    const serverDetails = await new Promise((resolve, reject) => {
      db.get('SELECT nama_server, harga FROM Server WHERE id = ?', [serverId], (err, row) => {
        if (err) {
          logger.error('❌ Gagal mengambil data server:', err.message);
          return reject(err);
        }
        resolve(row || {}); // fallback ke object kosong
      });
    });

    const serverNamaTampilan = serverDetails.nama_server || '-';
    const hargaPerHari = serverDetails.harga || 0;
    const totalHarga = hargaPerHari * durasi;

    // Ambil nomor transaksi terakhir
    const trxNumber = await getLastTransactionNumber();

    // Ambil saldo terbaru user
    const saldo = await getUserSaldo(userId);

    // Format tanggal dan waktu
    const tanggal = now.toLocaleDateString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).replace(/\//g, '.');

    const waktu = now.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit'
    }).replace(/\./g, ':') + ' WIB';

    // Kirim log transaksi ke grup
    await sendTransactionLogToGroup({
      trxNumber,
      tgUsername: username ? (username.startsWith('@') ? username : `@${username}`) : 'Tidak tersedia',
      tgUserId: userId,
      serviceName: produk || 'Tidak diketahui',
      serverName: serverNamaTampilan,
      trxType: jenis || 'Create',
      activeDays: durasi || 0,
      costValue: totalHarga || 0,
      userSaldoNow: saldo || 0,
      dateLabel: tanggal,
      tololBoy: totalHarga,
      timeLabel: waktu
    });

    logger.info(`✅ afterAccountTransaction selesai untuk user ${userId}, transaksi #${trxNumber}`);
  } catch (error) {
    logger.error(`❌ Error afterAccountTransaction user ${userId}:`, error?.stack || error?.message || error);
  }
}

async function sendPaymentSuccessNotificationByUserId(userId, deposit, currentBalance, username = 'Tidak tersedia') {
  try {
    const saldo = await new Promise((resolve, reject) => {
      db.get('SELECT saldo FROM users WHERE user_id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row ? row.saldo : 0);
      });
    });

    const hasBonus = deposit.bonus && deposit.bonus > 0 && deposit.bonus_percent;
    const bonusText = hasBonus
      ? `🎁 Bonus Top Up: *Rp${deposit.bonus}* (${deposit.bonus_percent}%)\n`
      : '';

    const messageText =
      `━━━━━━━━━━━━━━━━━━\n` +
      `✅ *Pembayaran Berhasil ✅*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `🏷️ *» Username:* \`${username}\`\n` +
      `🏷️ *» ID Pengguna:* \`${userId}\`\n` +
      `🏷️ *» Nominal:* Rp ${deposit.amount}\n` +
      `🏷️ *» Saldo Ditambahkan:* Rp ${deposit.originalAmount}\n` +
      bonusText +
      `🏷️ *» Saldo Sekarang:* Rp ${saldo.toLocaleString('id-ID')}`;

    await bot.telegram.sendMessage(userId, messageText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '💸 Top Up', callback_data: 'menu_topup' },
            { text: '📝 Menu Utama', callback_data: 'send_main_menu' }
          ]
        ]
      }
    });

    // Hapus pesan QRIS (jika ada)
    if (deposit.qrMessageId) {
      try {
        await bot.telegram.deleteMessage(userId, deposit.qrMessageId);
      } catch (e) {
        logger.warn(`Gagal hapus pesan QRIS user ${userId} (message_id ${deposit.qrMessageId}): ${e.message}`);
      }
    }

    // Kirim juga ke grup
    const group = getBotGroupData();
    if (group) {
      const { keyGroup, chatId } = group;

      const messageToGroup =
        `━━━━━━━━━━━━━━━━━━\n` +
        `❇️ *Top Up Berhasil* ❇️\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `🏷️ *» Username:* \`@${username}\`\n` +
        `🏷️ *» ID:* \`${userId}\`\n` +
        `🏷️ *» Nominal:* Rp${deposit.amount.toLocaleString('id-ID')}\n` +
        `🏷️ *» Bonus Top Up:* Rp${(deposit.bonus || 0).toLocaleString('id-ID')} (${deposit.bonus_percent || 0}%)\n` +
        `🏷️ *» Saldo Sekarang:* Rp${currentBalance.toLocaleString('id-ID')}`;

      try {
        await axios.post(`https://api.telegram.org/bot${keyGroup}/sendMessage`, {
          chat_id: chatId,
          text: messageToGroup,
          parse_mode: 'Markdown'
        });
      } catch (err) {
        const errorMessage = `❗ Gagal kirim ke grup:\n${err.response?.data?.description || err.message}`;
        logger.warn(errorMessage);

        // Kirim error ke user
        await bot.telegram.sendMessage(userId, `⚠️ *Gagal kirim notifikasi ke grup.*\n\n${errorMessage}`, {
          parse_mode: 'Markdown'
        });
      }
    }

    return true;
  } catch (error) {
    logger.error('❌ Error sending payment notification (by userId):', error);
    return false;
  }
}

async function processMatchingPayment(deposit, matchingTransaction, uniqueCode) {
  // Pastikan username tersedia
  if (!deposit.username) {
    try {
      const telegramUser = await bot.telegram.getChat(deposit.userId);
      deposit.username = telegramUser.username ? `@${telegramUser.username}` : 'Tidak tersedia';
    } catch (e) {
      deposit.username = 'Tidak tersedia';
    }
  }

  // Cegah duplikasi transaksi
  const transactionKey = `${matchingTransaction.reference_id}_${matchingTransaction.amount}`;
  if (global.processedTransactions.has(transactionKey)) {
    logger.info(`Transaction ${transactionKey} already processed, skipping...`);
    return false;
  }

  try {
    // Update saldo utama
    logger.info(`Update saldo untuk user ${deposit.userId}, amount: ${deposit.originalAmount}`);
    await updateUserBalance(deposit.userId, Number(deposit.originalAmount));

    // Ambil config bonus
    const config = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM bonus_config WHERE id = 1', (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    // Hitung bonus jika memenuhi syarat
    let bonus = 0;
    let bonusPercent = 0;

    if (config?.enabled && deposit.originalAmount >= config.min_topup) {
      bonus = Math.floor(deposit.originalAmount * config.bonus_percent / 100);
      bonusPercent = config.bonus_percent;

      deposit.bonus = bonus;
      deposit.bonus_percent = bonusPercent;

      // Tambah bonus ke saldo dan log
      await prosesBonusTopUp(deposit.userId, deposit.username, deposit.originalAmount);
    } else {
      deposit.bonus = 0;
      deposit.bonus_percent = 0;
    }

    // Catat topup ke log
    await logTopup(deposit.userId, deposit.username, deposit.originalAmount, 'QRIS Orkut');

    // Ambil saldo terkini
    const userBalance = await new Promise((resolve, reject) => {
      db.get('SELECT saldo FROM users WHERE user_id = ?', [deposit.userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!userBalance) throw new Error('User balance not found after update');

    // Kirim notifikasi
    const notificationSent = await sendPaymentSuccessNotificationByUserId(
      deposit.userId,
      {
        amount: deposit.originalAmount,
        originalAmount: deposit.originalAmount,
        bonus: deposit.bonus,
        bonus_percent: deposit.bonus_percent
      },
      userBalance.saldo,
      deposit.username
    );

    if (notificationSent) {
      global.processedTransactions.add(transactionKey);

      // Hapus dari global dan database
      delete global.pendingDeposits[uniqueCode];
      db.run('DELETE FROM pending_deposits WHERE unique_code = ?', [uniqueCode], (err) => {
        if (err) logger.error('Gagal hapus pending_deposits (success):', err.message);
      });

      return true;
    }

    return false;
  } catch (error) {
    logger.error('❌ Error processing payment:', error);
    return false;
  }
}

setInterval(async () => {
  try {
    await checkQRISStatus();
  } catch (err) {
    logger.error("❌ Gagal cek status QRIS:", err.message);
  }
}, 10000);

async function kirimFileKeTelegram() {
  const form = new FormData();

  if (!fs.existsSync(FOLDER_TEMPATDB)) {
    console.log("❌ File tidak ditemukan:", FOLDER_TEMPATDB);
    return;
  }

  form.append("chat_id", ADMIN);
  form.append("document", fs.createReadStream(FOLDER_TEMPATDB));

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
      method: "POST",
      body: form,
    });

    const data = await res.json();
    if (data.ok) {
      console.log(`[${new Date().toLocaleTimeString()}] ✅ File terkirim ke Telegram.`);
    } else {
      console.error("❌ Gagal mengirim file:", data.description);
    }
  } catch (err) {
    console.error("❌ Error saat mengirim file:", err.message);
  }
}
 
setInterval(kirimFileKeTelegram, 3 * 60 * 60 * 1000);

process.on('uncaughtException', (err) => {
  console.error('🔥 Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Unhandled Rejection:', reason);
});

app.listen(port)
  .on('listening', () => {
    logger.info(`Express server listening on port ${port}`);
    bot.launch().then(() => {
      logger.info("Bot launched");
    }).catch((err) => {
      logger.error("Bot failed to launch:", err);
    });
  })
  .on('error', (err) => {
    logger.error("Express failed to start:", err.message);
    bot.launch().catch(err => {
      logger.error("Bot fallback launch error:", err.message);
    });
  });