/**
 * FUNÇÕES UTILITÁRIAS
 * Funções reutilizáveis em todo o sistema
 */

// Utilitário de Toast (Notificações)
function showToast(msg, type = 'error') {
    Logger.info('UI', `Toast: ${type} - ${msg}`);
    
    const container = document.getElementById('toast-container');
    if (!container) {
        console.warn('Toast container não encontrado');
        return;
    }
    
    const el = document.createElement('div');
    
    // Mapeia tipos para cores
    const typeConfig = {
        success: { bg: 'bg-green-600', icon: 'fa-check-circle' },
        info: { bg: 'bg-blue-600', icon: 'fa-circle-info' },
        warning: { bg: 'bg-yellow-500', icon: 'fa-triangle-exclamation' },
        error: { bg: 'bg-red-500', icon: 'fa-triangle-exclamation' }
    };
    
    const config = typeConfig[type] || typeConfig.error;
    
    el.className = `pointer-events-auto transform transition-all duration-300 translate-x-full shadow-lg rounded-lg p-4 text-white font-bold text-sm max-w-sm flex items-center ${config.bg}`;
    el.innerHTML = `<i class="fa-solid ${config.icon} mr-2"></i> <span>${msg}</span>`;
    
    container.appendChild(el);
    
    // Animação de entrada
    requestAnimationFrame(() => el.classList.remove('translate-x-full'));
    
    // Remove automaticamente após 5 segundos
    setTimeout(() => {
        el.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => el.remove(), 300);
    }, 5000);
    
    return el;
}

// Validação de CPF
function validateCPF(cpf) {
    cpf = cpf.replace(/[^\d]/g, '');
    
    if (cpf.length !== 11) return false;
    if (/^(\d)\1+$/.test(cpf)) return false;
    
    let soma = 0;
    for (let i = 0; i < 9; i++) {
        soma += parseInt(cpf.charAt(i)) * (10 - i);
    }
    
    let resto = soma % 11;
    let digito1 = resto < 2 ? 0 : 11 - resto;
    
    if (digito1 !== parseInt(cpf.charAt(9))) return false;
    
    soma = 0;
    for (let i = 0; i < 10; i++) {
        soma += parseInt(cpf.charAt(i)) * (11 - i);
    }
    
    resto = soma % 11;
    let digito2 = resto < 2 ? 0 : 11 - resto;
    
    return digito2 === parseInt(cpf.charAt(10));
}

// Máscara de CPF
function mascaraCPF(input) {
    let value = input.value.replace(/\D/g, '');
    
    if (value.length > 11) {
        value = value.substring(0, 11);
    }
    
    value = value.replace(/(\d{3})(\d)/, '$1.$2');
    value = value.replace(/(\d{3})(\d)/, '$1.$2');
    value = value.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    
    input.value = value;
    
    // Validação visual
    if (value.length === 14) {
        const isValid = validateCPF(value);
        if (isValid) {
            input.classList.remove('border-red-500');
            input.classList.add('border-green-500');
        } else {
            input.classList.remove('border-green-500');
            input.classList.add('border-red-500');
        }
    } else {
        input.classList.remove('border-red-500', 'border-green-500');
    }
}

// Formatação de data
function formatDate(date, format = 'pt-BR') {
    const d = new Date(date);
    
    if (format === 'pt-BR') {
        return d.toLocaleDateString('pt-BR');
    } else if (format === 'iso') {
        return d.toISOString().split('T')[0];
    } else if (format === 'full') {
        return d.toLocaleDateString('pt-BR', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }
    
    return d.toLocaleDateString();
}

// Formatação de moeda
function formatCurrency(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value);
}

// Debounce para otimização
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Throttle para otimização
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Validação de email
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// Limpa caracteres especiais
function sanitizeInput(input) {
    return input
        .replace(/[<>]/g, '') // Remove tags HTML
        .trim()
        .substring(0, 1000); // Limita tamanho
}

// Copia texto para clipboard
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('Texto copiado!', 'success');
        return true;
    } catch (err) {
        console.error('Erro ao copiar:', err);
        showToast('Erro ao copiar texto', 'error');
        return false;
    }
}

// Gerar hash simples
function generateHash(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Verifica se é mobile
function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Exportar funções
window.utils = {
    showToast,
    validateCPF,
    mascaraCPF,
    formatDate,
    formatCurrency,
    validateEmail,
    sanitizeInput,
    copyToClipboard,
    generateHash,
    isMobile,
    debounce,
    throttle
};