const { sequelize } = require('../models');

exports.installDatabase = async (req, res) => {
    try {
        console.log("--- REINSTALAÇÃO FORÇADA DO CATÁLOGO ---");

        // 1. GARANTIA DAS TABELAS (Estrutura)
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS catalogo_itens (
                id SERIAL PRIMARY KEY,
                tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('lab', 'img', 'cirurgia')),
                nome VARCHAR(150) NOT NULL,
                slug VARCHAR(100),
                ativo BOOLEAN DEFAULT TRUE,
                ordem INT DEFAULT 0
            );
        `);

        // 2. LIMPEZA TOTAL (Isso resolve o problema do "Vazio")
        // Apaga todos os itens antigos para evitar duplicidade ou listas incompletas
        console.log("🧹 Limpando catálogo antigo...");
        await sequelize.query(`TRUNCATE TABLE catalogo_itens RESTART IDENTITY`);

        // 3. INSERÇÃO DOS DADOS (A Lista da Foto 2 e 3)
        console.log("📝 Inserindo lista completa...");

        const examesLaboratorio = [
            'Hemograma Completo', 'Glicemia em Jejum', 'Colesterol Total e Frações', 'Triglicerídeos',
            'Creatinina', 'Ureia', 'TGO (AST)', 'TGP (ALT)', 'TSH', 'T4 Livre', 
            'Urina Tipo 1 (EAS)', 'Urocultura', 'Parasitológico de Fezes', 
            'Hemoglobina Glicada', 'PSA Total', 'Ácido Úrico', 'Proteína C Reativa', 
            'VHS', 'Ferritina', 'Vitamina D', 'Sorologia HIV 1 e 2', 
            'VDRL (Sífilis)', 'HbsAg (Hepatite B)', 'Anti-HCV (Hepatite C)', 'Beta HCG (Gravidez)'
        ];

        const examesImagem = [
            'Raio-X de Tórax', 'USG Abdome Total', 'Mamografia Bilateral', 
            'Eletrocardiograma', 'USG Transvaginal', 'USG Próstata (Via Abdominal)', 
            'Tomografia de Crânio', 'Tomografia de Tórax', 'USG de Mamas', 
            'USG Obstétrica', 'Raio-X Seios da Face', 'Ecocardiograma'
        ];

        const cirurgias = [
            'Correção de Catarata', 'Hemorroidectomia', 'Laqueadura Tubária', 
            'Hernioplastia', 'Colecistectomia', 'Histerectomia Total', 'Outra (Médio Porte)'
        ];

        // Função Helper para inserir
        const inserir = async (lista, tipo) => {
            for (let i = 0; i < lista.length; i++) {
                const nome = lista[i];
                const slug = `${tipo}_${i}`;
                await sequelize.query(`
                    INSERT INTO catalogo_itens (tipo, nome, slug, ativo, ordem) 
                    VALUES ('${tipo}', '${nome}', '${slug}', true, ${i})
                `);
            }
        };

        await inserir(examesLaboratorio, 'lab');
        await inserir(examesImagem, 'img');
        await inserir(cirurgias, 'cirurgia');

        console.log("--- CATÁLOGO RESTAURADO COM SUCESSO ---");
        
        res.send(`
            <div style="font-family: sans-serif; padding: 20px; background: #dcfce7; color: #166534; border: 1px solid #166534; border-radius: 8px;">
                <h1>✅ Catálogo Restaurado!</h1>
                <p>Foram inseridos:</p>
                <ul>
                    <li>${examesLaboratorio.length} Exames Laboratoriais</li>
                    <li>${examesImagem.length} Exames de Imagem (Foto 3)</li>
                    <li>${cirurgias.length} Cirurgias</li>
                </ul>
                <p><strong>Atenção:</strong> Volte ao app e recarregue a página (F5) para ver os itens.</p>
                <a href="/" style="display: inline-block; margin-top: 10px; padding: 10px 20px; background: #166534; color: white; text-decoration: none; border-radius: 5px;">Voltar ao App</a>
            </div>
        `);

    } catch (error) {
        console.error("Erro setup:", error);
        res.status(500).send(`❌ Erro: ${error.message}`);
    }
};