// UIController.js - Fixed difficulty enforcement and settings panel
/*
========================================
FILE OVERVIEW
----------------------------------------
Purpose:
- Manages the DOM, screen transitions, modal windows, and most non-combat UI updates.

Key Systems:
- Login and account flow
- Difficulty/mode/start screens
- Main game HUD, inventory, crafting, and journey book
- Button wiring and visual state updates

Flow:
- Waits for the DOM to be ready
- Registers event listeners for all major UI controls
- Reads from `gameState` and asks other systems to act when the player clicks something

Design Notes:
- UIController is the presentation hub. It does not own much game logic, but
  it is the reason the rest of the game does not have to care about button drama.
========================================
*/
class UIController {
    // This class is the bridge between raw game state and the stuff the player
    // can actually see, click, open, close, and accidentally spam.
    constructor() {
        this.mobileMenuOpen = false;
        this.initialized = false;
        this.startingGame = false;
        this.currentCraftCategory = "potions";
        this.currentScreen = "login-screen";
        this.screenTransitioning = false;
    }
    
    // Verify required DOM nodes exist, then wire up the entire interface once.
    // This check exists because missing DOM elements create the kind of bugs
    // that look obvious only after you have already lost an hour to them.
    initialize() {
        if (this.initialized) {
            console.warn('UIController already initialized');
            return;
        }
        
        console.log('Initializing UI Controller...');
        
        // First: make sure the DOM is actually ready.
        // Touching missing elements too early is a classic way to start a bad day.
        const checkDOM = () => {
            const requiredElements = [
                'login-screen', 'login-username', 'login-password', 'login-btn', 'register-btn',
                'difficulty-selection', 'input-mode-selection',
                'intro-screen', 'start-btn', 'command-input', 'submit-btn'
            ];
            
            const missingElements = requiredElements.filter(id => {
                const element = document.getElementById(id);
                if (!element) {
                    console.error(`Missing element: ${id}`);
                }
                return !element;
            });
            
            if (missingElements.length > 0) {
                console.warn('Missing DOM elements:', missingElements);
                return false;
            }
            
            return true;
        };
        
        const tryInitialize = (attempts = 3) => {
            if (checkDOM()) {
                this.setupEventListeners();
                this.updateUIText();
                this.createParticles();
                this.showLoginScreen();
                this.initialized = true;
                console.log('UI Controller initialized successfully');
                return true;
            } else if (attempts > 0) {
                console.log(`Retrying UI initialization (${attempts} attempts remaining)...`);
                setTimeout(() => tryInitialize(attempts - 1), 500);
                return false;
            } else {
                console.error('Failed to initialize UI Controller: Missing DOM elements');
                return false;
            }
        };
        
        tryInitialize();
    }
    
    // Attach the main click and keyboard handlers for every visible game screen.
    // This is where UI behavior stays centralized so game logic does not have
    // to become a part-time event manager.
    setupEventListeners() {
        console.log('Setting up event listeners...');
        
        // Login screen
        const loginBtn = document.getElementById('login-btn');
        const registerBtn = document.getElementById('register-btn');
        const loginPassword = document.getElementById('login-password');
        
        if (loginBtn) {
            loginBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.handleLogin();
            });
        }
        
        if (registerBtn) {
            registerBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.handleRegister();
            });
        }
        
        if (loginPassword) {
            loginPassword.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleLogin();
                }
            });
        }
        
        // Difficulty is chosen before a run starts and then treated as locked in.
        // Keeping that decision stable avoids mid-game rule changes leaking into
        // combat, map visibility, and progression logic.
        const normalModeBtn = document.getElementById('normal-mode');
        const hardcoreModeBtn = document.getElementById('hardcore-mode');
        
        if (normalModeBtn) {
            normalModeBtn.addEventListener('click', () => {
                this.setGameDifficulty('normal');
            });
        }
        
        if (hardcoreModeBtn) {
            hardcoreModeBtn.addEventListener('click', () => {
                this.setGameDifficulty('hardcore');
            });
        }
        
        // Input mode selection
        const typeModeBtn = document.getElementById('type-mode');
        const bothModeBtn = document.getElementById('both-mode');
        
        if (typeModeBtn) {
            typeModeBtn.addEventListener('click', () => {
                this.setGameMode('type');
            });
        }
        
        if (bothModeBtn) {
            bothModeBtn.addEventListener('click', () => {
                this.setGameMode('both');
            });
        }
        
        // Back buttons
        const backToDifficultyBtn = document.getElementById('back-to-difficulty');
        if (backToDifficultyBtn) {
            backToDifficultyBtn.addEventListener('click', () => {
                this.transitionToScreen('difficulty-selection');
            });
        }
        
        const backToModeBtn = document.getElementById('back-to-mode');
        if (backToModeBtn) {
            backToModeBtn.addEventListener('click', () => {
                this.transitionToScreen('input-mode-selection');
            });
        }
        
        // Start button
        const startBtn = document.getElementById('start-btn');
        if (startBtn) {
            startBtn.addEventListener('click', () => {
                this.startGame();
            });
        }
        
        // Logout button
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this.handleLogout();
            });
        }
        
        // Mobile menu
        const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
        const closeMobileMenu = document.getElementById('close-mobile-menu');
        
        if (mobileMenuToggle) {
            mobileMenuToggle.addEventListener('click', () => this.toggleMobileMenu());
        }
        if (closeMobileMenu) {
            closeMobileMenu.addEventListener('click', () => this.toggleMobileMenu());
        }
        
        // Command input
        const submitBtn = document.getElementById('submit-btn');
        const commandInput = document.getElementById('command-input');
        
        if (submitBtn) {
            submitBtn.addEventListener('click', () => this.submitCommand());
        }
        if (commandInput) {
            commandInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.submitCommand();
                }
            });
        }
        
        // Quick action buttons use delegated handling so extension-added buttons
        // also work without extra wiring. Less ceremony, fewer future headaches.
        document.addEventListener('click', (event) => {
            const button = event.target.closest('.quick-btn');
            if (!button) return;
            if (button.id === 'history-toggle' || button.id === 'craft-toggle') return;

            const command = button.getAttribute('data-command');
            if (!command) return;

            const input = document.getElementById('command-input');
            if (input) {
                input.value = command;
            }
            this.submitCommand();
        });
        
        // Toggle buttons
        const historyToggle = document.getElementById('history-toggle');
        const craftToggle = document.getElementById('craft-toggle');
        
        if (historyToggle) {
            historyToggle.addEventListener('click', () => {
                document.getElementById('command-history').classList.toggle('open');
            });
        }
        if (craftToggle) {
            craftToggle.addEventListener('click', () => {
                this.openCraftingPanel();
            });
        }
        
        // Armory and settings toggles
        const armoryToggle = document.getElementById('armory-toggle');
        const settingsToggle = document.getElementById('settings-toggle');
        const journeyToggle = document.getElementById('journey-toggle');
        
        if (armoryToggle) {
            armoryToggle.addEventListener('click', () => {
                this.openArmoryModal();
            });
        }
        if (settingsToggle) {
            settingsToggle.addEventListener('click', () => {
                this.openSettingsPanel();
            });
        }
        if (journeyToggle) {
            journeyToggle.addEventListener('click', () => {
                this.openJourneyBook();
            });
        }
        
        // Settings are safe to change mid-run.
        // Difficulty is intentionally not one of them.
        const restartBtn = document.getElementById('restart-game-btn');
        const quitBtn = document.getElementById('quit-game-btn');
        const autoSaveCheckbox = document.getElementById('auto-save');
        const combatAnimationsCheckbox = document.getElementById('combat-animations');
        
        if (restartBtn) {
            restartBtn.addEventListener('click', () => this.restartGame());
        }
        if (quitBtn) {
            quitBtn.addEventListener('click', () => this.quitToLobby());
        }
        if (autoSaveCheckbox) {
            autoSaveCheckbox.addEventListener('change', (e) => {
                gameState.autoSave = e.target.checked;
                gameState.saveGame();
            });
        }
        if (combatAnimationsCheckbox) {
            combatAnimationsCheckbox.addEventListener('change', (e) => {
                gameState.combatAnimations = e.target.checked;
            });
        }
        
        // Difficulty changes are blocked mid-run on purpose.
        // Letting players swap difficulty live sounds flexible until combat,
        // map visibility, and progression rules all start disagreeing.
        const difficultyRadios = document.querySelectorAll('input[name="difficulty"]');
        difficultyRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                // Show warning that difficulty cannot be changed
                this.addMessage('Difficulty cannot be changed during gameplay. Restart to choose a new difficulty.');
                // Revert to current difficulty
                e.preventDefault();
                // Set radio back to current difficulty
                if (gameState.difficulty === 'normal') {
                    document.querySelector('input[name="difficulty"][value="normal"]').checked = true;
                } else {
                    document.querySelector('input[name="difficulty"][value="hardcore"]').checked = true;
                }
            });
        });
        
        // Combat buttons
        this.setupCombatButtons();
        
        // Map controls
        const expandBtn = document.getElementById('expand-map-btn');
        const resetBtn = document.getElementById('reset-view-btn');
        
        if (expandBtn) {
            expandBtn.addEventListener('click', () => {
                if (window.mapSystem) window.mapSystem.toggleMapExpand();
            });
        }
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (window.mapSystem) window.mapSystem.resetMapView();
            });
        }
        
        // Mobile map controls
        const expandBtnMobile = document.getElementById('expand-map-btn-mobile');
        const resetBtnMobile = document.getElementById('reset-view-btn-mobile');
        
        if (expandBtnMobile) {
            expandBtnMobile.addEventListener('click', () => {
                if (window.mapSystem) window.mapSystem.toggleMapExpand();
            });
        }
        if (resetBtnMobile) {
            resetBtnMobile.addEventListener('click', () => {
                if (window.mapSystem) window.mapSystem.resetMapView();
            });
        }
        
        // Setup modal closers
        this.setupModalClosers();
        
        // Setup crafting UI
        this.setupCraftingUI();
        
        console.log('All event listeners set up successfully');
    }
    
    // Standardize how the various modal panels are dismissed.
    // One reliable close pattern beats eight slightly different ones every time.
    setupModalClosers() {
        const closeButtons = [
            ['close-inventory-modal', 'inventory-modal'],
            ['close-armory-modal', 'armory-modal'],
            ['close-crafting', 'crafting-panel'],
            ['close-settings', 'settings-panel'],
            ['close-journey-modal', 'journey-modal'],
            ['close-item-detail', 'item-detail'],
            ['close-submenu', 'item-submenu'],
            ['close-minigame', 'minigame-container']
        ];
        
        closeButtons.forEach(([buttonId, modalId]) => {
            const button = document.getElementById(buttonId);
            const modal = document.getElementById(modalId);
            
            if (button && modal) {
                button.addEventListener('click', () => {
                    modal.style.display = 'none';
                    if (modalId === 'minigame-container' && window.minigameSystem) {
                        window.minigameSystem.closeMinigame();
                    }
                });
            }
        });
        
        window.addEventListener('click', (event) => {
            const modals = ['inventory-modal', 'armory-modal', 'crafting-panel', 'settings-panel', 'journey-modal', 'item-detail', 'minigame-container'];
            
            modals.forEach(modalId => {
                const modal = document.getElementById(modalId);
                if (modal && event.target === modal) {
                    modal.style.display = 'none';
                    if (modalId === 'minigame-container' && window.minigameSystem) {
                        window.minigameSystem.closeMinigame();
                    }
                }
            });
        });
    }
    
    // Wire combat buttons into CombatSystem without duplicating combat rules here.
    setupCombatButtons() {
        const combatButtons = [
            ['attack-btn', () => combatSystem.playerAttack()],
            ['defend-btn', () => combatSystem.playerDefend()],
            ['special-btn', () => combatSystem.playerSpecial()],
            ['item-btn', () => combatSystem.useItemInCombat()],
            ['flee-btn', () => combatSystem.fleeCombat()]
        ];
        
        combatButtons.forEach(([buttonId, handler]) => {
            const button = document.getElementById(buttonId);
            if (button) {
                button.addEventListener('click', handler);
            }
        });
        
        // Item submenu close
        const closeSubmenu = document.getElementById('close-submenu');
        if (closeSubmenu) {
            closeSubmenu.addEventListener('click', () => combatSystem.closeItemSubmenu());
        }
    }

    // Low-level helper that shows or hides one high-level screen with shared transitions.
    setScreenVisible(screenId, visible) {
        const screen = document.getElementById(screenId);
        if (!screen) return;

        if (visible) {
            screen.style.display = screenId === "game-container" ? "grid" : "flex";
            requestAnimationFrame(() => screen.classList.add("screen-active"));
            return;
        }

        screen.classList.remove("screen-active");
        setTimeout(() => {
            if (!screen.classList.contains("screen-active")) {
                screen.style.display = "none";
            }
        }, 260);
    }

    // Return the animated content panel inside an auth-flow screen.
    getScreenPanel(screenId) {
        const screen = document.getElementById(screenId);
        if (!screen) return null;
        return screen.querySelector('.login-content, .difficulty-content, .mode-content, .intro-content');
    }

    // Keep body classes and the animated galaxy background aligned with the active screen.
    syncBackgroundState(screenId) {
        const authScreens = ['login-screen', 'difficulty-selection', 'input-mode-selection', 'intro-screen'];
        const isAuthScreen = authScreens.includes(screenId);

        document.body.classList.toggle('auth-flow', isAuthScreen);
        document.body.classList.toggle('game-active', screenId === 'game-container');

        if (window.galaxyBackground) {
            if (screenId === 'game-container' && typeof window.galaxyBackground.hideForGame === 'function') {
                window.galaxyBackground.hideForGame();
            } else if (isAuthScreen && typeof window.galaxyBackground.transitionTo === 'function') {
                window.galaxyBackground.transitionTo(screenId);
            }
        }
    }

    // Run the multi-step transition used between login, difficulty, mode, and intro screens.
    animateAuthTransition(fromScreenId, toScreenId) {
        const fromScreen = document.getElementById(fromScreenId);
        const toScreen = document.getElementById(toScreenId);

        if (!fromScreen || !toScreen || fromScreenId === toScreenId) {
            this.transitionToScreen(toScreenId);
            return;
        }

        const fromPanel = this.getScreenPanel(fromScreenId);
        const toPanel = this.getScreenPanel(toScreenId);

        this.screenTransitioning = true;
        this.currentScreen = toScreenId;
        this.syncBackgroundState(toScreenId);

        fromScreen.style.zIndex = '11';
        toScreen.style.zIndex = '12';
        toScreen.style.display = 'flex';
        toScreen.classList.add('screen-active');

        if (toPanel) {
            toPanel.classList.remove('auth-panel-out', 'auth-panel-in-active');
            toPanel.classList.add('auth-panel-in-start');
        }

        requestAnimationFrame(() => {
            if (fromPanel) {
                fromPanel.classList.add('auth-panel-out');
            }
            fromScreen.classList.add('screen-transition-out');

            setTimeout(() => {
                if (toPanel) {
                    toPanel.classList.add('auth-panel-in-active');
                }
            }, 150);
        });

        setTimeout(() => {
            fromScreen.classList.remove('screen-active', 'screen-transition-out');
            fromScreen.style.display = 'none';
            fromScreen.style.zIndex = '';
            toScreen.style.zIndex = '';

            if (fromPanel) {
                fromPanel.classList.remove('auth-panel-out');
            }
            if (toPanel) {
                toPanel.classList.remove('auth-panel-in-start', 'auth-panel-in-active');
            }

            this.screenTransitioning = false;
        }, 780);
    }

    // Public screen switch helper for the auth flow.
    transitionToScreen(screenId) {
        if (this.screenTransitioning) {
            return;
        }
        this.currentScreen = screenId;
        const authScreens = ['login-screen', 'difficulty-selection', 'input-mode-selection', 'intro-screen'];
        authScreens.forEach(id => this.setScreenVisible(id, id === screenId));
        this.syncBackgroundState(screenId);
    }
    
    // Return the user to the account/login screen and refresh saved-account buttons.
    showLoginScreen() {
        console.log('Showing login screen');
        this.hideAllScreens();
        this.transitionToScreen('login-screen');
        
        // Clear any previous error messages
        this.clearLoginError();
        
        this.loadSavedAccounts();
    }
    
    // Hide every top-level screen before showing a new one.
    hideAllScreens() {
        const screens = [
            'login-screen',
            'difficulty-selection',
            'input-mode-selection',
            'intro-screen',
            'game-container'
        ];
        
        screens.forEach(screenId => {
            this.setScreenVisible(screenId, false);
        });
    }
    
    // Render saved accounts so the player can quickly jump back into an existing run.
    loadSavedAccounts() {
        const container = document.getElementById('saved-accounts');
        if (!container) return;
        
        container.innerHTML = '';
        
        const accounts = gameState.accounts;
        const accountNames = Object.keys(accounts).sort((a, b) => {
            return new Date(accounts[b].lastPlayed) - new Date(accounts[a].lastPlayed);
        });
        
        if (accountNames.length === 0) {
            container.innerHTML = '<p class="no-accounts">No saved accounts found</p>';
            return;
        }
        
        accountNames.forEach(username => {
            const account = accounts[username];
            const accountElement = document.createElement('div');
            accountElement.className = 'account-item';
            
            const lastPlayed = new Date(account.lastPlayed);
            const daysAgo = Math.floor((Date.now() - lastPlayed) / (1000 * 60 * 60 * 24));
            const lastPlayedText = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`;
            
            accountElement.innerHTML = `
                <div class="account-name">${username}</div>
                <div class="account-stats">
                    Last played: ${lastPlayedText}
                </div>
            `;
            
            accountElement.addEventListener('click', () => {
                document.getElementById('login-username').value = username;
                document.getElementById('login-password').focus();
            });
            
            container.appendChild(accountElement);
        });
    }
    
    // Validate login fields and continue the player into the setup flow or saved game.
    handleLogin() {
        console.log('Handling login...');
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        
        if (!username || !password) {
            this.showLoginError('Please enter both username and password');
            return;
        }
        
        const result = gameState.login(username, password);
        
        if (result.success) {
            this.showLoginSuccess(result.message);
            this.updatePlayerWelcome();
            
            // Reset welcome flag
            gameState.hasShownWelcome = false;
            
            // Check if account has completed setup (difficulty and input mode set)
            const account = gameState.accounts[username];
            
            if (account && account.difficulty !== null && account.inputMode !== null) {
                // Account has completed setup, check for saved game
                if (account.gameState) {
                    // Has saved game, load it directly
                    this.loadGameDirectly();
                } else {
                    // No saved game but setup complete, start new game directly
                    this.hideAllScreens();
                    this.startGame();
                }
            } else {
                // Account not set up, show difficulty selection
                this.showDifficultySelection();
            }
        } else {
            this.showLoginError(result.message);
        }
    }
    
    // Create a new account from the login form and move the player into setup.
    handleRegister() {
        console.log('Handling registration...');
        const username = document.getElementById('login-username').value.trim();
        const password = document.getElementById('login-password').value;
        
        if (!username || !password) {
            this.showLoginError('Please enter both username and password');
            return;
        }
        
        if (username.length < 3) {
            this.showLoginError('Username must be at least 3 characters');
            return;
        }
        
        if (password.length < 4) {
            this.showLoginError('Password must be at least 4 characters');
            return;
        }
        
        const result = gameState.createAccount(username, password);
        
        if (result.success) {
            this.showLoginSuccess(result.message);
            this.loadSavedAccounts();
            
            // Auto-login after registration
            document.getElementById('login-password').value = password;
            setTimeout(() => {
                this.handleLogin();
            }, 500);
        } else {
            this.showLoginError(result.message);
        }
    }
    
    // Persist progress and return to the login flow.
    handleLogout() {
        if (confirm('Are you sure you want to logout? Your progress will be saved.')) {
            const result = gameState.logout();
            if (result.success) {
                this.showLoginScreen();
                this.addMessage('Logged out successfully.');
            }
        }
    }
    
    // Surface login-related validation errors in a dedicated message area.
    showLoginError(message) {
        const errorElement = document.getElementById('username-error');
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.color = '#ff4444';
            errorElement.style.display = 'block';
            
            setTimeout(() => {
                errorElement.textContent = '';
                errorElement.style.display = 'none';
            }, 5000);
        }
    }
    
    // Reuse the same message area for friendly success feedback.
    showLoginSuccess(message) {
        const errorElement = document.getElementById('username-error');
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.color = '#7fff7f';
            errorElement.style.display = 'block';
            
            setTimeout(() => {
                errorElement.textContent = '';
                errorElement.style.display = 'none';
            }, 3000);
        }
    }
    
    // Clear any login or registration status message.
    clearLoginError() {
        const errorElement = document.getElementById('username-error');
        if (errorElement) {
            errorElement.textContent = '';
            errorElement.style.display = 'none';
        }
    }
    
    // Transition away from the login screen once authentication succeeds.
    hideLoginScreen() {
        this.setScreenVisible('login-screen', false);
    }
    
    // Show the difficulty picker before a new run begins.
    showDifficultySelection() {
        if (this.currentScreen === 'login-screen') {
            this.animateAuthTransition('login-screen', 'difficulty-selection');
            return;
        }
        this.hideAllScreens();
        this.transitionToScreen('difficulty-selection');
    }
    
    // Store the chosen difficulty and advance to input mode selection.
    setGameDifficulty(difficulty) {
        gameState.difficulty = difficulty;
        if (this.currentScreen === 'difficulty-selection') {
            this.animateAuthTransition('difficulty-selection', 'input-mode-selection');
            return;
        }
        this.transitionToScreen('input-mode-selection');
    }
    
    // Store the chosen input mode and move to the final intro screen.
    setGameMode(mode) {
        gameState.inputMode = mode;
        const success = gameState.saveAccountPreferences(gameState.difficulty, mode);
        if (success) {
            console.log('Input mode saved successfully');
        }
        
        // Check if account has saved game state
        const account = gameState.accounts[gameState.currentAccount];
        if (account && account.gameState) {
            // Has saved game, load it directly
            this.loadGameDirectly();
        } else {
            // No saved game, show intro screen
            if (this.currentScreen === 'input-mode-selection') {
                this.animateAuthTransition('input-mode-selection', 'intro-screen');
            } else {
                this.transitionToScreen('intro-screen');
            }
        }
        
        // Auto-save
        gameState.saveGame();
    }
    
    // Skip setup screens when an account already has everything needed to resume.
    loadGameDirectly() {
        console.log('Loading game directly from saved state');
        
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'flex';
        }
        
        setTimeout(() => {
            // Load the game state
            const loaded = gameState.loadGame();
            
            if (loaded) {
                // Initialize game systems
                if (window.main && typeof main.init === 'function') {
                    main.init();
                }
                
                // Show game container
                this.hideAllScreens();
                this.setScreenVisible('game-container', true);
                this.syncBackgroundState('game-container');
                setTimeout(() => {
                    document.getElementById('game-container').classList.add('show');
                }, 100);
                
                // Update all displays
                this.updatePlayerWelcome();
                this.updateGameDisplay();
                this.updateModeIndicator();
                this.updateInputMode(gameState.inputMode);
                
                // Initialize map
                if (window.mapSystem) {
                    mapSystem.centerMapOnLocation(gameState.currentLocation);
                    mapSystem.updateMapDisplay();
                    mapSystem.updateMapTitle();
                }
                
                console.log('Game loaded successfully from saved state');
            } else {
                // Failed to load, start new game
                this.startGame();
            }
            
            if (loadingOverlay) {
                loadingOverlay.style.display = 'none';
            }
        }, 500);
    }
    
    // Show the loading state, reveal the game container, and call into `Main.init()`.
    startGame() {
        if (this.startingGame) {
            console.log('Game start already in progress');
            return;
        }
        
        this.startingGame = true;
        
        const startBtn = document.getElementById('start-btn');
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Starting...';
        }
        
        console.log('Starting game...');
        
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.style.display = 'flex';
            const loadingText = document.getElementById('loading-text');
            if (loadingText) {
                loadingText.textContent = 'Generating 500-location world...';
            }
        }
        
        const initSequence = async () => {
            try {
                gameState.currentMap = "world";
                gameState.currentSubArea = null;
                gameState.subAreas = {};
                gameState.lastLocation = null;
                gameState.minigameActive = false;
                gameState.inCombat = false;
                gameState.currentEnemy = null;
                if (gameState.areaState) {
                    gameState.areaState.currentWorldArea = "start";
                    gameState.areaState.currentInternalArea = null;
                    gameState.areaState.progressionUnlocked = {};
                    gameState.areaState.portalStack = [];
                    gameState.areaState.nestedPortalDepth = 0;
                }
                if (gameState.shopState) {
                    gameState.shopState.open = false;
                    gameState.shopState.activeShopId = null;
                }

                // Initialize systems
                if (window.mapSystem && typeof mapSystem.initialize === 'function') {
                    mapSystem.initialize();
                }
                
                if (window.inventorySystem && typeof inventorySystem.updateInventoryDisplay === 'function') {
                    inventorySystem.updateInventoryDisplay();
                }
                
                // Generate or load world
                if (!gameState.world || Object.keys(gameState.world).length === 0) {
                    if (mapSystem && typeof mapSystem.generateWorld === 'function') {
                        gameState.world = mapSystem.generateWorld();
                        console.log(`World generated with ${Object.keys(gameState.world).length} locations`);
                    }
                }
                
                // Ensure starting location exists
                if (!gameState.world["start"]) {
                    gameState.world["start"] = {
                        id: "start",
                        name: "Starting Point",
                        short: "ST",
                        description: "You find yourself at the beginning of your adventure.",
                        icon: "🧭",
                        items: ["rusty sword"],
                        exits: {},
                        coordinates: { x: 0, y: 0 },
                        biome: "forest",
                        explored: true,
                        locked: false,
                        campfire: false,
                        requiredKey: null,
                        subArea: null
                    };
                }
                
                gameState.currentLocation = "start";
                gameState.visitedLocations = ["start"];
                
                // Initialize map discovery for Hardcore mode
                if (gameState.difficulty === "hardcore") {
                    gameState.updateMapDiscovery("start");
                }
                
                // Initialize map
                if (mapSystem) {
                    mapSystem.centerMapOnLocation("start");
                    mapSystem.updateMapDisplay();
                    mapSystem.updateMapTitle();
                }
                
                // Update UI
                this.updatePlayerWelcome();
                this.updateGameDisplay();
                this.updateModeIndicator();
                this.updateInputMode(gameState.inputMode);
                
                if (gameState.inputMode === "type") {
                    this.showInputModeReminder();
                }
                
                // Hide screens and show game
                const introScreen = document.getElementById('intro-screen');
                const gameContainer = document.getElementById('game-container');
                
                if (introScreen) {
                    introScreen.style.transition = 'opacity 0.5s';
                    introScreen.style.opacity = '0';
                    setTimeout(() => {
                        this.setScreenVisible('intro-screen', false);
                    }, 500);
                }
                
                if (gameContainer) {
                    setTimeout(() => {
                        this.setScreenVisible('game-container', true);
                        this.syncBackgroundState('game-container');
                        gameContainer.style.opacity = '0';
                        
                        setTimeout(() => {
                            gameContainer.classList.add('show');
                            gameContainer.style.transition = 'opacity 0.5s';
                            gameContainer.style.opacity = '1';
                            
                            // Hide loading overlay
                            if (loadingOverlay) {
                                loadingOverlay.style.display = 'none';
                            }
                            
                            // Enable start button for future restarts
                            this.startingGame = false;
                            if (startBtn) {
                                startBtn.disabled = false;
                                startBtn.innerHTML = 'Begin Your Adventure';
                            }
                            
                            // Add welcome message (main.js will handle this)
                            // Reset welcome flag to ensure message is shown
                            gameState.hasShownWelcome = false;
                            
                            // Initialize main game
                            if (window.main && typeof main.init === 'function') {
                                main.init();
                            }
                            
                            // Auto-save
                            gameState.saveGame();
                            
                            console.log('Game started successfully');
                        }, 100);
                    }, 600);
                }
                
            } catch (error) {
                console.error('Game initialization failed:', error);
                
                if (loadingOverlay) {
                    loadingOverlay.style.display = 'none';
                }
                
                this.startingGame = false;
                if (startBtn) {
                    startBtn.disabled = false;
                    startBtn.innerHTML = 'Begin Your Adventure';
                }
                
                const output = document.getElementById('game-output');
                if (output) {
                    const errorMsg = document.createElement('div');
                    errorMsg.classList.add('message');
                    errorMsg.textContent = 'Game initialization failed. Please refresh the page.';
                    output.appendChild(errorMsg);
                }
            }
        };
        
        setTimeout(initSequence, 100);
    }
    
    // Swap from the intro/auth flow into the actual gameplay layout.
    showGameContainer() {
        // Directly show game container from saved state
        this.hideAllScreens();
        
        const gameContainer = document.getElementById('game-container');
        if (gameContainer) {
            this.setScreenVisible('game-container', true);
            this.syncBackgroundState('game-container');
            gameContainer.classList.add('show');
            gameContainer.style.opacity = '1';
        }
        
        // Update all UI elements
        this.updatePlayerWelcome();
        this.updateGameDisplay();
        this.updateModeIndicator();
        this.updateInputMode(gameState.inputMode);
        
        if (window.mapSystem) {
            mapSystem.centerMapOnLocation(gameState.currentLocation);
            mapSystem.updateMapDisplay();
            mapSystem.updateMapTitle();
        }
        
        // Reset welcome flag
        gameState.hasShownWelcome = false;
    }
    
    // Keep the header welcome text aligned with the current username.
    updatePlayerWelcome() {
        const welcomeElement = document.getElementById('player-welcome');
        if (welcomeElement) {
            welcomeElement.textContent = `Welcome, ${gameState.username}!`;
        }
        
        // Update tagline to remove default text
        const tagline = document.querySelector('.tagline');
        if (tagline && tagline.textContent.includes('modern text adventure')) {
            tagline.textContent = `Adventure awaits, ${gameState.username}!`;
        }
    }
    
    // Read the command input box and send its contents into the main command parser.
    submitCommand() {
        const commandInput = document.getElementById('command-input');
        const command = commandInput.value.trim();
        
        if (command !== '') {
            if (window.main && window.main.processCommand) {
                window.main.processCommand(command);
            }
            
            commandInput.value = '';
            commandInput.focus();
            
            // Auto-save after command
            if (gameState.autoSave) {
                setTimeout(() => gameState.saveGame(), 100);
            }
        }
    }
    
    // Switch UI affordances depending on whether the run is type-only or hybrid input.
    updateInputMode(mode) {
        gameState.inputMode = mode;
        
        const quickActions = document.getElementById('quick-actions');
        const combatActions = document.querySelector('.combat-actions');
        const combatOverlay = document.getElementById('combat-overlay');
        
        if (mode === "type") {
            if (quickActions) quickActions.style.display = 'none';
            if (combatActions) combatActions.style.display = 'none';
            
            // Show special meter for Type Only mode
            const specialMeter = document.getElementById('special-meter-container');
            if (specialMeter) specialMeter.style.display = 'flex';
            
            // Update combat overlay for Type Only mode
            if (combatOverlay) {
                combatOverlay.classList.add('combat-type-only');
                const reminder = document.getElementById('combat-command-reminder');
                if (reminder) reminder.style.display = 'block';
            }
            
            this.showInputModeReminder();
            
            const commandInput = document.getElementById('command-input');
            if (commandInput) {
                commandInput.style.display = 'block';
                commandInput.focus();
            }
            
        } else {
            if (quickActions) quickActions.style.display = 'flex';
            if (combatActions) combatActions.style.display = 'grid';
            
            // Hide special meter for Type + Click mode
            const specialMeter = document.getElementById('special-meter-container');
            if (specialMeter) specialMeter.style.display = 'none';
            
            // Update combat overlay for Type + Click mode
            if (combatOverlay) {
                combatOverlay.classList.remove('combat-type-only');
                const reminder = document.getElementById('combat-command-reminder');
                if (reminder) reminder.style.display = 'none';
            }
            
            this.hideInputModeReminder();
        }
        
        this.updateRoomItemsDisplay();
        this.updateLookButtonState();
        
        if (window.mapSystem) {
            window.mapSystem.updateMapDisplay();
        }
        
        // Save the input mode
        gameState.saveGame();
    }
    
    // Refresh the visible difficulty badge in the header.
    updateDifficulty(difficulty) {
        gameState.difficulty = difficulty;
        this.updateModeIndicator();
    }
    
    // Refresh both the difficulty and input-mode status chips.
    updateModeIndicator() {
        const modeIndicator = document.getElementById('mode-indicator');
        const difficultyIndicator = document.getElementById('difficulty-indicator');
        
        if (modeIndicator) {
            modeIndicator.textContent = gameState.inputMode === "type" ? 'Type Only' : 'Type + Click';
        }
        
        if (difficultyIndicator) {
            difficultyIndicator.textContent = gameState.difficulty.charAt(0).toUpperCase() + gameState.difficulty.slice(1);
        }
    }
    
    // Type-only mode needs a reminder because many clickable affordances are disabled.
    showInputModeReminder() {
        const reminder = document.getElementById('input-mode-reminder');
        if (reminder) {
            reminder.classList.add('show');
            setTimeout(() => {
                reminder.classList.remove('show');
            }, 10000);
        }
    }
    
    // Hide the type-only helper message when it is not relevant.
    hideInputModeReminder() {
        const reminder = document.getElementById('input-mode-reminder');
        if (reminder) {
            reminder.classList.remove('show');
        }
    }
    
    // Open or close the mobile sidebar version of the HUD.
    toggleMobileMenu() {
        this.mobileMenuOpen = !this.mobileMenuOpen;
        const mobileSidebar = document.getElementById('mobile-sidebar');
        
        if (this.mobileMenuOpen) {
            mobileSidebar.classList.add('open');
            this.updateMobileContent();
        } else {
            mobileSidebar.classList.remove('open');
        }
    }
    
    // Mirror key stats and inventory into the mobile sidebar.
    updateMobileContent() {
        const stats = ['health', 'attack', 'defense', 'score', 'gold'];
        stats.forEach(stat => {
            const element = document.getElementById(`${stat}-mobile`);
            if (element) {
                element.textContent = gameState[stat];
            }
        });
        
        if (window.inventorySystem) {
            window.inventorySystem.updateInventoryDisplay();
        }
    }
    
    // Main HUD refresh: stats, room visuals, map, inventory, and mode-specific controls.
    updateGameDisplay() {
        const world = gameState.getCurrentWorld();
        const location = world[gameState.currentLocation];
        if (!location) return;
        
        // Update room icon
        const roomIcon = document.querySelector('.room-icon');
        if (roomIcon) {
            roomIcon.textContent = location.icon;
        }
        
        // Update stats
        const stats = ['health', 'attack', 'defense', 'score', 'gold'];
        stats.forEach(stat => {
            const element = document.getElementById(stat);
            if (element) {
                element.textContent = gameState[stat];
            }
        });
        
        // Update mobile stats if menu is open
        if (this.mobileMenuOpen) {
            this.updateMobileContent();
        }
        
        // Update room items display
        this.updateRoomItemsDisplay();
        this.updateLookButtonState();
        
        // Update inventory
        if (window.inventorySystem) {
            window.inventorySystem.updateInventoryDisplay();
        }
        
        // Update special meter
        this.updateSpecialMeter();
        
        // Update map
        if (window.mapSystem) {
            window.mapSystem.updateMapDisplay();
        }

        if (window.worldEvolutionSystem && typeof window.worldEvolutionSystem.updateQuickButtons === 'function') {
            window.worldEvolutionSystem.updateQuickButtons();
        }
    }
    
    // Show clickable room items in hybrid input mode.
    updateRoomItemsDisplay() {
        const world = gameState.getCurrentWorld();
        const location = world[gameState.currentLocation];
        const roomItemsContainer = document.getElementById("room-items");
        if (!roomItemsContainer || !location) return;
        
        roomItemsContainer.innerHTML = "";
        
        // Only show clickable items in Type + Click mode
        if (gameState.inputMode === "both" && location.items && location.items.length > 0) {
            location.items.forEach(item => {
                const itemData = gameState.items[item] || { name: item, icon: "📦" };
                const itemElement = document.createElement("div");
                itemElement.classList.add("room-item");
                const icon = gameState.getItemIcon ? gameState.getItemIcon(item) : (itemData.icon || "📦");
                itemElement.textContent = icon;
                itemElement.setAttribute("data-item", item);
                
                if (itemData.rarity === "rare" || itemData.rarity === "legendary") {
                    itemElement.classList.add("rare");
                }
                
                itemElement.classList.add("tooltip");
                itemElement.setAttribute("data-tooltip", itemData.name || item);
                
                itemElement.addEventListener("click", () => {
                    this.processCommand(`take ${item}`);
                });
                
                roomItemsContainer.appendChild(itemElement);
            });
        }
    }

    // Disable the quick "look" action once the room has already been searched this visit.
    updateLookButtonState() {
        const lookButton = document.querySelector('.quick-btn[data-command="look"]');
        const location = gameState.getLocation ? gameState.getLocation() : null;
        if (!lookButton || !location) return;

        const looked = gameState.hasLookedAround ? gameState.hasLookedAround() : !!location.lookedThisVisit;
        lookButton.disabled = looked;
        lookButton.textContent = looked ? 'Looked Around' : 'Look Around';
        lookButton.title = looked ? 'Move to another location before looking around again.' : 'Inspect this location in detail.';
    }

    // Mirror combat special charge into the HUD widgets.
    updateSpecialMeter() {
        const meterFill = document.getElementById('special-meter-fill');
        const meterText = document.getElementById('special-meter-text');
        const specialBtn = document.getElementById('special-btn');
        
        if (meterFill) {
            meterFill.style.width = `${gameState.specialCharge}%`;
        }
        if (meterText) {
            meterText.textContent = `${gameState.specialCharge}%`;
        }
        if (specialBtn) {
            specialBtn.textContent = `Special (${gameState.specialCharge}%)`;
            specialBtn.disabled = gameState.specialCharge < 100;
        }
    }
    
    // Delegate equipment rendering to InventorySystem so both screens stay consistent.
    updateEquipmentDisplay() {
        if (window.inventorySystem) {
            window.inventorySystem.updateEquipmentDisplay();
        }
    }
    
    // Open the inventory modal and populate all of its tabs.
    openInventoryModal() {
        const modal = document.getElementById('inventory-modal');
        if (modal) {
            modal.style.display = 'flex';
            this.updateInventoryModal();
        }
    }
    
    // Refresh all inventory modal sections in one pass.
    updateInventoryModal() {
        this.updateInventoryGrid();
        this.updateEquipmentDisplay();
        this.updateRecipesList();
    }
    
    // Render grouped inventory items into the modal grid.
    updateInventoryGrid() {
        const inventoryGrid = document.getElementById("inventory-grid");
        if (!inventoryGrid) return;
        
        inventoryGrid.innerHTML = "";
        
        // Group items by type and count
        const itemCounts = {};
        gameState.inventory.forEach(item => {
            itemCounts[item] = (itemCounts[item] || 0) + 1;
        });
        
        if (Object.keys(itemCounts).length === 0) {
            inventoryGrid.innerHTML = `<p class="empty-message">Your inventory is empty</p>`;
        } else {
            Object.keys(itemCounts).forEach(item => {
                const itemData = gameState.items[item] || { name: item, icon: "📦", description: "An unknown item." };
                const itemElement = document.createElement("div");
                itemElement.classList.add("inventory-item");
                itemElement.setAttribute("data-item", item);
                
                const countText = itemCounts[item] > 1 ? ` (${itemCounts[item]})` : "";
                const icon = gameState.getItemIcon ? gameState.getItemIcon(item) : (itemData.icon || "📦");
                
                itemElement.innerHTML = `
                    <div class="item-icon">${icon}</div>
                    <div class="item-name">${itemData.name}</div>
                    <div class="item-count">${countText}</div>
                `;
                
                itemElement.addEventListener("click", () => {
                    if (window.inventorySystem) {
                        window.inventorySystem.showItemDetail(item);
                    }
                });
                inventoryGrid.appendChild(itemElement);
            });
        }
    }

    // Show recipe discovery progress in the recipe tab.
    updateRecipesList() {
        const recipesList = document.getElementById('recipes-list');
        if (!recipesList) return;
        
        recipesList.innerHTML = '';
        
        if (gameState.discoveredRecipes.length === 0) {
            recipesList.innerHTML = `<p class="empty-message">You haven't discovered any recipes yet</p>`;
        }
    }

    // Attach the category filter buttons used inside the crafting panel.
    setupCraftingUI() {
        const categoryButtons = document.querySelectorAll('.craft-category');
        if (categoryButtons.length === 0) return;
        
        categoryButtons.forEach(button => {
            button.addEventListener('click', () => {
                categoryButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                this.currentCraftCategory = button.getAttribute('data-category') || "potions";
                this.renderCraftingRecipes(this.currentCraftCategory);
            });
        });
        
        const activeButton = document.querySelector('.craft-category.active');
        if (activeButton) {
            this.currentCraftCategory = activeButton.getAttribute('data-category') || "potions";
        }
    }

    // Render craftable recipes for one category with ingredient and campfire checks.
    renderCraftingRecipes(category) {
        const recipesContainer = document.getElementById('crafting-recipes');
        if (!recipesContainer) return;
        
        recipesContainer.innerHTML = '';
        
        const world = gameState.getCurrentWorld();
        const location = world[gameState.currentLocation];
        const atCampfire = location && location.campfire;
        
        const recipes = Object.keys(gameState.craftingRecipes || {})
            .map(key => ({ key, data: gameState.craftingRecipes[key] }))
            .filter(entry => entry.data.category === category);
        
        this.updateCraftingWarning(atCampfire, recipes.map(r => r.data));
        
        if (recipes.length === 0) {
            recipesContainer.innerHTML = `<p class="empty-message">No recipes available in this category.</p>`;
            return;
        }
        
        recipes.forEach(entry => {
            const recipe = entry.data;
            const recipeElement = document.createElement('div');
            recipeElement.classList.add('recipe');
            
            const requiresCampfire = !!recipe.campfireRequired;
            const canCraft = recipe.ingredients.every(ing => gameState.getInventoryCount(ing.item) >= ing.quantity);
            const allowedHere = !requiresCampfire || atCampfire;
            
            recipeElement.innerHTML = `
                <div class="recipe-header">
                    <div class="recipe-name">${recipe.name}</div>
                    <div class="recipe-difficulty">${requiresCampfire ? 'Campfire' : 'Portable'}</div>
                </div>
                <div class="recipe-description">${recipe.description}</div>
                <div class="recipe-ingredients"></div>
            `;
            
            const ingredientsContainer = recipeElement.querySelector('.recipe-ingredients');
            recipe.ingredients.forEach(ing => {
                const count = gameState.getInventoryCount(ing.item);
                const ingredient = document.createElement('div');
                ingredient.classList.add('ingredient');
                ingredient.classList.add(count >= ing.quantity ? 'available' : 'unavailable');
                ingredient.textContent = `${ing.item} x${ing.quantity}`;
                ingredientsContainer.appendChild(ingredient);
            });
            
            const craftBtn = document.createElement('button');
            craftBtn.classList.add('craft-btn');
            craftBtn.textContent = 'Craft';
            craftBtn.disabled = !canCraft || !allowedHere;
            craftBtn.addEventListener('click', () => this.craftRecipe(entry.key));
            recipeElement.appendChild(craftBtn);
            
            recipesContainer.appendChild(recipeElement);
        });
    }

    // Warn the player when some visible recipes require a campfire they do not have.
    updateCraftingWarning(atCampfire, recipes = null) {
        const warning = document.getElementById('crafting-location-warning');
        if (!warning) return;
        
        let hasCampfireOnly = false;
        if (recipes) {
            hasCampfireOnly = recipes.some(r => r.campfireRequired);
        } else if (gameState.craftingRecipes) {
            hasCampfireOnly = Object.values(gameState.craftingRecipes).some(r => r.campfireRequired);
        }
        
        if (!atCampfire && hasCampfireOnly) {
            warning.style.display = 'block';
            warning.textContent = 'Campfire required for some recipes.';
        } else {
            warning.style.display = 'none';
        }
    }

    // Consume ingredients, create the result, and refresh the crafting/inventory UI.
    craftRecipe(recipeKey) {
        const recipe = gameState.craftingRecipes[recipeKey];
        if (!recipe) return;
        
        const world = gameState.getCurrentWorld();
        const location = world[gameState.currentLocation];
        const atCampfire = location && location.campfire;
        
        if (recipe.campfireRequired && !atCampfire) {
            this.addMessage('You need a campfire to craft that item.');
            return;
        }
        
        const hasIngredients = recipe.ingredients.every(ing => gameState.getInventoryCount(ing.item) >= ing.quantity);
        if (!hasIngredients) {
            this.addMessage('You lack the required materials.');
            return;
        }
        
        recipe.ingredients.forEach(ing => {
            for (let i = 0; i < ing.quantity; i++) {
                const idx = gameState.inventory.indexOf(ing.item);
                if (idx !== -1) {
                    gameState.inventory.splice(idx, 1);
                }
            }
        });
        
        gameState.addToInventory(recipe.result);
        this.addMessage(`You crafted: ${recipe.name}`);
        
        if (window.inventorySystem) {
            window.inventorySystem.updateInventoryDisplay();
        }
        if (window.uiController) {
            this.renderCraftingRecipes(this.currentCraftCategory);
            this.updateGameDisplay();
        }
    }

    // Open the enemy journal modal.
    openJourneyBook() {
        const modal = document.getElementById('journey-modal');
        if (modal) {
            modal.style.display = 'flex';
            this.updateJourneyBook();
        }
    }

    // Rebuild the journey grid based on which enemies have been seen or defeated.
    updateJourneyBook() {
        const grid = document.getElementById('journey-grid');
        if (!grid) return;

        grid.innerHTML = '';

        const enemyEntries = Object.keys(gameState.enemies).map(key => {
            return { key, data: gameState.enemies[key] };
        });

        enemyEntries.forEach(entry => {
            const enemyKey = entry.key;
            const enemy = entry.data;
            const encountered = gameState.isEnemyEncountered(enemyKey);
            const defeated = gameState.isEnemyDefeated(enemyKey);

            const entryElement = document.createElement('div');
            entryElement.classList.add('journey-entry');
            if (!encountered) entryElement.classList.add('unknown');
            if (defeated) {
                entryElement.classList.add('defeated');
                entryElement.classList.add('clickable');
                entryElement.addEventListener('click', () => this.showJourneyDetail(enemyKey));
            }

            entryElement.innerHTML = `
                <div class="journey-icon">
                    <span class="enemy-icon">${enemy.icon}</span>
                    <span class="enemy-unknown">?</span>
                    <span class="enemy-defeated">✖</span>
                </div>
                <div class="journey-name">${encountered ? enemy.name : 'Unknown'}</div>
            `;

            grid.appendChild(entryElement);
        });
    }

    // Show the detail card for a defeated enemy, including likely drops.
    showJourneyDetail(enemyKey) {
        const enemy = gameState.enemies[enemyKey];
        if (!enemy) return;

        const detailElement = document.getElementById('journey-detail');
        const detailName = document.getElementById('journey-detail-name');
        const detailDescription = document.getElementById('journey-detail-description');
        const dropsList = document.getElementById('journey-drops-list');

        if (!detailElement || !detailName || !detailDescription || !dropsList) return;

        // Set enemy name
        detailName.textContent = enemy.name;

        //Description with biome info
        const biomeInfo = enemy.biome && enemy.biome.length > 0 ? ` Usually found in ${enemy.biome.join(', ')}.` : '';
        detailDescription.textContent = enemy.description + biomeInfo;

        // Get possible drops
        let drops = [];
        if (enemy.loot && enemy.loot.length > 0) {
            drops = enemy.loot;
        } else {
            // Generate possible drops from drop pools
            const category = gameState.getEnemyCategory ? gameState.getEnemyCategory(enemyKey, enemy) : 'common';
            const pools = gameState.enemyDropPools[category];
            if (pools) {
                drops = [
                    ...(pools.common || []),
                    ...(pools.uncommon || []),
                    ...(pools.rare || [])
                ];
            }
        }

        // Display drops
        dropsList.innerHTML = '';
        if (drops.length > 0) {
            drops.forEach(drop => {
                const dropItem = document.createElement('div');
                dropItem.classList.add('journey-drop-item');
                dropItem.textContent = drop;
                dropsList.appendChild(dropItem);
            });
        } else {
            const noDrops = document.createElement('div');
            noDrops.classList.add('journey-drop-item');
            noDrops.textContent = 'No drops';
            dropsList.appendChild(noDrops);
        }

        // Show the detail section
        detailElement.style.display = 'block';
    }
    
    // Open the dedicated armory/equipment overview.
    openArmoryModal() {
        const modal = document.getElementById('armory-modal');
        if (modal) {
            modal.style.display = 'flex';
            
            if (window.inventorySystem) {
                window.inventorySystem.updateArmoryModal();
            }
        }
    }
    
    // Open the crafting modal and render recipes for the current category.
    openCraftingPanel() {
        const craftingPanel = document.getElementById('crafting-panel');
        if (craftingPanel) {
            craftingPanel.style.display = 'flex';
            
            const world = gameState.getCurrentWorld();
            const location = world[gameState.currentLocation];
            const atCampfire = location && location.campfire;
            
            this.renderCraftingRecipes(this.currentCraftCategory);
            this.updateCraftingWarning(atCampfire);
        }
    }
    
    // Open settings and mirror current runtime options into the form controls.
    openSettingsPanel() {
        const settingsPanel = document.getElementById('settings-panel');
        if (settingsPanel) {
            settingsPanel.style.display = 'flex';
            
            // Hide difficulty controls here on purpose.
            // They still exist in the setup flow, just not during an active run,
            // because changing the rules mid-adventure gets messy fast.
            const difficultyGroup = settingsPanel.querySelector('.setting-group:nth-child(1)');
            if (difficultyGroup) {
                difficultyGroup.style.display = 'none'; // Hide difficulty selection
            }
            
            // Update settings to match current game state
            const autoSaveCheckbox = document.getElementById('auto-save');
            const combatAnimationsCheckbox = document.getElementById('combat-animations');
            
            if (autoSaveCheckbox) {
                autoSaveCheckbox.checked = gameState.autoSave;
            }
            if (combatAnimationsCheckbox) {
                combatAnimationsCheckbox.checked = gameState.combatAnimations;
            }
        }
    }
    
    // Hard reset the current account's progress after user confirmation.
    restartGame() {
        if (confirm('Are you sure you want to restart? This will delete all progress for this account and reset difficulty/input mode selection!')) {
            // Reset account setup to force selection screens to appear again
            gameState.resetAccountSetup();
            
            // Show login screen to restart fresh
            this.showLoginScreen();
            this.addMessage('Game restarted. Please log in again to start fresh.');
        }
    }
    
    // Save and return to the account lobby without deleting progress.
    quitToLobby() {
        if (confirm('Are you sure you want to quit to the lobby? Your progress will be saved.')) {
            gameState.saveGame();
            this.showLoginScreen();
        }
    }
    
    // UI-originated commands still go through the same main command parser.
    processCommand(command) {
        if (window.main && window.main.processCommand) {
            window.main.processCommand(command);
        }
    }
    
    // Append a narrative line to the main output panel.
    addMessage(text) {
        const output = document.getElementById('game-output');
        if (output) {
            const message = document.createElement('div');
            message.classList.add('message');
            message.textContent = text;
            output.appendChild(message);
            output.scrollTop = output.scrollHeight;
        }
    }
    
    // Decorative particle layer used mainly on the auth and game presentation screens.
    createParticles() {
        const particlesContainer = document.getElementById('particles');
        if (!particlesContainer) return;
        
        for (let i = 0; i < 50; i++) {
            const particle = document.createElement('div');
            particle.classList.add('particle');
            particle.style.left = `${Math.random() * 100}%`;
            particle.style.top = `${Math.random() * 100}%`;
            particle.style.animationDelay = `${Math.random() * 10}s`;
            particle.style.background = `hsl(${Math.random() * 360}, 70%, 60%)`;
            particlesContainer.appendChild(particle);
        }
    }
    
    // Reserved for future localization support.
    // The idea is that visible UI text could later be swapped dynamically based
    // on the player's selected language instead of being hardcoded in one language forever.
    // Right now it is a stub, but it marks the spot where that text-refresh pass would live.
    updateUIText() {
        // Future version: refresh visible labels, prompts, and UI strings here.
    }
    
    // Small combat UI passthroughs let UIController stay compatible with combat overlays.
    showCombatOverlay() {
        const overlay = document.getElementById('combat-overlay');
        if (overlay) {
            overlay.classList.add('show');
        }
    }
    
    hideCombatOverlay() {
        const overlay = document.getElementById('combat-overlay');
        if (overlay) {
            overlay.classList.remove('show');
        }
    }
    
    updateStatusEffects() {
        if (combatSystem && typeof combatSystem.updateStatusEffects === 'function') {
            combatSystem.updateStatusEffects();
        }
    }
    
    updateCombatHealthBars() {
        if (combatSystem && typeof combatSystem.updateCombatHealthBars === 'function') {
            combatSystem.updateCombatHealthBars();
        }
    }
}

const uiController = new UIController();

// Initialize UI Controller when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded, initializing UI Controller');
    setTimeout(() => {
        uiController.initialize();
    }, 100);
});
