// js/ui.js/mascots.js
// Controlador dos mascotes interativos da tela de login

/**
 * Inicializa os mascotes interativos
 */
export function initMascots() {
    const mascotsContainer = document.querySelector('.mascots-container');
    if (!mascotsContainer) return;

    const piggy = document.querySelector('.mascot-piggy');
    const coin = document.querySelector('.mascot-coin');

    // Elementos dos olhos
    const piggyPupils = document.querySelectorAll('.piggy-pupil');
    const coinPupils = document.querySelectorAll('.coin-pupil');

    // Campos do formulário
    const emailField = document.getElementById('login-email') || document.getElementById('register-email');
    const passwordField = document.getElementById('login-password') || document.getElementById('register-password');

    // Estado atual
    let currentState = 'normal';
    let isPasswordVisible = false;

    /**
     * Faz os olhos seguirem o cursor do mouse
     */
    function trackMouse(e) {
        const mouseX = e.clientX;
        const mouseY = e.clientY;

        // Movimento limitado das pupilas (máximo 4px do centro)
        const maxMove = 4;

        // Atualiza pupilas do porquinho
        piggyPupils.forEach(pupil => {
            const rect = pupil.parentElement.getBoundingClientRect();
            const eyeCenterX = rect.left + rect.width / 2;
            const eyeCenterY = rect.top + rect.height / 2;

            const deltaX = mouseX - eyeCenterX;
            const deltaY = mouseY - eyeCenterY;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            const moveX = (deltaX / distance) * Math.min(maxMove, distance / 50);
            const moveY = (deltaY / distance) * Math.min(maxMove, distance / 50);

            pupil.style.transform = `translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px))`;
        });

        // Atualiza pupilas da moedinha
        coinPupils.forEach(pupil => {
            const rect = pupil.parentElement.getBoundingClientRect();
            const eyeCenterX = rect.left + rect.width / 2;
            const eyeCenterY = rect.top + rect.height / 2;

            const deltaX = mouseX - eyeCenterX;
            const deltaY = mouseY - eyeCenterY;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

            const moveX = (deltaX / distance) * Math.min(maxMove, distance / 50);
            const moveY = (deltaY / distance) * Math.min(maxMove, distance / 50);

            pupil.style.transform = `translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px))`;
        });
    }

    /**
     * Define o estado dos mascotes
     * @param {string} state - 'normal', 'curious', 'peeking', 'shy'
     */
    function setMascotState(state) {
        if (currentState === state) return;
        currentState = state;

        // Remove todas as classes de estado
        const states = ['curious', 'peeking', 'shy'];
        states.forEach(s => {
            piggy?.classList.remove(s);
            coin?.classList.remove(s);
        });

        // Adiciona nova classe de estado
        if (state !== 'normal') {
            piggy?.classList.add(state);
            coin?.classList.add(state);
        }
    }

    /**
     * Manipulador de foco no campo de email
     */
    function onEmailFocus() {
        setMascotState('curious');
    }

    /**
     * Manipulador de foco no campo de senha
     */
    function onPasswordFocus() {
        if (isPasswordVisible) {
            setMascotState('shy');
        } else {
            setMascotState('peeking');
        }
    }

    /**
     * Manipulador de blur (perda de foco)
     */
    function onFieldBlur() {
        // Pequeno delay para verificar se não foi para outro campo
        setTimeout(() => {
            const activeElement = document.activeElement;
            if (activeElement !== emailField && activeElement !== passwordField) {
                setMascotState('normal');
            }
        }, 100);
    }

    /**
     * Atualiza estado baseado na visibilidade da senha
     * @param {boolean} visible 
     */
    function updatePasswordVisibility(visible) {
        isPasswordVisible = visible;

        // Se estiver focado no campo de senha, atualiza o estado
        if (document.activeElement === passwordField) {
            if (visible) {
                setMascotState('shy');
            } else {
                setMascotState('peeking');
            }
        }
    }

    // Event Listeners
    document.addEventListener('mousemove', trackMouse);

    // Touch support para mobile
    document.addEventListener('touchmove', (e) => {
        if (e.touches.length > 0) {
            trackMouse({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
        }
    });

    // Campos de email
    const allEmailFields = document.querySelectorAll('#login-email, #register-email');
    allEmailFields.forEach(field => {
        field.addEventListener('focus', onEmailFocus);
        field.addEventListener('blur', onFieldBlur);
    });

    // Campos de senha
    const allPasswordFields = document.querySelectorAll('#login-password, #register-password, #register-confirm-password');
    allPasswordFields.forEach(field => {
        field.addEventListener('focus', onPasswordFocus);
        field.addEventListener('blur', onFieldBlur);
    });

    // Observer para detectar toggle de visibilidade da senha
    const passwordToggle = document.getElementById('password-toggle');
    if (passwordToggle) {
        passwordToggle.addEventListener('click', () => {
            const passwordInput = document.getElementById('login-password');
            if (!passwordInput) return;

            // Toggle do tipo de input
            const isCurrentlyPassword = passwordInput.type === 'password';
            passwordInput.type = isCurrentlyPassword ? 'text' : 'password';

            // Toggle do ícone
            const icon = passwordToggle.querySelector('i');
            if (icon) {
                icon.classList.toggle('fa-eye');
                icon.classList.toggle('fa-eye-slash');
            }

            // Atualiza estado dos mascotes
            updatePasswordVisibility(!isCurrentlyPassword);
        });
    }

    // Observa mudanças no tipo do campo de senha (fallback)
    allPasswordFields.forEach(field => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'type') {
                    const isVisible = field.type === 'text';
                    updatePasswordVisibility(isVisible);
                }
            });
        });

        observer.observe(field, { attributes: true });
    });

    // Animação de "torcida" ao submeter formulário
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    [loginForm, registerForm].forEach(form => {
        if (form) {
            form.addEventListener('submit', () => {
                // Animação rápida de celebração
                piggy?.classList.add('curious');
                coin?.classList.add('curious');

                setTimeout(() => {
                    setMascotState('normal');
                }, 1000);
            });
        }
    });

    console.log('🐷💰 Mascotes inicializados!');
}

/**
 * Cria o HTML dos mascotes e insere no container
 */
export function createMascotsHTML() {
    const authSection = document.getElementById('auth-section');
    if (!authSection) return;

    // Verifica se já existe
    if (document.querySelector('.mascots-container')) return;

    const mascotsHTML = `
        <div class="mascots-container">
            <!-- Porquinho (Cofrinho) -->
            <div class="mascot mascot-piggy">
                <div class="piggy-body">
                    <div class="piggy-ears">
                        <div class="piggy-ear left"></div>
                        <div class="piggy-ear right"></div>
                    </div>
                    <div class="piggy-eyes">
                        <div class="piggy-eye">
                            <div class="piggy-pupil"></div>
                        </div>
                        <div class="piggy-eye">
                            <div class="piggy-pupil"></div>
                        </div>
                    </div>
                    <div class="piggy-snout"></div>
                    <div class="piggy-hands">
                        <div class="piggy-hand left"></div>
                        <div class="piggy-hand right"></div>
                    </div>
                </div>
            </div>
            
            <!-- Moedinha -->
            <div class="mascot mascot-coin">
                <div class="coin-body">
                    <div class="coin-circle">
                        <div class="coin-eyes">
                            <div class="coin-eye">
                                <div class="coin-pupil"></div>
                            </div>
                            <div class="coin-eye">
                                <div class="coin-pupil"></div>
                            </div>
                        </div>
                        <span class="coin-symbol">$</span>
                    </div>
                    <div class="coin-hands">
                        <div class="coin-hand left"></div>
                        <div class="coin-hand right"></div>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Insere no início da seção de auth
    authSection.insertAdjacentHTML('afterbegin', mascotsHTML);
}

// Auto-inicialização quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        createMascotsHTML();
        initMascots();
    });
} else {
    createMascotsHTML();
    initMascots();
}
