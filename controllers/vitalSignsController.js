const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const https = require('https');

// ====================================================================
// CONFIGURAÇÕES
// ====================================================================
const GOOGLE_FIT_CLIENT_ID = process.env.GOOGLE_FIT_CLIENT_ID;
const GOOGLE_FIT_CLIENT_SECRET = process.env.GOOGLE_FIT_CLIENT_SECRET;
const GOOGLE_FIT_REDIRECT_URI = process.env.GOOGLE_FIT_REDIRECT_URI;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

const GOOGLE_FIT_SCOPES = [
    'https://www.googleapis.com/auth/fitness.heart_rate.read',
    'https://www.googleapis.com/auth/fitness.oxygen_saturation.read',
    'https://www.googleapis.com/auth/fitness.blood_pressure.read',
    'https://www.googleapis.com/auth/fitness.body_temperature.read',
    'https://www.googleapis.com/auth/fitness.activity.read',
    'https://www.googleapis.com/auth/fitness.sleep.read'
].join(' ');

// Limiares para alertas automáticos
const THRESHOLDS = {
    heart_rate_high: 120,
    heart_rate_low: 50,
    spo2_low: 92,
    bp_sys_high: 180,
    bp_sys_low: 90,
    bp_dia_high: 120,
    temperature_high: 38.5,
    temperature_low: 35.0
};

// ====================================================================
// HELPER: Chamada HTTPS genérica
// ====================================================================
function httpsRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve({ statusCode: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, data: data });
                }
            });
        });
        req.on('error', reject);
        if (options.body) req.write(options.body);
        req.end();
    });
}

// ====================================================================
// HELPER: Chamada Gemini AI (backend)
// ====================================================================
async function callGeminiBackend(prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GOOGLE_API_KEY}`;

    const body = JSON.stringify({
        contents: [{ parts: [{ text: prompt + '\nResponda APENAS JSON válido.' }] }]
    });

    const response = await httpsRequest(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
    });

    if (response.statusCode !== 200) {
        throw new Error(`Gemini API error: ${response.statusCode}`);
    }

    const txt = response.data.candidates[0].content.parts[0].text;
    const jsonStr = txt.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr);
}

// ====================================================================
// HELPER: Gerar alertas automáticos baseados em limiares
// ====================================================================
function generateAutoAlerts(reading) {
    const alerts = [];

    if (reading.heart_rate && reading.heart_rate > THRESHOLDS.heart_rate_high) {
        alerts.push({ type: 'TAQUICARDIA', severity: 'high', message: `FC elevada: ${reading.heart_rate} bpm` });
    }
    if (reading.heart_rate && reading.heart_rate < THRESHOLDS.heart_rate_low) {
        alerts.push({ type: 'BRADICARDIA', severity: 'high', message: `FC baixa: ${reading.heart_rate} bpm` });
    }
    if (reading.spo2 && reading.spo2 < THRESHOLDS.spo2_low) {
        alerts.push({ type: 'HIPOXEMIA', severity: 'critical', message: `SpO2 baixa: ${reading.spo2}%` });
    }
    if (reading.blood_pressure_sys && reading.blood_pressure_sys > THRESHOLDS.bp_sys_high) {
        alerts.push({ type: 'HIPERTENSAO_GRAVE', severity: 'critical', message: `PA sistólica elevada: ${reading.blood_pressure_sys} mmHg` });
    }
    if (reading.skin_temperature && reading.skin_temperature > THRESHOLDS.temperature_high) {
        alerts.push({ type: 'FEBRE', severity: 'medium', message: `Temperatura elevada: ${reading.skin_temperature}°C` });
    }
    if (reading.skin_temperature && reading.skin_temperature < THRESHOLDS.temperature_low) {
        alerts.push({ type: 'HIPOTERMIA', severity: 'high', message: `Temperatura baixa: ${reading.skin_temperature}°C` });
    }

    return alerts;
}

// ====================================================================
// 1. SALVAR SINAIS VITAIS (recebe dados e gera alertas automáticos)
// ====================================================================
exports.saveVitalSigns = async (req, res) => {
    try {
        const { userId, heartRate, spo2, bpSys, bpDia, temperature, steps, sleepStage, stressLevel, source, deviceId, capturedAt } = req.body;

        if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });

        const [result] = await sequelize.query(`
            INSERT INTO vital_signs_monitoring
            (user_id, heart_rate, spo2, blood_pressure_sys, blood_pressure_dia, skin_temperature, steps, sleep_stage, stress_level, source, device_id, captured_at)
            VALUES (:userId, :heartRate, :spo2, :bpSys, :bpDia, :temperature, :steps, :sleepStage, :stressLevel, :source, :deviceId, :capturedAt)
            RETURNING id
        `, {
            replacements: {
                userId,
                heartRate: heartRate || null,
                spo2: spo2 || null,
                bpSys: bpSys || null,
                bpDia: bpDia || null,
                temperature: temperature || null,
                steps: steps || null,
                sleepStage: sleepStage || null,
                stressLevel: stressLevel || null,
                source: source || 'manual',
                deviceId: deviceId || null,
                capturedAt: capturedAt || new Date().toISOString()
            },
            type: QueryTypes.INSERT
        });

        // Gera alertas automáticos
        const reading = { heart_rate: heartRate, spo2, blood_pressure_sys: bpSys, skin_temperature: temperature };
        const alerts = generateAutoAlerts(reading);

        for (const alert of alerts) {
            await sequelize.query(`
                INSERT INTO vital_alerts (user_id, vital_sign_id, alert_type, severity, message)
                VALUES (:userId, :vitalId, :alertType, :severity, :message)
            `, {
                replacements: {
                    userId,
                    vitalId: result[0] ? result[0].id : null,
                    alertType: alert.type,
                    severity: alert.severity,
                    message: alert.message
                },
                type: QueryTypes.INSERT
            });
        }

        if (alerts.length > 0) {
            console.log(`🚨 [Vitais] ${alerts.length} alerta(s) gerado(s) para User ${userId}`);
        }

        res.status(201).json({ success: true, alerts: alerts.length });
    } catch (error) {
        console.error('[Vitais] Erro ao salvar:', error);
        res.status(500).json({ error: 'Erro ao salvar sinais vitais' });
    }
};

// ====================================================================
// 2. ÚLTIMOS SINAIS VITAIS DE UM PACIENTE
// ====================================================================
exports.getPatientVitals = async (req, res) => {
    try {
        const { userId } = req.params;
        const limit = parseInt(req.query.limit) || 50;

        const vitals = await sequelize.query(`
            SELECT * FROM vital_signs_monitoring
            WHERE user_id = :userId
            ORDER BY captured_at DESC
            LIMIT :limit
        `, {
            replacements: { userId, limit },
            type: QueryTypes.SELECT
        });

        res.json({ success: true, vitals });
    } catch (error) {
        console.error('[Vitais] Erro ao buscar:', error);
        res.status(500).json({ error: 'Erro ao buscar sinais vitais' });
    }
};

// ====================================================================
// 3. ADMIN: TODOS OS PACIENTES COM ÚLTIMO SINAL VITAL
// ====================================================================
exports.getAllPatientsVitals = async (req, res) => {
    try {
        const patients = await sequelize.query(`
            SELECT
                u.id, u.name, u.age, u.sex, u.email, u.phone,
                v.heart_rate, v.spo2, v.blood_pressure_sys, v.blood_pressure_dia,
                v.skin_temperature, v.steps, v.sleep_stage, v.captured_at,
                v.source,
                gft.last_sync_at as google_fit_last_sync,
                (SELECT COUNT(*) FROM vital_alerts va WHERE va.user_id = u.id AND va.acknowledged = false) as pending_alerts
            FROM users u
            LEFT JOIN LATERAL (
                SELECT * FROM vital_signs_monitoring vsm
                WHERE vsm.user_id = u.id
                ORDER BY captured_at DESC LIMIT 1
            ) v ON true
            LEFT JOIN google_fit_tokens gft ON gft.user_id = u.id
            WHERE u.role = 'user'
            ORDER BY v.captured_at DESC NULLS LAST
        `, { type: QueryTypes.SELECT });

        res.json({ success: true, patients });
    } catch (error) {
        console.error('[Vitais] Erro admin all:', error);
        res.status(500).json({ error: 'Erro ao buscar dados' });
    }
};

// ====================================================================
// 4. ADMIN: HISTÓRICO COMPLETO DE UM PACIENTE
// ====================================================================
exports.getPatientHistory = async (req, res) => {
    try {
        const { userId } = req.params;
        const hours = parseInt(req.query.hours) || 24;

        const vitals = await sequelize.query(`
            SELECT * FROM vital_signs_monitoring
            WHERE user_id = :userId
              AND captured_at >= NOW() - INTERVAL '${hours} hours'
            ORDER BY captured_at ASC
        `, {
            replacements: { userId },
            type: QueryTypes.SELECT
        });

        res.json({ success: true, vitals, hours });
    } catch (error) {
        console.error('[Vitais] Erro histórico:', error);
        res.status(500).json({ error: 'Erro ao buscar histórico' });
    }
};

// ====================================================================
// 5. ANÁLISE IA - Gemini analisa sinais vitais + comorbidades
// ====================================================================
exports.aiAnalysis = async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });

        // Buscar dados do paciente
        const [user] = await sequelize.query(
            `SELECT id, name, age, sex FROM users WHERE id = :userId`,
            { replacements: { userId }, type: QueryTypes.SELECT }
        );
        if (!user) return res.status(404).json({ error: 'Paciente não encontrado' });

        // Buscar comorbidades ativas
        const comorbidities = await sequelize.query(
            `SELECT comorbidity FROM user_comorbidities
             WHERE user_id = :userId AND is_active = true AND removed_by_admin = false`,
            { replacements: { userId }, type: QueryTypes.SELECT }
        );

        // Buscar sinais vitais das últimas 2 horas
        const vitals = await sequelize.query(`
            SELECT heart_rate, spo2, blood_pressure_sys, blood_pressure_dia,
                   skin_temperature, steps, sleep_stage, stress_level, captured_at
            FROM vital_signs_monitoring
            WHERE user_id = :userId AND captured_at >= NOW() - INTERVAL '2 hours'
            ORDER BY captured_at ASC
        `, { replacements: { userId }, type: QueryTypes.SELECT });

        if (vitals.length === 0) {
            return res.status(400).json({ error: 'Nenhum sinal vital registrado nas últimas 2 horas' });
        }

        // Formatar dados para o prompt
        const comorbList = comorbidities.length > 0
            ? comorbidities.map(c => c.comorbidity).join(', ')
            : 'Nenhuma comorbidade registrada';

        const fcValues = vitals.filter(v => v.heart_rate).map(v => v.heart_rate).join(', ');
        const spo2Values = vitals.filter(v => v.spo2).map(v => v.spo2).join(', ');
        const bpValues = vitals.filter(v => v.blood_pressure_sys).map(v => `${v.blood_pressure_sys}/${v.blood_pressure_dia}`).join(', ');
        const tempValues = vitals.filter(v => v.skin_temperature).map(v => v.skin_temperature).join(', ');
        const lastVital = vitals[vitals.length - 1];

        const prompt = `Você é um Membro da Equipe Conecta Saúde analisando sinais vitais de um paciente.
REGRA ANVISA: Nunca se identifique como "Dr.", "Médico" ou "Doutor". Use sempre "Equipe Conecta Saúde".

DADOS DO PACIENTE:
- Nome: ${user.name}, Idade: ${user.age || 'N/A'} anos, Sexo: ${user.sex === 'M' ? 'Masculino' : 'Feminino'}
- Comorbidades ativas: ${comorbList}

SINAIS VITAIS (últimas 2 horas - ${vitals.length} leituras):
- Frequência Cardíaca: ${fcValues || 'N/A'} bpm
- SpO2: ${spo2Values || 'N/A'} %
- Pressão Arterial: ${bpValues || 'N/A'} mmHg
- Temperatura: ${tempValues || 'N/A'} °C
- Passos: ${lastVital.steps || 'N/A'}
- Sono: ${lastVital.sleep_stage || 'N/A'}
- Nível de Estresse: ${lastVital.stress_level || 'N/A'}

Analise os sinais vitais considerando as comorbidades do paciente. Avalie tendências e riscos.

Responda em JSON:
{
    "classification": "normal ou alterado ou critico",
    "summary": "Resumo da análise em linguagem acessível para o admin",
    "alerts": ["alerta 1 se houver", "alerta 2 se houver"],
    "recommendations": ["recomendação 1", "recomendação 2"],
    "trend_analysis": "Análise de tendência dos dados ao longo do período",
    "priority_action": "Ação prioritária (se houver) ou 'Nenhuma ação imediata necessária'"
}`;

        const aiResult = await callGeminiBackend(prompt);

        // Salvar alerta se classificação for crítica ou alterada
        if (aiResult.classification === 'critico' || aiResult.classification === 'alterado') {
            await sequelize.query(`
                INSERT INTO vital_alerts (user_id, alert_type, severity, message, ai_analysis)
                VALUES (:userId, 'AI_ANALYSIS', :severity, :message, :aiAnalysis)
            `, {
                replacements: {
                    userId,
                    severity: aiResult.classification === 'critico' ? 'critical' : 'medium',
                    message: aiResult.summary,
                    aiAnalysis: JSON.stringify(aiResult)
                },
                type: QueryTypes.INSERT
            });
        }

        console.log(`🧠 [IA Vitais] Análise para User ${userId}: ${aiResult.classification}`);
        res.json({ success: true, analysis: aiResult });
    } catch (error) {
        console.error('[Vitais] Erro IA:', error);
        res.status(500).json({ error: 'Erro na análise de IA', details: error.message });
    }
};

// ====================================================================
// 6. ALERTAS - Listar pendentes
// ====================================================================
exports.getAlerts = async (req, res) => {
    try {
        const alerts = await sequelize.query(`
            SELECT va.*, u.name as patient_name
            FROM vital_alerts va
            JOIN users u ON u.id = va.user_id
            WHERE va.acknowledged = false
            ORDER BY va.created_at DESC
            LIMIT 50
        `, { type: QueryTypes.SELECT });

        res.json({ success: true, alerts });
    } catch (error) {
        console.error('[Vitais] Erro alertas:', error);
        res.status(500).json({ error: 'Erro ao buscar alertas' });
    }
};

// ====================================================================
// 7. ALERTAS - Marcar como reconhecido
// ====================================================================
exports.acknowledgeAlert = async (req, res) => {
    try {
        const { id } = req.params;
        await sequelize.query(`
            UPDATE vital_alerts SET acknowledged = true, acknowledged_at = NOW() WHERE id = :id
        `, { replacements: { id }, type: QueryTypes.UPDATE });

        res.json({ success: true });
    } catch (error) {
        console.error('[Vitais] Erro ack:', error);
        res.status(500).json({ error: 'Erro ao reconhecer alerta' });
    }
};

// ====================================================================
// 8. GOOGLE FIT - Gerar URL de autorização
// ====================================================================
exports.getGoogleFitAuthUrl = async (req, res) => {
    try {
        const { userId } = req.query;
        if (!GOOGLE_FIT_CLIENT_ID) {
            return res.status(500).json({ error: 'Google Fit não configurado (GOOGLE_FIT_CLIENT_ID ausente)' });
        }

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${GOOGLE_FIT_CLIENT_ID}` +
            `&redirect_uri=${encodeURIComponent(GOOGLE_FIT_REDIRECT_URI)}` +
            `&response_type=code` +
            `&scope=${encodeURIComponent(GOOGLE_FIT_SCOPES)}` +
            `&access_type=offline` +
            `&prompt=consent` +
            `&state=${userId}`;

        res.json({ success: true, authUrl });
    } catch (error) {
        console.error('[GoogleFit] Erro auth URL:', error);
        res.status(500).json({ error: 'Erro ao gerar URL' });
    }
};

// ====================================================================
// 9. GOOGLE FIT - Callback OAuth
// ====================================================================
exports.googleFitCallback = async (req, res) => {
    try {
        const { code, state: userId } = req.query;
        if (!code || !userId) return res.status(400).send('Parâmetros inválidos');

        // Trocar code por tokens
        const tokenBody = new URLSearchParams({
            code,
            client_id: GOOGLE_FIT_CLIENT_ID,
            client_secret: GOOGLE_FIT_CLIENT_SECRET,
            redirect_uri: GOOGLE_FIT_REDIRECT_URI,
            grant_type: 'authorization_code'
        }).toString();

        const tokenResponse = await httpsRequest('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenBody
        });

        if (tokenResponse.statusCode !== 200) {
            console.error('[GoogleFit] Token error:', tokenResponse.data);
            return res.status(500).send('Erro ao obter token do Google Fit');
        }

        const tokens = tokenResponse.data;
        const expiry = new Date(Date.now() + (tokens.expires_in * 1000));

        // Salvar tokens no banco
        await sequelize.query(`
            INSERT INTO google_fit_tokens (user_id, access_token, refresh_token, token_expiry, scopes)
            VALUES (:userId, :accessToken, :refreshToken, :expiry, :scopes)
            ON CONFLICT (user_id) DO UPDATE SET
                access_token = :accessToken,
                refresh_token = COALESCE(:refreshToken, google_fit_tokens.refresh_token),
                token_expiry = :expiry,
                connected_at = NOW()
        `, {
            replacements: {
                userId,
                accessToken: tokens.access_token,
                refreshToken: tokens.refresh_token || null,
                expiry,
                scopes: GOOGLE_FIT_SCOPES
            },
            type: QueryTypes.INSERT
        });

        console.log(`✅ [GoogleFit] Conectado para User ${userId}`);

        // Redireciona de volta ao app
        res.send(`
            <html><body style="font-family:sans-serif;text-align:center;padding:50px;">
                <h2 style="color:#059669;">Smart Band Conectada!</h2>
                <p>Sua smart band foi conectada ao Conecta Saúde com sucesso.</p>
                <p>Você pode fechar esta janela.</p>
                <script>setTimeout(() => window.close(), 3000);</script>
            </body></html>
        `);
    } catch (error) {
        console.error('[GoogleFit] Callback error:', error);
        res.status(500).send('Erro ao conectar Google Fit');
    }
};

// ====================================================================
// 10. GOOGLE FIT - Status de conexão
// ====================================================================
exports.googleFitStatus = async (req, res) => {
    try {
        const { userId } = req.params;
        const [token] = await sequelize.query(
            `SELECT connected_at, last_sync_at, token_expiry FROM google_fit_tokens WHERE user_id = :userId`,
            { replacements: { userId }, type: QueryTypes.SELECT }
        );

        res.json({
            success: true,
            connected: !!token,
            lastSync: token ? token.last_sync_at : null,
            connectedAt: token ? token.connected_at : null
        });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao verificar status' });
    }
};

// ====================================================================
// 11. GOOGLE FIT - Sincronizar dados
// ====================================================================
exports.syncGoogleFit = async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });

        // Buscar token
        const [tokenData] = await sequelize.query(
            `SELECT access_token, refresh_token, token_expiry FROM google_fit_tokens WHERE user_id = :userId`,
            { replacements: { userId }, type: QueryTypes.SELECT }
        );

        if (!tokenData) return res.status(400).json({ error: 'Google Fit não conectado' });

        let accessToken = tokenData.access_token;

        // Refresh token se expirou
        if (new Date(tokenData.token_expiry) < new Date()) {
            const refreshBody = new URLSearchParams({
                client_id: GOOGLE_FIT_CLIENT_ID,
                client_secret: GOOGLE_FIT_CLIENT_SECRET,
                refresh_token: tokenData.refresh_token,
                grant_type: 'refresh_token'
            }).toString();

            const refreshResponse = await httpsRequest('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: refreshBody
            });

            if (refreshResponse.statusCode !== 200) {
                return res.status(401).json({ error: 'Token expirado. Reconecte o Google Fit.' });
            }

            accessToken = refreshResponse.data.access_token;
            const newExpiry = new Date(Date.now() + (refreshResponse.data.expires_in * 1000));

            await sequelize.query(`
                UPDATE google_fit_tokens SET access_token = :token, token_expiry = :expiry WHERE user_id = :userId
            `, { replacements: { token: accessToken, expiry: newExpiry, userId }, type: QueryTypes.UPDATE });
        }

        // Buscar dados do Google Fit (últimas 2 horas)
        const endTimeMillis = Date.now();
        const startTimeMillis = endTimeMillis - (2 * 60 * 60 * 1000);

        // Heart Rate
        const hrBody = JSON.stringify({
            aggregateBy: [{ dataTypeName: 'com.google.heart_rate.bpm' }],
            bucketByTime: { durationMillis: 300000 }, // 5 min buckets
            startTimeMillis,
            endTimeMillis
        });

        const hrResponse = await httpsRequest(
            'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: hrBody
            }
        );

        let savedCount = 0;

        if (hrResponse.statusCode === 200 && hrResponse.data.bucket) {
            for (const bucket of hrResponse.data.bucket) {
                if (bucket.dataset && bucket.dataset[0] && bucket.dataset[0].point) {
                    for (const point of bucket.dataset[0].point) {
                        const hr = point.value[0].fpVal || point.value[0].intVal;
                        const capturedAt = new Date(parseInt(point.startTimeNanos) / 1000000);

                        await sequelize.query(`
                            INSERT INTO vital_signs_monitoring (user_id, heart_rate, captured_at, source)
                            VALUES (:userId, :hr, :capturedAt, 'google_fit')
                            ON CONFLICT DO NOTHING
                        `, {
                            replacements: { userId, hr: Math.round(hr), capturedAt },
                            type: QueryTypes.INSERT
                        });
                        savedCount++;
                    }
                }
            }
        }

        // Atualizar timestamp de sync
        await sequelize.query(
            `UPDATE google_fit_tokens SET last_sync_at = NOW() WHERE user_id = :userId`,
            { replacements: { userId }, type: QueryTypes.UPDATE }
        );

        console.log(`📱 [GoogleFit] Sync User ${userId}: ${savedCount} leituras`);
        res.json({ success: true, synced: savedCount });
    } catch (error) {
        console.error('[GoogleFit] Sync error:', error);
        res.status(500).json({ error: 'Erro ao sincronizar', details: error.message });
    }
};
