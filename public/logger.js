/**
 * SISTEMA DE LOGGING AVANÇADO
 * Logs estruturados com cores no console e persistência opcional
 */

class Logger {
    static COLORS = {
        info: '#3498db',
        success: '#2ecc71',
        warn: '#f39c12',
        error: '#e74c3c',
        debug: '#9b59b6'
    };
    
    static LEVELS = {
        DEBUG: 0,
        INFO: 1,
        SUCCESS: 2,
        WARN: 3,
        ERROR: 4
    };
    
    static currentLevel = Logger.LEVELS.INFO;
    static logs = [];
    static maxLogs = 1000;
    
    /**
     * Configura o nível de logging
     */
    static setLevel(level) {
        this.currentLevel = level;
    }
    
    /**
     * Log de informação
     */
    static info(module, message, data = null) {
        this.log('info', module, message, data);
    }
    
    /**
     * Log de sucesso
     */
    static success(module, message, data = null) {
        this.log('success', module, message, data);
    }
    
    /**
     * Log de aviso
     */
    static warn(module, message, data = null) {
        this.log('warn', module, message, data);
    }
    
    /**
     * Log de erro
     */
    static error(module, message, data = null) {
        this.log('error', module, message, data);
        
        // Envia erro para backend (opcional)
        this.sendErrorToBackend(module, message, data);
    }
    
    /**
     * Log de debug
     */
    static debug(module, message, data = null) {
        this.log('debug', module, message, data);
    }
    
    /**
     * Método principal de logging
     */
    static log(type, module, message, data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            type,
            module,
            message,
            data,
            url: window.location.href,
            user: window.currentUser ? window.currentUser.email : 'anonymous'
        };
        
        // Armazena log
        this.logs.push(logEntry);
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }
        
        // Exibe no console com cores
        if (this.shouldLog(type)) {
            const style = `background: ${this.COLORS[type]}; color: white; padding: 2px 6px; border-radius: 3px;`;
            console.log(
                `%c${timestamp}%c %c${module.toUpperCase()}%c %c${type.toUpperCase()}%c ${message}`,
                'color: #666;',
                '',
                style,
                '',
                'font-weight: bold;',
                '',
                data ? data : ''
            );
        }
        
        // Se for erro crítico, mostra toast para usuário
        if (type === 'error' && message.includes('crítico')) {
            showToast(`Erro: ${message}`, 'error');
        }
    }
    
    /**
     * Verifica se deve logar baseado no nível
     */
    static shouldLog(type) {
        const typeLevel = this.LEVELS[type.toUpperCase()] || this.LEVELS.INFO;
        return typeLevel >= this.currentLevel;
    }
    
    /**
     * Envia erro crítico para backend
     */
    static async sendErrorToBackend(module, message, data) {
        try {
            if (!CONFIG.BACKEND_URL) return;
            
            const errorData = {
                timestamp: new Date().toISOString(),
                module,
                message,
                data: data ? JSON.stringify(data).substring(0, 500) : null,
                url: window.location.href,
                userAgent: navigator.userAgent
            };
            
            await fetch(`${CONFIG.BACKEND_URL}/api/logs/error`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(errorData)
            });
        } catch (error) {
            // Silencioso - não queremos loops de erro
        }
    }
    
    /**
     * Exporta logs para download
     */
    static exportLogs() {
        const dataStr = JSON.stringify(this.logs, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        
        const exportFileDefaultName = `conecta-logs-${new Date().toISOString().split('T')[0]}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
    }
    
    /**
     * Limpa logs
     */
    static clearLogs() {
        this.logs = [];
    }
    
    /**
     * Obtém estatísticas dos logs
     */
    static getStats() {
        const stats = {
            total: this.logs.length,
            byType: {},
            byModule: {},
            lastHour: this.logs.filter(log => {
                const logTime = new Date(log.timestamp);
                const hourAgo = new Date(Date.now() - 3600000);
                return logTime > hourAgo;
            }).length
        };
        
        this.logs.forEach(log => {
            stats.byType[log.type] = (stats.byType[log.type] || 0) + 1;
            stats.byModule[log.module] = (stats.byModule[log.module] || 0) + 1;
        });
        
        return stats;
    }
}

// Inicializa logger no contexto global
window.Logger = Logger;

// Captura erros globais não tratados
window.addEventListener('error', function(event) {
    Logger.error('Global', `Erro não tratado: ${event.message}`, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error?.stack
    });
});

// Captura promessas rejeitadas não tratadas
window.addEventListener('unhandledrejection', function(event) {
    Logger.error('Global', `Promise rejeitada não tratada: ${event.reason}`, {
        reason: event.reason?.message || event.reason
    });
});

// Log de navegação
let lastUrl = window.location.href;
setInterval(() => {
    if (window.location.href !== lastUrl) {
        Logger.info('Navigation', `URL alterada: ${lastUrl} → ${window.location.href}`);
        lastUrl = window.location.href;
    }
}, 1000);