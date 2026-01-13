/**
 * FUNÇÕES PRINCIPAIS DO SISTEMA
 * Controle de abas, inicialização e funções globais
 */

// Alterna entre abas principais
function switchTab(id) {
    Logger.info('Navigation', `Mudando para aba ${id}`);
    
    // Esconde todas as páginas
    [0, 1, 2].forEach(i => {
        document.getElementById(`page-${i}`).classList.add('hidden');
        document.getElementById(`btn-tab-${i}`).className = "tab-inactive flex-1 py-3 text-sm font-bold border-b-2 uppercase tracking-wide flex justify-center items-center whitespace-nowrap px-4 transition";
    });
    
    // Mostra a página selecionada
    document.getElementById(`page-${id}`).classList.remove('hidden');
    document.getElementById(`btn-tab-${id}`).className = "tab-active flex-1 py-3 text-sm font-bold border-b-2 uppercase tracking-wide flex justify-center items-center whitespace-nowrap px-4 transition";
}

// Define valor de forma segura em inputs
function safeSetValue(id, value) {
    const element = document.getElementById(id);
    if (element) {
        element.value = value;
    } else {
        Logger.warn('Utils', `Elemento não encontrado: ${id}`);
    }
}

// Obtém valor de forma segura
function safeGetValue(id) {
    const element = document.getElementById(id);
    return element ? element.value : null;
}

// Verifica se o usuário tem créditos suficientes
function hasCredits(cost) {
    if (!currentUser) {
        showToast('Usuário não autenticado', 'error');
        return false;
    }
    
    if (currentUser.role === 'admin') return true;
    
    if (currentUser.credits >= cost) {
        return true;
    }
    
    Logger.warn('Credits', `Saldo insuficiente: ${currentUser.credits} < ${cost}`);
    showToast(`Saldo insuficiente (${currentUser.credits}). Necessário: ${cost} créditos.`, "error");
    
    // Sugere recarga
    setTimeout(() => {
        if (confirm("Saldo insuficiente. Deseja recarregar créditos?")) {
            openRechargeModal();
        }
    }, 1000);
    
    return false;
}

// Desconta créditos do usuário
function deductCredits(cost) {
    if (!currentUser || currentUser.role === 'admin') return;
    
    currentUser.credits -= cost;
    updateCreditDisplay();
    Logger.info('Credits', `Créditos debitados: -${cost}`, { saldo: currentUser.credits });
}

// Atualiza exibição de créditos
function updateCreditDisplay() {
    if (!currentUser) return;
    
    const el = document.getElementById('credit-val');
    const container = document.getElementById('credit-display');
    
    if (el) {
        el.textContent = currentUser.credits;
    }
    
    if (container) {
        container.className = "credits-badge " + 
            (currentUser.credits > 50 ? "credits-high" : 
             (currentUser.credits > 20 ? "credits-med" : "credits-low"));
    }
    
    // Atualiza também no modal se estiver aberto
    const modalEl = document.getElementById('modal-credit-val');
    if (modalEl) {
        modalEl.textContent = currentUser.credits;
    }
}

// Verifica recarga automática (SUS Racional)
function checkAutoRecharge(user) {
    if (user.role === 'admin') return;
    
    const today = new Date();
    const last = new Date(user.lastRecharge || '2024-01-01');
    const diffTime = Math.abs(today - last);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    let recharged = false;
    
    // Regras SUS: Idosos renovam a cada 6 meses, outros a cada 1 ano
    if (user.age > 60) {
        if (diffDays >= 180) recharged = true;
    } else {
        if (diffDays >= 365) recharged = true;
    }
    
    if (recharged) {
        user.credits = 100;
        user.lastRecharge = today.toISOString().split('T')[0];
        
        Logger.info('Credits', `Recarga automática SUS para ${user.name}`);
        showToast("Sua cota de créditos SUS foi renovada automaticamente!", "success");
        updateCreditDisplay();
    }
}

// Manipulação de arquivos (drag & drop)
function handleFiles(files, pageId) {
    Logger.info('Files', `Arquivos recebidos: ${files.length}`, { pageId });
    
    if (pageId === 1) {
        processDiagnosisFiles(files);
    } else if (pageId === 2) {
        currentPreOpFiles = Array.from(files);
        document.getElementById('file-count-2').textContent = `${files.length} arquivo(s)`;
        showToast(`${files.length} arquivo(s) selecionado(s)`, 'success');
    }
}

// Extrai texto de PDF
async function extractPdfText(file) {
    Logger.info('OCR', 'Extraindo texto de PDF', { name: file.name });
    
    try {
        const pdf = await pdfjsLib.getDocument(await file.arrayBuffer()).promise;
        let text = "";
        
        // Limita a 5 páginas para performance
        const maxPages = Math.min(pdf.numPages, 5);
        
        for (let i = 1; i <= maxPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            text += content.items.map(item => item.str).join(" ") + "\n";
        }
        
        Logger.success('OCR', `PDF processado: ${text.length} caracteres`);
        return text;
    } catch (error) {
        Logger.error('OCR', 'Erro ao ler PDF', error);
        return "Erro ao ler PDF.";
    }
}

// Extrai texto de imagem (OCR)
async function extractImageText(file) {
    Logger.info('OCR', 'Extraindo texto de imagem', { name: file.name });
    
    try {
        const worker = await Tesseract.createWorker('por');
        const result = await worker.recognize(file);
        await worker.terminate();
        
        Logger.success('OCR', `OCR concluído: ${result.data.text.length} caracteres`);
        return result.data.text;
    } catch (error) {
        Logger.error('OCR', 'Erro no OCR', error);
        return "Erro ao processar imagem.";
    }
}

// Inicialização completa do sistema
function initializeCompleteSystem() {
    Logger.info('System', 'Inicialização completa iniciada');
    
    // Verifica se há usuário salvo
    const savedUser = localStorage.getItem('conecta_user');
    if (savedUser) {
        try {
            const user = JSON.parse(savedUser);
            Logger.info('Auth', 'Usuário encontrado no localStorage', { email: user.email });
            
            // Verifica se o token ainda é válido (em produção, faria uma requisição)
            initializeApp(user);
        } catch (error) {
            Logger.error('Auth', 'Erro ao restaurar sessão', error);
            localStorage.removeItem('conecta_user');
        }
    }
    
    // Configura event listeners
    setupEventListeners();
    
    Logger.success('System', 'Sistema inicializado com sucesso');
}

// Configura listeners de eventos
function setupEventListeners() {
    // Drag & drop
    const dropZones = document.querySelectorAll('[id^="drop-zone"]');
    dropZones.forEach(zone => {
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('bg-blue-100');
        });
        
        zone.addEventListener('dragleave', () => {
            zone.classList.remove('bg-blue-100');
        });
        
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('bg-blue-100');
            
            const files = e.dataTransfer.files;
            const pageId = zone.id.split('-')[2];
            handleFiles(files, pageId);
        });
    });
    
    Logger.info('System', 'Event listeners configurados');
}

// Exporta funções globais
window.switchTab = switchTab;
window.safeSetValue = safeSetValue;
window.safeGetValue = safeGetValue;
window.hasCredits = hasCredits;
window.deductCredits = deductCredits;
window.updateCreditDisplay = updateCreditDisplay;
window.handleFiles = handleFiles;
window.extractPdfText = extractPdfText;
window.extractImageText = extractImageText;
window.initializeCompleteSystem = initializeCompleteSystem;