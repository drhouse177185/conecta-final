const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const https = require('https');

// ====================================================================
// CONFIGURAÇÕES
// ====================================================================
const GOOGLE_DRIVE_CLIENT_ID = process.env.GOOGLE_DRIVE_CLIENT_ID;
const GOOGLE_DRIVE_CLIENT_SECRET = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
const GOOGLE_DRIVE_REDIRECT_URI = process.env.GOOGLE_DRIVE_REDIRECT_URI;
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const HEALTH_SYNC_FOLDER = process.env.HEALTH_SYNC_FOLDER_NAME || 'Health Sync';

const GOOGLE_DRIVE_SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

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
// HELPER: Parser CSV manual (sem dependência npm)
// ====================================================================
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}

function parseCSV(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim() !== '');
    if (lines.length < 2) return [];
    const headers = parseCSVLine(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length !== headers.length) continue;
        const obj = {};
        headers.forEach((h, idx) => { obj[h.trim()] = values[idx].trim(); });
        rows.push(obj);
    }
    return rows;
}

// ====================================================================
// HELPER: Google Drive API - Buscar arquivos
// ====================================================================
async function driveSearchFiles(accessToken, query) {
    const encodedQuery = encodeURIComponent(query);
    const fields = encodeURIComponent('files(id,name,modifiedTime,size)');
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodedQuery}&fields=${fields}&orderBy=modifiedTime%20desc&pageSize=50`;

    const response = await httpsRequest(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (response.statusCode !== 200) {
        console.error('[Drive] Search error:', response.data);
        return [];
    }
    return response.data.files || [];
}

// ====================================================================
// HELPER: Google Drive API - Baixar conteúdo de arquivo
// ====================================================================
async function driveDownloadFile(accessToken, fileId) {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

    const response = await httpsRequest(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (response.statusCode !== 200) {
        console.error(`[Drive] Download error for ${fileId}:`, response.statusCode);
        return null;
    }
    return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
}

// ====================================================================
// HELPER: Timestamp Samsung Health → Date
// ====================================================================
function parseSamsungTime(timeStr, offsetStr) {
    if (!timeStr) return new Date();
    let dateStr = timeStr.trim();
    if (offsetStr) {
        const offset = offsetStr.trim();
        if (offset.length === 5 && (offset[0] === '+' || offset[0] === '-')) {
            dateStr += ` ${offset.slice(0, 3)}:${offset.slice(3)}`;
        }
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? new Date() : d;
}

// ====================================================================
// HELPER: Extratores de dados Samsung Health CSV
// ====================================================================
function extractHeartRateFromRow(row) {
    const hr = row['com.samsung.health.heart_rate.heart_rate'] || row['heart_rate'] || row['Heart rate'];
    const time = row['start_time'] || row['com.samsung.health.heart_rate.start_time'] || row['Start time'];
    if (!hr || !time || isNaN(parseFloat(hr))) return null;
    return { heart_rate: Math.round(parseFloat(hr)), captured_at: parseSamsungTime(time, row['time_offset'] || row['Time offset']) };
}

function extractBloodPressureFromRow(row) {
    const sys = row['systolic'] || row['com.samsung.health.blood_pressure.systolic'] || row['Systolic'];
    const dia = row['diastolic'] || row['com.samsung.health.blood_pressure.diastolic'] || row['Diastolic'];
    const time = row['start_time'] || row['com.samsung.health.blood_pressure.start_time'] || row['Start time'];
    if (!sys || !dia || !time || isNaN(parseFloat(sys))) return null;
    return { blood_pressure_sys: Math.round(parseFloat(sys)), blood_pressure_dia: Math.round(parseFloat(dia)), captured_at: parseSamsungTime(time, row['time_offset'] || row['Time offset']) };
}

function extractSpO2FromRow(row) {
    const spo2 = row['spo2'] || row['com.samsung.health.oxygen_saturation.spo2'] || row['oxygen_saturation'] || row['SpO2'];
    const time = row['start_time'] || row['com.samsung.health.oxygen_saturation.start_time'] || row['Start time'];
    if (!spo2 || !time || isNaN(parseFloat(spo2))) return null;
    return { spo2: parseFloat(spo2).toFixed(1), captured_at: parseSamsungTime(time, row['time_offset'] || row['Time offset']) };
}

function extractTemperatureFromRow(row) {
    const temp = row['temperature'] || row['com.samsung.health.body_temperature.temperature'] || row['Temperature'];
    const time = row['start_time'] || row['com.samsung.health.body_temperature.start_time'] || row['Start time'];
    if (!temp || !time || isNaN(parseFloat(temp))) return null;
    return { skin_temperature: parseFloat(temp).toFixed(1), captured_at: parseSamsungTime(time, row['time_offset'] || row['Time offset']) };
}

function extractStepsFromRow(row) {
    const steps = row['step_count'] || row['com.samsung.health.step_count.count'] || row['count'] || row['Steps'];
    const time = row['start_time'] || row['com.samsung.health.step_count.start_time'] || row['Start time'];
    if (!steps || !time || isNaN(parseFloat(steps))) return null;
    return { steps: Math.round(parseFloat(steps)), captured_at: parseSamsungTime(time, row['time_offset'] || row['Time offset']) };
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
// 8. GOOGLE DRIVE - Gerar URL de autorização (Health Sync)
// ====================================================================
exports.getGoogleFitAuthUrl = async (req, res) => {
    try {
        const { userId } = req.query;
        if (!GOOGLE_DRIVE_CLIENT_ID) {
            return res.status(500).json({ error: 'Health Sync não configurado (GOOGLE_DRIVE_CLIENT_ID ausente)' });
        }

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${GOOGLE_DRIVE_CLIENT_ID}` +
            `&redirect_uri=${encodeURIComponent(GOOGLE_DRIVE_REDIRECT_URI)}` +
            `&response_type=code` +
            `&scope=${encodeURIComponent(GOOGLE_DRIVE_SCOPES)}` +
            `&access_type=offline` +
            `&prompt=consent` +
            `&state=${userId}`;

        res.json({ success: true, authUrl });
    } catch (error) {
        console.error('[HealthSync] Erro auth URL:', error);
        res.status(500).json({ error: 'Erro ao gerar URL' });
    }
};

// ====================================================================
// 9. GOOGLE DRIVE - Callback OAuth (Health Sync)
// ====================================================================
exports.googleFitCallback = async (req, res) => {
    try {
        const { code, state: userId } = req.query;
        if (!code || !userId) return res.status(400).send('Parâmetros inválidos');

        const tokenBody = new URLSearchParams({
            code,
            client_id: GOOGLE_DRIVE_CLIENT_ID,
            client_secret: GOOGLE_DRIVE_CLIENT_SECRET,
            redirect_uri: GOOGLE_DRIVE_REDIRECT_URI,
            grant_type: 'authorization_code'
        }).toString();

        const tokenResponse = await httpsRequest('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: tokenBody
        });

        if (tokenResponse.statusCode !== 200) {
            console.error('[HealthSync] Token error:', tokenResponse.data);
            return res.status(500).send('Erro ao obter token do Google Drive');
        }

        const tokens = tokenResponse.data;
        const expiry = new Date(Date.now() + (tokens.expires_in * 1000));

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
                scopes: GOOGLE_DRIVE_SCOPES
            },
            type: QueryTypes.INSERT
        });

        console.log(`[HealthSync] Conectado para User ${userId}`);

        res.send(`
            <html><body style="font-family:sans-serif;text-align:center;padding:50px;">
                <h2 style="color:#059669;">Smart Band Conectada!</h2>
                <p>Seus dados do Health Sync foram conectados ao Conecta Saude com sucesso.</p>
                <p>Voce pode fechar esta janela.</p>
                <script>setTimeout(() => window.close(), 3000);</script>
            </body></html>
        `);
    } catch (error) {
        console.error('[HealthSync] Callback error:', error);
        res.status(500).send('Erro ao conectar Health Sync');
    }
};

// ====================================================================
// 10. HEALTH SYNC - Status de conexão
// ====================================================================
exports.googleFitStatus = async (req, res) => {
    try {
        const { userId } = req.params;
        const [token] = await sequelize.query(
            `SELECT connected_at, last_sync_at, token_expiry, scopes FROM google_fit_tokens WHERE user_id = :userId`,
            { replacements: { userId }, type: QueryTypes.SELECT }
        );

        // Verificar se o scope é drive.readonly (não o antigo Google Fit)
        const hasCorrectScope = token && token.scopes && token.scopes.includes('drive.readonly');

        res.json({
            success: true,
            connected: !!token && hasCorrectScope,
            needsReconnect: !!token && !hasCorrectScope,
            lastSync: token ? token.last_sync_at : null,
            connectedAt: token ? token.connected_at : null
        });
    } catch (error) {
        res.status(500).json({ error: 'Erro ao verificar status' });
    }
};

// ====================================================================
// 11. HEALTH SYNC - Sincronizar dados via Google Drive CSV
// ====================================================================
exports.syncGoogleFit = async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });

        // Buscar token
        const [tokenData] = await sequelize.query(
            `SELECT access_token, refresh_token, token_expiry, last_sync_at FROM google_fit_tokens WHERE user_id = :userId`,
            { replacements: { userId }, type: QueryTypes.SELECT }
        );

        if (!tokenData) return res.status(400).json({ error: 'Health Sync não conectado' });

        let accessToken = tokenData.access_token;

        // Refresh token se expirou
        if (new Date(tokenData.token_expiry) < new Date()) {
            const refreshBody = new URLSearchParams({
                client_id: GOOGLE_DRIVE_CLIENT_ID,
                client_secret: GOOGLE_DRIVE_CLIENT_SECRET,
                refresh_token: tokenData.refresh_token,
                grant_type: 'refresh_token'
            }).toString();

            const refreshResponse = await httpsRequest('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: refreshBody
            });

            if (refreshResponse.statusCode !== 200) {
                return res.status(401).json({ error: 'Token expirado. Reconecte o Health Sync.' });
            }

            accessToken = refreshResponse.data.access_token;
            const newExpiry = new Date(Date.now() + (refreshResponse.data.expires_in * 1000));

            await sequelize.query(`
                UPDATE google_fit_tokens SET access_token = :token, token_expiry = :expiry WHERE user_id = :userId
            `, { replacements: { token: accessToken, expiry: newExpiry, userId }, type: QueryTypes.UPDATE });
        }

        // Determinar data limite para evitar reimportar dados antigos
        const lastSyncAt = tokenData.last_sync_at
            ? new Date(tokenData.last_sync_at)
            : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // últimos 7 dias na primeira sync

        // Buscar pasta "Health Sync" no Google Drive
        const folderQuery = `name = '${HEALTH_SYNC_FOLDER}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        const folders = await driveSearchFiles(accessToken, folderQuery);

        let parentClause = '';
        if (folders.length > 0) {
            parentClause = `'${folders[0].id}' in parents and `;
            console.log(`[HealthSync] Pasta encontrada: ${folders[0].name} (${folders[0].id})`);
        } else {
            console.log(`[HealthSync] Pasta '${HEALTH_SYNC_FOLDER}' não encontrada, buscando em todo o Drive...`);
        }

        // Tipos de CSV para buscar
        const csvPatterns = [
            { pattern: 'heart_rate', extractor: extractHeartRateFromRow },
            { pattern: 'blood_pressure', extractor: extractBloodPressureFromRow },
            { pattern: 'oxygen_saturation', extractor: extractSpO2FromRow },
            { pattern: 'body_temperature', extractor: extractTemperatureFromRow },
            { pattern: 'step_count', extractor: extractStepsFromRow }
        ];

        // Coletar dados por timestamp (agrupa em janelas de 5 min)
        const readings = {};
        const getTimeKey = (date) => {
            const ms = date.getTime();
            return Math.round(ms / 300000) * 300000;
        };
        const ensureReading = (timeKey) => {
            if (!readings[timeKey]) {
                readings[timeKey] = { capturedAt: new Date(timeKey) };
            }
            return readings[timeKey];
        };

        let filesProcessed = 0;

        for (const csvType of csvPatterns) {
            // Buscar CSVs que contêm o padrão no nome
            const query = `${parentClause}name contains '${csvType.pattern}' and (mimeType = 'text/csv' or mimeType = 'application/octet-stream') and trashed = false`;
            const files = await driveSearchFiles(accessToken, query);

            if (files.length === 0) {
                console.log(`[HealthSync] Nenhum CSV encontrado para: ${csvType.pattern}`);
                continue;
            }

            // Processar o arquivo mais recente de cada tipo
            const file = files[0];
            console.log(`[HealthSync] Baixando ${file.name} (${file.id})`);

            const csvContent = await driveDownloadFile(accessToken, file.id);
            if (!csvContent) continue;

            const rows = parseCSV(csvContent);
            console.log(`[HealthSync] ${file.name}: ${rows.length} linhas parseadas`);
            filesProcessed++;

            for (const row of rows) {
                const extracted = csvType.extractor(row);
                if (!extracted) continue;

                // Filtrar dados mais antigos que o último sync
                if (extracted.captured_at <= lastSyncAt) continue;

                const tk = getTimeKey(extracted.captured_at);
                const reading = ensureReading(tk);
                Object.assign(reading, extracted);
                reading.capturedAt = extracted.captured_at;
            }
        }

        // Salvar no banco
        let savedCount = 0;
        for (const timeKey of Object.keys(readings)) {
            const r = readings[timeKey];
            await sequelize.query(`
                INSERT INTO vital_signs_monitoring
                (user_id, heart_rate, spo2, blood_pressure_sys, blood_pressure_dia,
                 skin_temperature, steps, captured_at, source)
                VALUES (:userId, :hr, :spo2, :bpSys, :bpDia, :temp, :steps, :capturedAt, 'health_sync')
            `, {
                replacements: {
                    userId,
                    hr: r.heart_rate || null,
                    spo2: r.spo2 || null,
                    bpSys: r.blood_pressure_sys || null,
                    bpDia: r.blood_pressure_dia || null,
                    temp: r.skin_temperature || null,
                    steps: r.steps || null,
                    capturedAt: r.capturedAt
                },
                type: QueryTypes.INSERT
            });
            savedCount++;
        }

        // Gerar alertas automáticos para a leitura mais recente
        const timeKeys = Object.keys(readings).sort();
        if (timeKeys.length > 0) {
            const latest = readings[timeKeys[timeKeys.length - 1]];
            const alerts = generateAutoAlerts(latest);
            for (const alert of alerts) {
                await sequelize.query(`
                    INSERT INTO vital_alerts (user_id, alert_type, severity, message)
                    VALUES (:userId, :type, :severity, :message)
                `, {
                    replacements: { userId, type: alert.type, severity: alert.severity, message: alert.message },
                    type: QueryTypes.INSERT
                });
            }
            if (alerts.length > 0) {
                console.log(`[HealthSync] ${alerts.length} alerta(s) gerado(s) para User ${userId}`);
            }
        }

        // Atualizar timestamp de sync
        await sequelize.query(
            `UPDATE google_fit_tokens SET last_sync_at = NOW() WHERE user_id = :userId`,
            { replacements: { userId }, type: QueryTypes.UPDATE }
        );

        console.log(`[HealthSync] Sync User ${userId}: ${savedCount} leituras de ${filesProcessed} arquivo(s) CSV`);
        res.json({ success: true, synced: savedCount, filesProcessed });
    } catch (error) {
        console.error('[HealthSync] Sync error:', error);
        res.status(500).json({ error: 'Erro ao sincronizar', details: error.message });
    }
};

// ====================================================================
// 12. DADOS DEMO - Gera leituras simuladas para teste/demonstração
// ====================================================================
exports.generateDemoData = async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });

        const now = Date.now();
        let count = 0;

        // Gera 24 leituras (1 a cada 5 min nas últimas 2 horas)
        for (let i = 0; i < 24; i++) {
            const capturedAt = new Date(now - (i * 5 * 60 * 1000));
            const hr = Math.floor(65 + Math.random() * 30);
            const spo2 = (96 + Math.random() * 3).toFixed(1);
            const bpSys = Math.floor(110 + Math.random() * 30);
            const bpDia = Math.floor(65 + Math.random() * 20);
            const temp = (36.0 + Math.random() * 1.2).toFixed(1);
            const steps = Math.floor(Math.random() * 500);
            const sleepStages = ['awake', 'light', 'deep', 'rem', null];
            const sleep = sleepStages[Math.floor(Math.random() * sleepStages.length)];
            const stress = Math.floor(20 + Math.random() * 50);

            await sequelize.query(`
                INSERT INTO vital_signs_monitoring
                (user_id, heart_rate, spo2, blood_pressure_sys, blood_pressure_dia,
                 skin_temperature, steps, sleep_stage, stress_level, captured_at, source)
                VALUES (:userId, :hr, :spo2, :bpSys, :bpDia, :temp, :steps, :sleep, :stress, :capturedAt, 'demo')
            `, {
                replacements: { userId, hr, spo2, bpSys, bpDia, temp, steps, sleep, stress, capturedAt },
                type: QueryTypes.INSERT
            });
            count++;
        }

        console.log(`🧪 [Demo] ${count} leituras geradas para User ${userId}`);
        res.json({ success: true, generated: count });
    } catch (error) {
        console.error('[Demo] Erro:', error);
        res.status(500).json({ error: 'Erro ao gerar dados demo' });
    }
};

// ====================================================================
// 13. DIAGNÓSTICO - Lista arquivos no Google Drive do usuário
// ====================================================================
exports.diagnoseDrive = async (req, res) => {
    try {
        const { userId } = req.query;
        if (!userId) return res.status(400).json({ error: 'userId é obrigatório' });

        const [tokenData] = await sequelize.query(
            `SELECT access_token, refresh_token, token_expiry, last_sync_at FROM google_fit_tokens WHERE user_id = :userId`,
            { replacements: { userId }, type: QueryTypes.SELECT }
        );

        if (!tokenData) return res.json({ error: 'Não conectado', connected: false });

        let accessToken = tokenData.access_token;

        // Refresh se expirou
        if (new Date(tokenData.token_expiry) < new Date()) {
            const refreshBody = new URLSearchParams({
                client_id: GOOGLE_DRIVE_CLIENT_ID,
                client_secret: GOOGLE_DRIVE_CLIENT_SECRET,
                refresh_token: tokenData.refresh_token,
                grant_type: 'refresh_token'
            }).toString();
            const refreshResponse = await httpsRequest('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: refreshBody
            });
            if (refreshResponse.statusCode !== 200) {
                return res.json({ error: 'Token expirado', refreshError: refreshResponse.data });
            }
            accessToken = refreshResponse.data.access_token;
        }

        const report = {
            connected: true,
            lastSyncAt: tokenData.last_sync_at,
            healthSyncFolder: HEALTH_SYNC_FOLDER,
            folders: [],
            allCsvFiles: [],
            sampleData: {}
        };

        // 1. Buscar TODAS as pastas
        const allFolders = await driveSearchFiles(accessToken,
            `mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
        report.folders = allFolders.map(f => ({ name: f.name, id: f.id }));

        // 2. Buscar TODOS os CSVs no Drive
        const allCsvs = await driveSearchFiles(accessToken,
            `(mimeType = 'text/csv' or name contains '.csv') and trashed = false`);
        report.allCsvFiles = allCsvs.map(f => ({ name: f.name, id: f.id, modified: f.modifiedTime, size: f.size }));

        // 3. Se não achou CSVs, buscar QUALQUER arquivo recente
        if (allCsvs.length === 0) {
            const anyFiles = await driveSearchFiles(accessToken, `trashed = false`);
            report.anyRecentFiles = anyFiles.slice(0, 20).map(f => ({ name: f.name, id: f.id, modified: f.modifiedTime }));
        }

        // 4. Para cada CSV encontrado, baixar amostra (primeiras 3 linhas)
        for (const csv of allCsvs.slice(0, 5)) {
            const content = await driveDownloadFile(accessToken, csv.id);
            if (content) {
                const lines = content.split('\n').slice(0, 4);
                report.sampleData[csv.name] = {
                    totalLines: content.split('\n').length,
                    headers: lines[0] || '',
                    sampleRows: lines.slice(1)
                };
            }
        }

        res.json(report);
    } catch (error) {
        res.status(500).json({ error: 'Erro diagnóstico', details: error.message });
    }
};
