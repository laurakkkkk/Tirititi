// api/webhook.js - TODAS las claves están en Vercel
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

// 📊 Rate limiting
const rateLimit = new Map();

function checkRateLimit(ip) {
    const now = Date.now();
    if (!rateLimit.has(ip)) {
        rateLimit.set(ip, { count: 1, time: now });
        return true;
    }
    
    const data = rateLimit.get(ip);
    if (now - data.time > 60000) {
        rateLimit.set(ip, { count: 1, time: now });
        return true;
    }
    
    if (data.count > 20) {
        return false;
    }
    
    data.count++;
    return true;
}

export default async function handler(req, res) {
    // ============================================
    // 1. CONFIGURAR CORS (permitir todos los orígenes)
    // ============================================
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // ============================================
    // 2. RATE LIMITING (evita ataques de fuerza bruta)
    // ============================================
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) {
        console.log('🚫 Rate limit excedido IP:', ip);
        return res.status(429).json({ 
            error: 'Demasiadas peticiones. Espera 1 minuto.'
        });
    }

    // ============================================
    // 3. GET - Configurar webhook (SIN verificar origen)
    // ============================================
    if (req.method === 'GET' && req.query.setup === 'true') {
        try {
            const protocol = req.headers['x-forwarded-proto'] || 'https';
            const host = req.headers.host;
            const webhookUrl = `${protocol}://${host}/api/webhook`;
            
            console.log('🔗 Configurando webhook en:', webhookUrl);
            
            await fetch(`${TELEGRAM_API}/deleteWebhook`);
            
            const response = await fetch(`${TELEGRAM_API}/setWebhook`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: webhookUrl,
                    allowed_updates: ['callback_query', 'message']
                })
            });

            const data = await response.json();
            console.log('✅ Webhook configurado:', data);
            
            return res.status(200).json({
                success: true,
                webhookUrl: webhookUrl,
                telegramResponse: data
            });
        } catch (error) {
            console.error('❌ Error configurando webhook:', error);
            return res.status(500).json({ error: 'Error configurando webhook' });
        }
    }

    // ============================================
    // 4. GET - Verificar estado
    // ============================================
    if (req.method === 'GET' && req.query.check) {
        const solicitudId = req.query.check;
        return res.status(200).json({ 
            solicitudId: solicitudId,
            estado: 'pending'
        });
    }

    // ============================================
    // 5. POST - Procesar mensajes
    // ============================================
    if (req.method === 'POST') {
        try {
            const body = req.body;
            console.log('📨 POST recibido de IP:', ip);

            // CASO 1: Mensaje simple (sin solicitudId)
            if (body.mensaje && !body.solicitudId) {
                console.log('📨 Mensaje simple:', body.mensaje);
                
                const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: TELEGRAM_CHAT_ID,
                        text: `📝 ${body.mensaje}`,
                        parse_mode: 'Markdown'
                    })
                });

                const data = await response.json();
                console.log('📨 Enviado a Telegram:', data.ok);

                return res.status(200).json({
                    success: data.ok,
                    message: data.ok ? 'Mensaje enviado' : 'Error enviando mensaje'
                });
            }

            // CASO 2: Mensaje con botones
            if (body.mensaje && body.solicitudId && body.botones) {
                console.log('📨 Mensaje con botones:', body.solicitudId);
                
                const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: TELEGRAM_CHAT_ID,
                        text: body.mensaje,
                        parse_mode: 'Markdown',
                        reply_markup: body.botones,
                        disable_web_page_preview: true
                    })
                });

                const data = await response.json();
                console.log('📨 Respuesta de Telegram:', data.ok);

                if (data.ok) {
                    return res.status(200).json({ 
                        success: true,
                        messageId: data.result.message_id
                    });
                } else {
                    console.error('❌ Error:', data.description);
                    return res.status(500).json({ 
                        success: false, 
                        error: data.description 
                    });
                }
            }

            // CASO 3: Callback query (botón presionado en Telegram)
            if (body.callback_query) {
                const callbackData = body.callback_query.data;
                const callbackId = body.callback_query.id;
                const message = body.callback_query.message;
                const chatId = message.chat.id;
                const messageId = message.message_id;
                
                console.log('🔘 Callback recibido:', callbackData);
                
                await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        callback_query_id: callbackId,
                        text: 'Procesado ✅'
                    })
                });
                
                await fetch(`${TELEGRAM_API}/editMessageText`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        message_id: messageId,
                        text: `✅ ${callbackData} procesado correctamente`,
                        parse_mode: 'Markdown'
                    })
                });
                
                return res.status(200).json({ success: true });
            }

            return res.status(400).json({ error: 'Mensaje inválido' });

        } catch (error) {
            console.error('❌ Error procesando webhook:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    }

    return res.status(405).json({ error: 'Método no permitido' });
}
