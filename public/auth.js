/**
 * MÓDULO DE AUTENTICAÇÃO
 * Login, registro, recuperação de senha e gerenciamento de sessão
 */

// Variáveis do módulo
let authModule = {
    currentStep: 1,
    recoveryData: null
};

// Login com email/senha
async function handleEmailLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = document.querySelector('#form-login button[type="submit"]');
    
    // Validação básica
    if (!email || !password) {
        return showToast('Preencha todos os campos', 'error');
    }
    
    if (!validateEmail(email)) {
        return showToast('Email inválido', 'error');
    }
    
    // Feedback visual
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ACESSANDO...';
    btn.disabled = true;
    
    Logger.info('Auth', 'Tentativa de login', { email });
    
    try {
        // Tenta login no backend
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            Logger.success('Auth', `Login bem-sucedido: ${data.name}`);
            showToast(`Bem-vindo de volta, ${data.name}!`, 'success');
            
            // Salva sessão
            localStorage.setItem('conecta_user', JSON.stringify(data));
            localStorage.setItem('conecta_token', data.token || '');
            
            // Inicializa a aplicação
            initializeApp(data);
        } else {
            Logger.warn('Auth', 'Login falhou', data);
            showToast(data.message || 'Credenciais inválidas', 'error');
        }
    } catch (error) {
        Logger.error('Auth', 'Erro na conexão', error);
        
        // Fallback para dados mock (apenas em desenvolvimento)
        if (CONFIG.IS_LOCAL) {
            Logger.warn('Auth', 'Usando fallback mock');
            handleMockLogin(email, password);
        } else {
            showToast('Erro de conexão com o servidor', 'error');
        }
    } finally {
        // Restaura botão
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Fallback para login mock (apenas desenvolvimento)
function handleMockLogin(email, password) {
    // Dados mock (remover em produção)
    const mockUsers = [
        { email: "drtiago.barros@gmail.com", password: "123456", name: "Dr. Tiago Barros", role: 'admin' },
        { email: "kellen@email.com", password: "123", name: "Kellen Fernandes", role: 'user', credits: 100 }
    ];
    
    const user = mockUsers.find(u => u.email === email && u.password === password);
    
    if (user) {
        showToast(`Bem-vindo (modo mock), ${user.name}!`, 'success');
        initializeApp(user);
    } else {
        showToast('Credenciais inválidas', 'error');
    }
}

// Registro de novo usuário
async function handleRegister() {
    const name = document.getElementById('reg-name').value.trim();
    const age = parseInt(document.getElementById('reg-age').value);
    const sex = document.getElementById('reg-sex').value;
    const email = document.getElementById('reg-email').value.trim();
    const cpf = document.getElementById('reg-cpf').value;
    const password = document.getElementById('reg-password').value;
    
    // Validações
    if (!name || !email || !password) {
        return showToast('Preencha os campos obrigatórios', 'error');
    }
    
    if (!validateEmail(email)) {
        return showToast('Email inválido', 'error');
    }
    
    if (password.length < 3) {
        return showToast('Senha deve ter no mínimo 3 caracteres', 'error');
    }
    
    const btn = document.querySelector('#form-register button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> CADASTRANDO...';
    btn.disabled = true;
    
    Logger.info('Auth', 'Tentativa de registro', { email, name });
    
    try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, age, sex, email, cpf, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            Logger.success('Auth', `Usuário registrado: ${name}`);
            showToast('Conta criada com sucesso! Faça login.', 'success');
            switchAuthTab('login');
        } else {
            Logger.warn('Auth', 'Registro falhou', data);
            showToast(data.message || 'Erro ao registrar', 'error');
        }
    } catch (error) {
        Logger.error('Auth', 'Erro no registro', error);
        showToast('Erro de conexão', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

// Recuperação de senha
async function handleRecoveryStep() {
    const cpf = document.getElementById('recover-cpf').value;
    const newPassInput = document.getElementById('recover-new-pass');
    const confirmPassInput = document.getElementById('recover-confirm-pass');
    const btn = document.getElementById('btn-recover');
    
    if (!cpf || cpf.length < 11) {
        return showToast('Digite um CPF válido', 'error');
    }
    
    btn.disabled = true;
    
    try {
        // PASSO 1: Validar CPF
        if (authModule.currentStep === 1) {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Verificando...';
            
            Logger.info('Auth', 'Iniciando recuperação', { cpf });
            
            const response = await fetch(`${CONFIG.BACKEND_URL}/api/auth/recover`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cpf })
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                Logger.success('Auth', 'CPF validado para recuperação');
                authModule.currentStep = 2;
                authModule.recoveryData = { cpf };
                
                document.getElementById('recover-cpf').disabled = true;
                document.getElementById('rec-step-2').classList.remove('hidden');
                
                btn.textContent = "REDEFINIR SENHA";
                btn.classList.replace('bg-blue-600', 'bg-green-600');
                btn.disabled = false;
                
                newPassInput.focus();
            } else {
                showToast(data.message || 'CPF não encontrado', 'error');
                btn.innerHTML = "BUSCAR CONTA";
                btn.disabled = false;
            }
        } 
        // PASSO 2: Redefinir senha
        else if (authModule.currentStep === 2) {
            const newPass = newPassInput.value;
            const confirmPass = confirmPassInput.value;
            
            if (!newPass || !confirmPass) {
                showToast('Preencha os dois campos de senha', 'error');
                btn.disabled = false;
                return;
            }
            
            if (newPass !== confirmPass) {
                showToast('As senhas não coincidem!', 'error');
                newPassInput.classList.add('border-red-500');
                confirmPassInput.classList.add('border-red-500');
                setTimeout(() => {
                    newPassInput.classList.remove('border-red-500');
                    confirmPassInput.classList.remove('border-red-500');
                }, 2000);
                btn.disabled = false;
                return;
            }
            
            btn.innerHTML = '<i class="fa-solid fa-save fa-spin"></i> Salvando...';
            
            const response = await fetch(`${CONFIG.BACKEND_URL}/api/auth/recover`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    cpf: authModule.recoveryData.cpf, 
                    newPassword: newPass 
                })
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
                Logger.success('Auth', 'Senha redefinida com sucesso');
                showToast('Senha redefinida com sucesso! Faça login.', 'success');
                closeRecoverModal();
            } else {
                showToast('Erro ao salvar senha', 'error');
                btn.textContent = "REDEFINIR SENHA";
                btn.disabled = false;
            }
        }
    } catch (error) {
        Logger.error('Auth', 'Erro na recuperação', error);
        showToast('Erro de conexão', 'error');
        btn.disabled = false;
        if (authModule.currentStep === 1) {
            btn.textContent = "BUSCAR CONTA";
        } else {
            btn.textContent = "REDEFINIR SENHA";
        }
    }
}

// Inicializa aplicação após login
function initializeApp(user) {
    Logger.info('App', `Inicializando para usuário: ${user.name} (${user.role})`);
    
    currentUser = user;
    window.currentUser = user;
    
    // Atualiza UI com dados do usuário
    document.getElementById('user-display').textContent = `Olá, ${user.name}`;
    safeSetValue('pre-name', user.name);
    safeSetValue('pre-age', user.age);
    safeSetValue('op-name', user.name);
    
    // Verifica recarga automática
    if (user.role !== 'admin') {
        checkAutoRecharge(user);
    }
    
    // Esconde tela de login
    document.getElementById('auth-view').classList.add('hidden');
    
    // Roteamento por tipo de usuário
    if (user.role === 'admin') {
        document.getElementById('admin-view').classList.remove('hidden');
        renderAdminPanel();
    } else {
        document.getElementById('main-app').classList.remove('hidden');
        updateCreditDisplay();
        initializeUserFeatures();
    }
    
    // Inicializa ícones
    lucide.createIcons();
}

// Inicializa features específicas do usuário
function initializeUserFeatures() {
    // Configura opção de gravidez baseada no sexo
    const lblPreg = document.getElementById('lbl-pregnancy');
    if (lblPreg) {
        if (currentUser.sex === 'F') {
            lblPreg.classList.remove('hidden');
        } else {
            lblPreg.classList.add('hidden');
            const checkPreg = document.getElementById('check-pregnancy');
            if (checkPreg) checkPreg.checked = false;
        }
    }
    
    // Popula select de cirurgias
    const surgerySelect = document.getElementById('surgery-type');
    if (surgerySelect && SYSTEM_SETTINGS.surgeries) {
        surgerySelect.innerHTML = SYSTEM_SETTINGS.surgeries
            .filter(s => s.active)
            .map(s => `<option value="${s.id}">${s.name}</option>`)
            .join('');
    }
}

// Logout
function handleLogout() {
    Logger.info('Auth', `Logout: ${currentUser?.name}`);
    
    // Limpa sessão
    localStorage.removeItem('conecta_user');
    localStorage.removeItem('conecta_token');
    
    // Recarrega a página
    location.reload();
}

// Alterna entre abas de autenticação
function switchAuthTab(tab) {
    if (tab === 'login') {
        document.getElementById('form-login').classList.remove('hidden');
        document.getElementById('form-register').classList.add('hidden');
        document.getElementById('tab-login').className = "w-1/2 py-3 font-bold text-blue-900 bg-blue-50 border-b-2 border-blue-900";
        document.getElementById('tab-register').className = "w-1/2 py-3 text-gray-500 hover:text-blue-700";
    } else {
        document.getElementById('form-login').classList.add('hidden');
        document.getElementById('form-register').classList.remove('hidden');
        document.getElementById('tab-register').className = "w-1/2 py-3 font-bold text-blue-900 bg-blue-50 border-b-2 border-blue-900";
        document.getElementById('tab-login').className = "w-1/2 py-3 text-gray-500 hover:text-blue-700";
    }
}

// Fecha modal de recuperação
function closeRecoverModal() {
    document.getElementById('recover-modal').classList.remove('active');
    
    // Reseta estado
    setTimeout(() => {
        authModule.currentStep = 1;
        authModule.recoveryData = null;
        
        document.getElementById('rec-step-1').classList.remove('hidden');
        document.getElementById('rec-step-2').classList.add('hidden');
        document.getElementById('recover-cpf').disabled = false;
        document.getElementById('recover-cpf').value = "";
        document.getElementById('recover-new-pass').value = "";
        document.getElementById('recover-confirm-pass').value = "";
        
        const btn = document.getElementById('btn-recover');
        btn.textContent = "BUSCAR CONTA";
        btn.classList.replace('bg-green-600', 'bg-blue-600');
        btn.disabled = false;
    }, 300);
}

// Exporta funções
window.auth = {
    handleEmailLogin,
    handleRegister,
    handleRecoveryStep,
    switchAuthTab,
    closeRecoverModal,
    handleLogout,
    initializeApp
};