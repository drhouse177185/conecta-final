/**
 * CONFIGURAÇÕES GLOBAIS DO SISTEMA
 * Mantém todas as configurações em um só lugar
 */

// Configuração de Ambiente
const CONFIG = {
    // Detecta ambiente
    IS_LOCAL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1',
    
    // URLs do Backend
    BACKEND_URL: (function() {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return "http://localhost:3000";
        }
        return window.location.origin; // Usa a própria URL (https://conecta-final.onrender.com)
    })(),
    
    // Chaves de API
    MP_PUBLIC_KEY: "TEST-00000000-0000-0000-0000-000000000000",
    GEMINI_API_KEY: "", // Será preenchida pelo backend
    
    // Versão do Sistema
    VERSION: "2.5",
    
    // Custos em créditos
    COSTS: {
        PRE_CONSULTA: 80,
        POS_CONSULTA: 10,
        PRE_OPERATORIO: 100
    },
    
    // Configurações de TTS
    TTS: {
        VOICE: "Aoede",
        RATE: 1.0,
        PITCH: 1.0
    }
};

// Variáveis globais do sistema
let SYSTEM_SETTINGS = {
    exams: {
        lab: [],
        img: []
    },
    surgeries: []
};

let currentUser = null;
let currentPreOpFiles = [];
let missingExamsList = [];
let referralQueue = [];

// Inicialização do Mercado Pago
let mp = null;
if (typeof MercadoPago !== 'undefined') {
    try {
        mp = new MercadoPago(CONFIG.MP_PUBLIC_KEY);
        Logger.info('Config', 'Mercado Pago SDK carregado');
    } catch(e) {
        Logger.error('Config', 'Erro ao carregar Mercado Pago SDK', e);
    }
}

// Carrega configuração do backend
async function loadBackendConfig() {
    try {
        Logger.info('Config', `Tentando buscar configuração em: ${CONFIG.BACKEND_URL}/api/config`);
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/config`);
        
        if (response.ok) {
            const data = await response.json();
            if (data.apiKey) {
                CONFIG.GEMINI_API_KEY = data.apiKey;
                Logger.success('Config', 'Chave de API carregada com segurança');
                
                // Carrega configurações do sistema
                await loadSystemSettings();
            } else {
                Logger.warn('Config', 'Backend respondeu, mas sem chave de API');
            }
        } else {
            Logger.error('Config', `Erro no backend: ${response.status}`);
        }
    } catch (error) {
        Logger.error('Config', 'Falha de conexão na configuração', error);
    }
}

// Carrega configurações do sistema (exames, cirurgias)
async function loadSystemSettings() {
    try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/settings`);
        if (response.ok) {
            const data = await response.json();
            SYSTEM_SETTINGS = data;
            Logger.success('Config', 'Configurações do sistema carregadas');
        }
    } catch (error) {
        Logger.warn('Config', 'Usando configurações padrão do sistema');
        loadDefaultSettings();
    }
}

// Configurações padrão (fallback)
function loadDefaultSettings() {
    SYSTEM_SETTINGS = {
        exams: {
            lab: [
                {id: 'hemograma', name: 'Hemograma Completo', active: true},
                {id: 'glicemia', name: 'Glicemia em Jejum', active: true},
                // ... outros exames (lista completa do seu código original)
            ],
            img: [
                {id: 'rx_torax', name: 'Raio-X de Tórax', active: true},
                // ... outros exames de imagem
            ]
        },
        surgeries: [
            {id: 'catarata', name: 'Correção de Catarata', active: true},
            // ... outras cirurgias
        ]
    };
}

// Inicialização do sistema
async function initializeSystem() {
    Logger.info('System', 'Inicializando sistema...');
    
    // Carrega configuração em background
    loadBackendConfig().then(() => {
        Logger.success('System', 'Sistema inicializado com sucesso');
    }).catch(error => {
        Logger.error('System', 'Erro na inicialização', error);
    });
    
    // Remove splash screen após 3 segundos
    setTimeout(() => {
        const splash = document.getElementById('splash-screen');
        if (splash) {
            splash.style.opacity = '0';
            setTimeout(() => splash.remove(), 1000);
        }
    }, 3000);
}

// Exportar para uso global
window.CONFIG = CONFIG;
window.SYSTEM_SETTINGS = SYSTEM_SETTINGS;
window.currentUser = currentUser;