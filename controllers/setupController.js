const { sequelize } = require('../models');

exports.installDatabase = async (req, res) => {
    try {
        console.log("--- INICIANDO REPARO AGRESSIVO DO BANCO DE DADOS ---");

        // 1. REPARO DE COLUNAS (Tenta em todas as variações de nome de tabela possíveis)
        // Isso resolve o erro "column blocked_features does not exist" de vez.
        const repairTable = async (tableName) => {
            try {
                console.log(`🔧 Tentando reparar tabela: ${tableName}...`);

                // Adiciona password_hash (caso esteja faltando - compatibilidade com schema)
                await sequelize.query(`
                    ALTER TABLE ${tableName}
                    ADD COLUMN IF NOT EXISTS "password_hash" VARCHAR(255);
                `);

                // MIGRAÇÃO CRÍTICA: Copia dados de 'password' para 'password_hash'
                // Isso resolve o erro "Senha incorreta" ao fazer login
                await sequelize.query(`
                    UPDATE ${tableName}
                    SET "password_hash" = "password"
                    WHERE "password_hash" IS NULL
                    AND "password" IS NOT NULL;
                `).catch(() => {
                    // Ignora erro se coluna 'password' não existir
                    console.log(`   ℹ️ Coluna 'password' não existe em ${tableName}, nada para migrar`);
                });

                // Adiciona blocked_features
                await sequelize.query(`
                    ALTER TABLE ${tableName}
                    ADD COLUMN IF NOT EXISTS "blocked_features" JSONB DEFAULT '{"preConsulta": false, "preOp": false}';
                `);
                // Preenche NULLs
                await sequelize.query(`
                    UPDATE ${tableName}
                    SET "blocked_features" = '{"preConsulta": false, "preOp": false}'
                    WHERE "blocked_features" IS NULL;
                `);

                // Adiciona credits (caso esteja faltando)
                await sequelize.query(`
                    ALTER TABLE ${tableName}
                    ADD COLUMN IF NOT EXISTS "credits" INTEGER DEFAULT 100;
                `);
                // Preenche NULLs
                await sequelize.query(`
                    UPDATE ${tableName}
                    SET "credits" = 100
                    WHERE "credits" IS NULL;
                `);

                // Adiciona created_at (caso esteja faltando)
                await sequelize.query(`
                    ALTER TABLE ${tableName}
                    ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
                `);
                // Preenche NULLs com timestamp atual
                await sequelize.query(`
                    UPDATE ${tableName}
                    SET "created_at" = CURRENT_TIMESTAMP
                    WHERE "created_at" IS NULL;
                `);

                // Adiciona phone (celular para contato de emergência)
                await sequelize.query(`
                    ALTER TABLE ${tableName}
                    ADD COLUMN IF NOT EXISTS "phone" VARCHAR(20);
                `);

                console.log(`✅ Tabela ${tableName} reparada.`);
            } catch (e) {
                // Ignora erro se a tabela não existir, mas loga para debug
                console.log(`⚠️ Tabela ${tableName} não encontrada ou erro: ${e.message}`);
            }
        };

        // Tenta reparar as 3 variações comuns do Sequelize/Postgres
        await repairTable('"users"');    // Padrão Sequelize (com aspas)
        await repairTable('users');      // Padrão SQL simples
        await repairTable('usuarios');   // Padrão Schema original

        // 2. RECRIAÇÃO DO CATÁLOGO (Garante que exames existam)
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS catalogo_itens (
                id SERIAL PRIMARY KEY,
                tipo VARCHAR(20),
                nome VARCHAR(150),
                slug VARCHAR(100),
                ativo BOOLEAN DEFAULT TRUE,
                ordem INT DEFAULT 0
            );
        `);

        // Verifica se está vazio e popula
        const [results] = await sequelize.query(`SELECT count(*) as total FROM catalogo_itens`);
        if (results[0].total == 0) {
            console.log("Populando catálogo...");
            const inserir = async (tipo, nome, i) => {
                await sequelize.query(`INSERT INTO catalogo_itens (tipo, nome, slug, ativo, ordem) VALUES ('${tipo}', '${nome}', '${tipo}_${i}', true, ${i})`);
            };

            const labs = ['Hemograma Completo', 'Glicemia em Jejum', 'Colesterol Total', 'Triglicerídeos', 'Creatinina', 'Ureia', 'TGO', 'TGP', 'TSH', 'T4 Livre', 'Urina 1', 'Urocultura', 'Parasitológico', 'Hemoglobina Glicada', 'PSA', 'Vitamina D', 'Beta HCG'];
            const imgs = ['Raio-X Tórax', 'USG Abdome', 'Mamografia', 'Eletrocardiograma', 'USG Transvaginal', 'Tomografia', 'Ecocardiograma'];
            const surgs = ['Catarata', 'Hemorroidectomia', 'Laqueadura', 'Hernioplastia', 'Colecistectomia', 'Histerectomia'];

            for(let i=0; i<labs.length; i++) await inserir('lab', labs[i], i);
            for(let i=0; i<imgs.length; i++) await inserir('img', imgs[i], i);
            for(let i=0; i<surgs.length; i++) await inserir('cirurgia', surgs[i], i);
        }

        // 3. CRIAR TABELA DE SESSÕES PRÉ-CONSULTA (Persistência de dados)
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS pre_consulta_sessions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                exam_list TEXT[] NOT NULL,
                comorbidities_used JSONB,
                is_confirmed BOOLEAN DEFAULT FALSE,
                confirmed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Tabela pre_consulta_sessions criada/verificada");

        // 4. CRIAR TABELA DE ANÁLISES PÓS-CONSULTA (Persistência de dados)
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS pos_consulta_analyses (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                patient_name VARCHAR(255),
                analysis_result TEXT,
                findings JSONB,
                files_processed INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Tabela pos_consulta_analyses criada/verificada");

        // 5. CRIAR TABELA DE AVALIAÇÕES PRÉ-OPERATÓRIAS (caso não exista)
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS preoperative_assessments (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                patient_name VARCHAR(255) NOT NULL,
                patient_age INTEGER NOT NULL,
                patient_cpf VARCHAR(20) NOT NULL,
                surgery_name VARCHAR(255) NOT NULL,
                clearance_status VARCHAR(50) NOT NULL DEFAULT 'pendente',
                missing_exams TEXT[],
                asa_score VARCHAR(50),
                lee_index VARCHAR(50),
                ai_report TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Tabela preoperative_assessments criada/verificada");

        // 6. CRIAR TABELA DE VERIFICAÇÃO DE EMAIL
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS email_verifications (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                token VARCHAR(255) NOT NULL UNIQUE,
                expires_at TIMESTAMP NOT NULL,
                used_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log("✅ Tabela email_verifications criada/verificada");

        // 7. CRIAR TABELA DE CONSENTIMENTOS LGPD
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS lgpd_consents (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                consent_version VARCHAR(20) NOT NULL DEFAULT '1.0',
                ip_address VARCHAR(45),
                user_agent TEXT,
                consent_data JSONB NOT NULL DEFAULT '{
                    "dados_identificacao": true,
                    "dados_contato": true,
                    "dados_navegacao": true,
                    "dados_geolocalizacao": true,
                    "dados_saude": true,
                    "download_pdf": true,
                    "compartilhamento_parceiros": true,
                    "analise_ia": true,
                    "contato_emergencia": true
                }',
                accepted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                revoked_at TIMESTAMP
            );
        `);
        console.log("✅ Tabela lgpd_consents criada/verificada");

        // 8. ADICIONAR COLUNA email_verified NA TABELA USERS (se não existir)
        await sequelize.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
        `);
        await sequelize.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;
        `);
        console.log("✅ Colunas email_verified e email_verified_at adicionadas/verificadas");

        // 9. ADICIONAR COLUNA phone NA TABELA USERS (se não existir)
        await sequelize.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
        `);
        console.log("✅ Coluna phone adicionada/verificada na tabela users");

        // 10. ADICIONAR COLUNAS birth_date e cep NA TABELA USERS (se não existir)
        await sequelize.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS birth_date DATE;
        `);
        await sequelize.query(`
            ALTER TABLE users
            ADD COLUMN IF NOT EXISTS cep VARCHAR(9);
        `);
        console.log("✅ Colunas birth_date e cep adicionadas/verificadas na tabela users");

        // 11. TABELA DE MONITORAMENTO DE SINAIS VITAIS
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS vital_signs_monitoring (
                id BIGSERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                device_id VARCHAR(100),
                heart_rate INTEGER,
                spo2 DECIMAL(5,2),
                blood_pressure_sys INTEGER,
                blood_pressure_dia INTEGER,
                skin_temperature DECIMAL(4,2),
                steps INTEGER,
                sleep_stage VARCHAR(20),
                stress_level INTEGER,
                captured_at TIMESTAMP NOT NULL,
                synced_at TIMESTAMP DEFAULT NOW(),
                source VARCHAR(50),
                raw_data JSONB
            );
        `);
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_vitals_user_time ON vital_signs_monitoring(user_id, captured_at DESC);
        `);
        console.log("✅ Tabela vital_signs_monitoring criada/verificada");

        // 12. TABELA DE ALERTAS DE SINAIS VITAIS
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS vital_alerts (
                id BIGSERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                vital_sign_id BIGINT,
                alert_type VARCHAR(50),
                severity VARCHAR(20),
                message TEXT,
                ai_analysis TEXT,
                acknowledged BOOLEAN DEFAULT FALSE,
                acknowledged_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log("✅ Tabela vital_alerts criada/verificada");

        // 13. TABELA DE TOKENS GOOGLE FIT
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS google_fit_tokens (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE UNIQUE,
                access_token TEXT,
                refresh_token TEXT,
                token_expiry TIMESTAMP,
                scopes TEXT,
                connected_at TIMESTAMP DEFAULT NOW(),
                last_sync_at TIMESTAMP
            );
        `);
        console.log("✅ Tabela google_fit_tokens criada/verificada");

        // 14. ADICIONAR COLUNA severity_level NA TABELA pos_consulta_analyses (se não existir)
        await sequelize.query(`
            ALTER TABLE pos_consulta_analyses
            ADD COLUMN IF NOT EXISTS severity_level VARCHAR(20) DEFAULT 'normal';
        `);
        console.log("✅ Coluna severity_level adicionada/verificada na tabela pos_consulta_analyses");

        res.send(`
            <div style="font-family: sans-serif; padding: 20px; background: #ecfccb; color: #365314; border: 1px solid #84cc16; border-radius: 8px;">
                <h1>✅ Reparo Completo Executado!</h1>
                <p>1. Colunas <strong>password_hash</strong>, <strong>blocked_features</strong>, <strong>credits</strong> e <strong>created_at</strong> adicionadas/verificadas na tabela 'users'.</p>
                <p>2. Dados de senha migrados de <strong>password</strong> → <strong>password_hash</strong> (resolve erro de login).</p>
                <p>3. Valores NULL preenchidos com defaults.</p>
                <p>4. Catálogo de exames/cirurgias verificado.</p>
                <p>5. Tabelas de <strong>sessões</strong> (pre_consulta_sessions, pos_consulta_analyses, preoperative_assessments) criadas.</p>
                <p>6. Tabela <strong>email_verifications</strong> criada (confirmação de email).</p>
                <p>7. Tabela <strong>lgpd_consents</strong> criada (consentimentos LGPD).</p>
                <p>8. Colunas <strong>email_verified</strong> e <strong>email_verified_at</strong> adicionadas na tabela users.</p>
                <p>9. Coluna <strong>phone</strong> adicionada na tabela users (celular para contato de emergência).</p>
                <p>10. Colunas <strong>birth_date</strong> e <strong>cep</strong> adicionadas na tabela users (data de nascimento e CEP).</p>
                <p>11. Tabela <strong>vital_signs_monitoring</strong> criada (monitoramento de sinais vitais).</p>
                <p>12. Tabela <strong>vital_alerts</strong> criada (alertas automáticos de sinais vitais).</p>
                <p>13. Tabela <strong>google_fit_tokens</strong> criada (integração Google Fit).</p>
                <p>14. Coluna <strong>severity_level</strong> adicionada na tabela pos_consulta_analyses (classificação de gravidade).</p>
                <hr>
                <p><strong>✅ BANCO DE DADOS ATUALIZADO!</strong> Sistema de confirmação de email, LGPD e gravidade de exames configurado.</p>
                <a href="/" style="display: inline-block; margin-top: 10px; padding: 10px 20px; background: #365314; color: white; text-decoration: none; border-radius: 5px;">Voltar ao App</a>
            </div>
        `);

    } catch (error) {
        console.error("Erro fatal setup:", error);
        res.status(500).send(`❌ Erro: ${error.message}`);
    }
};